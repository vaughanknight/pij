use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use pij_core::error::Result;
use pij_core::ports::TmuxPort;

#[derive(Clone, Copy, Debug, Default)]
struct ComposerState {
    tap_active: bool,
    composer_non_empty: bool,
}

/// Injection safety gate combining tmux mode with stateful composer interaction.
///
/// `TmuxPort::user_typing` reports only `pane_in_mode`. This gate owns the other
/// half: tap activity and whether captured composer content is non-empty. The
/// safety decision is an AND of two independent *clear* verdicts:
/// `!pane_in_mode && !composer_interaction`. Either interaction signal blocks;
/// a `false` observation from one detector is never, by itself, permission to
/// inject. Consumers must feed tap and composer observations before asking.
pub struct InteractionGate {
    tmux: Arc<dyn TmuxPort>,
    panes: Mutex<BTreeMap<String, ComposerState>>,
}

impl InteractionGate {
    pub fn new(tmux: Arc<dyn TmuxPort>) -> Self {
        Self {
            tmux,
            panes: Mutex::new(BTreeMap::new()),
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

    /// Record the current composer contents. Whitespace-only content is empty:
    /// captured TUIs pad blank composers to their full width.
    pub fn observe_composer(&self, pane: &str, content: &str) {
        let mut panes = self.panes.lock().expect("interaction gate mutex");
        let state = panes.entry(pane.to_string()).or_default();
        state.composer_non_empty = content.chars().any(|ch| !ch.is_whitespace());
        if !state.composer_non_empty {
            state.tap_active = false;
        }
    }

    /// Record a positively observed transition from a non-empty composer to a
    /// blank composer. This claims only that the composer cleared: Enter, cancel,
    /// and explicit deletion are intentionally indistinguishable here. Tmux mode
    /// must still independently report clear before injection is permitted.
    pub fn record_composer_cleared(&self, pane: &str) {
        self.panes
            .lock()
            .expect("interaction gate mutex")
            .insert(pane.to_string(), ComposerState::default());
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
        let composer_clear = self
            .panes
            .lock()
            .expect("interaction gate mutex")
            .get(pane)
            .is_some_and(|state| !state.tap_active && !state.composer_non_empty);
        Ok(tmux_clear && composer_clear)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

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
