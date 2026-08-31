//! The queue primitive, against a real database (workshop 001 R4).
//!
//! Dedupe, serialization, FIFO and terminal claim expiry are asserted against
//! SQLite rather than a fake because SQL owns the invariants. A fake-only test
//! would be testing the fake's opinion of the rule, not the rule.

use std::sync::Arc;

use pij_core::config::Config;
use pij_core::model::{DeliveryOrigin, Job, Outcome, SeatId};
use pij_core::ports::{DeliveryEnqueue, Queue};
use pij_store::SqliteQueue;
use pij_testkit::FreshStore;
use pij_testkit::contract::queue_contract;
use tokio::sync::Barrier;

fn job(kind: &str, serial: &str, dedupe: &str) -> Job {
    Job {
        kind: kind.to_string(),
        serial_key: serial.to_string(),
        payload: "{}".to_string(),
        dedupe_key: dedupe.to_string(),
        attempt: 0,
    }
}

async fn crate_queue(fresh: &FreshStore) -> SqliteQueue {
    SqliteQueue::new(
        pij_store::open(&fresh.path()).await.expect("open"),
        Config::default().claim_lease_secs,
        Config::default().delivered_id_capacity,
    )
    .expect("valid default queue policy")
}

#[tokio::test]
async fn the_sqlite_queue_honours_the_same_contract_the_fake_does() {
    let fresh = FreshStore::new();
    queue_contract(&crate_queue(&fresh).await).await;
}

#[tokio::test]
async fn n_rapid_submits_collapse_to_one_row() {
    // The rule, stated as the operator experiences it: hammer the same work ten
    // times and one unit of work exists, not ten.
    let fresh = FreshStore::new();
    let queue = crate_queue(&fresh).await;

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
    let queue = crate_queue(&fresh).await;

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
    let queue = crate_queue(&fresh).await;

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
    // The contention test is judged by SET EQUALITY: every job is claimed once,
    // and the union across workers equals what was enqueued. Cross-entity worker
    // scheduling is deliberately not ordered; FIFO is asserted per serial key.
    let fresh = FreshStore::new();
    let queue = Arc::new(crate_queue(&fresh).await);

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
    let queue = crate_queue(&fresh).await;
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
    let queue = crate_queue(&fresh).await;
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
    let queue = crate_queue(&fresh).await;
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

#[tokio::test]
async fn fifo_within_a_serial_key_survives_interleaved_entities() {
    let fresh = FreshStore::new();
    let queue = crate_queue(&fresh).await;

    for (serial, dedupe) in [
        ("seat-a", "a-1"),
        ("seat-b", "b-1"),
        ("seat-a", "a-2"),
        ("seat-a", "a-3"),
    ] {
        queue
            .enqueue(job("deliver", serial, dedupe))
            .await
            .expect("enqueue");
    }

    let first = queue
        .claim(&["deliver".to_string()], "w1")
        .await
        .expect("claim")
        .expect("first job");
    assert_eq!(first.1.dedupe_key, "a-1");

    let other = queue
        .claim(&["deliver".to_string()], "w2")
        .await
        .expect("claim")
        .expect("other serial remains runnable");
    assert_eq!(other.1.dedupe_key, "b-1");
    queue.ack(other.0, Outcome::Done).await.expect("ack b");

    let mut current = first.0;
    for expected in ["a-2", "a-3"] {
        queue.ack(current, Outcome::Done).await.expect("ack a");
        let next = queue
            .claim(&["deliver".to_string()], "w1")
            .await
            .expect("claim")
            .expect("next serial job");
        assert_eq!(next.1.dedupe_key, expected, "serial-key order is FIFO");
        current = next.0;
    }
    queue.ack(current, Outcome::Done).await.expect("final ack");
}

#[tokio::test]
async fn an_expired_claim_fails_terminally_and_rejects_the_stale_ack() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let queue = SqliteQueue::new(pool.clone(), 300, 1_024).expect("valid queue policy");

    let expired = queue
        .enqueue(job("deliver", "seat-a", "a-1"))
        .await
        .expect("enqueue expired attempt");
    queue
        .enqueue(job("deliver", "seat-a", "a-2"))
        .await
        .expect("enqueue successor");
    let claimed = queue
        .claim(&["deliver".to_string()], "stale-worker")
        .await
        .expect("claim")
        .expect("first attempt");
    assert_eq!(claimed.0, expired);
    assert!(
        queue
            .claim(&["deliver".to_string()], "next-worker")
            .await
            .expect("claim")
            .is_none(),
        "an unexpired claim still owns its serial key"
    );

    sqlx::query("UPDATE jobs SET claimed_at = unixepoch() - 301 WHERE id = ?1")
        .bind(expired.0 as i64)
        .execute(&pool)
        .await
        .expect("age the claim");

    let successor = queue
        .claim(&["deliver".to_string()], "next-worker")
        .await
        .expect("claim after expiry")
        .expect("expiry frees the serial key");
    assert_eq!(successor.1.dedupe_key, "a-2");
    assert!(
        queue.ack(expired, Outcome::Done).await.is_err(),
        "the old worker must not complete a terminally expired attempt"
    );

    let (state, outcome, acked_at): (String, Option<String>, Option<i64>) =
        sqlx::query_as("SELECT state, outcome, acked_at FROM jobs WHERE id = ?1")
            .bind(expired.0 as i64)
            .fetch_one(&pool)
            .await
            .expect("read expired attempt");
    assert_eq!(state, "failed");
    assert!(outcome.is_some_and(|text| text.contains("claim lease expired")));
    assert!(
        acked_at.is_some(),
        "terminal expiry records when it happened"
    );

    let retry = queue
        .enqueue(job("deliver", "seat-a", "a-1"))
        .await
        .expect("explicit retry");
    assert_ne!(retry, expired, "retry is a new attempt, never a requeue");
}

