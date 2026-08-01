# DEFECT — the seat-name generator is heavily biased toward "able-"

**Filed**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij) · **Reported by**: Jordan
**Status**: FILED, NOT STARTED

## The measurement

Across every `pij-<adjective>-<noun>` seat name on this box (hot registry + archive,
**2,026 names**):

| adjective | count |
|---|---|
| **`able`** | **163** |
| `better` | 13 |
| `medieval` | 12 |
| `advanced` | 12 |
| `little` | 11 |
| `common` | 11 |
| `brief` | 11 |
| `zygomorphic` | 10 |
| `yummy` | 10 |
| *(long tail)* | ≤10 |

**`able` is 12.5× the next most common adjective**, and ~8% of every seat ever named. The rest
of the distribution is flat at ≤13, which is what an unbiased draw over a large adjective list
looks like. **One value is an outlier; the tail is healthy.** So this is a defect in the
selection of that one token, not a small vocabulary.

## Why it matters operationally

Not cosmetic. Names are the primary human handle for a seat, and this fleet is already
running ~40 live seats across seven governments:

- **Human disambiguation fails.** `able-jay`, `able-egret`, `able-jellyfish`, `able-hawk`,
  `able-eel`, `able-elk`, `able-heron`, `able-hippopotamus` are all real seats on this box.
  Jordan reads a rail full of `able-*` and cannot tell governments apart at a glance.
- **Prefix search and tab-completion degrade** — `pij ... able-` disambiguates nothing.
- **Transcription and relay errors** get more likely between peers, in exactly the
  copy-a-receipt discipline this government leans on.

## The likely cause (HYPOTHESIS — not verified, no source read yet)

`able` is the **alphabetically first** plausible entry in most English adjective word lists.
A generator that draws with a broken/absent random seed, an off-by-one that biases toward
index 0, or a fallback path that returns the first element on some condition would produce
exactly this signature: **one massively over-represented value that sorts first, and an
otherwise flat tail.**

**Labelled as a hypothesis deliberately.** The distribution is the OBSERVED fact; the
index-0-bias explanation is a model inferred from the artifact, which is the exact error three
seats made tonight (see `doctrine/preconditions-travel-with-remedies.md` — *"I had the artifact
and I inferred the algorithm from it"*).

## How to actually settle it

**Change the input and observe the output**, not reason about the generator's shape: call the
name generator N times in a loop and count the distribution directly. If `able` is ~8% of a
fresh draw, it is a live selection bug; if a fresh draw is flat, the bias is historical and
something else produced it.

## Fix shape

Whatever the cause, **the fix should be verified by distribution, not by reading the code** —
generate 1,000 names, assert no adjective exceeds a threshold. That is a test the next author
cannot silently break, unlike an implementation review.
