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

## T002–T008 — pure `core/cli.ts` (parse + dispatch + all six verbs)

One cohesive pi-free module (P2/P4/P8): `parseArgs(argv)→Result<ParsedCommand>` (E-ARG), `dispatch(cmd, CliDeps)→CliResult{stdout,stderr,exitCode,follow?}`, and per-verb render (human + `--json`). Every verb reuses a proven core helper through the ports — `resolveSelf`/`filterByFolder` (whoami/list/send self), `liveness` (list/state/send guard), `validateCommand` (send `--command`), `EventLogPort.read({since,type,last})` (tail). Workshop-001 exit codes via a `Record<PijErrorCode,number>` (NOID/SELF/CMD/AMBIG=2, DEAD=1, NOREG=3, ARG=64).

- **F1 honoured**: `send` text delivers the **RAW** body `{from,to,body:text}` — a dedicated spec asserts the body is NOT framed (`not.toContain("[pij from")`), since the receiver frames at `session.ts:144`.
- **F2 honoured**: `--follow`/`--wait` are NOT in `dispatch` — it returns a one-shot batch plus a `follow` hint (`{kind:"tail",nextSince}` / `{kind:"wait",self,messageId}`) the **bin** (T009) drives.
- **F3 honoured**: `parseReceiptBody` added to `message.ts` for the bin's `--wait` correlation.
- `send` receipt hint reads the peer's descriptor `state` (working→queued / idle→delivered); stale peer **warns + sends**, only dead blocks (`E-DEAD`).
- `path --state` = `${pijHome}/${id}.json`; `--events`/dir from the descriptor.

**Evidence**: `core/cli.test.ts` 14 specs (parse incl. E-ARG; whoami/list incl. E-AMBIG + star-self + per-peer liveness; send incl. F1 raw-body + all four codes + stale-warn; tail since/json/follow-hint; state stall; path). Full suite **420 pass / 4 skip**. pij typecheck + Biome clean. **Single-pi-importer invariant holds** — `grep 'from "@earendil-works'` = `index.ts` + `adapters/pi-runtime.ts` only; `core/cli.ts` is pi-free.

| D2 | `dispatch` stays pure + one-shot; the two imperative behaviours (`--follow` tail loop, `--wait` receipt poll) are surfaced as a `CliResult.follow` hint for the bin instead of leaking I/O into the core. | Keeps `core/` testable vs fakes; the bin owns the only loops. |
| D3 | `EventLogPort.read(query)` already filters since/type/last, so `tail` needs no separate `filterEvents` call; `ProcessPort.env` gives whoami its `PIJ_SESSION_ID` read — both are cleaner than the dossier's first cut. | Less code; fewer moving parts. |