#[tokio::test]
async fn an_expired_inbox_claim_retries_instead_of_losing_the_unacked_message() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let queue = SqliteQueue::new(pool.clone(), 300, 1_024).expect("valid queue policy");
    let kind = "delivery:pij-reader";
    let id = queue
        .enqueue_delivery(job(kind, "pij-reader", "m-1"))
        .await
        .expect("enqueue delivery");
    let DeliveryEnqueue::Queued(id) = id else {
        panic!("new delivery must queue");
    };
    let first = queue
        .claim(&[kind.to_string()], "first-http-client")
        .await
        .expect("first claim")
        .expect("delivery row");
    assert_eq!(first.0, id);

    sqlx::query("UPDATE jobs SET claimed_at = unixepoch() - 301 WHERE id = ?1")
        .bind(id.0 as i64)
        .execute(&pool)
        .await
        .expect("age the interrupted claim");

    let retried = queue
        .claim(&[kind.to_string()], "replacement-http-client")
        .await
        .expect("claim after expiry")
        .expect("unacknowledged delivery is retried");
    assert_eq!(retried.0, id, "Queue::retry semantics preserve the job id");
    assert_eq!(retried.1.attempt, 1, "claim expiry counts the retry");
    assert_eq!(retried.1.dedupe_key, "m-1");

    queue
        .ack_delivery(retried.0, DeliveryOrigin::ReaderRead)
        .await
        .expect("replacement client acknowledges what it read");
    assert_eq!(queue.live_len().await.expect("live count"), 0);
}

#[tokio::test]
async fn a_zero_claim_lease_is_refused_before_work_can_be_lost() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    assert!(SqliteQueue::new(pool.clone(), 0, 1_024).is_err());
    assert!(SqliteQueue::new(pool, 300, 0).is_err());
}

/// Review F5 — dedupe is per DESTINATION, not global.
///
/// The index was `dedupe_key` alone, and both delivery and federation rows carry
/// the CALLER's `msg_id`. So two sends with one msg_id to two different
/// recipients collapsed: the second insert hit `ON CONFLICT DO NOTHING`, the
/// read-back returned the first row, and the caller was told `Queued` for a
/// message that was never going anywhere.
///
/// Mutation witness: revert the index to `(dedupe_key)` and this fails with one
/// row where two are required.
#[tokio::test]
async fn one_msg_id_to_two_recipients_is_two_rows() {
    let fresh = FreshStore::new();
    let queue = crate_queue(&fresh).await;

    let job = |seat: &str| Job {
        kind: format!("delivery:{seat}"),
        serial_key: seat.to_string(),
        payload: format!("to {seat}"),
        dedupe_key: "m-1".to_string(),
        attempt: 0,
    };

    let first = queue.enqueue(job("pij-x")).await.expect("first enqueue");
    let second = queue.enqueue(job("pij-y")).await.expect("second enqueue");
    assert_ne!(
        first, second,
        "the same msg_id addressed to a DIFFERENT seat is a different message"
    );

    // ...and the rule it must not break: the same id to the SAME seat still
    // collapses, which is what dedupe is for.
    let repeat = queue.enqueue(job("pij-x")).await.expect("repeat enqueue");
    assert_eq!(first, repeat, "N rapid submits to one seat are one row");

    let claimed = queue
        .claim(&["delivery:pij-y".to_string()], "worker")
        .await
        .expect("claim y")
        .expect("the second recipient's row must exist");
    assert_eq!(claimed.1.payload, "to pij-y");
}

