//! Plan 158 over real HTTP and a real SQLite store: `pij send --fyi` holds a
//! message without opening a turn, it rides along appended to the next real
//! message exactly once, a typed-turn hook claims it exactly once, it survives
//! a restart, and a tombstone drops it and says so. Addendum 3: a seat's own
//! turn boundaries publish busy/idle.
//!
//! Every test here speaks only the wire, so each is a behavioural RED against a
//! daemon without the feature (unknown route, or a field silently ignored), not
//! a compile error.

use std::net::SocketAddr;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::model::{Harness, SeatDescriptor, SeatId};
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_testkit::FreshStore;
use serde_json::{Value, json};

const KEY: &str = "test-local-key";
const RECIPIENT: &str = "pij-fyi-recipient";
const PANE: &str = "%91";
const SESSION: &str = "native-session-91";

fn config(store: &FreshStore) -> Config {
    Config {
        adapters: Adapters {
            registry: AdapterChoice::Real,
            spine: AdapterChoice::Real,
            queue: AdapterChoice::Real,
            ..Adapters::default()
        },
        store_path: store.path(),
        ..Config::default()
    }
}

/// An OMP recipient with no process yet, so every real message queues (pre-bind)
/// and the delivered body can be read back from the inbox without a transport.
fn recipient() -> SeatDescriptor {
    let mut seat = SeatDescriptor::new(RECIPIENT, Harness::Omp, "/abs/tree");
    seat.pane = Some(PANE.to_string());
    seat.harness_session = Some(SESSION.to_string());
    seat
}

async fn serve(config: &Config, seed: bool) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let services = pij_daemon::build_services(
        config,
        std::path::Path::new("/tmp/pij-test-pane-signals-fyi"),
    )
    .await
    .expect("services");
    if seed {
        services
            .registry
            .put(recipient())
            .await
            .expect("seed recipient");
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("addr");
    let router = router_with_config(
        services,
        HttpConfig {
            local_key: KEY.to_string(),
            peer_keys: Vec::new(),
            machine_alias: "workstation".to_string(),
        },
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });
    (addr, server)
}

async fn post(addr: SocketAddr, path: &str, body: Value) -> (u16, Value) {
    let response = reqwest::Client::new()
        .post(format!("http://{addr}{path}"))
        .bearer_auth(KEY)
        .json(&body)
        .send()
        .await
        .expect("request");
    let status = response.status().as_u16();
    let text = response.text().await.expect("body");
    (
        status,
        serde_json::from_str(&text).unwrap_or(Value::String(text)),
    )
}

async fn send(addr: SocketAddr, from: &str, body: &str, msg_id: &str, fyi: bool) -> (u16, Value) {
    post(
        addr,
        "/v1/send",
        json!({"from": from, "to": {"seat": RECIPIENT}, "body": body, "msg_id": msg_id, "fyi": fyi}),
    )
    .await
}

async fn pending(addr: SocketAddr) -> Value {
    let (status, state) = post(addr, "/v1/state", json!({"id": RECIPIENT})).await;
    assert_eq!(status, 200, "{state}");
    state["data"]["pendingFyis"].clone()
}

/// Every body queued for the recipient, oldest first, without claiming any.
async fn queued_bodies(config: &Config) -> Vec<String> {
    let services = pij_daemon::build_services(
        config,
        std::path::Path::new("/tmp/pij-test-pane-signals-fyi"),
    )
    .await
    .expect("reopen services");
    let kinds = [format!("delivery:{RECIPIENT}")];
    let mut bodies = Vec::new();
    while let Some((job, row)) = services
        .queue
        .claim(&kinds, "fyi-test-reader")
        .await
        .expect("claim")
    {
        let payload: Value = serde_json::from_str(&row.payload).expect("payload");
        bodies.push(payload["body"].as_str().expect("body").to_string());
        services
            .queue
            .ack(job, pij_core::model::Outcome::Done)
            .await
            .expect("ack");
    }
    bodies
}

