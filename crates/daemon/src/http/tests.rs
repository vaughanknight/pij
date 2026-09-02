use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use axum::extract::{Json, State};
use axum::http::HeaderMap;
use axum::routing::post;
use pij_core::config::PeerDefinition;
use pij_core::error::Result;
use pij_core::model::{
    DeliveryOrigin, Destination, Envelope, Event, Harness, Job, JobId, Outcome, Pane, ProcIdentity,
    Receipt, SeatDescriptor,
};
use pij_core::ports::{DeliveryAck, DeliveryEnqueue, Queue, Registry, Spine, TmuxPort};
use pij_core::wire::{self, WireEvent};
use pij_testkit::fakes::{FakeLiveness, FakeQueue, FakeRegistry, FakeSpine, FakeTmux};

use super::*;
use crate::federation::{FederationPolicy, FederationService, WorkerStep};

#[derive(Default)]
struct CountingQueue {
    jobs: Mutex<Vec<Job>>,
}

impl CountingQueue {
    fn jobs(&self) -> Vec<Job> {
        self.jobs.lock().expect("queue mutex").clone()
    }
}

#[async_trait]
impl Queue for CountingQueue {
    async fn note_delivered(
        &self,
        _recipient: &SeatId,
        _msg_id: &str,
        _origin: DeliveryOrigin,
    ) -> Result<Option<DeliveryOrigin>> {
        // The counting request fixture models no ledger. Claiming would be a lie
        // about a path it does not have; refusing keeps the fixture honest, and
        // this route never direct-delivers in these tests.
        Err(pij_core::error::PijError::Adapter {
            adapter: "test/counting-queue".to_string(),
            message: "the counting request fixture does not model delivered ids".to_string(),
        })
    }

    async fn forget_delivered(&self, _recipient: &SeatId, _msg_id: &str) -> Result<()> {
        Ok(())
    }

    async fn enqueue(&self, job: Job) -> Result<JobId> {
        let mut jobs = self.jobs.lock().expect("queue mutex");
        jobs.push(job);
        Ok(JobId(jobs.len() as u64))
    }

    async fn enqueue_delivery(&self, job: Job) -> Result<DeliveryEnqueue> {
        // Delegates to `enqueue` now that EVERY arrival consults the ledger, not
        // only forwarded ones (review F3). This fixture counts request-path
        // enqueues; it models no delivered ids, so it can never answer
        // AlreadyDelivered — and saying so by delegating is honest, where
        // refusing would make the request path 500 on its own success case.
        let id = self.enqueue(job).await?;
        Ok(DeliveryEnqueue::Queued(id))
    }

    async fn claim(&self, _kinds: &[String], _worker: &str) -> Result<Option<(JobId, Job)>> {
        Ok(None)
    }

    async fn peek(&self, _kinds: &[String]) -> Result<Option<(JobId, Job)>> {
        Ok(None)
    }

    async fn ack(&self, _job: JobId, _outcome: Outcome) -> Result<()> {
        Ok(())
    }

    async fn ack_delivery(&self, _job: JobId, _origin: DeliveryOrigin) -> Result<DeliveryAck> {
        Err(pij_core::error::PijError::Adapter {
            adapter: "test/counting-queue".to_string(),
            message: "the request path must not delivery-ack: it never claims".to_string(),
        })
    }

    /// This counter only ever observes the REQUEST path, which enqueues and
    /// returns; nothing here claims, so nothing here can retry. Refusing rather
    /// than silently succeeding keeps that true: if a future route learns to
    /// retry, this test fails loudly instead of counting a no-op as a success.
    async fn retry(&self, _job: JobId, _delay: std::time::Duration) -> Result<()> {
        Err(pij_core::error::PijError::Adapter {
            adapter: "test/counting-queue".to_string(),
            message: "the request path must not retry: it never claims".to_string(),
        })
    }
}

pub(super) async fn test_services(
    registry: Arc<FakeRegistry>,
    queue: Arc<dyn Queue>,
    spine: Arc<FakeSpine>,
) -> Services {
    let mut services = crate::build_services(
        &pij_core::config::Config::default(),
        std::path::Path::new("/tmp/pij-test-pane-signals"),
    )
    .await
    .expect("fake services");
    services.registry = registry;
    services.queue = queue;
    services.spine = spine.clone();
    services.event_bus = Arc::new(crate::events::EventBus::new(spine, 16).expect("event bus"));
    // REBUILD the delivery service from the swapped parts. It was constructed by
    // `build_services` from the ORIGINAL fakes, so overwriting the fields above
    // left it holding a registry, queue and bus that no assertion could see — a
    // fixture that looks injected and is not.
    services.delivery = Arc::new(
        crate::delivery::DeliveryService::new(
            Arc::clone(&services.registry),
            Arc::clone(&services.queue),
            Arc::clone(&services.transport),
            Arc::clone(&services.interaction),
            Arc::clone(&services.event_bus),
        )
        .expect("delivery service"),
    );
    services
}

pub(super) async fn spawn(router: Router) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("address");
    let joined = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });
    (addr, joined)
}

pub(super) fn config(local_key: &str, peer_keys: &[&str]) -> HttpConfig {
    HttpConfig {
        local_key: local_key.to_string(),
        peer_keys: peer_keys.iter().map(ToString::to_string).collect(),
        machine_alias: "workstation".to_string(),
    }
}

fn federation_policy() -> FederationPolicy {
    FederationPolicy {
        poll_interval: Duration::from_millis(10),
        max_retry_delay: Duration::from_millis(100),
        event_buffer_capacity: 16,
    }
}

fn expect_event(frame: StreamFrame) -> (String, u64, Event) {
    match frame {
        StreamFrame::Event {
            machine,
            cursor,
            event,
        } => (machine, cursor, event),
        StreamFrame::PeerState { .. } => panic!("expected event frame"),
    }
}

#[test]
fn exposure_banner_names_the_address_it_classifies() {
    let loopback = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 7461);
    assert_eq!(exposure(&loopback), Exposure::Loopback);
    assert_eq!(
        boot_banner(&loopback),
        "pij daemon listening on 127.0.0.1:7461 (loopback; local bearer key required)"
    );

    let lan = SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 7461);
    assert_eq!(exposure(&lan), Exposure::Lan);
    assert_eq!(
        boot_banner(&lan),
        "WARNING: pij daemon listening on 0.0.0.0:7461 beyond loopback; bearer keys are the only LAN access control"
    );
}

#[test]
fn send_request_uses_resolved_destination_object_and_optional_reply_id() {
    let request = SendRequest {
        from: "pij-a".into(),
        from_machine: Some("desktop".to_string()),
        to: Destination::local("pij-b"),
        body: "answer".to_string(),
        msg_id: "m-2".to_string(),
        in_reply_to: Some("m-1".to_string()),
    };
    let json = serde_json::to_value(&request).expect("send request json");
    assert_eq!(json["to"]["seat"], "pij-b");
    assert!(
        json["to"].is_object(),
        "the daemon never parses human address strings"
    );
    assert_eq!(json["in_reply_to"], "m-1");
    assert_eq!(json["from_machine"], "desktop");

    let without_reply: SendRequest = serde_json::from_value(serde_json::json!({
        "from": "pij-a",
        "to": { "seat": "pij-b" },
        "body": "hello",
        "msg_id": "m-3"
    }))
    .expect("in_reply_to is optional");
    assert_eq!(without_reply.to, Destination::local("pij-b"));
    assert_eq!(without_reply.in_reply_to, None);
}

#[tokio::test]
async fn auth_ring_covers_every_declared_route_and_accepts_peer_keys() {
    let services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(
        services,
        config("local-secret", &["peer-secret"]),
    ))
    .await;
    let client = reqwest::Client::new();

    for endpoint in Endpoint::ALL {
        let response = client
            .request(
                endpoint.method(),
                format!("http://{addr}{}", endpoint.path()),
            )
            .send()
            .await
            .expect("unauthenticated request");
        assert_eq!(
            response.status(),
            reqwest::StatusCode::UNAUTHORIZED,
            "{} must inherit whole-router auth",
            endpoint.path()
        );
        let body = response.text().await.expect("auth body");
        assert!(
            body.contains("manually bootstrapped configured key"),
            "refusal names the repair: {body}"
        );
    }

    let health = client
        .get(format!("http://{addr}/health"))
        .bearer_auth("peer-secret")
        .send()
        .await
        .expect("peer-authenticated health");
    assert_eq!(health.status(), reqwest::StatusCode::OK);
    let body: Envelope<serde_json::Value> = health.json().await.expect("health envelope");
    assert_eq!(body.data.expect("data")["machine"], "workstation");

    server.abort();
}

