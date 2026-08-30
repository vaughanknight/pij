# u-models done report — plan 108 wave 3

**Coder**: `pij-mobile-earthworm` · **PM**: `pij-revolutionary-lungfish` · 2026-08-30

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail=199Gi
CARGO_TARGET_DIR=/tmp/pij-w3-models-target
CARGO_INCREMENTAL=0
```

## Delivered

- `ModelCatalog::list(Option<&str>) -> Result<Vec<ModelRow>>` over all five `HarnessPort` adapters.
- Runtime filters touch only the named adapter. Provider and unfiltered queries require the whole inventory.
- Runtime/provider/selector/request-model-id remain independent fields.
- Pi and Copilot parse `~/.pi/agent/models.json`; Claude and Codex retain honest curated fallbacks; OMP runs the supported bounded `omp models --json --no-extensions` surface.
- Missing, `[]`, and raw `null` thinking levels fold to one empty `Vec`; malformed rows reject the whole inventory.
- The five adapter `models()` methods no longer return the wave-3 placeholder. A healthy adapter cannot return an empty inventory.
- The committed golden now records folded production levels. A separate corpus test still proves the raw TS fixture contains both absent and empty encodings and no emitted null.

## Mutation transcripts

### Missing request id must invalidate the whole inventory

Mutation: replace the required `requestModelId` read with the row's `selector`, allowing the malformed fixture row to survive.

```text
$ cargo test -p pij-harnesses absent_empty_and_raw_null_levels_fold_but_missing_request_id_fails_by_name
running 1 test
thread 'models::tests::absent_empty_and_raw_null_levels_fold_but_missing_request_id_fails_by_name' panicked:
missing requestModelId invalidates all rows: [ModelRow { runtime: "pi", provider: "github-copilot", selector: "github-copilot/ghost-1", request_model_id: "github-copilot/ghost-1", thinking_levels: [] }]
test result: FAILED. 0 passed; 1 failed
```

Restored the required field read; the same command passed 1/1.

### Absent and empty levels must fold

Mutation: map an absent `levels` key to `vec!["absent"]` instead of an empty vector.

```text
$ cargo test -p pij-harnesses absent_empty_and_raw_null_levels_fold_but_missing_request_id_fails_by_name
running 1 test
thread 'models::tests::absent_empty_and_raw_null_levels_fold_but_missing_request_id_fails_by_name' panicked:
assertion failed: ... selector == "claude-fable-5" ... thinking_levels.is_empty()
test result: FAILED. 0 passed; 1 failed
```

Restored the fold; the same command passed 1/1.

The first attempted `-- --exact` invocation selected zero tests because Rust's exact name includes the module path. It is not counted as mutation evidence; the two transcripts above each ran the named test and failed for the intended property.

## Gate

Canonical command:

```text
cargo run --locked -p pij-testkit --bin pij-gate
```

Observed verdict:

```text
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

Focused proof also passed: `cargo test -p pij-harnesses` (28 tests, including two ignored doctests) and testkit corpus/golden/architecture suites.

## Composition recipe

The public `ModelCatalog` entry point carries the source recipe. PM-owned integration:

```rust,ignore
use pij_harnesses::ModelCatalog;

let models = ModelCatalog::new(&services.harnesses);
let rows = models.list(filter).await?;
```

No `AdapterChoice` arm or config field changes. The already-composed `HarnessRegistry` supplies the five ports.

## Shared-merge and derived files touched

- `crates/harnesses/Cargo.toml` — `serde_json` dependency.
- `crates/testkit/arch-allowlist.toml` — reviewed `serde_json` edge.
- `crates/harnesses/src/lib.rs` — one module/export seam.
- `crates/testkit/fixtures/MANIFEST.toml` — updated folded-golden metadata and answer.
- `Cargo.lock` — regenerated derived lock.
- `crates/testkit/fixtures/arch/{clean,drifted}-metadata.json` — regenerated derived graph fixtures.

Root `Cargo.toml` was unchanged.

## Assumptions

1. Exact runtime/provider filtering is the wave-3 contract. Fuzzy id/name matching is deferred to the wave-4 CLI surface, where human-entered queries belong; `ModelRow` is not widened for it.
2. A runtime-filtered query fails only when that adapter is unavailable. Provider and unfiltered queries must assemble all five and therefore fail on any unavailable adapter.
3. Pi has no honest static inventory fallback: unreadable or empty `models.json` is an error. Copilot has measured GPT-5.6 fallbacks; Claude and Codex are explicitly curated aliases. OMP empty, malformed, non-zero, or timed-out output is an error.
4. OMP model discovery is bounded at five seconds and never refreshes extensions.
5. `ModelRow` intentionally carries only the settled five parity fields. Display name, verification, reasoning boolean, and context window remain outside this wave's frozen model contract.
6. `harness boot` and `harness checks` cannot run the TypeScript surface in this worktree because `node_modules` is absent (`tsc` and the other TS-backed sensors exit 127), matching prior wave reports; `harness checks` reported eight unavailable sensors. The Rust definition of done is `pij-gate`, which passed all six stages.
