# pij-team experience — plan 130

## Confirmed

- Ack-before-work paid for itself twice: prime corrected the plan-128 sequencing before code, and the reviewer surfaced both the dirty-working-tree review surface and split legacy/rs identity before reviewing.
- Solo-PM matched the actual collision surface; one implementation owner avoided cross-file queue/CLI/daemon merge churn.
- The isolated-daemon rule kept production untouched while real OMP and Claude panes exercised source-built code.

## Wrong or missing

- `packet-pm.dd.md` and `packet-reviewer.dd.md` point to worktree-local `.agents/skills/pij-team/TENETS.md`, but the scaffold does not vendor that path. Both seats needed the canonical checkout path supplied out-of-band. Encode a resolvable skill URI or vendor the file into the packet inputs.
- The plan scaffold omitted `the-flow.json` while requiring `harness flow nav/orient` every turn. PM had to create and adopt the flow manually. `harness team new` should seed the flight plan.
- Reviewer spawn produced legacy id `pij-panicky-pheasant` while the rs daemon derived `pij-moral-whale` for the same pane. The canary's required `whoami` + footer check exposed the split, but the first rs reply was refused. This confirms the canary requirement and identifies a spawn/adopt identity convergence gap.
- No deterministic live scenario existed for send defaults and cross-seat peek. Hand-written coordination scripts initially paired `touch` with `test -s`, causing false waits. Encode the final isolated-daemon, real-client, nonempty-marker scenario in the Driver SDK.
- The PM packet's req-0044 shorthand was easy to overgeneralize. The exact standing exclusions are only `npm-resolution-policy.integration.test.ts` replay status and `worktree.test.ts` cleanup ENOTEMPTY; packet templates should require exact names, not a row reference alone.
