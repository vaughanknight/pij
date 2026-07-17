# Review — dlg-0001

**Verdict: FIX_REQUIRED**

Phase 1 is not ready to converge. The deterministic self-masking invariant still has a load-bearing hole, and the required execution/learning artifact is absent. Typecheck, the full test suite, and lint all exit cleanly; two focused mutation checks independently prove that the existing pane-change exclusion and UTF-8 byte boundary assertions are non-vacuous.

## Findings

### CRITICAL-1 — A watchdog-caused working transition can still fabricate recovery (D4 / T004)

**Evidence:** `.pi/extensions/pij/core/watchdog.ts:80-83,98-102`; `.pi/extensions/pij/core/watchdog.test.ts:143-159`.

`WatchdogPaneObservation.changeWasWatchdog` filters `changed`, but `workingTransition` is accepted unconditionally:

```ts
const realPaneChange = inputs.pane?.changed === true && !inputs.pane.changeWasWatchdog;
const workingTransition = inputs.pane?.workingTransition === true;
if (realEventAdvance || realPaneChange || workingTransition) return "responsive";
```

A direct execution with every observed activity signal attributable to the watchdog still returns `responsive`:

```text
npx tsx -e '... evaluateResponse({
  cfg: effectiveWatchdog(), consecutiveSilentFires: 2,
  eventAdvanced: true, eventAdvanceWasWatchdog: true,
  pane: { changed: true, workingTransition: true, changeWasWatchdog: true }
}) ...'
→ responsive
```

D4 requires daemon-injected activity never to count as output. Processing the injected turn can produce the busy/working transition, so this path can mask the exact frozen-peer condition the feature exists to detect. The current self-masking test sets `workingTransition:false`, leaving this combination untested. The typed input/decision must distinguish a real working transition from one attributable to the watchdog (or consume an already-filtered real-transition signal), and the combined watchdog-only fixture must remain `stalled`.

### CRITICAL-2 — Required execution log is absent

**Evidence:** `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/execution.log.md` does not exist; worker packet `.flow-pair/runs/2026-07-17T01-03-56Z-github.com-AI-Substr/prompts/dlg-0001.md:248-259`; rubric `skills/flow-pair/references/review-rubrics.md:165-169`.

The allowed phase directory names `execution.log.md` as the implement-verb artifact, but the packet still says `(not yet created)` and no file was delivered. Dimension 7 makes an absent log an automatic `FIX_REQUIRED`. The missing artifact must record files changed, T001–T008 outcomes, decisions, and observed typecheck/test/lint results; its absence also leaves Dimension 10 learning evidence unsatisfied.

## Dim-0 mutation evidence (mandatory)

### Packet-mandated wrapper commands

Both exact `just flow-pair-mutate` invocations mutated and safely restored the target, but falsely stayed green because the existing wrapper hard-codes the unrelated `skills/flow-pair/test/` suite (`harness/scripts/flow-pair-mutate.sh:20`):

```text
just flow-pair-mutate .pi/extensions/pij/core/watchdog.ts \
  's/const realPaneChange = .*/const realPaneChange = inputs.pane?.changed === true;/'
→ mutation applied
→ FAIL: tests STAYED GREEN; 148 passed
→ target restored by EXIT trap

just flow-pair-mutate .pi/extensions/pij/core/watchdog.ts \
  's/usedBytes \+ width > maxBytes/usedBytes + width >= maxBytes/'
→ mutation applied
→ FAIL: tests STAYED GREEN; 148 passed
→ target restored by EXIT trap
```

This is a review-infrastructure scope mismatch, not evidence that the watchdog tests are vacuous. I therefore reran the same mutations through the underlying sanctioned script with the watchdog suite explicitly selected.

### Focused mutation 1 — D4 pane-change exclusion

```text
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/watchdog.ts \
  's/const realPaneChange = .*/const realPaneChange = inputs.pane?.changed === true;/' \
  'npx vitest run .pi/extensions/pij/core/watchdog.test.ts'
```

Outcome:

```text
RED under mutation: 1 failed | 25 passed (26)
GREEN after byte-identical restore: 26 passed (26)
mutation smoke PASSED
```

### Focused mutation 2 — exact UTF-8 byte boundary

```text
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/watchdog.ts \
  's/usedBytes \+ width > maxBytes/usedBytes + width >= maxBytes/' \
  'npx vitest run .pi/extensions/pij/core/watchdog.test.ts'
```

Outcome:

