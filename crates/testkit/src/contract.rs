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

use pij_core::model::{
    DeliveryOrigin, Event, Harness, Job, JobId, Outcome, Pane, SeatDescriptor, SeatId, Seq,
    SystemState,
};
use std::path::Path;

use pij_core::ports::{DeliveryAck, DeliveryEnqueue, Queue, Registry, SeatFilter, Spine, TmuxPort};

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

    let mut empty_descriptor = SeatDescriptor::new("pij-contract-empty", Harness::Pi, "/tmp/empty");
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

/// Every promise the [`Spine`] port makes, in one place.
///
/// # Panics
/// On the first broken promise, naming which one.
pub async fn spine_contract(spine: &dyn Spine) {
    let seat_a = SeatId::from("pij-spine-a");
    let seat_b = SeatId::from("pij-spine-b");
    assert!(
        spine
            .tail(None, Seq(0))
            .await
            .expect("initial tail")
            .is_empty(),
        "an empty spine tails as an empty list, not an error"
    );

    let event = |kind: &str, seat: Option<SeatId>, payload: &str| Event {
        seq: None,
        v: 1,
        at: 1_724_800_000_000,
        kind: kind.to_string(),
        seat,
        payload: payload.to_string(),
    };
    let first_event = event("report", Some(seat_a.clone()), "{\"n\":1}");
    let second_event = event("receipt", Some(seat_b.clone()), "");
    let third_event = event("future-kind", Some(seat_a.clone()), "opaque");
    let fourth_event = event("message", None, "fleet-wide");

    let first = spine
        .append(first_event.clone())
        .await
        .expect("first append");
    let second = spine
        .append(second_event.clone())
        .await
        .expect("second append");
    let third = spine
        .append(third_event.clone())
        .await
        .expect("third append");
    let fourth = spine
        .append(fourth_event.clone())
        .await
        .expect("fourth append");
    assert!(
        first < second && second < third && third < fourth,
        "append must allocate a strictly increasing total order"
    );

    let after_first = spine.tail(None, first).await.expect("tail after first");
    let mut expected_second = second_event;
    expected_second.seq = Some(second);
    let mut expected_third = third_event;
    expected_third.seq = Some(third);
    let mut expected_fourth = fourth_event;
    expected_fourth.seq = Some(fourth);
    assert_eq!(
        after_first,
        vec![
            expected_second.clone(),
            expected_third.clone(),
            expected_fourth.clone(),
        ],
        "tail is exclusive, oldest-first, assigns each durable cursor, and preserves opaque facts"
    );

    let just_a = spine
        .tail(Some(&seat_a), Seq(0))
        .await
        .expect("seat-filtered tail");
    let mut expected_first = first_event;
    expected_first.seq = Some(first);
    assert_eq!(
        just_a,
        vec![expected_first, expected_third.clone()],
        "a seat filter narrows without losing each returned event's durable cursor"
    );
    assert_eq!(
        spine
            .latest_matching(&seat_a, &["report", "future-kind"])
            .await
            .expect("latest matching"),
        Some(expected_third),
        "latest is mandatory-seat-scoped, kind-filtered, and returns one highest-seq fact"
    );
    assert!(
        spine
            .latest_matching(&seat_b, &["future-kind"])
            .await
            .expect("no matching kind")
            .is_none()
    );
    assert!(
        spine.latest_matching(&seat_a, &[]).await.is_err(),
        "empty kinds must refuse rather than broaden the bounded query"
    );
    assert_eq!(
        spine.tail(None, third).await.expect("tail after third"),
        vec![expected_fourth],
        "an event with no seat remains visible in an unfiltered tail"
    );
    assert!(
        spine
            .tail(None, fourth)
            .await
            .expect("tail newest")
            .is_empty(),
        "tail since the newest cursor is empty"
    );
    let older_message = event(
        "control-pointer",
        Some(seat_a.clone()),
        "{\"msg_id\":\"m-older\"}",
    );
    spine
        .append(older_message.clone())
        .await
        .expect("older per-message fact");
    spine
        .append(event(
            "control-pointer",
            Some(seat_a.clone()),
            "{\"msg_id\":\"m-newer\"}",
        ))
        .await
        .expect("newer per-message fact");
    let found = spine
        .latest_matching_message(&seat_a, "control-pointer", "m-older")
        .await
        .expect("bounded per-message lookup")
        .expect("older message fact remains addressable");
    assert_eq!(found.kind, "control-pointer");
    assert_eq!(found.payload, older_message.payload);
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
        attempt: 0,
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

    // Peek is observation only: repeated calls return the same row, and the row
    // remains available to the first real claimer.
    let peek_kind = vec!["peek-only".to_string()];
    let peek_id = queue
        .enqueue(Job {
            kind: peek_kind[0].clone(),
            serial_key: "seat-peek".to_string(),
            payload: "peek-body".to_string(),
            dedupe_key: "peek-1".to_string(),
            attempt: 0,
        })
        .await
        .expect("enqueue peek row");
    let first_peek = queue
        .peek(&peek_kind)
        .await
        .expect("peek")
        .expect("peek row");
    let second_peek = queue
        .peek(&peek_kind)
        .await
        .expect("peek again")
        .expect("same peek row");
    assert_eq!(first_peek, second_peek);
    assert_eq!(first_peek.0, peek_id);
    assert_eq!(first_peek.1.payload, "peek-body");
    let claimed_after_peek = queue
        .claim(&peek_kind, "peek-witness")
        .await
        .expect("claim after peek")
        .expect("peek did not consume row");
    assert_eq!(claimed_after_peek.0, peek_id);
    assert_eq!(
        queue.peek(&peek_kind).await.expect("peek claimed row"),
        Some(claimed_after_peek),
        "a non-destructive observer still sees a live row during another reader's claim"
    );

    // 5. Destination delivery dedupe spans terminal acknowledgement and replays
    //    the evidence that was actually recorded, not a synthetic queue claim.
    let delivery = Job {
        kind: "delivery:seat-delivered".to_string(),
        serial_key: "seat-delivered".to_string(),
        payload: "{}".to_string(),
        dedupe_key: "delivered-1".to_string(),
        attempt: 0,
    };
    let first = queue
        .enqueue_delivery(delivery.clone())
        .await
        .expect("enqueue delivery");
    let DeliveryEnqueue::Queued(first) = first else {
        panic!("a new delivery must queue");
    };
    assert_eq!(
        queue
            .enqueue_delivery(delivery.clone())
            .await
            .expect("collapse live delivery"),
        DeliveryEnqueue::Queued(first),
        "the durable ledger must not weaken live-row collapse"
    );
    let claimed = queue
        .claim(std::slice::from_ref(&delivery.kind), "delivery-worker")
        .await
        .expect("claim delivery")
        .expect("delivery row");
    assert_eq!(claimed.0, first);
    let acknowledged = queue
        .ack_delivery(first, DeliveryOrigin::ReaderRead)
        .await
        .expect("record delivered id");
    assert_eq!(
        acknowledged,
        DeliveryAck {
            recipient: SeatId::from("seat-delivered"),
            msg_id: "delivered-1".to_string(),
            origin: DeliveryOrigin::ReaderRead,
        },
        "ack authority returns identity from the claimed job"
    );
    assert_eq!(
        queue
            .enqueue_delivery(delivery)
            .await
            .expect("consult delivered id"),
        DeliveryEnqueue::AlreadyDelivered(DeliveryOrigin::ReaderRead)
    );

    // R4-AMEND-4, in the SHARED contract so fake and real cannot drift: the claim
    // is atomic, it reports the ORIGINAL observation rather than the new caller's
    // guess, and a released claim is claimable again.
    let claimant = SeatId::from("seat-claimed");
    assert_eq!(
        queue
            .note_delivered(&claimant, "claim-1", DeliveryOrigin::ReaderRead)
            .await
            .expect("first claim"),
        None
    );
    assert_eq!(
        queue
            .note_delivered(&claimant, "claim-1", DeliveryOrigin::InjectedToTransport)
            .await
            .expect("second claim"),
        Some(DeliveryOrigin::ReaderRead),
        "a claimed message reports what was ORIGINALLY observed"
    );
    queue
        .forget_delivered(&claimant, "claim-1")
        .await
        .expect("release the claim");
    assert_eq!(
        queue
            .note_delivered(&claimant, "claim-1", DeliveryOrigin::ReaderRead)
            .await
            .expect("re-claim"),
        None,
        "a released claim is claimable again: that delivery never happened"
    );

    // An UNCLAIMED ack is refused by both implementations (review round-1 F6,
    // which the contract never asserted).
    queue
        .ack(JobId(u64::MAX), Outcome::Done)
        .await
        .expect_err("acking a job nobody claimed must be refused");
}

