//! The ports — the only holes in the functional core.
//!
//! # A EIGHTH PORT IS STOP-AND-ASK
//!
//! Workshop 001 R3 froze six; R3-AMEND-1 admitted `LivenessPort` as the seventh
//! (the PM's stop-and-ask fired exactly as designed: `proc_start` is real IO and
//! cannot be a free function in a crate that performs none). **Do not add an
//! eighth.** If a unit believes it needs one, that is a prime ruling, recorded in
//! `docs/plans/108-rust-port/assets/workshops/001-architecture.md` — not a trait
//! someone adds while implementing something else. Ports are the seams the whole
//! fan-out is parallel across; a seam that moves mid-wave un-freezes every unit
//! behind it.
//!
//! Each trait is minimal and object-safe: the daemon and CLI wire
//! `Arc<dyn Port>`, config picks the implementation, and the fake is the default
//! so everything runs offline.
//!
//! **Why `async`** (R3-AMEND-2): sqlx — ruled in R1 — has no synchronous API, so
//! a sync `Registry` would force `block_on` inside the store adapter, which
//! deadlocks when called from a tokio worker. `async_trait` is a proc macro, not
//! a runtime: core still has no tokio, and the arch gate proves it. Every port is
//! async, including the ones whose implementations happen to be synchronous
//! today, so a later adapter can become async without changing the seam.

use std::time::Duration;

use async_trait::async_trait;

use crate::error::Result;
use crate::model::{
    BindHealth, DeliveryOrigin, DeliveryOutcome, Event, Harness, Job, JobId, ModelRow, Msg,
    Outcome, Pane, ProcIdentity, Readiness, SeatDescriptor, SeatId, Seq,
};

/// How to narrow a registry listing. Absent fields mean "do not filter",
/// distinct from a field set to an empty value.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SeatFilter {
    /// Only seats on this harness.
    pub harness: Option<Harness>,
    /// Only seats whose folder equals this absolute path.
    pub folder: Option<String>,
    /// Only seats governed by this parent.
    pub parent: Option<SeatId>,
}

/// The seat roster: who exists, what they are, who governs them.
///
/// Single-writer at the store level. `get` returning `None` means the seat is
/// ABSENT — never conflated with a seat that exists and has empty fields, which
/// is the distinction TS's `E-NOREG` lost.
#[async_trait]
pub trait Registry: Send + Sync {
    /// The descriptor for `seat`, or `None` when there is no row.
    async fn get(&self, seat: &SeatId) -> Result<Option<SeatDescriptor>>;

    /// Write a descriptor, returning the sequence number of the write.
    /// Persist-before-mutate: the row exists before anything acts on it.
    async fn put(&self, descriptor: SeatDescriptor) -> Result<Seq>;

    /// Every seat matching `filter`, ordered by id so callers can diff listings.
    async fn list(&self, filter: SeatFilter) -> Result<Vec<SeatDescriptor>>;

    /// Mark a seat dead, keeping the row and the reason. Rows are tombstoned,
    /// never deleted: a seat that vanishes takes its own post-mortem with it.
    async fn tombstone(&self, seat: &SeatId, reason: &str) -> Result<Seq>;
}

/// The append-only history: reports, events, receipts.
#[async_trait]
pub trait Spine: Send + Sync {
    /// Append one event, returning its sequence number.
    async fn append(&self, event: Event) -> Result<Seq>;

    /// Events after `since`, oldest first, optionally only for one seat.
    async fn tail(&self, seat: Option<&SeatId>, since: Seq) -> Result<Vec<Event>>;
}

/// Result of atomically consulting destination delivery history and enqueueing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DeliveryEnqueue {
    /// A live queue row now owns the message, whether newly inserted or collapsed.
    Queued(JobId),
    /// This destination already delivered the message with the recorded evidence.
    AlreadyDelivered(DeliveryOrigin),
}

/// The job queue every delivery and sidecar rides on (R4).
#[async_trait]
pub trait Queue: Send + Sync {
    /// Enqueue, collapsing onto any LIVE job with the same `dedupe_key` — N
    /// rapid submits become one row, and the returned id is that row's.
    async fn enqueue(&self, job: Job) -> Result<JobId>;

    /// Enqueue one destination delivery unless its durable delivered-id record exists.
    ///
    /// The delivered check and live-row insert are one write transaction. Splitting
    /// them lets an acknowledgement commit between a stale check and the insert,
    /// freeing the live key and admitting the same message twice (R4-AMEND-3).
    async fn enqueue_delivery(&self, job: Job) -> Result<DeliveryEnqueue>;

    /// Claim the next runnable job of any of `kinds` for `worker`. At most one
    /// job per `serial_key` is claimed at a time, so two workers never act on
    /// one entity concurrently.
    async fn claim(&self, kinds: &[String], worker: &str) -> Result<Option<(JobId, Job)>>;

    /// Record how a claimed job ended, freeing its serial key.
    async fn ack(&self, job: JobId, outcome: Outcome) -> Result<()>;

    /// Atomically acknowledge delivery, record its evidence, and enforce retention.
    ///
    /// The queue owns the configured per-recipient POLICY bound, so every caller
    /// observes one retention rule. Record, prune, and acknowledgement are one
    /// transaction; a crash cannot expose only part of the delivery fact.
    async fn ack_delivery(&self, job: JobId, origin: DeliveryOrigin) -> Result<()>;

