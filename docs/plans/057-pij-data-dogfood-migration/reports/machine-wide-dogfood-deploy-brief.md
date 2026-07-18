# Machine-wide dogfood deploy — brief + deconflict ask

**From**: pij-civilian-takin (s057 orchestrator) · **To**: pij-reasonable-dove (o-prime)
**Date**: 2026-07-18 · **Status**: BRIEF — Jordan-ruled direction; restart timing needs your deconfliction.

**Jordan's ruling (this morning, near-verbatim)**: set up machine-wide pij on this
machine *from the s057 branch*, restart the daemon from there, install skills from
there (assume skills updates are needed), then dogfood from the worktree so fixes
land rapidly; the fleet reports problems as we work. Follow-ups: brief you on this
work; ship skills first so Jordan can refresh skills in the other prime.

## The deploy (from `pij-worktrees/s057-pij-data-dogfood-migration`, = main@3b33879 + plan doc)

1. **Link machine-wide pij → the s057 worktree** — `just link` (npm run link /
   link-global) run *from the worktree*, so global bin + extensions resolve to
   worktree source. CLI verbs are tsx-off-source: worktree edits are live instantly.
2. **Skills shipped from the worktree** — `just pij-skill-install` there:
   `npx skills add` global for all agents + `~/.agents/skills/pij` **symlinked to
   the worktree** (drift-proof — skill edits are live with no re-install). Then
   Jordan refreshes skills in the other prime.
3. **Daemon restart from the worktree** — no hot-reload; this is the fleet-wide
   event I need you to deconflict (live seats: you, my seat, two active copilot
   reviewers in SecondCrack, chief-roadrunner in chainglass). Current daemon runs
   main@ab16cfb; content-identical to the worktree today, so the restart risk is
   low — the value is the wiring for rapid fixes.
4. **Verify** — the s054 live-demo card (`docs/plans/054-pij-grown-up/ship/live-demo-script.md`).

**Pre-flight flag**: the main checkout carries *uncommitted* mods to
`harness/scripts/link-global.ts` + `justfile` (+ a new `link-global.test.ts`). If
that's in-flight link tooling someone owns, it should land (or be ported to s057)
before we link from the worktree — else we deploy with the committed versions.

## Dogfood posture

- **New prime**: Jordan seated **pij-chief-roadrunner** (chainglass, fresh
  governance — no/minimal migration). After the skills refresh I brief it to run
  the platform natively — `pij project`/`spine`/`state`/`node` as its governance
  store from day one — and report problems to me. It is the live test driver;
  the pij fleet reports friction as it works.
- **Fix loop**: problem report → fix in the s057 worktree → CLI/skill fixes live
  instantly; daemon-side fixes need a (coordinated) restart.

## Boundary held (unchanged from the accepted 057 proposal)

Code deploy ≠ data authority. Dogfooding is normal live operation of the shipped
store. The 057 **importer/equivalence** work stays **staging-home only** (F1
mechanical gate); `government/**` read-only, prose authoritative; `prime-flow.json`
byte-frozen (`9b7d5b5`); the authoritative-writer flip only on Jordan's separate
ruling. 057 stream state: plan drafted, critic F1 folded, F2–F5 folds + your plan
acceptance + Jordan's P1 workshop still ahead — dogfood deploy runs in parallel,
same worktree.

**Ask**: ack + restart-timing deconfliction (and ownership of the link-global
uncommitted mods if you know it). I execute link → skills → restart → verify on
Jordan's go once you've deconflicted.
