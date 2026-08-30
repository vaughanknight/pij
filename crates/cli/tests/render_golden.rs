//! Computed response payloads are byte-goldened; editorial help is not.

use pij_cli::render;
use pij_core::model::{
    DeliveryOutcome, Envelope, Harness, ProcIdentity, Receipt, SeatDescriptor, SystemState,
};
use pij_testkit::golden;

fn registered_seat() -> SeatDescriptor {
    let mut seat = SeatDescriptor::new("pij-cli-golden", Harness::Omp, "/work/pij");
    seat.pane = Some("%42".to_string());
    seat.proc = Some(ProcIdentity {
        pid: 4242,
        proc_start: 20260830123456,
    });
    seat.spawn_id = Some("s-golden".to_string());
    seat.model = Some("github-copilot/gpt-5.6-sol-fast".to_string());
    seat.provider = Some("github-copilot".to_string());
    seat.effort = Some("high".to_string());
    seat
}

#[test]
fn register_computed_payload_matches_the_committed_golden() {
    let actual = render(&Envelope::ok("pij register", registered_seat()), true);

    golden::assert_golden("cli/register-envelope.json", &actual);
}

#[test]
fn send_computed_payload_matches_the_committed_golden() {
    let actual = render(
        &Envelope::ok(
            "pij send",
            Receipt {
                msg_id: "m-golden".to_string(),
                outcome: DeliveryOutcome::Queued,
                at: 1_787_999_999_000,
            },
        ),
        true,
    );

    golden::assert_golden("cli/send-envelope.json", &actual);
}

#[test]
fn list_computed_payload_matches_the_committed_golden() {
    let first = registered_seat();
    let mut second = SeatDescriptor::new("pij-paneless", Harness::Claude, "/work/other");
    second.state = SystemState::Working;
    second.relay = true;
    let actual = render(&Envelope::ok("pij list", vec![first, second]), true);

    golden::assert_golden("cli/list-envelope.json", &actual);
}
