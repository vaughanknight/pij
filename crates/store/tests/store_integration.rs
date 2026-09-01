//! Tier-3 exemplar: the store, against a REAL SQLite database.
//!
//! No fake here on purpose. Tiers 1 and 2 prove logic and contracts; this tier
//! exists to prove the things only a real database can be wrong about — the
//! migration actually ran, WAL actually took, sequence numbers actually come
//! from AUTOINCREMENT, and the SAME contract the fake passes is passed by SQL.
//!
//! Every test takes a `FreshStore`: entropy-named, destroyed on drop, never
//! shared. A suite that shares a database is a suite that can pass in the wrong
//! order and fail alone.

use pij_core::error::PijError;
use pij_core::model::{Event, Harness, SeatDescriptor, SeatId, SemanticState, Seq, SystemState};
use pij_core::ports::{Registry, SeatFilter, Spine};
use pij_store::{SqliteRegistry, SqliteSpine};
use pij_testkit::FreshStore;
use pij_testkit::contract::{registry_contract, spine_contract};

#[tokio::test]
async fn the_daemon_self_migrates_a_brand_new_store_at_boot() {
    // R1: automatic, no second command. A schema that needs a human step is a
    // schema that will be stale on somebody's machine.
    let fresh = FreshStore::new();
    assert!(!fresh.exists(), "nothing exists before open");

    let pool = pij_store::open(&fresh.path())
        .await
        .expect("open must migrate");

    assert!(fresh.exists(), "opening the store creates it");
    assert_eq!(
        pij_store::schema_version(&pool).await.expect("version"),
        pij_store::SCHEMA_VERSION
    );
    pij_store::require_current_schema(&pool)
        .await
        .expect("a freshly migrated store is current");
}

#[tokio::test]
async fn wal_is_actually_on_which_the_migration_file_could_not_have_done() {
    // The trap this asserts against: `PRAGMA journal_mode` is a no-op inside a
    // transaction, and sqlx runs each migration in one — so setting WAL in
    // 0001.sql would LOOK right and silently leave a rollback journal.
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");

    assert_eq!(
        pij_store::migrate::journal_mode(&pool)
            .await
            .expect("journal mode")
            .to_lowercase(),
        "wal",
        "the journal mode must be WAL on disk, not merely requested"
    );
}

#[tokio::test]
async fn re_opening_an_existing_store_is_idempotent_and_keeps_the_data() {
    let fresh = FreshStore::new();
    let seat = SeatDescriptor::new("pij-persisted", Harness::Claude, "/abs/work");

    {
        let pool = pij_store::open(&fresh.path()).await.expect("open");
        SqliteRegistry::new(pool)
            .put(seat.clone())
            .await
            .expect("put");
    }

    let pool = pij_store::open(&fresh.path()).await.expect("re-open");
    let registry = SqliteRegistry::new(pool);
    assert_eq!(
        registry.get(&seat.id).await.expect("get"),
        Some(seat),
        "a second boot must migrate to a no-op and leave the rows alone"
    );
}

#[tokio::test]
async fn a_store_from_the_future_is_refused_in_the_direction_that_matters() {
    // Skew is directional. Forward is a migration; BACKWARD is a refusal,
    // because a binary cannot know what a schema it has never seen means, and a
    // half-understood schema corrupts quietly. Never limp.
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    sqlx::query("PRAGMA user_version = 99")
        .execute(&pool)
        .await
        .expect("bump the schema version");

    let error = pij_store::require_current_schema(&pool)
        .await
        .expect_err("a newer schema must be refused");

    match error {
        PijError::StoreSchemaStale {
            found,
            expected,
            ref fix,
        } => {
            assert_eq!((found, expected), (99, pij_store::SCHEMA_VERSION));
            assert!(
                fix.contains("upgrade"),
                "the refusal must name the direction-specific fix: {fix}"
            );
        }
        other => panic!("wrong error: {other:?}"),
    }

    // And the refusal survives a re-open: `open` will not silently "fix" a
    // future schema by running migrations over it.
    let error = pij_store::open(&fresh.path())
        .await
        .expect_err("open must refuse a future store too");
    assert!(matches!(error, PijError::StoreSchemaStale { .. }));
}

