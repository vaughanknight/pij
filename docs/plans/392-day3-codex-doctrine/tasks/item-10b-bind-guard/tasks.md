# Item 10b: pane-misbind BIND guard + shared lifecycle-filtered resolver (the real incident fix)

**BLOCKED until s391 item 5 lands** (shared `loop.ts`). On unblock: rebase onto current main, then **RE-VERIFY every anchor below** (s391 will move `loop.ts` line numbers — DL-007). Builds on item 10a (`index-state.ts` guard, committed 751a42b). Incident: `government/incidents/2026-08-27-cross-government-pane-misbind.md`.

## Scope (o-prime requirements + cold-review F5)
1. **Shared lifecycle-filtered resolver (the CLASS fix)**: the six ad-hoc `paneId ===`/byPane filters resolve a pane→id with NO lifecycle filter, so a terminal seat on a reused pane still resolves to the dead seat. Sites (fa6378a — re-verify after s391): `core/discovery.ts:141`, `core/spawn.ts:797`, `core/cli.ts:1999`, `cli.ts:927`, `cli.ts:3764`, `cli.ts:4108`. Route ALL through ONE shared resolver (reuse/extend `IndexState.resolvePane`'s now-guarded contract, or a shared helper that excludes dissolved/failed). Update `resolvePane`'s doc comment (F2) to "delivery-target index".
2. **Grep-sweep test**: a test that scans the source for pane-resolution call sites and FAILS if any resolves without the lifecycle filter — so a SEVENTH cannot appear unfiltered.
3. **loop.ts bind guard**: refuse to bind a `lifecycle:"dissolved"` descriptor; require the pane to actually run THIS seat's identity before `applyBinding` — copilot: `--session-id <plannedHarnessSessionId>` evidence in the pane (`core/harness/copilot.ts isCopilotSessionId`/`resolveCopilotCurrentSession`); claude/codex: native session evidence. Bind path anchor (fa6378a): `core/daemon/loop.ts:350` (`if (descriptor.plannedHarnessSessionId)`) / `applyBinding` :374 — RE-VERIFY post-s391.
4. **Incident replay test (o-prime req 2)**: reproduce the ACTUAL route — a pane-less `dissolved` seat + a fresh UNREGISTERED same-harness pane → **zero deliveries AND zero binds** (drive the real daemon path, not just resolvePane returning undefined).

## Design sketch (shared resolver)
`resolveLivePane(paneId, descriptors): SessionId | undefined` — filter to non-terminal (`lifecycle ∉ {dissolved, failed}`) with a `paneId` match; `E-AMBIG` on >1; undefined on none. Replace the 6 ad-hoc filters + `IndexState.resolvePane` body with it. The grep-sweep test greps `\.paneId === ` / `filter.*paneId` in `.pi/extensions/pij/**` (excluding the shared resolver + tests) and asserts zero matches.

## Landing
10a + 10b land TOGETHER (one PR, "pane-misbind guard") after s391 item 5. Built in a SEPARATE worktree (COORD-002). Then item 12 (skill-check hardening). Then the whole s392 bundle is done → merge/push already done per-item; tell Vaughan the sqlite+sockets approach is READY → jordan spec.


## Anchors RE-VERIFIED on f4ba6ec0 (2026-08-27, post s391 item 5 + finding C)
- loop.ts bind path: `plannedHarnessSessionId` at :362; `applyBinding` :386 (planned) / :419 (discovery); `firstInferenceSeen` gate :383. (Shifted from :350.)
- The 6 ad-hoc resolvers STILL unguarded (finding C did not touch them): `core/discovery.ts:141`, `core/spawn.ts:797`, `core/cli.ts:1999`, `cli.ts:2038` (pi-only), `cli.ts:4031`, `cli.ts:4375`. Shared-resolver scope stands.
- **finding C LANDED**: `daemon.ts:1126` now `sqliteOf(this.channel)` (was `instanceof SqliteQueue`) — the dual pointer-path + recoverStaleClaims gate is fixed. (Lines 1582-1583 keep `instanceof` only for a backend-name display — benign.) So 10b does NOT need to touch daemon.ts's sq gate.
- Rebase onto f4ba6ec0 before dispatch (after item 12's PR; coder currently busy on item 12).
