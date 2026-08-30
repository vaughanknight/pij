# Wave 4 — u-names completion report

## Result

Ported the production memorable seat-name candidate sequence into pure `pij-core` code. The Rust mapping agrees with the canonical TypeScript implementation across ordinary, UUID, spawn, literal-NUL adopt, ship-start, tail-boundary, and non-ASCII seeds. The candidate iterator covers all 493,960 names without repetition.

No `/v1/spawn` code was changed. Per the ack ruling, core owns the candidate sequence; u-spawn owns seed derivation, registry occupancy, reservation, and explicit-id collision refusal.

## Environment

- `rustc 1.98.0 (88d9e12ae 2026-08-18)`
- `cargo 1.98.0 (797e8a9bc 2026-08-05)`
- Available disk before report: `208 GiB` on `/System/Volumes/Data`
- Target directory: `/tmp/pij-w4-names-target`

## Oracle

Canonical source:

- Checkout: `/Users/jordanknight/pi-hacking/pij`
- Commit: `c8d99b1326908a9351ff918fb6d797e8caff6c8e`
- Generator: `.pi/extensions/pij/core/memorable-id.ts`
- Corpus: `.pi/extensions/pij/core/name-corpus.ts`

The exact one-shot oracle command is recorded beside the inline golden table in `crates/core/tests/memorable_ids.rs`. It imports the canonical generator with local `tsx`, evaluates the table's 17 `(seed, attempt)` cases, and prints the space plus tagged results as JSON. The adopt cases use literal NUL code units; the non-ASCII cases prove JavaScript-compatible UTF-16 hashing rather than accidental UTF-8 hashing.

Pinned corpus:

- 1,176 adjectives
- 420 nouns
- 40 ship names
- 493,960 total identifiers

The TypeScript implementation's “1,177 adjectives” comment is a stale historical measurement denominator. Its executable corpus test and current data both say 1,176.

## Tests added

`crates/core/tests/memorable_ids.rs` proves:

1. Exact corpus counts, list-local uniqueness, lexical constraints, ship length, exclusions, and total space.
2. Exact TypeScript golden agreement, including real spawn and literal-NUL adopt seed shapes, tail boundaries, and `café-🐙` UTF-16 behavior.
3. Full-space uniqueness and reachability from both pair-start and ship-start seeds, including every ship.
4. Typed exhaustion through the narrow `MemorableIdError`.
5. Forced collision probes spread across adjective rows.
6. Realistic 405-seat spawn/adopt/UUID allocations remain distributed (`worst < 8`, more than 250 adjective rows).
7. The exact TypeScript N=3,000 spawn sample remains inside the designed ship-share range `(0.12, 0.22)`.

Targeted restored-tree result: `6 passed; 0 failed`.

## Mutation witnesses

Every mutation and restoration used an anchored edit that failed if its target was absent.

### Avalanche mix

Initial packet claim: removing `mix32` should fail the broad distribution assertion.

Observed instead:

- With `mix32(hash) = hash`, the N=3,000 ship-share test **passed**.
- The 405-seat allocation test also **passed**.
- Independent exact counts showed current unmixed spawn seeds at `503/3000 = 0.1677`, versus mixed `513/3000 = 0.171`; both satisfy the designed-rate property.
- Current unmixed N=405 counts were spawn/adopt/UUID `66/78/73`, not the source comment's historical `10/405`.

Therefore the broad distribution test cannot honestly witness this mutation with the current seed formulas. The mix was restored, then the cross-language mapping witness was run:

```text
rust_matches_the_typescript_oracle ... FAILED
seed="4dffbee3-5d42-4b02-a739-74be162940bc" attempt=0
left:  "pij-popular-tiger"
right: "pij-dangerous-dragon"
```

This proves the mix is required for the production mapping. The designed-rate test remains separately because it defends its actual property; its bounds were not overfit merely to make a mutation red.

### Probe stride

Initial packet claim, amended during ack: stride 1 should fail the realistic 405-seat allocation test while full-space reachability remains green.

Observed: the 405-seat test stayed green. With 405 uniform starts over 493,920 pairs, it almost never activates collision probing, so it cannot judge the stride.

A focused collision-sequence property was added: treat the first 80 candidates for one pair-start seed as 79 occupied slots and count adjective rows. With `PROBE_STRIDE = 1`:

```text
collision_probes_leave_the_starting_adjective_row ... FAILED
80 collision probes reached only 1 adjective rows
```

The selected coprime stride passes the same test and full-space reachability remains green. This directly proves the intended anti-clustering property without falsely claiming stride 1 loses reachability.

## Gate

Command:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w4-names-target
cargo run --locked -p pij-testkit --bin pij-gate
```

Verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

No dependency, manifest, architecture allowlist, fixture manifest, or `Cargo.lock` change was needed.

Pre-work `harness boot` separately returned `boot-typecheck-failed` from the repository's TypeScript `just typecheck` stage while suppressing compiler diagnostics; this Rust unit did not cause or suppress that red. It was recorded as harness observation `DL-001`. The required Rust six-stage gate is green above.

## Composition recipe

Public entry point: `pij_core::names::memorable_pij_id_candidates`.

- Use: `use pij_core::names::memorable_pij_id_candidates;`
- Constructor: N/A — pure function.
- Config field: N/A — u-spawn owns and passes the seed.
- Call site: only `/v1/spawn`'s absent-`--id` branch.
- Algorithm: iterate candidates in order; ask the registry to atomically reserve each; continue on occupied; use the first reservation; return the existing collision/exhaustion refusal if the iterator ends.
- Preserve: explicit `--id` and its existing collision refusal unchanged.

The full recipe also lives on the public function's rustdoc. No composition-root edit was made.

## Shared-merge files touched

- `crates/core/src/lib.rs` — one `pub mod names;` line.

## Assumptions

1. u-spawn defines the real spawn seed. This unit neither invents nor validates that integration seed.
2. Candidate mapping must match JavaScript for arbitrary Rust strings, so FNV-1a consumes UTF-16 code units unconditionally.
3. `usize` excludes TypeScript's negative/fractional attempt cases by type; only exhaustion remains a runtime error and uses dedicated `MemorableIdError` rather than daemon-wide `PijError`.
4. Corpus order is API data. The Rust lists are a direct, count-asserted transformation of the canonical TypeScript arrays; no word was added, removed, sorted, or regenerated.
5. `getrandom` is not used: entropy and seed derivation remain outside this pure module.
6. The historical `10/405` unmixed ship-rate measurement and the old 66-of-1,177 starting-row measurement do not reproduce under the current seed formulas/corpus. They remain historical explanations, not executable current thresholds.
