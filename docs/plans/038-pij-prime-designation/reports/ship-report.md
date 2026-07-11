# s038 report — SHIP
**From**: pij-118mbuv · **To**: pij-3vetx8 (+ Jordan) · **Date**: 2026-07-11 · **Stage**: stream close

**claim**: Plan 038 is complete on local trunk. First-class prime designation is implemented, mutation-backed, production-live proven, reviewed to final **APPROVE**, documented, and committed in `6067b07` + `fc98f83`. The final exact-50 commit and both baton returns were independently verified by the o-prime. Expected-red: **none**. Push-main is intentionally deferred to the consolidated o-prime/Jordan double gate.

**artifacts[]**:
- product contract: `.pi/extensions/pij/core/{types.ts,discovery.ts,cli.ts}`, `core/orchestration/{prime.ts,cli.ts}`, `core/daemon/loop.ts`, top-level `cli.ts`
- tests: sibling unit tests + `cli.integration.test.ts`
- live skill payload: `skills/pij/references/routes/prime.md`, `prime/rituals/bootstrap.md`, `prime/templates/seat-handover.md`
- operator/domain docs: `docs/how/{pij.md,pij-prime.md}`, affected `docs/domains/**`
- canonical plan: `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md`
- execution: Phase 1/2 task dossiers + logs
- reviews: `reviews/review.phase-1.dlg-0001.md`, `reviews/review.phase-2.dlg-0002.md`
- validation: `validations/pij-prime-designation-plan-validation.md`
- local ship view: `ship/2026-07-11/ship-report.md`
- commit boundary: `reports/commit-manifest.md`
- retros: `.harness/records/retro/2026-07-11/{005-shared-agent-phase-end.md,007-038-pij-prime-designation-phase-2.md}`

**shas[]**:
- Phase 1: `6067b07f1b8286ff8d949038e250b4b31d2ec95e`
- Final feature/evidence commit: `fc98f839217bdb5c6c1507895a9e94a47c2169d8`
- Final feature commit boundary: exactly 50 manifest paths, `+3609/-63`
- Mutable merge source: `a522bc1402f82847060a7b96e0465101a37798bcad6e4bc09c9ce749c2af55fc`
- Prime service source: `b1982b34218bcad1dd88c5625b165cbf455722615cf31df2a154d623afe237ef`
- Final review before local ship: `849003afa5b35cb5c22c21d479a5fb21f8041d95efc5b25d6945b2d3369862a0`

**gates[]**:
- Plan: READY; validate-v2 VALIDATED WITH FIXES, both findings repaired/rechecked.
- Phase 1: skill sensor RED → repair → GREEN; reviewer mutation RED → byte-identical restore → GREEN.
- Phase 2: exact 3 merge REDs, exact 2 filter mutation REDs, exact 5 strict-boolean REDs; all restored GREEN.
- Reviews: Phase 1 APPROVE_WITH_NOTES/no findings; Phase 2 FIX_REQUIRED → dlg-0003 → APPROVE.
- Orchestrator sanity: strict parser/real CLI 60/60; valued prime exit 64/no JSON; help exact.
- Production live after daemon restart: set/list/unset; post-tick false retained; original absent marker restored.
- Full done gate: `harness checks` PASS typecheck, lint, test, smoke, package audit, snapshots on quiescent Vitest 4.1.10/Biome.
- Ship-time skill look: o-prime read all three diffs in full and approved; independent skill-check GREEN.
- Commit windows: exact pathspecs, hooks passed, E-16 typecheck at both returns.

**observations[]**:
- `SUGG-001` encoded: the skill CLI-coverage gate now catches the orchestration family and scopes checks to the coverage table.
- Flow-pair contract drift: route-documented model/roster controls are absent; `observe` cannot pathscope around unrelated dirty forbidden files. O-prime aggregated these into the Seq 25 flow-pair backlog.
- Shared-tree TDD: exact expected-red disclosure prevented s039 from misclassifying intentional RED; Seq 30 made this standing during package windows.
- Reviewer value: caught `--prime=false` silently disabling the filter despite all initial gates being green.
- Attribution discipline: the only s039 install transient was named precisely (19 CLI subprocess exits with empty output during `.bin` repopulation); quiescent rerun passed, no workaround.
- Fence hygiene: apparent guide collision was self-authored; Seq 31 exposed the real gap — create/modify labels need existence probing at fence-diff time.
- Baton dogfood: missing canonical definitions were repaired; subsequent git-index/daemon-restart cycles completed cleanly. One transient index lock disappeared without intervention; no repeat.
- Live-proof cleanup: `.js` eval import failed before mutation; `.ts` adapter import restored exactly. Phase 2 retro proposes a reusable descriptor snapshot/restore helper.
- Handover semantics: two prime markers briefly coexist by design; the bounded overlap is now explicit.

**open[]**:
- O-1: consolidated `push-main` is owned by the o-prime after s039 ship, behind o-prime deconflict + Jordan typed go. This stream must not request or perform it.
- O-2: bootstrap route remains 95 lines against an advisory 90-line budget (baseline 91); gate is green.
- O-3: highest-leverage harvest candidate is the flow-pair surface repair (model/roster contract + pathscoped observe); already in the o-prime ordinal backlog.
- O-4: descriptor snapshot/restore helper is a smaller tooling candidate, preserved in Phase 2 retro DL-001.
