# Backpressure Coverage — pij orchestrator-routing skill

**Spec**: [pij-orchestrator-routing-skill-plan.md](./pij-orchestrator-routing-skill-plan.md)
**Generated**: 2026-07-12
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. The plan already includes the BUILDABLE sensors below as T001/T006/T007/T008.

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| pij skill structural gate | `just pij-skill-check` | architecture-fitness + maintainability | `justfile`; `harness/scripts/pij-skill-check.sh` |
| type surface | `just typecheck` | maintainability | `justfile`; `package.json` |
| Markdown/code correctness | `just lint` | maintainability | `justfile`; `package.json` |
| unit/integration suite | `just test` | behaviour | `justfile`; vitest tests across `.pi/extensions/pij/` and `skills/flow-pair/test/` |
| tmux Driver smoke | `just smoke` | behaviour | `justfile`; `harness/scripts/smoke.ts` |
| full signal inventory | `harness checks` | maintainability + behaviour | `.harness/extensions/checks/extension.ts` |
| PR checks | GitHub Actions `ci` | maintainability + behaviour | `.github/workflows/ci.yml` |
| Builder ship | `/builder 8 ship` | branch/PR/CI landing | installed Builder skill |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 module-first stream routing; one prime row | Extend `just pij-skill-check` for module/pointer/cardinality | BUILDABLE | computational | Current gate already proves one active `prime` row and payload pointers. |
| AC-02 ordered real `/thesis` contract | Ordered-marker and anti-fake assertions in `pij-skill-check` | BUILDABLE | computational | `PIJ_SKILL_ROOT` fixture seam already exists; new module does not. |
| AC-02 actual host skill invocation (L4) | Host-native tool-call trace | ABSENT | inferential | Checked pij control-plane event path for this Copilot seat; `events.ndjson` is absent. No universal cross-harness tool trace exists in repo sensors. |
| AC-03 worktree/branch fields and spawn cwd | Structural markers + cold descriptor/tmux evidence | BUILDABLE | computational | Peer spawn source proves cwd=`process.cwd()`; no existing prime-worktree check. |
| AC-04 exact peer default/read-back and wait state | Structural markers + cold preamble report | BUILDABLE | computational | No current orchestrator module or wait-state artifact contract. |
| AC-05 coder/reviewer splits inside orchestrator window, never prime window | Cold tmux snapshot + registry/canary evidence | BUILDABLE | computational | Existing tmux/canary primitives exist; no scenario currently asserts this prime topology. |
| AC-06 source seams, immutable packets, reviewer independence | Structural contract + cold packet/verdict evidence | BUILDABLE | computational + inferential | `pair.md` and flow-pair records exist; new role-specific packaging checks do not. |
| AC-07 worktree primary; staging fallback only | Structural markers + targeted mutations | BUILDABLE | computational | Existing portable prime pages still teach shared-tree-first; mutation seam exists. |
| AC-08 `/builder 8 ship` PR landing | Structural marker + Builder ship report + GitHub CI | EXISTS | computational | Builder ship contract and `.github/workflows/ci.yml` exist. |
| AC-09 baseline and targeted mutation backpressure | `PIJ_SKILL_ROOT` copied fixtures | BUILDABLE | computational | Current shell gate supports alternate skill root; mutation cases are planned, not built. |
| AC-10 cold dogfood outcome without orchestrator implementation | Fresh peer transcript/report + git diff check | BUILDABLE | computational + inferential | pij spawn/tail/state and plan reports exist; no dedicated cold scenario yet. |
| AC-11 operator/domain documentation | pointer-integrity check + lint | EXISTS | computational | Prime payload pointer sweep and Biome/lint already run. |
| Shared-tree fallback accidentally removed | structural fallback markers in portable payload | BUILDABLE | computational | Current fallback doctrine exists but has no preservation assertion. |
| Worktree branch introduces merge conflict or red CI | PR diff + watched CI via Builder ship | EXISTS | computational | GitHub pull-request workflow and Builder ship surface exist. |

## Certainty: Partial

The repo already proves general skill integrity, code quality, PR/CI landing, and documentation links. The new role journey, worktree topology, mutation cases, and cold dogfood path are BUILDABLE within the plan; universal L4 `/thesis` invocation evidence remains legitimately absent for control-plane harnesses.

## Recommended Phase 0: Establish Backpressure

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| Extend `pij-skill-check` before payload edits | AC-01/02/04/07/08/11 plus anti-prime-window and fallback preservation | shell structural gate |
| Mutation matrix over a copied `PIJ_SKILL_ROOT` | The new assertions fail on realistic regressions instead of decorating the gate | temporary fixture + byte-restore assertions |
| Cold stream-orchestrator scenario in a temporary worktree | AC-03/04/05/10 end-to-end role, topology, thesis outcome, wait state, and no direct implementation | pij/tmux scenario with durable report |

These sensors are already the first, sixth, and seventh tasks in the validated Simple plan; no extra phase or re-plan is required.

## Suggested done-when Lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| Role/module contract | done when `just pij-skill-check` is green and every targeted mutation goes RED | BUILDABLE |
| Cold dogfood | done when a fresh stream worktree produces role/thesis/preamble/wait evidence and its orchestrator diff contains no implementation | BUILDABLE |
| Landing | done when `/builder 8 ship` reports the branch push, PR URL, and watched CI result | EXISTS |
