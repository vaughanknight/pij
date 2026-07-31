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
3. **Read-only is enforced by the GATE now, not by the prompt — but know exactly what
   that buys you.** An **UNKNOWN verb is PERMITTED**, deliberately
   (`orchestration/pa-capability.ts:136-142`, verified): *"this gate is a capability
   boundary for a cooperative internal seat, not a security perimeter against an
   adversary… The exhaustive test — not the runtime default — is what keeps the table
   total."* So the gate is read-only against the **classified verb set**, and every future
   unclassified verb defaults **open** until someone updates the table. **You are trusting
   a test, not a wall**, and that should change how close you let a PA get to anything
   dangerous. (Caveat supplied by pij-tense-centipede, which read the source rather than
   accepting my pitch — I had been stating the strong form.) Also check `whoami --json` on
   the live seat: a proof about one layer is not a guarantee about the next.
4. **Day-one scope is zero-actuator**: CI/PR/main watching, your card's staleness, and
   relaying anomaly rows verbatim. Add chores only after the nudge etiquette is proven
   somewhere it cannot annoy anyone.

5. **⚠ VERIFY YOUR INSTRUMENTS CAN SEE ANYTHING BEFORE ASSIGNING CHORE 1.** Chore 1 is
   described as "fully mechanical and self-verifying" and is in fact **the least portable
   chore in this file** — it assumes CI exists. Found independently, within an hour, by
   two governments: **voxel** (no `.github/workflows`, `gh run list` empty — mastodon's
   #23) and **mini-flight-bag** (no CI, no pre-commit, no PR flow; landing is
   direct-to-main under a baton). In those repos `gh pr checks` and `gh run list` return
   **nothing**, and *a PA reading nothing as green commits rule 1's exact error on its
   first sweep* — the chore chosen for being mechanical is the one that fails silently
   where the instrument is absent.
   Also seen: an open PR can read `mergeable: UNKNOWN`, which is **GitHub not having
   computed it yet**, not a conflict.
   **So: probe the instruments first, and if a surface does not exist, tell the PA that
   `not-probeable` is the correct answer for it — never "clean".** In a repo with no CI,
   a PA is carried almost entirely by anomaly relay and card chasing, which is a fair
   test of the concept but a different one.

## Tier — and the rollout as a designed comparison

The concept was designed for a cheap fast model. **Record tier AND effort for every PA, or
the comparison is uninterpretable** (mastodon's point, and it is right).

| Prime | PA | Tier | Effort | What it isolates |
|---|---|---|---|---|
| albatross (pij) | `missing-anaconda` | copilot-backed | — | the SHAPE of the concept, not the tier |
| roadrunner (chainglass) | live | gemini-3.6-flash | *(pending — asked)* | the PREMISE: does a flash seat hold the ten rules |
| mastodon (voxel) | `major-gazelle` | gemini-3.6-flash | medium | **controlled**: same tier, harder load — 12 seats, 82 tracked items, 134 numbered doctrine rules to quote and never author |
| meadowlark (harness-engineering) | `statutory-seahorse` | gemini-3.6-flash | *(copilot-backed)* | **doubles the flash sample** on the open question rather than adding to the settled one |
| tense-centipede (mini-flight-bag) | proposed | *(tbd)* | *(tbd)* | the LOW-ACTIVITY edge: no CI, no PR flow, carried by anomaly relay + card chasing alone |

Mastodon's reasoning for deliberately matching roadrunner's tier is the best experimental
design in the set and should be preserved: *one flash data point cannot separate "flash
holds the ten rules" from "flash holds the ten rules on a quiet government."* If it holds
at both chainglass and voxel, the premise is real; if it holds at chainglass and slips at
voxel, **the boundary is load, not tier** — which no other pairing currently in flight can
tell us.

## Standing constraints (unchanged)

Cards: a PA owes none of its own (Jordan, 2026-07-31) — its product is other seats'
correctness. It may relay ITS PRIME's card with `--for`. **It relays doctrine, it never
authors it**: quote the durable file with its path; if no source says it, that is a
question for the prime, not a lesson for the seat.
