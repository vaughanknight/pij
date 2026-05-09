# Workshop: Loading pij extensions into the installed `pi` binary

**Type**: Integration Pattern
**Plan**: 001-pi-extensions
**Spec**: (no spec yet — workshop seeded from research dossier)
**Created**: 2026-05-09
**Status**: Draft

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [`findings/03-skills-prompts-themes-packages.md`](../findings/03-skills-prompts-themes-packages.md) — pi-package install mechanics
- [`findings/06-docs-and-distribution.md`](../findings/06-docs-and-distribution.md) — official docs map
- pi-mono `packages/coding-agent/docs/extensions.md` — canonical reference (§ Extension Locations)
- pi-mono `packages/coding-agent/docs/packages.md` — `pi install` flow

**Domain Context**:
- **Primary**: future `extensions/` domain (anything calling `pi.register*`/`pi.on(…)`)
- **Related**: future `tools-bridge/`, `context/` domains; the `distribution` boundary is what this workshop is about

---

## Purpose

Pij is a **producer** repo (we author extensions, skills, prompts, themes here). `pi` is the **consumer** binary the user already has installed (via npm, Homebrew, or `curl … install.sh`). This workshop crystallizes the six different ways extension code can flow from a pij checkout into a running `pi` process — when to use which, what each does to the user's machine, and which we should pick for our own dev loop versus public sharing.

## Key Questions Addressed

- Where does `pi` look for extensions on startup?
- How do we point `pi` at our work-in-progress extensions in the pij checkout?
- What's the difference between `pi -e <thing>` and `pi install <thing>`?
- How do we share an extension with someone else once it's working?
- Do we need a build step? Compile TypeScript? Bundle?
- Where do `node_modules` and `package.json` come into play?

---

## Mental Model

```
┌──────────────────────────────────────────────────────────────────────────┐
│  THE pi BINARY (already installed somewhere on the user's machine)       │
│                                                                          │
│  On startup, before reading the first user prompt, pi resolves           │
│  resources in this order:                                                │
│                                                                          │
│  1. ~/.pi/agent/extensions/*.ts            (global auto-discovery)      │
│  2. ~/.pi/agent/extensions/*/index.ts      (global, multi-file)         │
│  3. <cwd>/.pi/extensions/*.ts              (PROJECT auto-discovery)      │
│  4. <cwd>/.pi/extensions/*/index.ts        (project, multi-file)        │
│  5. extensions[] entries in settings.json  (~/.pi/agent + .pi/)         │
│  6. packages[] entries in settings.json    (npm | git | local)          │
│  7. -e / --extension flag arg              (one-shot, this run only)    │
│                                                                          │
│  Each found extension is loaded with jiti — TypeScript runs directly,    │
│  no compile step.                                                        │
│                                                                          │
│  Loaded extensions register: tools, commands, shortcuts, flags,          │
│  message renderers, providers + subscribe to ~20 lifecycle events.       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Two facts that drive everything else**:

1. **`<cwd>/.pi/`** is the project hook. If you run `pi` while `cwd` is inside pij, pij's `.pi/extensions/` is auto-loaded. This is the cleanest dev loop.
2. **`pi install`** writes a settings entry. It does *not* copy files for local paths — settings store the absolute path and pi loads from there. Re-pointing pij's checkout = settings entry still works.

---

## The Six Paths from pij → pi

| # | Path | Persistence | Best for | Cost |
|---|------|-------------|----------|------|
| 1 | **Project-scoped autoload** (`pij/.pi/extensions/`) | Local to pij checkout | Daily dev loop | Free |
| 2 | **Direct file flag** (`pi -e ./pij/.pi/extensions/foo.ts`) | One-shot | A single experiment, debugging in another project | Free |
| 3 | **User-scope symlink/install** (`~/.pi/agent/extensions/pij-*`) | Global, every session | "I want my pij stuff everywhere" | Symlink upkeep |
| 4 | **`pi install <local-path>`** | Persistent in settings | Sharing pij with yourself across machines/projects via dotfiles | None — settings is just a path entry |
| 5 | **`pi install git:github.com/jakkaj/pij`** | Persistent in settings | Sharing with collaborators | Public repo, ref hygiene |
| 6 | **`pi install npm:@jakkaj/pij-extensions`** | Persistent in settings | Public distribution to many users | npm publishing chore |

The rest of this workshop walks each path with concrete commands.

---

## Path 1 — Project-scoped autoload (recommended dev loop)

### Setup

The pij repo already has a `.pi/` directory (we use it for `.pi/extensions/.../...`). Create `extensions/` underneath:

```bash
cd /Users/jordanknight/pi-hacking/pij
mkdir -p .pi/extensions .pi/skills .pi/prompts .pi/themes
```

Drop a TypeScript file in:

```typescript
// pij/.pi/extensions/hello.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "Greet from pij",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"} — from pij`, "info");
    },
  });
}
```

### Run

```bash
cd /Users/jordanknight/pi-hacking/pij
pi
# In the TUI:
/hello jordan
# → toast: "Hello jordan — from pij"
```

### Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ shell:  cd ~/pi-hacking/pij                                   │
│ shell:  pi                                                    │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ pi resolves:                                                  │
│   • ~/.pi/agent/extensions/  (any global)                    │
│   • ./.pi/extensions/         (← finds hello.ts)             │
│   • settings.json packages[]                                  │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│ jiti loads hello.ts → factory invoked → /hello registered    │
└───────────────────────────────────────────────────────────────┘
```

