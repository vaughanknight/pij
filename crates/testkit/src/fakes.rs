//! A deterministic, scriptable fake for each of the seven frozen ports.
//!
//! Shipped as a crate, not copied per unit (mining note DL-004: every fs3
//! adapter re-invented a ~110-line recorder because no shared fake existed).
//! Three properties every fake here has, and a mocking framework does not:
//!
//! * **Deterministic** — no clocks, no threads, no ordering surprises. The same
//!   calls produce the same answers on every machine.
//! * **Scriptable** — a test programs the answers it needs
//!   (`FakeTmux::script_capture`), and unprogrammed calls return a defined
//!   default rather than panicking on an "unexpected call".
//! * **Recording** — every call is kept in order, so a test can assert what the
//!   code under test DID, not merely what it returned. `calls()` is the
//!   assertion surface.
//!
//! Doubles come from here or they do not exist: mocking frameworks are refused
//! workspace-wide by the arch gate (tenet 5).

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::sync::Mutex;

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::model::{
    BindHealth, DeliveryOutcome, Event, Harness, Job, JobId, ModelRow, Msg, Outcome, Pane,
    ProcIdentity, Readiness, SeatDescriptor, SeatId, Seq,
};
use pij_core::ports::{
    HarnessPort, LivenessPort, Queue, Registry, SeatFilter, Spine, TmuxPort, Transport,
};

/// One recorded interaction, rendered as a stable string so assertions read as
/// the story of what happened: `["put:pij-seat", "tombstone:pij-seat:dead"]`.
pub type Call = String;

#[derive(Default)]
struct Recorder {
    calls: Vec<Call>,
}

impl Recorder {
    fn record(&mut self, call: impl Into<Call>) {
        self.calls.push(call.into());
    }
}

/// The seat roster, in memory.
#[derive(Default)]
pub struct FakeRegistry {
    state: Mutex<RegistryState>,
}

#[derive(Default)]
struct RegistryState {
    seats: BTreeMap<String, SeatDescriptor>,
    tombstones: BTreeMap<String, String>,
    seq: u64,
    recorder: Recorder,
}

impl FakeRegistry {
    /// An empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Pre-load a seat without recording a call, for arranging a test's world.
    pub fn with_seat(self, descriptor: SeatDescriptor) -> Self {
        self.state
            .lock()
            .expect("fake registry mutex")
            .seats
            .insert(descriptor.id.0.clone(), descriptor);
        self
    }

    /// Every call made, in order.
    pub fn calls(&self) -> Vec<Call> {
        self.state
            .lock()
            .expect("fake registry mutex")
            .recorder
            .calls
            .clone()
    }

    /// Why a seat was tombstoned, if it was.
    pub fn tombstone_reason(&self, seat: &SeatId) -> Option<String> {
        self.state
            .lock()
            .expect("fake registry mutex")
            .tombstones
            .get(seat.as_str())
            .cloned()
    }
}

#[async_trait]
impl Registry for FakeRegistry {
    async fn get(&self, seat: &SeatId) -> Result<Option<SeatDescriptor>> {
        let mut state = self.state.lock().expect("fake registry mutex");
        state.recorder.record(format!("get:{seat}"));
        Ok(state.seats.get(seat.as_str()).cloned())
    }

    async fn put(&self, descriptor: SeatDescriptor) -> Result<Seq> {
        let mut state = self.state.lock().expect("fake registry mutex");
        state.recorder.record(format!("put:{}", descriptor.id));
        state.seq += 1;
        let seq = Seq(state.seq);
        state.seats.insert(descriptor.id.0.clone(), descriptor);
        Ok(seq)
    }

    async fn list(&self, filter: SeatFilter) -> Result<Vec<SeatDescriptor>> {
        let mut state = self.state.lock().expect("fake registry mutex");
        state.recorder.record("list".to_string());
        Ok(state
            .seats
            .values()
            .filter(|seat| filter.harness.is_none_or(|h| h == seat.harness))
            .filter(|seat| {
                filter
                    .folder
                    .as_ref()
                    .is_none_or(|folder| folder == &seat.folder)
            })
            .filter(|seat| {
                filter
                    .parent
                    .as_ref()
                    .is_none_or(|parent| Some(parent) == seat.parent.as_ref())
            })
            .cloned()
            .collect())
    }

