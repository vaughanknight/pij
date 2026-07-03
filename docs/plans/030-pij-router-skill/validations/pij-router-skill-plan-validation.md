# Validation — pij-router-skill-plan.md

✅ **VALIDATED WITH FIXES** — 3 high, 2 medium findings; all five applied in-target and reverified.

- **Target**: `docs/plans/030-pij-router-skill/pij-router-skill-plan.md` (v1.0.0, Mode: Full, Status: READY)
- **Validated**: 2026-07-03 · adaptive (lead + deterministic proof + 1 independent critic)
- **Proof (fresh)**: `context-pack.ts:213` hardcoded path · `review.ts:134-141` verdict logic · `cli.ts:47-50,271-275` stale help + `runStub` · `package.json:7-8` bins · store fork `diff -rq` = 5 files, 331 vs 299 lines · `run.schema.json:18` status enum `open|closed` · doc targets exist
- **Thesis**: advanced — promise (token-lean router replacing flow-pair, zero protocol loss, engine untouched) is now fully specified; the two structural loss-vectors the critic found (unmapped CLI verbs, unowned references/ docs) are closed by named tasks/checks.
- **Consumers**: tasks verb (Phase 1 expandable as written) · flow-pair engine users (Non-Goals + AC-06 protect bin/tests/ledger) · multi-harness skill users (T1.8 now covers claude + pi link; AC-05 keeps NL triggers).

| Severity | Finding | Resolution |
|---|---|---|
| HIGH | Pair-resume probe `status≠complete` wrong — schema enum is `open\|closed`; 5/6 real runs sit stale-open; the one "complete" is hand-edited/schema-violating | T1.2 respecified: newest run `status=="open"` → offer (never auto-resume); missing = no signal |
| HIGH | Six CLI verbs orphaned (whoami/list/state/compact-self/phonehome/path) — invisible loss under token budgets | T1.1 coverage table + T1.6 completeness assertion |
| HIGH | 7 `references/*` docs unowned once SKILL.md becomes a shim (References index dies) | T2.2 per-file disposition (absorb/cite/retire); AC-04 checklist covers the References index |
| MEDIUM | Install verified only for claude; shim frontmatter could drop NL trigger phrases | T1.8 + `pij-skill-link` + pi check; AC-05 frontmatter clause |
| MEDIUM | Canary/compact-early prose ownership ambiguous between 00-routing and pair.md | T2.1b single-owner sentence; duplication spot-grep added to `pij-skill-check` |

**Reverification**: re-read of edited T1.1/T1.2/T1.6/T1.8/T2.1b/T2.2/AC-05 confirms each fix present and internally consistent (coverage map + gates unchanged; Status remains READY).