#[tokio::test]
async fn an_older_store_is_migrated_forward_rather_than_refused() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    sqlx::query("PRAGMA user_version = 0")
        .execute(&pool)
        .await
        .expect("pretend the store predates this binary");

    let error = pij_store::require_current_schema(&pool)
        .await
        .expect_err("a command must refuse a stale schema rather than write to it");
    match error {
        PijError::StoreSchemaStale { ref fix, .. } => assert!(
            fix.contains("restart the daemon"),
            "backward skew tells the caller to let the daemon migrate: {fix}"
        ),
        other => panic!("wrong error: {other:?}"),
    }
    drop(pool);

    // ...and the daemon's own boot does exactly that, without a human step.
    let pool = pij_store::open(&fresh.path())
        .await
        .expect("boot migrates forward");
    pij_store::require_current_schema(&pool)
        .await
        .expect("current after boot");
}

#[tokio::test]
async fn consent_backfill_upgrades_only_live_unknown_claude_rows_and_is_idempotent() {
    let fresh = FreshStore::new();
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(fresh.path())
        .create_if_missing(true);
    let legacy_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .expect("open legacy store");
    let legacy_migrator = sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Owned(
            pij_store::migrate::MIGRATIONS
                .iter()
                .filter(|migration| migration.version <= 9)
                .cloned()
                .collect(),
        ),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    legacy_migrator
        .run(&legacy_pool)
        .await
        .expect("migrate fixture to schema 9");
    sqlx::raw_sql(
        "INSERT INTO seats \
         (id, harness, folder, state, relay, tombstoned_at, seq, cross_session_inbound_accept) \
         VALUES \
         ('pij-claude-live', 'claude', '/live', 'idle', 0, NULL, 1, NULL), \
         ('pij-claude-refused', 'claude', '/refused', 'idle', 0, NULL, 2, 0), \
         ('pij-claude-tombstone', 'claude', '/dead', 'idle', 0, 1, 3, NULL), \
         ('pij-omp-live', 'omp', '/omp', 'idle', 0, NULL, 4, NULL)",
    )
    .execute(&legacy_pool)
    .await
    .expect("seed schema-9 consent states");
    drop(legacy_pool);

    let migrated_pool = pij_store::open(&fresh.path())
        .await
        .expect("migrate schema 9 to current");
    let rows: Vec<(String, Option<i64>)> =
        sqlx::query_as("SELECT id, cross_session_inbound_accept FROM seats ORDER BY id")
            .fetch_all(&migrated_pool)
            .await
            .expect("read backfilled consent states");
    assert_eq!(
        rows,
        vec![
            ("pij-claude-live".to_string(), Some(1)),
            ("pij-claude-refused".to_string(), Some(0)),
            ("pij-claude-tombstone".to_string(), None),
            ("pij-omp-live".to_string(), None),
        ],
        "backfill changes only non-tombstoned Claude rows whose consent is unknown"
    );
    assert_eq!(
        pij_store::schema_version(&migrated_pool)
            .await
            .expect("schema version"),
        10,
        "the backfill advances the schema cache with its migration"
    );

    let backfill = pij_store::migrate::MIGRATIONS
        .iter()
        .find(|migration| migration.version == 10)
        .expect("consent backfill migration");
    let repeated = sqlx::raw_sql(&backfill.sql)
        .execute(&migrated_pool)
        .await
        .expect("repeat the exact backfill SQL");
    assert_eq!(
        repeated.rows_affected(),
        0,
        "running the backfill SQL twice changes zero additional rows"
    );
}

#[tokio::test]
async fn the_sqlite_registry_honours_the_same_contract_the_fake_does() {
    // The point of the shared suite: this is the identical function
    // `contract_over_fakes.rs` runs. If SQL and the fake ever disagree, exactly
    // one assertion fires and names the promise that broke.
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    registry_contract(&SqliteRegistry::new(pool)).await;
}

