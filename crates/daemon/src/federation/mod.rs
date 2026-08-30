//! Cross-machine delivery owned by one long-lived worker.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::config::PeerDefinition;
use pij_core::error::{PijError, Result};
use pij_core::model::{
    DeliveryOutcome, Destination, Envelope, ErrorKind, Event, Job, JobId, Outcome, Receipt, SeatId,
};
use pij_core::ports::Queue;
use serde::Serialize;

use crate::events::EventBus;
use crate::http::{PeerEndpoint, SendRequest, post_to_peer};

/// The queue kind for a remote send to `alias`.
///
/// PER DESTINATION, not one kind for every peer. Dedupe is scoped by
/// `(kind, dedupe_key)` since schema 7, so a single shared kind made the fix for
/// that defect apply to delivery rows and NOT to federation rows: one msg_id sent
/// to `bob@laptop` and then `bob@desktop` still collapsed, and the second caller
/// was told `Queued` for a row destined to the first machine. Found by review
/// round 2, against a scratch database rather than by reading.
///
/// It also makes the sweep scoping honest: a federation worker claims the kinds of
/// its configured peers, so another worker's pass cannot reach its claims.
fn remote_send_kind(alias: &str) -> String {
    format!("federation:{alias}")
}
const OUTCOME_EVENT_KIND: &str = "delivery.outcome";
const REMOTE_REFUSED_EVENT_KIND: &str = "delivery.remote-refused";
const WORKER_NAME: &str = "federation";
const IDLE_POLL: Duration = Duration::from_secs(1);
const MAX_RETRY_DELAY: Duration = Duration::from_secs(5 * 60);

type Clock = dyn Fn() -> Result<u64> + Send + Sync;
type Jitter = dyn Fn(Duration) -> Result<Duration> + Send + Sync;

/// A peer-configuration refusal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerConfigError {
    /// Two ordered definitions use the same alias.
    DuplicateAlias(String),
    /// A peer claims the local machine's alias.
    LocalAlias(String),
    /// A destination names no configured peer.
    UnknownAlias(String),
}

impl fmt::Display for PeerConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateAlias(alias) => {
                write!(
                    formatter,
                    "peer alias `{alias}` is configured more than once"
                )
            }
            Self::LocalAlias(alias) => write!(
                formatter,
                "peer alias `{alias}` equals the local machine alias; omit the machine to address this daemon"
            ),
            Self::UnknownAlias(alias) => write!(
                formatter,
                "peer alias `{alias}` is not configured; add it to the ordered peer definitions"
            ),
        }
    }
}

impl std::error::Error for PeerConfigError {}

/// The result of resolving an already-parsed destination.
pub enum ResolvedPeer<'a> {
    /// An unqualified destination, always owned by this daemon.
    Local,
    /// A destination owned by one configured peer.
    Remote(&'a PeerEndpoint),
}

/// Validated peer aliases, preserving one endpoint and one credential per peer.
pub struct PeerTable {
    peers: BTreeMap<String, PeerEndpoint>,
}

impl PeerTable {
    /// Validate ordered definitions before building the lookup map.
    ///
    /// # Errors
    /// Duplicate aliases and aliases equal to the local machine.
    pub fn new(
        local_alias: &str,
        definitions: impl IntoIterator<Item = PeerDefinition>,
    ) -> std::result::Result<Self, PeerConfigError> {
        let mut peers = BTreeMap::new();
        for definition in definitions {
            if definition.alias == local_alias {
                return Err(PeerConfigError::LocalAlias(definition.alias));
            }
            let alias = definition.alias;
            let endpoint = PeerEndpoint {
                base_url: definition.url,
                bearer_key: definition.key,
            };
            if peers.insert(alias.clone(), endpoint).is_some() {
                return Err(PeerConfigError::DuplicateAlias(alias));
            }
        }
        Ok(Self { peers })
    }

    /// Every configured peer alias, in order.
    pub fn aliases(&self) -> impl Iterator<Item = &str> {
        self.peers.keys().map(String::as_str)
    }

