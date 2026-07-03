# Validation — tasks/phase-1-router-skeleton-light-routes/tasks.md

✅ **VALIDATED WITH FIXES** — 2 high, 2 medium findings; all four applied in-target and reverified.

- **Target**: `docs/plans/030-pij-router-skill/tasks/phase-1-router-skeleton-light-routes/tasks.md`
- **Validated**: 2026-07-03 · adaptive (lead + deterministic proof + 1 independent critic)
- **Proof (fresh)**: plan tasks 1.1–1.9 ↔ T001–T009 map 1:1, nothing dropped/invented · probes live-run (`pij daemon status`, `pij whoami`, `pij models` in core/cli.ts:197, `run.schema.json:18` enum, justfile anchors L163/L175, domain-map FP node L15, E-FULL cap in core/session.test.ts:378) · no task touches `skills/flow-pair/**` or needs Phase-2 modules
- **Thesis**: advanced — a delegated implementor can build Phase 1 from the dossier alone; the two probes that would have misrouted guided `/pij` (dead `spawnedByUs` field, argless `nav show`) are fixed at spec time.
- **Consumers**: implement verb (executable as written) · Phase-2 dossier (registry shape with *lands Phase 2* rows defined) · `just` recipes (check semantics now phase-aware).

| Severity | Finding | Resolution |
|---|---|---|
| HIGH | `pij-skill-check` could never exit 0 on a correct Phase-1 tree: registry parity fails on pair/delegate rows (modules land P2) and repo-wide dup-grep fails on untouched `harness-modes.md` | T006: parity exempts *lands Phase 2*/*future* rows (flags early arrivals); dup-grep scope = `skills/pij/**` in P1, repo-wide at the P2 shim; plan AC-01 mirrored |
| HIGH | `spawnedByUs` probe named the wrong substrate — the field lives in run.json's roster, not `~/.pij/*.json` descriptors (grep of extension source: zero hits) | T002 probe rewritten: roster from newest run.json, liveness via `pij state <id>` / `~/.pij/<id>.json` presence |
| MEDIUM | `harness flow nav show` without `--path` always errors (E301); slug mode resolves to `.harness/flows/`, not `docs/plans/` | T002 probe: newest `docs/plans/*/the-flow.json` → `nav show --path <it>`, read `data.nav.now`/`next` |
| MEDIUM | "KF-09" dangled — plan 030's findings end at 06; the referent is plan 029 finding 09, resolvable from neither doc | T004 inlines the rule (spawned peers always fully-permissioned; presets bind `run` only; `spawn` warns on stderr) |

**Reverification**: re-read of edited T002/T004/T006 + plan AC-01 confirms each fix present; task↔plan map and phase discipline unchanged.
