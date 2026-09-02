//! Identity-route tests (plan 114, u-identity): adopt, whoami, phonehome.
//!
//! **These assert the PERSISTED ROW, never the printed line.** The TS route this
//! ports carries a defect the packet names explicitly: `adopt` on a dissolved
//! pane prints a correct-looking `adopted <id> … (pane %N, bound)` and persists
//! NOTHING. A test that read the response would pass on that bug. So every
//! success arm here reads the registry back, and the dissolved-pane arm asserts
//! that NOTHING was written.
//!
//! Every refusal arm additionally asserts the body DECODES as a pij envelope.
//! That is not tidiness: the wave-1 shim classifies `404` with an undecodable
//! body as "rs does not implement this route" and falls back to legacy, so a
//! bare refusal would turn a deliberate "no" into a silent re-homing of the seat
//! into the other store — the split-brain this plan exists to prevent.

use std::net::SocketAddr;
use std::sync::Arc;

use pij_core::model::{Envelope, Pane, PaneProcess, ProcIdentity, SeatDescriptor};
use pij_core::ports::{Registry, SeatFilter};
use pij_testkit::fakes::{FakeLiveness, FakeQueue, FakeRegistry, FakeSpine, FakeTmux};

use super::tests::{config, spawn, test_services};
use super::*;

const PANE: &str = "%77";
/// The same pane, as it must appear in a QUERY STRING.
///
/// Not a test detail: every tmux pane id starts with `%`, which is the
/// percent-encoding sigil, so a raw `?pane=%77` decodes to `pane=w` and the
/// route looks up a pane nobody has. One more reason the canonical arm is POST
/// with the pane in the body.
const PANE_ENCODED: &str = "%2577";
const PID: u32 = 4242;
const PROC_START: u64 = 1_725_000_000;
const FOLDER: &str = "/abs/tree";

struct World {
    addr: SocketAddr,
    registry: Arc<FakeRegistry>,
    server: tokio::task::JoinHandle<()>,
}

/// A machine where pane `%77` exists and is running pid 4242 from `/abs/tree`.
///
/// The pane process is arranged on the TMUX fake, never sent by the caller: the
/// daemon must DERIVE the identity facts it stores. A caller-asserted pid is a
/// claim, and this platform has already paid for treating one as evidence.
async fn world(registry: Arc<FakeRegistry>, pane_alive: bool) -> World {
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    let mut tmux = FakeTmux::new();
    if pane_alive {
        tmux = tmux
            .with_pane(Pane {
                id: PANE.to_string(),
                session: "work".to_string(),
                window: "@1".to_string(),
                title: "claude".to_string(),
                cursor_x: None,
                cursor_y: None,
            })
            .with_pane_process(
                PANE,
                PaneProcess {
                    pid: PID,
                    cwd: FOLDER.to_string(),
                },
            );
    }
    services.tmux = Arc::new(tmux);
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
        pid: PID,
        proc_start: PROC_START,
    }));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;
    World {
        addr,
        registry,
        server,
    }
}

async fn live_seats(registry: &FakeRegistry) -> Vec<SeatDescriptor> {
    registry
        .list(SeatFilter::default())
        .await
        .expect("list seats")
        .into_iter()
        .filter(|seat| seat.tombstoned_at.is_none())
        .collect()
}

