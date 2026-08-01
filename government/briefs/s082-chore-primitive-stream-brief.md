# Stream brief — s082-chore-primitive
**From**: pij-wee-albatross (o-prime) · **Date**: 2026-08-02 · **Lifecycle**: provisional

## Structure tree

```text
human (Jordan)
└─ o-prime pij-wee-albatross · window o-prime · main tree /Users/jordanknight/pi-hacking/pij
   ├─ this stream <id pending spawn> · window s082-chore-primitive · s082 worktree
   ├─ pm pij-unwilling-butterfly · main tree · owns s081/primes-owe-cards (PR #72, open)
   └─ pa pij-missing-anaconda · main tree · o-prime's assistant (sweeps, notify-only)
```

## Work item

- **Plan folder**: `docs/plans/082-chore-primitive/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s082-chore-primitive`
- **Branch**: `s082/chore-primitive`
- **Base**: `main` at `6fd6167c957fbe50a09f9c8d03550783d33f8da7`
- **Landing**: `/builder 8 ship` to PR merge (squash); teardown only after merge or explicit
  abandonment ruling
- **Human ask, verbatim**: see `government/rulings/2026-08-02-s082-chore-primitive-kickoff.md`
  — build the `pij chore` primitive; explore first, then report ready for preamble and STOP.
- **Design brief (PRIMARY INPUT)**: `government/briefs/chore-primitive-2026-08-02.md` — verb
  family (`add/run/list/ack/remove`), ack-advances-baseline semantics (un-acked deltas MUST
  re-surface), gate-vs-sensor distinction from /builder chores, and the three borrowed
  disciplines (un-run-not-absent / mandatory-for-agent / receipt-first decline). Treat its
  "Design points to settle" as open questions for the plan, not settled law.
- **Prior art** (paths only): `.pi/extensions/pij/core/watchdog.ts`,
  `.pi/extensions/pij/core/daemon/watchdog-manager.ts`, `.pi/extensions/pij/core/cli.ts`
  (report/anomalies verbs), `.pi/extensions/pij/core/memorable-id.ts` (store patterns),
  `government/briefs/pa-standup-recipe.md` (the consumer),
  `government/briefs/subscriptions-outlive-seats-2026-08-01.md` (sidecar lifecycle trap),
  `~/.claude-alt/skills/builder/references/harness-seams.md` (the GATE-flavoured chore model —
  read for contrast, do not import its machinery).
- **Survey evidence behind the design**: PA value survey 2026-08-02 — instrument-pointed
  chores 28/28 clean vs transcription 0/2; delta-blindness (3 red PRs invisible ~10h);
  frozen-board burn (~1218 prem / 1 true finding). Ask o-prime for specifics if needed.

## Descriptive fence

- **Expected touch set**: `.pi/extensions/pij/core/**` (new chore module + store),
  `.pi/extensions/pij/cli.ts`, `.pi/extensions/pij/core/cli.ts`, matching `*.test.ts`,
  `docs/plans/082-chore-primitive/**`, `docs/how/pij-chore.md`
- **Scratch**: `.harness/temp/s082/**`
- **Hard exclusions**: `government/**` (o-prime single-writer — route findings up),
  `.the-flow-state.json` / `the-flow.json` / `the-flow.md` (guided mode's), `skills/**`
  (grant required), `~/.pij/**` hand-edits (operator-only), **machine-wide daemon restart
  (baton required — NEVER from a worktree, C6)**, npm supply-chain policy
  (`min-release-age`, `audit=true`) untouchable.
- **Known separate-branch overlap**: open PRs #70 (`s079/anomaly-honesty` — core/cli.ts),
  #72 (`s081/primes-owe-cards` — core/watchdog.ts, role.ts), #73 (cli.ts help line). All
  touch your expected set's neighbourhood. Merge risk recorded; does not block spawn.
  **Convergence point**: rebase onto main after they merge (o-prime will notify) — check
  before your first implementation commit.
- New worktree-local path: persist, tell the o-prime, continue (tell-not-ask).

## Orient stack

1. Invoke `/pij prime`; stream triage loads `references/prime/orchestrator.md`.
2. Portable global orient: `references/prime/orient-global.md`
3. Consuming repo local orient: `government/orient-local.md`
4. This brief + the design brief + the kickoff ruling
5. Invoke `/thesis` through the host skill mechanism
6. **`/builder 1a explore`** (Jordan's explicit sequencing) — research dossier covering: the
   existing report/anomaly/watchdog store patterns, the sidecar-lifecycle trap, builder's
   gate-chore contrast, and the ack-baseline semantics question
7. **Report READY FOR PREAMBLE and STOP** — no `1b plan` until Jordan's preamble lands
8. Protocol/ritual pages only on demand

## Assignment and reporting

- Assignment stays provisional until the human preamble and first report.
- A validated plan stops at `WAITING_FOR_BUILD_CONFIG`. **Recorded build-fleet candidate
  (Jordan, 2026-08-02)**: coder github-copilot `gpt-5.6-sol` xhigh · reviewer github-copilot
  `gpt-5.6-terra` xhigh — confirm at the gate, do not silently consume.
- Report at preamble, every phase checkpoint, and ship:
  `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.
- You owe a status card (`pij report now`) at both edges of every unit — and your fleet's
  cards are your accountability.
- Work confined to this worktree/branch is notify-only; batons only at convergence or shared
  mutable resources.
- Fleet packets inherit this fence and name a narrower task allowlist.
