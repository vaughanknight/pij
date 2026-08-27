# Cold review packet — item 9-FX (test-pinned string restoration + R5) · LIVE SKILLS + HARNESS · terminal-once
**Commit**: `bcb3b8a` (branch s392-pr9fx, base origin/main) · **Diff**: `git show bcb3b8a` · PR #10 (unREDs main). · **C10**
**Fence**: `peer.md`, `orchestrator.md`, `pij-skill-check.sh`, `pij-skill-check.test.ts`. **Allowed**: READ anything; WRITE only `reviews/item-9fx-review.md`.
**Context**: item 9 removed strings that `cli.integration.test.ts` (pull-vs-push) and `acceptance-sweep.test.ts` (074 P9) pin as plan-041/074 requirements → main RED. o-prime ruling: restore the strings in the routes; the acceptance test is right and `check_links` was wrong (R5: skip `<placeholder>` link targets).

## Establish (semantic, not just gate)
1. **Restorations are semantically faithful**, not just string-present: peer.md's external-pull-ban + the tmux-control-plane self-adopt sentence + the full-flags adopt form read correctly in context (a reader loading peer.md gets the real guidance); orchestrator.md's Start/Stop-of-work report steps + the bracketed phase-report command are correct.
2. **R5 is correct and safe**: `check_links` skips ONLY angle-bracket `<...>` placeholders, still fails a real missing path. Dim-0: confirm the two R5 fixtures are non-vacuous (placeholder passes, `./does-not-exist.md` fails). Consider bypass: could a real broken link be disguised as `<...>`? (a target literally `<foo>` is a placeholder by construction — acceptable.)
3. **Gates first-hand**: `just pij-skill-check` 0 ✗ (peer 146/150, orch 114/120); `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` green; `pij-skill-check.test.ts` 5/5. (Scratch worktree needs `ln -s <main>/node_modules node_modules` to run vitest.)
4. Budget: no mandate cut to fit; peer.md freed lines by paragraph-consolidation, not by dropping content.

## Verdict → `reviews/item-9fx-review.md`; report {summary,verdict,path}. Terminal-once.