/// Review F6 — the claim-lease sweep is SCOPED to the kinds being claimed.
///
/// Unscoped, the pointer drain's five-second tick decided the fate of federation
/// claims: a row held by a slow forward was terminally failed by a worker that
/// knows nothing about forwarding, underneath the worker still doing it.
#[tokio::test]
async fn the_lease_sweep_does_not_reach_another_workers_kind() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let queue = SqliteQueue::new(pool.clone(), 1, 1_024).expect("one-second lease");

    let federation = queue
        .enqueue(Job {
            kind: "federation:laptop".to_string(), // the shape federation::remote_send_kind emits
            serial_key: "laptop".to_string(),
            payload: "forward".to_string(),
            dedupe_key: "m-fed".to_string(),
            attempt: 0,
        })
        .await
        .expect("enqueue federation");
    let held = queue
        .claim(&["federation:laptop".to_string()], "federation-worker")
        .await
        .expect("claim federation")
        .expect("a federation row");
    assert_eq!(held.0, federation);

    // AGE the claim past its lease deterministically, rather than sleeping: the
    // property under test is the sweep's SCOPE, and a test that sleeps to reach it
    // proves the sleep as well.
    sqlx::query("UPDATE jobs SET claimed_at = claimed_at - 3600 WHERE state = 'running'")
        .execute(&pool)
        .await
        .expect("age the claim");

    // A drain pass over DELIVERY kinds. It sweeps, and it must not touch the
    // federation claim it is holding nothing of.
    let _ = queue
        .claim(&["delivery:pij-x".to_string()], "drain-worker")
        .await
        .expect("drain claim");

    // The federation worker can still finish its own claim: if the sweep had
    // reached it, this is `job is not running`.
    queue
        .retry(federation, std::time::Duration::from_secs(1))
        .await
        .expect("the holder must still own its claim after another kind's sweep");
}

fn delivered_job(recipient: &str, msg_id: &str) -> Job {
    job(&format!("delivery:{recipient}"), recipient, msg_id)
}

async fn deliver(queue: &SqliteQueue, recipient: &str, msg_id: &str, origin: DeliveryOrigin) {
    let queued = queue
        .enqueue_delivery(delivered_job(recipient, msg_id))
        .await
        .expect("enqueue delivery");
    let DeliveryEnqueue::Queued(id) = queued else {
        panic!("new message {msg_id} must queue");
    };
    let claimed = queue
        .claim(&[format!("delivery:{recipient}")], "delivery-worker")
        .await
        .expect("claim delivery")
        .expect("delivery row");
    assert_eq!(claimed.0, id);
    queue.ack_delivery(id, origin).await.expect("ack delivery");
}

