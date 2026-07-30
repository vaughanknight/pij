# Phase 3 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
**Agent**: pij-panicky-caribou
**Delegation**: dlg-0006

---

## T001 — Regression locks and RED

**Status**: complete

- Added byte-level locks for the exact stamped `state-set`, `state-cleared`, and
  `state-verified` JSON records before changing production code.
- The three locks passed on the old spelling, then passed unchanged after only their
  invocations moved to `report state|clear|verify`.
- Added RED coverage for family parsing, 280-character validation, newline refusal,
  inline-markdown preservation, complete semantic-state vocabulary errors,
  registry-backed self resolution, old-spelling removal, status writes, project
  attribution, assignment non-materialization, failure semantics, denorm lifetime,
  and JSON projections.

Pre-production RED:

```text
Test Files  1 failed (1)
Tests  13 failed | 307 skipped (320)

unknown command 'report'
```

The failure was the missing family registration, not a fixture or store failure.

## T002-T002c — Report family and moved state writes

**Status**: complete

- Added `report` to the core family, flag, arity, parse, execute, and platform
  dispatch tables.
- Added the control-plane `USAGE` block; `pij report --help` now prints only the
  report-family lines instead of silently falling back to the full usage.
- Moved `state set`, `state clear`, and `state verify` to `report state`,
  `report clear`, and `report verify`.
- Kept `pij state <id>` unchanged as the read-only state card.
- `report now|state|clear` take no node positional. `report verify <node>` keeps
  its supervisory target.
- Added `resolveReportingSelf`: an asserted `PIJ_SESSION_ID` is insufficient unless
  the corresponding descriptor exists. Every report writer refuses `E-NOID`
  before any platform write when the caller is not registry-backed.
- Dissolved descriptors are refused with a `pij revive <id>` remediation; a stale
  identity cannot append claims as a closed seat.
- `report verify` is supervisory: the target seat cannot verify its own `done`
  claim. The exact verify-record lock uses a distinct registered reviewer and target.

### Pre-lock descriptor ordering fix

This was a real ordering defect found during review, not a refactor.

Before: first-person resolution read the reporter descriptor before acquiring the
platform lock. If a concurrent `task set` moved the descriptor from assignment A to
B while the report waited, the locked operation still used snapshot A. A state
report could write the old assignment and the denorm could restore the descriptor's
pointer back to A.

RED reproducer:

```text
Test Files  1 failed (1)
Tests  1 failed | 322 skipped (323)

AssertionError: expected refs to include 'assignment:asg-new'
```

After: identity preflight still refuses an unregistered seat early, but every report
writer re-reads the reporter descriptor after acquiring the lock. `report verify`
also re-reads its supervisory target inside the lock. The same test now proves the
state event, status attribution, assignment chain, and descriptor denorm all follow
assignment B.

## T003-T004 — Status event and one-lock composition

**Status**: complete

- Added the `SPINE_KIND_STATUS` platform vocabulary entry.
- Bare `report now` appends one `status` event with the normalized did/next text in
  `prev`/`next`.
- Status refs contain `node:<seat>`, the current assignment when present, and the
  explicit-or-assignment project when present. They never duplicate `state:<word>`.
- `report now --state` runs the existing journal-first state transaction and then
  appends `status` under one `withPlatformWriteLock`.
- The ruled order is `state-set` then `status`; the status event carries
  `state-set:<stamped-seq>` so consumers never rely on adjacency.
- Bare status never materializes an assignment. The state leg retains the existing
  implicit-general behavior.
- Bare status validates that a current assignment exists and belongs to the
  reporter before permanently stamping assignment/project refs; dangling or foreign
  descriptor pointers fail loudly.

## T005-T007 — Failure ladder and attribution

**Status**: complete

- State journal failure stops before status.
- Status append failure reports that state WAS set and leaves exactly the
  `state-set` event.
- Status-denorm failure reports that both events landed; the spine remains truth and
  the descriptor remains only a cache.
- Project attribution is explicit `--project`, then the current assignment's
  `projectSlug`, then omitted. Empty, whitespace, path-like, and non-kebab project
  values are refused rather than stamped.
- Whitespace is collapsed before the 280-character check. Newlines are refused.
  Backticks, bold markers, and links remain byte-preserved.

## T008-T010 — Durable denorm, projections, and output

**Status**: complete

- Extended `denormDescriptor` with explicit assignment and status field groups.
- Assignment swaps and state clears remove `semanticState`; the
  `statusPrev/statusNext/statusAt/statusSeq` family deliberately survives.
- `list --json` and `node show` project the four status fields as pure descriptor
  reads. Human `node show` includes one report line.
- `report now --json` prints the stamped status event verbatim.
- Human output is one line and preserves inline markdown text.
- Added a real-bin integration proving state-set → status order and the durable node
  projection.

## Removed-capability caller migration

**Status**: complete

Code/test/remediation callers migrated under the first scope extension:

- `.pi/extensions/pij/acceptance-sweep.test.ts` now drives registered first-person
  report writers. Its historical foreign-hold-clear detector case seeds the durable
  legacy spine record directly instead of reintroducing an asserted-actor bypass.
- `.pi/extensions/pij/core/anomalies.ts` now tells the affected seat to run
  `pij report state ...`; it no longer prescribes a removed command.
- `.pi/extensions/pij/core/anomalies.test.ts` locks that runnable remediation.
- `.pi/extensions/pij/core/types.ts` names the current report spelling in the
  semantic-state docstring.

Prescriptive surfaces migrated separately under the second scope extension:

- `skills/pij/references/routes/node.md`
- `skills/pij/references/prime/rituals/store-native.md`
- `docs/how/pij.md`

The governing test was: does the text tell someone what to do, or record what someone
did? Prescriptive text migrated in this phase so no skill/help window advertises a
dead command. Historical briefs, plans, execution logs, and government records were
left unchanged because rewriting them would falsify what actually happened.

## DIM-0 mutation transcript

Mutation: removed the `state-set:<seq>` correlation ref from the status event.

Targeted RED:

```text
Test Files  1 failed (1)
Tests  1 failed | 321 skipped (322)

AssertionError: expected [ 'node:pij-self', …(1) ] to include 'state-set:1'
```

Restored GREEN:

```text
Test Files  1 passed (1)
Tests  1 passed | 321 skipped (322)
```

## Final gates

| Gate | Result |
|------|--------|
| `just typecheck` | exit 0 |
| `just lint` | exit 0; 9 existing warnings and one Biome schema-version info remain |
| `just test` | 200 files passed, 4 skipped; 3,708 tests passed, 0 failed, 19 skipped |
| `harness checks` | all 8 sensors passed; none skipped |

The full-suite passed count increased from Phase 2's 3,684 to 3,708 because Phase 3
adds 24 tests: byte-level move locks, report-family/core behavior, the locked-time
reread regression, dissolved/assignment/self-verify refusals, help/integration
coverage, and the real-bin status projection.

## Friction

- The task file still described an unresolved bare status verb after Jordan had
  ruled the `report` family and moved the state writes. The plan had the truth, but
  the worker packet had to carry an explicit precedence rule. Task generation should
  either refresh from the plan after rulings or stamp a visible superseded marker.
- The pre-coding backpressure survey writes a plan-root artifact outside this
  delegation's allowed phase folder. The scope contract correctly prevented the
  write, but the harness seam and flow-pair scope are not currently composable.
- Vitest parses a `-t` pattern beginning with `--` as an option. Mutation commands
  should use a non-option substring or the harness should provide a paved targeted
  test wrapper that quotes option-like test names safely.
- The original packet's allowed paths were incomplete for a fourth time, but this
  instance was a different class from capability enrollment. Removing or renaming a
  capability requires a repo-wide caller grep, especially over user-facing
  remediation and skill text. Enrollment is a checklist; callers are mechanically
  discoverable.

## P3 fix round — independent locked-time reread proofs

The production rereads were already correct on all four report paths, but only
`report now --state` had a concurrency regression. Added one independent
lock-boundary interleaving test for each unprotected sibling:

- `report state`: a contending `task set` moves the reporter from assignment A to
  B after report preflight and before report acquires the platform lock. The state
  event and chain must select B, while A stays unchanged and the descriptor denorm
  remains on B.
- `report clear`: A is declared `waiting`, then a contending `task set` moves the
  descriptor to fresh undeclared assignment B. Clear must select B and refuse
  without a `state-cleared` event; it must not clear A or restore A's denorm.
- `report verify`: the supervisor dissolves after preflight and before lock
  acquisition. Verify must refuse `E-NOID` and append no verification event.

Each reread was then replaced separately with the stale pre-lock `reporter`.

```text
report state mutation:
Tests  1 failed | 328 skipped (329)
AssertionError: state refs did not include the concurrent assignment B

report clear mutation:
Tests  1 failed | 328 skipped (329)
AssertionError: expected exit 64, received 0

report verify mutation:
Tests  1 failed | 328 skipped (329)
AssertionError: expected exit 2, received 0

restored:
Tests  3 passed | 326 skipped (329)
```

The suite grew by exactly three tests: `core/cli.test.ts` moved from 326 to 329
tests, and the full passed count moved from 3,708 to 3,711.

Pattern carried forward: correct code is not a durable fix until the guarded
behavior has an independently failing mutation. A shared implementation with four
callers needs four proofs when any caller can regress without reddening the others.

### Fix-round final gates

| Gate | Result |
|------|--------|
| `just typecheck` | exit 0 |
| `just lint` | exit 0; 9 existing warnings and one Biome schema-version info remain |
| `just test` | 200 files passed, 4 skipped; 3,711 tests passed, 0 failed, 19 skipped |
| `harness checks` | all 8 sensors passed; none skipped |
