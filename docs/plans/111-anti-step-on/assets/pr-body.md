Closes PRD req-0004 (anti-step-on). Delta on a live mechanism, not a build: `InteractionGate`
already gated injection; this closes the four verified gaps against the TS pane-signals
reference, plus a fifth found during the work.

## What changed

- **Idle expiry** — a hold self-expires after `interaction_idle_ms` (new daemon config, default
  60s) of unchanged composer content. A parked draft now **delays** delivery instead of blocking
  it forever. This is the regression that forced TS's fleet-wide emergency bypass (72b5dd61).
- **Self-echo exemption** — pij's own injected payload never acquires a hold (exact
  whitespace-collapsed match, never substring), and **no echo ever clears an active human hold**.
- **Fresh send-boundary verdict** — `permits_injection_fresh` captures and parses at the moment
  of injection rather than trusting the last observer tick. Wired into both production consumers.
- **One parser** — the live composer parser moved out of `pane_observer.rs` into `pij-harnesses`
  behind `composer_region(capture, cursor_x, cursor_y)`; "no region" became an explicit
  `Unrecognized` that DEFERS. Copilot v1.0.82 recognition rebuilt from a live fixture.
- **ac-1117, found mid-flight: no unbounded veto.** Every veto — recognized-idle, `Unrecognized`,
  and the tap latch — decays to the tmux mode verdict once no interaction observation is younger
  than the idle window.

## Why ac-1117 exists

Wave 1's cross-check found that live Copilot v1.0.82 renders **no prompt marker**, so an entire
harness class parsed `Unrecognized` in both parsers. `Unrecognized` deferred, and idle expiry
applied only to *recognized* composers — so an unrecognized pane was vetoed forever. That is the
same over-hold this plan exists to kill, arriving through a different door, and **nothing turned
red when it happened**. Inherited rather than introduced, but this change would have entrenched
it by promoting the veto to the authorising verdict.

## Receipts

All seven ACs carry re-executable receipts in `docs/plans/111-anti-step-on/plan.dd.json`, re-run
on the **merged** tree (a green on a unit branch is not a green after composition).

Per-claim confidence, deliberately not uniform:

- **ac-1117 — genuine chronological red-first.** `unrecognized_veto_expires_to_the_tmux_mode_verdict`
  observed failing on its assertion before implementation.
- **ac-1111 — reconstructed, not chronological, and labelled as such.** The pre-fix run was a
  *compile* error, which proves a test could not run, not that behaviour was absent. Proof branch
  `s111/u-gate-proof` splits the work three ways: A `e9735b85` (clock only — witness fails on its
  assertion), B `541c9085` (expiry only — green, the isolating step), C `59822844` (remainder),
  with `C^{tree} == afba5b65^{tree}` byte-identical, so the split is provably the same work
  re-ordered rather than a tree shaped to fail.
- **ac-1115 — a PIN plus two witnesses.** The byte-equality tests over three live-recorded
  fixtures are green from birth by design; only `garbage_layout_is_unrecognized` and
  `live_copilot_v1_box_is_recognized_without_prompt_marker` are red-first.
- **ac-1116 — pinned, not built.** Asserts the *absence* of tmux calls, not merely a delivered
  receipt.

Mutation proofs, all fired: idle expiry reverted → ac-1111 witness fails; echo match loosened to
substring → paste-eaten test fails; `permits_injection_fresh` reverted to `permits_injection` →
the ac-1114 integration test fails (this one proves the **wiring**, not just the gate); wait
shortened below the idle window → ac-1111 e2e fails.

Fixtures are live-recorded from real panes on the build machine, each labelled with harness,
version, date and pane id.

## Gate status — stated honestly

`pij-gate` (rustup toolchain): **all six stages green** — toolchain, lock, fmt, clippy, test, arch.

`harness checks --quick`: **two red sensors, both verified pre-existing on main**, not introduced
here. Method: same checks run on a throwaway worktree at `origin/main` (8235f198) with the same
linked `node_modules`, comparing failure **outputs** rather than counts.
- `local-paths` — byte-identical failure on main and this branch.
- `test` — main's failing `npm-resolution-policy.integration` is also red here in isolation
  (consistent with the known npmjs egress block on this machine).

This diff touches **zero** TypeScript files, which supports that conclusion but is not the proof;
the proof is the same failures on main.

## Known limits, recorded rather than papered over

- The fresh verdict is fresh in its **composer half only**. Tap state stays tick-derived, because
  `drain_pane_tap` is destructive and owned by the observer loop. The race window shrinks from
  the observer interval to capture-to-inject — **bounded, not eliminated**.
- Cursor coordinates come from `list_panes()`, which takes no filter: two tmux round-trips per
  gated send, one of them fleet-wide. Accepted and measured, not hidden.
- The plan says three consumers; there are **two** production call sites (`DrainWorker` is both
  the queued-retry drain and the pointer worker). Checked for a third ungated injection path —
  none exists.

Full engineering log, including instrument failures and one retracted finding of my own, in
`docs/plans/111-anti-step-on/assets/findings.md` (F-1111…F-1129).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Jp9oE6hCTSUfQ8pChMzw5S
