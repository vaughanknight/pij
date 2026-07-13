# T011 cold review

## Verdict

**FIX_REQUIRED**

The exact skill/sensor/domain scope is otherwise coherent, all seven required
mutations produced targeted RED, and the PR15/17/18 preservation gates pass.
Two changed operator contracts remain incorrect: adopted-stream kickoff cannot
satisfy its stated canary/link order, and `PIJ_PARENT_ID` is documented as if
`pij link` could mutate a running process environment.

## Findings

### High - Adopted-stream link ordering is internally impossible

`skills/pij/references/prime/rituals/kickoff.md:27-30` says to complete all
three canary legs, then link an adopted stream, then deliver the brief.
However, the canonical canary table at
`skills/pij/references/prime/rituals/kickoff.md:56-60` defines leg (c) as the
brief-pointer send itself. A run therefore cannot both complete the canary and
link before brief delivery.

The same adoption variant remains contradictory at
`skills/pij/references/prime/rituals/kickoff.md:45-50`: after the new mandatory
link, it still instructs the operator to record `no-parent/spawner`.

The new sensor checks only heading/marker order, so the current contradictory
text passes. Make the executable sequence explicit: complete canary legs
(a)+(b), link and verify the adopted stream, then deliver the brief as leg (c)
and close the canary record. Record the absence of `spawnedBy`/close ownership,
not the absence of the newly persisted structural parent. The sensor should
order the identity proof before link and link before the leg-(c) brief marker.

### Medium - `PIJ_PARENT_ID` is not live link state

`docs/how/pij.md:52-55` says `PIJ_PARENT_ID` is the effective structural parent
and that `pij link` can change or explicitly clear it. The shipped behavior
changes only the registry descriptor: `.pi/extensions/pij/core/cli.ts:926-934`
performs the link write, while
`.pi/extensions/pij/core/session-join.ts:68-80` describes the environment
export as registration/self-resolution sugar that cannot retro-tag a running
process.

Explicit root also emits no `PIJ_PARENT_ID` assignment rather than an unset;
`.pi/extensions/pij/core/session-join.test.ts:144-156` requires the export to
contain only `PIJ_SESSION_ID`. Evaluating that output in a shell that already
has `PIJ_PARENT_ID` therefore leaves the stale variable intact.

Document `PIJ_PARENT_ID` as a spawn/adopt/export-time environment snapshot and
state that `pij link` changes descriptor `parentId`, observable through
`pij tree`. If live environment clearing is intended, it needs separate
product behavior such as an explicit `unset PIJ_PARENT_ID` export.

## Sensor-first evidence

A disposable pre-T011 `skills/pij` payload from `HEAD` was checked with the new
working-tree sensor. It failed only the new T011 tree/link/adopt-parent,
current-prime, kickoff, and handover markers. Existing PR17 root/C3/pair
completion checks, C7 inbox/no-state-poll checks, PR18 portability, and the
prime hierarchy/orchestrator pointer checks remained green.

## Seven-mutation matrix

Each mutation ran against its own copied skill fixture; no coder file was
modified.

| Mutation | RED proof |
|---|---|
| Remove `link` from root CLI coverage | `verb coverage: 'link' unmapped` |
| Corrupt the peer parent-link command | Missing exact parent-link marker |
| Move adopted link after brief delivery | Brief marker reported out of order |
| Replace outgoing `retire` with `unset` | Retire-after-final-relay marker missing |
| Make old-prime part of active-seat triage | Current-only triage marker missing |
| Corrupt the PR17 completion interrupt | Root compact-interrupt count became zero |
| Replace C7 inbox waiting with state polling | No-state-poll, inbox-wait, and blocking-delivery markers all failed |

The final `just pij-skill-check` returned green. Original files remained at:

- `SKILL.md` `0077e75d3bb3f3410b48f3f0fce3d699296624d697a5a58cbcbdf7b24f68f97a`
- `peer.md` `31a210aa7d7de320021f41d5de6cfd5f1129f54816c4be4be1e4b9e0738ad372`
- `prime.md` `95c1ba60b86c10c2b197ecbcb91619adef3b7a1128811f920d5c59dbab0330a1`
- `kickoff.md` `089ccc407fa9ff490a42d0870dfb6166e740ac5b13711e136fbf81e972413ee1`
- `seat-handover.md` `fcd8651d9fff98fcbf64c87ad552f437ab1608e251c739f9815653175ba96a7a`
- `pij-skill-check.sh` `f88e1e02df881f0eb5abcee3f20992f3ca2556df6d73685b057989926fe17b5f`

## Command fidelity

- Root skill coverage maps `tree` and `link` to the existing peer route without
  adding a route.
- Peer tree selectors, repeatable filters, parent/root link forms, no-write
  validation, ownership separation, and tmux-only adoption match the shipped
  parsers and dispatch. External pull mode still forbids pane discovery/adoption.
- Prime triage remains current-only through `pij list --prime`; old-prime is
  audit/history through ordinary list/tree projections.
- Operator tree/link/filter/serialization and prime transition descriptions
  match source except for the `PIJ_PARENT_ID` finding above.
- Domain docs, registry, and map extend the existing messaging, control-plane,
  orchestration, and skill directions without adding a domain or dependency
  edge.

## Commands and results

| Command | Result |
|---|---|
| `harness boot` | Ready; typecheck and full test stages passed |
| Sensor-first pre-T011 fixture | RED only on new T011 markers; preserved checks green |
| Seven isolated mutations | All seven exited non-zero with their targeted guard |
| `just pij-skill-check` | Passed after mutation fixtures |
| `just test harness/scripts/local-path-check.test.ts` | 4/4 passed |
| `just flow-pair-test` | 16 files, 148/148 passed |
| `just test .pi/extensions/pij/cli.integration.test.ts` | 37/37 passed |
| `just lint` | Exited 0 with ten existing warnings and one info notice |
| `just typecheck` | Passed |
| `harness checks --quick` | All enabled sensors passed; smoke skipped |
| `git diff --check` | Passed |

Package audit refreshed report-only dates; `.pi/packages.yaml` was restored
byte-identically to SHA-256
`c5fc45ee468a4e7293b1e508a498234a087e8698de5df4580509a40936832840`.

## Exact scope

Reviewed the exact 14 granted paths:

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

Immutable patch SHA-256:
`bb28bea0e45074330dc1de7d09699034b6a93dfaba244aec4d96c0ba0e662cca`.
The patch's fleet-roster and grant-request changes are orchestrator evidence and
were excluded from coder scope.

## Preserved merged contracts

- PR17: `references/00-routing.md` and `routes/pair.md` have no diff;
  completion-first compact, fire-and-forget/no-`--wait`, pair ordering, and C7
  inbox/no-state-poll guards all pass and mutation-kill.
- PR18: local-path tests pass 4/4, portability remains green, and
  `docs/how/pij-prime.md` retains the `pij-prime-tree.md` hierarchy link.
- PR15: no model catalog or model documentation path appears in the patch.
- Sibling-blindness, hard route budgets, advisory prime budgets, pointer
  integrity, and worktree lifecycle gates remain green.

## Remaining uncertainty

Full tmux smoke/live and daemon-restart evidence remains T012-owned.
`harness checks --quick` intentionally skipped smoke. This review did not widen
into product changes for live environment synchronization; the second finding
can be resolved as documentation-only unless that behavior is intentionally
required.
