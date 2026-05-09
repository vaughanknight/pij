# pij Harness Implementation Plan

**Mode**: Simple (testing overridden to Hybrid)
**Plan Version**: 1.0.0
**Created**: 2026-05-09
**Spec**: [pij-harness-spec.md](./pij-harness-spec.md)
**Flight Plan**: [pij-harness.fltplan.md](./pij-harness.fltplan.md)
**Status**: DRAFT

---

## Summary

Build the pij engineering harness end-to-end so the path from a fresh
clone to a working pi extension is encoded into a single `npm run new`
invocation plus the BIO loop, and the wall-clock for that path is
**measured** in `docs/velocity.md` against the v1 build baseline. The
design is locked in workshops 001–004 (1,244 lines of authored file
content in workshop 004); this plan sequences the encoded creation across
six small phases, each independently verifiable. Workshops are
authoritative — phases consume their content, they do not redesign it.
v1 ships when `npm run self-check` is green from a fresh clone, ledgers
are seeded, CI is running, the throwaway `demo` extension has been
generated, smoked, and torn down, and a **measurement-anchored compounding
hypothesis** ("extension #2's `npm run new` → command-registered
wall-clock is materially shorter than v1's equivalent path") is recorded
as a falsifiable claim. The earlier "~80 min → ≤6 min" / "<30 min" /
"<2 min" specific-minute targets were unmeasured intuition; see spec
§ Clarifications session 2026-05-09b.

---

## Mode Note (Simple + 6 phases)

Simple Mode normally means a single-phase plan with one inline task table.
This plan retains the **six structural phases** from the spec because
each phase is a discrete state that gates the next (`npm install` clean →
generator works → tests run → smoke runs → docs in place → CI green) and
matches the seeded velocity-log buckets. Tasks remain in the 7-column
Simple-Mode format and live inline — no `/plan-5` per-phase dossiers.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|--------------|------|
| `harness` | NEW | create | Engineering infrastructure: configs, templates, generator, smoke runner, ledgers, agent rules, runbook, CI |
| `extensions` | NEW | create | `.pi/extensions/<name>/` namespace + T2 layout; v1 generates throwaway `demo` only |

### Domain Formalization Note

The clarify session locked both as conceptual NEW domains but explicitly
deferred a formal `docs/domains/registry.md`/`domain-map.md` ("sets
precedent... when it later emerges"). This plan therefore **does not**
create domain.md files. The harness/extensions split is encoded in
the directory structure (`harness/` vs `.pi/extensions/`) and documented
in AGENTS.md. Formal domain extraction becomes a workshop opportunity
once a third domain emerges.

---

## Harness Strategy

pij **is** a harness, and it builds one for itself. The agent loop for
all subsequent extension work depends on the BIO contract this plan
establishes (AC-16). Maturity levels are descriptive (where the agent
can boot/interact/observe), not time-based.

- **Current Maturity**: L0 (no boot, no health check, no agent feedback loop yet)
- **Target Maturity**: L2 by end of Phase 6 (auto boot via `npm install`; deterministic observe via `npm run self-check`; tmux-driven interact for end-to-end smoke)
- **Boot Command**: `npm install`
- **Health Check**: `npm run self-check` (typecheck + lint + test, locally also smoke)
- **Interaction Model**: Terminal — pi TUI driven by tmux for smoke; vitest for store
- **Evidence Capture**: vitest output (unit), captured tmux pane text (smoke), exit codes
- **Pre-Phase Validation**: From Phase 2 onward, every phase ends by re-running `npm run self-check` (or a documented subset for phases that haven't yet completed self-check's wiring)

The harness's own BIO contract lives at `docs/project-rules/harness.md`
once Phase 5 ships (AC-16). Before that, Phase-level success criteria
serve as the gate.

---

## Domain Manifest

| File (absolute) | Domain | Classification | Rationale |
|-----------------|--------|---------------|-----------|
| `/Users/jordanknight/pi-hacking/pij/package.json` | harness | contract | Project root manifest; declares scripts that are the public BIO surface |
| `/Users/jordanknight/pi-hacking/pij/tsconfig.json` | harness | internal | NodeNext module resolution; enforces P6 (.js extension on relative imports) |
| `/Users/jordanknight/pi-hacking/pij/biome.json` | harness | internal | Lint/format inheriting pi-mono house rules |
| `/Users/jordanknight/pi-hacking/pij/vitest.config.ts` | harness | internal | Test discovery for `.pi/extensions/**/*.test.ts` and `harness/**/*.test.ts` |
| `/Users/jordanknight/pi-hacking/pij/.gitignore` | harness | internal | Already exists; verify minih + node_modules + extensions/demo (transient) coverage |
| `/Users/jordanknight/pi-hacking/pij/README.md` | harness | contract | Human-facing landing page |
| `/Users/jordanknight/pi-hacking/pij/AGENTS.md` | harness | contract | Agent rules; pi-mono inheritance + P1–P10 + workflow |
| `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md` | harness | contract | ≤80-line three-command runbook |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/index.ts.template` | harness | contract | Encodes P3, P4, P9 (wiring, tagged unions, persist-before-mutate) |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/store.ts.template` | harness | contract | Encodes P2, P3, P5, P6, P9 (pi-free store, DI, structural types, .js imports) |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/store.test.ts.template` | harness | contract | Encodes P8 (tests target the store) using `makeRecorder()` |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/smoke.ts.template` | harness | contract | Per-extension tmux scenario stub |
| `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/AGENTS.md.template` | harness | contract | Per-extension acceptance contract |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/new-extension.ts` | harness | internal | Generator: validates name, refuses overwrite, materialises templates |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/smoke.ts` | harness | internal | tmux-driven smoke runner |
| `/Users/jordanknight/pi-hacking/pij/harness/test-utils.ts` | harness | contract | `makeRecorder()` for store tests |
| `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | harness | contract | BIO loop contract (AC-16) |
| `/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | harness | contract | Difficulty ledger (D-001..D-008 seeded) |
| `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | harness | contract | Velocity log (phases 0–5 seeded; hypothesis recorded) |
| `/Users/jordanknight/pi-hacking/pij/.github/workflows/ci.yml` | harness | internal | Typecheck + lint + test on push/PR, Node 20 |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/demo/` (transient) | extensions | transient | Throwaway verification artefact generated by T017 and removed by T035; never committed. Five generated files (`index.ts`, `store.ts`, `store.test.ts`, `smoke.ts`, `AGENTS.md`) inherit this classification — not enumerated individually because they are template-derived and ephemeral at v1. |

**Manifest notes**:

- **`transient` classification** is used only for verification artefacts that exist within a single workflow and are removed before v1 ships. They are neither stable contracts nor durable internal code; future readers should treat their absence post-v1 as expected.
- **Cross-domain handoff**: The generator (`harness/scripts/new-extension.ts`, T015/T017) is the **single contract surface** where the `harness` domain produces `extensions` artefacts. Ownership transfers to `extensions` the moment materialisation completes; the generator itself stays in `harness`. This is the only place the two NEW domains touch.

---

## Key Findings

Workshops 001–004 are authoritative; only findings that materially affect
sequencing or risk are listed here. Anti-reinvention check: nothing being
built here exists in pij yet (greenfield root).

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Workshop 004 contains complete authored content for every file in this plan (package.json, tsconfig, biome, vitest, AGENTS, RUNBOOK, generator, smoke runner, ledgers, CI). Tasks transcribe; they do not design. | Each task references workshop 004 as its source of truth. If transcription drift appears, fix in workshop first, then re-transcribe. |
| 02 | Critical | R-2 (D-005): `customType` survival across `/compact` is unverified and load-bearing for Pattern P9. The harness encodes P9 in the store template; if P9 is wrong, every extension is wrong. | Resolution path is empirical via the *first real extension's* smoke (post-v1), not blocking v1. v1 ships P9 as designed; D-005 stays Open in the seeded ledger. |
| 03 | High | Smoke runner is local-only (tmux + real pi). CI cannot catch behavioural regressions until D-008 (SDK-driven smoke) lands. | CI scope is typecheck + lint + test only. `npm run smoke` is a local pre-merge discipline; documented in RUNBOOK and harness.md. |
| 04 | High | Pattern P6 (.js extension on relative imports) is enforced by `tsconfig.json` `module: NodeNext` + Biome rule. If templates omit `.js` extensions, vitest passes but pi load fails. | Template review checklist: every relative import in .ts.template files ends in `.js`. AC-03 catches this transitively. |
| 05 | Medium | jiti loads `.ts` directly inside pi; pij does **not** ship a runtime build step. tsx/vitest handle dev/test compilation. | No `dist/`, no `tsc --emit`. Type-checking is a separate `npm run typecheck` step (no emit). package.json reflects this. |
| 06 | Medium | Generator validates names against `/^[a-z][a-z0-9-]*$/` and refuses overwrite. AC-06 + AC-07 are explicit gates; both are negative tests. | Phase 2 task includes negative-path verification, not just happy path. |
| 07 | Medium | The transient `demo` extension is created in Phase 2 as the verification subject for Phases 2–4 (its tests run in Phase 3, its smoke runs in Phase 4), then deleted in Phase 6. It must never be committed. | `.gitignore` already excludes nothing in `.pi/extensions/`; Phase 1 task explicitly documents that demo's transience relies on discipline, not gitignore — but verifies `git status` is clean after teardown (AC-14). |
| 08 | Medium | The `peerDependencies: "*"` trick from workshop 001 means the harness does not pin a pi version. Coupled with R-1 (pi version drift), this is deliberate (avoid stale pins blocking installs) but creates evidence-collection responsibility. | Workshop 005 (post-v1) will revisit; for now, `package.json` peerDeps reflects workshop 004 verbatim. |

---

## Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|--------------------|------------|
| 1 | Foundation | harness | Project root configs install clean and pass typecheck/lint | None |
| 2 | Templates + Generator | harness | `npm run new -- demo` materialises 5-file T2 layout | Phase 1 |
| 3 | Test Harness | harness | `npm test` green against generated `demo`'s store test | Phase 2 |
| 4 | Smoke Runner | harness | `npm run smoke -- demo` boots pi, sends `/demo`, asserts | Phase 2 |
| 5 | Project Docs + Ledgers | harness | AGENTS / RUNBOOK / README / harness.md / ledgers in place | Phase 1 (parallelisable with 2–4) |
| 6 | CI + Self-check + Teardown | harness | CI green; `npm run self-check` is the gate; demo removed; v0.1.0 tagged | Phases 1–5 |

---

## Phase 1 — Foundation

**Objective**: pij root is a valid Node/TS workspace that lints and type-checks clean from a fresh `npm install`.
**Domain**: harness
**Delivers**: env pre-flight, `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, verified `.gitignore`, baseline `README.md`.
**Depends on**: None
**Key risks**: Misconfigured `module: NodeNext` would break Pattern P6 silently. Validation: a sample `import "./x.js"` round-trips; verified again in Phase 2 templates. Also: missing tmux/pi/Node binaries would crash Phase 4/6 with opaque errors — caught upfront by T000.
**Validation**: pre-flight passes; `npm install` exits 0; `npm run typecheck` exits 0; `npm run lint` exits 0.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T000 | Pre-flight environment check | harness | n/a (pij root) | `which tmux` returns a path; `which pi` returns a path (or implementor explicitly waives — see Notes); `node --version` reports v20.x or v22.x; result captured in `docs/velocity.md` once Phase 5 lands. If any required binary is missing, log a difficulty (D-NNN) and decide: install it, or document the gap and skip dependent phases (Phase 4 smoke and Phase 6 CI assume tmux + pi). | Added per validation CRITICAL #3 — fail-fast on opaque environment errors |
| [ ] | T001 | Create `package.json` | harness | `/Users/jordanknight/pi-hacking/pij/package.json` | File matches workshop 004 § "package.json"; declares **all** scripts: `typecheck`, `lint`, `test`, `new` (→ `tsx harness/scripts/new-extension.ts`), `smoke` (→ `tsx harness/scripts/smoke.ts`), `self-check` (→ `npm run typecheck && npm run lint && npm test`); `peerDependencies: "@earendil-works/pi-coding-agent": "*"`; devDeps include typescript, biome, vitest, tsx, @types/node | Per finding 05, 08; script names enumerated to satisfy validator HIGH #7 |
| [ ] | T002 | Create `tsconfig.json` | harness | `/Users/jordanknight/pi-hacking/pij/tsconfig.json` | `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `noEmit: true`, strict; **`exclude` lists `**/*.test.ts`** so the main `npm run typecheck` does not depend on test-only helpers (vitest's own typecheck covers test files in T021); matches workshop 004 verbatim with this scope | Per finding 04 — P6 enforcement; test-file exclusion resolves the T020-sequencing CRITICAL (T017's typecheck no longer requires `harness/test-utils.ts` to exist) |
| [ ] | T003 | Create `biome.json` | harness | `/Users/jordanknight/pi-hacking/pij/biome.json` | Inherits pi-mono house rules (no `any`, organised imports, no inline imports); matches workshop 004 | |
| [ ] | T004 | Create `vitest.config.ts` | harness | `/Users/jordanknight/pi-hacking/pij/vitest.config.ts` | Includes `.pi/extensions/**/*.test.ts` and `harness/**/*.test.ts`; matches workshop 004 | Test discovery for both demo (Phase 3) and any future harness self-tests |
| [ ] | T005 | Verify `.gitignore` covers transient artefacts | harness | `/Users/jordanknight/pi-hacking/pij/.gitignore` | Already covers `node_modules/`, minih runtime, `dist`, build outputs. Confirm — no edit unless gap found. **Demo's transience relies on discipline + AC-14 verification + a `.generated` marker file (T017/T035), not gitignore** (extensions belong in git for real cases) | Per finding 07; reconciles manifest note with discipline |
| [ ] | T006 | Create baseline `README.md` | harness | `/Users/jordanknight/pi-hacking/pij/README.md` | Human-facing landing page from workshop 004; one-paragraph intro + placeholder links to `RUNBOOK.md` and `AGENTS.md` (created in Phase 5). Phase 5 (T026, T027) may update README only to confirm the links resolve — no other content changes after Phase 1 | Cross-reference resolution allowed; design content final at Phase 1 |
| [ ] | T007 | Run `npm install` from clean | harness | `/Users/jordanknight/pi-hacking/pij/` | `npm install` exits 0; `node_modules/` populated; `package-lock.json` created | First wall-clock data point — log to `docs/velocity.md` once Phase 5 creates it (or note for retroactive entry) |
| [ ] | T008 | Run `npm run typecheck` | harness | `/Users/jordanknight/pi-hacking/pij/` | Exits 0 with no files (or ignores empty source); confirms tsconfig is structurally valid | Not gated on extensions — the project is bare at this point |
| [ ] | T009 | Run `npm run lint` | harness | `/Users/jordanknight/pi-hacking/pij/` | Exits 0; biome reports nothing | |

**Phase 1 Acceptance**: AC-01 partial (boot half — `npm install` clean).
**Commit checkpoint**: After Phase 1, create one commit (e.g., `Phase 1: Foundation — npm install, typecheck, lint clean`) before proceeding to Phase 2. This is the natural boundary for the code-review-companion to review.

---

## Phase 2 — Templates + Generator

**Objective**: `npm run new -- <name>` produces a five-file T2 extension with valid name validation and overwrite protection.
**Domain**: harness (templates encode `extensions` conventions)
**Delivers**: 5 template files, generator script, `npm run new` wired, validated by generating `demo`.
**Depends on**: Phase 1 (npm scripts surface, tsx, typecheck).
**Key risks**: Template content drift from workshop 003's P1–P10. Mitigation: every template references the pattern it encodes via a one-line comment header (workshop 004 § templates). Re-read those one-liners as part of T010–T014.
**Validation**: `npm run new -- demo` produces 5 files; `npm run typecheck` clean post-generation; AC-02, AC-06, AC-07 pass.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T010 | Create `index.ts.template` | harness | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/index.ts.template` | Encodes P3 (wiring), P9 (persist before mutate via session_start handler), P10 (one handler for all session_start reasons); placeholder `__NAME__` token | Workshop 004 § templates is the source |
| [ ] | T011 | Create `store.ts.template` | harness | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/store.ts.template` | Encodes P2 (pi-free), P3 (DI via constructor), P4 (tagged-union returns), P5 (constants with data), P6 (.js extensions on relative imports), P9 (persist-before-mutate ordering), P7 (structural entry types at boundary, no `as`) | Per finding 04 — verify every relative import ends in `.js` |
| [ ] | T012 | Create `store.test.ts.template` | harness | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/store.test.ts.template` | Encodes P8 (tests target the store); uses `makeRecorder()` from `harness/test-utils.ts`; positive + negative case for at least one method | Test scaffold runs in Phase 3; the helper itself is created in **T020** (Phase 3). Main `npm run typecheck` excludes test files (T002), so T017's typecheck passes despite the helper not yet existing |
| [ ] | T013 | Create `smoke.ts.template` | harness | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/smoke.ts.template` | Single tmux scenario: boot pi, send `/__NAME__`, capture pane, assert default toast regex | Stub; per-extension scenarios extend this in real extensions |
| [ ] | T014 | Create `AGENTS.md.template` | harness | `/Users/jordanknight/pi-hacking/pij/harness/templates/extension/AGENTS.md.template` | Per-extension acceptance contract per workshop 003 (purpose, P-references, smoke command, ledger pointer) | |
| [ ] | T015 | Create generator script | harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/new-extension.ts` | Validates name against `/^[a-z][a-z0-9-]*$/`; exits non-zero on invalid name with usage line naming the regex; refuses to overwrite existing `.pi/extensions/<name>/`; materialises all 5 templates with `__NAME__` substitution | Per finding 06 — both negative paths covered |
| [ ] | T016 | Wire `npm run new` | harness | `/Users/jordanknight/pi-hacking/pij/package.json` | `scripts.new = "tsx harness/scripts/new-extension.ts"` (already declared in T001 — verify) | Sanity check — should be done in T001 |
| [ ] | T017 | Generate `demo` and verify happy path | harness + extensions | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/demo/` | `npm run new -- demo` exits 0; `.pi/extensions/demo/` contains `index.ts`, `store.ts`, `store.test.ts`, `smoke.ts`, `AGENTS.md` (5 files); generator also writes a `.generated` marker file with this session's UTC timestamp into the directory; `npm run typecheck` exits 0 (passes because `*.test.ts` is excluded per T002) | **AC-02, AC-03 (typecheck half)**; `.generated` marker is the safety guard for T035's `rm -rf` |
| [ ] | T018 | Verify generator name validation | harness | n/a | `npm run new -- 9foo`, `Foo`, `foo_bar` each exit non-zero with usage line; `npm run new -- foo-bar` and `npm run new -- foobar` succeed (then clean up the directories — `rm -rf .pi/extensions/foo-bar .pi/extensions/foobar`) | **AC-06** |
| [ ] | T019 | Verify generator refuses overwrite | harness | n/a | With `.pi/extensions/demo/` from T017 still present, `npm run new -- demo` exits non-zero with "already exists" message; `git status -s .pi/extensions/demo/` is unchanged | **AC-07** |

**Phase 2 Acceptance**: AC-02, AC-03 (typecheck half), AC-06, AC-07.
**Commit checkpoint**: After Phase 2, create one commit (e.g., `Phase 2: Templates + generator — npm run new -- demo green`) before Phase 3.

---

## Phase 3 — Test Harness

**Objective**: vitest finds and runs the generated extension's store test using the shared `makeRecorder()` helper, end-to-end.
**Domain**: harness
**Delivers**: `harness/test-utils.ts`, validated by `npm test` green on `demo/store.test.ts`.
**Depends on**: Phase 2 (`demo` generated; templates reference `makeRecorder`).
**Key risks**: Type mismatch between `makeRecorder()` return type and the AppendFn signature in templates. Mitigation: both files are co-authored from workshop 004; one task creates the helper, the next runs the test.
**Validation**: `npm test` exits 0 with `demo/store.test.ts` reporting passing assertions.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T020 | Create `test-utils.ts` | harness | `/Users/jordanknight/pi-hacking/pij/harness/test-utils.ts` | Exports `makeRecorder()` returning `{ append: AppendFn, calls: Array<{ customType: string; data: unknown }> }`; matches workshop 004 verbatim | Used by every store test in every future extension |
| [ ] | T021 | Run `npm test` | harness | `/Users/jordanknight/pi-hacking/pij/` | Exits 0; `demo/store.test.ts` reports at least 2 passing tests (positive + negative case from template) | **AC-03 (test half)** |

**Phase 3 Acceptance**: AC-03 fully satisfied (typecheck + test green for generated scaffold).
**Commit checkpoint**: After Phase 3, create one commit (e.g., `Phase 3: Test harness — vitest green on demo`) before Phase 4.

---

## Phase 4 — Smoke Runner

**Objective**: `npm run smoke -- demo` drives a real pi instance via tmux, captures the pane, asserts the demo's default scenario, and exits 0.
**Domain**: harness
**Delivers**: `harness/scripts/smoke.ts` + manual verification of `/demo` registering in pi (AC-04).
**Depends on**: Phase 2 (`demo` exists with `smoke.ts`); pi binary on PATH; tmux installed.
**Key risks**: tmux pane capture race (assertion fires before pi finishes booting). Mitigation: workshop 004's smoke runner uses bounded retry with timeout — adopt verbatim, do not redesign.
**Validation**: AC-04 (manual `/demo` test), AC-05 (`npm run smoke`).

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T022 | Create smoke runner | harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/smoke.ts` | Spawns named tmux session, runs `pi` from pij root, sends keystrokes per scenario, captures pane, runs scenario assertion, exits with scenario result; matches workshop 004 verbatim | Bounded retry / timeout per workshop 004 |
| [ ] | T023 | Wire `npm run smoke` | harness | `/Users/jordanknight/pi-hacking/pij/package.json` | `scripts.smoke = "tsx harness/scripts/smoke.ts"` (already declared in T001 — verify) | Sanity check |
| [ ] | T024 | Run `npm run smoke -- demo` | harness | `/Users/jordanknight/pi-hacking/pij/` | Exits 0; tmux session cleaned up; captured pane includes default toast text from template | **AC-05** |
| [ ] | T025 | Manually verify `/demo` registers in pi | extensions | `/Users/jordanknight/pi-hacking/pij/` | From pij root, launch `pi`; type `/demo`; observe scaffolded "not implemented" toast; exit pi | **AC-04** — record observation in `docs/difficulties.md` once seeded (Phase 5) if anything surprised |

**Phase 4 Acceptance**: AC-04, AC-05.
**Commit checkpoint**: After Phase 4, create one commit (e.g., `Phase 4: Smoke runner — npm run smoke -- demo green`) before Phase 5/6.

---

## Phase 5 — Project Docs + Ledgers

**Objective**: All agent-facing documentation and ledgers exist, are concise, and are seeded with workshop-derived content.
**Domain**: harness
**Delivers**: `AGENTS.md`, `RUNBOOK.md`, `docs/project-rules/harness.md`, `docs/difficulties.md` (D-001..D-008), `docs/velocity.md` (phases 0–5).
**Depends on**: Phase 1 (project root exists). May proceed in parallel with Phases 2–4.
**Key risks**: RUNBOOK exceeding 80 lines (AC-09 has a hard ceiling). Mitigation: copy from workshop 004 — already ≤80 — and verify `wc -l` after write.
**Validation**: AC-08, AC-09, AC-10, AC-11, AC-16.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T026 | Create root `AGENTS.md` | harness | `/Users/jordanknight/pi-hacking/pij/AGENTS.md` | Includes pi-mono inheritance section, P1–P10 verbatim from workshop 003, difficulty/velocity workflow; matches workshop 004 verbatim | **AC-08** |
| [ ] | T027 | Create root `RUNBOOK.md` | harness | `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md` | ≤80 lines (`wc -l RUNBOOK.md`); covers boot / scaffold / iterate / smoke / where-things-live; matches workshop 004 | **AC-09** — verify line count |
| [ ] | T028 | Create `docs/project-rules/harness.md` | harness | `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | Captures BIO loop: Boot=`npm install`, Interact=`pi` or `npm run smoke -- <name>`, Observe=`npm run self-check`; usable standalone without RUNBOOK or AGENTS | **AC-16** — directory will need to be created |
| [ ] | T029 | Create `docs/difficulties.md` seeded | harness | `/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | D-001..D-008 entries from workshop 004 § difficulties ledger, each with severity + status + workaround + (if applicable) encoded-fix link; severity legend present | **AC-10** — also pre-emptively note D-009 candidate (minih state vocab drift, low severity) for the next session to triage |
| [ ] | T030 | Create `docs/velocity.md` seeded | harness | `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | Phases 0–5 populated (research, workshops 001/002/003/004, this harness build); v1 baseline wall-clock recorded from this build; **measurement-anchored** hypothesis: extension #2's `npm run new`→command-registered wall-clock < v1 equivalent path (provisional ≤ 50% of v1; falsifiable when v1 baseline lands; see spec § Clarifications 2026-05-09b) | **AC-11** |

**Phase 5 Acceptance**: AC-08, AC-09, AC-10, AC-11, AC-16.
**Commit checkpoint**: After Phase 5, create one commit (e.g., `Phase 5: Project docs + ledgers — AGENTS.md, RUNBOOK.md, harness.md, ledgers seeded`).

---

## Phase 6 — CI + Self-check + Teardown

**Objective**: CI runs typecheck/lint/test on every push and PR; `npm run self-check` is the regression gate; the throwaway `demo` is removed; v0.1.0 is tagged.
**Domain**: harness
**Delivers**: `.github/workflows/ci.yml`, `self-check` script, demo teardown, v0.1.0 tag.
**Depends on**: Phases 1–5 (everything must be in place to be checked).
**Key risks**: First CI run failing on Node-version drift or missing devDep. Mitigation: pin Node 20 in workflow; run self-check locally first.
**Validation**: AC-01 (full), AC-12, AC-13, AC-14.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T031 | Create CI workflow | harness | `/Users/jordanknight/pi-hacking/pij/.github/workflows/ci.yml` | Runs on `push` and `pull_request`; jobs: install, typecheck, lint, test; **Node 20 and Node 22 (matrix strategy)** matching workshop 004 verbatim; `.github/workflows/` directory created if missing | **AC-12**; Node matrix corrected per validation HIGH #5 |
| [ ] | T032 | Add `self-check` script | harness | `/Users/jordanknight/pi-hacking/pij/package.json` | `scripts.self-check = "npm run typecheck && npm run lint && npm test"` (already declared in T001 — verify); fails fast on first failure | **AC-13** — declared in T001, behaviour verified here |
| [ ] | T033 | Run full self-check locally | harness | `/Users/jordanknight/pi-hacking/pij/` | `npm run self-check` exits 0; record wall-clock in `docs/velocity.md` (no fixed minute threshold per spec § Clarifications 2026-05-09b — wall-clock becomes the v1 baseline) | **AC-01** (full), **AC-13** behavioural confirmation |
| [ ] | T034 | Verify CI on push | harness | n/a (GitHub Actions) | Pre-check: `git remote -v` reports a GitHub remote and `git push --dry-run` succeeds (i.e., remote exists + push authority confirmed). If neither holds, defer this task to a follow-up session and document under D-NNN. Otherwise: push to remote; CI workflow appears and turns green on the first run for `main` | **AC-12** behavioural confirmation; record CI URL in velocity log; remote/auth gate added per validation HIGH #6 |
| [ ] | T035 | Teardown demo | extensions | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/demo/` | Safety guard: `test -f .pi/extensions/demo/.generated || { echo "ABORT: .generated marker missing"; exit 1; }` — only proceeds if the directory was created by this session's T017. Then `rm -rf .pi/extensions/demo`; `git status -s .pi/extensions/` produces empty output (at v1, no other extensions yet) | **AC-14**; marker safety guard added per validation HIGH #7 |
| [ ] | T036 | Tag v0.1.0 | harness | `/Users/jordanknight/pi-hacking/pij/` | `git tag v0.1.0 && git push --tags` (only after explicit user confirmation of push authority — implementor MUST ask before running `git push --tags`); annotate tag with link to spec/plan | Confirm with user before pushing tag — see "Risky actions" guidance |

**Phase 6 Acceptance**: AC-01 (full boot), AC-12, AC-13, AC-14.
**Commit checkpoint**: After Phase 6, the v1 build is complete; T036 tags v0.1.0 (only after user confirms push authority).

---

## Acceptance Criteria (cross-phase mapping)

| AC | Description | Verified in |
|----|-------------|-------------|
| AC-01 | Boot from scratch (wall-clock recorded; no fixed minute threshold per spec § Clarifications 2026-05-09b) | T007 (install) + T033 (self-check) |
| AC-02 | Generator scaffolds 5 files | T017 |
| AC-03 | Scaffold compiles + tests pass | T017 (typecheck, test files excluded by T002) + T021 (test, vitest typechecks tests itself) |
| AC-04 | `/demo` registers in pi | T025 |
| AC-05 | `npm run smoke -- demo` exits 0 | T024 |
| AC-06 | Generator validates names | T018 |
| AC-07 | Generator refuses overwrite | T019 |
| AC-08 | AGENTS.md complete | T026 |
| AC-09 | RUNBOOK ≤80 lines | T027 |
| AC-10 | Difficulty ledger seeded (D-001..D-008 + D-009 numbers-correction) | T029 |
| AC-11 | Velocity log seeded with **measurement-anchored** hypothesis (extension #2 < v1 baseline; margin TBD when v1 measured) | T030 |
| AC-12 | CI runs three checks on push/PR (Node 20 + 22 matrix) | T031 + T034 |
| AC-13 | Self-check fails fast | T032 + T033 |
| AC-14 | Demo teardown clean (with `.generated` marker safety guard) | T017 (creates marker) + T035 (checks marker) |
| AC-15 | Velocity hypothesis testable (compounding: ext #2 < v1 baseline; provisional ≤ 50% of v1; falsifiable) | **Post-v1** — extension #2 wall-clock; tracked separately |
| AC-16 | BIO loop is a contract | T028 |

AC-15 is intentionally outside the v1 task list — it is the *test* of the
hypothesis the v1 plan establishes, not a v1 deliverable. After Phase 6
ships, the next session runs `npm run new -- scratch` and measures.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **R-1** Pi version drift breaks templates | Medium | High | `peerDependencies: "*"` (workshop 001); CI catches typecheck/test failures; pi version pinning is a workshop-005 follow-up |
| **R-2 (D-005)** `customType` may not survive `/compact`; would invalidate P9 | Unknown | Critical | v1 ships P9 as designed; D-005 stays Open in seeded ledger; resolved empirically by extension #1's smoke (post-v1, separate session) |
| **R-3** Smoke is local-only; CI cannot catch behavioural regressions | High | Medium | Three-check CI gate (typecheck/lint/test); local `npm run smoke` is pre-merge discipline (RUNBOOK + harness.md); SDK-driven smoke is D-008 (deferred) |
| **R-4** Template/pattern drift across extensions | Medium | Medium | One-line pattern-reference header in each template; ledger entries flag template-version exposure; a regenerate command is a workshop opportunity |
| **R-5** RUNBOOK creep beyond 80 lines | Low | Low | `wc -l` check in T027; AC-09 is a hard gate |
| **R-6** Demo accidentally committed | Low | Medium | `.gitignore` does not cover it (intentional — extensions belong in git); discipline + AC-14 verification + T035 explicit teardown |
| **R-7** First CI run fails on missing devDep | Low | Low | T033 (local self-check) precedes T034 (push); failures caught locally |

---

## Notes for the Implementor

1. **Workshops are scripture.** Every file in this plan has authored
   content in `../001-pi-extensions/workshops/004-pij-harness.md`. Do
   not paraphrase or "improve" during transcription. If a template
   feels wrong, flag it and we update the workshop first.
2. **Velocity log starts now.** Even before T030 creates the file,
   note `npm install` wall-clock (T007), self-check duration (T033),
   and any phase-level surprises. Backfill into `docs/velocity.md`
   when Phase 5 lands.
3. **Difficulties are gifts.** Anything friction-causing during this
   build (a confusing error, a wrong default, a missing nudge) goes
   into D-001..D-008's neighbours as the ledger seeds; if a new one
   surfaces, add D-009+ inline in T029.
4. **The companion is installed.** `agents/code-review-companion/` is
   ready for `/plan-6-v2-implement-phase-companion`. Boot it once at
   start of implementation, brief it on plan 002, and ping it at
   every commit boundary. Findings → next commit.
5. **Phase 5 can parallel 2–4.** Docs/ledgers do not depend on
   templates compiling. If implementor prefers, run Phase 5 alongside
   Phases 2–4 to keep momentum.
6. **Numbers we do *not* use as gates.** The spec, this plan, and
   workshop 004 originally cited specific minute targets ("~80 min →
   ≤6 min", "<30 min ext #2", "<2 min self-check") as if measured.
   They were not; pij is greenfield. See spec § Clarifications session
   2026-05-09b. v1 does not gate on those numbers. We measure
   wall-clock during the build (T007, T024, T033) and judge compounding
   against that measured baseline (AC-15). If you see a specific
   minute target asserted as a hard gate during implementation, treat
   it as a leftover and remove or annotate it.
7. **R-2 / D-005 optional spike (~5 min, do this if uncertain).**
   Pattern P9 (persist-before-mutate via `session_start` rehydrate) is
   encoded into every template based on the assumption that
   `customType` entries survive `/compact`. This is unverified at v1
   ship. If you have any doubt before T010, run a 5-minute pi spike:
   load pi, create a custom entry, `/compact`, check whether the entry
   replays. Result goes into D-005's ledger entry. If false, **stop
   and revise P9** in workshop 003 before continuing — every extension
   built downstream depends on P9 being correct.
8. **Smoke is local-only; CI is not the smoke gate.** `npm run
   self-check` includes smoke when run locally with tmux available;
   CI runs typecheck + lint + test only. Pre-merge, run `npm run
   smoke -- <name>` locally. If you ship without local smoke and CI
   passes, that's a known asymmetry (R-3) — document any miss in
   `docs/difficulties.md`.

---

## See Also

- [pij-harness-spec.md](./pij-harness-spec.md) — what & why
- [pij-harness.fltplan.md](./pij-harness.fltplan.md) — executive overview, status
- [../001-pi-extensions/workshops/004-pij-harness.md](../001-pi-extensions/workshops/004-pij-harness.md) — authoritative file content for every deliverable
- [../001-pi-extensions/workshops/003-scratch-extension.md](../001-pi-extensions/workshops/003-scratch-extension.md) — patterns P1–P10 the templates encode
- [../001-pi-extensions/workshops/002-dev-loop-and-hot-reload.md](../001-pi-extensions/workshops/002-dev-loop-and-hot-reload.md) — iteration loop the harness scripts support
- [../001-pi-extensions/workshops/001-loading-extensions-into-pi.md](../001-pi-extensions/workshops/001-loading-extensions-into-pi.md) — load paths the harness leverages
- [../001-pi-extensions/research-dossier.md](../001-pi-extensions/research-dossier.md) — research foundation (182 findings)
- pi-mono `AGENTS.md` — parent house rules pij inherits

---

## Validation Record (2026-05-09)

### Validation Thesis

**Raison d'être**: Sequence the construction of pij engineering harness from workshops 001–004's authored designs into a buildable, verifiable v0.1.0 — without re-designing during implementation.

**Value claim**: An implementor (agent + companion) can ship the harness end-to-end with workshops as scripture; v1 enables AC-15 ("extension #2 wall-clock < v1 baseline") to be tested empirically against a **measured** baseline.

**Artifact promise**: 36 tasks (T000–T036) across 6 phases, each independently verifiable; every AC-01..AC-16 maps to ≥1 task; companion-mode ready with explicit per-phase commit checkpoints.

**Intended beneficiaries**: (1) implementor agent running `/plan-6-v2-implement-phase-companion`; (2) post-v1 session testing AC-15; (3) future readers tracing decisions.

**Proof target**: Implementation.

**Evidence standard**: Every task has Done-When; every AC traces to ≥1 task; every file in tasks appears in Domain Manifest; risks have actionable mitigations or explicit deferrals; **OUTCOME claims are measurement-anchored, not fabricated**.

**Thesis source**: `pij-harness-spec.md` (Clarified, Mode: Simple + Hybrid testing override), workshops 003+004, harness-is-the-product-v2 charter; corrected via spec § Clarifications session 2026-05-09b after user identified fabricated baselines.

**Thesis verdict**: Partially advanced → Advanced with fixes (numbers replaced with measurement-anchored claims; sequencing CRITICAL fixed; pre-flight added; commit boundaries explicit).

**Main thesis risk**: R-2/D-005 (`customType` survival across `/compact`) ships untested across all templates; an optional 5-min implementor spike is now documented (Note 7) but not gated. If P9 turns out to be wrong, every extension is architecturally broken.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence | Domain Boundaries, Integration & Ripple, Hidden Assumptions, Concept Documentation | Implementation Readiness | 2 CRITICAL (T012/T020 sequencing, T012 stale ref), 1 HIGH (Node matrix), 3 MEDIUM, 1 LOW | ❌ → ⚠️ (CRITICAL+HIGH fixed) |
| Risk | Edge Cases & Failures, Hidden Assumptions, Technical Constraints, Deployment & Ops | Implementation Readiness, Operational Reliability | 2 CRITICAL (no pre-flight, R-2 untested), 2 HIGH (CI auth, demo teardown safety), 2 MEDIUM, 1 LOW | ❌ → ⚠️ (CRITICAL+HIGH fixed) |
| Completeness + Thesis Alignment | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit, Concept Documentation, Implementation Readiness | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit, Learning Compounding | 0 CRITICAL, 0 HIGH, 2 MEDIUM (AC-15 protocol implicit, paraphrase drift), 2 LOW | ✅ |
| Forward-Compatibility | Forward-Compatibility, Integration & Ripple, Deployment & Ops | Agent Readiness, Downstream Usefulness | 1 HIGH (phase boundaries), 2 MEDIUM, several positive findings | ⚠️ → ✅ (HIGH fixed via per-phase Commit checkpoint lines) |
| **User catch (Jordan)** | Evidence Sufficiency, Thesis Alignment | Evidence Sufficiency | **1 CRITICAL** (fabricated baseline numbers — unsupported value claim) | ❌ → ⚠️ (replaced with measurement-anchored claims) |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6-v2-implement-phase-companion` | 7-col task table; phase grouping; Done-When | shape mismatch | ✅ | All task tables follow `Status \| ID \| Task \| Domain \| Path(s) \| Done When \| Notes`; Phase Index lists deps |
| The implementor agent | AC→task mapping; manifest consistency; Notes | encapsulation lockout / contract drift | ✅ | All 16 ACs mapped (with AC-15 deferred explicitly); Domain Manifest covers every task path; 8 Notes for Implementor |
| `agents/code-review-companion/` | phase = commit boundary; task IDs briefable; P1–P10 cite-able | lifecycle ownership | ✅ (post-fix) | Per-phase **Commit checkpoint** lines added to every phase; T000–T036 sequential; pattern refs cite workshop 003 |
| Post-v1 AC-15 test (extension #2) | velocity baseline; measurement protocol | test boundary | ⚠️ | T030 now records measurement-anchored hypothesis; AC-15 specifies start (`npm run new`) + end (command registered) events; provisional target ≤ 50% of v1 baseline; protocol could be tighter but is implementation-ready |

**Thesis alignment**: Value claim partially advanced pre-fix (OUTCOME itself was fabricated); now advanced at Implementation proof level after numbers correction; main remaining thesis risk is R-2/D-005 (P9 ships untested across all templates) — an optional spike is documented but not gated.

**Outcome alignment**: With fixes applied, the plan, as shipped, advances a **measurement-anchored compounding hypothesis** (extension #2's `npm run new` → command-registered wall-clock < v1 build baseline; provisional target ≤ 50% of v1) — not a fabricated minute target. The harness itself enables that measurement (`docs/velocity.md` seeded in T030; v1 wall-clock captured in T007/T024/T033).

**Standalone?**: No — engaged. Downstream consumers (plan-6, implementor, companion, AC-15 test session) all named with verified requirements.

**Lens coverage**: 12/15 (Thesis Alignment ✅, Forward-Compatibility ✅, Evidence Sufficiency ✅, Proof-Level Fit ✅, Hidden Assumptions ✅, Edge Cases ✅, Technical Constraints ✅, Deployment & Ops ✅, Domain Boundaries ✅, Concept Documentation ✅, Integration & Ripple ✅, Implementation Readiness ✅). Above 9 floor.

**Overall**: ⚠️ **VALIDATED WITH FIXES** — 4 CRITICAL + 4 HIGH issues found and fixed in spec/plan/flight plan; remaining MEDIUM/LOW items are quality polish, not blockers; new D-009 ledger entry seeded for the fabricated-baseline lesson.