async fn adopt(addr: SocketAddr, argv: &[&str]) -> reqwest::Response {
    reqwest::Client::new()
        .post(format!("http://{addr}/v1/adopt"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": argv }))
        .send()
        .await
        .expect("adopt")
}

/// A refusal must be READABLE BY THE SHIM. Asserts the body decodes as an
/// envelope and says `ok:false` — which a bare 404 cannot do.
async fn refusal_envelope(response: reqwest::Response) -> Envelope<serde_json::Value> {
    let status = response.status();
    let body = response.text().await.expect("refusal body");
    assert!(
        !body.is_empty(),
        "a refusal with an EMPTY body is classified by the shim as route-absence and \
         silently falls back to legacy (status {status})"
    );
    let envelope: Envelope<serde_json::Value> =
        serde_json::from_str(&body).unwrap_or_else(|error| {
            panic!("refusal body must decode as a pij envelope: {error}: {body}")
        });
    assert!(!envelope.ok, "a refusal envelope says ok:false: {body}");
    assert!(
        envelope.error.is_some(),
        "a refusal carries a branchable error kind, not only prose: {body}"
    );
    envelope
}

/// THE RED-FIRST ARM, and the one u-route had to leave red: with the daemon up
/// and `adopt` reaching rs, A SEAT LANDS IN THE RS STORE.
#[tokio::test]
async fn adopt_persists_a_row_that_whoami_then_names() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let adopted: Envelope<SeatDescriptor> = response.json().await.expect("adopt envelope");
    let adopted = adopted.data.expect("adopt returns the descriptor");

    // THE ASSERTION THAT MATTERS: the ROW, read back from the store.
    let seats = live_seats(&world.registry).await;
    assert_eq!(seats.len(), 1, "adopt persists exactly one live seat");
    let row = &seats[0];
    assert_eq!(row.id, adopted.id, "the id it printed is the id it stored");
    assert_eq!(row.pane.as_deref(), Some(PANE));
    assert_eq!(row.folder, FOLDER, "the folder is derived from the pane");
    assert_eq!(
        row.proc,
        Some(ProcIdentity {
            pid: PID,
            proc_start: PROC_START
        }),
        "adopt binds SYNCHRONOUSLY, so phonehome confirms rather than polls"
    );
    assert!(
        row.id.0.starts_with("pij-"),
        "the MINTER LIVES IN RS (ac-1147): {}",
        row.id
    );

    // …and whoami then NAMES it, derived from the pane.
    let response = reqwest::Client::new()
        .get(format!(
            "http://{}/v1/whoami?pane={PANE_ENCODED}",
            world.addr
        ))
        .bearer_auth("key")
        .send()
        .await
        .expect("whoami");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let named: Envelope<SeatDescriptor> = response.json().await.expect("whoami envelope");
    assert_eq!(named.data.expect("whoami names a seat").id, row.id);

    world.server.abort();
}

#[tokio::test]
async fn adopt_upgrades_unknown_claude_consent_but_preserves_explicit_refusal() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(Arc::clone(&registry), true).await;

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let mut row = live_seats(&registry)
        .await
        .into_iter()
        .next()
        .expect("adopted seat");
    let consent_after_adopt = row.cross_session_inbound_accept;

    row.cross_session_inbound_accept = Some(false);
    let id = row.id.clone();
    registry.put(row).await.expect("record explicit refusal");

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let consent_after_readopt = registry
        .get(&id)
        .await
        .expect("read re-adopted seat")
        .expect("re-adopted seat exists")
        .cross_session_inbound_accept;

    assert_eq!(
        (consent_after_adopt, consent_after_readopt),
        (Some(true), Some(false)),
        "registration upgrades only unknown Claude consent and never overwrites an explicit refusal"
    );

    world.server.abort();
}

/// THE DISCRIMINATING ARM: a print-only success is a FAILURE.
///
/// This is the exact TS defect, reproduced as a test rather than as behaviour.
/// The pane is gone, so there is nothing to derive an identity from — and the
/// only honest answers are a refusal and an untouched store.
#[tokio::test]
async fn adopting_a_dissolved_pane_refuses_and_persists_nothing() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), false).await;

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "a pane nothing is running behind cannot be adopted"
    );
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains(PANE),
        "the refusal names the pane it could not resolve: {text}"
    );

    assert!(
        live_seats(&world.registry).await.is_empty(),
        "a REFUSED adopt writes NO row — a success line that persists nothing is the defect"
    );
    assert!(
        !world
            .registry
            .calls()
            .iter()
            .any(|call| call.starts_with("put")),
        "nothing is written on the refusal path at all"
    );

    world.server.abort();
}

/// ac-1147: THE MINTER LIVES IN RS. Adopt REFUSES a caller-supplied name rather
/// than silently minting a different one — a caller told "ok" while carrying a
/// name nothing knows would address a seat that does not exist.
///
/// `register` keeps the explicit-id case for callers that legitimately hold one.
/// Two minters would be two namespaces, which is the headline split-brain.
#[tokio::test]
async fn adopt_refuses_a_caller_supplied_id_and_mints_nothing_for_it() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/adopt", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["adopt", PANE, "--harness", "claude"],
            "id": "pij-i-named-myself"
        }))
        .send()
        .await
        .expect("adopt with an asserted id");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains("pij-i-named-myself") && text.contains("register"),
        "the refusal names the asserted id AND the verb that does take one: {text}"
    );

    assert!(
        live_seats(&world.registry).await.is_empty(),
        "a refused adopt mints nothing — not the asserted name, and not a substitute for it"
    );

    world.server.abort();
}

