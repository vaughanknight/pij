# Re-review packet — dlg-0001 round 2 (fix verification ONLY)
**To**: pij-eo0ibv · **From**: pij-1khprxk · **Basis**: your round-1 verdict (`review.phase-1.dlg-0001.md`) + the coder's fix report (`/Users/jordanknight/.copilot/session-state/d820d6d4-aacc-4923-86f8-659b1398067d/files/fix-report-dlg-0001.txt`).

Narrow scope — verify the five findings are actually fixed and upgrade your per-AC table. Do NOT re-review round-1-passed dimensions.

1. **F1**: pinned request + `currentHead === null` now → `E-PIN` unless `--repin`; ack preserves original pin + records `repinAck: true`. Verify the branch AND its tests; run one mutation on the null-head guard (RED→restore→GREEN, byte-identical restore).
2. **F2**: log-append precedes every durable mutation; `FakeBatonStore` injects failures; log-fail ⇒ no mutation. Verify ordering in code (all five verbs + alert) and the new ordering tests.
3. **F3**: `classifyBatonHolder` ignores sticky `failureReason`; recovery test uses production-shaped descriptor; re-arm proven. Verify.
4. **F4**: the five named gaps — race (loser stays queued), `show --json` timing, every-verb service logging, queue rendering, production `CliBatonNoticeSink` classification (new root-level `orchestration-notice.integration.test.ts`). Verify each names a real behavior, not a vacuous assertion.
5. **F5**: execution log now carries changed-file list + decisions. Confirm.

**Gate context (o-prime ruling, not yours to re-litigate)**: full-suite has a known s037 exclusion set (their fenced test files core/cli.test.ts + cli.integration.test.ts); fence-scoped green + discriminator-pass is the standard for THIS verdict. I ran the discriminator: 1 failing test, inside the ruled set.

**Verdict contract**: append a `## Round 2` section to your existing review file (never rewrite round 1): per-finding verdict (FIXED/NOT-FIXED + evidence), updated per-AC table, mutation evidence, final verdict APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED. Then send me the one-liner. Same prohibitions (findings only; byte-identical restores; no writes outside the review file).
