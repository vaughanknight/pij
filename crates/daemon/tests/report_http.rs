//! u-report's RED WITNESS and its shape-parity suite (plan 114, ac-1144).
//!
//! The witness is deliberately NOT a compile error. Every test here compiles and
//! runs against the shipped `/v1/report` surface; before the handler existed they
//! failed because axum answered an absent route, which is a behavioural red at
//! the same altitude as the claim ac-1142 makes: *a card written via rs is
//! readable via rs*.
//!
//! Two properties of the surrounding system shape every test below, and both
//! were verified on tree rather than assumed:
//!
//! 1. `require_bearer` layers the WHOLE router (`http/mod.rs:214`), so auth runs
//!    BEFORE the route match. A keyless probe of `/v1/report` answers 401
//!    identically whether or not the handler exists — so a missing key and a
//!    missing route are indistinguishable from the client. Every test here sends
//!    the real key, and one test pins that a keyless call is 401 and therefore
//!    proves nothing about route presence.
//! 2. Wave 1's shim reads an empty-bodied 404/405 as ROUTE ABSENCE and falls back
//!    to legacy (`core/generation-routing.ts`, `classifyRsResponse`). A refusal of
//!    ours wearing that shape would become a SILENT RE-HOMING of the seat. So
//!    every refusal this handler emits carries a decodable envelope, and
//!    `refusals_are_never_classifiable_as_route_absence` pins it.

use std::net::SocketAddr;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::model::{Envelope, Harness, SeatDescriptor, SeatId, SemanticState, Seq};
use pij_core::report::{CARD_EVENT_KIND, CardRecord, ReportConfig, ReportService};
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_testkit::FreshStore;

const KEY: &str = "test-local-key";
const SEAT: &str = "pij-report-witness";

/// A daemon on a fresh store with one registered seat, served over real HTTP.
///
/// Real adapters for registry and spine — the claim is DURABILITY ("cards are
/// durable and readable back"), and a fake spine would prove the handler calls a
/// method, not that a card survives. tmux and harness stay fake: a real tmux
/// adapter in a test taps the operator's live panes.
async fn daemon() -> (SocketAddr, tokio::task::JoinHandle<()>, FreshStore, Config) {
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
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("services");
    services
        .registry
        .put(SeatDescriptor::new(SEAT, Harness::Claude, "/abs/tree"))
        .await
        .expect("seed the reporting seat");
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
    (addr, server, store, config)
}

/// POST one report exactly as the shim does: `{ "seat": …, "argv": [ … ] }`.
///
/// `argv` is `process.argv.slice(2)` verbatim — the shim passes what the caller
/// typed, untouched (`adapters/generation-router.ts`, `callRs`). `seat` is the
/// separate field this handler requires, because argv carries the message and
/// omits its author: `report now` is FIRST-PERSON and its subject is never typed.
async fn post_report(addr: SocketAddr, seat: Option<&str>, argv: &[&str]) -> reqwest::Response {
    let mut body = serde_json::json!({ "argv": argv });
    if let Some(seat) = seat {
        body["seat"] = serde_json::Value::String(seat.to_string());
    }
    reqwest::Client::new()
        .post(format!("http://{addr}/v1/report"))
        .bearer_auth(KEY)
        .json(&body)
        .send()
        .await
        .expect("post /v1/report")
}

