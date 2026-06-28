# Validation — unify-spawn-harness-plan

**Target**: `docs/plans/021-unify-spawn-harness/unify-spawn-harness-plan.md`
**Revision**: working tree @ 2026-06-28
**Verdict**: ✅ VALIDATED — no material issues
**Scope**: adaptive (lead + deterministic proof; zero critics — direct source proof settled a small Simple plan)

## Proof (deterministic, lead-read)

| Plan claim | Check | Result |
|---|---|---|
| pi rejected today at the CLI (`spawn.ts:387`, `CONTROL_HARNESSES`) | `sed` of the line | ✅ confirmed — `--harness must be claude\|copilot` |
| `resolveSelf` + `filterByFolder` reusable from `cli.ts` (Plan 020 `--branch`) | `rg` in `cli.ts` | ✅ imported `:25`; already used `:348-349` for `--branch` |
| `buildSpawnCommand` is pure + reusable | read `SpawnInput` | ✅ pure; fields are `spawnId, announceTo, cwd, role, model?, task?, paneId?` |
| `TmuxAdapter.newWindow` available to CLI | `rg` in `adapters/tmux.ts` + `cli.ts:222` | ✅ `newWindow(opts): Result<{paneId}>`, adapter already instantiated in `cli.ts` |
| daemon binds only on `plannedHarnessSessionId` (pi must skip) | `daemon/loop.ts:191` | ✅ confirmed — pi branch returning before this is sound |
| `HarnessKind = pi\|claude\|copilot` | `types.ts:18` | ✅ confirmed |

## Thesis

Purpose (one uniform `pij spawn --harness` surface, KISS) is **advanced**: the plan's design — distinct `SPAWNABLE_HARNESSES` vs `CONTROL_HARNESSES`, pi reusing the pure builder + `TmuxAdapter.newWindow` with no daemon/descriptor — is the minimal change that satisfies it without regressing claude/copilot. Target proof level (Implementation plan) matches the actual proof available (every cited symbol/path/line resolves).

## Consumers

1/1 — the `implement` verb (Simple → implements directly from the inline task table). Forward-compatible: the plan exposes no new exported shape beyond the CLI surface; the daemon contract is untouched (pi never enters it).

## Notes (non-blocking)

- The dossier/prose says "folder" where the real `SpawnInput` field is `cwd` (+ required `role: "worker"`). The task names `buildSpawnCommand` correctly, so the implementer reads the true fields — not action-changing. No repair applied (prose, not a broken ref).