#[tokio::test]
async fn registration_corroborates_process_and_refuses_shared_process_aliases() {
    let identity = ProcIdentity {
        pid: 42,
        proc_start: 20260829103052,
    };
    let registry = Arc::new(FakeRegistry::new());
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(identity));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();
    let registration = Registration {
        supersedes: None,
        id: "pij-parent".to_string(),
        harness: "omp".to_string(),
        folder: "/abs/tree".to_string(),
        pane: Some("%42".to_string()),
        pid: Some(identity.pid),
        proc_start: Some(identity.proc_start),
        spawn_id: Some("spawn-1".to_string()),
        model: Some("provider/model".to_string()),
        provider: Some("provider".to_string()),
        effort: Some("high".to_string()),
        parent: None,
        relay: false,
    };

    let mut registration_with_session =
        serde_json::to_value(&registration).expect("registration json");
    registration_with_session["harnessSession"] = serde_json::json!("omp-native-42");
    let response = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&registration_with_session)
        .send()
        .await
        .expect("register");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(accepted.proc, Some(identity));
    assert_eq!(accepted.harness_session.as_deref(), Some("omp-native-42"));
    assert_eq!(registry.calls(), ["list", "put:pij-parent"]);

    let self_declaration = Registration {
        spawn_id: Some("self-declared-spawn".to_string()),
        model: Some("self-declared/model".to_string()),
        provider: Some("self-declared".to_string()),
        effort: Some("low".to_string()),
        ..registration.clone()
    };
    let response = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&self_declaration)
        .send()
        .await
        .expect("repeat registration");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(accepted.spawn_id.as_deref(), Some("spawn-1"));
    assert_eq!(accepted.model.as_deref(), Some("provider/model"));
    assert_eq!(accepted.provider.as_deref(), Some("provider"));
    assert_eq!(accepted.effort.as_deref(), Some("high"));
    assert_eq!(accepted.harness_session.as_deref(), Some("omp-native-42"));
    assert_eq!(
        registry.calls(),
        ["list", "put:pij-parent", "list", "put:pij-parent"]
    );

    let alias = Registration {
        id: "pij-child-alias".to_string(),
        ..registration
    };
    let response = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&alias)
        .send()
        .await
        .expect("alias registration");
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    let refusal = response.text().await.expect("refusal");
    assert!(
        refusal.contains("subagent of pij-parent"),
        "collision names the existing seat: {refusal}"
    );
    assert_eq!(
        registry.calls(),
        ["list", "put:pij-parent", "list", "put:pij-parent", "list",],
        "a refused alias is never persisted"
    );

    server.abort();
}
#[tokio::test]
async fn spawned_registration_adopts_prebind_row_and_preserves_port() {
    let registry = Arc::new(FakeRegistry::new());
    let tmux = Arc::new(FakeTmux::new().with_pane(Pane {
        id: "%caller".to_string(),
        session: "fleet".to_string(),
        window: "orchestrator".to_string(),
        title: String::new(),
        cursor_x: None,
        cursor_y: None,
    }));
    let identity = ProcIdentity {
        pid: 42,
        proc_start: 20260831090000,
    };
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.tmux = tmux.clone();
    services.liveness = Arc::new(FakeLiveness::new().with_proc(identity));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();

    let spawned = client
        .post(format!("http://{addr}/v1/spawn"))
        .bearer_auth("key")
        .json(&SpawnRequest {
            id: None,
            harness: Harness::Copilot,
            executable: Some("copilot".to_string()),
            model: Some("provider/model".to_string()),
            effort: Some("high".to_string()),
            cwd: "/abs/tree".to_string(),
            session: Some("fleet".to_string()),
            caller_pane: None,
            name: None,
            parent: None,
            accept_inbound: false,
        })
        .send()
        .await
        .expect("spawn request");
    assert_eq!(spawned.status(), reqwest::StatusCode::OK);

    // Build the registration from what the launched process and tmux observe,
    // never from the spawn response. Using that response's assigned id here hid
    // the real mismatch: the registering runtime can claim a different id.
    let launch = tmux
        .calls()
        .into_iter()
        .find(|call| call.starts_with("new_window:"))
        .expect("observed launch");
    let launched_seat_id = launch
        .split('"')
        .find_map(|arg| arg.strip_prefix("PIJ_SESSION_ID="))
        .expect("launched seat id")
        .to_string();
    let launched_spawn_id = launch
        .split('"')
        .find_map(|arg| arg.strip_prefix("PIJ_SPAWN_ID="))
        .expect("launched spawn id")
        .to_string();
    let launched_pane = tmux
        .list_panes()
        .await
        .expect("launched panes")
        .into_iter()
        .find(|pane| pane.id != "%caller")
        .expect("spawned pane");
    let prebind = registry
        .list(SeatFilter::default())
        .await
        .expect("pre-bind roster")
        .into_iter()
        .find(|seat| seat.id.as_str() == launched_seat_id)
        .expect("pre-bind row");
    let allocated_port = prebind
        .rpc_port_intent
        .expect("Copilot launch allocates a port intent");
    assert_eq!(
        prebind.spawn_id.as_deref(),
        Some(launched_spawn_id.as_str())
    );
    assert_eq!(prebind.pane.as_deref(), Some(launched_pane.id.as_str()));

    let registered = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&Registration {
            supersedes: None,
            id: "pij-runtime-name".to_string(),
            harness: "copilot".to_string(),
            folder: "/abs/tree".to_string(),
            pane: Some(launched_pane.id.clone()),
            pid: Some(identity.pid),
            proc_start: Some(identity.proc_start),
            spawn_id: Some(launched_spawn_id.clone()),
            model: None,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        })
        .send()
        .await
        .expect("registration");
    assert_eq!(registered.status(), reqwest::StatusCode::OK);

    let seats = registry
        .list(SeatFilter::default())
        .await
        .expect("bound roster");
    let bound = seats.iter().find(|seat| seat.proc == Some(identity));
    assert_eq!(
        (
            seats.len(),
            bound.map(|seat| seat.id.as_str()),
            bound.and_then(|seat| seat.rpc_port_intent),
        ),
        (1, Some(launched_seat_id.as_str()), Some(allocated_port)),
        "the launched identity is adopted as one row with its allocated port"
    );
    let bound = bound.expect("bound launched row");
    assert_eq!(bound.spawn_id.as_deref(), Some(launched_spawn_id.as_str()));
    assert_eq!(bound.pane.as_deref(), Some(launched_pane.id.as_str()));

    server.abort();
}

#[tokio::test]
async fn reregistration_prefers_exact_id_over_spawn_match_without_fresh_allocation() {
    let identity = ProcIdentity {
        pid: 43,
        proc_start: 20260831090001,
    };
    let mut unrelated = SeatDescriptor::new("pij-a-prebind", Harness::Copilot, "/abs/tree");
    unrelated.pane = Some("%44".to_string());
    unrelated.spawn_id = Some("spawn-shared".to_string());
    unrelated.rpc_port_intent = Some(47_781);
    let mut existing = SeatDescriptor::new("pij-z-existing", Harness::Copilot, "/abs/tree");
    existing.pane = Some("%44".to_string());
    existing.proc = Some(identity);
    existing.spawn_id = Some("spawn-shared".to_string());
    let registry = Arc::new(FakeRegistry::new().with_seat(unrelated).with_seat(existing));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(identity));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&Registration {
            supersedes: None,
            id: "pij-z-existing".to_string(),
            harness: "copilot".to_string(),
            folder: "/abs/tree".to_string(),
            pane: Some("%44".to_string()),
            pid: Some(identity.pid),
            proc_start: Some(identity.proc_start),
            spawn_id: Some("spawn-shared".to_string()),
            model: None,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        })
        .send()
        .await
        .expect("repeat registration");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(accepted.id.as_str(), "pij-z-existing");
    assert_eq!(
        accepted.rpc_port_intent, None,
        "an ordinary re-registration has no fresh port allocation to inherit"
    );

    let seats = registry
        .list(SeatFilter::default())
        .await
        .expect("roster after repeat registration");
    let unrelated = seats
        .iter()
        .find(|seat| seat.id.as_str() == "pij-a-prebind")
        .expect("unrelated pre-bind row");
    assert_eq!(unrelated.proc, None, "repeat registration cannot adopt it");
    assert_eq!(unrelated.rpc_port_intent, Some(47_781));

    server.abort();
}

/// THE PORT-INHERITANCE ARM. Found missing by the reviewer: mutating
/// `binds_spawned_incarnation` to always-true left the ENTIRE daemon http suite
/// green, because the only re-registration arm used a row whose
/// `rpc_port_intent` was already `None` — the refusal was exercised vacuously.
///
/// This is the case where the gate actually decides: an exact-id match onto a row
/// that CARRIES a port stamped for incarnation S1, claimed by a registration whose
/// spawn_id is S2. The port was reserved for a different incarnation and must not
/// travel to this one — the allocator treats live rows' intents as the reserved
/// set, so inheriting one hands out a port another process may be listening on.
#[tokio::test]
async fn registration_does_not_inherit_a_port_stamped_for_another_incarnation() {
    let identity = ProcIdentity {
        pid: 47,
        proc_start: 20260831090005,
    };
    let mut stamped = SeatDescriptor::new("pij-ported", Harness::Copilot, "/abs/tree");
    stamped.pane = Some("%47".to_string());
    stamped.spawn_id = Some("spawn-old".to_string());
    // A port reserved for the OLD incarnation.
    stamped.rpc_port_intent = Some(47_790);
    let registry = Arc::new(FakeRegistry::new().with_seat(stamped));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(identity));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&Registration {
            supersedes: None,
            // Exact id match, so the spawn_id fallback never runs.
            id: "pij-ported".to_string(),
            harness: "copilot".to_string(),
            folder: "/abs/tree".to_string(),
            pane: Some("%47".to_string()),
            pid: Some(identity.pid),
            proc_start: Some(identity.proc_start),
            // A DIFFERENT incarnation than the one the port was stamped for.
            spawn_id: Some("spawn-new".to_string()),
            model: None,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        })
        .send()
        .await
        .expect("registration with a mismatched spawn id");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(
        accepted.rpc_port_intent, None,
        "a port reserved for incarnation spawn-old must not travel to spawn-new"
    );

    server.abort();
}

/// THE FOURTH ARM. spawn_id + pane alone is not enough: the matched row must also
/// be UNBOUND. Without `proc.is_none()` a registration could adopt a row whose
/// process is ALREADY ALIVE — one live seat quietly taking over another's identity
/// on a reused pane, which is worse than the two-row defect this unit fixes
/// because it looks correct from both ends separately.
///
/// Mutate the `seat.proc.is_none()` clause out of the fallback in `http/mod.rs`
/// and this test must fail.
#[tokio::test]
async fn registration_cannot_adopt_a_spawn_match_that_is_already_bound() {
    let squatter = ProcIdentity {
        pid: 45,
        proc_start: 20260831090003,
    };
    let incumbent = ProcIdentity {
        pid: 46,
        proc_start: 20260831090004,
    };
    let mut live = SeatDescriptor::new("pij-already-bound", Harness::Copilot, "/abs/tree");
    live.pane = Some("%46".to_string());
    live.spawn_id = Some("spawn-bound".to_string());
    live.rpc_port_intent = Some(47_782);
    // The row is BOUND: its process is alive and it is nobody's pre-bind row.
    live.proc = Some(incumbent);
    let registry = Arc::new(FakeRegistry::new().with_seat(live));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(squatter));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&Registration {
            supersedes: None,
            id: "pij-runtime-squatter".to_string(),
            harness: "copilot".to_string(),
            folder: "/abs/tree".to_string(),
            pane: Some("%46".to_string()),
            pid: Some(squatter.pid),
            proc_start: Some(squatter.proc_start),
            spawn_id: Some("spawn-bound".to_string()),
            model: None,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        })
        .send()
        .await
        .expect("registration against a bound row");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(
        accepted.id.as_str(),
        "pij-runtime-squatter",
        "a bound row must never be adopted — the registration gets its own row"
    );
    assert_eq!(
        accepted.rpc_port_intent, None,
        "and it must not inherit a port stamped for somebody else's incarnation"
    );

    let seats = registry.list(SeatFilter::default()).await.expect("roster");
    let incumbent_row = seats
        .iter()
        .find(|seat| seat.id.as_str() == "pij-already-bound")
        .expect("the incumbent row must survive untouched");
    assert_eq!(
        incumbent_row.proc,
        Some(incumbent),
        "the live seat must still own its own process"
    );
    assert_eq!(incumbent_row.rpc_port_intent, Some(47_782));

    server.abort();
}

