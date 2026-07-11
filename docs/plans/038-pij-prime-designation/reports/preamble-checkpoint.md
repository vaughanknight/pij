# s038 report — preamble checkpoint
**From**: pij-118mbuv · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: preamble complete → planning authorized

**claim**: Orient stack, mandatory repo reads, harness boot, and read-only item survey are complete. Jordan ruled the namespace and filtering questions; the flight plan and research dossier now bound the plan. No product-code mutation has occurred.

**artifacts[]**:
- `docs/plans/038-pij-prime-designation/original-ask.md`
- `docs/plans/038-pij-prime-designation/rulings.md`
- `docs/plans/038-pij-prime-designation/research-dossier.md`
- `docs/plans/038-pij-prime-designation/the-flow.json`

**shas[]**:
- original ask: `2f03cf70524246a3ca43e2f2b5291b63763bd00c43977c18765e8858813a34b6`
- rulings: `a9c03374ee8992cc4bbefdb97fdcebbf9046b43ffba8321fb19d9abc8849bc7b`
- dossier: `10c6bdbcf813fc4d91daa60a14f4b6748f08752e4ee11aa1e7095275a06bff8e`
- flight plan: `f0c0e45a6910cfd21722df3dfb7fcaf837cdc1be1df833d5e3da0638ce40eb3e`

**gates[]**:
- `harness boot` → status `ok`; typecheck and test stages green.
- Later cheap gate: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check`.
- Ship/done gate: `harness checks`.

**observations[]**:
- `SUGG-001`: `skills/pij/SKILL.md` claims complete CLI-verb coverage but omits the shipped `orchestration` family; Plan 038 should add baton/prime coverage and strengthen the skill gate.
- The mutable prime marker cannot safely copy `reportedAt`'s preserve-if-missing rule verbatim: unset needs latest-on-disk authority or a stale daemon write can resurrect `prime:true`.
- Existing durable identity snapshots and reattach spreads make designation persistence a small additive change rather than a new store.

**open[]**:
- O-1: Plan may choose the compact human `pij list` prime marker/column wording; no product ruling is needed.
- O-2: Exact code touch-list and fence-vs-manifest diff will be reported at plan validation before implementation.
