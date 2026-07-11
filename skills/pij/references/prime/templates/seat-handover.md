# Seat handover — <outgoing pij id> → incoming o-prime
**Written**: <ISO> · **Trigger**: <ruling pointer — rotation is ruled, never self-invented>

> ORDERING CONTRACT (first outside rotation hit this race): the outgoing seat
> WRITES this pack and re-stamps/bumps the spine BEFORE the incoming seat is
> told to make contact. An incoming seat whose government read predates the
> pack rebuilds state without the newest rulings.

## Boot path for the incoming seat

1. `pij adopt "$TMUX_PANE" --harness <h>` FIRST (fresh seats always E-AMBIG),
   then lever 0.
2. Read: spine → baton book → prime-flow (CLI-only) → briefs → THIS PACK →
   local orient. Check the spine `Seq:` counter against this pack's
   `spine-seq at write:` line — a mismatch means you are reading mid-write.
3. Rotation checklist — transfer EVERY writer line (they are easy to miss):
   - [ ] spine `Writer:` + a rulings entry recording the rotation
   - [ ] baton-book `Writer:`
   - [ ] orient-local writer/tuner line
   - [ ] anything this repo added (grep `Writer:` under government/)
4. Announce to the human and to every live stream **citing this pack** —
   streams do not know your id; say so explicitly per stream.

## Live state inherited

- Streams + fleets: <id · plan · phase · fleet ids · what it does NOT know yet>
- Batons: <book is truth; name holds + standing rules>
- Sequencing watches: <ids + the ones with closing windows, flagged>
- Ruled-and-settled: <decisions with DO-NOT-RE-LITIGATE markers>
- **Session-bound dependencies**: <anything whose completion lands only in the
  outgoing seat's session — each carries an explicit relay contract:
  "I relay X verbatim-by-pointer before standing down">
- Uncommitted tree: <paths + WHY uncommitted + whose decision committing is>

## Outgoing-descriptor lifecycle (one rule, no synthesis needed)

The outgoing seat's descriptor is purged **by the incoming seat, after the
outgoing seat's FINAL send** (all relay contracts discharged, stand-down
announced). Track it as a sequencing watch until then. Ownership-aware
teardown is not violated: the pack + stand-down note constitute the owner's
explicit ask.

**spine-seq at write**: <spine Seq value when this pack was finished>