#[tokio::test]
async fn registration_cannot_adopt_a_spawn_match_from_another_pane() {
    let identity = ProcIdentity {
        pid: 44,
        proc_start: 20260831090002,
    };
    let mut unrelated =
        SeatDescriptor::new("pij-prebind-other-pane", Harness::Copilot, "/abs/tree");
    unrelated.pane = Some("%44".to_string());
    unrelated.spawn_id = Some("spawn-shared".to_string());
    unrelated.rpc_port_intent = Some(47_781);
    let registry = Arc::new(FakeRegistry::new().with_seat(unrelated));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(identity));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&Registration {
            supersedes: None,
            id: "pij-runtime-other-pane".to_string(),
            harness: "copilot".to_string(),
            folder: "/abs/tree".to_string(),
            pane: Some("%45".to_string()),
            pid: Some(identity.pid),
            proc_start: Some(identity.proc_start),
            spawn_id: Some("spawn-shared".to_string()),
            model: None,
            provider: None,
            effort: None,
            parent: None,
            relay: false,
        })
        .send()
        .await
        .expect("registration from another pane");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    let accepted = accepted.data.expect("descriptor");
    assert_eq!(accepted.id.as_str(), "pij-runtime-other-pane");
    assert_eq!(
        accepted.rpc_port_intent, None,
        "a matching spawn id on another pane owns no port for this registration"
    );

    let unrelated = registry
        .list(SeatFilter::default())
        .await
        .expect("roster after unrelated registration")
        .into_iter()
        .find(|seat| seat.id.as_str() == "pij-prebind-other-pane")
        .expect("unrelated pre-bind row remains");
    assert_eq!(unrelated.proc, None);
    assert_eq!(unrelated.rpc_port_intent, Some(47_781));

    server.abort();
}

#[tokio::test]
async fn re_registration_preserves_live_resource_and_consent_stamps() {
    let copilot_proc = ProcIdentity {
        pid: 43,
        proc_start: 20260831103043,
    };
    let claude_proc = ProcIdentity {
        pid: 44,
        proc_start: 20260831103044,
    };
    let registry = Arc::new(FakeRegistry::new());
    let mut copilot = SeatDescriptor::new("pij-copilot", Harness::Copilot, "/abs/tree");
    copilot.pane = Some("%43".to_string());
    copilot.proc = Some(copilot_proc);
    copilot.spawn_id = Some("spawn-copilot".to_string());
    copilot.rpc_port_intent = Some(47_781);
    registry.put(copilot).await.unwrap();
    let mut claude = SeatDescriptor::new("pij-claude", Harness::Claude, "/abs/tree");
    claude.pane = Some("%44".to_string());
    claude.proc = Some(claude_proc);
    claude.spawn_id = Some("spawn-claude".to_string());
    claude.cross_session_inbound_accept = Some(true);
    registry.put(claude).await.unwrap();

    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(
        FakeLiveness::new()
            .with_proc(copilot_proc)
            .with_proc(claude_proc),
    );
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();

    for (id, harness, pane, identity, spawn_id) in [
        (
            "pij-copilot",
            "copilot",
            "%43",
            copilot_proc,
            "spawn-copilot",
        ),
        ("pij-claude", "claude", "%44", claude_proc, "spawn-claude"),
    ] {
        let response = client
            .post(format!("http://{addr}/v1/register"))
            .bearer_auth("key")
            .json(&Registration {
                supersedes: None,
                id: id.to_string(),
                harness: harness.to_string(),
                folder: "/abs/tree".to_string(),
                pane: Some(pane.to_string()),
                pid: Some(identity.pid),
                proc_start: Some(identity.proc_start),
                spawn_id: Some(spawn_id.to_string()),
                model: None,
                provider: None,
                effort: None,
                parent: None,
                relay: false,
            })
            .send()
            .await
            .expect("repeat registration");
        assert_eq!(response.status(), reqwest::StatusCode::OK);
    }

    assert_eq!(
        registry
            .get(&"pij-copilot".into())
            .await
            .unwrap()
            .unwrap()
            .rpc_port_intent,
        Some(47_781)
    );
    assert_eq!(
        registry
            .get(&"pij-claude".into())
            .await
            .unwrap()
            .unwrap()
            .cross_session_inbound_accept,
        Some(true)
    );

    server.abort();
}

#[tokio::test]
async fn registration_refuses_uncorroborated_or_half_process_identity() {
    let registry = Arc::new(FakeRegistry::new());
    let services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();
    let base = Registration {
        supersedes: None,
        id: "pij-claim".to_string(),
        harness: "omp".to_string(),
        folder: "/abs/tree".to_string(),
        pane: None,
        pid: Some(7),
        proc_start: Some(11),
        spawn_id: None,
        model: None,
        provider: None,
        effort: None,
        parent: None,
        relay: false,
    };
    for (label, claim, expected) in [
        ("uncorroborated", base.clone(), "daemon observed process 7"),
        (
            "half identity",
            Registration {
                proc_start: None,
                ..base
            },
            "pid and proc_start must travel together",
        ),
    ] {
        let response = client
            .post(format!("http://{addr}/v1/register"))
            .bearer_auth("key")
            .json(&claim)
            .send()
            .await
            .expect("registration refusal");
        assert_eq!(
            response.status(),
            reqwest::StatusCode::BAD_REQUEST,
            "{label}"
        );
        assert!(
            response.text().await.expect("body").contains(expected),
            "{label}"
        );
    }
    assert!(
        registry.calls().is_empty(),
        "invalid evidence reaches no registry statement"
    );

    server.abort();
}

#[tokio::test]
async fn spawn_stamps_only_the_argv_that_reached_the_observed_launch() {
    let registry = Arc::new(FakeRegistry::new());
    let tmux = Arc::new(FakeTmux::new().with_pane(Pane {
        id: "%caller".to_string(),
        session: "fleet".to_string(),
        window: "orchestrator".to_string(),
        title: String::new(),
        cursor_x: None,
        cursor_y: None,
    }));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.tmux = tmux.clone();
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();

    let request =
        |id: &str, accept_inbound: bool, session: Option<&str>, pane: Option<&str>| SpawnRequest {
            id: Some(id.into()),
            harness: Harness::Claude,
            executable: Some("/path with spaces/claude".to_string()),
            model: Some("provider/model".to_string()),
            effort: Some("high".to_string()),
            cwd: "/abs/tree".to_string(),
            session: session.map(str::to_string),
            caller_pane: pane.map(str::to_string),
            name: None,
            parent: Some("pij-parent".into()),
            accept_inbound,
        };

    for (id, accept, session, pane) in [
        ("pij-closed", false, None, Some("%caller")),
        ("pij-open", true, Some("fleet"), None),
    ] {
        let response = client
            .post(format!("http://{addr}/v1/spawn"))
            .bearer_auth("key")
            .json(&request(id, accept, session, pane))
            .send()
            .await
            .expect("spawn request");
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let envelope: Envelope<SeatDescriptor> = response.json().await.expect("spawn envelope");
        let descriptor = envelope.data.expect("descriptor");
        assert_eq!(descriptor.id.as_str(), id);
        assert_eq!(descriptor.proc, None, "spawn writes a pre-bind row");
        assert_eq!(descriptor.cross_session_inbound_accept, Some(accept));
        let spawn_id = descriptor.spawn_id.expect("launcher stamps spawn id");
        assert_eq!(spawn_id.len(), 34);
        assert!(spawn_id.strip_prefix("s-").is_some_and(|hex| {
            hex.chars()
                .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase())
        }));
        assert_eq!(descriptor.model.as_deref(), Some("provider/model"));
        assert_eq!(descriptor.provider, None, "provider was not resolved");
        assert_eq!(descriptor.effort.as_deref(), Some("high"));
    }

    let calls = tmux.calls();
    assert_eq!(calls[0], "list_panes");
    assert!(calls[1].contains("new_window:fleet:pij-closed:env"));
    assert!(calls[1].contains("PIJ_SESSION_ID=pij-closed"));
    assert!(calls[1].contains("/path with spaces/claude"));
    assert!(!calls[1].contains("crossSessionInbound"));
    assert!(calls[2].contains("new_window:fleet:pij-open:env"));
    assert!(calls[2].contains("PIJ_SESSION_ID=pij-open"));
    assert!(calls[2].contains("/path with spaces/claude"));
    assert!(calls[2].contains(r#"{\"crossSessionInbound\":\"accept\"}"#));

    let collision = client
        .post(format!("http://{addr}/v1/spawn"))
        .bearer_auth("key")
        .json(&request("pij-open", true, Some("fleet"), None))
        .send()
        .await
        .expect("collision request");
    assert_eq!(collision.status(), reqwest::StatusCode::BAD_REQUEST);
    let collision_body = collision.text().await.expect("collision body");
    assert!(collision_body.contains("already exists and is not tombstoned"));
    assert!(collision_body.contains("choose another --id or tombstone it before respawning"));
    assert!(!collision_body.contains("reviv"));
    assert_eq!(tmux.calls().len(), 3, "collision launches no extra process");

    let unresolved = client
        .post(format!("http://{addr}/v1/spawn"))
        .bearer_auth("key")
        .json(&request("pij-unresolved", false, None, Some("%missing")))
        .send()
        .await
        .expect("unresolved request");
    assert_eq!(unresolved.status(), reqwest::StatusCode::BAD_REQUEST);
    assert!(
        unresolved
            .text()
            .await
            .expect("unresolved body")
            .contains("pass --session")
    );
    assert_eq!(tmux.calls().last().expect("last call"), "list_panes");

    server.abort();
}

/// Plan 116's "Claude seats accept inbound by default" is a CLI default
/// (`prepare_spawn_request`), not a daemon one. `accept_inbound` on the wire
/// is a plain `bool`, which cannot distinguish "the caller said no" from "the
/// caller never considered it" — so this handler applies no default of its
/// own and never could without a tri-state field (a follow-up, not built
/// here). A direct `/v1/spawn` caller — another client, or a routing shim
/// that does not go through the CLI — gets pre-116 behaviour: no consent
/// unless the request says so. This test pins that boundary so it stays a
/// named, scoped fact instead of a silently-assumed one.
#[tokio::test]
async fn direct_http_spawn_carries_no_claude_default_the_cli_owns_it() {
    let registry = Arc::new(FakeRegistry::new());
    let tmux = Arc::new(FakeTmux::new().with_pane(Pane {
        id: "%caller".to_string(),
        session: "fleet".to_string(),
        window: "orchestrator".to_string(),
        title: String::new(),
        cursor_x: None,
        cursor_y: None,
    }));
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.tmux = tmux.clone();
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("http://{addr}/v1/spawn"))
        .bearer_auth("key")
        .json(&SpawnRequest {
            id: Some("pij-plan116-direct".into()),
            harness: Harness::Claude,
            executable: Some("claude".to_string()),
            model: None,
            effort: None,
            cwd: "/abs/tree".to_string(),
            session: Some("fleet".to_string()),
            caller_pane: None,
            name: None,
            parent: None,
            accept_inbound: false,
        })
        .send()
        .await
        .expect("spawn request");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let envelope: Envelope<SeatDescriptor> = response.json().await.expect("spawn envelope");
    let descriptor = envelope.data.expect("descriptor");
    assert_eq!(
        descriptor.cross_session_inbound_accept,
        Some(false),
        "a direct /v1/spawn caller sending accept_inbound:false gets no consent — \
         the plan 116 default lives only in the CLI, and the daemon must never \
         invent one behind a bool it cannot tell 'unset' from"
    );

    server.abort();
}

