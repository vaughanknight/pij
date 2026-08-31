use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use pij_core::error::Result;
use pij_core::ports::TmuxPort;

const DEFAULT_INTERACTION_IDLE: Duration = Duration::from_secs(60);
const SELF_INJECTION_WINDOW: Duration = Duration::from_secs(2);

type Clock = Arc<dyn Fn() -> Instant + Send + Sync>;

#[derive(Debug)]
struct SelfInjection {
    payload: String,
    baseline: Option<String>,
    expires_at: Instant,
    tap_active: bool,
}

#[derive(Debug, Default)]
struct ComposerState {
    tap_active: bool,
    content: Option<String>,
    last_change_at: Option<Instant>,
    self_injection: Option<SelfInjection>,
}

impl ComposerState {
    fn expire_if_idle(&mut self, now: Instant, idle_window: Duration) {
        if self
            .last_change_at
            .is_some_and(|changed_at| now.saturating_duration_since(changed_at) >= idle_window)
        {
            self.last_change_at = None;
            self.tap_active = false;
        }
    }
}
fn collapsed_eq(left: &str, right: &str) -> bool {
    left.split_whitespace().eq(right.split_whitespace())
}

/// Injection safety gate combining tmux mode with stateful composer interaction.
///
/// `TmuxPort::user_typing` reports only `pane_in_mode`. This gate owns the other
/// half: tap activity and recent changes to captured composer content. The
/// safety decision is an AND of two independent *clear* verdicts:
/// `!pane_in_mode && !composer_interaction`. Either interaction signal blocks;
/// a `false` observation from one detector is never, by itself, permission to
/// inject. Consumers must feed tap and composer observations before asking.
pub struct InteractionGate {
    tmux: Arc<dyn TmuxPort>,
    panes: Mutex<BTreeMap<String, ComposerState>>,
    idle_window: Duration,
    clock: Clock,
}

impl InteractionGate {
    pub fn new(tmux: Arc<dyn TmuxPort>) -> Self {
        Self::with_idle_window(tmux, DEFAULT_INTERACTION_IDLE)
    }

    /// Construct a gate with a caller-selected idle window and the monotonic system clock.
    pub fn with_idle_window(tmux: Arc<dyn TmuxPort>, idle_window: Duration) -> Self {
        Self::with_clock(tmux, idle_window, Arc::new(Instant::now))
    }

    fn with_clock(tmux: Arc<dyn TmuxPort>, idle_window: Duration, clock: Clock) -> Self {
        Self {
            tmux,
            panes: Mutex::new(BTreeMap::new()),
            idle_window,
            clock,
        }
    }

    /// Record bytes from the pane tap. Activity blocks injection until the
    /// consumer positively observes that the composer has cleared.
    pub fn record_tap(&self, pane: &str) {
        self.panes
            .lock()
            .expect("interaction gate mutex")
            .entry(pane.to_string())
            .or_default()
            .tap_active = true;
    }

    /// Record a payload about to be injected by pij. An exact, whitespace-collapsed
    /// echo is exempt from acquiring a hold; any existing human hold survives.
    pub fn record_self_injection(&self, pane: &str, payload: &str) {
        let now = (self.clock)();
        let mut panes = self.panes.lock().expect("interaction gate mutex");
        let state = panes.entry(pane.to_string()).or_default();
        state.self_injection = Some(SelfInjection {
            payload: payload.to_string(),
            baseline: state.content.clone(),
            expires_at: now + SELF_INJECTION_WINDOW,
            tap_active: state.tap_active,
        });
    }

    /// Record the current composer contents. Whitespace-only content is empty:
    /// captured TUIs pad blank composers to their full width.
    pub fn observe_composer(&self, pane: &str, content: &str) {
        let now = (self.clock)();
        let mut panes = self.panes.lock().expect("interaction gate mutex");
        let state = panes.entry(pane.to_string()).or_default();
        if state
            .self_injection
            .as_ref()
            .is_some_and(|injection| now > injection.expires_at)
        {
            state.self_injection = None;
        }
        if content.chars().all(char::is_whitespace) {
            state.content = Some(content.to_string());
            state.last_change_at = None;
            state.tap_active = false;
            return;
        }

        if state.content.as_deref() != Some(content) {
            let injection = state.self_injection.take();
            let explained = injection.as_ref().is_some_and(|injection| {
                injection.payload.chars().any(|ch| !ch.is_whitespace())
                    && (collapsed_eq(content, &injection.payload)
                        || injection
                            .baseline
                            .as_deref()
                            .is_some_and(|baseline| collapsed_eq(content, baseline)))
            });
            state.content = Some(content.to_string());
            if let Some(injection) = injection.filter(|_| explained) {
                state.tap_active = injection.tap_active;
            } else {
                state.last_change_at = Some(now);
            }
        }
        state.expire_if_idle(now, self.idle_window);
    }

