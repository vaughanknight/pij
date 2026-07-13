# Phase 1 tasks — Copilot GPT-5.6 effort levels

**Source of truth**: `../../copilot-5-6-effort-levels-plan.md` § Implementation (Simple mode).
**Scope ruling**: `../../rulings.md` — PR #9 merged and Spine Seq 141 released the domain contract for additive T004b integration.

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | RED registry-boundary fixtures for all three ids under `github-copilot`, seed clones, snapshot aliases, an unrelated Copilot model, and a same-id non-Copilot provider | `pij-control-plane` | `core/models/registry.test.ts` | Current code fails the exact six-level expectations; preservation cases pin the boundary | Tests first |
| [x] | T002 | RED registry-derived consumer tests for all six allowed levels, unsupported `minimal`, warning composition, Copilot output for both existing provider projections, Pi-client output from the raw row, shared bare-id validation, and unchanged Pi effort suffix translation | `pij-control-plane` | `core/models/validate.test.ts`, `core/spawn.test.ts`, `core/models/cli-models.test.ts` | Current code fails `none/low/medium/high`, accepts `minimal`, and advertises the incomplete set through both client views | Provider-prefix normalization is out of scope |
| [x] | T003 | Implement one exact trio level constant; provider=`github-copilot` + id guard in Pi parsing, same id guard directly in Copilot-only `copilotEntry()` | `pij-control-plane` | `core/models/registry.ts` | T001/T002 green; snapshot aliases remain `verified:false`; no validator/CLI/spawn production branch changes | |
| [x] | T004 | Update the model-discovery operator guide with the narrow override, fallback semantics, and unchanged duplicate-row behavior | `pij-control-plane` | `docs/how/pij-models-discovery.md` | Guide matches code and distinguishes curated capability from verification | Domain doc is held by ruling |
| [x] | T004b | Additively integrate the released control-plane domain contract with model registry source locations, concept/contract ownership, and S045 history | `pij-control-plane` | `docs/domains/pij-control-plane/domain.md` | Existing PR #9 content is preserved; model registry/effort behavior matches code and the operator guide | `APPROVE_WITH_NOTES`; no blocking finding |
| [x] | T005 | Mutation pincer and final gates: remove curated branch → RED; remove parse provider guard → RED; add `minimal` → RED; restore byte-identical, run targeted tests, Pi-free source assertion, `just typecheck`, `just lint`, `just test`, and `harness checks` | `pij-control-plane` | authorized fence | All S045 sensors/mutations and PR CI pass; shared tmux smoke debt is non-blocking by Spine Seq 144 | Higher-layer ruling; debt retained |

## Completion contract

- Finish only released task T004b in this delegation; do not revisit completed product tasks.
- Edit only `docs/domains/pij-control-plane/domain.md` and this phase execution log.
- Append task outcomes, changed files, decisions, mutation evidence, and gate output to `execution.log.md`.
- Report `COMPLETE`, `PARTIAL`, or `BLOCKED` through pij using the packet schema.
