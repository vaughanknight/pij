# Phase 3 Execution Log — Isolated proof, parity & docs

**Plan**: `docs/plans/055-pij-watchdog/pij-watchdog-plan.md`  
**Phase**: Phase 3: Isolated proof, parity & docs  
**Started**: 2026-07-17

## Binding execution doctrine

Entered through the required direct jump:

```text
/builder 6 implement --plan "docs/plans/055-pij-watchdog/pij-watchdog-plan.md" --phase "Phase 3: Isolated proof, parity & docs"
```

Amendment 001 is received and binding: every executable proof uses a temporary `PIJ_HOME`; the live daemon and real `~/.pij` are untouchable; Phase 3 changes no product code; `core/daemon/loop.ts` remains zero-diff; descriptor state is the only activity axis; smoke is deterministic or removed.

## Task log

### T001 — proof harness skeleton (initial stop; completed after fix-0003)

Created an executable, self-cleaning Phase 3 runner at `proofs/run-proofs.ts`. It rejects the real `~/.pij`, supplies every adapter and `Daemon` constructor with an explicit temporary `PIJ_HOME`, removes that home in `finally`, and exposes a `--list` surface.

A source review showed that watcher notification is called on each due anomaly, while AC-06 requires the owner/watchers to be notified once through the shared stalled episode latch. Per environment-first doctrine, this high-risk invariant was probed before building the remaining scenarios.

#### RED evidence — product defect

A disposable manager probe first returned two watcher-stalled notices. The durable runner then reproduced the same result through the real `Daemon.tick()` plus `FsRegistry`, `FsChannel`, and `FsWatchdogStore`:

```text
$ npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --list
AC-06 shared stall latch includes watcher notices

$ npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts
verdict: FAIL
failureReason: stalled
owner stalled notices: 1
watcher stalled notices: 2 (expected 1)
exit: 1
```

The runner advanced four deterministic ticks against a live paneless descriptor with no `lastEventAt` movement. Tick 3 established the stalled episode; tick 4 was a repeated stalled fire in the same episode. The descriptor stayed correctly stamped and the owner latch stayed correctly single-shot, but the watcher received the same `watchdog stalled: peer` notice twice. No `events.ndjson` file was read or used.

#### Binding stop

- **AC-06: FAIL** — watcher notification is not shared-latch/episode bounded.
- **AC-09: FAIL** — every acceptance criterion cannot be demonstrated while AC-06 fails.
- The task dossier says a FAIL stops Phase 3. SW-6 forbids a Phase 3 product fix, so T001 is blocked and T002–T009 were not started.
- `reports/proof-log.md` records every AC: AC-06/09 FAIL and the remaining scenarios skipped because the binding stop fired.
- Smoke, discoverability docs, domain updates, convergence note, and composite gates were deliberately not attempted after the product FAIL.
- No live-daemon command ran; the real `~/.pij` and all product files, including `core/daemon/loop.ts`, remain untouched.

#### Validation gap

`npx biome check docs/plans/055-pij-watchdog/proofs/run-proofs.ts` reports that plan-folder TypeScript is ignored and processes zero files. The executable `npx tsx` run is therefore the direct proof surface; lint configuration was not expanded outside this phase's fence.

## Resume after `fix-0003`

The coordinator review-approved the per-watcher episode fix at commit `27dceeb` and resumed `dlg-0003`. No Phase 3 product code was changed.

### T001–T005 — complete isolated acceptance proof

`proofs/run-proofs.ts` now exposes seven deterministic scenarios and one smoke composite. Every scenario creates its own `mkdtemp` `PIJ_HOME`, rejects the real `~/.pij`, instantiates the real filesystem registry/channel/watchdog store plus `Daemon.tick()`, and removes the home and any named scratch tmux session in `finally`. `--list` names AC-01..08/10 and the smoke flow.

Final proof result:

```text
AC-01..AC-08, AC-10: PASS
AC-09 aggregate: PASS
passed: 9; skipped: 0; failed: 0
tmuxAvailable: true
eventsNdjsonUsedAsActivityEvidence: false
```

Evidence highlights:

