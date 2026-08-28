//! Shared contract suites — one seam, one suite.
//!
//! Tenet 2: freeze the contract WITH its proof. A port's meaning lives here, not
//! in each implementation's own tests, so the fake and the real adapter answer
//! the SAME questions. When the SQLite `Registry` lands at tk-d4c3 it runs
//! [`registry_contract`] unchanged; if it disagrees with the fake, exactly one of
//! them is wrong and the suite says which assertion caught it.
//!
//! Each suite is `async` and takes `&dyn Port`, so it composes with any runtime:
//! core's tests drive it with [`crate::block_on`], adapters with tokio.

use pij_core::model::{Harness, Job, JobId, Outcome, SeatDescriptor, SeatId, SystemState};
use pij_core::ports::{Queue, Registry, SeatFilter};

/// Every promise the [`Registry`] port makes, in one place.
///
/// # Panics
/// On the first broken promise, naming which one.
pub async fn registry_contract(registry: &dyn Registry) {
    let id = SeatId::from("pij-contract-seat");

    // 1. An absent ROW is distinct from every value inside a present row.
    assert_eq!(
        registry.get(&id).await.expect("get must not fail"),
        None,
        "a seat that was never written must read back as absent, not as a default row"
    );

    // 2. SQL NULL and the empty string remain distinct values on a present row.
    let null_descriptor = SeatDescriptor::new(id.clone(), Harness::Pi, "/tmp/contract");
    let first = registry
        .put(null_descriptor.clone())
        .await
        .expect("put must not fail");
    assert_eq!(
        registry.get(&id).await.expect("get must not fail"),
        Some(null_descriptor.clone()),
        "a descriptor containing nullable fields must round-trip in full"
    );

    let mut empty_descriptor =
        SeatDescriptor::new("pij-contract-empty", Harness::Pi, "/tmp/empty");
    empty_descriptor.pane = Some(String::new());
    let second = registry
        .put(empty_descriptor.clone())
        .await
        .expect("put must not fail");
    assert_eq!(
        registry
            .get(&empty_descriptor.id)
            .await
            .expect("get must not fail"),
        Some(empty_descriptor.clone()),
        "an empty string is a value, not SQL NULL or an absent row"
    );

    // 3. Sequence numbers advance across writes.
    let third = registry
        .put(null_descriptor.clone())
        .await
        .expect("put must not fail");
    assert!(
        first < second && second < third,
        "sequence numbers must advance: got {first:?}, {second:?}, {third:?}"
    );

    // 4. Filters narrow, while an absent filter field means "do not filter".
    let others = registry
        .list(SeatFilter {
            harness: Some(Harness::Claude),
            ..SeatFilter::default()
        })
        .await
        .expect("list must not fail");
    assert!(
        others.is_empty(),
        "a filter must exclude non-matching seats; got {others:?}"
    );
    let empty_folder = registry
        .list(SeatFilter {
            folder: Some(String::new()),
            ..SeatFilter::default()
        })
        .await
        .expect("list must not fail");
    assert!(
        empty_folder.is_empty(),
        "an empty filter value is an exact value, not an absent filter"
    );
    let all = registry
        .list(SeatFilter::default())
        .await
        .expect("list must not fail");
    assert_eq!(all.len(), 2, "the default filter matches every row");

    // 5. A tombstone keeps the row, its marker and its reason observable through
    // both read operations. A seat that vanishes takes its post-mortem with it.
    let tombstone_seq = registry
        .tombstone(&id, "contract test")
        .await
        .expect("tombstone must not fail");
    assert!(tombstone_seq > third, "a tombstone is an ordered write");
    let tombstoned = registry
        .get(&id)
        .await
        .expect("get must not fail")
        .expect("a tombstoned seat remains readable");
    assert!(
        tombstoned.tombstoned_at.is_some(),
        "the post-mortem must expose when the tombstone was recorded"
    );
    assert_eq!(
        tombstoned.tombstone_reason.as_deref(),
        Some("contract test"),
        "the post-mortem must expose why the seat was tombstoned"
    );
    let listed = registry
        .list(SeatFilter::default())
        .await
        .expect("list must not fail");
    assert_eq!(
        listed.iter().find(|seat| seat.id == id),
        Some(&tombstoned),
        "get and list must expose identical tombstone facts"
    );

    // 6. Re-registering a live descriptor clears its old tombstone; otherwise a
    // live seat remains dead according to the same row.
    registry
        .put(null_descriptor.clone())
        .await
        .expect("put must revive the row");
    assert_eq!(
        registry.get(&id).await.expect("get must not fail"),
        Some(null_descriptor),
        "putting a live descriptor must clear the prior tombstone"
    );

    // 7. Tombstoning a seat that was never there is an error, not pretend work.
    let missing = SeatId::from("pij-never-existed");
    assert!(
        registry.tombstone(&missing, "nope").await.is_err(),
        "tombstoning an absent seat must fail loudly"
    );
}

/// Every promise the [`Queue`] port makes (R4).
///
/// # Panics
/// On the first broken promise, naming which one.
pub async fn queue_contract(queue: &dyn Queue) {
    let kinds = vec!["deliver".to_string()];

    let job = |dedupe: &str, serial: &str| Job {
        kind: "deliver".to_string(),
        serial_key: serial.to_string(),
        payload: "{}".to_string(),
        dedupe_key: dedupe.to_string(),
    };

    // 1. Dedupe: N rapid submits collapse to ONE live row, and every caller gets
    //    the id of that row rather than a fresh one it will wait on for ever.
    let first = queue.enqueue(job("d1", "seat-a")).await.expect("enqueue");
    let again = queue.enqueue(job("d1", "seat-a")).await.expect("enqueue");
    assert_eq!(
        first, again,
        "a duplicate submit must return the live row's id, not a new one"
    );

    // 2. Serialization: two jobs for the same entity are never claimed at once.
    queue.enqueue(job("d2", "seat-a")).await.expect("enqueue");
    let claimed = queue
        .claim(&kinds, "worker-1")
        .await
        .expect("claim")
        .expect("a job is available");
    let blocked = queue.claim(&kinds, "worker-2").await.expect("claim");
    assert!(
        blocked.is_none(),
        "a second job for a busy serial key must not be claimable: got {blocked:?}"
    );

    // 3. Acking frees the key, and the next job becomes claimable — otherwise
    //    one entity's queue wedges for ever after a single job.
    queue.ack(claimed.0, Outcome::Done).await.expect("ack");
    let next = queue.claim(&kinds, "worker-2").await.expect("claim");
    assert!(
        next.is_some(),
        "acking must free the serial key for the next job"
    );

    // 4. A kind nobody asked for is not claimed.
    let none: Option<(JobId, Job)> = queue
        .claim(&["never-enqueued".to_string()], "worker-3")
        .await
        .expect("claim");
    assert!(none.is_none(), "claim must respect the kind filter");
}

/// A seat descriptor with the shape most contract tests want.
pub fn sample_seat(id: &str) -> SeatDescriptor {
    SeatDescriptor {
        state: SystemState::Idle,
        ..SeatDescriptor::new(id, Harness::Pi, "/tmp/pij-contract")
    }
}