/// req-0008: a re-register never clears live state. The second adopt names no
/// parent; the first one's parent must survive it.
#[tokio::test]
async fn re_adopting_the_same_pane_keeps_live_state() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = adopt(
        world.addr,
        &[
            "adopt",
            PANE,
            "--harness",
            "claude",
            "--parent",
            "pij-governor",
        ],
    )
    .await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let first = live_seats(&world.registry).await;
    assert_eq!(first.len(), 1);
    assert_eq!(
        first[0].parent.as_ref().map(|id| id.0.as_str()),
        Some("pij-governor")
    );

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let second = live_seats(&world.registry).await;
    assert_eq!(
        second.len(),
        1,
        "re-adopting a pane adopts INTO the seat that owns it, never minting a second"
    );
    assert_eq!(
        second[0].id, first[0].id,
        "the id is stable across re-adopt"
    );
    assert_eq!(
        second[0].parent.as_ref().map(|id| id.0.as_str()),
        Some("pij-governor"),
        "an omitted --parent means UNSAID, not CLEARED (req-0008)"
    );

    world.server.abort();
}

/// Identity is DERIVED, never asserted: an unknown `PIJ_SESSION_ID` must not
/// mint a phantom seat, and must not be answered as if it were real.
#[tokio::test]
async fn whoami_refuses_an_unknown_asserted_seat_and_mints_nothing() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .get(format!(
            "http://{}/v1/whoami?seat=pij-not-a-real-seat",
            world.addr
        ))
        .bearer_auth("key")
        .send()
        .await
        .expect("whoami");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    refusal_envelope(response).await;
    assert!(
        live_seats(&world.registry).await.is_empty(),
        "an asserted id that names nothing MINTS NOTHING"
    );

    world.server.abort();
}

/// The impersonation arm: an asserted seat id that contradicts the DERIVED pane
/// is refused rather than silently answered for someone else's seat.
#[tokio::test]
async fn whoami_refuses_an_asserted_seat_that_contradicts_the_derived_pane() {
    let registry = Arc::new(FakeRegistry::new().with_seat(SeatDescriptor::new(
        "pij-somebody-else",
        pij_core::model::Harness::Claude,
        "/elsewhere",
    )));
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );

    let response = reqwest::Client::new()
        .get(format!(
            "http://{}/v1/whoami?pane={PANE_ENCODED}&seat=pij-somebody-else",
            world.addr
        ))
        .bearer_auth("key")
        .send()
        .await
        .expect("whoami");
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "a claim that contradicts what the daemon can observe is refused, never preferred"
    );
    refusal_envelope(response).await;

    world.server.abort();
}

/// ac-1148: phonehome is served BY RS for an rs seat, and it CONFIRMS — the
/// binding already happened at adopt.
#[tokio::test]
async fn phonehome_confirms_the_binding_rs_already_made() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seat = live_seats(&world.registry).await[0].id.0.clone();

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/phonehome?seat={seat}", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["phonehome"] }))
        .send()
        .await
        .expect("phonehome");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let confirmed: Envelope<serde_json::Value> = response.json().await.expect("phonehome envelope");
    let data = confirmed.data.expect("phonehome payload");
    assert_eq!(data["seat"], seat);
    assert_eq!(
        data["bound"], true,
        "adopt bound synchronously, so this is a CONFIRMATION, not a poll"
    );
    assert_eq!(data["pid"], PID);
    assert_eq!(
        data["proc_start"], PROC_START,
        "the pid travels with its start time — a pid alone is recycled at boot"
    );

    world.server.abort();
}

#[tokio::test]
async fn adopt_persists_generic_and_native_harness_session_aliases() {
    for (harness, key, session) in [
        ("omp", "harnessSession", "omp-native"),
        ("claude", "CLAUDE_CODE_SESSION_ID", "claude-native"),
        ("copilot", "COPILOT_AGENT_SESSION_ID", "copilot-native"),
        ("codex", "CODEX_THREAD_ID", "codex-native"),
    ] {
        let registry = Arc::new(FakeRegistry::new());
        let world = world(registry, true).await;
        let mut caller = serde_json::Map::new();
        caller.insert(key.to_string(), serde_json::json!(session));
        let response = reqwest::Client::new()
            .post(format!("http://{}/v1/adopt", world.addr))
            .bearer_auth("key")
            .json(&serde_json::json!({
                "argv": ["adopt", PANE, "--harness", harness],
                "caller": caller,
            }))
            .send()
            .await
            .expect("adopt with harness session");
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let seats = live_seats(&world.registry).await;
        assert_eq!(seats.len(), 1);
        assert_eq!(seats[0].harness_session.as_deref(), Some(session));
        world.server.abort();
    }
}

