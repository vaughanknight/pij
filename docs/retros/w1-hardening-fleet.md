# Retro — wave 1 `w1-hardening`, an eight-stream parallel fleet

**Seat**: `pij-continuing-ermine` (o-prime) · **Streams**: s092–s100 · **2026-08-08**

> **The findings are not here.** They are in [`docs/how/fleet/`](../how/fleet/) — this file exists
> so the retro ledger points at them, because a wave that records nothing here reads as a wave that
> did not happen.

## What ran

Eight PM seats, each in its own worktree, each fixing a bounded slice of open issues autonomously to
a green PR. Simultaneously **real work** and a **POC for a future `pij fleet` verb**.

**Merged**: #177 (s092), #184 (s098), #190 (s096), #191 (s093), #198 (s097), #199 (s094), #200
(s095), #209 (s100) — plus #186, #189, #201, #202, #203, #205, #206.
**Issues filed**: ~25, including #187, #188, #192–#196, #204, #207, #208, #210, #211.

## Magic wand

**The self-improvement loop fired and was never collected** — which is worse than not firing, and
is a correction to this file's own first draft.

- `docs/retros/`, `docs/difficulties.md`, `docs/velocity.md`: **no wave-1 entries** until this
  commit. Everything went into a living docs PR instead — better than nothing, and **not** the
  contract.
- One stream's **reviewer filed a structured retro after every single round — eight of them,
  unprompted** — into `.harness/records/retro/`, a **tracked path**. **None was ever committed.**
  They sat untracked in a worktree for the whole stream and would have died with it.

> **The coder reported filing no retros and was believed. The reviewer filed eight and nobody
> asked. The difference was never visible from the dispatch side.**

Caught only because `git status` showed an untracked directory during PR cleanup — **luck, not
method**, for the third time in one day.

> The prime spent the wave enforcing evidence discipline on eight streams and did not notice its own
> ledger obligation was unmet. **A rule you are enforcing is a rule you stop reading.**

**Encodable**: a peer's retro directory belongs on the close-out checklist, not to be *noticed*.
Ask what a peer **wrote** as well as what it **discarded** — *the discard question needs a person;
the wrote question needs an `ls`*, and only the expensive one was specified.

## The wave's through-line

> **Two individually-correct rules whose intersection has no owner.**

Its sharpest form, which unifies the code findings with the process ones:

> **A probe placed upstream of the event it claims to detect can never return the contrary answer.**

## Difficulties worth the ledger

- **Discards die at compaction, not at reap.** A peer summarising itself keeps its *findings* and
  drops its *discards* — precisely what the harvest question exists to recover. Four of the wave's
  best findings came from discards; none would have survived a compaction. **Every long stream in
  this wave has already lost most of its.**
- **A packet that enumerates commands silently redefines "done".** Ten consecutive packets named a
  narrower gate than `AGENTS.md` does; the coder ran exactly what it was given and reported clean
  every round.
- **Merged PRs did not close their issues** — four across three streams, one of them a security
  issue reading as live while its fix was on `main`.
- **Teardown leaves anomalies standing**, and a dead seat's remediation is addressed to the only
  party that cannot perform it (#196).
- **`pij close` kills a pane it may no longer own** — measured: a dead descriptor sharing a live
  third-party pane (#196).

## Wins

- **The file-ownership partition held across three consecutive merge waves** — zero code conflicts in
  a composition root three streams held granted regions in.
- **Streams corrected the prime more often than the reverse**, and every correction is recorded with
  its original attached.
- **Reviewer-authored mutants** closed the independence-of-mutant gap in practice.
- **A close-out harvest question produced findings on already-merged code** that would otherwise have
  been destroyed with the buffer.
