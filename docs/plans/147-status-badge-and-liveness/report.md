# Plan 147 — implementation evidence

Status: **all F1–F8 fixes implemented and verified; none deferred to 148. Fix delivery commit: `9b089a59`.** Required gates exited 0; report-only package audit findings are recorded below, not represented as clean. This exact-SHA stamp is post-commit metadata; all source, tests and evidence are in the commit. Pre-existing prime packets were left untouched. Original delivery: `ad5c6589`; review: `e3f99483`. No push, PR, merge or production deployment performed.

## Delivered scope and rulings

- **AC1/AC4/AC6:** exported `pij_core::status::{BADGE_SEVERITY,badge_of}`, exact 15-word order, exhaustive mappings over both full enums, allocation-free pure selector; `failed`/`cancelled` accepted through semantic report state and report-now flags, persisted/read back, non-nudgeable.
- **AC5/AC7/AC8:** `badge` and epoch-ms `last_event_at` on roster/card; one SQLite snapshot joins current row, latest seat event and latest declaration per open assignment. Closed-assignment descriptor suppression was implemented in round 1, but its claimed regression protection was false; the new round-2 removed-guard witness below pins it. Legacy rows without events have null freshness.
- **AC3a/AC9:** API documentation includes the per-value reachability table. All harnesses still mechanically default to idle; this is not observed inactivity. Working/starting/stalled/stopped/dead are not newly produced. `unknown` remains the pure no-input fallback. The state card's existing process-liveness vocabulary is unchanged.
- **Final liveness ruling:** roster liveness is ABSENT, not downgraded to all-unknown. Field presence would enable chainglass's idle filter over unusable information. The badge never consults liveness or tombstones on either surface, preventing row/focus disagreement. This split was the coder's finding: existing SQL has no process observation, and the exact-PID liveness port cannot produce one inside the roster query.
- The prime accepted the activity split at its plan commit `250354bc`, then authorized updating AC2/AC5/AC3a and dependent acceptance text for the final liveness/badge ruling. `plan.md` now reflects it. Plan 148 was not started.

### AC2a — honest fallback ruling

Prefer a true working observation; otherwise a clearly named recency observation, never recency spelled working; otherwise stop. Epoch milliseconds for `last_event_at` are confirmed. No recency activity value was introduced in 147.

### AC2b — native publication ruling

Pij extension code reading runtime lifecycle/isIdle is an observation; agent-selected mechanical state is not. Future publication must be extension-only, identity checked, no CLI working declaration, reuse the existing seam, document per-harness coverage and latency, and project a lost end event as stalled rather than working forever. Pane scraping is rejected. These constraints belong to 148 after the accepted split.

## Round-1 historical RED → GREEN evidence

All commands ran in the assigned worktree using `~/.cargo/bin/cargo`, a worktree-local target directory and `RUST_TEST_THREADS=1` where applicable.

| Claim | RED | GREEN |
|---|---|---|
| Failed/cancelled semantic declarations | `cargo test -p pij-daemon --test report_http report_state_accepts_failed_and_cancelled_and_preserves_them_after_reopen`: HTTP 400 instead of 200 for failed; exit 101 | `cargo test -p pij-daemon --test status_http --test report_http`: 30 passed |
| Full badge vocabulary and pure selector | `cargo test -p pij-core --test status`: unresolved status module/enum additions; exit 101 | `cargo test -p pij-core -p pij-store --test status`: 6 passed across two suites |
| Open-assignment selection, closing and legacy event absence | `cargo test -p pij-store --test status`: unresolved status module; exit 101 | Same 6-test command above passed |
| Row/card agreement and independent card liveness | Round-1 test used the same blocked descriptor word and no assignments: it did **not** discriminate the projection from fallback. No chronological RED witness existed for that test. | The test passed and the separate live capture discriminated, but this did not make the committed test a regression witness. Corrected and mutation-proved in round 2 below. |

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

**F6 correction — density matters.** SQL inspection of the retained original
fixture found just **2 open assignments on 1 of 91 seats** (90 unassigned),
not one assignment per seat. There were 89 seats with 32 events, one with 34,
one with 36, plus 3 non-seat configuration events: 2921 total. The original
`1.106 → 2.500 ms` number applies only to that sparse fixture.