#[tokio::test]
async fn an_fyi_is_held_then_rides_along_appended_to_the_next_message_once() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;

    let (status, held) = send(addr, "pij-sender", "build is green", "fyi-1", true).await;
    assert_eq!(status, 200, "{held}");
    assert_eq!(
        held["data"]["outcome"],
        json!({"outcome": "held", "reason": "fyi"})
    );
    assert!(
        queued_bodies(&config).await.is_empty(),
        "an FYI must not queue a delivery"
    );
    assert_eq!(pending(addr).await, 1);

    let (status, sent) = send(addr, "pij-boss", "do X", "real-1", false).await;
    assert_eq!(status, 200, "{sent}");
    let (_, again) = send(addr, "pij-boss", "do Y", "real-2", false).await;
    assert_eq!(again["ok"], true, "{again}");

    let bodies = queued_bodies(&config).await;
    assert_eq!(bodies.len(), 2, "{bodies:?}");
    let (head, tail) = bodies[0]
        .split_once("\n\nAlso, 1 FYI was queued for you:\n1. [from pij-sender, ")
        .expect("block appended after the body");
    assert_eq!(head, "do X", "the real message comes first, unchanged");
    assert!(
        tail.len() == "HH:MM] build is green".len() && tail.ends_with("] build is green"),
        "{tail}"
    );
    assert_eq!(bodies[1], "do Y", "an FYI rides along exactly once");
    assert_eq!(pending(addr).await, 0);
    server.abort();
}

#[tokio::test]
async fn a_held_fyi_survives_a_daemon_restart() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let (status, _) = send(addr, "pij-sender", "note", "fyi-restart", true).await;
    assert_eq!(status, 200);
    server.abort();

    let (addr, server) = serve(&config, false).await;
    assert_eq!(pending(addr).await, 1);
    server.abort();
}

#[tokio::test]
async fn racing_hook_claims_deliver_each_fyi_exactly_once() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    for id in ["fyi-a", "fyi-b", "fyi-c"] {
        let (status, _) = send(addr, "pij-sender", id, id, true).await;
        assert_eq!(status, 200);
    }

    let claim = || {
        post(
            addr,
            "/v1/fyi/claim",
            json!({"pane": PANE, "via": "hook:claude"}),
        )
    };
    let (first, second) = tokio::join!(claim(), claim());
    let mut ids = Vec::new();
    for (status, reply) in [first, second] {
        assert_eq!(status, 200, "{reply}");
        assert_eq!(reply["data"]["seat"], RECIPIENT);
        let claimed = reply["data"]["ids"].as_array().expect("ids").clone();
        assert_eq!(reply["data"]["count"], claimed.len());
        assert_eq!(reply["data"]["block"] == "", claimed.is_empty(), "{reply}");
        ids.extend(claimed);
    }
    ids.sort_by_key(|id| id.as_str().map(str::to_string));
    assert_eq!(ids, [json!("fyi-a"), json!("fyi-b"), json!("fyi-c")]);
    assert_eq!(pending(addr).await, 0);

    let (_, empty) = claim().await;
    assert_eq!(
        empty["data"],
        json!({"seat": RECIPIENT, "count": 0, "block": "", "ids": []})
    );
    server.abort();
}

#[tokio::test]
async fn a_claim_needs_binding_evidence_that_matches_the_seat() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let (_, _) = send(addr, "pij-sender", "secret-ish", "fyi-guarded", true).await;

    for body in [
        json!({"seat": RECIPIENT, "via": "hook:omp"}),
        json!({"seat": RECIPIENT, "native_session": "someone-else", "via": "hook:omp"}),
        json!({"seat": RECIPIENT, "pane": "%1", "via": "hook:omp"}),
        json!({"seat": RECIPIENT, "native_session": SESSION, "via": "hook:elsewhere"}),
    ] {
        let (status, reply) = post(addr, "/v1/fyi/claim", body.clone()).await;
        assert_eq!(status, 400, "{body} -> {reply}");
        assert_eq!(reply["ok"], false);
    }
    assert_eq!(pending(addr).await, 1, "a refused claim takes nothing");

    let (status, reply) = post(
        addr,
        "/v1/fyi/claim",
        json!({"seat": RECIPIENT, "native_session": SESSION, "via": "hook:omp"}),
    )
    .await;
    assert_eq!(status, 200, "{reply}");
    assert_eq!(reply["data"]["count"], 1);
    server.abort();
}