/// Read the card back through core's own read path, from the store the daemon
/// actually wrote to — reopened, not the handle the handler held.
async fn read_card_back(config: &Config) -> Option<(String, String, bool)> {
    let services = pij_daemon::build_services(
        config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen services");
    let reports = ReportService::new(
        services.registry.as_ref(),
        services.spine.as_ref(),
        || 0,
        ReportConfig::default(),
    );
    reports
        .card(&SeatId::from(SEAT))
        .await
        .expect("card read")
        .map(|status| (status.card.did, status.card.next, status.stale))
}

// ─── THE RED WITNESS ────────────────────────────────────────────────────────

/// ac-1142's core claim, at the altitude the AC states it: a card written
/// THROUGH rs is readable back FROM rs, durably.
///
/// Before the handler existed this failed on the first assertion — axum answered
/// 404 for an unrouted path — which is a behavioural red, not a compile error.
#[tokio::test]
async fn a_card_written_via_rs_is_readable_via_rs() {
    let (addr, server, _store, config) = daemon().await;

    let response = post_report(
        addr,
        Some(SEAT),
        &["report", "now", "shipped x", "review y"],
    )
    .await;
    assert_eq!(
        response.status(),
        reqwest::StatusCode::OK,
        "POST /v1/report must be served by rs"
    );
    let envelope: Envelope<serde_json::Value> = response.json().await.expect("envelope");
    assert!(envelope.ok, "a successful report reports success");

    // Reopened from disk: proves DURABILITY, not that a method was called.
    assert_eq!(
        read_card_back(&config).await,
        Some(("shipped x".to_string(), "review y".to_string(), false)),
        "the card must survive the write and read back with its own freshness"
    );

    server.abort();
}

// ─── SHAPE PARITY, each row citing the TS source it was derived from ────────

/// TS `normalizeReportText` caps did/next at 280 chars AFTER whitespace
/// collapsing — `.pi/extensions/pij/core/cli.ts:815` (`REPORT_TEXT_MAX_LENGTH`)
/// and `:824`. rs's own `CARD_LIMIT` (`crates/core/src/model.rs:293`) is the same
/// 280, and this test cites the CONSTANT rather than the literal, so a change to
/// either side breaks here instead of drifting silently.
#[tokio::test]
async fn did_and_next_are_capped_at_the_limit_core_defines() {
    let (addr, server, _store, config) = daemon().await;

    let at_limit = "a".repeat(pij_core::model::CARD_LIMIT);
    assert_eq!(
        post_report(addr, Some(SEAT), &["report", "now", &at_limit, "next"])
            .await
            .status(),
        reqwest::StatusCode::OK,
        "exactly at the limit is accepted — the boundary is inclusive on both sides"
    );

    let over_limit = "a".repeat(pij_core::model::CARD_LIMIT + 1);
    let refusal = post_report(addr, Some(SEAT), &["report", "now", &over_limit, "next"]).await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let envelope: Envelope<serde_json::Value> = refusal.json().await.expect("envelope");
    assert!(!envelope.ok);
    let meta = envelope.meta.unwrap_or_default();
    assert!(
        meta.contains("280"),
        "the refusal must NAME the limit it enforced, not just refuse: {meta}"
    );

    // The over-limit attempt wrote nothing.
    assert_eq!(
        read_card_back(&config).await.map(|card| card.0),
        Some(at_limit),
        "a refused report must not overwrite the last good card"
    );

    server.abort();
}

/// Whitespace is COLLAPSED before the limit is applied — TS `core/cli.ts:821`
/// (`input.trim().replace(/\s+/g, " ")`), and rs `collapse_whitespace`
/// (`crates/core/src/report.rs`). A caller whose text is only long because of
/// runs of spaces is not refused by either generation.
#[tokio::test]
async fn whitespace_collapses_before_the_limit_is_applied() {
    let (addr, server, _store, config) = daemon().await;

    let padded = format!("  did{}text  ", " ".repeat(400));
    assert_eq!(
        post_report(
            addr,
            Some(SEAT),
            &["report", "now", &padded, " next  value "]
        )
        .await
        .status(),
        reqwest::StatusCode::OK,
        "400 spaces collapse to one; the payload is well under the limit"
    );
    assert_eq!(
        read_card_back(&config).await,
        Some(("did text".to_string(), "next value".to_string(), false))
    );

    server.abort();
}

/// TS refuses an EMPTY did/next by name — `core/cli.ts:822`, "report did must not
/// be empty". rs core deliberately PERMITS an empty card (`report.rs`: "Empty is
/// deliberately valid: a present empty card and no card are different facts").
///
/// Both are right at their own altitude, so the divergence is settled at the
/// BOUNDARY, not by overruling either one: the caller-facing shape matches TS,
/// and core's deliberate choice is left standing for any in-process caller.
#[tokio::test]
async fn an_empty_card_field_is_refused_by_name_as_ts_refuses_it() {
    let (addr, server, _store, _config) = daemon().await;

    for argv in [
        ["report", "now", "", "next"],
        ["report", "now", "did", "   "],
    ] {
        let refusal = post_report(addr, Some(SEAT), &argv).await;
        assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
        let envelope: Envelope<serde_json::Value> = refusal.json().await.expect("envelope");
        assert!(
            envelope
                .meta
                .unwrap_or_default()
                .contains("must not be empty"),
            "the refusal must match the wording a caller already knows"
        );
    }

    server.abort();
}

/// TS refuses an embedded newline by name — `core/cli.ts:819`, "report did must
/// be one line" — where rs's `collapse_whitespace` would silently fold it into a
/// space. Silently differing is the outcome ac-1144 forbids most explicitly.
#[tokio::test]
async fn an_embedded_newline_is_refused_rather_than_silently_collapsed() {
    let (addr, server, _store, _config) = daemon().await;

    let refusal = post_report(
        addr,
        Some(SEAT),
        &["report", "now", "line one\nline two", "next"],
    )
    .await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let envelope: Envelope<serde_json::Value> = refusal.json().await.expect("envelope");
    assert!(
        envelope
            .meta
            .unwrap_or_default()
            .contains("must be one line"),
        "collapsing a newline into a space would change the caller's text without saying so"
    );

    server.abort();
}

/// `report blocked "<text>"` and `report question "<text>"` set the semantic
/// state AND retain their note — TS `core/cli.ts:1689-1706`, rs
/// `ReportService::blocked`/`question`.
#[tokio::test]
async fn blocked_and_question_set_the_state_and_retain_the_note() {
    let (addr, server, _store, config) = daemon().await;

    for (leaf, expected) in [
        ("blocked", SemanticState::Blocked),
        ("question", SemanticState::Question),
    ] {
        assert_eq!(
            post_report(addr, Some(SEAT), &["report", leaf, "waiting on the ruling"])
                .await
                .status(),
            reqwest::StatusCode::OK,
        );
        let services = pij_daemon::build_services(
            &config,
            std::path::Path::new("/tmp/pij-test-pane-signals-report"),
        )
        .await
        .expect("reopen");
        let descriptor = services
            .registry
            .get(&SeatId::from(SEAT))
            .await
            .expect("registry read")
            .expect("seat");
        assert_eq!(descriptor.semantic_state, Some(expected));
        let reports = ReportService::new(
            services.registry.as_ref(),
            services.spine.as_ref(),
            || 0,
            ReportConfig::default(),
        );
        let record = reports
            .latest_state_record(&SeatId::from(SEAT))
            .await
            .expect("state record")
            .expect("a record");
        assert_eq!(record.note.as_deref(), Some("waiting on the ruling"));
    }

    server.abort();
}

/// TS caps the blocked/question note at 200 — `core/cli.ts:816`
/// (`REPORT_NOTE_MAX_LENGTH`) and `:841` — a DIFFERENT limit from the 280 that
/// governs did/next. rs core applies no note limit at all, so the parity is
/// enforced here. The two limits differ, and a test that only exercised 280
/// would pass with the note limit deleted.
#[tokio::test]
async fn the_note_limit_is_200_and_is_not_the_card_limit() {
    let (addr, server, _store, _config) = daemon().await;

    let note = "n".repeat(201);
    let refusal = post_report(addr, Some(SEAT), &["report", "blocked", &note]).await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let meta = refusal
        .json::<Envelope<serde_json::Value>>()
        .await
        .expect("envelope")
        .meta
        .unwrap_or_default();
    assert!(
        meta.contains("200"),
        "the refusal must name the note limit: {meta}"
    );

    // The discriminating arm: 201 chars is under the 280 CARD limit, so a handler
    // that reused the card limit for notes would accept this and pass every test
    // above. Only this one separates the two.
    assert!(note.chars().count() < pij_core::model::CARD_LIMIT);

    server.abort();
}

/// `report clear` removes the declaration — TS `core/cli.ts:1746`, rs
/// `ReportService::clear`.
#[tokio::test]
async fn clear_removes_the_declared_state() {
    let (addr, server, _store, config) = daemon().await;

    post_report(addr, Some(SEAT), &["report", "blocked", "on a peer"]).await;
    assert_eq!(
        post_report(addr, Some(SEAT), &["report", "clear"])
            .await
            .status(),
        reqwest::StatusCode::OK
    );
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen");
    assert_eq!(
        services
            .registry
            .get(&SeatId::from(SEAT))
            .await
            .expect("read")
            .expect("seat")
            .semantic_state,
        None
    );

    server.abort();
}

/// `report state <state>` accepts every word BOTH generations share — TS
/// `SEMANTIC_STATES` (`core/types.ts:110`) intersected with rs `SemanticState`
/// (`crates/core/src/model.rs:104`).
#[tokio::test]
async fn report_state_accepts_every_word_the_two_generations_share() {
    let (addr, server, _store, config) = daemon().await;

    for (word, expected) in [
        ("ready", SemanticState::Ready),
        ("waiting", SemanticState::Waiting),
        ("hold", SemanticState::Hold),
        ("blocked", SemanticState::Blocked),
        ("question", SemanticState::Question),
        ("done", SemanticState::Done),
    ] {
        assert_eq!(
            post_report(addr, Some(SEAT), &["report", "state", word])
                .await
                .status(),
            reqwest::StatusCode::OK,
            "'{word}' is in both vocabularies and must be honoured"
        );
        let services = pij_daemon::build_services(
            &config,
            std::path::Path::new("/tmp/pij-test-pane-signals-report"),
        )
        .await
        .expect("reopen");
        assert_eq!(
            services
                .registry
                .get(&SeatId::from(SEAT))
                .await
                .expect("read")
                .expect("seat")
                .semantic_state,
            Some(expected)
        );
    }

    server.abort();
}

// ─── REFUSAL BY NAME — the shapes rs cannot honour ──────────────────────────

/// `failed` and `cancelled` are in TS's ruled vocabulary (`core/types.ts:110`,
/// commented "never extend, rename, or reorder") and have NO rs counterpart
/// (`crates/core/src/model.rs:104` carries six variants, not eight).
///
/// Both had an available near-fit — `failed`→`Done`, `cancelled`→`Done` — and
/// both would have type-checked. Mapping either is a lie the caller cannot see,
/// which is the single outcome ac-1144 names as worst. So they refuse BY NAME,
/// and the refusal states the vocabulary rs actually has.
#[tokio::test]
async fn states_rs_does_not_have_refuse_by_name_instead_of_mapping_to_a_near_fit() {
    let (addr, server, _store, config) = daemon().await;

    post_report(addr, Some(SEAT), &["report", "state", "ready"]).await;

    for word in ["failed", "cancelled"] {
        let refusal = post_report(addr, Some(SEAT), &["report", "state", word]).await;
        assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
        let meta = refusal
            .json::<Envelope<serde_json::Value>>()
            .await
            .expect("envelope")
            .meta
            .unwrap_or_default();
        assert!(
            meta.contains(word),
            "the refusal must name the state it cannot honour: {meta}"
        );
        assert!(
            meta.contains("ready|waiting|hold|blocked|question|done"),
            "and it must state the vocabulary rs does have: {meta}"
        );
    }

    // The discriminating arm: a near-fit mapping would have left the seat `Done`.
    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen");
    assert_eq!(
        services
            .registry
            .get(&SeatId::from(SEAT))
            .await
            .expect("read")
            .expect("seat")
            .semantic_state,
        Some(SemanticState::Ready),
        "a refused state must leave the previous declaration untouched"
    );

    server.abort();
}

/// `--assignment`, `--refs` and `--project` address the assignment/project
/// objects TS's report family is built on (`core/cli.ts:887-892`). rs has no
/// assignment model anywhere in `crates/` — there is no object to honour them
/// against, so each refuses by name rather than being accepted and ignored.
///
/// Accepted-and-ignored is the specific failure this pins: every one of these
/// flags could have been dropped on the floor with the report still succeeding,
/// and the caller would never learn their scoping was discarded.
#[tokio::test]
async fn flags_backed_by_objects_rs_lacks_refuse_by_name() {
    let (addr, server, _store, _config) = daemon().await;

    for argv in [
        vec!["report", "state", "done", "--assignment", "as-1"],
        vec!["report", "blocked", "text", "--assignment", "as-1"],
        vec!["report", "state", "done", "--refs", "a,b"],
        vec!["report", "now", "did", "next", "--project", "some-slug"],
        vec!["report", "now", "did", "next", "--for", "pij-other"],
    ] {
        let flag = argv
            .iter()
            .find(|token| token.starts_with("--"))
            .expect("a flag under test");
        let refusal = post_report(addr, Some(SEAT), &argv).await;
        assert_eq!(
            refusal.status(),
            reqwest::StatusCode::BAD_REQUEST,
            "{flag} must refuse, never be silently dropped"
        );
        let meta = refusal
            .json::<Envelope<serde_json::Value>>()
            .await
            .expect("envelope")
            .meta
            .unwrap_or_default();
        assert!(
            meta.contains(flag),
            "the refusal must name the flag it cannot honour: {meta}"
        );
    }

    server.abort();
}

/// `report verify <node>` stamps `verifiedBy` on an assignment record
/// (`core/cli.ts:1733`). rs has no assignment record, so the verb has nothing to
/// stamp. It refuses by name — and, critically, NOT with the bare 404 that would
/// make the shim fall back to legacy and write a supervisory act into the other
/// store.
#[tokio::test]
async fn verify_refuses_by_name_because_rs_has_no_assignment_to_verify() {
    let (addr, server, _store, _config) = daemon().await;

    let refusal = post_report(addr, Some(SEAT), &["report", "verify", "nd-1"]).await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let meta = refusal
        .json::<Envelope<serde_json::Value>>()
        .await
        .expect("envelope")
        .meta
        .unwrap_or_default();
    assert!(meta.contains("verify"), "{meta}");

    server.abort();
}

/// A seat rs does not hold is refused, never written for.
///
/// TS does exactly this — `resolveReportingSelf` answers `E-NOID` "reporting seat
/// 'x' is not registered" (`core/cli.ts:1997`) — and here it is also the
/// split-brain guard: `ReportService::now` appends to the spine WITHOUT
/// consulting the registry, so without this check a card for a legacy-resident
/// seat would land in the rs spine under a seat id rs has never heard of, with
/// every surface reporting success.
#[tokio::test]
async fn a_seat_rs_does_not_hold_is_refused_and_no_card_is_written() {
    let (addr, server, _store, config) = daemon().await;

    let refusal = post_report(
        addr,
        Some("pij-lives-in-legacy"),
        &["report", "now", "a", "b"],
    )
    .await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let meta = refusal
        .json::<Envelope<serde_json::Value>>()
        .await
        .expect("envelope")
        .meta
        .unwrap_or_default();
    assert!(
        meta.contains("pij-lives-in-legacy"),
        "the refusal must name the seat it does not hold: {meta}"
    );

    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen");
    let events = services
        .spine
        .tail(Some(&SeatId::from("pij-lives-in-legacy")), Seq(0))
        .await
        .expect("tail");
    assert!(
        events.iter().all(|event| event.kind != CARD_EVENT_KIND),
        "no card may be written for a seat rs does not hold"
    );

    server.abort();
}

/// argv carries the message and omits its author, so the seat is a separate
/// field — and its ABSENCE is a named refusal rather than a guess.
#[tokio::test]
async fn a_report_with_no_seat_is_refused_by_name_never_attributed_by_guess() {
    let (addr, server, _store, _config) = daemon().await;

    let refusal = post_report(addr, None, &["report", "now", "a", "b"]).await;
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);
    let meta = refusal
        .json::<Envelope<serde_json::Value>>()
        .await
        .expect("envelope")
        .meta
        .unwrap_or_default();
    assert!(meta.contains("seat"), "{meta}");

    server.abort();
}

