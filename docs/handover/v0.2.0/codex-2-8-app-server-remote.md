# Codex 2/8 — app-server `--remote` delivery (DEFERRED)

**Item id / stream at handover:** Codex items 2 (app-server `--remote`) and 8 · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** DEFERRED by Vaughan (2026-08-27, in-pane: "ignore codex for now as im remote" — no `codex login` possible). Resumes ONLY on a new ruling. Frame builders exist and are unit-proven; nothing is wired to production.
**Size estimate:** L, multi-phase · **Order / dependencies:** resume after a Vaughan ruling + `codex login`. Full phase draft: `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md`.

## 1. Why this exists (what works, what is unproven)
- **Proven (unit):** `.pi/extensions/pij/adapters/codex-rpc.ts` — `buildCodexDelivery` (`:42`) and `encodeCodexRequest` (`:77`) build the Codex `[{type:"text",text}]` frame; unit tests pass.
- **Unproven / not built:** the builders are NOT wired into `adapters/daemon-tmux.ts` `sendSocket` nor `core/spawn.ts` (the codex spawn branch). Codex CLI 0.148.0 runs but is **401 unauthenticated** — `codex login` is Vaughan's; no live proof is possible without it.
- Evidence: `docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md:21,37`; validator (cold validate-v2) findings in `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md`.

## 2. What is ruled — the 3 validator findings to resolve BEFORE resuming (`docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md`)
1. **Production route gate:** the sole `sendSocket` call is gated to claude / copilot-with-`rpcPort` (the socket-first routing in `core/daemon/loop.ts`, the Phase-4 routing invariant ~`:612-628`; verify at `d120c53`). A codex capability branch + a RED production-routing test are required there, and `core/daemon/loop.ts` must join the test manifest.
2. **Topology vs spawn contract:** `SpawnCommand` is ONE `{cmd,args,env}` process (`core/spawn.ts:144-148`), appended by `TmuxAdapter` with no shell interpretation (`adapters/tmux.ts:52-81`). "One pane command starts app-server + `codex --remote`" CANNOT be expressed. Needs a pij-owned supervisor/sidecar contract (allocation, pending-descriptor stamping, revive, teardown, orphan reap), or a Codex daemon surface without shell composition.
3. **Protocol lifecycle (codex-cli 0.148.0):** `initialize` is required; `threadId` is required for read/start/steer; `expectedTurnId` is MANDATORY on every `turn/steer` — but `buildCodexDelivery` currently makes it OPTIONAL (`codex-rpc.ts:48` and `:60`). The lifecycle `initialize → thread/list → thread/resume` must precede delivery. Decide whether `SessionDescriptor.harnessSessionId` IS the thread id or add a field.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/adapters/codex-rpc.ts:42` `buildCodexDelivery`, `:48/:60` the optional `expectedTurnId`, `:77` `encodeCodexRequest`.
- `.pi/extensions/pij/core/spawn.ts:144-148` `SpawnCommand`; `.pi/extensions/pij/adapters/tmux.ts:52-81` (no shell interpretation).
- `.pi/extensions/pij/core/daemon/loop.ts` — the `sendSocket` gate (add a codex branch).
- `.pi/extensions/pij/core/types.ts` — additive `codexRemoteSock?: string` (legacy descriptors must load).
- Full task breakdown (fake-app-server proof first, then live): `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md` §3.1-3.7.

## 4. Acceptance (behavioural, mechanical)
- Per `deferred-codex-phase.md`: a fake app-server over a temp unix socket (byte-exact 3 KB frame; idle ⇒ `turn/start`, in-flight ⇒ `turn/steer`, connection failure ⇒ `no-socket` fallback); descriptor round-trip with `codexRemoteSock`; spawn/revive topology (revive re-allocates a fresh sock). RED production-routing test for the new codex branch. Live proof on an isolated tmux server needs `codex login`.
- Mutants per the routing/lifecycle guards (a codex-gated `sendSocket` that falls to pointer without `codexRemoteSock`; an `expectedTurnId` made mandatory that reds a steer-without-it test).

## 5. Live verification (only after `codex login`)
`tmux -L s392cx`, scratch `PIJ_HOME`, worktree CLI; spawn a codex seat against a pij-owned `codex app-server --listen unix://<sock>`; `pij send --body-file` a 3 KB body; assert byte-exact in `~/.codex/sessions/…`; record the codex version. If login absent, ship on fake-server proof and mark live as open.

## 6. Risks / gotchas that already bit us
- `--remote` is experimental; `--ws-auth` semantics undecided; `codex login` is Vaughan's (ask in-pane at phase start; fake-server tasks do not wait).
- Additive schema only (E: `SessionDescriptor` changes migration-safe; legacy descriptors always load).
- Do NOT wire codex into production routing without the RED production-routing test — the validator flagged the missing gate specifically.

## 7. Open questions for the human
- `codex login` on this machine (blocks all live proof).
- Is `SessionDescriptor.harnessSessionId` the Codex thread id, or add a dedicated field? (Finding 3.)
- Confirm the scope of "item 8" — this section documents the codex app-server `--remote` delivery (item 2) and its validator phase; if "item 8" is a distinct codex task beyond `deferred-codex-phase.md`, point to its spec (#311) so it can be split into its own section.
