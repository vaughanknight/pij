# pij Harness — Feature Specification

**Plan**: 002-pij-harness
**Created**: 2026-05-09 · **Clarified**: 2026-05-09
**Status**: Clarified
**Mode**: Simple — single-phase sequencing with inline tasks; testing intentionally overridden to **Hybrid** (above the Simple-mode default of Lightweight) because store-layer correctness matters from day one.

📚 This specification incorporates findings from the broader research at
`../001-pi-extensions/research-dossier.md` and the harness design captured
in `../001-pi-extensions/workshops/004-pij-harness.md`. Workshops are
authoritative design decisions; this spec extracts their WHAT/WHY into
testable acceptance criteria.

---

## Research Context

The 8-agent research effort under `001-pi-extensions/` produced 182 findings
across the pi extensibility surface, the third-party ecosystem, and 11 peer
harnesses. Workshops 001–003 documented:

- How extensions reach pi (six load paths, with project-scoped autoload
  recommended for dev).
- The edit-reload-test cycle (`/reload` is manual; pi has no file watcher).
- The canonical `scratch` extension shape and ten patterns (P1–P10) covering
  layout, testability, persistence, and import hygiene.

Workshop 004 reframed the work: **pij is not a collection of pi extensions;
pij is the engineering harness that makes building pi extensions fast.**
Individual extensions are exercises that prove the harness compounds
velocity. This spec turns that workshop into a buildable feature.

---

## Summary

Build the foundational engineering harness for pij so that any future pi
extension can be scaffolded, tested, smoked end-to-end, and shipped with
the full toolchain in place — without each new extension reinventing
boilerplate, layout, or testing patterns. The harness encodes patterns
P1–P10 (workshop 003) as templates, lint rules, and generators rather than
as markdown nudges. Difficulties are tracked and resolved as encoded fixes,
not documented workarounds. Velocity per extension is logged and expected
to compound — extension #2 should take materially less time than extension
#1, with the gap widening from there.

The concrete deliverable is a working pij root: configuration files, a
`harness/` directory with templates and generator scripts, a smoke runner,
seeded ledgers, agent rules, a runbook, and CI — validated by scaffolding
a throwaway `demo` extension end-to-end.

---

## Goals

- Compress the path from a fresh pij clone to a working pi extension
  command into a single `npm run new` invocation plus the BIO loop.
  Concrete v1 wall-clock baseline is **TBD — measured during the harness
  build itself** and recorded in `docs/velocity.md`. The previously cited
  "~80 minutes hand-rolled → ≤6 minutes target" numbers were unmeasured
  intuition from workshop 004 (the "5-minute test" concept) and are
  **not** used as gates here. Compounding is judged against the measured
  v1 baseline (see AC-15).
- Encode patterns P1–P10 as **executable artifacts** (templates, lint rules,
  type config) so a new extension that follows them is the path of least
  resistance.
- Make the data layer of every extension **testable in plain Node** without
  booting pi (Pattern P2 + P8: pi-free store + tests target the store).
- Provide an end-to-end **smoke validation** that drives pi via tmux and
  asserts on captured output, so behavioural regressions in tools and
  commands fail loudly before merge.
- Track every friction point in a **difficulty ledger** with a clear path
  from "open" → "encoded fix" so the harness improves with use.
- Track per-phase **wall-clock** in a velocity log so the compounding
  hypothesis is empirically tested, not assumed.
- Inherit pi-mono house rules (no `any`, no inline imports, biome) and add
  pij-specific patterns in a single `AGENTS.md` so contributors and agents
  start from the right defaults.
- Provide a **runbook** ≤80 lines that a fresh agent can read and act on,
  pointing at automation rather than narrating procedures.
- Run minimal CI (typecheck + lint + test) on push and pull request.
- Provide a **self-check** recipe that validates the harness still works
  before any release of a new extension.

## Non-Goals

- Not building any individual extension yet (`scratch` and friends come
  *after* the harness ships).
- Not forking or modifying pi or pi-mono.
- Not establishing a publishing pipeline to npm. Defer until ≥3 stable
  extensions exist.
- Not building a custom CLI / `just` / `make` layer. npm scripts only.
- Not building a file watcher (pi's design is to require explicit
  `/reload`; auto-reload via fswatch is a stretch goal, not v1).
- Not introducing a runtime build step. Jiti loads `.ts` directly; we
  type-check separately.
