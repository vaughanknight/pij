use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use pij_core::error::PijError;
use pij_core::model::{Event, Harness, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::ports::{LivenessPort, Registry, SeatFilter};
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
        }
    }

    pub(crate) async fn register(
        &self,
        claim: Registration,
    ) -> std::result::Result<SeatDescriptor, RegistrationError> {
        self.register_with_harness_session(claim, None).await
    }

    pub(crate) async fn register_with_harness_session(
        &self,
        claim: Registration,
        harness_session: Option<String>,
    ) -> std::result::Result<SeatDescriptor, RegistrationError> {
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

        let seats = self
            .registry
            .list(SeatFilter::default())
            .await
            .map_err(RegistrationError::Runtime)?;
        let claimed_id = SeatId::from(claim.id.clone());

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
        let mut descriptor = seats
            .iter()
            .find(|seat| seat.id == claimed_id)
            .or_else(|| {
                let spawn_id = claim
                    .spawn_id
                    .as_deref()
                    .filter(|spawn_id| !spawn_id.is_empty())?;
                let pane = claim.pane.as_deref()?;
                seats.iter().find(|seat| {
                    seat.proc.is_none()
                        && seat.spawn_id.as_deref() == Some(spawn_id)
                        && seat.pane.as_deref() == Some(pane)
                })
            })
            .cloned()
            .unwrap_or_else(|| SeatDescriptor::new(claimed_id, harness, claim.folder.clone()));
        let same_bound_incarnation = proc.is_some() && descriptor.proc == proc;
        let binds_spawned_incarnation = descriptor.proc.is_none()
            && descriptor
                .spawn_id
                .as_deref()
                .zip(claim.spawn_id.as_deref())
                .is_some_and(|(launched, claimed)| !launched.is_empty() && launched == claimed);
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
        if descriptor.model.is_none() {
            descriptor.model = claim.model;
        }
        if descriptor.provider.is_none() {
            descriptor.provider = claim.provider;
        }
        if descriptor.effort.is_none() {
            descriptor.effort = claim.effort;
        }
        descriptor.parent = claim.parent;
        descriptor.relay = claim.relay;
        // Keep possession only for the same live process or the matching first
        // bind of a spawned process. A different process with no launch
        // correlator is a new incarnation and cannot inherit the old listener.
        if !same_bound_incarnation && !binds_spawned_incarnation {
            descriptor.rpc_port_intent = None;
        }

        if let Some(mut previous) = predecessor
            && previous.tombstoned_at.is_none()
        {
            previous.tombstoned_at = Some(system_time_ms()?);
            previous.tombstone_reason = Some(format!(
                "superseded by `{}` at a native session boundary (same process)",
                claim.id
            ));
            previous.rpc_port_intent = None;
            self.registry
                .put(previous)
                .await
                .map_err(RegistrationError::Runtime)?;
        }
        self.registry
            .put(descriptor.clone())
            .await
            .map_err(RegistrationError::Runtime)?;
        Ok(descriptor)
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
    use std::sync::Arc;

    use pij_core::model::{Harness, Seq};
    use pij_core::ports::Spine;
    use pij_testkit::fakes::{FakeLiveness, FakeRegistry, FakeSpine};

    use super::RegistrationService;
    use crate::events::EventBus;
    use crate::http::Registration;

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