    /// Resolve a destination without ever treating an unqualified seat as remote.
    ///
    /// # Errors
    /// A qualified destination whose machine alias is not configured.
    pub fn resolve(
        &self,
        destination: &Destination,
    ) -> std::result::Result<ResolvedPeer<'_>, PeerConfigError> {
        let Some(alias) = destination.machine.as_deref() else {
            return Ok(ResolvedPeer::Local);
        };
        self.peers
            .get(alias)
            .map(ResolvedPeer::Remote)
            .ok_or_else(|| PeerConfigError::UnknownAlias(alias.to_string()))
    }
}

/// Remote-send admission and the durable queue consumed by the federation worker.
pub struct FederationService {
    local_alias: String,
    peers: PeerTable,
    queue: Arc<dyn Queue>,
    event_bus: Arc<EventBus>,
    clock: Arc<Clock>,
    client: reqwest::Client,
    jitter: Arc<Jitter>,
    wake: tokio::sync::Notify,
}

impl FederationService {
    /// Validate peer definitions and build the remote-send service.
    ///
    /// # Errors
    /// Duplicate peer aliases or a peer alias equal to `local_alias`.
    pub fn new(
        local_alias: String,
        definitions: impl IntoIterator<Item = PeerDefinition>,
        queue: Arc<dyn Queue>,
        event_bus: Arc<EventBus>,
    ) -> std::result::Result<Self, PeerConfigError> {
        Self::with_sources(
            local_alias,
            definitions,
            queue,
            event_bus,
            Arc::new(system_time_ms),
            Arc::new(random_jitter),
        )
    }

    fn with_sources(
        local_alias: String,
        definitions: impl IntoIterator<Item = PeerDefinition>,
        queue: Arc<dyn Queue>,
        event_bus: Arc<EventBus>,
        clock: Arc<Clock>,
        jitter: Arc<Jitter>,
    ) -> std::result::Result<Self, PeerConfigError> {
        let peers = PeerTable::new(&local_alias, definitions)?;
        Ok(Self {
            local_alias,
            peers,
            queue,
            event_bus,
            clock,
            // A TOTAL timeout. reqwest has NONE by default, so the receipt's
            // "timeouts retry" was unreachable prose: a peer that accepts the
            // connection and then stalls would hold its claim until the lease
            // swept it out from under this worker, terminally failing a message
            // nobody had answered for (review F3). Comfortably under the lease.
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            jitter,
            wake: tokio::sync::Notify::new(),
        })
    }

    /// Resolve and durably enqueue one remote request.
    ///
    /// The returned receipt says only `Queued`: at this point the request path
    /// has observed local persistence, not the peer or its recipient.
    ///
    /// # Errors
    /// Unknown aliases, serialization failures, queue failures, or audit failures.
    pub async fn enqueue_remote(
        &self,
        request: &SendRequest,
    ) -> std::result::Result<Receipt, FederationSendError> {
        let alias = request.to.machine.as_deref().ok_or_else(|| {
            FederationSendError::Refused("an unqualified destination is local".to_string())
        })?;
        match self.peers.resolve(&request.to) {
            Ok(ResolvedPeer::Remote(_)) => {}
            Ok(ResolvedPeer::Local) => {
                return Err(FederationSendError::Refused(
                    "an unqualified destination is local".to_string(),
                ));
            }
            Err(error) => return Err(FederationSendError::Refused(error.to_string())),
        }

        let payload = serde_json::to_string(request).map_err(|error| {
            FederationSendError::Runtime(PijError::Adapter {
                adapter: "daemon/federation".to_string(),
                message: format!(
                    "could not encode remote message {}: {error}",
                    request.msg_id
                ),
            })
        })?;
        self.queue
            .enqueue(Job {
                kind: remote_send_kind(alias),
                serial_key: format!("{}@{alias}", request.to.seat),
                payload,
                dedupe_key: request.msg_id.clone(),
                attempt: 0,
            })
            .await
            .map_err(FederationSendError::Runtime)?;

        let receipt = Receipt {
            msg_id: request.msg_id.clone(),
            outcome: DeliveryOutcome::Queued,
            at: (self.clock)().map_err(FederationSendError::Runtime)?,
        };
        self.publish_outcome(&request.from, alias, &receipt)
            .await
            .map_err(|error| {
                FederationSendError::Runtime(PijError::DeliveryAuditFailed {
                    msg_id: receipt.msg_id.clone(),
                    outcome: "queued".to_string(),
                    audit_error: error.to_string(),
                })
            })?;
        self.wake.notify_one();
        Ok(receipt)
    }

