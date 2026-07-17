# Plan 054 ship checklist — pij grown up

**Status: LANDED 2026-07-17 — `ab16cfb` on main.** §1–§2 are CLOSED (see below);
§3–§5 remain live and now ride ONE combined daemon restart shared with s055
(mandrill drives, on Jordan's word) — do NOT restart the daemon separately for
s054, or the fleet eats two restarts for one need.

_Original framing:_ **LISTED, NOT EXECUTED.** Every step below was R3-gated out of the
build legs (P1–P4 ran against temp homes + fakes only: no skill install, no
live daemon, no real `~/.pij`). Execution happens at ship, in this order,
by whoever holds the ship baton — nothing here is a coder action.

Build state at hand-off: P1–P4 all review-clean/complete on
`s054/pij-grown-up`; gates at P4 wrap: tsc clean · FULL vitest 2832/0 failed ·
`harness checks` all 8 stages green · `just pij-skill-check` green ·
`government/prime-flow.json` byte-untouched (R4).

## 1 · PR gate — sequencing (standing ruling R2) — ✅ CLOSED

- [x] **R2 AMENDED, then satisfied.** The ruling's premise — that s054 builds
      *on top of* the surfaces s051 rewrites — was falsified by the build:
      s054's diff touches `core/discovery.ts` / `core/current-session.ts` /
      `core/close.ts` **zero lines** (verified at every coder checkpoint, by
      the cold reviewer at P3 and P4, and again by me pre-merge). The streams
      are textually disjoint, so the ordering intent no longer bound. Jordan
      ruled PD-011 accept ("lets get them both landed"); o-prime recorded the
      amendment. **s051 no longer gates s054 — the dependency is inverted (§2).**
- [x] **s052 `npm ci` prerequisite — STALE, dismissed.** CI runs
      `npm ci --min-release-age=null` on every leg and went green throughout;
      the E404 lock boundary that motivated this row had already resolved.
- [x] PR #27 merged as `ab16cfb` (squash), second-lander behind s055's
      `482d604`. Convergence evidence: full suite 2886 passed / 0 failed
      (s054's 2832 + s055's 54, green together), tsc/biome/skill-check clean.

## 2 · Convergence re-read (SW-7 reconciliation) — ⇄ **INVERTED**

**s054 landed first, so s051 is now the second lander — the gate runs in the
other direction.** s054's P3 tree/parent tests were written as *outcome*
contracts (never internal call shapes) precisely so they would survive s051's
reimplementation; that design is now the portfolio's convergence instrument.

- [ ] **s051 (when it lands)**: rebase onto main, then re-run s054's behavior
      contracts as its own convergence gate — `effectiveParent(descriptor) ==
      the resolved caller` · a cwd cohabitant is NEVER a parent source · pane
      identity resolves across a differing cwd · `spawnedBy` byte-stable
      across a `pij link` re-parent · self/cycle rejected. **A red there is a
      real convergence finding in s051, not a flake and not an s054 bug** —
      the contracts assert outcomes both streams already agreed on (o-prime
      cross-check, Seq 449: they encode the same semantics s051's G7 binds).
- [ ] Route any red through o-prime as a reconcile excursion.

_Historical (now s051's to run, not s054's):_ re-read landed main and re-run
      the P3 behavior contracts against the MERGED tree
      (`npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters
      .pi/extensions/pij/cli.integration.test.ts`): they were written as
      outcome contracts precisely so they survive s051's implementation —
      any red here is a real convergence finding, not a flake.
- [ ] Re-run the acceptance sweep (`npx vitest run
      .pi/extensions/pij/acceptance-sweep.test.ts`) on the merged tree.

## 3 · Daemon restart — machine-wide baton *(R3: forbidden pre-ship)*

> **DELEGATED**: rides the ONE combined restart shared with s055 — mandrill
> drives on Jordan's word. s054 must NOT restart separately (both streams'
> daemon-side changes are on main; one restart serves both).

- [ ] Acquire the daemon-restart baton (memory/Finding 02: daemon runs tsx
      off source with NO hot-reload — a stale daemon silently ignores every
      P2–P4 daemon-side change: runtime axis, anomaly sweep, windowId
      backfill).
- [ ] `pij daemon stop && pij daemon start` from the merged main checkout.
- [ ] Confirm: `pij daemon status` healthy; bound peers survived (descriptors
      on disk); re-send anything that was in flight.

## 4 · Live two-peer demo — AC-07 in the wild *(R3: needs the live daemon)*

- [ ] Spawn two real peers (parent + worker) under the restarted daemon.
- [ ] Drive a real anomaly (e.g. declare `done` with no verify, or park a
      dispatched worker idle past the threshold).
- [ ] Observe: `pij anomalies --json` surfaces it with spine evidence, AND
      the daemon pushes exactly ONE alert to the parent (latch) — and takes
      no action itself.
- [ ] Bonus proof (AC-09): `tmux select-window -t $(pij node show <id> --json
      | jq -r .windowId)` lands on the peer's window.

## 5 · Skill deploy *(R3: the exact command the build was forbidden to run)*

- [ ] `just pij-skill-install` — deploys the pij skill (incl. the new `node`
      route) to the live skill root.
- [ ] Post-install: `just pij-skill-check` green against the installed copy.

## 6 · Paperwork

- [ ] PR: squash-merge posture per worktree-era doctrine; body links the four
      phase dossiers + reviews.
- [ ] Regenerate the live spine render once on the real home:
      `pij spine render` (writes the real `~/.pij/spine/spine.md` for the
      first time — its debut OUTSIDE the R3 fence).
- [ ] Confirm `government/prime-flow.json` untouched in the final diff (R4)
      and `government/spine.md` untouched by tooling (dual-run posture doc:
      `docs/how/pij-governance-migration.md` — cutover remains a human
      ruling, NOT part of this ship).

---
**Orchestrator note (post-review, 2026-07-17)**: known false-red for §2 gate re-runs — the pre-existing `pij()` test helper leaks ambient `PIJ_SESSION_ID`; `cli.integration.test.ts:1139` false-reds ONLY when the suite runs from a pij seat (product behavior is correct: E-AMBIG). Clear `PIJ_SESSION_ID` in the runner env (the P4 tests already do). Reviewer LOW, p4-review-001.md.