```text
RED under mutation: 3 failed | 23 passed (26)
GREEN after byte-identical restore: 26 passed (26)
mutation smoke PASSED
```

**Dim-0 conclusion:** the tested pane-change guard and byte-cap boundary are mutation-resistant. This does not cure CRITICAL-1: no test covers a watchdog-attributable `workingTransition` combined with watchdog-attributable pane/event changes.

## Independent gates

Executed from `/Users/jordanknight/pi-hacking/pij-worktrees/s055-pij-watchdog`:

```text
just typecheck && just test && just lint
```

- `just typecheck`: **PASS** (`tsc --noEmit`)
- `just test`: **PASS** — 137 files passed, 4 skipped; 2,045 tests passed, 11 skipped; watchdog suite 26/26
- `just lint`: **PASS (exit 0)** — 10 existing warnings and 1 Biome schema-version info; no warning points at the three implementation files

## Remaining rubric summary

- **Scope/purity:** implementation patch is confined to the three scoped code files; `types.ts` is additive (+14 lines); `binding.ts` has no diff; `watchdog.ts` has no fs/tmux/clock reads and no daemon import.
- **D1/D2/D3/D7:** default-on 1,200,000 ms, pause tiers, capture caps/modes, and optional pane/event-only paneless behavior are implemented and exercised.
- **Regression:** full gates pass.
- **Contract/plan/AC/prompt-follow:** blocked by CRITICAL-1 and CRITICAL-2.

---

## Round 2 — fix-0001

**Verdict: APPROVE**

Both critical findings from Round 1 are resolved, with direct behavioral, mutation, artifact, and full-gate evidence.

### CRITICAL-1 resolution — watchdog-attributable working transitions are excluded

**Evidence:** `.pi/extensions/pij/core/watchdog.ts:80-84,98-103`; `.pi/extensions/pij/core/watchdog.test.ts:143-160`.

`WatchdogPaneObservation` now carries typed `workingTransitionWasWatchdog` attribution. `evaluateResponse()` accepts a working transition as recovery only when that attribution is false. The regression fixture marks event advance, pane change, and working transition as watchdog-attributable and expects `stalled` at two silent fires.

Exact all-watchdog-attributable repro:

```text
npx tsx -e 'import { effectiveWatchdog, evaluateResponse } from "./.pi/extensions/pij/core/watchdog.ts"; console.log(evaluateResponse({ cfg: effectiveWatchdog(), consecutiveSilentFires: 2, eventAdvanced: true, eventAdvanceWasWatchdog: true, pane: { changed: true, workingTransition: true, changeWasWatchdog: true, workingTransitionWasWatchdog: true } }));'
→ stalled
```

Focused guard mutation through the underlying script with the explicit watchdog suite:

```text
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/watchdog.ts \
  's/ && !inputs\.pane\.workingTransitionWasWatchdog//' \
  'npx vitest run .pi/extensions/pij/core/watchdog.test.ts'
→ RED under mutation: 1 failed | 25 passed (26)
→ GREEN after byte-identical restore: 26 passed (26)
→ mutation smoke PASSED
```

The new attribution guard is therefore load-bearing and the original self-masking repro is closed.

### CRITICAL-2 resolution — execution/status artifacts are complete and substantive

**Evidence:** `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/execution.log.md:1-56`; `docs/plans/055-pij-watchdog/tasks/phase-1-pure-watchdog-core/tasks.md:73-81`.

The execution log does more than assert completion: it maps T001–T008 to concrete outcomes, lists every changed file, records key semantic decisions, preserves the honest chronology (initial RED, initial false `COMPLETE`, both Round-1 criticals, fix-cycle RED/GREEN, and mutation proof), records gate counts, and captures the working-transition attribution discovery. `tasks.md` marks every task T001–T008 `[x]`. This satisfies the artifact, prompt-following, and learning-evidence requirements that failed Round 1.

### Independent Round-2 gates

Executed from `/Users/jordanknight/pi-hacking/pij-worktrees/s055-pij-watchdog`:

```text
just typecheck && just test && just lint
```

- `just typecheck`: **PASS** (`tsc --noEmit`)
- `just test`: **PASS** — 137 files passed, 4 skipped; 2,045 tests passed, 11 skipped; watchdog suite 26/26
- `just lint`: **PASS (exit 0)** — the same 10 unrelated warnings and 1 Biome schema-version info; none points at the Phase-1 implementation files

**Round-2 conclusion:** no remaining finding in the narrowed re-review. The Phase-1 pure watchdog core is approved for convergence.
