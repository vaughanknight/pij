# Wave 1 done report — u-tmux

**Coder**: `pij-sufficient-llama`  
**PM**: `pij-revolutionary-lungfish`  
**Implementation head before this report**: `637299244169ef6d11fc9d29ad996dfa04b2912e`

## Outcome

`crates/tmux` now owns the real `TmuxPort` adapter and every Rust-workspace tmux invocation. It implements all six frozen methods: `list_panes`, literal `send_keys`, bounded `capture`, guarded `kill`, `new_window`, and tmux-observable `user_typing`.

The parser uses four pipe-delimited fields with the user-controlled title last. `splitn(4, '|')` preserves a title containing the separator. An empty title is an existing pane with `title == ""`, not a missing pane.

## Safety interlocks

`kill` performs a fresh `list_panes` and refuses any pane id that was not resolved in that call. A session-scoped adapter uses `list-panes -s -t <session>`, so the real tests can resolve and destroy only panes in their entropy-named detached session. Removing this resolution check makes destruction happen **more often**, never something different: it is a **brake, not a policy**.

`user_typing` reports tmux's genuine `pane_in_mode` fact. Removing this check makes injection happen **more often**, never something different: it is a **brake, not a policy**. `false` means "no tmux-observable interaction" and MUST NOT be documented, or read, as "safe to inject". Wave 2's `HarnessPort` adapter must AND this fact with the stateful composer-history/tap-byte gate.

All real-adapter tests create an entropy-named detached tmux session, target only that session or panes resolved from it, and own a `Drop` teardown path. When `tmux -V` is unavailable they print the skip reason. No test lists or mutates the live operator fleet.

## Fixtures and shared contract

Captured from detached session `pij-w1-fixture-c84a1`:

- `crates/testkit/fixtures/tmux/list-panes-empty-title.txt` — sha256 `133ee2c107822a841285093589f7c61b9e238a389f0cda5d9d3a91c8c80a1fbd`, 34 bytes.
- `crates/testkit/fixtures/tmux/list-panes-hostile-title.txt` — sha256 `113f30efcc4dec510c968509f3ca6ac9e06765f38916693d1aa394f69278b723`, 57 bytes; title is `human · title | nested`.

Both are indexed with known answers in `crates/testkit/fixtures/MANIFEST.toml`; an independent manifest check matched 2/2 hashes and byte counts.

`pij_testkit::contract::tmux_contract(port, fixture)` is exercised unchanged by `FakeTmux` and the real scoped adapter. The fixture trait supplies the owned pane/session data; adapter-specific mechanisms remain adapter tests.

## Targeted proof

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w1-tmux-target CARGO_INCREMENTAL=0 cargo test --locked -p pij-tmux -- --nocapture
```

Result: 2 parser tests + 6 adapter/contract tests passed. The real tests proved:

- `capture(0)` returns zero lines; an overlong request returns all available rows; one line returns the final available row.
- `pane_in_mode` is false normally and true in copy mode.
- an unresolved pane id is refused without destroying the isolated session.
- missing `tmux` is `PijError::Adapter` naming installation and `PATH` as the fix.
- shared contract operations remain inside the owned session, including failure-path teardown.

## Mutation transcript

Mutation: replace `line.splitn(4, FIELD_SEPARATOR)` with `line.split(FIELD_SEPARATOR)`.

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w1-tmux-target CARGO_INCREMENTAL=0 cargo test --locked -p pij-tmux parse::tests::title_keeps_the_field_separator_because_the_final_field_is_unsplit -- --exact
```

Observed failure:

```text
test parse::tests::title_keeps_the_field_separator_because_the_final_field_is_unsplit ... FAILED
assertion `left == right` failed
  left: "human · title "
 right: "human · title | nested"
test result: FAILED. 0 passed; 1 failed
```

After restoring `splitn(4, ...)`, the same named test passed: `1 passed; 0 failed`.

## Canonical gate

Environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (rust-toolchain.toml override)
/dev/disk3s5: 140 GiB available
CARGO_TARGET_DIR=/tmp/pij-w1-tmux-target
CARGO_INCREMENTAL=0
```

Command:

```text
cargo run --locked -p pij-testkit --bin pij-gate
```

Result:

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

Full log: `/Users/jordanknight/.pij/pij-sufficient-llama/bg-mtdkwyq9-mf50e2.log`. `git status --short` was empty after the gate.

## Composition recipe

Add:

```rust
use pij_tmux::TmuxAdapter;
```

Replace the current refusal in `crates/daemon/src/lib.rs`:

```rust
AdapterChoice::Real => return Err(not_yet("tmux", "u-tmux, wave 1")),
```

with:

```rust
AdapterChoice::Real => Arc::new(TmuxAdapter::new()),
```

No config field is required.

## Shared-merge and derived files touched

PM sequencing required:

- `Cargo.lock` — dependency edges for `pij-tmux`.
- `crates/testkit/arch-allowlist.toml` — `pij-core`, `pij-testkit@dev`, and `async-trait` permissions with rationale.
- `crates/testkit/src/contract.rs` — appended `TmuxContractFixture` and `tmux_contract`; existing suites unchanged.
- `crates/testkit/fixtures/MANIFEST.toml` — appended two tmux fixture blocks.
- `crates/testkit/fixtures/arch/clean-metadata.json` and `drifted-metadata.json` — regenerated derived graph snapshots after merging base `98925865`; the drifted snapshot re-plants only `pij-core -> tokio` and `pij-store -> mockall@dev`.

## Assumptions

1. Production `TmuxAdapter::new()` intentionally lists all sessions; tests must use `TmuxAdapter::for_session`.
2. Pane titles may contain the selected field separator; title-last `splitn` preserves it. The parser assumes tmux keeps each formatted pane on one output line.
3. `capture` preserves tmux's blank visible rows. The line-count boundary is applied to those returned rows, not to nonblank content only.
4. `send_keys` means literal text (`tmux send-keys -l`), not named key interpretation.
5. `pane_in_mode` is the only interaction fact this adapter claims. It is insufficient alone for injection safety; wave 2 owns the remaining stateful gate.
6. The PM will regenerate `Cargo.lock` and architecture snapshots from the composed tree rather than hand-merging coder-derived copies.
