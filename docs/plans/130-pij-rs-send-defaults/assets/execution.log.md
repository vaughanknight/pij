# Execution log — plan 130

## Implementation

| Unit | Change | Evidence |
|---|---|---|
| CLI identity/body defaults | Added daemon-authoritative `identity::resolve_acting_seat`; optional `--from`/`--msg-id`; UUIDv7 receipt; `--body`/path/stdin selection; pane-derived report/inbox | `cargo test -p pij-cli` — 51 passed before final receipt assertion; focused shipped-CLI test green after it |
| Inbox safety | Destructive reads require `--seat` to equal the derived actor; `--peek` is the only cross-seat form and does not claim or ack | shipped-CLI integration; fake and SQLite queue contracts; live OMP→Claude peek then Claude read of the same msg id |
| Notice text | Pointer/final pointer says `pij inbox check`; every pane-bound harness, including omp/pi, gets pane-derived identity guidance; export advice is paneless-only | daemon pointer and identity suites green |
| Queue observation | Added `Queue::peek` across SQLite/fake/test adapters; exposes the oldest pending or claimed live row without mutation | fake/SQLite shared contract; live pointer-worker race witness |

## Review remediation

| Finding | Resolution | Evidence |
|---|---|---|
| F1 — contradictory environment id outranked the pane | CLI now sends both inputs to the daemon's single identity ladder; the pane remains authoritative and contradictions are refused for send/report | focused shipped-CLI test failed before the fix at `crates/cli/tests/spawn.rs:642`, then passed after the fix |
| F2 — explicit operator peek required an acting identity | `pij-rs inbox --seat <id> --peek` uses its explicit observation target without resolving an actor; destructive and implicit reads still derive identity | shipped-CLI test invokes explicit peek with both identity variables removed |
| F3 — service/HTTP peek contracts unwitnessed | Added service guard/preservation coverage and HTTP evidence-free peek coverage | focused `pij-daemon` tests passed |
| F4 — OMP/Pi received stale export advice | Applied weasel ruling 2026-09-02: every pane-bound harness gets pane guidance; export advice is paneless-only | adopt test covers claude/copilot/codex/omp/pi; hand-started OMP and Claude panes confirmed the text live |


## Round-2 remediation

| Finding | Resolution | Evidence |
|---|---|---|
| F5 — correct identity refusal had no recovery | Contradictory pane/id refusals now name the verified `env -u PIJ_SESSION_ID` recovery gesture without weakening the pane-authoritative policy | identity test failed on the missing gesture, then passed; reviewer independently verified the gesture restores affected verbs |
| F6 — paneless export branch was dead | Removed the unreachable adopt branch and moved export guidance to the successful paneless `register` response | paneless register test failed with `meta: None`, then passed with the exact export instruction |
| F7 — Telegram sidecar trusted `--from` | Telegram now derives/asserts `--from` through the same daemon authority and mints an omitted UUIDv7 `--msg-id` before constructing the unchanged wire request | parser test failed on required flags, then passed; shipped-CLI contradiction test covers reply-target impersonation refusal |

## Verification

- `cargo test -p pij-cli` → 51 passed.
- `cargo test -p pij-daemon pointer::tests` → 6 passed.
- `cargo test -p pij-daemon http::identity_tests` → 26 passed.
- `cargo test -p pij-testkit --test contract_over_fakes` → 12 passed.
- `cargo test -p pij-store --test queue the_sqlite_queue_honours_the_same_contract_the_fake_does` → passed.
- `cargo test -p pij-testkit --test arch_drift` → 6 passed after adding the `uuid` edge to both metadata fixtures.
- `cargo clippy --workspace --all-targets -- -D warnings` → green.
- `cargo test --workspace` → 550 passed across 60 suites; 6 ignored.
- Initial pre-remediation `harness checks` inherited the two ruled req-0044 TypeScript failures; the final post-rebase run passed all eight sensors.
- Live isolated proof → `assets/live-send-defaults.md`; production daemon untouched.
- Post-rebase `cargo test --workspace` → 591 passed across 63 suites; 6 ignored, 84 filtered.
- Post-remediation `cargo clippy --workspace --all-targets -- -D warnings` → green.
- Post-review live isolated proof → `assets/live-send-defaults.md`; hand-started OMP `%3155` and Claude `%3156`, literal stdin and byte-identical 5120-byte file; production daemon untouched.
- Final `harness checks` → `status: ok`; local-paths, typecheck, lint, test, windows-compat, smoke, pkg-audit, and snapshots all passed.
- After round-2 fixes: `cargo test --workspace` → 593 passed across 63 suites; 6 ignored, 84 filtered; clippy `-D warnings` green; `harness checks` passed all eight sensors.
- Claude Opus round 3 → **APPROVE**; F5-F7 independently RED/GREEN verified and fixed; regression risk LOW (`assets/reviews/round-3.dd.json`).

## Discoveries & learnings

| Tag | Discovery |
|---|---|
| Noteworthy | A useful inbox peek must expose a live delivery while the pointer worker temporarily owns its queue claim; pending-only inspection produced a false empty view. The shared queue contract now pins pending and claimed visibility. |
| Noteworthy | Live coordination initially used zero-byte `touch` markers with `-s`; the test harness correctly refused to call those ready. Final proof used non-empty markers and records only the successful run. |
| Noteworthy | Rebased onto main `ac830c0e`; preserved plan 128 harness-session registration while resolving response-text and pointer-test conflicts. |
| Noteworthy | Claude Opus reproduced `harness checks` 8/8 only on its third run; earlier runs failed different TypeScript/tmux sensors. It classified this as load-sensitive harness flakiness, not a plan-130 regression, and left N1 non-blocking. |
| Deferred | req-0044 baseline failures remain excluded by prime ruling and are not attributed to plan 130. |
