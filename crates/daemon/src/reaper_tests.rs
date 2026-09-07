use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::error::{PijError, Result};
use pij_core::model::{Pane, ProcIdentity, SeatDescriptor};
use pij_core::ports::{LivenessPort, Registry};
use pij_testkit::FreshStore;
use pij_testkit::fakes::{FakeLiveness, FakeTmux};
use serde_json::{Value, json};

use super::reap;

fn seat() -> SeatDescriptor {
    let events: Value = serde_json::from_str(include_str!(
        "../../../docs/plans/139-rs-governance-port/assets/contracts/governance-events.json"
    ))
    .expect("canonical events");
    serde_json::from_value(
        events["events"]
            .as_array()
            .expect("events")
            .iter()
            .find(|event| event["id"] == "seat-put")
            .expect("seat-put")["decoded_payload"]
            .clone(),
    )
    .expect("raw canonical seat")
}

async fn services() -> (crate::Services, FreshStore) {
    let store = FreshStore::new();
    let config = Config {
        adapters: Adapters {
            registry: AdapterChoice::Real,
            spine: AdapterChoice::Real,
            queue: AdapterChoice::Real,
            ..Adapters::default()
        },
        store_path: store.path(),
        ..Config::default()
    };
    let services = crate::build_services(
        &config,
        &std::path::Path::new(&store.path()).with_extension("signals"),
    )
    .await
    .expect("real store services");
    (services, store)
}

struct ScriptedProbe(Mutex<VecDeque<Result<Option<u64>>>>);
#[async_trait]
impl LivenessPort for ScriptedProbe {
    async fn proc_start(&self, _pid: u32) -> Result<Option<u64>> {
        self.0
            .lock()
            .expect("probe script")
            .pop_front()
            .expect("one result per observation")
    }
}
fn failed_probe() -> Result<Option<u64>> {
    Err(PijError::Adapter {
        adapter: "process-liveness/ps".to_string(),
        message: "ps terminated by signal; empty stdout".to_string(),
    })
}

#[tokio::test]
async fn reap_dry_run_matches_canonical_candidate_and_run_commits_one_event() {
    let (services, _store) = services().await;
    let expected = seat();
    let before = services.registry.put(expected.clone()).await.expect("seed");
    let tmux = FakeTmux::new();
    let live = FakeLiveness::new();
    let dry = reap(services.registry.as_ref(), &live, &tmux, true)
        .await
        .expect("dry-run");
    let contract: Value = serde_json::from_str(include_str!(
        "../../../docs/plans/139-rs-governance-port/assets/contracts/governance-routes.json"
    ))
    .expect("canonical routes");
    let fixture = &contract["routes"]
        .as_array()
        .expect("routes")
        .iter()
        .find(|route| route["path"] == "/v1/reap")
        .expect("reap")["cases"][0];
    assert_eq!(
        serde_json::to_value(&dry.candidates).expect("candidates"),
        fixture["response"]["data"]["candidates"]
    );
    assert_eq!((dry.before, dry.after), (1, 1));
    assert!(dry.reaped.is_empty());
    assert_eq!(
        services.registry.get(&expected.id).await.unwrap(),
        Some(expected.clone())
    );
    assert!(
        services.spine.tail(None, before).await.unwrap().is_empty(),
        "dry-run writes no events"
    );
    let actual = reap(services.registry.as_ref(), &live, &tmux, false)
        .await
        .expect("reap");
    assert_eq!(actual.candidates, dry.candidates);
    assert_eq!((actual.before, actual.after), (1, 0));
    assert_eq!(actual.reaped.len(), 1);
    let events = services.spine.tail(None, before).await.expect("events");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, "seat.tombstone");
    assert_eq!(events[0].seq, Some(actual.reaped[0].seq));
    assert!(events[0].at > 0);
    assert_eq!(
        serde_json::from_str::<Value>(&events[0].payload).unwrap(),
        json!({"reason":"process-dead-and-pane-absent"})
    );
    assert_eq!(
        services
            .registry
            .get(&expected.id)
            .await
            .unwrap()
            .unwrap()
            .tombstoned_at,
        Some(events[0].at)
    );
    assert!(
        tmux.calls().iter().all(|call| call == "list_panes"),
        "never kill, send, or capture"
    );
}

#[tokio::test]
async fn reap_failed_and_signalled_process_observations_are_unverifiable_without_events() {
    for dry_run in [true, false] {
        let (services, _store) = services().await;
        let expected = seat();
        let before = services.registry.put(expected.clone()).await.unwrap();
        let probe = ScriptedProbe(Mutex::new(VecDeque::from([failed_probe()])));
        let tmux = FakeTmux::new();
        let receipt = reap(services.registry.as_ref(), &probe, &tmux, dry_run)
            .await
            .unwrap();
        assert!(receipt.candidates.is_empty());
        assert!(receipt.reaped.is_empty());
        assert_eq!(receipt.unverifiable[0].reason, "process-probe-failed");
        assert_eq!(receipt.after, 1);
        assert_eq!(
            services.registry.get(&expected.id).await.unwrap(),
            Some(expected)
        );
        assert!(services.spine.tail(None, before).await.unwrap().is_empty());
        assert!(tmux.calls().is_empty());
    }
}

