//! Runtime message delivery over the frozen registry, queue, transport, and spine ports.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::control::{COPILOT_CONTROL_REFUSAL, ControlOutcome};
use pij_core::delivery::{
    DeliveryDeferralReason, DeliveryRoute, DeliveryRung, HeldEvent, MAX_TYPED_FRAME_BYTES,
    QueueReason, ReleasedEvent, delivery_kind, route, route_control, select_rung,
};
use pij_core::error::{PijError, Result};
use pij_core::events::EventFilter;
use pij_core::framing::frame_message;
use pij_core::model::{
    DeliveryFailure, DeliveryOrigin, DeliveryOutcome, Event, Harness, Job, JobId, Msg, Outcome,
    Receipt, SeatDescriptor, SeatId, SemanticState,
};
use pij_core::ports::{DeliveryAck, DeliveryEnqueue, LivenessPort, Queue, Registry, Transport};
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

/// One claimed inbox row. Native clients acknowledge only after SDK acceptance;
/// other readers acknowledge after decoding. Neither is evidence of model completion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InboxClaim {
    /// Queue identity used by the explicit acknowledgement step.
    pub job_id: JobId,
    /// Message body claimed for the recipient.
    pub message: Msg,
    /// Queue retry count; initial delivery is attempt zero.
    #[serde(default)]
    pub attempt: u32,
    /// Present only for terminal rows returned by non-destructive peek.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    /// A parked row's exact terminal recovery outcome.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<DeliveryFailure>,
    /// Echo of the native incarnation validated at handoff; absent on legacy/peek rows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_consumer: Option<NativeInboxIdentity>,
}

/// Runtime identity supplied by native extensions and verified external pull readers.
/// Optional wire fields preserve existing machine-grade non-Copilot clients.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct NativeInboxIdentity {
    /// Exact harness-native session registered for the current host.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_session: Option<String>,
    /// Actual harness host PID, never an extension child or transient CLI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    /// Observed start stamp of that host process.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proc_start: Option<u64>,
}

impl NativeInboxIdentity {
    fn supplied(&self) -> bool {
        self.native_session.is_some() || self.pid.is_some() || self.proc_start.is_some()
    }

    pub(crate) fn matches(&self, seat: &SeatDescriptor) -> bool {
        seat.proc.is_some_and(|identity| {
            self.pid == Some(identity.pid) && self.proc_start == Some(identity.proc_start)
        }) && self.native_session.as_deref().is_some_and(|session| {
            !session.is_empty() && seat.harness_session.as_deref() == Some(session)
        })
    }
}

/// A registered external pull seat, never an extension, relay, or pane consumer.
pub(crate) fn paneless_pull(seat: &SeatDescriptor) -> bool {
    matches!(
        seat.harness,
        Harness::Claude | Harness::Copilot | Harness::Codex
    ) && seat.pane.is_none()
        && !seat.relay
        && !seat.native_extension_delivery
        && seat.proc.is_some()
        && seat
            .harness_session
            .as_deref()
            .is_some_and(|session| !session.is_empty())
}

fn native_refusal(reason: impl Into<String>) -> PijError {
    PijError::Adapter {
        adapter: "daemon/native-inbox".to_string(),
        message: reason.into(),
    }
}

/// Claims plus the exact held verdict, so HTTP does not re-observe mutable consent.
#[derive(Debug, Default)]
pub struct NativeInboxPage {
    /// Zero or one durable claims.
    pub claims: Vec<InboxClaim>,
    /// Stable consent reason when the native consumer must retry with backoff.
    pub held_reason: Option<String>,
}

/// Identity-bound consent observation; never a queue claim or delivery receipt.
#[derive(Debug, Serialize)]
pub(crate) struct NativeTypingSnapshot {
    native_consumer: NativeInboxIdentity,
    typing_grace_ms: u64,
    observed_at_ms: u64,
    semantic_hold: bool,
    #[serde(flatten)]
    observation: NativeTypingObservation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "snake_case")]
enum NativeTypingObservation {
    Observed {
        retry_after_ms: u64,
        source: &'static str,
    },
    Unavailable {
        reason: &'static str,
    },
}

type Clock = dyn Fn() -> Result<u64> + Send + Sync;

