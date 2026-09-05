use std::future::Future;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use pij_core::error::PijError;
use pij_core::model::{Event, Harness, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::ports::{LivenessPort, PutBinding, Registry, SeatFilter, TmuxPort};
use pij_core::wire;
use pij_harnesses::ensure_claude_inbound_accept;

use crate::events::EventBus;
use crate::http::Registration;

#[derive(Debug)]
pub(crate) enum RegistrationError {
    Refused(String),
    Runtime(PijError),
}

impl std::fmt::Display for RegistrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused(reason) => f.write_str(reason),
            Self::Runtime(error) => error.fmt(f),
        }
    }
}

#[derive(Clone)]
pub(crate) struct RegistrationService {
    registry: Arc<dyn Registry>,
    liveness: Arc<dyn LivenessPort>,
    event_bus: Arc<EventBus>,
    claude_homes: Vec<PathBuf>,
    registration_lock: Arc<tokio::sync::Mutex<()>>,
}

struct NativeHandoff {
    dead: Vec<SeatDescriptor>,
    prebind: Option<SeatDescriptor>,
}

impl RegistrationService {
    pub(crate) fn new(
        registry: Arc<dyn Registry>,
        liveness: Arc<dyn LivenessPort>,
        event_bus: Arc<EventBus>,
        claude_homes: Vec<PathBuf>,
    ) -> Self {
        Self {
            registry,
            liveness,
            event_bus,
            claude_homes,
            registration_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub(crate) fn with_native_lock(mut self, lock: Arc<tokio::sync::Mutex<()>>) -> Self {
        self.registration_lock = lock;
        self
    }

    pub(crate) async fn register(
        &self,
        claim: Registration,
    ) -> std::result::Result<SeatDescriptor, RegistrationError> {
        self.register_with_harness_session(claim, None)
            .await
            .map(|(descriptor, _)| descriptor)
    }

    pub(crate) async fn register_with_harness_session(
        &self,
        claim: Registration,
        harness_session: Option<String>,
    ) -> std::result::Result<(SeatDescriptor, PutBinding), RegistrationError> {
        self.register_inner(claim, harness_session, None).await
    }

    /// Attest extension delivery only after observing the actual Copilot host.
    pub(crate) async fn register_native(
        &self,
        claim: Registration,
        harness_session: Option<String>,
        tmux: &dyn TmuxPort,
    ) -> std::result::Result<(SeatDescriptor, PutBinding), RegistrationError> {
        self.register_native_with_observer(claim, harness_session, tmux, observe_native_process)
            .await
    }

    async fn register_native_with_observer<F, Fut>(
        &self,
        claim: Registration,
        harness_session: Option<String>,
        tmux: &dyn TmuxPort,
        mut observe: F,
    ) -> std::result::Result<(SeatDescriptor, PutBinding), RegistrationError>
    where
        F: FnMut(u32) -> Fut,
        Fut: Future<Output = std::result::Result<Option<NativeProcess>, RegistrationError>>,
    {
        if claim.harness != Harness::Copilot.as_str() || claim.relay {
            return Err(native_refusal("requires harness copilot and relay false"));
        }
        if harness_session
            .as_deref()
            .is_none_or(|session| session.trim().is_empty())
        {
            return Err(native_refusal("requires a runtime native session"));
        }
        let identity = match (claim.pid, claim.proc_start) {
            (Some(pid), Some(proc_start)) if pid > 0 && proc_start > 0 => {
                ProcIdentity { pid, proc_start }
            }
            _ => {
                return Err(native_refusal(
                    "requires a complete nonzero pid/proc_start tuple",
                ));
            }
        };
        tokio::time::timeout(
            Duration::from_secs(2),
            self.verify_native_host(identity, claim.pane.as_deref(), tmux, &mut observe),
        )
        .await
        .map_err(|_| native_refusal("host observation exceeded two seconds"))??;
        let dead_native = self
            .observe_dead_native_owners(
                &claim,
                harness_session
                    .as_deref()
                    .expect("validated native session"),
                identity,
            )
            .await?;
        self.register_inner(claim, harness_session, Some(&dead_native))
            .await
    }

    /// A dead exact incarnation cannot come back to life. Collect that witness
    /// outside global exclusion, then bind it to unchanged ownership at commit.
    async fn observe_dead_native_owners(
        &self,
        claim: &Registration,
        session: &str,
        identity: ProcIdentity,
    ) -> std::result::Result<NativeHandoff, RegistrationError> {
        let seats = self
            .registry
            .list(SeatFilter::default())
            .await
            .map_err(RegistrationError::Runtime)?;
        let prebind = registration_target(claim, true, &seats)
            .filter(|seat| {
                seat.harness == Harness::Copilot
                    && !seat.relay
                    && seat.tombstoned_at.is_none()
                    && seat.proc.is_none()
                    && seat.pane.is_some()
                    && seat.pane == claim.pane
                    && seat.spawn_id.as_deref().is_some_and(|spawn| {
                        !spawn.is_empty() && claim.spawn_id.as_deref() == Some(spawn)
                    })
                    && seat
                        .harness_session
                        .as_deref()
                        .is_none_or(|native| native == session)
            })
            .cloned();
        let mut dead = Vec::new();
        for seat in seats {
            if seat.harness != Harness::Copilot
                || !seat.native_extension_delivery
                || seat.tombstoned_at.is_some()
                || seat.relay
            {
                continue;
            }
            let Some(previous) = seat.proc.filter(|proc| proc.pid > 0 && proc.proc_start > 0)
            else {
                continue;
            };
            if previous == identity {
                continue;
            }
            let same_address_resume =
                seat.id.as_str() == claim.id && seat.harness_session.as_deref() == Some(session);
            let stale_pane_owner = seat.id.as_str() != claim.id
                && claim.pane.is_some()
                && seat.pane == claim.pane
                && seat
                    .harness_session
                    .as_deref()
                    .is_some_and(|old| !old.is_empty() && old != session);
            let explicit_same_native_prebind =
                prebind.as_ref().is_some_and(|target| target.id != seat.id)
                    && seat.harness_session.as_deref() == Some(session);
            if (same_address_resume || stale_pane_owner || explicit_same_native_prebind)
                && self
                    .liveness
                    .proc_start(previous.pid)
                    .await
                    .map_err(RegistrationError::Runtime)?
                    != Some(previous.proc_start)
            {
                dead.push(seat);
            }
        }
        Ok(NativeHandoff { dead, prebind })
    }

    async fn verify_native_host<F, Fut>(
        &self,
        identity: ProcIdentity,
        pane: Option<&str>,
        tmux: &dyn TmuxPort,
        observe: &mut F,
    ) -> std::result::Result<(), RegistrationError>
    where
        F: FnMut(u32) -> Fut,
        Fut: Future<Output = std::result::Result<Option<NativeProcess>, RegistrationError>>,
    {
        self.require_process(identity).await?;
        let pane_process = match pane {
            Some(pane) => Some(
                tmux.pane_process(pane)
                    .await
                    .map_err(RegistrationError::Runtime)?
                    .ok_or_else(|| native_refusal("the claimed pane has no observed process"))?,
            ),
            None => None,
        };
        let pane_identity = if let Some(process) = &pane_process {
            Some(self.observe_identity(process.pid).await?)
        } else {
            None
        };
        let mut ancestry = Vec::with_capacity(8);
        let mut current = identity;
        loop {
            if ancestry.len() == 32 || ancestry.contains(&current) {
                return Err(native_refusal(
                    "pane ancestry is cyclic or exceeds 32 processes",
                ));
            }
            let process = observe(current.pid)
                .await?
                .ok_or_else(|| native_refusal("a host/ancestor process disappeared"))?;
            if current == identity && !process.is_copilot_host() {
                return Err(native_refusal(
                    "claimed pid is not an actual Copilot host executable",
                ));
            }
            ancestry.push(current);
            if pane_identity.is_none_or(|pane| pane == current) {
                break;
            }
            if process.parent == 0 {
                return Err(native_refusal(
                    "host ancestry does not reach the exact pane process",
                ));
            }
            let parent = self.observe_identity(process.parent).await?;
            if parent.proc_start > current.proc_start {
                return Err(native_refusal(
                    "an ancestor pid was reused after its child started",
                ));
            }
            current = parent;
        }
        // Sandwich the entire observation, including the pane and every ancestor,
        // with start-time checks. A PID by itself is never an incarnation witness.
        for process in ancestry {
            self.require_process(process).await?;
        }
        if let (Some(pane), Some(expected)) = (pane, pane_process)
            && tmux
                .pane_process(pane)
                .await
                .map_err(RegistrationError::Runtime)?
                .is_none_or(|observed| observed.pid != expected.pid)
        {
            return Err(native_refusal(
                "pane process changed during host observation",
            ));
        }
        self.require_process(identity).await
    }

    async fn observe_identity(
        &self,
        pid: u32,
    ) -> std::result::Result<ProcIdentity, RegistrationError> {
        let proc_start = self
            .liveness
            .proc_start(pid)
            .await
            .map_err(RegistrationError::Runtime)?
            .filter(|start| pid > 0 && *start > 0)
            .ok_or_else(|| native_refusal("host/ancestor process has no observed start"))?;
        Ok(ProcIdentity { pid, proc_start })
    }

    async fn require_process(
        &self,
        expected: ProcIdentity,
    ) -> std::result::Result<(), RegistrationError> {
        if self.observe_identity(expected.pid).await? != expected {
            return Err(native_refusal(
                "process start changed during host observation",
            ));
        }
        Ok(())
    }

    async fn register_inner(
        &self,
        claim: Registration,
        harness_session: Option<String>,
        handoff: Option<&NativeHandoff>,
    ) -> std::result::Result<(SeatDescriptor, PutBinding), RegistrationError> {
        let native = handoff.is_some();
        let dead_native = handoff.map_or(&[][..], |proof| proof.dead.as_slice());
        let harness_session = harness_session.filter(|session| !session.trim().is_empty());
        let proc = match (claim.pid, claim.proc_start) {
            (Some(pid), Some(proc_start)) => {
                let observed = self
                    .liveness
                    .proc_start(pid)
                    .await
                    .map_err(RegistrationError::Runtime)?;
                if observed != Some(proc_start) {
                    return Err(RegistrationError::Refused(format!(
                        "the payload is a claim, but the daemon observed process {pid} start as {observed:?}, not {proc_start}"
                    )));
                }
                Some(ProcIdentity { pid, proc_start })
            }
            (None, None) => None,
            _ => {
                return Err(RegistrationError::Refused(
                    "pid and proc_start must travel together or not at all".to_string(),
                ));
            }
        };

        // Process/ancestry evidence is collected without excluding inbox readers.
        // Re-read the entire roster under shared mutation exclusion: two different
        // seat IDs can still contend for the same process, session, or pane.
        let _guard = self.registration_lock.lock().await;
        let seats = self
            .registry
            .list(SeatFilter::default())
            .await
            .map_err(RegistrationError::Runtime)?;
        if dead_native
            .iter()
            .chain(handoff.and_then(|proof| proof.prebind.as_ref()))
            .any(|observed| {
                seats
                    .iter()
                    .find(|seat| seat.id == observed.id)
                    .is_none_or(|current| !same_native_owner(observed, current))
            })
        {
            return Err(native_refusal(
                "native owner changed during death observation; retry registration",
            ));
        }
        let claimed_id = SeatId::from(claim.id.clone());
        let existing = registration_target(&claim, native, &seats);
        // Native-only ownership is a harness invariant, not a live-process flag.
        // Relabeling a prebind or retired row would bypass inbox tuple checks.
        if existing.is_some_and(|seat| seat.harness == Harness::Copilot)
            && claim.harness != Harness::Copilot.as_str()
        {
            return Err(native_refusal(
                "an existing Copilot seat cannot change harness",
            ));
        }
        if native {
            check_native_roster(
                &claim,
                harness_session.as_deref(),
                proc,
                &seats,
                existing,
                dead_native,
            )?;
        } else if let Some(owner) = seats.iter().find(|seat| {
            seat.harness == Harness::Copilot
                && seat.proc.is_some()
                && seat.tombstoned_at.is_none()
                && (existing.is_some_and(|existing| existing.id == seat.id)
                    || claim.supersedes.as_ref() == Some(&seat.id))
        }) {
            // Copilot remains native-only after capability withdrawal. Clearing
            // its flag cannot authorize a later legacy relabel or supersedes.
            if claim.supersedes.is_some()
                || claim.harness != Harness::Copilot.as_str()
                || proc != owner.proc
                || claim.pane != owner.pane
                || owner
                    .harness_session
                    .as_ref()
                    .zip(harness_session.as_ref())
                    .is_some_and(|(previous, claimed)| previous != claimed)
                || claim.relay
                || claim
                    .spawn_id
                    .as_ref()
                    .is_some_and(|spawn| Some(spawn) != owner.spawn_id.as_ref())
            {
                return Err(native_refusal(
                    "ordinary registration cannot change or supersede an active Copilot incarnation",
                ));
            }
        }

        let predecessor = match (claim.supersedes.as_ref(), proc) {
            (Some(previous), Some(identity)) => {
                match seats.iter().find(|seat| &seat.id == previous) {
                    Some(seat) if seat.proc == Some(identity) => Some(seat.clone()),
                    Some(_) => {
                        return Err(RegistrationError::Refused(format!(
                            "seat `{previous}` does not share this process, so it cannot be superseded by `{}` — a claim may only supersede itself",
                            claim.id
                        )));
                    }
                    None => {
                        return Err(RegistrationError::Refused(format!(
                            "seat `{previous}` is not in the roster, so `{}` cannot supersede it",
                            claim.id
                        )));
                    }
                }
            }
            (Some(_), None) => {
                return Err(RegistrationError::Refused(
                    "an unbound claim cannot supersede a seat: without a process identity there is nothing that proves the successor is the same session"
                        .to_string(),
                ));
            }
            (None, _) => None,
        };

        let collision = proc.and_then(|identity| {
            seats.iter().find(|seat| {
                seat.proc == Some(identity)
                    && (!native || seat.tombstoned_at.is_none())
                    && seat.id != claimed_id
                    && predecessor.as_ref().is_none_or(|prev| prev.id != seat.id)
            })
        });
        let bound = proc.is_some();
        match crate::admission::from_registration(
            &claim.id,
            Some(&claim.harness),
            Some(&claim.folder),
            bound,
            collision.map(|seat| seat.id.as_str()),
        ) {
            pij_core::admission::Admission::Admit => {}
            pij_core::admission::Admission::Refuse(reason) => {
                return Err(RegistrationError::Refused(reason.to_string()));
            }
        }
        let Some(harness) = Harness::parse(&claim.harness) else {
            return Err(RegistrationError::Refused(
                "unrecognised harness after admission".to_string(),
            ));
        };
        if harness == Harness::Claude {
            for report in ensure_claude_inbound_accept(&self.claude_homes) {
                if let Some(error) = report.error.as_deref() {
                    eprintln!("pij-rs claude inbound: {}: {error}", report.home.display());
                    continue;
                }
                if report.changed {
                    self.event_bus
                        .publish(Event {
                            seq: None,
                            v: wire::EVENT_VERSION,
                            at: system_time_ms()?,
                            kind: "config.claude-inbound-ensured".to_string(),
                            seat: Some(claimed_id.clone()),
                            payload: serde_json::json!({
                                "home": report.home,
                                "before": report.before,
                                "after": report.after,
                            })
                            .to_string(),
                        })
                        .await
                        .map_err(RegistrationError::Runtime)?;
                }
            }
        }
        let mut descriptor = existing
            .cloned()
            .unwrap_or_else(|| SeatDescriptor::new(claimed_id, harness, claim.folder.clone()));
        let binds_spawned_incarnation = descriptor.proc.is_none()
            && descriptor
                .spawn_id
                .as_deref()
                .zip(claim.spawn_id.as_deref())
                .is_some_and(|(launched, claimed)| !launched.is_empty() && launched == claimed);
        let requested_model = descriptor.model.clone();
        let model_matches = requested_model_matches(
            requested_model.as_deref(),
            claim.actual_model.as_deref(),
            claim.actual_model_observed,
        );
        descriptor.harness = harness;
        if let Some(harness_session) = harness_session {
            descriptor.harness_session = Some(harness_session);
        }
        if descriptor.harness == Harness::Claude
            && descriptor.cross_session_inbound_accept.is_none()
        {
            descriptor.cross_session_inbound_accept = Some(true);
        }
        descriptor.folder = claim.folder;
        descriptor.pane = claim.pane;
        descriptor.proc = proc;
        if descriptor.spawn_id.is_none() {
            descriptor.spawn_id = claim.spawn_id;
        }
        if binds_spawned_incarnation && claim.actual_model_observed {
            descriptor.model = claim.actual_model.clone();
        } else if descriptor.model.is_none() {
            descriptor.model = claim.model;
        }
        if descriptor.provider.is_none() {
            descriptor.provider = claim.provider;
        }
        if descriptor.effort.is_none() {
            descriptor.effort = claim.effort;
        }
        if let Some(parent) = claim.parent {
            descriptor.parent = Some(parent);
        }
        descriptor.relay = claim.relay;
        // Ordinary registration preserves only an unchanged current attested owner.
        // Grants, transfers and revivals require verified native observation.
        // Compare before assignment: the clone still carries the incumbent's flag and tombstone.
        descriptor.native_extension_delivery = native
            || existing.is_some_and(|owner| {
                owner.native_extension_delivery
                    && owner.tombstoned_at.is_none()
                    && same_native_owner(owner, &descriptor)
            });

        // Retire only a proven-dead native resource owner, never its queued work.
        // Same-conversation resume updates its original address instead.
        for observed in dead_native.iter().filter(|seat| seat.id != descriptor.id) {
            let mut retired = seats
                .iter()
                .find(|seat| seat.id == observed.id)
                .expect("revalidated native owner")
                .clone();
            retired.tombstoned_at = Some(system_time_ms()?);
            retired.tombstone_reason = Some(format!(
                "dead native incarnation released its pane to `{}`; queued work retains its original context",
                descriptor.id
            ));
            retired.native_extension_delivery = false;
            self.registry
                .put(retired)
                .await
                .map_err(RegistrationError::Runtime)?;
        }

        if let Some(mut previous) = predecessor
            && previous.tombstoned_at.is_none()
        {
            previous.tombstoned_at = Some(system_time_ms()?);
            previous.tombstone_reason = Some(format!(
                "superseded by `{}` at a native session boundary (same process)",
                claim.id
            ));
            previous.native_extension_delivery = false;
            self.registry
                .put(previous)
                .await
                .map_err(RegistrationError::Runtime)?;
        }
        let (_, binding) = self
            .registry
            .put_reporting(descriptor.clone())
            .await
            .map_err(RegistrationError::Runtime)?;
        if binds_spawned_incarnation && model_matches {
            self.event_bus
                .publish(Event {
                    seq: None,
                    v: wire::EVENT_VERSION,
                    at: system_time_ms()?,
                    kind: "spawn.bound".to_string(),
                    seat: Some(descriptor.id.clone()),
                    payload: serde_json::json!({
                        "spawn_id": descriptor.spawn_id,
                        "pane": descriptor.pane,
                        "pid": descriptor.proc.map(|identity| identity.pid),
                    })
                    .to_string(),
                })
                .await
                .map_err(RegistrationError::Runtime)?;
        }
        Ok((descriptor, binding))
    }
}

fn native_refusal(reason: impl std::fmt::Display) -> RegistrationError {
    RegistrationError::Refused(format!("native Copilot registration refused: {reason}"))
}

fn registration_target<'a>(
    claim: &Registration,
    native: bool,
    seats: &'a [SeatDescriptor],
) -> Option<&'a SeatDescriptor> {
    seats
        .iter()
        .find(|seat| seat.id.as_str() == claim.id)
        .or_else(|| {
            if native && claim.supersedes.is_some() {
                return None;
            }
            let spawn_id = claim.spawn_id.as_deref().filter(|id| !id.is_empty())?;
            let pane = claim.pane.as_deref()?;
            seats.iter().find(|seat| {
                seat.proc.is_none()
                    && seat.spawn_id.as_deref() == Some(spawn_id)
                    && seat.pane.as_deref() == Some(pane)
            })
        })
}

