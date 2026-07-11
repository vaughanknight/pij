# Preamble checkpoint — s039 dependency chores audit

## claim

Jordan's scope ruling is recorded, the governed flight plan is active, and the audit surface has been explored without changing dependencies. Planning may proceed from a 34-finding baseline split into Vitest 5, Pi 3, and minih 26.

## artifacts[]

- `docs/plans/039-dependency-chores-audit/original-ask.md`
- `docs/plans/039-dependency-chores-audit/rulings.md`
- `docs/plans/039-dependency-chores-audit/research-dossier.md`
- `docs/plans/039-dependency-chores-audit/the-flow.json`
- `docs/plans/039-dependency-chores-audit/the-flow.md`

## shas[]

- `original-ask.md` — `219b0e936b0389284dc4f0c82e305c128a5429d246b3728492a42603c08ad7db`
- `rulings.md` — `4db3d9e16e6fe2a512de396d5fa9c03a50b5284c6827d1f3d12009c36d6edbb0`
- `research-dossier.md` — `e6dedac6e77ff7bafb76893a0745ffd764c518f2f159a3f05c89620feeabca60`
- `the-flow.json` — `fffc75ac61b7ff00d6449034c68a9deea2f1e664340b84192a21918e34058f30`
- `the-flow.md` — `61508e80b802fd1b43b416079fac085078684a2b3b031fcc588cf3ec449d2ff2`

## gates[]

- `harness boot` — ready; `just typecheck` and `just test` passed before the survey.
- `gh` Dependabot survey — completed; no PRs/config, alerts and automated fixes disabled.
- `npm audit --json` — baseline captured: 1 critical, 9 high, 24 moderate.
- `npm audit --omit=dev --json` — production-inclusive baseline captured: 8 high, 21 moderate.

## observations[]

- `DL-001` — `npm audit fix --dry-run --json` emits leading human output and does not recompute the residual audit count; implementation must use real post-update audit snapshots.
- Existing retro `004-pij-memorable-id-poc.md` independently requests a deterministic dependency-audit delta helper.

## open[]

- Pi 0.80.6 requires Node `>=22.19.0`; the existing Node 20 CI leg is a stop-and-escalate compatibility risk.
- minih's safe-version candidate is upstream PR 73, currently red on an OpenTelemetry exporter API TypeScript error and not released.
- The o-prime must grant the sequenced package-manifest seam before implementation because work item 040 owns the current `unique-names-generator` diff.