#[tokio::test]
async fn fyi_refuses_controls_and_remote_seats() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let (status, reply) = post(
        addr,
        "/v1/send",
        json!({"from": "pij-sender", "to": {"seat": RECIPIENT}, "body": "", "msg_id": "c",
               "command": "compact", "fyi": true}),
    )
    .await;
    assert_eq!(
        (status, reply["ok"].clone()),
        (400, json!(false)),
        "{reply}"
    );
    let (status, reply) = post(
        addr,
        "/v1/send",
        json!({"from": "pij-sender", "to": {"seat": RECIPIENT, "machine": "elsewhere"},
               "body": "hi", "msg_id": "r", "fyi": true}),
    )
    .await;
    assert_eq!(
        (status, reply["ok"].clone()),
        (400, json!(false)),
        "{reply}"
    );
    assert_eq!(pending(addr).await, 0);
    server.abort();
}

#[tokio::test]
async fn a_tombstone_drops_pending_fyis_and_records_how_many() {
    let store = FreshStore::new();
    let config = config(&store);
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-fyi"),
    )
    .await
    .expect("services");
    services.registry.put(recipient()).await.expect("seed");
    let (addr, server) = serve(&config, false).await;
    for id in ["fyi-x", "fyi-y"] {
        send(addr, "pij-sender", id, id, true).await;
    }
    let seq = services
        .registry
        .tombstone(&SeatId::from(RECIPIENT), "closed")
        .await
        .expect("tombstone");
    assert_eq!(pending(addr).await, 0);
    let tombstone = services
        .spine
        .tail(
            Some(&SeatId::from(RECIPIENT)),
            pij_core::model::Seq(seq.0 - 1),
        )
        .await
        .expect("tail")
        .into_iter()
        .find(|event| event.kind == "seat.tombstone")
        .expect("tombstone event");
    let payload: Value = serde_json::from_str(&tombstone.payload).expect("payload");
    assert_eq!(payload["pending_fyis_dropped"], 2, "{payload}");
    server.abort();
}

#[tokio::test]
async fn whoami_carries_the_pending_count_for_the_status_lines() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    send(addr, "pij-sender", "one", "fyi-w", true).await;
    let (status, reply) = post(addr, "/v1/whoami", json!({"seat": RECIPIENT})).await;
    assert_eq!(status, 200, "{reply}");
    assert_eq!(reply["data"]["id"], RECIPIENT);
    assert_eq!(reply["data"]["pending_fyis"], 1);
    server.abort();
}

#[tokio::test]
async fn a_seats_own_turn_boundaries_publish_busy_then_idle() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let state = || async {
        post(addr, "/v1/state", json!({"id": RECIPIENT})).await.1["data"]["state"].clone()
    };
    assert_eq!(state().await, "idle");

    let (status, reply) = post(
        addr,
        "/v1/activity",
        json!({"seat": RECIPIENT, "native_session": SESSION, "state": "working"}),
    )
    .await;
    assert_eq!(status, 200, "{reply}");
    assert_eq!(
        reply["data"],
        json!({"seat": RECIPIENT, "state": "working", "changed": true})
    );
    assert_eq!(state().await, "working");

    let (status, reply) = post(
        addr,
        "/v1/activity",
        json!({"seat": RECIPIENT, "native_session": "not-this-seat", "state": "idle"}),
    )
    .await;
    assert_eq!(status, 400, "{reply}");
    assert_eq!(
        state().await,
        "working",
        "a mismatched session changes nothing"
    );

    let (status, _) = post(
        addr,
        "/v1/activity",
        json!({"seat": RECIPIENT, "pane": PANE, "state": "idle"}),
    )
    .await;
    assert_eq!(status, 200);
    assert_eq!(state().await, "idle");
    server.abort();
}

/// Review HIGH-1(a): a sender retrying a message id that is still queued must
/// not swallow an FYI held since the first attempt. The queued row keeps its
/// original body, so the newer FYI has to stay pending for the next carrier.
#[tokio::test]
async fn a_retried_carrier_still_queued_does_not_swallow_a_newer_fyi() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    send(addr, "pij-sender", "first note", "fyi-A", true).await;
    let (status, _) = send(addr, "pij-boss", "do X", "real-1", false).await;
    assert_eq!(status, 200);
    send(addr, "pij-sender", "second note", "fyi-B", true).await;
    let (status, retry) = send(addr, "pij-boss", "do X", "real-1", false).await;
    assert_eq!(status, 200, "{retry}");

    assert_eq!(pending(addr).await, 1, "fyi-B must still be pending");
    let bodies = queued_bodies(&config).await;
    assert_eq!(bodies.len(), 1, "{bodies:?}");
    assert!(bodies[0].contains("first note") && !bodies[0].contains("second note"));
    server.abort();
}