fn same_native_owner(observed: &SeatDescriptor, current: &SeatDescriptor) -> bool {
    observed.harness == current.harness
        && observed.proc == current.proc
        && observed.pane == current.pane
        && observed.harness_session == current.harness_session
        && observed.spawn_id == current.spawn_id
        && observed.native_extension_delivery == current.native_extension_delivery
        && observed.relay == current.relay
        && observed.tombstoned_at == current.tombstoned_at
}

fn check_native_roster(
    claim: &Registration,
    session: Option<&str>,
    identity: Option<ProcIdentity>,
    seats: &[SeatDescriptor],
    existing: Option<&SeatDescriptor>,
    dead_native: &[SeatDescriptor],
) -> std::result::Result<(), RegistrationError> {
    let session = session.ok_or_else(|| native_refusal("requires a runtime native session"))?;
    let identity = identity.ok_or_else(|| native_refusal("requires a process identity"))?;
    let predecessor = if let Some(previous) = &claim.supersedes {
        if previous.as_str() == claim.id || existing.is_some() {
            return Err(native_refusal("supersedes must create a new seat id"));
        }
        let previous = seats
            .iter()
            .find(|seat| &seat.id == previous)
            .ok_or_else(|| native_refusal("superseded seat is absent"))?;
        if previous.tombstoned_at.is_some()
            || previous.proc != Some(identity)
            || previous.harness != Harness::Copilot
            || previous.relay
            || previous.pane != claim.pane
            || previous
                .harness_session
                .as_deref()
                .is_none_or(|old| old.is_empty() || old == session)
        {
            return Err(native_refusal(
                "supersedes requires an active Copilot seat, the same host/pane, and a new native session",
            ));
        }
        Some(previous)
    } else {
        None
    };

    if let Some(existing) = existing {
        let dead_previous = dead_native.iter().any(|seat| seat.id == existing.id);
        if existing.tombstoned_at.is_some()
            || existing.harness != Harness::Copilot
            || existing.relay
            || (existing.pane != claim.pane && !dead_previous)
            || existing
                .harness_session
                .as_deref()
                .is_some_and(|old| old != session)
        {
            return Err(native_refusal(
                "seat id conflicts with its harness, pane, session, or retirement",
            ));
        }
        match existing.proc {
            Some(previous) if previous != identity && !dead_previous => {
                return Err(native_refusal(
                    "seat id belongs to a different process incarnation",
                ));
            }
            None => {
                if existing.spawn_id.as_deref().is_none_or(str::is_empty)
                    || existing.spawn_id != claim.spawn_id
                    || existing.pane.is_none()
                {
                    return Err(native_refusal(
                        "pre-bind seat requires its exact spawn id and pane",
                    ));
                }
            }
            Some(_) => {}
        }
    }
    if let Some(spawn_id) = claim.spawn_id.as_deref()
        && (spawn_id.is_empty()
            || existing
                .or(predecessor)
                .and_then(|seat| seat.spawn_id.as_deref())
                != Some(spawn_id))
    {
        return Err(native_refusal(
            "spawn id has no matching pre-bind/current incarnation",
        ));
    }
    for seat in seats.iter().filter(|seat| seat.tombstoned_at.is_none()) {
        if existing.is_some_and(|existing| existing.id == seat.id)
            || predecessor.is_some_and(|previous| previous.id == seat.id)
            || dead_native.iter().any(|observed| observed.id == seat.id)
        {
            continue;
        }
        if seat.proc == Some(identity)
            || (seat.harness == Harness::Copilot
                && seat.harness_session.as_deref() == Some(session))
            || (claim.pane.is_some() && seat.pane == claim.pane)
        {
            return Err(native_refusal(format!(
                "process, native session, or pane already belongs to seat `{}`",
                seat.id
            )));
        }
    }
    Ok(())
}

