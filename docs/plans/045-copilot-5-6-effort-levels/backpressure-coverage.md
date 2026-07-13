# Backpressure Coverage — Copilot GPT-5.6 effort levels

**Spec/plan**: [copilot-5-6-effort-levels-plan.md](./copilot-5-6-effort-levels-plan.md)
**Generated**: 2026-07-12
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores.

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| Targeted Vitest | `just test <test-paths>` | behaviour | `justfile:80-82`, `vitest.config.ts:54-68` |
| TypeScript compile | `just typecheck` | maintainability | `justfile:70-71` |
| Biome | `just lint` | maintainability | `justfile:73-74` |
| In-repo model CLI | `just pij models --harness copilot --json` | integration evidence | `justfile:95-98`, `core/cli.ts:572-610` |
| Full signal inventory | `harness checks` | maintainability + behaviour | `.harness/extensions/checks/extension.ts:25-54` |
| CI matrix | `npm run typecheck`; `npm run lint`; `npm test` on Node 22/24 | maintainability + behaviour | `.github/workflows/ci.yml:8-31` |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 exact human/JSON levels for both existing provider projections | T002 CLI fixture test plus an exit-coded `just pij ... --json \| jq -e` assertion | BUILDABLE | computational | Existing CLI/test runner found; exact trio assertion does not exist yet |
| AC-02 six allowed levels and unsupported `minimal` for all three ids | T002 table-driven `validate.test.ts` over registry-derived entries | BUILDABLE | computational | Existing generic validator tests found; trio matrix absent |
| AC-03 warning for `minimal`, no warning for `none`, spawn continues | T002 `spawn.test.ts` using registry-derived entries plus existing continuation tests | BUILDABLE | computational | Existing generic warning/continuation sensor found; trio case absent |
| AC-04 raw parse, seed clone, and snapshot fallback agree; snapshot stays unverified | T001 `registry.test.ts` fixture assertions | BUILDABLE | computational | Existing parse/seed/snapshot tests found; exact levels absent |
| AC-05 unrelated providers/models and Codex remain unchanged | T001 same-id non-Copilot + unrelated Copilot fixtures; existing full suite | BUILDABLE | computational | Existing source-derived/Codex tests found; broadened-guard pincer absent |
| AC-06 duplicate row count/order and warn-don't-block remain unchanged | T002 injected duplicate-row CLI assertion + existing warning tests | BUILDABLE | computational | Provider mapping/render and generic warning tests exist; composition assertion absent |
| AC-07 three mutation proofs and restored full gate | T005 deliberate mutations + targeted tests; `harness checks` after restoration | BUILDABLE | computational | Full gate exists; model-registry mutation script/fixture does not |
| AC-08 Pi client view + shared bare-id validation + unchanged effort suffix | T002 Pi-filter/validator/command tests plus live Pi JSON assertion | BUILDABLE | computational | Pi filter and command tests exist; exact trio assertions do not |
| Pure model core accidentally gains a Pi runtime dependency | `rg -n '@earendil-works' .pi/extensions/pij/core/models/registry.ts` must return no matches | BUILDABLE | computational | No core/models import-boundary sensor found; only `core/agents/**` has one |

## Certainty: Partial

The repo has strong runners and a full done gate, but the feature-specific pincer sensors are the plan's first two RED tasks rather than existing tests.

## Recommended Phase 0: Establish Backpressure

The Simple plan already schedules these as T001/T002 before implementation; no extra phase split is implied.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| Registry boundary fixture matrix | AC-04/05 and provider/id scope | Table-driven Vitest cases in `registry.test.ts` |
| Registry-derived consumer matrix | AC-01/02/03/06 | Vitest cases in `validate.test.ts`, `spawn.test.ts`, and `cli-models.test.ts` |
| Exact live JSON assertion | AC-01 integration against current Pi registry composition | `just pij ... --json` piped to `jq -e` in T005 |
| Pi-free source check | No architecture drift in the changed pure module | One exit-coded `rg` assertion in T005 or a reusable boundary test |

## Suggested "done when" Lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| AC-01..04 | done when the registry-derived targeted tests are green and the live JSON assertion returns exactly the six ruled levels for every trio row | BUILDABLE |
| AC-05..06 | done when non-Copilot, unrelated Copilot, Codex, duplicate-row, and continuation preservation assertions are green | BUILDABLE |
| AC-07 | done when each deliberate mutation flips RED, the tree is restored, and `harness checks` passes | BUILDABLE + existing full gate |
