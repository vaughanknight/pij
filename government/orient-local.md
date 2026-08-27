# Orient — local (lever 2)
**Scope**: THIS REPO (pij). Written fresh 2026-07-11 by pij-3vetx8; the o-prime's live tuning surface.
**Writer**: pij-primary-carp

## What this project is

pij is the **peer fabric itself**: a pi extension + `pij` CLI + machine-wide daemon that lets agent sessions across tmux panes discover, message, spawn, govern, and tear down each other (claude/copilot/codex/pi harnesses). This repo also ships the `/pij` router skill — including the **prime route you booted from**. You are working INSIDE the tool you are using: expect recursion, and treat it as a feature (your frictions are encode candidates for the very payload that briefed you).

**Mandatory orient reads** (do not auto-load): `docs/how/pij.md` (operating guide), `AGENTS.md`, and for plan 036 specifically `docs/plans/035-o-prime-routing-skill/requirements-spine.md` § R4.3/R4.4/R9.7.

## What matters here

- **The daemon is live and shared**: it runs YOUR delivery too. Extension edits (`.pi/extensions/pij/**`) do nothing until a daemon restart (C6), and a restart interrupts every live peer machine-wide — that's why `daemon-restart` is a baton.
- **The skill is live-deployed by symlink**: edits under `skills/pij/**` are instantly live for every agent on the machine. Treat skill-text edits like production pushes; `just pij-skill-check` is the gate and it is load-bearing (mutation-proven).
- **Additive schema discipline**: `SessionDescriptor` changes are additive/migration-safe only (`core/types.ts:109` comment class); legacy descriptors must always load.
- **Regression history is law**: FX001/FX002 + the 035 dissolved/staleness/pinning tests must stay green — they encode live incidents.
- **TDD with fakes**: every module has a `.test.ts` sibling; fakes live in `adapters/fakes.ts`; mutation-gated review is house practice.

## The harness surface

- Cheap gate: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check`. Full pre-ship: `harness checks`.
- **New worktree pre-spawn gate**: after `git worktree add`, run `npm ci --no-audit --no-fund` in that worktree and require `harness boot` green before `pij spawn`. Missing `node_modules` caused the same TS2688 boot failure in s042 and s044; do not make a new agent diagnose its own unbootstrapped environment.
- **Live government root**: stream worktrees can branch from an older base, so their checked-out `government/` snapshot is not authoritative. Briefs, spine, baton book, and local orient resolve from `/Users/jordanknight/pi-hacking/pij/government/` until the branch has merged current government.
- **Worktree live-proof CLI binding**: bare `pij` is installed by `npm link` and resolves to the **main checkout**, not the current worktree. Never run `npm link` from a worktree (it repoints the machine-wide CLI). Before any pre-merge live proof, bind commands explicitly to reviewed worktree code using `just pij` where suitable or an isolated PATH shim to that worktree's CLI/tsx; record `command -v pij` plus the resolved source path. After merge/main update, the existing global link naturally sees the shipped code.
- Flows: builder flight-plans via `harness flow` only. The o-prime's portfolio: `government/prime-flow.json` (read-only to streams).
- Capture friction the moment it bites: `harness observe "<what>" --kind <friction|win|…>`; ride your reports' `observations[]`.

## Repo mechanics (per-repo config, binding)

- **Batons**: daemon-restart · git-index (pathspec-mandatory commits; commit-slot when apply windows live) · push-main. Book: `government/baton-book.md`.
- **Never stage**: `.flow-pair/**` (gitignored ledger), `scratch/**`, `node_modules`, `session-store.db`, `government/prime-flow.json` render artifacts follow flow rules.
- **Fleet defaults**: coder + reviewer via `/pij pair`, copilot `gpt-5.6-sol` xhigh (canary the effort mechanically — self-reports have lied; process args are truth).
- **Compaction is fire-and-forget**: on a reusable peer's completion, send compact immediately **without `--wait`** and continue useful report/review/fix preparation. Never block the orchestrator on compact latency. One-shot auto-dissolved peers remain the documented E-DEAD exception.
- **Human channel**: Jordan works in-pane; `pij-telegram` exists for one-liners (main events only).

## Current portfolio

- s036-baton: P-07 primitive under the ruled `pij orchestration <primitive>` namespace — the first stream of this government. Prior art trail in `docs/plans/036-pij-orchestration-baton/original-ask.md`.

## Tuning 2026-08-27 (pij-relative-panther)

- **Skill text gets a cold SEMANTIC review, every PR.** `just pij-skill-check` is necessary, not sufficient: on 2026-08-27 a line-budget trim inverted a rule (read-back moved from precondition to afterthought), deleted "plan roster = durable config truth", and added a false `§ C7` cite — all under a green gate. Also diff the gate output before/after: zero new findings is the bar (spine 24598).
- **Never open an unregistered harness pane in tmux while any pane-less seat may exist** — a dissolved seat's queued mail was typed into one (`government/incidents/2026-08-27-cross-government-pane-misbind.md`); until items 1/10b land, isolate outside tmux.
- **CI has never run in this repo** (0 Actions runs, workflow active). Merges are ruled on local gates + cold review + live proof, recorded per PR (spine 24514) until Vaughan fixes Actions.
- **Every `pij send` body goes by `--body-file` from a quoted heredoc** — a double-quoted body with backticks executed two commands from the o-prime's own shell today.
- **Flash (`gemini-3.6-flash`) is unusable for interactive Copilot seats** even with the item-6 argv fix (item 6b open); use terra/sol.
- **Skill-text PRs also run the vitest files that pin skill strings** — `.pi/extensions/pij/cli.integration.test.ts` and `acceptance-sweep.test.ts` — before merge. PR #7 (2026-08-27) went in on gate-green + semantic review and left main red on two of them; the o-prime's merge check lacked this and is corrected here.
- **Temp worktrees: create and remove only under YOUR OWN session scratchpad, matched by exact path prefix** — on 2026-08-27 the o-prime force-removed a stream's scratch build worktree by grepping `git worktree list` for "scratchpad" (spine 25548). Ownership-aware teardown applies to worktrees too.
