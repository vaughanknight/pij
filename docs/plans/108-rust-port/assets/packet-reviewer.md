# Reviewer packet — plan 108 wave 0 (the mold)

**Role**: cross-model reviewer · **Read-only** · **Model**: github-copilot/gpt-5.6-sol (high)
**Branch**: `s108/rust-port` · **Worktree**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port` (absolute paths in
everything; this is a linked worktree, not the main clone)

## Mission

Judge the composed tree of plan 108 phase 1 — the Rust "mold" the whole pij port
will be poured into. You are the last check before the PM reports done to the
prime. **Do not edit anything.** Findings are fixed or refuted by the PM, with
evidence.

## Read in this order

1. `docs/plans/108-rust-port/plan.dd.md` — 8 acceptance criteria. **The ACs are
   the contract.**
2. `docs/plans/108-rust-port/services.dd.md` — settled interfaces, unit table,
   waves.
3. `docs/plans/108-rust-port/assets/workshops/001-architecture.md` — rulings
   R1–R6 **plus the amendments at the end** (R3-AMEND-1 seven ports, R3-AMEND-2
   async, R6a-AMEND-1 exact pin, R7 wire shape). The amendments bind as hard as
   the originals.
4. `docs/plans/108-rust-port/assets/tasks/phase-1/tasks.dd.md` — tk-48f2 … tk-81b3
   and each task's `done_when`.
5. `docs/plans/108-rust-port/assets/architecture.md` — the PM's map of what was
   built and why.
6. `docs/plans/108-rust-port/assets/reports/` — toolchain-pin, drift-negative,
   queue-mutation, first-light, gate. These are the receipts you are checking.

## The diff

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port
git log --oneline origin/main..HEAD
git diff origin/main...HEAD -- crates/ Cargo.toml pocs/ rust-toolchain.toml
```

Everything under `crates/**`, `pocs/**`, `Cargo.toml`, `rust-toolchain.toml` is
this wave's work. The TypeScript pij in the same repo is **out of scope** and must
not be touched.

## Verify, do not trust (run these yourself)

```bash
export PATH="$HOME/.cargo/bin:$PATH"      # rustup's cargo, not Homebrew's
CARGO_INCREMENTAL=0 cargo run -p pij-testkit --bin pij-gate
```

Expect five stages green: toolchain, fmt, clippy, test, arch. **If it is not
green, that is the finding.** Also worth re-running independently:

```bash
cargo test --workspace                       # expect 0 failed
cargo run -p pij-testkit --bin pij-arch-check
cargo metadata --no-deps --format-version 1 | jq -r '[.packages[].name]|join(" ")'
```

## Priority order for your judgement

1. **Plan fidelity.** Each of ac-0001..ac-0008 — is it *actually* met, by the
   evidence claimed, or does the receipt describe something adjacent? ac-0006 and
   ac-0008 were re-interpreted by prime rulings (Q3, Q4); check the rulings, then
   check the work against them.
2. **The frozen seams.** `crates/core/src/ports.rs` — seven traits, minimal,
   object-safe, no eighth smuggled in. Is anything in `core` doing IO? Does
   anything outside `store` speak SQL? Does anything outside `tmux` shell out to
   tmux?
3. **Vacuous tests.** The highest-value thing you can find. A test that passes
   whatever the code does is worse than no test. Specifically:
   - Do the shared contract suites (`pij_testkit::contract`) assert behaviour, or
     just exercise it?
   - The mutation report claims four killed mutants — spot-check one by making the
     mutation yourself and watching the named test fail. (Editing to verify then
     reverting is allowed; leave the tree clean and say so.)
   - Would the drift gate's fixtures still fail if the check were broken?
4. **Diagnostics.** Every refusal in this workspace is supposed to name its own
   fix. Find one that does not.
5. **What a wave-1 coder will get wrong.** You are reading the mold every later
   unit copies. What shape is missing, ambiguous, or easy to copy incorrectly?

## Known-and-accepted (do not report as new)

- Root `README.md` and `docs/rules-idioms-architecture/` are **outside this
  plan's fence**; quick-start lives at `crates/README.md` and the architecture doc
  in the plan assets (prime ruling Q3). Promotion is a named follow-up.
- No real CLI parity golden against the TS binary yet: the TS binary has no
  `ping`, and the live catalog is time-varying. The golden MECHANISM is proven
  against committed bytes (prime ruling Q4); real parity is wave 3.
- `cargo-mutants` is not installed; mutation evidence is manual transcripts
  (prime ruling Q5).
- Adapters (`tmux`, `harnesses`, `transport`) are empty crates. Wave 0 is the
  mold, not the port — content arrives in waves 1–4 per `services.dd.md`.
- `pocs/` is deliberately outside the workspace and the gate.

## What to send back

To the PM (`pij send pij-revolutionary-lungfish "…"`), C10 wire discipline —
**line 1 is the verdict**:

- `APPROVE` — or `CHANGES` with a numbered finding list.
- Per finding: file:line, what is wrong, why it matters, and the smallest fix you
  would accept. Severity: blocking / should-fix / note.
- **Cite the command and its output** for anything you ran. A measurement outranks
  both the packet and my claims — if a receipt in `assets/reports/` disagrees with
  what you observe, relay the contradiction verbatim rather than reconciling it.
- If you find nothing in a category, say so in one line; do not pad.

## Fences

READ-ONLY everywhere. Never write to: any file in this worktree, `the-flow.json` /
`the-flow.md` / `.the-flow-state.json`, `.harness/government/**`, the TypeScript
sources, or anything outside this worktree. A temporary edit made solely to verify
a mutation is the single exception — revert it and say what you did.
