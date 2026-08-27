# Stream brief — s391-day3-core
**From**: pij-relative-panther (o-prime, pij) · **Date**: 2026-08-27T08:05:19Z · **Lifecycle**: provisional (spawned by o-prime)

## Structure tree
```text
human (Vaughan, in-pane in tmux pij-prime + Telegram once 3b lands)
└─ o-prime pij-relative-panther · pij-prime:1 (%45)
   ├─ PA pij-ready-perosteck · copilot terra low · %48 (sensor/relay only)
   ├─ s391-day3-core pij-associated-louse · window s391-day3-core (%50)
   ├─ s392-day3-codex-doctrine pij-falling-outside · window s392-day3-codex-doctrine (%51)
   └─ pij-primitive-toucan · HELD, notes-only (perimenocause cwd; never touches ~/GitHub/pij)
```

## Work item
- **Human ask, verbatim** (Vaughan, 2026-08-27 ~07:49Z, in-pane): "Do the day 3 list … do it all." Ruling spine 23835; project `pij-day3`.
- **Your items, in this order** (each = one PR): **(6)** `core/spawn.ts:463-465` gate `--context long_context` per model (Flash 400s) · **(1)** `pij queue retire <filter> --reason` + auto-retire deliveries to seats that dissolve (retire ≠ delete; receipt with reason) · **(5)** pointer-path `UNVERIFIED` warning made honest (`adapters/daemon-tmux.ts:548`, `core/daemon/loop.ts:653`) · **(4)** `pij report now --state working` rejected vs PA staleness rule — implement toucan's option (b) (anomaly predicate `cardCanMislead`, `role.ts:123`; do NOT touch the rail).
- **Plan folder**: `docs/plans/391-day3-core/`
- **Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core`
- **Branch**: `s391/day3-core` (one branch; stack PRs or branch per item off it — your call, tell me)
- **Base**: `main` at `2953d7599b3b8a498295f9e07b766a4fff49edc9` (merge f14915b is the baseline; live gov commit 9178c2b on main is docs-only)
- **Spawn evidence**: descriptor cwd = worktree; tmux window `s391-day3-core`, pane %50; parent pij-relative-panther
- **Prior art**: `reports/pij-comms-review-2026-08-27.md` §11–14, `reports/pij-comms-review-2026-08-27/*.md`; toucan notes (Orient 4); `docs/how/pij.md`; `docs/how/pij-chore.md`.
- **Current flow state**: none (fresh plan folder).

## Descriptive fence
- Expected touch set: `.pi/extensions/pij/core/spawn.ts` (+test), `core/types.ts`, `cli.ts`, `core/cli.ts` (+tests), `adapters/sqlite-queue.ts` (+test), `core/daemon/daemon.ts`, `core/daemon/loop.ts` (+tests), `adapters/daemon-tmux.ts` (+test), `core/orchestration/pa-capability.ts` (+test), `core/orchestration/role.ts` (+test), `core/anomalies.ts` (+test), `docs/how/pij.md`, `docs/plans/391-day3-core/**`.
- Scratch: `.harness/temp/s391/**`
- Known separate-branch overlap with s392: `core/spawn.ts` (its codex branch), `adapters/daemon-tmux.ts` (its codex `sendSocket` branch), `core/types.ts`, `docs/how/pij.md`. You land FIRST (small items); s392 rebases. Reconciliation point: s392's rebase after each of your merges.
- New worktree-local path: persist, tell me, continue.

## Orient stack
1. Invoke `/pij prime`; stream triage loads `<skill>/references/prime/orchestrator.md` (skill root: `/Users/vaughanknight/.claude/skills/pij`).
2. Portable global orient: `<skill>/references/prime/orient-global.md`
3. Local orient: `/Users/vaughanknight/GitHub/pij/government/orient-local.md` (LIVE government root is `/Users/vaughanknight/GitHub/pij/government/`, not your worktree snapshot)
4. This brief, then the implementer notes: `/Users/vaughanknight/.pij/pij-primitive-toucan/day3-implementer-notes.md` (sha256 7fe92b57dd4adb3e829e0e039dc6140bdeaeb60a728a5d0483c7570cf61e9a60) — file:line entry points + first tests, written by the seat that built the merge
5. Invoke `/thesis` through the host skill mechanism; preamble checkpoint report to me
6. Protocol/ritual pages only on demand

## Repo facts that bite (from the local orient — read it anyway)
- Bare `pij` on PATH resolves to the MAIN checkout (`npm link`) — never `npm link` from a worktree; bind live proofs to your worktree CLI explicitly (`npx tsx .pi/extensions/pij/cli.ts …`) and record `command -v pij` + the resolved source path.
- The live daemon (pid 91876, from `~/GitHub/pij`) serves EVERY fleet on this machine incl. another government (perimenocause). Daemon restart is a BATON: request it from me; I clear it with the other prime first. Never restart it yourself. Extension edits do nothing live until a restart.
- `skills/pij/**` is live-deployed by symlink to every agent — skill edits are production pushes; `just pij-skill-check` gates them.
- Cheap gate: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check`. Full: `harness checks`. KNOWN-RED: `harness/scripts/release-age-policy.test.ts` needs `pwsh` (absent on this Mac) — environment, not you; report it, do not fix it.
- TDD with fakes (`adapters/fakes.ts`), `.test.ts` sibling per module, mutation-gated review. Every new bin verb MUST be classified in `core/orchestration/pa-capability.ts` or the exhaustive test fails.
- Additive `SessionDescriptor` schema only; legacy descriptors must load.
- Commits are pathspec-mandatory (`git commit -- <paths>`); never stage `.flow-pair/**`, `scratch/**`, `node_modules`, `session-store.db`.

## Assignment and reporting
- Provisional until your preamble checkpoint; a validated plan stops at `WAITING_FOR_BUILD_CONFIG` until I confirm the coder/reviewer profile (default: `/pij pair` with copilot `gpt-5.6-sol` xhigh coder + cross-model reviewer; canary effort mechanically). NOTE: `gemini-3.6-flash` is unusable via `pij spawn` today (that is item 6).
- Report at preamble, each phase checkpoint, and ship: `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`, by pointer (`pij send pij-relative-panther "<path> <sha256>"`). C10 wire discipline on every A2A message.
- Card at both edges of every unit: `pij report now "<did>" "<next>"`; parked states via `pij report state <blocked|question|hold|waiting>`. My PA chases stale cards.
- Worktree-confined work is notify-only (tell me new paths, continue). Batons only at convergence/shared resources: `daemon-restart`, `git-index` (main), `push-main`.
- Landing: one PR per item (small, reviewable), CI green + cold review verdict → tell me the PR number → I merge or Vaughan does. Rebase onto main after each sibling merge.
- Questions to Vaughan: ask directly in your own pane (he attaches) AND send me the pointer; never block the rest of your list on one open question.
- Forbidden: `.the-flow-state.json`, `the-flow.json`, `the-flow.md` (the-flow guided mode is their sole writer); anything under `/Users/vaughanknight/GitHub/pij/government/**` (single writer: me); the main checkout `~/GitHub/pij` working tree; the live daemon; any other worktree; `~/GitHub/perimenocause/**`.
