# scratch — pij's first real extension

**Mode**: Simple
**Created**: 2026-05-10
**Status**: Clarified (2026-05-10)

## Summary

`scratch` is the first **real** extension built using the pij harness — a
small session-scoped notepad with slash commands, LLM-callable tools, and
a status-line widget. The throwaway `demo` extension generated during the
v0.1.0 harness build was the harness self-test; **`scratch` is the first
extension we keep**, and the first one whose authoring path is measured.

The point is **orientation**. Scratch is small enough to keep entirely in
your head, but it organically exercises seven of the highest-value
ExtensionAPI surfaces (`registerCommand`, `registerTool`, `session_start`,
`appendEntry`, `ui.notify`, `ui.confirm`, `ui.setStatus`). After scratch
ships, both human and agent should have a working mental model of how pi
extensions are written, tested, and iterated on.

The full design is **already done** in
[`docs/plans/001-pi-extensions/workshops/003-scratch-extension.md`](../001-pi-extensions/workshops/003-scratch-extension.md)
(942 lines, paste-ready reference implementation). This spec does not
re-design — it frames the *why now*, picks up the open questions, and sets
the acceptance bar.

## Why now

Three things happen at once when scratch is built:

1. **Orientation.** The first extension we author with our own harness.
   Both pij authors learn the shape of a real extension by building one
   small enough to fit in one head.
2. **Velocity test (AC-15 from harness spec).** Scratch is the
   compounding-hypothesis test against the v1 baseline measured in
   `docs/velocity.md`. Falsifiable: scratch's `npm run new -- scratch`
   → command-registered wall-clock should be materially shorter than v1's
   equivalent path. *Provisional* target: ≤ 50% of v1.
3. **D-005 resolution.** Workshop 003 § Open Questions Q1 — "do
   `customType` entries survive `/compact`?" — has been an open assumption
   since v1. Scratch's smoke scenario verifies it empirically. If the
   assumption is wrong, the snapshot fallback (~30 lines in `store.ts`)
   ships with v1.

## Goals

- Ship a working `/scratch` extension end-to-end (commands + tools +
  status line + persistence) using only the pij harness path:
  `npm run new -- scratch` → fill in templates → `npm run self-check`.
- Verify D-005 (compaction survival) one way or the other; if entries
  don't survive, encode the snapshot fallback before we tag.
- Verify D-006 (`setStatus(key, "")` semantics) by observation; encode
  the fix in templates if needed.
- Measure the wall-clock of the authoring path and log the result in
  `docs/velocity.md` against the v1 baseline.
- Leave both authors (human + agent) with a paste-ready mental model of
  the canonical extension shape.

## Non-Goals

- Stretch features from workshop 003 § Stretch goals — search, export,
  tag autocomplete, `scratch_inject`, custom message renderer,
  cross-session storage. Those are workshops 003a/003b/etc.
- A `scratch_delete` LLM tool. Workshop 003 Q2 — leave out of v1.
- Pre-compaction snapshot **unless D-005 forces it**. We are not
  speculatively adding code; we ship the fallback only if the smoke
  scenario proves we need it.
- Any harness changes. If template friction surfaces during scratch
  authoring, log it as D-NNN and either encode it in this PR (if
  surgical) or queue for follow-up. **The harness is treated as v0.1.0
  frozen** — except for friction the build itself surfaces.
- Cross-project / global notes (workshop 003 Q3 — resolved per-session).

## Target Domains

pij has no `docs/domains/` registry; the project's informal structure is
the harness + the extensions namespace. We model that here.

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|---------------------|
| `harness` | existing (informal) | **consume** | Use generator, templates, smoke runner, test-utils — no changes |
| `extensions` | existing (informal namespace) | **modify** | Add `.pi/extensions/scratch/` as the first kept inhabitant |

### Informal domain notes