- Not authoring skills, prompts, or themes generators. The directories
  exist (auto-discovered) but generators wait until the first such asset
  is needed.
- Not supporting Windows for the smoke runner in v1 (tmux requirement).
  Linux/macOS only; documented.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|---------------------|
| `harness` | **NEW** | **create** | The engineering infrastructure itself: scaffolds, templates, generators, smoke runner, ledgers, project-root configs, agent rules, runbook, CI. |
| `extensions` | **NEW** | **create** | The directory and namespace where individual pi extensions are authored against the harness's conventions. v1 establishes the location, layout, and conventions; no specific extension is built yet (one throwaway `demo` is generated then discarded). |

### New Domain Sketches

#### `harness` [NEW]

- **Purpose**: Engineering infrastructure that makes authoring a new pi
  extension fast (≤6 minutes from clean checkout to a working `/foo`
  command). Encodes patterns P1–P10 in templates and tooling so the
  patterns are enforced rather than just suggested. Tracks friction and
  velocity so the infrastructure measurably compounds across extensions.
- **Boundary owns**:
  - Project-root configuration: `package.json`, `tsconfig.json`,
    `biome.json`, `vitest.config.ts`.
  - `harness/` directory: scripts (`new-extension.ts`, `smoke.ts`),
    templates (`templates/extension/*.template`), shared test utilities
    (`test-utils.ts`).
  - Project-level documentation: `AGENTS.md`, `RUNBOOK.md`, `README.md`.
  - Ledgers: `docs/difficulties.md`, `docs/velocity.md`.
  - CI: `.github/workflows/ci.yml`.
