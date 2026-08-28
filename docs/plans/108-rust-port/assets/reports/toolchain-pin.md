# tk-48f2 — toolchain pin verification (plan 108, phase 1)

**Commit**: 2b9ceeb9 · **Seat**: pij-revolutionary-lungfish (PM) ·
**Worktree**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port ·
**Ruling**: workshop 001 R6a as amended by R6a-AMEND-1 · 2026-08-28

## What the pin is defending against (measured, not assumed)

This machine carries two Rust toolchains, and before this commit the seat was using
**both at once**: `cargo`/`rustc` resolved to Homebrew 1.95.0 (`/opt/homebrew/bin`
precedes `~/.cargo/bin`) while `cargo fmt`/`cargo clippy` already resolved to 1.98.0
components. A Homebrew `cargo` is not a rustup shim, so it **ignores
`rust-toolchain.toml` silently** — the pin alone would have looked like tenet 10's fix
while leaving its exact hazard in place (green, and wrong, with no edit-time signal).

## Evidence — after the pin, under the rustup shim

```
$ rustup show active-toolchain
1.98.0-aarch64-apple-darwin (overridden by '/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/rust-toolchain.toml')

$ rustc --version
rustc 1.98.0 (88d9e12ae 2026-08-18)

$ cargo --version
cargo 1.98.0 (797e8a9bc 2026-08-05)

$ cargo fmt --version
rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18)

$ cargo clippy --version
clippy 0.1.98 (88d9e12ae1 2026-08-18)

$ cargo metadata --no-deps --format-version 1 | jq -r '.workspace_root, (.packages|length)'
/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port
0

$ /opt/homebrew/bin/rustc --version   # the shadowing toolchain, for contrast
rustc 1.95.0 (59807616e 2026-04-14) (Homebrew)

$ df -h . | tail -1
/dev/disk3s5   1.8Ti   1.6Ti   200Gi    90%   /System/Volumes/Data
```

`rustup` fetched the exact 1.98.0 toolchain on first use (5 components), which is the
point of an exact channel: any seat that clones this branch gets the same compiler
without being told, and no unit can drift it without editing a pinned file.
`cargo metadata` reports **0 packages** — correct for this commit: the manifest is
virtual and members land in tk-5f1d. `cargo build --workspace` therefore still errors
`the workspace has no members`, which is the honest state of a workspace with no crates
in it, not a failure of the pin.

## done_when

- `pocs/` excluded in the root manifest — **met** (`exclude = ["pocs"]`, Cargo.toml).
- `rustc --version` == pinned channel — **met by observation** (above), and rustup
  reports the override by path, so the pin is what is doing it.
- The **gate stage-1 assert** named in dw-a803 is **not yet in the tree**: tk-48f2's own
  instruction is "first commit, nothing else in it", and the gate binary lives in
  `crates/testkit`, which does not exist until tk-5f1d. The assert lands with the gate
  scaffolding at tk-3a93 and dw-a803 is checked there. Recorded rather than quietly
  treated as done.

## Standing rule for every later task

Invoke cargo through the rustup shim by absolute path (`~/.cargo/bin/cargo`) or with
`~/.cargo/bin` first on PATH; never depend on PATH order. `CARGO_INCREMENTAL=0`
fleet-wide. Every done-receipt carries the rustc/cargo it observed and Avail disk
(200Gi here — "rustc-LLVM ERROR: IO failure" is a full disk wearing a compiler costume).
