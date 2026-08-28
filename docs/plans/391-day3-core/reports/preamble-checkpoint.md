# Preamble checkpoint — s391-day3-core

**Seat**: pij-associated-louse (stream orchestrator, `orchestrationRole: pm`) · **O-prime**: pij-relative-panther · **Date**: 2026-08-27T08:08Z
**Brief**: `/Users/vaughanknight/GitHub/pij/government/briefs/s391-day3-core.md` (sha256 `8baf7667fed0ce82f83d957eaa16439b85f942765921e1fe80206c9643108c77`, dispatch `dispatch-124c93fd-5b32-4dd7-bb21-d13313f202c5`, acked)
**Stage**: Orient complete → Preamble (read-only review). No source mutation yet; this file is the only write.

## claim
Read-only orient of the four day-3 items is complete on base `2953d75`; every cited seam exists and is line-verified on this tree; the stream is ready to enter planning after the o-prime's preamble ruling on the two `open[]` decisions.

## thesis (`/thesis` contract, mode `fit`, applied from `~/.agents/skills/thesis/SKILL.md` — see open[] O-1)
1. Thesis: Day 3 closes four small, ruled gaps left by the comms merge so that a seat's spawn argv, delivery queue, pointer warning, and staleness flag each tell the mechanical truth — one PR per gap, pinned by a pure unit test before any live proof.
2. Now: `main@2953d75` already carries all the machinery (sqlite `DeliveryState` machine, pointer path under a 90s lease, `cardCanMislead`, pure `buildControlSpawnCommand`); the gaps are one over-broad flag, one missing verb + sweep, one alarming-but-benign warning, and one predicate blind to the mechanical axis.
3. Toward: the o-prime merges four independent PRs in order 6 → 1 → 5 → 4 (s392 rebases after each), after which a gemini-flash spawn, a `pij queue retire`, a pointer send to a busy pane, and a busy seat with an old card all behave without a human workaround.
4. Keep: additive `SessionDescriptor` only; retire ≠ delete (row kept, `retired` receipt carries the reason); the anomaly predicate changes and the rail does not (spine 25457); the pointer path keeps its lease re-announce and composer-idle guard; the live daemon and `skills/pij/**` are never touched by this stream.

My read: right feels like four scalpel cuts, each landing green as its own small PR with a test that pins the ruled behaviour, and nothing widening into a redesign of the queue, the rail, or the spawn builder.

## position (where the work sits on disk — all verified on 2953d75)
| item | seam | verified line(s) |
|---|---|---|
| (6) long_context gate | `.pi/extensions/pij/core/spawn.ts` | 463-465 `if (harness==="copilot" && model!==undefined) args.push("--context","long_context")`; doc comment 408-410; pure builder, test sibling `core/spawn.test.ts`; models registry `core/models/registry.ts:284 loadModels()` |
| (1) queue retire | `.pi/extensions/pij/adapters/sqlite-queue.ts` | `DeliveryState` union :38; `claim` :330, `settle` :356, `recoverStaleClaims` :397, `importUnread` :464, `summary` :490. CLI: `cli.ts:548 runQueueMigrate`, `:603 runQueue`, `:4475 top==="queue"`. Sweep hook: `.pi/extensions/pij/daemon.ts:1090 sq.recoverStaleClaims()`. Sender preflight already refuses dissolved: `core/cli.ts:2190-2196`. Capability: `core/orchestration/pa-capability.ts:131 queue: ALLOW` |
| (5) UNVERIFIED warning | `.pi/extensions/pij/adapters/daemon-tmux.ts` :543-556 (stderr write + `return "unverified"`); `core/daemon/loop.ts:637-653` pointer path (`via:"pointer"`); `daemon.ts:48 POINTER_LEASE_MS`, `:1156-1160` settle `injected` under lease |
| (4) cardCanMislead | `.pi/extensions/pij/core/orchestration/role.ts:123-161` — currently `statusAt===undefined → false; else role prime‖pm`; no mechanical-axis input. `SEMANTIC_STATES` `core/types.ts:110`; `systemState`/`lastEventAt` on descriptor |

Path correction vs implementer notes: `daemon.ts` is `.pi/extensions/pij/daemon.ts`, not `core/daemon/daemon.ts` (line numbers hold).

## next move (proposed — awaiting ruling)
- **Branching (brief: "your call, tell me")**: the four touch sets are disjoint, so I propose **one short-lived branch per item off `main`, each its own PR, no stacking** — `s391/item6-long-context`, `s391/item1-queue-retire`, `s391/item5-pointer-unverified`, `s391/item4-card-working` — created and checked out in THIS worktree sequentially; `s391/day3-core` stays as the stream's integration/rebase branch and receives each merged item via rebase onto main. Rationale: independently mergeable, s392 rebases per merge as the brief already plans, no PR waits on a sibling's review.
- Order 6 → 1 → 5 → 4 as briefed; item 6 first (smallest; unblocks gemini-flash for fleets).
- Plan folder `docs/plans/391-day3-core/` via guided `/builder` → freeze → cold `/validate-v2` → stop at `WAITING_FOR_BUILD_CONFIG`.
- Fleet default (unless ruled otherwise): `/pij pair`, copilot `gpt-5.6-sol` xhigh coder + cross-model reviewer, effort canaried mechanically. `gemini-3.6-flash` NOT selectable until item 6 lands.

