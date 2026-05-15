# Fix FX001: Audit-gate hardening — close 4 HIGH findings from code-review

**Created**: 2026-05-15
**Status**: Proposed
**Plan**: [extension-vetting-plan.md](../extension-vetting-plan.md)
**Source**: code-review agent run `2026-05-15T16-35-28-225Z-409b` — 4 HIGH findings (F001–F004), verdict `REQUEST_CHANGES`
**Domain(s)**: `extension-authoring-harness` (modify — vetter pipeline sub-capability)

---

## Problem

The Plan 009 supply-chain gate ships with four correctness gaps that compromise its core guarantees:

1. **F004 — Override scope too broad** (`packages.ts:421-427`). `vetted.overrides` is a free-text reason string; the audit logic downgrades **every** `warn` on the entry to `ok` whenever that string is non-empty. Once an entry is accepted for one finding (e.g. `github-trust:no-license`), unrelated future warnings (e.g. a fresh `npm-audit:high` CVE) are silently masked.
2. **F002 — Unmanifested installs not gated** (`packages.ts:437-464`). The cross-check against `pi list` detects installed-but-unmanifested project-scope extensions, but only prints/serialises them. They are not converted into `Finding`s and do not affect the aggregate exit code — `pkg audit` can exit `0` while unexpected transitive pi extensions are present.
3. **F001 — `pkg audit` cannot refresh stale entries** (`packages.ts:410-465`). RUNBOOK and the bootstrap-refusal message both tell users to "rerun `pkg audit` to refresh stale `vetted.date`", but `cmdAudit` only prints results and exits — it never writes back. Stale entries stay stale forever; the only refresh path is `--unsafe` bootstrap, which is wrong by design.
4. **F003 — AC-05 detection/stability evidence missing**. The novel-validation agent (`agents/package-vetter`) was committed with its 7-file positive corpus, but the retro-vet step and `self-check` both run with `PIJ_VET_SKIP_AGENT=1`. `agent.test.ts` only covers the skip path and bad-input handling. The execution log explicitly marks AC-05a (detection ≥6/7) and AC-05b (stability ≤1 finding drift) as deferred — i.e. AC-04 and AC-05 are unverified.

Together these gaps mean the gate is **green for the wrong reasons** on three of the four installed packages and **incapable of catching net-new findings** on the one with an override.

## Proposed Fix

Five targeted changes inside the existing vetter pipeline, no contract reshape:

1. **Scope `vetted.overrides`** from `string` to the typed object `{ rules: string[]; reason: string }` (decided up-front — typed wins over string-convention for self-documentation and plan-7 scoreability). `cmdAudit` only downgrades a `warn` finding when its `rule` appears in `overrides.rules`. Findings outside that set keep their severity and propagate to exit code 2. Same parser used by `cmdAdd`, `cmdAudit`, and `cmdBootstrap` — single source of truth.
2. **Synthesise a vetter:audit Verdict** for unmanifested project-scope installs inside `cmdAudit`. Each unmanifested source becomes one `Finding{rule:"audit:unmanifested", severity:"warn"}` rolled up into one `Verdict{vetter:"audit", level:"warn"}` participating in the worst-level aggregate. The JSON `results` row uses `source: "<audit:unmanifested>"` so consumers can distinguish synthetic from real.
3. **Write-back fresh `vetted.date`/`score`/`agentRubric`** in `cmdAudit` ONLY when an entry's **raw `verdict.level === "ok"`** (NOT when `effective === "ok"` via override). Override entries must age out so the user re-confirms acceptance — this prevents F004 from re-emerging through the refresh door. Write via in-place `YAMLMap.set()` mutation (same pattern as `cmdBootstrap` at `packages.ts:293-294`) to preserve human-authored comments.
4. **Generate AC-05 evidence**: run the `package-vetter` agent against the 7 corpus files (R-01..R-07) by staging each in its own temp dir (so per-file Verdicts are produced — running against the whole `corpus/positive/` dir would collapse into one verdict) and the 4 currently-manifested packages 3× each. Commit `agents/package-vetter/__snapshots__/<key>.json` artifacts, including all 3 raw runs per package plus the **median** (defined as the run whose finding-set is the modal set across 3 runs, tie-break by lowest run index). Cross-reference each corpus file's expected `R-0N` rule against `workshops/001-prompt-injection-rules.md` so AC-05a is graded against an independent oracle, not self-graded. Add an opt-in regression test that exercises `agentVetter` once without `PIJ_VET_SKIP_AGENT`.
5. **Document the new override shape** in `.pi/packages.yaml`'s schema-header comment block and in `RUNBOOK.md` § "Vetting third-party extensions". Without this, future package authors copy the legacy free-text form and the gate silently no-rules-accepts their override — a "fail-safe but silent" UX regression.

