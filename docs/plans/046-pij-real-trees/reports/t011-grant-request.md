# Grant request — s046 T011 skill, operator docs, and domain contracts

**Requested by**: `pij-condemned-cockroach`
**Rebased base**: `origin/main@f9c9a0a3e3e6d2b9041f508e07c5c99e02fd1ad1`
**Rebased checkpoint commit**: `017af55bf438871216eb64d1bd0c84896e411864`
**PR**: draft #13, force-updated after merged PR15/17
**Request state**: no T011 work started

## claim

The next conflict-free tranche is T011: mechanically guarded `/pij` route coverage, prime adoption/handover guidance, operator docs, and domain contracts for shipped tree/link/old-prime behavior.

Prior s044 overlap is released. Merged PR17's completion-first compaction and pull-delivery contracts are load-bearing and must be preserved while the sensor is extended.

## merged-main reread

- PR17 added the always-loaded completion interrupt, C3 fire-and-forget ownership, pair completion ordering, and mutation-backed sensor checks.
- PR15 added portable Pi model catalog/docs; no T011 path should disturb model content.
- Current peer route owns pull-vs-push identity and receive guidance.
- Current prime route uses `list --prime` for current-seat triage.
- Current kickoff adoption variant records no parent and does not yet link the adopted stream.
- Current handover unsets and then purges the outgoing prime instead of retiring it into visible old-prime history.

## exact requested write paths

### Sensor

- `harness/scripts/pij-skill-check.sh`

### Skill contracts

- `skills/pij/SKILL.md`
- `skills/pij/references/routes/peer.md`
- `skills/pij/references/routes/prime.md`
- `skills/pij/references/prime/rituals/kickoff.md`
- `skills/pij/references/prime/templates/seat-handover.md`

### Operator docs

- `docs/how/pij.md`
- `docs/how/pij-prime.md`

### Domain contracts

- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/domains/pij-orchestration/domain.md`
- `docs/domains/pij-skill/domain.md`
- `docs/domains/registry.md`
- `docs/domains/domain-map.md`

### Evidence

- `docs/plans/046-pij-real-trees/tasks/tranche-t011/**`
- `docs/plans/046-pij-real-trees/reviews/*t011*`
- `docs/plans/046-pij-real-trees/reports/*t011*`
- `.harness/temp/s046/**`

## exact behavior

1. Root CLI coverage maps `tree` and `link` to the peer route; orchestration prime coverage includes retire without creating a new route.
2. Peer route documents:
   - repository/global/arbitrary-node tree views and filters;
   - link parent/root and ownership separation;
   - tmux adopt `--parent`;
   - external pull mode still never discovers/adopts panes;
   - existing inbox/push/C1/C7 guidance remains intact.
3. Prime route keeps current-seat triage on current-only `list --prime`; ordinary tree/list old-prime is audit/history, never an active-seat signal.
4. Kickoff:
   - automatic spawned parent link is mechanically verified in tree evidence;
   - adopted stream is linked to the o-prime after identity/canary proof and before brief delivery;
   - structure tree is then pushed from product truth.
5. Seat handover:
   - set incoming current prime before writer transfer;
   - bounded dual-current overlap remains;
   - after outgoing final relay, `prime retire <outgoing>` replaces unset;
   - verify outgoing absent from current-only `list --prime` and visible as `O`/old-prime in list/tree history;
   - close/dissolve may follow without erasing historical designation.
6. Operator docs cover tree/link/adopt-parent, repository/worktree grouping, activity/liveness/lifecycle filters, current/old prime, multiple current primes, ownership separation, legacy fallback, and bounded corrupt-tree rendering.
7. Domain docs/registry/map record structural parent, repository identity, tree projection, link/adopt/spawn wiring, old-prime transition, and skill consumption without adding a new domain.

## sensor-first mutations

The updated `pij-skill-check` must fail when copied fixtures remove or corrupt:

1. `tree` or `link` CLI coverage;
2. peer route tree/link/adopt-parent contract;
3. kickoff adopted-stream link before brief delivery;
4. handover outgoing `retire` ordering (or substitute `unset`);
5. current-only `list --prime` triage;
6. any PR17 completion-first compact marker/order/no-`--wait` contract;
7. pull-delivery `pij inbox --wait`/no-state-polling contract.

## explicit preservation

- Do not modify `skills/pij/references/00-routing.md` or `routes/pair.md`; consume merged PR17 contracts as-is.
- Preserve completion-first fire-and-forget compact, C1/C7 pull behavior, route sibling-blindness, line budgets, prime payload pointers, and worktree lifecycle gates.
- Preserve PR15 portable-model files/content.

## explicit exclusions

- No product source/tests, flow-pair engine/prompt-lab, packages, schemas, dependencies, government files, smoke/live proof, daemon restart.
- No T012.
- No commit, push, PR update, or merge without later grant.

## proof

- Baseline `just pij-skill-check`.
- Sensor-first RED mutations for all seven contracts above, each restored byte-identical.
- Final `just pij-skill-check`.
- `just lint`.
- `just typecheck`.
- `harness checks --quick`.
- Cold reviewer checks exact commands against shipped CLI source and validates domain/operator consistency.

## open[]

- Request prime grant for exactly the 14 files and named evidence above.
- If granted, reuse compacted coder/reviewer after state/model/cwd/canary verification.
- T012 remains baton-gated after T011 acceptance.