    /// Return a CLAIMED job to pending, after `delay`, counting the attempt.
    ///
    /// **R4-AMEND-1**, ratified after two wave-4 units found the same hole from
    /// opposite ends: remote send needed a failed forward to stay queued, and the
    /// pointer rung needed an announced claim to be re-announceable. Neither could
    /// be built, because `claim` and `ack` are the only transitions and `ack` is
    /// TERMINAL — ack-then-enqueue has a crash window that LOSES the body, and
    /// enqueue-then-ack collapses onto the still-live row it is trying to replace.
    ///
    /// **Atomic, and the ONE writer of `attempt`.** The return to pending and the
    /// increment happen in a single transaction, in the one place that owns queue
    /// state. The fork split attempt counting between its daemon and its consumers
    /// and that split IS the root cause of its still-open G25, where `attempt`
    /// never moved, `parked` was unreachable, and pointers re-announced every 90
    /// seconds for ever. A second writer here recreates that bug exactly.
    ///
    /// `delay` is a not-before time, so a caller expresses backoff by passing it
    /// rather than by sleeping and hoping nothing else claims the row meanwhile.
    async fn retry(&self, job: JobId, delay: Duration) -> Result<()>;
}

/// A way to get a message to a seat.
#[async_trait]
pub trait Transport: Send + Sync {
    /// Name, for receipts and diagnostics.
    fn name(&self) -> &str;

    /// Can this transport carry THIS message to THAT seat right now?
    ///
    /// A `false` here is why a message gets queued rather than dropped.
    ///
    /// **The message is a parameter by ruling (R3-AMEND-3), not for symmetry.**
    /// A remote-control command (`/compact`, `/new`) must take the pty path even
    /// for a seat with a perfectly good socket, because Claude renders a
    /// socket-delivered `/compact` as plain TEXT rather than executing it
    /// (s105, first-party). So the right transport depends on the MESSAGE, not
    /// only on the seat — and with the seat alone, that carve-out has to live
    /// somewhere a reader of this trait cannot see it, which is the rule that
    /// rots.
    async fn can_deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<bool>;

    /// Attempt delivery. The outcome is what actually happened, never an
    /// optimistic guess.
    async fn deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<DeliveryOutcome>;
}

/// A process command passed to tmux as discrete arguments, never a shell string.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LaunchCommand {
    /// Executable name or path.
    pub executable: String,
    /// Arguments passed to the executable without shell joining.
    pub args: Vec<String>,
}

/// Every tmux syscall in the workspace.
#[async_trait]
pub trait TmuxPort: Send + Sync {
    /// All panes tmux currently reports.
    async fn list_panes(&self) -> Result<Vec<Pane>>;

    /// SUBMIT `text` to a pane as a turn: type it AND send it.
    ///
    /// **R3-AMEND-5**, a SEPARATE verb rather than a flag on [`Self::send_keys`],
    /// ruled deliberately: type-without-sending must stay expressible on its own,
    /// because the composer guard and the human-typing politeness rule both depend
    /// on that distinction being real in the seam. A boolean is a distinction that
    /// can be forgotten at a call site; a verb is not.
    ///
    /// u-pointer found the gap: `send_keys` is literal-only (`tmux send-keys -l`),
    /// so nothing in the tree could submit a turn — and both the pty rung and the
    /// pointer line need a message SENT, not text parked in a composer where the
    /// next keystroke merges with it.
    async fn submit(&self, pane: &str, text: &str) -> Result<()>;

    /// Type `keys` into a pane, literally. Does NOT send: see [`Self::submit`].
    async fn send_keys(&self, pane: &str, keys: &str) -> Result<()>;

    /// The last `lines` of a pane's visible output.
    async fn capture(&self, pane: &str, lines: u32) -> Result<String>;

    /// Kill a pane.
    async fn kill(&self, pane: &str) -> Result<()>;

    /// Open a new window in `session`, optionally launching one exact command.
    /// `None` preserves the empty-window behaviour used by existing callers.
    async fn new_window(
        &self,
        session: &str,
        name: &str,
        cwd: &str,
        command: Option<&LaunchCommand>,
    ) -> Result<Pane>;

    /// Is a human mid-keystroke in that pane? Injecting over a person's typing
    /// corrupts their input, so this gate is consulted before every send.
    async fn user_typing(&self, pane: &str) -> Result<bool>;
}

/// One harness's quirks: discovery, binding, readiness, catalog.
#[async_trait]
pub trait HarnessPort: Send + Sync {
    /// Which harness this adapter speaks for.
    fn kind(&self) -> Harness;

    /// The harness-native session id visible in `pane`, if any.
    async fn discover_session(&self, pane: &str) -> Result<Option<String>>;

    /// Whether the descriptor is bound to a live session, with evidence.
    async fn bind(&self, descriptor: &SeatDescriptor) -> Result<BindHealth>;

    /// Whether the pane is ready for a turn. `NotYet` carries what WAS observed,
    /// so a never-bind is diagnosable instead of a timeout.
    async fn readiness(&self, pane: &str) -> Result<Readiness>;

    /// Is the harness mid-turn? Owned here rather than by each caller because
    /// the "is it busy" regex drifts per harness release, and one place to fix it
    /// is the entire reason this port exists (BUSY_RE-class drift).
    async fn busy(&self, pane: &str) -> Result<bool>;

    /// This harness's model catalog.
    async fn models(&self) -> Result<Vec<ModelRow>>;
}

/// The only authority on whether a recorded process is still that process.
///
/// Deliberately narrow: it reports a start time and nothing else. The verdict
/// itself is [`crate::liveness::alive`], which is pure logic over this one fact —
/// so every recycled-pid case is testable without a process table.
#[async_trait]
pub trait LivenessPort: Send + Sync {
    /// The start time of `pid`, or `None` when no such process exists.
    async fn proc_start(&self, pid: u32) -> Result<Option<u64>>;

    /// Convenience for callers that already hold an identity.
    async fn observed(&self, proc: ProcIdentity) -> Result<Option<u64>> {
        self.proc_start(proc.pid).await
    }
}
