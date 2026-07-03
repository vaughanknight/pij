# Validation — tasks/phase-1-agent-runtime-harness-adapters/tasks.md

- **Validated**: 2026-07-03T08:35:00+10:00
- **Target**: `docs/plans/029-pij-agents-minih/tasks/phase-1-agent-runtime-harness-adapters/tasks.md`
- **Contract sources**: `pij-agents-minih-plan.md` (Phase 1 table, Key Findings, Domain Manifest), `workshops/001-minih-reuse.md` (D2/D3), `backpressure-coverage.md`, minih `dist/` at tag `minih-v0.2.4`
- **Checks**: plan tasks 1.1–1.8 → T001–T011 mapping complete (nothing dropped; 1.2 temp-dir copy preserved in T003; 1.7 run-start/daemon-start split handled honestly); T012/T013 trace to the backpressure survey's Phase-0 rows; import specifiers verified in dist typings (`minih/runner` → `runAgent` :50 + validators :55; root → `FakeAgentAdapter` :7); envelope fields / effort enum / `MINIH_NO_AUTO_HARVEST` / `parsedReport` verified; vitest include glob covers `.pi/extensions/**/*.test.ts`; `agent.live.test.ts` precedent + absent `agent-live` recipe confirmed; one independent critic (read-only), finding lead-verified against minih source
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: purpose met — an implementer can execute Phase 1 without inventing decisions; Contract proof level supported by fresh source evidence
- **Consumers**: 1/1 named (flow-pair coder/reviewer via the implement verb) — satisfied

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | T003's Done-When unreachable as written: stock `FakeAgentAdapter` defaults `output: ''`, and minih's runner writes `output/report.json` only when adapter output is truthy — the envelope assertion would fail on a missing file | minih `dist/adapter/fake.js:23`; `dist/runner/runner.js:1336` (lead re-read both) | fixed — T003 now specifies seeding the fake with a JSON envelope, evidence pinned |
| MEDIUM | Wrong daemon path (`core/daemon.ts`; actual `.pi/extensions/pij/daemon.ts`) in T010 + pre-implementation table | `ls` probe | fixed — both occurrences corrected |
| MEDIUM | "Reusable" bullet cited temp-home isolation in `core/models`/`core/state` tests; the `mkdtemp` pattern actually lives in `index.test.ts`, `daemon.test.ts`, `adapters/fs-registry.test.ts` | `grep -rln mkdtemp` | fixed — bullet corrected |

## Repairs

All three mechanical, in-target, uniquely determined by cited evidence; T003 repair re-verified by direct read of `fake.js` constructor defaults and the `runner.js:1336` write condition.