/// A caller that sends a harness-native session id must be TOLD rs did not bind
/// by it. The TS route binds exactly that value at exactly this moment, so
/// answering a bare `bound: true` would let the caller conclude rs had pinned
/// their native session. rs binds by process identity; it says so.
#[tokio::test]
async fn phonehome_says_it_did_not_bind_by_the_harness_session_id() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seat = live_seats(&world.registry).await[0].id.0.clone();

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/phonehome", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["phonehome"],
            "caller": { "PIJ_SESSION_ID": seat, "CLAUDE_CODE_SESSION_ID": "ae826abe-native" }
        }))
        .send()
        .await
        .expect("phonehome");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let confirmed: Envelope<serde_json::Value> = response.json().await.expect("phonehome envelope");
    let meta = confirmed
        .meta
        .expect("a supplied harness session is answered, not ignored");
    assert!(
        meta.contains("ae826abe-native") && meta.contains("did not bind by it"),
        "the note names the value and says rs did not bind by it: {meta}"
    );
    let data = confirmed.data.expect("phonehome payload");
    assert_eq!(data["bound"], true);
    assert!(
        data["bound_by"]
            .as_str()
            .is_some_and(|by| by.contains("proc_start")),
        "the answer states what rs bound by: {data}"
    );

    world.server.abort();
}

/// F-U2, pinned as behaviour: the wave-1 shim POSTs only `{argv}`, and for
/// `pij phonehome` that argv is exactly `["phonehome"]` — nothing that names a
/// seat. rs must REFUSE, loudly and decodably. It must NOT answer for a seat it
/// guessed, and the refusal must not be mistakable for route-absence, because
/// falling back to legacy here IS the identity violation ac-1148 forbids.
#[tokio::test]
async fn phonehome_without_caller_context_refuses_decodably_and_never_guesses() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/phonehome", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["phonehome"] }))
        .send()
        .await
        .expect("phonehome");
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "with exactly one seat in the store, answering for it would be a GUESS"
    );
    assert_ne!(
        response.status(),
        reqwest::StatusCode::NOT_FOUND,
        "404 is how the shim spells route-absence; a refusal must not wear it"
    );
    refusal_envelope(response).await;

    world.server.abort();
}

/// A recycled pid is the one case a pid-only check cannot see, and it is not
/// hypothetical: pids reset at boot. The seat's row still holds the pid it bound
/// to, a live process answers at that number, and the START TIME is the only
/// thing that separates "still running" from "something else now".
#[tokio::test]
async fn phonehome_reports_a_recycled_pid_as_unbound() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seats = live_seats(&world.registry).await;
    let seat = seats[0].id.0.clone();
    assert_eq!(
        seats[0].proc.expect("bound at adopt").proc_start,
        PROC_START
    );

    // Same machine, same pid, different process: the boot that recycled it.
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.liveness = Arc::new(FakeLiveness::new().with_recycled(PID, PROC_START + 9_999));
    let (addr, rebooted) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/phonehome?seat={seat}"))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["phonehome"] }))
        .send()
        .await
        .expect("phonehome");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let confirmed: Envelope<serde_json::Value> = response.json().await.expect("phonehome envelope");
    let data = confirmed.data.expect("phonehome payload");
    assert_eq!(
        data["bound"], false,
        "a live pid at the same number is NOT the same process"
    );
    assert_eq!(data["proc_start"], PROC_START, "what the row bound to");
    assert_eq!(
        data["observed_proc_start"],
        PROC_START + 9_999,
        "and what is actually there — both reported, so the recycle is diagnosable"
    );

    world.server.abort();
    rebooted.abort();
}