struct DeliverySources {
    id_prefix: u64,
    clock: Arc<Clock>,
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
/// socket delivery never consults or changes the composer.
pub struct DeliveryService {
    registry: Arc<dyn Registry>,
    queue: Arc<dyn Queue>,
    transport: Arc<dyn Transport>,
    interaction: Arc<InteractionGate>,
    event_bus: Arc<EventBus>,
    id_prefix: u64,
    next_id: AtomicU64,
    clock: Arc<Clock>,
    native_lock: Arc<tokio::sync::Mutex<()>>,
    extension_claim_lease_secs: u64,
    recovery_authority_shared: bool,
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
            },
        ))
    }

    pub(crate) fn with_recovery_backends(
        mut self,
        queue: pij_core::config::AdapterChoice,
        spine: pij_core::config::AdapterChoice,
    ) -> Self {
        self.recovery_authority_shared = !queue.is_real() || spine.is_real();
        self
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
            native_lock: Arc::new(tokio::sync::Mutex::new(())),
            extension_claim_lease_secs: std::env::var("PIJ_RS_EXT_CLAIM_LEASE_SECS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|value| *value > 0 && *value <= i64::MAX as u64)
                .unwrap_or(60),
            recovery_authority_shared: true,
        }
    }

    pub(crate) fn native_lock(&self) -> Arc<tokio::sync::Mutex<()>> {
        Arc::clone(&self.native_lock)
    }

    fn queued_outcome(reason: Option<&str>, not_before_ms: u64) -> DeliveryOutcome {
        Self::queued_outcome_with_draft(reason, not_before_ms, None)
    }

    fn queued_outcome_with_draft(
        reason: Option<&str>,
        not_before_ms: u64,
        draft_sha: Option<String>,
    ) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: reason.map(str::to_string),
            next_retry_at: Some(not_before_ms),
            draft_sha,
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

    /// Admit an authenticated control request. The HTTP boundary owns caller
    /// authorization; this entry permits a self-target without relaxing body routing.
    pub(crate) async fn accept_control(&self, msg: Msg) -> Result<Receipt> {
        // Serialize request-id replay with terminal control ACKs and keep the
        // admission event ahead of an extension's immediate execution outcome.
        let _delivery_order = self.event_bus.socket_delivery_order.lock().await;
        if let Some(event) = self
            .event_bus
            .latest_matching_message(&msg.to, OUTCOME_EVENT_KIND, &msg.msg_id)
            .await?
        {
            #[derive(Deserialize)]
            struct RecordedOutcome {
                outcome: DeliveryOutcome,
                control_outcome: Option<ControlOutcome>,
            }
            let recorded: RecordedOutcome =
                serde_json::from_str(&event.payload).map_err(|error| PijError::Adapter {
                    adapter: "daemon/delivery".into(),
                    message: format!("invalid control receipt: {error}"),
                })?;
            if matches!(
                recorded.control_outcome,
                Some(ControlOutcome::Refused { .. })
            ) {
                return Ok(Receipt {
                    msg_id: msg.msg_id,
                    outcome: recorded.outcome,
                    at: event.at,
                });
            }
        }
        self.arrive(msg, Arrival::Control).await
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
        if msg.to.0 == pij_core::BG_ACTOR {
            return Err(PijError::Adapter {
                adapter: "daemon/virtual-sender".into(),
                message: "pij-bg is a daemon-owned sender, not a recipient".into(),
            });
        }
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
            Arrival::Control => route_control(&recipient, true),
            Arrival::Forwarded => {
                match route(&from, msg.from_machine.as_deref(), &recipient, true)? {
                    DeliveryRoute::Tombstoned { reason } => DeliveryRoute::Tombstoned { reason },
                    _ => DeliveryRoute::Queue(QueueReason::Unreachable),
                }
            }
        };
        if recipient.harness == Harness::Copilot
            && recipient.tombstoned_at.is_none()
            && msg.command.is_some()
        {
            let receipt = Receipt {
                msg_id: msg.msg_id,
                outcome: DeliveryOutcome::Refused {
                    reason: COPILOT_CONTROL_REFUSAL.into(),
                },
                at,
            };
            self.publish_outcome(&to, &receipt).await?;
            return Ok(receipt);
        }
        let mut publish_to_recipient = true;
        let mut _delivery_order = None;
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
                match self
                    .queue
                    .enqueue_delivery(delivery_job(&msg, Some(&recipient))?)
                    .await?
                {
                    DeliveryEnqueue::Queued { not_before_ms, .. } => {
                        Self::queued_outcome(Some(reason.as_str()), not_before_ms)
                    }
                    DeliveryEnqueue::AlreadyDelivered(origin) => {
                        publish_to_recipient = false;
                        DeliveryOutcome::Delivered { origin }
                    }
                }
            }
            DeliveryRoute::Transport => {
                // Extension consumers exclusively own these durable rows. Copilot
                // additionally checks native incarnation and human consent at claim.
                let extension_stream = matches!(
                    recipient.harness,
                    Harness::Omp | Harness::Pi | Harness::Copilot
                );
                let rung = if extension_stream {
                    DeliveryRung::Observe
                } else {
                    let socket_available = msg.command.is_none()
                        && self.transport.can_deliver(&recipient, &msg).await?;
                    // Send-keys fallbacks check permission after acquiring input
                    // ownership. Socket bodies do not touch the human composer.
                    // Paneless socket consumers remain transport-owned. The rung
                    // selector governs pane fallbacks and deliberately returns
                    // `Observe` before consulting socket capability.
                    if recipient.pane.is_none() && socket_available {
                        DeliveryRung::Socket
                    } else {
                        select_rung(&recipient, &msg, socket_available, false, true)
                    }
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
                                    match self
                                        .queue
                                        .enqueue_delivery(delivery_job(&msg, Some(&recipient))?)
                                        .await?
                                    {
                                        DeliveryEnqueue::Queued { not_before_ms, .. } => {
                                            Self::queued_outcome(
                                                reason.as_deref().or(Some("unreachable")),
                                                not_before_ms,
                                            )
                                        }
                                        DeliveryEnqueue::AlreadyDelivered(origin) => {
                                            publish_to_recipient = false;
                                            DeliveryOutcome::Delivered { origin }
                                        }
                                    }
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
                            match self
                                .queue
                                .enqueue_delivery(delivery_job(&msg, Some(&recipient))?)
                                .await?
                            {
                                DeliveryEnqueue::Queued { not_before_ms, .. } => {
                                    Self::queued_outcome(Some("frame-too-large"), not_before_ms)
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
                                    Ok(StagedSubmission::Deferred { reason, draft_sha }) => {
                                        self.queue.forget_delivered(&to, &msg.msg_id).await?;
                                        // Keep admission evidence ahead of a worker's completion.
                                        _delivery_order =
                                            Some(self.event_bus.socket_delivery_order.lock().await);
                                        match self
                                            .queue
                                            .enqueue_delivery(delivery_job(&msg, Some(&recipient))?)
                                            .await?
                                        {
                                            DeliveryEnqueue::Queued { not_before_ms, .. } => {
                                                publish_delivery_held(
                                                    &self.event_bus,
                                                    &msg,
                                                    reason,
                                                    draft_sha.as_deref(),
                                                    at,
                                                )
                                                .await?;
                                                Self::queued_outcome_with_draft(
                                                    Some(reason.as_str()),
                                                    not_before_ms,
                                                    draft_sha,
                                                )
                                            }
                                            DeliveryEnqueue::AlreadyDelivered(origin) => {
                                                publish_to_recipient = false;
                                                DeliveryOutcome::Delivered { origin }
                                            }
                                        }
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
                        match self
                            .queue
                            .enqueue_delivery(delivery_job(&msg, Some(&recipient))?)
                            .await?
                        {
                            DeliveryEnqueue::Queued { not_before_ms, .. } => {
                                let reason = if paneless_pull(&recipient) {
                                    None
                                } else if extension_stream {
                                    Some(
                                        if recipient.harness == Harness::Copilot
                                            && !recipient.native_extension_delivery
                                        {
                                            "native-extension-unavailable"
                                        } else {
                                            "extension-stream"
                                        },
                                    )
                                } else {
                                    match rung {
                                        DeliveryRung::Observe => Some("unreachable"),
                                        DeliveryRung::ControlBodyPull => Some("terminal-control"),
                                        DeliveryRung::Pty => Some("pty"),
                                        _ => None,
                                    }
                                };
                                Self::queued_outcome(reason, not_before_ms)
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
        let transport = if msg.command.is_some() {
            if matches!(recipient.harness, Harness::Omp | Harness::Pi) {
                "extension-stream"
            } else {
                "pty"
            }
        } else {
            self.transport.name()
        };
        if let Err(error) =
            publish_delivery_outcome(&self.event_bus, &msg.to, &receipt, transport).await
        {
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
        Ok(self
            .claim_inbox_inner(seat, wait, &NativeInboxIdentity::default(), None)
            .await?
            .claims)
    }

    /// Claim native work for the current attested owner; the receiver gates new sends.
    pub async fn claim_native_inbox(
        &self,
        seat: &SeatId,
        wait: bool,
        identity: &NativeInboxIdentity,
    ) -> Result<NativeInboxPage> {
        self.claim_inbox_inner(seat, wait, identity, None).await
    }

    /// Pull only from a verified paneless host. Subscribe before claiming and
    /// cancel only the idle wait on timeout; never abandon an in-flight claim.
    pub(crate) async fn claim_pull_inbox(
        &self,
        seat: &SeatId,
        wait: bool,
        timeout: Option<Duration>,
        identity: &NativeInboxIdentity,
        liveness: &dyn LivenessPort,
    ) -> Result<NativeInboxPage> {
        if !wait {
            return self
                .claim_inbox_inner(seat, false, identity, Some(liveness))
                .await;
        }
        let mut wake = self.event_bus.subscribe_live(
            EventFilter::kinds([
                OUTCOME_EVENT_KIND,
                "delivery.released",
                "report.state",
                "report.now",
            ])
            .for_seat(seat.clone()),
        );
        let deadline = timeout
            .map(|timeout| {
                tokio::time::Instant::now()
                    .checked_add(timeout)
                    .ok_or_else(|| {
                        native_refusal("inbox wait duration exceeds the supported clock range")
                    })
            })
            .transpose()?;
        loop {
            let page = self
                .claim_inbox_inner(seat, false, identity, Some(liveness))
                .await?;
            if !page.claims.is_empty() {
                return Ok(page);
            }
            if deadline.is_some_and(|deadline| tokio::time::Instant::now() >= deadline) {
                return Ok(NativeInboxPage::default());
            }
            let event = match deadline {
                Some(deadline) => match tokio::time::timeout_at(deadline, wake.next()).await {
                    Ok(event) => event,
                    Err(_) => return Ok(NativeInboxPage::default()),
                },
                None => wake.next().await,
            };
            if event.is_none() {
                return Err(native_refusal(
                    "inbox event stream closed before a message arrived",
                ));
            }
        }
    }

    async fn inbox_recipient(
        &self,
        seat: &SeatId,
        identity: &NativeInboxIdentity,
    ) -> Result<Option<SeatDescriptor>> {
        let recipient = self.registry.get(seat).await?;
        match recipient {
            Some(recipient) if recipient.harness == Harness::Copilot => {
                if recipient.tombstoned_at.is_some()
                    || (!recipient.native_extension_delivery && !paneless_pull(&recipient))
                {
                    return Err(native_refusal(
                        "native-extension-unavailable: Copilot requires current native registration",
                    ));
                }
                if !identity.matches(&recipient) {
                    return Err(native_refusal(
                        "native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat",
                    ));
                }
                Ok(Some(recipient))
            }
            Some(recipient)
                if identity.supplied()
                    && recipient.tombstoned_at.is_none()
                    && paneless_pull(&recipient)
                    && identity.matches(&recipient) =>
            {
                Ok(Some(recipient))
            }
            None if identity.supplied() => Err(native_refusal(
                "native-extension-unavailable: Copilot requires current native registration",
            )),
            _ if identity.supplied() => Err(native_refusal(
                "native incarnation does not match a current external pull seat",
            )),
            recipient => Ok(recipient),
        }
    }

    /// Informational recency snapshot; typing never authorizes native delivery.
    /// Slow pane IO runs outside the native lock. Current identity and pane bind
    /// the returned evidence; Operator Hold is reported independently.
    pub(crate) async fn native_typing_snapshot(
        &self,
        seat: &SeatId,
        identity: &NativeInboxIdentity,
        typing_grace_ms: u64,
    ) -> Result<NativeTypingSnapshot> {
        let observed = self
            .inbox_recipient(seat, identity)
            .await?
            .filter(|recipient| {
                recipient.harness == Harness::Copilot && recipient.native_extension_delivery
            })
            .ok_or_else(|| {
                native_refusal("native typing observation requires current native registration")
            })?;
        let unavailable = NativeTypingObservation::Unavailable {
            reason: "native-typing-sensor-unavailable",
        };
        let remaining = match observed.pane.as_deref() {
            Some(pane) => match self.interaction.fresh_injection_verdict(pane).await {
                // Blank composers have no remaining draft recency to report.
                // This observation is not a native delivery permission check.
                Ok(verdict) if verdict.composer_idle => Some(0),
                Ok(verdict) if verdict.reason == Some(DeliveryDeferralReason::HumanTyping) => {
                    verdict.next_retry_at.map(|remaining| {
                        // Never round a positive sub-millisecond veto down to quiet.
                        u64::try_from(remaining.as_nanos().div_ceil(1_000_000)).unwrap_or(u64::MAX)
                    })
                }
                Ok(verdict) if verdict.permitted && verdict.reason.is_none() => Some(0),
                _ => None,
            },
            None if typing_grace_ms == 0 => Some(0),
            None => None,
        };
        let observed_at_ms = (self.clock)()?;
        let _guard = self.native_lock.lock().await;
        let current = self
            .inbox_recipient(seat, identity)
            .await?
            .filter(|recipient| {
                recipient.harness == Harness::Copilot && recipient.native_extension_delivery
            })
            .ok_or_else(|| {
                native_refusal("native typing observation requires current native registration")
            })?;
        let observation = match remaining {
            Some(retry_after_ms)
                if current.pane == observed.pane && retry_after_ms <= typing_grace_ms =>
            {
                NativeTypingObservation::Observed {
                    retry_after_ms,
                    source: "pane-observed-edit-recency",
                }
            }
            _ => unavailable,
        };
        Ok(NativeTypingSnapshot {
            native_consumer: identity.clone(),
            typing_grace_ms,
            observed_at_ms,
            semantic_hold: current.semantic_state == Some(SemanticState::Hold),
            observation,
        })
    }

    /// Revalidate native identity/pane and every recipient's semantic Hold.
    /// A stream claim must not bypass the registry hold that queued its arrival.
    async fn revalidate_inbox_observation(
        &self,
        seat: &SeatId,
        identity: &NativeInboxIdentity,
        observed: Option<&SeatDescriptor>,
    ) -> Result<Option<String>> {
        let current = self.inbox_recipient(seat, identity).await?;
        if current
            .as_ref()
            .filter(|seat| seat.harness == Harness::Copilot)
            .map(|seat| seat.pane.as_deref())
            != observed
                .filter(|seat| seat.harness == Harness::Copilot)
                .map(|seat| seat.pane.as_deref())
        {
            return Ok(Some("native-pane-changed".into()));
        }
        Ok(current
            .filter(|seat| seat.semantic_state == Some(SemanticState::Hold))
            .map(|_| "semantic-hold".into()))
    }

    async fn claim_inbox_inner(
        &self,
        seat: &SeatId,
        wait: bool,
        identity: &NativeInboxIdentity,
        pull_liveness: Option<&dyn LivenessPort>,
    ) -> Result<NativeInboxPage> {
        let kinds = [delivery_kind(seat)];
        let mut wake = wait.then(|| {
            self.event_bus
                .subscribe_live(EventFilter::kinds([OUTCOME_EVENT_KIND]).for_seat(seat.clone()))
        });
        loop {
            // Native claims are queue ownership, not permission to inject. The
            // receiver owns native consent; typing is never a native gate.
            // Keep mutation excluded through handoff; no pane IO occurs here.
            let native_guard = self.native_lock.clone().lock_owned().await;
            let observed = self.inbox_recipient(seat, identity).await?;
            if let Some(liveness) = pull_liveness {
                let recipient = observed.as_ref().filter(|seat| paneless_pull(seat))
                    .ok_or_else(|| native_refusal("inbox --wait requires a verified paneless pull seat; pushed seats cannot wait"))?;
                if !identity.matches(recipient) {
                    return Err(native_refusal(
                        "native incarnation mismatch for paneless pull",
                    ));
                }
                let proc = recipient.proc.expect("paneless pull has a host identity");
                if liveness.proc_start(proc.pid).await? != Some(proc.proc_start) {
                    return Err(native_refusal(
                        "paneless pull host is no longer live at its registered process start",
                    ));
                }
            }
            let native = observed
                .as_ref()
                .is_some_and(|seat| seat.harness == Harness::Copilot);
            let tuple_bound = native || identity.supplied();
            if let Some(reason) = self
                .revalidate_inbox_observation(seat, identity, observed.as_ref())
                .await?
            {
                return Ok(NativeInboxPage {
                    claims: Vec::new(),
                    held_reason: Some(reason),
                });
            }
            let (claimed, native_guard) = if observed
                .as_ref()
                .is_some_and(|recipient| matches!(recipient.harness, Harness::Omp | Harness::Pi))
            {
                let queue = self.queue.clone();
                let spine = self.event_bus.raw_spine();
                let claim_kinds = kinds.clone();
                let worker = seat.to_string();
                let lease = self.extension_claim_lease_secs;
                let at = (self.clock)()?;
                let recovery_allowed = self.recovery_authority_shared;
                let (result, native_guard) = self
                    .event_bus
                    .publish_committed_batch(async move {
                        let mut result = queue
                            .claim_extension(
                                &claim_kinds,
                                &worker,
                                lease,
                                at,
                                spine.as_ref(),
                                recovery_allowed,
                            )
                            .await?;
                        let events = std::mem::take(&mut result.events);
                        Ok((events, (result, native_guard)))
                    })
                    .await?;
                (result.claimed, native_guard)
            } else {
                (self.queue.claim(&kinds, seat.as_str()).await?, native_guard)
            };
            if let Some((job_id, job)) = claimed {
                if let Some(recipient) = observed.as_ref().filter(|_| tuple_bound) {
                    // Lease expiry may invalidate a running attempt independently
                    // of registration. Never hand out or retry its successor.
                    if self
                        .queue
                        .claimed_delivery(job_id)
                        .await?
                        .is_none_or(|current| current.attempt != job.attempt)
                    {
                        continue;
                    }
                    let permission = self
                        .revalidate_inbox_observation(seat, identity, Some(recipient))
                        .await;
                    match permission {
                        Ok(None) => {}
                        result => {
                            self.queue.retry(job_id, Duration::ZERO).await?;
                            let held_reason = result?;
                            return Ok(NativeInboxPage {
                                claims: Vec::new(),
                                held_reason,
                            });
                        }
                    }
                }
                let payload = serde_json::from_str::<ClaimedPayload>(&job.payload);
                let message = payload.as_ref().map(|payload| &payload.message);
                let invalid = match &message {
                    Err(error) => Some(format!("invalid delivery payload: {error}")),
                    Ok(message) if &message.to != seat || job.serial_key != seat.as_str() => {
                        Some(format!(
                            "delivery kind {} contained message for {}",
                            kinds[0], message.to
                        ))
                    }
                    Ok(message) if native && message.command.is_some() => Some(
                        "Copilot remote control is unsupported; native claim held without ack"
                            .into(),
                    ),
                    _ => None,
                };
                if let Some(reason) = invalid {
                    if !native {
                        self.queue
                            .ack(
                                job_id,
                                Outcome::Failed {
                                    reason: reason.clone(),
                                },
                            )
                            .await?;
                    }
                    return Err(PijError::Adapter {
                        adapter: "daemon/delivery".into(),
                        message: reason,
                    });
                }
                let payload = payload.expect("validated delivery payload");
                if tuple_bound
                    && let Some(reason) =
                        native_target_mismatch(payload.native_target_session.as_deref(), identity)
                {
                    // Durable CONTEXT HOLD, not a failed delivery: retry only
                    // releases this claim. Attempt count must never discard the
                    // body; only its original native context may consume it.
                    self.queue.retry(job_id, Duration::ZERO).await?;
                    return Ok(NativeInboxPage {
                        claims: Vec::new(),
                        held_reason: Some(reason),
                    });
                }
                let message = payload.message;
                self.publish_pointer_unparked_if_parked(seat, 1).await?;
                match self
                    .revalidate_inbox_observation(seat, identity, observed.as_ref())
                    .await
                {
                    Ok(None) => {}
                    result => {
                        self.queue.retry(job_id, Duration::ZERO).await?;
                        return Ok(NativeInboxPage {
                            claims: Vec::new(),
                            held_reason: result?,
                        });
                    }
                }
                return Ok(NativeInboxPage {
                    claims: vec![InboxClaim {
                        job_id,
                        message,
                        attempt: job.attempt,
                        state: None,
                        outcome: None,
                        native_consumer: tuple_bound.then(|| identity.clone()),
                    }],
                    held_reason: None,
                });
            }
            drop(native_guard);
            if !wait {
                return Ok(NativeInboxPage::default());
            }
            let Some(subscription) = wake.as_mut() else {
                return Ok(NativeInboxPage::default());
            };
            tokio::select! {
                event = subscription.next() => { if event.is_none() { return Ok(NativeInboxPage::default()); } }
                _ = tokio::time::sleep(Duration::from_millis(500)), if native => {}
            }
        }
    }

    /// Inspect the live head first, followed by terminal recovery rows.
    /// Parked bodies never become claims or consumption evidence.
    ///
    /// # Errors
    /// Queue read failures or a corrupt/misdirected persisted delivery payload.
    pub async fn peek_inbox(&self, seat: &SeatId) -> Result<Vec<InboxClaim>> {
        let kinds = [delivery_kind(seat)];
        let mut rows = Vec::new();
        if let Some((job_id, job)) = self.queue.peek(&kinds).await? {
            rows.push(inbox_snapshot(seat, job_id, job, None)?);
        }
        for parked in self.queue.peek_parked(&kinds).await? {
            rows.push(inbox_snapshot(
                seat,
                parked.job_id,
                parked.job,
                Some(parked.outcome),
            )?);
        }
        Ok(rows)
    }

    /// Fail an extension body that the runtime never consumed, without ReaderRead.
    ///
    /// # Errors
    /// Non-extension/control/stale claims, queue mutation failures, or event commit failures.
    pub async fn fail_inbox(&self, seat: &SeatId, job_id: JobId) -> Result<()> {
        let guard = self.native_lock.clone().lock_owned().await;
        let job = self.extension_body_claim(seat, job_id).await?;
        self.park_running_head(
            seat,
            job_id,
            job.attempt,
            pij_core::ports::ParkingEvidence {
                outcome: DeliveryFailure::HarnessSwallowed,
                reason: "three resend attempts were not consumed by the harness",
                at: (self.clock)()?,
            },
            guard,
            None,
        )
        .await
    }

    /// Operator recovery; authority is re-read only after ordered admission.
    pub(crate) async fn release_inbox_head(
        &self,
        seat: &SeatId,
        job_id: JobId,
        evidence: &str,
        actor: SeatId,
        roles: Arc<crate::http::role::RoleService>,
    ) -> Result<()> {
        let guard = self.native_lock.clone().lock_owned().await;
        let job = self.extension_body_claim(seat, job_id).await?;
        self.park_running_head(
            seat,
            job_id,
            job.attempt,
            pij_core::ports::ParkingEvidence {
                outcome: DeliveryFailure::OperatorReleased,
                reason: evidence,
                at: (self.clock)()?,
            },
            guard,
            Some((actor, roles)),
        )
        .await
    }

    async fn extension_body_claim(&self, seat: &SeatId, job_id: JobId) -> Result<Job> {
        let recipient = self
            .registry
            .get(seat)
            .await?
            .filter(|recipient| {
                recipient.tombstoned_at.is_none()
                    && matches!(recipient.harness, Harness::Omp | Harness::Pi)
            })
            .ok_or_else(|| {
                native_refusal("failure acknowledgement requires an extension-stream recipient")
            })?;
        let job = self.queue.claimed_delivery(job_id).await?.ok_or_else(|| {
            native_refusal("failure acknowledgement requires a running delivery claim")
        })?;
        let message: Msg = serde_json::from_str(&job.payload)
            .map_err(|error| native_refusal(format!("invalid delivery payload: {error}")))?;
        if job.serial_key != recipient.id.as_str()
            || message.to != recipient.id
            || message.command.is_some()
        {
            return Err(native_refusal(
                "failure acknowledgement must name its extension-stream body recipient",
            ));
        }
        Ok(job)
    }

    async fn park_running_head(
        &self,
        seat: &SeatId,
        job_id: JobId,
        attempt: u32,
        parking: pij_core::ports::ParkingEvidence<'_>,
        guard: tokio::sync::OwnedMutexGuard<()>,
        operator: Option<(SeatId, Arc<crate::http::role::RoleService>)>,
    ) -> Result<()> {
        pij_core::delivery::require_recovery_authority(self.recovery_authority_shared)?;
        let queue = self.queue.clone();
        let spine = self.event_bus.raw_spine();
        let seat = seat.clone();
        let reason = parking.reason.to_string();
        let outcome = parking.outcome;
        let at = parking.at;
        let registry = self.registry.clone();
        self.event_bus
            .publish_committed_batch(async move {
                let _native_guard = guard;
                if let Some((actor, roles)) = operator {
                    let caller_live = registry
                        .get(&actor)
                        .await?
                        .is_some_and(|caller| caller.tombstoned_at.is_none());
                    let current = registry
                        .get(&seat)
                        .await?
                        .ok_or_else(|| native_refusal("operator recipient no longer exists"))?;
                    let prime = roles.read_role(&actor).await?.as_deref() == Some("prime");
                    if !caller_live
                        || current.tombstoned_at.is_some()
                        || (!prime && current.parent.as_ref() != Some(&actor))
                    {
                        return Err(PijError::GovernanceRefused {
                            code: "E-RS-OWNERSHIP".into(),
                            record: serde_json::json!({
                                "caller":actor,"seat":seat,"parent":current.parent,
                            })
                            .to_string(),
                        });
                    }
                    if !matches!(current.harness, Harness::Omp | Harness::Pi) {
                        return Err(native_refusal(
                            "operator release requires an extension-stream body recipient",
                        ));
                    }
                }
                let evidence = pij_core::ports::ParkingEvidence {
                    outcome,
                    reason: &reason,
                    at,
                };
                let (job, events) = queue
                    .park_delivery(job_id, &seat, attempt, &evidence, spine.as_ref())
                    .await?;
                job.ok_or_else(|| {
                    native_refusal("job is not the named running head or its claim changed")
                })?;
                Ok((events, ()))
            })
            .await?;
        Ok(())
    }

    /// Record `ReaderRead` and return the authority-owned job identity committed.
    ///
    /// # Errors
    /// Queue, clock, or audit publication failures; an id that is not a running delivery claim.
    pub async fn acknowledge_inbox(
        &self,
        seat: &SeatId,
        job_id: JobId,
        identity: &NativeInboxIdentity,
        control_outcome: Option<&ControlOutcome>,
    ) -> Result<DeliveryAck> {
        let _native_guard = self.native_lock.lock().await;
        let job = self
            .queue
            .claimed_delivery(job_id)
            .await?
            .ok_or_else(|| PijError::Adapter {
                adapter: "daemon/delivery".into(),
                message: format!("job {} is not a running delivery claim", job_id.0),
            })?;
        let recipient = SeatId::from(job.serial_key);
        let payload: ClaimedPayload =
            serde_json::from_str(&job.payload).map_err(|error| PijError::Adapter {
                adapter: "daemon/delivery".into(),
                message: format!("invalid delivery claim: {error}"),
            })?;
        let control = payload.message.command.as_deref();
        if control.is_some() != control_outcome.is_some() {
            return Err(PijError::Adapter {
                adapter: "daemon/delivery".into(),
                message:
                    "command claims require an execution outcome; body claims cannot carry one"
                        .into(),
            });
        }
        if control.is_some() {
            let target = self.registry.get(&recipient).await?;
            if seat != &recipient
                || !target
                    .is_some_and(|target| matches!(target.harness, Harness::Omp | Harness::Pi))
            {
                return Err(PijError::Adapter {
                    adapter: "daemon/delivery".into(),
                    message: "control outcome must name its extension-stream recipient".into(),
                });
            }
        }
        if self
            .inbox_recipient(&recipient, identity)
            .await?
            .is_some_and(|seat| seat.harness == Harness::Copilot || identity.supplied())
        {
            if seat != &recipient {
                return Err(native_refusal(
                    "native acknowledgement seat must match the claimed job recipient",
                ));
            }
            if let Some(reason) =
                native_target_mismatch(payload.native_target_session.as_deref(), identity)
            {
                return Err(native_refusal(reason));
            }
            let message = &payload.message;
            if message.to != recipient
                || job.kind != delivery_kind(&recipient)
                || message.command.is_some()
            {
                return Err(native_refusal(
                    "native acknowledgement does not match a valid body claim",
                ));
            }
        }
        let _delivery_order = self.event_bus.socket_delivery_order.lock().await;
        if let Some(outcome @ ControlOutcome::Refused { reason }) = control_outcome {
            // Refusal is observed before the queue ACK. Persist that terminal
            // answer first so an ambiguous ACK never turns an identical request
            // into a new destructive operation after the runtime becomes armed.
            publish_outcome_with_control(
                &self.event_bus,
                &recipient,
                &Receipt {
                    msg_id: payload.message.msg_id.clone(),
                    outcome: DeliveryOutcome::Refused {
                        reason: reason.clone(),
                    },
                    at: (self.clock)()?,
                },
                "extension-stream",
                Some(outcome),
            )
            .await?;
            self.queue.ack(job_id, Outcome::Done).await?;
            return Ok(DeliveryAck {
                recipient,
                msg_id: payload.message.msg_id,
                origin: DeliveryOrigin::ReaderRead,
            });
        }
        let ack = self
            .queue
            .ack_delivery(job_id, DeliveryOrigin::ReaderRead)
            .await?;
        drop(_native_guard);
        let at = (self.clock)()?;
        publish_socket_released(&self.event_bus, &ack.recipient, &ack.msg_id, at).await?;
        publish_outcome_with_control(
            &self.event_bus,
            &ack.recipient,
            &Receipt {
                msg_id: ack.msg_id.clone(),
                outcome: DeliveryOutcome::Delivered { origin: ack.origin },
                at,
            },
            if control.is_some() {
                "extension-stream"
            } else {
                "inbox"
            },
            control_outcome,
        )
        .await?;
        Ok(ack)
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

    pub(crate) fn next_message_id(&self) -> String {
        let sequence = self.next_id.fetch_add(1, Ordering::Relaxed);
        format!("{:016x}-{sequence:016x}", self.id_prefix)
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
            command: msg.command.as_deref(),
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
        publish_delivery_outcome(&self.event_bus, seat, receipt, self.transport.name()).await
    }
}

fn inbox_snapshot(
    seat: &SeatId,
    job_id: JobId,
    job: Job,
    outcome: Option<DeliveryFailure>,
) -> Result<InboxClaim> {
    let message: Msg = serde_json::from_str(&job.payload)
        .map_err(|error| native_refusal(format!("invalid delivery payload: {error}")))?;
    if &message.to != seat || job.serial_key != seat.as_str() {
        return Err(native_refusal(format!(
            "inbox row for {} (serial {}) does not belong to {seat}",
            message.to, job.serial_key,
        )));
    }
    Ok(InboxClaim {
        job_id,
        message,
        attempt: job.attempt,
        state: outcome.map(|_| "failed".into()),
        outcome,
        native_consumer: None,
    })
}

pub(crate) async fn publish_delivery_outcome(
    event_bus: &EventBus,
    seat: &SeatId,
    receipt: &Receipt,
    transport: &str,
) -> Result<()> {
    publish_outcome_with_control(event_bus, seat, receipt, transport, None).await
}

async fn publish_outcome_with_control(
    event_bus: &EventBus,
    seat: &SeatId,
    receipt: &Receipt,
    transport: &str,
    control_outcome: Option<&ControlOutcome>,
) -> Result<()> {
    let transport = match &receipt.outcome {
        DeliveryOutcome::Delivered {
            origin: DeliveryOrigin::TypedToPane,
        } => "tmux",
        _ => transport,
    };
    let payload = serde_json::to_string(&OutcomeEvent {
        msg_id: &receipt.msg_id,
        outcome: &receipt.outcome,
        transport,
        control_outcome,
    })
    .map_err(|error| PijError::Adapter {
        adapter: "daemon/delivery".to_string(),
        message: format!("could not encode receipt {}: {error}", receipt.msg_id),
    })?;
    event_bus
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

/// Frozen held payload with additive pane evidence from the owned-input verdict.
#[derive(Serialize)]
struct DeliveryHeldEvent<'a> {
    #[serde(flatten)]
    held: HeldEvent,
    last_edit_at: Option<u64>,
    remaining_ms: Option<u64>,
    draft_sha: Option<&'a str>,
}

pub(crate) async fn publish_delivery_held(
    event_bus: &EventBus,
    msg: &Msg,
    reason: DeliveryDeferralReason,
    draft_sha: Option<&str>,
    at: u64,
) -> Result<()> {
    let payload = serde_json::to_string(&DeliveryHeldEvent {
        held: HeldEvent {
            msg_id: msg.msg_id.clone(),
            seat: msg.to.clone(),
            reason: reason.as_str().to_string(),
            // Staged submission returns the authoritative reason and draft hash,
            // not edit age. Zero denotes unavailable timing without re-observation.
            since_ms: 0,
        },
        last_edit_at: None,
        remaining_ms: None,
        draft_sha,
    })
    .map_err(|error| PijError::Adapter {
        adapter: "daemon/delivery".to_string(),
        message: format!("could not encode delivery hold {}: {error}", msg.msg_id),
    })?;
    event_bus
        .publish(Event {
            seq: None,
            v: 1,
            at,
            kind: "delivery.held".to_string(),
            seat: Some(msg.to.clone()),
            payload,
        })
        .await?;
    Ok(())
}

/// Close an outstanding hold only after delivery and authority acknowledgement succeed.
pub(crate) async fn publish_socket_released(
    event_bus: &EventBus,
    seat: &SeatId,
    msg_id: &str,
    at: u64,
) -> Result<()> {
    let Some(held) = event_bus
        .latest_matching_message(seat, "delivery.held", msg_id)
        .await?
    else {
        return Ok(());
    };
    let released = event_bus
        .latest_matching_message(seat, "delivery.released", msg_id)
        .await?;
    if released.is_some_and(|released| released.seq >= held.seq) {
        return Ok(());
    }
    let payload = serde_json::to_string(&ReleasedEvent {
        msg_id: msg_id.to_string(),
        seat: seat.clone(),
        at_ms: at,
    })
    .map_err(|error| PijError::Adapter {
        adapter: "daemon/delivery".to_string(),
        message: format!("could not encode socket release {msg_id}: {error}"),
    })?;
    event_bus
        .publish(Event {
            seq: None,
            v: 1,
            at,
            kind: "delivery.released".to_string(),
            seat: Some(seat.clone()),
            payload,
        })
        .await?;
    Ok(())
}

#[derive(Serialize)]
struct DeliveryPayload<'a> {
    #[serde(flatten)]
    message: &'a Msg,
    #[serde(skip_serializing_if = "Option::is_none")]
    native_target_session: Option<&'a str>,
}

#[derive(Deserialize)]
struct ClaimedPayload {
    #[serde(flatten)]
    message: Msg,
    #[serde(default)]
    native_target_session: Option<String>,
}

fn native_target_mismatch(target: Option<&str>, identity: &NativeInboxIdentity) -> Option<String> {
    target.filter(|target| Some(*target) != identity.native_session.as_deref()).map(|target| format!(
        "native-target-session:{target}; resume that native session or use a new seat and intentionally reissue the message"
    ))
}

fn delivery_job(msg: &Msg, recipient: Option<&SeatDescriptor>) -> Result<Job> {
    let native_target_session = recipient
        .filter(|seat| {
            (seat.harness == Harness::Copilot && seat.native_extension_delivery)
                || paneless_pull(seat)
        })
        .and_then(|seat| seat.harness_session.as_deref());
    let payload = serde_json::to_string(&DeliveryPayload {
        message: msg,
        native_target_session,
    })
    .map_err(|error| PijError::Adapter {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<&'a str>,
}

#[derive(Serialize)]
struct OutcomeEvent<'a> {
    msg_id: &'a str,
    outcome: &'a DeliveryOutcome,
    transport: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    control_outcome: Option<&'a ControlOutcome>,
}

/// Where a message came from, which decides whether it may reach a transport.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Arrival {
    /// A client on this machine. Routed normally.
    Local,
    /// Caller-authorized control, including a self-target.
    Control,
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
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    use pij_core::delivery::{MAX_TYPED_FRAME_BYTES, delivery_kind};
    use pij_core::error::PijError;
    use pij_core::events::EventFilter;
    use pij_core::framing::frame_message;
    use pij_core::model::{
        DeliveryOrigin, DeliveryOutcome, Event, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId,
        SemanticState, Seq, SystemState,
    };
    use pij_core::model::{Pane, PaneProcess};
    use pij_core::ports::{
        DeliveryEnqueue, LaunchCommand, Queue, Registry, Spine, StagedSubmit, TmuxPort, Transport,
    };
    use pij_harnesses::InteractionGate;
    use pij_testkit::fakes::{
        CountingSpine, FakeLiveness, FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport,
    };
    use serde_json::Value;
    use tokio::sync::Notify;
    use tokio_stream::StreamExt;

    use super::{
        DeliveryService, DeliverySources, NativeInboxIdentity, OUTCOME_EVENT_KIND,
        PUSHED_EVENT_KIND, delivery_job,
    };
    use crate::events::EventBus;
    use crate::pointer::{POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND};

    const INBOX_CLAIM_WIRE: &str = include_str!("../../tests/fixtures/inbox-claim.wire.json");
    fn body_for_frame_size(from: &SeatId, bytes: usize) -> String {
        let overhead = frame_message(from, None, "").len();
        assert!(bytes >= overhead);
        "x".repeat(bytes - overhead)
    }

    /// Suspend one exact capture, before or after the durable queue claim.
    struct BlockingCapture {
        inner: Arc<FakeTmux>,
        block_at: usize,
        captures: AtomicUsize,
        entered: Notify,
        release: Notify,
    }

    #[async_trait::async_trait]
    impl TmuxPort for BlockingCapture {
        async fn list_panes(&self) -> pij_core::error::Result<Vec<Pane>> {
            self.inner.list_panes().await
        }
        async fn pane_process(&self, pane: &str) -> pij_core::error::Result<Option<PaneProcess>> {
            self.inner.pane_process(pane).await
        }
        async fn acquire_submit(&self, pane: &str) -> pij_core::error::Result<StagedSubmit> {
            self.inner.acquire_submit(pane).await
        }
        async fn stage_submit(
            &self,
            staged: &mut StagedSubmit,
            text: &str,
        ) -> pij_core::error::Result<()> {
            self.inner.stage_submit(staged, text).await
        }
        async fn commit_submit(&self, staged: &StagedSubmit) -> pij_core::error::Result<()> {
            self.inner.commit_submit(staged).await
        }
        async fn abort_submit(&self, staged: &StagedSubmit) -> pij_core::error::Result<()> {
            self.inner.abort_submit(staged).await
        }
        async fn submit(&self, pane: &str, text: &str) -> pij_core::error::Result<()> {
            self.inner.submit(pane, text).await
        }
        async fn send_keys(&self, pane: &str, keys: &str) -> pij_core::error::Result<()> {
            self.inner.send_keys(pane, keys).await
        }
        async fn capture(&self, pane: &str, lines: u32) -> pij_core::error::Result<String> {
            if self.captures.fetch_add(1, Ordering::SeqCst) + 1 == self.block_at {
                self.entered.notify_one();
                self.release.notified().await;
            }
            self.inner.capture(pane, lines).await
        }
        async fn attach_pane_tap(&self, pane: &str, sink: &Path) -> pij_core::error::Result<()> {
            self.inner.attach_pane_tap(pane, sink).await
        }
        async fn pane_tap_sink(&self, pane: &str) -> pij_core::error::Result<Option<PathBuf>> {
            self.inner.pane_tap_sink(pane).await
        }
        async fn drain_pane_tap(&self, pane: &str) -> pij_core::error::Result<Vec<u8>> {
            self.inner.drain_pane_tap(pane).await
        }
        async fn detach_pane_tap(&self, pane: &str) -> pij_core::error::Result<()> {
            self.inner.detach_pane_tap(pane).await
        }
        async fn kill(&self, pane: &str) -> pij_core::error::Result<()> {
            self.inner.kill(pane).await
        }
        async fn new_window(
            &self,
            session: &str,
            name: &str,
            cwd: &str,
            command: Option<&LaunchCommand>,
        ) -> pij_core::error::Result<Pane> {
            self.inner.new_window(session, name, cwd, command).await
        }
        async fn user_typing(&self, pane: &str) -> pij_core::error::Result<bool> {
            self.inner.user_typing(pane).await
        }
    }

    #[tokio::test(start_paused = true)]
    async fn blocked_native_typing_snapshot_allows_unrelated_ack_and_revalidates_owner() {
        for claimed in [false, true] {
            // Observation owns no queue row, including while another reader
            // ACKs or reclaims the exact job during the slow pane capture.
            for change in 0..if claimed { 8 } else { 6 } {
                let mut fixture = fixture_with_gate(
                    FakeTransport::unreachable(),
                    FakeTmux::new().with_clear_composer("%137"),
                );
                let observer = Arc::new(BlockingCapture {
                    inner: fixture.tmux.clone(),
                    block_at: 1,
                    captures: AtomicUsize::new(0),
                    entered: Notify::new(),
                    release: Notify::new(),
                });
                fixture.interaction = Arc::new(InteractionGate::new(observer.clone()));
                fixture.service = Arc::new(
                    DeliveryService::new(
                        fixture.registry.clone(),
                        fixture.queue.clone(),
                        fixture.transport.clone(),
                        fixture.interaction.clone(),
                        Arc::new(EventBus::new(fixture.spine.clone(), 16).expect("bus")),
                    )
                    .expect("delivery"),
                );
                let mut recipient = bound("pij-native");
                recipient.harness = Harness::Copilot;
                recipient.pane = Some("%137".to_string());
                recipient.harness_session = Some("native-session".to_string());
                recipient.native_extension_delivery = true;
                let identity = NativeInboxIdentity {
                    native_session: recipient.harness_session.clone(),
                    pid: Some(7),
                    proc_start: Some(11),
                };
                register(&fixture, recipient.clone()).await;
                fixture
                    .service
                    .send("pij-peer".into(), recipient.id.clone(), "native body")
                    .await
                    .expect("enqueue native");
                let (job_id, _) = fixture
                    .queue
                    .peek(&[delivery_kind(&recipient.id)])
                    .await
                    .expect("queue")
                    .expect("native body");
                if claimed {
                    let page = fixture
                        .service
                        .claim_native_inbox(&recipient.id, false, &identity)
                        .await
                        .expect("claim never waits for the sensor");
                    assert_eq!(page.claims[0].job_id, job_id);
                }
                let pending =
                    fixture
                        .service
                        .native_typing_snapshot(&recipient.id, &identity, 60_000);
                tokio::pin!(pending);
                tokio::select! {
                    _ = observer.entered.notified() => {}
                    result = &mut pending => panic!("capture did not block: {result:?}"),
                }
                for harness in [Harness::Omp, Harness::Pi] {
                    let reader = SeatDescriptor::new(
                        format!("pij-{}", harness.as_str()),
                        harness,
                        "/isolated/reader",
                    );
                    register(&fixture, reader.clone()).await;
                    fixture
                        .service
                        .send("pij-peer".into(), reader.id.clone(), "unrelated")
                        .await
                        .expect("enqueue reader");
                    tokio::time::timeout(Duration::from_secs(1), async {
                        let claims = fixture
                            .service
                            .claim_inbox(&reader.id, false)
                            .await
                            .expect("unrelated claim");
                        assert_eq!(claims.len(), 1);
                        fixture
                            .service
                            .acknowledge_inbox(
                                &reader.id,
                                claims[0].job_id,
                                &Default::default(),
                                None,
                            )
                            .await
                            .expect("unrelated ack");
                    })
                    .await
                    .expect("unrelated reader progresses while native consent is blocked");
                }
                {
                    let _guard = fixture.service.native_lock.lock().await;
                    match change {
                        0 | 6 | 7 => {}
                        1 => recipient.semantic_state = Some(SemanticState::Hold),
                        2 => recipient.native_extension_delivery = false,
                        3 => recipient.proc.as_mut().expect("native proc").proc_start += 1,
                        4 => recipient.pane = Some("%replacement".to_string()),
                        5 => recipient.harness_session = Some("replacement-session".to_string()),
                        _ => unreachable!(),
                    }
                    fixture
                        .registry
                        .put(recipient.clone())
                        .await
                        .expect("lifecycle mutation");
                }
                if change == 6 {
                    fixture
                        .service
                        .acknowledge_inbox(&recipient.id, job_id, &identity, None)
                        .await
                        .expect("current tuple may acknowledge");
                }
                if change == 7 {
                    // Requeue advances the same attempt field as lease expiry.
                    fixture
                        .queue
                        .retry(job_id, Duration::ZERO)
                        .await
                        .expect("release old attempt");
                    let next = fixture
                        .service
                        .claim_native_inbox(&recipient.id, false, &identity)
                        .await
                        .expect("new consumer claims next attempt");
                    assert_eq!(next.claims[0].job_id, job_id);
                }
                let pending_before = fixture
                    .queue
                    .peek(&[delivery_kind(&recipient.id)])
                    .await
                    .unwrap();
                let running_before = fixture.queue.claimed_delivery(job_id).await.unwrap();
                observer.release.notify_one();
                let result = pending.await;
                match change {
                    2 | 3 | 5 => assert!(result.is_err(), "changed owner must refuse: {change}"),
                    4 => assert!(matches!(
                        result.unwrap().observation,
                        super::NativeTypingObservation::Unavailable { .. }
                    )),
                    _ => {
                        let snapshot = result.unwrap();
                        assert_eq!(snapshot.native_consumer, identity);
                        assert_eq!(snapshot.semantic_hold, change == 1);
                        assert!(matches!(
                            snapshot.observation,
                            super::NativeTypingObservation::Observed {
                                retry_after_ms: 0,
                                ..
                            }
                        ));
                    }
                }
                assert_eq!(
                    fixture
                        .queue
                        .peek(&[delivery_kind(&recipient.id)])
                        .await
                        .unwrap(),
                    pending_before
                );
                assert_eq!(
                    fixture.queue.claimed_delivery(job_id).await.unwrap(),
                    running_before,
                    "a sensor may not mutate the old or successor attempt"
                );
                if change == 1 {
                    let held = fixture
                        .service
                        .claim_native_inbox(&recipient.id, false, &identity)
                        .await
                        .unwrap();
                    assert!(held.claims.is_empty());
                    assert_eq!(held.held_reason.as_deref(), Some("semantic-hold"));
                }
                assert_eq!(observer.captures.load(Ordering::SeqCst), 1);
            }
        }
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
            .enqueue(delivery_job(&msg, None).expect("delivery job"))
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
    #[tokio::test]
    async fn peek_inbox_preserves_delivery_and_rejects_misdirected_payloads() {
        let fixture = fixture(FakeTransport::unreachable());
        let recipient = SeatId::from("pij-peek-reader");
        let message = Msg {
            from: SeatId::from("pij-sender"),
            to: recipient.clone(),
            body: "observe only".to_string(),
            msg_id: "peek-1".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };
        fixture
            .queue
            .enqueue(delivery_job(&message, None).expect("delivery job"))
            .await
            .expect("enqueue message");

        let peeked = fixture
            .service
            .peek_inbox(&recipient)
            .await
            .expect("peek message");
        assert_eq!(peeked.len(), 1);
        assert_eq!(peeked[0].message, message);
        assert!(
            fixture.queue.acked().is_empty(),
            "peek mutates no queue row"
        );
        let claimed = fixture
            .service
            .claim_inbox(&recipient, false)
            .await
            .expect("message remains claimable");
        assert_eq!(claimed[0].message, message);

        let wrong_recipient = SeatId::from("pij-wrong-reader");
        let misdirected = Msg {
            to: recipient.clone(),
            msg_id: "peek-2".to_string(),
            ..message
        };
        let mut wrong_kind = delivery_job(&misdirected, None).expect("delivery job");
        wrong_kind.kind = delivery_kind(&wrong_recipient);
        fixture
            .queue
            .enqueue(wrong_kind)
            .await
            .expect("enqueue misdirected message");
        let live_before = fixture.queue.live_len();
        let error = fixture
            .service
            .peek_inbox(&wrong_recipient)
            .await
            .expect_err("misdirected payload must refuse");
        assert!(error.to_string().contains(recipient.as_str()), "{error}");
        assert_eq!(
            fixture.queue.live_len(),
            live_before,
            "refusal leaves rows untouched"
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
        let mut seat = SeatDescriptor::new(id, Harness::Claude, "/abs/tree");
        seat.proc = Some(ProcIdentity {
            pid: 7,
            proc_start: 11,
        });
        seat
    }

    fn queued_outcome(reason: &str, next_retry_at: u64) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: Some(reason.to_string()),
            next_retry_at: Some(next_retry_at),
            draft_sha: None,
        }
    }

    fn queued_draft_outcome(next_retry_at: u64) -> DeliveryOutcome {
        DeliveryOutcome::Queued {
            reason: Some("human-typing".to_string()),
            next_retry_at: Some(next_retry_at),
            draft_sha: Some("2cf24dba5fb0".to_string()),
        }
    }

    async fn register(fixture: &Fixture, seat: SeatDescriptor) {
        fixture.registry.put(seat).await.expect("register seat");
    }

    #[tokio::test]
    async fn command_claim_cannot_be_acked_without_execution_outcome() {
        let fixture = fixture(FakeTransport::unreachable());
        let mut recipient = bound("pij-control-reader");
        recipient.harness = Harness::Omp;
        recipient.pane = Some("%control".into());
        register(&fixture, recipient.clone()).await;
        fixture
            .service
            .accept(Msg {
                from: "pij-sender".into(),
                to: recipient.id.clone(),
                body: String::new(),
                msg_id: "control-without-outcome".into(),
                from_machine: None,
                in_reply_to: None,
                command: Some("compact".into()),
            })
            .await
            .expect("queued control");
        let claims = fixture
            .service
            .claim_inbox(&recipient.id, false)
            .await
            .expect("claim");
        assert_eq!(claims[0].message.command.as_deref(), Some("compact"));
        let result = fixture
            .service
            .acknowledge_inbox(&recipient.id, claims[0].job_id, &Default::default(), None)
            .await;
        assert!(result.is_err(), "decoding a command is not executing it");
        assert!(fixture.queue.acked().is_empty());
    }

    #[tokio::test]
    async fn command_execution_ack_records_extension_outcome_and_self_target() {
        use pij_core::control::ControlOutcome;
        for harness in [Harness::Omp, Harness::Pi] {
            for outcome in [
                ControlOutcome::Executed,
                ControlOutcome::Refused {
                    reason: "runtime unavailable".into(),
                },
            ] {
                let fixture = fixture(FakeTransport::reachable());
                let mut recipient = bound("pij-self-control");
                recipient.harness = harness;
                recipient.pane = Some("%control".into());
                register(&fixture, recipient.clone()).await;
                fixture
                    .service
                    .accept_control(Msg {
                        from: recipient.id.clone(),
                        to: recipient.id.clone(),
                        body: String::new(),
                        msg_id: "self-control".into(),
                        from_machine: None,
                        in_reply_to: None,
                        command: Some("compact".into()),
                    })
                    .await
                    .expect("self control accepted");
                let claims = fixture
                    .service
                    .claim_inbox(&recipient.id, false)
                    .await
                    .expect("claim");
                let id = claims[0].job_id;
                fixture
                    .service
                    .acknowledge_inbox(&recipient.id, id, &Default::default(), Some(&outcome))
                    .await
                    .expect("ack");
                assert_eq!(
                    fixture.queue.acked(),
                    [(id, pij_core::model::Outcome::Done)]
                );
                assert!(
                    fixture.transport.calls().is_empty(),
                    "extension does not use pane/socket transport"
                );
                let events = fixture
                    .spine
                    .tail(Some(&recipient.id), Seq(0))
                    .await
                    .expect("events");
                let pushed: Value = serde_json::from_str(&events[0].payload).expect("pushed");
                assert_eq!(pushed["command"], "compact");
                let event = events.last().expect("outcome event");
                assert_eq!(event.kind, "delivery.outcome");
                let payload: Value = serde_json::from_str(&event.payload).expect("outcome");
                assert_eq!(payload["transport"], "extension-stream");
                assert_eq!(
                    payload["control_outcome"],
                    serde_json::to_value(&outcome).expect("outcome json")
                );
                assert_eq!(
                    payload["outcome"]["outcome"],
                    if matches!(outcome, ControlOutcome::Executed) {
                        "delivered"
                    } else {
                        "refused"
                    }
                );
            }
        }
    }

    #[tokio::test]
    async fn refused_control_id_replays_refusal_without_executing_again() {
        let fixture = fixture(FakeTransport::unreachable());
        let mut recipient = bound("pij-refused-control");
        recipient.harness = Harness::Omp;
        recipient.pane = Some("%control".into());
        register(&fixture, recipient.clone()).await;
        let msg = Msg {
            from: recipient.id.clone(),
            to: recipient.id.clone(),
            body: String::new(),
            msg_id: "refused-once".into(),
            from_machine: None,
            in_reply_to: None,
            command: Some("new".into()),
        };
        fixture
            .service
            .accept_control(msg.clone())
            .await
            .expect("admission");
        let claims = fixture
            .service
            .claim_inbox(&recipient.id, false)
            .await
            .expect("claim");
        fixture
            .service
            .acknowledge_inbox(
                &recipient.id,
                claims[0].job_id,
                &Default::default(),
                Some(&pij_core::control::ControlOutcome::Refused {
                    reason: "not armed".into(),
                }),
            )
            .await
            .expect("refusal ack");
        let replay = fixture.service.accept_control(msg).await.expect("replay");
        assert_eq!(
            replay.outcome,
            DeliveryOutcome::Refused {
                reason: "not armed".into()
            }
        );
        assert!(
            fixture
                .service
                .claim_inbox(&recipient.id, false)
                .await
                .expect("no replay claim")
                .is_empty()
        );
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

    struct BlockingHeldSpine {
        inner: Arc<FakeSpine>,
        held_appends: AtomicUsize,
        entered: Notify,
        release: Notify,
    }

    #[async_trait::async_trait]
    impl Spine for BlockingHeldSpine {
        async fn append(&self, event: Event) -> pij_core::error::Result<Seq> {
            if event.kind == "delivery.held"
                && self.held_appends.fetch_add(1, Ordering::SeqCst) == 0
            {
                self.entered.notify_one();
                self.release.notified().await;
            }
            self.inner.append(event).await
        }

        async fn tail(
            &self,
            seat: Option<&SeatId>,
            since: Seq,
        ) -> pij_core::error::Result<Vec<Event>> {
            self.inner.tail(seat, since).await
        }

        async fn latest_matching(
            &self,
            seat: &SeatId,
            kinds: &[&str],
        ) -> pij_core::error::Result<Option<Event>> {
            self.inner.latest_matching(seat, kinds).await
        }

        async fn latest_matching_message(
            &self,
            seat: &SeatId,
            kind: &str,
            msg_id: &str,
        ) -> pij_core::error::Result<Option<Event>> {
            self.inner.latest_matching_message(seat, kind, msg_id).await
        }
    }

    struct NotifyingSocketTransport {
        inner: Arc<FakeTransport>,
        accepted: Notify,
    }

    #[async_trait::async_trait]
    impl Transport for NotifyingSocketTransport {
        fn name(&self) -> &str {
            self.inner.name()
        }

        async fn can_deliver(
            &self,
            seat: &SeatDescriptor,
            msg: &Msg,
        ) -> pij_core::error::Result<bool> {
            self.inner.can_deliver(seat, msg).await
        }

        async fn deliver(
            &self,
            seat: &SeatDescriptor,
            msg: &Msg,
        ) -> pij_core::error::Result<DeliveryOutcome> {
            let outcome = self.inner.deliver(seat, msg).await;
            self.accepted.notify_one();
            outcome
        }
    }

    #[tokio::test]
    async fn typed_hold_initial_admission_audit_precedes_concurrent_socket_completion() {
        let fixture = fixture_with_gate(FakeTransport::unreachable(), typing_pane("%108"));
        let mut recipient = bound("pij-admission-order");
        recipient.pane = Some("%108".into());
        register(&fixture, recipient.clone()).await;
        let spine = Arc::new(BlockingHeldSpine {
            inner: fixture.spine.clone(),
            held_appends: AtomicUsize::new(0),
            entered: Notify::new(),
            release: Notify::new(),
        });
        let bus = Arc::new(EventBus::new(spine.clone(), 16).expect("blocking bus"));
        let transport = Arc::new(NotifyingSocketTransport {
            inner: Arc::new(FakeTransport::reachable()),
            accepted: Notify::new(),
        });
        let service = DeliveryService::with_sources(
            fixture.registry.clone(),
            fixture.queue.clone(),
            fixture.transport.clone(),
            fixture.interaction.clone(),
            bus.clone(),
            DeliverySources {
                id_prefix: 1,
                clock: Arc::new(|| Ok(1_234)),
            },
        );
        let worker = crate::pointer::DrainWorker::new(
            fixture.registry.clone(),
            fixture.queue.clone(),
            transport.clone(),
            fixture.tmux.clone(),
            fixture.interaction.clone(),
            bus,
            crate::pointer::PointerPolicy {
                cadence: Duration::from_secs(90),
                announcement_limit: 3,
            },
        )
        .expect("concurrent worker");
        let admission = service.send(
            "pij-from".into(),
            recipient.id.clone(),
            "admission ordering",
        );
        tokio::pin!(admission);
        tokio::select! {
            _ = spine.entered.notified() => {}
            result = &mut admission => panic!("admission did not pause before held append: {result:?}"),
        }
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "row is visible before its held event"
        );
        assert!(fixture.spine.is_empty(), "held publication is still paused");

        let drain = worker.drain_once();
        tokio::pin!(drain);
        tokio::select! {
            _ = transport.accepted.notified() => {}
            result = &mut drain => panic!("worker completed before admission audit: {result:?}"),
        }
        assert_eq!(
            transport.inner.delivered().len(),
            1,
            "transport runs outside the audit ordering lock"
        );
        assert!(
            fixture.queue.acked().is_empty(),
            "worker completion must wait for the initial admission audit"
        );

        spine.release.notify_one();
        let (receipt, drained) = tokio::join!(&mut admission, &mut drain);
        let receipt = receipt.expect("admission completes");
        assert_eq!(receipt.outcome, queued_draft_outcome(0));
        assert_eq!(drained.expect("worker completion"), 1);
        assert_eq!(fixture.queue.live_len(), 0);
        let events = fixture
            .spine
            .tail(Some(&recipient.id), Seq(0))
            .await
            .expect("ordered lifecycle");
        assert_eq!(
            events
                .iter()
                .map(|event| event.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "delivery.held",
                "message.pushed",
                "delivery.outcome",
                "delivery.released",
                "delivery.outcome"
            ],
        );
        let queued: Value = serde_json::from_str(&events[2].payload).expect("queued outcome");
        let released: Value = serde_json::from_str(&events[3].payload).expect("released payload");
        let delivered: Value = serde_json::from_str(&events[4].payload).expect("delivered outcome");
        assert_eq!(queued["msg_id"], receipt.msg_id);
        assert_eq!(queued["outcome"]["outcome"], "queued");
        assert_eq!(released["msg_id"], receipt.msg_id);
        assert_eq!(delivered["msg_id"], receipt.msg_id);
        assert_eq!(delivered["outcome"]["outcome"], "delivered");
        assert_eq!(delivered["outcome"]["origin"], "injected-to-transport");
        assert!(
            events[0].seq < events[3].seq,
            "the hold is closed, never orphaned by a late admission event"
        );
    }

    #[tokio::test]
    async fn typed_hold_manual_inbox_ack_releases_hold_with_reader_read_outcome() {
        let fixture = fixture_with_gate(FakeTransport::unreachable(), typing_pane("%108"));
        let mut recipient = bound("pij-manual-inbox");
        recipient.pane = Some("%108".into());
        register(&fixture, recipient.clone()).await;
        let receipt = fixture
            .service
            .send(
                "pij-from".into(),
                recipient.id.clone(),
                "manually read typed-held body",
            )
            .await
            .expect("send-keys veto queues");
        assert_eq!(receipt.outcome, queued_draft_outcome(0));
        let claims = fixture
            .service
            .claim_inbox(&recipient.id, false)
            .await
            .expect("manual inbox claim");
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].message.msg_id, receipt.msg_id);
        let ack = fixture
            .service
            .acknowledge_inbox(
                &recipient.id,
                claims[0].job_id,
                &NativeInboxIdentity::default(),
                None,
            )
            .await
            .expect("manual read acknowledgement");
        assert_eq!(ack.recipient, recipient.id);
        assert_eq!(ack.msg_id, receipt.msg_id);
        assert_eq!(ack.origin, DeliveryOrigin::ReaderRead);
        assert_eq!(fixture.queue.live_len(), 0);
        assert!(
            fixture.transport.delivered().is_empty(),
            "reader receipt is not a socket injection"
        );
        let events = fixture
            .spine
            .tail(Some(&ack.recipient), Seq(0))
            .await
            .expect("reader lifecycle");
        let lifecycle: Vec<_> = events
            .iter()
            .filter(|event| event.kind.starts_with("delivery."))
            .collect();
        assert_eq!(
            lifecycle
                .iter()
                .map(|event| event.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "delivery.held",
                "delivery.outcome",
                "delivery.released",
                "delivery.outcome"
            ],
        );
        let released: Value = serde_json::from_str(&lifecycle[2].payload).expect("released");
        assert_eq!(released["msg_id"], ack.msg_id);
        assert_eq!(released["seat"], ack.recipient.as_str());
        assert_eq!(released["at_ms"], lifecycle[2].at);
        let outcome: Value = serde_json::from_str(&lifecycle[3].payload).expect("reader outcome");
        assert_eq!(outcome["msg_id"], ack.msg_id);
        assert_eq!(outcome["outcome"]["outcome"], "delivered");
        assert_eq!(outcome["outcome"]["origin"], "reader-read");
    }

    #[tokio::test]
    async fn typed_hold_is_released_by_worker_after_clear() {
        let fixture = fixture_with_gate(FakeTransport::unreachable(), typing_pane("%108"));
        let mut recipient = bound("pij-initial-hold");
        recipient.pane = Some("%108".to_string());
        register(&fixture, recipient.clone()).await;
        let receipt = fixture
            .service
            .send("pij-from".into(), recipient.id.clone(), "queued pane body")
            .await
            .expect("initial veto queues");
        assert_eq!(receipt.outcome, queued_draft_outcome(0));
        assert!(fixture.transport.delivered().is_empty());
        let events = fixture
            .spine
            .tail(Some(&recipient.id), Seq(0))
            .await
            .expect("initial events");
        let held = events
            .iter()
            .find(|event| event.kind == "delivery.held")
            .expect("send-keys veto publishes held");
        let payload: Value = serde_json::from_str(&held.payload).expect("held payload");
        assert_eq!(payload["msg_id"], receipt.msg_id);
        assert_eq!(payload["seat"], recipient.id.as_str());
        assert_eq!(payload["reason"], "human-typing");
        assert_eq!(payload["draft_sha"], "2cf24dba5fb0");
        assert_eq!(payload["since_ms"], 0);
        assert!(payload["last_edit_at"].is_null());
        assert!(payload["remaining_ms"].is_null());
        assert!(events.iter().all(|event| event.kind != "delivery.released"));

        let worker = crate::pointer::DrainWorker::new(
            fixture.registry.clone(),
            fixture.queue.clone(),
            fixture.transport.clone(),
            fixture.tmux.clone(),
            fixture.interaction.clone(),
            fixture.service.event_bus.clone(),
            crate::pointer::PointerPolicy {
                cadence: Duration::from_secs(90),
                announcement_limit: 3,
            },
        )
        .expect("worker sharing initial dispatch gate and spine");
        fixture.tmux.arrange_clear_composer("%108");
        assert_eq!(
            worker
                .drain_once()
                .await
                .expect("clear delivers queued pane body"),
            1
        );
        assert!(fixture.transport.delivered().is_empty());
        assert_eq!(fixture.queue.live_len(), 0);
        let events = fixture
            .spine
            .tail(Some(&recipient.id), Seq(0))
            .await
            .expect("final events");
        let delivery_events: Vec<_> = events
            .iter()
            .filter(|event| event.kind.starts_with("delivery."))
            .collect();
        assert_eq!(
            delivery_events
                .iter()
                .map(|event| event.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "delivery.held",
                "delivery.outcome",
                "delivery.released",
                "delivery.outcome"
            ]
        );
        let released: Value = serde_json::from_str(&delivery_events[2].payload).expect("released");
        assert_eq!(released["msg_id"], receipt.msg_id);
        assert_eq!(released["seat"], recipient.id.as_str());
        assert_eq!(released["at_ms"], delivery_events[2].at);
        let outcome: Value =
            serde_json::from_str(&delivery_events[3].payload).expect("delivered outcome");
        assert_eq!(outcome["msg_id"], receipt.msg_id);
        assert_eq!(outcome["outcome"]["outcome"], "delivered");
        assert_eq!(outcome["outcome"]["origin"], "typed-to-pane");
        assert_eq!(outcome["transport"], "tmux");
    }

    #[tokio::test]
    async fn first_attempt_socket_delivery_ignores_typing_and_unavailable_composer() {
        for (label, tmux) in [
            ("unknown", FakeTmux::new()),
            ("recognized draft", typing_pane("%108")),
            ("human typing", typing_pane("%108").with_user_typing()),
        ] {
            let fixture = fixture_with_gate(FakeTransport::reachable(), tmux);
            let mut recipient = bound(&format!("pij-{label}"));
            recipient.pane = Some("%108".to_string());
            register(&fixture, recipient.clone()).await;

            let receipt = fixture
                .service
                .send(
                    "pij-from".into(),
                    recipient.id.clone(),
                    "deliver without touching the draft",
                )
                .await
                .expect("socket delivery does not consult composer permission");

            assert_eq!(
                receipt.outcome,
                DeliveryOutcome::Delivered {
                    origin: DeliveryOrigin::InjectedToTransport
                },
                "{label}"
            );
            assert_eq!(fixture.transport.delivered().len(), 1, "{label}");
            assert_eq!(fixture.queue.live_len(), 0, "{label}");
            assert!(
                fixture.tmux.calls().is_empty(),
                "{label}: socket must not inspect or mutate the pane"
            );
            let events = fixture
                .spine
                .tail(Some(&recipient.id), Seq(0))
                .await
                .expect("events");
            assert!(
                events.iter().all(|event| !matches!(
                    event.kind.as_str(),
                    "delivery.held" | "delivery.released"
                )),
                "{label}: no typing lifecycle"
            );
        }
    }

    #[tokio::test]
    async fn extension_claims_preserve_semantic_hold_while_ignoring_typing() {
        for harness in [Harness::Omp, Harness::Pi] {
            let fixture = fixture_with_gate(FakeTransport::reachable(), typing_pane("%held"));
            let mut recipient = bound("pij-extension-held");
            recipient.harness = harness;
            recipient.pane = Some("%held".into());
            recipient.semantic_state = Some(SemanticState::Hold);
            register(&fixture, recipient.clone()).await;
            fixture
                .service
                .send(
                    "pij-from".into(),
                    recipient.id.clone(),
                    "semantic hold survives typing removal",
                )
                .await
                .expect("queued");

            assert!(
                fixture
                    .service
                    .claim_inbox(&recipient.id, false)
                    .await
                    .expect("held claim")
                    .is_empty()
            );
            assert_eq!(fixture.queue.live_len(), 1);
            recipient.semantic_state = None;
            register(&fixture, recipient.clone()).await;
            let claims = fixture
                .service
                .claim_inbox(&recipient.id, false)
                .await
                .expect("released semantic hold");
            assert_eq!(claims.len(), 1);
            assert!(
                fixture.tmux.calls().is_empty(),
                "extension claims never observe or mutate the composer"
            );
        }
    }

    #[tokio::test]
    async fn omp_and_pi_use_the_extension_stream_without_composer_gates() {
        for harness in [Harness::Omp, Harness::Pi] {
            let fixture = fixture_with_gate(
                FakeTransport::reachable(),
                FakeTmux::new()
                    .with_clear_composer("%stream")
                    .with_attached_tap("%stream")
                    .with_user_typing(),
            );
            let mut recipient = bound(&format!("pij-{harness:?}"));
            recipient.harness = harness;
            recipient.pane = Some("%stream".to_string());
            register(&fixture, recipient.clone()).await;

            let receipt = fixture
                .service
                .send("pij-from".into(), recipient.id.clone(), "wait for turn end")
                .await
                .expect("extension stream admission");

            assert_eq!(receipt.outcome, queued_outcome("extension-stream", 0));
            assert_eq!(fixture.queue.live_len(), 1);
            assert!(fixture.transport.delivered().is_empty());
            assert!(fixture.tmux.calls().is_empty(), "{harness:?} touched tmux");
            let events = fixture
                .spine
                .tail(Some(&recipient.id), Seq(0))
                .await
                .expect("recipient events");
            assert!(events.iter().any(|event| event.kind == PUSHED_EVENT_KIND));
        }
    }

    #[tokio::test]
    async fn queued_receipt_reads_persisted_not_before_instead_of_echoing_service_clock() {
        let fixture = fixture(FakeTransport::unreachable());
        let recipient = SeatDescriptor::new("pij-persisted-retry", Harness::Omp, "/abs/tree");
        register(&fixture, recipient.clone()).await;
        let msg = Msg {
            from: SeatId::from("pij-from"),
            to: recipient.id.clone(),
            body: "persisted schedule".to_string(),
            msg_id: "000000000000feed-0000000000000000".to_string(),
            from_machine: None,
            in_reply_to: None,
            command: None,
        };
        let DeliveryEnqueue::Queued { job_id, .. } = fixture
            .queue
            .enqueue_delivery(delivery_job(&msg, None).expect("delivery job"))
            .await
            .expect("pre-enqueue delivery")
        else {
            panic!("fresh delivery must queue");
        };
        let claimed = fixture
            .queue
            .claim(&[delivery_kind(&recipient.id)], "schedule-test")
            .await
            .expect("claim pre-enqueued row")
            .expect("scheduled row");
        assert_eq!(claimed.0, job_id);
        fixture
            .queue
            .retry(job_id, Duration::from_secs(17))
            .await
            .expect("persist backoff");

        let receipt = fixture
            .service
            .send(msg.from, msg.to, msg.body)
            .await
            .expect("collapse onto scheduled row");
        assert_eq!(receipt.at, 1_234);
        assert_eq!(receipt.outcome, queued_outcome("pre-bind", 17_000));
        assert_ne!(
            17_000,
            receipt.at + 1_000,
            "schedule must not echo a cadence"
        );
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
        assert_eq!(receipt.outcome, queued_outcome("frame-too-large", 0));
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

    // Plan 136: typing grace protects send-keys, not socket delivery into a separate channel.
    #[tokio::test]
    async fn socket_delivery_ignores_existing_draft_recency() {
        let fixture = fixture_with_gate(FakeTransport::reachable(), typing_pane("%108"));
        let mut recipient = bound("pij-parked");
        recipient.pane = Some("%108".to_string());
        register(&fixture, recipient.clone()).await;
        fixture.interaction.observe_composer("%108", "hello");

        for body in ["first incoming message", "second incoming message"] {
            let receipt = fixture
                .service
                .send("pij-from".into(), recipient.id.clone(), body)
                .await
                .expect("socket delivery during typing grace");
            assert_eq!(
                receipt.outcome,
                DeliveryOutcome::Delivered {
                    origin: DeliveryOrigin::InjectedToTransport
                }
            );
        }
        assert_eq!(fixture.transport.delivered().len(), 2);
        assert!(fixture.tmux.calls().is_empty());
    }

    #[tokio::test]
    async fn nonempty_draft_still_vetoes_typed_body_delivery_after_idle_window() {
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
        assert_eq!(first.outcome, queued_draft_outcome(0));

        tokio::time::sleep(idle * 3).await;
        let second = fixture
            .service
            .send("pij-from".into(), recipient.id, "wait after expiry")
            .await
            .expect("stale draft still queues typed body");

        assert_eq!(second.outcome, queued_draft_outcome(0));
        assert_eq!(fixture.queue.live_len(), 2);
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("submit:")),
            "socket policy must never permit send-keys into a non-empty composer"
        );
    }

    /// ac-1114 and plan 136 still apply to send-keys: stale observer state cannot authorize typing.
    #[tokio::test]
    async fn a_stale_clear_tick_cannot_authorize_send_keys_a_fresh_capture_vetoes() {
        let fixture = fixture_with_gate(FakeTransport::unreachable(), typing_pane("%108"));
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
            queued_draft_outcome(0),
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
        assert_eq!(receipt.outcome, queued_outcome("pre-bind", 0));
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
        assert_eq!(receipt.outcome, queued_outcome("operator-hold", 0));
        assert!(queued.transport.calls().is_empty());
        assert!(
            queued
                .service
                .claim_inbox(&SeatId::from("pij-hold"), false)
                .await
                .expect("operator-held inbox")
                .is_empty(),
            "semantic Hold must also veto inbox consumption, not only push delivery"
        );
        assert_eq!(queued.queue.live_len(), 1, "held message remains durable");

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
        assert_eq!(receipt.outcome, queued_outcome("unreachable", 0));
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
        assert_eq!(first.outcome, queued_outcome("unreachable", 0));
        assert_eq!(
            fixture
                .service
                .accept_forwarded(msg.clone())
                .await
                .expect("live duplicate")
                .outcome,
            queued_outcome("unreachable", 0)
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
            .acknowledge_inbox(&msg.to, claimed[0].job_id, &Default::default(), None)
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
            4,
            "every sender attempt and the committed reader acknowledgement retain an outcome audit"
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
            .acknowledge_inbox(&seat, first[0].job_id, &Default::default(), None)
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

    fn native_seat(pane: Option<&str>) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new("pij-native", Harness::Copilot, "/abs/tree");
        seat.proc = Some(ProcIdentity {
            pid: 137,
            proc_start: 1370,
        });
        seat.harness_session = Some("native-137".to_string());
        seat.pane = pane.map(str::to_string);
        seat.native_extension_delivery = true;
        seat
    }

    fn native_identity() -> super::NativeInboxIdentity {
        super::NativeInboxIdentity {
            native_session: Some("native-137".to_string()),
            pid: Some(137),
            proc_start: Some(1370),
        }
    }

    #[tokio::test]
    async fn external_pull_claim_and_ack_preserve_native_tuple_without_extension_attestation() {
        for harness in [Harness::Claude, Harness::Copilot, Harness::Codex] {
            let fixture = fixture(FakeTransport::unreachable());
            let mut seat = native_seat(None);
            seat.harness = harness;
            seat.native_extension_delivery = false;
            let liveness = FakeLiveness::new().with_proc(seat.proc.unwrap());
            register(&fixture, seat.clone()).await;
            let sent = fixture
                .service
                .send("sender".into(), seat.id.clone(), "exact body\n")
                .await
                .unwrap();
            assert!(
                !matches!(&sent.outcome, DeliveryOutcome::Queued { reason: Some(reason), .. } if reason == "native-extension-unavailable" || reason == "extension-stream")
            );
            let identity = native_identity();
            for wrong in [
                NativeInboxIdentity::default(),
                NativeInboxIdentity {
                    native_session: Some("other".into()),
                    ..identity.clone()
                },
                NativeInboxIdentity {
                    pid: Some(138),
                    ..identity.clone()
                },
                NativeInboxIdentity {
                    proc_start: Some(1371),
                    ..identity.clone()
                },
            ] {
                assert!(
                    fixture
                        .service
                        .claim_pull_inbox(&seat.id, false, None, &wrong, &liveness)
                        .await
                        .is_err()
                );
                assert_eq!(fixture.queue.live_len(), 1);
            }
            assert!(
                fixture
                    .service
                    .claim_pull_inbox(&seat.id, false, None, &identity, &FakeLiveness::new())
                    .await
                    .is_err()
            );
            let page = fixture
                .service
                .claim_pull_inbox(&seat.id, false, None, &identity, &liveness)
                .await
                .unwrap();
            assert_eq!(page.claims.len(), 1);
            let claim = &page.claims[0];
            assert_eq!(claim.message.msg_id, sent.msg_id);
            assert_eq!(claim.message.body, "exact body\n");
            assert_eq!(claim.native_consumer.as_ref(), Some(&identity));
            assert!(
                fixture
                    .service
                    .acknowledge_inbox(&"other-seat".into(), claim.job_id, &identity, None)
                    .await
                    .is_err()
            );
            let wrong = NativeInboxIdentity {
                proc_start: Some(1371),
                ..identity.clone()
            };
            assert!(
                fixture
                    .service
                    .acknowledge_inbox(&seat.id, claim.job_id, &wrong, None)
                    .await
                    .is_err()
            );
            if harness == Harness::Copilot {
                assert!(
                    fixture
                        .service
                        .acknowledge_inbox(&seat.id, claim.job_id, &Default::default(), None)
                        .await
                        .is_err()
                );
                assert!(
                    fixture
                        .service
                        .native_typing_snapshot(&seat.id, &identity, 0)
                        .await
                        .is_err(),
                    "pull does not attest an extension"
                );
            }
            assert!(
                fixture
                    .queue
                    .claimed_delivery(claim.job_id)
                    .await
                    .unwrap()
                    .is_some()
            );
            fixture
                .service
                .acknowledge_inbox(&seat.id, claim.job_id, &identity, None)
                .await
                .unwrap();
            assert!(
                fixture
                    .service
                    .claim_pull_inbox(&seat.id, false, None, &identity, &liveness)
                    .await
                    .unwrap()
                    .claims
                    .is_empty()
            );
        }
    }

    #[tokio::test(start_paused = true)]
    async fn paneless_wait_times_out_or_wakes_for_real_work_and_can_be_cancelled() {
        let fixture = fixture(FakeTransport::unreachable());
        let mut seat = native_seat(None);
        seat.native_extension_delivery = false;
        let liveness = FakeLiveness::new().with_proc(seat.proc.unwrap());
        register(&fixture, seat.clone()).await;
        let identity = native_identity();
        let started = tokio::time::Instant::now();
        let page = fixture
            .service
            .claim_pull_inbox(
                &seat.id,
                true,
                Some(Duration::from_millis(25)),
                &identity,
                &liveness,
            )
            .await
            .unwrap();
        assert!(page.claims.is_empty());
        assert!(tokio::time::Instant::now() - started >= Duration::from_millis(25));

        // Poll until subscribed, then cancel. No detached consumer may steal later work.
        {
            let waiting = fixture
                .service
                .claim_pull_inbox(&seat.id, true, None, &identity, &liveness);
            tokio::pin!(waiting);
            tokio::select! {
                biased;
                result = &mut waiting => panic!("infinite wait completed without work: {result:?}"),
                () = tokio::task::yield_now() => {}
            }
        }
        let waiting = fixture
            .service
            .claim_pull_inbox(&seat.id, true, None, &identity, &liveness);
        tokio::pin!(waiting);
        tokio::select! {
            biased;
            result = &mut waiting => panic!("infinite wait completed without work: {result:?}"),
            () = tokio::task::yield_now() => {}
        }
        let sent = fixture
            .service
            .send("sender".into(), seat.id.clone(), "wake")
            .await
            .unwrap();
        let page = waiting.await.unwrap();
        assert_eq!(page.claims.len(), 1);
        assert_eq!(page.claims[0].message.msg_id, sent.msg_id);
    }

    #[tokio::test]
    async fn paneless_wait_refuses_pushed_modes_and_rechecks_owner_after_wake() {
        let fixture = fixture(FakeTransport::unreachable());
        let identity = native_identity();
        for (pane, extension, relay) in [
            (Some("%137"), false, false),
            (None, true, false),
            (None, false, true),
        ] {
            let mut seat = native_seat(pane);
            seat.native_extension_delivery = extension;
            seat.relay = relay;
            let liveness = FakeLiveness::new().with_proc(seat.proc.unwrap());
            register(&fixture, seat.clone()).await;
            assert!(
                fixture
                    .service
                    .claim_pull_inbox(&seat.id, true, None, &identity, &liveness)
                    .await
                    .is_err()
            );
            if pane.is_some() && !extension {
                assert!(
                    fixture
                        .service
                        .claim_native_inbox(&seat.id, false, &identity)
                        .await
                        .is_err(),
                    "paned Copilot still needs native attestation"
                );
            }
        }
        let mut seat = native_seat(None);
        seat.native_extension_delivery = false;
        let liveness = FakeLiveness::new().with_proc(seat.proc.unwrap());
        register(&fixture, seat.clone()).await;
        let waiting = fixture
            .service
            .claim_pull_inbox(&seat.id, true, None, &identity, &liveness);
        tokio::pin!(waiting);
        tokio::select! {
            biased;
            result = &mut waiting => panic!("empty wait completed: {result:?}"),
            () = tokio::task::yield_now() => {}
        }
        seat.proc.as_mut().unwrap().proc_start += 1;
        register(&fixture, seat.clone()).await;
        fixture
            .service
            .send("sender".into(), seat.id.clone(), "new owner only")
            .await
            .unwrap();
        assert!(waiting.await.is_err());
        assert_eq!(fixture.queue.live_len(), 1);
    }

    #[tokio::test]
    async fn paneless_wait_holds_until_release_and_never_rehomes_old_native_work() {
        let fixture = fixture(FakeTransport::unreachable());
        let mut seat = native_seat(None);
        seat.native_extension_delivery = false;
        seat.semantic_state = Some(SemanticState::Hold);
        let liveness = FakeLiveness::new().with_proc(seat.proc.unwrap());
        let identity = native_identity();
        register(&fixture, seat.clone()).await;
        fixture
            .service
            .send("sender".into(), seat.id.clone(), "held body")
            .await
            .unwrap();
        let waiting = fixture
            .service
            .claim_pull_inbox(&seat.id, true, None, &identity, &liveness);
        tokio::pin!(waiting);
        tokio::select! {
            biased;
            result = &mut waiting => panic!("hold is not successful empty completion: {result:?}"),
            () = tokio::task::yield_now() => {}
        }
        seat.semantic_state = None;
        register(&fixture, seat.clone()).await;
        fixture
            .service
            .event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: 1_235,
                kind: "report.state".into(),
                seat: Some(seat.id.clone()),
                payload: "{}".into(),
            })
            .await
            .unwrap();
        let page = waiting.await.unwrap();
        assert_eq!(page.claims[0].message.body, "held body");
        fixture
            .service
            .acknowledge_inbox(&seat.id, page.claims[0].job_id, &identity, None)
            .await
            .unwrap();
        fixture
            .service
            .send("sender".into(), seat.id.clone(), "original session only")
            .await
            .unwrap();
        seat.harness_session = Some("replacement-native-session".into());
        register(&fixture, seat.clone()).await;
        let replacement = NativeInboxIdentity {
            native_session: seat.harness_session.clone(),
            ..identity
        };
        let held = fixture
            .service
            .claim_pull_inbox(&seat.id, false, None, &replacement, &liveness)
            .await
            .unwrap();
        assert!(held.claims.is_empty());
        assert!(
            held.held_reason
                .unwrap()
                .starts_with("native-target-session:native-137")
        );
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "old native context retains its queued body"
        );
    }

    #[tokio::test]
    async fn copilot_first_arrival_is_native_only_even_without_capability() {
        for attached in [false, true] {
            let fixture = fixture(FakeTransport::reachable());
            let mut seat = native_seat(Some("%137"));
            seat.native_extension_delivery = attached;
            register(&fixture, seat).await;
            let receipt = fixture
                .service
                .send("pij-from".into(), "pij-native".into(), "native body")
                .await
                .expect("durably queued");
            assert!(matches!(receipt.outcome, DeliveryOutcome::Queued { .. }));
            assert!(
                fixture.transport.delivered().is_empty(),
                "no transport fallback"
            );
            assert!(
                fixture.tmux.calls().is_empty(),
                "arrival must never consult or submit tmux"
            );
            assert_eq!(fixture.queue.live_len(), 1);
            fixture
                .service
                .claim_inbox(&"pij-native".into(), false)
                .await
                .expect_err("unattested caller cannot claim native work");
        }
    }

    #[tokio::test]
    async fn native_typing_snapshot_captured_blank_releases_recent_edit_but_preserves_hold() {
        let blank: Value = serde_json::from_str(include_str!(
            "../../../harnesses/tests/fixtures/2026-09-05-copilot-v1.0.84-smoke03.json"
        ))
        .unwrap();
        let draft: Value = serde_json::from_str(include_str!(
            "../../../harnesses/tests/fixtures/2026-09-05-copilot-v1.0.84-live06-draft.json"
        ))
        .unwrap();
        let draft_capture = &draft["follow_up"]["pane_capture"];
        // The blank fixture's cursor is decoded from retained terminal output,
        // not a paired live observation; this is offline policy replay only.
        for (capture, cursor_x, cursor_y, is_blank) in [
            (blank["terminal"].as_str().unwrap(), 2, 45, true),
            (draft_capture["terminal"].as_str().unwrap(), 50, 45, false),
        ] {
            let fixture = fixture_with_gate(
                FakeTransport::unreachable(),
                FakeTmux::new()
                    .with_pane(Pane {
                        id: "%137".into(),
                        session: "s".into(),
                        window: "w".into(),
                        title: "Copilot".into(),
                        cursor_x: Some(cursor_x),
                        cursor_y: Some(cursor_y),
                    })
                    .with_attached_tap("%137")
                    .with_standing_capture(capture),
            );
            fixture
                .interaction
                .observe_composer("%137", "just submitted prompt");
            for held in [false, true] {
                let mut seat = native_seat(Some("%137"));
                seat.semantic_state = held.then_some(SemanticState::Hold);
                register(&fixture, seat.clone()).await;
                let snapshot = fixture
                    .service
                    .native_typing_snapshot(&seat.id, &native_identity(), 60_000)
                    .await
                    .unwrap();
                let super::NativeTypingObservation::Observed { retry_after_ms, .. } =
                    snapshot.observation
                else {
                    panic!("captured composer must be recognized");
                };
                if is_blank {
                    assert_eq!(
                        retry_after_ms, 0,
                        "submitted prompt must not delay a blank composer"
                    );
                } else {
                    assert!(
                        retry_after_ms > 0,
                        "a recent nonblank draft retains informational recency evidence"
                    );
                }
                assert_eq!(snapshot.semantic_hold, held);
            }
        }
    }

    #[tokio::test]
    async fn native_typing_snapshot_expires_static_draft_and_renews_only_on_edit() {
        let mut fixture = fixture_with_gate(
            FakeTransport::unreachable(),
            typing_pane("%137")
                .script_tap(b"rendered output one".to_vec())
                .script_tap(b"rendered output two".to_vec()),
        );
        fixture.interaction = Arc::new(InteractionGate::with_typing_grace(
            fixture.tmux.clone(),
            Duration::from_secs(60),
            100,
        ));
        fixture.service = Arc::new(
            DeliveryService::new(
                fixture.registry.clone(),
                fixture.queue.clone(),
                fixture.transport.clone(),
                fixture.interaction.clone(),
                Arc::new(EventBus::new(fixture.spine.clone(), 16).expect("event bus")),
            )
            .expect("native consent fixture"),
        );
        register(&fixture, native_seat(Some("%137"))).await;
        fixture
            .service
            .send("pij-from".into(), "pij-native".into(), "held body")
            .await
            .expect("queue");
        let identity = native_identity();
        let seat = SeatId::from("pij-native");
        let snapshot = fixture
            .service
            .native_typing_snapshot(&seat, &identity, 100)
            .await
            .unwrap();
        assert!(matches!(
            snapshot.observation,
            super::NativeTypingObservation::Observed {
                retry_after_ms: 1..=100,
                ..
            }
        ));
        let calls_before = fixture.tmux.calls();
        let claim = fixture
            .service
            .claim_native_inbox(&seat, false, &identity)
            .await
            .unwrap();
        assert_eq!(
            claim.claims.len(),
            1,
            "plan 137: native delivery never touches the draft, so typing is not a gate"
        );
        assert_eq!(
            fixture.tmux.calls(),
            calls_before,
            "claim never observes or types into tmux"
        );
        let running = fixture
            .queue
            .claimed_delivery(claim.claims[0].job_id)
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;
        fixture.interaction.record_tap("%137");
        let aged = fixture
            .service
            .native_typing_snapshot(&seat, &identity, 100)
            .await
            .unwrap();
        assert!(
            matches!(
                aged.observation,
                super::NativeTypingObservation::Observed {
                    retry_after_ms: 0,
                    ..
                }
            ),
            "output/tap activity does not renew the unchanged draft's edit age"
        );
        assert!(
            !fixture
                .interaction
                .fresh_injection_verdict("%137")
                .await
                .unwrap()
                .composer_idle
        );
        fixture.tmux.arrange_clear_composer("%137");
        let edited = fixture
            .service
            .native_typing_snapshot(&seat, &identity, 100)
            .await
            .unwrap();
        assert!(
            matches!(
                edited.observation,
                super::NativeTypingObservation::Observed {
                    retry_after_ms: 0,
                    ..
                }
            ),
            "clearing a human draft resets the informational recency snapshot"
        );
        assert_eq!(
            fixture
                .queue
                .claimed_delivery(claim.claims[0].job_id)
                .await
                .unwrap(),
            running
        );
        assert!(
            fixture
                .tmux
                .calls()
                .iter()
                .all(|call| !call.starts_with("type")
                    && !call.starts_with("stage")
                    && !call.starts_with("commit")
                    && !call.starts_with("send_keys"))
        );
    }

    #[tokio::test]
    async fn native_typing_paneless_snapshot_is_informational_and_retains_hold() {
        let fixture = fixture(FakeTransport::unreachable());
        let mut seat = native_seat(None);
        seat.semantic_state = Some(SemanticState::Hold);
        register(&fixture, seat.clone()).await;
        let identity = native_identity();
        let unavailable = fixture
            .service
            .native_typing_snapshot(&seat.id, &identity, 60_000)
            .await
            .unwrap();
        assert!(matches!(
            unavailable.observation,
            super::NativeTypingObservation::Unavailable { .. }
        ));
        let disabled = fixture
            .service
            .native_typing_snapshot(&seat.id, &identity, 0)
            .await
            .unwrap();
        assert!(matches!(
            disabled.observation,
            super::NativeTypingObservation::Observed {
                retry_after_ms: 0,
                ..
            }
        ));
        assert!(unavailable.semantic_hold && disabled.semantic_hold);
        assert_eq!(fixture.registry.get(&seat.id).await.unwrap(), Some(seat));
        assert!(fixture.tmux.calls().is_empty());
        assert_eq!(fixture.queue.live_len(), 0);
    }

    #[tokio::test]
    async fn native_wait_revalidates_replacement_before_handoff() {
        let fixture = fixture(FakeTransport::unreachable());
        let seat = native_seat(None);
        register(&fixture, seat.clone()).await;
        let identity = native_identity();
        let service = Arc::clone(&fixture.service);
        let waiting = tokio::spawn(async move {
            service
                .claim_native_inbox(&"pij-native".into(), true, &identity)
                .await
        });
        tokio::task::yield_now().await;
        let mut replacement = seat;
        replacement.proc = Some(ProcIdentity {
            pid: 138,
            proc_start: 1380,
        });
        replacement.harness_session = Some("native-138".into());
        fixture
            .registry
            .put(replacement)
            .await
            .expect("replacement attested");
        fixture
            .service
            .send("pij-from".into(), "pij-native".into(), "new session only")
            .await
            .expect("queue");
        tokio::time::timeout(Duration::from_secs(1), waiting)
            .await
            .expect("bounded wake")
            .expect("task")
            .expect_err("old tuple refused");
        assert_eq!(
            fixture.queue.live_len(),
            1,
            "old consumer did not take new work"
        );
    }

    #[tokio::test]
    async fn copilot_programmatic_controls_refuse_without_enqueue_or_tmux() {
        let fixture = fixture(FakeTransport::reachable());
        register(&fixture, native_seat(Some("%137"))).await;
        for command in ["compact", "new", "reload"] {
            let result = fixture
                .service
                .accept(Msg {
                    from: "pij-from".into(),
                    to: "pij-native".into(),
                    body: String::new(),
                    msg_id: format!("native-{command}"),
                    from_machine: None,
                    in_reply_to: None,
                    command: Some(command.into()),
                })
                .await
                .expect("explicit refusal receipt");
            assert!(matches!(result.outcome, DeliveryOutcome::Refused { .. }));
        }
        assert_eq!(fixture.queue.live_len(), 0);
        assert!(fixture.tmux.calls().is_empty());
        assert!(fixture.transport.delivered().is_empty());
    }
}
