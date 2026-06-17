# Execution Log — file-watch-notify (Phase 1, Simple Mode)

Plan: `docs/plans/015-file-watch-notify/file-watch-notify-plan.md`
Started: 2026-06-17
Mode: Simple · Testing: Hybrid (TDD core vs fakes, lightweight wiring) · Companion: `code-review-companion` run `2026-06-17T00-46-24-146Z-28c2`

## Seam outcomes
- **T000 pre-implement harness seam**: DEFERRED — the `/eng-harness-flow` router is installed, but the `subagent` tool is globally blocked this session by a stuck singleton agent instance ("Agent is already processing"). Seam is best-effort/never-blocks → proceeding with standard Hybrid testing per the stage fallback. Will retry the phase-end seam (T099); if still blocked, log + skip.

## Tasks

<!-- per-task entries appended below as work completes -->

### T001 — scaffold + picomatch (e1be6df)
- `just new file-watch-notify` → generic T2 scaffold (`store.ts`/`store.test.ts`/`index.ts`/`smoke.ts`/`AGENTS.md`). Generated store/tool are placeholders to be replaced in T002/T003.
- Added `picomatch@^4.0.4` (0 transitive deps) to `dependencies`, `@types/picomatch` to devDeps.
- typecheck clean; scaffold tests green (3). Companion pinged (review-request T001 e1be6df).

### T002 + T003a + T003b — pure core (7d266a7)
- Rewrote `store.ts` as the pi-free core: `parseConfig` (tagged-union P4), `compileWatch` (picomatch, compile-once), `reconcile(prev,next)` snapshot diff, `WatchReconciler` (stateful classify + events filter + delete→re-add≤100ms coalesce), `formatNotice`.
- **Finding 01 structurally enforced**: `store.ts` imports no `fs`; `reconcile()` takes only `{mtimeMs,size}` snapshots — there is no event-type input path, so an implementer cannot fall into the directory-watch trap.
- `store.test.ts`: 15 tests covering AC-01 (only real changes notify), AC-03 (multi-pattern/multi-folder + events filter), AC-04 (atomic-save ignore-list), AC-05 (snapshot-based classify, size-only modified, coalesce window in/out). All green.
- Note: scaffold `index.ts` references the removed generic store → typecheck red until T006 rewires it (expected). Companion pinged (T002/T003 7d266a7).

### T004 — watcher adapter (a8ef77d)
- `watcher.ts`: `FolderWatcher` (fs.watch non-persistent + debounce → readdir/stat snapshot → `reconciler.apply`). Injected `WatchDeps` (P3). Re-entrancy guard queues a rescan when one is mid-flight. Never reads fs.watch event types.
- `watcher.test.ts`: real-fs integration (create/modify/delete over a tmpdir via direct `scan()`) + a fake-deps debounce test (burst → one scan). 3 green.

### T005 — inject adapter (94ee165)
- `inject.ts`: `pickInjectMode`/`deliverNotices`/`InjectPort` are pi-free + unit-tested vs a fake (AC-02 busy→steer / idle→immediate); `makePiInjectPort` adapts pij `pi-runtime.ts:41-47` and reads `isIdle()` from a fresh ctx. 4 green.

### T006 — session_start wiring (e872ac5)
- `index.ts`: P10 single handler loads `.pi/file-watch.json`, starts a `FolderWatcher` per watch, injects on change via `deliverNotices`. Reload-safe (`disposeAll` then recreate). Missing config = silent; bad config = one warning. Only `index.ts` + `inject.ts` import pi (invariant holds).
- Added a **read-only `/file-watch-notify`** status command (no tool call) so the Driver smoke can assert wiring deterministically; updated `smoke.ts` to expect the status line. typecheck clean; 22 tests green. Companion pinged T004/T005/T006.

### T007 — docs (61899b0)
- `docs/domains/file-watch-notify/domain.md` (purpose/sources/concepts/contracts/boundary/deps/history) + `docs/how/file-watch-notify.md` (config reference + directory-watch-trap rationale + steer semantics) + registry.md row/history + domain-map.md FWN node/edges (dashed pattern-only link to pij — no coupling).

### T008 — self-check + e2e wiring (fbc139e)
- Made `index.ts` accept optional `{cwd, makeWatchDeps}` (pi still calls with 1 arg) and added `index.test.ts`: e2e through the real config-load→watcher→reconcile→inject path (only pi faked) — busy→steer, idle→immediate, no-config→silent.
- **self-check**: typecheck ✓, lint ✓, test ✓ (all), smoke ✓ for file-watch-notify + every other extension EXCEPT pre-existing `pi-peacock` environmental model-string mismatch (`gpt-5.5` vs live `claude-sonnet-4.6`) — not a fwn regression. fwn Driver smoke passes.

### Companion review reconciliation (`code-review-companion`, run 2026-06-17T00-46-24-146Z-28c2)
Power-On companion reviewed all 8 commits, acked every ping, posted **9 findings** (read via `minih companion findings`, not the outside inbox lane). Disposition:

| # | Sev | Finding | Disposition | Commit |
|---|-----|---------|-------------|--------|
| 1 | HIGH | parseConfig rejects documented `add/change/unlink` | **Fixed** — alias normalization + test | 708f533 |
| 2 | HIGH | delete→re-add emits deleted then modified, not one modified | **Scoped** (option B) — AC-04 narrowed to true single-wake atomic saves; cross-wake edge documented; deferred-flush out of scope | 705ef85 |
| 3 | HIGH | fs.watch setup failure could reject session_start | **Fixed** — index already catches; added regression test | 708f533 |
| 4 | HIGH | multiple files → multiple notices per wake (spam) | **Fixed** — `deliverNotices` sends ONE combined message + test | 708f533 |
| 5 | HIGH | missing ctx defaults to immediate delivery | **Fixed** — no-ctx → steer (non-interrupting) | 708f533 |
| 6 | MED | config read errors silently ‘missing’; stale status on invalid reload | **Fixed** — ENOENT distinguished; status cleared on all invalid branches | 708f533 |
| 7 | MED | docs use `add/change/unlink` vs impl vocab | **Fixed** — aliases accepted + docs aligned | 708f533 |
| 8 | MED | T008 didn’t assert reload/shutdown disposal | **Fixed** — reload-disposal test asserts prior `close()` | 708f533 |
| 9 | HIGH | F002: deferral contradicts AC-04 + internal inconsistency | **Resolved-by-scoping** — test renamed, domain.md reworded, plan Known-Limitations added | 705ef85 |

7 of 9 fixed in code; 2 (the same delete-coalesce concern) resolved by formally narrowing AC-04 + making docs/test internally consistent (the companion's own sanctioned option). Final: 29 fwn tests, 463 total green; fwn Driver smoke ✓.

**Companion magicWand**: “Auto-derive more of the farewell retrospective directly from the coordination ledger.” (filed as a minih-side wishlist note.)

### Phase complete
- **T099 phase-end harness seam**: DEFERRED (same cause as T000 — `subagent` tool globally blocked all session; best-effort, logged + skipped).
- Companion `code-review-companion` stopped cleanly (verdict `completed`); minih auto-harvested its retro → `docs/retros/code-review-companion.md` (magicWand: expose a reliable `projectRoot` through coordination state — a minih-side ask, not pij).
- **Final gate**: typecheck ✓, lint ✓, 463 tests ✓ (29 in file-watch-notify), fwn Driver smoke ✓; only red is the pre-existing `pi-peacock` environmental model-string smoke (not a fwn regression). All 8 build tasks + 10 companion findings addressed (7 code fixes, 3 resolved-by-scoping/wording). Commits e1be6df..c2d2263.
