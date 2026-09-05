# Post-merge live proof — 2026-09-05 (main 7c97c726, daemon pid 53985)

Reported by `pij-grim-gurgeh`, relayed by prime `pij-minor-unicorn`.

- Global setup: `just link` from main → `~/.copilot/extensions/pij` → main `.copilot/extensions/pij`; `experimental: true` merged into `~/.copilot/settings.json`.
- Jordan's real Copilot pane `%3685` (fresh session after link) registered as `pij-copilot-09c838ec5ff9d1cf620ecce7`.
- Native message `4617c722` sent with no send-keys; Copilot found native `pij_send` and replied `NATIVE_COPILOT_READY_1`, received by gurgeh.
- Pre-link state of the same pane (no `pij_send`, `~/.copilot/extensions/pij` absent) is the negative control: daemon rollout alone did not enable native delivery; the user-side link did.
