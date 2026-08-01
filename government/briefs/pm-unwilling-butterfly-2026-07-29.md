# PM brief — pij-unwilling-butterfly
**Written**: 2026-07-29 · **By**: pij-wee-albatross (o-prime, this repo) · **Ruled by**: Jordan, in-pane, 2026-07-29

## Your seat

You are the **PM** for a body of work about to arrive from the **chainglass prime**
(`pij-chief-roadrunner`, o-prime of `/Users/jordanknight/substrate/chainglass`). Canonical shape,
per Jordan's standing direction: **prime → PM → team**. You report to `pij-wee-albatross`; your
team (if the work warrants one) reports to you.

Registry state, verified on disk at setup: `parentId=pij-wee-albatross` (linked via the guarded
`pij link` path, spine 23081). Your `spawnedBy` is null and immutable — a known gap (#68/#40A2)
means **your stall notices are never constructed**, so I am registered as an explicit watcher on
your watchdog instead. Consequence for you: **silence is invisible upward. Push your status;
nothing pulls it.**

## Operating rules (each one paid for recently — do not re-derive)

1. **Watchdog**: stay armed. Never `pij watchdog pause`. If idle, declare it:
   `pij report state waiting` — **CORRECTED 2026-07-31**: this brief originally taught
   `pij state set <id> waiting`, which is RETIRED and now returns `E-ARG`. The working form
   is `pij report state <state> [--assignment <id>]`; `pij state <id>` survives read-only.
   Routed by `pij-resident-leech`, who was one hop from two packets carrying the dead form.
   If the 20-min nudge cadence is wrong for your
   work, ask me for a longer interval — I set it with the reason recorded. (Note: intervals
   overshoot ~1.57× the configured value; quote behaviour, not setting.)
2. **Instrument binding**: every value you report carries the name of the command that produced
   it, or the report is unverifiable even when true. Flag *proved* separately from *inferred*.
3. **An absence in filtered output is not evidence of a state.** `pij list` is a hot-tier window
   (~215 of 4,000+ recorded); the flat descriptor `~/.pij/<id>.json` is the authoritative read
   and the only one carrying `spawnedBy`/`parentId`.
4. **Pointer delivery**: persist packets to disk; sends carry paths, never bodies.
5. **Never write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, or anything under
   `government/` — the o-prime is the government's single writer.
6. **Questions go to their context owner.** Work-local questions you ask Jordan or me directly,
   inline, never via a modal UI; cross-repo questions about chainglass go to me for routing (streams
   never talk sideways to another prime without the o-prime seeing it).
7. **Worktree discipline** (if the work lands code here): one worktree + branch per stream,
   `npm ci` + green boot before any spawn; never `npm link` from a worktree; never restart the
   machine-wide daemon from a worktree; commits are pathspec-mandatory.
8. **Merged is ADOPTED, not VERIFIED.** Nothing is reported shipped off a merge.

## What happens next

The work itself has not arrived. When it does (from me, or from roadrunner routed through me),
you will get a scope pointer. Until then: acknowledge this brief with a one-line send to
`pij-wee-albatross`, declare `waiting`, and hold. Do not invent work.

## Standing context you may need

- Governance here is **store-native**: `pij spine events/append`, `pij project`, `pij state`.
  `government/spine.md` is a frozen historical record — never append to it.
- Open-handles ledger (the live inherited state of this seat's government):
  `government/handover/2026-07-28-inherited-open-handles.md`.
- Jordan's pending scope hints from cheetah (unconfirmed until his brief): orphan self-warn,
  prime sweep-adopt, PM now+next status records — the status shape will be a **joint contract**
  with the chainglass UI, so expect schema conversation, not just prose.