The reviewer's independent medians were **3.563 ms** for one assignment per
seat at 32 events/seat, **13.517 ms** at 200 events/seat, and **1.963 ms** for
the latter with the index. Those are reviewer measurements, not this run.

Round 2 added additive migration `0020_spine_by_seat_kind.sql`:
`CREATE INDEX spine_by_seat_kind ON spine_events (seat, kind, seq)`.
I independently re-ran the real store methods on isolated in-memory SQLite:
91 seats, **91 open assignments**, exactly one early `report.state` per seat;
the remainder was one `seat.put` and 30 or 198 later filler events. Debug build,
10 warmups and 100 alternating/interleaved samples per method per index case.
Setup, DDL and result validation were outside timings; schema checks, SQL and
decoding were inside. Index absence/presence was changed only in each private
fixture. The temporary executable was removed after its output was retained.

| Events/seat | Total events | Index | Registry median / p95 (ms) | Status median / p95 (ms) |
|---:|---:|---|---:|---:|
| 32 | 2912 | absent | 1.131896 / 1.234458 | 3.832813 / 3.987958 |
| 32 | 2912 | present | 1.203646 / 2.139583 | 2.086250 / 3.011375 |
| 200 | 18200 | absent | 1.196355 / 1.428375 | 15.788667 / 17.311167 |
| 200 | 18200 | present | 1.197667 / 1.285125 | 2.183500 / 2.304667 |

Full SQL density checks, raw samples and lookup EXPLAIN output:
[`fix-timing.json`](./fix-timing.json). The state lookups changed from
`spine_by_seat (seat=?)` to `spine_by_seat_kind (seat=? AND kind=?)`.
This removes scans of unrelated event kinds, **not every growth term**:
assignment count and matching `report.state` history still matter because
`assignment_id` is JSON-filtered. Neither fixture measures arbitrary assignment
or declaration density, production latency, or index write/storage cost.

### Independent real-store index cost — pij-shocked-zebra

**Measured by reviewer pij-shocked-zebra**, retained in the round-2 verification
addendum at `430a34a3`, [`review.md`, §3 “Index cost, measured”](./review.md).
This used a `VACUUM INTO` snapshot of the **real store**, not the live daemon:
**1078 seats, 35260 spine events, zero open assignments**, schema 19 migrating
to 20 on open. Debug build; 30 interleaved read samples after 5 warmups,
1000 timed `SqliteSpine::append` calls per case; the whole index-present/absent
cycle was run twice. These are the reviewer's measurements, not a coder rerun.

| Measure | Index absent | Index present |
|---|---:|---:|
| `SqliteStatus::read` median | 69.5–70.2 ms | 20.0–20.6 ms |
| `SqliteSpine::append` median, passes 1 / 2 | 0.1967 / 0.1479 ms | 0.1530 / 0.1509 ms |
| Added index storage | — | **1.71 MiB, +6.2%** on a 27.8 MiB store |

The registry-list reference baseline was **13.4 ms**. Append cost was **below
measurement noise**: between-pass spread exceeded the difference between index
cases, so this does not establish zero write cost. Index storage grows with the
append-only spine.

**Conclusion: at real-store scale the index is LOAD-BEARING, not an
optimisation.** Without it, the status read is roughly five times the registry
baseline it replaces (**~5.4× against the review's rounded 13 ms baseline;
~5.2× using 13.4 ms**). With it, the status read is about 1.5× that baseline.
The growth-term caveat above still applies: this real-store snapshot had no
open assignments, and the index does not eliminate JSON-filtered assignment
or matching-declaration history costs.

## Round 2 — accepted findings and executable witnesses

- **F1:** `report clear --assignment` reuses the same assignment resolution and
  `E-RS-ASSIGNMENT-UNKNOWN` / `E-RS-ASSIGNMENT-NOT-YOURS` refusals as declarations.
  Unscoped clear remains descriptor-only. API docs explain both mismatch
  directions, including closed-task `semanticState: "blocked"` / `badge: "idle"`.
- **F2:** restored the unrelated non-empty `unsupported[].why` control.
  A single variant/spelling definition now generates each enum, parse/as_str
  and ALL; semantic WORDS is generated from it. Both report refusals and CLI
  help consume WORDS rather than maintaining separate lists.
- **F3 correction:** I claimed the cross-surface regression protected badge
  agreement. In truth the old test had descriptor blocked and no assignments,
  so an unconditional descriptor fallback survived. It now has an open blocked
  assignment and a done descriptor; removing the card projection fails.
  The old-peer `unwrap_or_else` fallback is retained, not deleted.