### Why this is the recommended dev loop

- **Zero install step.** Save a `.ts` file, `/reload`, done.
- **Versioned with the repo.** Anyone who checks out pij and runs `pi` from the root gets the same extensions.
- **Plays nicely with auto-discovery.** Skills, prompts, themes also live under `.pi/<kind>/` — same model.
- **Doesn't pollute the user's global config.** Other projects are unaffected.

### Limits

- Only active when `cwd` is the pij checkout (or a child of it).
- Doesn't help collaborators who don't have the pij checkout.

### npm dependencies (when needed)

Add a `package.json` at pij root *or* inside `.pi/extensions/<ext>/`. Run `npm install` once. jiti resolves `node_modules/` automatically.

```json
// pij/package.json (minimal)
{
  "name": "pij",
  "private": true,
  "dependencies": {
    "zod": "^3.23.0"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

(Why `peerDependencies`: pi already bundles those. Listing them in `dependencies` would shadow pi's copies — see pi-mono `packages.md` § Dependencies.)

---

## Path 2 — Direct file flag (`-e`)

### When

You want to try a single extension *without* changing the user's settings or being in the pij directory. Quickest possible smoke test.

### Commands

```bash
# From anywhere
pi -e /Users/jordanknight/pi-hacking/pij/.pi/extensions/hello.ts

# Multi-file (point at the directory containing index.ts)
pi -e /Users/jordanknight/pi-hacking/pij/.pi/extensions/hello-multi/

# pi accepts -e for npm and git too
pi -e npm:@earendil-works/some-pkg
pi -e git:github.com/user/repo
```

### Caveats

> ⚠️ Extensions loaded via `-e` are **not hot-reloadable** with `/reload`. The official docs are explicit: "Extensions in auto-discovered locations can be hot-reloaded with `/reload`." `-e` extensions persist for the run only and are reloaded only by relaunching pi.

So `-e` is for one-off experiments, not iterative work. If you find yourself `-e`-ing the same file repeatedly, move it to `.pi/extensions/`.

---

## Path 3 — User-scope (always-on) via symlink

### When

You want a pij extension active in *every* pi session regardless of `cwd`. Useful for things like a global `/hello` command, a personal status line, or a paste-handling input hook.

### Commands

```bash
# Symlink the file (lets you edit in pij, see effects globally)
ln -sf "/Users/jordanknight/pi-hacking/pij/.pi/extensions/hello.ts" \
       "$HOME/.pi/agent/extensions/pij-hello.ts"

# Or symlink an entire directory (multi-file extension)
ln -sf "/Users/jordanknight/pi-hacking/pij/.pi/extensions/some-ext" \
       "$HOME/.pi/agent/extensions/pij-some-ext"
