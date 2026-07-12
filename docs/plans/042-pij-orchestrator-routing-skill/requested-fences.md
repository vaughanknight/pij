# Requested fences — s042 pij orchestrator-routing skill

**Requested from**: o-prime `pij-3vetx8`
**Requested by**: stream orchestrator `pij-vital-tiglon`
**Plan**: `docs/plans/042-pij-orchestrator-routing-skill/pij-orchestrator-routing-skill-plan.md`
**Plan SHA-256**: `9c67fc967788e2bbbe8b3f8e731d62e0623e57da07d866a5234786d8f177f86a`
**Status**:
- Planning fence: GRANTED and complete.
- Implementation worktree/branch: REQUESTED.
- Code fence: REQUESTED for the single Simple implementation phase.
- Landing: `/builder 8 ship` PR path; no direct trunk application requested.

## Construction isolation request

| Item | Requested contract |
|------|--------------------|
| Worktree | One s042-owned git worktree, path allocated by o-prime |
| Branch | One s042-owned branch, based on the o-prime-approved current `main` |
| Spawn cwd | Orchestrator invokes peer `pij spawn` from the worktree; peer spawn derives cwd from `process.cwd()` |
| Fleet placement | Coder and reviewer are separate Copilot `gpt-5.6-sol` xhigh panes split inside the s042 orchestrator window |
| Landing | `/builder 8 ship` pushes the branch, opens the PR, watches CI, then uses its merge confirmation |
| Cleanup | Worktree removal only after PR merge or explicit abandonment ruling |

## Planning and evidence fence

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `docs/plans/042-pij-orchestrator-routing-skill/**` | modify/new | s042 single-writer planning, reports, reviews, and execution evidence |
| `.harness/temp/s042/**` | transient new | s042 scratch; never commit |
| `.flow-pair/**` | generated only | flow-pair CLI single writer; never stage or hand-edit |
| `the-flow.json` / `the-flow.md` | CLI-only | `harness flow` single writer; fleet packets explicitly forbid writes |

## Phase 1 — Orchestrator route, lifecycle, and backpressure

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `skills/pij/references/prime/orchestrator.md` | **new** | s042; existence-probe before creation; ≤120 lines |
| `skills/pij/references/routes/prime.md` | modify | s042; redirect stream row only; preserve one active `prime` registry row |
| `skills/pij/references/prime/rituals/kickoff.md` | modify | s042; worktree/branch lifecycle, module-first brief, PR-merged teardown |
| `skills/pij/references/prime/templates/stream-brief.md` | modify | s042; worktree/branch/base + ordered module/orient/thesis stack |
| `skills/pij/references/prime/templates/spine.md` | modify | s042; roster/allocation fields for worktree and branch |
| `skills/pij/references/prime/templates/orient-local.md` | modify | s042; derive worktree root/naming/base/landing policy per repo |
| `skills/pij/references/prime/rituals/bootstrap.md` | modify | s042; repo contract and preparing-state worktree allocation |
| `skills/pij/references/prime/orient-oprime.md` | modify | s042; worktree-first becomes current portable doctrine |
| `skills/pij/references/prime/protocol.md` | modify | s042; worktree construction, fallback, and Builder ship landing |
| `skills/pij/references/prime/rituals/batons.md` | modify | s042; timing/runtime batons primary; shared-tree/index baton fallback |
| `skills/pij/references/prime/rituals/incidents.md` | modify | s042; INC-004 becomes fallback shared-trunk evidence |
| `harness/scripts/pij-skill-check.sh` | modify | shared harness sensor; s042 requests ownership for structural RED→GREEN + mutations |
| `docs/how/pij-prime.md` | modify | s042; operator index + concise worktree→pair→Builder ship lifecycle |
| `docs/domains/pij-skill/domain.md` | modify | **potential s041 Phase-3 overlap**; requires o-prime adjudication before write |

## Explicitly read-only / not requested

| Path / surface | Reason |
|----------------|--------|
| `skills/pij/SKILL.md` | One `prime` row already exists; no registry edit planned |
| `skills/pij/references/00-routing.md` | No guided-route detection change needed |
| `skills/pij/references/routes/pair.md` | Consume current model override/pair contracts; do not change |
| `.pi/extensions/pij/**` | No product/control-plane implementation in Plan 042 |
| `skills/flow-pair/**` | Existing engine is a consumed constraint; reviewer-ingestion repair is follow-up |
| `.harness/extensions/checks/**` | Existing `harness checks` already composes repo sensors |
| `government/**` | o-prime single writer |
| `package.json` / `package-lock.json` | No dependencies or scripts required |

## Grant conditions requested

- Worktree/branch allocation is recorded in the government roster/brief before fleet spawn.
- The o-prime adjudicates the potential `docs/domains/pij-skill/domain.md` overlap with s041.
- Live-deployed skill payload constraints:
  - structural check authored RED before payload changes;
  - `just pij-skill-check` green before any commit;
  - o-prime reviews the load-bearing skill diff before commit/PR;
  - all commits stay on the s042 branch/worktree;
  - no global skill symlink is repointed to the worktree during implementation.
- New-path existence probes run before creation.
- `git diff --name-only` must remain inside this granted manifest.
- Coder and reviewer packets forbid `government/**`, `.flow-pair/**`, and Builder flow-state writes.

## Shared-resource posture

| Resource | Default posture | When a baton is still required |
|----------|-----------------|--------------------------------|
| Git working tree/index | Isolated by s042 worktree/branch | Only shared-trunk fallback or explicit merge/repair operation |
| Push/landing | `/builder 8 ship` + PR + CI | `push-main` only if a fallback direct-trunk action is explicitly ruled |
| Daemon | No code changes; no restart planned | Only if an unexpected product-code dependency emerges and o-prime grants it |
| Timing/runtime resources | Worktree does not isolate runtime interference | Request the existing named baton before any timing-sensitive or external shared-resource proof |

## Required release proof

- Coder report with exact files and gates.
- Separate reviewer verdict with findings persisted before any fix packet.
- Orchestrator sanity pass over the load-bearing diff and mutation evidence.
- `just pij-skill-check` mutation-proven.
- `harness checks` green.
- Cold dogfood acceptance artifact.
- `/builder 8 ship` report with PR URL and watched CI result.
