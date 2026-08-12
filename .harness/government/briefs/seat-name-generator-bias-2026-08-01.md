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

## ~~The likely cause~~ — MY HYPOTHESIS WAS WRONG, AND IT WOULD HAVE MISDIRECTED THE FIX

I filed *"`able` is alphabetically first, so suspect an index-0 bias in the draw."* **Measured
and false.** Over 3,000 fresh seeds the first-attempt adjective distribution does not favour
`able` at all — it never appears in the top six.

**Recorded because it is this file's own lesson landing on its author**: the artifact (one
over-represented value that sorts first) supported a plausible model, and the model was wrong.
*"I had the artifact and I inferred the algorithm from it."*

## THE ACTUAL CAUSE — a wraparound, proven by walking the probe (verified 2026-08-01)

`memorable-id.ts` lays out one flat index space: **the adjective×noun grid first
(`PAIR_SPACE ≈ 495k`), with ~42 `SHIP_NAMES` appended AFTER it.** Roughly 1 seat in 30 seeds
onto a ship (`fnv1a(seed) % SHIP_NAME_EVERY === 0`). Collisions resolve by **linear probing**:
`idAt((start + attempt) % MEMORABLE_PIJ_ID_SPACE)`.

**So a ship-seeded spawn whose ship is taken walks through the remaining ships, runs off the end
of the space, and WRAPS TO INDEX 0 — which is `adjectives[0] = "able"` paired with `nouns[0]`.**
It then walks the noun axis alphabetically, because `index = adjectiveIndex * nouns.length +
nounIndex`, so `+1` holds the adjective and advances the noun.

Measured walk on a real ship-seeded seed:

```
attempt  0 = pij-xenophobe          ← ship
attempt  1 = pij-gunboat-diplomat   ← ship
attempt  2 = pij-zealot             ← ship
attempt 40 = pij-able-bandicoot     ← WRAPPED to index 0
attempt 41 = pij-able-barnacle
attempt 42 = pij-able-barracuda
```

**The ship names were exhausted long ago, so every ship-seeded spawn now lands in the `able-`
block and fills it alphabetically.** The registry corroborates: the live `able-*` seats are
*consecutive nouns* — `hawk, hedgehog, heron, herring, hippopotamus, hookworm, hornet, horse,
hoverfly, hummingbird, hyena, iguana, impala, jackal, jaguar, jay` — which is a probe run, not a
random draw. 163 names is about how far `jay` sits into an alphabetical noun list.

## Fix shape

**One line, at the wrap**: when the probe runs off the end of the ship region it must wrap to a
**hashed** position rather than to slot 0 — or ships should be excluded from the probe path
entirely (seed onto a ship, and on collision fall back into the pair space at a hashed index).

**Verify by distribution, not by reading the code**: generate N names against a registry with
the ships pre-taken and assert no adjective exceeds a threshold. That test cannot be silently
broken by a future author, unlike an implementation review — and it would have caught this.

## SECOND, SEPARATE DEFECT found while measuring (not the cause of `able`)

**The initial adjective draw is badly non-uniform.** Over 3,000 seeds, six adjectives took
**28%** of all pair-starts (`marked` 148, `breakable` 148, `forthcoming` 132, `interior` 132,
`unconscious` 131, `dizzy` 116) against an expected ~2.5 each across ~1,177 adjectives. That is
the seeded draw in `unique-names-generator`, not pij's probing, and **it does not produce the
`able` cluster** — `able` is absent from that list.

Filed separately rather than bundled, because fixing the wrap will not touch it and a combined
report would let one fix look like it closed both.
