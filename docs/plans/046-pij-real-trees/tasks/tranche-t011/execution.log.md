# Execution log — T011

**Status**: complete
**Grant**: Spine Seq 182
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0005`

## Scope

- Updated exactly the 14 granted skill, operator-guide, and existing-domain paths.
- Added evidence only in this execution log.
- Product source/tests, `.flow-pair/**`, flow state, government, smoke/live/restart,
  package state, dependencies, git ceremony, and T012 remained read-only/excluded.
- Preserved the PR17 completion-first compact and C7 pull contracts, the PR18
  local-path severance and prime-hierarchy link, PR15 model documentation,
  sibling-blindness, pointer integrity, and route line budgets.

## Sensor-first sequence

1. Baseline `just pij-skill-check` passed before changes.
2. Edited only `harness/scripts/pij-skill-check.sh`.
3. The sensor-only run failed solely on the future T011 markers: root tree/link
   coverage; peer tree/link/adopt-parent/ownership/repository guidance;
   current-only prime triage; spawned/adopted kickoff ordering; and retire
   handover ordering/history.
4. All existing PR17 completion/C7 and PR18 portability checks remained green in
   that RED run.
5. Guidance/docs/domain changes made the extended sensor green.

## Delivered contracts

- Root skill coverage maps `tree` and `link` to the peer route without adding a
  route or violating sibling-blindness.
- Peer guidance documents exact tree/link/adopt-parent grammar, repository views
  across linked worktrees, filter composition, and the separation between
  structural `parentId` and close-owner `spawnedBy`.
- Prime triage uses current-only `pij list --prime`; `oldPrime` is audit history,
  never an active-seat signal.
- Kickoff verifies automatic spawned links and links adopted streams after canary
  but before the brief pointer.
- Handover sets the incoming seat before writer mutation, retires the outgoing
  seat after its final relay, and retains old-prime history.
- R1 makes adopted kickoff executable: canary (a)+(b), link/tree verification,
  brief pointer as leg (c); records structural parent separately from unknown
  `spawnedBy` close ownership.
- `PIJ_PARENT_ID` is documented as a spawn/adopt/export-time environment snapshot;
  `pij link` changes descriptor truth observed through tree and cannot retro-tag a
  running process.
- Operator guides cover repository/global/subtree selection, lifecycle filters,
  no-write links, adopt parent validation, P/O/problem markers, bounded iterative
  rendering, current/old-prime receipts, and multiple-current handover overlap.
- Existing messaging/control-plane/orchestration/skill domain contracts,
  registry, and map were extended; no domain or dependency direction was added.

## Seven mutation proofs

Every mutation made `just pij-skill-check` RED and was restored byte-identically
before the next mutation:

| # | Mutation | Killed by | Restored SHA-256 |
|---|---|---|---|
| 1 | Removed `link` from root CLI coverage | `verb coverage: 'link' unmapped` | `SKILL.md` `0077e75d...f68f97a` |
| 2 | Corrupted peer parent-link command | missing peer parent-link marker | `peer.md` `1f43b6e2...02a9f94` |
| 3 | Moved adopted-stream link after brief | kickoff ordering failure | `kickoff.md` `089ccc40...2413ee1` |
| 4 | Replaced outgoing `retire` with `unset` | retire-after-relay marker missing | `seat-handover.md` `fcd8651d...ba96a7a` |
| 5 | Made old-prime an active-seat signal | current-only triage marker missing | `prime.md` `95c1ba60...b0330a1` |
| 6 | Corrupted PR17 completion interrupt | root compact-interrupt count failure | `SKILL.md` `0077e75d...f68f97a` |
| 7 | Replaced C7 inbox wait with state polling | external inbox/state-loop failures | `SKILL.md` `0077e75d...f68f97a` |

The final sensor itself was unchanged after these mutation proofs
(`f88e1e02...fe17b5f`).

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T18:35:00+10:00 | orchestrator | grant accepted | exact 14 paths + seven sensor mutations |
| 2026-07-13T18:36:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0005.md` · hash `9bbd7ffd` |
| 2026-07-13T19:58:00+10:00 | coder | baseline green | pre-change `just pij-skill-check` |
| 2026-07-13T20:01:00+10:00 | coder | sensor RED | only future T011 markers failed; preserved checks green |
| 2026-07-13T20:13:00+10:00 | coder | mutations killed | seven RED proofs; per-file hashes restored |
| 2026-07-13T20:14:00+10:00 | coder | targeted gates green | skill check; local-path 4/4; flow-pair 148/148; typecheck; lint |
| 2026-07-13T20:16:00+10:00 | coder | preserved contract repaired | aggregate found the PR18 exact tmux-adopt sentence; restored verbatim and kept adopt-parent guidance separately; CLI integration 37/37 |
| 2026-07-13T20:17:00+10:00 | coder | quick harness green | local-paths, typecheck, lint, full test, windows-compat, package audit, snapshots passed; smoke skipped by `--quick` |
| 2026-07-13T20:21:00+10:00 | orchestrator | audit cleanup complete | `.pi/packages.yaml` vetted-date-only churn restored byte-identically to `HEAD` |
| 2026-07-13T20:29:00+10:00 | reviewer | R1 FIX_REQUIRED | kickoff order contradicted canary leg (c); PIJ_PARENT_ID incorrectly described as live link state |
| 2026-07-13T20:39:00+10:00 | coder | R1 GREEN | executable a+b→link→brief(c) order, stronger sensor, accurate environment snapshot docs |
| 2026-07-13T20:44:00+10:00 | reviewer | R2 APPROVE | focused order mutation RED→restore→GREEN; no scope/preservation regression |
| 2026-07-13T20:46:47+10:00 | orchestrator | tranche accepted | skill/local-path/flow-pair/CLI/static/quick full sensors green; smoke skipped/T012 |

## Gates

| Gate | Result |
|---|---|
| `just pij-skill-check` | PASS |
| `just test harness/scripts/local-path-check.test.ts` | PASS - 4/4 |
| `just flow-pair-test` | PASS - 148/148 |
| `just test .pi/extensions/pij/cli.integration.test.ts` | PASS - 37/37 |
| `just lint` | PASS - 10 pre-existing warnings and one schema-version notice |
| `just typecheck` | PASS |
| `harness checks --quick` | PASS - all enabled sensors green; smoke intentionally skipped |

R1/checkpoint proof:

```text
link-after-leg-(c) sensor mutation          RED → restore → GREEN
review R2                                   APPROVE
just pij-skill-check                        PASS
local-path-check                            4/4
flow-pair                                   148/148
CLI integration                             37/37
harness checks --quick                      PASS
```

The first quick-harness attempt failed one preserved exact-string integration
contract after the adopt syntax was expanded inline. The original sentence was
restored byte-for-byte and the new `--parent` syntax moved to a separate sentence;
the focused integration test and second aggregate then passed.

Package audit changed only `.pi/packages.yaml` `vetted.date` values. That path is
outside this grant; the owner restored it byte-identically to `HEAD` before the
final exact-scope report.

## R1 docs/sensor fix

- **Delegation**: `dlg-0005-fix-r1`
- **Scope**: changed only `harness/scripts/pij-skill-check.sh`,
  `skills/pij/references/prime/rituals/kickoff.md`, `docs/how/pij.md`, and this
  execution log. Product, domain, package, smoke, government, and flow-state
  paths remained read-only.
- Tightened the kickoff sensor first. Its initial run was RED only because the
  existing guidance lacked the new identity-before-link-before-leg-(c) sequence.
- Made adopted-stream kickoff executable: complete canary legs (a) and (b), link
  and verify the structural parent, record absent or unknown `spawnedBy`/close
  ownership, then deliver the brief pointer as leg (c) and close the record.
  Spawned streams explicitly verify their automatically persisted parent edge.
- Corrected `PIJ_PARENT_ID` as a spawn/adopt/export-time environment snapshot.
  Registry `parentId` truth comes from `pij tree`; `pij link` cannot rewrite a
  running process environment. Explicit-root exports emit no parent assignment,
  so callers with potentially stale shell state must unset it before evaluation.
- Mutation proof moved the adopted link after leg (c). The sensor exited 1 with
  `Deliver the brief by pointer as canary leg (c)` reported out of order. The
  kickoff file was restored byte-identically to SHA-256
  `3ca83cb855a989c169d4a40a3e57d743fb2cc27f8ac9d76045d850e0344c3f81`,
  then the sensor returned green.

| R1 gate | Result |
|---|---|
| `just pij-skill-check` | PASS |
| Link-order mutation | RED as required; restored; GREEN |
| `just test harness/scripts/local-path-check.test.ts` | PASS - 4/4 |
| `just test .pi/extensions/pij/cli.integration.test.ts` | PASS - 37/37 |
| `just lint` | PASS - 10 pre-existing warnings and one schema-version notice |
| `just typecheck` | PASS |

## Deferred

- T012 smoke/live/restart and all git ceremony/merge remain excluded.
