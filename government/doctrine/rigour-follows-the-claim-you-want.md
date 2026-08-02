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

## Related

`a-baseline-stores-a-point-not-a-path.md` (same pair, same evening),
`preconditions-travel-with-remedies.md`.