#[tokio::test]
async fn send_enqueues_exactly_once_and_refuses_remote_without_federation() {
    let queue = Arc::new(CountingQueue::default());
    // The recipient must EXIST now. The route used to enqueue without consulting
    // the registry at all, so this test passed against a roster that had never
    // heard of `pij-b` — which is precisely the gap that let a private payload
    // shape survive: nothing on this path ever asked the delivery service
    // anything. An unregistered recipient is a 404 here, and that is the route
    // working.
    let registry = Arc::new(FakeRegistry::new());
    // Registered but UNBOUND (no process identity), so routing queues it. This
    // test's subject is the enqueue — one row, the caller's dedupe key, and a
    // payload the inbox can decode — so the recipient is arranged to reach that
    // path honestly rather than by a transport that refuses.
    let recipient = SeatDescriptor::new("pij-b", Harness::Omp, "/abs/tree");
    registry.put(recipient).await.expect("register recipient");
    let services = test_services(registry, queue.clone(), Arc::new(FakeSpine::new())).await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();
    let request = SendRequest {
        from: "pij-a".into(),
        from_machine: None,
        to: Destination::local("pij-b"),
        body: "hello".to_string(),
        msg_id: "m-1".to_string(),
        in_reply_to: Some("m-0".to_string()),
    };

    let response = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("key")
        .json(&request)
        .send()
        .await
        .expect("send");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let receipt: Envelope<Receipt> = response.json().await.expect("receipt envelope");
    assert_eq!(
        receipt.data.expect("receipt").outcome,
        pij_core::model::DeliveryOutcome::Queued
    );

    let jobs = queue.jobs();
    assert_eq!(jobs.len(), 1, "the request path performs one enqueue");
    assert_eq!(
        jobs[0].kind,
        pij_core::delivery::delivery_kind(&"pij-b".into())
    );
    assert_eq!(jobs[0].dedupe_key, "m-1");
    // Decoded as `Msg` — the SAME type `DeliveryService::inbox` decodes this
    // queue as. The old assertion decoded the route's own private shape, so both
    // halves of the round trip passed while the round trip itself could never
    // work. Assert the consumer's type, never the producer's.
    let queued: Msg = serde_json::from_str(&jobs[0].payload).expect("queued body");
    assert_eq!(queued.msg_id, request.msg_id);
    assert_eq!(queued.from, request.from);
    assert_eq!(queued.from_machine, None);
    assert_eq!(queued.to, request.to.seat);
    assert_eq!(queued.body, request.body);
    // A NON-None value, because every other construction in the workspace passes
    // None: a regression that dropped the field at the Msg boundary — the exact
    // defect F3 fixed — would otherwise pass the whole suite.
    assert_eq!(
        queued.in_reply_to.as_deref(),
        Some("m-0"),
        "the answered msg_id must survive into the durable payload"
    );

    let remote = SendRequest {
        to: Destination {
            seat: "pij-b".into(),
            machine: Some("laptop".to_string()),
        },
        msg_id: "m-2".to_string(),
        ..request
    };
    let response = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("key")
        .json(&remote)
        .send()
        .await
        .expect("remote send");
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    assert!(
        response
            .text()
            .await
            .expect("body")
            .contains("require configured federation peers")
    );
    assert_eq!(
        queue.jobs().len(),
        1,
        "a refused remote send enqueues nothing"
    );

    server.abort();
}

#[tokio::test]
async fn inbox_claims_without_evidence_then_ack_records_machine_graded_reader_read() {
    let registry = Arc::new(FakeRegistry::new());
    registry
        .put(SeatDescriptor::new("pij-reader", Harness::Omp, "/abs/tree"))
        .await
        .expect("register pull recipient");
    let queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
    let spine = Arc::new(FakeSpine::new());
    let services = test_services(registry, queue.clone(), spine.clone()).await;
    services
        .delivery
        .accept(Msg {
            from: "pij-sender".into(),
            from_machine: None,
            to: "pij-reader".into(),
            body: "one durable body".to_string(),
            msg_id: "m-inbox-1".to_string(),
            in_reply_to: None,
            command: None,
        })
        .await
        .expect("queue message");
    let (addr, server) = spawn(router_with_config(
        services,
        config("local-key", &["peer-key"]),
    ))
    .await;
    let client = reqwest::Client::new();

    let response = client
        .get(format!("http://{addr}/v1/inbox"))
        .bearer_auth("local-key")
        .query(&[("seat", "pij-reader"), ("wait", "false")])
        .send()
        .await
        .expect("claim inbox");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let page: Envelope<Vec<crate::delivery::InboxClaim>> =
        response.json().await.expect("inbox page envelope");
    let claims = page.data.expect("claimed page");
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].message.body, "one durable body");
    assert!(queue.acked().is_empty(), "GET records no ReaderRead");
    assert!(
        spine
            .tail(Some(&SeatId::from("pij-reader")), Seq(0))
            .await
            .expect("audit before ack")
            .iter()
            .all(|event| event.kind != INBOX_ACK_EVENT_KIND),
        "GET emits no read attestation"
    );

    let acknowledgement = InboxAckRequest {
        // Deliberately forged: bearer auth is machine-grade and cannot name the
        // seat. Attribution must come from the queue authority's claimed job.
        seat: "pij-forged-reader".into(),
        job_id: claims[0].job_id,
    };
    let ack = client
        .post(format!("http://{addr}/v1/inbox/ack"))
        .bearer_auth("local-key")
        .json(&acknowledgement)
        .send()
        .await
        .expect("ack inbox");
    assert_eq!(ack.status(), reqwest::StatusCode::OK);
    assert_eq!(queue.acked(), [(claims[0].job_id, Outcome::Done)]);
    let read_events: Vec<_> = spine
        .tail(Some(&SeatId::from("pij-reader")), Seq(0))
        .await
        .expect("read audit")
        .into_iter()
        .filter(|event| event.kind == INBOX_ACK_EVENT_KIND)
        .collect();
    assert_eq!(read_events.len(), 1);
    let audit: serde_json::Value =
        serde_json::from_str(&read_events[0].payload).expect("read audit payload");
    assert_eq!(audit["job_id"], claims[0].job_id.0);
    assert_eq!(audit["authenticated_machine"], "local");
    assert_eq!(audit["evidence_grade"], "machine");
    assert_eq!(audit["outcome"], "reader-read");
    assert!(
        spine
            .tail(Some(&SeatId::from("pij-forged-reader")), Seq(0))
            .await
            .expect("forged seat audit")
            .iter()
            .all(|event| event.kind != INBOX_ACK_EVENT_KIND),
        "request body cannot forge reader attribution"
    );

    let invalid = client
        .post(format!("http://{addr}/v1/inbox/ack"))
        .bearer_auth("local-key")
        .json(&InboxAckRequest {
            seat: "pij-forged-reader".into(),
            job_id: pij_core::model::JobId(999_999),
        })
        .send()
        .await
        .expect("invalid ack request");
    assert_eq!(invalid.status(), reqwest::StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(
        spine
            .tail(Some(&SeatId::from("pij-reader")), Seq(0))
            .await
            .expect("audit after failed ack")
            .iter()
            .filter(|event| event.kind == INBOX_ACK_EVENT_KIND)
            .count(),
        1,
        "failed ledger acknowledgement must not mint attestation evidence"
    );

    let empty = client
        .get(format!("http://{addr}/v1/inbox"))
        .bearer_auth("peer-key")
        .query(&[("seat", "pij-reader"), ("wait", "false")])
        .send()
        .await
        .expect("second read");
    let empty: Envelope<Vec<crate::delivery::InboxClaim>> =
        empty.json().await.expect("empty inbox envelope");
    assert!(empty.data.expect("empty page").is_empty());

    server.abort();
}

#[tokio::test]
async fn seats_performs_one_unfiltered_registry_list() {
    let mut seat = SeatDescriptor::new("pij-b", pij_core::model::Harness::Omp, "/abs/tree");
    seat.harness_session = Some("omp-native-seat".to_string());
    let registry = Arc::new(FakeRegistry::new().with_seat(seat));
    let services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/v1/seats"))
        .bearer_auth("key")
        .send()
        .await
        .expect("seats");
    let body: Envelope<serde_json::Value> = response.json().await.expect("seats envelope");
    let roster = body.data.expect("data");
    assert_eq!(roster["seats"].as_array().expect("seat rows").len(), 1);
    assert_eq!(roster["seats"][0]["machine"], "workstation");
    assert_eq!(roster["seats"][0]["session"], "omp-native-seat");
    assert_eq!(roster["seats"][0]["generation"], "rs");
    assert_eq!(roster["unavailable"], serde_json::json!([]));
    assert_eq!(registry.calls(), ["list"]);

    server.abort();
}