#[derive(Clone, Debug)]
struct NativeProcess {
    parent: u32,
    executable: String,
    argv: Vec<String>,
}

impl NativeProcess {
    fn is_copilot_host(&self) -> bool {
        let executable = Path::new(&self.executable)
            .file_name()
            .and_then(|name| name.to_str());
        let argv0 = self.argv.first().and_then(|arg| Path::new(arg).file_name());
        match executable {
            Some("copilot") => argv0 == Some(std::ffi::OsStr::new("copilot")),
            Some("node") => {
                argv0 == Some(std::ffi::OsStr::new("node"))
                    && self.argv.get(1).is_some_and(|script| {
                        Path::new(script).ends_with("@github/copilot/index.js")
                    })
            }
            // In particular, sh/zsh -c 'copilot ...', the npm launcher, and the
            // Node extension child are not evidence of the actual native host.
            _ => false,
        }
    }
}

async fn observe_native_process(
    pid: u32,
) -> std::result::Result<Option<NativeProcess>, RegistrationError> {
    tokio::task::spawn_blocking(move || read_native_process(pid))
        .await
        .map_err(|error| native_refusal(format!("process observer failed: {error}")))?
}

#[cfg(target_os = "linux")]
fn read_native_process(pid: u32) -> std::result::Result<Option<NativeProcess>, RegistrationError> {
    // Linux comm is a mutable task name, NOT an executable witness. Use the
    // kernel executable link and NUL-delimited argv instead of trusting ps comm.
    let root = PathBuf::from(format!("/proc/{pid}"));
    let executable = match std::fs::read_link(root.join("exe")) {
        Ok(path) => path
            .into_os_string()
            .into_string()
            .map_err(|_| native_refusal("host executable is not UTF-8"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(native_refusal(format!(
                "cannot observe host executable: {error}"
            )));
        }
    };
    let Some(stat) = read_native_proc_file(&root.join("stat"))? else {
        return Ok(None);
    };
    let parent = std::str::from_utf8(&stat)
        .ok()
        .and_then(|stat| stat.rsplit_once(')'))
        .and_then(|(_, fields)| fields.split_whitespace().nth(1))
        .and_then(|pid| pid.parse().ok())
        .ok_or_else(|| native_refusal("process observation has no parent pid"))?;
    let Some(cmdline) = read_native_proc_file(&root.join("cmdline"))? else {
        return Ok(None);
    };
    if cmdline.is_empty() {
        return Err(native_refusal("process observation has no argv"));
    }
    let argv = cmdline
        .strip_suffix(&[0])
        .unwrap_or(&cmdline)
        .split(|byte| *byte == 0)
        .map(|arg| std::str::from_utf8(arg).map(str::to_string))
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| native_refusal("process argv is not UTF-8"))?;
    Ok(Some(NativeProcess {
        parent,
        executable,
        argv,
    }))
}