- **Boundary excludes**:
  - The pi binary itself (consumed, never modified).
  - The pi-mono source tree (read-only reference).
  - Specific extension source code (lives in `extensions`).
  - Skills, prompts, themes (separate `.pi/<kind>/` namespaces; their
    generators are out of scope for v1).
  - Plan documents under `docs/plans/` (these existed pre-harness and
    are the harness's *input*, not its output).

#### `extensions` [NEW]

- **Purpose**: The namespace and convention root for individual pi
  extensions authored within pij. The harness produces this surface; the
  spec establishes its layout and scaffold but does not populate it with
  shipping code in v1.
- **Boundary owns**:
  - `.pi/extensions/<name>/` directories — each containing `index.ts`,
    `store.ts`, `store.test.ts`, `smoke.ts`, and a per-extension
    `AGENTS.md` produced by the harness's generator.
  - The conventional T2 layout (workshop 003) and patterns P1–P10
    (workshop 003) as enforced via templates.
- **Boundary excludes**:
  - The harness machinery (templates, generators, ledgers, configs) —
    those live in `harness`.
  - Any specific extension's *implementation*; v1 generates a throwaway
    `demo` to validate the harness, then discards it without commit.
  - Skills, prompts, themes — separate sibling namespaces.

---

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=0, T=1 → P=5
- **Confidence**: 0.85
- **Assumptions**:
  - pi binary installed globally on the dev machine
    (`@earendil-works/pi-coding-agent` or equivalent).
  - tmux installed for smoke runs (Linux/macOS; Windows deferred).
  - Node ≥20.
  - Workshops 001–004 represent the locked design; this spec implements them.
  - Pi v0.30.x semantics (the version pi-mono is at) hold; minor pi
    revisions will not break the harness.
- **Dependencies**:
  - The pi binary's auto-discovery behaviour for `.pi/extensions/` (workshop 001).
  - jiti's runtime TypeScript loading inside pi.
  - The `@earendil-works/pi-coding-agent` API surface (locked at the
    versions pi ships with — peerDependencies "*" trick from workshop 001).
- **Risks**:
  - **R-1**: pi version drift — a future pi could change the
    auto-discovery convention or the ExtensionAPI shape and break
    everything. *Mitigation*: pin a tested pi version range in CI as a
    stretch goal once we have evidence of which versions work.
  - **R-2**: D-005 (do `customType` entries survive `/compact`?) is
    unverified. If false, Pattern P9 needs revision and the first
    extension's storage strategy may need a snapshot fallback.
    *Mitigation*: include a compaction smoke scenario in the first
    extension and resolve the question empirically.
  - **R-3**: Smoke runner is local-only (tmux + pi binary). CI cannot
    catch behavioural regressions automatically until D-008 (SDK-driven
    smoke) is implemented. *Mitigation*: type/lint/unit tests on every
    push are the CI gate; manual `npm run smoke` is required pre-merge.
  - **R-4**: Generator/template drift — if templates encode patterns
    that later evolve, every existing extension diverges. *Mitigation*:
    ledger entries tag template-version exposure; consider a
    "regenerate" command (stretch).
- **Phases** (suggested):
  1. **Foundation** — pij root config files: `package.json`,
     `tsconfig.json`, `biome.json`, `vitest.config.ts`,
     `.gitignore` updates. Validate `npm install` clean,
     `npm run typecheck` clean, `npm run lint` clean.
  2. **Templates + generator** — `harness/templates/extension/` template
     files; `harness/scripts/new-extension.ts`. Validate
     `npm run new -- demo` produces a directory whose tests pass.
  3. **Test harness** — `harness/test-utils.ts` (minimal),
     `vitest.config.ts` exercised against the scaffolded `demo` test.
  4. **Smoke runner** — `harness/scripts/smoke.ts` plus the demo's
     `smoke.ts` scenario. Validate `npm run smoke -- demo` exits 0.
  5. **Project docs and ledgers** — `AGENTS.md`, `RUNBOOK.md`,
     `README.md`, `docs/project-rules/harness.md` (BIO loop —
     Boot/Interact/Observe per the clarification), `docs/difficulties.md`
     (seeded D-001..D-008), `docs/velocity.md` (seeded phases 0–5).
  6. **CI + self-check** — `.github/workflows/ci.yml`,
     `npm run self-check` recipe; teardown of the throwaway `demo`.
     Tag v0.1.0 of the harness.

Each phase is small (~30–90 minutes) and independently verifiable.

---

## Acceptance Criteria

Numbered, testable scenarios. Each is a black-box assertion that the
harness behaves as specified, executable by hand or by a future
self-check script.

1. **AC-01 — Boot from scratch**: From a fresh clone, running
   `npm install` succeeds and `npm run self-check` exits 0. Wall-clock
   for both is recorded in `docs/velocity.md`. (No fixed minute
   threshold — the previous "<2 min" target was unmeasured intuition;
   pathological slowness is the only failure case, judged against the
   measured baseline once v1 is built. See § Clarifications session
   2026-05-09b.)

2. **AC-02 — Generator scaffolds the canonical layout**:
   `npm run new -- demo` creates `.pi/extensions/demo/` containing
   five files: `index.ts`, `store.ts`, `store.test.ts`, `smoke.ts`,
   `AGENTS.md`. The directory does not exist before; it does after.

3. **AC-03 — Generated scaffold compiles and passes tests**: After
   `npm run new -- demo`, `npm run typecheck` exits 0 and `npm test`
   shows the scaffolded test passing without modification.

4. **AC-04 — Generated extension loads in pi and exposes a command**:
   With pij as the current directory, launching pi (`pi`) registers the
   `/demo` command. Typing `/demo` in the TUI yields the scaffolded
   "not implemented" toast.

5. **AC-05 — Smoke runner succeeds end-to-end**: `npm run smoke -- demo`
   spawns a fresh tmux session, boots pi from pij root, sends `/demo`,
   captures the pane, asserts the regex from the scenario, and exits 0.

6. **AC-06 — Generator validates names**: `npm run new -- foo-bar` and
   `npm run new -- foobar` succeed; `npm run new -- 9foo`,
   `npm run new -- Foo`, and `npm run new -- foo_bar` exit non-zero with
   a usage message naming the regex `/^[a-z][a-z0-9-]*$/`.

7. **AC-07 — Generator refuses to overwrite**: With
   `.pi/extensions/demo/` already present, `npm run new -- demo` exits
   non-zero with a clear "already exists" message and does not modify
   the existing directory.

8. **AC-08 — Agent rules in place**: `AGENTS.md` exists at pij root,
   includes the pi-mono inheritance section, lists patterns P1–P10
   verbatim from workshop 003, and documents the difficulty/velocity
   workflow.

9. **AC-09 — Runbook in place and concise**: `RUNBOOK.md` exists, is
   ≤80 lines, and points to (a) how to boot, (b) how to scaffold a new
   extension, (c) how to iterate, (d) how to smoke, (e) where each
   resource lives.

10. **AC-10 — Difficulty ledger seeded**: `docs/difficulties.md` exists
    with D-001..D-008 pre-populated as documented in workshop 004,
    each with severity and status. The severity legend is present.

11. **AC-11 — Velocity log seeded**: `docs/velocity.md` exists with
    phases 0–5 (research, workshops, this harness phase) populated, the
    v1 build wall-clock recorded as it lands (Phase 6), and a
    falsifiable, measurement-anchored hypothesis: **extension #2's
    `npm run new` → command-registered wall-clock is materially shorter
    than v1's equivalent path** (specific margin defined once v1 is
    measured; see AC-15). The previous "<30 min" hypothesis was
    unmeasured intuition and is replaced by the comparison-to-baseline
    formulation. See § Clarifications session 2026-05-09b.

