//! The shim-originated endpoints (plan 119), against a real daemon over HTTP.
//!
//! These exist because the defect this unit closes was invisible to both suites.
//! `pij-literary-bonobo` registered cleanly into rs and then could not speak, and
//! nothing in either generation's tests noticed, because each half was proven
//! against itself: the shim posts `{argv, caller}`, rs's `/v1/send` wants a
//! caller-supplied `from`, and no test ever put the two on the same wire.
//!
//! So every test here drives the REAL routes with the shim's REAL body shape.

use std::net::SocketAddr;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::model::{Envelope, Harness, SeatDescriptor};
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_testkit::FreshStore;

const KEY: &str = "test-local-key";
const PANE: &str = "%119";
const SENDER: &str = "pij-shim-sender";
const RECIPIENT: &str = "pij-shim-recipient";
/// The recipient owns a pane too, so a READ can derive its reader the same way
/// a send derives its sender. One pane cannot be both ends of a send — that is
/// self-addressed and refused.
const RECIPIENT_PANE: &str = "%120";

async fn daemon() -> (SocketAddr, tokio::task::JoinHandle<()>, FreshStore) {
    let store = FreshStore::new();
    let config = Config {
        adapters: Adapters {
            registry: AdapterChoice::Real,
            spine: AdapterChoice::Real,
            queue: AdapterChoice::Real,
            liveness: AdapterChoice::Real,
            ..Adapters::default()
        },
        store_path: store.path(),
        ..Config::default()
    };
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-shim"),
    )
    .await
    .expect("services");
    // The sender owns a pane; the recipient does not need one for the send to be
    // ACCEPTED (delivery is the drain worker's job, and is not what these test).
    let mut sender = SeatDescriptor::new(SENDER, Harness::Claude, "/abs/tree");
    sender.pane = Some(PANE.to_string());
    services.registry.put(sender).await.expect("seed sender");
    let mut recipient = SeatDescriptor::new(RECIPIENT, Harness::Omp, "/abs/tree");
    recipient.pane = Some(RECIPIENT_PANE.to_string());
    services
        .registry
        .put(recipient)
        .await
        .expect("seed recipient");
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
    (addr, server, store)
}

async fn post(addr: SocketAddr, path: &str, body: serde_json::Value) -> reqwest::Response {
    reqwest::Client::new()
        .post(format!("http://{addr}{path}"))
        .bearer_auth(KEY)
        .json(&body)
        .send()
        .await
        .expect("post")
}

/// THE CLAIM THE UNIT EXISTS FOR: a seat that registered into rs can speak,
/// with the sender DERIVED from its pane and no session id anywhere.
///
/// This is `pij-literary-bonobo`'s exact failure, at the wire. Before the route
/// existed it answered 404 with an empty body — a behavioural red, and the same
/// shape the shim reads as route-absence.
#[tokio::test]
async fn a_pane_only_caller_can_send_with_no_session_id_anywhere() {
    let (addr, server, _store) = daemon().await;

    let response = post(
        addr,
        "/v1/shim/send",
        serde_json::json!({
            "argv": ["send", RECIPIENT, "hello from a derived sender"],
            "caller": { "tmuxPane": PANE },
        }),
    )
    .await;
    assert_eq!(
        response.status(),
        reqwest::StatusCode::OK,
        "the sender must be derived from the pane, as report already is"
    );
    let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
    let receipt = payload.data.expect("receipt");
    assert!(
        receipt.get("msg_id").is_some(),
        "the receipt must name the message: {receipt}"
    );

    server.abort();
}

/// AN UNKNOWN FIELD IS REFUSED, NOT DROPPED.
///
/// This is the whole reason the endpoint is distinct rather than additive.
/// `/v1/send`'s struct TOLERATES unknown fields — measured live on 2026-09-01,
/// where a POST carrying `caller` failed on `from` and never on `caller`. So an
/// older daemon handed the additive shape accepts an asserted `from` and
/// silently discards the caller evidence meant to constrain it. Overloading
/// fails quietly; this fails loudly, and that difference is the mechanism.
#[tokio::test]
async fn a_field_this_daemon_does_not_understand_is_refused_rather_than_ignored() {
    let (addr, server, _store) = daemon().await;

    let response = post(
        addr,
        "/v1/shim/send",
        serde_json::json!({
            "argv": ["send", RECIPIENT, "hi"],
            "caller": { "tmuxPane": PANE },
            "evidence_from_a_newer_shim": "must not be dropped",
        }),
    )
    .await;
    assert_eq!(
        response.status(),
        reqwest::StatusCode::BAD_REQUEST,
        "a newer shim's field must fail LOUD; silently dropping it is how caller \
         evidence stops constraining an asserted identity"
    );
    let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
    assert!(
        payload
            .meta
            .as_deref()
            .is_some_and(|meta| meta.contains("evidence_from_a_newer_shim")),
        "the refusal must NAME the field, or the caller cannot fix it: {:?}",
        payload.meta
    );

    server.abort();
}

