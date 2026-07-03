# Backpressure Coverage — pij agents on minih

**Spec**: [pij-agents-minih-plan.md](./pij-agents-minih-plan.md) (unified doc — ACs in `## Business Specification`)
**Generated**: 2026-07-03
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)

## Existing Sensors (inventory)

Discovered by filesystem probe (globs across root + `harness/` + `.pi/extensions/*` + `skills/*`), corroborated last by `.harness/engineering-harness.md` and CI config.

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| typecheck | `just typecheck` → `tsc --noEmit` | maintainability | root `justfile` / `package.json` |
| lint | `just lint` → `biome check .` | maintainability | root |
| unit + integration tests | `just test` → `vitest run` — includes `.pi/extensions/**/*.test.ts`, `harness/**`, `skills/**` | behaviour | root `vitest.config.ts`; tests co-located |
| CLI integration precedent | `.pi/extensions/pij/cli.integration.test.ts` (spawns the real bin, asserts exit codes/output) | behaviour | `.pi/extensions/pij/` |
| smoke | `just smoke` → `tsx harness/scripts/smoke.ts` | behaviour | `harness/scripts/` |
| aggregate gate | `just self-check` = typecheck + lint + test + smoke + `pkg audit` + snapshots-check | all | `justfile` |
| live-gated agent runs (pattern) | `just vet-live` → `PIJ_VET_LIVE=1 npx vitest run agent.live`; `describe.skipIf(!LIVE)` + self-documenting `it.skip` | behaviour (live, opt-in) | `harness/scripts/vetters/agent.live.test.ts` |
| snapshots-check | `just snapshots-check` | behaviour (vetter regression) | `harness/scripts/` |
| CI PR gate | `.github/workflows/ci.yml`: typecheck + lint + test + `npm audit` (no smoke, no snapshots, no live) | PR proof gate | `.github/workflows/` |
| minih AJV validators | `validateInput` / `validateOutput` / `validateSystemOutput` via `minih/runner` — arrive with the planned dep; they *are* the input/output sensors at runtime | data / contract | external (`github:AI-Substrate/minih#minih-v0.2.4`) |

## Coverage Matrix

The feature is new, so no current sensor proves its behaviour yet — the honest split is between rows **BUILDABLE inside already-planned tasks riding existing vehicles** and rows that are legitimately inferential.

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail (required if ABSENT) |
|--------------------------|----------------------|--------|------|----------------------------------|
| AC-01 list merge/precedence/shadowing/`--json` | vitest unit on the discovery module (plan task 1.4-ish; pure fs fixtures) | BUILDABLE | computational | — |
| AC-02 run through real `runAgent`, minih-native `runs/<ts>/` + envelope | contract test: hello-world fixture + `FakeAgentAdapter` through the real import, asserts `output/report.json` satisfies system envelope (task 1.2) | BUILDABLE | computational | — |
| AC-03 AJV fail-fast **before any session** + `E-BADINPUT` exit 1 | unit: assert `FakeAgentAdapter.run` never invoked on invalid input (task 1.5) + CLI test for exit 1 + per-error lines (task 2.6) | BUILDABLE | computational | — |
| AC-04 flag > frontmatter > default; warn-don't-block; `E-NOADAPTER` | pure unit tests (direct precedent: `core/models/validate.test.ts`) | BUILDABLE | computational | — |
| AC-05 inline leaves **nothing** on disk; sweep at run-start + daemon-start | fs-state assertions under a temp `PIJ_HOME`: run completes → tree empty; plant stale tree → sweep removes it (tasks 1.2, 1.7) | BUILDABLE | computational | — |
| AC-06 `--ephemeral` ⇒ zero new `runs/` entries | fs-state assertion (snapshot `runs/` before/after) | BUILDABLE | computational | — |
| AC-07 claude + codex adapters complete real one-shots | `PIJ_AGENT_LIVE=1` live tests — the `vet-live` pattern verbatim; copilot-absent path = unit test stubbing module resolution | BUILDABLE (vehicle EXISTS) | computational (live, opt-in) | — |
| AC-08 built-in ships; eject → shadows; **un-ejected built-in never writes `runs/` into the package dir** | unit: eject copy + shadow precedence; fs assertion: no `runs/` under package dir after a recorded-style run (task 2.7) | BUILDABLE | computational | — |
| AC-09 `E-*` error surface + exit codes 0/1/2 | CLI integration test matrix (precedent: `cli.integration.test.ts`) | BUILDABLE | computational | — |
| AC-10 `--json` envelope on stdout, progress on stderr | CLI integration: parse stdout as JSON, assert stderr-only progress (task 2.6) | BUILDABLE | computational | — |
| AC-11 companion supportability, **no pij code changes** | — (proven by a configuration walkthrough in `docs/how/pij-agents.md`, per plan design) | ABSENT | inferential — by design | globbed `**/playwright.config.*`, `**/cypress.config.*`, `**/*.e2e.*` across root + `harness/` + `.pi/extensions/*` + `skills/*` — no companion e2e harness exists; plan explicitly excludes building one |
| AC-12 minih contract test inside `just self-check` | the test **is** the sensor; `self-check` runs `just test` which includes it — tag bumps fail loudly | BUILDABLE | computational | — |
| AC-13 docs land per strategy | file-existence trivially checkable; content quality is not machine-provable | ABSENT (content) | human-judgement | content review — no doc-lint/link-check config found (globbed `.markdownlint*`, lychee/link-check configs — no match) |
| FM: minih tag bump silently breaks the API | AC-12 contract test (same sensor, run on every `self-check`) | BUILDABLE | computational | — |
| FM: ephemeral temp-tree leak on crash | sweep test with planted stale tree (AC-05 sensor covers) | BUILDABLE | computational | — |
| FM: agent-runtime boundary drift (`core/agents/` importing daemon/telegram/tmux) | no architecture sensor in repo | ABSENT | inferential (code review) | globbed `.dependency-cruiser.*`, ArchUnit, Roslyn `*.ruleset`, `codeql/` across root + all package roots — no match |
| FM: CI blind spot — smoke, snapshots-check, live suite not in `ci.yml` | `just self-check` covers locally; CI proves typecheck+lint+test only | EXISTS (partial) | computational | — |

