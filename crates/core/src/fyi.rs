//! Held FYIs (plan 158): information that must not open a turn.
//!
//! `pij send --fyi` stores the message instead of delivering it. It rides along
//! appended to the recipient's next real delivery, or is claimed by a typed-turn
//! hook. Opening a turn re-reads the recipient's whole context, and in the
//! 2026-09-28 usage blowout 15% of spend was turns opened by acks and FYIs.
//!
//! [`render_block`] is the ONE definition of the block's text. The daemon renders
//! it, and every client passes it through verbatim. The golden fixture
//! `crates/testkit/fixtures/golden/fyi/block.txt` pins it.

use serde::{Deserialize, Serialize};

use crate::model::{Event, SeatId};

/// The `via` a ride-along claim records, prefixed onto the carrying message id.
pub const VIA_MESSAGE_PREFIX: &str = "message:";

/// The typed-turn hooks allowed to claim, as their `via` spelling.
pub const HOOK_VIAS: [&str; 4] = ["hook:claude", "hook:copilot", "hook:omp", "hook:pi"];

/// One held FYI.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeldFyi {
    /// The sender's message id, which identifies the FYI.
    pub id: String,
    /// Who it is for.
    pub recipient: SeatId,
    /// Who sent it.
    pub sender: SeatId,
    /// What it says.
    pub body: String,
    /// When it was held, in epoch ms.
    pub held_at_ms: u64,
}

/// Render the block for `fyis`, oldest first, at `utc_offset_minutes` local time.
///
/// Empty input renders an empty string, so a caller can't attach an empty header.
pub fn render_block(fyis: &[HeldFyi], utc_offset_minutes: i32) -> String {
    if fyis.is_empty() {
        return String::new();
    }
    let mut ordered: Vec<&HeldFyi> = fyis.iter().collect();
    ordered.sort_by(|a, b| a.held_at_ms.cmp(&b.held_at_ms).then(a.id.cmp(&b.id)));
    let mut block = if ordered.len() == 1 {
        "Also, 1 FYI was queued for you:".to_string()
    } else {
        format!("Also, {} FYIs were queued for you:", ordered.len())
    };
    for (index, fyi) in ordered.iter().enumerate() {
        let mut lines = fyi.body.lines();
        block.push_str(&format!(
            "\n{}. [from {}, {}] {}",
            index + 1,
            fyi.sender,
            clock_hh_mm(fyi.held_at_ms, utc_offset_minutes),
            lines.next().unwrap_or_default()
        ));
        for line in lines {
            block.push_str("\n   ");
            block.push_str(line);
        }
    }
    block
}

/// Append a rendered block after a message body.
pub fn append_block(body: &str, block: &str) -> String {
    if block.is_empty() {
        body.to_string()
    } else {
        format!("{body}\n\n{block}")
    }
}

fn clock_hh_mm(epoch_ms: u64, utc_offset_minutes: i32) -> String {
    let minutes = i64::try_from(epoch_ms / 60_000).unwrap_or(i64::MAX);
    let local = (minutes + i64::from(utc_offset_minutes)).rem_euclid(24 * 60);
    format!("{:02}:{:02}", local / 60, local % 60)
}

fn fyi_event(kind: &str, recipient: &SeatId, at: u64, payload: serde_json::Value) -> Event {
    Event {
        seq: None,
        v: 1,
        at,
        kind: kind.to_string(),
        seat: Some(recipient.clone()),
        payload: payload.to_string(),
    }
}

/// The `fyi.held` fact. The body stays in the store, not on the spine.
pub fn held_event(fyi: &HeldFyi) -> Event {
    fyi_event(
        "fyi.held",
        &fyi.recipient,
        fyi.held_at_ms,
        serde_json::json!({"id": fyi.id, "sender": fyi.sender, "held_at_ms": fyi.held_at_ms}),
    )
}

/// The `fyi.delivered` receipt for one atomic claim.
pub fn delivered_event(recipient: &SeatId, ids: &[String], via: &str, at: u64) -> Event {
    fyi_event(
        "fyi.delivered",
        recipient,
        at,
        serde_json::json!({"ids": ids, "via": via}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fyi(id: &str, sender: &str, body: &str, held_at_ms: u64) -> HeldFyi {
        HeldFyi {
            id: id.to_string(),
            recipient: SeatId("pij-r".to_string()),
            sender: SeatId(sender.to_string()),
            body: body.to_string(),
            held_at_ms,
        }
    }

    /// 14:02 and 14:10 UTC on 2026-09-29.
    const T_1402: u64 = 1_790_690_520_000;
    const T_1410: u64 = T_1402 + 8 * 60_000;

    #[test]
    fn the_block_matches_the_golden_fixture_oldest_first() {
        // Out of order on purpose: rendering sorts oldest first.
        let fyis = [
            fyi(
                "m-2",
                "pij-y",
                "reviewer is idle\nsecond line of the note",
                T_1410,
            ),
            fyi("m-1", "pij-x", "build is green on main", T_1402),
        ];
        assert_eq!(
            render_block(&fyis, 0),
            include_str!("../../testkit/fixtures/golden/fyi/block.txt")
        );
    }

    #[test]
    fn one_fyi_is_singular_and_none_renders_nothing() {
        assert_eq!(
            render_block(&[fyi("m", "pij-x", "hi", T_1402)], 0),
            "Also, 1 FYI was queued for you:\n1. [from pij-x, 14:02] hi"
        );
        assert_eq!(render_block(&[], 0), "");
        assert_eq!(append_block("body", ""), "body");
    }

    #[test]
    fn the_clock_uses_the_local_offset_and_wraps_midnight() {
        let block = render_block(&[fyi("m", "pij-x", "hi", T_1402)], 10 * 60);
        assert!(block.contains("[from pij-x, 00:02]"), "{block}");
        let block = render_block(&[fyi("m", "pij-x", "hi", T_1402)], -15 * 60);
        assert!(block.contains("[from pij-x, 23:02]"), "{block}");
    }

    #[test]
    fn the_block_follows_the_body_after_a_blank_line() {
        assert_eq!(append_block("do X", "Also, …"), "do X\n\nAlso, …");
    }
}
