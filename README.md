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

## session-sql

`session-sql` is a pi extension that gives the current pi session a private
SQLite scratch DB for structured agent work. Use `/sql status`, `/sql schema`,
and `/sql <query>` in pi; the model-facing tool is named `sql`. DB files live
under `~/.pi/db/session-sql/`, not in the repo.

```bash
npm run smoke -- session-sql
```

See [`docs/how/session-sql.md`](./docs/how/session-sql.md) for custom table
recipes, persistence/fork semantics, native SQLite extension loading, and
troubleshooting.

## SQL-backed todos

`todo` is the product-friendly layer over the same session SQL DB. Use `/todo`
for routine current-session work tracking and `/sql` for raw inspection.

```text
/todo add Write tests
/todo next
/todo done 1
/sql SELECT id, title, status FROM todos;
```

The model-facing tool is named `todo`. It supports list/add/status/done/block,
dependency, next-ready, and confirmed clear actions. The overlay opens with
`/todo overlay` and uses configurable defaults in `DEFAULT_TODO_KEYBINDINGS`.

```bash
npm run smoke -- todo
```

See [`docs/how/todo.md`](./docs/how/todo.md) for command examples, dependency
semantics, overlay keys, and `/todo` + `/sql` agreement scenarios.

## Minih Workbench

`minih-workbench` adds `/minih` for Pi-native Minih run visibility and safe
coordination. It lists Minih runs, opens a full modal viewer, supports gated
send to active coordinated runs, confirms stop controls explicitly, and pushes
compact material Minih context with redaction and duplicate suppression.

```bash
npm run smoke -- minih-workbench
```

See [`docs/how/agent-workbench.md`](./docs/how/agent-workbench.md) for commands,
tool contracts, safety gates, and troubleshooting.

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
| Custom / unlisted pi models | `RUNBOOK.md` § "Custom / unlisted pi models" (+ `D-020`) |
| Ralph Loop extension | `.pi/extensions/ralph-loop/` + [`docs/how/ralph-loop.md`](docs/how/ralph-loop.md) (RUNBOOK § "How to start a Ralph Loop") |
| Agent harness (companion mode) | [`docs/project-rules/agent-harness.md`](docs/project-rules/agent-harness.md) (RUNBOOK § "Companion mode (minih)") |

## Using extensions on another machine

Three paths work today (no npm publish yet):

```bash
# Path 1 — clone the harness, run pi from inside (uses project autoload)
git clone https://github.com/AI-Substrate/pij.git && cd pij && npm install && pi

# Path 2 — clone, then symlink every extension into your user scope so they
# autoload from any cwd. Idempotent; refuses to clobber non-symlinks.
npm run link              # all extensions
npm run link -- <name>    # just one
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

**v0.2** — `scratch` was built as the first real-extension data point in
`docs/velocity.md`; it has since been retired so the repo stays focused on
the harness.

**v0.3 (current main)** — Driver SDK (`harness/driver/`) gives typed
`Scenario`/`Step`/`Session` smoke primitives over tmux; `npm run smoke`
is a thin adapter. `extension-validator` agent pack at
`agents/extension-validator/` drives the SDK for autonomous validation.
`npm run link` symlinks pij extensions into `~/.pi/extensions/` for
cross-cwd use. `npm run pkg` + `.pi/packages.yaml` manage third-party
pi extensions (enable/disable; disable runs `pi remove`).

**v0.4 (in progress)** — `session-sql` adds a per-session SQLite workbench
with a generic `sql` tool and `/sql` command for structured current-session
state. `todo` adds a first-party task UX over the same SQL-backed work state.

## License

See [`LICENSE`](./LICENSE).
