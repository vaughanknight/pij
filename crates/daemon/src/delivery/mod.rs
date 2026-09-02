//! Runtime message delivery over the frozen registry, queue, transport, and spine ports.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::delivery::{
    DeliveryDeferralReason, DeliveryRoute, DeliveryRung, MAX_TYPED_FRAME_BYTES, QueueReason,
    delivery_kind, route, select_rung,
};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::framing::frame_message;
use pij_core::model::{
    DeliveryOrigin, DeliveryOutcome, Event, Job, JobId, Msg, Outcome, Receipt, SeatDescriptor,
    SeatId,
};
use pij_core::ports::{DeliveryAck, DeliveryEnqueue, Queue, Registry, Transport};
use pij_harnesses::{InteractionGate, StagedSubmission};
use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

use crate::events::EventBus;
use crate::pointer::{POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND};

const OUTCOME_EVENT_KIND: &str = "delivery.outcome";
/// The event a RECIPIENT watches for to learn it has been spoken to.
///
/// Distinct from `delivery.outcome`, which is what the SENDER watches to learn
/// what happened to its message. Two audiences, two facts, two kinds: u-extension
/// found that nothing published this at all, so a client could observe that a
/// message had been delivered to it without ever being able to read it.
const PUSHED_EVENT_KIND: &str = "message.pushed";

/// One claimed inbox row. The client must acknowledge `job_id` only after it
/// has received and decoded `message`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InboxClaim {
    /// Queue identity used by the explicit acknowledgement step.
    pub job_id: JobId,
    /// Message body claimed for the recipient.
    pub message: Msg,
}

type Clock = dyn Fn() -> Result<u64> + Send + Sync;

struct DeliverySources {
    id_prefix: u64,
    clock: Arc<Clock>,
    retry_interval_ms: u64,
}

/// Routes messages immediately when possible and durably queues temporary failures.
///
/// A `Queued` receipt is created only after [`Queue::enqueue`] succeeds. Every
/// successful route then publishes a `delivery.outcome` event containing the
/// message id, outcome, and transport name; the event bus is the audit log.
///
/// # Composition recipe
///
/// Construct one `Arc<InteractionGate>` from the composed tmux port before
/// `DeliveryService`, pass the same instance to this service and `DrainWorker`,
/// and feed it from `PaneObserver`. The gate owns staged pane transactions;
/// socket delivery retains its existing permission-only policy.
pub struct DeliveryService {
    registry: Arc<dyn Registry>,
    queue: Arc<dyn Queue>,
    transport: Arc<dyn Transport>,
    interaction: Arc<InteractionGate>,
    event_bus: Arc<EventBus>,
    id_prefix: u64,
    next_id: AtomicU64,
    clock: Arc<Clock>,
    retry_interval_ms: u64,
}

impl DeliveryService {
    /// Build a delivery service with an operating-system-random message-id prefix.
    ///
    /// # Errors
    /// [`PijError::Adapter`] when the operating system cannot provide randomness.
    pub fn new(
        registry: Arc<dyn Registry>,
        queue: Arc<dyn Queue>,
        transport: Arc<dyn Transport>,
        interaction: Arc<InteractionGate>,
        event_bus: Arc<EventBus>,
        retry_interval: Duration,
    ) -> Result<Self> {
        let mut prefix = [0_u8; 8];
        getrandom::fill(&mut prefix).map_err(|error| PijError::Adapter {
            adapter: "daemon/delivery".to_string(),
            message: format!("could not create a message id: {error}"),
        })?;
        Ok(Self::with_sources(
            registry,
            queue,
            transport,
            interaction,
            event_bus,
            DeliverySources {
                id_prefix: u64::from_be_bytes(prefix),
                clock: Arc::new(system_time_ms),
                retry_interval_ms: u64::try_from(retry_interval.as_millis()).unwrap_or(u64::MAX),
            },
        ))
    }

    fn with_sources(
        registry: Arc<dyn Registry>,
        queue: Arc<dyn Queue>,
        transport: Arc<dyn Transport>,
        interaction: Arc<InteractionGate>,
        event_bus: Arc<EventBus>,
        sources: DeliverySources,
    ) -> Self {
        Self {
            registry,
            queue,
            transport,
            interaction,
            event_bus,
            id_prefix: sources.id_prefix,
            next_id: AtomicU64::new(0),
            clock: sources.clock,
            retry_interval_ms: sources.retry_interval_ms,
        }
    }

