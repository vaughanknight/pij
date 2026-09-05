use std::sync::Arc;

use pij_core::model::{Harness, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::orchestration::{
    AttributionSource, BatonDefinition, Dispatch, DispatchState, ParentAttribution,
    PrimeDesignation, ReconcileDecision, RepoInventory, RoleAssignment, SpawnRecord,
    VerifiedDescriptor, plan_stream_creation,
};
use pij_core::ports::Registry;
use pij_store::{
    BatonLease, DispatchAck, LeaseClaim, SpawnRecordOutcome, SqliteOrchestration, SqliteRegistry,
    StreamReservation,
};
use pij_testkit::FreshStore;

fn lease(holder: &str, id: &str, at: u64) -> BatonLease {
    BatonLease {
        baton: "git-index".to_string(),
        holder: SeatId::from(holder),
        lease_id: id.to_string(),
        acquired_at: at,
    }
}

#[tokio::test]
async fn spawn_owner_is_immutable_and_parent_attribution_states_missing_evidence() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = SqliteOrchestration::new(pool);
    let record = SpawnRecord {
        spawn_id: "spawn-1".to_string(),
        spawner: SeatId::from("pij-parent"),
        recorded_at: 10,
    };
    assert_eq!(
        store.record_spawn(&record).await.expect("record"),
        SpawnRecordOutcome::Recorded
    );
    assert_eq!(
        store.record_spawn(&record).await.expect("idempotent"),
        SpawnRecordOutcome::Existing
    );
    let conflicting = SpawnRecord {
        spawner: SeatId::from("pij-stranger"),
        ..record.clone()
    };
    assert_eq!(
        store.record_spawn(&conflicting).await.expect("conflict"),
        SpawnRecordOutcome::Conflict {
            existing_spawner: SeatId::from("pij-parent")
        }
    );

    let mut descriptor = SeatDescriptor::new("child", Harness::Omp, "/abs/work");
    descriptor.spawn_id = Some(record.spawn_id.clone());
    assert_eq!(
        store
            .parent_attribution(&descriptor)
            .await
            .expect("attribution"),
        ParentAttribution::Resolved {
            parent: SeatId::from("pij-parent"),
            source: AttributionSource::SpawnRecord,
        }
    );

    descriptor.spawn_id = Some("spawn-missing".to_string());
    let ParentAttribution::Unknown { reason } = store
        .parent_attribution(&descriptor)
        .await
        .expect("unknown is an outcome")
    else {
        panic!("missing mapping must not invent a parent")
    };
    assert!(reason.contains("spawn record") && reason.contains("spawn-missing"));
}