#[tokio::test]
async fn the_sqlite_spine_honours_the_same_contract_the_fake_does() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    spine_contract(&SqliteSpine::new(pool)).await;
}

#[tokio::test]
async fn a_seat_round_trips_with_every_optional_fact_intact() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool);

    let mut seat = SeatDescriptor::new("pij-full", Harness::Omp, "/abs/tree");
    seat.pane = Some("%255".to_string());
    seat.proc = Some(pij_core::model::ProcIdentity {
        pid: 4242,
        proc_start: 1_724_800_000,
    });
    seat.state = SystemState::Working;
    seat.semantic_state = Some(SemanticState::Question);
    seat.role = Some("pm".to_string());
    seat.parent = Some(SeatId::from("pij-prime"));
    seat.relay = true;
    seat.rpc_port_intent = Some(47_781);

    registry.put(seat.clone()).await.expect("put");
    assert_eq!(registry.get(&seat.id).await.expect("get"), Some(seat));
}

#[tokio::test]
async fn rpc_port_intent_updates_to_a_different_value_and_tombstone_clears_it() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool);
    let mut seat = SeatDescriptor::new("pij-rpc-upsert", Harness::Copilot, "/abs/tree");
    assert_eq!(seat.rpc_port_intent, None, "absence is the closed default");

    seat.rpc_port_intent = Some(47_781);
    registry.put(seat.clone()).await.expect("insert port A");
    seat.rpc_port_intent = Some(51_948);
    registry.put(seat.clone()).await.expect("update to port B");
    assert_eq!(
        registry
            .get(&seat.id)
            .await
            .expect("read updated descriptor")
            .expect("descriptor")
            .rpc_port_intent,
        Some(51_948),
        "a real SQLite upsert must replace the old incarnation's port intent"
    );

    registry
        .tombstone(&seat.id, "process exited")
        .await
        .expect("tombstone");
    let tombstoned = registry
        .get(&seat.id)
        .await
        .expect("read tombstone")
        .expect("descriptor remains as post-mortem");
    assert!(tombstoned.tombstoned_at.is_some());
    assert_eq!(
        tombstoned.rpc_port_intent, None,
        "tombstone clearing is observed from registry truth"
    );
}

#[tokio::test]
async fn rpc_port_intent_schema_refuses_zero_negative_and_out_of_range_values() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    let mut seat = SeatDescriptor::new("pij-rpc-range", Harness::Copilot, "/abs/tree");
    seat.rpc_port_intent = Some(47_781);
    registry.put(seat).await.expect("seed valid port");

    for invalid in [0_i64, -1, 65_536, 70_000] {
        let result = sqlx::query("UPDATE seats SET rpc_port_intent=?2 WHERE id=?1")
            .bind("pij-rpc-range")
            .bind(invalid)
            .execute(&pool)
            .await;
        assert!(
            result.is_err(),
            "migration CHECK must refuse invalid rpc_port_intent={invalid}"
        );
    }
}

#[tokio::test]
async fn corrupt_rpc_port_intent_is_a_named_read_error_never_a_narrowed_presence() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    registry
        .put(SeatDescriptor::new(
            "pij-rpc-corrupt",
            Harness::Copilot,
            "/abs/tree",
        ))
        .await
        .expect("seed descriptor");
    let mut connection = pool
        .acquire()
        .await
        .expect("acquire corrupt-store connection");
    sqlx::query("PRAGMA ignore_check_constraints = ON")
        .execute(&mut *connection)
        .await
        .expect("model an already-corrupt store");

    for invalid in [0_i64, -1, 65_536, 70_000] {
        sqlx::query("UPDATE seats SET rpc_port_intent=?2 WHERE id=?1")
            .bind("pij-rpc-corrupt")
            .bind(invalid)
            .execute(&mut *connection)
            .await
            .expect("plant corrupt port");
        let error = registry
            .get(&SeatId::from("pij-rpc-corrupt"))
            .await
            .expect_err("corrupt port must not become a present u16");
        assert!(
            error.to_string().contains("rpc_port_intent")
                && error.to_string().contains(&invalid.to_string()),
            "error must name the corrupt field and value: {error}"
        );
    }
}

