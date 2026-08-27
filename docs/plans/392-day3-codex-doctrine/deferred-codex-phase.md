# Deferred — Phase 3: Codex app-server `--remote` (item 2)

**Deferred by**: Vaughan, 2026-08-27 (in-pane): "ignore codex for now as im remote" — no `codex login` possible. Resumes only on a new ruling.

## Validator findings to resolve BEFORE resuming (cold validate-v2, `pij-civil-locust`, on plan sha 29abeee3…; full text `reports/validate-v2-plan.md`)

1. **Production route gate**: the sole `sendSocket` call is gated to claude / copilot-with-`rpcPort` (`core/daemon/loop.ts:617-624`); a codex capability branch + RED production-routing test are required there, and `core/daemon/loop.ts` must join the manifest.
2. **Topology vs spawn contract**: `SpawnCommand` is one `{cmd,args,env}` process (`core/spawn.ts:144-148`) appended by `TmuxAdapter` with no shell interpretation (`adapters/tmux.ts:52-81`); "one pane command starts app-server + `codex --remote`" cannot be expressed. Needs a pij-owned supervisor/sidecar contract (allocation, pending-descriptor stamping, revive, teardown, orphan reap) wired in `cli.ts:2040-2310,2602-2696`, or a Codex daemon surface without shell composition.
3. **Protocol lifecycle (codex-cli 0.148.0 schemas)**: `initialize` is required; `threadId` is required for read/start/steer; `expectedTurnId` is mandatory on every `turn/steer` (current `buildCodexDelivery` makes it optional, `adapters/codex-rpc.ts:42-71`). Prior research specifies `initialize → thread/list → thread/resume` before delivery (`reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md:176-222`). Decide whether `SessionDescriptor.harnessSessionId` is the thread id or add a field.

## Original phase draft (plan v1.0.0)

#### Phase 3: 2 — Codex app-server `--remote` wired into delivery

**Objective**: A pij-spawned codex seat runs `codex --remote unix://<sock>` against a pij-owned `codex app-server --listen unix://<sock>`; the daemon delivers over that socket (`turn/start` idle / `turn/steer` in-flight, chosen by `thread/read canAcceptDirectInput`); fake-app-server proof first, then a live proof on an isolated tmux server.
**Domain**: pij-control-plane
**Delivers**: decision record; ws client + idle probe in `codex-rpc.ts`; `sendSocket` codex branch; spawn/revive topology; additive `codexRemoteSock`; live proof record.
**Depends on**: Phase 1 (order only); **rebase onto main after each s391 merge before starting** (shared files).
**Key risks**: `--remote` experimental; `--ws-auth`; Vaughan's `codex login` (ask in-pane at phase start; fake-server tasks do not wait).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | `workshops/codex-app-server-topology.md`: who starts/stops the app-server (spawn starts it as a sibling process in the same pane command, teardown kills it), sock path `<PIJ_HOME>/<id>/codex.sock`, `--ws-auth` decision, revive semantics; ask Vaughan in-pane for `codex login` and record the pending decision | pij-control-plane | Decision record exists; question persisted + pointer sent | Resolves the Workshop Opportunity |
| 3.2 | `adapters/codex-rpc.test.ts` (RED): fake app-server ws over a temp unix socket accepting `thread/read`, `turn/start`, `turn/steer`; assert the body is byte-exact in the frame, idle ⇒ `turn/start`, in-flight ⇒ `turn/steer`, connection failure ⇒ `no-socket` fallback | pij-control-plane | Tests FAIL for want of the client | Byte-exact 3 KB / 31-line body |
| 3.3 | Implement the ws client (`node:net` + HTTP Upgrade, or `ws` if already a dep) + `probeCodexIdle` in `codex-rpc.ts` | pij-control-plane | 3.2 GREEN | Mirror `copilot-rpc.ts` async client shape |
| 3.4 | `adapters/daemon-tmux.test.ts` (RED→GREEN): codex descriptor with `codexRemoteSock` routes through `sendSocket` codex branch; without it falls to pointer; `core/types.ts` additive `codexRemoteSock?: string` (legacy descriptors load) | pij-control-plane | Tests GREEN; descriptor round-trip test GREEN | Gate like copilot's `rpcPort` |
| 3.5 | `core/spawn.test.ts` (RED→GREEN): `buildControlSpawnCommand({harness:"codex"})` emits app-server + `--remote` topology and stamps the sock; `core/revive.test.ts`: revive re-allocates a fresh sock (never carries a dead one) | pij-control-plane | Tests GREEN | Mirror day-2 item 4 |
| 3.6 | Live proof (isolated): `tmux -L s392cx`, scratch `PIJ_HOME`, worktree CLI; spawn a codex seat, `pij send --body-file` 3 KB; assert byte-exact in `~/.codex/sessions/…`; record `reports/phase-3-live-proof.md` with codex version | pij-control-plane | Proof file with transcript excerpt + sha | Needs `codex login`; if absent, ship the PR on fake proof and mark live as open[] |
| 3.7 | Gates + pathspec commit + report; PR after cold review | pij-control-plane | Gates recorded; pointer sent | |

