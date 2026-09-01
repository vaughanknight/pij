# Plan 114 close-out — `/pij ready` on the Rust system

PM: `pij-printed-peafowl`. Coders: `pij-long-wombat` (u-route + seam),
`pij-fine-unaha` (u-report), `pij-casual-possum` (u-identity),
`pij-loyal-roadrunner` (u-readback). Cross-model reviewer:
`pij-outstanding-genar` (gpt-5.6-terra). o-prime: `pij-dominant-vicuna`.

## What shipped

A generation-aware `pij` CLI. One command, an explicit **data** route table, five
routed verbs (`adopt` `whoami` `phonehome` `report` `state`), a deny list, and
nine named outcomes where the contract asked for three. Nothing downstream learnt
a second binary name: **zero files changed under `skills/` or `.claude/`**.

In rs: `adopt` (rs mints the id), `whoami`, `phonehome`, the `report` family, and
`state` with the card read-back.

**The wire is witnessed.** Caller context crosses and is *read*: `whoami` resolves
from the forwarded pane, and an asserted id contradicting an observable pane is
**refused** — naming both ids rather than answering for either. That single call
proves derive-don't-assert and refusal-reaches-the-operator at once, and it caught
the plan's own headline risk (RISK 1, split-brain identity) occurring unstaged, by
accident, in a coder's test rig.

## Named gaps — open, not hidden

| gap | where it lives |
|---|---|
| Paneless admission — rs refuses it outright; a designed evidence rule is owed | req-0015 |
| Routed `--json` unavailable for five verbs on an rs-resident seat (refusal, not projection) | follow-up: rs supplies the TS shape as it already supplies `line` |
| rs labels its own envelopes `"pij tail"` — a false friend a routing deny list cannot reach | req-0016 |
| `tsc --noEmit` excludes `**/*.test.ts` repo-wide | req-0014 |
| `npm-resolution-policy` red and pre-existing (npm 11.5.1 vs `.npmrc min-release-age`) | shipping red and named, by Jordan's ruling |
| ac-1141 stage B — post-merge deploy witness on canonical | o-prime, fresh seat |
| One unexplained `local-path-check` failure, 1 of 6 runs, never reproduced | recorded as unexplained, not downgraded to "flake" |

## The defect this plan was really about

**Five instances of one shape**: two sides each testing their own half of a seam,
both suites green, the wire dead between them.

1. **Caller wire keys** — TS sent camelCase, Rust accepted SCREAMING_SNAKE.
2. **Route paths** — the table named `/v1/report/<leaf>`; rs registers `/v1/report`.
3. **Two `CallerContext` structs** for one wire object.
4. **`--json` bypassing the renderer contract** — raw rs payload under the CLI's flag.
5. **Missing renderers on every routed row** — `grep -c 'render:'` returned **0**.

Three were found by running the real CLI against a real daemon. One was found by
composition. One was found by an independent reader who did not share the PM's
assumptions. **None was found by reading the code that contained it.**

## Instrument failures, kept legible

These are the plan's most reusable output, so they are recorded rather than tidied.

- **I signed off ac-1143 having checked the outcomes existed, not that the third
  was reachable.** It could not fire: the production call site supplied none of
  the deps. Amended my own composition receipt rather than letting it stand.
  → *does the production call site supply what this guard needs?*
- **I distributed a wire contract as prose**, flattening a `(env name, wire name)`
  pair to its left element. The `procStart` fingerprint proved it: the one key I
  spelled in camelCase is the one key the reader got right. A contract distributed
  as prose has one definition per reader, each self-consistent.
- **I wrote "`--json` still wins" into the PR as a safety property.** It was the
  hole. A renderer contract that exempts the machine path protects the reader who
  can *see* something is wrong and abandons the parser that cannot.
- **I ruled bilaterally on a shared seam**, so u-report re-derived a finding I
  already held. A second seat re-deriving your finding is a broadcast you owed it.
- **I forbade a mechanism, broadcast it to four seats, and shipped a second path
  to it** (F005). The shim was the first caller to notice a claim was accepted as
  evidence, not the cause.
- **I gave the reviewer my own worktree**, and **echoed my local HEAD as proof of
  a push**. The reviewer caught both by *measuring* me rather than reading my
  message. A discipline you enforce outward is not one you have applied to
  yourself — the enforcing feels like the practising.
- **My first two injections did not compile**, producing empty output that greps
  identically to "no failures". A non-compiling injection is not a passing guard.

Four coders returned real contract flaws, two of which were mine, every one raised
at the seam before building. The cross-model reviewer returned REJECT on five HIGH
findings — including the fourth seam and a rule I had written myself — and its
verdict arrived after a merge that was gated on the PM's defects and not on the
reviewer's verdict. That sequencing is fixed as policy.

## What the operator gets

Jordan types `/pij ready` in a fresh tmux seat and lands in the rs store, with the
skill unmodified. Stage A is witnessed under a per-seat `pij`-entry override —
*the skill is unmodified; the `pij` resolution is overridden*, which is not
"unmodified environment", and it is recorded in those words. Stage B is the real
gesture on canonical, and it is deliberately not ours to claim.

## The last instance — the defect, in the act of shipping its own fix

After the reviewer's REJECT, PR #336 was merged early and then reverted. The
branch kept moving correctly and I kept verifying it correctly:
`git ls-remote origin s114/ready-on-rs` = `783555a8`, divergence `0 0` — all true.
Meanwhile the PR had been **merged and closed at 03:40**, frozen at `baeef4d8`.
Four of my actions over several hours — a retitle, an APPROVE comment, a scope
note, a close-out link — landed on a closed pull request. `ls-remote` verifies the
BRANCH; it is silent about the PR. **The earlier failure was checking the wrong
source; this one was checking the right source about the wrong object, which is
harder to catch precisely because the verification is impeccable.**

Then the number that ends this plan properly. A plain re-merge of the branch would
have carried:

> **7 commits — all five review fixes and the docs — and ZERO routing code.**

The original work was already an ancestor of `main` and the revert stood, so every
reverted file would have stayed reverted. Clean merge. Green CI. Feature absent.

That is the exact defect this plan spent itself documenting — every surface
reporting success over an effect that did not land — occurring one layer above the
code, in the act of shipping the fix for it, to the two people most primed to
catch it. It was caught by noticing that a verification answered a different
question than the one being asked.

Re-landing requires reverting the revert and merging on top, so the original work
and the fixes arrive together as a real diff. A bare re-merge would have shipped
nothing, loudly reported as success.
