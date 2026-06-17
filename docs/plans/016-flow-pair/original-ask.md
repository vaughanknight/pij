# Original ask — flow-pair
**Captured**: 2026-06-17T07:54:21Z  ·  **By**: /the-flow

> okay so you get the mission, we're goign to build a a skill, then experiement
> wiht some real work? skill will evolve. We have decisions to make sure, but
> sson we will fire up the-flow and get all that sorted. we can even try it out
> as we build, work with our partner.

**Design source**: `scratch/paste/20260617T074841.md` — "Design Dossier: `pij`
Orchestrator/Worker Flow Wrapper" (working name `flow-pair`). The dossier is the
authoritative design input; this flow plans its first shippable version.

**One-line intent**: Build `flow-pair` — a two-session orchestrator/worker
wrapper around `the-flow`. An expensive orchestrator session drives flow
routing, bounded delegation, review, and validation; a cheap worker session
executes scoped packets in a target repo; a central `pij` ledger records runs,
prompts, diffs, reviews, and cluster-isolated prompt-learnings.