    /// Record a positively observed transition from a non-empty composer to a
    /// blank composer. This claims only that the composer cleared: Enter, cancel,
    /// and explicit deletion are intentionally indistinguishable here. Tmux mode
    /// must still independently report clear before injection is permitted.
    pub fn record_composer_cleared(&self, pane: &str) {
        let mut panes = self.panes.lock().expect("interaction gate mutex");
        let state = panes.entry(pane.to_string()).or_default();
        state.tap_active = false;
        state.content = Some(String::new());
        state.last_change_at = None;
    }

    /// Forget a pane observation that can no longer be trusted. Unknown is a
    /// conservative veto, including after a previously clear observation.
    pub fn record_unknown(&self, pane: &str) {
        self.panes
            .lock()
            .expect("interaction gate mutex")
            .remove(pane);
    }

    /// True only when both independent gates report clear.
    pub async fn permits_injection(&self, pane: &str) -> Result<bool> {
        let tmux_clear = !self.tmux.user_typing(pane).await?;
        let now = (self.clock)();
        let composer_clear = self
            .panes
            .lock()
            .expect("interaction gate mutex")
            .get_mut(pane)
            .is_some_and(|state| {
                state.expire_if_idle(now, self.idle_window);
                !state.tap_active && state.last_change_at.is_none()
            });
        Ok(tmux_clear && composer_clear)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};

    use pij_testkit::block_on;
    use pij_testkit::fakes::FakeTmux;

    use super::InteractionGate;

    #[test]
    fn injection_requires_both_tmux_and_composer_gates_clear() {
        for tmux_interaction in [false, true] {
            for composer_interaction in [false, true] {
                let tmux = if tmux_interaction {
                    FakeTmux::new().with_user_typing()
                } else {
                    FakeTmux::new()
                };
                let gate = InteractionGate::new(Arc::new(tmux));
                if composer_interaction {
                    gate.record_tap("%108");
                    gate.observe_composer("%108", "unfinished message");
                } else {
                    gate.observe_composer("%108", "   \t");
                }
                assert_eq!(
                    block_on(gate.permits_injection("%108")).expect("typing gate"),
                    !tmux_interaction && !composer_interaction,
                    "tmux_interaction={tmux_interaction}, composer_interaction={composer_interaction}"
                );
            }
        }
    }
    #[test]
    fn parked_draft_holds_at_most_the_idle_window_then_sends() {
        let elapsed_ms = Arc::new(AtomicU64::new(0));
        let started_at = Instant::now();
        let clock_ms = Arc::clone(&elapsed_ms);
        let gate = InteractionGate::with_clock(
            Arc::new(FakeTmux::new()),
            Duration::from_secs(60),
            Arc::new(move || started_at + Duration::from_millis(clock_ms.load(Ordering::Relaxed))),
        );

        gate.observe_composer("%108", "draft parked here yesterday");
        assert!(!block_on(gate.permits_injection("%108")).expect("fresh draft holds"));

        elapsed_ms.store(59_999, Ordering::Relaxed);
        assert!(!block_on(gate.permits_injection("%108")).expect("recent draft holds"));

        elapsed_ms.store(60_000, Ordering::Relaxed);
        assert!(block_on(gate.permits_injection("%108")).expect("parked draft expired"));

        elapsed_ms.store(120_000, Ordering::Relaxed);
        assert!(block_on(gate.permits_injection("%108")).expect("expired draft stays released"));
    }
    #[test]
    fn typing_through_restart_is_not_rebaselined_away() {
        let elapsed_ms = Arc::new(AtomicU64::new(0));
        let started_at = Instant::now();
        let clock_ms = Arc::clone(&elapsed_ms);
        let gate = InteractionGate::with_clock(
            Arc::new(FakeTmux::new()),
            Duration::from_secs(60),
            Arc::new(move || started_at + Duration::from_millis(clock_ms.load(Ordering::Relaxed))),
        );

        gate.observe_composer("%108", "half typed thou");
        elapsed_ms.store(10_000, Ordering::Relaxed);
        gate.observe_composer("%108", "half typed thou");
        assert!(!block_on(gate.permits_injection("%108")).expect("thinking pause holds"));

        elapsed_ms.store(11_000, Ordering::Relaxed);
        gate.observe_composer("%108", "half typed thought");
        elapsed_ms.store(70_999, Ordering::Relaxed);
        assert!(!block_on(gate.permits_injection("%108")).expect("resumed typing re-arms"));

        gate.observe_composer("%108", "  \t\n");
        assert!(block_on(gate.permits_injection("%108")).expect("blank releases"));
    }

