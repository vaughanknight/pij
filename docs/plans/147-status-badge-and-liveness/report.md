# Plan 147 — implementation evidence

Status: implemented, isolated runtime proved, all required gates green; ready for independent review. The source delivery commit is identified in the final peer message and this file's Git history. No push, PR, merge or production deployment performed.

## Delivered scope and rulings

- **AC1/AC4/AC6:** exported `pij_core::status::{BADGE_SEVERITY,badge_of}`, exact 15-word order, exhaustive mappings over both full enums, allocation-free pure selector; `failed`/`cancelled` accepted through semantic report state and report-now flags, persisted/read back, non-nudgeable.
- **AC5/AC7/AC8:** `badge` and epoch-ms `last_event_at` on roster/card; one SQLite snapshot joins current row, latest seat event and latest declaration per open assignment. Closed assignment declarations do not leak through the legacy single-state descriptor. Legacy rows without events have null freshness.
- **AC3a/AC9:** API documentation includes the per-value reachability table. All harnesses still mechanically default to idle; this is not observed inactivity. Working/starting/stalled/stopped/dead are not newly produced. `unknown` remains the pure no-input fallback. The state card's existing process-liveness vocabulary is unchanged.
- **Final liveness ruling:** roster liveness is ABSENT, not downgraded to all-unknown. Field presence would enable chainglass's idle filter over unusable information. The badge never consults liveness or tombstones on either surface, preventing row/focus disagreement. This split was the coder's finding: existing SQL has no process observation, and the exact-PID liveness port cannot produce one inside the roster query.
- The prime accepted the activity split at its plan commit `250354bc`, then authorized updating AC2/AC5/AC3a and dependent acceptance text for the final liveness/badge ruling. `plan.md` now reflects it. Plan 148 was not started.

### AC2a — honest fallback ruling

Prefer a true working observation; otherwise a clearly named recency observation, never recency spelled working; otherwise stop. Epoch milliseconds for `last_event_at` are confirmed. No recency activity value was introduced in 147.

### AC2b — native publication ruling

Pij extension code reading runtime lifecycle/isIdle is an observation; agent-selected mechanical state is not. Future publication must be extension-only, identity checked, no CLI working declaration, reuse the existing seam, document per-harness coverage and latency, and project a lost end event as stalled rather than working forever. Pane scraping is rejected. These constraints belong to 148 after the accepted split.

## RED → GREEN evidence

All commands ran in the assigned worktree using `~/.cargo/bin/cargo`, a worktree-local target directory and `RUST_TEST_THREADS=1` where applicable.

| Claim | RED | GREEN |
|---|---|---|
| Failed/cancelled semantic declarations | `cargo test -p pij-daemon --test report_http report_state_accepts_failed_and_cancelled_and_preserves_them_after_reopen`: HTTP 400 instead of 200 for failed; exit 101 | `cargo test -p pij-daemon --test status_http --test report_http`: 30 passed |
| Full badge vocabulary and pure selector | `cargo test -p pij-core --test status`: unresolved status module/enum additions; exit 101 | `cargo test -p pij-core -p pij-store --test status`: 6 passed across two suites |
| Open-assignment selection, closing and legacy event absence | `cargo test -p pij-store --test status`: unresolved status module; exit 101 | Same 6-test command above passed |
| Row/card agreement and independent card liveness | Added composed HTTP regression: fake dead process still yields the same blocked badge on both surfaces; no roster liveness; tombstone excluded from roster without changing retained card badge | `status_http` included in the 30-test pass; actual daemon smoke below also passed |

Native-publication tests were authored and produced seven RED failures before the split. Their additions were removed from the working source; `/tmp/plan147-native-red.patch` preserves them for optional future use. They are NOT 147 acceptance proof.

## Actual isolated daemon proof

Ran the built `target/debug/pij-rs` program, not a test file, on `127.0.0.1:51202` with private HOME, CLAUDE_CONFIG_DIR and state directory. The private real SQLite fixture contains **91 seats and 2921 spine events**. No production daemon restart or mutation was performed.

