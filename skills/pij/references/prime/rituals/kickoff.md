# Kickoff — spawn or adopt one stream

Run steps in order. The artifacts make the process reconstructable; conversation
does not.

## Steps 1–16

1. **Record the ruling.** Put the human's named work item in the spine rulings
   log, dated and as close to verbatim as possible.
2. **Allocate.** Scan existing plan ordinals; reserve ordinal, folder, and
   `s<ord>-<slug>` window in the allocation ledger. Tombstones stay burned.
3. **Derive fences from actions.** Enumerate paths the plan will touch, verify
   them on disk, name scratch space, and resolve every overlap before spawn.
4. **Add the roster row.** Status `allocating`; update the row and UTC stamp
   before prose. A polished note beside a stale row fooled readers twice.
5. **Write the brief before spawning.** Instantiate
   [`../templates/stream-brief.md`](../templates/stream-brief.md) with ask,
   fences, structure tree, prior art, report cadence, and provisional status.
6. **Spawn.** `pij spawn --harness <h> --model <m> --effort <e> --layout window`;
   capture id and pane, name the window, and disable accidental automatic rename.
7. **Wait for the daemon's ready push.** Never poll a booting peer.
8. **Canary.** Complete all three legs below and write the record at pass time.
9. **Deliver the brief by pointer.** One send, no inline body. Its ack closes
   canary leg (c).
10. **Sync the spine.** Fill peer id, status `briefed`, and stamp. Push the
    updated structure tree to every live stream.
11. **Report one hop up.** Use [`reports.md`](./reports.md); if this is a
    topless o-prime, the government record + human digest replaces numbering.
12. **Orient and preamble.** The stream reads portable orient, repo-local
    orient, and item brief read-only; the human confirms the assignment; the
    preamble report lands before planning mutation.
13. **Teardown.** Send the stand-down ruling, `pij close <id>`, wait for queue
    drain, verify state is dissolved or `E-NOID`, re-close if it reappears,
    strike the roster row, tombstone the ordinal, release batons, transplant
    useful findings.
14. **Keep the structure tree live.** Every brief names o-prime and sibling
    streams with ids/windows; every roster change triggers a tree push.
15. **Diff manifest against fences.** At plan validation compare both ways:
    task paths outside fences and fenced paths no task uses. Amend or fix.
16. **Adoption variant.** For a human-spawned peer, skip step 6 only. Unknown
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

## Yield rule — shared tree must compile

Fences protect ownership, not siblings' build windows. Two streams proved that
in opposite directions within one hour.

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
