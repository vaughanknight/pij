# tk-3a93 — architecture drift gate: negative proof (ac-0003)

**Seat**: pij-revolutionary-lungfish (PM) · 2026-08-28 ·
**Worktree**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port ·
**Toolchain observed**: rustc 1.98.0 (88d9e12ae) / cargo 1.98.0 (797e8a9bc) · Avail 200Gi

## The claim under test

A gate nobody has watched fail is a gate nobody knows works. ac-0003 demands the
drift check go **red** when a forbidden dependency is added, and the task names the
exact experiment: add `tokio` to `pij-core`, watch it fail, revert.

## The live experiment (verbatim)

```
=== 1. plant the forbidden edge: tokio in pij-core ===

[dependencies]
tokio = { version = "1", features = ["rt-multi-thread"] }

=== 2. cargo run -p pij-testkit --bin pij-arch-check ===
arch-check: 1 architecture violation(s) — the crate graph has drifted from workshop 001
  - pij-core -> tokio (dependencies): not in this crate's allow-list. If the edge is genuinely architectural, add `tokio` to [crates.pij-core].external in crates/testkit/arch-allowlist.toml, with a rationale; if it is not, put the code in the crate that owns the concern.

The allow-list is crates/testkit/arch-allowlist.toml; every row carries the reason it exists.
exit=1

=== 3. cargo test --workspace (the permanent live-graph test) ===
thread 'the_live_workspace_matches_the_ratified_graph' (284291448) panicked at crates/testkit/tests/arch_drift.rs:80:5:
live crate graph has drifted from workshop 001 R2: [ForbiddenExternal { crate_name: "pij-core", dep: "tokio", kind: Normal }]
test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
exit=101

=== 4. revert, re-check ===
(no diff = manifest restored)
arch-check: ok — 8 crates, 4 direct edges, 0 violations
exit=0
```

Both faces of the gate refuse the edge: the binary exits **1** and the workspace test
suite exits **101**, each naming the crate, the dep, the table it was declared in, and
the file to edit. Reverting the manifest restores green with no residue — `Cargo.lock`
never acquired `tokio` (`grep -c 'name = "tokio"' Cargo.lock` → 0).

## Why the ritual alone was not accepted as the deliverable

The transcript above is a one-off: it protects nothing tomorrow, and re-running it
means re-breaking the tree. `crates/testkit/tests/arch_drift.rs` is the same proof made
permanent, because `arch::check` is **pure** over a graph:

| test | fixture | asserts |
|---|---|---|
| `drifted_metadata_is_refused_with_the_reason_named` | `fixtures/arch/drifted-metadata.json` (tokio shipped in core, mockall dev-dep in store) | exactly 2 violations, of the exact variants, and the message names the edge + the file to fix |
| `clean_metadata_passes` | `fixtures/arch/clean-metadata.json` (same workspace, edges removed) | zero violations — a check that refuses everything is not a check |
| `the_live_workspace_matches_the_ratified_graph` | the real `cargo metadata` | zero violations, so the fixtures cannot drift away from the tree they describe |
| `a_dev_only_rule_never_permits_a_shipped_edge` | — | `@dev` rules refuse promotion into `[dependencies]`; shipped rules permit dev use; `@build` is a separate axis |
| `an_unknown_rule_suffix_fails_the_parse...` | — | `tokio@prod` fails the allow-list parse rather than being read as a crate named `tokio@prod` |

## What the test caught while being written

The first run of `drifted_metadata_is_refused_with_the_reason_named` **failed**: the
`ForbiddenExternal` message told the reader to add the dep to
`[crates.pij-core].external` without saying **which file** that table lives in. Fixed in
`arch.rs` rather than by relaxing the assertion — a diagnostic an agent cannot act on
costs a round trip to interpret, which is the cost this gate exists to remove.

## Interface for later waves

- `cargo run -p pij-testkit --bin pij-arch-check` — stage 5 of the gate.
- `crates/testkit/arch-allowlist.toml` — the graph as data. Every crate entry carries a
  **required `why`**; a row without a rationale fails the parse, so the list cannot
  decay into whatever happened to be added.
- Adding a dependency in any later task costs one reviewed line here. That is the point.

## done_when (dw-1be7)

- allowlist test green — **met** (`cargo test --workspace`: 5 passed in `arch_drift`,
  0 failed workspace-wide).
- negative proof recorded — **met**: this transcript, plus the re-runnable fixture test.

## Outstanding from tk-48f2

dw-a803's **gate stage-1 toolchain assert** is still not in the tree: `pij-gate` (the
one-command gate) lands at tk-81b3. `pij-arch-check` exists now, so the assert has a
home the moment the gate binary is written. Still recorded as outstanding rather than
quietly rolled into this task's green.