#[tokio::test]
async fn delivered_id_and_origin_survive_queue_reconstruction() {
    let fresh = FreshStore::new();
    let pool = pij_store::open(&fresh.path()).await.expect("open");
    let queue = SqliteQueue::new(pool.clone(), 300, 2).expect("queue");
    deliver(
        &queue,
        "pij-recipient",
        "m-durable",
        DeliveryOrigin::VerifiedArrival,
    )
    .await;

    let restarted = SqliteQueue::new(pool, 300, 2).expect("restarted queue");
    assert_eq!(
        restarted
            .enqueue_delivery(delivered_job("pij-recipient", "m-durable"))
            .await
            .expect("consult durable ledger"),
        DeliveryEnqueue::AlreadyDelivered(DeliveryOrigin::VerifiedArrival)
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn concurrent_delivery_ack_and_duplicate_enqueue_never_create_a_second_row() {
    let fresh = FreshStore::new();
    let queue = Arc::new(
        SqliteQueue::new(pij_store::open(&fresh.path()).await.expect("open"), 300, 16)
            .expect("queue"),
    );
    let first = queue
        .enqueue_delivery(delivered_job("pij-race", "m-race"))
        .await
        .expect("enqueue first");
    let DeliveryEnqueue::Queued(first) = first else {
        panic!("first delivery must queue");
    };
    queue
        .claim(&["delivery:pij-race".to_string()], "worker")
        .await
        .expect("claim")
        .expect("running delivery");

    let barrier = Arc::new(Barrier::new(3));
    let ack = {
        let queue = Arc::clone(&queue);
        let barrier = Arc::clone(&barrier);
        tokio::spawn(async move {
            barrier.wait().await;
            queue.ack_delivery(first, DeliveryOrigin::ReaderRead).await
        })
    };
    let duplicate = {
        let queue = Arc::clone(&queue);
        let barrier = Arc::clone(&barrier);
        tokio::spawn(async move {
            barrier.wait().await;
            queue
                .enqueue_delivery(delivered_job("pij-race", "m-race"))
                .await
        })
    };
    barrier.wait().await;
    ack.await.expect("ack task").expect("ack");
    let duplicate = duplicate
        .await
        .expect("duplicate task")
        .expect("duplicate result");
    assert!(
        duplicate == DeliveryEnqueue::Queued(first)
            || duplicate == DeliveryEnqueue::AlreadyDelivered(DeliveryOrigin::ReaderRead),
        "the race may observe the live row or its delivered record, never a fresh row: {duplicate:?}"
    );
    assert_eq!(queue.live_len().await.expect("live count"), 0);
}

#[tokio::test]
async fn per_recipient_bound_evicts_oldest_without_weakening_other_recipients() {
    let fresh = FreshStore::new();
    let queue = SqliteQueue::new(pij_store::open(&fresh.path()).await.expect("open"), 300, 2)
        .expect("queue");
    deliver(&queue, "pij-a", "a-1", DeliveryOrigin::ReaderRead).await;
    deliver(&queue, "pij-b", "b-1", DeliveryOrigin::InjectedToTransport).await;
    deliver(&queue, "pij-a", "a-2", DeliveryOrigin::ReaderRead).await;
    deliver(&queue, "pij-a", "a-3", DeliveryOrigin::ReaderRead).await;

    assert!(matches!(
        queue
            .enqueue_delivery(delivered_job("pij-a", "a-1"))
            .await
            .expect("oldest id was forgotten"),
        DeliveryEnqueue::Queued(_)
    ));
    assert_eq!(
        queue
            .enqueue_delivery(delivered_job("pij-a", "a-2"))
            .await
            .expect("newer a id remains"),
        DeliveryEnqueue::AlreadyDelivered(DeliveryOrigin::ReaderRead)
    );
    assert_eq!(
        queue
            .enqueue_delivery(delivered_job("pij-b", "b-1"))
            .await
            .expect("hot recipient must not evict another recipient"),
        DeliveryEnqueue::AlreadyDelivered(DeliveryOrigin::InjectedToTransport)
    );
}

/// Review F12 — `note_delivered` is pinned against the REAL adapter, not only
/// the fake.
///
/// The claim and compensation witnesses both run against `FakeQueue`, and the
/// port's atomicity claim ("in ONE transaction... because a separate read and
/// write reintroduce exactly the check-then-act race") was asserted by nobody
/// against SQLite. That is round-1 F6's shape one layer down: the fake got the
/// semantics, the real adapter got the semantics, and no instrument compared
/// them.
#[tokio::test]
async fn note_delivered_claims_once_and_survives_reconstruction() {
    let fresh = FreshStore::new();
    let queue = crate_queue(&fresh).await;
    let recipient = SeatId::from("pij-real");

    assert_eq!(
        queue
            .note_delivered(&recipient, "m-1", DeliveryOrigin::ReaderRead)
            .await
            .expect("first claim"),
        None,
        "an unclaimed message is ours to deliver"
    );
    assert_eq!(
        queue
            .note_delivered(&recipient, "m-1", DeliveryOrigin::InjectedToTransport)
            .await
            .expect("second claim"),
        Some(DeliveryOrigin::ReaderRead),
        "a claimed message reports the ORIGINAL observation, not the new caller's guess"
    );

    // Same store, new queue object: the ledger is durable, not process state.
    drop(queue);
    let reopened = crate_queue(&fresh).await;
    assert_eq!(
        reopened
            .note_delivered(&recipient, "m-1", DeliveryOrigin::VerifiedArrival)
            .await
            .expect("claim after reconstruction"),
        Some(DeliveryOrigin::ReaderRead)
    );

    // A different recipient with the same id is a different message.
    assert_eq!(
        reopened
            .note_delivered(
                &SeatId::from("pij-other"),
                "m-1",
                DeliveryOrigin::ReaderRead
            )
            .await
            .expect("other recipient"),
        None
    );
}

/// The compensation half, against SQLite: a released claim must be re-claimable,
/// or a failed injection would suppress the retry of a message nobody received.
#[tokio::test]
async fn forget_delivered_releases_a_claim_on_the_real_adapter() {
    let fresh = FreshStore::new();
    let queue = crate_queue(&fresh).await;
    let recipient = SeatId::from("pij-real");

    queue
        .note_delivered(&recipient, "m-2", DeliveryOrigin::InjectedToTransport)
        .await
        .expect("claim");
    queue
        .forget_delivered(&recipient, "m-2")
        .await
        .expect("release");

    assert_eq!(
        queue
            .note_delivered(&recipient, "m-2", DeliveryOrigin::InjectedToTransport)
            .await
            .expect("re-claim"),
        None,
        "a released claim is claimable again: the message was never delivered"
    );
}
