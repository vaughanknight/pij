# pij

Engineering harness for building [pi](https://github.com/earendil-works) extensions.

> **The harness is the product.** pij is infrastructure for authoring pi
> extensions fast, with patterns P1–P10 enforced by templates and a
> measured velocity log so the path compounds with use.

## Three commands

```bash
npm install                        # boot
npm run new -- <name>              # scaffold a new extension
npm run self-check                 # typecheck + lint + test + smoke
```

For everything else, see [`RUNBOOK.md`](./RUNBOOK.md). For agent rules
and the pattern library, see [`AGENTS.md`](./AGENTS.md). For the
Boot/Interact/Observe contract, see
[`docs/project-rules/harness.md`](./docs/project-rules/harness.md).

## Where things are

| What | Where |
|------|-------|
| Extensions | `.pi/extensions/<name>/` |
| Templates + generator | `harness/templates/`, `harness/scripts/new-extension.ts` |
| Smoke runner | `harness/scripts/smoke.ts` |
| Test utilities | `harness/test-utils.ts` |
| Difficulty ledger | `docs/difficulties.md` |
| Velocity log | `docs/velocity.md` |
| Workshops + research | `docs/plans/001-pi-extensions/` |
| Spec + plan for v0.1.0 | `docs/plans/002-pij-harness/` |

## Status

v0.1.0 — first ship. The throwaway `demo` extension is generated during
the build to validate the harness end-to-end, then removed before the
tag. Extension #2 (the real first one — likely `scratch`) is the
velocity-hypothesis test (see `docs/velocity.md`).

## License

See [`LICENSE`](./LICENSE).
