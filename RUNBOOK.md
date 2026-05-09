# pij Runbook

Three commands.

## Boot

```bash
npm install
npm run self-check     # validates the harness still works end-to-end
```

If `self-check` fails, fix it before doing anything else. **The harness IS
the product.**

## New extension

```bash
npm run new -- <name>
```

Generates `.pi/extensions/<name>/{index,store,store.test,smoke}.ts +
AGENTS.md` from templates encoding patterns P1–P10.

## Iterate

```bash
cd $(pwd) && pi          # auto-loads .pi/extensions/<name>/
```

In the TUI, after edits: `/reload`. Pi has no file watcher — the reload
is manual on purpose (workshop 002).

Recommended four-terminal layout:

| Terminal | Command |
|---|---|
| A | `pi` (the TUI; type `/reload` after edits) |
| B | your editor |
| C | `npm run typecheck -- --watch` (catches type errors before /reload) |
| D | `npm run test:watch` (store unit tests) |

## Smoke

```bash
npm run smoke -- <name>     # one extension
npm run smoke               # all extensions with a smoke.ts
```

Requires `tmux` and `pi` on PATH.

## When something hurts

1. Open `docs/difficulties.md`, append a row (D-NNN).
2. If the fix is <30 min, **encode it now** (template, lint rule, helper).
   Do not just document it.
3. Otherwise, file a `stretch:` row and link the difficulty.

## Where things are

| What | Where |
|---|---|
| Extensions | `.pi/extensions/<name>/` |
| Skills/prompts/themes | `.pi/<kind>/` (future) |
| Templates | `harness/templates/extension/` |
| Generator | `harness/scripts/new-extension.ts` |
| Smoke runner | `harness/scripts/smoke.ts` |
| Test utils | `harness/test-utils.ts` |
| Workshops | `docs/plans/001-pi-extensions/workshops/` |
| Difficulty ledger | `docs/difficulties.md` |
| Velocity log | `docs/velocity.md` |
| BIO contract | `docs/project-rules/harness.md` |

## Authoring help

- **How extensions reach pi** → workshop 001
- **Edit-reload-test loop** → workshop 002
- **Canonical extension shape (P1–P10)** → workshop 003
- **The harness itself** → workshop 004