## Certainty: Partial

0 of 11 machine-provable ACs has an `EXISTS` sensor today (the feature is new), but **every one is BUILDABLE inside tasks the plan already carries**, riding vehicles that all exist (`vitest` + co-located tests, `just self-check`, the `vet-live` live-gate pattern, the CLI-integration precedent); the two `ABSENT` rows are inferential by the plan's own design → Partial.

## Recommended Phase 0: Establish Backpressure

The routing trigger fires (BUILDABLE behaviour rows with no EXISTS sensor) — but this plan has **already absorbed its Phase 0 into Phase 1's TDD posture**. No new phase needed; the recommendation is an *ordering* one: build these sensors before (or with) the behaviour they prove.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| minih contract test (hello-world + `FakeAgentAdapter` via real `runAgent`) — **build first**; it is also the AC-12 drift alarm | AC-02, AC-12, FM: tag-bump breakage | vitest, wired into `just test` (already plan task 1.2) |
| clean-tree / no-`runs/` fs assertions under temp `PIJ_HOME` | AC-05, AC-06, AC-08 (package-dir pollution), FM: temp leak | vitest fs-state checks (tasks 1.2, 1.7, 2.7) |
| CLI envelope + exit-code integration matrix | AC-03 (CLI half), AC-09, AC-10 | vitest spawning the bin (task 2.6; precedent `cli.integration.test.ts`) |
| `PIJ_AGENT_LIVE=1` live adapter one-shots | AC-07, and de-risks the Phase-1 adapter spike | `*.live.test.ts` + `describe.skipIf` (the `vet-live` pattern), plus a `just agent-live` recipe |

## Suggested "done when" lines (advisory)

Paste-ready for the plan/tasks — this is the deterministic **done state**:

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| Phase 1 as a whole | done when `just self-check` is green **including** the new agent-runtime tests (contract test, discovery, fail-fast, ephemeral clean-tree) | BUILDABLE |
| Phase 2 as a whole | done when `just self-check` is green including the CLI integration matrix (errors, exit codes, `--json` envelope, eject/shadow) | BUILDABLE |
| AC-07 (adapters) | done when `PIJ_AGENT_LIVE=1 npx vitest run agent.live` passes locally (opt-in; run before ship — CI never runs it) | BUILDABLE (vehicle exists) |
| AC-12 (drift alarm) | done when the contract test runs inside `just self-check` and a deliberate bad-import canary fails it once (prove the alarm rings) | BUILDABLE |
| AC-11 (companion) | done when the `docs/how/pij-agents.md` walkthrough is reviewed by a human — deterministic proof deliberately out of scope | thin — inferential by design |
| AC-13 (docs) | done when the three doc files exist (checkable) and read-through sign-off happens (human) | thin — human-judgement |

**Closing suggestions** (offered, not applied):
1. **Encode it** — the plan's Done-When could carry one line: *"deterministic done = `just self-check` green; live done = `PIJ_AGENT_LIVE=1` suite green pre-ship; AC-11/AC-13 content stay review-tier."*
2. **Flag thin coverage** — CI (`ci.yml`) runs typecheck+lint+test only: smoke, snapshots-check, and all live suites are local-only. Fine for this plan (the new vitest sensors ride `npm test` and therefore *do* gate PRs), but worth knowing the live adapter proof never runs in CI — a single criterion line ("run live suite before ship") covers it.
