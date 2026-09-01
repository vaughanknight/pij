# Reviewer packet — plan 114 (cross-model)

You are the plan-114 REVIEWER. PM: `pij-printed-peafowl`.
Reply: `pij send pij-printed-peafowl --body-file <path>` (a double-quoted body is
expanded by YOUR shell first, so backticks and $( ) execute — always use a file).

You are cross-model from every coder AND from the PM on purpose: the PM composed
this branch, so **the PM is inside the blast radius** and its judgement is part
of what you are reviewing.

## Read first
- `docs/plans/114-ready-on-rs/plan.dd.md` (ACs), `impl-guide.dd.md`
- `assets/composition-wave1.md` — INCLUDING its amendment where the PM corrects
  its own sign-off of ac-1143
- `assets/pm-ack-objections.md`, the per-unit receipts and seam findings
- The full diff: `git diff origin/main...HEAD`

## Review in THIS priority order (from the impl guide)
1. Can a seat end up half-registered across two generations, or be silently
   re-homed?
2. Does an rs ERROR ever fall back and mask a defect? (not-implemented falls
   back; errored must not)
3. Does any caller asking for a transcript get the event stream? (`tail`)
4. Do the report shapes actually match what callers type today — **verified
   against the TS source, not against any packet**?
5. Does a print-only `adopt` success exist anywhere?
6. Is the route table truly data, or has per-verb logic leaked into dispatch?

## What this plan kept getting wrong — hunt for a FOURTH instance

Three times, two sides each tested their own half of a seam and the wire was dead
between them, with BOTH suites green:
- caller keys: TS asserted camelCase, Rust asserted SCREAMING_SNAKE
- route paths: the table named `/v1/report/<leaf>`, rs registered only `/v1/report`
- two `CallerContext` structs for one wire object

**Look for another.** The signature: a value crossing the TS/Rust boundary by
literal, where each side's test constructs its own copy. Nothing that only reads
one side can find it.

## Specific things to attack
- **The guards themselves.** Several are injection-proven; re-derive the
  injection from each test's NAME and check the name is not over-claiming.
  A guard that has only ever been seen to pass is a claim, not a witness.
- `deny`-list vs route table precedence, and whether `tail` can be routed by any
  path including a forced generation.
- The fixture round-trip: can either half pass vacuously?
- Whether any refusal can reach the shim as a BARE 404 (it would be classified as
  route-absence and silently re-home the seat).
- The PM's `CallerContext` unification: it took the richer struct and dropped the
  poorer one's alias. Look for anything else that de-duplication lost.

## Known-open — do NOT re-report these, but DO check they are honestly stated
1. ac-1141 closes in two stages; stage B is post-merge and o-prime's.
2. Paneless seats stay on legacy (req-0015).
3. `tsc --noEmit` excludes `**/*.test.ts` (req-0014).
4. `npm-resolution-policy.integration.test.ts` is red and pre-existing
   (npm 11.5.1 vs `.npmrc min-release-age`, last touched a52ae36a).
5. rs labels its own envelopes `"pij tail"` (`main.rs:909`) — recorded as
   req-0016, deliberately not fixed here.
6. One unexplained single failure of `local-path-check.test.ts`, not reproduced.

## Verdict
Persist to `docs/plans/114-ready-on-rs/assets/reviews/review-<yourid>.md` on a
branch, push, and send me the path. State APPROVE / APPROVE-WITH-FINDINGS /
REJECT plainly, and rank findings by whether they DEGRADE A CONTROL (highest) vs
merely obscure information. Cite file:line for everything. If you find nothing in
a category, say so rather than padding.
