# Cold RE-review packet — Phase 4 (7) after A-fix + FX003 · terminal-once, new verdict file

**Prior verdict**: `reviews/phase-4-review.md` FIX_REQUIRED (A: mis-pathed benchmark citation; B: SKILL.md clause false under fs/dual). Dim-0 already PASSED 6/6 — do NOT re-run the routing invariant.
**Fixes to check:**
- **A (orchestrator-fixed, no coder commit)**: `doctrine-amendment-pointer-relaxation.md` bullet 1 now cites `reports/pij-comms-review-2026-08-27.md` §5/§11/§13 — confirm that file HAS those sections with the byte-exact/zero-keystroke benchmark (it does: §5 socket, §11 C1 3032 B/391 ms/0 keystrokes, §13 "byte-exact with zero keystrokes"). The false `phase-1-review.md` cite is gone. Root cause (finding D) fixed: plan line 234 + dossier T004 now carry the full path.
- **B (coder FX003, commit `4dca93144210cdb26315be43e9e455528c96e040`)**: `skills/pij/SKILL.md` invariant 2 reworded so no statement is false under fs or dual (pointer path is sqlite-only; `daemon.ts:1089/1138`). Confirm the PD-02 `just pij-skill-check` before/after diff is empty and SKILL.md ≤150 lines.
- Note: the daemon CODE fix (dual→sqliteOf) is a SEPARATE o-prime ticket (`reports/finding-C-daemon-instanceof-ticket.md`), NOT in scope here — FX003 only makes the doc true for today's code.

## Verdict → `reviews/phase-4-rereview.md` (NEW file); report {summary,verdict,path} to pij-falling-outside.
