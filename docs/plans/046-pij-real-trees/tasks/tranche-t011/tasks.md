# T011 tranche — skill, operator docs, and domain contracts

**Grant**: Spine Seq 182
**Scope authority**: `reports/t011-grant-request.md`
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`

## Exact 14 write paths

1. `harness/scripts/pij-skill-check.sh`
2. `skills/pij/SKILL.md`
3. `skills/pij/references/routes/peer.md`
4. `skills/pij/references/routes/prime.md`
5. `skills/pij/references/prime/rituals/kickoff.md`
6. `skills/pij/references/prime/templates/seat-handover.md`
7. `docs/how/pij.md`
8. `docs/how/pij-prime.md`
9. `docs/domains/pij-messaging/domain.md`
10. `docs/domains/pij-control-plane/domain.md`
11. `docs/domains/pij-orchestration/domain.md`
12. `docs/domains/pij-skill/domain.md`
13. `docs/domains/registry.md`
14. `docs/domains/domain-map.md`

Evidence: `docs/plans/046-pij-real-trees/tasks/tranche-t011/execution.log.md`.

## Tasks

| Status | ID | Task | Done When |
|--------|----|------|-----------|
| [ ] | T011A | Extend `pij-skill-check` first with future tree/link/adopt-parent, kickoff-link, retire-handover, current-only triage, PR17 compact, and C7 pull contracts. | Baseline after sensor edit is intentionally RED only on missing new markers; existing PR17/18 checks remain green. |
| [ ] | T011B | Update root CLI coverage and peer/prime route guidance within budgets and sibling-blindness. | Tree/link map to peer; current-only triage and old-prime audit are explicit; pull/push guidance preserved. |
| [ ] | T011C | Update kickoff and seat handover ordering. | Spawned link verified; adopted stream linked after canary before brief; incoming set precedes writers; outgoing retire follows final relay and remains visible historically. |
| [ ] | T011D | Update operator docs for tree/link/adopt-parent, repository/worktree scope, filters, ownership, current/old prime, and bounded rendering. | Commands match shipped source; PR18 hierarchy link remains. |
| [ ] | T011E | Update domain docs/registry/map without adding a domain. | Messaging/control/orchestration/skill contracts and history are consistent. |
| [ ] | T011F | Execute all seven sensor mutations and restore byte-identically; run final gates. | Every mutation RED; final skill check/lint/typecheck/quick harness green. |

## Seven required mutations

1. Remove `tree` or `link` CLI coverage.
2. Remove/corrupt peer tree/link/adopt-parent guidance.
3. Remove or reorder adopted-stream link before brief.
4. Replace outgoing `retire` with `unset` or move it before final relay.
5. Make old-prime an active-seat signal instead of current-only `list --prime`.
6. Remove/corrupt any PR17 completion-first compact marker/order/no-wait contract.
7. Remove/corrupt C7 `pij inbox --wait` or introduce state polling.

## Preserve exactly

- PR17 completion-first compact and C1/C7 pull behavior; do not edit `00-routing.md` or `routes/pair.md`.
- PR18 local-path severance marker/behavior in `pij-skill-check`.
- PR18 prime hierarchy link in `docs/how/pij-prime.md`.
- PR15 model catalog/docs.
- Sibling-blindness, line budgets, pointer integrity, worktree lifecycle gates.

## Forbidden

- Every path outside the exact 14 plus execution evidence.
- Product source/tests, flow-pair engine/prompt-lab, packages, schemas, dependencies, government, smoke/live/restart.
- T012, flow-state, `.flow-pair/**`.
- Commit/push/PR update/merge.

## Proof

- sensor-first RED then final `just pij-skill-check`
- all seven mutation copies RED→restore
- `just test harness/scripts/local-path-check.test.ts`
- `just lint`
- `just typecheck`
- `harness checks --quick`

