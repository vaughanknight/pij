# Item 10a: pane-resolution guard — a dissolved/terminal seat is never a resolvable pane target

**Status**: complete — implementation commit `6948e14a4cc661cffe445df60538293c8df29413`

**Base**: origin/main `fa6378a` (git log first) · **Fence**: `.pi/extensions/pij/core/daemon/index-state.ts` (+`.test.ts`) ONLY. The `loop.ts` bind-guard (item 10b) lands AFTER s391 item 5 (shared file) — NOT in this packet. · **Incident**: `~/GitHub/pij/government/incidents/2026-08-27-cross-government-pane-misbind.md` · **Ruling**: `../../rulings.md` (10:2xZ)

## Problem (verified on fa6378a)
`IndexState.rebuild` (`core/daemon/index-state.ts:44-56`) populates `byPane` for EVERY descriptor that has a `paneId` — including `lifecycle:"dissolved"`/terminal ones (line 56: `if (d.paneId) this.byPane.set(d.paneId, d.id)`, no lifecycle filter). `resolvePane` (`:94-95`) then returns a dissolved seat's id for its (possibly reused) pane. **Behavior-neutral hardening** (cold review F1): `resolvePane` has no production callers yet and `FsRegistry.list()` already drops dissolved, so this changes no live behavior TODAY — it makes `byPane`/`resolvePane` a safe delivery-target index for item 10b to wire. The `failed` exclusion is right because a terminal seat is never a delivery target (F4: a failed seat CAN own a live pane). The incident itself is fixed by 10b (bind guard + the 6 ad-hoc pane resolvers).

## Fix
`rebuild` must NOT index `byPane` for a descriptor whose `lifecycle` is `dissolved` (and any terminal/`failed` state that means "not a live seat") — a dead seat's pane is never a resolution target. `resolvePane` then returns `undefined` for it by construction. Keep every live (`bound`/`pending`) seat resolving its own pane unchanged.

## Tasks
| Status | ID | Task | Path | Done When | Notes |
|--------|-----|------|------|-----------|-------|
| [x] | T001 | `index-state.test.ts` (RED): `rebuild` with (a) a `bound` seat on pane %1, (b) a `dissolved` seat that still carries `paneId:%2` → `resolvePane('%1')` = the bound seat, `resolvePane('%2')` = `undefined`; and a `dissolved` seat whose pane %1 was REUSED by a fresh `bound` seat → `resolvePane('%1')` = the fresh bound seat, never the dissolved one. Also: a `pending` seat resolves (it is becoming live) | `.pi/extensions/pij/core/daemon/index-state.test.ts` | tests FAIL on current rebuild | fake descriptors; use the existing test's `desc` helper |
| [x] | T002 | `index-state.ts` `rebuild`: gate the `byPane` set on a non-terminal lifecycle (skip `dissolved`; decide `failed`/terminal explicitly — a `failed` pre-bind seat has no live pane either). Add a one-line comment citing the incident. Do NOT change `byId`/`byHarnessIdentity` (those are needed for audit/`pij state`) — only `byPane` | `.pi/extensions/pij/core/daemon/index-state.ts` | T001 GREEN; `just typecheck` clean; full `index-state.test.ts` GREEN | resolvePane is the only reader of byPane — verify no other consumer regresses |
| [x] | T003 | Gates (`npx vitest run .pi/extensions/pij/core/daemon/index-state.test.ts`, `just typecheck`) + pathspec commit + `reports/item-10a-report.md` (note: this is the resolution half; the loop.ts bind guard is item 10b, after s391 item 5) | `docs/plans/392-day3-codex-doctrine/reports/item-10a-report.md` | gates recorded | |

## Open (for the orchestrator, not the coder)
- Item 10b (loop.ts bind guard: refuse to bind `lifecycle:"dissolved"`; require copilot `--session-id` evidence in the pane per `core/harness/copilot.ts isCopilotSessionId`/`resolveCopilotCurrentSession`) coordinates with s391 item 5 on `loop.ts`; dispatched after s391 item 5 merges.
- The daemon-level zero-delivery reproduction (fake registry: dissolved pane-less seat + fresh unregistered same-harness pane → 0 deliveries) is the full-incident proof; it spans both halves and lands with 10b.

## → Item 10b scope expansion (cold review F5, verified)
The real pane→id resolution in production is SIX ad-hoc filters with NO lifecycle guard (a lone `failed`/terminal seat on a reused pane still resolves to the dead seat): `core/discovery.ts:141`, `core/spawn.ts:797`, `core/cli.ts:1999`, `cli.ts:927/3764/4108`. Item 10b should route these through ONE shared lifecycle-filtered resolver (reuse `IndexState.resolvePane`'s now-guarded contract, or a shared helper), plus the `loop.ts` bind guard + the daemon-level zero-delivery incident proof. F2: `resolvePane`'s doc comment (`index-state.ts:96`) still states the old pane-ownership contract — 10b wires the first real caller and must update it to "delivery-target index".

## → Item 10b — o-prime requirements (binding, 2026-08-27)
1. **The six ad-hoc resolvers are a CLASS** — fix through ONE shared lifecycle-filtered resolver (not six patches). ADD a sweep test that greps the source for pane-resolution call sites (`paneId ===`/`.paneId === pane`/byPane filters) and fails if any resolves without the lifecycle filter — so a SEVENTH cannot appear unfiltered.
2. **Incident replay test reproduces the ACTUAL route**: pane-less dissolved seat + a fresh unregistered same-harness pane → **zero deliveries AND zero binds** (not just resolvePane returning undefined — the real daemon path).
Plus (carried): loop.ts bind guard (refuse dissolved; require copilot --session-id evidence), F2 resolvePane doc-comment update. Lands WITH 10a (folded) after s391 item 5.
