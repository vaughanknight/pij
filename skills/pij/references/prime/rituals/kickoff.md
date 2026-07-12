# Kickoff — spawn or adopt one stream

Run steps in order. Artifacts make the process reconstructable; conversation does not.

## Steps 1–18

1. **Record the ruling.** Put the human's named work item in the spine rulings
   log, dated and as close to verbatim as possible.
2. **Allocate.** Scan plan ordinals; reserve ordinal, folder, `s<ord>-<slug>`
   window, branch, worktree path, approved base/SHA. Tombstones stay burned.
3. **Derive fences from actions.** Enumerate paths the plan will touch, verify
   them on disk, name scratch space, and resolve every overlap before spawn.
4. **Add the roster row.** Status `preparing`; record worktree, branch, base, and
   UTC stamp before prose. A polished note beside a stale row fooled readers twice.
5. **Write the brief before spawning.** Instantiate the
   [`stream brief`](../templates/stream-brief.md) with ask, fences,
   worktree/branch/base, tree, prior art, cadence, and provisional status.
6. **Construct before spawn.** New: `git worktree add -b <branch> <worktree>
   <approved-base>`; resumed: `git worktree add <worktree> <branch>`. Verify base
   SHA/branch. Shared-tree construction requires an explicit fallback ruling.
7. **Spawn from the worktree.** `(cd <worktree> && pij spawn --harness <h>
   --model <m> --effort <e> --layout window)`. Peer descriptor/pane cwd comes
   from `process.cwd()`; there is no peer `--cwd`. Keep it out of the o-prime window.
8. **Wait for the daemon's ready push.** Never poll a booting peer.
9. **Verify placement.** From the worktree, inspect `pij list --here --json`,
   `git branch --show-current`, and the tmux window/panes. Descriptor cwd, branch,
   and window must match the brief before readiness.
10. **Canary.** Complete all three legs below and write the record at pass time.
11. **Deliver the brief by pointer.** Its first instruction is `/pij prime`;
   one send, no inline body. Its ack closes canary leg (c).
12. **Sync the spine.** Fill peer id, status `briefed`, and stamp. Push the
    updated structure tree to every live stream.
13. **Report one hop up.** Use [`reports.md`](./reports.md); if this is a
    topless o-prime, the government record + human digest replaces numbering.
14. **Orient and preamble.** The stream invokes `/pij prime`, follows the
    module-first journey, and lands its preamble report before planning mutation.
15. **Land before teardown.** Require `/builder 8 ship` evidence of PR merge, or
    record an explicit abandonment ruling. Then send stand-down, `pij close <id>`,
    drain the queue, verify `E-NOID`, remove the worktree, strike the roster row,
    tombstone the ordinal, release batons, and transplant useful findings.
16. **Keep the structure tree live.** Every brief names o-prime and sibling
    streams with ids/windows; every roster change triggers a tree push.
17. **Diff manifest against fences.** At plan validation compare both ways:
    task paths outside fences and fenced paths no task uses. Amend or fix.
18. **Adoption variant.** For a human-spawned peer, skip steps 6–7 only. Unknown
    provenance makes the same canary more important; record no-parent/spawner,
    **instantiate the same stream-brief template — every section, the Orient
    stack included** (the first outside run freelanced its adoption brief and
    dropped the levers), roster `ADOPTED`, and hold provisional until the
    human preamble.

## Canary

Write `government/canaries/s<ord>.md` while the evidence is fresh:

| Leg | Mechanical proof |
|---|---|
| (a) round-trip | Send a nonce challenge; ack must arrive as a daemon-injected turn |
| (b) identity | Read registry/state for harness, model, effort, parent, and native session; if a field is absent/unbound, capture the pane footer as the explicit fallback — never accept bare self-assertion. An UNPINNED peer can only honestly self-report "default" (its args carry nothing to verify) — the prover of actual model/effort is YOUR footer/registry probe, so don't demand self-confidence the peer cannot have |
| (c) input reliability | A second send lands; use the brief-pointer send and require `brief-ack`. Adopting a mid-flight peer: legs (a)+(b) may be satisfied by the orientation exchange itself; record (c) as PENDING-on-brief-ack and close it in the record when the ack lands |

The first run did all three and still failed its audit because the record lived
only in transcript. **Pass-time file first, claim second.**

## Live deviations folded in

- Settle the item before spawn; otherwise a canaried peer idles on hold.
- Brief-before-spawn keeps the canary-to-work gap tight.
- Structure tree and scratch fence are fields, not afterthoughts.
- Human direct-go defaults to "after o-prime deconfliction" unless the human
  says now-regardless; cc the o-prime before first execution.

## Shared-tree fallback yield rule

Worktree-primary construction removes routine tree/index collisions. If a ruled
shared-tree fallback is unavoidable, fences still do not protect siblings' build
windows; two streams proved that in opposite directions within one hour.

1. Author uncompilable work in scratch; move it in-tree only when it builds.
2. Every pause, handoff, yield — and every **commit**, the strongest yield
   point — includes the repo's compilation/typecheck probe: a commit's
   transitive type closure must compile at checkout (a run-01 phase commit
   nearly shipped referencing a sibling's untracked sources).
3. A non-owner never repairs a sibling's broken file. Stop and send an
   **urgent owner-fix** with the failing command and exact path.
4. The rule cuts upward and beyond compilers: the o-prime's own untracked
   CLI-generated file once redded a stream's FORMAT gate — ignore-list
   generated files (`.prettierignore` etc.); never hand-format them.
