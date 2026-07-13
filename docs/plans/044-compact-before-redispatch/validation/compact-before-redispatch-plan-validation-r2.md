# Validation R2 — compact-before-redispatch-plan.md

- **Validated**: 2026-07-12T21:21:17+10:00
- **Target**: `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md` (sha256 `b50403afb601d303d7d46487cc476de7dce07ad70664dbac0a0db1721b153b64`)
- **Contract sources**: `validation/plan-revalidation-r2-request.md`, prior validation, `rulings.md` R2-R4, `research-dossier.md`, live government spine Seq 76-77, historical `2d49d7^:skills/flow-pair/SKILL.md:42-73`, current pij skill sources, and one-shot daemon lifecycle source/tests
- **Checks**: frozen sha256 match; unified-plan structure and AC-01..AC-10 coverage; prior finding closure; current root/C3/pair ownership; manifest/task/path consistency; historical compact-early source match; `--once` auto-close source/test match; `harness boot`; `just pij-skill-check`; line budgets
- **Verdict**: NEEDS ATTENTION
- **Thesis / proof**: Completion-first compaction and the one-shot `E-DEAD` exception are correctly bounded, and the three prior findings are materially repaired, but the READY implementation contract cannot reach GREEN without an unmanifested C3 source edit.
- **Consumers**: Implementation remains blocked; retain the planning fence and `WAITING_FOR_BUILD_CONFIG` stop until the manifest/task contradiction is repaired and this frozen plan is revalidated.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | The plan requires `skills/pij/references/00-routing.md` to change but excludes it from the Domain Manifest and task paths, while AC-08/T006 require the non-plan diff to equal four manifest implementation files. Add `00-routing.md` as the fifth contract file, include its C3 changes in T002, update the changed-path count, and ensure the exact o-prime grant covers it. | AC-05/AC-10 and T001/T004 require C3 to gain reload-first safety, reusable/live scope, and the `--once` auto-dissolve boundary (`compact-before-redispatch-plan.md:82-87,184-188`). Current C3 has none of those markers (`skills/pij/references/00-routing.md:45-47`); buggy-extension safety remains in `pair.md:112-114`, and general push-not-poll remains C7 at `00-routing.md:61-63`. T002 names only `SKILL.md` and `pair.md` (`:185`), the manifest omits `00-routing.md` (`:147-156`), and T006 still gates on four implementation files (`:189`). Without editing C3, T001 cannot turn GREEN; editing it violates AC-08/T006. | Open |