#[tokio::test]
async fn filters_narrow_and_absent_filter_fields_do_not() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool);

    registry
        .put(SeatDescriptor::new("pij-a", Harness::Pi, "/tree/one"))
        .await
        .expect("put");
    let mut child = SeatDescriptor::new("pij-b", Harness::Claude, "/tree/two");
    child.parent = Some(SeatId::from("pij-a"));
    registry.put(child).await.expect("put");

    assert_eq!(
        registry
            .list(SeatFilter::default())
            .await
            .expect("list")
            .len(),
        2
    );
    assert_eq!(
        registry
            .list(SeatFilter {
                harness: Some(Harness::Claude),
                ..SeatFilter::default()
            })
            .await
            .expect("list")
            .len(),
        1
    );
    assert_eq!(
        registry
            .list(SeatFilter {
                parent: Some(SeatId::from("pij-a")),
                ..SeatFilter::default()
            })
            .await
            .expect("list")
            .len(),
        1
    );
    assert!(
        registry
            .list(SeatFilter {
                folder: Some(String::new()),
                ..SeatFilter::default()
            })
            .await
            .expect("list")
            .is_empty(),
        "an EMPTY filter value filters for empty — it is not the same as absent"
    );
}

#[tokio::test]
async fn a_half_written_process_identity_is_refused_rather_than_half_believed() {
    // A pid with no start time is not half an identity; it is an unusable one,
    // and believing it is the recycled-pid bug in a different costume.
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    sqlx::query(
        "INSERT INTO seats (id, harness, folder, state, pid, relay, seq) \
         VALUES ('pij-halfbound', 'pi', '/tmp', 'idle', 4242, 0, 1)",
    )
    .execute(&pool)
    .await
    .expect("plant a half-written row");

    let error = SqliteRegistry::new(pool)
        .get(&SeatId::from("pij-halfbound"))
        .await
        .expect_err("half an identity must be refused");
    assert!(
        error.to_string().contains("half a process identity"),
        "the refusal must say what is wrong with the row: {error}"
    );
}

#[tokio::test]
async fn the_spine_is_append_only_and_its_sequence_never_goes_backwards() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let spine = SqliteSpine::new(pool);

    let event = |kind: &str, seat: Option<&str>| Event {
        seq: None,
        v: 1,
        at: 1_724_800_000_000,
        kind: kind.to_string(),
        seat: seat.map(SeatId::from),
        payload: "{}".to_string(),
    };

    let first = spine
        .append(event("report", Some("pij-a")))
        .await
        .expect("append");
    let second = spine
        .append(event("report", Some("pij-b")))
        .await
        .expect("append");
    let third = spine
        .append(event("receipt", Some("pij-a")))
        .await
        .expect("append");
    assert!(first < second && second < third, "seq is monotonic");

    // `tail(since)` means "everything after what I have seen", which is what
    // makes a resumable stream possible at all.
    let after_first = spine.tail(None, first).await.expect("tail");
    assert_eq!(after_first.len(), 2);

    let just_a = spine
        .tail(Some(&SeatId::from("pij-a")), Seq(0))
        .await
        .expect("tail");
    assert_eq!(just_a.len(), 2, "seat filter narrows: {just_a:?}");
    assert_eq!(just_a[0].kind, "report");
    assert_eq!(just_a[1].kind, "receipt");

    assert!(
        spine.tail(None, third).await.expect("tail").is_empty(),
        "a tail from the newest event is empty, not an error"
    );
}