/// Review HIGH-2: a duplicate of a carrier the recipient already has delivers
/// nothing, so the FYI it would have carried stays pending.
#[tokio::test]
async fn a_duplicate_of_a_delivered_carrier_leaves_the_fyi_pending() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let (status, _) = send(addr, "pij-boss", "do X", "real-1", false).await;
    assert_eq!(status, 200);
    // The recipient reads and acknowledges real-1: the durable ledger now has it.
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-fyi"),
    )
    .await
    .expect("reopen services");
    let kinds = [format!("delivery:{RECIPIENT}")];
    let (job, _) = services
        .queue
        .claim(&kinds, "fyi-test-reader")
        .await
        .expect("claim")
        .expect("real-1 is queued");
    services
        .queue
        .ack_delivery(job, pij_core::model::DeliveryOrigin::ReaderRead)
        .await
        .expect("ack");

    send(addr, "pij-sender", "late note", "fyi-late", true).await;
    let (status, dup) = send(addr, "pij-boss", "do X", "real-1", false).await;
    assert_eq!(status, 200, "{dup}");
    assert_eq!(dup["data"]["outcome"]["outcome"], "delivered", "{dup}");
    assert_eq!(pending(addr).await, 1, "the duplicate carried nothing");
    assert!(queued_bodies(&config).await.is_empty());
    server.abort();
}

/// Review HIGH-2: a typed-turn hook claim racing a ride-along delivers every
/// FYI exactly once, in the body or in the hook's block, never both.
#[tokio::test]
async fn a_hook_claim_racing_a_ride_along_delivers_each_fyi_once() {
    let store = FreshStore::new();
    let config = config(&store);
    let (addr, server) = serve(&config, true).await;
    let ids = ["fyi-r1", "fyi-r2", "fyi-r3", "fyi-r4"];
    for id in ids {
        send(addr, "pij-sender", &format!("body-{id}"), id, true).await;
    }
    let (claimed, sent) = tokio::join!(
        post(
            addr,
            "/v1/fyi/claim",
            json!({"pane": PANE, "via": "hook:claude"})
        ),
        send(addr, "pij-boss", "do X", "real-race", false),
    );
    assert_eq!(claimed.0, 200, "{}", claimed.1);
    assert_eq!(sent.0, 200, "{}", sent.1);
    let bodies = queued_bodies(&config).await;
    assert_eq!(bodies.len(), 1);
    for id in ids {
        let in_hook = claimed.1["data"]["ids"]
            .as_array()
            .unwrap()
            .iter()
            .any(|claimed| claimed == id);
        let in_body = bodies[0].contains(&format!("body-{id}"));
        assert!(in_hook ^ in_body, "{id}: hook {in_hook}, body {in_body}");
    }
    assert_eq!(pending(addr).await, 0);
    server.abort();
}

/// Review MEDIUM-3: a tombstone ends any turn, so a seat retired while
/// `working` does not read `working` for ever.
#[tokio::test]
async fn a_tombstone_resets_a_working_seat_to_idle() {
    let store = FreshStore::new();
    let config = config(&store);
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-fyi"),
    )
    .await
    .expect("services");
    services.registry.put(recipient()).await.expect("seed");
    let (addr, server) = serve(&config, false).await;
    let (status, _) = post(
        addr,
        "/v1/activity",
        json!({"seat": RECIPIENT, "native_session": SESSION, "state": "working"}),
    )
    .await;
    assert_eq!(status, 200);
    services
        .registry
        .tombstone(&SeatId::from(RECIPIENT), "closed")
        .await
        .expect("tombstone");
    let (_, card) = post(addr, "/v1/state", json!({"id": RECIPIENT})).await;
    assert_eq!(card["data"]["state"], "idle", "{card}");
    server.abort();
}