/// THE PANELESS FORM THE READY ROUTE USES, and rs REFUSES IT OUTRIGHT — by
/// design, not by omission.
///
/// `pij inbox register --json` names no pane and no process. rs admission
/// refuses every registration without bind evidence (`NoBindEvidence`), the
/// control that stops a subagent claiming a seat it cannot prove it is. With no
/// pane there is nothing to DERIVE that evidence from — and a caller-supplied
/// pid cannot stand in for it, because a control whose input the subject
/// supplies is not a control. Paneless admission is unsolved (req-0015) and
/// accepting a claim in the meantime would be the control switched off, not a
/// stopgap.
///
/// CONSEQUENCE FOR THE ROUTE TABLE, and it is not this unit's to fix: adding a
/// `{ verb:"inbox", leaf:"register" }` row would send every paneless seat here,
/// where this refusal decodes as `rs-error` — which does NOT fall back — and
/// paneless seats would stop registering at all.
#[tokio::test]
async fn the_paneless_form_is_refused_by_name_when_nothing_can_bind_it() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/adopt", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["inbox", "register", "--json", "--harness", "claude"],
            "caller": { "cwd": "/abs/elsewhere" }
        }))
        .send()
        .await
        .expect("inbox register");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains("bind evidence") && text.contains("register"),
        "the refusal says WHY a paneless claim is not accepted — bind evidence cannot be a \
         thing the subject asserts — and names the verb that does take one: {text}"
    );
    assert!(
        live_seats(&world.registry).await.is_empty(),
        "nothing half-registered on the way to the refusal"
    );

    world.server.abort();
}

/// A claimed pid with no start stamp is refused. The pair is the identity; the
/// pid alone is a number the OS reissues at every boot.
#[tokio::test]
async fn a_paneless_claim_refuses_a_pid_with_no_start_stamp() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/adopt", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["inbox", "register", "--harness", "claude"],
            "caller": { "cwd": "/abs/elsewhere", "pid": PID }
        }))
        .send()
        .await
        .expect("inbox register");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    refusal_envelope(response).await;
    assert!(live_seats(&world.registry).await.is_empty());

    world.server.abort();
}

/// A claimed `(pid, proc_start)` the daemon cannot corroborate is refused by the
/// registration service — the claim does not become the row.
#[tokio::test]
async fn a_paneless_claim_refuses_an_uncorroborated_process_identity() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/adopt", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["inbox", "register", "--harness", "claude"],
            "caller": { "cwd": "/abs/elsewhere", "pid": PID, "procStart": PROC_START + 1 }
        }))
        .send()
        .await
        .expect("inbox register");
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "the daemon observed a different start for that pid"
    );
    refusal_envelope(response).await;
    assert!(live_seats(&world.registry).await.is_empty());

    world.server.abort();
}

/// Shapes rs cannot honour REFUSE BY NAME rather than differing silently.
#[tokio::test]
async fn adopt_refuses_a_flag_it_cannot_honour_by_name() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = adopt(
        world.addr,
        &[
            "adopt",
            PANE,
            "--harness",
            "claude",
            "--session-id",
            "native-123",
        ],
    )
    .await;
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains("--session-id"),
        "the refusal names the flag it cannot honour: {text}"
    );
    assert!(live_seats(&world.registry).await.is_empty());

    world.server.abort();
}

mod argv {
    use super::super::identity::parse_adopt_argv;

    fn argv(tokens: &[&str]) -> Vec<String> {
        tokens.iter().map(ToString::to_string).collect()
    }

    /// The exact line `/pij ready` step 1 tells a seat to type.
    #[test]
    fn parses_the_ready_gestures_own_command_line() {
        let parsed = parse_adopt_argv(&argv(&[
            "adopt",
            "%77",
            "--harness",
            "claude",
            "--parent",
            "pij-governor",
        ]))
        .expect("the ready gesture parses");
        assert_eq!(parsed.pane.as_deref(), Some("%77"));
        assert_eq!(parsed.harness.as_deref(), Some("claude"));
        assert_eq!(parsed.parent.as_deref(), Some("pij-governor"));
        assert!(!parsed.paneless);
    }

    /// And the paneless branch of the same step.
    #[test]
    fn parses_the_paneless_ready_form() {
        let parsed = parse_adopt_argv(&argv(&["inbox", "register", "--json"]))
            .expect("the paneless form parses");
        assert!(parsed.paneless);
        assert_eq!(parsed.pane, None, "`--json` is not a pane");
    }

    #[test]
    fn refuses_a_flag_it_cannot_honour_and_names_it() {
        let error = parse_adopt_argv(&argv(&["adopt", "%77", "--session-id", "x"]))
            .expect_err("rs stores no native session id");
        assert!(error.contains("--session-id"), "{error}");

        let error = parse_adopt_argv(&argv(&["adopt", "%77", "--invented"]))
            .expect_err("an unknown flag is refused, never ignored");
        assert!(error.contains("--invented"), "{error}");
    }

