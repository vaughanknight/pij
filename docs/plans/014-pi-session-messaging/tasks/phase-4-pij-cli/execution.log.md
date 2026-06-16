# Phase 4 — Execution Log (pij CLI: act + observe)

Plan: `docs/plans/014-pi-session-messaging/pi-session-messaging-plan.md`
Mode: Full · Companion: `code-review-companion` run `2026-06-16T06-57-54-119Z-b4f0` (Power On Mode)

---

## T000 — Harness pre-flight (`--event pre-implement`)

Engineering-harness router is installed but the pij repo is **unadopted** (no `.harness/` governance) — the same `degraded` posture as Phases 1–3. Per the best-effort contract: proceed with standard testing (vitest tests-first for `core/`, `just` gates at T010). Recorded once here; not re-warned.

## T001 — D-A descriptor enrichment (the one extension touch)

Resolved Decision **D-A** (validation): the registry descriptor now carries a coarse `state?: "working" | "idle"` + `lastEventAt?: string` so `pij state`/`list` report working/idle + age **without a stream parse** (AC-9), and a stall = `working` ∧ stale `lastEventAt` (AC-7a).

- `core/types.ts`: `SessionDescriptor` += `state?` + `lastEventAt?` (additive, backward-compatible).
- `core/session.ts`: `PijSession` keeps the live descriptor in-memory; `boot` seeds `state:"idle"` (reload preserves prior `state`/`lastEventAt`); `capture` refreshes `lastEventAt` to the event's ISO; `onTurnStart` → `state:"working"`; new `onTurnEnd()` → `state:"idle"`; private `persist(patch)` merges + rewrites the descriptor.
- `index.ts`: subscribes `turn_end` → `session.onTurnEnd()` (reload-safe, top-level).

**Evidence**: `core/session.test.ts` 13/13 (3 new D-A specs: idle→working→idle across turns; capture refreshes lastEventAt; reload preserves state). pij typecheck-clean.

## Discoveries & Learnings

| # | Discovery | Impact |
|---|-----------|--------|
| D1 | The descriptor is the right home for `state`/`lastEventAt` (not a separate state file) — `boot`/`capture`/`turn_*` already pass through the coordinator, so one extra `registry.write` per turn/event keeps the cross-process CLI read to a single small JSON file. | AC-9 "without stream parse" satisfied cheaply; no new on-disk artifact. |
