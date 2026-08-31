# Coder packet — u-observer (plan 111 anti-step-on)

**From**: pij-middle-piranha (PM) · **Reply**: `pij send pij-middle-piranha "<msg>"`
**Your seat id**: given to you in the spawn message · **Plan**: 111 · **Unit**: u-observer · **Wave**: 1
**Contract source**: docs/plans/111-anti-step-on/impl-guide.dd.md unit row `u-observer`, FROZEN v2
(amended 2026-08-31 at the PM ack — commit 90b79f54).

> **READ THIS FIRST.** The original plan called your unit a BUILD: "implement composer_region,
> ported from the TS parser". **That was wrong and has been retracted.** The parser is ALREADY
> LIVE on this tree. Your unit is an **EXTRACTION**. If you write a new parser from the TS
> source you will have created a second implementation of a thing that already exists — one
> artifact, two formatters — which is the specific failure this amendment exists to prevent.

## FIRST ACTIONS (in order)

1. Load BOTH the `/pij` skill and the `/builder` skill. You work through `/builder 6 implement`,
   acting from this packet's contracts — never improvised.
2. Read, in your worktree: `docs/plans/111-anti-step-on/plan.dd.md`,
   `docs/plans/111-anti-step-on/impl-guide.dd.md` (unit row u-observer),
   `docs/plans/111-anti-step-on/assets/pm-ack.md`, and the live code you are moving:
   `crates/daemon/src/pane_observer.rs` — specifically `rendered_composer` at **:389-513** and
   the state machine at **:20-28** and **:258-282**.
3. **ACK to `pij send pij-middle-piranha` with objections, or "ack clean", BEFORE you write code.**
   Objections are WANTED and cheapest now — four of mine were accepted and rewrote this unit.
4. `pij report now "<did>" "<next>"` at the START and FINISH of every unit of work.

## Your worktree (ABSOLUTE — do not work anywhere else)

```
/Users/jordanknight/pi-hacking/pij-worktrees/s111-u-observer   branch: s111/u-observer  (off s111/anti-step-on @ bff3f506)
export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/.target-s111-u-observer
```
A shared target dir has already produced a false red on this fleet — set yours before the first build.

## Fence — you may touch ONLY

A new parsing module in `crates/harnesses` (e.g. `src/composer.rs`), `crates/daemon/src/pane_observer.rs`,
`crates/testkit` fakes as needed, and `crates/tmux` ONLY if capture genuinely needs a flag.

u-gate owns `crates/harnesses/src/interaction.rs` in a parallel worktree — do not touch it.
You WRITE the frozen signature; they consume it. Get it exactly right.

**NEVER touch**: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.harness/government/**`,
`docs/plans/110-claude-delivery/**`, the frozen receipt vocabulary in `crates/core`, and `main`.
You NEVER merge; the PM merges.

## FROZEN SEAM v2 — implement this VERBATIM

```rust
pub fn composer_region(capture: &str, cursor_x: u32, cursor_y: u32) -> ComposerRegion;
pub enum ComposerRegion { Recognized(String), Unrecognized }
```
No harness parameter. The cursor coordinates are load-bearing: the live parser caret-CLIPS through
`clip_payload` / `clip_multiline` and returns `None` when the cursor row falls outside the region.
Caret clipping is what makes the composer string the text UP TO THE CARET — and that string is
exactly what u-gate's idle-expiry comparison is defined over. Do not drop it.

## Your job

1. **MOVE** `rendered_composer` + its helpers (`clip_payload`, `clip_multiline`, `strip_prompt`,
   `take_chars`, `is_plain_rule`, `is_copilot_footer` — ~130 lines) from `pane_observer.rs` into
   `pij-harnesses` behind `composer_region`. It already handles: the OMP `╰─…─╯` box row; the
   lowest plain-rule pair bracketing a `❯` prompt with box-drawing chars excluded so markdown
   tables are not rules; the copilot `❯`+footer layout; caret clip; prompt strip.
2. **Make today's silent `None` an explicit `Unrecognized`.** That is the one genuinely NEW
   behaviour in this unit, and it is ac-1115's witness.
3. **Rewire `PaneObserver`** through the extracted function. Its public surface is unchanged.
4. **PRESERVE `PendingClear` BY NAME.** `pane_observer.rs:20-28, 258-282`: a blank capture with
   `tap_active` and a prior observation stays a **veto**, because a redraw yields a blank capture
   whose cursor coords may be stale. Deleting that anti-race guard turns NO acceptance criterion
   red — which is exactly why it is protected here by instruction, by test, and by a review
   priority instead of by hope. Keep its existing tests; add the redraw-race case if uncovered.
5. The TS parser (`.pi/extensions/pij/core/daemon/pane-signals.ts:76-227`) is a **CROSS-CHECK
   list for edge cases only** — never a second implementation. Its test file
   `pane-signals.test.ts:69-144` names the edges worth checking (copilot footer exclusion,
   markdown-table-not-a-rule). If you find a real divergence, REPORT it; do not silently
   "fix" the Rust to match TS.

## Test strategy

**Characterisation FIRST — that is the extraction pin.**
- Record REAL capture-pane text live from panes on this machine
  (`tmux capture-pane -p -t <pane>`), one fixture per layout, each **labelled with the harness and
  the date recorded**. If a layout has no live seat, spawn one, record, close it — and reap what
  you spawned. **An invented fixture is the exact green-that-lies shape plan 110 just paid for.**
- Assert the extracted parser is **byte-equal to the pre-move `rendered_composer`** on every
  fixture. That is what pins the move.

**ONE red-first witness** (ac-1115's new behaviour): a garbage / unrecognised capture must yield
`Unrecognized`, **not** `Recognized("")`. Prove it red at the `composer_region` level before the
fix — an empty-string Recognized would read as "composer is clear" and RELEASE the gate, which is
the failure mode. `Unrecognized` DEFERS.

Be honest in your report: the characterisation tests are a **pin**, not a witness. They are
green from birth by design, and that is correct here — say so rather than dressing them up.

## Gate — must be green before you report done

```
~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate
```
ABSOLUTE path. The bare `cargo` here is a non-rustup 1.95 that fails the toolchain pin
(`docs/plans/110-claude-delivery/assets/toolchain-note.md`).

## Non-goals

- Do NOT write a second parser from the TS source.
- Do NOT change `PaneObserver`'s public surface or `PendingClear` semantics.
- Do NOT touch `interaction.rs` or wire the consumers — u-gate and the PM own those.
- Do NOT invent a caret/byte-density tracker.

## Done means

Characterisation fixtures recorded live and labelled; byte-equality green; the `Unrecognized`
witness seen RED first with the red pasted into your report; PendingClear tests green; pij-gate
green; committed on `s111/u-observer` and PUSHED — then report to `pij send pij-middle-piranha`
with the commit sha, the test names receipting ac-1115, the red output, the fixture provenance
table (harness + date + pane), and any TS/Rust divergence you found. Do not merge.
