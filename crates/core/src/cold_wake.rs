//! The cold-wake guard (plan 157 phase 2, ruling #446).
//!
//! Waking a seat whose prompt cache has expired re-writes its whole context at
//! cache-write prices. On a large seat that costs dollars per message, and the
//! 2026-09-28 usage blowout was made of exactly these wakes. So `pij send`
//! refuses a message to a seat that is cold (large, idle past the cache TTL,
//! and not working), unless the sender forces it with a reason.
//!
//! **This is a brake, not a policy.** It can only refuse. It never changes what
//! is delivered or how. Every fact it cannot establish (unsupported harness,
//! source failure, no transcript, unknown context or last-call time) allows the
//! send and says so. Removing the guard delivers the same messages or more.

use serde::{Deserialize, Serialize};

use crate::model::{SeatId, SystemState};
use crate::session_status::{Fact, SessionStatusBlock};

/// A seat holding more than this many context tokens is large enough to guard.
pub const COLD_CONTEXT_TOKENS: u64 = 300_000;

/// A seat whose last API call is older than this has lost its prompt cache.
pub const COLD_IDLE_MS: u64 = 60 * 60 * 1_000;

/// The refusal's stable code.
pub const COLD_WAKE_CODE: &str = "E-RS-COLD-WAKE";

/// The spine kind recording every forced cold wake: the audit trail.
pub const COLD_WAKE_FORCED_KIND: &str = "send.cold-wake-forced";

/// List price of a 1-hour prompt-cache write, in US dollars per million tokens.
/// An ESTIMATE for the refusal message only; it never decides anything. Keys
/// are [`price_key`] form: no provider prefix, `-` between version numbers.
pub const CACHE_WRITE_USD_PER_MTOK: &[(&str, f64)] = &[("claude-opus-5-5", 8.0)];

/// The price-table key for a harness's model id. Harnesses name one model
/// differently: Claude Code says `claude-opus-5-5`, OMP says
/// `github-copilot/claude-opus-5.5`. Drop any provider prefix and spell the
/// version with dashes.
pub fn price_key(model: &str) -> String {
    model.rsplit('/').next().unwrap_or(model).replace('.', "-")
}

/// What the guard concluded for one recipient.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "kebab-case")]
pub enum ColdCheck {
    /// Not cold: small, recently called, or both.
    Clear,
    /// The daemon sees the seat working, so it is warm by definition.
    Busy,
    /// Large and idle past the TTL: refuse unless forced.
    #[serde(rename_all = "camelCase")]
    Cold {
        /// Tokens the wake would re-write.
        context_tokens: u64,
        /// Milliseconds since the seat's last API call.
        idle_ms: u64,
        /// The seat's current model, when known.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
        /// Estimated list cost of the wake, when the model is priced.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        estimate_usd: Option<f64>,
    },
    /// A fact the rule needs is unknown, so the send is allowed.
    Unknown {
        /// Which fact, or which failure.
        why: String,
    },
}

impl ColdCheck {
    /// The receipt's `cold_check` line: `clear`, `busy`, `forced` or `unknown: <why>`.
    pub fn receipt_label(&self, forced: bool) -> String {
        match self {
            Self::Clear => "clear".to_string(),
            Self::Busy => "busy".to_string(),
            Self::Cold { .. } if forced => "forced".to_string(),
            Self::Cold { .. } => "cold".to_string(),
            Self::Unknown { why } => format!("unknown: {why}"),
        }
    }
}

/// Decide one recipient. `state` is the daemon's own busy/idle observation;
/// `status` is the `pij state` session block; `now_ms` is the daemon clock.
pub fn check(state: SystemState, status: &SessionStatusBlock, now_ms: u64) -> ColdCheck {
    if state == SystemState::Working {
        return ColdCheck::Busy;
    }
    let status = match status {
        SessionStatusBlock::Known { status, .. } => status,
        SessionStatusBlock::Unbound => return unknown("no harness session bound"),
        SessionStatusBlock::Unsupported { harness } => {
            return unknown(&format!("{} sessions are not readable", harness.as_str()));
        }
        SessionStatusBlock::NotFound { .. } => return unknown("no transcript found"),
        SessionStatusBlock::Failed { error } => return unknown(&format!("source failed: {error}")),
    };
    let Some(&context_tokens) = status.context_used_tokens.value() else {
        return unknown("context size unknown");
    };
    if context_tokens <= COLD_CONTEXT_TOKENS {
        return ColdCheck::Clear;
    }
    let Some(&last_call) = status.last_call_at_ms.value() else {
        return unknown("last call time unknown");
    };
    // A last call stamped in the future (clock skew) counts as just made.
    let idle_ms = now_ms.saturating_sub(last_call);
    if idle_ms <= COLD_IDLE_MS {
        return ColdCheck::Clear;
    }
    let model = match &status.model {
        Fact::Known { value, .. } => Some(value.clone()),
        Fact::Unknown => None,
    };
    let estimate_usd = model.as_deref().and_then(|model| {
        let key = price_key(model);
        CACHE_WRITE_USD_PER_MTOK
            .iter()
            .find(|(priced, _)| *priced == key)
            .map(|(_, usd)| context_tokens as f64 * usd / 1_000_000.0)
    });
    ColdCheck::Cold {
        context_tokens,
        idle_ms,
        model,
        estimate_usd,
    }
}

