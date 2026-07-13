# Cold review brief — s046 T011

**Grant**: Spine Seq 182
**Delegation**: `dlg-0005`
**Immutable diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0008.patch`
**Reviewer**: reusable cold Copilot `gpt-5.6-sol` xhigh

## Review target

Review only the exact 14 skill/sensor/operator/domain paths in
`tasks/tranche-t011/tasks.md`. Exclude orchestrator request/roster/tasks evidence
from coder scope.

## Mandatory checks

1. Sensor-first evidence is real: sensor-only RED fails only new T011 markers while
   existing PR17 completion/C7 and PR18 local-path checks remain green.
2. All seven mutation proofs are targeted, RED, restored byte-identical, and final
   `just pij-skill-check` is green.
3. Root CLI coverage maps shipped `tree`/`link` to peer without a new route.
4. Peer commands match shipped CLI exactly; external pull mode never guesses/adopts panes.
5. Prime triage stays current-only; old-prime is audit/history only.
6. Kickoff verifies automatic spawned links and orders adopted link after identity/canary
   but before brief delivery.
7. Handover orders incoming set before writers and outgoing retire after final relay;
   old-prime history survives close/dissolve.
8. Operator docs match shipped grammar/filter/serialization/ownership behavior and
   preserve PR18 `pij-prime-tree.md` link.
9. Domain docs/registry/map agree and introduce no new domain/dependency direction.
10. PR17 completion-first/no-wait/C7/pair text, PR18 local-path behavior, PR15 model
    content, sibling-blindness, pointers, budgets, and worktree gates remain intact.
11. No product/package/schema/government/smoke/live/restart or excluded path.

## Required mutation matrix

Re-run or independently verify all seven:

1. root tree/link coverage;
2. peer parent-link marker;
3. adopted link-before-brief order;
4. retire-after-final-relay, rejecting unset;
5. current-only prime triage;
6. PR17 completion interrupt/no-wait;
7. C7 inbox wait/no-state-poll.

## Commands

- `just pij-skill-check`
- `just test harness/scripts/local-path-check.test.ts`
- `just flow-pair-test`
- `just test .pi/extensions/pij/cli.integration.test.ts`
- `just lint`
- `just typecheck`
- `harness checks --quick`

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t011.md` with verdict, findings,
mutation matrix, command fidelity, exact scope, preserved merged contracts, and
remaining uncertainty. No source/doc edits.
