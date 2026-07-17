# P1 review packet 006 — fix-cycle-5 re-review (cycle 6, closing)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh — you authored reviews 001–005; compacted — re-derive from artifacts.

## Who you are
Cold re-reviewer. Report ONLY via `pij send pij-civilian-takin`. Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`. Read-only except your ONE output file.

## Target
Range `3f91b22..0d295fe` — K1 `ee747c4`: fsynced `<opId>.resolved` tombstone written BEFORE unlink and RETAINED; `pending()` sweeps op+tombstone as RESOLVED, lone tombstone as garbage, discards evidence only behind a load-bearing dir fsync proving absence durable; `fsyncDirBestEffort` now reports success (void callers unaffected); port doc changes only. Coder rationale (logged): dir-fsync-load-bearing wedges Windows; a bare resurrected op is byte-identical to a live crash record — only retained durable evidence distinguishes. Diff: `git -C <worktree> diff 3f91b22..0d295fe`.

## Dimensions
1. **Resolution attack**: re-run BOTH your cycle-5 resurrection probes verbatim (aborted-intent forge after winner; committed false-block after B→C). Root-cause dead?
2. **Tombstone mechanism soundness**: crash windows of the new sequence (tombstone-written/unlink-lost; tombstone+op both resurrected; lone tombstone; tombstone fsync fails); garbage-sweep correctness (can a sweep discard evidence non-durably and reopen the race?); unbounded tombstone growth vs the retained-evidence requirement; interplay with H2's corrupt-entry wedge (corrupt tombstone?).
3. **Ruling to adjudicate**: mechanism 2 over mechanism 1 (Windows wedge rationale) — sound?
4. **Regression + fence**: conventions, contract parity (fs↔fake on the new clear/pending semantics), diff vs claims (no new source files; port docs only).
5. Severity CRITICAL|HIGH|MED; findings survive your disprove attempt; probes preferred.

## APPROVE contract
APPROVE requires: K1 root-cause dead + whole-of-P1 attestation across ALL 19 findings (cycles 1–5) + your gates run (fenced suite + typecheck). This closes Phase 1.

## Output
1. ONE file `docs/plans/054-pij-grown-up/reviews/p1-review-006.md`: verdict line first.
2. Then: `pij send pij-civilian-takin "P1 REVIEW-6 <APPROVE|FINDINGS n> · docs/plans/054-pij-grown-up/reviews/p1-review-006.md · <one-liner>"`

## Forbidden
Everything except reading + your one output file — no code edits, no the-flow files, no `government/**`, no other docs writes, no commit/push/PR, no canonical-repo writes, no daemon/tmux mutation.
