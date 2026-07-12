# s043 grant — worktree-agnostic pi-peacock smoke

**Granted by**: o-prime `pij-3vetx8` · **Date**: 2026-07-12

## Allowed addendum

- Modify exactly `.pi/extensions/pi-peacock/smoke.ts` on branch `s043/telegram-last-speaker-routing`.
- Derive the expected footer path and branch from the actual environment (`process.cwd()` + current git branch) instead of hardcoding `~/pi-hacking/pij (main)`.
- Preserve the assertion strength: path, branch, context usage, provider/model, and effort must still be proven.
- Author the regression with explicit bounded timeouts; include the sensor fix in cold review and disclose it separately from the Telegram product diff.
- Record the transient missing-pane retry as an observation, not as the root cause.

## Still forbidden

- No other `pi-peacock` files.
- No weakening to wildcard-away path/branch.
- No government, package manifest, flow-state, or unrelated harness changes.