    /// Process one ready remote-send row.
    ///
    /// # Errors
    /// Queue, wire, or audit failures outside normal delivery outcomes.
    pub async fn process_one(&self) -> Result<WorkerStep> {
        // Every configured peer's kind. `claim` takes a list, so one worker still
        // serves all peers — what changed is that the QUEUE can tell them apart.
        let kinds: Vec<String> = self.peers.aliases().map(remote_send_kind).collect();
        let Some((job_id, job)) = self.queue.claim(&kinds, WORKER_NAME).await? else {
            return Ok(WorkerStep::Idle);
        };
        let request: SendRequest = match serde_json::from_str(&job.payload) {
            Ok(request) => request,
            Err(error) => {
                let reason = format!("invalid remote-send payload: {error}");
                self.queue
                    .ack(
                        job_id,
                        Outcome::Failed {
                            reason: reason.clone(),
                        },
                    )
                    .await?;
                return Err(PijError::Adapter {
                    adapter: "daemon/federation".to_string(),
                    message: format!("job {}: {reason}", job_id.0),
                });
            }
        };
        let alias = match request.to.machine.as_deref() {
            Some(alias) => alias,
            None => {
                self.refuse_claim(
                    job_id,
                    &request,
                    "remote-send job has a local destination".to_string(),
                )
                .await?;
                return Ok(WorkerStep::Refused);
            }
        };
        let endpoint = match self.peers.resolve(&request.to) {
            Ok(ResolvedPeer::Remote(endpoint)) => endpoint,
            Ok(ResolvedPeer::Local) => unreachable!("machine was present"),
            Err(error) => {
                self.refuse_claim(job_id, &request, error.to_string())
                    .await?;
                return Ok(WorkerStep::Refused);
            }
        };

        let mut forwarded = request.clone();
        forwarded.to.machine = None;
        forwarded.from_machine = Some(self.local_alias.clone());
        match post_to_peer::<_, Receipt>(&self.client, endpoint, "/v1/send", &forwarded).await {
            Err(_) => self.retry_claim(job_id, job.attempt).await,
            Ok(envelope) if !envelope.ok && envelope.error == Some(ErrorKind::Adapter) => {
                self.retry_claim(job_id, job.attempt).await
            }
            Ok(envelope) if !envelope.ok => {
                let reason = refusal_reason(&envelope);
                self.refuse_claim(job_id, &request, reason).await?;
                Ok(WorkerStep::Refused)
            }
            Ok(envelope) => {
                let Some(receipt) = envelope.data else {
                    self.refuse_claim(
                        job_id,
                        &request,
                        "peer returned ok without a receipt".to_string(),
                    )
                    .await?;
                    return Ok(WorkerStep::Refused);
                };
                if receipt.msg_id != request.msg_id {
                    self.refuse_claim(
                        job_id,
                        &request,
                        format!(
                            "peer receipt named message {}, expected {}",
                            receipt.msg_id, request.msg_id
                        ),
                    )
                    .await?;
                    return Ok(WorkerStep::Refused);
                }
                // Relay the peer's exact evidence. HTTP acceptance creates no
                // delivery claim of its own (E-023).
                if self
                    .publish_outcome(&request.from, alias, &receipt)
                    .await
                    .is_err()
                {
                    let delay = self.retry_delay(job.attempt)?;
                    self.queue.retry(job_id, delay).await?;
                    return Ok(WorkerStep::Retried);
                }
                self.queue.ack(job_id, Outcome::Done).await?;
                Ok(WorkerStep::Forwarded)
            }
        }
    }