- `GET /v1/seats?scope=local` returned 91 rows with badge and freshness; none carried liveness.
- `pij-bench-000` had two open assignments, blocked and done. Both roster and card returned **blocked**, despite legacy mechanical idle and no unscoped semantic declaration.
- Both surfaces returned the identical `last_event_at:1789174388520`.
- The card retained its independent `liveness:"unbound"`.
- Actual `POST /v1/report` accepted failed then cancelled; actual state reads returned the matching badges.
- Private daemon was stopped after proof. Its pane-observer shutdown logs explicitly left foreign production taps untouched.
- Full captured row/card and timings: [`evidence.json`](./evidence.json).

### Roster timing — same 91-seat fixture

100 interleaved measured samples after 10 warmups, debug build, existing registry baseline versus the implemented status reader. Includes SQL/schema check and decoding, excludes HTTP and existing role join.

| Read | Median | p95 |
|---|---:|---:|
| Before: `SqliteRegistry::list` | 1.105729 ms | 1.218500 ms |
| After: `SqliteStatus::read` | 2.500375 ms | 2.659792 ms |

Additional real HTTP measurement: 30 roster reads, median **4.462979 ms**, p95 **9.072916 ms**. These are controlled local measurements, not production fleet or CI performance claims. The temporary Rust timing executable was removed after running.

## Plan 148 handoff — native observation trace and boundaries

1. **The honest signal already exists.** `.pi/extensions/pij/adapters/pi-runtime.ts:35-36` delegates `isIdle()` directly to `ctx.isIdle()`. Existing `index.ts:586-587,624-626,651-656` forwards tool-result, agent-end (including OMP `willContinue`), turn-start and turn-end. No new index handler appears necessary.
2. **Whole-agent completion is not tool-turn completion.** `rust-runtime.ts:381-396,445-448` already receives the boundaries. `core/session.ts:639-640` currently writes memory-registry idle at every turn-end; do not publish that as whole-agent idle. Keep working across tool turns; clear only after agent-end with `willContinue=false` and native `isIdle()=true`.
3. **Nothing currently publishes those state writes.** `rust-runtime.ts:972-1019` flushes outgoing messages, not memory-registry telemetry. `crates/daemon/src/delivery/mod.rs:939-943` already consumes `SystemState::Working` for the extension-lease renewal brake; publication must reach that consumer, not just decorate HTTP responses.
4. **Identity and reconnect boundaries.** `rust-runtime.ts:189-206,224,287-299,451-468,486-495,1035-1045` contains boot registration, lifecycle generation, immutable native registration facts, reconnect callback and shutdown. Future requests need captured client/seat/native-session/pid/proc-start/private-capability/lifecycle. Existing reconnect notice and `ensureRegistration` use mutable identity without full lifecycle fencing; fence them before adding writes. Rotate capability on replacement boot; retain it on same-lifecycle daemon reconnect.
5. **Extension-only means more than shared bearer auth.** Proposed, NOT implemented: private observer capability generated in extension memory, registered against the verified incarnation, hash only in the authority, never emitted in roster/card/spine. A narrowly scoped activity endpoint could accept tuple + capability + working/idle, with server timestamps. A publicly visible process tuple plus the machine-shared daemon key cannot distinguish an extension observer from an ordinary API client. Registration/capability rotation and stale request rejection must be atomic under the shared publication/registry serialization boundary. Full same-user OS compromise is outside this capability boundary; do not promise more.
6. **Ordering and errors.** Use rejection-safe activity serialization independent of message delivery. Publish real lifecycle/progress edges and boot/reconnect recovery, never the 1s mail ticker: timer traffic would hide a stalled runtime indefinitely. Existing event-stream reconnect backs off from 250 ms to 5 s (`daemon-http.ts:66-69,279-313,347-371`). A failure must remain observable without crashing delivery or hammering the daemon.
7. **Pane scanning is disqualified.** `crates/harnesses/src/adapter.rs:41-55,178-221` scans 200 captured lines for generic text, including `esc to interrupt` and `⟦esc⟧`. It cannot distinguish current UI state from a seat quoting or explaining that state. The project has already lost healthy work to this error class. No pane regex was used for this change.
8. **Roster liveness is a separate observation problem.** `crates/harnesses/src/proc.rs:1-6` explicitly bounds the adapter to caller-named PIDs; `core/src/ports.rs:563-577` exposes individual process identity lookup. Current state-card liveness is a live exact-PID probe; the registry row is not. 148 needs a bounded batch-observation seam or identity-bound persisted snapshot before roster liveness can be present. A timestamp or stored PID alone cannot establish active.
9. **Latency/proof still owed by 148.** Expected native publication latency is hook dispatch plus serialized HTTP completion, not an invented polling bound. Real Pi/OMP event timing, worst-case delay, shutdown-mid-turn, stale-end publication, incarnation races and failure-to-stalled composition were NOT proved. Other harnesses have no established work observer. The proposed 10-minute stalled default must be justified and tested there, not silently declared here.