    async fn tombstone(&self, seat: &SeatId, reason: &str) -> Result<Seq> {
        let mut state = self.state.lock().expect("fake registry mutex");
        state.recorder.record(format!("tombstone:{seat}:{reason}"));
        if !state.seats.contains_key(seat.as_str()) {
            return Err(PijError::NoRegistryEntry { seat: seat.clone() });
        }
        state.seq += 1;
        state.tombstones.insert(seat.0.clone(), reason.to_string());
        Ok(Seq(state.seq))
    }
}

/// The append-only history, in memory.
#[derive(Default)]
pub struct FakeSpine {
    state: Mutex<SpineState>,
}

#[derive(Default)]
struct SpineState {
    events: Vec<(Seq, Event)>,
    seq: u64,
}

impl FakeSpine {
    /// An empty spine.
    pub fn new() -> Self {
        Self::default()
    }

    /// How many events have been appended.
    pub fn len(&self) -> usize {
        self.state.lock().expect("fake spine mutex").events.len()
    }

    /// Is the spine empty?
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[async_trait]
impl Spine for FakeSpine {
    async fn append(&self, event: Event) -> Result<Seq> {
        let mut state = self.state.lock().expect("fake spine mutex");
        state.seq += 1;
        let seq = Seq(state.seq);
        state.events.push((seq, event));
        Ok(seq)
    }

    async fn tail(&self, seat: Option<&SeatId>, since: Seq) -> Result<Vec<Event>> {
        let state = self.state.lock().expect("fake spine mutex");
        Ok(state
            .events
            .iter()
            .filter(|(seq, _)| *seq > since)
            .filter(|(_, event)| seat.is_none_or(|s| event.seat.as_ref() == Some(s)))
            .map(|(_, event)| event.clone())
            .collect())
    }
}

/// The job queue, in memory — dedupe and serial keys included, because a fake
/// that drops the semantics is a fake of the wrong thing.
#[derive(Default)]
pub struct FakeQueue {
    state: Mutex<QueueState>,
}

#[derive(Default)]
struct QueueState {
    live: Vec<(JobId, Job)>,
    claimed: HashMap<u64, (Job, String)>,
    acked: Vec<(JobId, Outcome)>,
    next_id: u64,
}

impl FakeQueue {
    /// An empty queue.
    pub fn new() -> Self {
        Self::default()
    }

    /// How many live (unclaimed) rows exist — the assertion surface for dedupe.
    pub fn live_len(&self) -> usize {
        self.state.lock().expect("fake queue mutex").live.len()
    }

    /// Everything acked, in order.
    pub fn acked(&self) -> Vec<(JobId, Outcome)> {
        self.state.lock().expect("fake queue mutex").acked.clone()
    }
}

#[async_trait]
impl Queue for FakeQueue {
    async fn enqueue(&self, job: Job) -> Result<JobId> {
        let mut state = self.state.lock().expect("fake queue mutex");
        // Dedupe over LIVE rows only: an acked job's key is free again, which is
        // what makes "one row per burst" different from "one row for ever".
        if let Some((id, _)) = state
            .live
            .iter()
            .find(|(_, live)| live.dedupe_key == job.dedupe_key)
        {
            return Ok(*id);
        }
        state.next_id += 1;
        let id = JobId(state.next_id);
        state.live.push((id, job));
        Ok(id)
    }

    async fn claim(&self, kinds: &[String], worker: &str) -> Result<Option<(JobId, Job)>> {
        let mut state = self.state.lock().expect("fake queue mutex");
        let busy: Vec<String> = state
            .claimed
            .values()
            .map(|(job, _)| job.serial_key.clone())
            .collect();
        let Some(index) = state
            .live
            .iter()
            .position(|(_, job)| kinds.contains(&job.kind) && !busy.contains(&job.serial_key))
        else {
            return Ok(None);
        };
        let (id, job) = state.live.remove(index);
        state
            .claimed
            .insert(id.0, (job.clone(), worker.to_string()));
        Ok(Some((id, job)))
    }

    async fn ack(&self, job: JobId, outcome: Outcome) -> Result<()> {
        let mut state = self.state.lock().expect("fake queue mutex");
        state.claimed.remove(&job.0);
        state.acked.push((job, outcome));
        Ok(())
    }
}

/// A transport whose reachability and outcome are scripted.
pub struct FakeTransport {
    name: String,
    state: Mutex<TransportState>,
}

#[derive(Default)]
struct TransportState {
    reachable: bool,
    outcome: Option<DeliveryOutcome>,
    delivered: Vec<Msg>,
    recorder: Recorder,
}

impl FakeTransport {
    /// A transport that can reach every seat and delivers.
    pub fn reachable() -> Self {
        FakeTransport {
            name: "fake".to_string(),
            state: Mutex::new(TransportState {
                reachable: true,
                ..TransportState::default()
            }),
        }
    }

