use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::delivery::{DeliveryRung, delivery_kind, select_rung};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Event, Job, JobId, Msg, Outcome, SeatId, SemanticState,
};
use pij_core::ports::{Queue, Registry, SeatFilter, TmuxPort, Transport};
use pij_harnesses::InteractionGate;
use serde::Serialize;
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_stream::StreamExt;

use crate::events::{EventBus, Subscription};

use super::{POINTER_ANNOUNCED_EVENT_KIND, render_pointer, retry_delay, submit_command};

const WORKER_ID: &str = "pointer-drain";
type Clock = dyn Fn() -> Result<u64> + Send + Sync;

struct CadenceState {
    live: Subscription,
    last_announced_at: BTreeMap<SeatId, u64>,
}

/// One delivery-queue drain pass below the socket transport.
///
/// The worker claims only pane-bound recipients, so paneless pull consumers keep
/// ownership of their own rows. A failed command uses durable exponential
/// backoff. A body is always released with zero delay: pointer cadence may delay
/// the announcer, but it must never delay the reader the pointer directs to the
/// inbox.
///
/// Pointer cadence is deliberately process-local residue. It records that THIS
/// PROCESS announced, not that the seat was told. A fresh worker subscribes only
/// to future pointer events and may therefore repeat one still-true pointer after
/// restart; avoiding that harmless line would require an otherwise-unneeded
/// latest-event port or descriptor field.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, import `pij_daemon::pointer::DrainWorker`,
/// construct one from the composed registry, queue, transport, tmux,
/// `InteractionGate`, event bus, and `pointer_announce_cadence_secs`, then call
/// `drain_once` from the injected delivery cadence. Leave the interaction gate
/// unobserved until wave 5's `u-tap` pane observer exists: unknown is a
/// conservative veto, so the shipped pointer rung remains inert rather than
/// discarding the human-typing policy.
pub struct DrainWorker {
    registry: Arc<dyn Registry>,
    queue: Arc<dyn Queue>,
    transport: Arc<dyn Transport>,
    tmux: Arc<dyn TmuxPort>,
    interaction: Arc<InteractionGate>,
    event_bus: Arc<EventBus>,
    pointer_cadence: Duration,
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
        pointer_cadence: Duration,
    ) -> Result<Self> {
        if pointer_cadence.is_zero() {
            return Err(PijError::Adapter {
                adapter: "daemon/pointer".to_string(),
                message: "pointer_announce_cadence_secs must be greater than zero".to_string(),
            });
        }
        let live = event_bus.subscribe_live(EventFilter::kinds([POINTER_ANNOUNCED_EVENT_KIND]));
        Ok(Self {
            registry,
            queue,
            transport,
            tmux,
            interaction,
            event_bus,
            pointer_cadence,
            cadence: Mutex::new(CadenceState {
                live,
                last_announced_at: BTreeMap::new(),
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
        self.refresh_cadence().await;
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

        let permits = match self.interaction.permits_injection(pane).await {
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
                    self.queue.ack_delivery(job_id, origin).await
                }
                Ok(DeliveryOutcome::Queued | DeliveryOutcome::Held { .. }) => {
                    self.release_body(job_id).await
                }
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
    }

    async fn announce_pointer(&self, job_id: JobId, pane: &str, msg: &Msg) -> Result<()> {
        let at = match (self.clock)() {
            Ok(at) => at,
            Err(error) => {
                self.release_body(job_id).await?;
                return Err(error);
            }
        };
        if !self.pointer_due(&msg.to, at).await {
            return self.release_body(job_id).await;
        }

        let payload = match serde_json::to_string(&PointerEvent {
            msg_id: &msg.msg_id,
            from: &msg.from,
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
        let pointer = render_pointer(&msg.from, msg.from_machine.as_deref());
        if let Err(error) = self.tmux.submit(pane, &pointer).await {
            self.release_body(job_id).await?;
            return Err(error);
        }

        if let Err(error) = self
            .event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at,
                kind: POINTER_ANNOUNCED_EVENT_KIND.to_string(),
                seat: Some(msg.to.clone()),
                payload,
            })
            .await
        {
            self.release_body(job_id).await?;
            return Err(error);
        }
        self.cadence
            .lock()
            .await
            .last_announced_at
            .insert(msg.to.clone(), at);
        self.release_body(job_id).await
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

    async fn fail_claim(&self, job_id: JobId, reason: String) -> Result<()> {
        self.queue.ack(job_id, Outcome::Failed { reason }).await
    }

    async fn pointer_due(&self, seat: &SeatId, now: u64) -> bool {
        let cadence_ms = u64::try_from(self.pointer_cadence.as_millis()).unwrap_or(u64::MAX);
        self.cadence
            .lock()
            .await
            .last_announced_at
            .get(seat)
            .is_none_or(|last| now.saturating_sub(*last) >= cadence_ms)
    }

    async fn refresh_cadence(&self) {
        let mut cadence = self.cadence.lock().await;
        loop {
            let next = timeout(Duration::ZERO, cadence.live.next()).await;
            let Ok(Some(event)) = next else {
                break;
            };
            if let Some(seat) = event.seat {
                cadence.last_announced_at.insert(seat, event.at);
            }
        }
    }
}

#[derive(Serialize)]
struct PointerEvent<'a> {
    msg_id: &'a str,
    from: &'a SeatId,
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
    use pij_core::delivery::delivery_kind;
    use pij_core::model::{
        DeliveryOrigin, Harness, Job, JobId, Msg, Outcome, ProcIdentity, SeatDescriptor, SeatId,
        Seq,
    };
    use pij_core::ports::{DeliveryEnqueue, Queue, Registry, Spine, TmuxPort, Transport};
    use pij_harnesses::InteractionGate;
    use pij_store::SqliteQueue;
    use pij_testkit::FreshStore;
    use pij_testkit::fakes::{FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport};
    use serde_json::Value;
    use tokio::sync::Notify;

    use super::{DrainWorker, EventBus};

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
    }

    fn fixture(transport: FakeTransport, tmux: FakeTmux) -> Fixture {
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
            CADENCE,
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
            ["user_typing:%7", "submit:%7:/compact"]
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
            serde_json::json!({"msg_id":"m-pij-body","from":"pij-sender"})
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
            CADENCE,
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
    async fn fresh_worker_may_repeat_one_true_pointer_after_restart() {
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
            CADENCE,
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
            2,
            "restart may repeat one pointer because the statement is still true; cadence is process residue, not durable delivery state"
        );
    }

    #[tokio::test]
    async fn unknown_or_human_typing_gate_releases_body_without_delivery() {
        for (label, tmux, observe) in [
            ("unknown", FakeTmux::new(), false),
            ("human", FakeTmux::new().with_user_typing(), true),
        ] {
            let fixture = fixture(FakeTransport::reachable(), tmux);
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
        assert_eq!(fixture.tmux.calls(), ["user_typing:%10"]);
    }

    #[tokio::test]
    async fn failed_command_uses_durable_attempt_backoff() {
        let fixture = fixture(FakeTransport::reachable(), FakeTmux::new());
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
            CADENCE,
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
        ) -> pij_core::error::Result<()> {
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
                CADENCE,
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

        let loop_ = crate::start_resilient_delivery_drain(worker, Duration::from_secs(1))
            .expect("start production drain wrapper");
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
}
