# Phase 1 execution log

## tk-a132 — RED-first witnesses

- Inherited witnesses: early child exit returned HTTP 200; first bind erased the spawn parent.
- Added bounded dead-pane witness after rebasing onto `main@4418e3f3`.
- RED: `cargo test -p pij-daemon a_missing_pane_terminalizes_its_queued_delivery_with_named_reason -- --nocapture` failed because the missing-pane row was retried.
- Evidence: `assets/red-witness.md`.

## tk-b132 — bind and dead-pane reporting

- Preserved the compiling inherited implementation after focused Rust/TypeScript tests and workspace check.
- Rebase conflicts were limited to additive imports in `crates/cli/src/main.rs` and `crates/daemon/src/http/mod.rs`.
- Added the ruled narrow policy in `crates/daemon/src/pointer/worker.rs`: only an unbound spawned seat is checked against tmux's pane roster; a missing pane fails its queue row with seat and pane in the reason. Listed panes and systemic tmux errors retain the existing retry behavior.
- GREEN: dead-pane regression, retry-policy distinction, starvation guard, spawn suite, and `cargo check --workspace`.

## tk-c132 — composed proof and review

- `cargo test --workspace --quiet`: 607 passed across 63 suites; 6 ignored.
- `harness checks --json` on `main@4418e3f3`: all eight sensors passed (`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`).
- Fresh real-client tmux proof: `assets/live-proof.md`.
- Claude Opus review pending.

## Discoveries & learnings

| Tag | Finding | Action |
| --- | --- | --- |
| Noteworthy | The PM packet's TENETS path `.agents/skills/pij-team/TENETS.md` does not exist in this checkout; the live copy is `.agents-skills-port/pij-team/TENETS.md`. | Captured as harness observation `CONF-001`; fix the packet template at closeout. |
| Noteworthy | A worktree-started flowspace3 daemon shares and rewrites the production daemon key even when pointed at the dev database. | Standing rule updated during the run: never start flowspace3 daemon from worker seats. |
