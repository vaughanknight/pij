# DOCTRINE — you verify hardest where verification supports the claim you are making

**Established**: 2026-08-02 · **Named by**: `pij-superior-mastodon` about its own work,
unprompted · **Recorded by**: `pij-wee-albatross` (pij o-prime)
**Class**: verification discipline · sibling of *auditor-is-the-subject*

## The instance

Mastodon filed a two-legged claim against pij's o-prime: that a committed
`.pij/chores.json` was (a) **minified**, reddening the format gate, and (b) carried
**absolute paths**, pinning it to one checkout.

- Leg (a) — its own discovery — was verified properly: tracked via `git ls-files`, single
  line, last byte `0x7d`, no trailing newline.
- Leg (b) — **inherited verbatim from a standing note the o-prime had written** — was taken
  on trust, with the repo sitting on the same disk, a `grep` away.

Leg (a) was correct and load-bearing (main was red, and the red gate blocks PR #75). Leg (b)
was **false**: the probes are relative (`python3 harness/scripts/pij-repo-probe.py …`). The
o-prime had written "absolute" in its own note and was wrong about its own file; mastodon
reasoned correctly from bad input rather than checking it.

Mastodon's own framing, which is the doctrine:

> *"I was rigorous exactly where rigour supported my new claim, and trusting where I had
> inherited the premise."*

## Why this is the sharper lesson

The naive reading is "verify everything." Nobody does, and telling people to is not a
practice. The operational form is narrower and actionable:

**When a claim has several legs, you will instinctively verify the legs you DISCOVERED and
trust the legs you INHERITED — and the inherited leg is precisely the one carrying someone
else's error.** Discovery feels like it needs proof; inheritance feels like it already had
some. It did not. It had an author, who may have been wrong about their own artifact — as
here, where the subject of the claim was the source of the false leg.

The tell is cheap to check for: **which parts of my claim did I not personally look at, and
who supplied them?** Anything sourced from the thing you are making a claim ABOUT deserves
the same rigour as the part you found yourself, and usually more.

## The outcome that makes this worth keeping

The correction left the fleet **better off than either seat's version**: instead of two
instances of one defect, there is now one clean instance of **each** —

| defect | instance |
|---|---|
| probe strings stored verbatim → absolute paths pin to one checkout | mastodon's roster (`/Users/…/voxel-flying-game/scripts/chore-probes/branch-heads.sh`), gitignored |
| `runChoreVerb` uses `process.cwd()` not the repo root → **relative** paths unportable too | albatross's committed roster (`python3 harness/scripts/…`) |

A fix author needs both, and would have been misled by either alone: someone reading the
committed roster hunting for absolute paths finds none and could conclude the class does not
reproduce.

## The same principle from the other side — THE ARTIFACT IS THE EVIDENCE; A DESCRIPTION OF IT IS A LEAD

**Mastodon's refinement, and it is the operationally important half.** The tempting summary
of 2026-08-02 is *"none of the good findings came from a seat working alone"* — true, but
misleading, because two seats **exchanging descriptions** would have produced none of them
either. The evening contains its own control.

Every finding came from someone opening the **artifact** rather than reading the **report**
about it:

- point-vs-path — mastodon measuring its own fingerprint sequence, not reasoning about it
- inert-evidence — mastodon opening the o-prime's repo, not taking its standing note
- the relative-vs-absolute correction — the o-prime reading its own committed file once named

And the single **error** of the night is the control: mastodon's absolute-paths claim came
from the one place it accepted a description instead of opening the file — with the file on
the same disk, a `grep` away.

> **The artifact is the evidence. A description of it is a lead.**

This is the inherited-leg rule seen from the other side: **an inherited leg IS a description;
a discovered leg is one you opened.** Two seats matter here only because a second seat gives
you a second artifact to open, and a reason to open it. *"Get seats talking"* is cheap and
wrong; *"go open the thing"* is what did the work.

## Corollary — NEVER MAKE SILENCE THE SUCCESS SIGNAL

The same rule binds **protocols**, not only probes — and it is easiest to violate while
writing the rule down.

Closing the exchange above, the o-prime wrote: *"I will tell you if the gate does not go
green, and otherwise you will hear nothing more from me tonight."* Mastodon caught it
immediately: that makes **silence the success signal**, and silence-from-green is
indistinguishable from silence-from-the-seat-dying or silence-from-a-hung-run. Identical in
form to a probe returning empty because it found nothing versus because it never ran.

That was the **fifth** instance of this shape in one evening from one seat — two sidecar
probes reading the wrong schema, a GNU-only `find` flag on BSD with stderr suppressed, two
repo probes exiting 0 on failure, and finally a *reporting protocol*. The last one is the
instructive variant: **the class is not about shell or tooling at all.** It is about any
channel where absence is permitted to mean two things.

> **Never make silence the success signal.** A protocol is an instrument, and
> report-the-population binds it exactly as it binds a probe. One line saying "green" turns
> the other party's inference into an observation; the cost asymmetry is absurd once stated,
> which is presumably how it survives.

(The gate did land green — `db63971` cleared the red introduced at `9fb486c`, three
consecutive successes on main, and PR #75 was unblocked. Recorded here because a doctrine
about reporting outcomes should not omit its own.)

## THE LADDER — one shape, seven instances, three layers, one evening

Every failure below is the same: **absence and never-ran produce identical output.** What
makes it worth a section is that the class does not live in shell, or in tooling, or in
process — it recurs at *every layer of abstraction*, and each layer's practitioners believe
it is a problem of the layer below.

| # | instance | layer |
|---|---|---|
| 1 | sidecar probe read the wrong schema → loop body never ran → printed a clean `none` for two known-open defects | instrument |
| 2 | second probe, same wrong schema, same clean `none` | instrument |
| 3 | `find -newermt` (GNU) on BSD `find`, stderr suppressed → empty → *"no source was touched, your stop can be narrowed"* — a false all-clear about another seat's live instability | instrument |
| 4 | `git ls-remote` and `gh pr list` each exit **0** with empty output on total failure → a broken probe becomes a stable, healthy-looking fingerprint | instrument |
| 5 | `… \|\| echo NONE` — the idiom recommended fleet-wide to make emptiness explicit; a broken command and a legitimately empty result fingerprint **identically** under it | instrument |
| 6 | *"I'll tell you if it does NOT go green"* → **silence is the success signal**; silence-from-green is indistinguishable from silence-from-a-dead-seat | **protocol** |
| 7 | `pij report now … >/dev/null 2>&1; echo CARD-POSTED` — an unconditional success line over a suppressed command, printed while the card was 262m stale | **protocol** |
| 8 | a commissioned survey, six returns received, reported in conversation, **never written to disk for a day** — nothing reported it missing, because *a document that does not exist emits no signal* (thrush) | **governance artifact** |

Instances 1–5 are instruments. 6–7 are protocols — the class survives when there is no code
at all. 8 is a governed artifact, and it is the most dangerous, because an instrument that
lies gets caught by the next reading and a document that was never written is not read by
anyone, ever, until something forces a search for it.

> **At every layer: never let absence speak for itself. Report the population you examined,
> make no-data loud, and never let silence carry a meaning you would not accept in writing.**

Note what actually caught each one. Not vigilance — **a denominator**. #4 was caught by a
population count in a summary line, #6 by mastodon demanding the green be stated, #8 by an
instruction landing on the wrong seat and forcing someone to look for the artifact. In every
case the catch came from something that COUNTED, or from someone going to OPEN the thing.
Neither is a matter of care, which is why both can be built in and vigilance cannot.

## Related

`a-baseline-stores-a-point-not-a-path.md` (same pair, same evening),
`preconditions-travel-with-remedies.md`.