## Domain Impact

| Domain | Relationship | What Changes |
|---|---|---|
| `extension-authoring-harness` | modify | `harness/scripts/packages.ts` (cmdAudit, override parsing, write-back); `harness/scripts/vetters/agent.test.ts` (live regression); `.pi/packages.yaml` (askuserquestion entry's `overrides` reshape); new test `harness/scripts/vetters/audit-unmanifested.test.ts`; new snapshot dir `agents/package-vetter/__snapshots__/`. No contract change — `Verdict`/`Finding`/`Vetter`/`Entry.vetted` shapes extend rather than break. |

No other domain touched. `agent-tooling-interface` consumes the vetter contract; consumer surface is unchanged.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|---|---|---|---|---|---|---|
| [x] | FX001-1 | Scope `vetted.overrides` to a finding-rule set. **Decided shape**: typed object `{ rules: string[]; reason: string }`. Implement a single `parseOverrides()` helper used by all readers; `cmdAudit` downgrades `warn` → `ok` only when **every** warn `Finding.rule` is in `overrides.rules`. **Reshape the askuserquestion entry's `overrides` in `.pi/packages.yaml` in the same commit** as the parser change — otherwise `self-check` will exit 2 until that YAML is updated. Set `rules: ["github-trust:no-license"]` with the existing reason. Legacy free-text form parses to `{ rules: [], reason: "<original-text>" }` — accepts nothing, prints a one-line deprecation warning to stderr. Add a unit test where an accepted entry gains an unrelated `warn` and `pkg audit` exits 2. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts`, `/Users/jordanknight/pi-hacking/pij/.pi/packages.yaml`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/override-scope.test.ts` (new) | Test asserts: (a) override with `rules: ["github-trust:no-license"]` matches only that rule, (b) unrelated warn (e.g. simulated `npm-audit:high`) still exits 2, (c) legacy free-text form parses as zero accepted rules + deprecation warn to stderr, (d) all three readers (cmdAdd, cmdAudit, cmdBootstrap) go through `parseOverrides()` — `grep -n "vetted?.overrides" packages.ts` returns zero direct field accesses. | Addresses F004. Single-helper rule prevents reader divergence. |
| [x] | FX001-2 | Convert each unmanifested project-scope install in `cmdAudit` into a warn-level finding. Build one synthetic `Verdict{vetter:"audit", level:"warn", findings:[{rule:"audit:unmanifested", severity:"warn", msg:"<source> installed but not in packages.yaml"} ...]}` and include it in the worst-level reduce. **JSON `results` row shape**: `{source: "<audit:unmanifested>", verdict: <synthetic>, effective: "warn"}` so consumers distinguish synthetic from real. Field `unmanifestedProjectInstalls` retained for back-compat. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/audit-unmanifested.test.ts` (new) | Test with a mocked `piList()` returning one extra `project`-scope entry: `cmdAudit` exits 2, JSON `results` array contains a row where `source === "<audit:unmanifested>"` and `verdict.vetter === "audit"`, `unmanifestedProjectInstalls` field still present (back-compat). | Addresses F002 + tightens AC-10/AC-11. |
| [x] | FX001-3 | When `cmdAudit` finishes vetting an entry with **raw `verdict.level === "ok"`** (NOT `effective === "ok"` via override), persist refreshed `vetted.date` + `score` + `agentRubric` back to `.pi/packages.yaml`. **Override entries must age out** — write-back keying off `effective === "ok"` would re-create F004 through a different door. Skip write-back when `verdict.level !== "ok"`. Skip write-back on `--json` mode (CI determinism). **Mutate the existing `vetted` `YAMLMap` in-place via `.set()`** (same pattern as `cmdBootstrap` at `packages.ts:293-294`) — do not replace the map, to preserve adjacent comments. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/packages.ts`, `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/audit-writeback.test.ts` (new) | After `cmdAudit` on a >30d-stale entry that re-vets raw-ok, the YAML's `vetted.date` advances to within the last 5 minutes; on a stale entry that re-vets warn or whose ok-ness depends on an override, the date is unchanged. Round-trip test: a manifest with header comments and inline comments survives one cmdAudit pass with zero comment loss. | Addresses F001 + closes the override-aging hole. |
| [x] | FX001-4 | Generate AC-05 live evidence with an independent oracle. (a) Stage each `corpus/positive/r0{1..7}-*` file in its own temp dir, run `minih run package-vetter -p packagePath=<temp-dir> -p source=<source>` (FX001-4 implementation uses the adapter via `vet()`; the snapshot script handles the staging + spawn), capture as `__snapshots__/corpus-r0N.json`. Cross-reference each file's expected `R-0N` rule against `workshops/001-prompt-injection-rules.md` and assert `findings[].rule` contains the expected `R-0N` — independent oracle, not self-grading. (b) Run the agent against each of the 4 manifest packages 3× and commit all 3 raw runs (`<source-slug>-run{1,2,3}.json`) plus the **median** as `<source-slug>.json`. **Median definition**: the run whose finding-set is the modal set across the 3 runs; tie-break = lowest run index. (c) Add `agent.live.test.ts` that spawns the agent once against R-01 without `PIJ_VET_SKIP_AGENT` and asserts `Verdict.findings[].rule === "R-01"`. Gate the live test behind `PIJ_VET_LIVE=1`. (d) Add a `self-check` warning when `briefing.md` SHA changes but snapshots are older — closes the snapshot-staleness loop. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/agents/package-vetter/__snapshots__/` (new dir + ≥19 JSON: 7 corpus + 12 package-runs + 4 medians), `/Users/jordanknight/pi-hacking/pij/harness/scripts/vetters/agent.live.test.ts` (new), `/Users/jordanknight/pi-hacking/pij/harness/scripts/snapshot-refresh.ts` (new — regeneration script + staleness check), `/Users/jordanknight/pi-hacking/pij/docs/plans/009-extension-vetting/execution.log.md` (AC-05 status update) | AC-05a: ≥6/7 corpus files have `findings[].rule` matching the workshop's declared `R-0N`, 0 misclassified `ok`. AC-05b: median snapshots committed for all 4 packages with ≤1 finding drift across the 3 raw runs. Live test passes when run as `PIJ_VET_LIVE=1 npx vitest run agent.live`. `briefing.md` SHA-vs-snapshot-mtime staleness check wired into `self-check`. Execution log updated to mark AC-05a/b ✅. | Addresses F003 + closes snapshot-lifecycle gap (V12 from validate-v2). |
| [x] | FX001-5 | Document the new `overrides.rules` shape in (a) `.pi/packages.yaml`'s top-of-file schema-header comment block with one worked example, (b) `RUNBOOK.md` § "Vetting third-party extensions" with a short prose explanation, and (c) update Plan 009's Validation Record + `extension-vetting.fltplan.md` Flight Log to reflect FX001 close-out, flipping AC-04/AC-05/AC-10/AC-11 confidence from the original code-review coverageMap. | extension-authoring-harness | `/Users/jordanknight/pi-hacking/pij/.pi/packages.yaml` (header comment), `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md`, `/Users/jordanknight/pi-hacking/pij/docs/plans/009-extension-vetting/extension-vetting-plan.md` (Validation Record), `/Users/jordanknight/pi-hacking/pij/docs/plans/009-extension-vetting/extension-vetting.fltplan.md` (Flight Log) | YAML header comment shows a worked `overrides: { rules: [...], reason: "..." }` example. RUNBOOK has a sentence + an example. Plan 009 Validation Record gains an FX001 entry. Flight Log gains a "Fix FX001 — Complete" entry. The original review's coverageMap confidence values are referenced + flipped (AC-04/AC-05/AC-10/AC-11). | Closes encapsulation-lockout gap (V1 from validate-v2); makes plan-revalidation a tracked task, not an orphaned stage. |

## Workshops Consumed

- [workshops/001-prompt-injection-rules.md](../workshops/001-prompt-injection-rules.md) — supplies the R-01..R-07 rubric that `FX001-4` validates the agent against. The rubric hash is captured in `Verdict.agentRubric` for tamper-evidence.

## Acceptance

- [ ] **AC-01 (F004)**: A test where an entry with `overrides.rules=["github-trust:no-license"]` gains an unrelated `npm-audit:high` warn finding causes `pkg audit` to exit 2.
- [ ] **AC-02 (F002)**: A test where `piList()` returns one extra project-scope entry causes `pkg audit` to exit 2 with a `vetter:audit` warn-level Verdict whose `results` row carries `source: "<audit:unmanifested>"`.
- [ ] **AC-03 (F001)**: After `pkg audit` on a >30d-stale entry that re-vets **raw**-ok, the YAML's `vetted.date` advances to within the last 5 minutes. A round-trip test confirms zero comment loss outside the `vetted:` block.
- [ ] **AC-04 (F003 — detection)**: AC-05a from spec proven — `__snapshots__/corpus-r0N.json` for ≥6 of 7 corpus files have `findings[].rule` matching the workshop-001 `R-0N` declaration (independent oracle, not self-graded), 0 misclassified `ok`.
- [ ] **AC-05 (F003 — stability)**: AC-05b from spec proven — `__snapshots__/<source>-run{1,2,3}.json` + `<source>.json` (median) committed for all 4 manifest packages; drift ≤1 finding across the 3 raw runs.
- [ ] **AC-06 (F003 — regression)**: `PIJ_VET_LIVE=1 npx vitest run agent.live` passes; `Verdict.findings[].rule === "R-01"`.
- [ ] **AC-07 (override aging)**: After `pkg audit` on a stale entry whose `effective === "ok"` only via override, `vetted.date` is **unchanged** — overrides age out.
- [ ] **AC-08 (single override reader)**: `grep -n "vetted?.overrides" packages.ts` returns zero direct field accesses; all three readers go through `parseOverrides()`.
- [ ] **AC-09 (snapshot-staleness alarm)**: When `briefing.md` SHA changes but `__snapshots__/*.json` are older, `self-check` warns (does not block — soft alarm).
- [ ] **AC-10 (docs)**: `.pi/packages.yaml` header comment + RUNBOOK both show a worked `overrides: { rules, reason }` example.
- [ ] **AC-11 (no regression)**: `npm run self-check` still exits 0 with `PIJ_VET_SKIP_AGENT=1` (existing CI path unchanged).
- [ ] **AC-12 (plan re-validation)**: Plan 009 Validation Record + `extension-vetting.fltplan.md` Flight Log carry an FX001 close-out entry; AC-04/AC-05/AC-10/AC-11 confidence flipped in the original review's coverageMap reference.

## Assumptions

- `minih run package-vetter` is reproducibly runnable in the dev environment (verified at FX001-4 start).
- The `parseDocument`/`writeDoc` YAML pattern used by `cmdAdd`/`cmdBootstrap` preserves comments and key order when mutating existing `YAMLMap` nodes in-place via `.set()`. **Verified** by FX001-3's round-trip test — if this turns out to be false, FX001-3 must switch to a comment-preserving serializer before merging.
- The `vetter:"audit"` name does not collide with any future Tier-2 vetter (Plan 009 Non-Goal forecloses Tier-2 in v1, so safe).

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## After Fix Completion

```bash
# Implement
/plan-6-v2-implement-phase --fix "FX001" --plan "/Users/jordanknight/pi-hacking/pij/docs/plans/009-extension-vetting/extension-vetting-plan.md"

# Review
/plan-7-v2-code-review --fix "FX001" --plan "/Users/jordanknight/pi-hacking/pij/docs/plans/009-extension-vetting/extension-vetting-plan.md"
```

Then re-run the `code-review` minih agent against the FX001 change set and confirm the original `REQUEST_CHANGES` flips to `APPROVE` (or surfaces a new, smaller delta).
