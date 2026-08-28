# Reviewer packet — plan 108 wave 1 (composed)

**Role**: cross-model reviewer · **READ-ONLY** ·
**Model**: `openrouter/z-ai/glm-5.3-flash`, effort high (cross-provider from the
sol-fast coders — you are deliberately not the same family as the seats that
wrote this)
**Branch**: `s108/rust-port` · **Worktree**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port`
**PM**: `pij-revolutionary-lungfish`

## Mission

Judge the composed wave-1 tree: four parallel units merged in dependency order
onto the wave-0 mold. You are the last check before the PM reports done.
**Do not edit anything** (one exception in § Fences).

## Read in this order

1. `docs/plans/108-rust-port/services.dd.md` — the settled unit rows.
2. `docs/plans/108-rust-port/assets/wave-1/COMMON.md` — the contract every coder
   worked under, including the five rules wave 0 paid for.
3. The four unit packets beside it (`packet-u-*.md`).
4. `docs/plans/108-rust-port/assets/reports/done-u-liveness.md`,
   `done-u-tmux.md`, `done-wave-1-u-store.md`, and the u-events report —
   **these are the receipts you are checking, not evidence you may assume.**
5. `docs/plans/108-rust-port/assets/reports/first-light-wave-1.md`.
6. `docs/plans/108-rust-port/assets/reports/review-round-{1,2}.md` — wave 0's
   eleven findings, none refuted. **Read these before writing your first note**:
   they name the mistake shapes this codebase actually makes.

## The diff

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port
git log --oneline e508cd97..HEAD          # e508cd97 = wave-0 APPROVE point
git diff e508cd97...HEAD -- crates/ Cargo.toml
```

## Verify, do not trust

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR=/tmp/pij-review-w1-target
CARGO_INCREMENTAL=0 cargo run --locked -p pij-testkit --bin pij-gate
CARGO_INCREMENTAL=0 cargo test -p pij-daemon --test first_light_wave1 -- --nocapture
```

Expect six stages green and 122 passing tests. **If it is not green, that is the
finding.** `git status --short` must be empty afterwards — a gate that mutates the
tree it judges is itself a defect (wave-0 round 3).

## Priority order

1. **Vacuous tests — the highest-value thing you can find.** Wave 0's rounds 2–4
   were all one shape: *a regression that exercises the path without exercising
   the property.* For each new test, ask what mutation it would survive. The
   reports claim mutation transcripts; **spot-check at least two by making the
   mutation yourself** and watching the named test fail (revert after; say what
   you touched).
2. **The seams between units.** These four were written in parallel behind frozen
   traits: `Event.seq` (added mid-wave by the PM, `#[serde(skip)]`), the
   tombstone fields, the queue's lease, the bus's replay/live join. Do they
   actually compose, or do they merely compile?
3. **Frozen-contract fidelity.** `crates/core/src/ports.rs` still has seven
   traits and no eighth. Did anything widen a signature, or route around one?
   Does `core` still perform no IO, and does nothing outside `store` speak SQL or
   outside `tmux` shell to tmux?
4. **The policy/brake calls.** Three were ruled this wave and each report states
   one: the queue lease (**policy** — age decides a terminal outcome), tmux `kill`
   and exact-pid liveness (**brakes** — removing them does MORE, not different).
   Are those framings correct, and does the code match the framing?
5. **Honest defaults.** `subscribe(None, …)` replays the entire spine; first light
   flagged it as a scaling question rather than a bug. Do you agree? Is there a
   consumer that would be surprised?
6. **What a wave-2 coder will get wrong** reading this as a template.

## Known-and-accepted (do not report as new)

- `harness checks` cannot run here: no node tooling in this worktree. The Rust
  gate is `pij-gate` (wave-0 assumption 12, independently reconfirmed).
- `transport` and `harness` still refuse when set to `Real` — they land in waves
  3 and 2. Their `not_yet` arms are supposed to be there.
- `user_typing` is `pane_in_mode` only; the stateful gate is a **named** wave-2
  obligation on `HarnessPort`, recorded in the doc comment, not a silent gap.
- Baselines are deferred to `u-sidecars` (no frozen contract to build against).
- Mutation evidence is manual transcripts; `cargo-mutants` is not installed.

## What to send back

To the PM (`pij send pij-revolutionary-lungfish "…"`), C10 wire discipline —
**line 1 is `APPROVE` or `CHANGES`**:

- Per finding: file:line, what is wrong, why it matters, the smallest fix you
  would accept, severity (blocking / should-fix / note).
- **Cite the command and its output** for anything you ran. Your measurement
  outranks the packet, the reports, and my composition — if a receipt disagrees
  with what you observe, relay the contradiction verbatim rather than
  reconciling it.
- Say in one line where you found nothing. Do not pad.

## Fences

READ-ONLY. Never write to this worktree, `the-flow.*`, `.harness/**`, the TS
sources, or anything outside the worktree. **One exception**: a temporary edit
made solely to verify a mutation — revert it, leave the tree clean, and say
exactly what you touched.
