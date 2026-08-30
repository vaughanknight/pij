//! Pointer announcements for queued message bodies.
//!
//! A pointer tells a pane-bound seat to pull its durable inbox. It never carries
//! the queued body and therefore never claims that the body was delivered.

use std::num::NonZeroUsize;

use pij_core::model::SeatId;

/// Event emitted after the pointer line itself was submitted to the recipient.
pub const POINTER_ANNOUNCED_EVENT_KIND: &str = "delivery.pointer-announced";

/// Render the single line submitted to a pane when messages are waiting.
///
/// `count` is the total number of messages waiting for the recipient at announce
/// time, not the number of pointer announcements. [`NonZeroUsize`] makes a
/// pointer announcing an empty inbox unrepresentable.
#[must_use]
pub fn render_pointer(from: &SeatId, count: NonZeroUsize) -> String {
    let noun = if count.get() == 1 {
        "message"
    } else {
        "messages"
    };
    format!("[pij from {from}] {count} {noun} waiting — run: pij inbox")
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

#[cfg(test)]
mod tests {
    use std::num::NonZeroUsize;

    use pij_core::model::SeatId;

    use super::{POINTER_ANNOUNCED_EVENT_KIND, render_command, render_pointer};

    #[test]
    fn pointer_bytes_name_sender_waiting_count_and_pull_command_without_body() {
        let body = "SECRET BODY THAT MUST NEVER BE TYPED";
        let line = render_pointer(
            &SeatId::from("pij-sender"),
            NonZeroUsize::new(3).expect("non-zero count"),
        );

        assert_eq!(
            line,
            "[pij from pij-sender] 3 messages waiting — run: pij inbox"
        );
        assert!(!line.contains(body), "a pointer must never carry the body");
        assert!(
            !line.contains(['\n', '\r']),
            "a pointer is exactly one line"
        );
        assert_eq!(POINTER_ANNOUNCED_EVENT_KIND, "delivery.pointer-announced");
    }

    #[test]
    fn one_waiting_message_uses_truthful_singular_grammar() {
        assert_eq!(
            render_pointer(
                &SeatId::from("pij-one"),
                NonZeroUsize::new(1).expect("non-zero count"),
            ),
            "[pij from pij-one] 1 message waiting — run: pij inbox"
        );
    }

    #[test]
    fn command_rendering_adds_the_pty_slash_to_the_bare_tag() {
        assert_eq!(render_command("compact"), "/compact");
        assert_eq!(render_command("new"), "/new");
    }
}
