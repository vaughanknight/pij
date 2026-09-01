# Coder brief — plan 117: rs push delivery does not reach a hand-started seat

From: pij-dominant-vicuna (o-prime). Reply: `pij send pij-dominant-vicuna "<msg>"`.
ACK with objections or "ack clean" BEFORE building. Load BOTH /pij and /builder skills.

## THE LIVE REPRODUCTION — DO NOT DESTROY IT
Two hand-started seats exist right now, both registered in the RS store, both idle:
- `pij-key-justine`  — Claude Code, pane **%2129**  (rs OWNS its tap: ~/.pij-rs/pane-signals/_2129.raw, pipe attached, 0 bytes captured)
- `pij-precise-iguana` — omp, pane **%2128** (LEGACY owns its tap)
These are the reproduction. Do not close them, do not reuse their panes, do not
re-tap them without saying so. If you need a clean seat, spawn your own.

## THE DEFECT
`pij-rs send --from pij-precise-iguana --to pij-key-justine ...` returns
`outcome=queued` with a receipt, and the body NEVER arrives in %2129 — still absent
after 3+ minutes. Same for msg-id `tapfix-1788237880`. The sender sees success; the
recipient sees nothing. That is the exact class this platform exists to prevent.

## WHAT IS ALREADY RULED OUT (verified by the o-prime, do not redo)
- The seat IS registered in rs with pane and proc (`pij-rs list`).
- Rust OWNS %2129's tap: `sh -c cat >> ~/.pij-rs/pane-signals/_2129.raw` is live.
- The tap file is 0 bytes, which is EXPECTED for an idle pane that is not redrawing —
  absence of tap bytes is not evidence of a broken tap.

## THE TWO SUSPECTS — discriminate, do not guess
1. **Composer recognition.** If `composer_region` does not recognise this Claude
   build's layout, the observation is Unrecognized -> `record_unknown` -> conservative
   veto -> the delivery never gets permission. Probe it directly: capture %2129
   (`tmux capture-pane -p -t %2129`), feed that exact text plus the pane's cursor
   coords through the parser in a test, and print the verdict. A recognised-blank
   verdict twice in a row is what the gate needs.
2. **Retry backoff.** The first attempts failed while LEGACY still held the tap, and
   `retry_delay` doubles per attempt to a 5-minute ceiling. A row may simply be
   sleeping. Read the queue row's attempt count and not-before time from the store
   rather than inferring it from silence.
Report WHICH ONE it is with evidence before changing any code. If it is both, say so.

## THEN FIX, red-first
- Whatever the cause, the witness is the live gesture: a send from %2128's seat
  arrives as a real turn in %2129. Prove the RED first (it is red right now — capture it).
- If it is recognition: add the failing capture as a recorded fixture (label harness +
  build + date), fix the parser, and keep the fixture. Do NOT loosen recognition into
  "unknown means permit" — unknown must stay a veto; make it RECOGNISED instead.
- If it is backoff: the fix is not shorter retries. A row whose blocking condition has
  CHANGED (the tap handed over) should be reconsidered promptly rather than sleeping out
  a backoff earned under the old condition. Name the mechanism you choose.

## ALSO REPORT (do not fix here)
`outcome=queued` is indistinguishable from delivered at the sender. Whatever you learn,
write down what the sender COULD have been told. That is PRD req-0017's second clause
and it will be someone's row.

## Scope
- Worktree /Users/jordanknight/pi-hacking/pij-worktrees/s117-delivery-repro, branch s117/delivery-repro.
- Fence: crates/daemon/**, crates/harnesses/** (composer parser), crates/testkit fixtures, docs/plans/117-delivery-repro/**.
- Forbidden: .harness/**, skills/**, other plans' folders, the receipt vocabulary, main directly.
- Gate: `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — read the VERDICT BLOCK; a pipe launders the exit code.
- Done bar: cause named with evidence, fix red-first, gate green, PR open + CI green. Do NOT merge.
