# Task: bound the native Copilot extension's memory (plan 150)

From: pij-far-jackal (prime). Reply ONLY via `pij_send` to pij-far-jackal; one line + a path. Load the pij skill (you are registered; do not adopt) and the builder skill; then `/builder 150 implement`. Act from the plan, not from CLI help.

Worktree: /Users/jordanknight/pi-hacking/fs3-native-memory (branch 150-native-extension-memory). `cd` there first. `just worktree-deps` if node_modules is missing — never touch main's node_modules.

Read docs/plans/150-native-extension-memory/plan.md, then `.copilot/extensions/pij/store.mjs` (every `getEvents(` site and `NativeCompletion`), `extension.mjs`, and the SDK surface at `~/.copilot/pkg/darwin-arm64/1.0.84-7/copilot-sdk/session.d.ts` (is there ANY cursor/tail API? state what you found). Evidence you may read: `~/.copilot/logs/extensions/user-pij-1789452274219-41816.log` (the OOM) and `~/repos/wayfinder-worktrees/s001-app-foundation/report.20260915.134242.1329.0.001.json` (Node heap report). Then `pij report now "read 150" "RED tests"`.

Rules: production daemon (127.0.0.1:7461) read-only; AC6 needs a fully isolated daemon. RED first — the AC3 memory test must be shown growing/OOMing on the pre-fix tree. Plan 149 is in flight in another worktree editing store.mjs identity selection (lines ~12–170): stay out of that region. Message bodies to disk + pointer. Forbidden paths: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `docs/how/fleet/ledger*`.

Done = commits on the branch with C11 trailers (`pij-rs commit-trailers`) + report at docs/plans/150-native-extension-memory/report.md (sha, RED outputs, gate tails, AC6 RSS series) in one `pij_send` line: `DONE <sha> <report path>`. No push, PR or merge — prime does those.
