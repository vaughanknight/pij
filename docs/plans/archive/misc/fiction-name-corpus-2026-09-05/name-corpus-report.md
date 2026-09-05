# Fiction name corpus — delivery receipt

Commit: `1e85713f5d410074af926bc87b938e8767ceb8a3` on `fiction-name-corpus`.

Implementation committed; Rust and direct RS/TS proofs pass. Full acceptance remains blocked by unavailable worktree npm dependencies. No install was attempted.

## Changes

- Appended exactly 132 names in the requested universe/block order to both corpora; updated the TS universe header.
- Regenerated Rust golden vectors and six TS pins from the actual TypeScript implementation using Bun.
- Corrected packet arithmetic: **1,176 × 552 = 649,152 pairs; +40 ships = 649,192 total IDs**. Final index is `649_191`; the ship-start final pair attempt is `649_152`.
- Updated the oracle recipe beside the Rust golden table to work without node_modules (`bun --eval`).
- Only the four requested source/test files are committed. Historical `done-u-names.md` is unchanged. Existing stored IDs are untouched; future mints use the expanded space.
- Commit ends with `Co-Authored-By: Oh My Pi <noreply@oh-my-pi.dev>`.

## Gate receipts

### Rust — PASS

Command: `~/.cargo/bin/cargo test -p pij-core`, with `CARGO_TARGET_DIR` set to this worktree's `target` directory.

70 passed across unit/integration suites; 0 failed; 1 ignored doctest.

Relevant suite tail:

```text
test rust_matches_the_typescript_oracle ... ok
test collision_probes_leave_the_starting_adjective_row ... ok
test curated_corpus_is_pinned_and_clean ... ok
test realistic_collision_allocation_does_not_funnel_into_adjectives ... ok
test realistic_spawn_seeds_hit_the_designed_ship_share ... ok
test candidate_sequence_is_complete_without_repeats ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.46s
```

Final tail:

```text
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s

all doctests ran in 0.49s; merged doctests compilation took 0.14s
```

### Focused Vitest — UNAVAILABLE

Used `npx --no-install vitest run .pi/extensions/pij/core/memorable-id` to honor the no-install constraint.

```text
npm error npx canceled due to missing packages and no YES option: ["vitest@5.0.0-rc.3"]
```

Exit 1. No local node_modules; the Vitest suite did not execute.

### Composite gates — NOT GREEN

`just check` exits 1:

```text
error: Justfile does not contain recipe `check`
```

`harness boot` exits 1: `TS2688: Cannot find type definition file for 'node'`.

`harness checks` exits 1 and reports:

```text
8 check(s) failed: local-paths, typecheck, lint, test, windows-compat, smoke, pkg-audit, snapshots.
```

Missing local npm dependencies block those sensors. Native Copilot contracts passed. Standalone Biome is also absent. Rust files were formatted with rustfmt. These failures are disclosed, not waived or reported as green.

## Actual RS/TS agreement

Fresh seed: `fiction-name-corpus-2026-09-05`.

TypeScript output (Bun imports the unchanged production generator):

```text
TS fiction-name-corpus-2026-09-05 attempt=0: pij-temporary-tapir
TS fiction-name-corpus-2026-09-05 attempt=1: pij-resulting-ziller
```

Rust output (standalone executable linked against this worktree's compiled `pij_core` library):

```text
RS fiction-name-corpus-2026-09-05 attempt=0: pij-temporary-tapir
RS fiction-name-corpus-2026-09-05 attempt=1: pij-resulting-ziller
```

Both implementations agree at attempts 0 and 1.

Additional actual TS smoke output:

```text
TS stable-seed: 649192 unique ids; all 40 ships reachable
TS full-space-seed: 649192 unique ids; all 40 ships reachable
RS/TS corpus order: all 1176 adjectives, 552 nouns, 40 ships identical
```

Smoke also checked noun uniqueness, lowercase/excluded-word hygiene, all generated oracle cases, and exhaustion. This is additional proof, not a claim that Vitest ran.

Local evidence: `.harness/temp/name-corpus-oracle.json`, `name-corpus-ts-smoke.txt`, `name-corpus-proof.rs`, and compiled `name-corpus-proof`.

## Harness feedback

Observed missing-dependency gates, the nonexistent `just check` recipe, and literal NUL bytes making TS test readers/searchers classify the file as binary. Existing NUL separators were preserved byte-for-byte. Observations remain in `.harness/temp/agent/session-buffer.md` for owner disposition.

Small improvement included: the existing oracle instructions now use the dependency-free Bun path proven in this session. Highest-value further encoding: a worktree dependency-readiness check before dispatch, or a supported dependency-free corpus/parity recipe. Recommend encoding that separately; no unrelated harness change was bundled.

No push, PR, merge, daemon restart, global links, or main-checkout/node_modules mutation.