#[tokio::test]
async fn events_are_live_by_default_and_frame_unknown_kinds_with_a_cursor() {
    let spine = Arc::new(FakeSpine::new());
    let services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        spine,
    )
    .await;
    let bus = services.event_bus.clone();
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let mut response = reqwest::Client::new()
        .get(format!("http://{addr}/v1/events"))
        .bearer_auth("key")
        .send()
        .await
        .expect("events");

    let hello = response.chunk().await.expect("hello chunk").expect("hello");
    assert!(matches!(
        wire::decode_event_line(1, std::str::from_utf8(&hello).expect("utf8").trim())
            .expect("hello"),
        WireEvent::Hello { .. }
    ));

    bus.publish(Event {
        seq: None,
        v: wire::EVENT_VERSION,
        at: 7,
        kind: "future.kind".to_string(),
        seat: Some("pij-b".into()),
        payload: "{\"new\":true}".to_string(),
    })
    .await
    .expect("publish");

    let frame = tokio::time::timeout(Duration::from_secs(1), response.chunk())
        .await
        .expect("unknown kind must be forwarded, not filtered")
        .expect("frame chunk")
        .expect("frame");
    let frame: StreamFrame = serde_json::from_slice(&frame).expect("event frame");
    let (machine, cursor, event) = expect_event(frame.clone());
    assert_eq!(machine, "workstation");
    assert_eq!(cursor, 1);
    assert_eq!(event.kind, "future.kind");
    let encoded = serde_json::to_value(&frame).expect("serialize frame");
    assert!(
        encoded["event"].get("seq").is_none(),
        "cursor stays out of event body"
    );

    server.abort();
}

#[tokio::test]
async fn explicit_since_replays_then_stays_live() {
    let spine = Arc::new(FakeSpine::new());
    let services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        spine,
    )
    .await;
    let bus = services.event_bus.clone();
    bus.publish(Event {
        seq: None,
        v: wire::EVENT_VERSION,
        at: 1,
        kind: "message".to_string(),
        seat: None,
        payload: "{}".to_string(),
    })
    .await
    .expect("publish replay");
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let mut response = reqwest::Client::new()
        .get(format!("http://{addr}/v1/events"))
        .query(&[("since", r#"{"workstation":0}"#)])
        .bearer_auth("key")
        .send()
        .await
        .expect("events");
    let _hello = response.chunk().await.expect("hello chunk").expect("hello");
    let replay = response
        .chunk()
        .await
        .expect("replay chunk")
        .expect("replay");
    let replay: StreamFrame = serde_json::from_slice(&replay).expect("replay frame");
    assert_eq!(expect_event(replay).1, 1);

    bus.publish(Event {
        seq: None,
        v: wire::EVENT_VERSION,
        at: 2,
        kind: "future.live".to_string(),
        seat: None,
        payload: "{}".to_string(),
    })
    .await
    .expect("publish live");
    let live = response.chunk().await.expect("live chunk").expect("live");
    let live: StreamFrame = serde_json::from_slice(&live).expect("live frame");
    assert_eq!(expect_event(live).1, 2);

    server.abort();
}

#[tokio::test]
async fn peer_forwarding_makes_one_authenticated_request() {
    #[derive(Clone)]
    struct PeerState {
        calls: Arc<AtomicUsize>,
    }

    async fn peer(
        State(state): State<PeerState>,
        headers: HeaderMap,
        Json(body): Json<serde_json::Value>,
    ) -> Json<Envelope<serde_json::Value>> {
        assert_eq!(
            headers[axum::http::header::AUTHORIZATION],
            "Bearer peer-key"
        );
        state.calls.fetch_add(1, Ordering::SeqCst);
        Json(Envelope::ok("peer test", body))
    }

    let calls = Arc::new(AtomicUsize::new(0));
    let (addr, server) = spawn(
        Router::new()
            .route("/v1/test", post(peer))
            .with_state(PeerState {
                calls: calls.clone(),
            }),
    )
    .await;
    let endpoint = PeerEndpoint {
        base_url: format!("http://{addr}/"),
        bearer_key: "peer-key".to_string(),
    };
    let request = serde_json::json!({"value": 7});
    let response: Envelope<serde_json::Value> =
        post_to_peer(&reqwest::Client::new(), &endpoint, "/v1/test", &request)
            .await
            .expect("forward");
    assert_eq!(response.data.expect("data"), request);
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    server.abort();
}

/// u-extension, wave 3 — pi keeps ONE process across `/new` and `/fork` while the
/// extension deliberately assigns a NEW seat id, so the successor is
/// indistinguishable from finding #19's alias and the first `/new` from a healthy
/// seat would have been refused forever.
///
/// Both halves are proven here, because the fix must not weaken #19: a claim that
/// supersedes ITSELF is admitted and dissolves its predecessor with a readable
/// reason, and a claim that names someone ELSE's seat is still refused.
#[tokio::test]
async fn a_native_session_boundary_supersedes_its_own_seat_but_never_another() {
    let registry = Arc::new(FakeRegistry::new());
    let pid = std::process::id();
    let proc_start = 4_242;

    let mut first = SeatDescriptor::new("pij-first", Harness::Omp, "/abs/tree");
    first.proc = Some(ProcIdentity { pid, proc_start });
    registry.put(first).await.expect("first seat");
    let mut stranger = SeatDescriptor::new("pij-stranger", Harness::Omp, "/abs/tree");
    stranger.proc = Some(ProcIdentity {
        pid,
        proc_start: proc_start + 1,
    });
    registry.put(stranger).await.expect("stranger seat");

    let mut services = test_services(
        registry.clone(),
        Arc::new(CountingQueue::default()),
        Arc::new(FakeSpine::new()),
    )
    .await;
    // The daemon CORROBORATES the claim, so the fake process table must know the
    // identity this test claims — otherwise the refusal under test is the
    // liveness check, not the supersession rule.
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity { pid, proc_start }));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    let client = reqwest::Client::new();
    let url = format!("http://{addr}/v1/register");

    let claim = serde_json::json!({
        "id": "pij-second",
        "harness": "omp",
        "folder": "/abs/tree",
        "pid": pid,
        "proc_start": proc_start,
        "supersedes": "pij-first",
    });
    let response = client
        .post(&url)
        .bearer_auth("key")
        .json(&claim)
        .send()
        .await
        .expect("supersede");
    assert_eq!(
        response.status(),
        reqwest::StatusCode::OK,
        "a seat must be able to succeed itself across /new"
    );

    let seats = registry
        .list(SeatFilter::default())
        .await
        .expect("roster after supersession");
    let previous = seats
        .iter()
        .find(|seat| seat.id.as_str() == "pij-first")
        .expect("the predecessor is TOMBSTONED, never deleted");
    assert!(previous.tombstoned_at.is_some());
    assert!(
        previous
            .tombstone_reason
            .as_deref()
            .expect("a reason")
            .contains("pij-second"),
        "the post-mortem must name the successor"
    );
    assert!(seats.iter().any(|seat| seat.id.as_str() == "pij-second"));

    // A predecessor that does not EXIST is refused by name. Review round 2 found
    // this arm returning `None` — a silent downgrade to a plain registration,
    // which the PM's round-1 commit message claimed to have fixed and had not.
    // The claim was in the receipt; the change was not in the code.
    let ghost = serde_json::json!({
        "id": "pij-ghost-successor",
        "harness": "omp",
        "folder": "/abs/tree",
        "pid": pid,
        "proc_start": proc_start,
        "supersedes": "pij-never-registered",
    });
    let response = client
        .post(&url)
        .bearer_auth("key")
        .json(&ghost)
        .send()
        .await
        .expect("ghost predecessor");
    assert_eq!(
        response.status(),
        reqwest::StatusCode::BAD_REQUEST,
        "an unknown predecessor must be REFUSED, never silently ignored"
    );
    assert!(
        response
            .text()
            .await
            .expect("body")
            .contains("is not in the roster")
    );
    assert!(
        !registry
            .list(SeatFilter::default())
            .await
            .expect("roster")
            .iter()
            .any(|seat| seat.id.as_str() == "pij-ghost-successor"),
        "a refused registration must not write a seat"
    );

    // ...and #19 still holds: naming another seat that does not share this
    // process is refused, which is the case the guard exists for.
    let impostor = serde_json::json!({
        "id": "pij-third",
        "harness": "omp",
        "folder": "/abs/tree",
        "pid": pid,
        "proc_start": proc_start,
        "supersedes": "pij-stranger",
    });
    let response = client
        .post(&url)
        .bearer_auth("key")
        .json(&impostor)
        .send()
        .await
        .expect("impostor");
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    assert!(
        response
            .text()
            .await
            .expect("body")
            .contains("may only supersede itself")
    );

    server.abort();
}

#[tokio::test]
async fn two_daemons_forward_remote_send_into_destination_queue_and_spine() {
    let b_registry = Arc::new(FakeRegistry::new());
    let mut b_recipient = SeatDescriptor::new("bob", Harness::Omp, "/b");
    b_recipient.proc = Some(ProcIdentity {
        pid: 42,
        proc_start: 20260830000000,
    });
    b_registry
        .put(b_recipient)
        .await
        .expect("register bound destination");
    let b_queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
    let b_spine = Arc::new(FakeSpine::new());
    let b_services = test_services(b_registry, b_queue.clone(), b_spine.clone()).await;
    let (b_addr, b_server) = spawn(router_with_config(
        b_services,
        HttpConfig {
            local_key: "b-local".to_string(),
            peer_keys: vec!["pair-key".to_string()],
            machine_alias: "laptop".to_string(),
        },
    ))
    .await;

    let a_queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
    let a_spine = Arc::new(FakeSpine::new());
    let a_services = test_services(Arc::new(FakeRegistry::new()), a_queue, a_spine.clone()).await;
    let federation = Arc::new(
        FederationService::new(
            "desktop".to_string(),
            [PeerDefinition {
                alias: "laptop".to_string(),
                url: format!("http://{b_addr}"),
                key: "pair-key".to_string(),
            }],
            Arc::clone(&a_services.queue),
            Arc::clone(&a_services.event_bus),
            federation_policy(),
        )
        .expect("federation"),
    );
    let (a_addr, a_server) = spawn(router_with_federation(
        a_services,
        config("a-local", &[]),
        federation.clone(),
    ))
    .await;

    let request = SendRequest {
        from: "bob".into(),
        to: Destination {
            seat: "bob".into(),
            machine: Some("laptop".to_string()),
        },
        body: "across machines".to_string(),
        msg_id: "remote-m-1".to_string(),
        from_machine: None,
        in_reply_to: None,
    };
    let response = reqwest::Client::new()
        .post(format!("http://{a_addr}/v1/send"))
        .bearer_auth("a-local")
        .json(&request)
        .send()
        .await
        .expect("remote admission");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let admitted: Envelope<Receipt> = response.json().await.expect("queued receipt");
    assert_eq!(
        admitted.data.expect("receipt").outcome,
        pij_core::model::DeliveryOutcome::Queued,
        "the origin observed only its own durable queue"
    );
    let origin_events_before = a_spine
        .tail(None, pij_core::model::Seq(0))
        .await
        .expect("origin admission event");
    assert_eq!(origin_events_before.len(), 1);
    assert!(
        origin_events_before[0]
            .payload
            .contains("\"outcome\":\"queued\"")
    );

    assert_eq!(
        federation.process_one().await.expect("forward"),
        WorkerStep::Forwarded
    );
    let origin_events = a_spine
        .tail(None, pij_core::model::Seq(0))
        .await
        .expect("origin receipt events");
    assert_eq!(origin_events.len(), 2);
    assert!(
        origin_events[1].payload.contains("\"outcome\":\"queued\""),
        "the peer's queued receipt is relayed unchanged"
    );
    assert!(!origin_events[1].payload.contains("injected-to-transport"));

    let kinds = [pij_core::delivery::delivery_kind(&"bob".into())];
    let (_, queued) = b_queue
        .claim(&kinds, "assertion")
        .await
        .expect("destination queue")
        .expect("message landed");
    let message: pij_core::model::Msg =
        serde_json::from_str(&queued.payload).expect("destination payload");
    assert_eq!(message.body, "across machines");
    assert_eq!(message.from_machine.as_deref(), Some("desktop"));

    let events = b_spine
        .tail(None, pij_core::model::Seq(0))
        .await
        .expect("destination spine");
    assert!(events.iter().any(|event| event.kind == "message.pushed"));
    assert!(events.iter().any(|event| event.kind == "delivery.outcome"));
    let pushed = events
        .iter()
        .find(|event| event.kind == "message.pushed")
        .expect("pushed event");
    assert!(pushed.payload.contains("\"from_machine\":\"desktop\""));

    a_server.abort();
    b_server.abort();
}

