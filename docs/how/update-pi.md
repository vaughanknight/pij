# How: what Pi and OMP are, and updating them

A cold-start agent on a new machine needs to know what the two Pi-family
runtimes are and how pij keeps their shared surfaces current. The executable
and link recipes live in the [`justfile`](../../justfile); this article narrates
them, while the `justfile` remains the source of truth.

## What is pi?

`pi` is the **official npm binary** `@earendil-works/pi-coding-agent`. pij does
not ship its own pi — it installs the upstream one and layers configuration on
top. The install is done by `just pi-official-install`:

```bash
just pi-official-install
```

That recipe runs npm through `harness/scripts/npm-resolution-run.ts`, which
sets the Microsoft package-feed proxy, forces online metadata revalidation,
and keeps the seven-day client release-age policy.

pij contributes machine-wide state under both `~/.pi/agent/` and
`~/.omp/agent/`:

- **`APPEND_SYSTEM.md`** — Pi voice-input rules, response-mode prefs, and SQL
  prefs.
- **`mcp.json`** — Pi's MCP source of truth (perplexity + flowspace/`fs2`), with
  env-var references rather than plaintext secrets. OMP's `mcp.json` is a
  symlink to this exact file.
- **`models.json` managed providers** — Pi's portable `github-copilot`,
  `sakana`, and `openrouter` catalog sourced from `.pi/models.json`.
- **Extension symlinks** — every repository extension under
  `~/.pi/agent/extensions/`; only `pij` under `~/.omp/agent/extensions/`.
- **Vetted packages** — third-party Pi extensions from `.pi/packages.yaml`.

The guarded linker accepts only the canonical main checkout. It refuses linked
worktrees, real destination paths, and foreign symlinks, so a development seat
cannot silently take over either machine-wide runtime.

The source of truth for repo-managed config remains `.pi/APPEND_SYSTEM.md`,
`.pi/mcp.json`, and `.pi/models.json`. `just sync-models` replaces only the
three managed provider objects; credentials and unmanaged providers stay
outside repository ownership.

## The canonical refresh: `just update-pi`

`just update-pi` is the one command to refresh pi's runtime state from this repo.
It is the same shape as the pi-related
steps of [`just install`](build.md), runnable on its own any time pi drifts:

```bash
just update-pi
```

It performs:

1. **Install/update the official pi binary** (`just pi-official-install`).
2. **Sync pij config** — copy `.pi/APPEND_SYSTEM.md` and `.pi/mcp.json`, then
   merge the managed providers from `.pi/models.json` into
   `~/.pi/agent/models.json`.
3. **Apply canonical machine links** (`just link`): all extensions for Pi,
   pij-only plus Pi's exact MCP config for OMP; then link the `pij` skill and CLI.
4. **Ensure vetted packages are installed** globally (`just pkg bootstrap`).
5. **Update extension packages only** — `pi update --extensions`, under the
   same governed npm environment. The `--extensions` flag is deliberate: a
   bare `pi update` *also* self-updates pi and would fight the explicit npm
   install above.
6. **Run `just pi-doctor`**.

Always refresh pi through this recipe so the global CLI stays the official npm
build while pij's local extensions and config remain globally visible.

## Refresh OMP: `just update-omp`

OMP is the standalone `omp` binary installed by its official installer. Use
`just update-omp`; it invokes OMP's updater (or installs when absent), reapplies
the guarded canonical link policy, then runs `just omp-doctor`. Do not manually
copy extensions between homes.

## Verify: Pi and OMP doctors

`just pi-doctor` audits the Pi binary, global extension links, package manifest,
MCP config, and globally linked `pij` executable. Run it first when Pi cannot
see a managed surface.

`just omp-doctor` audits the OMP binary and enforces the smaller OMP contract:
`~/.omp/agent/extensions/` contains exactly the canonical `pij` symlink, and
`~/.omp/agent/mcp.json` resolves to `~/.pi/agent/mcp.json`. Any extra pij-owned
OMP extension is policy drift; real paths and foreign symlinks are reported but
never deleted.

## npm authority and failure behavior

Every npm read, resolution, download, install, audit, and remote `npx` launched
by the canonical flow uses:

```ini
registry=https://packagefeedproxy.microsoft.io/npm/
replace-registry-host=always
prefer-online=true
min-release-age=7
```

The proxy is authoritative, including tarball URLs already recorded in lockfiles:
`replace-registry-host=always` prevents a caller from preserving another lock host.
Online revalidation refreshes stale client
metadata, but it does not invent a missing exact version or repair inconsistent
metadata and tarballs. Those cases fail closed without a retry through another
registry, cache deletion, or lockfile rewrite.

Only frozen root lock replay uses `npm ci --min-release-age=null`. That command
still enforces the proxy, lock-host replacement, and online revalidation; the
exception clears only the age filter for the already committed exact lock.

For a manual, read-only check of one exact version, run:

```bash
node_modules/.bin/tsx harness/scripts/npm-resolution-diagnostic.ts <package@version>
```

The diagnostic uses empty temporary npm state, performs an age-governed
resolution before downloading, prints the governed lock-host replacement,
reports `PROXY_OK`, `PROXY_ABSENT`, `PROXY_INCONSISTENT`, `POLICY_TOO_YOUNG`, or
`DIAGNOSTIC_ERROR`, and removes its temporary state. It queries only the
configured Microsoft proxy.

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