/// An asserted id that CONTRADICTS the observable pane refuses BOTH — leniency
/// about absent evidence is not leniency about contradicted evidence.
#[tokio::test]
async fn an_asserted_sender_that_contradicts_the_pane_is_refused() {
    let (addr, server, _store) = daemon().await;

    let response = post(
        addr,
        "/v1/shim/send",
        serde_json::json!({
            "argv": ["send", RECIPIENT, "should not be sent as either seat"],
            "caller": { "tmuxPane": PANE, "PIJ_SESSION_ID": RECIPIENT },
        }),
    )
    .await;
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
    assert!(
        payload
            .meta
            .as_deref()
            .is_some_and(|meta| meta.contains("never outranks an observable one")),
        "{:?}",
        payload.meta
    );

    server.abort();
}

/// `inbox register` never reaches rs by the route table's policy; this is the
/// second line of that defence, and it refuses BY NAME with the reason intact.
#[tokio::test]
async fn inbox_register_is_refused_by_name_with_its_reason() {
    let (addr, server, _store) = daemon().await;

    let response = post(
        addr,
        "/v1/shim/inbox",
        serde_json::json!({ "argv": ["inbox", "register"], "caller": { "tmuxPane": PANE } }),
    )
    .await;
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
    let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
    let meta = payload.meta.unwrap_or_default();
    assert!(meta.contains("PANELESS"), "{meta}");
    assert!(meta.contains("never falls back"), "{meta}");
    assert!(
        meta.contains("s120"),
        "the refusal must name its successor: {meta}"
    );

    server.abort();
}

/// Shapes rs cannot honour refuse BY NAME rather than being half-served.
///
/// Every one of these had an available near-fit that would have compiled — drop
/// the attachment, send the broadcast to the first recipient only — and a
/// near-fit that type-checks is the worst outcome available, because the caller
/// cannot see it.
#[tokio::test]
async fn shapes_rs_cannot_serve_refuse_by_name() {
    let (addr, server, _store) = daemon().await;

    for (argv, expect) in [
        (
            serde_json::json!(["send", "--to", "a", "--to", "b", "text"]),
            "broadcast",
        ),
        (
            serde_json::json!(["send", RECIPIENT, "--command", "compact"]),
            "control command",
        ),
        (
            serde_json::json!(["send", RECIPIENT, "--file", "/tmp/x"]),
            "attachment model",
        ),
        (
            serde_json::json!(["send", RECIPIENT, "text", "--wait"]),
            "blocks the sender",
        ),
    ] {
        let response = post(
            addr,
            "/v1/shim/send",
            serde_json::json!({ "argv": argv, "caller": { "tmuxPane": PANE } }),
        )
        .await;
        assert_eq!(
            response.status(),
            reqwest::StatusCode::BAD_REQUEST,
            "{argv} must refuse"
        );
        let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
        let meta = payload.meta.unwrap_or_default();
        assert!(meta.contains(expect), "{argv}: {meta}");
    }

    server.abort();
}

/// `--body-file` bytes travel in their own field and never through argv.
///
/// The parser must never see the body: on the legacy path a body re-appended to
/// argv and re-parsed turned a body beginning `--` into a FLAG, and a valued
/// flag swallowed a whole file. So the body here BEGINS with `--`, which is the
/// case that would break if it were ever lexed.
#[tokio::test]
async fn a_body_file_body_is_never_lexed_as_a_flag() {
    let (addr, server, _store) = daemon().await;

    let body = "--wait this is a body that begins with a flag\nand has two lines";
    let response = post(
        addr,
        "/v1/shim/send",
        serde_json::json!({
            "argv": ["send", RECIPIENT, "--body-file", "/tmp/whatever"],
            "caller": { "tmuxPane": PANE },
            "body_literal": body,
        }),
    )
    .await;
    assert_eq!(
        response.status(),
        reqwest::StatusCode::OK,
        "a body beginning with `--` must not be parsed as a flag"
    );

    server.abort();
}

