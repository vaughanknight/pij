# Model catalog parity execution log

## 2026-08-28 — Phase 1

### Decisions

- Model rows now separate `runtime` from upstream `provider`, carry the exact runtime `selector`, and expose `requestModelId` for OMP `-1m` aliases.
- OMP inventory comes from `omp models --json --no-extensions`; no refresh and no SQLite binding. Missing, failed, malformed, or empty inventory is a tagged failure.
- Known GPT-5.6 OMP contexts are normalized to the measured base/`-1m` matrix. This prevents a stale user-level copy of the removed repository overrides from continuing to collapse the two variants.
- Spawn validation filters the registry by the actual target: Copilot CLI, OMP (`--harness pi --bin omp`), or Pi. Warnings remain non-blocking.

### RED → GREEN

- RED: 17 failures across registry parsing, CLI runtime filtering, exact selector output, honest OMP failure, and runtime-specific validation.
- GREEN: 82 targeted assertions across the three model suites and `sync-models.test.ts`.
- OMP spawn integration: 2/2 targeted subprocess tests passed with a hermetic OMP inventory binary.
- Static proof: `just typecheck` passed; `just lint` passed with nine pre-existing warnings; approved `harness boot` passed typecheck and the full `just test` suite; final `harness checks` passed all eight sensors.

### Live evidence

- Copilot projection returned `gpt-5.6-sol-fast`, selector `gpt-5.6-sol-fast`, upstream provider `github-copilot`, runtime `copilot`, context 1,050,000, and all six effort levels; no `-1m` selector appeared.
- OMP projection returned eight Luna/Sol/Sol Fast/Terra base and `-1m` rows. Base contexts: Luna 328,000; the other three 400,000. Every `-1m` row: 1,050,000. Each row retained its provider-qualified selector and base upstream request id.

### Independent review re-entry

- OMP effort metadata now validates and retains live `thinking: string[]` values; Pi map-key parsing remains isolated to `thinkingLevelMap`.
- The OMP inventory subprocess has a five-second bound. Timeout, command failure, invalid JSON, empty data, and any malformed row all use the unavailable-inventory path.
- Bare `pij models` fails with `E-NOREG` when OMP is unavailable instead of presenting a partial catalog. Known runtime filters and exact provider filters now share one selector.
- Focused pure suites passed 83 assertions. The filtered four-suite proof passed 49 assertions with 132 unrelated integration cases skipped, including live-shape effort, bare-unavailable, mixed-malformed, provider-filter, and OMP spawn cases.
- Dim-0: changing the whole-inventory guard from `every` to `some` made the mixed-valid/invalid fixture fail; restoring `every` returned it green.
- `just typecheck` passed; `just lint` passed with nine pre-existing warnings; final `harness checks` passed local paths, typecheck, lint, tests, Windows compatibility, smoke, package audit, and snapshots.
- Updated the existing `pij-control-plane` domain contract and map with runtime/provider/selector/request-model semantics and the bounded external OMP CLI dependency; no new domain.

### F007 review re-entry

- Live OMP emits `thinking: null` for valid non-reasoning rows. The parser now maps that explicit shape to `levels: []` while preserving whole-inventory rejection for malformed arrays, non-string or non-canonical level values, and malformed selectors.
- RED: the exact null-thinking fixture invalidated a mixed catalog and returned zero rows. GREEN: the registry suite passed 49 assertions, including coexistence with a reasoning row and malformed-thinking rejection.
- Live branch `pij models --harness omp --json` exited successfully against the complete OMP inventory.
- The known effort-proof gap is unchanged: OMP runtime evidence proves the selected model and context, not that a requested effort was honored, because no active-effort field is exposed.
- Focused model/CLI suites passed 184 assertions with one unrelated skip; the post-format registry rerun passed 49 assertions.
- `just typecheck` passed. `just lint` passed with nine pre-existing warnings. `harness checks` passed all eight sensors: local paths, typecheck, lint, tests, Windows compatibility, smoke, package audit, and snapshots.
- Pre-work `harness boot` typechecked successfully but its `just test` stage hit the existing PA-role watchdog ownership path; the later direct focused suites and full `harness checks` passed.

### Harness observations

- The allocated worktree lacked `node_modules`; targeted tests initially could not start. Reused the canonical checkout's existing dependency tree through the ignored worktree symlink.
- `lean-ctx` resolved overview/list/search against an unrelated repository despite the explicit worktree cwd, then crashed compressing Biome box-drawing output. Both were captured through `harness observe`.
- `harness plan new` did not seed schema-declared planning sections, while `dd` refuses to create absent sections. The Simple plan therefore uses the schema-valid core sections and task document; this mismatch was captured through `harness observe`.
- The first `harness checks` run reported a smoke-only failure with truncated detail; immediate `just smoke` passed all 11 scenarios, and the required full `harness checks` rerun passed every sensor. Captured as a missing composite-failure evidence signal.
