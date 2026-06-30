# CROSS-REVIEW PACKET — plan 028, Phase 2 (DOCS) — reviewer: gpt-5.5 xhigh

You already approved P1. P2 is the **README reframe** only. Verdict, do NOT edit.

- Plan: `docs/plans/028-docs-cold-start/docs-cold-start-plan.md` (Phase 2 + AC-06/07/08)
- Diff: `git diff -- README.md` (confirm ONLY README.md changed vs the P1 set)

## Check (file:line evidence)
1. **AC-06 — dual thesis at the TOP (reframe, not append).** README opens framing pij as BOTH a pi-extensions project AND a cross-agent worker system ("and more"); "the harness is the product" is kept but **subordinate**, not the lead. A bottom-appended section instead of a top reframe is a finding.
2. **Front door + workflow link.** README links `AGENTS_README.md` near the top as the agent cold-start front door, and cross-links `docs/how/workflow.md`.
3. **AC-07 — links resolve.** Independently resolve a SAMPLE of README relative links yourself (incl. `AGENTS_README.md`, `docs/how/workflow.md`, and ~3 existing feature links). A dangling link is a finding.
4. **Content preserved.** Existing feature blurbs/links (pij, session-sql, todo, minih-workbench, pi-peacock, flow-pair, telegram) remain and stay accurate — nothing accurate was deleted.
5. **AC-08 — scope.** Only README.md changed in P2 (plus the already-approved P1 files); no code/justfile/.harness diff.

## Verdict — report to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"028-p2-readme","verdict":"APPROVE|APPROVE_WITH_NOTES|FIX_REQUIRED","checked":"links:N/M sampled · thesis:top-reframe y/n","findings":[...],"summary":"…"}'
```
(Prefix `PIJ_SESSION_ID=<your-id> pij send …` if self can't resolve.)
