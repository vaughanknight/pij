# Composition receipt — wave 1 (u-route), plan 114

Composed by PM `pij-printed-peafowl` on `s114/ready-on-rs`.
Merged `s114/u-route` @ `d451bc5e` as `6df409cc` (--no-ff), plus `b0f3740b`
(.gitignore for per-worktree `.cargo-target/`, taken on the integration branch so
no wave branch touches a shared file).

## What I re-derived rather than accepted

The coder's receipt was detailed and, where I checked it, accurate. I checked the
load-bearing claims anyway; a receipt is a claim, not evidence.

| claim | how I checked it | result |
|---|---|---|
| dispatcher has no per-verb logic | read `cli.ts:4610-4611` — deny scan then table lookup, short-circuited; no verb named | CONFIRMED data-driven |
| deny test is non-vacuous | read it: puts `tail` IN the route table and asserts `legacy-denied`, and again under `force:"rs"` | CONFIRMED — deleting the deny list fails there and only there |
| the no-credentials message fix landed | `generation-routing.ts:257` carries the ambiguity wording | CONFIRMED |
| the negative assertion exists | first grep MISSED it (wrong file); found in `generation-router.test.ts` | CONFIRMED — my check was mis-aimed, not the claim |
| ac-1146 arm A | `git diff --name-only main...HEAD` filtered to `skills/` + `.claude/` | 0 files |
| ac-1146 arm B | re-hashed the installed tree myself, twice | `04e9a319…`, 32 files, canonical HEAD `49f57a51` unchanged |
| the 1 TS failure is pre-existing | root cause, NOT the coder's say-so: `.npmrc` sets `min-release-age=7`; npm 11.5.1 warns "Unknown project config" on every call; test last touched `a52ae36a` | CONFIRMED not ours |

## Gate — on the MERGED tree, not the coder's branch

```
pij-gate verdict
  toolchain PASS   lock PASS   fmt PASS
  clippy    PASS   test PASS   arch PASS  (9 crates, 0 violations)
pij-gate: all stages green
BARE_GATE_EXIT=0
```
I first read that exit code through a pipe — which is the exact laundering trap
I had warned the coder about in its own packet. Re-read it bare (redirect, not
pipe) before recording it. Recording the slip because a receipt that quoted the
laundered status would have been reporting `tail`'s exit, not the gate's.

TS suite: **4525 passed, 1 failed, 19 skipped (233 files)**, `BARE_VITEST_EXIT=1`.
The single failure is `npm-resolution-policy.integration.test.ts`, pre-existing
and environmental (see table). It was run in the coder's worktree because the
integration worktree has no `node_modules`; the delta between the two trees is
`.gitignore` and docs only — no source — so the result transfers. Stating that
rather than implying I ran it on the composed tree.

## What is GREEN and what is still RED

GREEN at wave 1's own altitude: the five ready-gesture verbs are now OFFERED to
rs, and every outcome is NAMED — nine of them, where the contract required three.
`tail` is denied even if rs advertises it.

**STILL RED, deliberately: ac-1141's end-to-end arm.** A seat cannot yet land in
the rs store, because rs has no adopt endpoint and no minter reachable from
register. Making it green in wave 1 would have required minting the seat id in
the shim — which ac-1147 forbids and which is the headline split-brain. The coder
refused to do that and said so plainly. **Nothing in this receipt should be read
onto ac-1141.** u-identity closes it.

## Contract flaws found by the executing seat (three)

- **F1** — my own O7 claim ("the installed tree is outside this repo") was FALSE;
  it resolves to `pij/skills/pij`, a tracked path. I resolved one symlink hop and
  asserted the conclusion. The two ac-1146 arms are therefore not independent —
  they prove different claims (arm A: no coder edited the skill; arm B: nothing
  else changed it during the witness).
- **F2** — the packet's red witness was unreachable in wave 1. Corrected in the
  build, not papered over.
- **F3** — my binding 401 ruling would have broken the fleet. "Key present and
  refused" and "no key at all" reached the detector as one exception; implementing
  my rule strictly took the suite from green to 8 failures. A seat with no rs
  credential could never have registered into rs, so legacy is where it has always
  lived. I had reasoned from the only path I had seen and made it binding anyway.
  The coder told me instead of quietly softening it.

## AMENDMENT — I MIS-VERIFIED ac-1143

Recorded 2026-09-01, after wave-2 coders read the seam I had already signed off.

Above I recorded nine named outcomes as satisfying ac-1143. That check was
**incomplete and I am correcting it rather than leaving it standing.** I verified
the outcomes EXISTED and were DISTINGUISHABLE. I never verified the third one was
REACHABLE from the CLI entry point. It is not.

`defaultRouterDeps()` (`generation-router.ts:48`) returns only
`{ fetch, readFile, env, home }`. `cli.ts:4615` calls `routeVerb` with no deps.
`decidePreCall`'s follow-the-seat guard needs `ambientSeatId`, `seatInLegacy` and
`seatInRs`, so **`legacy-seat-followed` cannot fire for anything an operator can
type.** Its only exercise is `generation-router.test.ts:233`, which hands the deps
in. ac-1143's third outcome — the one oq-1141 was ruled to produce — does not
exist in production.

Found by u-report's coder (F1), corroborated by u-readback (S2). It is free today
only because no rs handler exists: every routed verb hits an absent axum route and
lands on `legacy-rs-not-implemented`, which is accidentally right for every seat.
It becomes fleet-breaking the day `/v1/report` matches.

**The lesson against my own name:** a guard that is declared, tested, and
unreachable reads as coverage — the computed-but-unconsulted costume, and I had
cited that exact pattern at others twice in this same session before walking into
it. Verifying that a mechanism EXISTS is not verifying it is WIRED. The
distinguishing question I skipped is one command: does the production call site
supply what the guard needs?

ac-1143 is therefore **NOT satisfied by wave 1** and is reopened. It is item 4 of
the seam unit now in flight.

## Open, not closed

1. `tsc --noEmit` excludes `**/*.test.ts` repo-wide — ~730 lines of new test code
   were never typechecked. A green typecheck here does not cover tests.
2. `npm-resolution-policy` will be red in CI until npm understands
   `min-release-age`. Machine-wide npm upgrade; escalated, not taken.
3. No-credentials arm cannot distinguish "never registered" from "credential
   lost". Stated in the message rather than resolved; closing it needs an rs-side
   signal — a wave-2 candidate, not claimed.
