//! The queue primitive, against a real database (workshop 001 R4).
//!
//! Both semantics are asserted against SQLite rather than against the fake,
//! because both are enforced by SQL — a partial unique index and a claim
//! transaction. A test that only exercised the fake would be testing the fake's
//! opinion of the rule, not the rule.

use std::sync::Arc;

use pij_core::model::{Job, Outcome};
use pij_core::ports::Queue;
use pij_store::SqliteQueue;
use pij_testkit::FreshStore;
use pij_testkit::contract::queue_contract;

fn job(kind: &str, serial: &str, dedupe: &str) -> Job {
    Job {
        kind: kind.to_string(),
        serial_key: serial.to_string(),
        payload: "{}".to_string(),
        dedupe_key: dedupe.to_string(),
    }
}

async fn queue(fresh: &FreshStore) -> SqliteQueue {
    SqliteQueue::new(pij_store::open(&fresh.path()).await.expect("open"))
}

#[tokio::test]
async fn the_sqlite_queue_honours_the_same_contract_the_fake_does() {
    let fresh = FreshStore::new();
    queue_contract(&queue(&fresh).await).await;
}

#[tokio::test]
async fn n_rapid_submits_collapse_to_one_row() {
    // The rule, stated as the operator experiences it: hammer the same work ten
    // times and one unit of work exists, not ten.
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;

    let mut ids = Vec::new();
    for _ in 0..10 {
        ids.push(
            queue
                .enqueue(job("deliver", "seat-a", "msg-1"))
                .await
                .expect("enqueue"),
        );
    }

    assert_eq!(
        queue.live_len().await.expect("live_len"),
        1,
        "ten submits of one dedupe key must leave ONE live row"
    );
    assert!(
        ids.windows(2).all(|pair| pair[0] == pair[1]),
        "every caller must get the id of the surviving row, not a phantom: {ids:?}"
    );
}

#[tokio::test]
async fn an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever() {
    // The other half of the rule, and the one a naive unique index gets wrong:
    // the same work CAN be scheduled again once the previous attempt finished.
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;

    let first = queue
        .enqueue(job("deliver", "seat-a", "msg-1"))
        .await
        .expect("enqueue");
    let claimed = queue
        .claim(&["deliver".to_string()], "w1")
        .await
        .expect("claim")
        .expect("a job is available");
    assert_eq!(claimed.0, first);

    // Still live while RUNNING: a re-submit during execution must not create a
    // second row, or the work runs twice.
    let during = queue
        .enqueue(job("deliver", "seat-a", "msg-1"))
        .await
        .expect("enqueue");
    assert_eq!(during, first, "a running job still owns its dedupe key");

    queue.ack(first, Outcome::Done).await.expect("ack");

    let after = queue
        .enqueue(job("deliver", "seat-a", "msg-1"))
        .await
        .expect("enqueue");
    assert_ne!(
        after, first,
        "once acked, the same work may be scheduled again — otherwise a key is \
         poisoned for the life of the database"
    );
}

