# Research Dossier: unify pij spawn across pi / claude / copilot

**Generated**: 2026-06-28
**Query**: "make the way to spawn pi, claude or copilot the same (later more besides) — KISS, don't boil the ocean; where should the change live and what is the change surface?"
**Effort**: Standard
**Tools**: Standard
**Evidence**: 7 current sources · 1 historical

## Answer

- pij has **two disjoint spawn front doors**: the in-process **`pij_spawn` tool** (pi only) and the **`pij spawn --harness` CLI** (claude/copilot only). `--harness pi` is hard-rejected at the CLI.
- The asymmetry is **historical, not architectural**: both paths already emit the same `SpawnCommand` shape, both brief race-free via `PIJ_SPAWN_TASK`, and the per-harness differences that matter (transport, bind) are *already* polymorphic on `HarnessKind`.
- The one genuine difference: **pi self-registers at boot and needs no daemon bind**, whereas claude/copilot need the daemon to bind them (transcript discovery / deterministic planned id). So unifying the *surface* does **not** mean unifying the *bind* — pi must keep skipping the daemon.
- **KISS landing**: widen the CLI `pij spawn` to accept `--harness pi`, and in `runSpawn` dispatch on harness — pi → build the existing pi command + open a tmux window directly (no daemon, no planned id, no bind); claude/copilot → unchanged daemon path. Reuse the **pure** `buildSpawnCommand` (the CLI is not a live `PijSession`, so it cannot call `session.spawn()`).
- The exact precedent to copy is **Plan 020's `supportsBranching` + `planBranch`**: a per-harness capability predicate dispatched in `runSpawn` with typed rejects.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Two front doors exist. In-process: `pij_spawn` tool → `session.spawn()` → `buildSpawnCommand` (cmd=`"pi"`). CLI: `pij spawn --harness` → `runSpawn` → `buildControlSpawnCommand` (cmd widens to claude/copilot). | `core/session.ts:180`, `core/spawn.ts:66`, `core/spawn.ts:215`, `cli.ts:56` | Unification = collapse the *doors*, dispatch one core on `HarnessKind`. | High |
| F-02 | pi is hard-rejected from the CLI surface — `CONTROL_HARNESSES = {claude, copilot}`, enforced in both `parseSpawnArgs` and `parseAdoptArgs`. | `core/spawn.ts:359`, `:387`, `:490` | The literal edit point: widen the accepted set (spawn), keep adopt's policy a conscious choice. | High |
| F-03 | pi needs **no** daemon bind — the pi child self-registers at boot: reads `$TMUX_PANE` + `PIJ_SPAWN_ID`, persists paneId, ready-pings. claude/copilot rely on the daemon to bind. | `core/session.ts:147-159`, `cli.ts:90` ("daemon drives boot→ready→bound") | CLI pi spawn must **skip** `plannedHarnessSessionId`, the transcript snapshot, and daemon binding — only open the pane. | High |
| F-04 | Transport is already polymorphic on `HarnessKind`: `selectTransport` → pi=`inbox` (in-process receiver), claude/copilot=`sendkeys` (daemon types into pane). | `core/harness/types.ts:20-26` | A CLI-spawned pi peer's messaging works unchanged — no transport work needed. | High |
| F-05 | Race-free briefing is already uniform — both builders pass the first task via `PIJ_SPAWN_TASK` env, never a positional prompt (finding 01 / the "Agent is already processing" race). | `core/spawn.ts:62`, `:85`, `:244` | Keep this contract; CLI pi spawn briefs the same way. | High |
| F-06 | The two builders are near-twins: same `SpawnCommand` output; `buildControlSpawnCommand` "widens cmd" off `buildSpawnCommand`'s `"pi"`. | `core/spawn.ts:38-39` | A pi branch in the CLI reuses the pure `buildSpawnCommand` as-is; little new code. | High |
| F-07 | Per-harness capability dispatch already has a working pattern: `supportsBranching` predicate + `planBranch` typed-reject gating, wired in `runSpawn`. | `core/harness/types.ts:37`, `core/spawn.ts:414` (planBranch) | Copy the shape; no new architecture invented. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 020 (branch-mode) added the first per-harness capability seam (`supportsBranching`) and routed it through `runSpawn` with `resolveSelf` + typed `E-BRANCH` rejects. | `docs/plans/020-pij-spawn-branch-mode/` | Direct | Reuse `resolveSelf` for the pi peer's `PIJ_ANNOUNCE_TO`, and mirror the predicate+dispatch shape. | 

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| The CLI is **not** a live `PijSession`, so it cannot call `session.spawn()` (needs in-session self-id + pane tracking). | `core/session.ts:180-234` | Naively "calling spawn" from the CLI won't compile / won't have state. | Reuse the **pure** `buildSpawnCommand` + a `TmuxPort.newWindow` directly (exactly how the daemon spawns) — confirm in plan. |
| Who does a CLI-spawned pi peer ready-ping? (`PIJ_ANNOUNCE_TO`) | `core/spawn.ts:73`, `core/session.ts:170-177` | Without an announce target the peer fresh-boots silently; the spawning orchestrator never learns its id. | Use `resolveSelf` (as `--branch` does) → caller's pij id becomes `PIJ_ANNOUNCE_TO`; unresolved → empty (fresh announce). |
| Split-pane cap (≤2 right-side workers) is tracked **in-session**, not in the registry. | `core/session.ts:103-106` | A CLI pi spawn has no session to enforce the cap. | KISS: CLI pi spawn = **new window only** (defer `--layout split` to a later cut); note the limit. |

## Planning Handoff

- **Preserve**: the `selectTransport` per-harness contract (F-04); the `PIJ_SPAWN_TASK` race-free briefing (F-05); the pure `buildSpawnCommand` (F-06); the hexagonal pure-core / impure-adapter split; the existing in-process `pij_spawn` tool (pi-mode) must keep working unchanged; the `supportsBranching`-style predicate pattern (F-07).
- **Change carefully**: widening `CONTROL_HARNESSES` (F-02) must **not** let pi fall into the daemon bind path — pi must skip `plannedHarnessSessionId` + the transcript snapshot + daemon binding (F-03); the daemon loop's bind condition must never bind a pi descriptor.
- **Likely files/symbols**: `core/spawn.ts` (the accepted-harness set + `parseSpawnArgs`; possibly a small `harness → SpawnCommand` dispatcher), `cli.ts` `runSpawn` (dispatch on harness: pi → `buildSpawnCommand` + `TmuxPort.newWindow`, no daemon; claude/copilot → unchanged), `SPAWN_USAGE` doc string, and the spawn/CLI tests.
- **Decisions still required**: (1) confirm CLI pi spawn reuses the **pure** `buildSpawnCommand` + `TmuxPort` (not `session.spawn`); (2) `PIJ_ANNOUNCE_TO` via `resolveSelf`; (3) CLI pi = **window-only** for this cut (defer split); (4) keep **both** front doors (tool + CLI) sharing the pure builder, rather than removing the in-process tool — KISS.