#[cfg(target_os = "linux")]
fn read_native_proc_file(path: &Path) -> std::result::Result<Option<Vec<u8>>, RegistrationError> {
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(native_refusal(format!(
                "cannot observe host process: {error}"
            )));
        }
    };
    let mut bytes = Vec::new();
    file.take(64 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| native_refusal(format!("cannot read process observation: {error}")))?;
    if bytes.len() > 64 * 1024 {
        return Err(native_refusal("process observation exceeded 64 KiB"));
    }
    Ok(Some(bytes))
}

#[cfg(not(target_os = "linux"))]
fn read_native_process(pid: u32) -> std::result::Result<Option<NativeProcess>, RegistrationError> {
    use std::process::{Command, Stdio};
    use std::time::Instant;

    // One requested PID, never a machine-wide process census. The child, output,
    // and wall time are bounded independently of the async caller's lifetime.
    const OUTPUT_LIMIT: u64 = 64 * 1024;
    // Darwin truncates `comm` paths when followed by another output column.
    // Read the kernel accounting name instead: the supported host basenames
    // fit, and is_copilot_host still independently checks argv/entrypoint.
    let mut child = Command::new("/bin/ps")
        .args([
            "-ww",
            "-p",
            &pid.to_string(),
            "-o",
            "ppid=",
            "-o",
            "ucomm=",
            "-o",
            "args=",
        ])
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| native_refusal(format!("cannot observe host process: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .expect("piped process observation stdout");
    let reader = std::thread::spawn(move || {
        let mut output = Vec::new();
        stdout
            .take(OUTPUT_LIMIT + 1)
            .read_to_end(&mut output)
            .map(|_| output)
    });
    let deadline = Instant::now() + Duration::from_millis(250);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(native_refusal(format!(
                    "process observation failed or timed out: {result:?}"
                )));
            }
        }
    };
    let output = reader
        .join()
        .map_err(|_| native_refusal("process output reader failed"))?
        .map_err(|error| native_refusal(format!("cannot read process observation: {error}")))?;
    let status = status?;
    if output.len() as u64 > OUTPUT_LIMIT {
        return Err(native_refusal("process observation exceeded 64 KiB"));
    }
    if !status.success() {
        return Ok(None);
    }
    parse_native_process(&output).map(Some)
}

#[cfg(any(not(target_os = "linux"), test))]
fn parse_native_process(output: &[u8]) -> std::result::Result<NativeProcess, RegistrationError> {
    let text = std::str::from_utf8(output)
        .map_err(|_| native_refusal("process observation is not UTF-8"))?;
    if text.trim().lines().count() != 1 {
        return Err(native_refusal(
            "process observation must describe exactly one process",
        ));
    }
    let mut fields = text.split_whitespace();
    let parent = fields
        .next()
        .and_then(|pid| pid.parse().ok())
        .ok_or_else(|| native_refusal("process observation has no parent pid"))?;
    let executable = fields
        .next()
        .ok_or_else(|| native_refusal("process observation has no executable"))?
        .to_string();
    let argv: Vec<String> = fields.map(str::to_string).collect();
    if argv.is_empty() {
        return Err(native_refusal("process observation has no argv"));
    }
    Ok(NativeProcess {
        parent,
        executable,
        argv,
    })
}

pub(crate) fn requested_model_matches(
    requested: Option<&str>,
    actual: Option<&str>,
    actual_observed: bool,
) -> bool {
    if !actual_observed {
        return true;
    }
    match (requested, actual) {
        (None, _) => true,
        (Some(_), None) => false,
        (Some(requested), Some(actual)) => {
            actual == requested
                || (!requested.contains('/')
                    && actual
                        .rsplit_once('/')
                        .is_some_and(|(_, model)| model == requested))
        }
    }
}