/// Both new routes are REACHABLE at the exact paths the shim's table names.
///
/// Plan 114 shipped route rows pointing at `/v1/report/<leaf>` paths rs does not
/// serve: every call 404'd, classified as not-implemented, fell back to legacy,
/// and looked exactly like a verb a later wave had not landed — every suite
/// green. The path is a cross-runtime literal, so it gets a test that fails when
/// either side moves.
#[tokio::test]
async fn the_shim_paths_the_route_table_names_are_served() {
    let (addr, server, _store) = daemon().await;

    for path in ["/v1/shim/send", "/v1/shim/inbox"] {
        // A body this handler will refuse — the point is that it REFUSES rather
        // than 404s, because a 404 with no envelope is what the shim reads as
        // route absence and silently answers from the other store.
        let response = post(addr, path, serde_json::json!({ "argv": [] })).await;
        assert_ne!(
            response.status(),
            reqwest::StatusCode::NOT_FOUND,
            "{path} must exist"
        );
        let payload: Envelope<serde_json::Value> = response.json().await.expect("envelope");
        assert!(!payload.ok, "{path} should have refused this body");
    }

    server.abort();
}

/// F4 — A ROUTED READ MUST FINISH. Claim, decode, acknowledge, and the next
/// read is empty.
///
/// `InboxClaim` is a two-step contract: the claim moves the job to `running` and
/// records nothing; the CLIENT acknowledges only once it HAS the message, so a
/// client that dies mid-read gets a duplicate rather than a silent loss. The
/// routed read claimed and never acked — leaving the job running, recording no
/// `ReaderRead`, and letting the same message be claimed again after the lease
/// expired, while rendering "claimed" perfectly honestly. Honest and incomplete.
///
/// The third read is what makes this a test of COMPLETION rather than of
/// plumbing: without the ack the message is still there to be claimed again.
#[tokio::test]
async fn a_routed_read_acknowledges_and_the_next_read_is_empty() {
    let (addr, server, _store) = daemon().await;

    // Give the reader something to read. The recipient owns the pane, so the
    // reader is DERIVED on both halves of the read.
    let sent = post(
        addr,
        "/v1/shim/send",
        serde_json::json!({
            "argv": ["send", RECIPIENT, "a message to claim"],
            "caller": { "tmuxPane": PANE },
        }),
    )
    .await;
    assert_eq!(sent.status(), reqwest::StatusCode::OK);

    let claimed: Envelope<Vec<serde_json::Value>> = post(
        addr,
        "/v1/shim/inbox",
        serde_json::json!({ "argv": ["inbox"], "caller": { "tmuxPane": RECIPIENT_PANE } }),
    )
    .await
    .json()
    .await
    .expect("claim envelope");
    let claims = claimed.data.expect("claims");
    assert_eq!(claims.len(), 1, "one claim: {claims:?}");
    let job_id = claims[0]
        .get("job_id")
        .expect("the claim must name its job");

    let acked = post(
        addr,
        "/v1/shim/inbox/ack",
        serde_json::json!({ "caller": { "tmuxPane": RECIPIENT_PANE }, "job_id": job_id }),
    )
    .await;
    assert_eq!(
        acked.status(),
        reqwest::StatusCode::OK,
        "the read must be completable through a path that DERIVES its reader"
    );

    let again: Envelope<Vec<serde_json::Value>> = post(
        addr,
        "/v1/shim/inbox",
        serde_json::json!({ "argv": ["inbox"], "caller": { "tmuxPane": RECIPIENT_PANE } }),
    )
    .await
    .json()
    .await
    .expect("second claim envelope");
    assert_eq!(
        again.data.expect("claims"),
        Vec::<serde_json::Value>::new(),
        "an acknowledged message must not be claimable again"
    );

    server.abort();
}

/// The acknowledgement derives its reader too, and refuses a caller it cannot
/// resolve — so an unresolvable caller cannot retire a message.
#[tokio::test]
async fn an_unresolvable_caller_cannot_acknowledge() {
    let (addr, server, _store) = daemon().await;

    let response = post(
        addr,
        "/v1/shim/inbox/ack",
        serde_json::json!({ "caller": { "tmuxPane": "%no-such-pane" }, "job_id": 1 }),
    )
    .await;
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);

    // And the ack body is `deny_unknown_fields` for the same reason the send
    // body is: a field this daemon does not understand must never be dropped.
    let unknown = post(
        addr,
        "/v1/shim/inbox/ack",
        serde_json::json!({ "caller": { "tmuxPane": PANE }, "job_id": 1, "extra": true }),
    )
    .await;
    assert_eq!(unknown.status(), reqwest::StatusCode::BAD_REQUEST);

    server.abort();
}