#[tokio::test]
async fn descriptor_merge_is_atomic_and_retains_both_inputs_and_mismatches() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let registry = SqliteRegistry::new(pool.clone());
    let store = SqliteOrchestration::new(pool.clone());
    let process = ProcIdentity {
        pid: 9191,
        proc_start: 12345,
    };
    let mut old = SeatDescriptor::new("old-alias", Harness::Copilot, "/old");
    old.proc = Some(process);
    old.model = Some("old-model".to_string());
    old.harness_session = Some("00000000-0000-4000-8000-000000000137".to_string());
    old.native_extension_delivery = true;
    let mut fresh_descriptor = SeatDescriptor::new("fresh-seat", Harness::Copilot, "/fresh");
    fresh_descriptor.proc = Some(process);
    fresh_descriptor.model = Some("new-model".to_string());
    fresh_descriptor.harness_session = old.harness_session.clone();
    fresh_descriptor.native_extension_delivery = true;
    registry.put(old.clone()).await.expect("put old");
    let mut stored_fresh = fresh_descriptor.clone();
    stored_fresh.native_extension_delivery = false;
    registry
        .put(stored_fresh)
        .await
        .expect("put stale survivor row");

    let decision = store
        .reconcile_descriptors(
            VerifiedDescriptor {
                descriptor: old.clone(),
                verified_at: Some(10),
            },
            VerifiedDescriptor {
                descriptor: fresh_descriptor.clone(),
                verified_at: Some(20),
            },
        )
        .await
        .expect("reconcile");
    let ReconcileDecision::Merge(plan) = decision else {
        panic!("expected merge")
    };
    assert_eq!(plan.survivor.id, fresh_descriptor.id);

    let alias = registry
        .get(&old.id)
        .await
        .expect("get")
        .expect("alias row retained");
    assert_eq!(alias.tombstoned_at, Some(20));
    assert!(
        alias
            .tombstone_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("fresh-seat"))
    );
    assert!(
        !alias.native_extension_delivery,
        "reconciled alias must not retain a retired incarnation's capability"
    );
    assert!(
        registry
            .get(&fresh_descriptor.id)
            .await
            .expect("get survivor")
            .expect("survivor row")
            .native_extension_delivery,
        "survivor update carries attestation for the same stored process/session"
    );
    let history: (String, String, String, String, String) = sqlx::query_as(
        "SELECT survivor_id, alias_id, survivor_json, alias_json, mismatched_fields \
         FROM descriptor_merge_history",
    )
    .fetch_one(&pool)
    .await
    .expect("history");
    assert_eq!(
        (&history.0, &history.1),
        (&"fresh-seat".to_string(), &"old-alias".to_string())
    );
    assert!(history.2.contains("fresh-seat") && history.3.contains("old-alias"));
    assert!(history.4.contains("folder") && history.4.contains("model"));
}

#[tokio::test]
async fn reconciliation_never_transfers_native_capability_to_another_incarnation() {
    for changed in [
        "pid",
        "proc_start",
        "native_session",
        "pane",
        "pane_missing",
        "pane_added",
        "harness",
        "tombstone",
        "alias_only",
    ] {
        let fresh = FreshStore::new();
        let pool = pij_store::open(&fresh.path()).await.expect("open");
        let registry = SqliteRegistry::new(pool.clone());
        let store = SqliteOrchestration::new(pool);
        let mut alias = SeatDescriptor::new("alias", Harness::Copilot, "/abs/tree");
        alias.proc = Some(ProcIdentity {
            pid: 13700,
            proc_start: 20260905120000,
        });
        alias.harness_session = Some("00000000-0000-4000-8000-000000000137".to_string());
        alias.native_extension_delivery = true;
        alias.pane = Some("%137".to_string());
        let mut candidate = alias.clone();
        candidate.id = SeatId::from("survivor");
        let mut stored = candidate.clone();
        match changed {
            "pid" => stored.proc.as_mut().expect("process").pid += 1,
            "proc_start" => stored.proc.as_mut().expect("process").proc_start += 1,
            "native_session" => {
                stored.harness_session = Some("00000000-0000-4000-8000-000000000138".to_string());
            }
            "pane" => stored.pane = Some("%138".to_string()),
            "pane_missing" => stored.pane = None,
            "pane_added" => candidate.pane = None,
            "harness" => {
                stored.harness = Harness::Omp;
                stored.native_extension_delivery = false;
            }
            "tombstone" => {
                stored.tombstoned_at = Some(1);
                stored.native_extension_delivery = false;
            }
            "alias_only" => candidate.native_extension_delivery = false,
            _ => unreachable!(),
        }
        registry
            .put(alias.clone())
            .await
            .expect("put attested alias");
        registry
            .put(stored.clone())
            .await
            .expect("put current survivor incarnation");
        let decision = store
            .reconcile_descriptors(
                VerifiedDescriptor {
                    descriptor: alias.clone(),
                    verified_at: Some(10),
                },
                VerifiedDescriptor {
                    descriptor: candidate,
                    verified_at: Some(20),
                },
            )
            .await
            .expect("reconcile");
        assert!(matches!(decision, ReconcileDecision::Merge(_)));
        let survivor = registry
            .get(&stored.id)
            .await
            .expect("read survivor")
            .expect("survivor row");
        assert!(
            !survivor.native_extension_delivery,
            "{changed} must not inherit attestation"
        );
        assert_eq!(
            survivor.proc, stored.proc,
            "reconciliation preserves stored process"
        );
        assert_eq!(survivor.harness_session, stored.harness_session);
        let retired = registry
            .get(&alias.id)
            .await
            .expect("read alias")
            .expect("alias row");
        assert_eq!(retired.tombstoned_at, Some(20));
        assert!(!retired.native_extension_delivery);
    }
}