    /// A transport that can reach nobody — the pre-bind and busy cases, which is
    /// where TS lost messages while reporting success.
    pub fn unreachable() -> Self {
        FakeTransport {
            name: "fake".to_string(),
            state: Mutex::new(TransportState::default()),
        }
    }

    /// Force the outcome `deliver` reports, whatever reachability says.
    pub fn script_outcome(self, outcome: DeliveryOutcome) -> Self {
        self.state.lock().expect("fake transport mutex").outcome = Some(outcome);
        self
    }

    /// Every message this transport actually delivered.
    pub fn delivered(&self) -> Vec<Msg> {
        self.state
            .lock()
            .expect("fake transport mutex")
            .delivered
            .clone()
    }

    /// Every call made, in order.
    pub fn calls(&self) -> Vec<Call> {
        self.state
            .lock()
            .expect("fake transport mutex")
            .recorder
            .calls
            .clone()
    }
}

#[async_trait]
impl Transport for FakeTransport {
    fn name(&self) -> &str {
        &self.name
    }

    async fn can_deliver(&self, seat: &SeatDescriptor) -> Result<bool> {
        let mut state = self.state.lock().expect("fake transport mutex");
        state.recorder.record(format!("can_deliver:{}", seat.id));
        Ok(state.reachable)
    }

    async fn deliver(&self, seat: &SeatDescriptor, msg: &Msg) -> Result<DeliveryOutcome> {
        let mut state = self.state.lock().expect("fake transport mutex");
        state
            .recorder
            .record(format!("deliver:{}:{}", seat.id, msg.msg_id));
        if let Some(outcome) = state.outcome.clone() {
            return Ok(outcome);
        }
        if !state.reachable {
            return Ok(DeliveryOutcome::Queued);
        }
        state.delivered.push(msg.clone());
        Ok(DeliveryOutcome::Delivered)
    }
}

/// tmux, scripted: panes are arranged, captures are queued, keystrokes recorded.
#[derive(Default)]
pub struct FakeTmux {
    state: Mutex<TmuxState>,
}

#[derive(Default)]
struct TmuxState {
    panes: Vec<Pane>,
    captures: VecDeque<String>,
    typing: bool,
    recorder: Recorder,
}

impl FakeTmux {
    /// A tmux with no panes.
    pub fn new() -> Self {
        Self::default()
    }

    /// Arrange a pane.
    pub fn with_pane(self, pane: Pane) -> Self {
        self.state.lock().expect("fake tmux mutex").panes.push(pane);
        self
    }

    /// Queue what the next `capture` returns. Queued in order, so a test can
    /// script a pane that changes between polls — the readiness-anchor case.
    pub fn script_capture(self, text: impl Into<String>) -> Self {
        self.state
            .lock()
            .expect("fake tmux mutex")
            .captures
            .push_back(text.into());
        self
    }

    /// Make the typing gate report a human mid-keystroke.
    pub fn with_user_typing(self) -> Self {
        self.state.lock().expect("fake tmux mutex").typing = true;
        self
    }

    /// Every call made, in order.
    pub fn calls(&self) -> Vec<Call> {
        self.state
            .lock()
            .expect("fake tmux mutex")
            .recorder
            .calls
            .clone()
    }
}

#[async_trait]
impl TmuxPort for FakeTmux {
    async fn list_panes(&self) -> Result<Vec<Pane>> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state.recorder.record("list_panes".to_string());
        Ok(state.panes.clone())
    }

    async fn send_keys(&self, pane: &str, keys: &str) -> Result<()> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state.recorder.record(format!("send_keys:{pane}:{keys}"));
        Ok(())
    }

    async fn capture(&self, pane: &str, lines: u32) -> Result<String> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state.recorder.record(format!("capture:{pane}:{lines}"));
        // An unscripted capture is an empty pane, not a panic: a fake that
        // explodes on an unexpected call makes tests about the fake.
        Ok(state.captures.pop_front().unwrap_or_default())
    }

    async fn kill(&self, pane: &str) -> Result<()> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state.recorder.record(format!("kill:{pane}"));
        state.panes.retain(|p| p.id != pane);
        Ok(())
    }

    async fn new_window(&self, session: &str, name: &str, cwd: &str) -> Result<Pane> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state
            .recorder
            .record(format!("new_window:{session}:{name}"));
        let pane = Pane {
            id: format!("%{}", 100 + state.panes.len()),
            session: session.to_string(),
            window: name.to_string(),
            title: cwd.to_string(),
        };
        state.panes.push(pane.clone());
        Ok(pane)
    }

    async fn user_typing(&self, pane: &str) -> Result<bool> {
        let mut state = self.state.lock().expect("fake tmux mutex");
        state.recorder.record(format!("user_typing:{pane}"));
        Ok(state.typing)
    }
}