    /// Start the long-lived remote-send worker.
    pub fn start(self: Arc<Self>) -> FederationWorker {
        let (shutdown, mut shutdown_rx) = tokio::sync::oneshot::channel();
        let joined = tokio::spawn(async move {
            loop {
                // SURVIVE errors. This loop used to `?` on every step, so one
                // transient SQLite busy, one event-bus publish failure, or one ack
                // against a swept claim ENDED the worker — silently, permanently,
                // with every later remote send enqueuing into a queue nobody
                // drains. A worker that dies on its first transient error is not
                // the durable worker this unit claims to be (review F1).
                //
                // Reported and retried, never swallowed: the next pass reclaims
                // the row, and the message is still in the queue where it belongs.
                let step = match self.process_one().await {
                    Ok(step) => step,
                    Err(error) => {
                        eprintln!("pij-rs federation: {error}");
                        WorkerStep::Idle
                    }
                };
                match step {
                    WorkerStep::Idle => {
                        tokio::select! {
                            _ = &mut shutdown_rx => return Ok(()),
                            () = self.wake.notified() => {},
                            () = tokio::time::sleep(IDLE_POLL) => {},
                        }
                    }
                    WorkerStep::Forwarded | WorkerStep::Retried | WorkerStep::Refused => {
                        if shutdown_rx.try_recv().is_ok() {
                            return Ok(());
                        }
                    }
                }
            }
        });
        FederationWorker {
            shutdown: Some(shutdown),
            joined,
        }
    }

    async fn retry_claim(&self, job_id: JobId, attempt: u32) -> Result<WorkerStep> {
        let delay = self.retry_delay(attempt)?;
        self.queue.retry(job_id, delay).await?;
        Ok(WorkerStep::Retried)
    }

    fn retry_delay(&self, attempt: u32) -> Result<Duration> {
        let seconds = 1_u64
            .checked_shl(attempt.min(63))
            .unwrap_or(u64::MAX)
            .min(MAX_RETRY_DELAY.as_secs());
        (self.jitter)(Duration::from_secs(seconds)).map(|delay| delay.min(MAX_RETRY_DELAY))
    }

    async fn refuse_claim(
        &self,
        job_id: JobId,
        request: &SendRequest,
        reason: String,
    ) -> Result<()> {
        self.queue
            .ack(
                job_id,
                Outcome::Failed {
                    reason: reason.clone(),
                },
            )
            .await?;
        let payload = serde_json::to_string(&RemoteRefusal {
            msg_id: &request.msg_id,
            peer: request.to.machine.as_deref(),
            reason: &reason,
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("could not encode refusal {}: {error}", request.msg_id),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: (self.clock)()?,
                kind: REMOTE_REFUSED_EVENT_KIND.to_string(),
                seat: Some(request.from.clone()),
                payload,
            })
            .await?;
        Ok(())
    }

    async fn publish_outcome(&self, sender: &SeatId, peer: &str, receipt: &Receipt) -> Result<()> {
        let payload = serde_json::to_string(&RemoteOutcome {
            msg_id: &receipt.msg_id,
            outcome: &receipt.outcome,
            transport: "federation",
            peer,
        })
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("could not encode receipt {}: {error}", receipt.msg_id),
        })?;
        self.event_bus
            .publish(Event {
                seq: None,
                v: 1,
                at: receipt.at,
                kind: OUTCOME_EVENT_KIND.to_string(),
                seat: Some(sender.clone()),
                payload,
            })
            .await?;
        Ok(())
    }
}

/// Result of one worker claim attempt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WorkerStep {
    /// No remote row was currently eligible.
    Idle,
    /// The peer accepted the request and returned a receipt.
    Forwarded,
    /// A retryable failure returned the row to pending with backoff.
    Retried,
    /// A permanent peer decision terminally refused the row.
    Refused,
}

/// Handle for explicit federation-worker shutdown.
pub struct FederationWorker {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    joined: tokio::task::JoinHandle<Result<()>>,
}

impl FederationWorker {
    /// Stop the worker and wait until its task exits.
    ///
    /// # Errors
    /// The worker's runtime failure or a panicked worker task.
    pub async fn shutdown(mut self) -> Result<()> {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.joined.await.map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("worker task did not stop cleanly: {error}"),
        })?
    }
}

/// A remote-send refusal or runtime failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FederationSendError {
    /// The request names no configured remote destination.
    Refused(String),
    /// Persistence, serialization, clock, or audit failure.
    Runtime(PijError),
}

