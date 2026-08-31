use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::delivery::{DeliveryRung, delivery_kind, select_rung};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Event, Job, JobId, Msg, Outcome, SeatId, SemanticState, Seq,
};
use pij_core::ports::{Queue, Registry, SeatFilter, TmuxPort, Transport};
use pij_harnesses::InteractionGate;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_stream::StreamExt;

use crate::events::{EventBus, Subscription};

use super::{
    POINTER_ANNOUNCED_EVENT_KIND, POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND,
    PointerPolicy, render_final_pointer, render_pointer, retry_delay, submit_command,
};

/// How many times a held delivery is re-offered before the job is parked.
///
/// A held message is waiting on a PERSON, not on a resource. Retrying forever
/// re-prompts someone who has already declined to answer.
const HELD_ATTEMPT_LIMIT: u32 = 4;

const WORKER_ID: &str = "pointer-drain";
type Clock = dyn Fn() -> Result<u64> + Send + Sync;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct PointerState {
    announcements: u32,
    last_announced_at: Option<u64>,
    parked: bool,
    latest_seq: Option<Seq>,
}

#[derive(Clone, Debug)]
struct PendingPointer {
    event: Event,
    announcement: u32,
    final_announcement: bool,
}

struct CadenceState {
    live: Option<Subscription>,
    seats: BTreeMap<SeatId, PointerState>,
    hydrated: bool,
    pending: BTreeMap<SeatId, PendingPointer>,
}

/// One delivery-queue drain pass below the socket transport.
///
/// The worker claims only pane-bound recipients, so paneless pull consumers keep
/// ownership of their own rows. A failed command uses durable exponential
/// backoff. A body is always released with zero delay: pointer cadence may delay
/// the announcer, but it must never delay the reader the pointer directs to the
/// inbox.
///
/// Pointer cadence and parking are durable spine policy, not process residue.
/// The announcer records that it POINTED, not that anyone will ever come. Each
/// announcement event carries its seat-level ordinal; parked/unparked events make
/// the stop visible and reconstruct the budget after restart. Queue `attempt` is
/// deliberately not consulted: it counts every claim/release, not what a seat was
/// actually told.
///
/// `delivery.pointer-announced` means the seat experienced the physical line, so
/// submission precedes publication. If publication fails, a process-local pending
/// fact is retried before any further submit. A crash may lose that pending fact
/// and duplicate one pointer after restart; duplicate-over-lie is the deliberate
/// residual. The event is never redefined as a pre-submit decision.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, import `pij_daemon::pointer::DrainWorker`,
/// construct one from the composed registry, queue, transport, tmux,
/// `InteractionGate`, event bus, `pointer_announce_cadence_secs`, and
/// `pointer_announce_limit`, then call `drain_once` from the injected delivery
/// cadence. The same event bus must be shared with `DeliveryService`, whose inbox
/// read publishes the only automatic unpark trigger.
pub struct DrainWorker {
    registry: Arc<dyn Registry>,
    queue: Arc<dyn Queue>,
    transport: Arc<dyn Transport>,
    tmux: Arc<dyn TmuxPort>,
    interaction: Arc<InteractionGate>,
    event_bus: Arc<EventBus>,
    policy: PointerPolicy,
    cadence: Mutex<CadenceState>,
    clock: Arc<Clock>,
}

impl DrainWorker {
    /// Construct a worker using the system clock for pointer cadence and events.
    ///
    /// # Errors
    /// Returns [`PijError::Adapter`] when `pointer_cadence` is zero.
    pub fn new(
        registry: Arc<dyn Registry>,
        queue: Arc<dyn Queue>,
        transport: Arc<dyn Transport>,
        tmux: Arc<dyn TmuxPort>,
        interaction: Arc<InteractionGate>,
        event_bus: Arc<EventBus>,
        policy: PointerPolicy,
    ) -> Result<Self> {
        if policy.cadence.is_zero() {
            return Err(PijError::Adapter {
                adapter: "daemon/pointer".to_string(),
                message: "pointer_announce_cadence_secs must be greater than zero".to_string(),
            });
        }
        if policy.announcement_limit == 0 {
            return Err(PijError::Adapter {
                adapter: "daemon/pointer".to_string(),
                message: "pointer_announce_limit must be greater than zero".to_string(),
            });
        }
        Ok(Self {
            registry,
            queue,
            transport,
            tmux,
            interaction,
            event_bus,
            policy,
            cadence: Mutex::new(CadenceState {
                live: None,
                seats: BTreeMap::new(),
                hydrated: false,
                pending: BTreeMap::new(),
            }),
            clock: Arc::new(system_time_ms),
        })
    }

    /// Drain at most one currently-due delivery row per pane-bound recipient.
    ///
    /// One-per-recipient is the in-pass suppression: releasing a body with zero
    /// delay makes it immediately reader-claimable, but the announcer must not
    /// reclaim and re-announce it in the same pass.
    ///
    /// # Errors
    /// Registry, queue, transport, tmux, serialization, or event publication
    /// failures. A fallible delivery action is returned to pending before its
    /// error is surfaced.
    pub async fn drain_once(&self) -> Result<usize> {
        self.flush_pending_pointers().await?;
        self.refresh_cadence().await?;
        let mut kinds: Vec<String> = self
            .registry
            .list(SeatFilter::default())
            .await?
            .into_iter()
            .filter(|seat| seat.pane.is_some() && seat.tombstoned_at.is_none())
            .map(|seat| delivery_kind(&seat.id))
            .collect();

        let mut handled = 0;
        while !kinds.is_empty() {
            let Some((job_id, job)) = self.queue.claim(&kinds, WORKER_ID).await? else {
                break;
            };
            // Suppress this recipient before running fallible work. Even a
            // zero-delay release stays available to the reader without letting
            // this pass immediately reclaim it.
            kinds.retain(|kind| kind != &job.kind);
            handled += 1;
            self.handle_claim(job_id, job).await?;
        }
        Ok(handled)
    }

