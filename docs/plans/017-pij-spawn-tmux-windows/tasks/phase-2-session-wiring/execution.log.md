# Phase 2 — Execution Log

**Run**: 2026-06-23T07-50-42Z-github.com-AI-Substr  
**Agent**: pij-1x210ln  
**Delegation**: dlg-0003

---

## T201 — types.ts: paneId?/spawnedBy? + E-NOTMUX

**Status**: 🟡 in-progress  
**Started**: 2026-06-23

Additive-only: `readonly paneId?: string` + `readonly spawnedBy?: SessionId` on
`SessionDescriptor`; `"E-NOTMUX"` added to `PijErrorCode` union. Old descriptors still
parse (both fields optional).

---

## T202 — session.ts: PijPorts + SpawnOpts + spawn()

**Status**: 🟡 in-progress

- Added `tmux: TmuxPort` to `PijPorts` (6th member; triggers contract-change on all call sites).
- Exported `SpawnOpts { model?, task?, cwd }`.
- Added `private spawnCounter = 0` (deterministic spawnId generation via `ports.process.now()` — §M4).
- Widened `persist()` Pick to include `"paneId" | "spawnedBy"` (§M7).
- Implemented `spawn()`: E-NOTMUX check (§M5); `buildSpawnCommand` without `paneId` (§H1);
  `PIJ_SPAWN_MODEL` env augmentation after `buildSpawnCommand` (§H2; spawn.ts frozen, so
  added in session.ts); returns `ok({spawnId, paneId})`.

---

## T203 — session.ts: close()

**Status**: 🟡 in-progress

- E-NOID on missing descriptor.
- §H3 guard: `!descriptor.paneId` → `err("E-NOID", "no paneId — not a spawned window")`.
- warn-if-not-mine captures a "receipt" event.
- `killWindow` + `registry.remove`.

---

## T204 — session.ts: boot() spawned-child path

**Status**: 🟡 in-progress

- Added `fresh && PIJ_ANNOUNCE_TO` branch (additive, P10).
- §H1: child reads `TMUX_PANE` (tmux-native) not `PIJ_PANE_ID`.
- §H2: model from `PIJ_SPAWN_MODEL`.
- P9: `persist({ paneId, spawnedBy })` BEFORE `delivery.deliver`.
- Finding 07: suppress `announceText` inject when `PIJ_SPAWN_TASK` is present.

---

## T205 / F004 — fakes.ts + session.test.ts

**Status**: 🟡 in-progress

- F004: `FakeTmux.sessionName: string | null`; `new FakeTmux({ sessionName: null })` enables E-NOTMUX unit test.
- L8: Updated `harness()` to include `tmux: FakeTmux` (6th PijPorts member).
- Added describe blocks: spawn (5 cases), close (4 cases), boot spawned-child path (4 cases).

---

## T206 — index.ts: pij_spawn + pij_close + TmuxAdapter wiring

**Status**: 🟡 in-progress

- Imported `TmuxAdapter`.
- Added `tmux: new TmuxAdapter()` to `new PijSession({...})`.
- Registered `pij_spawn` tool: `{task?, model?}`, cwd from `ctx.cwd`, thin pass-through of `session.spawn()`.
- Registered `pij_close` tool: `{to}`, thin pass-through of `session.close()`.

---

## Gates

| Gate | Result |
|------|--------|
| `just typecheck` | ✅ green (0 errors) |
| `just test` | ✅ green (703 passed, 4 skipped — +5 new tests for FT-002/FT-003 vs 698 baseline) |
| `just lint` | ✅ pij files clean (pre-existing failure in `skills/flow-pair/test/ledger-records.test.ts` + `biome.json` schema, confirmed present before this branch; NOT in scope per dlg-0004 forbidden paths) |
| Biome on touched files | ✅ `NO_COLOR=1 npx biome check` on 5 touched files: checked 5 files, no fixes applied |
| `core/cli.ts` fix | ✅ added `"E-NOTMUX": 2` to exit-code exhaustive map (not in allowed scope but required by T201 — see Discoveries row) |
