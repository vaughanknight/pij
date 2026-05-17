# Phase 3 Execution Log: Interaction, Push Context, and Hardening

**Plan**: `docs/plans/007-options-for-pi-extensions-that-do-subagents/agent-workbench-plan.md`  
**Phase**: Phase 3: Interaction, push context, and hardening  
**Started**: 2026-05-17T04:55:21Z  
**Companion**: `code-review-companion` run `2026-05-17T14-55-31-573Z-53a4`  
**Briefing**: `01KRT4N7DKVFMCC7679PEHYQ9K`

---

## Pre-Phase Harness Validation

| Check | Command | Result | Evidence |
|-------|---------|--------|----------|
| Minih version | `minih --version` | ✅ `0.1.6` | CLI available. |
| Agent harness health | `minih doctor` | ⚠️ degraded, 0 errors, 3 warnings, 3/4 healthy | Non-blocking warnings: missing shared preamble, unharvested package-vetter retro, stale Phase 1 companion run. `code-review-companion` prompt-state-vocabulary-drift passed. |
| Companion boot | `minih run code-review-companion` | ✅ active | Run `2026-05-17T14-55-31-573Z-53a4`. |
| Companion briefing | `minih outside inbox send ... --type briefing` | ✅ delivered | Message `01KRT4N7DKVFMCC7679PEHYQ9K`. |
| Typecheck | `just typecheck` | ✅ passed | `tsc --noEmit`. |
| Smoke | `npm run smoke -- minih-workbench` | ✅ passed | Baseline Phase 2 flow green. |

---

## Task Entries

