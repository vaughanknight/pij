# Kickoff — spawn or adopt one stream

Run steps in order. Artifacts make the process reconstructable; conversation does not.

## Steps 1–17

1. **Record the ruling.** Put the human's named work item in the spine rulings
   log, dated and as close to verbatim as possible.
2. **Allocate.** Scan plan ordinals, then run `pij stream create --project <p>
   --slug <s> [--base <ref>] [--ordinal N]`. Its allocation record reserves
   ordinal, branch, worktree path, and create-time base SHA; tombstones stay burned.
3. **Derive descriptive fences from actions.** Enumerate expected paths, verify
   them on disk, name scratch space. Record separate-branch overlaps as merge
   risk (they never block spawn) and name the future convergence point.
4. **Add the roster row.** Status `preparing`; record worktree, branch, base, and
   UTC stamp before prose. A polished note beside a stale row fooled readers twice.
5. **Write the brief before spawning.** Instantiate the
   [`stream brief`](../templates/stream-brief.md) with ask, fences,
   worktree/branch/base, tree, prior art, cadence, and provisional status.
6. **Construct before spawn.** Read back the `pij stream create` evidence and
   allocation journal; it owns worktree creation/resume plus branch/base
   verification (the verb replaces hand-running `git worktree add -b`).
   Shared-tree construction still requires an explicit fallback ruling.
7. **Spawn from the worktree.** `(cd <worktree> && pij spawn --harness <h>
   --model <m> --effort <e> --layout window)`. Peer descriptor/pane cwd comes
   from `process.cwd()`; there is no peer `--cwd`. Keep it out of the o-prime window.
8. **Wait for the daemon's ready push.** Never poll a booting peer.
9. **Verify placement.** Inspect `pij list --here --json`, `git branch --show-current`,
   and the tmux panes; for spawned streams, verify the automatically persisted structural link with `pij tree <id> --json`;
   cwd, branch, parent, and window must match the brief.
10. **Canary legs (a) and (b).** Run `pij canary <id> --expect-model <m>`;
    Complete canary leg (a) round-trip and leg (b) identity proof, and record the
    nonce-dispatch plus defensive runtime evidence at pass time. Leave leg (c) pending.
    Adopted streams then run `pij link <id> --parent <o-prime-id> --json`;
    verify the subtree, record the linked parent and `spawnedBy`/close ownership.
11. **Deliver the brief by pointer as canary leg (c).** Run `pij dispatch <id>
    --packet <brief> --wait`; its first instruction is `/pij prime`. The seat
    runs the header's `pij ack <dispatch-id> --packet-sha <sha>` first; then close leg (c).
12. **Sync the spine; keep the structure tree live.** Fill peer id, status
    `briefed`, and stamp. Every roster change pushes the updated tree to every
    live stream; every brief names o-prime and siblings with ids/windows.
13. **Report one hop up.** Use [`reports.md`](./reports.md); if this is a
    topless o-prime, the government record + human digest replaces numbering.
14. **Orient and preamble.** The stream invokes `/pij prime`, follows the
    module-first journey, and lands its preamble report before planning mutation.
15. **Land before teardown.** Require `/builder 8 ship` evidence of PR merge, or
    record an explicit abandonment ruling. Then stand-down, `pij close <id>`,
    drain queue, verify `E-NOID`, remove worktree, strike row, tombstone
    ordinal, release batons, transplant findings.
16. **Diff manifest against descriptive fences.** At plan validation compare both
    ways: task paths outside the declared touch set and declared paths no task
    uses. Worktree-local additions are tell-not-ask (global invariant 11).
17. **Adoption variant.** For a human-spawned peer, skip steps 6–7 only. Unknown
    provenance makes the same canary more important; record the linked
    structural parent and absent/unknown `spawnedBy`/close ownership,
    **instantiate the same stream-brief template — every section, Orient stack
    included** (the first outside run freelanced its brief and dropped the
    levers), roster `ADOPTED`, provisional until the human preamble.

## Canary

Mechanical command details and the manifest example live in
[`../../../../../docs/how/pij-team-scaffold.md`](../../../../../docs/how/pij-team-scaffold.md).

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
- Structure tree and scratch fence are fields, not afterthoughts.
- Human direct-go: deconfliction default per [`protocol.md`](../protocol.md) § Human rulings.
- Worktree-confined work is notify-only; synchronize at convergence or shared
  mutable resources ([`protocol.md`](../protocol.md) § Construction).

## Shared-tree fallback yield rule

Worktree-primary construction removes routine tree/index collisions. If a ruled
shared-tree fallback is unavoidable, fences still do not protect siblings' build
windows; two streams proved that in opposite directions within one hour.

1. Author uncompilable work in scratch; move it in-tree only when it builds.
2. Every pause, handoff, yield, and every **commit** includes the repo's
   compile/typecheck probe: a commit's transitive type closure must compile at
   checkout (run-01 nearly shipped referencing a sibling's untracked sources).
3. A non-owner never repairs a sibling's broken file: stop, send an **urgent
   owner-fix** with the failing command and exact path.
4. The rule cuts upward and beyond compilers: the o-prime's own untracked
   CLI-generated file once redded a stream's FORMAT gate — ignore-list generated
   files (`.prettierignore` etc.); never hand-format them.
