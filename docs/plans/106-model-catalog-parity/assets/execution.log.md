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

### Harness observations

- The allocated worktree lacked `node_modules`; targeted tests initially could not start. Reused the canonical checkout's existing dependency tree through the ignored worktree symlink.
- `lean-ctx` resolved overview/list/search against an unrelated repository despite the explicit worktree cwd, then crashed compressing Biome box-drawing output. Both were captured through `harness observe`.
- `harness plan new` did not seed schema-declared planning sections, while `dd` refuses to create absent sections. The Simple plan therefore uses the schema-valid core sections and task document; this mismatch was captured through `harness observe`.
- The first `harness checks` run reported a smoke-only failure with truncated detail; immediate `just smoke` passed all 11 scenarios, and the required full `harness checks` rerun passed every sensor. Captured as a missing composite-failure evidence signal.