fn unknown(why: &str) -> ColdCheck {
    ColdCheck::Unknown {
        why: why.to_string(),
    }
}

/// Is the seat known WARM (plan 159's FYI flush)? Working now, or its last API
/// call is known and within [`COLD_IDLE_MS`]. Anything unknown is not warm, so a
/// flush can never be the thing that wakes a cold seat.
pub fn is_warm(state: SystemState, status: &SessionStatusBlock, now_ms: u64) -> bool {
    if state == SystemState::Working {
        return true;
    }
    let SessionStatusBlock::Known { status, .. } = status else {
        return false;
    };
    status
        .last_call_at_ms
        .value()
        .is_some_and(|&last_call| now_ms.saturating_sub(last_call) <= COLD_IDLE_MS)
}

/// The refusal a sender sees, naming the price and both ways forward.
pub fn refusal(recipient: &SeatId, check: &ColdCheck) -> Option<String> {
    let ColdCheck::Cold {
        context_tokens,
        idle_ms,
        estimate_usd,
        ..
    } = check
    else {
        return None;
    };
    let price = estimate_usd.map_or_else(
        || " (price unknown for this model)".to_string(),
        |usd| format!(" ≈ ${usd:.2} at list price"),
    );
    Some(format!(
        "{COLD_WAKE_CODE}: {recipient} is cold (idle {}, {} context). Waking it rewrites ~{} tokens{price}. \
         Use --fyi to hold it, or --force --reason \"<why>\".",
        human_duration(*idle_ms),
        human_tokens(*context_tokens),
        human_tokens(*context_tokens),
    ))
}

fn human_duration(ms: u64) -> String {
    let minutes = ms / 60_000;
    match (minutes / 60, minutes % 60) {
        (0, minutes) => format!("{minutes}m"),
        (hours, 0) => format!("{hours}h"),
        (hours, minutes) => format!("{hours}h{minutes:02}m"),
    }
}

