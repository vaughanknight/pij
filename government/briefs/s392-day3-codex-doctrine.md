# Stream brief — s392-day3-codex-doctrine
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
- **Human ask, verbatim** (Vaughan, 2026-08-27 ~07:49Z, in-pane): "Do the day 3 list, do we have codex running to test it? restart telegram whenever you want... do it all." Ruling spine 23835; project `pij-day3`.
- **Your items, in this order** (each = one PR):
  1. **(3b) URGENT — Telegram is dark on the merged code.** The bridge (`.pi/extensions/pij/telegram/bridge.ts` `startForwarder`) drains `pij-telegram`'s fs inbox via `FsChannel.watch`; under the sqlite default the daemon writes no fs file for it (evidence: deliveries seq 290 queued 07:59Z, no fs file, nothing forwarded; spine 23888). Make the forwarder consume the durable queue (sqlite backend, `adapters/sqlite-queue.ts`) — claim/settle exactly once, keep the boot-watermark semantics (never replay the 120 `failed` retired rows), and handle the two rows now queued (149, 290) exactly once or retire them with a receipt. Also fix the sender receipt that reports `delivered: peer was idle` for a row that stays queued (spine 23889). Live proof needs a bridge restart — that is MINE (I own the bridge window `pij-prime:telegram`); hand me the tested commit and I restart and verify with a real send.
  2. **(2)** Codex `app-server --remote` wired into delivery (`adapters/codex-rpc.ts` builders exist; wire `adapters/daemon-tmux.ts sendSocket` codex branch + `core/spawn.ts` codex spawn side), fake-app-server integration test first, then LIVE proof. Codex CLI is now 0.148.0 and runs, but is **unauthenticated (401)** — Vaughan must run `codex login`; ask him in your pane, do not block item 1 on it.
  3. **(7)** Pointer-delivery doctrine relaxation for socket/RPC harnesses: the code already sends the full body on socket/RPC; write the routing-invariant test (claude-with-socket + copilot-with-rpcPort get the BODY `via:"socket"`, only socketless seats get the pointer), amend `docs/how/pij.md` and the skill's C10 wire-discipline text (`/Users/vaughanknight/.claude/skills/pij/references/00-routing.md` is LIVE — gate with `just pij-skill-check`), and DRAFT the government doctrine amendment as a file in your plan folder for me to fold in (government is single-writer).
- **Plan folder**: `docs/plans/392-day3-codex-doctrine/`
- **Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine`
- **Branch**: `s392/day3-codex-doctrine`
- **Base**: `main` at `2953d7599b3b8a498295f9e07b766a4fff49edc9`
- **Spawn evidence**: descriptor cwd = worktree; tmux window `s392-day3-codex-doctrine`, pane %51; parent pij-relative-panther
- **Prior art**: `reports/pij-comms-review-2026-08-27.md` §5, §11–13, `reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md`; toucan notes (Orient 4); `docs/how/pij.md`; `government/doctrine/preconditions-travel-with-remedies.md` (read-only).
- **Current flow state**: none (fresh plan folder).

## Descriptive fence
- Expected touch set: `.pi/extensions/pij/telegram/**` (+tests), `adapters/sqlite-queue.ts` (+test, read-side only if possible), `adapters/codex-rpc.ts` (+test), `adapters/daemon-tmux.ts` (codex branch, +test), `core/spawn.ts` (codex branch, +test), `core/types.ts` (additive), `core/daemon/loop.ts` (+routing test), `core/cli.ts` (send receipt), `docs/how/pij.md`, `skills/pij/references/00-routing.md` (C10 only), `docs/plans/392-day3-codex-doctrine/**`.
- Scratch: `.harness/temp/s392/**`
- Known separate-branch overlap with s391: `core/spawn.ts`, `adapters/daemon-tmux.ts`, `core/types.ts`, `adapters/sqlite-queue.ts`, `docs/how/pij.md`. s391 lands first on those; you rebase after each s391 merge. Your item 1 (telegram/) is disjoint — ship it first, independently.
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