12. **AC-12 — CI runs three checks on every push**:
    `.github/workflows/ci.yml` runs `npm run typecheck`,
    `npm run lint`, and `npm test` on push and pull request, on at
    least one Node 20 runner.

13. **AC-13 — Self-check is the regression gate**: `npm run self-check`
    runs typecheck + lint + test (and, locally, smoke) in that order;
    fails fast on the first failing step.

14. **AC-14 — Demo teardown is clean**: After v1 ships,
    `rm -rf .pi/extensions/demo` and `git status` is clean within
    `.pi/extensions/`. The demo was a verification artefact, never
    committed.

15. **AC-15 — Velocity hypothesis is testable**: A second extension
    scaffolded via `npm run new -- <name>` after v1 ships goes from
    `npm run new` to *all of* `npm run typecheck` clean, `npm test`
    green, and the new command registering in pi. Wall-clock is
    measured (start = `npm run new` invocation; end = command
    registered in pi, manually confirmed) and logged in
    `docs/velocity.md`. The hypothesis being tested is **compounding
    velocity**: extension #2's wall-clock is materially shorter than
    the v1 harness-build wall-clock for the equivalent path (provisional
    target margin: **≤ 50% of v1 equivalent path**, locked when v1 is
    measured — falsifiable). If extension #2 is not faster than v1's
    baseline, a difficulty entry must explain why the harness did not
    compound. See § Clarifications session 2026-05-09b.

16. **AC-16 — BIO loop is documented as a contract**:
    `docs/project-rules/harness.md` exists and captures the agent
    Boot/Interact/Observe loop: **Boot** = `npm install`, **Interact** =
    `pi` (interactive) or `npm run smoke -- <name>` (automated),
    **Observe** = `npm run self-check`. Any agent can use that file to
    validate work on pij without reading the full RUNBOOK or AGENTS.md.

---

## Testing Strategy

- **Approach**: **Hybrid** (overrides the Simple-mode default of
  Lightweight — see header note).
- **Rationale**: Workshop 003 Pattern P8 ("tests target the store") and
  workshop 004's smoke-runner design together imply two distinct test
  layers. Store correctness merits real unit tests; wiring is best
  verified end-to-end via smoke. The two layers are cheap to maintain
  and catch different bug classes.
- **Focus areas**:
  - **`store.ts` unit tests** (vitest) — every public method on the
    store class (add, deleteAt, clear, rehydrate, list, format) gets at
    least one positive case and one negative/edge case. Tests use the
    `makeRecorder()` helper from `harness/test-utils.ts`.
  - **End-to-end smoke** (tmux + real pi) — at least one scenario per
    extension covering its happy path. The harness's own `demo`
    extension (v1 verification only) ships with a one-step smoke that
    confirms `/demo` registers.
- **Excluded**:
  - Unit tests for `index.ts` (the wiring file) — workshop 003 Pattern
    P8 explicitly excludes this. If wiring grows test-worthy logic,
    extract to a pure helper file and test that.
  - Tests for the generator script and smoke runner — covered
    transitively via `npm run self-check`.

## Mock Usage

- **Policy**: **Targeted only.**
- **What this means in practice**: The constructor-injected `AppendFn`
  on the store class is the only "mock" we use, and it's really
  dependency injection — the test recorder substitutes for
  `pi.appendEntry`. Every other input/output uses real fixtures
  (real session entries, real strings). Smoke tests run against the
  real pi binary and a real tmux session.
- **Forbidden**: Mocking `ExtensionContext`, `ctx.ui.*`, the agent
  loop, or any pi internals. If a test needs those, it's not a unit
  test — write it as a smoke scenario.

## Documentation Strategy