```

### Why a symlink, not a copy

Editing the symlink target = editing the pij file = `/reload` picks up the change. Copies drift.

### Why prefix names with `pij-`

Avoids collisions with other extensions in `~/.pi/agent/extensions/`.

---

## Path 4 — Persistent install of a local path

### When

You want pij as a "pi package" registered in settings so it survives across shell sessions and shows up in `pi list`. No symlink chore. Pi treats the pij directory as a package and reads its manifest.

### Setup pij as a pi package

```json
// pij/package.json
{
  "name": "pij",
  "private": true,
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./.pi/extensions"],
    "skills":     ["./.pi/skills"],
    "prompts":    ["./.pi/prompts"],
    "themes":     ["./.pi/themes"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

### Install

```bash
# Global — any pi session, any cwd
pi install /Users/jordanknight/pi-hacking/pij

# Project-local — only when this repo is the cwd. -l = "local"
pi install -l /Users/jordanknight/pi-hacking/pij
```

### What this writes

```jsonc
// ~/.pi/agent/settings.json
{
  "packages": [
    "/Users/jordanknight/pi-hacking/pij"   // ← absolute path, no copy
  ]
}
```

Pi loads from that path on every startup. Edit files in pij = `/reload` picks them up. Identity is the resolved absolute path, so you can have one global entry and one project-local entry without conflict (project wins for the same identity).

### Inspect

```bash
pi list                # all installed packages
pi config              # interactive enable/disable individual resources
pi remove /Users/jordanknight/pi-hacking/pij
```

---

## Path 5 — Persistent install from git

### When

Sharing pij with collaborators or yourself across machines without npm.

### One-time setup

1. Push pij to GitHub (`git@github.com:jakkaj/pij.git` say).
2. Make sure `package.json` with the `pi:` manifest is committed.
3. Tag a release for pinning: `git tag v0.1.0 && git push --tags`.

### Install

```bash
pi install git:github.com/jakkaj/pij              # tracks default branch
pi install git:github.com/jakkaj/pij@v0.1.0       # pinned to ref
pi install ssh://git@github.com/jakkaj/pij        # SSH, uses your keys
pi install https://github.com/jakkaj/pij          # raw URL works too
```

### What this does

- Clones to `~/.pi/agent/git/github.com/jakkaj/pij/` (global) or `.pi/git/...` (project, with `-l`).
- If `package.json` exists, runs `npm install` after clone.
- On `pi update` (without ref) reruns `git pull`. Pinned refs are skipped.

### Caveat — peer deps in production installs

> Per pi-mono `extensions.md` § Available Imports: "Package installation uses production installs (`npm install --omit=dev`) by default." Anything you `import` at runtime must be in `dependencies` (not `devDependencies`). The pi-bundled packages — `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `typebox` — go in `peerDependencies` with `"*"`.

---

## Path 6 — npm publish

### When

Public distribution. Show up in the [pi.dev/packages gallery](https://pi.dev/packages).

### One-time setup

1. Pick an npm scope (e.g. `@jakkaj/pij-extensions`).
2. `package.json` updates:
   ```json
   {
     "name": "@jakkaj/pij-extensions",
     "version": "0.1.0",
     "keywords": ["pi-package", "pi", "pi-extension"],
     "pi": {
       "extensions": ["./.pi/extensions"],
       "skills":     ["./.pi/skills"],
       "prompts":    ["./.pi/prompts"],
       "themes":     ["./.pi/themes"],
       "video":      "https://…optional.mp4",
       "image":      "https://…optional.png"
     }
   }
   ```
3. `npm publish --access public`.

### Install (anywhere)

```bash
pi install npm:@jakkaj/pij-extensions
pi install npm:@jakkaj/pij-extensions@0.1.0   # pinned
```

### Versioning gotcha

A versioned spec (`@0.1.0`) is treated as **pinned** and skipped by `pi update`. Unversioned specs auto-update.

---

## Loading order, conflicts, scope rules

```
                    earlier loaders win for same-name
                    ┌────────────────────────────────────┐
                    │                                    │
                    ▼                                    │
   global ~/.pi → project .pi/ → settings.json packages[] / extensions[]
              project entry wins
              for same package identity
              (npm name | git URL | absolute path)
```

- **Same extension name twice** → first registration wins (commands disambiguate as `name:1`, `name:2`).
- **Project setting + global setting for same package** → project wins.
- **`-e` runs alongside everything else** for the current run; doesn't write settings.

Use `pi config` to enable/disable individual resources from any installed package without uninstalling the package.

---

## Recommendation: a clean dev setup for pij

```
┌─────────────────────────────────────────────────────────────────────────┐
│ pij/                                                                    │
│ ├── package.json                ← name "pij", peerDeps + "pi" manifest  │
│ ├── tsconfig.json               ← noEmit; type-check only               │
│ ├── .pi/                                                                │
│ │   ├── extensions/                                                     │
│ │   │   ├── hello.ts            ← single-file extension                 │
│ │   │   └── pij-mcp/                                                    │
│ │   │       ├── index.ts                                                │
│ │   │       └── server-pool.ts                                          │
│ │   ├── skills/                                                         │
│ │   │   └── code-review/SKILL.md                                        │
│ │   ├── prompts/                                                        │
│ │   │   └── pr-summary.md                                               │
│ │   └── themes/                                                         │
│ │       └── pij-dark.json                                               │
│ ├── docs/plans/…                ← already there from /plan-1a           │
│ └── README.md                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**For day-to-day dev** → use Path 1 (cd pij; pi). No install, no symlink, no git push.
**For "I want it everywhere"** → also do Path 4 (`pi install /Users/.../pij`). One-time.
**For sharing** → Path 5 (`git: github.com/jakkaj/pij`) once we have something worth sharing.
**Defer Path 6** (npm publish) until we have a stable, named package others actually want.

---

## Worked Example — end-to-end

```
$ cd /Users/jordanknight/pi-hacking/pij

# 1. Create the extension directory & file
$ mkdir -p .pi/extensions
$ cat > .pi/extensions/hello.ts <<'TS'
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "Greet from pij",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"} — from pij`, "info");
    },
  });
}
TS

