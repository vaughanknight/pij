# s074 brief — pij rail v2 · PM: pij-unwilling-butterfly
**Written**: 2026-07-29 · **By**: pij-wee-albatross (o-prime) · **Ruled**: Jordan ("this goes now")
**Source brief**: `/Users/jordanknight/substrate/chainglass/docs/plans/090-pij-rail-v2/albatross-brief.md` — read it and its full pointer set FIRST; this brief does not restate it.

## Mission

Deliver the pij half of the chainglass rail v2 as a cohesive sibling plan: 7 items
(status verb JC-1 · orchestrationRole JC-2 · state-set --note JC-3 · prime-only sweep-adopt ·
PM-keyed watchdog nudge · skill-route automation · optional interstitial persistence).
Chainglass builds behind fake seams; nothing blocks on us; items land in any order.

## The one hard ordering — ratification before code

The three workshop docs (WS-001/002/003, all Contract Ready) are PROPOSED contracts.
**Your first deliverable is a contract review**: per contract, a ratify / amend recommendation
with reasoning, plus your answers to the nine open questions (OQ-2/4/7, Q-11/12/13 + adopt --role,
OPEN-1/4). I verify your analysis, then the ratification verdict goes to chainglass from MY seat
— neither side codes before that. The 089 lesson (folder-vs-cwd, half-shipped HARNESS_PLAN_ID)
is the reason; do not soften it.

## Allocation (recorded before dispatch)

- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s074-pij-rail-v2`
- **Branch**: `s074/pij-rail-v2` · **Base**: main @ `8a63c58`
- **Store**: project `s074-pij-rail-v2` (primeId `pij-wee-albatross`); dispatch on the spine.
- **Boot gate**: typecheck green; suite **3633/3634** — ONE pre-existing red at base, also red on
  canonical main: `cli.integration.test.ts > … top-level help and skill guidance distinguish pull
  from push delivery`. Known baseline, not yours to inherit silently — name it in any gate report.
- **Bootstrap hazard (will bite your fleet)**: `npm ci` is broken machine-wide in worktrees by an
  npm 11.10.0 self-collision — it derives `--before=now-7d` FROM `min-release-age=7` and its own
  git-dep child (minih) rejects the pair. **Never bypass the age policy (#22 ruling).**
  Workaround used and sanctioned: `rsync -a` node_modules from the canonical checkout (same
  lockfile, zero registry interaction). Use the same for any additional worktree.

## Fleet directive (Jordan, verbatim intent)

Copilot **gpt-5.6-sol coders**, **terra reviewers**, via `/pij` (pair route). Canary effort
mechanically — process args are truth, self-reports have lied. Compaction fire-and-forget.

## Constraints and known intersections

- **Item 4 (sweep-adopt) is gated by #35** — your own finding, spine 23097: adopt on dissolved
  seats prints success and writes nothing; the sweep targets exactly that population. Your plan
  must sequence a #35 fix ahead of item 4 or scope item 4 around it explicitly.
- **Item 5 (PM-keyed nudge)**: evidence you should build on is in
  `government/handover/2026-07-28-inherited-open-handles.md` — A.4 (semantic axis invisible to
  BOTH detector paths, reproduced on two seats), interval overshoot 1.57×, watchers[] bypass
  (`watchdog-manager.ts:433`), notice-never-constructed for root seats (`binding.ts:282–334`).
- **Item 1 (status verb)**: you have been dogfooding the exact shape (your pushed now+next
  statuses). Keep doing it; your own friction is contract evidence.
- Work only in the s074 worktree — never the canonical checkout; no daemon restarts from a
  worktree; no `npm link` from a worktree; commits pathspec-mandatory; never write `government/`
  or any `.the-flow-state.json`/`the-flow.json`/`the-flow.md`.
- Plan artifacts live in the worktree under `docs/plans/` per the repo's builder process.

## Reporting

- Push `now/next` status at every start/stop (dogfood of item 1).
- Contract-review deliverable comes back to me as a pointer.
- Reports carry paths + SHAs + gates + observations — never summary-only.
