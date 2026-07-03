# Validation — tasks/phase-2-pij-agent-cli-surface-built-ins-docs/tasks.md

- **Validated**: 2026-07-03T09:35:00+10:00
- **Target**: `docs/plans/029-pij-agents-minih/tasks/phase-2-pij-agent-cli-surface-built-ins-docs/tasks.md`
- **Contract sources**: plan (Phase 2 table, KF-03/06/07, coverage map), `workshops/002-pij-agent-cli-experience.md`, Phase-1 code as-built (`core/agents/` exports), minih dist at `minih-v0.2.4`
- **Checks**: plan tasks 2.1–2.9 → T001–T009 complete (nothing dropped: sweep-at-run-start in T004, un-ejected-ephemeral + module-URL resolution in T007, scratch script in T009); B-exports section verified against live `grep '^export'` of the as-built modules; cli.ts USAGE :73 / loadModels :152, core/cli.ts PROVIDER_HARNESS_MAP :336, telegram intercept precedent :891 confirmed; envelope/flags/exit codes/errors cross-checked against workshop 002 — no contradictions; boundary test confirmed to recursively cover new `core/agents/*.ts` files; `.fs2/graph.pickle` present; one independent critic (read-only), findings lead-verified against minih dist + inline.ts/runner.ts source
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: purpose met — Phase 2 implementable against the real Phase-1 API with the one genuine API gap now named instead of discovered mid-build
- **Consumers**: 1/1 (flow-pair coder/reviewer) — satisfied

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | Ephemeral run of an *existing* pack has no Phase-1 export, and `runAgentPack` does not suppress minih retro auto-harvest — a completed `--ephemeral`/built-in run could append `docs/retros/<slug>.md`, escaping T007's original git-status check | `MINIH_NO_AUTO_HARVEST` set only in `inline.ts:63–76` (lead re-grepped both files); minih `tryAutoHarvestRetro` guard at `dist/runner/runner.js:62` (lead re-read) | fixed — B-exports gap note added specifying `runEphemeralPack` helper (cpSync whole pack → tmpDir, env var set-and-restored, finally-delete); T004/T007 reference it; T007 Done-When now also asserts zero `docs/retros/` writes |
| MEDIUM | Built-in model "sonnet-class" was not a concrete id, and workshop 002's list/show examples contradicted it with `claude-opus-4-8` | workshop 002 lines 80/150 vs plan AC-08 + § Clarifications directive | fixed — T007 pins `model: claude-sonnet-4-6` citing the plan Clarifications supersession; workshop 002 examples updated with a dated supersession note |
| MEDIUM (lead, pre-critic) | T004 originally implied `core/agents/` importing `core/cli.ts` (reverse dependency edge) | dependency-direction rule in Phase-1 dossier | fixed — bin injects `loadModels`/`PROVIDER_HARNESS_MAP` as deps (RunnerDeps pattern) |

## Repairs

All mechanical, evidence-pinned, in-target (plus one two-line supersession correction in workshop 002, authorized by the plan's recorded Clarifications directive). `runEphemeralPack` note re-verified against `inline.ts` set/restore mechanics.
