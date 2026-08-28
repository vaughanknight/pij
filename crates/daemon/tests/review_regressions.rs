//! Regressions for the seven review findings (2026-08-28, `pij-right-wasp`).
//!
//! One test per finding that had a testable observable, each named for the
//! failure rather than the fix — a regression test's job is to fail the way the
//! bug failed, so a future change that reintroduces it is stopped by a message
//! that describes the incident.

use std::path::PathBuf;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::error::PijError;
use pij_core::model::{Harness, SeatDescriptor, SeatId, Seq};
use pij_core::ports::{Registry, Spine};
use pij_store::{SqliteRegistry, SqliteSpine};
use pij_testkit::FreshStore;

fn state_dir() -> PathBuf {
    pij_testkit::fresh_dir("pij-rs-regression")
}

fn offline(bind: &str) -> Config {
    Config {
        bind_addr: bind.to_string(),
        ..Config::default()
    }
}

/// FINDING 1a — `OpenOptions::mode()` only applies to a file it CREATES, so a
/// restart into a state dir holding a 0644 `daemon.key` republished the key
/// world-readable.
#[cfg(unix)]
#[tokio::test]
async fn a_pre_existing_lax_key_file_is_replaced_not_reused() {
    use std::os::unix::fs::PermissionsExt;

    let dir = state_dir();
    let path = dir.join("daemon.key");
    std::fs::write(&path, "stale-and-world-readable").expect("plant a 0644 key");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).expect("chmod 644");

    let daemon = pij_daemon::boot(&offline("127.0.0.1:0"), dir.clone())
        .await
        .expect("boot");

    let mode = std::fs::metadata(&path).expect("stat").permissions().mode() & 0o777;
    assert_eq!(
        mode, 0o600,
        "the published key must be 0600 even when a laxer file was already there"
    );
    assert_ne!(
        std::fs::read_to_string(&path).expect("read"),
        "stale-and-world-readable",
        "the old key's CONTENT must be gone too"
    );

    daemon.shutdown().await.expect("shutdown");
    let _ = std::fs::remove_dir_all(dir);
}

/// FINDING 1b — the worst half: a second daemon wrote its key BEFORE binding, so
/// a boot that then lost the port race had already replaced the running daemon's
/// credential. A healthy daemon was bricked by starting a doomed one.
#[tokio::test]
async fn a_failed_boot_cannot_brick_the_running_daemon() {
    let dir = state_dir();
    let first = pij_daemon::boot(&offline("127.0.0.1:0"), dir.clone())
        .await
        .expect("first boot");
    let live_token = first.key.token.clone();

    // Same state dir, same port: the bind must fail.
    let error = pij_daemon::boot(&offline(&first.addr.to_string()), dir.clone())
        .await
        .expect_err("the second boot must fail to bind");
    assert!(
        error
            .to_string()
            .contains("another daemon may already hold it")
    );

    // The live daemon's key survived, byte for byte...
    assert_eq!(
        std::fs::read_to_string(dir.join("daemon.key")).expect("read"),
        live_token,
        "a failed boot must not touch the published key"
    );

    // ...and still authenticates.
    let status = reqwest::Client::new()
        .get(format!("http://{}/health", first.addr))
        .header(reqwest::header::AUTHORIZATION, first.key.header())
        .send()
        .await
        .expect("request")
        .status();
    assert_eq!(status, reqwest::StatusCode::OK);

    // No staging litter left behind either: a stray file that looks like a
    // credential is its own hazard.
    let strays: Vec<String> = std::fs::read_dir(&dir)
        .expect("read dir")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| name != "daemon.key")
        .collect();
    assert!(
        strays.is_empty(),
        "unexpected files in the state dir: {strays:?}"
    );

    first.shutdown().await.expect("shutdown");
    let _ = std::fs::remove_dir_all(dir);
}

/// FINDING 3 — the composition root wired two ports while `offline` was computed
/// from seven, so a config could report `offline=false` with nothing constructed.
#[tokio::test]
async fn the_composition_root_wires_every_port_it_claims() {
    let services = pij_daemon::build_services(&Config::default())
        .await
        .expect("all-fake services");

    // Each port is present and answers — a null wiring would panic or refuse.
    assert!(services.registry.get(&SeatId::from("nobody")).await.is_ok());
    assert!(services.spine.tail(None, Seq(0)).await.is_ok());
    assert!(services.queue.claim(&[], "w").await.is_ok());
    assert!(services.tmux.list_panes().await.is_ok());
    assert!(services.liveness.proc_start(1).await.is_ok());
    assert_eq!(services.harness.kind(), Harness::Pi);
    assert_eq!(services.transport.name(), "fake");
    assert!(services.offline);
}