Neither domain has a `docs/domains/<slug>/domain.md` file — pij is a
small harness, not a domain-organized application. If a third or fourth
extension creates pressure for a real domain registry, that's a workshop
in its own right (likely workshop 005 + a `/extract-domain` pass).

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=1, N=0, F=0, T=1 → P=4
- **Confidence**: 0.85
- **Assumptions**:
  - Workshop 003 reference implementation is correct against the real pi
    API (verified during v0.1.0 — `getEntries()` fix encoded as D-011).
  - The harness templates work as designed (validated end-to-end by the
    `demo` extension during v0.1.0).
  - D-005 mitigation, if needed, is the workshop's ~30-line snapshot
    pattern (no surprise architectural rework).
- **Dependencies**:
  - pij v0.1.0 (already shipped — 5f8076b... → main HEAD).
  - `@earendil-works/pi-coding-agent` `*` (peerDep, satisfied by host).
- **Risks**: see § Risks & Assumptions.
- **Phases**: Simple Mode → single-phase plan. Inline tasks in `/plan-3`.

## Acceptance Criteria

Anchored to workshop 003 § Acceptance for v1, plus the harness-level AC-15
velocity hypothesis and the D-005 verification.

### Functional (workshop 003 baseline)

1. **AC-01** `npm run new -- scratch` produces a working extension; no
   manual file edits required to reach a clean `npm run self-check`.
2. **AC-02** `cd pij && pi` autoloads scratch without error.
3. **AC-03** `/scratch add foo` then `/scratch list` shows `1. foo`.
4. **AC-04** `/reload`, then `/scratch list` still shows `1. foo`
   (verifies `session_start` replay over `customType` entries).
5. **AC-05** `/scratch del 1` removes the note; status line updates.
6. **AC-06** `/scratch clear` requires confirm; on accept, empties; on
   cancel, no entry written.
7. **AC-07** Status line shows `scratch: N note(s)` while notes exist;
   cleared (or D-006 mitigation applied) when empty.
8. **AC-08** LLM, prompted "save a note", calls `scratch_save`
   successfully; subsequent `scratch_list` returns the saved note.
9. **AC-09** `/new` produces an empty pad (fresh session = fresh
   scratchpad).
10. **AC-10** `npm run typecheck && npm run lint && npm run test`
    all green; `store.test.ts` exercises positive, negative, and replay
    cases.

### Smoke (D-005 verification)

11. **AC-11** Smoke scenario: add ≥2 notes → `/compact` → `/scratch list`
    returns the same notes.
    - If **pass**: D-005 is resolved (entries survive); status →
      `resolved`.
    - If **fail**: snapshot fallback per workshop 003 § Q1 must ship
      *with this PR*; D-005 status → `mitigated` and the smoke scenario
      is updated to verify the fallback path.

### D-006 verification (opportunistic)

12. **AC-12** During scratch dogfooding, observe what
    `ctx.ui.setStatus("scratch", "")` does. Record finding in
    `docs/difficulties.md` (D-006 → resolved or mitigated). If a guard
    is needed, encode it in scratch's `index.ts` *and* in the harness
    `index.ts.template` so future extensions inherit the fix.

### Velocity (measurement-only; AC-15 ratio decoupled)

13. **AC-13** Wall-clock from `npm run new -- scratch` to "scratch
    extension responds to `/scratch list` after `/reload`" is recorded
    in `docs/velocity.md` as an **absolute** measurement. No ratio is
    claimed against any inferred v1 baseline (clarify Q3 — see
    § Clarifications).
14. **AC-14** The harness spec's AC-15 compounding ratio is **NOT**
    decided in this PR. It is explicitly deferred until extension #3
    lands and `velocity.md` holds at least two real-extension
    data points. This PR's velocity job is to *produce* the first such
    data point, not to *judge* it.

## Risks & Assumptions

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-1 | D-005 falsified — `customType` entries don't survive `/compact` | medium | medium | Snapshot fallback already designed (workshop 003 § Q1); ~30 LOC; ship with v1 if needed |
| R-2 | D-006: `setStatus(key, "")` displays empty pill instead of clearing | low | low | Trivial guard in store.format / index; encode in template |
| R-3 | Template friction surfaces during scratch authoring (P6 cast violations? P7 `.js` extensions? generator UX?) | medium | low | D-NNN log; encode surgical fixes in this PR; queue larger ones |
| R-4 | Velocity ratio drift — scratch is the *first* real-extension data point; no comparison ratio is claimed in this PR (per clarify Q3) | n/a | n/a | Defer AC-15 ratio decision until ≥2 real-extension data points exist |
| R-5 | Pi API drift between v0.1.0 and now (workshop 003 wrote against an earlier snapshot) | low | medium | Fresh `npm install` + `npm run typecheck` catches signature changes; fix forward |

