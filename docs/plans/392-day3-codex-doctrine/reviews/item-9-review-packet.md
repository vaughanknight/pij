# Cold review packet — item 9 (pij-skill-check debt) · LIVE SKILLS · terminal-once
**Reviewer**: pij-joint-nightingale (claude-opus-5) — this is a SEMANTIC-PRESERVATION review, not a gate check. Report ONCE. · **Orchestrator**: pij-falling-outside
**Worktree**: this one · **Branch**: `s392/day3-codex-doctrine` · **Base**: `fa6378a` · **Commit**: `bfbb08d` (live skills) + `75e2fef` (report) · **Diff**: `git show bfbb08d`
**Coder report (line-by-line rationale)**: `reports/item-9-report.md` — READ IT; it names, per removed block, what was preserved. · **C10**
**Allowed**: READ anything; WRITE only `reviews/item-9-review.md`.

## What makes this pass/fail (NOT the gate)
`just pij-skill-check` = 0 ✗ is already true and is NECESSARY but NOT SUFFICIENT. These are LIVE skills every agent reads at boot. The ONLY question: **did any consolidation drop a unique, load-bearing instruction that is not restated in a compressed form or a valid `§`/invariant citation?**

## Method
For EACH removed block in `git show bfbb08d` (the `-` lines), find its replacement (`+` lines) or its cited home (`§ C*n*`, global invariant N, `batons.md`, `orient-global`). Confirm the mandate survives. The coder's report claims each one — verify, don't trust. Orchestrator spot-checked `orchestrator.md` (the biggest trim, 139→112): start/stop reports, the 15-min liveness protocol (COMPLETE/CONTINUING/BLOCKED, poke-before-redispatch, continuing-report fields), worker placement+canary, worktree tell-don't-ask all have compressed equivalents. Verify the rest (`peer.md`, `node.md`) the same way.
- A removed instruction with NO compressed equivalent AND NO valid citation = a blocking finding (name the exact lost mandate).
- A citation to a `§`/invariant that does NOT actually contain the content = a blocking finding.
- Budgets met (peer 150/150, node 150/150, orchestrator 112/120) — confirm no budget was hit by cutting a mandate rather than redundancy.

## Verdict → `reviews/item-9-review.md`; report {summary,verdict,path} to pij-falling-outside.
