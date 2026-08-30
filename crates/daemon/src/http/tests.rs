use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use axum::extract::{Json, State};
use axum::http::HeaderMap;
use axum::routing::post;
use pij_core::error::Result;
use pij_core::model::{
    Destination, Envelope, Event, Job, JobId, Outcome, ProcIdentity, Receipt, SeatDescriptor,
};
use pij_core::ports::{Queue, Registry};
use pij_core::wire::{self, WireEvent};
use pij_testkit::fakes::{FakeLiveness, FakeQueue, FakeRegistry, FakeSpine};

use super::*;

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
    async fn enqueue(&self, job: Job) -> Result<JobId> {
        let mut jobs = self.jobs.lock().expect("queue mutex");
        jobs.push(job);
        Ok(JobId(jobs.len() as u64))
    }

    async fn claim(&self, _kinds: &[String], _worker: &str) -> Result<Option<(JobId, Job)>> {
        Ok(None)
    }

    async fn ack(&self, _job: JobId, _outcome: Outcome) -> Result<()> {
        Ok(())
    }
}

async fn test_services(
    registry: Arc<FakeRegistry>,
    queue: Arc<dyn Queue>,
    spine: Arc<FakeSpine>,
) -> Services {
    let mut services = crate::build_services(&pij_core::config::Config::default())
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
            Arc::clone(&services.event_bus),
        )
        .expect("delivery service"),
    );
    services
}

async fn spawn(router: Router) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("address");
    let joined = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });
    (addr, joined)
}

fn config(local_key: &str, peer_keys: &[&str]) -> HttpConfig {
    HttpConfig {
        local_key: local_key.to_string(),
        peer_keys: peer_keys.iter().map(ToString::to_string).collect(),
        machine_alias: "workstation".to_string(),
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
        Arc::new(FakeQueue::new()),
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
        Arc::new(FakeQueue::new()),
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

    let response = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("key")
        .json(&registration)
        .send()
        .await
        .expect("register");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let accepted: Envelope<SeatDescriptor> = response.json().await.expect("descriptor envelope");
    assert_eq!(accepted.data.expect("descriptor").proc, Some(identity));
    assert_eq!(registry.calls(), ["list", "put:pij-parent"]);

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
        ["list", "put:pij-parent", "list"],
        "a refused alias is never persisted"
    );

    server.abort();
}

#[tokio::test]
async fn registration_refuses_uncorroborated_or_half_process_identity() {
    let registry = Arc::new(FakeRegistry::new());
    let services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new()),
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
async fn send_enqueues_exactly_once_and_refuses_remote_destinations() {
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
    assert_eq!(queued.to, request.to.seat);
    assert_eq!(queued.body, request.body);

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
            .contains("u-federation (wave 4)")
    );
    assert_eq!(
        queue.jobs().len(),
        1,
        "a refused remote send enqueues nothing"
    );

    server.abort();
}

#[tokio::test]
async fn seats_performs_one_unfiltered_registry_list() {
    let registry = Arc::new(FakeRegistry::new().with_seat(SeatDescriptor::new(
        "pij-b",
        pij_core::model::Harness::Omp,
        "/abs/tree",
    )));
    let services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new()),
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
    let body: Envelope<Vec<SeatDescriptor>> = response.json().await.expect("seats envelope");
    assert_eq!(body.data.expect("data").len(), 1);
    assert_eq!(registry.calls(), ["list"]);

    server.abort();
}

#[tokio::test]
async fn events_are_live_by_default_and_frame_unknown_kinds_with_a_cursor() {
    let spine = Arc::new(FakeSpine::new());
    let services = test_services(
        Arc::new(FakeRegistry::new()),
        Arc::new(FakeQueue::new()),
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
    let frame: EventFrame = serde_json::from_slice(&frame).expect("event frame");
    assert_eq!(frame.machine, "workstation");
    assert_eq!(frame.cursor, 1);
    assert_eq!(frame.event.kind, "future.kind");
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
        Arc::new(FakeQueue::new()),
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
        .get(format!("http://{addr}/v1/events?since=0"))
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
    let replay: EventFrame = serde_json::from_slice(&replay).expect("replay frame");
    assert_eq!(replay.cursor, 1);

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
    let live: EventFrame = serde_json::from_slice(&live).expect("live frame");
    assert_eq!(live.cursor, 2);

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