// ─── THE TWO SYSTEM PROPERTIES, PINNED ──────────────────────────────────────

/// THE BINDING RULE: no refusal of ours may wear route-absence's clothes.
///
/// Wave 1's shim classifies "404 or 405 with a body that does not decode as a pij
/// envelope" as `legacy-rs-not-implemented` and falls back to legacy. A refusal
/// shaped like that would silently re-home the seat. This replays that exact
/// classification over every refusal the handler can emit.
///
/// It is non-vacuous by construction: it asserts the two facts the shim actually
/// branches on — the status is not a bare 404/405, AND the body decodes as an
/// envelope carrying `ok: false` — so a handler that started answering a bare 404
/// for any of these fails here and only here.
#[tokio::test]
async fn refusals_are_never_classifiable_as_route_absence() {
    let (addr, server, _store, _config) = daemon().await;

    let refusals: Vec<Vec<&str>> = vec![
        vec!["report", "verify", "nd-1"],
        vec!["report", "state", "failed"],
        vec!["report", "state", "cancelled"],
        vec!["report", "now", "did", "next", "--project", "slug"],
        vec!["report", "now", "", "next"],
        vec!["report", "now", "did\nnext", "x"],
        vec!["report", "state", "not-a-state"],
        vec!["report", "now", "only-one-positional"],
        vec!["report", "nonsense"],
    ];

    for argv in refusals {
        let response = post_report(addr, Some(SEAT), &argv).await;
        let status = response.status();
        let body = response.text().await.expect("body");

        // The shim's test 1: an empty-bodied 404/405 means "route absent".
        let looks_absent = (status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED)
            && serde_json::from_str::<Envelope<serde_json::Value>>(&body).is_err();
        assert!(
            !looks_absent,
            "{argv:?} refused in a shape the shim reads as route-absence — it would fall back to legacy and re-home the seat"
        );

        // The shim's test 2: the body must be something an rs handler wrote.
        let envelope: Envelope<serde_json::Value> =
            serde_json::from_str(&body).unwrap_or_else(|error| {
                panic!("{argv:?} refusal body must decode as a pij envelope ({error}): {body}")
            });
        assert!(!envelope.ok, "{argv:?} must refuse, not succeed");
        assert!(
            envelope.error.is_some(),
            "{argv:?} refusal must carry a branchable ErrorKind, not prose alone"
        );
    }

    server.abort();
}

