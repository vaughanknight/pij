# Phase 3 tasks — one `PIJ_HOME` resolver, all **seven** sites (pij#169)

Plan: [`../../../install-blocker-plan.md`](../../../install-blocker-plan.md) · Issue: pij#169

## Why this is all-seven-or-nothing

`core/agents/paths.ts:1-6` declares itself *"the one place that computes"* `PIJ_HOME`, and names the
three files it was written to replace: **cli.ts / index.ts / daemon.ts**. All three still inline it.
The de-duplication landed as an addition and propagated to none of its stated targets.

The resolver and the inlined sites **disagree on one input**:

| `PIJ_HOME` | `resolvePijHome()` | inlined `process.env.PIJ_HOME ?? join(homedir(), ".pij")` |
|---|---|---|
| unset | `~/.pij` | `~/.pij` |
| `/some/path` | `/some/path` | `/some/path` |
| `""` (set, empty) | `~/.pij` (empty treated as unset) | `""` → **cwd-relative paths** |

**Do not sweep a subset.** Today `daemon.ts:1094` and `cli.ts:235` *agree* under `PIJ_HOME=""` —
both cwd-relative — so the CLI reads the registry where the daemon writes it. Sweeping only the
daemon would make the daemon write `~/.pij` while the CLI still reads `./`: **a live daemon the CLI
cannot see.** A partial fix does not reduce the disagreement, it relocates it onto a pair that
currently agrees.

## The seven sites

| # | Site | Note |
|---|---|---|
| 1 | `.pi/extensions/pij/daemon.ts:1094` | named in the `paths.ts` header; has an `opts.pijHome ??` prefix — **keep it** |
| 2 | `.pi/extensions/pij/cli.ts:235` | named in the `paths.ts` header |
| 3 | `.pi/extensions/pij/cli.ts:551` | |
| 4 | `.pi/extensions/pij/index.ts:48` | named in the `paths.ts` header |
| 5 | `.pi/extensions/pij/core/daemon/watch.ts:67` | has a `deps.pijHome ??` prefix — **keep it** |
| 6 | `.pi/extensions/pij/adapters/focus-store.ts:53` | default parameter value — **keep the parameter** |
| 7 | `.pi/extensions/pij/telegram/index.ts:79` | |

Verify the set yourself before you start, and **do not use `head`**:

```bash
rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ | tee /tmp/pijhome-sites.txt | wc -l
```

## Tasks

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Replace all seven with `resolvePijHome()`, importing from `core/agents/paths.js` (mind the relative depth and the `.js` extension — NodeNext ESM). **Preserve each call site's own injection precedence** (`opts.pijHome ??`, `deps.pijHome ??`, the default parameter) | Behaviour identical for set and unset `PIJ_HOME` | AC-10 |
| 2 | Add a test asserting every surface agrees for **set / unset / empty** `PIJ_HOME`. Empty must now resolve to `~/.pij` **everywhere** | Green | AC-07, AC-10 |
| 3 | Update the Phase-1 empty-`PIJ_HOME` case in `daemon.bootstrap.test.ts` to the post-sweep expectation, **keeping the agreement assertion** — the invariant is that writer and reader agree, not the particular value | Green | AC-07 |
| 4 | Re-run the enumeration; it must return **zero** | `rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ \| wc -l` → `0` | AC-10 |
| 5 | Amend the `paths.ts` header (`:1-6`) so it no longer describes a de-duplication that had not happened — state what is true after this change | Comment matches reality | — |
| 6 | Full test suite | No new failures | AC-03 |
| 7 | `just typecheck && just lint` | Clean | AC-06 |

## Watch for

- **`resolvePijHome()` takes an injectable env** (`env: NodeJS.ProcessEnv = process.env`). Call it
  bare at these sites; do not thread an env parameter through call chains that do not have one.
- **`focus-store.ts:53` is a constructor default parameter.** `constructor(pijHome = resolvePijHome())`
  keeps the injection seam its tests rely on. Do not move the resolution into the body.
- **Import depth differs per file** (`./core/agents/paths.js` from `daemon.ts`,
  `../agents/paths.js` from `core/daemon/watch.ts`, `../core/agents/paths.js` from `adapters/`,
  `../core/agents/paths.js` from `telegram/`). Let the type-checker confirm each.
- **A test may already set `PIJ_HOME=""`** somewhere and depend on cwd-relative behaviour. If the
  sweep breaks such a test, that is a real behaviour change — report it, do not paper over it.

## Forbidden

`core/message.ts`, `core/state.ts`, `core/watchdog.ts`, `core/daemon/watchdog-manager.ts`,
`core/anomalies.ts`, `core/orchestration/pa-capability.ts`, `core/platform/types.ts`, `core/cli.ts`,
`.flow-pair/**`, `the-flow.json`, `the-flow.md`, `.the-flow-state.json`.

Touch **only** the resolution lines at the seven sites plus the `paths.ts` header. No drive-by
tidying — other agents are editing this repo right now.