## artifacts[]
- `docs/plans/391-day3-core/reports/preamble-checkpoint.md` (this file)
- `/Users/vaughanknight/.pij/pij-primitive-toucan/day3-implementer-notes.md` (read; sha256 `7fe92b57dd4adb3e829e0e039dc6140bdeaeb60a728a5d0483c7570cf61e9a60` — matches brief)
- `docs/plans/391-day3-core/logs/baseline-vitest.log` (baseline cheap gate on untouched tree — running at write time; result appended to the pointer message)
- `.harness/temp/agent/session-buffer.md` (observations DL-001, CONF-001)

## shas[]
- base `main` = `2953d7599b3b8a498295f9e07b766a4fff49edc9` (worktree HEAD, clean)
- brief `8baf7667…08c77`; implementer notes `7fe92b57…e9a60`; canary packet `b50dc394…7019` (acked)

## gates[]
- `command -v pij` → `/opt/homebrew/bin/pij` → resolves to `/Users/vaughanknight/GitHub/pij/harness/scripts/pij-cli.cjs` (**MAIN checkout**, as the local orient warns). All worktree live proofs will bind explicitly via `npx tsx .pi/extensions/pij/cli.ts …` from this worktree.
- `node_modules` present in worktree (pre-spawn gate satisfied without `npm ci`).
- `npx vitest run .pi/extensions/pij/` on `2953d75` → see `docs/plans/391-day3-core/logs/baseline-vitest.log` (pending at file write; verdict in pointer message).
- Not run yet: `just pij-skill-check` (no skill edits planned), `harness checks` (full gate at ship; KNOWN-RED `release-age-policy.test.ts` needs `pwsh`).

## observations[]
- DL-001 / difficulty / skill / `/thesis` lives only in `~/.agents/skills` (pi/copilot/codex root); Claude Code's Skill registry does not scan it, so a claude-harness orchestrator cannot invoke it through the host mechanism as orient step 4-5 requires / encode: symlink `~/.claude/skills/thesis → ~/.agents/skills/thesis` (as `pij` is) or ship it under the repo `.claude/skills`.
- CONF-001 / confusion / tooling / implementer notes cite `core/daemon/daemon.ts`; file is `.pi/extensions/pij/daemon.ts` / encode: notes template should be generated from `git ls-files`, or a `harness` check that cites resolve.
- (unlogged, informational) `docs/plans/` has 81 folders, highest ordinal 179; brief assigns 391 — numbering is o-prime-assigned, no collision.

## open[]
- **O-1 (escalation, one hop)**: `/thesis` was NOT invocable via the Claude Code Skill tool (not registered). I applied the on-disk `SKILL.md` contract verbatim (mode `fit`, read-only) rather than improvise. Orchestrator doctrine says stop-and-escalate when `/thesis` is unavailable: **ruling needed — does the verbatim-contract application satisfy step 4/5, or should a pi/copilot peer run `/thesis` via `/pij skill` and push the output back?** Non-blocking: planning can start on either answer; only the thesis artifact's provenance changes.
- **O-2 (decision)**: branching model above (per-item branches off `main`, no stack) — confirm or override.
- **O-3 (risk, noted)**: item 5 ergonomics choice (downgrade the stderr line for the pointer path vs cheaper single-line submit confirm) is a plan-time decision; I lean "downgrade + keep lease", per the notes' fix direction, and will pin it in the plan for validation.
- **O-4 (environment)**: `harness checks` KNOWN-RED on `release-age-policy.test.ts` (`pwsh` absent) — will be reported, not fixed.

## addendum 08:12Z — skill-availability audit for the journey steps
- Claude Code Skill registry (this seat): has `the-flow`, `pij`, `flowspace`, `lean-ctx` (+ plan-N legacy). Does NOT have `thesis`, `validate-v2`, or a literal `builder`; all three exist in `~/.agents/skills/` (pi/copilot/codex root).
- Proposed resolution (single ruling covers O-1 and cold validation): run `/thesis` AND cold `/validate-v2` in a copilot/pi peer via `/pij skill` with output pushed back — that is the route's stated purpose ("run an installed skill (`/validate-v2`, `/thesis`…) in a peer, output pushed back") and keeps the validator cold and cross-model. Planning itself runs via `the-flow` (the SDD front door available to this seat), which is what `/builder` denotes in the orchestrator text (checking alias; see next line once resolved).
- **O-5**: confirm `the-flow` ≡ `/builder` for steps 7/14 in this claude-harness seat.

## addendum 08:22Z — baseline gate verdict
- `npx vitest run .pi/extensions/pij/` on `2953d75` → **PASS**: Test Files 170 passed | 2 skipped (172); Tests 3904 passed | 15 skipped (3919); 143s; exit 0. Evidence: `docs/plans/391-day3-core/logs/baseline-vitest.log`.