### Assumptions

- Workshop 003 reference implementation is the design of record. We do
  not re-litigate slash command shape, tool schema, or persistence model
  here.
- The harness templates from v0.1.0 are correct enough to seed scratch.
  If they're not, that's a finding worth more than the velocity number.
- "Materially faster than v1" is ≤ 50% of v1's measured equivalent path
  *as a provisional target* — locked when we record the actual number.

## Open Questions

| ID | Question | Status | Decision path |
|----|----------|--------|---------------|
| Q1 | Do `customType` entries survive `/compact`? | OPEN — verify via AC-11 smoke | Resolved by smoke scenario; fallback ready if not |
| Q2 | Does `setStatus(key, "")` clear or display empty? | OPEN — verify via AC-12 dogfood | Resolved by observation during build |
| Q3 | Should we publish `scratch` as a standalone npm package, or keep it inside pij? | DEFERRED to workshop 005 (distribution) | Gate: ≥3 stable extensions before workshop 005 starts |
| Q4 | Does the `/compact` survival result generalize to all `customType` entries, or is it scratch-specific? | OPEN — out of scope for v1 | Re-test with extension #3 if/when it also persists |
| Q5 | When does the harness spec's AC-15 compounding ratio actually get decided? | DECOUPLED (clarify Q3) | After ≥2 real-extension data points exist in `velocity.md`; likely the retrospective at extension #3 |

## Workshop Opportunities

**None.** Workshop 003 (942 lines) already covers the design,
reference implementation, patterns P1-P10, edge cases, and open
questions. Re-workshopping would be busywork.

The only candidate workshops downstream of scratch are:
- Workshop 005 (distribution) — gated on ≥3 stable extensions.
- Workshop 003a (`/scratch search`), 003b (export), etc. — only if
  scratch proves useful enough to extend.

Neither is on the path for this spec.

## Clarifications

### Session 2026-05-10

**Q1 — Workflow Mode**
Confirmed Simple. Single-phase plan, inline tasks, design from
workshop 003. Plan-4 / plan-5 optional.

**Q2 — Testing Strategy**
Hybrid (see § Testing Strategy below). Full vitest coverage on
`store.ts` (positive + negative + replay). Smoke for `/compact`
survival (AC-11). Manual for `/reload` and LLM-tool dogfood (AC-04,
AC-08).

**Q3 — Velocity baseline**
Record scratch's wall-clock to `docs/velocity.md` as an **absolute**
measurement only. **No ratio claimed** against any inferred v1
baseline — `velocity.md` currently holds only infrastructure timings
(install/self-check), not extension-authoring timings, so the anchor
doesn't exist. AC-15 from the harness spec is **explicitly decoupled**
from this PR; it gets decided at extension #3 when ≥2 real-extension
data points exist. Honors D-009 (no fabricated baselines).

**Inline-resolved (no question asked):**

- **Mock Usage** = no mocks. Pattern P2 makes `store.ts` pi-free, so
  there is no pi surface to mock. The recorder helper at
  `harness/test-utils.ts` (`makeRecorder()`) is an injected
  side-effect collector, not a mock — it captures `appendEntry` calls
  the store makes against an injected interface. Tests target the
  store directly with real (in-memory) entry arrays.
- **Documentation Strategy** = per-extension `AGENTS.md` is
  auto-generated by the harness template — that's the canonical
  reference for the extension. The root `README.md` § Status section
  already reserves a line for "extension #2 (the real first one)";
  update it once scratch lands. No `docs/how/` page; workshop 003
  remains the deep design doc.