/// Auth runs ABOVE the route match (`http/mod.rs:214`), so a keyless probe
/// answers 401 whether or not `/v1/report` exists.
///
/// Pinned because it is the trap this unit was warned about and the reason no
/// test here concludes anything from a keyless call: during development a 401 on
/// a brand-new endpoint reads exactly like a missing handler.
#[tokio::test]
async fn a_keyless_probe_is_401_and_therefore_proves_nothing_about_the_route() {
    let (addr, server, _store, _config) = daemon().await;

    let keyless = reqwest::Client::new()
        .post(format!("http://{addr}/v1/report"))
        .json(&serde_json::json!({ "seat": SEAT, "argv": ["report", "now", "a", "b"] }))
        .send()
        .await
        .expect("keyless post");
    assert_eq!(keyless.status(), reqwest::StatusCode::UNAUTHORIZED);

    // The same 401 answers a path that certainly does not exist — which is the
    // whole point: status alone cannot tell a missing key from a missing route.
    let absent = reqwest::Client::new()
        .post(format!("http://{addr}/v1/definitely-not-a-route"))
        .send()
        .await
        .expect("keyless post to nothing");
    assert_eq!(absent.status(), reqwest::StatusCode::UNAUTHORIZED);

    server.abort();
}

/// The staleness threshold core already specifies is the one a card is judged by
/// — `ReportConfig::stale_after_ms` defaults to 10 minutes
/// (`crates/core/src/report.rs`), and equality with the threshold is FRESH.
///
/// Written through the HTTP surface and judged by core's reader, so the daemon
/// cannot acquire a second opinion about staleness.
#[tokio::test]
async fn staleness_is_judged_by_the_threshold_core_specifies() {
    let (addr, server, _store, config) = daemon().await;

    post_report(addr, Some(SEAT), &["report", "now", "did", "next"]).await;

    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen");
    let written_at = services
        .spine
        .tail(Some(&SeatId::from(SEAT)), Seq(0))
        .await
        .expect("tail")
        .into_iter()
        .rev()
        .find(|event| event.kind == CARD_EVENT_KIND)
        .expect("a card event")
        .at;

    let threshold = ReportConfig::default().stale_after_ms;
    for (clock, expected_stale, why) in [
        (
            written_at + threshold,
            false,
            "equality with the threshold is fresh",
        ),
        (written_at + threshold + 1, true, "strictly older is stale"),
    ] {
        let reports = ReportService::new(
            services.registry.as_ref(),
            services.spine.as_ref(),
            move || clock,
            ReportConfig::default(),
        );
        let status = reports
            .card(&SeatId::from(SEAT))
            .await
            .expect("card")
            .expect("a card");
        assert_eq!(status.stale, expected_stale, "{why}");
    }

    server.abort();
}