- **Layout**: As designed in workshop 004, with one addition from
  the clarification:
  - `AGENTS.md` (root) — agent rules; pi-mono inheritance + P1–P10 +
    workflow.
  - `RUNBOOK.md` (root) — three-command runbook (≤80 lines).
  - `README.md` (root) — light human-facing landing page.
  - `docs/project-rules/harness.md` — **NEW from clarify Q6** — the
    agent Boot/Interact/Observe loop (AC-16).
  - `.pi/extensions/<name>/AGENTS.md` — per-extension acceptance
    checklist (generated from template).
  - `docs/plans/<ordinal>/` — workshops, dossiers, findings (already
    populated under `001-pi-extensions/`).
- **Excluded**: No top-level `docs/how/` tree. Workshops in
  `docs/plans/<ordinal>/workshops/` fill the deep-dive role.
- **Rationale**: Multiple roots for different audiences (agent rules,
  agent runbook, BIO contract, human landing) prevents any single doc
  from getting bloated. Per-extension `AGENTS.md` keeps acceptance
  contracts close to the code they govern.

---

## Risks & Assumptions

(See § Complexity § Risks for the full list.)

- **A-1 (assumption)**: pi v0.30.x ExtensionAPI is stable across patch
  releases. If pi pushes a breaking minor version mid-work, the
  generator and templates need revision.
- **A-2 (assumption)**: `tsx` continues to be the default ESM-loader for
  TypeScript scripts. If Node 22's native `--experimental-strip-types`
  becomes mainstream, we may revisit.
- **A-3 (assumption)**: Patterns P1–P10 from workshop 003 hold under
  contact with the second extension. If they don't, the templates
  evolve and a workshop 003a is created.
- **R-2 specifically (compaction survival)** is high-severity. It cannot
  be answered by code review of pi-mono alone — only by an empirical
  smoke test. The first extension's smoke scenario must include this
  case.

---

## Open Questions

Most workshop-level open questions are deferred per workshop 004
(Q1 — `just`/Makefile, Q2 — npm publish, Q4 — template files vs literals,
Q5 — harness self-tests, Q7 — `tsx` runtime, Q8 — skill/prompt/theme
generators). They are not blockers for v1.

The remaining live questions:

- **OQ-1**: Will extension #2 actually take <30 minutes? *Resolution
  path*: empirical, after v1 ships. Outcome logged in `docs/velocity.md`.
- **OQ-2**: Should we pin a specific pi version range now, or wait for
  evidence? *Resolution path*: defer until extension #2; revisit in
  workshop 005.
- **OQ-3**: Is the smoke runner viable on Windows (WSL aside), or do we
  need to document Linux/macOS-only formally? *Resolution path*: try on
  Windows once; document the result in `docs/difficulties.md`.
- **OQ-4**: Does `customType` survive `/compact`? (D-005). *Resolution
  path*: smoke scenario in the first real extension.
- **OQ-5**: Does `ctx.ui.setStatus(key, "")` clear or display empty?
  (D-006). *Resolution path*: observe during the demo's first run.
- **OQ-6**: Is the throwaway `demo` extension actually valuable as a
  long-lived smoke target, or is its job done as soon as the harness
  ships? *Resolution path*: decide at v1 ship; current plan is to
  delete it. If we keep it, document in the ledger.

---

## Workshop Opportunities

The harness's design is largely already workshopped (workshops 001–004 in
`../001-pi-extensions/workshops/`). The following topics may benefit from
detailed design work *after* v1 ships, when concrete experience exists:

| Topic | Type | Why workshop | Key Questions |
|-------|------|--------------|---------------|
| Compaction survival smoke | Storage Design | Resolves D-005 once and forever via repeatable test | What inputs trigger compaction? What is the captured-pane assertion that proves notes survived? Does this test belong in `harness/` or per-extension? |
| SDK-driven smoke runner | Integration Pattern | Gets smoke into CI (D-008); decouples from tmux | What APIs from `createAgentSession` do we exercise? How do we drive the agent loop without a real LLM (faux provider)? |
| pi version compatibility matrix | Other (ADR) | Establishes a tested support policy once we have ≥2 extensions and evidence | Which pi versions are tested? How do we react to a breaking minor? Do we cap peerDeps? |
| File-watcher wrapper (`npm run watch`) | CLI Flow | Removes manual `/reload` friction (D-007), if it turns out to be real | fswatch vs entr vs chokidar? How do we send `/reload` into the active pi tmux session? Single-extension scope vs whole repo? |
| Distributing pij as a published pi package | Storage Design + CLI Flow | Once ≥3 extensions stable; how do we ship to npm/git? | Single package vs per-extension? Versioning strategy? Manifest filtering? Gallery metadata? |

