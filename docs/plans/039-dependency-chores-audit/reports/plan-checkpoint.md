# Plan checkpoint — s039 dependency chores audit

## claim

The unified Simple plan is **READY** and validated with fixes. It defines one implementation phase with six tasks, a governed package/CI fence, and a mechanically reproduced 34→29→26 audit path that leaves only minih-root findings.

## artifacts[]

- `docs/plans/039-dependency-chores-audit/dependency-chores-audit-plan.md`
- `docs/plans/039-dependency-chores-audit/research-dossier.md`
- `docs/plans/039-dependency-chores-audit/rulings.md`
- `docs/plans/039-dependency-chores-audit/validations/dependency-chores-audit-plan-validation.md`
- `docs/plans/039-dependency-chores-audit/the-flow.json`
- `docs/plans/039-dependency-chores-audit/the-flow.md`

## shas[]

- `dependency-chores-audit-plan.md` — `5306257e6ad31c570ebff3c2d28f3098f7ef4993394e49380dc29ff5dfbffc44`
- `research-dossier.md` — `7de6d7f7727def4ff844bf8bec587a8df7b788bf71bf3fe5e515372768e54591`
- `rulings.md` — `95664008e2953ee87cfbf4170dcfa1209250c04ecb8caf44a0d829490d6e0b74`
- `dependency-chores-audit-plan-validation.md` — `d743b70d20be2bac2cb71cb8dfa951c8dd8cfcd23832873d9a89e762e97cdffa`
- `the-flow.json` — `8da5ccee4740d9794e8b56435ef296986ef9e8c631f61bab1409280b18533d6f`
- `the-flow.md` — `b8e51911fd934b0398b75a8b88c092cd27588e1183fe5fdf3971ecc1078b3804`

## gates[]

- Plan Gate Matrix — 4 PASS, 0 FAIL, 3 N/A; `Status: READY`.
- `validate-v2` — **VALIDATED WITH FIXES**; targeted recheck returned `no_material_findings`.
- Scratch lock proof — Vitest 4.1.10 + tsx 4.23/esbuild 0.28.1 produces audit total 29, critical 0.
- Scratch lock proof — Pi peer family 0.80.6 + root ws 8.21 produces audit total 26, critical 0, minih-only ancestry.
- SW-5 — o-prime verified `package.json` and `package-lock.json` byte-clean against HEAD; hunk-level staging refused.

## Domain Manifest

| Surface | Domain | Classification | Fence request |
|---------|--------|---------------|---------------|
| `package.json` | `extension-authoring-harness` | contract | modify |
| `package-lock.json` | `extension-authoring-harness` | internal | modify |
| `.github/workflows/ci.yml` | `extension-authoring-harness` | contract | modify |
| `docs/plans/039-dependency-chores-audit/**` | `extension-authoring-harness` | internal | owned plan artifacts |

`vitest.config.ts` is not requested. A proven compatibility failure would be an escalation before edit.

## observations[]

- `DL-001` — `npm audit fix --dry-run --json` is not machine-clean and does not recompute residual counts.
- `WIN-001` — scratch probes caught overlapping `ws` and `tsx`/`esbuild` ancestry and encoded the deterministic extra updates needed for the honest target.
- Existing retro `004-pij-memorable-id-poc.md` recommends a reusable dependency-audit delta helper.

## open[]

- The git-index baton is free, but Plan 039 will not request or stage until this checkpoint receives the o-prime's fence grant.
- The pre-coding backpressure survey is due as an advisory flow chore.
- minih's 26 residual findings remain monitor-only until a green released upstream fix receives a new ruling.
