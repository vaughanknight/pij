//! Pointer announcements for queued message bodies.
//!
//! A pointer tells a pane-bound seat to pull its durable inbox. It never carries
//! the queued body and therefore never claims that the body was delivered.

use std::time::Duration;

use pij_core::error::Result;
use pij_core::model::SeatId;
use pij_core::ports::TmuxPort;

mod worker;

pub use worker::DrainWorker;

/// Event emitted after the pointer line itself was submitted to the recipient.
pub const POINTER_ANNOUNCED_EVENT_KIND: &str = "delivery.pointer-announced";
/// Event emitted once when a seat exhausts its pointer announcement budget.
pub const POINTER_PARKED_EVENT_KIND: &str = "delivery.pointer-parked";
/// Event emitted when a successful inbox read resets a parked seat's budget.
pub const POINTER_UNPARKED_EVENT_KIND: &str = "delivery.pointer-unparked";

/// Injected pointer cadence and seat-level announcement budget.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PointerPolicy {
    /// Minimum time between pointers to the same seat.
    pub cadence: Duration,
    /// Maximum pointers between successful inbox reads.
    pub announcement_limit: u32,
}

/// Render the single line submitted to a pane when a message is waiting.
///
/// The pointer deliberately carries no count: queue cardinality is not exposed
/// at this boundary, and an announce-time count would immediately become stale.
#[must_use]
pub fn render_pointer(from: &SeatId, from_machine: Option<&str>) -> String {
    match from_machine {
        // A remote sender is named by ADDRESS. Two machines may hold seats with
        // the same name, and a pane line reading "[pij from bob]" leaves the
        // recipient unable to tell WHICH bob paged them — while the event they
        // would read instead already carries the machine (review F8).
        Some(machine) => format!("[pij from {from}@{machine}] message waiting — run: pij inbox"),
        None => format!("[pij from {from}] message waiting — run: pij inbox"),
    }
}

/// Render the final pointer that explains why future reminders will stop.
///
/// The announcer records that it POINTED, not that anyone will ever come. The
/// recipient therefore needs the final line to distinguish deliberate parking
/// from a dead daemon; the separate parked event serves operators.
#[must_use]
pub fn render_final_pointer(
    from: &SeatId,
    from_machine: Option<&str>,
    announcements: u32,
) -> String {
    let sender = match from_machine {
        Some(machine) => format!("{from}@{machine}"),
        None => from.to_string(),
    };
    format!(
        "[pij from {sender}] message waiting — final reminder; parked after {announcements} announcements — message remains queued; run: pij inbox when ready"
    )
}

/// Render an explicitly tagged remote-control command for PTY submission.
///
/// [`pij_core::model::Msg::command`] stores the bare verb. The slash is a PTY
/// presentation detail added here; body text is never inspected or rendered by
/// this function.
#[must_use]
pub fn render_command(command: &str) -> String {
    format!("/{command}")
}

/// Submit an explicitly tagged command as a PTY turn.
///
/// This calls [`TmuxPort::submit`], never [`TmuxPort::send_keys`]: typing text
/// and sending a turn are distinct observable actions.
pub async fn submit_command(tmux: &dyn TmuxPort, pane: &str, command: &str) -> Result<()> {
    tmux.submit(pane, &render_command(command)).await
}

/// Exponential retry delay for the durable attempt returned by the queue.
///
/// Attempt zero waits one second. Each retry doubles the delay until the
/// five-minute ceiling; the queue persists both the incremented attempt and the
/// not-before time atomically.
#[must_use]
pub fn retry_delay(attempt: u32) -> Duration {
    const MAX_SECONDS: u64 = 5 * 60;
    let seconds = 1_u64
        .checked_shl(attempt)
        .unwrap_or(u64::MAX)
        .min(MAX_SECONDS);
    Duration::from_secs(seconds)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use pij_core::model::SeatId;
    use pij_testkit::block_on;
    use pij_testkit::fakes::FakeTmux;

    use super::{
        POINTER_ANNOUNCED_EVENT_KIND, POINTER_PARKED_EVENT_KIND, POINTER_UNPARKED_EVENT_KIND,
        render_command, render_final_pointer, render_pointer, retry_delay, submit_command,
    };

    #[test]
    fn pointer_bytes_name_sender_and_pull_command_without_body() {
        let body = "SECRET BODY THAT MUST NEVER BE TYPED";
        let line = render_pointer(&SeatId::from("pij-sender"), None);
        assert_eq!(
            render_pointer(&SeatId::from("bob"), Some("desktop")),
            "[pij from bob@desktop] message waiting — run: pij inbox",
            "a remote sender is named by ADDRESS: two machines may both hold a bob"
        );

        assert_eq!(
            line,
            "[pij from pij-sender] message waiting — run: pij inbox"
        );
        assert!(!line.contains(body), "a pointer must never carry the body");
        assert!(
            !line.contains(['\n', '\r']),
            "a pointer is exactly one line"
        );
        assert_eq!(POINTER_ANNOUNCED_EVENT_KIND, "delivery.pointer-announced");
        assert_eq!(POINTER_PARKED_EVENT_KIND, "delivery.pointer-parked");
        assert_eq!(POINTER_UNPARKED_EVENT_KIND, "delivery.pointer-unparked");
    }

    #[test]
    fn final_pointer_explains_the_silence_to_the_recipient() {
        assert_eq!(
            render_final_pointer(&SeatId::from("pij-sender"), None, 3),
            "[pij from pij-sender] message waiting — final reminder; parked after 3 announcements — message remains queued; run: pij inbox when ready"
        );
        assert_eq!(
            render_final_pointer(&SeatId::from("bob"), Some("desktop"), 3),
            "[pij from bob@desktop] message waiting — final reminder; parked after 3 announcements — message remains queued; run: pij inbox when ready"
        );
    }

    #[test]
    fn every_pointer_uses_the_same_truthful_singular_line() {
        assert_eq!(
            render_pointer(&SeatId::from("pij-one"), None),
            "[pij from pij-one] message waiting — run: pij inbox"
        );
    }

    #[test]
    fn command_rendering_adds_the_pty_slash_to_the_bare_tag() {
        assert_eq!(render_command("compact"), "/compact");
        assert_eq!(render_command("new"), "/new");
    }

    #[test]
    fn command_submission_is_distinct_from_typing_without_sending() {
        let tmux = FakeTmux::new();
        block_on(submit_command(&tmux, "%7", "compact")).expect("submit command");
        assert_eq!(tmux.calls(), ["submit:%7:/compact"]);
    }

    #[test]
    fn durable_attempt_selects_exponential_backoff_capped_at_five_minutes() {
        for (attempt, seconds) in [(0, 1), (1, 2), (8, 256), (9, 300), (u32::MAX, 300)] {
            assert_eq!(retry_delay(attempt), Duration::from_secs(seconds));
        }
    }
}
