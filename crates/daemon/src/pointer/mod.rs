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

/// Render the single line submitted to a pane when a message is waiting.
///
/// The pointer deliberately carries no count: queue cardinality is not exposed
/// at this boundary, and an announce-time count would immediately become stale.
#[must_use]
pub fn render_pointer(from: &SeatId) -> String {
    format!("[pij from {from}] message waiting — run: pij inbox")
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
        POINTER_ANNOUNCED_EVENT_KIND, render_command, render_pointer, retry_delay, submit_command,
    };

    #[test]
    fn pointer_bytes_name_sender_and_pull_command_without_body() {
        let body = "SECRET BODY THAT MUST NEVER BE TYPED";
        let line = render_pointer(&SeatId::from("pij-sender"));

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
    }

    #[test]
    fn every_pointer_uses_the_same_truthful_singular_line() {
        assert_eq!(
            render_pointer(&SeatId::from("pij-one")),
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