- absent sidecar fired once at exactly 1,200,000 ms and the scratch pane contained ordinal, exact pause/resume commands, and completion etiquette;
- CLI pause held inbox turns at 1, state/list showed `pausedBy:"self"`, and resume raised turns to 2;
- tmux `--command compact` and pi bare `/compact` both persisted before compact execution and auto-resumed only on real work;
- frozen scratch pane received four unsuppressed fires, stamped `stalled`, notified owner=1 and watcher=1, then typed real output cleared the reason; an unowned root was also stamped;
- anomaly capture was 39 lines/4,096 bytes with five inline lines; oversized always-mode capture was hard-capped at 160 lines/16,384 bytes and remained reachable on a healthy fire;
- spawn `--no-watchdog` produced the child environment marker, persisted `exempt`, fired zero times across three intervals, and appeared in state/list;
- delivery split used tmux `sendText` vs pi inbox, paneless notice/capture-n/a, and zero pre-bind fire.

The first expanded recovery run exposed a proof-model flaw, not a product defect: scratch `cat` has no harness footer and therefore cannot derive the watchdog turn's brief working→idle lifecycle. The runner now drives that typed attributed pair before real output, matching D4. The same correction was applied to smoke; no retry loop or product change was added.

`reports/proof-log.md` records every AC verdict and evidence pointer.

### T006 — deterministic smoke

`harness/scripts/smoke.ts` registers a `pij-watchdog` smoke that invokes the proof runner's `--smoke` composite. It uses a disposable home and scratch pane and covers:

```text
spawn scratch pane → first fire → pause suppresses → resume fires →
compact persisted before injection → real-working resume → capture pointer
```

`just smoke` — **PASS**, all ten smoke entries, no retries. The recipe accepts no scenario parameter; an attempted `just smoke watchdog` was rejected as an unknown second recipe before execution, after which the canonical full recipe was used.

### T007 — docs and discoverability

Created `docs/how/pij-watchdog.md` with all seven watchdog verbs, status/state/list JSON, `--no-watchdog`, the self-teaching etiquette, distinct self/compact/exempt tiers, blind-fire and stalled/recovery semantics, paneless behavior, default 40-line/4-KiB anomaly tail, always opt-in, and hard caps. Added the CLI coverage row to `skills/pij/SKILL.md` and additive watchdog contracts/history to `pij-control-plane`, `pij-messaging`, and `domain-map.md`.

### T008 — s054 convergence note

Created `reports/s054-convergence-note.md`, pinning `s054/pij-grown-up @ 647076a` and Seq 442/447. It makes s054's `systemState`/`SEMANTIC_STATES` plus assignment/context fields authoritative, preserves descriptor `lastEventAt` as axis truth, lists additive s055 contracts, and records open writer/recovery/compatibility questions for the o-prime re-sync. It changes no code.

### T009 — full gate complete

- `just local-path-check` — **PASS**.
- `just self-check` — **PASS** end to end: typecheck; Biome (existing warning/info output only); 2,073 tests passed and 11 skipped; Windows portability stages; all ten smoke entries; report-only package audit; snapshots.
- Package audit retained the pre-existing `pi-askuserquestion` dependency findings under report-and-continue policy; no package file was changed.
- `harness checks` — **PASS**, all eight sensors: local paths, typecheck, lint, test, Windows compatibility, smoke, package audit, snapshots.
- Post-gate proof rerun — **PASS**: AC-01..AC-10, 9 non-aggregate rows passed, 0 skipped, 0 failed; AC-09 PASS.
- `.pi/packages.yaml` SHA-256 stayed `4aaf036b17ab4bf70b59e7a6272e991cc38ba50070fd1f04c5ec80114de66be6` before/after both composites.
- `git diff --check` — **PASS**.
- Product scope — no Phase 3 product-code diff; `daemon.ts` and `core/daemon/loop.ts` remain zero-diff. Live daemon, real `~/.pij`, and `events.ndjson` activity evidence remained untouched.

## `fix-0004` — proof-strength review correction

Received `fix-0004` and re-entered through the binding direct jump. Review verdict was FIX_REQUIRED (0 critical / 3 high / 1 medium), restricted to proof strength; product, isolation, smoke, docs, and convergence artifacts passed review untouched. Reopened T002–T005 and T009. Required assertions: dedicated watchdog list before/after resume; call-time pi compact persistence; D4 negative state/count/activity checks plus a second silent episode; positive, exact, UTF-8-safe capture content and inline/stored correspondence. The packet also requires the reviewer’s empty-capture and early-clear sabotages to go RED before the clean run.

### T002 — AC-03 dedicated watchdog-list proof

Added real `pij watchdog list --json` calls while self-paused and after resume, located `pause-target`, and asserted the complete `{enabled, intervalMs, pausedBy, exempt, lastFireAt, watchers}` projection at both points. Kept `pij state --json` and top-level `pij list --json` as additive parity on both sides. The first assertion intentionally exposed a proof expectation error (`enabled` denotes configured supervision and remains true while `pausedBy:"self"`); corrected that expectation, then the runner returned 9 PASS / 0 SKIP / 0 FAIL.

