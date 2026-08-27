# Re-review packet — `docs/specs/claude-copilot-sqlite-sockets-comms.md` after FIX_REQUIRED

**Scope**: verify ONLY that the findings in `docs/plans/393-jordan-spec/reviews/spec-review.md` are resolved; do not re-review the whole document. Same rules as the first packet (`spec-review-packet.md`): read-only, one file you may write — `docs/plans/393-jordan-spec/reviews/spec-rereview.md`; C10 reply.
**Commit under review**: the spec at `HEAD` of `s393/jordan-spec` (see `git log -1 -- docs/specs/claude-copilot-sqlite-sockets-comms.md`), anchors still on `main@ed20a68`.

## Finding → where the fix landed (verify each)
- D1-1 test name → §6.2 (prefix cited, suffix noted as historical).
- D1-2 "L2" → §7.3 step 5 (full report path + described observation).
- D1-3 bind terms → §9.1 (defined; `EXT/core/bind-health.ts:30-47`, `cli.ts:707-712`); Appendix A row added.
- D1-4 `+WPI` → §14 item 17 (expanded, tag removed).
- D1-5 → §14 item 19 (report path; governance phrasing removed).
- D1-6 → §15 (canonical `just`/`harness checks` commands; mutation procedure stated directly) — also closes D3-2.
- D2-1 attempt/park → §2 ownership bullet; §4 new paragraph "Two entry paths, one counter"; §4.2 bullets 1 and 3; §7.3 step 5; §14 item 17; glossary `attempt`; NEW gotcha **G25** and NEW §14 item 21. Check the code claim yourself: `sqlite-queue.ts:371-378` (claim increments), `:385-403` (settle preserves), `:437-443` (park test), `daemon.ts:1174, :1243`.
- D2-2 `openChannel` → §5 (scoped; exceptions `channel-factory.ts:123`, `EXT/cli.ts:595, :609`).
- D2-3 `instanceof` at `:1628` → G3 reworded.
- D2-4 `write.lock` → G10 + Appendix A (`platform-write-lock.ts:3, :44, :123`).
- D2-5 / D2-6 / D3-1 transport windows → §7.1 send bullets rewritten; §7.2 timeout sentence; NEW §8 paragraph "Transport-level ambiguity windows" (T1 Claude, T2 Copilot, bounds, dedupe facts).
- D2-7 fs qualification → §1 last sentence; §12 P1.

## Verdict
`Verdict: APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED` on line 1 of your file; a table `finding | resolved y/n | evidence`; then `pij send pij-dependent-ptarmigan --body-file -` with line 1 = verdict, line 2 = your file path.
