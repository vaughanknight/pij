# How: build pij

Everything you need to take a fresh clone of pij to a green build. The `justfile`
is the single source of truth for every command here — this article narrates it,
it never invents commands. If a step below ever disagrees with the
[`justfile`](../../justfile), the `justfile` wins.

## Prerequisites

| Need | Why | Check |
|------|-----|-------|
| **Node `>=24`** | repo engine constraint | [`package.json`](../../package.json) `engines.node` = `>=24` |
| **npm** | dependency install + the committed `package-lock.json` | `npm -v` |
| **tmux** | `just smoke` drives end-to-end sessions through the tmux Driver SDK | `tmux -V` |
| **The ambient `harness` CLI** | `harness boot` / `harness checks` / `harness doctor` (global npm tool, **not** a repo dep) | `harness --version` |

The `harness` CLI is an *ambient global tool*, while the `.harness/` substrate
in this repo is committed configuration it reads — see
[`AGENTS.md`](../../AGENTS.md) (§ Harness tooling, lines ~120–128) and
[`.harness/engineering-harness.md`](../../.harness/engineering-harness.md).

## One-command bootstrap

The bootstrap is idempotent — safe to re-run any time pi's global state drifts
(after a pi self-update, after switching machines).

Unix:

```bash
git clone <pij-repo> && cd pij
just install
```

Windows:

```powershell
git clone <pij-repo>
Set-Location pij
pwsh -File .\install-windows.ps1
```

The Windows script is the native counterpart to `just install`: it uses
directory junctions instead of privileged symlinks, invokes Windows command
shims directly, and installs the `lean-ctx` prerequisite from its official
prebuilt npm package instead of the manifest's Homebrew command.

If a run is interrupted, resume from its numbered stage without repeating the
earlier work:

```powershell
pwsh -File .\install-windows.ps1 -StartAt 5
```

Both entry points run the same six ordered stages:

1. **`npm ci --min-release-age=null`** — replay the committed root lockfile with
   the npm/cli #9005 compatibility exception described below.
2. **Install/update the official global `pi` binary** (`just pi-official-install`)
   under the repository's seven-day npm release-age policy.
3. **Sync repo-managed global Pi config** into the global agent dir:
   `.pi/APPEND_SYSTEM.md → ~/.pi/agent/APPEND_SYSTEM.md`,
   `.pi/mcp.json → ~/.pi/agent/mcp.json`, and the three managed provider
   objects from `.pi/models.json` into `~/.pi/agent/models.json`. The model
   merge preserves machine-local and otherwise unmanaged providers.
4. **Link pij's local extensions** into `~/.pi/agent/extensions/` (`just link`
   on Unix, directory junctions on Windows) and link the `pij` CLI onto `PATH`
   (`npm link`).
5. **Install every vetted package** from `.pi/packages.yaml` globally
   (`just pkg bootstrap`).
6. **Run `just pi-doctor`** as a final verification.

After it completes, `pi` from *any* cwd on the machine gets the same extensions,
MCP servers, prefs, portable models, and global packages pij configures. The pi
side of this (what pi is, how the global state syncs) is documented in
[`update-pi.md`](update-pi.md).

## The recipe surface

`just` with **no recipe** lists everything (`justfile:16-18`):

```bash
just            # list all recipes (alias for `just --list`)
```

Day-to-day recipes:

| Recipe | Does | `justfile` |
|--------|------|-----------|
| `just new <name>` | Scaffold a new T2 extension (never hand-roll the boilerplate) | `143-144` |
| `just typecheck` | `tsc --noEmit` via `npm run typecheck` | `70-71` |
| `just lint` | Biome check (errors + warnings) | `73-74` |
| `just format` | Auto-fix formatting + import order via Biome | `77-78` |
| `just test [path]` | Run vitest; optionally scope to a file/pattern | `80-82` |
| `just smoke` | tmux-driven end-to-end smoke (Driver SDK) | `91-93` |
| `just link` / `just unlink` | Symlink (or remove) `.pi/extensions/*` into `~/.pi/agent/extensions/` | `147-151` |
| `just pij <args>` | Run the pij CLI in-repo, no global install | `95-98` |
| `just pkg <args>` | Manage third-party pi-extensions via `.pi/packages.yaml` | `100-102` |
| `just release-age-probe` | Separately prove locked install, fresh-resolution refusal, and root audit visibility | release-age recipes |
| `just sync-models [--source <path>] [--target <path>]` | Atomically merge repo-managed providers into Pi's global model registry | `106-109` |