---

## Clarifications

### Session 2026-05-09

| # | Question | Answer | Effect |
|---|----------|--------|--------|
| Q1 | Workflow mode for /plan-3-architect? | **Simple Mode** | Single-phase sequencing, inline tasks, lighter gates. Spec header updated with `**Mode**: Simple`. |
| Q2 | Testing approach? | **Hybrid** (override of Simple-mode Lightweight default) | New `## Testing Strategy` section: vitest store tests + tmux smoke. P8 excludes wiring from unit tests. |
| Q3 | Mock usage? | **Targeted only** | New `## Mock Usage` section: only the constructor-injected AppendFn; no mocking of ExtensionContext / ui / agent loop. |
| Q4 | Documentation layout? | **As designed** in workshop 004 | New `## Documentation Strategy` section. Confirms AGENTS.md + RUNBOOK.md + README.md + per-extension AGENTS.md + workshops. No new `docs/how/`. |
| Q5 | Confirm both NEW domains (`harness`, `extensions`)? | **Keep both** | Target Domains table unchanged. Sets precedent for `docs/domains/registry.md` when it later emerges. |
| Q6 | Where does the BIO loop live? | **`docs/project-rules/harness.md`** (separate file) | Phase 5 deliverables updated; AC-16 added; Documentation Strategy now lists this file. |

**Notes on Simple Mode override of testing default**: The user picked
Simple Mode for planning ceremony (single-phase, inline tasks) but
overrode the testing default from Lightweight → Hybrid. Rationale:
store-layer correctness is load-bearing for every future extension; the
unit-test cost is low and the regression cost is high.

### Session 2026-05-09b — Numbers correction (post-validation)

User identified that the original spec inherited specific minute counts
from workshop 004 ("~80 min hand-rolled → ≤6 min target", "<30 min for
extension #2", "<2 min self-check") as if they were measured baselines.
**They were not.** No measurement has happened — pij is greenfield. Per
the **harness-is-the-product** philosophy ("encode evidence, not
slogans"), those numbers are removed from acceptance criteria and
replaced with measurement-anchored claims:

| AC | Old (fabricated) | New (measurement-anchored) |
|----|------------------|---------------------------|
| AC-01 | "<2 min self-check" | Wall-clock recorded; no fixed threshold |
| AC-11 | Hypothesis "extension #2 takes <30 min" | Hypothesis "extension #2 < v1 baseline by margin TBD when v1 measured" |
| AC-15 | "within 30 minutes" | "materially shorter than v1's equivalent path; provisional target ≤ 50% of v1; falsifiable" |
| § Goals | "~80 min hand-rolled → ≤6 min target" | Compress path into single `npm run new` + BIO loop; v1 baseline is TBD-measured |

Workshop 004's specific minute references remain in the workshop as
historical record; this spec **overrides** them. A new difficulty entry
captures the lesson:

> **D-009 (severity: medium)** — Fabricated baselines in upstream design
> documents (workshops, specs) flowed into acceptance criteria as if
> measured. Validators echoed them as VPO Outcome and did not
> sanity-check evidence. *Workaround*: when validating, ask "is this
> number measured or guessed?" *Encoded fix*: validate-v2 prompt should
> specifically check OUTCOME for measurement evidence; difficulty
> ledger should distinguish hypothesis vs measurement explicitly.

**Effect on plan/flight plan**: corresponding edits applied to
`pij-harness-plan.md` § Summary, AC mapping for AC-01/AC-15, and Notes
for the Implementor (note 6); and to `pij-harness.fltplan.md` § Mission
and AC-15 reference.

---

## See Also

- `../001-pi-extensions/research-dossier.md` — broad research grounding
  (182 findings across 8 deep-dives).
- `../001-pi-extensions/workshops/004-pij-harness.md` — the authoritative
  design (1,244 lines: full file content, generator, smoke runner, CI
  config, AGENTS.md, RUNBOOK.md, ledger formats).
- `../001-pi-extensions/workshops/003-scratch-extension.md` — the canonical
  T2 extension layout (P1–P10) the templates encode.
- `../001-pi-extensions/workshops/001-loading-extensions-into-pi.md` —
  distribution mechanics the harness leverages.
- `../001-pi-extensions/workshops/002-dev-loop-and-hot-reload.md` —
  the iteration cycle the harness scripts support.
- pi-mono `AGENTS.md` — the parent house rules pij inherits.