    fn queued_outcome(
        &self,
        recipient: &SeatDescriptor,
        reason: Option<&str>,
        at: u64,
    ) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: reason.map(str::to_string),
            next_retry_at: recipient
                .pane
                .as_ref()
                .map(|_| at.saturating_add(self.retry_interval_ms)),
        }
    }

    /// Send one message and report what actually happened.
    ///
    /// # Errors
    /// Missing, self-addressed, or tombstoned seats; adapter failures; queue
    /// persistence failures; and audit-event publication failures.
    pub async fn send(&self, from: SeatId, to: SeatId, body: impl Into<String>) -> Result<Receipt> {
        self.accept(Msg {
            from,
            to,
            body: body.into(),
            msg_id: self.next_message_id(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        })
        .await
    }

    /// Deliver a message whose id the CALLER chose.
    ///
    /// The wire lets a client supply `msg_id` because it is the queue's dedupe
    /// key and the correlation handle a reply carries back as `in_reply_to` — a
    /// caller that cannot name its own message cannot join the answer to it.
    /// [`Self::send`] is this with a generated id.
    ///
    /// # Errors
    /// Missing, self-addressed, or tombstoned seats; adapter failures; queue
    /// persistence failures; and audit-event publication failures.
    pub async fn accept(&self, msg: Msg) -> Result<Receipt> {
        self.arrive(msg, Arrival::Local).await
    }

    /// Accept a message FORWARDED from another machine.
    ///
    /// Same admission as [`Self::accept`] — the recipient must exist, must not be
    /// tombstoned, and self-addressing is still refused — but a new message is
    /// always enqueued rather than routed directly to a transport. A duplicate
    /// collapses onto its live row while pending or running. After delivery, the
    /// destination's bounded durable ledger suppresses it and replays the exact
    /// recorded [`DeliveryOrigin`] in the receipt.
    ///
    /// A separate entry point keeps registry, tombstone, and routing admission in
    /// one business path; HTTP never gains a bypass enqueue helper.
    ///
    /// # Errors
    /// Missing, self-addressed, or tombstoned seats; queue persistence failures;
    /// and audit-event publication failures.
    pub async fn accept_forwarded(&self, msg: Msg) -> Result<Receipt> {
        self.arrive(msg, Arrival::Forwarded).await
    }

    async fn arrive(&self, msg: Msg, arrival: Arrival) -> Result<Receipt> {
        let at = (self.clock)()?;
        let from = msg.from.clone();
        let to = msg.to.clone();
        let recipient = self
            .registry
            .get(&to)
            .await?
            .ok_or_else(|| PijError::NoRegistryEntry {
                seat: to.clone(),
                store: "the daemon registry".to_string(),
            })?;

        // Supplying `true` asks the pure policy only about registry facts. A
        // transport check is performed only when that policy says it matters.
        // Forwarded messages never reach the transport, but tombstones dominate.
        let selected = match arrival {
            Arrival::Local => route(&from, msg.from_machine.as_deref(), &recipient, true)?,
            Arrival::Forwarded => {
                match route(&from, msg.from_machine.as_deref(), &recipient, true)? {
                    DeliveryRoute::Tombstoned { reason } => DeliveryRoute::Tombstoned { reason },
                    _ => DeliveryRoute::Queue(QueueReason::Unreachable),
                }
            }
        };
        let mut publish_to_recipient = true;
        let outcome = match selected {
            DeliveryRoute::Tombstoned { reason } => {
                return Err(PijError::SeatIsGone {
                    seat: to,
                    tombstone_reason: reason,
                });
            }
            // EVERY arrival consults the ledger, not just forwarded ones. Review
            // found the fix had landed in one half (E-029, producer side): a LOCAL
            // send retried with the same caller-chosen msg_id after an ambiguous
            // failure re-delivered once the first copy was acked — the identical
            // window R4-AMEND-3 closes for forwards, in the same
            // (recipient, msg_id) namespace, with the same dedupe semantics.
            //
            // A duplicate is a duplicate. Where it entered from does not change
            // whether the recipient has already been given it.
            DeliveryRoute::Queue(reason) => {
                match self.queue.enqueue_delivery(delivery_job(&msg)?).await? {
                    DeliveryEnqueue::Queued(_) => {
                        self.queued_outcome(&recipient, Some(reason.as_str()), at)
                    }
                    DeliveryEnqueue::AlreadyDelivered(origin) => {
                        publish_to_recipient = false;
                        DeliveryOutcome::Delivered { origin }
                    }
                }
            }
            DeliveryRoute::Transport => {
                let socket_available = self.transport.can_deliver(&recipient, &msg).await?;
                // Socket delivery keeps the fresh permission policy. Pane-body
                // permission is checked once, after input ownership is acquired,
                // inside `submit_with_owned_input`.
                let (interaction_permits, composer_idle, interaction_reason) =
                    match recipient.pane.as_deref() {
                        None => (true, true, None),
                        Some(pane) if socket_available => {
                            let verdict = self.interaction.fresh_injection_verdict(pane).await?;
                            (verdict.permitted, verdict.composer_idle, verdict.reason)
                        }
                        Some(_) => (true, true, None),
                    };

                // Paneless socket consumers remain transport-owned. The rung
                // selector governs pane fallbacks and deliberately returns
                // `Observe` before consulting socket capability.
                let rung = if recipient.pane.is_none() && socket_available {
                    DeliveryRung::Socket
                } else {
                    select_rung(
                        &recipient,
                        &msg,
                        socket_available,
                        !interaction_permits,
                        composer_idle,
                    )
                };

                match rung {
                    DeliveryRung::Socket => {
                        // Claim before injecting. A retry after an ambiguous caller
                        // failure replays the recorded origin instead of delivering
                        // the same message twice.
                        match self
                            .queue
                            .note_delivered(&to, &msg.msg_id, DeliveryOrigin::InjectedToTransport)
                            .await?
                        {
                            Some(origin) => {
                                publish_to_recipient = false;
                                DeliveryOutcome::Delivered { origin }
                            }
                            None => match self.transport.deliver(&recipient, &msg).await {
                                Ok(DeliveryOutcome::Queued { reason, .. }) => {
                                    self.queue.forget_delivered(&to, &msg.msg_id).await?;
                                    self.enqueue(&msg).await?;
                                    self.queued_outcome(
                                        &recipient,
                                        reason.as_deref().or(Some("unreachable")),
                                        at,
                                    )
                                }
                                Ok(outcome) => outcome,
                                Err(error) => {
                                    self.queue.forget_delivered(&to, &msg.msg_id).await?;
                                    return Err(error);
                                }
                            },
                        }
                    }
                    DeliveryRung::TypedBody => {
                        let pane = recipient
                            .pane
                            .as_deref()
                            .expect("typed-body rung requires a pane");
                        let framed =
                            frame_message(&msg.from, msg.from_machine.as_deref(), &msg.body);
                        if framed.len() > MAX_TYPED_FRAME_BYTES {
                            match self.queue.enqueue_delivery(delivery_job(&msg)?).await? {
                                DeliveryEnqueue::Queued(_) => {
                                    self.queued_outcome(&recipient, Some("frame-too-large"), at)
                                }
                                DeliveryEnqueue::AlreadyDelivered(origin) => {
                                    publish_to_recipient = false;
                                    DeliveryOutcome::Delivered { origin }
                                }
                            }
                        } else {
                            match self
                                .queue
                                .note_delivered(&to, &msg.msg_id, DeliveryOrigin::TypedToPane)
                                .await?
                            {
                                Some(origin) => {
                                    publish_to_recipient = false;
                                    DeliveryOutcome::Delivered { origin }
                                }
                                None => match self
                                    .interaction
                                    .submit_with_owned_input(pane, &framed)
                                    .await
                                {
                                    Ok(StagedSubmission::Submitted) => DeliveryOutcome::Delivered {
                                        origin: DeliveryOrigin::TypedToPane,
                                    },
                                    Ok(StagedSubmission::Deferred { reason }) => {
                                        self.queue.forget_delivered(&to, &msg.msg_id).await?;
                                        self.enqueue(&msg).await?;
                                        self.queued_outcome(&recipient, Some(reason.as_str()), at)
                                    }
                                    Err(error) => {
                                        self.queue.forget_delivered(&to, &msg.msg_id).await?;
                                        return Err(error);
                                    }
                                },
                            }
                        }
                    }
                    DeliveryRung::Observe
                    | DeliveryRung::Queue
                    | DeliveryRung::Pty
                    | DeliveryRung::ControlBodyPull => {
                        match self.queue.enqueue_delivery(delivery_job(&msg)?).await? {
                            DeliveryEnqueue::Queued(_) => {
                                let reason = interaction_reason
                                    .map(DeliveryDeferralReason::as_str)
                                    .or(match rung {
                                        DeliveryRung::Observe => Some("unreachable"),
                                        DeliveryRung::ControlBodyPull => Some("terminal-control"),
                                        _ => None,
                                    });
                                self.queued_outcome(&recipient, reason, at)
                            }
                            DeliveryEnqueue::AlreadyDelivered(origin) => {
                                publish_to_recipient = false;
                                DeliveryOutcome::Delivered { origin }
                            }
                        }
                    }
                }
            }
        };

        let receipt = Receipt {
            msg_id: msg.msg_id.clone(),
            outcome,
            at,
        };
        // A suppressed duplicate already published its recipient-facing turn on
        // first admission. Publishing it again would tell the recipient twice
        // about a message the durable ledger correctly delivers only once.
        if publish_to_recipient && let Err(error) = self.publish_pushed(&msg, at).await {
            return Err(PijError::DeliveryAuditFailed {
                msg_id: receipt.msg_id.clone(),
                outcome: outcome_name(&receipt.outcome).to_string(),
                audit_error: error.to_string(),
            });
        }
        if let Err(error) = self.publish_outcome(&msg.to, &receipt).await {
            return Err(PijError::DeliveryAuditFailed {
                msg_id: receipt.msg_id,
                outcome: outcome_name(&receipt.outcome).to_string(),
                audit_error: error.to_string(),
            });
        }
        Ok(receipt)
    }

    /// Claim at most one message currently queued for `seat` without recording
    /// delivery. The one-row bound is structural: every delivery for a seat uses
    /// that seat as its serial key, and the queue permits one running claim per
    /// serial key. The client acknowledges the returned job id in a separate
    /// request only after receiving and decoding it.
    ///
    /// When `wait` is true, attaches to future delivery events before the first
    /// claim, eliminating the empty-claim/attach race without replaying history.
    /// If a client receives a claim and dies before acknowledgement, claim expiry
    /// retries the delivery and the client may read it again. That residual
    /// duplicate read is deliberate: duplicate is safer than loss with a
    /// `ReaderRead` claim for an observation nobody made.
    ///
    /// # Errors
    /// Queue failures or a corrupt/misdirected delivery payload.
    pub async fn claim_inbox(&self, seat: &SeatId, wait: bool) -> Result<Vec<InboxClaim>> {
        let kind = delivery_kind(seat);
        let kinds = [kind];
        let mut wake = wait.then(|| {
            self.event_bus
                .subscribe_live(EventFilter::kinds([OUTCOME_EVENT_KIND]).for_seat(seat.clone()))
        });

        loop {
            if let Some((job_id, job)) = self.queue.claim(&kinds, seat.0.as_str()).await? {
                let message: Msg = match serde_json::from_str(&job.payload) {
                    Ok(message) => message,
                    Err(error) => {
                        let reason = format!("invalid delivery payload: {error}");
                        self.queue
                            .ack(
                                job_id,
                                Outcome::Failed {
                                    reason: reason.clone(),
                                },
                            )
                            .await?;
                        return Err(PijError::Adapter {
                            adapter: "daemon/delivery".to_string(),
                            message: reason,
                        });
                    }
                };
                if &message.to != seat {
                    let reason = format!(
                        "delivery kind {} contained message for {}",
                        kinds[0], message.to
                    );
                    self.queue
                        .ack(
                            job_id,
                            Outcome::Failed {
                                reason: reason.clone(),
                            },
                        )
                        .await?;
                    return Err(PijError::Adapter {
                        adapter: "daemon/delivery".to_string(),
                        message: reason,
                    });
                }
                // A READ is the only thing that un-parks a seat (wave-6 ruling):
                // a new msg_id must not let a sender mint their way past a cap
                // the human has not satisfied. Published here rather than at ack,
                // because the seat has now been GIVEN its message — the pointer's
                // job is done whether or not the client gets as far as acking.
                self.publish_pointer_unparked_if_parked(seat, 1).await?;
                return Ok(vec![InboxClaim { job_id, message }]);
            }
            if !wait {
                return Ok(Vec::new());
            }
            let Some(subscription) = wake.as_mut() else {
                return Ok(Vec::new());
            };
            if subscription.next().await.is_none() {
                return Ok(Vec::new());
            }
        }
    }

    /// Record `ReaderRead` and return the authority-owned job identity committed.
    ///
    /// # Errors
    /// Queue failures or an id that is not a running delivery claim.
    pub async fn acknowledge_inbox(&self, job_id: JobId) -> Result<DeliveryAck> {
        self.queue
            .ack_delivery(job_id, DeliveryOrigin::ReaderRead)
            .await
    }

    async fn publish_pointer_unparked_if_parked(
        &self,
        seat: &SeatId,
        messages: usize,
    ) -> Result<()> {
        let latest = self
            .event_bus
            .latest_matching(
                seat,
                &[POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND],
            )
            .await?;
        if latest.as_ref().map(|event| event.kind.as_str()) != Some(POINTER_PARKED_EVENT_KIND) {
            return Ok(());
        }
        let payload = serde_json::to_string(&PointerUnparkedEvent {
            reason: "reader-read",
            messages,
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/delivery".to_string(),
            message: format!("could not encode pointer unparked event for {seat}: {error}"),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: (self.clock)()?,
                kind: POINTER_UNPARKED_EVENT_KIND.to_string(),
                seat: Some(seat.clone()),
                payload,
            })
            .await?;
        Ok(())
    }

    fn next_message_id(&self) -> String {
        let sequence = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("{:016x}-{sequence:016x}", self.id_prefix)
    }

    async fn enqueue(&self, msg: &Msg) -> Result<()> {
        self.queue.enqueue(delivery_job(msg)?).await?;
        Ok(())
    }

    /// Publish the recipient-facing turn: `{msg_id, from, body}`, keyed to the
    /// RECIPIENT's seat so a client filters the one stream by its own id.
    async fn publish_pushed(&self, msg: &Msg, at: u64) -> Result<()> {
        let payload = serde_json::to_string(&PushedEvent {
            msg_id: &msg.msg_id,
            from: &msg.from,
            from_machine: msg.from_machine.as_deref(),
            body: &msg.body,
            in_reply_to: msg.in_reply_to.as_deref(),
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/delivery".to_string(),
            message: format!("could not encode pushed turn {}: {error}", msg.msg_id),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at,
                kind: PUSHED_EVENT_KIND.to_string(),
                seat: Some(msg.to.clone()),
                payload,
            })
            .await?;
        Ok(())
    }

    async fn publish_outcome(&self, seat: &SeatId, receipt: &Receipt) -> Result<()> {
        let transport = match &receipt.outcome {
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::TypedToPane,
            } => "tmux",
            _ => self.transport.name(),
        };
        let payload = serde_json::to_string(&OutcomeEvent {
            msg_id: &receipt.msg_id,
            outcome: &receipt.outcome,
            transport,
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/delivery".to_string(),
            message: format!("could not encode receipt {}: {error}", receipt.msg_id),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: receipt.at,
                kind: OUTCOME_EVENT_KIND.to_string(),
                seat: Some(seat.clone()),
                payload,
            })
            .await?;
        Ok(())
    }
}