## npm release-age boundary

The root [`.npmrc`](../../.npmrc) uses npm's native `min-release-age=7`; the
unit is **days**. It also leaves `audit=true`. The typed policy helper at
`harness/scripts/release-age-policy.ts` supplies the same environment to
pij-owned Pi installs, and the `justfile` imports that constant for the official
global Pi install and `pi update --extensions`.

Coverage is deliberately narrow:

- Fresh root npm resolution observes the committed seven-day setting.
- `pkg add` and `pkg bootstrap` propagate it to Pi's nested npm resolution.
- `just pi-official-install` and the extension-only update in `just update-pi`
  propagate it without removing the existing `--ignore-scripts` flag.
- Pi's own bare self-update command is upstream behavior and is **not** covered
  or claimed. `just update-pi` does not invoke bare `pi update`.

A successful `npm ci` proves only that the frozen lock installs. It is not
fresh-resolution evidence. npm/cli
[#9005](https://github.com/npm/cli/issues/9005) currently makes the project
`min-release-age` conflict with npm's internally derived `--before` during nested
git preparation. Root lock replay therefore uses
`npm ci --min-release-age=null`: the CLI `null` clears the inherited value for
that frozen operation. The exception is wired only into `just install` and the
Node 22/24 + Windows CI lock-replay steps. Never use it with `npm install`.

Root `npm audit --json` is a separate, report-only observation; audit findings
do not become release-age failures and do not change package-vetter's
report-and-continue policy.

Run the isolated proof explicitly:

```bash
just release-age-probe
```

It copies the committed `.npmrc`, verifies npm derives a `before` date
approximately seven days earlier, and asks a local deterministic registry for a
fixture version published at probe time. Native npm must refuse that version
without any raw `--min-release-age` argument. The same run replays the unchanged
lock through the approved compatibility exception, captures every subprocess
result, observes audit JSON, verifies the root manifests were unchanged, and
removes its temporary root.

There is no generic age-zero recipe. The only exception is the exact root
lock-replay command above; every fresh `npm install`, Pi package install, global
Pi install, and extension update remains at seven days.

## The gate: `just self-check`

Before declaring any task done — or before ship — run the composite gate
(`justfile:117-123`). Agents **must** run this and never compose the steps by
hand:

```bash
just self-check
```

It runs, in order: **`local-path-check` → `typecheck` → `lint` → `test` →
`windows-compat` → `smoke` → `PIJ_VET_SKIP_AGENT=1 pkg audit` →
`snapshots-check`**. The portability sensor rejects user-specific absolute home
paths in operational source/config before they reach another machine.
`snapshots-check` is a soft alarm that warns when the package-vetter briefing
SHA drifts (`justfile:132-133`); it is informational and always exits 0.

## The engineering harness: `harness boot` / `checks` / `doctor`

pij has adopted the ai-substrate engineering harness. Two verbs matter
day-to-day (see [`AGENTS.md`](../../AGENTS.md) ~120–128 and
[`.harness/engineering-harness.md`](../../.harness/engineering-harness.md)):

- **`harness boot`** — fast readiness proof (typecheck + test).
- **`harness checks`** — the full ship/done gate: the same signal inventory as
  `just self-check`, but it runs **all** sensors and reports a per-sensor
  verdict, so one invocation surfaces every failure. `harness checks --quick`
  skips heavy smoke for a fast static + unit gate.
- **`harness doctor`** — audits what the harness loaded.

`harness checks` and `just self-check` are the same composite from two front
doors; use whichever you prefer. New back-pressure sensors are added under
`.harness/extensions/checks/` so this one verb stays the single "are we done?"
gate.

## Smoke = the tmux Driver SDK

`just smoke` (`justfile:91-93`) runs `harness/scripts/smoke.ts`, a thin adapter
over the typed **Driver SDK** at `harness/driver/` (`Scenario` / `Step` /
`Session`). It drives real `pi` sessions in a tmux pane end-to-end, so it
requires `tmux` on `PATH`. Author rich scenarios against the SDK directly; the
smoke script is just the default entry point.

## See also

- [`update-pi.md`](update-pi.md) — what `pi` is and how to keep it current.
- [`skills.md`](skills.md) — where skills live and how they install.
- [`AGENTS.md`](../../AGENTS.md) — the full agent rules (P1–P10, workflow).
- [`RUNBOOK.md`](../../RUNBOOK.md) — the operational runbook.
