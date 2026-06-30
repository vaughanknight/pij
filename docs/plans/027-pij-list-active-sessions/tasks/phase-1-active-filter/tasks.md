# Phase 1 — `/list` shows the 10 most recent **ACTIVE** sessions

Plan: `docs/plans/027-pij-list-active-sessions/027-pij-list-active-sessions-plan.md`
Implements: AC-1…AC-5. Single phase. Implement **every** task below in one run.

## Thesis (do not re-derive)
The Telegram `/list` currently shows the 10 most-recently-*created* sessions from
`FsRegistry.list()` (every `~/.pij/<id>.json` on disk), so **dead/stalled ghosts**
appear. The codebase ALREADY has the canonical liveness rule — reuse it; do NOT
invent a new one:
- `core/state.ts:33` `liveness(pidAlive, latestEventAgeMs, staleAfterMs, working) → "active" | "stale" | "dead"`
  (pid gone → `dead`; working-but-silent-past-`STALE_AFTER_MS`(60s) → `stale`; else → `active`).
- `core/state.ts:7` `STALE_AFTER_MS = 60_000`.
- The CLI `pij list`/`pij state` already use this via `core/cli.ts:664` `liveOf` (your reference pattern).
- "active" for `/list` = **`liveness verdict === "active"`** (drops `dead` AND `stale`).

## Files (allowed scope — touch ONLY these)
- `.pi/extensions/pij/telegram/commands.ts` — add the selector; render filtered list; thread probe+clock.
- `.pi/extensions/pij/telegram/commands.test.ts` — Dim-0 tests.
- `.pi/extensions/pij/telegram/bridge.ts` — extend list-deps wiring (`bridge.ts:241` `registerListCommand` call site).
- `.pi/extensions/pij/telegram/index.ts` — production wiring (`index.ts:123`, alongside `listSessions: () => rt.registry.list()`).
- `.pi/extensions/pij/telegram/bridge.test.ts` and/or `index.test.ts` — update list-deps shape if the wiring signature changes.

## FORBIDDEN paths (never write)
`.the-flow-state.json`, `docs/plans/**/the-flow.json`, `docs/plans/**/the-flow.md`, `.flow-pair/**`.
Do NOT touch `core/state.ts`, `core/cli.ts`, the daemon, or `adapters/`. Do NOT
prune/remove registry descriptors (read-only — AC non-goal).

## Tasks

### T001 — pure selector `selectActiveRecent` (commands.ts)
Add and **export** (for test):
```ts
export function selectActiveRecent(
  sessions: readonly SessionDescriptor[],
  isAlive: (pid: number) => boolean,
  nowMs: number,
  max: number = MAX_LIST,
): readonly SessionDescriptor[]
```
- For each `d`: `ts = Date.parse(d.lastEventAt ?? d.startedAt)`; `ageMs = Number.isNaN(ts) ? null : nowMs - ts`.
- `verdict = liveness(isAlive(d.pid), ageMs, STALE_AFTER_MS, d.state === "working")` — import `liveness` + `STALE_AFTER_MS` from `../core/state.js`.
- Keep only `verdict === "active"`.
- Sort newest-first by `recencyKey` (import from `./match.js` — single source of truth for "newest"): `recencyKey(a) < recencyKey(b) ? 1 : recencyKey(a) > recencyKey(b) ? -1 : 0`.
- `.slice(0, max)`.

### T002 — `formatSessionList` renders the SELECTED list (commands.ts)
- `formatSessionList(sessions)` now receives the **already-active-filtered, sorted, capped** list (the selector did the work) and only renders.
- Header keyed off the **active** count (AC-4):
  - 0 → `"No active pij sessions. Spawn one, then /list again."`
  - `n` shown, and there were more active than `MAX_LIST` → `"${n} of ${total} active (newest first):"` (pass the pre-cap active total in, or compute via an overload — your call, keep it pure + testable).
  - else → `"${n} active session${n===1?"":"s"}:"`
- Keep the line format `• ${s.id} — ${s.folder}`.
- Keep the recency tie-break behaviour identical to the CLI/matcher.

### T003 — wire probe + clock through `registerListCommand` (commands.ts)
- `registerListCommand(bot, listSessions, isAlive, now)` where `isAlive: (pid:number)=>boolean`, `now: ()=>number`.
- Handler: `const active = selectActiveRecent(listSessions(), isAlive, now()); await ctx.reply(formatSessionList(active, …))`.

### T004 — production wiring (bridge.ts + index.ts)
- `bridge.ts:241` call site: pass the new deps through (extend the bridge deps interface with `isAlive` + `now` if needed — mirror how the CLI obtains them).
- `index.ts:123` production: `isAlive: (pid) => rt.os?.isAlive(pid) ?? <the OsPort the CLI uses>`, `now: () => Date.now()`. Find the real `OsPort.isAlive` seam the daemon/CLI use (`core/ports.ts` `OsPort`; `core/cli.ts` `liveOf`/`deps.isAlive`) and reuse it — do NOT reimplement a pid probe.

### T005 — Dim-0 tests (commands.test.ts)
Fixtures (pure, injected `isAlive` + fixed `nowMs`):
- an **active** session (pid alive, idle, recent),
- a **dead** session (`isAlive` → false),
- a **stale** session (`state:"working"`, `lastEventAt` older than `STALE_AFTER_MS`, pid alive),
- enough active sessions to prove the **cap at 10** and **newest-first** order.
Assert: only the active appear; dead+stale excluded; order newest-first; capped at 10; header text per AC-4.

**MANDATORY Dim-0 proof (state it in your report):** after writing tests,
mutate the filter — delete the `verdict === "active"` predicate (keep-all) — run
`just test .pi/extensions/pij/telegram`, confirm a test goes **RED**, then revert.
Report the RED→GREEN evidence (which assertion flipped). A green test that doesn't
flip is vacuous and will be rejected at review.

## Gates before you report (run them, paste results)
- `just test .pi/extensions/pij/telegram` + `just test .pi/extensions/pij/core` — green.
- `just typecheck` exit 0 · `just lint` clean.
- Only the allowed files changed (`git status`).

## Report back to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"027-p1-active-list","outcome":"COMPLETE|BLOCKED","summary":"…","filesChanged":[…],"testsRun":N,"testsPassed":N,"gatesClean":true,"dim0":"deleted verdict===active filter → <test> RED, reverted → GREEN"}'
```
(If `pij send` can't resolve self: prefix `PIJ_SESSION_ID=<your-id> pij send …`.)
