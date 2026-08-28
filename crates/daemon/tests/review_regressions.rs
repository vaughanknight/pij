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

/// ROUND 2, FINDING 1 — staging was unique per PROCESS, not per ATTEMPT. Two boots
/// inside one process shared `daemon.key.staging.<pid>`, and the second one's
/// pre-delete-then-recreate meant an attempt could publish the OTHER attempt's
/// bytes — then start holding a credential nobody has.
#[test]
fn two_staged_keys_in_one_process_never_share_a_file() {
    let dir = state_dir();

    let first = pij_daemon::auth::stage_key(&dir).expect("stage first");
    let second = pij_daemon::auth::stage_key(&dir).expect("stage second");
    assert_ne!(
        first.token(),
        second.token(),
        "two attempts must generate different secrets"
    );

    // Publish the SECOND while the first is still staged: the bytes on disk must
    // be the ones its own `BootKey` reports.
    let expected = second.token().to_string();
    let published = second.publish().expect("publish");
    assert_eq!(published.token, expected);
    assert_eq!(
        std::fs::read_to_string(&published.path).expect("read"),
        expected,
        "an attempt must publish ITS OWN bytes, never another attempt's"
    );

    // Then the first, which must overwrite cleanly with its own.
    let expected_first = first.token().to_string();
    let published_first = first.publish().expect("publish");
    assert_eq!(
        std::fs::read_to_string(&published_first.path).expect("read"),
        expected_first
    );

    // No staging litter survives either attempt.
    let strays: Vec<String> = std::fs::read_dir(&dir)
        .expect("read dir")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|name| name.contains("staging"))
        .collect();
    assert!(strays.is_empty(), "staging files left behind: {strays:?}");

    let _ = std::fs::remove_dir_all(dir);
}

/// ROUND 2, FINDING 1b — a staged key that is never published leaves nothing
/// behind, so a failed boot cannot litter the state dir with something that looks
/// like a credential.
#[test]
fn an_unpublished_staged_key_removes_itself() {
    let dir = state_dir();
    {
        let _staged = pij_daemon::auth::stage_key(&dir).expect("stage");
        assert_eq!(
            std::fs::read_dir(&dir).expect("read dir").count(),
            1,
            "the staging file exists while the attempt is alive"
        );
    }
    assert_eq!(
        std::fs::read_dir(&dir).expect("read dir").count(),
        0,
        "dropping an unpublished attempt must remove its staging file"
    );
    let _ = std::fs::remove_dir_all(dir);
}

/// ROUND 2, FINDING 2 — the schema guard covered Registry and Spine but not
/// `SqliteQueue::live_len`, so "every public database operation checks" was true
/// of every operation I remembered. This test enumerates EVERY public database
/// operation across all three ports, so the next one added is covered or this
/// fails.
#[tokio::test]
async fn every_public_store_operation_rejects_a_stale_schema() {
    use pij_core::model::{Job, JobId, Outcome};
    use pij_core::ports::{Queue, SeatFilter};

    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    let spine = SqliteSpine::new(pool.clone());
    let queue = pij_store::SqliteQueue::new(pool.clone());

    sqlx::query("PRAGMA user_version = 99")
        .execute(&pool)
        .await
        .expect("another binary migrated the same file");

    let job = Job {
        kind: "deliver".to_string(),
        serial_key: "seat".to_string(),
        payload: "{}".to_string(),
        dedupe_key: "d".to_string(),
    };
    let event = pij_core::model::Event {
        v: 1,
        at: 0,
        kind: "report".to_string(),
        seat: None,
        payload: "{}".to_string(),
    };

    let outcomes: Vec<(&str, Option<PijError>)> = vec![
        ("registry.get", registry.get(&SeatId::from("x")).await.err()),
        (
            "registry.put",
            registry
                .put(SeatDescriptor::new("x", Harness::Pi, "/abs"))
                .await
                .err(),
        ),
        (
            "registry.list",
            registry.list(SeatFilter::default()).await.err(),
        ),
        (
            "registry.tombstone",
            registry.tombstone(&SeatId::from("x"), "r").await.err(),
        ),
        ("spine.append", spine.append(event).await.err()),
        ("spine.tail", spine.tail(None, Seq(0)).await.err()),
        ("queue.enqueue", queue.enqueue(job).await.err()),
        (
            "queue.claim",
            queue.claim(&["deliver".to_string()], "w").await.err(),
        ),
        ("queue.ack", queue.ack(JobId(1), Outcome::Done).await.err()),
        ("queue.live_len", queue.live_len().await.err()),
    ];

    for (name, error) in outcomes {
        match error {
            Some(PijError::StoreSchemaStale { found, .. }) => assert_eq!(found, 99, "{name}"),
            other => panic!("{name} must refuse a stale schema, got {other:?}"),
        }
    }
}

