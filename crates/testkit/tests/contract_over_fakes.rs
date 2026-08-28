//! The port-contract exemplar (tk-ddf1) — the tier-2 shape later units copy.
//!
//! One suite per seam, run here against the shipped fake. When the SQLite
//! `Registry` lands at tk-d4c3 it runs the SAME function; nothing in
//! `pij_testkit::contract` knows which implementation it is judging. That is what
//! stops "green with the fake" and "green for real" from drifting apart, and it
//! is why the contract ships in wave 0 rather than with the first adapter.

use pij_core::model::{DeliveryOutcome, Harness, Liveness, Msg, ProcIdentity, Readiness};
use pij_core::ports::{HarnessPort, LivenessPort, TmuxPort, Transport};
use pij_testkit::block_on;
use pij_testkit::contract::{queue_contract, registry_contract, sample_seat, spine_contract};
use pij_testkit::fakes::{
    FakeHarness, FakeLiveness, FakeQueue, FakeRegistry, FakeSpine, FakeTmux, FakeTransport,
};

#[test]
fn fake_registry_honours_the_registry_contract() {
    let registry = FakeRegistry::new();
    block_on(registry_contract(&registry));
}

#[test]
fn fake_spine_honours_the_spine_contract() {
    let spine = FakeSpine::new();
    block_on(spine_contract(&spine));
}

#[test]
fn fake_queue_honours_the_queue_contract() {
    let queue = FakeQueue::new();
    block_on(queue_contract(&queue));
}

#[test]
fn fakes_record_what_the_code_did_not_only_what_it_returned() {
    // The recorder is the reason these are fakes and not stubs: a test can
    // assert the SEQUENCE of interactions, which is where delivery bugs live.
    let registry = FakeRegistry::new();
    block_on(registry_contract(&registry));

    let calls = registry.calls();
    assert!(
        calls.first().is_some_and(|c| c.starts_with("get:")),
        "the contract's first act is a read of an absent seat: {calls:?}"
    );
    assert!(
        calls.iter().any(|c| c.starts_with("tombstone:")),
        "the contract must have tombstoned a seat: {calls:?}"
    );
}

#[test]
fn an_unreachable_transport_queues_rather_than_claiming_delivery() {
    // TS defect #1: a message sent before the seat bound reported success and
    // vanished. The honest answer is Queued, and the message must NOT appear in
    // `delivered()`.
    let transport = FakeTransport::unreachable();
    let seat = sample_seat("pij-prebind");
    let msg = Msg {
        from: "pij-sender".into(),
        to: seat.id.clone(),
        body: "before you bound".to_string(),
        msg_id: "m-1".to_string(),
    };

    let outcome = block_on(transport.deliver(&seat, &msg)).expect("deliver");

    assert_eq!(outcome, DeliveryOutcome::Queued);
    assert!(
        transport.delivered().is_empty(),
        "a queued message must not be counted as delivered"
    );
    assert_eq!(
        transport.calls(),
        vec!["deliver:pij-prebind:m-1".to_string()]
    );
}

#[test]
fn a_reachable_transport_delivers_and_records_the_message_id() {
    let transport = FakeTransport::reachable();
    let seat = sample_seat("pij-bound");
    let msg = Msg {
        from: "pij-sender".into(),
        to: seat.id.clone(),
        body: "hello".to_string(),
        msg_id: "m-2".to_string(),
    };

    assert!(block_on(transport.can_deliver(&seat)).expect("can_deliver"));
    assert_eq!(
        block_on(transport.deliver(&seat, &msg)).expect("deliver"),
        DeliveryOutcome::Delivered
    );
    assert_eq!(transport.delivered(), vec![msg]);
}

#[test]
fn the_tmux_fake_scripts_a_pane_that_changes_between_polls() {
    // The readiness-anchor class: a pane whose footer rotates through
    // placeholders before the real anchor appears. A fake that returns one fixed
    // capture cannot express it, so this one queues them.
    let tmux = FakeTmux::new()
        .script_capture("thinking…")
        .script_capture("pij-rs ready");

    assert_eq!(
        block_on(tmux.capture("%1", 5)).expect("capture"),
        "thinking…"
    );
    assert_eq!(
        block_on(tmux.capture("%1", 5)).expect("capture"),
        "pij-rs ready"
    );
    // Unscripted: an empty pane, not a panic. A double that explodes on an
    // unexpected call makes the test about the double.
    assert_eq!(block_on(tmux.capture("%1", 5)).expect("capture"), "");
}

#[test]
fn the_typing_gate_is_consulted_and_answers_honestly() {
    let tmux = FakeTmux::new().with_user_typing();
    assert!(block_on(tmux.user_typing("%1")).expect("user_typing"));
    assert!(
        !block_on(FakeTmux::new().user_typing("%1")).expect("user_typing"),
        "an unscripted tmux reports nobody typing — the gate must not block by default"
    );
}

#[test]
fn an_unscripted_readiness_says_what_it_observed() {
    let harness = FakeHarness::new(Harness::Codex);
    assert_eq!(harness.kind(), Harness::Codex);

    match block_on(harness.readiness("%1")).expect("readiness") {
        Readiness::NotYet { observed } => assert!(
            !observed.is_empty(),
            "NotYet must carry what WAS seen — a bare timeout is undiagnosable"
        ),
        other => panic!("an unscripted harness cannot be ready: {other:?}"),
    }
}

#[test]
fn the_harness_busy_gate_is_scriptable_and_defaults_to_not_busy() {
    // `busy(pane)` is part of the SETTLED HarnessPort (services.dd.md:45) and was
    // missing from the first draft of ports.rs — caught in review. It is the
    // BUSY_RE-class seam: one place per harness where "is it mid-turn" is decided.
    let harness = FakeHarness::new(Harness::Pi)
        .script_busy(true)
        .script_busy(false);

    assert!(block_on(harness.busy("%1")).expect("busy"));
    assert!(!block_on(harness.busy("%1")).expect("busy"));
    assert!(
        !block_on(FakeHarness::new(Harness::Pi).busy("%1")).expect("busy"),
        "unscripted means NOT busy — a fake that claims mid-turn by default makes \
         every delivery test arrange its way out of a state it never asked for"
    );
}

#[test]
fn liveness_tells_recycled_from_active_and_dead() {
    // The verdict that TS got wrong in both directions. Pure core logic over one
    // observed fact, so all three branches are one line each to arrange.
    let bound = ProcIdentity {
        pid: 4242,
        proc_start: 1_000,
    };

    let active = FakeLiveness::new().with_proc(bound);
    assert_eq!(
        block_on(pij_core::liveness::alive(bound, &active)).expect("alive"),
        Liveness::Active
    );

    let gone = FakeLiveness::new();
    assert!(matches!(
        block_on(pij_core::liveness::alive(bound, &gone)).expect("alive"),
        Liveness::Dead { .. }
    ));

    let recycled = FakeLiveness::new().with_recycled(4242, 9_999);
    assert_eq!(
        block_on(pij_core::liveness::alive(bound, &recycled)).expect("alive"),
        Liveness::Recycled {
            observed_start: 9_999,
            recorded_start: 1_000,
        },
        "a different process at the same pid is NEITHER alive nor dead — reporting \
         Active addresses a stranger, reporting Dead hides the reuse"
    );

    // The port itself stays narrow: one fact, no verdict.
    assert_eq!(
        block_on(active.proc_start(4242)).expect("proc_start"),
        Some(1_000)
    );
}
