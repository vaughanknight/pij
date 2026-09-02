use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::delivery::{DeliveryRung, MAX_TYPED_FRAME_BYTES, delivery_kind, select_rung};
use pij_core::error::{PijError, Result};
use pij_core::framing::frame_message;
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Event, Job, JobId, Msg, Outcome, SemanticState,
};
use pij_core::ports::{Queue, Registry, SeatFilter, TmuxPort, Transport};
use pij_harnesses::{InteractionGate, StagedSubmission};

use crate::events::EventBus;

use super::{
    CONTROL_BODY_POINTER_EVENT_KIND, OVERSIZE_BODY_POINTER_EVENT_KIND, PointerPolicy,
    render_control_body_pointer, render_oversize_body_pointer, retry_delay, submit_command,
};

/// How many times a held delivery is re-offered before the job is parked.
///
/// A held message is waiting on a PERSON, not on a resource. Retrying forever
/// re-prompts someone who has already declined to answer.
const HELD_ATTEMPT_LIMIT: u32 = 4;

const WORKER_ID: &str = "pointer-drain";

/// One delivery-queue drain pass below the socket transport.
///
/// The worker claims only pane-bound recipients, so paneless pull consumers keep
/// ownership of their own rows. A failed command uses durable exponential
/// backoff. A socketless body is framed once, submitted to the pane, and then
/// acknowledged with the distinct typed-to-pane evidence class.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, import `pij_daemon::pointer::DrainWorker`,
/// construct one from the composed registry, queue, transport, tmux,
/// `InteractionGate`, event bus, and the validated pointer policy, then call
/// `drain_once` from the injected delivery cadence. The event bus and pointer
/// policy remain constructor inputs for the module-level pointer API, but no
/// pane-bound body path consults pointer cadence after the full-body cutover.
pub struct DrainWorker {
    registry: Arc<dyn Registry>,
    queue: Arc<dyn Queue>,
    transport: Arc<dyn Transport>,
    tmux: Arc<dyn TmuxPort>,
    interaction: Arc<InteractionGate>,
    event_bus: Arc<EventBus>,
    clock: fn() -> Result<u64>,
}