    #[test]
    fn refuses_an_inbox_verb_it_does_not_serve() {
        let error = parse_adopt_argv(&argv(&["inbox", "--wait"]))
            .expect_err("only `inbox register` reaches this route");
        assert!(error.contains("inbox register"), "{error}");
    }
}

/// The id is the ONE fact the caller cannot derive, so adopt hands it back with
/// the line that fixes the caller's environment.
///
/// Found by running the real gesture rather than by reading: a seat that was
/// already registered elsewhere adopts successfully, then asks `whoami`, and its
/// STALE `PIJ_SESSION_ID` contradicts the pane — so the impersonation guard
/// refuses and a seat that just adopted cannot name itself.
#[tokio::test]
async fn adopt_hands_back_the_line_that_fixes_the_callers_environment() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = adopt(world.addr, &["adopt", PANE, "--harness", "claude"]).await;
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let adopted: Envelope<SeatDescriptor> = response.json().await.expect("adopt envelope");
    let meta = adopted
        .meta
        .expect("adopt states the id the caller must export");
    let id = adopted.data.expect("descriptor").id;
    assert!(
        meta.contains(&format!("export PIJ_SESSION_ID={id}")),
        "the note is the runnable line, not a description of one: {meta}"
    );

    world.server.abort();
}

/// 8b — THE READER ACCEPTS ALL THREE SPELLINGS, named for the wire one.
///
/// Deliberately NOT a duplicate of the fixture round-trip. The fixture proves
/// the CAMELCASE wire shape, because that is what the shim sends. This proves
/// the other two still work, which is what stops the fix for one caller from
/// silently breaking the others:
///
///   camelCase        — the generation shim's wire spelling (`CALLER_WIRE_KEYS`)
///   SCREAMING_SNAKE  — the env NAMES, which is what the contract was
///                      distributed as and what this reader was first built to
///   snake_case       — the `pij-rs` CLI's own idiom
///
/// It lives beside the reader on purpose: a developer editing `CallerContext`
/// sees the contract in the same file, rather than in a fixture two directories
/// away that they have no reason to open.
#[test]
fn caller_context_accepts_all_three_wire_spellings() {
    let spellings = [
        (
            "camelCase (what the shim actually sends)",
            serde_json::json!({
                "pijSessionId": "pij-seat",
                "tmuxPane": "%77",
                "pijParentId": "pij-governor",
                "claudeCodeSessionId": "claude-1",
                "copilotAgentSessionId": "copilot-1",
                "codexThreadId": "codex-1",
                "harnessSession": "generic-1",
            }),
        ),
        (
            "SCREAMING_SNAKE (the env names)",
            serde_json::json!({
                "PIJ_SESSION_ID": "pij-seat",
                "TMUX_PANE": "%77",
                "PIJ_PARENT_ID": "pij-governor",
                "CLAUDE_CODE_SESSION_ID": "claude-1",
                "COPILOT_AGENT_SESSION_ID": "copilot-1",
                "CODEX_THREAD_ID": "codex-1",
                "HARNESS_SESSION_ID": "generic-1",
            }),
        ),
        (
            "snake_case (the pij-rs CLI's idiom)",
            serde_json::json!({
                "pij_session_id": "pij-seat",
                "tmux_pane": "%77",
                "pij_parent_id": "pij-governor",
                "claude_code_session_id": "claude-1",
                "copilot_agent_session_id": "copilot-1",
                "codex_thread_id": "codex-1",
                "harness_session": "generic-1",
            }),
        ),
    ];

    for (spelling, body) in spellings {
        let caller: super::identity::CallerContext =
            serde_json::from_value(body).expect("caller context deserializes");
        // Asserted field by field, not as a count: a failure has to name WHICH
        // key this reader threw away, because "one of six is missing" is the
        // report that sends someone reading all six.
        for (key, read) in [
            ("session id", caller.session_id.is_some()),
            ("pane", caller.pane.is_some()),
            ("parent", caller.parent.is_some()),
            ("claude session", caller.claude_session.is_some()),
            ("copilot session", caller.copilot_session.is_some()),
            ("codex session", caller.codex_session.is_some()),
            ("generic harness session", caller.harness_session.is_some()),
        ] {
            assert!(
                read,
                "{spelling}: the reader DROPPED `{key}`. serde ignores what it does not \
                 recognise, so this is silent in production — the block arrives, deserializes, \
                 and names no seat."
            );
        }
    }
}

