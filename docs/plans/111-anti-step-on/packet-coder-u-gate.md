# Coder packet — u-gate (plan 111 anti-step-on)

**From**: pij-middle-piranha (PM) · **Reply**: `pij send pij-middle-piranha "<msg>"`
**Your seat id**: given to you in the spawn message · **Plan**: 111 · **Unit**: u-gate · **Wave**: 1
**Contract source**: docs/plans/111-anti-step-on/impl-guide.dd.md unit row `u-gate`, FROZEN v2
(amended 2026-08-31 at the PM ack — commit 90b79f54; the pre-amendment signature is DEAD, do not
build to anything you remember or infer from CLI help).

## FIRST ACTIONS (in order)

1. Load BOTH the `/pij` skill and the `/builder` skill. You work through `/builder 6 implement`,
   acting from this packet's contracts — never improvised.
2. Read, in your worktree: `docs/plans/111-anti-step-on/plan.dd.md`,
   `docs/plans/111-anti-step-on/impl-guide.dd.md` (unit row u-gate),
   `docs/plans/111-anti-step-on/assets/pm-ack.md` (why the seam looks like this),
   and the live code: `crates/harnesses/src/interaction.rs` (154 lines — read all of it).
3. **ACK to `pij send pij-middle-piranha` with objections, or "ack clean", BEFORE you write code.**
   Objections are WANTED and are cheapest now. Four of mine were accepted and changed the
   contract; yours will be read the same way.
4. `pij report now "<did>" "<next>"` at the START and the FINISH of every unit of work. A stale
   card reads as current to everyone above you.

## Your worktree (ABSOLUTE — do not work anywhere else)

```
/Users/jordanknight/pi-hacking/pij-worktrees/s111-u-gate      branch: s111/u-gate  (off s111/anti-step-on @ bff3f506)
export CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/pij-worktrees/.target-s111-u-gate
```
A shared target dir has already produced a false red on this fleet — set yours before the first build.

## Fence — you may touch ONLY

`crates/harnesses/src/interaction.rs` and its tests. Nothing else.
u-observer owns `crates/daemon/src/pane_observer.rs` and the new `crates/harnesses/src/composer.rs`
in a parallel worktree — you build against the frozen signature, you never write it.

**NEVER touch**: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.harness/government/**`
(the governance branch), `docs/plans/110-claude-delivery/**` (live sibling plan), the frozen
receipt vocabulary in `crates/core` (Delivered/Queued/Held/Refused/SeatIsGone — plan 110 owns it),
and `main` (push-protected). You NEVER merge; the PM merges.

## FROZEN SEAM v2 — quoted verbatim from the impl-guide

```rust
// lives in pij-harnesses; u-observer implements it, YOU consume it.
pub fn composer_region(capture: &str, cursor_x: u32, cursor_y: u32) -> ComposerRegion;
pub enum ComposerRegion { Recognized(String), Unrecognized }

// your additions to InteractionGate:
pub fn record_self_injection(&self, pane: &str, payload: &str);
pub async fn permits_injection_fresh(&self, pane: &str) -> Result<bool>;
```
No harness parameter anywhere — recognition is layout-derived, exactly as the live parser does it.
Constructor gains idle window + clock injection **without breaking existing `new()` callers**
(builder or `with_` variants).

Until u-observer lands `composer_region`, stub it behind your own local test double at the
signature above — the signature is the contract, not their file.

## Your three jobs

1. **Idle expiry.** `observe_composer` stamps a change-time. A non-blank composer whose content is
   UNCHANGED for longer than the idle window (default `60_000` ms) no longer vetoes — a parked
   draft delays delivery, never blocks it. Clock is injected; tests never sleep.
2. **Self-echo exemption.** `record_self_injection(pane, payload)`: a later composer observation
   that is pij's own payload (**exact whitespace-collapsed match** — the TS rule; NOT substring,
   NOT resemblance) never ACQUIRES a hold. **No echo ever CLEARS an active human hold.** Those are
   two separate assertions and both are ac-1113.
3. **`permits_injection_fresh(pane)`.** One capture + cursor read via the gate's existing
   `TmuxPort` at call time (`TmuxPort::capture`, cursors from `TmuxPort::list_panes()`), parsed
   with `composer_region`, fed as the observation, then **ANDed with the TICK-DERIVED tap state**.
   **It NEVER drains the pane tap** — `drain_pane_tap` is destructive and owned by the observer
   loop; draining here steals the observer's bytes. So "fresh" means the COMPOSER half only.
   `Unrecognized` DEFERS (veto). That staleness limit is honest and goes in the findings doc — do
   not paper over it, and do not "fix" it by draining.
   Honest cost, state it in your notes: `list_panes()` takes no filter and enumerates every pane on
   the machine, so this is two tmux round-trips per gated send. Accepted. Cache or scope ONLY if
   measurement forces it — not on speculation.

## Test strategy — RED-FIRST IS NON-NEGOTIABLE

Pure unit tests, clock injected, no tmux.

- **ac-1111 witness (parked draft → delivery proceeds) MUST be run and SEEN FAILING on the
  pre-fix tree**, and the red output pasted into your report. A regression test green from birth
  is a claim, not a witness. Do this BEFORE the fix lands, not after.
- Port the TS contract cases **by name** from
  `.pi/extensions/pij/core/daemon/typing-guard-contract.test.ts`: parked draft ≤60s then sends;
  typing-through-restart not re-baselined; self-echo never acquires and never destroys;
  whitespace-insensitive emptiness.
- **Mutation proofs, both required and both recorded**: (a) revert idle expiry → the ac-1111
  witness fails; (b) loosen the echo match to substring → the paste-eaten test fails. If a
  mutation does NOT fail the test, that is a finding — report it, do not quietly adjust.

## Gate — must be green before you report done

```
~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate
```
Use that ABSOLUTE path. The bare `cargo` on this machine is a non-rustup 1.95 and fails the
toolchain pin (see `docs/plans/110-claude-delivery/assets/toolchain-note.md`).

## Non-goals — do NOT do these

- Do NOT invent a caret/byte-density tracker. The tap-active veto stays as-is.
- Do NOT rewrite the three InteractionGate consumers; the PM wires them at composition.
- Do NOT touch `pane_observer.rs` or write a composer parser. That is u-observer's unit.
- Keep it small. This is a delta on a live mechanism, not a redesign.

## Done means

Your suite green, pij-gate green, ac-1111 witnessed red-first with the red pasted, both mutation
proofs recorded, work committed on `s111/u-gate` and PUSHED — then report to
`pij send pij-middle-piranha` with: the commit sha, the test names that receipt ac-1111/1112/1113,
the red output, and the mutation results. Include instrument failures honestly. Do not merge.