fn delivery_job(msg: &Msg) -> Result<Job> {
    let payload = serde_json::to_string(msg).map_err(|error| PijError::Adapter {
        adapter: "daemon/delivery".to_string(),
        message: format!("could not encode message {}: {error}", msg.msg_id),
    })?;
    Ok(Job {
        kind: delivery_kind(&msg.to),
        serial_key: msg.to.0.clone(),
        payload,
        dedupe_key: msg.msg_id.clone(),
        attempt: 0,
    })
}

#[derive(Serialize)]
struct PushedEvent<'a> {
    msg_id: &'a str,
    from: &'a SeatId,
    /// The sender's machine, when it is not this one. Without it a recipient can
    /// see that a stranger spoke and cannot answer: the reply would route locally
    /// to a seat name that means someone else here (u-federation).
    #[serde(skip_serializing_if = "Option::is_none")]
    from_machine: Option<&'a str>,
    body: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    in_reply_to: Option<&'a str>,
}

#[derive(Serialize)]
struct OutcomeEvent<'a> {
    msg_id: &'a str,
    outcome: &'a DeliveryOutcome,
    transport: &'a str,
}

/// Where a message came from, which decides whether it may reach a transport.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Arrival {
    /// A client on this machine. Routed normally.
    Local,
    /// Forwarded by a peer daemon. New messages queue; live duplicates collapse,
    /// and delivered duplicates replay the destination's durable observation.
    Forwarded,
}