// ── F004: a tombstone is a POST-MORTEM, not an identity ────────────────────
//
// The pane resolver already selects only live rows. The ASSERTED-ID arm did not,
// and that asymmetry is the finding: the derive-don't-assert guard covers the
// case where two facts DISAGREE, not the case where the one fact is DEAD.
//
// The exploit is not hypothetical. Supersession tombstones a predecessor while
// RETAINING its process identity (`registration.rs`), so the dead row still names
// a pid that is genuinely alive — and `phonehome` re-observes it and answers
// `bound: true` for a seat nothing can address.

/// Tombstone a seat the way supersession does: dead row, process identity KEPT.
async fn tombstone_keeping_proc(registry: &FakeRegistry, seat: &str) {
    let mut row = registry
        .get(&pij_core::model::SeatId::from(seat))
        .await
        .expect("read seat")
        .expect("seat exists");
    assert!(
        row.proc.is_some(),
        "the point of this fixture is a DEAD row whose process is still alive"
    );
    row.tombstoned_at = Some(1_725_000_000_000);
    row.tombstone_reason = Some("superseded at a native session boundary".to_string());
    registry.put(row).await.expect("tombstone");
}

#[tokio::test]
async fn phonehome_refuses_a_tombstoned_seat_rather_than_confirming_a_corpse() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seat = live_seats(&world.registry).await[0].id.0.clone();
    tombstone_keeping_proc(&world.registry, &seat).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/phonehome?seat={seat}", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({ "argv": ["phonehome"] }))
        .send()
        .await
        .expect("phonehome");
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "the row is dead; that its pid is still alive makes the WRONG answer more \
         convincing, not more true"
    );
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains("superseded at a native session boundary"),
        "the refusal names the tombstone REASON, so the operator learns what happened to the \
         seat rather than that it is merely gone: {text}"
    );

    world.server.abort();
}

#[tokio::test]
async fn whoami_refuses_a_tombstoned_asserted_id() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;
    assert_eq!(
        adopt(world.addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seat = live_seats(&world.registry).await[0].id.0.clone();
    tombstone_keeping_proc(&world.registry, &seat).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/whoami", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({ "seat": seat }))
        .send()
        .await
        .expect("whoami");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    refusal_envelope(response).await;

    world.server.abort();
}

/// The report half of F004, asserted on the STORE.
///
/// Identity and reporting must agree with DELIVERY, which already refuses a dead
/// recipient. A card written for a tombstoned seat is a success receipt for
/// something nothing can act on.
#[tokio::test]
async fn a_report_against_a_tombstoned_seat_persists_no_card() {
    let registry = Arc::new(FakeRegistry::new());
    let spine = Arc::new(FakeSpine::new());
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        spine.clone(),
    )
    .await;
    services.tmux = Arc::new(
        FakeTmux::new()
            .with_pane(Pane {
                id: PANE.to_string(),
                session: "work".to_string(),
                window: "@1".to_string(),
                title: "claude".to_string(),
                cursor_x: None,
                cursor_y: None,
            })
            .with_pane_process(
                PANE,
                PaneProcess {
                    pid: PID,
                    cwd: FOLDER.to_string(),
                },
            ),
    );
    services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
        pid: PID,
        proc_start: PROC_START,
    }));
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    assert_eq!(
        adopt(addr, &["adopt", PANE, "--harness", "claude"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let seat = live_seats(&registry).await[0].id.0.clone();
    tombstone_keeping_proc(&registry, &seat).await;
    let before = spine.len();

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/report"))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "seat": seat,
            "argv": ["report", "now", "did a thing", "will do another"]
        }))
        .send()
        .await
        .expect("report");
    assert_ne!(response.status(), reqwest::StatusCode::OK);
    refusal_envelope(response).await;
    assert_eq!(
        spine.len(),
        before,
        "THE STORE, not the output: a refused report appends NOTHING to the spine"
    );

    server.abort();
}

// ── F005: the corpse-binding trap, closed on the rs side ───────────────────