fn human_tokens(tokens: u64) -> String {
    if tokens >= 1_000_000 {
        format!("{:.1}M", tokens as f64 / 1_000_000.0)
    } else {
        format!("{}k", tokens / 1_000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Harness;
    use crate::session_status::{Fact, SeatStatus};

    const NOW: u64 = 10 * 60 * 60 * 1_000;

    fn known(
        context: Option<u64>,
        last_call: Option<u64>,
        model: Option<&str>,
    ) -> SessionStatusBlock {
        SessionStatusBlock::Known {
            status: Box::new(SeatStatus {
                model: model.map_or(Fact::Unknown, |m| Fact::native(m.to_string())),
                context_used_tokens: context.map_or(Fact::Unknown, Fact::derived),
                last_call_at_ms: last_call.map_or(Fact::Unknown, Fact::native),
                ..SeatStatus::unknown()
            }),
            cache_state: Fact::Unknown,
            elapsed_ms: 0,
        }
    }

    /// The same model reported three ways (Claude Code, OMP's provider-qualified
    /// id, a dotted version) is one price, not "unknown".
    #[test]
    fn a_provider_qualified_or_dotted_model_id_finds_its_price() {
        let idle = 2 * COLD_IDLE_MS;
        for model in [
            "claude-opus-5-5",
            "claude-opus-5.5",
            "github-copilot/claude-opus-5.5",
            "anthropic/claude-opus-5-5",
        ] {
            let ColdCheck::Cold { estimate_usd, .. } = check(
                SystemState::Idle,
                &known(Some(500_000), Some(NOW - idle), Some(model)),
                NOW,
            ) else {
                panic!("{model}: expected cold");
            };
            assert_eq!(estimate_usd, Some(4.0), "{model}");
        }
    }

    #[test]
    fn warm_means_working_or_a_known_recent_last_call() {
        let unknown = SessionStatusBlock::Unbound;
        assert!(is_warm(SystemState::Working, &unknown, NOW));
        assert!(!is_warm(SystemState::Idle, &unknown, NOW));
        assert!(is_warm(
            SystemState::Idle,
            &known(None, Some(NOW - COLD_IDLE_MS), None),
            NOW
        ));
        assert!(!is_warm(
            SystemState::Idle,
            &known(None, Some(NOW - COLD_IDLE_MS - 1), None),
            NOW
        ));
        assert!(!is_warm(
            SystemState::Idle,
            &known(Some(10), None, None),
            NOW
        ));
        // Small context changes nothing: warmth is about the cache, not size.
        assert!(!is_warm(
            SystemState::Idle,
            &known(Some(10), Some(NOW - 2 * COLD_IDLE_MS), None),
            NOW
        ));
    }

    #[test]
    fn a_large_seat_idle_past_the_ttl_is_cold_with_its_price() {
        let idle = 112 * 60 * 1_000;
        let check = check(
            SystemState::Idle,
            &known(Some(720_000), Some(NOW - idle), Some("claude-opus-5-5")),
            NOW,
        );
        assert_eq!(
            check,
            ColdCheck::Cold {
                context_tokens: 720_000,
                idle_ms: idle,
                model: Some("claude-opus-5-5".to_string()),
                estimate_usd: Some(5.76),
            }
        );
        assert_eq!(
            refusal(&SeatId("pij-x".into()), &check).unwrap(),
            "E-RS-COLD-WAKE: pij-x is cold (idle 1h52m, 720k context). Waking it rewrites ~720k \
             tokens ≈ $5.76 at list price. Use --fyi to hold it, or --force --reason \"<why>\"."
        );
    }

    #[test]
    fn the_thresholds_are_strict_boundaries() {
        let at_ttl = known(
            Some(COLD_CONTEXT_TOKENS + 1),
            Some(NOW - COLD_IDLE_MS),
            None,
        );
        assert_eq!(check(SystemState::Idle, &at_ttl, NOW), ColdCheck::Clear);
        let at_size = known(
            Some(COLD_CONTEXT_TOKENS),
            Some(NOW - COLD_IDLE_MS - 1),
            None,
        );
        assert_eq!(check(SystemState::Idle, &at_size, NOW), ColdCheck::Clear);
        let over_both = known(
            Some(COLD_CONTEXT_TOKENS + 1),
            Some(NOW - COLD_IDLE_MS - 1),
            None,
        );
        assert!(matches!(
            check(SystemState::Idle, &over_both, NOW),
            ColdCheck::Cold {
                estimate_usd: None,
                ..
            }
        ));
    }

    /// The ruling's values, pinned literally: a test that compared against the
    /// constants would pass if someone changed them.
    #[test]
    fn the_thresholds_are_the_rulings_300k_and_one_hour() {
        assert_eq!(COLD_CONTEXT_TOKENS, 300_000);
        assert_eq!(COLD_IDLE_MS, 3_600_000);
        let just_over = known(Some(300_001), Some(NOW - 3_600_001), None);
        assert!(matches!(
            check(SystemState::Idle, &just_over, NOW),
            ColdCheck::Cold { .. }
        ));
        let recent = known(Some(900_000), Some(NOW - 59 * 60 * 1_000), None);
        assert_eq!(check(SystemState::Idle, &recent, NOW), ColdCheck::Clear);
    }

    /// A last call stamped after the daemon's clock (skew) is recent, never
    /// "idle for centuries".
    #[test]
    fn a_future_last_call_is_not_cold() {
        let skewed = known(Some(900_000), Some(NOW + 60 * 60 * 1_000), None);
        assert_eq!(check(SystemState::Idle, &skewed, NOW), ColdCheck::Clear);
    }

    #[test]
    fn a_working_seat_is_never_cold() {
        let cold = known(Some(900_000), Some(0), Some("claude-opus-5-5"));
        assert_eq!(check(SystemState::Working, &cold, NOW), ColdCheck::Busy);
    }

    #[test]
    fn anything_unknown_allows_and_says_why() {
        for block in [
            SessionStatusBlock::Unbound,
            SessionStatusBlock::Unsupported {
                harness: Harness::Omp,
            },
            SessionStatusBlock::NotFound { detail: "x".into() },
            SessionStatusBlock::Failed {
                error: "boom".into(),
            },
            known(None, Some(0), None),
            known(Some(900_000), None, None),
        ] {
            let check = check(SystemState::Idle, &block, NOW);
            assert!(
                matches!(check, ColdCheck::Unknown { .. }),
                "{block:?} -> {check:?}"
            );
            assert!(refusal(&SeatId("pij-x".into()), &check).is_none());
            assert!(check.receipt_label(false).starts_with("unknown: "));
        }
    }

    #[test]
    fn an_unpriced_model_still_refuses_but_says_the_price_is_unknown() {
        let check = check(
            SystemState::Idle,
            &known(Some(400_000), Some(0), Some("some-new-model")),
            NOW,
        );
        let text = refusal(&SeatId("pij-y".into()), &check).unwrap();
        assert!(text.contains("(price unknown for this model)"), "{text}");
        assert!(text.contains("idle 10h, 400k context"), "{text}");
    }
}