- **F4 correction:** I claimed an encoded regression prevented stale scoped
  declarations from surviving closure. The condition was implemented, but the
  old fixture could not detect its removal. The new test closes the only blocked
  assignment while retaining descriptor blocked and requires badge idle.
- **F5:** ALL-to-badge coverage now complements badge-to-enum coverage;
  `usize::MAX` is the no-candidate sentinel, leaving invalid ranks loud.
- **F6:** index and independently re-derived density-specific numbers above.
- **F7:** retained historical CLI capture is explicitly labelled pre-147,
  not current badge/freshness evidence. Its capture report records that its
  private daemon and scratch state were removed; it was not relabelled/recreated.
- **F8:** a committed codec test covers current-peer metadata retention, old-peer
  absent fields decoding to None, and omission on raw descriptor serialization.

All five newly introduced tests have behavioral RED witnesses below; the changed
cross-surface and assignment-refusal tests do too. **F1 is chronological pre-fix
RED** with its original parser/handler. **F2/F3/F4/F5/F8 are deliberate mutation
RED**, not a claim the already-correct baseline behavior was failing. Each
mutation was removed before the 41-test GREEN run. The synthetic variant's
initial missing-doc compile failure was setup noise, not counted as a witness.

### F1 — original clear parser, before implementation (exit 101)

`cargo test -p pij-daemon --test report_http`

```text
---- assignment_refusals_name_owner_and_leave_state_and_questions_untouched stdout ----
assertion `left == right` failed: {"command":"pij report","error":"refused","meta":"unknown flag --assignment for `pij report clear`","ok":false,"v":2}
  left: Null
 right: "E-RS-ASSIGNMENT-NOT-YOURS"

---- scoped_report_clear_removes_only_its_assignment_declaration stdout ----
assertion `left == right` failed: {"command":"pij report","error":"refused","meta":"unknown flag --assignment for `pij report clear`","ok":false,"v":2}
  left: 400
 right: 200
test result: FAILED. 28 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out
```

### F3/F4 — exact removed-projection / removed-closing-guard mutants (exit 101)

`cargo test -p pij-store -p pij-daemon --test status --test status_http --no-fail-fast`

Replaced card badge projection with unconditional descriptor-only `badge_of`;
removed `latest_assignment_id.is_none()` around descriptor contribution.

```text
---- roster_and_card_share_badge_and_freshness_without_inventing_roster_liveness stdout ----
assertion `left == right` failed
  left: String("done")
 right: String("blocked")
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out

---- closing_last_assignment_does_not_resurrect_descriptor_declaration stdout ----
assertion `left == right` failed: closed scope must not fall back to its stale descriptor word
  left: "blocked"
 right: "idle"
test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
```

### F2/F5/F8 — missing-word, extra-variant and dropped-metadata mutants (exit 101)

`cargo test -p pij-core --test status`

Omitted cancelled from published WORDS; added synthetic SystemState::Suspended
with rank 15 in both rank matches but no BADGE_SEVERITY entry; changed projection
metadata attributes to `serde(skip)`.

```text
---- every_state_has_a_published_badge_slot stdout ----
Suspended has no published badge slot

---- peer_status_metadata_decodes_but_raw_descriptors_never_emit_it stdout ----
assertion `left == right` failed
  left: None
 right: Some("blocked")

---- semantic_words_match_every_declared_variant stdout ----
assertion `left == right` failed
  left: {"blocked", "done", "failed", "hold", "question", "ready", "waiting"}
 right: {"blocked", "cancelled", "done", "failed", "hold", "question", "ready", "waiting"}
test result: FAILED. 4 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out
```

Independent serialization-leg mutant: removed `skip_serializing` (kept
`default`). `cargo test -p pij-core --test status peer_status_metadata_decodes_but_raw_descriptors_never_emit_it`:

```text
---- peer_status_metadata_decodes_but_raw_descriptors_never_emit_it stdout ----
assertion failed: raw.get("badge").is_none()
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 6 filtered out
```

### Restored implementation — GREEN

`cargo test -p pij-core -p pij-store -p pij-daemon --test status --test status_http --test report_http`
passed **41 tests across four suites**. The clear test witnesses unscoped clear
leaving blocked testimony, then scoped clear returning idle without closing the
task. Ownership refusals preserve the spine. No tests were weakened to pass.