fn system_time_ms() -> std::result::Result<u64, RegistrationError> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            RegistrationError::Runtime(PijError::Adapter {
                adapter: "daemon/registration".to_string(),
                message: format!("system clock is before Unix epoch: {error}"),
            })
        })?
        .as_millis();
    u64::try_from(millis).map_err(|_| {
        RegistrationError::Runtime(PijError::Adapter {
            adapter: "daemon/registration".to_string(),
            message: "system clock milliseconds exceed u64".to_string(),
        })
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::future::{Ready, ready};
    #[cfg(unix)]
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    use pij_core::model::{Harness, PaneProcess, ProcIdentity, SeatDescriptor, SemanticState, Seq};
    use pij_core::ports::Queue;
    use pij_core::ports::{LivenessPort, Registry, SeatFilter, Spine};
    use pij_harnesses::InteractionGate;
    use pij_testkit::fakes::{FakeLiveness, FakeRegistry, FakeSpine, FakeTmux};
    use pij_testkit::fakes::{FakeQueue, FakeTransport};
    use tokio::sync::Notify;

    use crate::delivery::DeliveryService;

    use super::{
        NativeProcess, RegistrationError, RegistrationService, parse_native_process,
        requested_model_matches,
    };
    use crate::events::EventBus;
    use crate::http::Registration;

    const HOST: ProcIdentity = ProcIdentity {
        pid: 4242,
        proc_start: 126,
    };
    const SHELL: ProcIdentity = ProcIdentity {
        pid: 41,
        proc_start: 100,
    };
    const OTHER_HOST: ProcIdentity = ProcIdentity {
        pid: 777,
        proc_start: 126,
    };
    const SESSION: &str = "00000000-0000-4000-8000-000000000137";

    fn native_claim(id: &str) -> Registration {
        Registration {
            supersedes: None,
            id: id.to_string(),
            harness: "copilot".to_string(),
            folder: "/isolated/native-registration".to_string(),
            pane: Some("%137".to_string()),
            pid: Some(HOST.pid),
            proc_start: Some(HOST.proc_start),
            spawn_id: None,
            model: None,
            actual_model: None,
            actual_model_observed: false,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        }
    }

    fn native_seat(id: &str) -> SeatDescriptor {
        let mut seat = SeatDescriptor::new(id, Harness::Copilot, "/isolated/native-registration");
        seat.proc = Some(HOST);
        seat.pane = Some("%137".to_string());
        seat.harness_session = Some(SESSION.to_string());
        seat.native_extension_delivery = true;
        seat
    }

    fn native_liveness() -> Arc<dyn LivenessPort> {
        Arc::new(
            FakeLiveness::new()
                .with_proc(HOST)
                .with_proc(SHELL)
                .with_proc(OTHER_HOST),
        )
    }

    fn native_tmux() -> FakeTmux {
        FakeTmux::new().with_pane_process(
            "%137",
            PaneProcess {
                pid: SHELL.pid,
                cwd: "/isolated/native-registration".to_string(),
            },
        )
    }

    fn native_service(
        seats: Vec<SeatDescriptor>,
        liveness: Arc<dyn LivenessPort>,
    ) -> (RegistrationService, Arc<FakeRegistry>) {
        let registry = Arc::new(
            seats
                .into_iter()
                .fold(FakeRegistry::new(), |registry, seat| {
                    registry.with_seat(seat)
                }),
        );
        let bus = Arc::new(EventBus::new(Arc::new(FakeSpine::new()), 8).expect("event bus"));
        (
            RegistrationService::new(registry.clone(), liveness, bus, Vec::new()),
            registry,
        )
    }

    fn fixture_process(
        pid: u32,
    ) -> Ready<std::result::Result<Option<NativeProcess>, RegistrationError>> {
        ready(match pid {
            4242 | 777 => parse_native_process(
                b"41 /opt/copilot/copilot /opt/copilot/copilot --model gpt-5\n",
            )
            .map(Some),
            41 => parse_native_process(b"0 /bin/zsh -zsh\n").map(Some),
            _ => Ok(None),
        })
    }

    async fn attest(
        service: &RegistrationService,
        claim: Registration,
        session: Option<&str>,
        tmux: &FakeTmux,
    ) -> std::result::Result<SeatDescriptor, RegistrationError> {
        service
            .register_native_with_observer(
                claim,
                session.map(str::to_string),
                tmux,
                fixture_process,
            )
            .await
            .map(|(descriptor, _)| descriptor)
    }

    fn refused<T: std::fmt::Debug>(result: std::result::Result<T, RegistrationError>) {
        assert!(
            matches!(result, Err(RegistrationError::Refused(_))),
            "{result:?}"
        );
    }

    #[tokio::test]
    async fn native_requires_truthful_harness_session_and_complete_observed_tuple() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let tmux = native_tmux();
        for session in [None, Some(""), Some("   ")] {
            refused(attest(&service, native_claim("pij-native"), session, &tmux).await);
        }
        for (pid, proc_start) in [
            (None, None),
            (Some(HOST.pid), None),
            (None, Some(HOST.proc_start)),
            (Some(0), Some(HOST.proc_start)),
            (Some(HOST.pid), Some(0)),
            (Some(HOST.pid), Some(HOST.proc_start + 1)),
            (Some(999), Some(126)),
        ] {
            let mut claim = native_claim("pij-native");
            claim.pid = pid;
            claim.proc_start = proc_start;
            refused(attest(&service, claim, Some(SESSION), &tmux).await);
        }
        let mut other_harness = native_claim("pij-native");
        other_harness.harness = "pi".to_string();
        refused(attest(&service, other_harness, Some(SESSION), &tmux).await);
        let mut relay = native_claim("pij-native");
        relay.relay = true;
        refused(attest(&service, relay, Some(SESSION), &tmux).await);
        assert!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .is_empty()
        );
    }

    #[test]
    fn actual_host_matches_executable_and_entrypoint_not_shell_command_text() {
        for output in [
            "41 /opt/copilot/copilot /opt/copilot/copilot --model gpt-5\n",
            "41 /usr/bin/node node /opt/node_modules/@github/copilot/index.js\n",
            "41 copilot /long/absolute/install/path/copilot --model gpt-5\n",
            "41 node /long/absolute/install/path/node /opt/node_modules/@github/copilot/index.js\n",
        ] {
            assert!(
                parse_native_process(output.as_bytes())
                    .expect("host facts")
                    .is_copilot_host()
            );
        }
        for output in [
            "41 /bin/sh sh -c copilot --model gpt-5\n",
            "41 /bin/zsh zsh -c /opt/copilot/copilot\n",
            "41 /usr/bin/node node /opt/node_modules/@github/copilot/npm-loader.js\n",
            "41 /usr/bin/node node /home/me/.copilot/extensions/pij/extension.mjs\n",
            "41 /usr/bin/node node -e require('@github/copilot')\n",
            "41 /usr/bin/node node /opt/not-@github/copilot/index.js\n",
            "41 /opt/copilot-evil copilot\n",
            "41 /opt/copilot/copilot sh -c copilot\n",
            "41 sh /long/absolute/install/path/copilot --model gpt-5\n",
            "41 node node /opt/node_modules/@github/copilot/npm-loader.js\n",
            "41 node node /home/me/.copilot/extensions/pij/extension.mjs\n",
        ] {
            assert!(
                !parse_native_process(output.as_bytes())
                    .expect("non-host facts")
                    .is_copilot_host(),
                "{output}"
            );
        }
        assert!(parse_native_process(b"41 /bin/sh\n").is_err());
        assert!(parse_native_process(b"41 /bin/sh sh\n42 /bin/sh sh\n").is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn real_shell_process_is_not_an_actual_copilot_host() {
        // A test-owned child only: no fleet inspection, signal, or environment mutation.
        // A forged argv[0] must not outrank the observed kernel executable name.
        let mut shell = Command::new("/bin/sh")
            .arg0("copilot")
            .args(["-c", "read line"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("private shell witness");
        let (service, registry) = native_service(
            Vec::new(),
            Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
                pid: shell.id(),
                proc_start: 1,
            })),
        );
        let mut claim = native_claim("pij-real-shell");
        claim.pid = Some(shell.id());
        claim.proc_start = Some(1);
        claim.pane = None;
        let observed = service
            .register_native(claim, Some(SESSION.to_string()), &FakeTmux::new())
            .await;
        let _ = shell.kill();
        shell.wait().expect("reap private shell witness");
        assert!(
            observed
                .expect_err("real shell refused")
                .to_string()
                .contains("actual Copilot host executable")
        );
        assert!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn native_attests_actual_host_below_shell_but_refuses_shell_pane_pid() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let tmux = native_tmux();
        let seat = attest(&service, native_claim("pij-native"), Some(SESSION), &tmux)
            .await
            .expect("actual native host descended from pane shell");
        assert_eq!(seat.proc, Some(HOST));
        assert_eq!(seat.harness, Harness::Copilot);
        assert_eq!(seat.harness_session.as_deref(), Some(SESSION));
        assert!(seat.native_extension_delivery);

        let mut shell_claim = native_claim("pij-shell");
        shell_claim.pid = Some(SHELL.pid);
        shell_claim.proc_start = Some(SHELL.proc_start);
        let error = attest(&service, shell_claim, Some("shell-session"), &tmux)
            .await
            .expect_err("pane pid alone is not a host witness");
        assert!(error.to_string().contains("actual Copilot host executable"));
        assert_eq!(
            registry.list(SeatFilter::default()).await.expect("roster"),
            vec![seat]
        );
    }

    #[tokio::test]
    async fn native_requires_exact_observed_pane_ancestry_but_supports_paneless_hosts() {
        let (service, _) = native_service(Vec::new(), native_liveness());
        refused(
            attest(
                &service,
                native_claim("pij-native"),
                Some(SESSION),
                &FakeTmux::new(),
            )
            .await,
        );
        let wrong_pane = FakeTmux::new().with_pane_process(
            "%137",
            PaneProcess {
                pid: OTHER_HOST.pid,
                cwd: "/isolated/native-registration".to_string(),
            },
        );
        refused(
            attest(
                &service,
                native_claim("pij-native"),
                Some(SESSION),
                &wrong_pane,
            )
            .await,
        );
        let mut paneless = native_claim("pij-native");
        paneless.pane = None;
        assert!(
            attest(&service, paneless, Some(SESSION), &FakeTmux::new())
                .await
                .expect("paneless actual host")
                .native_extension_delivery
        );
    }

    #[tokio::test]
    async fn native_refuses_active_identity_process_session_harness_and_pane_collisions() {
        for mismatch in 0..8 {
            let mut existing = native_seat("pij-existing");
            let mut claim = native_claim("pij-existing");
            let mut session = SESSION;
            match mismatch {
                0 => {
                    claim.pid = Some(OTHER_HOST.pid);
                    claim.proc_start = Some(OTHER_HOST.proc_start);
                }
                1 => session = "unsolicited-new-session",
                2 => existing.harness = Harness::Pi,
                3 => existing.pane = Some("%other".to_string()),
                4 => existing.relay = true,
                5 => existing.tombstoned_at = Some(1),
                6 => claim.id = "pij-collision".to_string(),
                7 => {
                    claim.id = "pij-session-collision".to_string();
                    claim.pid = Some(OTHER_HOST.pid);
                    claim.proc_start = Some(OTHER_HOST.proc_start);
                    claim.pane = None;
                }
                _ => unreachable!(),
            }
            let (service, registry) = native_service(vec![existing.clone()], native_liveness());
            refused(attest(&service, claim, Some(session), &native_tmux()).await);
            assert_eq!(
                registry.get(&existing.id).await.expect("roster"),
                Some(existing)
            );
        }
    }

    #[tokio::test]
    async fn native_prebind_requires_exact_spawn_id_pane_and_harness() {
        let mut prebind = native_seat("pij-preallocated");
        prebind.proc = None;
        prebind.harness_session = None;
        prebind.native_extension_delivery = false;
        prebind.spawn_id = Some("spawn-137".to_string());
        let mut claim = native_claim("pij-preallocated");
        claim.spawn_id = prebind.spawn_id.clone();
        for mismatch in 0..5 {
            let mut existing = prebind.clone();
            let mut claim = claim.clone();
            match mismatch {
                0 => claim.spawn_id = Some("other-spawn".to_string()),
                1 => claim.spawn_id = None,
                2 => existing.pane = Some("%other".to_string()),
                3 => existing.harness = Harness::Pi,
                4 => {
                    claim.id = "pij-unknown-spawn".to_string();
                    claim.spawn_id = Some("unknown".to_string());
                }
                _ => unreachable!(),
            }
            let (service, registry) = native_service(vec![existing.clone()], native_liveness());
            refused(attest(&service, claim, Some(SESSION), &native_tmux()).await);
            assert_eq!(
                registry.get(&existing.id).await.expect("roster"),
                Some(existing)
            );
        }
        let (service, registry) = native_service(vec![prebind.clone()], native_liveness());
        // A runtime-derived request id must not discard the preallocated address.
        claim.id = "pij-runtime-session".to_string();
        let bound = attest(&service, claim, Some(SESSION), &native_tmux())
            .await
            .expect("exact prebind");
        assert_eq!(bound.id, prebind.id);
        assert_eq!(bound.proc, Some(HOST));
        assert!(bound.native_extension_delivery);
        assert_eq!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn native_reconnect_retains_address_and_explicit_new_session_retires_old_capability() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let tmux = native_tmux();
        let first = attest(&service, native_claim("pij-first"), Some(SESSION), &tmux)
            .await
            .expect("first");
        let reconnected = attest(&service, native_claim("pij-first"), Some(SESSION), &tmux)
            .await
            .expect("reconnect");
        assert_eq!(first, reconnected);
        let mut next = native_claim("pij-next");
        next.supersedes = Some(first.id.clone());
        let successor = attest(&service, next, Some("user-created-new-session"), &tmux)
            .await
            .expect("checked supersedes");
        assert_ne!(successor.id, first.id);
        assert_eq!(successor.proc, first.proc);
        assert!(successor.native_extension_delivery);
        let retired = registry
            .get(&first.id)
            .await
            .expect("roster")
            .expect("predecessor retained");
        assert!(retired.tombstoned_at.is_some());
        assert!(!retired.native_extension_delivery);
        assert_eq!(
            attest(
                &service,
                native_claim("pij-next"),
                Some("user-created-new-session"),
                &tmux
            )
            .await
            .expect("reconnect ignores retired collision"),
            successor,
        );
        refused(attest(&service, native_claim("pij-first"), Some(SESSION), &tmux).await);
    }

    #[tokio::test]
    async fn native_supersedes_refuses_same_id_same_session_wrong_process_or_existing_target() {
        for mismatch in 0..6 {
            let mut old = native_seat("pij-old");
            let mut claim = native_claim("pij-new");
            claim.supersedes = Some(old.id.clone());
            let mut session = "new-session";
            let mut seats = Vec::new();
            match mismatch {
                0 => claim.id = "pij-old".to_string(),
                1 => session = SESSION,
                2 => {
                    claim.pid = Some(OTHER_HOST.pid);
                    claim.proc_start = Some(OTHER_HOST.proc_start);
                }
                3 => old.pane = None,
                4 => old.harness = Harness::Pi,
                5 => seats.push(SeatDescriptor::new(
                    "pij-new",
                    Harness::Copilot,
                    "/isolated/native-registration",
                )),
                _ => unreachable!(),
            }
            seats.push(old.clone());
            let (service, registry) = native_service(seats, native_liveness());
            refused(attest(&service, claim, Some(session), &native_tmux()).await);
            assert_eq!(registry.get(&old.id).await.expect("roster"), Some(old));
        }
    }

    #[tokio::test]
    async fn ordinary_registration_preserves_unchanged_attested_native_owner_and_binding() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let owner = attest(
            &service,
            native_claim("pij-native"),
            Some(SESSION),
            &native_tmux(),
        )
        .await
        .expect("verified native owner");
        for session in [Some(SESSION), None, Some("   ")] {
            let (adopted, binding) = service
                .register_with_harness_session(
                    native_claim("pij-native"),
                    session.map(str::to_string),
                )
                .await
                .expect("unchanged ordinary adoption");
            assert!(adopted.native_extension_delivery);
            assert_eq!(adopted, owner);
            assert!(!binding.inserted);
            assert_eq!(binding.previous_proc, owner.proc);
            assert_eq!(
                registry.get(&owner.id).await.expect("roster"),
                Some(owner.clone())
            );
        }
    }

    #[tokio::test]
    async fn ordinary_registration_refuses_changed_native_owner_after_readoption() {
        for replacement in [
            OTHER_HOST,
            ProcIdentity {
                proc_start: HOST.proc_start + 1,
                ..HOST
            },
        ] {
            let (mut service, registry) = native_service(Vec::new(), native_liveness());
            let owner = attest(
                &service,
                native_claim("pij-native"),
                Some(SESSION),
                &native_tmux(),
            )
            .await
            .expect("verified native owner");
            assert_eq!(
                service.register(native_claim("pij-native")).await.unwrap(),
                owner
            );
            // Both a new PID and a recycled PID require native re-attestation,
            // even when the old exact incarnation is no longer observed alive.
            service.liveness = Arc::new(FakeLiveness::new().with_proc(replacement));
            let mut claim = native_claim("pij-native");
            claim.pid = Some(replacement.pid);
            claim.proc_start = Some(replacement.proc_start);
            let error = service
                .register_with_harness_session(claim, Some(SESSION.to_string()))
                .await
                .expect_err("ordinary registration cannot transfer native ownership");
            assert!(
                error
                    .to_string()
                    .contains("ordinary registration cannot change")
            );
            assert_eq!(
                registry.list(SeatFilter::default()).await.unwrap(),
                vec![owner]
            );
        }
    }

    #[tokio::test]
    async fn ordinary_registration_never_inherits_native_capability() {
        for change in 0..7 {
            let mut old = native_seat("pij-native");
            let mut claim = native_claim("pij-native");
            let mut session = Some(SESSION.to_string());
            match change {
                0 => old.native_extension_delivery = false,
                1 => {
                    claim.pid = Some(OTHER_HOST.pid);
                    claim.proc_start = Some(OTHER_HOST.proc_start);
                }
                2 => session = Some("different-session".to_string()),
                3 => {
                    claim.pid = None;
                    claim.proc_start = None;
                    session = None;
                }
                4 => old.tombstoned_at = Some(1),
                5 => {}
                6 => {
                    old.proc = None;
                    old.native_extension_delivery = false;
                }
                _ => unreachable!(),
            }
            let prior = if change == 5 {
                Vec::new()
            } else {
                vec![old.clone()]
            };
            let (service, registry) = native_service(prior, native_liveness());
            let ordinary = service.register_with_harness_session(claim, session).await;
            if matches!(change, 1..=3) {
                refused(ordinary);
                assert_eq!(registry.get(&old.id).await.expect("roster"), Some(old));
            } else {
                let (registered, binding) = ordinary.expect("ordinary registration without grant");
                assert!(!registered.native_extension_delivery, "case {change}");
                assert_eq!(binding.inserted, change == 5);
                assert_eq!(
                    binding.previous_proc,
                    if change == 5 { None } else { old.proc }
                );
                assert_eq!(registered.tombstoned_at, old.tombstoned_at);
                assert_eq!(
                    registry.get(&old.id).await.expect("roster"),
                    Some(registered)
                );
            }
        }
    }

    #[tokio::test]
    async fn ordinary_registration_cannot_relabel_or_supersede_active_copilot_seat() {
        for bypass in 0..6 {
            let old = native_seat("pij-native");
            let mut claim = native_claim("pij-native");
            match bypass {
                0 => claim.harness = "omp".to_string(),
                1 => claim.pane = Some("%other".to_string()),
                2 => claim.pane = None,
                3 => claim.relay = true,
                4 => claim.spawn_id = Some("unrelated-spawn".to_string()),
                5 => {
                    claim.id = "pij-legacy-successor".to_string();
                    claim.harness = "omp".to_string();
                    claim.supersedes = Some(old.id.clone());
                }
                _ => unreachable!(),
            }
            let (service, registry) = native_service(vec![old.clone()], native_liveness());
            refused(
                service
                    .register_with_harness_session(claim, Some(SESSION.to_string()))
                    .await,
            );
            assert_eq!(
                registry.list(SeatFilter::default()).await.expect("roster"),
                vec![old]
            );
        }
    }

    #[tokio::test]
    async fn cold_resume_requires_dead_attested_incarnation_and_preserves_hold() {
        for observed_start in [None, Some(HOST.proc_start), Some(HOST.proc_start + 1)] {
            for attested in [false, true] {
                let mut old = native_seat("pij-cold-resume");
                old.native_extension_delivery = attested;
                old.semantic_state = Some(SemanticState::Hold);
                let mut liveness = FakeLiveness::new().with_proc(SHELL).with_proc(OTHER_HOST);
                if let Some(proc_start) = observed_start {
                    liveness = liveness.with_proc(ProcIdentity {
                        pid: HOST.pid,
                        proc_start,
                    });
                }
                let (service, registry) = native_service(vec![old.clone()], Arc::new(liveness));
                let mut claim = native_claim(old.id.as_str());
                claim.pid = Some(OTHER_HOST.pid);
                claim.proc_start = Some(OTHER_HOST.proc_start);
                claim.pane = Some("%cold-resume".into());
                let tmux = FakeTmux::new().with_pane_process(
                    "%cold-resume",
                    PaneProcess {
                        pid: SHELL.pid,
                        cwd: old.folder.clone(),
                    },
                );
                let result = attest(&service, claim, Some(SESSION), &tmux).await;
                if attested && observed_start != Some(HOST.proc_start) {
                    let resumed =
                        result.expect("absent/recycled attested process permits cold resume");
                    assert_eq!(resumed.id, old.id);
                    assert_eq!(resumed.proc, Some(OTHER_HOST));
                    assert_eq!(resumed.pane.as_deref(), Some("%cold-resume"));
                    assert_eq!(resumed.harness_session, old.harness_session);
                    assert_eq!(resumed.semantic_state, Some(SemanticState::Hold));
                    assert!(resumed.native_extension_delivery);
                } else {
                    refused(result);
                    assert_eq!(registry.get(&old.id).await.expect("roster"), Some(old));
                }
            }
        }
    }

    struct PendingDeadOwner {
        entered: Notify,
        release: Notify,
        fail: bool,
    }

    #[async_trait::async_trait]
    impl LivenessPort for PendingDeadOwner {
        async fn proc_start(&self, pid: u32) -> pij_core::error::Result<Option<u64>> {
            if pid == HOST.pid {
                self.entered.notify_one();
                self.release.notified().await;
                return if self.fail {
                    Err(pij_core::error::PijError::Adapter {
                        adapter: "test/previous-native-process".into(),
                        message: "owner observation denied".into(),
                    })
                } else {
                    Ok(None)
                };
            }
            Ok(match pid {
                pid if pid == OTHER_HOST.pid => Some(OTHER_HOST.proc_start),
                pid if pid == SHELL.pid => Some(SHELL.proc_start),
                _ => None,
            })
        }
    }

    #[tokio::test(start_paused = true)]
    async fn cold_resume_revalidates_owner_after_unlocked_death_observation() {
        for change in 0..9 {
            let mut old = native_seat("pij-cold-resume");
            let liveness = Arc::new(PendingDeadOwner {
                entered: Notify::new(),
                release: Notify::new(),
                fail: false,
            });
            let (service, registry) = native_service(vec![old.clone()], liveness.clone());
            let mut claim = native_claim(old.id.as_str());
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            let tmux = native_tmux();
            let pending = attest(&service, claim, Some(SESSION), &tmux);
            tokio::pin!(pending);
            tokio::select! {
                _ = liveness.entered.notified() => {}
                result = &mut pending => panic!("death observer did not block: {result:?}"),
            }
            let mut unrelated = native_claim("pij-unrelated-omp");
            unrelated.harness = "omp".into();
            unrelated.pid = Some(SHELL.pid);
            unrelated.proc_start = Some(SHELL.proc_start);
            unrelated.pane = None;
            tokio::time::timeout(Duration::from_secs(1), service.register(unrelated))
                .await
                .expect("unrelated registration progresses during death observation")
                .expect("unrelated registration");
            {
                let _guard = service.registration_lock.lock().await;
                match change {
                    0 => {}
                    1 => old.proc = Some(OTHER_HOST),
                    2 => old.native_extension_delivery = false,
                    3 => old.pane = None,
                    4 => old.harness_session = Some("changed-native".into()),
                    5 => {
                        old.tombstoned_at = Some(1);
                        old.native_extension_delivery = false;
                    }
                    6 => old.spawn_id = Some("changed-spawn".into()),
                    7 => old.folder.push_str("/metadata-change"),
                    8 => old.semantic_state = Some(SemanticState::Hold),
                    _ => unreachable!(),
                }
                registry
                    .put(old.clone())
                    .await
                    .expect("concurrent lifecycle update");
            }
            liveness.release.notify_one();
            let result = pending.await;
            if matches!(change, 0 | 7 | 8) {
                let resumed = result.expect("unchanged ownership permits rebind");
                assert_eq!(resumed.proc, Some(OTHER_HOST));
                assert_eq!(resumed.semantic_state, old.semantic_state);
            } else {
                refused(result);
                assert_eq!(registry.get(&old.id).await.expect("roster"), Some(old));
            }
        }
    }

    #[tokio::test(start_paused = true)]
    async fn explicit_prebind_revalidates_both_rows_before_retiring_dead_same_native_owner() {
        for change in 0..5 {
            let old = native_seat("pij-old-native");
            let mut prebind =
                SeatDescriptor::new("pij-new-prebind", Harness::Copilot, old.folder.clone());
            prebind.spawn_id = Some("verified-new-spawn".into());
            prebind.pane = Some("%new-prebind".into());
            let liveness = Arc::new(PendingDeadOwner {
                entered: Notify::new(),
                release: Notify::new(),
                fail: false,
            });
            let (service, registry) =
                native_service(vec![old.clone(), prebind.clone()], liveness.clone());
            let mut claim = native_claim(prebind.id.as_str());
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            claim.pane = prebind.pane.clone();
            claim.spawn_id = prebind.spawn_id.clone();
            let tmux = FakeTmux::new().with_pane_process(
                "%new-prebind",
                PaneProcess {
                    pid: SHELL.pid,
                    cwd: old.folder.clone(),
                },
            );
            let pending = attest(&service, claim, Some(SESSION), &tmux);
            tokio::pin!(pending);
            tokio::select! {
                _ = liveness.entered.notified() => {}
                result = &mut pending => panic!("death observer did not block: {result:?}"),
            }
            {
                let _guard = service.registration_lock.lock().await;
                match change {
                    0 => {}
                    1 => prebind.spawn_id = Some("replaced-spawn".into()),
                    2 => prebind.proc = Some(OTHER_HOST),
                    3 => prebind.pane = Some("%replaced-pane".into()),
                    4 => prebind.tombstoned_at = Some(1),
                    _ => unreachable!(),
                }
                registry
                    .put(prebind.clone())
                    .await
                    .expect("prebind changed concurrently");
            }
            liveness.release.notify_one();
            let result = pending.await;
            if change == 0 {
                let bound = result.expect("verified new-address intent takes precedence");
                assert_eq!(bound.id, prebind.id);
                assert_eq!(bound.proc, Some(OTHER_HOST));
                assert_eq!(bound.harness_session, old.harness_session);
                assert!(bound.native_extension_delivery);
                assert!(
                    registry
                        .get(&old.id)
                        .await
                        .unwrap()
                        .unwrap()
                        .tombstoned_at
                        .is_some()
                );
            } else {
                refused(result);
                assert_eq!(registry.get(&old.id).await.expect("old owner"), Some(old));
                assert_eq!(
                    registry.get(&prebind.id).await.expect("prebind"),
                    Some(prebind)
                );
            }
        }
    }

    #[tokio::test]
    async fn cold_resume_never_treats_previous_process_sensor_failure_as_death() {
        let old = native_seat("pij-cold-resume");
        let liveness = Arc::new(PendingDeadOwner {
            entered: Notify::new(),
            release: Notify::new(),
            fail: true,
        });
        liveness.release.notify_one();
        let (service, registry) = native_service(vec![old.clone()], liveness);
        let mut claim = native_claim(old.id.as_str());
        claim.pid = Some(OTHER_HOST.pid);
        claim.proc_start = Some(OTHER_HOST.proc_start);
        let error = attest(&service, claim, Some(SESSION), &native_tmux())
            .await
            .expect_err("unknown liveness never permits takeover");
        assert!(error.to_string().contains("owner observation denied"));
        assert_eq!(registry.get(&old.id).await.expect("roster"), Some(old));
    }

    #[tokio::test]
    async fn ordinary_withdrawal_preserves_session_and_does_not_enable_later_takeover() {
        for bypass in 0..5 {
            let mut old = native_seat("pij-native");
            old.native_extension_delivery = false;
            let (service, registry) = native_service(vec![old], native_liveness());
            let withdrawn = service
                .register(native_claim("pij-native"))
                .await
                .expect("ordinary registration cannot revive withdrawn capability");
            assert_eq!(withdrawn.harness, Harness::Copilot);
            assert_eq!(withdrawn.harness_session.as_deref(), Some(SESSION));
            assert!(!withdrawn.native_extension_delivery);
            let mut claim = native_claim("pij-native");
            let mut session = Some(SESSION.to_string());
            match bypass {
                0 => claim.harness = "omp".to_string(),
                1 => {
                    claim.pid = Some(OTHER_HOST.pid);
                    claim.proc_start = Some(OTHER_HOST.proc_start);
                }
                2 => claim.pane = None,
                3 => session = Some("unattested-new-session".to_string()),
                4 => {
                    claim.id = "pij-legacy-successor".to_string();
                    claim.supersedes = Some(withdrawn.id.clone());
                }
                _ => unreachable!(),
            }
            refused(service.register_with_harness_session(claim, session).await);
            assert_eq!(
                registry.list(SeatFilter::default()).await.expect("roster"),
                vec![withdrawn]
            );
        }
    }

    #[tokio::test]
    async fn ordinary_other_harness_registration_retains_existing_rebind_behavior() {
        for harness in [Harness::Pi, Harness::Omp, Harness::Claude] {
            let mut old =
                SeatDescriptor::new("pij-ordinary", harness, "/isolated/native-registration");
            old.proc = Some(HOST);
            let mut claim = native_claim("pij-ordinary");
            claim.harness = harness.as_str().to_string();
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            let (service, _) = native_service(vec![old], native_liveness());
            let (rebound, _) = service
                .register_with_harness_session(claim, Some("legacy-session".to_string()))
                .await
                .expect("other harness ordinary rebind unchanged");
            assert_eq!(rebound.proc, Some(OTHER_HOST));
            assert_eq!(rebound.harness, harness);
            assert!(!rebound.native_extension_delivery);
        }
    }

    struct MovingStart(AtomicU64);

    #[async_trait::async_trait]
    impl LivenessPort for MovingStart {
        async fn proc_start(&self, _pid: u32) -> pij_core::error::Result<Option<u64>> {
            Ok(Some(self.0.load(Ordering::SeqCst)))
        }
    }

    #[tokio::test]
    async fn native_rechecks_process_start_after_actual_host_observation() {
        let liveness = Arc::new(MovingStart(AtomicU64::new(HOST.proc_start)));
        let (service, registry) = native_service(Vec::new(), liveness.clone());
        let mut claim = native_claim("pij-native");
        claim.pane = None;
        let result = service
            .register_native_with_observer(
                claim,
                Some(SESSION.to_string()),
                &FakeTmux::new(),
                |pid| {
                    liveness.0.store(HOST.proc_start + 1, Ordering::SeqCst);
                    fixture_process(pid)
                },
            )
            .await;
        assert!(
            result
                .expect_err("reused pid")
                .to_string()
                .contains("process start changed")
        );
        assert!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .is_empty()
        );
    }

    #[tokio::test(start_paused = true)]
    async fn native_host_observation_has_a_wall_clock_bound() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let result = service
            .register_native_with_observer(
                native_claim("pij-native"),
                Some(SESSION.to_string()),
                &native_tmux(),
                |_| {
                    std::future::pending::<
                        std::result::Result<Option<NativeProcess>, RegistrationError>,
                    >()
                },
            )
            .await;
        assert!(
            result
                .expect_err("bounded observation")
                .to_string()
                .contains("two seconds")
        );
        assert!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn native_ancestry_observation_is_bounded_to_32_processes() {
        let mut liveness = FakeLiveness::new().with_proc(ProcIdentity {
            pid: 4000,
            proc_start: 1,
        });
        for pid in 4200..=HOST.pid {
            liveness = liveness.with_proc(ProcIdentity {
                pid,
                proc_start: u64::from(pid - 4116),
            });
        }
        let (service, registry) = native_service(Vec::new(), Arc::new(liveness));
        let tmux = FakeTmux::new().with_pane_process(
            "%137",
            PaneProcess {
                pid: 4000,
                cwd: "/isolated/native-registration".to_string(),
            },
        );
        let calls = AtomicU64::new(0);
        let result = service
            .register_native_with_observer(
                native_claim("pij-native"),
                Some(SESSION.to_string()),
                &tmux,
                |pid| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    ready(Ok(Some(NativeProcess {
                        parent: pid - 1,
                        executable: "/opt/copilot/copilot".to_string(),
                        argv: vec!["copilot".to_string()],
                    })))
                },
            )
            .await;
        assert!(
            result
                .expect_err("bounded ancestry")
                .to_string()
                .contains("32 processes")
        );
        assert_eq!(calls.load(Ordering::SeqCst), 32);
        assert!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .is_empty()
        );
    }

    #[tokio::test(start_paused = true)]
    async fn blocked_native_host_observation_does_not_block_unrelated_inbox_ack() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let queue = Arc::new(FakeQueue::new(1_024).expect("queue"));
        let delivery = DeliveryService::new(
            registry.clone(),
            queue.clone(),
            Arc::new(FakeTransport::unreachable()),
            Arc::new(InteractionGate::new(Arc::new(FakeTmux::new()))),
            service.event_bus.clone(),
        )
        .expect("delivery service");
        let service = service.with_native_lock(delivery.native_lock());
        let entered = Notify::new();
        let release = Notify::new();
        let tmux = native_tmux();
        let pending = service.register_native_with_observer(
            native_claim("pij-observing"),
            Some(SESSION.to_string()),
            &tmux,
            |pid| {
                let entered = &entered;
                let release = &release;
                async move {
                    if pid == HOST.pid {
                        entered.notify_one();
                        release.notified().await;
                    }
                    fixture_process(pid).await
                }
            },
        );
        tokio::pin!(pending);
        tokio::select! {
            _ = entered.notified() => {}
            result = &mut pending => panic!("observer did not block: {result:?}"),
        }

        for harness in [Harness::Omp, Harness::Pi] {
            let reader = SeatDescriptor::new(
                format!("pij-reader-{}", harness.as_str()),
                harness,
                "/isolated/reader",
            );
            registry.put(reader.clone()).await.expect("register reader");
            delivery
                .send("pij-peer".into(), reader.id.clone(), "unrelated")
                .await
                .expect("enqueue");
            tokio::time::timeout(Duration::from_secs(1), async {
                let claims = delivery
                    .claim_inbox(&reader.id, false)
                    .await
                    .expect("claim");
                assert_eq!(claims.len(), 1);
                delivery
                    .acknowledge_inbox(&reader.id, claims[0].job_id, &Default::default())
                    .await
                    .expect("ack");
                assert!(
                    queue
                        .claimed_delivery(claims[0].job_id)
                        .await
                        .expect("queue")
                        .is_none()
                );
            })
            .await
            .expect("unrelated reader progresses before native observer is released");
        }
        release.notify_one();
        assert!(
            pending
                .await
                .expect("native observation resumes")
                .0
                .native_extension_delivery
        );
    }

    #[tokio::test]
    async fn native_observation_revalidates_cross_seat_process_takeover_before_commit() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let entered = Notify::new();
        let release = Notify::new();
        let tmux = FakeTmux::new();
        let mut first_claim = native_claim("pij-delayed");
        first_claim.pane = None;
        let pending = service.register_native_with_observer(
            first_claim,
            Some("delayed-session".to_string()),
            &tmux,
            |pid| {
                let entered = &entered;
                let release = &release;
                async move {
                    entered.notify_one();
                    release.notified().await;
                    fixture_process(pid).await
                }
            },
        );
        tokio::pin!(pending);
        tokio::select! {
            _ = entered.notified() => {}
            result = &mut pending => panic!("observer did not block: {result:?}"),
        }
        // Different seat AND session, no pane: only process ownership conflicts.
        let mut winner_claim = native_claim("pij-winner");
        winner_claim.pane = None;
        let winner = tokio::time::timeout(
            Duration::from_secs(1),
            attest(&service, winner_claim, Some("winner-session"), &tmux),
        )
        .await
        .expect("winner is not blocked by observation")
        .expect("winner registers");
        release.notify_one();
        refused(pending.await);
        assert_eq!(
            registry.list(SeatFilter::default()).await.expect("roster"),
            vec![winner]
        );
    }

    #[tokio::test]
    async fn shared_native_lock_prevents_concurrent_process_takeover() {
        let (service, registry) = native_service(Vec::new(), native_liveness());
        let other = service.clone();
        let tmux = native_tmux();
        let (first, second) = tokio::join!(
            attest(&service, native_claim("pij-first"), Some(SESSION), &tmux),
            attest(&other, native_claim("pij-second"), Some(SESSION), &tmux),
        );
        assert_ne!(first.is_ok(), second.is_ok());
        assert_eq!(
            registry
                .list(SeatFilter::default())
                .await
                .expect("roster")
                .len(),
            1
        );
    }

    #[test]
    fn absent_actual_model_is_unknown_while_explicit_no_model_is_a_mismatch() {
        assert!(requested_model_matches(Some("claude-opus-5"), None, false));
        assert!(!requested_model_matches(
            Some("github-copilot/gpt-5.6-sol"),
            None,
            true,
        ));
    }

    #[tokio::test]
    async fn claude_inbound_registration_changes_once_and_publishes_once() {
        let root = pij_testkit::fresh_dir("pij-claude-inbound-registration");
        let home = root.join(".claude");
        fs::create_dir_all(&home).expect("Claude home");
        fs::write(
            home.join("settings.json"),
            r#"{"crossSessionInbound":"hold","keep":true}"#,
        )
        .expect("seed settings");
        let registry = Arc::new(FakeRegistry::new());
        let liveness = Arc::new(
            FakeLiveness::new().with_proc(pij_core::model::ProcIdentity {
                pid: 4242,
                proc_start: 126,
            }),
        );
        let spine = Arc::new(FakeSpine::new());
        let event_bus =
            Arc::new(EventBus::new(Arc::clone(&spine) as Arc<dyn Spine>, 8).expect("event bus"));
        let service = RegistrationService::new(registry, liveness, event_bus, vec![home.clone()]);
        let claim = Registration {
            supersedes: None,
            id: "pij-claude-config".to_string(),
            harness: Harness::Claude.as_str().to_string(),
            folder: root.display().to_string(),
            pane: None,
            pid: Some(4242),
            proc_start: Some(126),
            spawn_id: None,
            model: None,
            actual_model: None,
            actual_model_observed: false,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        };

        service
            .register(claim.clone())
            .await
            .expect("first registration");
        service.register(claim).await.expect("second registration");

        let settings: serde_json::Value = serde_json::from_slice(
            &fs::read(home.join("settings.json")).expect("settings readable"),
        )
        .expect("valid settings");
        assert_eq!(settings["crossSessionInbound"], "accept");
        let events = spine.tail(None, Seq(0)).await.expect("spine tail");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "config.claude-inbound-ensured");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&events[0].payload).expect("event payload")["after"],
            "accept"
        );
        let _ = fs::remove_dir_all(root);
    }
}