#[tokio::test]
async fn each_test_gets_its_own_database() {
    // The property the whole tier depends on. Two FreshStores are two files, and
    // neither can see the other's rows.
    let one = FreshStore::new();
    let two = FreshStore::new();
    assert_ne!(one.path(), two.path());

    let pool_one = pij_store::open(&one.path()).await.expect("open");
    SqliteRegistry::new(pool_one)
        .put(SeatDescriptor::new("pij-only-in-one", Harness::Pi, "/tmp"))
        .await
        .expect("put");

    let pool_two = pij_store::open(&two.path()).await.expect("open");
    assert_eq!(
        SqliteRegistry::new(pool_two)
            .get(&SeatId::from("pij-only-in-one"))
            .await
            .expect("get"),
        None
    );
}

#[test]
fn a_dropped_fresh_store_takes_its_wal_sidecars_with_it() {
    // WAL leaves `-wal` and `-shm` beside the database; a cleanup that forgets
    // them leaves state behind for whatever reuses the name next.
    let path = {
        let fresh = FreshStore::new();
        let path = fresh.path();
        let runtime = tokio::runtime::Runtime::new().expect("runtime");
        runtime.block_on(async {
            let pool = pij_store::open(&path).await.expect("open");
            SqliteRegistry::new(pool)
                .put(SeatDescriptor::new("pij-tmp", Harness::Pi, "/tmp"))
                .await
                .expect("put");
        });
        assert!(std::path::Path::new(&path).exists());
        path
    };

    for suffix in ["", "-wal", "-shm"] {
        assert!(
            !std::path::Path::new(&format!("{path}{suffix}")).exists(),
            "dropping FreshStore must remove {path}{suffix}"
        );
    }
}

#[tokio::test]
async fn bind_evidence_round_trips_and_absent_stays_absent() {
    // R5 items 13-15, and the class behind them: the registry row lacked facts
    // another surface already held. A row that ROUND-TRIPS them is the fix; a row
    // that invents them for an adopted seat would be the same defect mirrored.
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool);

    let mut spawned = SeatDescriptor::new("pij-spawned", Harness::Omp, "/abs/tree");
    spawned.spawn_id = Some("s1787958708582-43870".to_string());
    spawned.model = Some("github-copilot/gpt-5.6-sol-fast".to_string());
    spawned.provider = Some("github-copilot".to_string());
    spawned.effort = Some("high".to_string());

    registry.put(spawned.clone()).await.expect("put");
    assert_eq!(
        registry.get(&spawned.id).await.expect("get"),
        Some(spawned),
        "every fact the spawn knew must be readable from the registry"
    );

    // A seat a human adopted never had a spawn id. Absent must stay absent.
    let adopted = SeatDescriptor::new("pij-adopted", Harness::Claude, "/abs/other");
    registry.put(adopted.clone()).await.expect("put");
    let read_back = registry
        .get(&adopted.id)
        .await
        .expect("get")
        .expect("present");
    assert_eq!(read_back.spawn_id, None);
    assert_eq!(read_back.model, None);
    assert_eq!(read_back, adopted);
}

#[tokio::test]
async fn an_older_store_gains_the_bind_evidence_columns_by_migrating_forward() {
    // Migration 0003 is additive over a store that already has seats in it: the
    // rows survive, and their new columns read absent rather than defaulting to
    // a value nobody chose.
    let fresh = FreshStore::new();
    {
        let pool = pij_store::open(&fresh.path()).await.expect("open");
        SqliteRegistry::new(pool)
            .put(SeatDescriptor::new("pij-legacy", Harness::Pi, "/abs/old"))
            .await
            .expect("put");
    }

    let pool = pij_store::open(&fresh.path())
        .await
        .expect("re-open migrates");
    assert_eq!(
        pij_store::schema_version(&pool).await.expect("version"),
        pij_store::SCHEMA_VERSION
    );
    let legacy = SqliteRegistry::new(pool)
        .get(&SeatId::from("pij-legacy"))
        .await
        .expect("get")
        .expect("the row survives the migration");
    assert_eq!(
        legacy.spawn_id, None,
        "a pre-0003 row has no bind evidence, not a fake one"
    );
    assert_eq!(legacy.folder, "/abs/old");
}