    async fn handle_claim(&self, job_id: JobId, job: Job) -> Result<()> {
        let msg: Msg = match serde_json::from_str(&job.payload) {
            Ok(msg) => msg,
            Err(error) => {
                return self
                    .fail_claim(job_id, format!("invalid delivery payload: {error}"))
                    .await;
            }
        };
        let expected_kind = delivery_kind(&msg.to);
        if job.kind != expected_kind || job.serial_key != msg.to.0 {
            return self
                .fail_claim(
                    job_id,
                    format!(
                        "delivery claim {} for serial {} contained message for {}",
                        job.kind, job.serial_key, msg.to
                    ),
                )
                .await;
        }

        let Some(recipient) = self.registry.get(&msg.to).await? else {
            return self
                .fail_claim(job_id, format!("delivery recipient {} disappeared", msg.to))
                .await;
        };
        if recipient.tombstoned_at.is_some() {
            return self
                .fail_claim(
                    job_id,
                    format!("delivery recipient {} is tombstoned", msg.to),
                )
                .await;
        }
        if recipient.semantic_state == Some(SemanticState::Hold) {
            return self.release_or_backoff(job_id, &job, &msg).await;
        }
        let Some(pane) = recipient.pane.as_deref() else {
            return self.release_or_backoff(job_id, &job, &msg).await;
        };
        if recipient.proc.is_none() {
            return self.release_or_backoff(job_id, &job, &msg).await;
        }

        // Fresh capture at the boundary, same reasoning as first-attempt delivery:
        // a queued retry is a real injection, so it is authorized by an observation
        // taken now rather than by the last observer tick.
        let permits = match self.interaction.permits_injection_fresh(pane).await {
            Ok(permits) => permits,
            Err(error) => {
                self.release_or_backoff(job_id, &job, &msg).await?;
                return Err(error);
            }
        };
        if !permits {
            return self.release_or_backoff(job_id, &job, &msg).await;
        }

        if msg.command.is_some() {
            return self
                .submit_command_claim(job_id, job.attempt, pane, &msg)
                .await;
        }

        let socket_available = match self.transport.can_deliver(&recipient, &msg).await {
            Ok(available) => available,
            Err(error) => {
                self.release_body(job_id).await?;
                return Err(error);
            }
        };
        match select_rung(&recipient, &msg, socket_available, false, true) {
            DeliveryRung::Socket => match self.transport.deliver(&recipient, &msg).await {
                Ok(DeliveryOutcome::Delivered { origin }) => {
                    self.queue.ack_delivery(job_id, origin).await.map(|_| ())
                }
                Ok(DeliveryOutcome::Queued) => self.release_body(job_id).await,
                // HELD IS NOT QUEUED. `release_body` is `retry(job, Duration::ZERO)`
                // — an immediate re-delivery — and every re-delivery of a held
                // message raises a FRESH APPROVAL DIALOG at the human who has not
                // answered the last one. Until plan 110 made Held reachable this
                // line had never executed, so the hazard shipped dormant; the
                // consent default that makes it live and this backoff are one
                // decision, and land together (o-prime, oq-1101).
                Ok(DeliveryOutcome::Held { reason }) => {
                    self.backoff_held(job_id, job.attempt, &msg, &reason).await
                }
                // TERMINAL. The recipient answered no, and a refusal is given
                // once: releasing the body would retry, and every retry raises
                // the same approval dialog at the human who just declined it.
                // The job is DONE with outcome refused — not failed, because
                // nothing malfunctioned, and not delivered, because it was not.
                Ok(DeliveryOutcome::Refused { .. }) => self.queue.ack(job_id, Outcome::Done).await,
                Err(error) => {
                    self.release_body(job_id).await?;
                    Err(error)
                }
            },
            DeliveryRung::Pointer => self.announce_pointer(job_id, pane, &msg).await,
            DeliveryRung::Observe | DeliveryRung::Queue => self.release_body(job_id).await,
            DeliveryRung::Pty => unreachable!("commands are handled before socket capability"),
        }
    }

    async fn submit_command_claim(
        &self,
        job_id: JobId,
        attempt: u32,
        pane: &str,
        msg: &Msg,
    ) -> Result<()> {
        let command = msg
            .command
            .as_deref()
            .expect("command branch requires an explicit command tag");
        if let Err(error) = submit_command(self.tmux.as_ref(), pane, command).await {
            self.backoff_command(job_id, attempt).await?;
            return Err(error);
        }
        self.queue
            .ack_delivery(job_id, DeliveryOrigin::InjectedToTransport)
            .await
            .map(|_| ())
    }

    async fn announce_pointer(&self, job_id: JobId, pane: &str, msg: &Msg) -> Result<()> {
        match self.persist_pending_pointer(&msg.to).await {
            Ok(true) => return self.release_body(job_id).await,
            Ok(false) => {}
            Err(error) => {
                self.release_body(job_id).await?;
                return Err(error);
            }
        }
        let at = match (self.clock)() {
            Ok(at) => at,
            Err(error) => {
                self.release_body(job_id).await?;
                return Err(error);
            }
        };
        let (announcement, final_announcement) = match self.pointer_decision(&msg.to, at).await {
            PointerDecision::Announce {
                announcement,
                final_announcement,
            } => (announcement, final_announcement),
            PointerDecision::ParkNow {
                announcements,
                decision_seq,
            } => {
                if let Err(error) = self
                    .publish_parked(&msg.to, at, announcements, decision_seq)
                    .await
                {
                    self.release_body(job_id).await?;
                    return Err(error);
                }
                return self.release_body(job_id).await;
            }
            PointerDecision::Wait | PointerDecision::Parked => {
                return self.release_body(job_id).await;
            }
        };

        let payload = match serde_json::to_string(&PointerEvent {
            msg_id: &msg.msg_id,
            from: &msg.from,
            announcement,
        }) {
            Ok(payload) => payload,
            Err(error) => {
                self.release_body(job_id).await?;
                return Err(PijError::Adapter {
                    adapter: "daemon/pointer".to_string(),
                    message: format!("could not encode pointer event {}: {error}", msg.msg_id),
                });
            }
        };
        let pointer = if final_announcement {
            render_final_pointer(
                &msg.from,
                msg.from_machine.as_deref(),
                self.policy.announcement_limit,
            )
        } else {
            render_pointer(&msg.from, msg.from_machine.as_deref())
        };
        if let Err(error) = self.tmux.submit(pane, &pointer).await {
            self.release_body(job_id).await?;
            return Err(error);
        }
        let event = Event {
            seq: None,
            v: 1,
            at,
            kind: POINTER_ANNOUNCED_EVENT_KIND.to_string(),
            seat: Some(msg.to.clone()),
            payload,
        };
        self.cadence.lock().await.pending.insert(
            msg.to.clone(),
            PendingPointer {
                event,
                announcement,
                final_announcement,
            },
        );
        if let Err(error) = self.persist_pending_pointer(&msg.to).await {
            self.release_body(job_id).await?;
            return Err(error);
        }
        self.release_body(job_id).await
    }

    async fn flush_pending_pointers(&self) -> Result<()> {
        let seats: Vec<SeatId> = self.cadence.lock().await.pending.keys().cloned().collect();
        for seat in seats {
            self.persist_pending_pointer(&seat).await?;
        }
        Ok(())
    }

    async fn persist_pending_pointer(&self, seat: &SeatId) -> Result<bool> {
        let Some(pending) = self.cadence.lock().await.pending.get(seat).cloned() else {
            return Ok(false);
        };
        let at = pending.event.at;
        let announced_seq = self.event_bus.publish(pending.event).await?;
        {
            let mut cadence = self.cadence.lock().await;
            cadence.pending.remove(seat);
            let state = cadence.seats.entry(seat.clone()).or_default();
            state.announcements = pending.announcement;
            state.last_announced_at = Some(at);
            state.latest_seq = Some(announced_seq);
        }
        if pending.final_announcement {
            self.publish_parked(seat, at, pending.announcement, Some(announced_seq))
                .await?;
        }
        Ok(true)
    }