impl DrainWorker {
    /// Construct a worker and validate the retained pointer-policy configuration.
    ///
    /// # Errors
    /// Returns [`PijError::Adapter`] when pointer cadence or limit is zero.
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
            clock: system_time_ms,
        })
    }

    /// Drain at most one currently-due delivery row per pane-bound or tombstoned recipient.
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
        let seats = self.registry.list(SeatFilter::default()).await?;
        let mut kinds: Vec<String> = seats
            .iter()
            .filter(|seat| seat.pane.is_some() || seat.tombstoned_at.is_some())
            .map(|seat| delivery_kind(&seat.id))
            .collect();
        if kinds.is_empty() || self.queue.peek(&kinds).await?.is_none() {
            return Ok(0);
        }
        let (live_panes, mut deferred) = match self.tmux.list_panes().await {
            Ok(panes) => (Some(panes), None),
            Err(error) => (None, Some(error)),
        };

        let mut handled = 0;
        // A failed global inventory cannot prove pane absence. Defer the error,
        // skip that terminal policy for this pass, and preserve per-recipient work.
        while !kinds.is_empty() {
            let Some((job_id, job)) = self.queue.claim(&kinds, WORKER_ID).await? else {
                break;
            };
            handled += 1;
            let mut recipient_terminal = false;
            let result = self
                .handle_claim(job_id, &job, live_panes.as_deref(), &mut recipient_terminal)
                .await;
            // Live, retryable, and unknown recipients keep one claim per pass.
            // Only a successfully terminalized dead recipient retains its kind
            // so every one of its queued rows closes in this same cadence.
            if !recipient_terminal || result.is_err() {
                kinds.retain(|kind| kind != &job.kind);
            }
            if let Err(error) = result {
                deferred.get_or_insert(error);
            }
        }
        match deferred {
            Some(error) => Err(error),
            None => Ok(handled),
        }
    }

    async fn handle_claim(
        &self,
        job_id: JobId,
        job: &Job,
        live_panes: Option<&[pij_core::model::Pane]>,
        recipient_terminal: &mut bool,
    ) -> Result<()> {
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
            let reason = recipient
                .tombstone_reason
                .as_deref()
                .unwrap_or("no tombstone reason recorded");
            *recipient_terminal = true;
            return self
                .fail_claim(
                    job_id,
                    format!(
                        "delivery recipient {} is tombstoned ({reason}); not retried",
                        msg.to
                    ),
                )
                .await;
        }
        if recipient.semantic_state == Some(SemanticState::Hold) {
            return self.release_or_backoff(job_id, job, &msg).await;
        }
        let Some(pane) = recipient.pane.as_deref() else {
            return self.release_or_backoff(job_id, job, &msg).await;
        };
        let pane_absent =
            live_panes.is_some_and(|panes| !panes.iter().any(|listed| listed.id == pane));
        let socket_available = if msg.command.is_none() && recipient.proc.is_some() {
            Some(match self.transport.can_deliver(&recipient, &msg).await {
                Ok(available) => available,
                Err(error) => {
                    self.release_body(job_id).await?;
                    return Err(error);
                }
            })
        } else {
            None
        };
        // POLICY, not a brake: a successful all-server pane inventory plus a
        // negative socket probe decides terminal failure. Unknown inventory or
        // reachability only delays; neither can prove the recipient is gone.
        if pane_absent && socket_available != Some(true) {
            *recipient_terminal = true;
            return self
                .fail_claim(
                    job_id,
                    format!(
                        "delivery recipient {} pane {pane} is absent from tmux list-panes -a and no socket is reachable; not retried",
                        msg.to
                    ),
                )
                .await;
        }
        if recipient.proc.is_none() {
            return self.release_or_backoff(job_id, job, &msg).await;
        }
        if msg.command.is_some() {
            let verdict = match self.interaction.fresh_injection_verdict(pane).await {
                Ok(verdict) => verdict,
                Err(error) => {
                    self.backoff_unobservable(job_id, job.attempt).await?;
                    return Err(error);
                }
            };
            if !verdict.permitted {
                return self.release_or_backoff(job_id, job, &msg).await;
            }
            return self
                .submit_command_claim(job_id, job.attempt, pane, &msg)
                .await;
        }
        let Some(socket_available) = socket_available else {
            return self.release_body(job_id).await;
        };
        let (interaction_permits, composer_idle) = if socket_available && !pane_absent {
            match self.interaction.fresh_injection_verdict(pane).await {
                Ok(verdict) => (verdict.permitted, verdict.composer_idle),
                Err(error) => {
                    self.backoff_unobservable(job_id, job.attempt).await?;
                    return Err(error);
                }
            }
        } else {
            (true, true)
        };
        if !interaction_permits {
            return self.release_body(job_id).await;
        }
        match select_rung(&recipient, &msg, socket_available, false, composer_idle) {
            DeliveryRung::Socket => match self.transport.deliver(&recipient, &msg).await {
                Ok(DeliveryOutcome::Delivered { origin }) => {
                    self.queue.ack_delivery(job_id, origin).await.map(|_| ())
                }
                Ok(DeliveryOutcome::Queued { .. }) => self.release_body(job_id).await,
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
            DeliveryRung::ControlBodyPull => {
                self.announce_control_body_claim(job_id, job.attempt, pane, &msg)
                    .await
            }
            DeliveryRung::TypedBody => {
                self.submit_body_claim(job_id, job.attempt, pane, &msg)
                    .await
            }
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

    async fn submit_body_claim(
        &self,
        job_id: JobId,
        attempt: u32,
        pane: &str,
        msg: &Msg,
    ) -> Result<()> {
        let framed = frame_message(&msg.from, msg.from_machine.as_deref(), &msg.body);
        if framed.len() > MAX_TYPED_FRAME_BYTES {
            let pointer = render_oversize_body_pointer(
                &msg.from,
                msg.from_machine.as_deref(),
                framed.len(),
                MAX_TYPED_FRAME_BYTES,
            );
            return self
                .announce_pull_claim(
                    job_id,
                    pane,
                    msg,
                    OVERSIZE_BODY_POINTER_EVENT_KIND,
                    "frame-too-large",
                    pointer,
                )
                .await;
        }
        match self
            .interaction
            .submit_with_owned_input(pane, &framed)
            .await
        {
            Ok(StagedSubmission::Submitted) => self
                .queue
                .ack_delivery(job_id, DeliveryOrigin::TypedToPane)
                .await
                .map(|_| ()),
            Ok(StagedSubmission::Deferred { .. }) => self.release_body(job_id).await,
            Err(error) => {
                self.backoff_command(job_id, attempt).await?;
                Err(error)
            }
        }
    }

    async fn announce_control_body_claim(
        &self,
        job_id: JobId,
        _attempt: u32,
        pane: &str,
        msg: &Msg,
    ) -> Result<()> {
        let pointer = render_control_body_pointer(&msg.from, msg.from_machine.as_deref());
        self.announce_pull_claim(
            job_id,
            pane,
            msg,
            CONTROL_BODY_POINTER_EVENT_KIND,
            "terminal-control",
            pointer,
        )
        .await
    }

    async fn announce_pull_claim(
        &self,
        job_id: JobId,
        pane: &str,
        msg: &Msg,
        event_kind: &str,
        reason: &str,
        pointer: String,
    ) -> Result<()> {
        let already_announced = self
            .keep_body_pullable(
                job_id,
                self.body_pointer_announced(msg, event_kind, reason).await,
            )
            .await?;
        if already_announced {
            return self.release_body(job_id).await;
        }
        match self
            .interaction
            .submit_with_owned_input(pane, &pointer)
            .await
        {
            Ok(StagedSubmission::Submitted) => {
                let payload = serde_json::json!({
                    "msg_id": msg.msg_id,
                    "from": msg.from,
                    "reason": reason,
                })
                .to_string();
                let at = self.keep_body_pullable(job_id, (self.clock)()).await?;
                self.keep_body_pullable(
                    job_id,
                    self.event_bus
                        .publish(Event {
                            seq: None,
                            v: 1,
                            at,
                            kind: event_kind.to_string(),
                            seat: Some(msg.to.clone()),
                            payload,
                        })
                        .await
                        .map(|_| ()),
                )
                .await?;
                self.release_body(job_id).await
            }
            Ok(StagedSubmission::Deferred { .. }) => self.release_body(job_id).await,
            Err(error) => self.keep_body_pullable(job_id, Err(error)).await,
        }
    }

    async fn body_pointer_announced(
        &self,
        msg: &Msg,
        event_kind: &str,
        reason: &str,
    ) -> Result<bool> {
        let Some(event) = self
            .event_bus
            .latest_matching_message(&msg.to, event_kind, &msg.msg_id)
            .await?
        else {
            return Ok(false);
        };
        let payload: serde_json::Value =
            serde_json::from_str(&event.payload).map_err(|error| PijError::Adapter {
                adapter: "daemon/pointer".to_string(),
                message: format!("invalid body-pull pointer event: {error}"),
            })?;
        Ok(payload["msg_id"].as_str() == Some(&msg.msg_id) && payload["reason"] == reason)
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

    async fn keep_body_pullable<T>(&self, job_id: JobId, result: Result<T>) -> Result<T> {
        match result {
            Ok(value) => Ok(value),
            Err(error) => match self.release_body(job_id).await {
                Ok(()) => Err(error),
                Err(release) => Err(PijError::Adapter {
                    adapter: "daemon/pointer".to_string(),
                    message: format!(
                        "{error}; additionally failed to keep body pullable: {release}"
                    ),
                }),
            },
        }
    }

    /// Back off a body whose recipient could not be observed.
    ///
    /// An authorization veto is immediately retryable because the next tick may
    /// observe an idle composer. A capture error says the recipient itself could
    /// not be observed, so it uses the durable shared backoff curve instead of
    /// spinning on the same vanished pane every tick.
    async fn backoff_unobservable(&self, job_id: JobId, attempt: u32) -> Result<()> {
        self.queue.retry(job_id, retry_delay(attempt)).await
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
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::time::Duration;

    use async_trait::async_trait;
    use pij_core::config::Config;
    use pij_core::delivery::{MAX_TYPED_FRAME_BYTES, delivery_kind};
    use pij_core::error::PijError;
    use pij_core::framing::frame_message;
    use pij_core::model::{
        DeliveryOrigin, DeliveryOutcome, Event, Harness, Job, JobId, Msg, Outcome, Pane,
        ProcIdentity, SeatDescriptor, SeatId,
    };
    use pij_core::ports::{DeliveryEnqueue, Queue, Registry, Spine, TmuxPort, Transport};
    use pij_harnesses::InteractionGate;
    use pij_store::SqliteQueue;
    use pij_testkit::FreshStore;
    use pij_testkit::fakes::{FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport};
    use tokio::sync::Notify;

    use super::{DrainWorker, EventBus, PointerPolicy, retry_delay};
    use crate::pointer::{OVERSIZE_BODY_POINTER_EVENT_KIND, POINTER_ANNOUNCED_EVENT_KIND};

    const CADENCE: Duration = Duration::from_secs(90);

    struct Fixture {
        worker: DrainWorker,
        registry: Arc<FakeRegistry>,
        queue: Arc<FakeQueue>,
        transport: Arc<FakeTransport>,
        tmux: Arc<FakeTmux>,
        interaction: Arc<InteractionGate>,
        event_bus: Arc<EventBus>,
        spine: Arc<FakeSpine>,
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
        fixture_inner_with_idle(
            transport,
            tmux,
            pointer_limit,
            arrange_composers,
            Duration::from_millis(60_000),
        )
    }

    fn fixture_inner_with_idle(
        transport: FakeTransport,
        tmux: FakeTmux,
        pointer_limit: u32,
        arrange_composers: bool,
        idle: Duration,
    ) -> Fixture {
        let registry = Arc::new(FakeRegistry::new());
        let queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
        let transport = Arc::new(transport);
        let tmux = Arc::new(tmux);
        let interaction = Arc::new(InteractionGate::with_idle_window(
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            idle,
        ));
        let spine = Arc::new(FakeSpine::new());
        let event_bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 16).expect("event bus"));
        let worker = DrainWorker::new(
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
        Fixture {
            worker,
            registry,
            queue,
            transport,
            tmux,
            interaction,
            event_bus,
            spine,
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
        // Pane existence and composer permission are independent facts. Every
        // normal registered fixture is listed; only the default fixture also
        // supplies a recognized blank composer.
        if let Some(pane) = descriptor.pane.as_deref() {
            if fixture.arrange_composers {
                fixture.tmux.arrange_clear_composer(pane);
            } else {
                fixture.tmux.arrange_pane(pane);
            }
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
        // A recognized blank composer is authoritative under u3, so the fresh
        // verdict no longer asks tmux mode for a second, output-shaped veto.
        assert_eq!(
            fixture.tmux.calls(),
            [
                "list_panes",
                "pane_tap_sink:%7",
                "drain_pane_tap:%7",
                "list_panes",
                "capture:%7:4294967295",
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
    async fn socketless_body_retry_types_the_full_shared_frame_and_acks_it() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-body-typed", Some("%typed"))).await;
        fixture.interaction.observe_composer("%typed", "");
        let msg = message("pij-body-typed", "SECRET BODY", None);
        enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("drain"), 1);
        assert!(
            fixture.queue.retried().is_empty(),
            "typed body is terminal for the row"
        );
        assert_eq!(
            fixture.queue.live_len(),
            0,
            "typed body is no longer inbox work"
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .any(|call| call == "submit:%typed:[pij-rs from pij-sender]\nSECRET BODY\n[/pij]"),
            "retry path must submit the canonical full frame: {:?}",
            fixture.tmux.calls()
        );
        let replay = fixture
            .queue
            .enqueue_delivery(Job {
                kind: delivery_kind(&msg.to),
                serial_key: msg.to.0.clone(),
                payload: serde_json::to_string(&msg).expect("message json"),
                dedupe_key: msg.msg_id.clone(),
                attempt: 0,
            })
            .await
            .expect("query durable delivery ledger");
        let DeliveryEnqueue::AlreadyDelivered(origin) = replay else {
            panic!("a completed typed delivery must replay its receipt, got {replay:?}");
        };
        assert_eq!(
            serde_json::to_value(origin).expect("origin json"),
            "typed-to-pane",
            "typed delivery records its weaker, distinct evidence class"
        );
    }

    #[tokio::test]
    async fn oversized_worker_frame_is_named_and_immediately_pullable() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-oversize", Some("%oversize"))).await;
        fixture.interaction.observe_composer("%oversize", "");
        let mut msg = message("pij-oversize", "", None);
        let overhead = frame_message(&msg.from, msg.from_machine.as_deref(), "").len();
        msg.body = "x".repeat(MAX_TYPED_FRAME_BYTES + 1 - overhead);
        assert_eq!(
            frame_message(&msg.from, msg.from_machine.as_deref(), &msg.body).len(),
            MAX_TYPED_FRAME_BYTES + 1
        );
        let id = enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("named refusal"), 1);
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(fixture.queue.live_len(), 1);
        let submits: Vec<_> = fixture
            .tmux
            .calls()
            .into_iter()
            .filter(|call| call.starts_with("submit:"))
            .collect();
        assert_eq!(submits.len(), 1);
        assert!(
            submits[0].contains("message frame is 8193 bytes; pane typing limit is 8192 bytes")
                && submits[0].contains("body remains queued; run: pij inbox")
        );
        assert!(!submits[0].contains(&msg.body));
        let event = fixture
            .event_bus
            .latest_matching_message(&msg.to, OVERSIZE_BODY_POINTER_EVENT_KIND, &msg.msg_id)
            .await
            .expect("query oversized refusal")
            .expect("oversized refusal is durable");
        assert!(event.payload.contains("frame-too-large"));
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("claim oversized body")
            .expect("oversized body remains immediately pullable");
        assert_eq!(claimed.0, id);
        assert_eq!(
            serde_json::from_str::<Msg>(&claimed.1.payload).expect("queued oversized message"),
            msg
        );
    }

    #[tokio::test]
    async fn terminal_control_body_is_announced_and_remains_readable_in_inbox() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-control", Some("%control"))).await;
        fixture.interaction.observe_composer("%control", "");
        let msg = message("pij-control", "before\u{1b}[201~after", None);
        let id = enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("announce pull"), 1);
        assert_eq!(fixture.queue.live_len(), 1, "body remains queued");
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert!(
            fixture.tmux.calls().iter().any(|call| call
                .contains("message contains terminal control bytes that cannot be typed safely")),
            "the seat is told why it must pull: {:?}",
            fixture.tmux.calls()
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.contains("before\u{1b}[201~after")),
            "the control-bearing body is never typed"
        );
        assert_eq!(
            fixture
                .worker
                .drain_once()
                .await
                .expect("suppress repeat notice"),
            1
        );
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "the durable control-pointer fact suppresses repeat notices"
        );
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("claim inbox")
            .expect("body remains immediately readable");
        assert_eq!(claimed.0, id);
        assert_eq!(
            serde_json::from_str::<Msg>(&claimed.1.payload).expect("queued message"),
            msg
        );
    }

    #[tokio::test]
    async fn control_pointer_lookup_error_leaves_body_immediately_claimable() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-control-error", Some("%control-error"))).await;
        fixture.interaction.observe_composer("%control-error", "");
        let msg = message("pij-control-error", "before\u{1b}after", None);
        let id = enqueue(&fixture, &msg).await;
        fixture
            .spine
            .script_latest_matching_error("scripted bounded lookup failure");

        let error = fixture
            .worker
            .drain_once()
            .await
            .expect_err("spine lookup failure is reported");
        assert!(
            error
                .to_string()
                .contains("scripted bounded lookup failure"),
            "{error}"
        );
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(fixture.queue.live_len(), 1, "body remains queued");
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("claim inbox immediately after lookup failure")
            .expect("control body must not wait for lease expiry");
        assert_eq!(claimed.0, id);
        assert_eq!(
            serde_json::from_str::<Msg>(&claimed.1.payload).expect("queued message"),
            msg
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "failed lookup cannot claim that a notice was shown"
        );
    }
    #[tokio::test]
    async fn control_pointer_timestamp_error_leaves_body_immediately_claimable() {
        fn failing_clock() -> pij_core::error::Result<u64> {
            Err(PijError::Adapter {
                adapter: "test/clock".to_string(),
                message: "scripted timestamp failure".to_string(),
            })
        }

        let mut fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        fixture.worker.clock = failing_clock;
        register(&fixture, seat("pij-control-clock", Some("%control-clock"))).await;
        fixture.interaction.observe_composer("%control-clock", "");
        let msg = message("pij-control-clock", "before\u{1b}after", None);
        let id = enqueue(&fixture, &msg).await;

        let error = fixture
            .worker
            .drain_once()
            .await
            .expect_err("timestamp failure is reported");
        assert!(
            error.to_string().contains("scripted timestamp failure"),
            "{error}"
        );
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "the explanation landed before timestamp construction"
        );
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "reader")
            .await
            .expect("claim inbox immediately after timestamp failure")
            .expect("control body must not wait for lease expiry");
        assert_eq!(claimed.0, id);
        assert_eq!(
            serde_json::from_str::<Msg>(&claimed.1.payload).expect("queued message"),
            msg
        );
    }

    #[tokio::test]
    async fn two_control_bodies_for_one_seat_each_receive_one_notice() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-control-pair", Some("%control-pair"))).await;
        fixture.interaction.observe_composer("%control-pair", "");
        let mut first = message("pij-control-pair", "first\u{1b}body", None);
        first.msg_id = "control-pair-first".to_string();
        let mut second = message("pij-control-pair", "second\u{7}body", None);
        second.msg_id = "control-pair-second".to_string();
        enqueue(&fixture, &first).await;
        enqueue(&fixture, &second).await;

        fixture
            .worker
            .drain_once()
            .await
            .expect("announce first body");
        fixture
            .worker
            .drain_once()
            .await
            .expect("announce second body");
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            2,
            "each queued message receives its own notice"
        );
        for msg in [&first, &second] {
            let event = fixture
                .event_bus
                .latest_matching_message(
                    &msg.to,
                    super::CONTROL_BODY_POINTER_EVENT_KIND,
                    &msg.msg_id,
                )
                .await
                .expect("query per-message notice")
                .expect("message has durable notice");
            let payload: serde_json::Value =
                serde_json::from_str(&event.payload).expect("notice payload");
            assert_eq!(payload["msg_id"], msg.msg_id);
        }

        fixture
            .worker
            .drain_once()
            .await
            .expect("suppress first repeat");
        fixture
            .worker
            .drain_once()
            .await
            .expect("suppress second repeat");
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            2,
            "per-message facts suppress repeats without cross-talk"
        );
    }

    #[tokio::test]
    async fn legacy_pointer_history_does_not_suppress_typed_body_delivery() {
        let fixture = fixture_with_limit(FakeTransport::unreachable(), FakeTmux::new(), 3);
        let recipient = SeatId::from("pij-legacy-pointer");
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
                    payload: serde_json::json!({
                        "msg_id": format!("legacy-{announcement}"),
                        "from": "pij-sender"
                    })
                    .to_string(),
                })
                .await
                .expect("historical pointer");
        }
        let msg = message(
            recipient.as_str(),
            "legacy history cannot hide this body",
            None,
        );
        enqueue(&fixture, &msg).await;

        fixture.worker.drain_once().await.expect("typed delivery");

        assert!(
            fixture.tmux.calls().iter().any(|call| call
                == "submit:%legacy:[pij-rs from pij-sender]\nlegacy history cannot hide this body\n[/pij]"),
            "retired pointer history must not suppress full-body delivery: {:?}",
            fixture.tmux.calls()
        );
        assert_eq!(fixture.queue.live_len(), 0);
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
    async fn one_pass_delivers_at_most_one_body_for_each_recipient() {
        let fixture = fixture(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-batch", Some("%15"))).await;
        fixture.interaction.observe_composer("%15", "");
        let first = message("pij-batch", "first", None);
        let mut second = message("pij-batch", "second", None);
        second.msg_id = "m-pij-batch-2".to_string();
        enqueue(&fixture, &first).await;
        let second_id = enqueue(&fixture, &second).await;

        assert_eq!(fixture.worker.drain_once().await.expect("one pass"), 1);
        assert_eq!(fixture.queue.attempts(second_id), 0);
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "the second body waits for the next pass"
        );
        assert_eq!(
            fixture
                .tmux
                .calls()
                .iter()
                .filter(|call| call.starts_with("submit:"))
                .count(),
            1,
            "recipient suppression remains one delivery per pass"
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .any(|call| call.contains("\nfirst\n[/pij]")),
            "queue order remains first-in first-out"
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
            assert!(
                fixture.transport.delivered().is_empty(),
                "{label}: capability may be read, but no socket delivery occurs"
            );
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
    async fn recognized_draft_retries_once_then_delivers_on_the_next_blank_capture() {
        let pane = "%typing-clears";
        let tmux = FakeTmux::new()
            .with_pane(Pane {
                id: pane.to_string(),
                session: "s".to_string(),
                window: "w".to_string(),
                title: "t".to_string(),
                cursor_x: Some(11),
                cursor_y: Some(0),
            })
            .with_attached_tap(pane)
            .script_capture("╰──── hello ─╯")
            .script_capture("╰────       ─╯");
        let fixture = fixture_unarranged(FakeTransport::reachable(), tmux);
        let mut recipient = seat("pij-typing-clears", Some(pane));
        recipient.harness = Harness::Claude;
        register(&fixture, recipient).await;
        let msg = message("pij-typing-clears", "deliver after clear", None);
        let id = enqueue(&fixture, &msg).await;

        // This remains a behavioural retry assertion: only the evidence that
        // creates the veto changed from tmux mode to real composer content.
        assert_eq!(fixture.worker.drain_once().await.expect("draft tick"), 1);
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert!(fixture.transport.delivered().is_empty());

        assert_eq!(fixture.worker.drain_once().await.expect("blank tick"), 1);
        assert_eq!(fixture.transport.delivered(), [msg]);
        assert_eq!(fixture.queue.live_len(), 0);
        assert_eq!(fixture.worker.drain_once().await.expect("deduped tick"), 0);
        assert_eq!(fixture.transport.delivered().len(), 1);
    }

    #[tokio::test]
    async fn tap_unowned_body_delivers_on_the_next_tick_after_tap_claim() {
        let pane = "%tap-claimed";
        let fixture = fixture_unarranged(FakeTransport::unreachable(), FakeTmux::new());
        register(&fixture, seat("pij-tap-claimed", Some(pane))).await;
        let msg = message("pij-tap-claimed", "deliver after tap claim", None);
        let id = enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("unowned tick"), 1);
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(fixture.queue.live_len(), 1);

        fixture.tmux.arrange_clear_composer(pane);
        fixture.interaction.observe_composer(pane, "");
        assert_eq!(fixture.worker.drain_once().await.expect("owned tick"), 1);
        assert_eq!(fixture.queue.live_len(), 0);
        let submitted = format!(
            "submit:{pane}:{}",
            frame_message(&msg.from, None, &msg.body)
        );
        assert!(fixture.tmux.calls().iter().any(|call| call == &submitted));
        assert_eq!(fixture.worker.drain_once().await.expect("deduped tick"), 0);
    }
    #[tokio::test]
    async fn expired_nonempty_composer_still_retries_typed_body() {
        let idle = Duration::from_millis(30);
        let pane = "%typed-draft";
        let tmux = FakeTmux::new()
            .with_pane(Pane {
                id: pane.to_string(),
                session: "s".to_string(),
                window: "w".to_string(),
                title: "t".to_string(),
                cursor_x: Some(11),
                cursor_y: Some(0),
            })
            .with_standing_capture(
                "\u{2570}\u{2500}\u{2500}\u{2500}\u{2500} hello \u{2500}\u{256f}",
            );
        let fixture = fixture_inner_with_idle(FakeTransport::unreachable(), tmux, 3, false, idle);
        register(&fixture, seat("pij-typed-draft", Some(pane))).await;
        fixture.interaction.observe_composer(pane, "");
        let id = enqueue(
            &fixture,
            &message("pij-typed-draft", "must not splice", None),
        )
        .await;

        assert_eq!(fixture.worker.drain_once().await.expect("fresh draft"), 1);
        fixture.queue.advance(retry_delay(0));
        tokio::time::sleep(idle * 3).await;
        assert_eq!(fixture.worker.drain_once().await.expect("stale draft"), 1);

        assert_eq!(fixture.queue.retried().len(), 2);
        assert_eq!(fixture.queue.live_len(), 1);
        assert_eq!(fixture.queue.attempts(id), 2);
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "policy expiry may permit sockets but must not type into non-empty composer"
        );
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
        // A recognized blank composer is authoritative under u3, so socket
        // delivery does not consult tmux mode after the fresh capture.
        assert_eq!(
            fixture.tmux.calls(),
            [
                "list_panes",
                "pane_tap_sink:%10",
                "drain_pane_tap:%10",
                "list_panes",
                "capture:%10:4294967295"
            ]
        );
    }

    #[tokio::test]
    async fn unbound_recipient_defers_command_even_when_pane_is_ready() {
        let fixture = fixture(FakeTransport::reachable(), FakeTmux::new());
        let mut recipient = seat("pij-command-prebind", Some("%prebind"));
        recipient.proc = None;
        register(&fixture, recipient).await;
        let id = enqueue(
            &fixture,
            &message("pij-command-prebind", "", Some("compact")),
        )
        .await;

        assert_eq!(fixture.worker.drain_once().await.expect("prebind drain"), 1);
        assert_eq!(fixture.queue.retried(), [(id, Duration::from_secs(1))]);
        assert!(fixture.queue.acked().is_empty());
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "a prebind command cannot be typed before registration"
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
        tmux.arrange_pane("%11");
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

        async fn peek(&self, kinds: &[String]) -> pij_core::error::Result<Option<(JobId, Job)>> {
            self.inner.peek(kinds).await
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
            tmux.arrange_clear_composer(pane);
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
        while queue.ack_calls.load(Ordering::SeqCst) < 2 {
            queue.ack_called.notified().await;
        }
        // PLAN 117 CHANGED WHEN, NOT WHETHER. This used to assert 1 here and 2
        // after a SECOND tick, because a failing recipient ended the pass and
        // the next message waited for the next tick. That tick-granularity was
        // the head-of-line block in miniature — harmless with two messages a
        // second apart, fatal on the live fleet where the failing recipient was
        // never going to succeed, so "the next tick" never came for anybody.
        // The claim in the test's name is unchanged and better met: the next
        // item IS processed after one dependency error, now in the same pass.
        assert_eq!(
            queue.ack_calls.load(Ordering::SeqCst),
            2,
            "one dependency error must not defer the next recipient to a later tick"
        );

        // AND THE LOOP STILL SURVIVES THE ERROR — the property this test was
        // written for (review F2), which must NOT be lost to the change above.
        // `drain_once` still RETURNS the failure (it is deferred, not
        // swallowed), so a TickLoop that terminated on Err would be dead by now.
        // A THIRD message, enqueued after the failing pass, is the witness: it
        // can only be delivered by a loop that is still ticking. Without this,
        // the change above would have quietly deleted F2's coverage — the guard
        // still present, no longer load-bearing.
        registry
            .put(seat("pij-after-error", Some("%23")))
            .await
            .expect("register recipient");
        tmux.arrange_clear_composer("%23");
        interaction.observe_composer("%23", "");
        let later = message("pij-after-error", "after the failure", None);
        queue
            .enqueue(Job {
                kind: delivery_kind(&later.to),
                serial_key: later.to.0.clone(),
                payload: serde_json::to_string(&later).expect("message json"),
                dedupe_key: later.msg_id.clone(),
                attempt: 0,
            })
            .await
            .expect("enqueue after the failing pass");
        tokio::time::advance(Duration::from_secs(1)).await;
        while queue.ack_calls.load(Ordering::SeqCst) < 3 {
            queue.ack_called.notified().await;
        }
        assert!(
            transport
                .delivered()
                .iter()
                .any(|msg| msg.to == SeatId::from("pij-after-error")),
            "the tick loop must still be running after drain_once returned the deferred error"
        );
        assert_eq!(
            transport
                .delivered()
                .iter()
                .map(|msg| msg.to.0.as_str())
                .take(2)
                .collect::<Vec<_>>(),
            ["pij-first", "pij-next"],
            "both recipients are served, in queue order, from the pass that met the error"
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
    #[tokio::test]
    async fn pane_inventory_failure_is_deferred_while_recipient_work_continues() {
        let fixture = fixture(
            FakeTransport::reachable(),
            FakeTmux::new().with_list_pane_failures(1),
        );
        register(&fixture, seat("pij-first-live", Some("%70"))).await;
        register(&fixture, seat("pij-second-live", Some("%71"))).await;
        enqueue(&fixture, &message("pij-first-live", "first survives", None)).await;
        enqueue(
            &fixture,
            &message("pij-second-live", "second survives", None),
        )
        .await;

        let error = fixture
            .worker
            .drain_once()
            .await
            .expect_err("the systemic inventory error remains visible");
        assert!(error.to_string().contains("scripted list-panes failure"));
        let delivered = fixture.transport.delivered();
        assert_eq!(delivered.len(), 2, "inventory failure cannot halt the pass");
        assert!(
            delivered
                .iter()
                .any(|msg| msg.to == SeatId::from("pij-first-live"))
        );
        assert!(
            delivered
                .iter()
                .any(|msg| msg.to == SeatId::from("pij-second-live"))
        );
    }

    /// ONE DEAD RECIPIENT MUST NOT STARVE EVERY OTHER RECIPIENT (plan 117).
    ///
    /// Production found a vanished pane reclaimed every five seconds while
    /// later recipients stayed at attempt zero for twenty-nine hours. A
    /// successful all-server inventory now makes that recipient terminal; this
    /// test proves the live recipient behind it is delivered in the same pass.
    /// `pane_inventory_failure_is_deferred_while_recipient_work_continues`
    /// separately guards the systemic tmux-error path and its visible return.
    #[tokio::test]
    async fn a_recipient_whose_pane_has_vanished_does_not_starve_the_queue_behind_it() {
        let fixture = fixture(
            FakeTransport::reachable(),
            FakeTmux::new().with_vanished_pane("%1861"),
        );
        // The dead seat is registered FIRST so its job takes the lower id and is
        // claimed first — head-of-line is the whole subject, and a test whose
        // ordering is incidental would pass for the wrong reason.
        register(&fixture, seat("pij-mammoth-ostrich", Some("%1861"))).await;
        register(&fixture, seat("pij-live-recipient", Some("%2129"))).await;
        fixture.interaction.observe_composer("%2129", "   ");
        enqueue(
            &fixture,
            &message("pij-mammoth-ostrich", "never lands", None),
        )
        .await;
        let alive = message("pij-live-recipient", "must land anyway", None);
        enqueue(&fixture, &alive).await;

        // The pass MAY report the dead recipient's failure. It may not swallow
        // the live one's message.
        let _ = fixture.worker.drain_once().await;

        assert!(
            fixture
                .transport
                .delivered()
                .iter()
                .any(|msg| msg.to == SeatId::from("pij-live-recipient")
                    && msg.body == "must land anyway"),
            "a recipient whose pane vanished must not end the pass: the message \
             queued behind it was never even claimed. delivered = {:?}",
            fixture.transport.delivered()
        );
    }
    /// A pane absent from tmux is a terminal recipient fact, not a transient
    /// capture failure. This is POLICY: removing the check changes failed to
    /// retrying, rather than merely making delivery more conservative.
    #[tokio::test]
    async fn a_missing_pane_terminalizes_its_queued_delivery_with_named_reason() {
        let fixture = fixture_unarranged(
            FakeTransport::unreachable(),
            FakeTmux::new().with_vanished_pane("%1861"),
        );
        fixture
            .registry
            .put(seat("pij-vanished", Some("%1861")))
            .await
            .expect("register missing pane");
        let mut ids = Vec::new();
        for ordinal in 0..3 {
            let mut msg = message("pij-vanished", "never lands", None);
            msg.msg_id = format!("m-vanished-{ordinal}");
            ids.push(enqueue(&fixture, &msg).await);
        }

        assert_eq!(
            fixture.worker.drain_once().await.expect("terminal drain"),
            3
        );
        assert!(
            fixture.queue.retried().is_empty(),
            "a missing pane is not retried"
        );
        let acked = fixture.queue.acked();
        assert_eq!(acked.len(), 3, "one cadence terminalizes every dead row");
        for ((acked_id, outcome), expected_id) in acked.iter().zip(ids) {
            assert_eq!(*acked_id, expected_id);
            let Outcome::Failed { reason } = outcome else {
                panic!("missing pane must leave a named failed outcome: {outcome:?}");
            };
            assert!(reason.contains("pij-vanished"), "{reason}");
            assert!(reason.contains("%1861"), "{reason}");
            assert!(reason.contains("not retried"), "{reason}");
        }
        assert_eq!(fixture.queue.live_len(), 0);
    }

    #[tokio::test]
    async fn missing_pane_with_reachable_socket_delivers_instead_of_terminalizing() {
        let fixture = fixture_unarranged(
            FakeTransport::reachable(),
            FakeTmux::new().with_vanished_pane("%socket"),
        );
        fixture
            .registry
            .put(seat("pij-socket-only", Some("%socket")))
            .await
            .expect("register socket-only seat");
        let msg = message("pij-socket-only", "socket still answers", None);
        enqueue(&fixture, &msg).await;

        assert_eq!(fixture.worker.drain_once().await.expect("socket drain"), 1);
        assert_eq!(fixture.transport.delivered(), [msg]);
        assert!(fixture.queue.retried().is_empty());
        assert!(matches!(
            fixture.queue.acked().as_slice(),
            [(_, Outcome::Done)]
        ));
    }

    #[tokio::test]
    async fn unknown_socket_reachability_retries_and_surfaces_the_error() {
        let fixture = fixture_unarranged(
            FakeTransport::unreachable().script_reachability_error(),
            FakeTmux::new().with_vanished_pane("%unknown-socket"),
        );
        fixture
            .registry
            .put(seat("pij-socket-unknown", Some("%unknown-socket")))
            .await
            .expect("register unknown socket seat");
        let id = enqueue(
            &fixture,
            &message("pij-socket-unknown", "must not be lost", None),
        )
        .await;

        let error = fixture
            .worker
            .drain_once()
            .await
            .expect_err("unknown reachability remains visible");
        assert!(error.to_string().contains("scripted reachability failure"));
        assert_eq!(fixture.queue.retried(), [(id, Duration::ZERO)]);
        assert_eq!(fixture.queue.live_len(), 1);
        assert!(fixture.queue.acked().is_empty());
    }

    #[tokio::test]
    async fn a_tombstoned_recipient_terminalizes_its_pending_delivery() {
        let fixture = fixture_unarranged(FakeTransport::reachable(), FakeTmux::new());
        let mut recipient = seat("pij-tombstoned", None);
        recipient.tombstoned_at = Some(1_788_333_000_000);
        recipient.tombstone_reason = Some("reviewer closed after verdict".to_string());
        register(&fixture, recipient).await;
        let id = enqueue(&fixture, &message("pij-tombstoned", "cannot arrive", None)).await;

        assert_eq!(
            fixture.worker.drain_once().await.expect("terminal drain"),
            1
        );
        assert!(fixture.queue.retried().is_empty());
        let acked = fixture.queue.acked();
        let [(acked_id, Outcome::Failed { reason })] = acked.as_slice() else {
            panic!("tombstone must leave one named failed outcome: {acked:?}");
        };
        assert_eq!(*acked_id, id);
        assert!(reason.contains("pij-tombstoned"), "{reason}");
        assert!(reason.contains("tombstoned"), "{reason}");
        assert_eq!(fixture.queue.live_len(), 0);
    }

    /// A recipient we could not OBSERVE backs off; one the worker merely
    /// declined to inject into stays immediate (plan 117).
    ///
    /// `release_body` is `retry(job, Duration::ZERO)` and it served both, so a
    /// recipient whose pane had vanished was retried as fast as the drain could
    /// tick: `pij-mammoth-ostrich` reached attempt 20,168 against `%1861`, one
    /// failed `tmux capture-pane` every five seconds for a pane that was never
    /// coming back. The starvation fix drains the queue past it; it does not
    /// stop the spin, and an invisible spin is worse than a fatal one because it
    /// is noise in the place a real signal would appear.
    ///
    /// THE TEST ASSERTS THE DISTINCTION, NOT MERELY THE BACKOFF. Putting every
    /// release on the curve would pass a one-armed test and delay every polite
    /// retry on the fleet — the opposite mistake, and one nobody would notice
    /// for weeks. The vetoed arm is what makes the failing arm mean anything.
    ///
    /// The scope of "could not observe" is held by a THIRD test rather than
    /// this one: `pending_pointer_fact_retries_without_resubmitting_experienced_line`
    /// claims the body as a READER immediately after a spine failure, and it
    /// caught the first version of this change, which backed off every error
    /// path and would have made a worker-side fault delay the recipient's own
    /// `pij inbox` — removing the fallback that exists for when push is broken.
    #[tokio::test]
    async fn an_unobservable_recipient_backs_off_while_a_vetoed_one_stays_immediate() {
        // UNOBSERVABLE: the pane is gone, so the capture ERRORS.
        let vanished = fixture(
            FakeTransport::reachable(),
            FakeTmux::new().with_vanished_pane("%1861"),
        );
        register(&vanished, seat("pij-vanished", Some("%1861"))).await;
        enqueue(&vanished, &message("pij-vanished", "never lands", None)).await;
        let _ = vanished.worker.drain_once().await;
        let delays: Vec<Duration> = vanished
            .queue
            .retried()
            .into_iter()
            .map(|(_, delay)| delay)
            .collect();
        assert_eq!(
            delays,
            [retry_delay(0)],
            "a release forced by a recipient we could not observe must go on the \
             shared backoff curve"
        );
        assert!(
            delays[0] > Duration::ZERO,
            "the curve's first step must not be zero, or the backoff is decorative"
        );

        // VETOED: the pane captures fine, the gate simply says no. Unchanged —
        // the worker chose this release, and the next tick may find a different
        // world.
        let vetoed = fixture_unarranged(FakeTransport::reachable(), FakeTmux::new());
        register(&vetoed, seat("pij-vetoed", Some("%77"))).await;
        enqueue(&vetoed, &message("pij-vetoed", "waits politely", None)).await;
        let _ = vetoed.worker.drain_once().await;
        assert_eq!(
            vetoed
                .queue
                .retried()
                .into_iter()
                .map(|(_, delay)| delay)
                .collect::<Vec<_>>(),
            [Duration::ZERO],
            "a release the worker CHOSE must stay immediately claimable"
        );
    }
}