/// `adopt` DERIVES its evidence. `register` accepts an asserted one. That split
/// is now the rule, and this is the test that holds it.
///
/// The paneless branch used to accept a caller-supplied `(pid, proc_start)` pair,
/// and it was right about what it DEMANDED — the pair, corroborated, no admission
/// without bind evidence. The defect was that the routed shim can satisfy it with
/// its OWN Node process: real evidence, corroborated for the instant the CLI
/// lives, and worthless the moment it exits. A later phonehome then reports
/// unbound or recycled for a seat that registered successfully.
///
/// This is the second of two independent refusals by design — the shim refuses
/// paneless `adopt` on the TS side too. A control this plan has already re-opened
/// once does not get to depend on a single guard.
#[tokio::test]
async fn adopt_refuses_a_paneless_claim_even_when_the_process_corroborates() {
    let registry = Arc::new(FakeRegistry::new());
    let world = world(registry.clone(), true).await;

    let response = reqwest::Client::new()
        .post(format!("http://{}/v1/adopt", world.addr))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["inbox", "register", "--harness", "claude"],
            // A pair the daemon CAN corroborate — this is the shim's own live
            // Node process, which is exactly the problem.
            "caller": { "cwd": "/abs/elsewhere", "pid": PID, "procStart": PROC_START }
        }))
        .send()
        .await
        .expect("paneless adopt");
    assert_ne!(
        response.status(),
        reqwest::StatusCode::OK,
        "corroborating a caller-supplied process proves the process exists NOW, not that it is \
         the seat's"
    );
    let envelope = refusal_envelope(response).await;
    let text = serde_json::to_string(&envelope).expect("envelope json");
    assert!(
        text.contains("register"),
        "the refusal names the verb that DOES take an asserted process identity: {text}"
    );
    assert!(
        live_seats(&world.registry).await.is_empty(),
        "nothing bound to a process that is about to exit"
    );

    world.server.abort();
}

/// F005 PART 3 — A CLAIMED PID IS INADMISSIBLE AS BIND EVIDENCE, pinned on the
/// path that still exists rather than as a side effect of the paneless refusal.
///
/// Refusing the paneless form closes today's bug. It does NOT state the rule,
/// and a rule nothing tests is one re-opened branch away from gone: whoever
/// designs paneless admission later (req-0015) will read the refusal as "this
/// form is unimplemented", not as "a claim is never evidence".
///
/// So the claim is made on the PANE path, where it can be ignored rather than
/// merely unreachable. The caller asserts a pid that is CORROBORABLE — the
/// liveness port knows it, so accepting it would look entirely reasonable and
/// this test would not fail for some incidental reason. The row must still carry
/// the pid tmux reported for the pane.
#[tokio::test]
async fn adopt_binds_the_pane_process_and_ignores_a_claimed_pid() {
    const CLAIMED_PID: u32 = 5150;
    const CLAIMED_START: u64 = PROC_START + 4242;

    let registry = Arc::new(FakeRegistry::new());
    let mut services = test_services(
        registry.clone(),
        Arc::new(FakeQueue::new(1_024).expect("valid fake queue policy")),
        Arc::new(FakeSpine::new()),
    )
    .await;
    services.tmux = Arc::new(
        FakeTmux::new()
            .with_pane(Pane {
                id: PANE.to_string(),
                session: "work".to_string(),
                window: "@1".to_string(),
                title: "claude".to_string(),
                cursor_x: None,
                cursor_y: None,
            })
            .with_pane_process(
                PANE,
                PaneProcess {
                    pid: PID,
                    cwd: FOLDER.to_string(),
                },
            ),
    );
    // BOTH processes are live. The claim is not rejected because it is false —
    // it is ignored because it is a CLAIM.
    services.liveness = Arc::new(
        FakeLiveness::new()
            .with_proc(ProcIdentity {
                pid: PID,
                proc_start: PROC_START,
            })
            .with_proc(ProcIdentity {
                pid: CLAIMED_PID,
                proc_start: CLAIMED_START,
            }),
    );
    let (addr, server) = spawn(router_with_config(services, config("key", &[]))).await;

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/adopt"))
        .bearer_auth("key")
        .json(&serde_json::json!({
            "argv": ["adopt", PANE, "--harness", "claude"],
            "caller": { "TMUX_PANE": PANE, "pid": CLAIMED_PID, "procStart": CLAIMED_START }
        }))
        .send()
        .await
        .expect("adopt");
    assert_eq!(response.status(), reqwest::StatusCode::OK);

    let row = &live_seats(&registry).await[0];
    assert_eq!(
        row.proc,
        Some(ProcIdentity {
            pid: PID,
            proc_start: PROC_START
        }),
        "the row binds the process TMUX reported for the pane. The caller's claim was live and \
         corroborable and is still not evidence — bind evidence is the anti-impersonation \
         control, and a control whose input the subject supplies is not a control."
    );
    assert_ne!(
        row.proc.expect("bound").pid,
        CLAIMED_PID,
        "a claimed pid never reaches the row"
    );

    server.abort();
}
