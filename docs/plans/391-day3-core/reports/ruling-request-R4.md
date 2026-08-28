# Ruling request R-4 — item 4 (`pij report now --state working` vs status-stale)
**From**: pij-associated-louse (s391) · **To**: pij-relative-panther (o-prime) · **2026-08-27T08:40Z** · non-blocking (items 6, 1, 5 proceed)

## claim
Toucan's option (b) as briefed — exempt from `status-stale` any seat whose mechanical `systemState` is `working` with fresh `lastEventAt` — deletes the detector: that is already its ONLY target population, and the suite would stay green.

## evidence (verified in source on 2953d75)
- `.pi/extensions/pij/core/anomalies.ts:606-608` — header: "status-stale — the seat is ACTIVELY EMITTING but its now/next card has not moved."
- `:636` skips seats with no `lastEventAt`; `:640` `if (inputs.nowMs - lastEventMs > statusStaleMs) continue;` — a quiet seat is never flagged. So every flagged seat is, by construction, actively emitting.
- `core/state.ts:120` — `systemState === "working"` ⇔ `state==="working"` AND event age ≤ `STALE_AFTER_MS` (60 s). "Working + fresh lastEventAt" ⊇ everything status-stale can flag.
- `core/anomalies.test.ts:31-40` fixture sets no `systemState`; production seats always carry one (`core/daemon/runtime-axis.ts:93-94`) → tests pass, fleet loses the sensor.
- The ruled exemption axis already exists and is semantic: `:645` parked states (`waiting|hold|blocked|question`) never flag; detail text `:676-683` teaches it.
- `core/orchestration/role.ts:100-121` forbids re-grounding `cardCanMislead` on anything but obligation (spine 25457).

## candidates
- **(c-remedy) — recommended.** Predicates untouched. The `--state working` rejection (`core/cli.ts:1646`) carries its remedy ("precondition travels with remedy"): `working` is the mechanical, daemon-owned axis; an active seat refreshes its card with `pij report now "<did>" "<next>"`; to park, use `--state waiting|hold|blocked|question`. Same remedy line added to the status-stale anomaly detail. Plus a `systemState:"working"` fixture that pins the detector cannot be deleted silently.
- **(c-alias)** — (c-remedy) AND accept `--state working` as an alias for "clear any parked semantic state + stamp `statusAt` now" (the command succeeds; no new `SemanticState`). Risk: a state word that is not a state.
- **(b) as briefed** — implement and accept that status-stale never fires on a daemon-managed seat. Not recommended.

## open
- R-4: which candidate? Phase 4 in `docs/plans/391-day3-core/391-day3-core-plan.md` is written to (c-remedy) and marked as the plan's only G1 gap; Phases 1–3 proceed now.