#[tokio::test]
async fn undecided_descriptor_merge_writes_nothing() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = SqliteOrchestration::new(pool.clone());
    let process = ProcIdentity {
        pid: 42,
        proc_start: 99,
    };
    let mut left = SeatDescriptor::new("left", Harness::Pi, "/a");
    left.proc = Some(process);
    let mut right = SeatDescriptor::new("right", Harness::Pi, "/b");
    right.proc = Some(process);
    let decision = store
        .reconcile_descriptors(
            VerifiedDescriptor {
                descriptor: left,
                verified_at: None,
            },
            VerifiedDescriptor {
                descriptor: right,
                verified_at: Some(1),
            },
        )
        .await
        .expect("undecided");
    assert!(matches!(decision, ReconcileDecision::Undecided { .. }));
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM descriptor_merge_history")
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 0);
}

#[tokio::test]
async fn project_and_stream_reservations_are_first_writer_wins() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = SqliteOrchestration::new(pool);
    let actor = SeatId::from("pij-pm");
    assert!(
        store
            .create_project("rust-port", &actor, 1)
            .await
            .expect("project")
    );
    assert!(
        !store
            .create_project("rust-port", &actor, 2)
            .await
            .expect("duplicate")
    );
    let plan = plan_stream_creation(
        "rust-port",
        "orchestration",
        std::path::Path::new("/tmp/pij-streams"),
        "main",
        &RepoInventory::default(),
    )
    .expect("plan");
    assert_eq!(
        store
            .reserve_stream(&plan, &actor, 3)
            .await
            .expect("reserve"),
        StreamReservation::Reserved
    );
    assert_eq!(
        store
            .reserve_stream(&plan, &actor, 4)
            .await
            .expect("duplicate"),
        StreamReservation::Conflict
    );
}

#[tokio::test]
async fn batons_roles_prime_and_dispatch_ack_are_durable_governance() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = SqliteOrchestration::new(pool.clone());
    let prime = SeatId::from("pij-prime");
    let worker = SeatId::from("pij-worker");

    let baton = BatonDefinition {
        name: "git-index".to_string(),
        description: "serialises worktree mutations".to_string(),
        created_by: prime.clone(),
        created_at: 1,
    };
    assert!(store.define_baton(&baton).await.expect("baton"));
    assert!(!store.define_baton(&baton).await.expect("duplicate baton"));

    store
        .assign_role(&RoleAssignment {
            seat: worker.clone(),
            role: "coder".to_string(),
            assigned_by: prime.clone(),
            assigned_at: 2,
        })
        .await
        .expect("role");
    store
        .designate_prime(&PrimeDesignation {
            seat: prime.clone(),
            designated_by: prime.clone(),
            designated_at: 3,
        })
        .await
        .expect("prime");
    let role_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM seat_roles WHERE seat='pij-worker' AND role='coder'",
    )
    .fetch_one(&pool)
    .await
    .expect("role count");
    let designated: String =
        sqlx::query_scalar("SELECT seat FROM prime_designation WHERE singleton=1")
            .fetch_one(&pool)
            .await
            .expect("designation");
    assert_eq!(role_count, 1);
    assert_eq!(designated, "pij-prime");

    let dispatch = Dispatch {
        id: "dispatch-1".to_string(),
        from: prime.clone(),
        to: worker.clone(),
        body: "/abs/packet.md".to_string(),
        state: DispatchState::Pending,
        created_at: 4,
        acknowledged_at: None,
    };
    assert!(store.create_dispatch(&dispatch).await.expect("dispatch"));
    assert_eq!(
        store
            .acknowledge_dispatch("dispatch-1", &SeatId::from("pij-stranger"), 5)
            .await
            .expect("wrong actor"),
        DispatchAck::NotAssignee {
            assignee: worker.clone()
        }
    );
    assert_eq!(
        store
            .acknowledge_dispatch("dispatch-1", &worker, 6)
            .await
            .expect("ack"),
        DispatchAck::Acknowledged
    );
    assert_eq!(
        store
            .acknowledge_dispatch("dispatch-1", &worker, 7)
            .await
            .expect("replay"),
        DispatchAck::AlreadyAcknowledged
    );
    let acknowledged = store
        .dispatch("dispatch-1")
        .await
        .expect("read")
        .expect("present");
    assert_eq!(acknowledged.state, DispatchState::Acknowledged);
    assert_eq!(acknowledged.acknowledged_at, Some(6));
}