- **Domain Review** = pij has no `docs/domains/` registry. Both
  domains in § Target Domains are informal. No boundary concerns;
  scratch is the first occupant of `extensions` namespace and
  consumes `harness` unchanged. If extensions #3 / #4 surface
  pressure for a real domain registry, that's a future workshop.
- **Harness Readiness** = pij IS the harness this feature exercises.
  `docs/project-rules/harness.md` is at L1/L2 (BIO contract from
  Phase 5 of v0.1.0). Sufficient by definition — building scratch is
  the first real proof of the harness's adequacy. No Phase 0 needed.

## Testing Strategy

**Approach**: Hybrid

**Rationale**: Workshop 003 Pattern P8 — "tests target the store, not
wiring." `store.ts` is pure logic (replay, mutate, format) over plain
data; it deserves real tests. `index.ts` is `pi.register*` calls and
slash-command parsing; bugs surface within seconds of `/reload`. Smoke
covers the only non-deterministic question (D-005, compaction
survival).

**Focus areas (where TDD/full coverage applies)**:

- `store.ts` — every replay rule (`scratch:note`, `scratch:delete`,
  `scratch:clear`), every mutation (`addNote`, `deleteNote`, `clear`,
  `format`), every limit (`MAX_NOTE_BYTES`, `MAX_LIST_BYTES`).
- Negative paths — out-of-range delete, oversized content, malformed
  replay data (P6 structural-guard rejection — covered by harness
  template's existing template-level negative test).
- Replay determinism — order-of-events test: note → delete → clear →
  note replays cleanly to a 1-note state.

**Lightweight / manual**:

- `index.ts` wiring — verified by `/reload` + `/scratch list`.
- LLM tool flow — verified by AC-08 (prompt model to save a note,
  observe).
- Status line — verified by AC-07 (visual check after each mutation).

**Excluded**:

- Mocking pi. Store is pi-free.
- E2E pi-runtime tests in CI. Pi requires `tmux` + API keys; deferred
  to local smoke (D-008 — SDK-driven smoke is a stretch goal).
- Performance / load. Scratch is `O(messages)` per `session_start`,
  bounded by pi's session length (<500 entries typical). Not a
  performance feature.

**Mock policy**: No mocks. Real entry arrays in tests; recorder helper
collects `appendEntry` calls via injected interface. Per Pattern P3
(inject side effects via constructor) + P2 (pi-free store).

## Documentation Strategy

**Location**: Generated per-extension `AGENTS.md` (auto-emitted by
harness template) + 1-line update to root `README.md` § Status.

**Rationale**: Workshop 003 (in plan 001) is the deep design doc and
remains the reference. The harness template generates a per-extension
`AGENTS.md` covering patterns, surfaces, and persistence — that's the
file someone reads when they `cd .pi/extensions/scratch`. No separate
`docs/how/scratch.md` because three deep docs about a 250-LOC
extension is over-documentation.

**What lands in this PR**:

- `.pi/extensions/scratch/AGENTS.md` (auto-generated by `npm run new`).
- 1-2 line update to root `README.md` § Status: replace
  "Extension #2 (the real first one — likely `scratch`)" with the
  shipped state.
- `docs/velocity.md` entry — scratch's absolute wall-clock + a
  prose note about D-005 outcome.
- `docs/difficulties.md` updates — D-005 status (resolved or
  mitigated), D-006 status, plus any new D-NNN that surface during
  the build.

## See Also

- [`docs/plans/001-pi-extensions/workshops/003-scratch-extension.md`](../001-pi-extensions/workshops/003-scratch-extension.md)
  — authoritative design (read this for the actual code).
- [`docs/plans/002-pij-harness/pij-harness-spec.md`](../002-pij-harness/pij-harness-spec.md)
  — AC-15 velocity hypothesis + harness contract scratch is testing.
- [`docs/difficulties.md`](../../difficulties.md) — D-005 (compaction
  survival) and D-006 (`setStatus` empty semantics) carry forward into
  AC-11 and AC-12.
- [`docs/velocity.md`](../../velocity.md) — v1 baseline scratch is
  measured against.
- [`AGENTS.md`](../../../AGENTS.md) — patterns P1-P10 the templates
  enforce; scratch's code must conform.
