# Requested Fences — s043 Telegram Last-Speaker Routing

**Requested from**: o-prime `pij-3vetx8`
**Requested by**: stream orchestrator `pij-rigid-minnow`
**Plan**: `docs/plans/043-telegram-last-speaker-routing/telegram-last-speaker-routing-plan.md`
**Plan SHA-256**: `167178342db069a5bcfe0065b839f5b1bed7478325dcfe9bdc26d7e8ca630949`
**Status**:
- Planning fence: GRANTED and complete.
- Implementation worktree/branch: REQUESTED, allocation deferred until Jordan supplies build configuration.
- Code fence: REQUESTED for the single Simple implementation phase.
- Landing: `/builder 8 ship` PR path; no direct trunk application requested.

## Construction Isolation Request

| Item | Requested contract |
|------|--------------------|
| Worktree | One s043-owned git worktree allocated by the o-prime after build configuration |
| Branch | One s043-owned branch based on the o-prime-approved current `main`, including s040 |
| Fleet | Separate coder and cold reviewer selected by Jordan; outage-first liveness cadence per R2 |
| Landing | `/builder 8 ship` pushes the branch, opens the PR, watches CI, and reports merge status |
| Cleanup | Worktree removal only after PR merge or explicit abandonment ruling |

## Planning and Evidence Fence

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `docs/plans/043-telegram-last-speaker-routing/**` | modify/new | s043 single-writer planning, reports, validation, reviews, and execution evidence |
| `.harness/temp/s043/**` | transient new | s043 scratch; never commit |
| `.flow-pair/**` | generated only | flow-pair CLI single writer; never stage or hand-edit |
| `the-flow.json` / `the-flow.md` | CLI-only | `harness flow` single writer; fleet packets explicitly forbid writes |

## Phase 1 — Strict Last-Speaker Routing

| Path | Action | Ownership / condition |
|------|--------|-----------------------|
| `.pi/extensions/pij/telegram/bridge.ts` | modify | Routing decision, selected-target state, and successful-speech callback |
| `.pi/extensions/pij/telegram/bridge.test.ts` | modify | TDD precedence/state/text/media/failure/threading regressions |
| `.pi/extensions/pij/telegram/index.ts` | modify | Own and inject normalized per-chat last-speaker state |
| `.pi/extensions/pij/telegram/index.test.ts` | modify | Production bot/forwarder shared-state regression |
| `.pi/extensions/pij/telegram/commands.ts` | modify | Rename `/tail` accessor to selected-target semantics |
| `README.md` | modify | Front-door behavior summary |
| `docs/how/pij-telegram.md` | modify | Authoritative operator behavior |
| `docs/domains/pij-control-plane/domain.md` | modify | Domain history/contract update |

## Explicitly Read-Only / Not Requested

| Path / surface | Reason |
|----------------|--------|
| `.pi/extensions/pij/telegram/match.ts` | Explicit full/partial matching remains unchanged |
| `.pi/extensions/pij/telegram/match.test.ts` | Existing s040 memorable-id coverage must stay green, not be rewritten |
| `.pi/extensions/pij/telegram/config.ts` | Chat configuration shape remains unchanged |
| `.pi/extensions/pij/telegram/media.ts` | Media classification/limits/reference passing remain unchanged |
| `.pi/extensions/pij/core/**` | No pij messaging wire/type contract change |
| `package.json` / `package-lock.json` | No dependency or script change |
| `government/**` | o-prime single writer |

## Grant Conditions Requested

- Worktree/branch allocation and build fleet are recorded before any implementation dispatch.
- T001 regressions are RED for the intended last-speaker gaps before product code changes.
- Subprocess-spawning tests retain explicit bounded timeouts; no unbounded watcher waits.
- `git diff --name-only` remains inside this manifest.
- Reply-to, partial-name matching, allowlist, reply threading, sender tags, media limits, and the pij wire remain unchanged.
- The implementation uses injected closures/maps only; no global mutable state or persistence.
- Targeted Telegram tests and `harness checks` are green before review/ship.
- Any optional live phone proof requests and receives `daemon-restart` baton before restarting the shared daemon.
- Coder/reviewer packets forbid `government/**`, `.flow-pair/**`, and Builder flow-state writes.

## Shared-Resource Posture

| Resource | Default posture | When a baton is required |
|----------|-----------------|--------------------------|
| Git working tree/index | Isolated by s043 worktree/branch | Only shared-trunk fallback or explicit merge/repair |
| Push/landing | `/builder 8 ship` + PR + CI | `push-main` only under an explicit fallback ruling |
| Daemon | No restart for deterministic acceptance | `daemon-restart` for optional live Telegram proof |
| Telegram bot/API | Mocked/offline in deterministic tests | Human-coordinated live proof only if explicitly requested |

## Required Release Proof

- Coder report with exact files, RED-to-GREEN evidence, and gates.
- Separate cold reviewer verdict persisted before any fix packet.
- Orchestrator sanity pass over precedence, state split, send-success semantics, and chat-key normalization.
- Existing s040 matcher suite green.
- `harness checks` green.
- `/builder 8 ship` report with PR URL and watched CI result.
