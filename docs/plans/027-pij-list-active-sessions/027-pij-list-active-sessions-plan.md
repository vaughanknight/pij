# 027 — pij Telegram `/list`: 10 most recent **active** sessions

> Single-phase (`--simple`). One focused change to the Telegram bridge's `/list` command.

## Business Specification

### Purpose / promise
When an operator on Telegram types `/list`, they want to see **who they can address right now** — the handful of sessions that are alive and recently doing something — so they can pick one and start chatting. Today `/list` answers a subtly different question: "the 10 most recently *created* descriptor files," which includes sessions that have **crashed, been killed, or stalled** but whose `~/.pij/<id>.json` still lingers on disk (it's only removed by an explicit `pij close`). After a reset or a few dead spawns, the list fills with ghosts the operator can't actually talk to.

The promise: **`/list` shows the 10 most recently *active* sessions — dead and stalled ones filtered out — newest activity first.**

### Background — the gap is adoption, not invention
The codebase already has the canonical liveness rule and already applies it on the CLI:

- `core/state.ts:33` `liveness(pidAlive, latestEventAgeMs, staleAfterMs, working) → "active" | "stale" | "dead"` — the single source of truth: pid gone → `dead`; *working but silent past `STALE_AFTER_MS` (60s)* → `stale`; otherwise (pid alive, reachable) → `active`. A bound idle/`done` peer reads `active` however long it sits — only a peer that *claims to be working* yet went quiet is `stale`.
- `core/cli.ts:664` `liveOf(...)` — the CLI `pij list` / `pij state` already render this verdict per session (using `OsPort.isAlive(pid)` + clock).

The **Telegram** `/list` (`telegram/commands.ts:29` `formatSessionList`) never adopted it: its source is `FsRegistry.list()` (`adapters/fs-registry.ts:19`), which returns **every** descriptor file unfiltered. It sorts by `recencyKey` (`lastEventAt ?? startedAt`, `match.ts:48`) and `.slice(0, 10)` — so "10 most recent" is already true, but "active" is not enforced at all.

**This plan makes the Telegram `/list` reuse the existing `liveness()` rule** — no new liveness concept, no threshold of its own.

### Acceptance criteria
- **AC-1 — active-only.** `/list` excludes any session whose `liveness` verdict is `dead` (pid not alive) or `stale` (working but silent past `STALE_AFTER_MS`). Only `active` sessions are listed.
- **AC-2 — most-recent-active, capped 10.** Of the active sessions, the **10 most recent** by activity (`lastEventAt ?? startedAt`, newest first) are shown — the existing recency+cap rule, now applied to the *filtered* set.
- **AC-3 — reuse, don't reinvent.** The verdict comes from `core/state.ts` `liveness()` (same fn the CLI uses), fed by an injected `isAlive` pid probe + clock — `/list` defines no liveness threshold of its own.
- **AC-4 — honest empty + header.** When no sessions are active, `/list` replies a friendly "no active sessions" note (distinct from "no sessions at all" is acceptable but not required). The header counts the **active** sessions shown (e.g. `3 active sessions:`), and when more than 10 are active it reads `10 of N active (newest first):`.
- **AC-5 — Dim-0 proven.** New unit tests fail if the active-filter is removed (a dead/stale fixture would leak into the list) — mutation-verified, not vacuous.

### Constraints / non-goals
- **No registry mutation.** `/list` is read-only — it does **not** prune or `remove()` lingering dead descriptors. (Boot-time tidy of stale descriptors is the separate, already-noted future work — out of scope here.)
- **No CLI change.** `pij list` / `pij state` already filter/annotate correctly; only the Telegram `/list` path changes.
- **Keep the pure/wiring split.** Liveness selection stays a pure, injected-probe helper; grammY wiring stays thin (mirrors the existing `formatSessionList` / `registerListCommand` seam).

## Implementation Plan

### Phase 1 — active filter on Telegram `/list` (Simple)

**Files**
- `.pi/extensions/pij/telegram/commands.ts` — add the active-selection step; thread the probe+clock through `registerListCommand`.
- `.pi/extensions/pij/telegram/commands.test.ts` — Dim-0 tests for the filter + ordering + header.
- `.pi/extensions/pij/telegram/bridge.ts` — extend the list deps (probe + clock) where `registerListCommand` is wired (`bridge.ts:241`).
- `.pi/extensions/pij/telegram/index.ts` — production wiring: pass `rt`'s `OsPort.isAlive` + a real clock (`index.ts:123`, alongside `listSessions`).
- (tests) `.pi/extensions/pij/telegram/bridge.test.ts` / `index.test.ts` — update the list-deps shape if the wiring signature changes.

**Approach**
1. **New pure selector** (in `commands.ts`, exported for test):
   `selectActiveRecent(sessions, isAlive, nowMs, max = MAX_LIST): readonly SessionDescriptor[]`
   - For each descriptor compute `ageMs = nowMs - Date.parse(lastEventAt ?? startedAt)` (null/NaN → treat as past stale, i.e. `null`),
   - `verdict = liveness(isAlive(d.pid), ageMs, STALE_AFTER_MS, d.state === "working")` (import both from `../core/state.js`),
   - keep `verdict === "active"`,
   - sort by `recencyKey` desc (reuse `match.ts` — one source of truth for "newest"),
   - `.slice(0, max)`.
2. **`formatSessionList`** renders the **already-selected** list (keep it pure — selection done by the selector), with the AC-4 header keyed off the active count.
3. **`registerListCommand`** deps gain `isAlive: (pid: number) => boolean` and `now: () => number`; it calls the selector then the formatter.
4. **Production wiring** (`index.ts`): pass `rt`'s OS port `isAlive` and `() => Date.now()` (the same seams the CLI's `liveOf` uses).

**Dim-0 mutation gate (mandatory)**
- Test fixtures must include: an `active` session, a `dead` one (pid probe false), and a `stale` one (`state:"working"` + `lastEventAt` older than `STALE_AFTER_MS`). Assert only the active appear, newest-first, capped at 10.
- Prove non-vacuous: deleting the `verdict === "active"` filter (or flipping it to keep-all) must turn a test **RED**. State the RED→GREEN evidence.

**Done-when**
- `just test .pi/extensions/pij/telegram` + `just test .pi/extensions/pij/core` green.
- `just typecheck` exit 0 · `just lint` clean.
- Live check: with a real dead descriptor present, `/list` from Telegram omits it; an active session shows.

### Open decision (default chosen — flag for confirmation)
"Active" here = `liveness verdict === "active"`, which **excludes `stale`** (a worker that claims to be working but went silent >60s). If you'd rather *keep stalled sessions visible* (so you can rescue them), the predicate becomes `verdict !== "dead"`. Defaulting to **exclude stale** per the literal "active"; trivially flippable.