### Actual fixed CLI and forward-migration smoke

Built `target/debug/pij-rs`, launched it with private HOME/Claude configuration
and state at `127.0.0.1:51219`, using a SQLite backup of the original isolated
fixture. Native CLI invocations (all exit 0) cleared blocked-task then done-task:
the card moved **blocked → done → idle**, demonstrating that clearing one
assignment preserves the other. Both tasks remained open.
The final native roster row and card agreed on `badge: "idle"` and
`last_event_at: 1789176898308`; roster liveness remained absent.
The original fixture remained schema 19; the private daemon migrated its copy
to schema 20 with `spine_by_seat_kind`. CLI `report --help` printed the generated
eight-word list and the scoped-clear grammar. The private daemon was stopped.
Full receipts: [`fix-cli-smoke.json`](./fix-cli-smoke.json).

**Deployment boundary:** the additive index advances the schema to 20. Under
the existing directional schema guard, an older schema-19 binary refuses the
migrated store; dropping the index alone is not a supported rollback. Production
deployment/rollback remains prime-owned.

### Round-2 gate receipts

- `harness boot`: ready=true; worktree dependencies, typecheck and smoke passed.
  Automatic conversation ingestion reported unresolved session identity;
  no ingestion success is claimed.
- `cargo fmt --all --check`: exit 0 after formatting the changed Rust files.
- Bare `node_modules/.bin/biome check .`, with `$?` captured immediately:
  **BIOME_EXIT=0**, “Checked 540 files in 319ms. No fixes applied.”
  One informational notice: config schema 2.0.0 versus installed CLI 2.4.14.
- The packet's `just checks` recipe is absent. Prime explicitly corrected it
  to full `just self-check`; this is the canonical composite, not a reduced gate.
- `cargo test --workspace`: **1078 passed across 88 suites**, 8 ignored,
  93 filtered; exit 0, 164.98 seconds, serialized with `RUST_TEST_THREADS=1`.
- `cargo clippy --workspace --all-targets -- -D warnings`: exit 0.
- **Full `just self-check`: exit 0**, 112.45 seconds. Vitest: 241 files /
  5306 tests passed, 4 files / 22 tests skipped. Copilot native: 170 passed,
  3 skipped. Windows portable checks: all passed (84 focused tests, 2 skipped).
  All 11 smoke scenarios passed on this first round-2 composite invocation,
  after cargo finished; no cargo job in this worktree or private smoke daemon
  was running. No smoke retry or reduced composite was needed.
  Closing receipts: `snapshot-check: briefing.md SHA matches snapshots
  (cdf5f5b25001...)`; `pij-commit-trailers: warn — 0 missing across 3 harness
  commit(s) since merge-base with main`.
- **Report-only package finding, not suppressed:** `git:github.com/ghoseb/pi-askuserquestion`
  aggregate fail, score 58, **4 fail / 13 warn**. Audit named critical Vitest /
  coverage-istanbul advisories, high nanoid and undici advisories, non-allowlisted
  Azure package hosts and missing detected license. Under the existing
  report-and-continue policy this is non-blocking; the package was left unchanged
  for operator review, not silently accepted as safe or disabled.
  The remaining three packages reported aggregate ok. Attribution still reports
  only the three inherited unresolved Pij-Seat applicability notices listed in
  the historical gate section; no shared history was rewritten.
- Recorded DL-002 for the misleading regression fixtures; the new contrasted
  inputs and mutation witnesses encode the correction. `harness observe --list`
  listed the visible observations; read-only `harness retro insights --json`
  returned 63 records / 265 entries. Prime retains canonical receipt/governance
  ownership; no flight-plan or governance files were edited.

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
- Round-1 harness-improvement claim corrected: the test prevented default roster liveness but did not discriminate the badge fallback, and the closing test did not protect the descriptor guard. The round-2 contrasting-state fixtures and pasted mutation failures above supply those missing controls.
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

Production and chainglass rendering are prime-owned and unverified here. There is no native activity publisher, stalled projection, suspension observer, roster liveness value or new liveness policy. The only schema change is the additive seat/kind/sequence index; no capability endpoint was added. An older federated daemon may omit its badge; current-peer projection metadata is preserved by the tested codec rather than re-derived from partial remote semantics. Cross-machine network operation was not exercised.
