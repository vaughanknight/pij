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

## Using extensions on another machine

Three paths work today (no npm publish yet):

```bash
# Path 1 — clone the harness, run pi from inside (uses project autoload)
git clone https://github.com/AI-Substrate/pij.git && cd pij && npm install && pi

# Path 2 — clone, then symlink every extension into your user scope so they
# autoload from any cwd. Idempotent; refuses to clobber non-symlinks.
npm run link              # all extensions
npm run link -- scratch   # just one
npm run link -- --remove  # remove pij-owned symlinks

# Path 3 — let pi install directly from git (reads pij's pi.extensions manifest)
pi install https://github.com/AI-Substrate/pij.git
```

Once we have ≥3 stable extensions, workshop 005 will design the real
distribution model (bundle vs per-extension package). Until then, clone
or `pi install <git-url>` is the recommended path.

## Status

v0.1.0 — harness shipped (throwaway `demo` extension validated the path
end-to-end, then was torn down).

**v0.2 (current main)** — `scratch` is the first **kept** extension, the
orientation reference, and the first real-extension data point in
`docs/velocity.md`. Slash commands (`/scratch list|add|del|clear`),
LLM tools (`scratch_save`, `scratch_list`), status line, append-only
session persistence — see `.pi/extensions/scratch/`. The compounding
ratio (harness AC-15) is **deferred to extension #3** so it has ≥2
real-extension data points to compare. D-005 (does `customType` survive
`/compact`?) has a smoke scenario shipped at
`.pi/extensions/scratch/smoke.ts`; run `npm run smoke -- scratch` or
manually `/compact` in pi to resolve it.

## License

See [`LICENSE`](./LICENSE).