#[tokio::test]
async fn wrong_peer_key_is_permanent_and_never_hot_loops() {
    let b_services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (b_addr, b_server) = spawn(router_with_config(
        b_services,
        HttpConfig {
            local_key: "b-local".to_string(),
            peer_keys: vec!["correct-key".to_string()],
            machine_alias: "laptop".to_string(),
        },
    ))
    .await;

    let a_queue = Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy"));
    let a_bus =
        Arc::new(crate::events::EventBus::new(Arc::new(FakeSpine::new()), 16).expect("event bus"));
    let federation = FederationService::new(
        "desktop".to_string(),
        [PeerDefinition {
            alias: "laptop".to_string(),
            url: format!("http://{b_addr}"),
            key: "wrong-key".to_string(),
        }],
        a_queue.clone(),
        a_bus,
        federation_policy(),
    )
    .expect("federation");
    federation
        .enqueue_remote(&SendRequest {
            from: "alice".into(),
            to: Destination {
                seat: "bob".into(),
                machine: Some("laptop".to_string()),
            },
            body: "hello".to_string(),
            msg_id: "auth-m-1".to_string(),
            from_machine: None,
            in_reply_to: None,
        })
        .await
        .expect("enqueue");
    assert_eq!(
        federation.process_one().await.expect("worker"),
        WorkerStep::Refused
    );
    assert!(a_queue.retried().is_empty(), "auth is not retryable");
    let acked = a_queue.acked();
    let [(_, Outcome::Failed { reason })] = acked.as_slice() else {
        panic!("one terminal refusal expected");
    };
    assert!(reason.contains("missing or wrong bearer token"));

    b_server.abort();
}

#[tokio::test]
async fn peer_key_removal_takes_effect_when_router_restarts() {
    let client = reqwest::Client::new();
    let first_services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (first_addr, first_server) = spawn(router_with_config(
        first_services,
        config("local", &["revoked-key"]),
    ))
    .await;
    assert_eq!(
        client
            .get(format!("http://{first_addr}/health"))
            .bearer_auth("revoked-key")
            .send()
            .await
            .expect("accepted before restart")
            .status(),
        reqwest::StatusCode::OK
    );
    first_server.abort();

    let restarted_services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (restarted_addr, restarted_server) =
        spawn(router_with_config(restarted_services, config("local", &[]))).await;
    assert_eq!(
        client
            .get(format!("http://{restarted_addr}/health"))
            .bearer_auth("revoked-key")
            .send()
            .await
            .expect("refused after restart")
            .status(),
        reqwest::StatusCode::UNAUTHORIZED
    );

    restarted_server.abort();
}

/// Review round 2 — the memorable allocator has BEHAVIOURAL coverage at the
/// surface it changed, not only a clap-parse test.
///
/// The candidate order is deterministic per seed, so occupancy is the only reason
/// to advance: pre-register the first candidate and the allocator must return the
/// second. A mutation that returns the first candidate unconditionally fails here.
#[tokio::test]
async fn the_memorable_allocator_advances_past_an_occupied_name() {
    let registry = Arc::new(FakeRegistry::new());
    let seed = "s-review-round-2";
    let mut candidates = pij_core::names::memorable_pij_id_candidates(seed);
    let first = candidates.next().expect("a first candidate");
    let second = candidates.next().expect("a second candidate");
    assert_ne!(first, second);

    assert_eq!(
        super::allocate_memorable_id(registry.as_ref(), seed)
            .await
            .expect("allocation"),
        Some(first.clone()),
        "an empty roster yields the first candidate"
    );

    registry
        .put(SeatDescriptor::new(
            first.clone(),
            Harness::Omp,
            "/abs/tree",
        ))
        .await
        .expect("occupy the first candidate");

    assert_eq!(
        super::allocate_memorable_id(registry.as_ref(), seed)
            .await
            .expect("allocation"),
        Some(second),
        "an occupied name must ADVANCE, not collide and not refuse"
    );

    // ...and the shape a human reads is the memorable one, not hex.
    assert!(
        first.as_str().starts_with("pij-"),
        "allocated ids keep the product's name shape: {first}"
    );
}

async fn spawn_at(addr: SocketAddr, router: Router) -> tokio::task::JoinHandle<()> {
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind fixed address");
    tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("serve fixed address");
    })
}

fn peer_definition(alias: &str, addr: SocketAddr) -> PeerDefinition {
    PeerDefinition {
        alias: alias.to_string(),
        url: format!("http://{addr}"),
        key: "pair-key".to_string(),
    }
}