#[tokio::test]
async fn lease_single_holder_property_survives_generated_claim_release_sequences() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = SqliteOrchestration::new(pool);

    for seed in 0_u64..256 {
        let mut expected: Option<(String, String)> = None;
        let mut state = seed;
        for step in 0_u64..16 {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1);
            let actor = format!("pij-{}", state % 3);
            let claim_id = format!("lease-{seed}-{step}");
            if state & 1 == 0 {
                let outcome = store
                    .claim_lease(&lease(&actor, &claim_id, step))
                    .await
                    .expect("claim");
                match &expected {
                    None => {
                        assert_eq!(outcome, LeaseClaim::Claimed);
                        expected = Some((actor, claim_id));
                    }
                    Some((holder, id)) => assert_eq!(
                        outcome,
                        LeaseClaim::Held {
                            holder: SeatId::from(holder.as_str()),
                            lease_id: id.clone(),
                        }
                    ),
                }
            } else if let Some((holder, id)) = expected.clone() {
                let release_holder = if state % 5 == 0 {
                    SeatId::from("pij-not-holder")
                } else {
                    SeatId::from(holder.as_str())
                };
                let removed = store
                    .release_lease("git-index", &release_holder, &id, step)
                    .await
                    .expect("release");
                if release_holder.as_str() == holder {
                    assert!(removed);
                    expected = None;
                } else {
                    assert!(!removed);
                }
            }

            let observed = store.lease("git-index").await.expect("read lease");
            assert_eq!(
                observed
                    .as_ref()
                    .map(|row| (row.holder.as_str(), row.lease_id.as_str())),
                expected
                    .as_ref()
                    .map(|(holder, id)| (holder.as_str(), id.as_str())),
                "seed={seed} step={step}"
            );
        }
        if let Some((holder, id)) = expected.take() {
            assert!(
                store
                    .release_lease("git-index", &SeatId::from(holder), &id, 1000 + seed)
                    .await
                    .expect("reset")
            );
        }
    }
}

#[tokio::test]
async fn parallel_claimers_produce_exactly_one_holder() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let store = Arc::new(SqliteOrchestration::new(pool));
    let mut tasks = Vec::new();
    for index in 0..16 {
        let store = Arc::clone(&store);
        tasks.push(tokio::spawn(async move {
            store
                .claim_lease(&lease(
                    &format!("pij-{index}"),
                    &format!("lease-{index}"),
                    index,
                ))
                .await
                .expect("claim")
        }));
    }
    let mut claimed = 0;
    for task in tasks {
        if task.await.expect("join") == LeaseClaim::Claimed {
            claimed += 1;
        }
    }
    assert_eq!(claimed, 1, "the baton has one holder, never one per caller");
    assert!(store.lease("git-index").await.expect("lease").is_some());
}