/// FINDING 3b — asking for a real adapter that has not been built must REFUSE,
/// naming the unit that will ship it. Silently handing back a fake would make
/// `offline` a lie in the other direction.
#[tokio::test]
async fn selecting_an_unbuilt_real_adapter_refuses_and_names_the_wave() {
    for (label, adapters, expected) in [
        (
            "transport",
            Adapters {
                transport: AdapterChoice::Real,
                ..Adapters::default()
            },
            "u-uds",
        ),
        (
            "tmux",
            Adapters {
                tmux: AdapterChoice::Real,
                ..Adapters::default()
            },
            "u-tmux",
        ),
        (
            "harness",
            Adapters {
                harness: AdapterChoice::Real,
                ..Adapters::default()
            },
            "u-harness",
        ),
        (
            "liveness",
            Adapters {
                liveness: AdapterChoice::Real,
                ..Adapters::default()
            },
            "u-liveness",
        ),
    ] {
        let config = Config {
            adapters,
            ..Config::default()
        };
        // `Services` holds trait objects and is deliberately not `Debug`, so the
        // error is matched rather than unwrapped through `expect_err`.
        let message = match pij_daemon::build_services(&config).await {
            Err(error) => error.to_string(),
            Ok(_) => panic!("{label}: an unbuilt real adapter must refuse, not hand back a fake"),
        };
        assert!(
            message.contains(expected) && message.contains("does not exist yet"),
            "the {label} refusal must name the unit that will ship it: {message}"
        );
    }
}

/// FINDING 5 — `require_current_schema` existed but nothing called it, so the
/// documented "every db-touching command checks" was true only of tests. A schema
/// can change under a live pool: another binary migrating the same file.
#[tokio::test]
async fn a_schema_that_changes_under_a_live_pool_stops_the_next_operation() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());

    // Healthy first, so the refusal below cannot be blamed on a broken store.
    registry
        .put(SeatDescriptor::new("pij-before", Harness::Pi, "/abs"))
        .await
        .expect("a current schema accepts writes");

    sqlx::query("PRAGMA user_version = 99")
        .execute(&pool)
        .await
        .expect("another binary migrates the same file");

    for (label, result) in [
        ("get", registry.get(&SeatId::from("pij-before")).await.err()),
        (
            "put",
            registry
                .put(SeatDescriptor::new("pij-after", Harness::Pi, "/abs"))
                .await
                .err(),
        ),
        (
            "tombstone",
            registry
                .tombstone(&SeatId::from("pij-before"), "x")
                .await
                .err(),
        ),
        (
            "spine append",
            SqliteSpine::new(pool.clone())
                .append(pij_core::model::Event {
                    v: 1,
                    at: 0,
                    kind: "report".to_string(),
                    seat: None,
                    payload: "{}".to_string(),
                })
                .await
                .err(),
        ),
    ] {
        match result {
            Some(PijError::StoreSchemaStale { found, .. }) => assert_eq!(found, 99),
            other => panic!("{label} must refuse a changed schema, got {other:?}"),
        }
    }
}

/// FINDING 6 — the event and the row were separate autocommit statements, so a
/// tombstone that refused (no such seat) had already committed a spine event
/// claiming it happened.
#[tokio::test]
async fn a_refused_tombstone_leaves_no_trace_in_the_spine() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    let spine = SqliteSpine::new(pool.clone());

    let before = spine.tail(None, Seq(0)).await.expect("tail").len();

    let error = registry
        .tombstone(&SeatId::from("pij-never-registered"), "no such seat")
        .await
        .expect_err("tombstoning an absent seat must fail");
    assert!(matches!(error, PijError::NoRegistryEntry { .. }));

    let after = spine.tail(None, Seq(0)).await.expect("tail");
    assert_eq!(
        after.len(),
        before,
        "a refused mutation must not leave a spine event behind: {after:?}"
    );
    assert!(
        !after.iter().any(|event| event.kind == "seat.tombstone"),
        "the phantom tombstone is exactly the finding: {after:?}"
    );
}

/// FINDING 6b — the same guarantee for the success path: `put` writes the event
/// and the row as ONE fact.
#[tokio::test]
async fn a_successful_put_writes_its_event_and_its_row_together() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    let spine = SqliteSpine::new(pool);

    let seat = SeatDescriptor::new("pij-atomic", Harness::Pi, "/abs");
    let seq = registry.put(seat.clone()).await.expect("put");

    assert!(registry.get(&seat.id).await.expect("get").is_some());
    let events = spine.tail(None, Seq(0)).await.expect("tail");
    assert!(
        events.iter().any(|event| event.kind == "seat.put"),
        "the write's event must be readable: {events:?}"
    );
    assert!(seq > Seq(0));
}