#[tokio::test]
async fn reap_unknown_recorded_pane_vetoes_but_paneless_needs_no_tmux_probe() {
    for paneless in [false, true] {
        let (services, _store) = services().await;
        let mut expected = seat();
        if paneless {
            expected.pane = None;
        }
        let before = services.registry.put(expected.clone()).await.unwrap();
        let tmux = FakeTmux::new().with_list_pane_failures(2);
        let receipt = reap(
            services.registry.as_ref(),
            &FakeLiveness::new(),
            &tmux,
            false,
        )
        .await
        .unwrap();
        if paneless {
            assert_eq!(receipt.reaped.len(), 1);
            assert_eq!(receipt.candidates[0].pane, "paneless");
            assert!(tmux.calls().is_empty());
        } else {
            assert!(receipt.reaped.is_empty());
            assert_eq!(receipt.unverifiable[0].reason, "pane-probe-failed");
            assert_eq!(
                services.registry.get(&expected.id).await.unwrap(),
                Some(expected)
            );
            assert!(services.spine.tail(None, before).await.unwrap().is_empty());
        }
    }
}

#[tokio::test]
async fn reap_recycled_pid_requires_recorded_pane_absence_and_never_signals_replacement() {
    // Plan095 death-reconciler.snapshot.test.ts:70: pij-weak-gurgeh's pid 952
    // was reused by a system daemon. Both start-time directions mean mismatch.
    for (pane_present, later_start) in [(false, false), (false, true), (true, false), (true, true)]
    {
        let (services, _store) = services().await;
        let mut expected = seat();
        expected.id = "pij-weak-gurgeh".into();
        let proc = ProcIdentity {
            pid: 952,
            ..expected.proc.unwrap()
        };
        expected.proc = Some(proc);
        let observed = if later_start {
            proc.proc_start + 1
        } else {
            proc.proc_start - 1
        };
        services.registry.put(expected.clone()).await.unwrap();
        let live = FakeLiveness::new().with_recycled(proc.pid, observed);
        let mut tmux = FakeTmux::new();
        if pane_present {
            tmux = tmux.with_pane(Pane {
                id: expected.pane.clone().unwrap(),
                session: "private".to_string(),
                window: "private".to_string(),
                title: String::new(),
                cursor_x: None,
                cursor_y: None,
            });
        }
        let receipt = reap(services.registry.as_ref(), &live, &tmux, false)
            .await
            .unwrap();
        assert_eq!(receipt.reaped.len(), usize::from(!pane_present));
        assert_eq!(live.proc_start(proc.pid).await.unwrap(), Some(observed));
        assert!(tmux.calls().iter().all(|call| call == "list_panes"));
        if !pane_present {
            assert_eq!(receipt.candidates[0].process, "recycled");
        }
    }
}

struct RevivingProbe {
    registry: Arc<dyn Registry>,
    replacement: SeatDescriptor,
    calls: AtomicUsize,
}
#[async_trait]
impl LivenessPort for RevivingProbe {
    async fn proc_start(&self, _pid: u32) -> Result<Option<u64>> {
        if self.calls.fetch_add(1, Ordering::SeqCst) == 1 {
            self.registry.put(self.replacement.clone()).await?;
        }
        Ok(None)
    }
}

#[tokio::test]
async fn reap_concurrent_revive_between_observation_and_commit_is_preserved() {
    let (services, _store) = services().await;
    let expected = seat();
    let before = services.registry.put(expected.clone()).await.unwrap();
    let mut replacement = expected;
    let proc = replacement.proc.unwrap();
    replacement.proc = Some(ProcIdentity {
        proc_start: proc.proc_start + 1,
        ..proc
    });
    let live = RevivingProbe {
        registry: services.registry.clone(),
        replacement: replacement.clone(),
        calls: AtomicUsize::new(0),
    };
    let receipt = reap(services.registry.as_ref(), &live, &FakeTmux::new(), false)
        .await
        .unwrap();
    assert_eq!(receipt.candidates.len(), 1);
    assert!(receipt.reaped.is_empty());
    assert_eq!(receipt.unverifiable[0].reason, "incarnation-changed");
    assert_eq!(
        services.registry.get(&replacement.id).await.unwrap(),
        Some(replacement)
    );
    let events = services.spine.tail(None, before).await.unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0].kind, "seat.put",
        "revive event survives; no stale tombstone"
    );
}

#[tokio::test]
async fn reap_recheck_unknown_or_matching_live_process_cancels_candidate() {
    for observation in [failed_probe(), Ok(Some(seat().proc.unwrap().proc_start))] {
        let (services, _store) = services().await;
        let expected = seat();
        let before = services.registry.put(expected.clone()).await.unwrap();
        let probe = ScriptedProbe(Mutex::new(VecDeque::from([Ok(None), observation])));
        let receipt = reap(services.registry.as_ref(), &probe, &FakeTmux::new(), false)
            .await
            .unwrap();
        assert_eq!(receipt.candidates.len(), 1);
        assert!(receipt.reaped.is_empty());
        assert_eq!(receipt.unverifiable.len(), 1);
        assert_eq!(
            services.registry.get(&expected.id).await.unwrap(),
            Some(expected)
        );
        assert!(services.spine.tail(None, before).await.unwrap().is_empty());
    }
}

#[tokio::test]
async fn reap_matching_live_process_is_retained_without_any_pane_probe_or_event() {
    let (services, _store) = services().await;
    let expected = seat();
    let before = services.registry.put(expected.clone()).await.unwrap();
    let live = FakeLiveness::new().with_proc(expected.proc.unwrap());
    let tmux = FakeTmux::new().with_list_pane_failures(1);
    let receipt = reap(services.registry.as_ref(), &live, &tmux, false)
        .await
        .unwrap();
    assert!(receipt.candidates.is_empty());
    assert!(receipt.reaped.is_empty());
    assert_eq!(receipt.after, 1);
    assert_eq!(
        services.registry.get(&expected.id).await.unwrap(),
        Some(expected)
    );
    assert!(services.spine.tail(None, before).await.unwrap().is_empty());
    assert!(
        tmux.calls().is_empty(),
        "a known live process already vetoes reconciliation"
    );
}