/// The audit word for an outcome — and for a delivery, the ORIGIN travels with
/// it (erratum-23b). An audit line that says only "delivered" re-creates the
/// ambiguity the origin exists to remove, so the two are never separated here.
fn outcome_name(outcome: &DeliveryOutcome) -> &'static str {
    match outcome {
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::TypedToPane,
        } => "delivered:typed-to-pane",
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::InjectedToTransport,
        } => "delivered:injected-to-transport",
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::VerifiedArrival,
        } => "delivered:verified-arrival",
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::ReaderRead,
        } => "delivered:reader-read",
        DeliveryOutcome::Queued { .. } => "queued",
        DeliveryOutcome::Held { .. } => "held",
        DeliveryOutcome::Refused { .. } => "refused",
    }
}

#[derive(Serialize)]
struct PointerUnparkedEvent {
    reason: &'static str,
    messages: usize,
}

fn system_time_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/delivery".to_string(),
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| PijError::Adapter {
        adapter: "daemon/delivery".to_string(),
        message: "system time does not fit in the event timestamp".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use pij_core::delivery::{MAX_TYPED_FRAME_BYTES, delivery_kind};
    use pij_core::error::PijError;
    use pij_core::events::EventFilter;
    use pij_core::framing::frame_message;
    use pij_core::model::Pane;
    use pij_core::model::{
        DeliveryOrigin, DeliveryOutcome, Event, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId,
        SemanticState, Seq, SystemState,
    };
    use pij_core::ports::{Queue, Registry, Spine, TmuxPort};
    use pij_harnesses::InteractionGate;
    use pij_testkit::fakes::{
        CountingSpine, FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport,
    };
    use serde_json::Value;
    use tokio_stream::StreamExt;

    use super::{
        DeliveryService, DeliverySources, OUTCOME_EVENT_KIND, PUSHED_EVENT_KIND, delivery_job,
    };
    use crate::events::EventBus;
    use crate::pointer::{POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND};

    const INBOX_CLAIM_WIRE: &str = include_str!("../../tests/fixtures/inbox-claim.wire.json");
    fn body_for_frame_size(from: &SeatId, bytes: usize) -> String {
        let overhead = frame_message(from, None, "").len();
        assert!(bytes >= overhead);
        "x".repeat(bytes - overhead)
    }

    struct Fixture {
        service: Arc<DeliveryService>,
        registry: Arc<FakeRegistry>,
        queue: Arc<FakeQueue>,
        spine: Arc<FakeSpine>,
        transport: Arc<FakeTransport>,
        interaction: Arc<InteractionGate>,
        tmux: Arc<FakeTmux>,
    }

    fn fixture(transport: FakeTransport) -> Fixture {
        fixture_with_gate(transport, FakeTmux::new())
    }

    #[tokio::test]
    async fn inbox_unpark_reads_one_bounded_latest_fact_not_the_whole_spine() {
        let registry = Arc::new(FakeRegistry::new());
        let recipient = SeatId::from("pij-bounded-reader");
        registry
            .put(SeatDescriptor::new(
                recipient.clone(),
                Harness::Omp,
                "/abs/tree",
            ))
            .await
            .expect("register reader");
        let queue = Arc::new(FakeQueue::new(1_024).expect("queue"));
        let spine = Arc::new(CountingSpine::failing_on_tail());
        let bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 16).expect("event bus"));
        for index in 0..1_000_u64 {
            bus.publish(Event {
                seq: None,
                v: 1,
                at: index,
                kind: "unrelated".to_string(),
                seat: Some(SeatId::from(format!("pij-other-{index}"))),
                payload: String::new(),
            })
            .await
            .expect("seed unrelated event");
        }
        bus.publish(Event {
            seq: None,
            v: 1,
            at: 1_001,
            kind: POINTER_PARKED_EVENT_KIND.to_string(),
            seat: Some(recipient.clone()),
            payload: serde_json::json!({"announcements":3,"reason":"announcement-limit"})
                .to_string(),
        })
        .await
        .expect("seed parked fact");
        let msg = Msg {
            from: SeatId::from("pij-sender"),
            to: recipient.clone(),
            body: "bounded read".to_string(),
            msg_id: "bounded-read-1".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };
        queue
            .enqueue(delivery_job(&msg).expect("delivery job"))
            .await
            .expect("enqueue mail");
        let transport = Arc::new(FakeTransport::unreachable());
        let tmux = Arc::new(FakeTmux::new());
        let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let service = DeliveryService::with_sources(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&queue) as Arc<dyn Queue>,
            transport,
            interaction,
            bus,
            DeliverySources {
                id_prefix: 1,
                clock: Arc::new(|| Ok(1_002)),
                retry_interval_ms: 1_000,
            },
        );

        let claims = service
            .claim_inbox(&recipient, false)
            .await
            .expect("bounded unpark lookup");
        assert_eq!(claims.len(), 1);
        assert_eq!(spine.latest_calls(), 1);
        assert_eq!(spine.tail_calls(), 0);
        assert!(
            spine
                .recorded_for(&recipient)
                .iter()
                .any(|event| event.kind == POINTER_UNPARKED_EVENT_KIND),
            "claim, without acknowledgement, visibly unparks"
        );
    }

    fn fixture_with_gate(transport: FakeTransport, tmux: FakeTmux) -> Fixture {
        fixture_with_gate_and_idle(transport, tmux, Duration::from_millis(60_000))
    }

    fn fixture_with_gate_and_idle(
        transport: FakeTransport,
        tmux: FakeTmux,
        idle: Duration,
    ) -> Fixture {
        let registry = Arc::new(FakeRegistry::new());
        let queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
        let spine = Arc::new(FakeSpine::new());
        let transport = Arc::new(transport);
        let tmux = Arc::new(tmux);
        let interaction = Arc::new(InteractionGate::with_idle_window(
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            idle,
        ));
        let bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 16).expect("event bus"));
        let service = Arc::new(DeliveryService::with_sources(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&queue) as Arc<dyn Queue>,
            Arc::clone(&transport) as Arc<dyn pij_core::ports::Transport>,
            Arc::clone(&interaction),
            bus,
            DeliverySources {
                id_prefix: 0xfeed,
                clock: Arc::new(|| Ok(1_234)),
                retry_interval_ms: 1_000,
            },
        ));
        Fixture {
            service,
            registry,
            queue,
            spine,
            transport,
            interaction,
            tmux,
        }
    }

    fn bound(id: &str) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new(id, Harness::Omp, "/abs/tree");
        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat
    }

    fn queued_outcome(reason: &str) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: Some(reason.to_string()),
            next_retry_at: Some(2_234),
        }
    }

    async fn register(fixture: &Fixture, seat: SeatDescriptor) {
        fixture.registry.put(seat).await.expect("register seat");
    }

    async fn assert_audit(fixture: &Fixture, seat: &SeatId, outcome: &str) {
        let events = fixture
            .spine
            .tail(Some(seat), Seq(0))
            .await
            .expect("tail audit");
        // TWO events per send, for two audiences: the recipient's turn and the
        // sender's verdict. The recipient's comes first, because a client that
        // learns it was spoken to must be able to read what was said.
        assert_eq!(events.len(), 2, "a pushed turn AND an outcome");

        assert_eq!(events[0].kind, PUSHED_EVENT_KIND);
        let pushed: Value = serde_json::from_str(&events[0].payload).expect("pushed json");
        assert_eq!(pushed["msg_id"], "000000000000feed-0000000000000000");
        assert_eq!(pushed["from"], "pij-from");

        assert_eq!(events[1].kind, OUTCOME_EVENT_KIND);
        let payload: Value = serde_json::from_str(&events[1].payload).expect("audit json");
        assert_eq!(payload["msg_id"], "000000000000feed-0000000000000000");
        assert_eq!(payload["outcome"]["outcome"], outcome);
        assert_eq!(payload["transport"], "fake");
    }

    fn queued_without_retry(reason: &str) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: Some(reason.to_string()),
            next_retry_at: None,
        }
    }

    #[tokio::test]
    async fn first_attempt_socket_delivery_obeys_the_same_politeness_gate_as_retries() {
        for (label, fixture, observe_clear, expected_reason) in [
            (
                "unknown",
                fixture(FakeTransport::reachable()),
                false,
                "tap-unowned",
            ),
            (
                "tmux typing",
                fixture_with_gate(
                    FakeTransport::reachable(),
                    FakeTmux::new()
                        .with_clear_composer("%108")
                        .with_attached_tap("%108")
                        .with_user_typing(),
                ),
                true,
                "human-typing",
            ),
        ] {
            let mut recipient = bound(&format!("pij-{label}"));
            recipient.pane = Some("%108".to_string());
            if observe_clear {
                fixture.interaction.observe_composer("%108", "   ");
            }
            register(&fixture, recipient.clone()).await;

            let receipt = fixture
                .service
                .send("pij-from".into(), recipient.id, "do not interrupt")
                .await
                .expect("a politeness veto queues durably");

            let wire = serde_json::to_value(&receipt.outcome).expect("queued outcome wire");
            assert_eq!(wire["reason"], expected_reason);
            assert_eq!(wire["next_retry_at"], 2_234);
            assert_eq!(
                receipt.outcome,
                DeliveryOutcome::Queued {
                    reason: Some(expected_reason.to_string()),
                    next_retry_at: Some(2_234),
                },
                "{label}"
            );
            assert!(fixture.transport.delivered().is_empty(), "{label}");
        }

        // The clear arm now has to be clear AT THE BOUNDARY, not merely at the
        // last observer tick: first-attempt delivery re-captures before it
        // authorizes. That is the whole behaviour change, so this arm arranges a
        // recognizable blank composer rather than only seeding the tick state.
        let clear = fixture_with_gate(
            FakeTransport::reachable(),
            FakeTmux::new().with_clear_composer("%108"),
        );
        clear.interaction.observe_composer("%108", "   ");
        let mut recipient = bound("pij-clear");
        recipient.pane = Some("%108".to_string());
        register(&clear, recipient.clone()).await;

        let receipt = clear
            .service
            .send("pij-from".into(), recipient.id, "safe to deliver")
            .await
            .expect("known-clear delivery");
        assert_eq!(
            receipt.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );
        assert_eq!(clear.transport.delivered().len(), 1);
    }

    #[tokio::test]
    async fn first_attempt_socketless_pane_types_the_full_shared_frame() {
        let fixture = fixture_with_gate(
            FakeTransport::unreachable(),
            FakeTmux::new().with_clear_composer("%typed"),
        );
        fixture.interaction.observe_composer("%typed", "");
        let mut recipient = bound("pij-typed");
        recipient.pane = Some("%typed".to_string());
        register(&fixture, recipient.clone()).await;

        let receipt = fixture
            .service
            .send("pij-from".into(), recipient.id.clone(), "complete body")
            .await
            .expect("socketless pane delivery");

        let receipt_json = serde_json::to_value(&receipt.outcome).expect("receipt json");
        assert_eq!(receipt_json["outcome"], "delivered");
        assert_eq!(receipt_json["origin"], "typed-to-pane");
        assert_eq!(
            fixture.queue.live_len(),
            0,
            "typed delivery consumes no inbox row"
        );
        assert!(
            fixture.transport.delivered().is_empty(),
            "socket was unavailable"
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .any(|call| call == "submit:%typed:[pij-rs from pij-from]\ncomplete body\n[/pij]"),
            "the immediate path must submit the canonical full frame: {:?}",
            fixture.tmux.calls()
        );
        let events = fixture
            .spine
            .tail(Some(&recipient.id), Seq(0))
            .await
            .expect("typed audit events");
        let outcome = events
            .iter()
            .find(|event| event.kind == OUTCOME_EVENT_KIND)
            .expect("typed outcome event");
        let outcome: Value = serde_json::from_str(&outcome.payload).expect("outcome json");
        assert_eq!(outcome["transport"], "tmux");
    }

    #[tokio::test]
    async fn oversized_direct_frame_queues_without_typed_delivery() {
        let fixture = fixture_with_gate(
            FakeTransport::unreachable(),
            FakeTmux::new().with_clear_composer("%oversize-direct"),
        );
        fixture.interaction.observe_composer("%oversize-direct", "");
        let mut recipient = bound("pij-oversize-direct");
        recipient.pane = Some("%oversize-direct".to_string());
        register(&fixture, recipient.clone()).await;
        let from = SeatId::from("pij-from");
        let body = body_for_frame_size(&from, MAX_TYPED_FRAME_BYTES + 1);

        let receipt = fixture
            .service
            .send(from, recipient.id.clone(), &body)
            .await
            .expect("oversized direct frame queues");
        assert_eq!(receipt.outcome, queued_outcome("frame-too-large"));
        assert_eq!(fixture.queue.live_len(), 1);
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("stage_submit:") && !call.starts_with("submit:")),
            "oversized frame must not reach pane typing"
        );
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&recipient.id)], "reader")
            .await
            .expect("claim oversized direct body")
            .expect("oversized direct body remains pullable");
        let queued: Msg = serde_json::from_str(&claimed.1.payload).expect("queued message");
        assert_eq!(queued.body, body);
    }

    /// A pane presenting a composer with CONTENT, cursor parked at its end.
    ///
    /// The box row is the OMP layout: `first_column` lands after the corner, the
    /// rules and the single space, so a cursor at column 11 clips the payload to
    /// exactly "hello".
    fn typing_pane(pane: &str) -> FakeTmux {
        FakeTmux::new()
            .with_pane(Pane {
                id: pane.to_string(),
                session: "s".to_string(),
                window: "w".to_string(),
                title: "t".to_string(),
                cursor_x: Some(11),
                cursor_y: Some(0),
            })
            .with_attached_tap(pane)
            .with_standing_capture(
                "\u{2570}\u{2500}\u{2500}\u{2500}\u{2500} hello \u{2500}\u{256f}",
            )
    }

    /// ac-1111 end to end: a PARKED draft delays delivery, it does not block it.
    ///
    /// The composer never goes blank and the human never returns. Before the idle
    /// window the send is queued; once the same unchanged content has outlived the
    /// window, delivery PROCEEDS. This is the regression that forced TS's
    /// fleet-wide emergency bypass (72b5dd61) — there, a walked-away draft held a
    /// pane forever.
    #[tokio::test]
    async fn a_parked_draft_delays_delivery_and_then_stops_blocking_it() {
        let idle = Duration::from_millis(30);
        let fixture =
            fixture_with_gate_and_idle(FakeTransport::reachable(), typing_pane("%108"), idle);
        let mut recipient = bound("pij-parked");
        recipient.pane = Some("%108".to_string());
        register(&fixture, recipient.clone()).await;

        // First send: the draft is fresh, so it is a real hold.
        let held = fixture
            .service
            .send("pij-from".into(), recipient.id.clone(), "wait your turn")
            .await
            .expect("a live draft queues durably");
        assert_eq!(held.outcome, queued_outcome("composer-busy"));
        assert!(fixture.transport.delivered().is_empty());

        // The draft is never touched again and never cleared.
        tokio::time::sleep(idle * 3).await;

        let sent = fixture
            .service
            .send("pij-from".into(), recipient.id, "no longer blocked")
            .await
            .expect("an expired hold delivers");
        assert_eq!(
            sent.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            },
            "a parked draft must DELAY delivery, never block it forever"
        );
    }

    #[tokio::test]
    async fn expired_nonempty_draft_still_vetoes_typed_body_delivery() {
        let idle = Duration::from_millis(30);
        let fixture =
            fixture_with_gate_and_idle(FakeTransport::unreachable(), typing_pane("%typed"), idle);
        let mut recipient = bound("pij-typed-draft");
        recipient.pane = Some("%typed".to_string());
        register(&fixture, recipient.clone()).await;

        let first = fixture
            .service
            .send("pij-from".into(), recipient.id.clone(), "wait first")
            .await
            .expect("fresh draft queues");
        assert_eq!(first.outcome, queued_outcome("composer-busy"));

        tokio::time::sleep(idle * 3).await;
        let second = fixture
            .service
            .send("pij-from".into(), recipient.id, "wait after expiry")
            .await
            .expect("stale draft still queues typed body");

        assert_eq!(second.outcome, queued_outcome("composer-busy"));
        assert_eq!(fixture.queue.live_len(), 2);
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "policy expiry may permit sockets but must not type into non-empty composer"
        );
    }

    /// ac-1114 end to end: the verdict comes from the send boundary, not the tick.
    ///
    /// The observer state says the composer is clear — the human started typing
    /// after that observation. Only a capture taken at the send boundary can see
    /// it, so a stale-clear tick must not be enough to authorize an injection.
    #[tokio::test]
    async fn a_stale_clear_tick_cannot_authorize_an_injection_a_fresh_capture_vetoes() {
        let fixture = fixture_with_gate(FakeTransport::reachable(), typing_pane("%108"));
        let mut recipient = bound("pij-racing");
        recipient.pane = Some("%108".to_string());
        register(&fixture, recipient.clone()).await;

        // The last observer tick saw a blank composer. It is already out of date.
        fixture.interaction.observe_composer("%108", "   ");

        let receipt = fixture
            .service
            .send("pij-from".into(), recipient.id, "mid-keystroke")
            .await
            .expect("a fresh veto queues durably");

        assert_eq!(
            receipt.outcome,
            queued_outcome("composer-busy"),
            "a stale CLEAR tick must not outrank a fresh capture showing a human typing"
        );
        assert!(fixture.transport.delivered().is_empty());
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .any(|call| call.starts_with("capture:%108")),
            "the verdict must derive from a capture taken at the send boundary"
        );
    }

    /// ac-1116: a paneless seat is never gated, and is never even LOOKED at.
    ///
    /// Pinned rather than built — this is existing behaviour that must survive the
    /// change. Asserting the absence of tmux calls, not merely a delivered
    /// receipt, is what makes it a pin: a paneless pull consumer has no composer,
    /// so the gate must not reach for one.
    #[tokio::test]
    async fn a_paneless_seat_is_never_gated_and_never_captured() {
        let fixture = fixture_with_gate(FakeTransport::reachable(), typing_pane("%108"));
        let mut recipient = bound("pij-paneless");
        recipient.pane = None;
        register(&fixture, recipient.clone()).await;

        let receipt = fixture
            .service
            .send("pij-from".into(), recipient.id, "pull consumer")
            .await
            .expect("paneless delivery");

        assert_eq!(
            receipt.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );
        assert!(
            fixture.tmux.calls().is_empty(),
            "a paneless seat has no composer: the gate must not capture, list, or probe"
        );
    }

    #[tokio::test]
    async fn receipt_honesty_decision_table_covers_busy_prebind_dead_held_and_delivered() {
        // Delivered: transport accepted it, no inbox row remains, and the audit
        // event binds the receipt to the message id.
        let delivered = fixture(FakeTransport::reachable());
        register(&delivered, bound("pij-delivered")).await;
        let receipt = delivered
            .service
            .send("pij-from".into(), "pij-delivered".into(), "hello")
            .await
            .expect("delivered receipt");
        assert_eq!(
            receipt.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );
        assert_eq!(receipt.at, 1_234);
        assert_eq!(delivered.transport.delivered().len(), 1);
        assert!(
            delivered
                .service
                .claim_inbox(&SeatId::from("pij-delivered"), false)
                .await
                .expect("empty inbox")
                .is_empty()
        );
        assert_audit(&delivered, &SeatId::from("pij-delivered"), "delivered").await;

        // Pre-bind: persistence happens before Queued is returned, and the
        // message is retrievable through the recipient-specific inbox.
        let prebind = fixture(FakeTransport::unreachable());
        register(
            &prebind,
            SeatDescriptor::new("pij-prebind", Harness::Omp, "/abs/tree"),
        )
        .await;
        let receipt = prebind
            .service
            .send("pij-from".into(), "pij-prebind".into(), "before bind")
            .await
            .expect("queued receipt");
        assert_eq!(receipt.outcome, queued_without_retry("pre-bind"));
        assert_eq!(prebind.queue.live_len(), 1);
        let inbox = prebind
            .service
            .claim_inbox(&SeatId::from("pij-prebind"), false)
            .await
            .expect("prebind inbox");
        let expected: Value = serde_json::from_str(INBOX_CLAIM_WIRE).expect("inbox-claim fixture");
        assert_eq!(
            serde_json::to_value(&inbox).expect("serialize inbox claim"),
            expected,
            "daemon emits the shared cross-runtime claim contract"
        );
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].message.body, "before bind");
        assert_audit(&prebind, &SeatId::from("pij-prebind"), "queued").await;

        // An operator hold is a REGISTRY fact and still queues without consulting
        // the transport at all.
        let held_seat = {
            let mut seat = bound("pij-hold");
            seat.semantic_state = Some(SemanticState::Hold);
            seat
        };
        let queued = fixture(FakeTransport::reachable());
        register(&queued, held_seat).await;
        let receipt = queued
            .service
            .send("pij-from".into(), "pij-hold".into(), "pij-hold")
            .await
            .expect("operator hold queues");
        assert_eq!(receipt.outcome, queued_without_retry("operator-hold"));
        assert!(queued.transport.calls().is_empty());
        assert_eq!(
            queued
                .service
                .claim_inbox(&SeatId::from("pij-hold"), false)
                .await
                .expect("queued inbox")
                .len(),
            1
        );

        // BUSY is now the transport's judgement, not the policy's. A pty-shaped
        // transport declines a working seat, because typing races a live
        // composer — and the operator still hears "queued".
        //
        // This moved because a socket transport delivers to Claude BETWEEN TOOL
        // CALLS MID-TURN, which is to say exactly when the seat is Working. The
        // old prefilter queued first and asked afterwards, which would have made
        // a correct socket transport unreachable in the one case it exists for
        // (found by u-uds at its ack gate, wave 3).
        let busy_seat = {
            let mut seat = bound("pij-busy");
            seat.state = SystemState::Working;
            seat
        };
        let busy = fixture(FakeTransport::unreachable());
        register(&busy, busy_seat.clone()).await;
        let receipt = busy
            .service
            .send("pij-from".into(), "pij-busy".into(), "pij-busy")
            .await
            .expect("a declining transport queues");
        assert_eq!(receipt.outcome, queued_without_retry("unreachable"));
        assert_eq!(busy.transport.calls().len(), 1, "the transport was ASKED");
        assert_eq!(
            busy.service
                .claim_inbox(&SeatId::from("pij-busy"), false)
                .await
                .expect("queued inbox")
                .len(),
            1
        );

        // ...and an interrupting transport DELIVERS to that same working seat.
        // This assertion is the whole point of the move.
        let mid_turn = fixture(FakeTransport::reachable());
        register(&mid_turn, busy_seat).await;
        let receipt = mid_turn
            .service
            .send("pij-from".into(), "pij-busy".into(), "mid-turn")
            .await
            .expect("an interrupting transport delivers mid-turn");
        assert_eq!(
            receipt.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );

        // A genuine approval hold comes only from transport and is not queued.
        let held = fixture(
            FakeTransport::reachable().script_outcome(DeliveryOutcome::Held {
                reason: "approval required".to_string(),
            }),
        );
        register(&held, bound("pij-held")).await;
        let receipt = held
            .service
            .send("pij-from".into(), "pij-held".into(), "sensitive")
            .await
            .expect("held receipt");
        assert_eq!(
            receipt.outcome,
            DeliveryOutcome::Held {
                reason: "approval required".to_string()
            }
        );
        assert_eq!(held.queue.live_len(), 0);
        assert_audit(&held, &SeatId::from("pij-held"), "held").await;

        // A tombstone is permanent: return the distinct refusal, queue nothing,
        // and preserve the post-mortem reason in the diagnostic.
        let dead = fixture(FakeTransport::reachable());
        let mut seat = bound("pij-dead");
        seat.tombstoned_at = Some(99);
        seat.tombstone_reason = Some("process exited".to_string());
        register(&dead, seat).await;
        let error = dead
            .service
            .send("pij-from".into(), "pij-dead".into(), "too late")
            .await
            .expect_err("tombstone must refuse");
        assert_eq!(
            error,
            PijError::SeatIsGone {
                seat: SeatId::from("pij-dead"),
                tombstone_reason: Some("process exited".to_string())
            }
        );
        assert!(error.to_string().contains("message was not queued"));
        assert_eq!(dead.queue.live_len(), 0);
        assert!(
            dead.spine
                .tail(Some(&SeatId::from("pij-dead")), Seq(0))
                .await
                .expect("dead audit tail")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn forwarded_duplicate_after_reader_ack_replays_origin_without_second_turn() {
        let fixture = fixture(FakeTransport::reachable());
        register(&fixture, bound("pij-destination")).await;
        let msg = Msg {
            from: SeatId::from("pij-origin"),
            to: SeatId::from("pij-destination"),
            body: "once".to_string(),
            msg_id: "m-forwarded".to_string(),
            from_machine: Some("laptop".to_string()),
            in_reply_to: None,
            command: None,
        };

        let first = fixture
            .service
            .accept_forwarded(msg.clone())
            .await
            .expect("first forward");
        assert_eq!(first.outcome, queued_without_retry("unreachable"));
        assert_eq!(
            fixture
                .service
                .accept_forwarded(msg.clone())
                .await
                .expect("live duplicate")
                .outcome,
            queued_without_retry("unreachable")
        );
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "live collapse remains unchanged"
        );
        let claimed = fixture
            .service
            .claim_inbox(&msg.to, false)
            .await
            .expect("recipient receives page");
        assert_eq!(claimed.len(), 1);
        fixture
            .service
            .acknowledge_inbox(claimed[0].job_id)
            .await
            .expect("recipient acknowledges decoded page");

        let duplicate = fixture
            .service
            .accept_forwarded(msg.clone())
            .await
            .expect("post-ack duplicate is a successful prior-delivery receipt");
        assert_eq!(
            duplicate.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::ReaderRead
            }
        );
        assert!(
            fixture
                .service
                .claim_inbox(&msg.to, false)
                .await
                .expect("no second recipient delivery")
                .is_empty()
        );
        let events = fixture
            .spine
            .tail(Some(&msg.to), Seq(0))
            .await
            .expect("destination events");
        assert_eq!(
            events
                .iter()
                .filter(|event| event.kind == PUSHED_EVENT_KIND)
                .count(),
            2,
            "the live duplicate retains existing admission events, but the suppressed post-ack retry adds none"
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event.kind == OUTCOME_EVENT_KIND)
                .count(),
            3,
            "every sender attempt retains an outcome audit"
        );
    }

    #[tokio::test]
    async fn inbox_reader_yields_when_announcer_claimed_after_event_publication() {
        let fixture = fixture(FakeTransport::unreachable());
        let msg = Msg {
            from: SeatId::from("pij-origin"),
            to: SeatId::from("pij-race"),
            body: "already handed to announcer".to_string(),
            msg_id: "m-announcer-race".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };
        register(
            &fixture,
            SeatDescriptor::new(msg.to.clone(), Harness::Omp, "/abs/tree"),
        )
        .await;
        fixture
            .service
            .accept_forwarded(msg.clone())
            .await
            .expect("publish queued event");

        let (job_id, handed_to_announcer) = fixture
            .queue
            .claim(&[delivery_kind(&msg.to)], "pre-s122-announcer")
            .await
            .expect("claim succeeds")
            .expect("queued row");
        assert!(
            fixture
                .service
                .claim_inbox(&msg.to, false)
                .await
                .expect("reader observes ownership")
                .is_empty(),
            "the extension must suppress injection when another worker owns the row"
        );
        let handed_out: Msg =
            serde_json::from_str(&handed_to_announcer.payload).expect("delivery payload");
        assert_eq!(handed_out, msg, "the winning daemon rung retains the body");
        fixture
            .queue
            .ack_delivery(job_id, DeliveryOrigin::InjectedToTransport)
            .await
            .expect("winning daemon rung finishes delivery");
    }

    #[tokio::test]
    async fn inbox_for_a_never_claims_b_even_when_b_was_enqueued_first() {
        let fixture = fixture(FakeTransport::unreachable());
        register(
            &fixture,
            SeatDescriptor::new("pij-a", Harness::Omp, "/abs/tree"),
        )
        .await;
        register(
            &fixture,
            SeatDescriptor::new("pij-b", Harness::Omp, "/abs/tree"),
        )
        .await;
        fixture
            .service
            .send("pij-from".into(), "pij-b".into(), "for b")
            .await
            .expect("queue b first");
        fixture
            .service
            .send("pij-from".into(), "pij-a".into(), "for a")
            .await
            .expect("queue a second");

        let a = fixture
            .service
            .claim_inbox(&SeatId::from("pij-a"), false)
            .await
            .expect("a inbox");
        assert_eq!(
            a.iter()
                .map(|claim| claim.message.body.as_str())
                .collect::<Vec<_>>(),
            ["for a"]
        );

        let b = fixture
            .service
            .claim_inbox(&SeatId::from("pij-b"), false)
            .await
            .expect("b remains claimable");
        assert_eq!(
            b.iter()
                .map(|claim| claim.message.body.as_str())
                .collect::<Vec<_>>(),
            ["for b"]
        );
        assert_eq!(delivery_kind(&SeatId::from("pij-a")), "delivery:pij-a");
    }
    #[tokio::test]
    async fn inbox_serialization_allows_one_claim_until_it_is_acknowledged() {
        let fixture = fixture(FakeTransport::unreachable());
        let seat = SeatId::from("pij-serial-reader");
        register(
            &fixture,
            SeatDescriptor::new(seat.clone(), Harness::Omp, "/abs/tree"),
        )
        .await;
        fixture
            .service
            .send("pij-from".into(), seat.clone(), "first")
            .await
            .expect("queue first");
        fixture
            .service
            .send("pij-from".into(), seat.clone(), "second")
            .await
            .expect("queue second");

        let first = fixture
            .service
            .claim_inbox(&seat, false)
            .await
            .expect("first claim");
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].message.body, "first");
        assert!(
            fixture
                .service
                .claim_inbox(&seat, false)
                .await
                .expect("second claim while first runs")
                .is_empty(),
            "the shared seat serial key structurally bounds GET to one claim"
        );

        fixture
            .service
            .acknowledge_inbox(first[0].job_id)
            .await
            .expect("ack first");
        let second = fixture
            .service
            .claim_inbox(&seat, false)
            .await
            .expect("claim after ack");
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].message.body, "second");
    }

    #[tokio::test]
    async fn waiting_inbox_attaches_live_before_checking_the_queue() {
        let fixture = fixture(FakeTransport::unreachable());
        register(
            &fixture,
            SeatDescriptor::new("pij-wait", Harness::Omp, "/abs/tree"),
        )
        .await;
        let service = Arc::clone(&fixture.service);
        let waiting =
            tokio::spawn(async move { service.claim_inbox(&SeatId::from("pij-wait"), true).await });
        tokio::task::yield_now().await;
        fixture
            .service
            .send("pij-from".into(), "pij-wait".into(), "wake up")
            .await
            .expect("queue and notify");

        let messages = tokio::time::timeout(Duration::from_secs(1), waiting)
            .await
            .expect("wait must wake")
            .expect("inbox task")
            .expect("inbox result");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].message.body, "wake up");
    }

    #[tokio::test]
    async fn subscribe_live_never_replays_the_existing_spine() {
        let spine = Arc::new(FakeSpine::new());
        let bus = EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 4).expect("bus");
        let event = |kind: &str| Event {
            seq: None,
            v: 1,
            at: 1,
            kind: kind.to_string(),
            seat: Some(SeatId::from("pij-live")),
            payload: "{}".to_string(),
        };
        bus.publish(event("old")).await.expect("old publish");
        let mut live = bus.subscribe_live(EventFilter::all());
        assert!(
            tokio::time::timeout(Duration::from_millis(20), live.next())
                .await
                .is_err(),
            "live attach must not replay the old event"
        );
        bus.publish(event("new")).await.expect("new publish");
        assert_eq!(live.next().await.expect("future event").kind, "new");
    }

    /// Review F8 / R4-AMEND-4 — the DIRECT path claims before it injects, and a
    /// retry after an ambiguous failure is suppressed rather than delivered twice.
    ///
    /// First-attempt-online is the common case for a local send, so this was the
    /// duplicate window's likeliest path and the one my first two fixes missed.
    ///
    /// Mutation witness: delete the `note_delivered` claim and the second accept
    /// delivers again — two transport deliveries where one is required.
    #[tokio::test]
    async fn a_direct_delivery_is_claimed_before_injection_and_a_retry_is_suppressed() {
        let fixture = fixture(FakeTransport::reachable());
        register(&fixture, bound("pij-online")).await;

        let msg = || Msg {
            from: "pij-from".into(),
            to: "pij-online".into(),
            body: "hello".to_string(),
            msg_id: "m-direct-1".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };

        let first = fixture.service.accept(msg()).await.expect("first delivery");
        assert_eq!(
            first.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            }
        );

        let retry = fixture.service.accept(msg()).await.expect("retry");
        assert_eq!(
            retry.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            },
            "the retry replays the RECORDED origin rather than claiming a new delivery"
        );
        assert_eq!(
            fixture.transport.delivered().len(),
            1,
            "the recipient must be injected ONCE: a caller retry is not a second message"
        );
    }

    /// The prime's binding rider on R4-AMEND-4 — the FAILURE path.
    ///
    /// Claim-before-inject carries the inverse window and it is the worse one: a
    /// claim that lands while the injection does not turns the next retry into a
    /// replayed `Delivered` for a message that NEVER ARRIVED — a lost message
    /// wearing our most confident receipt. A synchronous failure must compensate.
    ///
    /// Mutation witness: remove the `forget_delivered` call in the error arm and
    /// the retry is suppressed, so the message is lost and reported delivered.
    #[tokio::test]
    async fn a_failed_injection_releases_its_claim_so_the_retry_still_delivers() {
        let fixture = fixture(FakeTransport::reachable().script_deliver_error());
        register(&fixture, bound("pij-flaky")).await;

        let msg = || Msg {
            from: "pij-from".into(),
            to: "pij-flaky".into(),
            body: "hello".to_string(),
            msg_id: "m-direct-2".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };

        fixture
            .service
            .accept(msg())
            .await
            .expect_err("the transport failed, and the caller is told so");

        let retry = fixture.service.accept(msg()).await.expect("retry delivers");
        assert_eq!(
            retry.outcome,
            DeliveryOutcome::Delivered {
                origin: DeliveryOrigin::InjectedToTransport
            },
            "a claim whose delivery failed must NOT suppress the retry of a message nobody got"
        );
        assert_eq!(fixture.transport.delivered().len(), 1);
    }
}
