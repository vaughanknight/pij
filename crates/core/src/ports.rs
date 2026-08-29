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

use async_trait::async_trait;

use crate::error::Result;
use crate::model::{
    BindHealth, DeliveryOutcome, Event, Harness, Job, JobId, ModelRow, Msg, Outcome, Pane,
    ProcIdentity, Readiness, SeatDescriptor, SeatId, Seq,
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

/// The job queue every delivery and sidecar rides on (R4).
#[async_trait]
pub trait Queue: Send + Sync {
    /// Enqueue, collapsing onto any LIVE job with the same `dedupe_key` — N
    /// rapid submits become one row, and the returned id is that row's.
    async fn enqueue(&self, job: Job) -> Result<JobId>;

    /// Claim the next runnable job of any of `kinds` for `worker`. At most one
    /// job per `serial_key` is claimed at a time, so two workers never act on
    /// one entity concurrently.
    async fn claim(&self, kinds: &[String], worker: &str) -> Result<Option<(JobId, Job)>>;

    /// Record how a claimed job ended, freeing its serial key.
    async fn ack(&self, job: JobId, outcome: Outcome) -> Result<()>;
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

/// Every tmux syscall in the workspace.
#[async_trait]
pub trait TmuxPort: Send + Sync {
    /// All panes tmux currently reports.
    async fn list_panes(&self) -> Result<Vec<Pane>>;

    /// Type `keys` into a pane.
    async fn send_keys(&self, pane: &str, keys: &str) -> Result<()>;

    /// The last `lines` of a pane's visible output.
    async fn capture(&self, pane: &str, lines: u32) -> Result<String>;

    /// Kill a pane.
    async fn kill(&self, pane: &str) -> Result<()>;

    /// Open a new window in `session`, returning its pane.
    async fn new_window(&self, session: &str, name: &str, cwd: &str) -> Result<Pane>;

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
