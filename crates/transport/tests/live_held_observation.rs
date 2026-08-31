//! Live observation: is `Held` reachable end to end against a real Claude CLI?
//!
//! This is the witness for plan 110 risk r1. It is `#[ignore]`d because it needs
//! a running Claude session, and it is deliberately the FIRST thing written:
//! it must be seen RED on the pre-fix tree, or its later green proves nothing
//! (`uds.rs`'s constructed-status test is the anti-pattern it exists to replace).
//!
//! Run it against a seat that was NOT launched with
//! `--settings '{"crossSessionInbound":"accept"}'` — an accepting recipient never
//! holds, so the held arm is only producible against a non-accepting seat:
//!
//! ```text
//! PIJ_LIVE_CLAUDE_PID=<pid> cargo test -p pij-transport --test live_held_observation -- --ignored --nocapture
//! ```
//!
//! The recipient's operator must NOT touch the approval dialog while it runs.
//! A `held` line arrives in ~70 ms; any human click is a later, separate event
//! and is recorded as an INPUT, never as the observation.

use std::env;
use std::time::{Duration, Instant};

use pij_core::model::{DeliveryOutcome, Harness, Msg, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::ports::Transport;
use pij_transport::UdsTransport;

fn live_pid() -> Option<u32> {
    env::var("PIJ_LIVE_CLAUDE_PID").ok()?.trim().parse().ok()
}

fn seat(pid: u32) -> SeatDescriptor {
    let mut seat = SeatDescriptor::new("pij-live-recipient", Harness::Claude, "/tmp");
    // `proc_start` is not consulted by discovery: the transport keys on the pid and
    // then matches the key file against the RECORD's proc_start, never the seat's.
    seat.proc = Some(ProcIdentity { pid, proc_start: 1 });
    // The transport refuses before any socket IO unless the seat is known to
    // accept inbound. The live recipient here is deliberately NOT configured to
    // accept — that is what makes it hold — so the capability is stamped for the
    // purposes of this observation only.
    seat.cross_session_inbound_accept = Some(true);
    seat
}

fn message(body: &str) -> Msg {
    Msg {
        from: SeatId::from("pij-fatal-woodpecker"),
        to: SeatId::from("pij-live-recipient"),
        body: body.to_string(),
        msg_id: format!("live-held-{}", std::process::id()),
        from_machine: None,
        in_reply_to: None,
        command: None,
    }
}

#[tokio::test]
#[ignore = "needs a live Claude session; set PIJ_LIVE_CLAUDE_PID"]
async fn an_unmarked_message_is_observed_held_on_the_live_wire() {
    let Some(pid) = live_pid() else {
        panic!("set PIJ_LIVE_CLAUDE_PID to a running, NON-accepting Claude session");
    };
    let transport = UdsTransport::new().expect("HOME must name the account owning ~/.claude");
    let seat = seat(pid);

    assert!(
        transport
            .can_deliver(&seat, &message("probe"))
            .await
            .expect("can_deliver"),
        "the live session at pid {pid} was not discoverable — check ~/.claude/sessions/{pid}.json"
    );

    let sent = Instant::now();
    let outcome = transport
        .deliver(
            &seat,
            &message(
                "plan 110 live held-observation probe. No marker, so this SHOULD be held for \
                 your approval. Please do not click anything.",
            ),
        )
        .await
        .expect("deliver");
    let elapsed = sent.elapsed();

    println!("outcome after {elapsed:?}: {outcome:?}");
    assert!(
        elapsed < Duration::from_secs(5),
        "held is a machine outcome and arrives in ~70ms; {elapsed:?} suggests this waited on a human"
    );
    match outcome {
        DeliveryOutcome::Held { reason } => {
            println!("HELD observed on the live wire, reason: {reason}");
        }
        other => panic!(
            "expected Held from a non-accepting recipient, got {other:?}. \
             This is the r1 failure: Held is still unreachable."
        ),
    }
}