## Harness loop and gate receipts

- First `harness boot`: ready=false, missing worktree vitest link.
- `just worktree-deps`: created 358 local links, READY; main checkout dependencies unchanged.
- Second boot: deps passed (120 ms), typecheck passed (2430 ms), smoke timed out at 90003 ms (exit 124), matching packet-known load noise. No green-boot claim.
- `harness observe` recorded DL-001; post-coding `harness observe --list --json` found that one entry. The most valuable learning is routed into the 148 handoff above rather than written to prime-owned governance.
- Encoded harness improvement: permanent cross-surface regression prevents adding roster liveness by default or deriving a different badge from the card's live process probe; the assignment-closing regression prevents stale scoped declarations from dominating forever.
- Suggested next encoding, owned by 148: a runtime-driven native-observation smoke with stale-incarnation and missing-end cases. No new implementation undertaken here.
- `cargo fmt --all --check` passed. `cargo clippy --workspace --all-targets -- -D warnings` passed after moving a test-only SeatFilter import into its test module.
- First full `harness checks` passed every required sensor except Vitest. Its recovered failure was known teardown noise: `.pi/extensions/pij/core/cli.test.ts:6778`, `rmSync(root, { recursive: true, force: true })`, **ENOTEMPTY** in the retained stream/fence integration fixture. Smoke passed on that run. Diagnostic `just test` then passed: **241 files / 5306 tests passed; 4 files / 22 tests skipped**. No source change masked the teardown.
- Serial `cargo test --workspace` passed: **1073 tests across 88 suites**, 8 ignored, 93 filtered; no failed suites. `cargo clippy` and formatting also passed.
- A second harness attempt emitted an error envelope at 123.58 seconds, but a too-narrow jq projection discarded its details; it was not treated as green. **Final full `harness checks`: status ok at 2026-09-12T01:03:51.674Z, no skipped sensors.** Local paths, typecheck, lint, test, Copilot native, Windows compatibility, smoke, package audit and snapshots all passed.
  - Closing verdict: **“Required checks green.”**
  - Attribution sensor: advisory warn only, code 0, no findings. Prior branch commits `250354bc`, `d777ebf7`, `6032d823` have unresolved Pij-Seat applicability because their registered native sessions were not uniquely resolvable. This delivery uses freshly derived C11 trailers.
- Recorded CONF-001 for that diagnostic friction: preserve raw gate receipts before optional-field projection. A saved-receipt-by-run-id command is the suggested upstream harness improvement; no unrelated CLI edit was made.
- Post-flight `harness retro insights --json` ran read-only (63 existing records, 265 entries). Prime-owned governance was not modified; this report carries the scoped observation disposition and 148 handoff.

## Unproved / intentionally unchanged

Production and chainglass rendering are prime-owned and unverified here. There is no native activity publisher, stalled projection, suspension observer, roster liveness value or new liveness policy. No database migration or capability endpoint was added. An older federated daemon may omit its badge; metadata is retained when a current remote daemon supplies it, not re-derived from partial remote semantics.
