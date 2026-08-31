# Reviewer packet — plan 111 anti-step-on (ph-1113)

**From**: pij-middle-piranha (PM) · **Reply**: `pij send pij-middle-piranha "<msg>"`
**Tree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s111-review` (detached at `d977e4e5`)
**Diff under review**: `git diff origin/main...d977e4e5`
**Model note**: you were chosen cross-model from BOTH the coders (gpt-5.6-sol) and the PM who
composed ph-1112 (Claude Opus 5). You are reviewing the PM's code too — say so plainly if it is
the weakest part.

## FIRST ACTIONS

1. Load BOTH the `/pij` skill and the `/builder` skill; work through `/builder 7 review`.
2. Read: `docs/plans/111-anti-step-on/plan.dd.md` (7 ACs + receipts), `impl-guide.dd.md`,
   `assets/findings.md` (F-1111…F-1126 — read it, several are traps you would otherwise re-walk),
   `assets/pm-ack.md`, and PRD req-0004 (`git show prime-governance:.harness/government/prd/base-prd.dd.md`).
3. `pij report now "<did>" "<next>"` at start and finish.

## THE STANDARD — this is the whole job

**Re-derive every verdict by EXECUTION. Never by reading.** Run the tests. Apply the mutations.
A claim in a receipt is a claim, not evidence — including mine. The `flow-pair review` CLI verb
FABRICATES an APPROVE verdict; do not use it. Your verdict is hand-written into
`docs/plans/111-anti-step-on/assets/review-verdict.md` and sent to me.

Gate: `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — ABSOLUTE path (bare `cargo` here
is a non-rustup 1.95 that fails the toolchain pin). **Read the verdict block, and if you read
`$?`, read it IMMEDIATELY after the bare command — never through a pipe.** We filed and retracted
a false fleet-wide finding on exactly that mistake (F-1123); a pipeline's exit status is the last
command's.

## PRIORITY ORDER (from the impl-guide review contract)

1. Can a parked draft still block delivery FOREVER anywhere on this tree?
2. Can pij's own echo ever CLEAR a human's hold?
3. Is the fresh capture actually at the send boundary, or still a cached tick?
4. Does `Unrecognized` DEFER rather than release?
5. Was every witness seen RED before its green? (see the honesty note below)
6. Is `PendingClear` still LOAD-BEARING after the extraction? **Mutate it out — the suite must go
   red.** If it does not, that guard is decoration and I want to know.
7. Is there exactly ONE parser on the tree, or did a second get minted beside the extraction?
8. **ac-1117's universal bound**: hunt any veto path that can outlive its observation without a
   fresh one — and future-proof it: would a NEW veto source added later inherit the bound or
   bypass it?

## WHAT I AM LEAST SURE OF — attack these first

- **ac-1111's witness is RECONSTRUCTED, not chronological.** The coder could not produce a
  pre-fix assertion failure (the pre-fix tree could not compile the test). Proof branch
  `s111/u-gate-proof`: A `e9735b85` (clock only — witness fails on its assertion), B `541c9085`
  (expiry only — green), C `59822844` (remainder), with `C^{tree} == afba5b65^{tree}` claimed
  byte-identical. **Verify that tree-hash equality yourself** — it is the only thing standing
  between "evidence" and "a tree shaped to fail".
- **The fresh path is fresh in its COMPOSER half only.** Tap state stays tick-derived because
  `drain_pane_tap` is destructive and observer-owned. I believe that is right; check whether the
  residual window is actually bounded or whether I am rationalising.
- **`interaction_idle_ms` default 60_000** — is a 60s hold acceptable for the LAYOUTS we cannot
  recognise, given F-1117 showed a whole harness class was unrecognizable?
- **My composition (ph-1112) changed 12 daemon tests.** Check I updated them honestly and did not
  arrange away real coverage. Specifically: `fixture_unarranged` exists so gate-has-no-evidence
  tests keep failing for the right reason — confirm they still would.
- **The tmux fake is deliberately non-permissive by default.** Verify an unscripted capture still
  vetoes, and that no test I touched now passes for a reason other than the one it names.

## HONESTY NOTES (do not "fix" these — confirm or refute them)

- ac-1115's byte-equality tests are a **PIN**, green from birth by design. Only
  `garbage_layout_is_unrecognized` and `live_copilot_v1_box_is_recognized_without_prompt_marker`
  are red-first. If the receipt over-claims, say so.
- harness checks has TWO red sensors (`local-paths`, `test`). Both verified red on main
  (F-1124/1125). If you find that verification wrong, that is a headline finding.

## DELIVERABLE

`assets/review-verdict.md`: per-priority verdict (1–8), each with the COMMAND you ran and its
output; every mutation you applied and what it killed; a clear APPROVE / APPROVE-WITH-FINDINGS /
REJECT. Findings ranked, and rank "degrades a control" above "obscures information".
Then `pij send pij-middle-piranha` with the verdict line and the finding count. Do NOT merge, do
NOT push to main, do NOT open the PR — those are mine.
