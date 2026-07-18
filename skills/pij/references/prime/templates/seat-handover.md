# Seat handover — <outgoing pij id> → incoming o-prime
**Written**: <ISO> · **Trigger**: <ruling pointer — rotation is ruled, never self-invented>

> ORDERING CONTRACT (first outside rotation hit this race): the outgoing seat
> WRITES this pack and re-stamps/bumps the spine BEFORE the incoming seat is
> told to make contact. An incoming seat whose government read predates the
> pack rebuilds state without the newest rulings.

## Boot path for the incoming seat

1. `pij adopt "$TMUX_PANE" --harness <h>` FIRST (fresh seats always E-AMBIG),
   then lever 0. Persist the incoming seat with
   `pij orchestration prime set --json`; confirm its id appears in
   `pij list --prime --here --json` before changing any writer line.
   Until step 5 retires the outgoing marker, both seats are intentionally prime;
   this bounded overlap prevents a discovery gap during writer transfer.
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
   4b. Govern **store-native** from here (ruled default): self-migrate
   load-bearing facts lazily as you touch them — the rule and verb mapping
   live in [`../rituals/store-native.md`](../rituals/store-native.md).
5. After the outgoing seat's FINAL send, retire its live marker with
   `pij orchestration prime retire <outgoing-pij-id> --json`, verify it is absent
   from current-only `pij list --prime --here --json`, then confirm
   `pij tree <outgoing-pij-id> --all --json` retains it as `oldPrime: true`.

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

The outgoing seat is retired **by the incoming seat, after the outgoing seat's
FINAL send** (all relay contracts discharged, stand-down announced). Its descriptor
remains queryable as old-prime history; any separately ruled pane teardown must
preserve that registry evidence. Track relay, retire, and teardown as sequencing
watches. The pack + stand-down note constitute the owner's explicit ask.

**spine-seq at write**: <spine Seq value when this pack was finished>