# 2. Add a minimal package.json (only needed if extension imports npm packages
#    OR you want pij installable as a pi package via Paths 4/5/6).
#    Skip this if hello.ts has no npm deps.
$ cat > package.json <<'JSON'
{
  "name": "pij",
  "private": true,
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./.pi/extensions"],
    "skills":     ["./.pi/skills"],
    "prompts":    ["./.pi/prompts"],
    "themes":     ["./.pi/themes"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
JSON

# 3. Run pi from pij root — auto-loads .pi/extensions/hello.ts
$ pi
… [pi banner] …

# 4. Verify
> /hello jordan
[notification: Hello jordan — from pij]

> /reload         # iterate without restart (see workshop 002)

# 5. (Optional) install pij globally so /hello works from other directories
$ exit
$ pi install /Users/jordanknight/pi-hacking/pij
✓ Added /Users/jordanknight/pi-hacking/pij to ~/.pi/agent/settings.json

$ cd /tmp && pi
> /hello                        # works here too
```

---

## Open Questions

### Q1: Do we want a project `package.json` at the pij root, or one per multi-file extension?

**OPEN**: Both work. Recommend a root `package.json` so `pij` is installable end-to-end as a pi package — simpler distribution. Per-extension `package.json` is only needed if individual extensions have wildly different dep trees you want to keep isolated.

**Decide**: when we ship our second extension that has its own deps. Until then, root `package.json` is fine.

### Q2: Do we publish the whole pij as one pi package or split into per-extension packages?

**OPEN**: Three options:
- A) **Monolith** — `@jakkaj/pij` with everything. Simpler. Users get all-or-nothing (filtering via settings handles "all-or-some").
- B) **Per-extension** — `@jakkaj/pij-mcp`, `@jakkaj/pij-supervisor`, … More overhead. Users pick precisely what they want.
- C) **Hybrid** — single git repo, but each top-level dir is independently publishable.

**Defer until we have ≥3 extensions** to choose from.

### Q3: What about TypeScript type checking?

**RESOLVED**: jiti loads `.ts` at runtime — no compile required for `pi` to work. But we want type errors caught *before* hitting `/reload`. Add a project `tsconfig.json` with `noEmit: true` and run `tsc --noEmit` in CI / a pre-commit hook. (See workshop 002 for the dev-loop integration.)

### Q4: Does `pi install /local/path` copy files or reference them?

**RESOLVED**: References — settings stores the absolute path, pi loads from there each startup. Edit pij files = pi sees the edits next reload. (Confirmed in pi-mono `packages.md`: "Local paths point to files or directories on disk and are added to settings without copying.")

### Q5: Can settings be project-scoped *and* track a separate package list per project?

**RESOLVED**: Yes — `.pi/settings.json` (project) and `~/.pi/agent/settings.json` (global). Same package can appear in both; project wins for the same identity. `pi install -l` writes project settings, `pi install` writes global.

### Q6: Will we hit the AGENTS.md "no inline imports" rule?

**RESOLVED**: No, for normal extension code. The rule forbids `await import()` at type position and dynamic imports for types. Top-level `import type { ExtensionAPI } from "..."` is correct. Async factories doing `await fetch(...)` are explicitly endorsed (see `extensions.md` § "Async factory functions").

---

## Quick Reference

```bash
# DEV LOOP (cwd = pij)
pi                                  # auto-loads ./.pi/extensions/

# TEMP TRY-OUT (anywhere)
pi -e ./.pi/extensions/hello.ts

# PERSISTENT GLOBAL INSTALL
pi install /Users/jordanknight/pi-hacking/pij

# PERSISTENT PROJECT INSTALL (writes to ./.pi/settings.json)
pi install -l /Users/jordanknight/pi-hacking/pij

# REMOTE SHARING
pi install git:github.com/jakkaj/pij
pi install git:github.com/jakkaj/pij@v0.1.0           # pinned
pi install npm:@jakkaj/pij-extensions                 # after npm publish

# INSPECT / MANAGE
pi list
pi config                           # enable/disable individual resources
pi remove /Users/jordanknight/pi-hacking/pij
pi update                           # all non-pinned packages + pi itself
pi update --extensions              # non-pinned packages only
```

---

## See Also

- Workshop 002 — Dev loop and hot reload (next, focuses on the edit→reload→test cycle)
- `findings/03-skills-prompts-themes-packages.md` SP-13..SP-18 for the package-manager internals (`pi-mono/packages/coding-agent/src/core/package-manager.ts` is 2,429 lines — most of it is install/update/dedupe orchestration)