/// The card the handler wrote carries the fields core defines, decodable as
/// core's own `CardRecord` — the durable payload, not a shape the handler
/// invented beside it.
#[tokio::test]
async fn the_durable_payload_is_cores_card_record() {
    let (addr, server, _store, config) = daemon().await;

    post_report(
        addr,
        Some(SEAT),
        &["report", "now", "did text", "next text"],
    )
    .await;

    let services = pij_daemon::build_services(
        &config,
        std::path::Path::new("/tmp/pij-test-pane-signals-report"),
    )
    .await
    .expect("reopen");
    let event = services
        .spine
        .tail(Some(&SeatId::from(SEAT)), Seq(0))
        .await
        .expect("tail")
        .into_iter()
        .rev()
        .find(|event| event.kind == CARD_EVENT_KIND)
        .expect("a card event");
    let record: CardRecord = serde_json::from_str(&event.payload).expect("core's CardRecord");
    assert_eq!(record.did, "did text");
    assert_eq!(record.next, "next text");
    assert_eq!(event.seat, Some(SeatId::from(SEAT)));

    server.abort();
}

/// The seat may arrive as the forwarded CALLER CONTEXT instead of an explicit
/// field — the shape the shim sends, since `report` is first-person and its
/// subject is never typed, so the caller forwards what only it can see.
///
/// Both spellings are exercised because the key crosses a runtime boundary by
/// NAME: TypeScript writes it, Rust reads it, and nothing but agreement between
/// two files keeps them matching. A rename on either side would present as a
/// green suite and a fleet that cannot report.
#[tokio::test]
async fn the_seat_may_arrive_as_forwarded_caller_context() {
    let (addr, server, _store, config) = daemon().await;

    for (key, did) in [
        ("PIJ_SESSION_ID", "via env spelling"),
        ("pij_session_id", "via rust spelling"),
    ] {
        let response = reqwest::Client::new()
            .post(format!("http://{addr}/v1/report"))
            .bearer_auth(KEY)
            .json(&serde_json::json!({
                "caller": { key: SEAT },
                "argv": ["report", "now", did, "next"],
            }))
            .send()
            .await
            .expect("post");
        assert_eq!(
            response.status(),
            reqwest::StatusCode::OK,
            "spelling '{key}'"
        );
        assert_eq!(
            read_card_back(&config).await.map(|card| card.0),
            Some(did.to_string()),
            "the card must be attributed to the forwarded seat"
        );
    }

    // A forwarded seat is a CLAIM, not an identity: one rs does not hold is
    // refused exactly as an explicit one is.
    let refusal = reqwest::Client::new()
        .post(format!("http://{addr}/v1/report"))
        .bearer_auth(KEY)
        .json(&serde_json::json!({
            "caller": { "PIJ_SESSION_ID": "pij-not-in-this-store" },
            "argv": ["report", "now", "a", "b"],
        }))
        .send()
        .await
        .expect("post");
    assert_eq!(refusal.status(), reqwest::StatusCode::BAD_REQUEST);

    server.abort();
}

/// The answer carries the human sentence the TypeScript CLI prints today, so the
/// routed path can render one without re-deriving the wording from fields — a
/// second copy of the sentence on the far side of the wire is a second thing to
/// drift.
#[tokio::test]
async fn the_receipt_carries_the_line_the_typescript_cli_prints() {
    let (addr, server, _store, _config) = daemon().await;

    let payload: Envelope<serde_json::Value> = post_report(
        addr,
        Some(SEAT),
        &["report", "now", "did text", "next text"],
    )
    .await
    .json()
    .await
    .expect("envelope");
    let line = payload.data.expect("data")["line"]
        .as_str()
        .expect("a line")
        .to_string();
    assert!(line.starts_with(&format!("reported by {SEAT}: ")), "{line}");
    assert!(
        line.contains("\"did text\" \u{2192} \"next text\""),
        "{line}"
    );
    assert!(line.contains("(spine "), "{line}");

    server.abort();
}