/// A harness adapter with scripted discovery, binding, readiness and catalog.
pub struct FakeHarness {
    kind: Harness,
    state: Mutex<HarnessState>,
}

#[derive(Default)]
struct HarnessState {
    session: Option<String>,
    bind: Option<BindHealth>,
    readiness: VecDeque<Readiness>,
    models: Vec<ModelRow>,
}

impl FakeHarness {
    /// A harness adapter for `kind` that discovers nothing and is never ready.
    pub fn new(kind: Harness) -> Self {
        FakeHarness {
            kind,
            state: Mutex::new(HarnessState::default()),
        }
    }

    /// Script the native session id discovery finds.
    pub fn with_session(self, session: impl Into<String>) -> Self {
        self.state.lock().expect("fake harness mutex").session = Some(session.into());
        self
    }

    /// Script the bind verdict.
    pub fn with_bind(self, bind: BindHealth) -> Self {
        self.state.lock().expect("fake harness mutex").bind = Some(bind);
        self
    }

    /// Queue a readiness answer. Queued in order so a test can walk a seat from
    /// booting to ready without a clock.
    pub fn script_readiness(self, readiness: Readiness) -> Self {
        self.state
            .lock()
            .expect("fake harness mutex")
            .readiness
            .push_back(readiness);
        self
    }

    /// Set the catalog this harness reports.
    pub fn with_models(self, models: Vec<ModelRow>) -> Self {
        self.state.lock().expect("fake harness mutex").models = models;
        self
    }
}

#[async_trait]
impl HarnessPort for FakeHarness {
    fn kind(&self) -> Harness {
        self.kind
    }

    async fn discover_session(&self, _pane: &str) -> Result<Option<String>> {
        Ok(self
            .state
            .lock()
            .expect("fake harness mutex")
            .session
            .clone())
    }

    async fn bind(&self, descriptor: &SeatDescriptor) -> Result<BindHealth> {
        let state = self.state.lock().expect("fake harness mutex");
        Ok(state.bind.clone().unwrap_or(BindHealth::Unbound {
            evidence: format!("fake harness has no scripted bind for {}", descriptor.id),
        }))
    }

    async fn readiness(&self, _pane: &str) -> Result<Readiness> {
        let mut state = self.state.lock().expect("fake harness mutex");
        Ok(state.readiness.pop_front().unwrap_or(Readiness::NotYet {
            observed: "fake harness: nothing scripted".to_string(),
        }))
    }

    async fn models(&self) -> Result<Vec<ModelRow>> {
        Ok(self
            .state
            .lock()
            .expect("fake harness mutex")
            .models
            .clone())
    }
}

/// A process table, as a map. The whole point is that a recycled pid is one line
/// to arrange: record a start time, then report a different one.
#[derive(Default)]
pub struct FakeLiveness {
    procs: Mutex<HashMap<u32, u64>>,
}

impl FakeLiveness {
    /// A machine with no processes.
    pub fn new() -> Self {
        Self::default()
    }

    /// Arrange a running process.
    pub fn with_proc(self, proc: ProcIdentity) -> Self {
        self.procs
            .lock()
            .expect("fake liveness mutex")
            .insert(proc.pid, proc.proc_start);
        self
    }

    /// Arrange a DIFFERENT process at the same pid — the recycled case.
    pub fn with_recycled(self, pid: u32, observed_start: u64) -> Self {
        self.procs
            .lock()
            .expect("fake liveness mutex")
            .insert(pid, observed_start);
        self
    }
}

#[async_trait]
impl LivenessPort for FakeLiveness {
    async fn proc_start(&self, pid: u32) -> Result<Option<u64>> {
        Ok(self
            .procs
            .lock()
            .expect("fake liveness mutex")
            .get(&pid)
            .copied())
    }
}
