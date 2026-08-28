# s391-day3-core — final stream report (v0.2.0 handover)

**claim**: 13 PRs merged from this stream (items 6, 1a, 1, 5, 1b, 4, 6b, 13, 15, 16, 15-FX, 31, 32 — all live on the v0.2.0 daemon, restart #7 = d120c53 + #33's direct-child launch live-proven on restart #7's successor); the outstanding items (33 in flight; 34, 31b, 19, 25, 26, 27, 28, 35, E3, E5; carried lows) are handed over as rebuildable sections in `docs/handover/v0.2.0/` with every pointer resolving on main; the whole plan folder and kept logs are on main (PRs #36, #40).

**artifacts**
- plan: `docs/plans/391-day3-core/391-day3-core-plan.md` (v1.22.0, 18 phases, AC-01…AC-35)
- rulings (every ruling/notice of the day, time-stamped): `docs/plans/391-day3-core/rulings.md`
- fleet: `docs/plans/391-day3-core/fleet.md`
- ship reports: `docs/plans/391-day3-core/ship/2026-08-27/ship-report-item{6,1a,1,5,1b,4,6b,13,15,16,15fx,31,32,33}.md`
- per-phase dossiers, packets, cold-review verdicts, fix packets, execution logs: `docs/plans/391-day3-core/tasks/phase-*/`
- kept logs (vitest runs, mutation REDs, smoke reds, probes): `docs/plans/391-day3-core/kept-logs/`
- handover sections: `docs/handover/v0.2.0/{33,35,E3,E5,99}-*.md` (PR #41), `{34,31b,19,25,26,27,28}-*.md` (PR #43); cold-read verdicts `docs/plans/391-day3-core/handover/review-{C,AB}-verdict.md`
- item 33 branch (in flight, pushed): `s391/item33-watchdog-smoke-proof` @ `29c329f` with evidence

**shas (merge PRs)**: #2 item 6 · #3 1a · #9 1 · #11 5 · #14 1b · #18 4 · #22 6b · #24 13 · #27 15 · #28 16 · #29 15-FX · #31 31 · #33 32 · #36 plan folder · #40 kept logs · #41 sections C · #43 sections A+B

**gates**: every PR: full `npx vitest run .pi/extensions/pij/` at the head (and, from #27 on, at the merge product by the o-prime), tsc, biome; cold cross-model review with sha-pinned Dim-0 mutations (RED→restore→GREEN) — verdicts on disk; live proof on daemon restarts #1–#7.

**observations** (DL = delivery/daemon, INS = instruments, CONF = conflicts; each has a row in rulings.md)
- DL-001…DL-012: day-1/2 rows (pointer path, duplicate delivery across restart, false "exited" on join-pane, future-dated timestamps, reviewer false-green harness, wedged reviewer) — see rulings.md.
- DL-013: Telegram bare text routed to a dead seat (→ item 30, shipped by s392 as #34).
- DL-014: a "route X to Y" plan must grep every gate site (`spawnedBy` lived in loop.ts ×3 + death-reconciler) — three fence widenings mid-RED.
- DL-015/016: copilot composer wedges; `/compact` via `--body-file` is prose; even `cmd:compact` waits in copilot's queue while idle; a packet injected mid-turn becomes an "interactive" queued item that never runs → never send a compact and a packet back-to-back; unstick via queue manager (`C-q` → `x`) + a typed pointer line.
- DL-017: an orchestrator-authored fix rule collided with an existing aggregation rule (task #34) — packets prescribing a new log line must name the aggregation they join.
- DL-018: the plan-055 watchdog smoke sensor was dead in three layers, masked by baseline reds → items 33 (sensor) + the unmaskable `watchdog-smoke:` line.
- DL-019: fixtures must sit on both sides of every threshold floor (interval 100 ms made old == new).
- DL-020: macOS `/tmp` → `/private/tmp` defeats the raw-string run-if-main guard (silent boot-and-quit).
- DL-021: a handover section that names the wrong write seam rebuilds the wrong thing — the cheap look must check the seam, not just the path.
- DL-023: a plan premise ("`--type` accepted and ignored") went unverified from planning to handover; the cold-read ran the command at the tag and refuted it — run X before writing acceptance for "X does nothing".
- DL-022 (= o-prime E49): `.gitignore` `logs` + `*.log` silently dropped every kept log from #36; `git add` of an ignored path is silent — `git ls-tree` after every evidence commit.
- INS-001/003: per-commit `merge-tree` dry-runs lie for a stack; rebase the stack in a throwaway worktree.
- CONF-001: shared worktree = one checkout; a coder mid-item blocks the orchestrator's rebase/push → do those in throwaway worktrees.
- Stall notices: the 60 s legacy detector fired on every long tool call of every seat all day (~25 orchestrator turns) — fixed by item 31 (standby-aware threshold); 31b closes the parent-with-active-child case.
- Cold review value: 5 of 13 PRs went through ≥1 fix round on reviewer findings that coder + orchestrator sanity had passed (item 16 ×2, 31, 32 ×2, 15); the handover cold-read found my E5 field lists attributed to the wrong commands — the doctrine held.

**open** (for the o-prime / Vaughan)
- Item 35: GitHub Actions needs the owner's account-side check (§ 7 of its section).
- Item 33: cold-review verdict never written (reviewer wedged); the branch is complete and pushed — a fresh reviewer + rebase + merge check finishes it.
- Carried lows: `docs/handover/v0.2.0/99-carried-lows.md`.
- Fleet teardown: coder `pij-jolly-moose` and reviewer `pij-only-oramen` are mine; closed at stream end.
