# flow-pair — Logged follow-ups (non-blocking)

Findings surfaced during phase reviews that were accepted as non-blocking. Pick up
in a later hardening pass or the relevant future phase.

## From Phase 3 review (dlg-0011, APPROVE WITH NOTES)

| ID | Sev | Where | Finding | Suggested fix |
|----|-----|-------|---------|---------------|
| F1 | MED | `lib/context-pack.ts` `nextPackId` + `lib/ledger.ts` `nextId` | Duplicated monotonic-id logic (`readdirSync.filter(.json).length+1` padStart 4). | Extract a shared `nextSequentialId(dir, prefix, deps)` helper; both import it. |
| F2 | LOW | `lib/context-pack.ts` `clusterLearnings` | Final `readFileSync(active.md)` not wrapped — throws (vs tagged-union `{ok:false}`) if the read fails after `existsSync` (race/permission). | try/catch → `{ok:false}`. |
| F3 | NIT | `lib/context-pack.ts` `compile` | `mkdirSync(packDir)` is a tiny fs side-effect BEFORE the P9 event append. Harmless + consistent with Phase 2 `createRun`, but not strictly event-first. | P9-purity: compute packId without creating the dir (`existsSync?readdirSync:0`), append event first, then mkdir + write. |
| N2 | LOW | `lib/context-pack.ts` `compile` | When the `resolveRunDir` guard is bypassed (only reachable if the guard regresses), `runDir` is empty and writes default to cwd. Mutation test proved the guard prevents a path-traversal write to the repo root. | Defense-in-depth: assert `runDir` is a non-empty absolute path before any write. |

## Upstream `/the-flow 7` review-skill suggestions (do NOT edit the installed skill; note for later)

| # | Suggestion |
|---|------------|
| U1 | **Add a test-quality / mutation-resistance dimension to Subagent 4 (Testing & Evidence).** It checks RED-GREEN + coverage but never "would a test fail if the fix were reverted?" — the exact gap that hid the Phase 2 CRITICAL behind green gates. Weight heavily when a cheaper model authored the tests. |
| U2 | The 5-subagent fan-out is tool-blind in lean-ctx envs (agents' allowlists name raw read/grep/bash). Detect "subagent can't read the diff" → fall back to in-session lens + declare the degradation rather than emit a hollow review. |
| U3 | Subagent JSON severity enum is HIGH/MED/LOW but synthesis references CRITICAL — align (add CRITICAL). |
| U4 | Add an "in-progress work" review mode for parallel/live review (skill currently assumes the implement verb finished and the diff is final). |

## Done (orchestrator-owned, not logged)
- F5 — `docs/domains/flow-pair/domain.md` Source Locations note + History brought current (Phases 1–3 built). ✅
- N1 — `harness/scripts/flow-pair-mutate.sh` now surfaces stray untracked artifacts a mutation run leaves behind. ✅

## Phase 4 follow-ups (2026-06-17)

- **H3-LOW (SKILL.md wording)**: lines ~19/36 still use the phrase "pij send" descriptively ("sent via `pij send`", "`pij send` path pointer"). The dangerous shell instruction + `--packet` are gone (HIGH fixed), but tighten the descriptive phrasing to "the `pij_send` tool" / "pointer delivery" for consistency so no reader infers a shell step.
- **Worker report-accuracy (process)**: dlg-0015 self-report claimed 94 tests (RAW: 88), cli-dispatch.test.ts "4 tests" (RAW: 2), and named a mutation guard function `assertValidDelegationId` that does not exist in the final code (the guard is an inline `DLG_ID_RE` check). Substance was correct, counts inflated. Reinforces RAW verify-don't-trust. Candidate encode: require the worker to paste the literal `Tests N passed (N)` vitest line + the exact `sed` expr it mutated, so claims are copy-paste verifiable.
- **O1 (resolved)**: the "dispatch chain has no integration test" gap is now closed by `test/cli-dispatch.test.ts` (asserts pointer-only stdout). Keep an eye that it stays a real end-to-end (start→dispatch) test, not a unit stub.

## Phase 5 dogfooding findings (defer full dispatch-tool use to Phase 8)

- **Dispatch delegation-id model mismatch**: `flow-pair dispatch` auto-allocates **per-run** delegation ids (observed `dlg-0001` in the e2e), but the orchestrator has been using a **global** monotonic sequence (`dlg-0001..dlg-0017`). Reconcile before Phase 8 wires the full loop: either (a) make dispatch accept a `--delegation` override, or (b) adopt per-run numbering in the ledger convention. Decide in Phase 8.
- **worker-implement.md Mission gap**: the template's `{{TASK_DESCRIPTION}}` slot carries no **test-quality / mutation-resistance** framing (the reminder that has caught vacuous tests all build). The detail currently lives only in the injected tasks T007. Encode a standing "Test-quality gate" section into the template so every dispatched implement packet carries it automatically (encode-don't-document). Do in Phase 8 template pass.
