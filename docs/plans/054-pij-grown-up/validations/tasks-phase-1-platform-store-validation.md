# Validation — tasks/phase-1-platform-store/tasks.md
**Validator**: validate-v2 (adaptive: lead + deterministic proof; prior 3-lens adversarial pass this session consumed in lieu of a fresh critic — its 11 findings were verified as folded) · **Date**: 2026-07-16 · **Revision validated**: dossier as of s054 worktree HEAD

## Verdict
❌ **NEEDS ATTENTION** — 0 critical, 0 high, 3 medium. Non-blocking: each fix is a one-line pin; build may proceed once folded (R6 per-phase loop).

- **Target**: `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/tasks.md`
- **Proof commands run** (fresh, in worktree):
  - `sed -n '177,181p;371,377p' .pi/extensions/pij/cli.ts` — USAGE at cli.ts:179 ✓, `deps()` at cli.ts:373 ✓
  - `grep -n runFocus .pi/extensions/pij/cli.ts` — runFocus at cli.ts:932 ✓ (bin, as cited)
  - `grep -n export .pi/extensions/pij/core/memorable-id.ts` — `memorablePijIdCandidate`/`memorablePijIdCandidates` exported, `Result<SessionId>`/`Generator<SessionId>` typing matches the dossier's wrapper caveat ✓
  - Anchors opened: focus-store.ts:30-49 guard + :59 subdir comment ✓ · events.ts:21-35 `filterEvents` ✓ · atomic-file.ts:60 `writeJsonAtomic` ✓ · fs-registry.ts:751 `publishNoReplace` ✓ · event-log.ts append:37/appendOnce:41/lastSeq:69 (inside cited 37-73) ✓ · fakes.ts FakeBatonStore:44 / FakeEventLog:172 ✓ · fs-registry.test.ts:114 temp-home rig ✓ · core/agents/boundary.test.ts exists ✓ · core/types.ts FocusManifest `version: 1` at :27 ✓ · core/cli.ts ALLOWED_FLAGS:308 / MAX_POS:322 / dispatch:748 exact ✓; ParsedCommand:72, CliDeps:60, parseArgs:367 land *inside* their symbols (decls at 71/48/336) — imprecise but functional anchors, not findings
  - `grep -n '^typecheck\|^test' justfile` — T011 gate commands exist ✓
  - Upstream conformance: plan v1.1.0 §Phase 1 binding spec (V-01) restated verbatim in T001 incl. `asg-general-<nodeId>` + close reasons ✓; WS-2 `repo?: gitCommonDir` verbatim ✓; `schema_version` per WS-4 with FocusManifest-`version` deviation recorded ✓; AC-01/02/03 each carried by named tasks ✓; R3 temp-PIJ_HOME fence in Non-Goals ✓; R5 max-5-agents in header ✓; backpressure Proof Plan Phase 1 (phantom-peer + purity + `just test`) mapped to T005/T007/T011 ✓
- **Structure**: 7 columns ✓ · T001–T011 unique ✓ · TDD ordering sound (T001→T002, T003→T004, T005→T006, T009→T010; T007/T008 test-carried) ✓ · Done-When all measurable, present-tense ✓ · absolute paths: fails on 10/11 rows (finding F3)

## Findings (adjudicated; each survived a disprove attempt)

| ID | Sev | Location | Claim | Proof | Impact | Smallest fix |
|----|-----|----------|-------|-------|--------|--------------|
| F1 | MEDIUM | T001/T009 (`--kind`, write→event coupling) | The `kind` values pij's own Phase 1 writes emit (project create/set events) are pinned nowhere — grep of plan, workshop 001, and dossier finds no kind vocabulary — yet kind is a public on-disk contract (WS-4) consumed by Phase 4's renderer and the future UI | `grep -n kind` over all three upstreams: field named, values absent | Implementer invents public-contract strings; cross-phase drift risk into 4.1 render | One line in T001 notes: pin the emitted kinds (e.g. `project-created`, `project-set`) as exported constants in types.ts, or explicitly rule kind an open string with pij-emitted kinds centralized there |
| F2 | MEDIUM | T009 note "attribution stamping (actor = caller identity)" | How the CLI acquires caller identity is unpinned — the in-file precedent `selfId(deps)` (core/cli.ts:601, resolveSelf via pane/registry/cwd) is never cited, and behavior when identity is unresolvable (human in an unregistered shell — a WS-5-legal actor) is undefined, on the plan's stated Phase 1 key risk (attribution envelope) | core/cli.ts:601 `selfId` exists but errors outside a registered pane; WS-5 names `human` an allowed actor; no fallback ruled anywhere | Implementer invents actor-resolution behavior for the load-bearing envelope; possible hard-error path contradicting WS-5 | One line in T009/T010 notes: actor = `selfId(deps)`; define the unresolvable case (error with guidance, `--actor` override, or `human:<user>` fallback — decision needed) |
| F3 | MEDIUM | Tasks table Path(s) column | 10/11 rows use `…/` instead of absolute paths, and the ellipsis expands two different ways: extension root in T002–T010 vs worktree root in T011 — a dual-meaning prefix in a packet consumed by a peer without this session's context | T001 = `…/s054-pij-grown-up/.pi/extensions/pij/…`; T011 = `…/docs/plans/…` (worktree root). Mitigated in-document by the Pre-Implementation table + footer tree | Low-probability file misplacement; fails the named well-formedness criterion | Spell both prefixes once (or make every Path absolute) |

## Promise check (residual)
Assignment binding spec, id schemes (`asg-<adjective-noun>`, `asg-general-<nodeId>`), store layouts (`projects/<slug>/project.json`, `assignments/<id>.json`, `spine/events.ndjson`), envelope fields, collision rule, filter exactness, and reuse anchors are all pinned by dossier+plan — no other invention point found. `prev?/next?` value typing is test-decidable and Phase-2-consumed (plan 3.3 pins the re-parent shape); rated LOW, omitted.

**Thesis**: advanced — deterministic anchors all verified fresh, TDD ordering sound, AC-01/02/03 fully carried, R3/R5/R6 fences internalized; three small pin-gaps remain where the implementer would otherwise invent public-contract or envelope-path details.
**Consumers**: implement stage (peer pij-dizzy-angelfish) — actionable after the three one-line pins; Phases 2–4 — fakes, envelope, implicit-general materialization rule, and spine substrate they depend on are specified. 2/2 named consumer groups otherwise satisfied.
**Open decision**: F2's unresolvable-caller behavior is a product-judgment micro-decision (error vs override vs fallback) — one ruling line suffices.

## Fold record (orchestrator, post-adjudication)
All 3 MEDIUM findings folded into tasks.md same-session: F1 kind constants pinned (`project-created`/`project-set`, open-string for external writers) · F2 actor = selfId + asserted `--actor` with `actorProvenance` (WS-5-consistent) · F3 path prefix convention spelled + T011 absolute. Effective verdict: **VALIDATED WITH FIXES**. R6 tasks→validate gate: PASSED.
