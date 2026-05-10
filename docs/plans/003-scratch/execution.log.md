# scratch — Execution Log

**Plan**: [scratch-plan.md](./scratch-plan.md)
**Spec**: [scratch-spec.md](./scratch-spec.md)
**Mode**: Simple
**Started**: 2026-05-10
**Companion run**: `2026-05-10T11-24-29-047Z-b0ec`

## Pre-flight

- minih 0.1.6 installed at `/Users/jordanknight/.npm-global/bin/minih`
- `pi` binary on PATH at `/Users/jordanknight/.npm-global/bin/pi`
- `.pi/extensions/` exists (`.gitkeep` only; fresh state)
- Repo clean except for `docs/plans/003-scratch/` (untracked plan dir)
- Companion booted (`code-review-companion`, run `2026-05-10T11-24-29-047Z-b0ec`); briefing sent at `2026-05-10T01:25:06Z`

## Constraint notice

Two of the 12 plan tasks (**T006 manual dogfood**, **T011 smoke run with `pi` binary**) require interactive pi access which an agent cannot drive. Agent executes T001–T005 + T007 + parts of T009/T010, commits at meaningful checkpoints, then hands off to the user for T006/T011/D-005 verification. Final ledger commit lands after user reports back.

This is the same asymmetry that surfaced as **D-013** during v0.1.0 (smoke runner needs tmux + pi binary; CI cannot run it). It is **not** a plan defect — the plan acknowledges the handoff via T006's manual checklist.

## Per-task entries

### T001 — scaffold + AC-13 timer T0 (✅ 2026-05-10T01:25:47Z)

- T0 captured: sha=`a9df8f5`, iso=`2026-05-10T01:25:47Z`
- `npm run new -- scratch` emitted 5 files + `.generated` marker
- `.generated` marker deleted (scratch is kept, not throwaway)

### T002 — store.ts (✅ commit `bda8e92`)

- 3 customTypes: `scratch:note`, `scratch:delete`, `scratch:clear`
- 3 structural guards (P6): `isNoteData` / `isDeleteData` / `isClearData`
- Method names match workshop 003 verbatim: `add` / `deleteAt` / `count` / `list` / `format` / `clear` / `rehydrate` (paste integrity with index.ts at T004)
- `list({limit: 0})` returns `[]` via explicit `if (limit === 0) return [];` guard — workshop 003's `view.slice(-limit)` had a JS quirk bug (`-0 === 0` so `slice(-0)` returns full array). **D-NNN candidate: workshop 003 latent bug.**
- Pi-free (zero `@earendil-works/*` imports)

### T003 — store.test.ts (✅ commit `bda8e92`, 21/21 passing)

- 21 tests, ~4ms run
- Coverage: positive paths (add/deleteAt/clear/list/format/rehydrate), negative paths (oversized content, out-of-range delete, malformed replay data per each guard), replay determinism (note→delete→note ⇒ ["2","3"]; clear wipes everything before it; non-custom entries ignored)
- Uses `harness/test-utils.ts makeRecorder` (P8 + D-016 pattern)

### T004 — index.ts (✅ commit `bda8e92`)

- Subcommand dispatch: `list` / `add` / `del` / `clear` (+ `""` aliases to `list`)
- `--tag <t> <text>` parser
- 2 TypeBox tools: `scratch_save` + `scratch_list`
- Status line: `scratch: N note(s)` non-empty, empty string when zero (D-006 verification deferred to T006)
- Confirm dialog on `/scratch clear`
- `session_start` handler uses `getEntries()` (D-011 trap avoided)
- Reload-restored notify ("scratch: restored N notes") on `event.reason === "reload"`
- **D-018 (new): pi notify level enum is `info | warning | error`** — workshop 003 used `"success"` which the real pi API rejects. Mapped to `"info"`. Will land in difficulties.md at T009.

### T005 — pre-smoke self-check (✅)

- `npm run typecheck` clean
- `npm run lint` clean (after auto-format)
- `npm run test` 21/21 passing
- D-018 (notify enum drift) caught here; biome auto-formatted 3 long-line wrappings in store.ts

### T007 — smoke scenario (✅ commit `f32ac06`)

- 5-step scenario for D-005: add 2 notes → list (sanity) → /compact (30s wait) → list (load-bearing assertion)
- Note bodies hyphenated to dodge D-014 quoting risk
- Regex uses positive lookahead `(?=...)(?=...)` to assert both notes survive
- Deferred to user for actual `npm run smoke -- scratch` execution (requires tmux + pi binary + API key)

### Companion pings sent

| Sha | Subject | Sent |
|-----|---------|------|
| `bda8e92` | review-request: T001-T004 | 2026-05-10T01:29:?Z |
| `f32ac06` | review-request: T007 | 2026-05-10T01:31:?Z |

No findings received during agent-doable phase (companion may be mid-tool-call; will check at debrief).

### Discoveries & Learnings

| ID | What | Impact | Action |
|----|------|--------|--------|
| D-018 (candidate) | pi notify level enum is `info \| warning \| error`; workshop 003 uses `"success"` which the real API rejects | Workshop 003 paste-readiness drift | Mapped to `"info"` in scratch's index.ts; lands in difficulties.md at T009; encode in template `index.ts.template` if pattern repeats |
| WS003-bug-1 | `view.slice(-0)` returns the full array (JS `-0 === 0`); workshop 003 § Edge cases promised limit<1 → `(no notes)` but reference impl never delivered it | Workshop 003 latent bug | Added explicit `if (limit === 0) return [];` guard in `list()`; will note in T009 ledger update |
| OBS-1 | Workshop 003 wrote `entry.data as Note` casts (P6 violation). Already corrected to structural guards in scratch's store.ts. | Pattern P6 fidelity | Already mitigated in this PR |

### Status: agent-doable tasks complete; awaiting user handoff for T006 + T011

Next milestone is **user-driven verification** (interactive pi + smoke run). See § "Handoff to user" in scratch-plan.md execution context.

