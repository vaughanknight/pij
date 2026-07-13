# Backpressure Coverage — real pij session trees

**Spec**: [pij-real-trees-plan.md](./pij-real-trees-plan.md)
**Generated**: 2026-07-13T07:51:05+10:00
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)

## Existing Sensors (inventory)

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| TypeScript type surface | `just typecheck` | maintainability | `justfile`, `package.json` |
| Biome correctness/style | `just lint` | maintainability | `justfile`, `package.json` |
| Vitest unit/integration suite | `just test` | behaviour | `vitest.config.ts`, `.pi/extensions/pij/**/*.test.ts` |
| Focused pij tests | `just test .pi/extensions/pij` | behaviour | `justfile`, `vitest.config.ts` |
| Real scratch-registry CLI integration | `just test .pi/extensions/pij/cli.integration.test.ts` | behaviour | `.pi/extensions/pij/cli.integration.test.ts` |
| Descriptor concurrent-write tests | `just test .pi/extensions/pij/core/daemon/loop.test.ts` | behaviour | `.pi/extensions/pij/core/daemon/loop.test.ts` |
| Close ownership tests | `just test .pi/extensions/pij/core/close.test.ts` | behaviour | `.pi/extensions/pij/core/close.test.ts` |
| tmux Driver smoke | `just smoke` | behaviour | `harness/scripts/smoke.ts`, `harness/driver/` |
| `/pij` structural/CLI coverage | `just pij-skill-check` | architecture-fitness | `harness/scripts/pij-skill-check.sh` |
| Full signal inventory | `harness checks` | maintainability + behaviour | `.harness/extensions/checks/extension.ts` |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail (required if ABSENT) |
|--------------------------|----------------------|--------|------|----------------------------------|
| AC-01–AC-04: automatic parent capture, adoption linkage, reparent/root, and ownership separation | New `core/tree.test.ts`, spawn/session/adopt integration, existing close tests | BUILDABLE | computational | — |
| Mixed explicit/fallback edges admit a cycle even though writes claim cycle refusal | One `effectiveParent` mutation/projection fixture suite | BUILDABLE | computational | — |
| AC-05–AC-06: main and linked worktrees resolve one repository tree | New real temporary git main+worktree adapter test plus CLI integration | BUILDABLE | computational | — |
| AC-07–AC-10: global/repository/subtree output, filters, dead/closed history, orphan/cycle honesty | New pure forest/filter fixtures plus scratch-registry CLI snapshots | BUILDABLE | computational | — |
| AC-11–AC-12: current/old prime transitions and compatible list/tree projections | Existing prime service/CLI/list suites extended with retire and `O` marker cases | BUILDABLE | computational | — |
| AC-13–AC-14: tri-state parent, repository, and prime metadata survive every writer and legacy descriptors | Binding/session/registry tests plus both-direction daemon merge mutation tests | BUILDABLE | computational | — |
| A stale daemon tick resurrects `parentId` after `--root` or resurrects old/current prime state | `core/daemon/loop.test.ts` with latest-disk `null`/`false` fixtures and mutation proof | BUILDABLE | computational | — |
| Reparenting accidentally transfers `pij close` authority | Existing `core/close.test.ts` run before/after a link mutation fixture | BUILDABLE | computational | — |
| CLI/help/skill advertise different tree/link/retire grammars | Mutation-proven `just pij-skill-check` coverage over CLI table + route modules | BUILDABLE | computational | — |
| Worktree code passes unit tests but live daemon/tmux behavior differs | Driver smoke using reviewed worktree binding under the daemon-restart baton | BUILDABLE | computational | — |
| AC-15 full completion gate | `harness checks` runs typecheck, lint, tests, smoke, package audit, and snapshot drift | EXISTS | computational | — |
| Compact tree labels/depth are pleasant for very large forests | Human dogfood over global output | ABSENT | human-judgement | Globbed unit/integration/smoke signatures under root + `.pi/extensions/pij/` + `harness/`; deterministic shape can be tested, visual preference remains human judgement. |

## Certainty: Partial

The repository has strong reusable unit, integration, mutation, smoke, skill-contract, and full-gate surfaces; feature-specific graph, worktree, transition, and live-tree sensors are fully specifiable but do not exist until the plan's test-first tasks land.

## Recommended Phase 0: Establish Backpressure

No separate product phase is required. In the user-selected Simple plan, the test-first task prefix performs this recommendation before the corresponding implementation.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| Effective-parent graph suite (T001–T002) | parent/root/fallback/cycle/filter semantics | pure Vitest fixtures |
| Real git worktree identity suite (T003–T004) | repository grouping across worktrees | temp-repo integration test |
| Writer/merge durability suite (T005–T008) | tri-state parent, repository refresh, prime transitions, stale daemon safety | pure + registry integration tests |
| CLI contract suite (T009–T010) | strict grammar and stable human/JSON output | scratch `PIJ_HOME` integration |
| Live tree smoke (T012) | actual spawned/adopted topology after daemon restart | tmux Driver scenario |

## Suggested "done when" lines (advisory)

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| Structural parent is not ownership | done when link/reparent tests leave `spawnedBy` byte-identical and existing close authorization tests remain green | BUILDABLE |
| Repository tree spans worktrees | done when a temp main checkout and linked worktree share one `gitCommonDir` and appear in one CLI tree | BUILDABLE |
| Root clears survive concurrency | done when `parentId:null` remains registry truth after a stale daemon write attempt | BUILDABLE |
| Whole feature | done when `harness checks` is green and the worktree-bound tmux smoke proves spawned plus adopted links | EXISTS + BUILDABLE |
