# Standing up a PA — the portable recipe (any prime, any repo)
**Written**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij) · **For**: any prime
**Status**: PORTABLE. Nothing in the skill payload teaches this yet — a prime running
`/pij prime` will never learn a PA exists. Until that lands, this file is the path.

## What is now shipped (so you are not building on a promise)

| Piece | State |
|---|---|
| `orchestrationRole: "pa"` | LIVE, pij `fa3bdc1` — vocabulary single-sourced as data; both write parsers accept it |
| Capability gate | LIVE — one predicate at two seams (`core/cli.ts dispatch`, the bin's argv early-branch), exhaustive verb-classification test |
| `whoami` projects `role` + `refusedVerbs` | LIVE — a PA can read its own capability instead of discovering it by attempting |
| `--for <prime>` card relay | LIVE — PA-only, own-prime-only, card-only (never a semantic state: that is first-person) |
| `statusWrittenBy` | LIVE — a relayed card records the PA as author, so a PA never borrows its prime's identity |
| Rail render | LIVE, chainglass `03c09e95d` + `2e5f7e8a1` — sky chip (never the prime's indigo), placed under its prime at PM level, optional-but-rendered card |
| Unadopted-`pa` guard | pij PR #69 (lineage-at-spawn) — `pa` is the one role whose SUBJECT is its parent |

## The steps

1. **Spawn from your repo root**, harness of your choice. Cheap/fast is the design intent
   (roadrunner is running gemini-3.6-flash; albatross is copilot-backed — see § Tier).
2. **Canary it** like any seat — three legs, recorded at pass time. An un-canaried PA is
   an instrument you have not proved.
3. **Link and role in one call**:
   `pij link <pa-id> --parent <your-prime-id> --role pa --json`

   > **`--role` is UNDOCUMENTED in `pij link --help` — this is expected, not your error.**
   > The usage line reads only `<child> --parent <parent> | --root [--actor] [--json]`,
   > and `grep -ci role` over it returns 0. The flag works; the help is stale. Verified by
   > pij-tense-centipede (which probed it and got past arg parsing to `E-NOID`) and
   > confirmed independently here. **A prime following `--help` instead of this file will
   > conclude step 3 is impossible and either improvise or stall.** Help-text fix routed.
   Then **verify the write, never the print**: read the descriptor and re-read via
   `pij list --json` / `pij tree --json`. Both must say `pa`.
4. **Brief it by pointer.** Instantiate `pa-missing-anaconda-2026-07-31.md` for your repo —
   its ten rules are the study's findings and are not optional.
5. **Set its watchdog as its SWEEP TRIGGER**: `pij watchdog interval <pa-id> 20m`. Tell it
   plainly that a nudge means *run a sweep and report*, not *say you are alive*.
6. **Have it register as YOUR watcher, from its own seat** (`watch` subscribes the caller,
   so you cannot do it for it):
   `pij watchdog watch <your-prime-id> --capture anomaly`
   This is the whole point: a prime has no parent, so its anomalies have nowhere to be
   delivered — except to a registered watcher.

   > ### ⚠ ORDERING TRAP — CORRECTED 2026-08-01, read before you run step 3
   >
   > **Do step 6 BEFORE step 3.** Subscribe the watcher first, *then* stamp `--role pa`.
   >
   > **Why**: plan 078 classifies the whole `watchdog` verb family as refused for role
   > `pa` (`orchestration/pa-capability.ts:127` — *"it changes supervision policy for a
   > seat"*). `watch` only ever registers `watcherId: self`, so once a seat IS a `pa` it
   > **cannot subscribe itself, and you cannot subscribe it either**. The deterministic
   > push hook that is the PA's designed trigger is unreachable from inside the role.
   >
   > Found by pij-chief-roadrunner's flash-tier PA, 2026-08-01. albatross's PA has the
   > subscription only because it happened to register while still unroled — an accident
   > of sequencing, not a working path.
   >
   > A real fix is routed (allow `watch|unwatch` for `pa` **restricted to registering
   > itself** — it is first-person, the same argument that already permits `report now`
   > and `state set`; keep `pause|resume|exempt|interval` refused, since subscribing to
   > notices changes no seat's policy). Until it lands, **order is the workaround**, and
   > an existing subscription survives the role change.

## The four things that cost us a cycle each — do not re-pay them

1. **Require a MESSAGE per sweep; treat the card as optional.** albatross's PA ran two
   sweeps and reported them only as a status card while the rail was dropping PA cards on
   the floor. Its work was invisible from every angle. **A sweep the prime cannot see did
   not happen.**
2. **Positive heartbeat with a DENOMINATOR** — "swept 3 PRs, 3 green, 0 rows" — never
   silence. A dead PA and an idle PA produce identical telemetry.
3. **Read-only is enforced by the GATE now, not by the prompt** — but check
   `whoami --json` on the live seat before trusting it; a proof about one layer is not a
   guarantee about the next.
4. **Day-one scope is zero-actuator**: CI/PR/main watching, your card's staleness, and
   relaying anomaly rows verbatim. Add chores only after the nudge etiquette is proven
   somewhere it cannot annoy anyone.

## Tier

The concept was designed for a cheap fast model. albatross's PA is copilot-backed, so it
tests the SHAPE of the concept, not the TIER. roadrunner's is on gemini-3.6-flash and is
the live test of the premise — wait for its charter-vs-flash report before assuming a
flash-class seat holds the ten rules under load.

## Standing constraints (unchanged)

Cards: a PA owes none of its own (Jordan, 2026-07-31) — its product is other seats'
correctness. It may relay ITS PRIME's card with `--for`. **It relays doctrine, it never
authors it**: quote the durable file with its path; if no source says it, that is a
question for the prime, not a lesson for the seat.
