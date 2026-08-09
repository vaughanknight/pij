# Pre-registered mutation ranking — s097 round 2

**Committed BEFORE the round-2 review runs and before any round-2 mutation result exists.**
Practice adopted from `s096` (`fb61e92`): if you choose your targets after the run, you will
choose the ones that worked.

Author: `pij-annual-lemur` (PM, s097). Round-1 mutations (M1–M6, all RED) are **not** re-listed
here — re-running the author's own list is independence of *runner*, not of *mutant* (`W-602`,
qualifier from `s092`).

---

## Rank 1 — criterion 6, the paused-trigger regression guard

**Target**: the `pausedBy === "compact"` exclusion's *neighbour* — the assertion that
`pausedBy: "self"` still emits.

**Why this is rank 1, and it is not the criterion I care most about.** Following `s096`'s
reasoning, the prime suspect is **the criterion I RECLASSIFIED rather than rewrote**. In my
round-1 recount I relabelled six of ten criteria as *"preserved-property / scope-pin"* and moved
on. **That relabelling felt like diligence and it was the moment I stopped examining them.**

A preserved-property guard passes in both worlds **by design**. So does a vacuous one. **From
reading, those two are indistinguishable** — which is the whole of `W-604`.

This one is the sharpest instance because F-2 *narrowed* an existing row. The claim *"F-2 removed
exactly one case and no more"* rests entirely on a must-stay-green assertion, and a must-stay-green
assertion is precisely where a no-op mutation is **silent** (`W-602`, sharpening from `s094`):
green is the predicted outcome either way, so nothing distinguishes proof from nothing except
evidence the code actually changed.

**Prediction, recorded before the run**: exit `0` (some test goes RED). If it exits `1`, criterion
6 cannot perceive a change to the pause classification and is not evidence of scope containment.

## Rank 2 — the `unknown` bucket's negative criteria (4 and 5)

**Target**: the classification arm that routes an unresolved / `probe-unavailable` watcher to
`unknown`.

**Why**: criteria 4 and 5 are the guard against **fatality-from-nothing**, they are the rules
*I* mandated, and they are both must-stay-green. M3 mutated this arm one way (unknown → gone) and
went RED. **The untested direction is the opposite one**: does anything fail if a *live* watcher
were routed to `unknown`? If not, the "unknown is never gone" tests may be pinning only the
direction that was already interesting.

**Prediction**: exit `0`, but with **fewer** failures than M3 produced.

## Rank 3 — the evidence tuple

**Target**: `evidence: [gone.length, unknown]` → a one-element `[gone.length]`.

**Why**: this is the D2 latch-collision fix, and its test asserts a node that is *both* paused and
dead-recipient delivers **2** alerts. That is the only assertion standing between us and a row
silently swallowed by the sweep's latch. It has never been mutated — round 1 mutated the emit
condition and the classification, never the evidence shape.

**Prediction**: exit `0`, exactly one test RED (the collision pin).

## Rank 4 — the newest test, per `W-604`

**Target**: whatever assertion in `F-1`'s incident-reconstruction test is load-bearing — most
likely the archive-tier fallback, from the *test's* side rather than the production side.

**Why**: `W-604` — *"spend the gate on your newest test, not your most important one."* The F-1
tests were written **in the last hour, under time pressure, to close a reviewer's finding**, and
have been read once by their author and zero times by anyone else. My round-1 tests have three
readings; these have none.

**Note**: M1/M6 already mutated the *production* fallback and this test went RED, so the test is
not wholly vacuous. Rank 4 asks a narrower question — is every *assertion inside it* load-bearing,
or does one carry the test while the others are decoration.

---

## What would change my mind about the fix

Any exit `1` above. **"The mutation applied and every test still passed"** is a machine-checkable
verdict on a **test** — the one artefact in this pipeline that otherwise has none. An exit `1` on
ranks 1–3 means a criterion I have been citing as evidence is not evidence, and the PR's claim
table shrinks accordingly.