impl fmt::Display for FederationSendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Refused(message) => formatter.write_str(message),
            Self::Runtime(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for FederationSendError {}

#[derive(Serialize)]
struct RemoteOutcome<'a> {
    msg_id: &'a str,
    outcome: &'a DeliveryOutcome,
    transport: &'static str,
    peer: &'a str,
}

#[derive(Serialize)]
struct RemoteRefusal<'a> {
    msg_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    peer: Option<&'a str>,
    reason: &'a str,
}

fn refusal_reason<T>(envelope: &Envelope<T>) -> String {
    envelope
        .meta
        .clone()
        .unwrap_or_else(|| "peer permanently refused the remote send".to_string())
}

fn random_jitter(base: Duration) -> Result<Duration> {
    let room = MAX_RETRY_DELAY.saturating_sub(base);
    if room.is_zero() {
        return Ok(base);
    }
    let ceiling_ms = (base.as_millis() / 4).max(1).min(room.as_millis());
    let mut bytes = [0_u8; 8];
    getrandom::fill(&mut bytes).map_err(|error| PijError::Adapter {
        adapter: "daemon/federation".to_string(),
        message: format!("could not generate retry jitter: {error}"),
    })?;
    let jitter_ms = u128::from(u64::from_be_bytes(bytes)) % (ceiling_ms + 1);
    let jitter_ms = u64::try_from(jitter_ms).unwrap_or(u64::MAX);
    Ok(base + Duration::from_millis(jitter_ms))
}