    async fn publish_parked(
        &self,
        seat: &SeatId,
        at: u64,
        announcements: u32,
        decision_seq: Option<Seq>,
    ) -> Result<()> {
        if let Some(latest) = self
            .event_bus
            .latest_matching(
                seat,
                &[
                    POINTER_ANNOUNCED_EVENT_KIND,
                    POINTER_PARKED_EVENT_KIND,
                    POINTER_UNPARKED_EVENT_KIND,
                ],
            )
            .await?
            && latest.kind == POINTER_UNPARKED_EVENT_KIND
            && latest
                .seq
                .is_some_and(|seq| decision_seq.is_none_or(|decided| seq > decided))
        {
            let mut cadence = self.cadence.lock().await;
            apply_pointer_event(&mut cadence.seats, latest)?;
            return Ok(());
        }
        let payload = serde_json::to_string(&PointerParkedEvent {
            announcements,
            reason: "announcement-limit",
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/pointer".to_string(),
            message: format!("could not encode pointer parked event for {seat}: {error}"),
        })?;
        let seq = self
            .event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at,
                kind: POINTER_PARKED_EVENT_KIND.to_string(),
                seat: Some(seat.clone()),
                payload,
            })
            .await?;
        let mut cadence = self.cadence.lock().await;
        let state = cadence.seats.entry(seat.clone()).or_default();
        state.announcements = state.announcements.max(announcements);
        state.parked = true;
        state.latest_seq = Some(seq);
        Ok(())
    }

    async fn release_or_backoff(&self, job_id: JobId, job: &Job, msg: &Msg) -> Result<()> {
        if msg.command.is_some() {
            self.backoff_command(job_id, job.attempt).await
        } else {
            self.release_body(job_id).await
        }
    }

    async fn release_body(&self, job_id: JobId) -> Result<()> {
        self.queue.retry(job_id, Duration::ZERO).await
    }

    async fn backoff_command(&self, job_id: JobId, attempt: u32) -> Result<()> {
        self.queue.retry(job_id, retry_delay(attempt)).await
    }

    /// Back off a held delivery, and stop asking after [`HELD_ATTEMPT_LIMIT`].
    ///
    /// A held message is waiting on a PERSON. Exponential backoff replaces a
    /// dialog storm with a few spaced asks, and the limit exists because a human
    /// who has ignored the prompt this many times is answering by not answering:
    /// the honest end state is a parked job a human can find, not an unbounded
    /// retry nobody remembers starting.
    async fn backoff_held(
        &self,
        job_id: JobId,
        attempt: u32,
        msg: &Msg,
        reason: &str,
    ) -> Result<()> {
        if attempt + 1 >= HELD_ATTEMPT_LIMIT {
            return self
                .fail_claim(
                    job_id,
                    format!(
                        "delivery to {} stayed held after {HELD_ATTEMPT_LIMIT} attempts ({reason}); \
                         not retried — the recipient has not approved it",
                        msg.to
                    ),
                )
                .await;
        }
        self.queue.retry(job_id, retry_delay(attempt)).await
    }

    async fn fail_claim(&self, job_id: JobId, reason: String) -> Result<()> {
        self.queue.ack(job_id, Outcome::Failed { reason }).await
    }

    async fn pointer_decision(&self, seat: &SeatId, now: u64) -> PointerDecision {
        let cadence_ms = u64::try_from(self.policy.cadence.as_millis()).unwrap_or(u64::MAX);
        let cadence = self.cadence.lock().await;
        let state = cadence.seats.get(seat).copied().unwrap_or_default();
        if state.parked {
            return PointerDecision::Parked;
        }
        if state.announcements >= self.policy.announcement_limit {
            return PointerDecision::ParkNow {
                announcements: state.announcements,
                decision_seq: state.latest_seq,
            };
        }
        if state
            .last_announced_at
            .is_some_and(|last| now.saturating_sub(last) < cadence_ms)
        {
            return PointerDecision::Wait;
        }
        let announcement = state.announcements.saturating_add(1);
        PointerDecision::Announce {
            announcement,
            final_announcement: announcement == self.policy.announcement_limit,
        }
    }

    async fn refresh_cadence(&self) -> Result<()> {
        let mut cadence = self.cadence.lock().await;
        loop {
            if !cadence.hydrated {
                // Intentionally unbounded only on cold hydration and lossy-live
                // recovery: `EventBus::subscribe(None, ..)` calls `Spine::tail`
                // from sequence zero, which materializes EVERY spine row before
                // filtering pointer kinds in Rust. Reconstructing the complete
                // since-unpark budget requires that durable history. This must
                // never move onto the per-inbox or per-claim hot path; those use
                // mandatory-seat `latest_matching` instead.
                cadence.live = Some(
                    self.event_bus
                        .subscribe(
                            None,
                            EventFilter::kinds([
                                POINTER_ANNOUNCED_EVENT_KIND,
                                POINTER_PARKED_EVENT_KIND,
                                POINTER_UNPARKED_EVENT_KIND,
                            ]),
                        )
                        .await?,
                );
                cadence.hydrated = true;
            }
            loop {
                let next = timeout(
                    Duration::ZERO,
                    cadence.live.as_mut().expect("hydrated subscription").next(),
                )
                .await;
                let Ok(Some(event)) = next else {
                    break;
                };
                apply_pointer_event(&mut cadence.seats, event)?;
            }
            let dropped = cadence
                .live
                .as_ref()
                .expect("hydrated subscription")
                .dropped_count();
            if dropped == 0 {
                return Ok(());
            }
            eprintln!(
                "pij-rs pointer drain: live policy subscription dropped {dropped} event(s); reconciling from durable spine"
            );
            cadence.seats.clear();
            cadence.live = None;
            cadence.hydrated = false;
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PointerDecision {
    Wait,
    Parked,
    ParkNow {
        announcements: u32,
        decision_seq: Option<Seq>,
    },
    Announce {
        announcement: u32,
        final_announcement: bool,
    },
}

fn apply_pointer_event(states: &mut BTreeMap<SeatId, PointerState>, event: Event) -> Result<()> {
    let seq = event.seq;
    let seat = event.seat.ok_or_else(|| PijError::Adapter {
        adapter: "daemon/pointer".to_string(),
        message: format!("{} event has no seat", event.kind),
    })?;
    let state = states.entry(seat).or_default();
    match event.kind.as_str() {
        POINTER_ANNOUNCED_EVENT_KIND => {
            let payload: PointerEventRecord =
                serde_json::from_str(&event.payload).map_err(|error| PijError::Adapter {
                    adapter: "daemon/pointer".to_string(),
                    message: format!("invalid pointer announcement event: {error}"),
                })?;
            state.announcements = payload
                .announcement
                .unwrap_or_else(|| state.announcements.saturating_add(1));
            state.last_announced_at = Some(event.at);
        }
        POINTER_PARKED_EVENT_KIND => {
            let payload: PointerParkedRecord =
                serde_json::from_str(&event.payload).map_err(|error| PijError::Adapter {
                    adapter: "daemon/pointer".to_string(),
                    message: format!("invalid pointer parked event: {error}"),
                })?;
            state.announcements = state.announcements.max(payload.announcements);
            state.parked = true;
        }
        POINTER_UNPARKED_EVENT_KIND => *state = PointerState::default(),
        _ => unreachable!("subscription filters pointer policy kinds"),
    }
    state.latest_seq = seq;
    Ok(())
}

#[derive(Serialize)]
struct PointerEvent<'a> {
    msg_id: &'a str,
    from: &'a SeatId,
    announcement: u32,
}

#[derive(Deserialize)]
struct PointerEventRecord {
    #[serde(default)]
    announcement: Option<u32>,
}

#[derive(Serialize)]
struct PointerParkedEvent {
    announcements: u32,
    reason: &'static str,
}

#[derive(Deserialize)]
struct PointerParkedRecord {
    announcements: u32,
}

fn system_time_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/pointer".to_string(),
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| PijError::Adapter {
        adapter: "daemon/pointer".to_string(),
        message: "system time does not fit in the pointer event timestamp".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
    use std::time::Duration;

    use async_trait::async_trait;
    use pij_core::config::Config;
    use pij_core::delivery::delivery_kind;
    use pij_core::model::{
        DeliveryOrigin, DeliveryOutcome, Event, Harness, Job, JobId, Msg, Outcome, ProcIdentity,
        SeatDescriptor, SeatId, Seq,
    };
    use pij_core::ports::{DeliveryEnqueue, Queue, Registry, Spine, TmuxPort, Transport};
    use pij_harnesses::InteractionGate;
    use pij_store::SqliteQueue;
    use pij_testkit::FreshStore;
    use pij_testkit::fakes::{FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport};
    use serde_json::Value;
    use tokio::sync::Notify;

    use super::{
        DrainWorker, EventBus, POINTER_ANNOUNCED_EVENT_KIND, POINTER_PARKED_EVENT_KIND,
        POINTER_UNPARKED_EVENT_KIND, PointerPolicy,
    };

    const CADENCE: Duration = Duration::from_secs(90);

    struct Fixture {
        worker: DrainWorker,
        registry: Arc<FakeRegistry>,
        queue: Arc<FakeQueue>,
        transport: Arc<FakeTransport>,
        tmux: Arc<FakeTmux>,
        interaction: Arc<InteractionGate>,
        spine: Arc<FakeSpine>,
        event_bus: Arc<EventBus>,
        arrange_composers: bool,
    }

    fn fixture(transport: FakeTransport, tmux: FakeTmux) -> Fixture {
        fixture_with_limit(transport, tmux, 3)
    }

    /// A fixture whose panes are NOT arranged, so the send-boundary gate sees an
    /// unlisted pane and vetoes. Kept separate because "the gate has no evidence"
    /// is a real state with its own test, and arranging it away silently would
    /// delete that coverage rather than update it.
    fn fixture_unarranged(transport: FakeTransport, tmux: FakeTmux) -> Fixture {
        fixture_inner(transport, tmux, 3, false)
    }

    fn fixture_with_limit(transport: FakeTransport, tmux: FakeTmux, pointer_limit: u32) -> Fixture {
        fixture_inner(transport, tmux, pointer_limit, true)
    }

    fn fixture_inner(
        transport: FakeTransport,
        tmux: FakeTmux,
        pointer_limit: u32,
        arrange_composers: bool,
    ) -> Fixture {
        let registry = Arc::new(FakeRegistry::new());
        let queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
        let transport = Arc::new(transport);
        let tmux = Arc::new(tmux);
        let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let spine = Arc::new(FakeSpine::new());
        let event_bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 16).expect("event bus"));
        let mut worker = DrainWorker::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&queue) as Arc<dyn Queue>,
            Arc::clone(&transport) as Arc<dyn Transport>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&interaction),
            Arc::clone(&event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: pointer_limit,
            },
        )
        .expect("worker");
        worker.clock = Arc::new(|| Ok(777));
        Fixture {
            worker,
            registry,
            queue,
            transport,
            tmux,
            interaction,
            spine,
            event_bus,
            arrange_composers,
        }
    }

    fn seat(id: &str, pane: Option<&str>) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new(id, Harness::Omp, "/abs/tree");
        seat.pane = pane.map(str::to_string);
        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat
    }

    fn message(to: &str, body: &str, command: Option<&str>) -> Msg {
        Msg {
            from: SeatId::from("pij-sender"),
            to: SeatId::from(to),
            body: body.to_string(),
            msg_id: format!("m-{to}"),
            from_machine: None,
            in_reply_to: None,
            command: command.map(str::to_string),
        }
    }

    async fn enqueue(fixture: &Fixture, msg: &Msg) -> pij_core::model::JobId {
        fixture
            .queue
            .enqueue(Job {
                kind: delivery_kind(&msg.to),
                serial_key: msg.to.0.clone(),
                payload: serde_json::to_string(msg).expect("message json"),
                dedupe_key: msg.msg_id.clone(),
                attempt: 0,
            })
            .await
            .expect("enqueue")
    }

    async fn register(fixture: &Fixture, descriptor: SeatDescriptor) {
        // The send-boundary gate captures the pane it is about to inject into, so
        // a registered seat presents a recognizable, blank composer by default:
        // politeness is the precondition of these tests, not their subject.
        // `fixture_unarranged` opts out, for the tests where an absent
        // observation IS the subject.
        if fixture.arrange_composers
            && let Some(pane) = descriptor.pane.as_deref()
        {
            fixture.tmux.arrange_clear_composer(pane);
        }
        fixture.registry.put(descriptor).await.expect("register");
    }

    #[tokio::test]
    async fn command_claim_submits_the_bare_tag_as_a_slash_command_and_never_uses_socket() {
        let fixture = fixture(FakeTransport::reachable(), FakeTmux::new());
        register(&fixture, seat("pij-command", Some("%7"))).await;
        fixture.interaction.observe_composer("%7", "   ");
        enqueue(
            &fixture,
            &message("pij-command", "body is not rendered", Some("compact")),
        )
        .await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 1);
        assert_eq!(
            fixture.tmux.calls(),
            [
                "list_panes",
                "capture:%7:4294967295",
                "user_typing:%7",
                "submit:%7:/compact"
            ]
        );
        assert!(
            fixture.transport.calls().is_empty(),
            "command never uses socket"
        );
        assert!(matches!(
            fixture.queue.acked().as_slice(),
            [(_, Outcome::Done)]
        ));
    }

    #[tokio::test]
    async fn pointer_announces_once_per_pass_and_zero_delay_keeps_body_reader_claimable() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-body", Some("%8"))).await;
        fixture.interaction.observe_composer("%8", "");
        let msg = message("pij-body", "SECRET BODY", None);
        let id = enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("first drain"), 1);
        assert_eq!(
            fixture.tmux.calls(),
            [
                "list_panes",
                "capture:%8:4294967295",
                "user_typing:%8",
                "submit:%8:[pij from pij-sender] message waiting — run: pij inbox"
            ]
        );
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "release preserves the body row"
        );

        let (claimed_id, claimed) = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("reader claim")
            .expect("pointer promise is immediately true");
        assert_eq!(claimed_id, id);
        assert_eq!(
            claimed.payload,
            serde_json::to_string(&msg).expect("message json")
        );
        fixture
            .queue
            .retry(claimed_id, Duration::ZERO)
            .await
            .expect("release reader witness");

        let events = fixture
            .spine
            .tail(Some(&SeatId::from("pij-body")), Seq(0))
            .await
            .expect("pointer events");
        assert_eq!(events.len(), 1, "one pointer event for the pass");
        let payload: Value = serde_json::from_str(&events[0].payload).expect("event json");
        assert_eq!(
            payload,
            serde_json::json!({"msg_id":"m-pij-body","from":"pij-sender","announcement":1})
        );
        assert!(!events[0].payload.contains("SECRET BODY"));
    }

    #[tokio::test]
    async fn cadence_suppresses_repeat_without_delaying_the_body() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-cadence", Some("%12"))).await;
        fixture.interaction.observe_composer("%12", "");
        let msg = message("pij-cadence", "still waiting", None);
        enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("announce"), 1);
        assert_eq!(fixture.worker.drain_once().await.expect("suppress"), 1);
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1
        );
        assert_eq!(
            fixture.queue.retried(),
            [(pij_core::model::JobId(1), Duration::ZERO); 2]
        );
    }

    #[tokio::test]
    async fn pending_pointer_fact_retries_without_resubmitting_experienced_line() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-persist-first", Some("%persist"))).await;
        fixture.interaction.observe_composer("%persist", "");
        enqueue(&fixture, &message("pij-persist-first", "waiting", None)).await;
        fixture.spine.script_append_error("injected spine failure");

        let error = fixture
            .worker
            .drain_once()
            .await
            .expect_err("publish fails");
        assert!(error.to_string().contains("injected spine failure"));
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "the seat experienced the pointer before its fact failed"
        );

        let claimed = fixture
            .queue
            .claim(
                &[delivery_kind(&SeatId::from("pij-persist-first"))],
                "reader",
            )
            .await
            .expect("reader claim")
            .expect("body remains claimable");
        assert_eq!(claimed.1.serial_key, "pij-persist-first");
        assert_eq!(
            fixture
                .worker
                .drain_once()
                .await
                .expect("claimless retry after spine recovers"),
            0,
            "pending fact retries before queue claims even after reader takes the row"
        );
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "pending fact retry must not submit the experienced line again"
        );
        assert_eq!(
            fixture
                .spine
                .tail(Some(&SeatId::from("pij-persist-first")), Seq(0))
                .await
                .expect("persisted retry")
                .iter()
                .filter(|event| event.kind == POINTER_ANNOUNCED_EVENT_KIND)
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn legacy_history_counts_every_announcement_since_the_last_unpark() {
        let fixture = fixture_with_limit(FakeTransport::unreachable(), FakeTmux::new(), 3);
        let recipient = SeatId::from("pij-legacy-parked");
        register(&fixture, seat(recipient.as_str(), Some("%legacy"))).await;
        fixture.interaction.observe_composer("%legacy", "");
        for announcement in 1..=18 {
            fixture
                .event_bus
                .publish(Event {
                    seq: None,
                    v: 1,
                    at: announcement,
                    kind: POINTER_ANNOUNCED_EVENT_KIND.to_string(),
                    seat: Some(recipient.clone()),
                    // Pre-policy events had no ordinal; replay must count each
                    // durable fact rather than resetting at deployment.
                    payload: serde_json::json!({
                        "msg_id": format!("legacy-{announcement}"),
                        "from": "pij-sender"
                    })
                    .to_string(),
                })
                .await
                .expect("historical pointer");
        }
        enqueue(
            &fixture,
            &message(recipient.as_str(), "legacy unread body", None),
        )
        .await;

        fixture.worker.drain_once().await.expect("park legacy seat");
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "legacy seat is already over budget; no unexplained extra pointer"
        );
        let events = fixture
            .spine
            .tail(Some(&recipient), Seq(0))
            .await
            .expect("legacy parking event");
        let parked = events
            .iter()
            .find(|event| event.kind == POINTER_PARKED_EVENT_KIND)
            .expect("parked transition");
        assert_eq!(
            serde_json::from_str::<Value>(&parked.payload).expect("parked payload"),
            serde_json::json!({"announcements":18,"reason":"announcement-limit"}),
            "announcements means what the seat experienced, not the policy limit"
        );
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "legacy parking keeps mail readable"
        );
    }

    #[tokio::test]
    async fn lagged_policy_subscription_reconciles_from_durable_spine() {
        let registry = Arc::new(FakeRegistry::new());
        let recipient = SeatId::from("pij-lagged-policy");
        registry
            .put(seat(recipient.as_str(), Some("%lagged")))
            .await
            .expect("register recipient");
        let queue = Arc::new(FakeQueue::new(1_024).expect("queue"));
        let transport = Arc::new(FakeTransport::unreachable());
        // Arranged: this test is about pointer-budget reconciliation, so the
        // send-boundary gate must permit rather than veto for an unrelated reason.
        let tmux = Arc::new(FakeTmux::new().with_clear_composer("%lagged"));
        let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        interaction.observe_composer("%lagged", "");
        let spine = Arc::new(FakeSpine::new());
        let event_bus = Arc::new(
            EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 1).expect("one-event buffer"),
        );
        let worker = DrainWorker::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&queue) as Arc<dyn Queue>,
            Arc::clone(&transport) as Arc<dyn Transport>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            interaction,
            Arc::clone(&event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 3,
            },
        )
        .expect("worker");
        assert_eq!(
            worker
                .drain_once()
                .await
                .expect("hydrate live subscription"),
            0
        );
        for announcement in 1..=5 {
            event_bus
                .publish(Event {
                    seq: None,
                    v: 1,
                    at: announcement,
                    kind: POINTER_ANNOUNCED_EVENT_KIND.to_string(),
                    seat: Some(recipient.clone()),
                    payload: serde_json::json!({
                        "msg_id": format!("pre-ordinal-{announcement}"),
                        "from": "pij-sender"
                    })
                    .to_string(),
                })
                .await
                .expect("overflow live buffer");
        }
        queue
            .enqueue(Job {
                kind: delivery_kind(&recipient),
                serial_key: recipient.to_string(),
                payload: serde_json::to_string(&message(
                    recipient.as_str(),
                    "lagged unread body",
                    None,
                ))
                .expect("message"),
                dedupe_key: "lagged-policy-body".to_string(),
                attempt: 0,
            })
            .await
            .expect("enqueue body");

        worker.drain_once().await.expect("reconcile and park");
        assert!(
            tmux.calls().iter().all(|call| !call.starts_with("submit:")),
            "lossy live state must not reopen an exhausted pointer budget"
        );
        let parked = spine
            .tail(Some(&recipient), Seq(0))
            .await
            .expect("parked event")
            .into_iter()
            .find(|event| event.kind == POINTER_PARKED_EVENT_KIND)
            .expect("durable reconciliation parks");
        assert_eq!(
            serde_json::from_str::<Value>(&parked.payload).expect("parked payload"),
            serde_json::json!({"announcements":5,"reason":"announcement-limit"})
        );
    }
    #[tokio::test]
    async fn newer_unpark_fact_wins_over_stale_park_decision() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        let recipient = SeatId::from("pij-read-race");
        let decision_seq = fixture
            .event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: 1,
                kind: POINTER_ANNOUNCED_EVENT_KIND.to_string(),
                seat: Some(recipient.clone()),
                payload: serde_json::json!({
                    "msg_id":"race",
                    "from":"pij-sender",
                    "announcement":3
                })
                .to_string(),
            })
            .await
            .expect("decision fact");
        fixture
            .event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: 2,
                kind: POINTER_UNPARKED_EVENT_KIND.to_string(),
                seat: Some(recipient.clone()),
                payload: serde_json::json!({"reason":"reader-read","messages":1}).to_string(),
            })
            .await
            .expect("concurrent read");

        fixture
            .worker
            .publish_parked(&recipient, 3, 3, Some(decision_seq))
            .await
            .expect("compare before park");
        assert!(
            fixture
                .spine
                .tail(Some(&recipient), Seq(0))
                .await
                .expect("race history")
                .iter()
                .all(|event| event.kind != POINTER_PARKED_EVENT_KIND),
            "a read newer than the decision must not lose to stale parking"
        );
    }

    #[tokio::test]
    async fn third_pointer_explains_parking_row_stays_readable_and_read_unparks() {
        let mut fixture = fixture_with_limit(FakeTransport::unreachable(), FakeTmux::new(), 3);
        register(&fixture, seat("pij-parked", Some("%park"))).await;
        fixture.interaction.observe_composer("%park", "");
        let now = Arc::new(AtomicU64::new(0));
        let clock = Arc::clone(&now);
        fixture.worker.clock = Arc::new(move || Ok(clock.load(Ordering::Relaxed)));
        let msg = message("pij-parked", "READ THIS BODY", None);
        enqueue(&fixture, &msg).await;

        for announcement in 1_u32..=3 {
            now.store(u64::from(announcement - 1) * 90_000, Ordering::Relaxed);
            assert_eq!(fixture.worker.drain_once().await.expect("announcement"), 1);
        }
        now.store(270_000, Ordering::Relaxed);
        assert_eq!(fixture.worker.drain_once().await.expect("parked pass"), 1);

        let submits: Vec<_> = fixture
            .tmux
            .calls()
            .into_iter()
            .filter(|call| call.starts_with("submit:"))
            .collect();
        assert_eq!(submits.len(), 3, "N+1 must not announce");
        assert_eq!(
            submits[2],
            "submit:%park:[pij from pij-sender] message waiting — final reminder; parked after 3 announcements — message remains queued; run: pij inbox when ready"
        );
        assert_eq!(fixture.queue.live_len(), 1, "parking never consumes mail");

        let parked_events = fixture
            .spine
            .tail(Some(&SeatId::from("pij-parked")), Seq(0))
            .await
            .expect("pointer policy events");
        assert_eq!(
            parked_events
                .iter()
                .filter(|event| event.kind == POINTER_PARKED_EVENT_KIND)
                .count(),
            1,
            "parking transition is visible once"
        );
        let parked = parked_events
            .iter()
            .find(|event| event.kind == POINTER_PARKED_EVENT_KIND)
            .expect("parked event");
        assert_eq!(
            serde_json::from_str::<Value>(&parked.payload).expect("parked json"),
            serde_json::json!({"announcements":3,"reason":"announcement-limit"})
        );

        let mut restarted = DrainWorker::new(
            Arc::clone(&fixture.registry) as Arc<dyn Registry>,
            Arc::clone(&fixture.queue) as Arc<dyn Queue>,
            Arc::clone(&fixture.transport) as Arc<dyn Transport>,
            Arc::clone(&fixture.tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&fixture.interaction),
            Arc::clone(&fixture.event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 3,
            },
        )
        .expect("restarted worker");
        restarted.clock = Arc::new(|| Ok(360_000));
        restarted.drain_once().await.expect("replayed parking");
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            3,
            "cold replay must preserve the exhausted seat budget"
        );

        let delivery = crate::delivery::DeliveryService::new(
            Arc::clone(&fixture.registry) as Arc<dyn Registry>,
            Arc::clone(&fixture.queue) as Arc<dyn Queue>,
            Arc::clone(&fixture.transport) as Arc<dyn Transport>,
            Arc::clone(&fixture.interaction),
            Arc::clone(&fixture.event_bus),
        )
        .expect("delivery service");
        // Two-step now (u-inbox): the reader CLAIMS, and acks separately. The
        // unpark rides on the claim, because the seat has been GIVEN its message
        // at that point whether or not the client survives to ack.
        let read = delivery
            .claim_inbox(&SeatId::from("pij-parked"), false)
            .await
            .expect("parked mail stays readable");
        assert_eq!(
            read.iter()
                .map(|claim| claim.message.clone())
                .collect::<Vec<_>>(),
            [msg]
        );
        let before_ack = fixture
            .spine
            .tail(Some(&SeatId::from("pij-parked")), Seq(0))
            .await
            .expect("unpark at claim");
        assert!(
            before_ack
                .iter()
                .any(|event| event.kind == POINTER_UNPARKED_EVENT_KIND),
            "claiming without acking must already publish unpark"
        );
        assert!(
            fixture.queue.acked().is_empty(),
            "placement witness must inspect the interval before acknowledgement"
        );
        for claim in &read {
            delivery
                .acknowledge_inbox(claim.job_id)
                .await
                .expect("ack the claim the reader received");
        }
        assert_eq!(fixture.queue.live_len(), 0);
        let events = fixture
            .spine
            .tail(Some(&SeatId::from("pij-parked")), Seq(0))
            .await
            .expect("unpark event");
        let unparked = events
            .iter()
            .find(|event| event.kind == POINTER_UNPARKED_EVENT_KIND)
            .expect("read visibly unparks");
        assert_eq!(
            serde_json::from_str::<Value>(&unparked.payload).expect("unparked json"),
            serde_json::json!({"reason":"reader-read","messages":1})
        );

        let next = message("pij-parked", "NEW MAIL", None);
        enqueue(&fixture, &next).await;
        now.store(360_000, Ordering::Relaxed);
        fixture
            .worker
            .drain_once()
            .await
            .expect("post-read announce");
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            4,
            "a successful read resets the seat-level budget"
        );
    }

    #[test]
    fn zero_pointer_limit_is_refused() {
        assert_eq!(Config::default().pointer_announce_limit, 3);
        let fixture = fixture_with_limit(FakeTransport::unreachable(), FakeTmux::new(), 1);
        let result = DrainWorker::new(
            Arc::clone(&fixture.registry) as Arc<dyn Registry>,
            Arc::clone(&fixture.queue) as Arc<dyn Queue>,
            Arc::clone(&fixture.transport) as Arc<dyn Transport>,
            Arc::clone(&fixture.tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&fixture.interaction),
            Arc::clone(&fixture.event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 0,
            },
        );
        let Err(error) = result else {
            panic!("zero means no defensible policy");
        };
        assert!(error.to_string().contains("pointer_announce_limit"));
    }

    #[tokio::test]
    async fn one_pass_announces_at_most_once_for_a_recipient_with_multiple_rows() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-batch", Some("%15"))).await;
        fixture.interaction.observe_composer("%15", "");
        let first = message("pij-batch", "first", None);
        let mut second = message("pij-batch", "second", None);
        second.msg_id = "m-pij-batch-2".to_string();
        let first_id = enqueue(&fixture, &first).await;
        let second_id = enqueue(&fixture, &second).await;

        assert_eq!(fixture.worker.drain_once().await.expect("one pass"), 1);
        assert_eq!(fixture.queue.attempts(first_id), 1);
        assert_eq!(fixture.queue.attempts(second_id), 0);
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "removing the recipient kind after its first claim is the in-pass suppression"
        );
    }

    #[tokio::test]
    async fn live_pointer_event_suppresses_a_second_running_worker() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-shared", Some("%16"))).await;
        fixture.interaction.observe_composer("%16", "");
        enqueue(&fixture, &message("pij-shared", "waiting", None)).await;

        let mut second = DrainWorker::new(
            Arc::clone(&fixture.registry) as Arc<dyn Registry>,
            Arc::clone(&fixture.queue) as Arc<dyn Queue>,
            Arc::clone(&fixture.transport) as Arc<dyn Transport>,
            Arc::clone(&fixture.tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&fixture.interaction),
            Arc::clone(&fixture.event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 3,
            },
        )
        .expect("second worker");
        second.clock = Arc::new(|| Ok(778));

        fixture.worker.drain_once().await.expect("first worker");
        second.drain_once().await.expect("second worker");
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "the second live subscriber observes the first worker's pointer event"
        );
    }

    #[tokio::test]
    async fn fresh_worker_replays_pointer_budget_and_cadence_after_restart() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-restart", Some("%13"))).await;
        fixture.interaction.observe_composer("%13", "");
        enqueue(&fixture, &message("pij-restart", "still waiting", None)).await;
        fixture.worker.drain_once().await.expect("first process");

        let mut restarted = DrainWorker::new(
            Arc::clone(&fixture.registry) as Arc<dyn Registry>,
            Arc::clone(&fixture.queue) as Arc<dyn Queue>,
            Arc::clone(&fixture.transport) as Arc<dyn Transport>,
            Arc::clone(&fixture.tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&fixture.interaction),
            Arc::clone(&fixture.event_bus),
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 3,
            },
        )
        .expect("restarted worker");
        restarted.clock = Arc::new(|| Ok(778));
        restarted.drain_once().await.expect("restart pass");

        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "restart replays the durable announcement instead of repeating process residue"
        );
    }

    #[tokio::test]
    async fn unknown_or_human_typing_gate_releases_body_without_delivery() {
        for (label, tmux, observe) in [
            ("unknown", FakeTmux::new(), false),
            ("human", FakeTmux::new().with_user_typing(), true),
        ] {
            let fixture = fixture_unarranged(FakeTransport::reachable(), tmux);
            register(&fixture, seat("pij-gated", Some("%9"))).await;
            if observe {
                fixture.interaction.observe_composer("%9", "");
            }
            let id = enqueue(&fixture, &message("pij-gated", "hello", None)).await;

            assert_eq!(fixture.worker.drain_once().await.expect(label), 1);
            assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)], "{label}");
            assert!(fixture.transport.calls().is_empty(), "{label}: no socket");
            assert!(
                fixture
                    .tmux
                    .calls()
                    .iter()
                    .all(|call| !call.starts_with("submit:")),
                "{label}: no pointer"
            );
        }
    }

    #[tokio::test]
    async fn paneless_pull_consumer_keeps_ownership_of_its_queue_row() {
        let fixture = fixture(FakeTransport::reachable(), FakeTmux::new());
        register(&fixture, seat("pij-pull", None)).await;
        enqueue(&fixture, &message("pij-pull", "pull me", None)).await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 0);
        assert_eq!(fixture.queue.live_len(), 1);
        assert!(fixture.queue.retried().is_empty());
        assert!(fixture.transport.calls().is_empty());
        assert!(fixture.tmux.calls().is_empty());
    }

    #[tokio::test]
    async fn socket_body_is_delivered_and_acked_without_pointer_or_retry() {
        let fixture = fixture(FakeTransport::reachable(), FakeTmux::new());
        register(&fixture, seat("pij-socket", Some("%10"))).await;
        fixture.interaction.observe_composer("%10", "");
        let msg = message("pij-socket", "socket body", None);
        enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 1);
        assert_eq!(fixture.transport.delivered(), [msg]);
        assert!(fixture.queue.retried().is_empty());
        assert!(matches!(
            fixture.queue.acked().as_slice(),
            [(_, Outcome::Done)]
        ));
        assert_eq!(
            fixture.tmux.calls(),
            ["list_panes", "capture:%10:4294967295", "user_typing:%10"]
        );
    }

    #[tokio::test]
    async fn failed_command_uses_durable_attempt_backoff() {
        // Unarranged: the backoff under test is the one a VETOED command takes,
        // so the gate must have no composer evidence to permit on.
        let fixture = fixture_unarranged(FakeTransport::reachable(), FakeTmux::new());
        register(&fixture, seat("pij-command-wait", Some("%14"))).await;
        let msg = message("pij-command-wait", "", Some("compact"));
        let id = enqueue(&fixture, &msg).await;

        assert_eq!(
            fixture.worker.drain_once().await.expect("blocked command"),
            1
        );
        assert_eq!(fixture.queue.retried(), [(id, Duration::from_secs(1))]);
        assert_eq!(fixture.worker.drain_once().await.expect("not due"), 0);
        fixture.queue.advance(Duration::from_secs(1));
        assert_eq!(fixture.worker.drain_once().await.expect("retry command"), 1);
        assert_eq!(fixture.queue.attempts(id), 2);
        assert_eq!(
            fixture.queue.retried(),
            [(id, Duration::from_secs(1)), (id, Duration::from_secs(2))]
        );
    }

    #[tokio::test]
    async fn drain_release_increments_attempt_in_real_sqlite_and_body_is_immediately_claimable() {
        let fresh = FreshStore::new();
        let pool = pij_store::open(&fresh.path()).await.expect("open store");
        let queue = Arc::new(
            SqliteQueue::new(
                pool.clone(),
                Config::default().claim_lease_secs,
                Config::default().delivered_id_capacity,
            )
            .expect("sqlite queue"),
        );
        let registry = Arc::new(FakeRegistry::new());
        registry
            .put(seat("pij-real", Some("%11")))
            .await
            .expect("register");
        let transport = Arc::new(FakeTransport::unreachable());
        let tmux = Arc::new(FakeTmux::new());
        let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let spine = Arc::new(FakeSpine::new());
        let event_bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 16).expect("event bus"));
        let worker = DrainWorker::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&queue) as Arc<dyn Queue>,
            Arc::clone(&transport) as Arc<dyn Transport>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            interaction,
            event_bus,
            PointerPolicy {
                cadence: CADENCE,
                announcement_limit: 3,
            },
        )
        .expect("worker");
        let msg = message("pij-real", "durable body", None);
        let id = queue
            .enqueue(Job {
                kind: delivery_kind(&msg.to),
                serial_key: msg.to.0.clone(),
                payload: serde_json::to_string(&msg).expect("message json"),
                dedupe_key: msg.msg_id.clone(),
                attempt: 0,
            })
            .await
            .expect("enqueue");

        assert_eq!(worker.drain_once().await.expect("drain"), 1);
        let attempt: i64 = sqlx::query_scalar("SELECT attempt FROM jobs WHERE id = ?1")
            .bind(id.0 as i64)
            .fetch_one(&pool)
            .await
            .expect("read attempt");
        assert_eq!(attempt, 1, "the drain must call Queue::retry exactly once");

        let (claimed_id, claimed) = queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("claim released body")
            .expect("zero-delay release is immediately reader-claimable");
        assert_eq!(claimed_id, id);
        assert_eq!(claimed.attempt, 1);
    }
    struct FailFirstDeliveryAck {
        inner: FakeQueue,
        fail_first: AtomicBool,
        ack_calls: AtomicUsize,
        ack_called: Notify,
    }

    impl FailFirstDeliveryAck {
        fn new() -> Self {
            Self {
                inner: FakeQueue::new(1_024).expect("valid fake queue policy"),
                fail_first: AtomicBool::new(true),
                ack_calls: AtomicUsize::new(0),
                ack_called: Notify::new(),
            }
        }
    }

    #[async_trait]
    impl Queue for FailFirstDeliveryAck {
        async fn note_delivered(
            &self,
            recipient: &SeatId,
            msg_id: &str,
            origin: DeliveryOrigin,
        ) -> pij_core::error::Result<Option<DeliveryOrigin>> {
            self.inner.note_delivered(recipient, msg_id, origin).await
        }

        async fn forget_delivered(
            &self,
            recipient: &SeatId,
            msg_id: &str,
        ) -> pij_core::error::Result<()> {
            self.inner.forget_delivered(recipient, msg_id).await
        }

        async fn enqueue(&self, job: Job) -> pij_core::error::Result<JobId> {
            self.inner.enqueue(job).await
        }

        async fn enqueue_delivery(&self, job: Job) -> pij_core::error::Result<DeliveryEnqueue> {
            self.inner.enqueue_delivery(job).await
        }

        async fn claim(
            &self,
            kinds: &[String],
            worker: &str,
        ) -> pij_core::error::Result<Option<(JobId, Job)>> {
            self.inner.claim(kinds, worker).await
        }

        async fn ack(&self, job: JobId, outcome: Outcome) -> pij_core::error::Result<()> {
            self.inner.ack(job, outcome).await
        }

        async fn ack_delivery(
            &self,
            job: JobId,
            origin: DeliveryOrigin,
        ) -> pij_core::error::Result<pij_core::ports::DeliveryAck> {
            self.ack_calls.fetch_add(1, Ordering::SeqCst);
            self.ack_called.notify_one();
            if self.fail_first.swap(false, Ordering::SeqCst) {
                return Err(pij_core::error::PijError::Adapter {
                    adapter: "test/fail-first-delivery-ack".to_string(),
                    message: "injected transient delivery ack failure".to_string(),
                });
            }
            self.inner.ack_delivery(job, origin).await
        }

        async fn retry(&self, job: JobId, delay: Duration) -> pij_core::error::Result<()> {
            self.inner.retry(job, delay).await
        }
    }

    #[tokio::test(start_paused = true)]
    async fn drain_loop_survives_transient_delivery_ack_failure_and_processes_next_message() {
        let queue = Arc::new(FailFirstDeliveryAck::new());
        let registry = Arc::new(FakeRegistry::new());
        let transport = Arc::new(FakeTransport::reachable());
        let tmux = Arc::new(FakeTmux::new());
        let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let event_bus = Arc::new(EventBus::new(Arc::new(FakeSpine::new()), 16).expect("event bus"));
        let worker = Arc::new(
            DrainWorker::new(
                Arc::clone(&registry) as Arc<dyn Registry>,
                Arc::clone(&queue) as Arc<dyn Queue>,
                Arc::clone(&transport) as Arc<dyn Transport>,
                Arc::clone(&tmux) as Arc<dyn TmuxPort>,
                Arc::clone(&interaction),
                event_bus,
                PointerPolicy {
                    cadence: CADENCE,
                    announcement_limit: 3,
                },
            )
            .expect("drain worker"),
        );
        for (seat_id, pane) in [("pij-first", "%21"), ("pij-next", "%22")] {
            registry
                .put(seat(seat_id, Some(pane)))
                .await
                .expect("register recipient");
            interaction.observe_composer(pane, "");
            let msg = message(seat_id, seat_id, None);
            queue
                .enqueue(Job {
                    kind: delivery_kind(&msg.to),
                    serial_key: msg.to.0.clone(),
                    payload: serde_json::to_string(&msg).expect("message json"),
                    dedupe_key: msg.msg_id,
                    attempt: 0,
                })
                .await
                .expect("enqueue delivery");
        }

        let interval = crate::lifecycle::TickInterval::new(Duration::from_secs(1))
            .expect("validate production drain interval");
        let loop_ = crate::start_resilient_delivery_drain(worker, interval);
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(1)).await;
        queue.ack_called.notified().await;
        assert_eq!(
            queue.ack_calls.load(Ordering::SeqCst),
            1,
            "first ack failed"
        );

        tokio::time::advance(Duration::from_secs(1)).await;
        queue.ack_called.notified().await;
        assert_eq!(
            queue.ack_calls.load(Ordering::SeqCst),
            2,
            "the production loop must process the next item after one dependency error"
        );
        assert_eq!(
            transport
                .delivered()
                .iter()
                .map(|msg| msg.to.0.as_str())
                .collect::<Vec<_>>(),
            ["pij-first", "pij-next"]
        );
        loop_.shutdown().await.expect("shutdown drain loop");
    }

    /// A held message is waiting on a PERSON. `release_body` is
    /// `retry(job, Duration::ZERO)` — re-delivering at once, and every
    /// re-delivery raises a fresh approval dialog. Until plan 110 made `Held`
    /// reachable this had never executed, so mutate the backoff back to
    /// `release_body` and this test must fail.
    #[tokio::test]
    async fn a_held_delivery_backs_off_instead_of_re_prompting_the_human_at_once() {
        let fixture = fixture(
            FakeTransport::reachable().script_outcome(DeliveryOutcome::Held {
                reason: "recipient approval pending".to_string(),
            }),
            FakeTmux::new(),
        );
        register(&fixture, seat("pij-held", Some("%9"))).await;
        fixture.interaction.observe_composer("%9", "   ");
        enqueue(&fixture, &message("pij-held", "waiting on a human", None)).await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 1);
        let retried = fixture.queue.retried();
        assert_eq!(
            retried.len(),
            1,
            "a held delivery must be retried, not acked"
        );
        assert_ne!(
            retried[0].1,
            Duration::ZERO,
            "an immediate retry is a dialog storm aimed at the operator"
        );
        assert!(
            fixture.queue.acked().is_empty(),
            "held is not terminal — the human may still approve it"
        );
    }

    /// Someone who has ignored the prompt this many times is answering by not
    /// answering. Park it where a human can find it rather than asking forever.
    #[tokio::test]
    async fn a_persistently_held_delivery_parks_instead_of_asking_forever() {
        let fixture = fixture(
            FakeTransport::reachable().script_outcome(DeliveryOutcome::Held {
                reason: "recipient approval pending".to_string(),
            }),
            FakeTmux::new(),
        );
        register(&fixture, seat("pij-held", Some("%9"))).await;
        fixture.interaction.observe_composer("%9", "   ");
        enqueue(&fixture, &message("pij-held", "waiting on a human", None)).await;

        for _ in 0..super::HELD_ATTEMPT_LIMIT + 1 {
            let _ = fixture.worker.drain_once().await.expect("drain");
            fixture.queue.advance(Duration::from_secs(6 * 60));
        }
        let acked = fixture.queue.acked();
        let parked = match acked.as_slice() {
            [(_, Outcome::Failed { reason })] => reason.clone(),
            other => panic!("a permanently held delivery must park, got {other:?}"),
        };
        assert!(
            parked.contains("stayed held"),
            "the park reason must say why a human can act on it, got {parked}"
        );
    }

    /// A refusal is an answer, and it is given once. Retrying re-prompts someone
    /// who already declined.
    #[tokio::test]
    async fn a_refusal_is_terminal_and_is_never_retried() {
        let fixture = fixture(
            FakeTransport::reachable().script_outcome(DeliveryOutcome::Refused {
                reason: "the recipient declined the message".to_string(),
            }),
            FakeTmux::new(),
        );
        register(&fixture, seat("pij-refused", Some("%9"))).await;
        fixture.interaction.observe_composer("%9", "   ");
        enqueue(&fixture, &message("pij-refused", "they said no", None)).await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 1);
        assert!(
            fixture.queue.retried().is_empty(),
            "a refusal must never be retried"
        );
        assert!(
            matches!(fixture.queue.acked().as_slice(), [(_, Outcome::Done)]),
            "refused is DONE — nothing malfunctioned, and it was not delivered"
        );
    }
}