#[tokio::test]
async fn roster_loop_survives_one_peer_error_and_processes_the_next_poll() {
    let reservation = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("reserve peer address");
    let b_addr = reservation.local_addr().expect("peer address");
    drop(reservation);

    let a_registry = Arc::new(FakeRegistry::new());
    a_registry
        .put(SeatDescriptor::new("alice", Harness::Omp, "/desktop"))
        .await
        .expect("local alice");
    let a_services = test_services(
        a_registry,
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let federation = Arc::new(
        FederationService::new(
            "desktop".to_string(),
            [peer_definition("laptop", b_addr)],
            Arc::clone(&a_services.queue),
            Arc::clone(&a_services.event_bus),
            federation_policy(),
        )
        .expect("federation"),
    );
    let worker = Arc::clone(&federation).start();
    let (a_addr, a_server) = spawn(router_with_federation(
        a_services,
        HttpConfig {
            local_key: "a-local".to_string(),
            peer_keys: vec!["pair-key".to_string()],
            machine_alias: "desktop".to_string(),
        },
        federation,
    ))
    .await;

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let response = reqwest::Client::new()
                .get(format!("http://{a_addr}/v1/seats"))
                .bearer_auth("a-local")
                .send()
                .await
                .expect("degraded roster response");
            let roster: Envelope<FederatedRoster> = response.json().await.expect("roster");
            let roster = roster.data.expect("roster data");
            if roster
                .unavailable
                .iter()
                .any(|peer| peer.machine == "laptop" && peer.reason.contains("failed"))
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("the first failed poll becomes typed degraded state");

    let b_registry = Arc::new(FakeRegistry::new());
    b_registry
        .put(SeatDescriptor::new("alice", Harness::Claude, "/laptop"))
        .await
        .expect("remote alice");
    let b_services = test_services(
        b_registry,
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let b_server = spawn_at(
        b_addr,
        router_with_config(
            b_services,
            HttpConfig {
                local_key: "b-local".to_string(),
                peer_keys: vec!["pair-key".to_string()],
                machine_alias: "laptop".to_string(),
            },
        ),
    )
    .await;

    let roster = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let response = reqwest::Client::new()
                .get(format!("http://{a_addr}/v1/seats"))
                .bearer_auth("a-local")
                .send()
                .await
                .expect("federated roster response");
            let roster: Envelope<FederatedRoster> = response.json().await.expect("roster");
            let roster = roster.data.expect("roster data");
            if roster.unavailable.is_empty() && roster.seats.len() == 2 {
                break roster;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("the NEXT poll must succeed after one transient error");
    assert_eq!(
        roster
            .seats
            .iter()
            .map(|seat| (seat.id.as_str(), seat.machine.as_deref()))
            .collect::<Vec<_>>(),
        [("alice", Some("desktop")), ("alice", Some("laptop")),]
    );

    let source_only = reqwest::Client::new()
        .get(format!("http://{a_addr}/v1/seats?scope=local"))
        .bearer_auth("pair-key")
        .send()
        .await
        .expect("source-only roster");
    let source_only: Envelope<FederatedRoster> = source_only
        .json()
        .await
        .expect("source-only roster envelope");
    let source_only = source_only.data.expect("source-only data");
    assert_eq!(
        source_only.seats.len(),
        1,
        "source reads never reflect peer views"
    );
    assert_eq!(source_only.seats[0].machine.as_deref(), Some("desktop"));

    b_server.abort();
    let _ = b_server.await;
    let stale = tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let response = reqwest::Client::new()
                .get(format!("http://{a_addr}/v1/seats"))
                .bearer_auth("a-local")
                .send()
                .await
                .expect("stale roster response");
            let roster: Envelope<FederatedRoster> = response.json().await.expect("roster");
            let roster = roster.data.expect("roster data");
            if !roster.unavailable.is_empty() {
                break roster;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("peer drop becomes typed unavailable state");
    assert_eq!(
        stale.seats.len(),
        2,
        "last successful remote roster is retained"
    );
    assert_eq!(stale.unavailable[0].machine, "laptop");

    worker.shutdown().await.expect("worker shutdown");
    a_server.abort();
}

#[tokio::test]
async fn event_loop_survives_one_stream_error_and_processes_the_next_frame() {
    #[derive(Clone)]
    struct FlakyPeer {
        calls: Arc<AtomicUsize>,
        queries: Arc<Mutex<Vec<Option<String>>>>,
    }

    #[derive(Deserialize)]
    struct FlakyQuery {
        since: Option<String>,
    }

    async fn finite_stream(
        State(state): State<FlakyPeer>,
        Query(query): Query<FlakyQuery>,
        headers: HeaderMap,
    ) -> Response {
        assert_eq!(
            headers[axum::http::header::AUTHORIZATION],
            "Bearer pair-key"
        );
        let call = state.calls.fetch_add(1, Ordering::SeqCst);
        state.queries.lock().expect("query mutex").push(query.since);
        let cursor = u64::try_from(call).unwrap_or(u64::MAX).saturating_add(1);
        let frame = StreamFrame::Event {
            machine: "laptop".to_string(),
            cursor,
            event: Event {
                seq: None,
                v: wire::EVENT_VERSION,
                at: cursor,
                kind: format!("future.{cursor}"),
                seat: None,
                payload: cursor.to_string(),
            },
        };
        let body = format!(
            "{}{}\n",
            wire::encode_hello("flaky-peer").expect("hello"),
            serde_json::to_string(&frame).expect("frame")
        );
        (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
            body,
        )
            .into_response()
    }

    let calls = Arc::new(AtomicUsize::new(0));
    let queries = Arc::new(Mutex::new(Vec::new()));
    let (b_addr, b_server) = spawn(
        Router::new()
            .route("/v1/events", get(finite_stream))
            .with_state(FlakyPeer {
                calls: Arc::clone(&calls),
                queries: Arc::clone(&queries),
            }),
    )
    .await;

    let a_services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let federation = Arc::new(
        FederationService::new(
            "desktop".to_string(),
            [peer_definition("laptop", b_addr)],
            Arc::clone(&a_services.queue),
            Arc::clone(&a_services.event_bus),
            federation_policy(),
        )
        .expect("federation"),
    );
    let (a_addr, a_server) = spawn(router_with_federation(
        a_services.clone(),
        HttpConfig {
            local_key: "a-local".to_string(),
            peer_keys: vec!["pair-key".to_string()],
            machine_alias: "desktop".to_string(),
        },
        Arc::clone(&federation),
    ))
    .await;
    let endpoint = PeerEndpoint {
        base_url: format!("http://{a_addr}"),
        bearer_key: "a-local".to_string(),
    };
    // Attach BEFORE starting the worker so the bounded live view cannot race
    // past either witness frame.
    let mut stream = stream_from_peer(&reqwest::Client::new(), &endpoint, "/v1/events", &[])
        .await
        .expect("open federated view");
    let worker = Arc::clone(&federation).start();

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if matches!(
                stream.next_frame().await.expect("first frame"),
                Some(StreamFrame::Event {
                    machine,
                    cursor: 1,
                    event,
                }) if machine == "laptop" && event.kind == "future.1"
            ) {
                break;
            }
        }
    })
    .await
    .expect("A follows B's first event");

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if matches!(
                stream.next_frame().await.expect("down frame"),
                Some(StreamFrame::PeerState {
                    machine,
                    state: PeerStreamState::Unavailable,
                    retry_in_ms: Some(_),
                    ..
                }) if machine == "laptop"
            ) {
                break;
            }
        }
    })
    .await
    .expect("the finite first stream's drop is visible in band");

    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if matches!(
                stream.next_frame().await.expect("reconnect frame"),
                Some(StreamFrame::Event {
                    machine,
                    cursor: 2,
                    event,
                }) if machine == "laptop" && event.kind == "future.2"
            ) {
                break;
            }
        }
    })
    .await
    .expect("NEXT frame is processed after the transient stream failure");

    {
        let queries = queries.lock().expect("query mutex");
        assert_eq!(queries.first(), Some(&None), "first attach is live-only");
        let resumed: BTreeMap<String, u64> = serde_json::from_str(
            queries
                .get(1)
                .and_then(Option::as_deref)
                .expect("reconnect carries a cursor map"),
        )
        .expect("cursor map");
        assert_eq!(resumed, BTreeMap::from([("laptop".to_string(), 1)]));
    }
    assert!(calls.load(Ordering::SeqCst) >= 2);
    assert_eq!(
        a_services
            .spine
            .tail(None, pij_core::model::Seq(0))
            .await
            .expect("local spine")
            .len(),
        0,
        "remote events are a view and are never appended to the local spine"
    );

    let source_query = [
        ("scope", "local".to_string()),
        ("since", r#"{"laptop":0}"#.to_string()),
    ];
    let mut source_only = stream_from_peer(
        &reqwest::Client::new(),
        &endpoint,
        "/v1/events",
        &source_query,
    )
    .await
    .expect("source-only stream");
    a_services
        .event_bus
        .publish(Event {
            seq: None,
            v: wire::EVENT_VERSION,
            at: 3,
            kind: "future.local".to_string(),
            seat: None,
            payload: "local".to_string(),
        })
        .await
        .expect("local event");
    assert!(matches!(
        source_only.next_frame().await.expect("source frame"),
        Some(StreamFrame::Event {
            machine,
            cursor: 1,
            event,
        }) if machine == "desktop" && event.kind == "future.local"
    ));

    worker.shutdown().await.expect("worker shutdown");
    a_server.abort();
    b_server.abort();
}

/// Review F11 — the RESUME-LIVE RECOVERY, driven through the shipped worker.
///
/// The refusal only matters because of what the worker does next. Without this
/// the refusal is a named retry-forever: the worker would ask again with the same
/// impossible cursor and the peer would refuse again, indefinitely.
///
/// The peer refuses the first attempt with `ErrorKind::CursorReset`, exactly as
/// the shipped `/v1/events` does, then serves a live frame. The worker must
/// publish Reset and come back WITHOUT the stale cursor.
#[tokio::test]
async fn the_event_loop_resumes_live_after_a_peer_refuses_an_impossible_cursor() {
    #[derive(Clone)]
    struct ResettingPeer {
        calls: Arc<AtomicUsize>,
        queries: Arc<Mutex<Vec<Option<String>>>>,
    }

    #[derive(Deserialize)]
    struct ResetQuery {
        since: Option<String>,
    }

    async fn reset_then_serve(
        State(state): State<ResettingPeer>,
        Query(query): Query<ResetQuery>,
    ) -> Response {
        let call = state.calls.fetch_add(1, Ordering::SeqCst);
        state
            .queries
            .lock()
            .expect("query mutex")
            .push(query.since.clone());
        if call == 1 {
            // Second attempt: the peer's history was reset since the first frame,
            // so the cursor the worker now holds is impossible. Refuse BY KIND, as
            // the shipped route does.
            //
            // It must be the SECOND call: the worker only has a cursor to be
            // refused after it has buffered a frame, and a refusal on the very
            // first attempt is indistinguishable from resuming live by accident —
            // which is how the first version of this test passed its own mutation.
            return envelope(
                StatusCode::CONFLICT,
                &Envelope::<()>::refused(
                    "pij events",
                    ErrorKind::CursorReset,
                    "requested cursor 57 is beyond this spine's newest 0",
                ),
            );
        }
        let cursor = if call == 0 { 5 } else { 1 };
        let frame = StreamFrame::Event {
            machine: "laptop".to_string(),
            cursor,
            event: Event {
                seq: None,
                v: wire::EVENT_VERSION,
                at: cursor,
                kind: "after.reset".to_string(),
                seat: None,
                payload: cursor.to_string(),
            },
        };
        let body = format!(
            "{}{}\n",
            wire::encode_hello("reset-peer").expect("hello"),
            serde_json::to_string(&frame).expect("frame")
        );
        (
            StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
            body,
        )
            .into_response()
    }

    let calls = Arc::new(AtomicUsize::new(0));
    let queries = Arc::new(Mutex::new(Vec::new()));
    let (b_addr, b_server) = spawn(
        Router::new()
            .route("/v1/events", get(reset_then_serve))
            .with_state(ResettingPeer {
                calls: Arc::clone(&calls),
                queries: Arc::clone(&queries),
            }),
    )
    .await;

    let a_services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let federation = Arc::new(
        FederationService::new(
            "desktop".to_string(),
            [peer_definition("laptop", b_addr)],
            Arc::clone(&a_services.queue),
            Arc::clone(&a_services.event_bus),
            federation_policy(),
        )
        .expect("federation"),
    );
    let worker = Arc::clone(&federation).start();

    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if calls.load(Ordering::SeqCst) >= 3 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("the worker must RECONNECT after a refusal, not retry it for ever");

    let asked = queries.lock().expect("query mutex").clone();
    assert!(
        asked.len() >= 3,
        "expected serve, refusal, and a resumed retry, saw {asked:?}"
    );
    assert!(
        asked[1].is_some(),
        "the second attempt must carry the cursor the first frame established, or \
         this test proves nothing about resuming. Saw {:?}",
        asked[1]
    );
    assert!(
        asked[2].is_none(),
        "after a refusal the worker must resume LIVE — asking again with the \
         refused cursor is the retry-forever the refusal exists to end. Saw {:?}",
        asked[2]
    );

    worker.shutdown().await.expect("shutdown");
    b_server.abort();
}

/// Review round 4 — a re-raised refusal carries the peer's OWN numbers.
///
/// The client used to rebuild `CursorBeyondSpine` with fabricated zeroes, so an
/// operator read "requested cursor 0 is beyond this spine's newest 0": the right
/// diagnosis carrying evidence nobody measured. Parsing them back out of the
/// message was the alternative, and this project had just finished removing the
/// last place that branched on wording.
///
/// Mutation witness: drop the `data` field from the refusal, or restore the
/// hardcoded zeroes in the client, and this fails.
#[tokio::test]
async fn a_reraised_cursor_refusal_carries_the_peers_own_numbers() {
    async fn refuse(State(()): State<()>) -> Response {
        let mut refusal = Envelope::<CursorResetDetail>::refused(
            "pij events",
            ErrorKind::CursorReset,
            "requested cursor 57 is beyond this spine's newest 4",
        );
        refusal.data = Some(CursorResetDetail {
            requested: 57,
            newest: 4,
        });
        envelope(StatusCode::CONFLICT, &refusal)
    }

    let (addr, server) = spawn(
        Router::new()
            .route("/v1/events", get(refuse))
            .with_state(()),
    )
    .await;
    let endpoint = PeerEndpoint {
        base_url: format!("http://{addr}"),
        bearer_key: "key".to_string(),
    };

    let attempt = stream_from_peer(&reqwest::Client::new(), &endpoint, "/v1/events", &[]).await;
    let Err(error) = attempt else {
        panic!("the peer refused, so opening the stream must fail");
    };

    match error {
        pij_core::error::PijError::CursorBeyondSpine { requested, newest } => {
            assert_eq!(
                (requested, newest),
                (57, 4),
                "the operator must see the numbers the PEER measured, not zeroes we invented"
            );
        }
        other => panic!("expected a typed cursor refusal, got {other}"),
    }

    server.abort();
}