fn system_time_ms() -> Result<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| PijError::Adapter {
            adapter: "daemon/federation".to_string(),
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| PijError::Adapter {
        adapter: "daemon/federation".to_string(),
        message: "system time does not fit in the event timestamp".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use pij_core::config::PeerDefinition;
    use pij_core::model::Destination;
    use pij_core::ports::Spine;
    use pij_testkit::fakes::{FakeQueue, FakeSpine};

    use super::{FederationService, PeerConfigError, PeerTable, ResolvedPeer, WorkerStep};
    use crate::events::EventBus;
    use crate::http::SendRequest;

    fn peer(alias: &str, url: String) -> PeerDefinition {
        PeerDefinition {
            alias: alias.to_string(),
            url,
            key: format!("key-{alias}"),
        }
    }

    fn request(machine: &str) -> SendRequest {
        SendRequest {
            from: "alice".into(),
            to: Destination {
                seat: "bob".into(),
                machine: Some(machine.to_string()),
            },
            body: "hello".to_string(),
            msg_id: "m-1".to_string(),
            from_machine: None,
            in_reply_to: None,
        }
    }

    fn service(queue: Arc<FakeQueue>, spine: Arc<FakeSpine>, url: String) -> FederationService {
        let bus = Arc::new(EventBus::new(spine, 16).expect("event bus"));
        FederationService::with_sources(
            "desktop".to_string(),
            [peer("laptop", url)],
            queue,
            bus,
            Arc::new(|| Ok(1234)),
            Arc::new(Ok),
        )
        .expect("federation")
    }

    /// Review round 2 — ONE msg_id to TWO peers is TWO rows.
    ///
    /// The schema-7 dedupe fix scoped `(kind, dedupe_key)`, and federation stamped
    /// every peer with one shared kind, so the user-reachable loss survived the
    /// migration for exactly the rows the migration's own comment claimed to
    /// cover: `--msg-id m1 --to bob@laptop` then `--to bob@desktop` collapsed, and
    /// the second caller was told `Queued` for a row bound to the first machine.
    ///
    /// Mutation witness: make `remote_send_kind` return a constant and this fails
    /// with one row where two are required.
    #[tokio::test]
    async fn one_msg_id_to_two_peers_is_two_rows() {
        let queue = Arc::new(FakeQueue::new());
        let bus = Arc::new(EventBus::new(Arc::new(FakeSpine::new()), 16).expect("event bus"));
        let service = FederationService::with_sources(
            "desktop".to_string(),
            [
                peer("laptop", "http://laptop".to_string()),
                peer("tower", "http://tower".to_string()),
            ],
            Arc::clone(&queue) as Arc<dyn pij_core::ports::Queue>,
            bus,
            Arc::new(|| Ok(1234)),
            Arc::new(Ok),
        )
        .expect("federation");

        for machine in ["laptop", "tower"] {
            service
                .enqueue_remote(&request(machine))
                .await
                .expect("a remote send to a configured peer");
        }

        assert_eq!(
            queue.live_len(),
            2,
            "the same msg_id addressed to two MACHINES is two messages"
        );
    }

    #[test]
    fn unqualified_destination_is_always_local() {
        let table = PeerTable::new("desktop", [peer("laptop", "http://peer".to_string())])
            .expect("valid peers");
        assert!(matches!(
            table
                .resolve(&Destination::local("alice"))
                .expect("resolve"),
            ResolvedPeer::Local
        ));
    }

    #[test]
    fn duplicate_peer_alias_is_refused_before_collection_erases_it() {
        let error = PeerTable::new(
            "desktop",
            [
                peer("laptop", "http://one".to_string()),
                peer("laptop", "http://two".to_string()),
            ],
        )
        .err()
        .expect("duplicate must fail");
        assert_eq!(error, PeerConfigError::DuplicateAlias("laptop".to_string()));
    }

    #[test]
    fn peer_alias_equal_to_local_alias_is_refused() {
        let error = PeerTable::new("desktop", [peer("desktop", "http://peer".to_string())])
            .err()
            .expect("collision must fail");
        assert_eq!(error, PeerConfigError::LocalAlias("desktop".to_string()));
    }

    #[tokio::test]
    async fn enqueue_claims_only_durable_local_queueing() {
        let queue = Arc::new(FakeQueue::new());
        let spine = Arc::new(FakeSpine::new());
        let service = service(queue.clone(), spine.clone(), "http://peer".to_string());
        let receipt = service
            .enqueue_remote(&request("laptop"))
            .await
            .expect("enqueue");
        assert_eq!(receipt.outcome, pij_core::model::DeliveryOutcome::Queued);
        assert_eq!(queue.live_len(), 1);
        let events = spine
            .tail(None, pij_core::model::Seq(0))
            .await
            .expect("events");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "delivery.outcome");
    }

    #[tokio::test]
    async fn network_failure_retries_with_persisted_exponential_attempt() {
        let queue = Arc::new(FakeQueue::new());
        let spine = Arc::new(FakeSpine::new());
        let service = service(queue.clone(), spine, "http://127.0.0.1:1".to_string());
        service
            .enqueue_remote(&request("laptop"))
            .await
            .expect("enqueue");
        assert_eq!(
            service.process_one().await.expect("worker"),
            WorkerStep::Retried
        );
        let retries = queue.retried();
        let [(job_id, delay)] = retries.as_slice() else {
            panic!("one retry expected");
        };
        assert_eq!(*delay, Duration::from_secs(1));
        assert_eq!(queue.attempts(*job_id), 1);
        assert_eq!(
            service.process_one().await.expect("not due"),
            WorkerStep::Idle
        );
        queue.advance(*delay);
        assert_eq!(
            service.process_one().await.expect("worker"),
            WorkerStep::Retried
        );
        assert_eq!(queue.retried()[1].1, Duration::from_secs(2));
    }

    #[test]
    fn retry_delay_is_exponential_and_caps_at_five_minutes() {
        let queue = Arc::new(FakeQueue::new());
        let spine = Arc::new(FakeSpine::new());
        let service = service(queue, spine, "http://peer".to_string());
        assert_eq!(
            service.retry_delay(0).expect("delay"),
            Duration::from_secs(1)
        );
        assert_eq!(
            service.retry_delay(1).expect("delay"),
            Duration::from_secs(2)
        );
        assert_eq!(
            service.retry_delay(8).expect("delay"),
            Duration::from_secs(256)
        );
        assert_eq!(
            service.retry_delay(9).expect("delay"),
            Duration::from_secs(300)
        );
        assert_eq!(
            service.retry_delay(u32::MAX).expect("delay"),
            Duration::from_secs(300)
        );
    }

    #[tokio::test]
    async fn idle_worker_shutdown_leaves_no_orphan_task() {
        let queue = Arc::new(FakeQueue::new());
        let spine = Arc::new(FakeSpine::new());
        let worker = Arc::new(service(queue, spine, "http://peer".to_string())).start();
        worker.shutdown().await.expect("shutdown");
    }
}