/// A seat descriptor with the shape most contract tests want.
pub fn sample_seat(id: &str) -> SeatDescriptor {
    SeatDescriptor {
        state: SystemState::Idle,
        ..SeatDescriptor::new(id, Harness::Pi, "/tmp/pij-contract")
    }
}

/// Implementation-owned data required to run the destructive tmux contract.
///
/// The fixture, not the suite, creates and owns the isolated session. Real
/// fixtures must tear that session down from `Drop`, including unwind paths.
pub trait TmuxContractFixture {
    /// A pane owned exclusively by this contract run.
    fn pane(&self) -> &Pane;

    /// Exact initial capture prepared in the owned pane.
    fn initial_capture(&self) -> &str;

    /// Literal text the suite may type into the owned pane.
    fn sent_keys(&self) -> &str;

    /// Fragment that must be visible after [`TmuxPort::send_keys`].
    fn sent_keys_capture(&self) -> &str;

    /// Name for the disposable window the suite creates and kills.
    fn new_window_name(&self) -> &str;

    /// Caller-owned sink used for the pane-tap lifecycle.
    fn tap_sink(&self) -> &Path;
}

/// Every portable promise of [`TmuxPort`], over an implementation-owned fixture.
///
/// Adapter-specific safety properties (fresh-resolution kill brake, exact argv,
/// capture boundaries, and `pane_in_mode`) remain adapter tests because the
/// frozen fake intentionally records rather than implements those mechanisms.
///
/// # Panics
/// On the first broken promise, naming which operation disagreed.
pub async fn tmux_contract(tmux: &dyn TmuxPort, fixture: &dyn TmuxContractFixture) {
    let pane = fixture.pane();
    let listed = tmux.list_panes().await.expect("list_panes must not fail");
    assert!(
        listed.contains(pane),
        "the fixture pane must appear byte-identical in list_panes: {listed:?}"
    );

    assert_eq!(
        tmux.capture(&pane.id, 100)
            .await
            .expect("capture must not fail"),
        fixture.initial_capture(),
        "capture must return the fixture's visible text"
    );
    assert!(
        !tmux
            .user_typing(&pane.id)
            .await
            .expect("user_typing must not fail"),
        "the fixture starts outside a tmux interaction mode"
    );

    assert!(
        tmux.drain_pane_tap(&pane.id).await.is_err(),
        "an unattached tap is absent, not an empty observation"
    );
    assert_eq!(
        tmux.pane_tap_sink(&pane.id)
            .await
            .expect("tap ownership read before attach"),
        None
    );
    tmux.attach_pane_tap(&pane.id, fixture.tap_sink())
        .await
        .expect("attach_pane_tap must not fail");
    assert_eq!(
        tmux.pane_tap_sink(&pane.id)
            .await
            .expect("tap ownership read after attach"),
        Some(fixture.tap_sink().to_path_buf())
    );
    assert!(
        tmux.drain_pane_tap(&pane.id)
            .await
            .expect("an attached quiet tap must drain")
            .is_empty(),
        "a fresh quiet tap has no unread bytes"
    );
    tmux.detach_pane_tap(&pane.id)
        .await
        .expect("detach_pane_tap must not fail");
    assert_eq!(
        tmux.pane_tap_sink(&pane.id)
            .await
            .expect("tap ownership read after detach"),
        None
    );
    assert!(
        tmux.drain_pane_tap(&pane.id).await.is_err(),
        "a detached tap returns to absent"
    );

    tmux.send_keys(&pane.id, fixture.sent_keys())
        .await
        .expect("send_keys must not fail");
    let after_send = tmux
        .capture(&pane.id, 100)
        .await
        .expect("capture after send_keys must not fail");
    assert!(
        after_send.contains(fixture.sent_keys_capture()),
        "literal sent keys must become visible; expected {:?} in {after_send:?}",
        fixture.sent_keys_capture()
    );

    let mut staged = tmux
        .acquire_submit(&pane.id)
        .await
        .expect("acquire_submit must reserve the pane");
    tmux.stage_submit(&mut staged, "contract staged body")
        .await
        .expect("stage_submit must retain ownership");
    assert!(
        staged.staged,
        "successful staging updates the owned transaction"
    );
    tmux.commit_submit(&staged)
        .await
        .expect("commit_submit must submit and release ownership");
    let aborted = tmux
        .acquire_submit(&pane.id)
        .await
        .expect("a committed transaction releases the pane");
    assert_ne!(
        staged.token, aborted.token,
        "each transaction must receive a fresh ownership identity"
    );
    tmux.abort_submit(&aborted)
        .await
        .expect("abort_submit must release ownership without Enter");

    let created = tmux
        .new_window(&pane.session, fixture.new_window_name(), "/tmp", None)
        .await
        .expect("new_window must not fail");
    assert_eq!(
        created.session, pane.session,
        "new window stays in the fixture session"
    );
    assert_eq!(
        created.window,
        fixture.new_window_name(),
        "new window keeps its requested name"
    );

    tmux.kill(&created.id).await.expect("kill must not fail");
    let after_kill = tmux
        .list_panes()
        .await
        .expect("list after kill must not fail");
    assert!(
        after_kill
            .iter()
            .all(|candidate| candidate.id != created.id),
        "a killed pane must disappear from list_panes: {after_kill:?}"
    );
}