// ---------------------------------------------------------------------------
// `state <id>` readback (plan 114, u-readback)
// ---------------------------------------------------------------------------
//
// Shape derived from the TS surface, not from the packet:
//   `.pi/extensions/pij/core/cli.ts:3615` — the `case "state"` handler,
//   `:3630-3684` — the `--json` object every caller parses today,
//   `:3713` — the human line, headlined "liveness + working/idle" (`cli.ts:354`).
//
// Deliberately NOT mirrored field-for-field. TS emits `lifecycle`, `bindHealth`,
// `degraded`, `daemonTickStale` and `watchdog`; rs models none of them. Emitting
// them as `null` would answer a question rs never asked — the caller could not
// tell "this seat has no watchdog" from "this store has no such concept", which
// is exactly the collapse that makes a read surface lie. So rs names what it
// cannot honour in `unsupported[]` instead, which is ac-1144's refuse-by-name
// rule applied to a READ.

/// The seat every readback test reads back.
fn readback_seat() -> SeatDescriptor {
    let mut seat = SeatDescriptor::new("pij-b", Harness::Claude, "/abs/tree");
    seat.pane = Some("%7".to_string());
    seat.proc = Some(ProcIdentity {
        pid: 4242,
        proc_start: 99,
    });
    seat.state = pij_core::model::SystemState::Working;
    seat.model = Some("claude-opus-5".to_string());
    seat.parent = Some("pij-parent".into());
    seat.harness_session = Some("claude-native-7".to_string());
    seat
}

/// RED WITNESS for u-readback: a `state <id>` round-trip through rs.
///
/// Impossible before this unit — `/v1/state` is not a route, so the request dies
/// in axum's fallback with a bare 404 and no envelope. That is the whole point of
/// the unit, and it is a chronological red: it fails on the tree as merged, for
/// the reason the plan says it fails (rs cannot read a card back), not because
/// something did not compile.
#[tokio::test]
async fn state_reads_one_seat_back_by_id() {
    let registry = Arc::new(FakeRegistry::new().with_seat(readback_seat()));
    let mut services = test_services(
        registry,
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
        pid: 4242,
        proc_start: 99,
    }));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    // POST with the shim's own body shape. RULED (PM, S1): the route table's
    // `state` row is POST, because wave 1's generic call path sends `{ argv }`
    // ONLY on the POST branch — a GET row reaches rs as a bare
    // `fetch(url, { headers })` (adapters/generation-router.ts:199-207) and the
    // `<id>`, this verb's only argument, never crosses the seam.
    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["state", "pij-b"] }))
        .send()
        .await
        .expect("state request");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body: Envelope<serde_json::Value> = response.json().await.expect("state envelope");
    let card = body.data.expect("state data");

    assert_eq!(card["id"], "pij-b");
    assert_eq!(card["state"], "working");
    assert_eq!(card["cwd"], "/abs/tree");
    assert_eq!(card["harness"], "claude");
    assert_eq!(card["pid"], 4242);
    assert_eq!(card["parent"], "pij-parent");
    assert_eq!(card["boundModel"], "claude-opus-5");
    assert_eq!(card["liveness"], "active");
    assert_eq!(card["session"], "claude-native-7");
    assert_eq!(card["generation"], "rs");

    server.abort();
}

/// THE BINDING RULE, pinned: a genuine refusal must never wear route-absence's
/// clothes.
///
/// Wave 1's shim reads `404/405 with an undecodable body` as "rs does not
/// implement this verb" and falls back to legacy
/// (`.pi/extensions/pij/core/generation-routing.ts:353-363`). So if this route
/// answered an unknown seat with a bare 404, the caller would not be told the
/// seat is absent — it would be silently served from the OTHER store, which is
/// the split-brain the plan exists to prevent, arriving through the error path.
///
/// This test therefore asserts what the SHIM asserts, in the shim's own terms:
/// the status is a 404 AND the body decodes as a pij envelope. Asserting only
/// "status is 404" would pass just as happily with an empty body, which is
/// exactly the failure.
#[tokio::test]
async fn state_refusal_is_not_classifiable_as_route_absence() {
    let services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["state", "pij-absent"] }))
        .send()
        .await
        .expect("state request");
    assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);

    let body = response.text().await.expect("body");
    assert!(
        !body.trim().is_empty(),
        "an empty-bodied 404 is what the shim reads as route-absence"
    );
    let decoded: Envelope<serde_json::Value> =
        serde_json::from_str(&body).expect("refusal must decode as a pij envelope");
    assert!(!decoded.ok);
    assert_eq!(decoded.error, Some(ErrorKind::NotFound));
    assert_eq!(decoded.command, "pij state");
    assert!(decoded.data.is_none());

    server.abort();
}

/// A body naming no seat is refused BY NAME, not answered with a guess.
///
/// The tempting alternative — defaulting to some ambient or first seat — would
/// answer a question nobody asked and look like a success.
#[tokio::test]
async fn state_without_a_seat_refuses_by_name() {
    let services = test_services(
        Arc::new(FakeRegistry::new().with_seat(readback_seat())),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["state", "--json"] }))
        .send()
        .await
        .expect("state request");
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    let decoded: Envelope<serde_json::Value> = response.json().await.expect("refusal envelope");
    assert!(!decoded.ok);
    assert_eq!(decoded.error, Some(ErrorKind::Refused));

    server.abort();
}

/// A RECYCLED pid must not read as a live seat — and must not read as `dead`
/// either.
///
/// The pid is alive; it just belongs to a different process now. `active` is the
/// original bug; `dead` is the nearest existing TS word for a claim rs does not
/// make. rs emits a fifth word instead, and this pins that it does.
#[tokio::test]
async fn state_reports_a_recycled_pid_as_neither_active_nor_dead() {
    let mut services = test_services(
        Arc::new(FakeRegistry::new().with_seat(readback_seat())),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    // Same pid, DIFFERENT start time: the OS reused 4242.
    services.liveness = Arc::new(FakeLiveness::new().with_recycled(4242, 12_345));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "id": "pij-b" }))
        .send()
        .await
        .expect("state request");
    let body: Envelope<serde_json::Value> = response.json().await.expect("state envelope");
    let card = body.data.expect("state data");
    assert_eq!(card["liveness"], "recycled");
    // The recorded half of the identity is on the card, so a reader can see WHY.
    assert_eq!(card["procStart"], 99);

    server.abort();
}

/// A seat that never had a process is `unbound`, not `dead`.
#[tokio::test]
async fn state_reports_a_seat_with_no_process_as_unbound() {
    let mut seat = readback_seat();
    seat.proc = None;
    let services = test_services(
        Arc::new(FakeRegistry::new().with_seat(seat)),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "id": "pij-b" }))
        .send()
        .await
        .expect("state request");
    let body: Envelope<serde_json::Value> = response.json().await.expect("state envelope");
    let card = body.data.expect("state data");
    assert_eq!(card["liveness"], "unbound");
    assert!(card["pid"].is_null());

    server.abort();
}

/// A field rs cannot answer is NAMED, never nulled.
///
/// The discriminating arm is the second assertion, and it is the whole point: a
/// card carrying `"bindHealth": null` would satisfy any test that merely looked
/// for the key, while telling a caller "we looked and this seat has none" —
/// which rs never looked for and cannot say. Absent-from-the-card AND
/// present-in-`unsupported` is the only shape that separates the two states.
#[tokio::test]
async fn state_names_what_it_cannot_answer_instead_of_nulling_it() {
    let services = test_services(
        Arc::new(FakeRegistry::new().with_seat(readback_seat())),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "id": "pij-b" }))
        .send()
        .await
        .expect("state request");
    let body: Envelope<serde_json::Value> = response.json().await.expect("state envelope");
    let card = body.data.expect("state data");

    let named: Vec<&str> = card["unsupported"]
        .as_array()
        .expect("unsupported list")
        .iter()
        .map(|entry| entry["field"].as_str().expect("field name"))
        .collect();

    for field in [
        "lifecycle",
        "activity",
        "lastEventAt",
        "ageMs",
        "liveness:stale",
        "bindHealth",
        "degraded",
        "watchdog",
        "terminal",
        "failureReason",
    ] {
        assert!(
            named.contains(&field),
            "{field} must be named as unsupported"
        );
        assert!(
            card.get(field).is_none(),
            "{field} must be ABSENT from the card — emitting it as null answers a question rs never asked"
        );
    }
    // Every named gap carries a reason; a bare list of names is not an answer.
    for entry in card["unsupported"].as_array().expect("unsupported list") {
        assert!(
            !entry["why"].as_str().expect("why").trim().is_empty(),
            "an unsupported field with no reason is a gap nobody can act on"
        );
    }

    server.abort();
}

/// The shim forwards `process.argv.slice(2)` verbatim, so the leading token is
/// the verb and flags ride along. The seat is the first token that is neither.
#[test]
fn state_request_takes_the_seat_from_shim_argv_and_prefers_an_explicit_id() {
    let from_argv = StateRequest {
        id: None,
        argv: Some(vec![
            "state".to_string(),
            "--json".to_string(),
            "pij-b".to_string(),
        ]),
    };
    assert_eq!(from_argv.seat(), Some(SeatId::from("pij-b")));

    let explicit = StateRequest {
        id: Some(SeatId::from("pij-native")),
        argv: Some(vec!["state".to_string(), "pij-shim".to_string()]),
    };
    assert_eq!(explicit.seat(), Some(SeatId::from("pij-native")));

    assert_eq!(StateRequest::default().seat(), None);
    assert_eq!(
        StateRequest {
            id: None,
            argv: Some(vec!["state".to_string(), "--json".to_string()]),
        }
        .seat(),
        None
    );
}

/// An additive body field must not 400 the fleet.
///
/// The seam unit in flight adds a `caller` block to every routed body. A handler
/// with `deny_unknown_fields` would turn that additive change into a fleet-wide
/// refusal on a verb that was working — so the tolerance is pinned here rather
/// than left to serde's default staying put.
#[tokio::test]
async fn state_tolerates_a_body_field_it_does_not_know() {
    let services = test_services(
        Arc::new(FakeRegistry::new().with_seat(readback_seat())),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/state"))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["state", "pij-b"],
            "caller": { "PIJ_SESSION_ID": "pij-caller", "pid": 11, "procStart": 22 }
        }))
        .send()
        .await
        .expect("state request");
    assert_eq!(response.status(), reqwest::StatusCode::OK);

    server.abort();
}
