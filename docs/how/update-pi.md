# How: what pi is, and updating it

A cold-start agent on a new machine needs to know two things: **what `pi`
actually is**, and **how pij keeps it current**. Both live in the
[`justfile`](../../justfile) — this article narrates it; the `justfile` is the
source of truth.

## What is pi?

`pi` is the **official npm binary** `@earendil-works/pi-coding-agent`. pij does
not ship its own pi — it installs the upstream one and layers configuration on
top. The install is done by `just pi-official-install` (`justfile:210-227`):

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@latest
pi --version
```

pij contributes five things to pi's **global** state under `~/.pi/agent/`:

- **`APPEND_SYSTEM.md`** — voice-input rules, response-mode prefs, SQL prefs
  (personal, applies to every pi session on the machine).
- **`mcp.json`** — MCP servers (perplexity + flowspace/`fs2`), with env-var
  references like `${PERPLEXITY_API_KEY}`, never plaintext secrets.
- **`models.json` managed providers** — the portable `github-copilot`,
  `sakana`, and `openrouter` catalog sourced from `.pi/models.json`.
- **Extension symlinks** — pij's local `.pi/extensions/*` linked into
  `~/.pi/agent/extensions/`.
- **Vetted packages** — third-party pi-extensions from `.pi/packages.yaml`.

The **source of truth** for repo-managed global config is in this repo:
`.pi/APPEND_SYSTEM.md`, `.pi/mcp.json`, and `.pi/models.json`. Run
`just sync-models` after editing the model catalog. It replaces the three
managed provider objects exactly while preserving `local` and every other
unmanaged provider in the global target. Resolved credentials, `auth.json`,
skills, and machine-local providers remain outside repository ownership.

## The canonical refresh: `just update-pi`

`just update-pi` is the one command to refresh pi's runtime state from this repo
(`justfile:306-330`, header `292-302`). It is the same shape as the pi-related
steps of [`just install`](build.md), runnable on its own any time pi drifts:

```bash
just update-pi
```

It performs:

1. **Install/update the official pi binary** (`just pi-official-install`).
2. **Sync pij config** — copy `.pi/APPEND_SYSTEM.md` and `.pi/mcp.json`, then
   merge the managed providers from `.pi/models.json` into
   `~/.pi/agent/models.json`.
3. **Link pij extensions globally** (`just link`) and link the `pij` CLI
   (`npm link`).
4. **Ensure vetted packages are installed** globally (`just pkg bootstrap`).
5. **Update extension packages only** — `pi update --extensions` (the
   `--extensions` flag is deliberate: a bare `pi update` *also* self-updates pi
   and would fight the explicit npm install above; `justfile:299-302`).
6. **Run `just pi-doctor`**.

Always refresh pi through this recipe so the global CLI stays the official npm
build while pij's local extensions and config remain globally visible.

## Verify: `just pi-doctor`

`just pi-doctor` is a **read-only audit** of pi's globally-visible state
(`justfile:345-357`). Run it first whenever "pi can't see X". It prints:

- the `pi` binary location + version,
- `~/.pi/agent/extensions/` symlinks (pij's extensions should be here),
- `~/.pi/agent/settings.json` `packages[]` (the manifest packages),
- `~/.pi/agent/mcp.json` servers,

and flags anything that looks wrong.

## Optional: the pi-fork path (advanced — pi-core dev only)

If you are developing **pi itself** (not just pij), there is an optional path to
build and link a local `../pi-fork` checkout as the global `pi` instead of the
npm binary. This is advanced and **not** needed for normal pij work:

| Recipe | Does | `justfile` |
|--------|------|-----------|
| `just pi-fork-sync-upstream` | Fast-forward the local `../pi-fork` checkout from official upstream and push to the fork | `233-247` |
| `just pi-fork-build` | Build the `../pi-fork` checkout and link it globally | `278-290` |
| `just pi-fork-link` | Link the already-built fork CLI as global `pi`, recording the commit | `251-274` |

For everyone else, the official-npm flow above is canonical — `just install` /
`just update-pi` always restore the official binary.

## See also

- [`build.md`](build.md) — the full fresh-machine bootstrap (`just install`).
- [`skills.md`](skills.md) — skills are a separate global layer from pi packages.
- [`AGENTS.md`](../../AGENTS.md) — security protocol for adding pi packages.