#[tokio::test]
async fn one_entity_is_worked_by_one_worker_at_a_time() {
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;

    queue
        .enqueue(job("deliver", "seat-a", "m1"))
        .await
        .expect("enqueue");
    queue
        .enqueue(job("deliver", "seat-a", "m2"))
        .await
        .expect("enqueue");
    queue
        .enqueue(job("deliver", "seat-b", "m3"))
        .await
        .expect("enqueue");

    let first = queue
        .claim(&["deliver".to_string()], "w1")
        .await
        .expect("claim")
        .expect("job");
    assert_eq!(first.1.serial_key, "seat-a");

    // seat-b is free, so work continues — serialization is PER ENTITY, not a
    // global lock. A global lock would be correct and useless.
    let second = queue
        .claim(&["deliver".to_string()], "w2")
        .await
        .expect("claim")
        .expect("job");
    assert_eq!(second.1.serial_key, "seat-b");

    // ...but seat-a's second job waits.
    assert!(
        queue
            .claim(&["deliver".to_string()], "w3")
            .await
            .expect("claim")
            .is_none(),
        "seat-a already has a running job; its next one must wait"
    );

    queue.ack(first.0, Outcome::Done).await.expect("ack");
    let resumed = queue
        .claim(&["deliver".to_string()], "w3")
        .await
        .expect("claim")
        .expect("job");
    assert_eq!(resumed.1.serial_key, "seat-a");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
async fn parallel_claimers_partition_the_work_with_no_double_claim() {
    // The contention test the plan asks for, judged by SET EQUALITY: every job is
    // claimed exactly once, and the union of what the workers got is exactly what
    // was enqueued. Ordering is not asserted — it is not part of the contract,
    // and asserting it would make this test flake for a reason nobody cares about.
    let fresh = FreshStore::new();
    let queue = Arc::new(queue(&fresh).await);

    let expected: Vec<String> = (0..24).map(|n| format!("entity-{n}")).collect();
    for serial in &expected {
        queue
            .enqueue(job("deliver", serial, &format!("d-{serial}")))
            .await
            .expect("enqueue");
    }

    let mut workers = Vec::new();
    for worker in 0..8 {
        let queue = Arc::clone(&queue);
        workers.push(tokio::spawn(async move {
            let mut mine = Vec::new();
            while let Some((id, job)) = queue
                .claim(&["deliver".to_string()], &format!("w{worker}"))
                .await
                .expect("claim")
            {
                mine.push(job.serial_key.clone());
                queue.ack(id, Outcome::Done).await.expect("ack");
            }
            mine
        }));
    }

    let mut claimed = Vec::new();
    for worker in workers {
        claimed.extend(worker.await.expect("worker panicked"));
    }

    let mut sorted = claimed.clone();
    sorted.sort();
    let mut expected_sorted = expected.clone();
    expected_sorted.sort();

    assert_eq!(
        sorted, expected_sorted,
        "every enqueued job must be claimed exactly once across all workers"
    );
    assert_eq!(
        queue.live_len().await.expect("live_len"),
        0,
        "no live rows may survive a drained queue"
    );
}

#[tokio::test]
async fn acking_a_job_nobody_is_running_is_reported_not_swallowed() {
    // A worker acking work the queue does not think is running means a claim was
    // lost. Silently succeeding here is how that stays invisible until the job
    // runs twice.
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;
    let id = queue
        .enqueue(job("deliver", "seat-a", "m1"))
        .await
        .expect("enqueue");

    let error = queue
        .ack(id, Outcome::Done)
        .await
        .expect_err("acking an unclaimed job must fail");
    assert!(
        error.to_string().contains("not running"),
        "the error must say what was wrong: {error}"
    );

    let (claimed, _) = queue
        .claim(&["deliver".to_string()], "w1")
        .await
        .expect("claim")
        .expect("job");
    queue.ack(claimed, Outcome::Done).await.expect("ack");
    assert!(
        queue.ack(claimed, Outcome::Done).await.is_err(),
        "a double-ack is the same lost-claim signal and must also be refused"
    );
}

#[tokio::test]
async fn a_failed_job_keeps_its_reason_and_frees_its_entity() {
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;
    queue
        .enqueue(job("deliver", "seat-a", "m1"))
        .await
        .expect("enqueue");
    let (id, _) = queue
        .claim(&["deliver".to_string()], "w1")
        .await
        .expect("claim")
        .expect("job");

    queue
        .ack(
            id,
            Outcome::Failed {
                reason: "transport refused".to_string(),
            },
        )
        .await
        .expect("ack");

    assert_eq!(queue.live_len().await.expect("live_len"), 0);
    // A retry is a NEW row, so the record of the failed attempt survives.
    let retry = queue
        .enqueue(job("deliver", "seat-a", "m1"))
        .await
        .expect("enqueue");
    assert_ne!(retry, id);
}

#[tokio::test]
async fn claim_respects_the_kind_filter_and_an_empty_filter_claims_nothing() {
    let fresh = FreshStore::new();
    let queue = queue(&fresh).await;
    queue
        .enqueue(job("deliver", "seat-a", "m1"))
        .await
        .expect("enqueue");

    assert!(queue.claim(&[], "w1").await.expect("claim").is_none());
    assert!(
        queue
            .claim(&["chore".to_string()], "w1")
            .await
            .expect("claim")
            .is_none()
    );
    assert!(
        queue
            .claim(&["chore".to_string(), "deliver".to_string()], "w1")
            .await
            .expect("claim")
            .is_some(),
        "a kind list matches any of its entries"
    );
}