| Task | Commit | Evidence | Companion Ping | Findings / Disposition |
|------|--------|----------|----------------|------------------------|
| Preflight | `09f2806` | Phase 3 task dossier and initial execution log committed. | `01KRT4PA5534VZ0JT8S52P9CMS` | F001 MEDIUM: task status drift; fixed in follow-up. |
| T001 | `f47bd9f` | Added Pi-free capability, action availability, outbound draft, stop confirmation/control draft, material event classification, redaction/truncation, and stable dedupe key contracts in `store.ts`; expanded store tests to 19 cases; `npx vitest run .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT4TMBS0HY564CG777GR86X` | Pending companion review. |
| T002 | `c05e521` | Added append-only session-entry persistence backing with same-session replay and new/fork reset markers; wired `index.ts` to session-backed persistence; added session persistence tests; `npx vitest run .pi/extensions/minih-workbench/session-persistence.test.ts .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT4ZXMB47MHPC2N5Q8CA4XA` | Pending companion review. |
| T003 | `9167f8a` | Added injected Minih writer request/outcome contracts and send/stop-control adapter wrappers; helper-vs-CLI decision recorded as injected CLI-shaped boundary; adapter tests cover accepted, rejected, and unavailable writer paths; `npx vitest run .pi/extensions/minih-workbench/minih-adapter.test.ts .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT54TC2ZPWNYY9SE87DAPAR` | Pending companion review. |
| T004 | `8068c89` | Added `/minih send <slug> <runId> <body>` and `minih_send_message`; send path performs fresh status/capability check, records intent before adapter write, records outcome after, and uses injected `minih outside inbox send` writer. Validation: `just typecheck` ✅. | `01KRT59J0353C7QXJBR5TVF603` | Pending companion review. |
| T005 | `fe154b0` | Added capability-aware composer rendering, basic modal draft editing, configured send key handling, UI callback to T004 send path, and UI tests with non-default send key. Validation: `npx vitest run .pi/extensions/minih-workbench/ui.test.ts .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT5CKGFHKSMAFRD9QE611VW` | F005 MEDIUM fixed in `cb01683`. |
| T006 | `466f5bc` | Added `/minih stop`, `minih_stop_run`, exact model confirmation, human `ctx.ui.confirm`, modal stop action, intent/outcome audit, dedicated control send path, and UI tests proving freeform/Esc do not stop. Validation: `npx vitest run .pi/extensions/minih-workbench/ui.test.ts .pi/extensions/minih-workbench/minih-adapter.test.ts .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT5KBCK3K1EDJMMHJ78JBNH` | Pending companion review. |
| T007 | `25205c3` | Added compact pushed-context envelope builder, push scope eligibility helper, redacted model-visible content/details split, and classifier/scope tests. Validation: `npx vitest run .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | `01KRT5P0FB77ANGCY6JEDH8KNR` | Pending companion review. |
| T008 | `1565bab` | Wired opened/observed modal snapshots into Pi `sendMessage` pushed context after audit+cursor persistence, with same-session cursor replay suppression and urgent `triggerTurn`. Validation: `npx vitest run .pi/extensions/minih-workbench/store.test.ts .pi/extensions/minih-workbench/session-persistence.test.ts` ✅; `just typecheck` ✅. | `01KRT5RKVDGCJHV21NV98T2VFN` | F007 HIGH fixed in follow-up. |
| T009 | `7474e66` + `1cc5864` | Added negative safety regressions for stale/completed/diagnostic-blocked capability, writer thrown errors, existing safe Esc/stop-freeform, persistence append failure, raw report/tool suppression, redaction gates, per-event push cursor channels, and terminal raw-report suppression. Validation: `npx vitest run .pi/extensions/minih-workbench/store.test.ts .pi/extensions/minih-workbench/minih-adapter.test.ts .pi/extensions/minih-workbench/ui.test.ts .pi/extensions/minih-workbench/session-persistence.test.ts` ✅; `just typecheck` ✅. | `01KRT5XM5V1A971SEZVG1PHSPE` | F008 fixed in `1cc5864`; pending targeted review. |
| T010 | `03a434a` | Added adapter/persistence behavior coverage for writer outcomes, thrown writer errors, session replay, new/fork reset, per-event cursor channels, and audit intent/outcome ordering. Validation: `npx vitest run .pi/extensions/minih-workbench/minih-adapter.test.ts .pi/extensions/minih-workbench/session-persistence.test.ts` ✅; `just typecheck` ✅. | `01KRT637QAFG1T1YJW1N1DSK4R` | Pending companion review. |
| T011 | pending | Added UI/render tests for read-only composer/control report state, send/delete/stop keybinding injection, pushed envelope formatting, exact stop confirmation, and existing command-adjacent helper behavior. Validation: `npx vitest run .pi/extensions/minih-workbench/ui.test.ts .pi/extensions/minih-workbench/store.test.ts` ✅; `just typecheck` ✅. | pending | Pending companion review. |

---

## Companion Findings Reconciliation

| Finding | Severity | Ack Of | Summary | Disposition | Fix Commit |
|---------|----------|--------|---------|-------------|------------|
| F001 | MEDIUM | `01KRT4PA5534VZ0JT8S52P9CMS` | `tasks.md` still said `Status: Proposed` after the phase was validated, briefed, and in execution. | Fixed by aligning Phase 3 task/flight statuses to `In Progress`; ack `01KRT4VNPFQNNW44595K63GP1S`; fix review `01KRT4VNY2YFN5TP5N6RZ2KA6F`; companion approved via `01KRT4WPTWWDJRK2XJ8CNPV2C6`. | `5a309dc` |
| F002 | HIGH | `01KRT4TMBS0HY564CG777GR86X` | `classifyMaterialEvent` suppressed status-shaped blocked/needs-recovery events as status churn. | Fixed by classifying status-shaped material blocker/recovery reasons before generic status churn suppression; ack `01KRT51DD77YRQSRGZBQKWDDYE`; superseded by F003 refinement. | `91bb1e2` |
| F003 | HIGH | `01KRT51DMAYE74074Y2RAB7Z15` | F002 fix overcorrected by letting raw tool events become material if their text contained blocker/recovery keywords. | Fixed by suppressing raw/large tool events before text-based material matching while preserving status-shaped blocked/recovery tests; ack `01KRT55WS0P86MZ78EGW3BNPMS`; fix review `01KRT55X11ZEWX7KM2XA0QE615`; companion approved via `01KRT569R1GZSYEFF06BM6BYF7`. | `f747467` |
| F004 | HIGH | `01KRT59J0353C7QXJBR5TVF603` | `minih_send_message` accepted `rootDir`, allowing capability checks against a different run universe than the CLI writer target. | Fixed by removing root override from all write-capable send inputs; write capability checks now use the same configured production root as the writer; ack `01KRT5EAS1WJ8R8FTXFA6G9ND4`; fix review `01KRT5EAZDRRGVP0F89F9THBK2`; companion approved via `01KRT5F1N0DWNQ1KNPR2NRBF37`. | `e61aa71` |
| F005 | MEDIUM | `01KRT5CKGFHKSMAFRD9QE611VW` | Composer delete used hardcoded raw backspace/delete checks instead of named keybinding injection. | Fixed by adding `minih.deleteComposerChar` action/defaults and a non-default delete-key UI test; ack `01KRT5FJG6MSSHN08R2EW5S6XE`; fix review `01KRT5FJPRM0E910CGEH984RNY`; companion approved via `01KRT5G56WE16AZ36J80J31M73`. | `cb01683` |
| F006 | HIGH | `01KRT5P0FB77ANGCY6JEDH8KNR` | Raw report events could be classified as terminal reports and enter model-visible pushed context. | Initial fix in `e130e34`; companion found terminal raw report remained open via `01KRT5TSSR16K07NG1ZSB8NBTG`; final fix suppresses report-source raw events before terminal matching and adds terminal raw-report regression; companion approved via `01KRT616BHR3XFCM0XT9B7DD4Q`. | `1cc5864` |
| F007 | HIGH | `01KRT5RKVDGCJHV21NV98T2VFN` | Push duplicate suppression used one last cursor per run, so repeated multi-event snapshots would re-push alternating events. | Fixed by adding optional cursor channels and using each pushed event dedupe key as the `push` cursor channel; companion approved via `01KRT616BHR3XFCM0XT9B7DD4Q`. | `1cc5864` |
| F008 | HIGH | `01KRT5XM5V1A971SEZVG1PHSPE` | T009 raw-report regression missed terminal raw-report leak and execution log prematurely marked F006 fixed. | Fixed in `1cc5864` with terminal raw-report test and corrected F006 disposition; ack `01KRT616E9VWM836VM2J7VSDBN`. | `1cc5864` |

---

## Final Validation

_Populated at T013._