### T003 — AC-04/05/06 ordering, D4 negatives, and latch reset

The pi `compact()` callback now asserts the sidecar is already `pausedBy:"compact"` at call time and records `piPersistedBeforeCompact:true`. After both attributed transition ticks, the frozen-pane scenario separately asserts: `failureReason` remains `stalled`; owner/watcher totals remain 1/1; descriptor `lastEventAt` remains the original epoch anchor. Real pane output then must clear the reason and move `lastEventAt` to 403 ms. Four more silent due fires establish a second stalled episode with cumulative owner/watcher totals exactly 2/2, proving both latches reset once.

Reviewer early-clear sabotage:

```text
mutation: add failureReason:undefined to the attributed working descriptor write
result: RED (runner non-zero; mutation smoke accepted the expected failure)
restored clean run: GREEN, 9 PASS / 0 SKIP / 0 FAIL
runner sha256 before/after: 918e523887106ffe4e2d0744466ea1391a07608042aa33abbba81c0c149bde3a
```

The mutation wrapper restored the runner byte-identically. A later exact rerun after all assertion changes returned exit 1 with `attributed working edge cleared stalled`; SHA-256 remained byte-identical at `fc10a1a133915f47e55c4a08a3272a1821a4109f3a8bfd6701a44f645c763c8d`.

### T004 — AC-07 positive capture identity and UTF-8 proof

The fixture now prints 260 deterministic `WD-CAP-NNN … TAIL-NNN` lines into the pane from a temp-home file. Both the healthy `capture.mode:"always"` and default anomaly paths assert:

- non-empty stored content and in-home pointer existence;
- exact equality with an independently calculated tail of the directly observed scratch pane;
- `WD-CAP-258` then `WD-CAP-259` identity/order;
- line and byte caps;
- a deliberately bisected three-byte `€` boundary, no replacement character, and UTF-8 round-trip;
- notice inline lines equal the first up-to-five stored lines.

The healthy anomaly negative and hard 200-line/16-KiB ceilings remain asserted. Clean evidence: anomaly 24 lines / 4,094 bytes; healthy always 98 lines / 16,383 bytes; both include the ordered tail markers.

Reviewer empty-pane sabotage changed only the AC-07 daemon capture seam to return no pane. The runner exited 1 at AC-07 with `healthy always-mode capture was empty`, then restored byte-identically:

```text
summary: FAIL — 6 passed / 2 skipped / 1 failed
runner sha256 before/after: fc10a1a133915f47e55c4a08a3272a1821a4109f3a8bfd6701a44f645c763c8d
restored clean run: PASS — 9 passed / 0 skipped / 0 failed
```

A bulk tmux paste of thousands of multibyte characters initially introduced terminal replacement glyphs before watchdog code saw the pane. The fixture now starts the scratch pane with `cat <temp fixture>; exec cat`, separating terminal transport from UTF-8 truncation evidence.

### T005 — proof log corrected

Updated every affected acceptance row and the aggregate disposition. AC-03 now names both dedicated watchdog-list projections; AC-04 records call-time pi persistence; AC-05/06 records both attributed negative edges, typed recovery, and the second episode; AC-07 records positive identity/order, exact tail equality, inline correspondence, bisected multibyte boundaries, and current cap values. The log includes both required exit-1 sabotages, byte-identical restoration, and clean runner SHA-256 `fc10a1a133915f47e55c4a08a3272a1821a4109f3a8bfd6701a44f645c763c8d`.

### T009 — `fix-0004` gate complete

- `just typecheck && just test && just lint` — **PASS**; the unchanged repository lint baseline remains 10 warnings plus one schema-version informational message.
- `just smoke` — **PASS**, all ten registered scenarios including `pij-watchdog`.
- Final isolated runner — **PASS**, 9 passed / 0 skipped / 0 failed; AC-09 PASS.
- Final runner SHA-256 — `fc10a1a133915f47e55c4a08a3272a1821a4109f3a8bfd6701a44f645c763c8d`.
- `git diff --check` — **PASS**.
- Product/manifest fence — `git diff --exit-code HEAD -- .pi/extensions/pij .pi/packages.yaml` **PASS**; `core/daemon/loop.ts` remains zero-diff.
- Packet/amendment isolation stayed binding: disposable `PIJ_HOME` and scratch tmux only; no live daemon, real `~/.pij`, or `events.ndjson` activity evidence.