/// ROUND 3, FINDING 2 — `StagedKey` was `Clone`, so two values owned one staging
/// path and either one's `Drop` deleted it. Dropping a clone made the original's
/// `publish` fail with "No such file or directory". A guard that can be
/// duplicated is not a guard, and the compiler is the right place to say so.
///
/// This test cannot construct the bug any more — that is the point. It asserts
/// the property the missing `Clone` protects: a staged key survives until ITS
/// owner publishes or drops it, and unrelated staging activity cannot remove it.
#[test]
fn a_staged_key_survives_other_attempts_coming_and_going() {
    let dir = state_dir();

    let mine = pij_daemon::auth::stage_key(&dir).expect("stage mine");
    let expected = mine.token().to_string();

    // Several other attempts start and die while mine is still staged.
    for _ in 0..3 {
        let other = pij_daemon::auth::stage_key(&dir).expect("stage other");
        assert_ne!(other.token(), mine.token());
        drop(other);
    }

    let published = mine.publish().expect("my staged key must still be there");
    assert_eq!(
        std::fs::read_to_string(&published.path).expect("read"),
        expected,
        "another attempt's lifecycle must not touch my bytes"
    );

    let _ = std::fs::remove_dir_all(dir);
}

/// ROUND 4 — the compile-time half of the previous finding.
///
/// The property test above proves attempts do not share paths. It does NOT prove
/// what the missing `Clone` protects: the reviewer re-added `#[derive(Clone)]`
/// and the test still passed, so the defect could return with its own regression
/// staying green. A test that cannot fail for the reason the bug would is not
/// covering the bug.
///
/// This detects `Clone` at COMPILE time, without a proc-macro dependency, via
/// autoref specialisation: the inherent method on `Probe<T>` requires
/// `T: Clone` and wins method resolution when it applies; otherwise resolution
/// falls back through the reference to the trait impl. So `is_clone()` answers
/// "does this type implement Clone" as a constant the compiler chose.
#[test]
fn staged_key_must_not_be_clone_or_two_owners_share_one_drop() {
    use std::marker::PhantomData;

    struct Probe<T>(PhantomData<T>);

    impl<T: Clone> Probe<T> {
        fn is_clone(&self) -> bool {
            true
        }
    }

    trait NotClone {
        fn is_clone(&self) -> bool {
            false
        }
    }

    impl<T> NotClone for &Probe<T> {}

    // Sanity first: the probe must be able to SEE a Clone type, or the assertion
    // below would pass for the wrong reason (a probe that always answers false
    // is a test that always passes).
    assert!(
        Probe::<String>(PhantomData).is_clone(),
        "the probe itself is broken — it cannot detect a type that IS Clone"
    );
    assert!(
        Probe::<pij_daemon::BootKey>(PhantomData).is_clone(),
        "BootKey is deliberately Clone; if that changed, this probe needs revisiting"
    );

    // The assertion that matters. The `&` is LOAD-BEARING here and nowhere else:
    // for a non-Clone type there is no inherent method to find, so resolution
    // must reach the trait impl on `&Probe<T>`. clippy flags the borrow on the
    // two probes above — correctly, since the inherent method applies there — and
    // stays silent on this one, which is the difference the trick turns on.
    assert!(
        !(&Probe::<pij_daemon::auth::StagedKey>(PhantomData)).is_clone(),
        "StagedKey must NOT be Clone: its Drop deletes the staged file, so a second \
         owner deletes the first owner's key and `publish` fails with 'No such file \
         or directory'. A guard that can be duplicated is not a guard."
    );
}