    #[test]
    fn self_echo_never_acquires_a_hold() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
        gate.observe_composer("%108", "");
        gate.record_self_injection("%108", "[pij from boss] status please");
        gate.record_tap("%108");
        gate.observe_composer("%108", " [pij   from boss]\nstatus please ");

        assert!(block_on(gate.permits_injection("%108")).expect("self echo is exempt"));
    }

    #[test]
    fn self_echo_never_destroys_an_active_human_hold() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
        gate.observe_composer("%108", "");
        gate.record_tap("%108");
        gate.observe_composer("%108", "human mid sentence");
        gate.record_self_injection("%108", "[pij from boss] barging in");
        gate.record_tap("%108");
        gate.observe_composer("%108", "[pij from boss] barging in");

        assert!(!block_on(gate.permits_injection("%108")).expect("human hold survives echo"));
    }

    #[test]
    fn self_echo_match_is_exact_not_a_substring() {
        for capture in [
            "[pij from boss] status please and my reply",
            "my reply [pij from boss] status please",
            "my [pij from boss] status please reply",
        ] {
            let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
            gate.observe_composer("%108", "");
            gate.record_self_injection("%108", "[pij from boss] status please");
            gate.record_tap("%108");
            gate.observe_composer("%108", capture);

            assert!(
                !block_on(gate.permits_injection("%108")).expect("adjacent human text holds"),
                "capture={capture:?}"
            );
        }
    }
    #[test]
    fn self_echo_exemption_is_one_shot() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
        let injected = "[pij from boss] status please";
        gate.observe_composer("%108", "");
        gate.record_self_injection("%108", injected);
        gate.record_tap("%108");
        gate.observe_composer("%108", injected);
        assert!(block_on(gate.permits_injection("%108")).expect("exact echo is exempt"));

        gate.record_tap("%108");
        gate.observe_composer("%108", "[pij from boss] status please and my reply");
        assert!(!block_on(gate.permits_injection("%108")).expect("later human input holds"));
    }

    #[test]
    fn expired_self_echo_exemption_does_not_hide_human_input() {
        let elapsed_ms = Arc::new(AtomicU64::new(0));
        let started_at = Instant::now();
        let clock_ms = Arc::clone(&elapsed_ms);
        let gate = InteractionGate::with_clock(
            Arc::new(FakeTmux::new()),
            Duration::from_secs(60),
            Arc::new(move || started_at + Duration::from_millis(clock_ms.load(Ordering::Relaxed))),
        );
        gate.observe_composer("%108", "");
        gate.record_self_injection("%108", "[pij from boss] late");

        elapsed_ms.store(2_001, Ordering::Relaxed);
        gate.record_tap("%108");
        gate.observe_composer("%108", "[pij from boss] late");
        assert!(!block_on(gate.permits_injection("%108")).expect("expired exemption holds"));
    }

    #[test]
    fn unknown_observation_blocks_injection() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
        assert!(
            !block_on(gate.permits_injection("%108")).expect("typing gate"),
            "one clear detector cannot authorize injection before the other has observed the pane"
        );
    }

    #[test]
    fn observed_composer_clear_does_not_override_tmux_mode() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new().with_user_typing()));
        gate.record_tap("%108");
        gate.observe_composer("%108", "draft");
        gate.record_composer_cleared("%108");
        assert!(!block_on(gate.permits_injection("%108")).expect("typing gate"));
    }

    #[test]
    fn a_clear_observation_can_return_to_unknown_and_block() {
        let gate = InteractionGate::new(Arc::new(FakeTmux::new()));
        gate.observe_composer("%108", "   ");
        assert!(block_on(gate.permits_injection("%108")).expect("known clear gate"));

        gate.record_unknown("%108");

        assert!(
            !block_on(gate.permits_injection("%108")).expect("unknown gate"),
            "losing sight of a pane must revoke stale permission"
        );
    }
}
