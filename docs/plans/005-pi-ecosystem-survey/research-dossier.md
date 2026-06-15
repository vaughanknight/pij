# Pi Ecosystem Survey — what already exists, how to install, config-driven layout

**Generated**: 2026-05-14
**Research Query**: "for each gap-feature I listed last turn, does an extension already exist? Then explain how I install third-party stuff and my own stuff, and propose a config-driven approach."
**Mode**: Pre-plan
**Sources**: pi-mono HEAD (pulled 2026-05-11), perplexity research (cited inline; many URLs unverified)

> **Verification note**: Most third-party URLs come from a perplexity research pass. I've spot-checked the architectural claims against pi-mono source but I have **not** opened every external repo. Treat URLs as "candidates to verify" not "verified working." The pi-mono behaviours (install / settings.packages / autoload) are confirmed from source.

---

## Executive summary

Two things upended my prior-turn punch list:

1. **The ecosystem is much further along than I'd assumed.** Of 16 gap-areas I named, ~10 already have a third-party extension on `pi.dev/packages` or GitHub. Several (AGENTS.md auto-load, resume/checkpoint, image input) turn out to be **built into pi core**, not gaps.
2. **Pi already has a config-driven multi-source install mechanism.** `settings.packages[]` (in `~/.pi/settings.json` or project-level `.pi/settings.json`) accepts an array of npm specs, git URLs, HTTPS URLs, or local paths. Pi auto-installs anything missing on boot. pij just isn't using it yet.

The only genuinely-unfilled gaps from my list are **voice input**, **headless / non-interactive mode**, and **background async tasks** (architecturally feasible but no reference extension).

---

## How pi's install and autoload actually work

Confirmed from pi-mono source.

### `pi install <source>`

Source format detection in `parseSource` (`packages/coding-agent/src/core/package-manager.ts:1370`):

| Source form | Examples | Where it lands |
|---|---|---|
| `npm:<name>[@version]` | `npm:@firstpick/pi-extension-git-footer-status`, `npm:pi-yaml-hooks@1.2.0` | `~/.pi/git/npm/<name>` (global) or `./.pi/git/npm/<name>` (project) |
| Git URL | `https://github.com/nicobailon/pi-mcp-adapter.git`, `git@github.com:...` | `~/.pi/git/<host>/<owner>/<repo>` |
| Local path | `./.pi/extensions/scratch`, `/abs/path` | Registered in place (no copy) |
| Plain HTTPS to a repo | `https://github.com/owner/repo` | Treated as git URL |

For git/npm sources it `git clone` + `npm install` (if `package.json` exists), then reads the cloned repo's `package.json#pi` manifest to register its extensions/skills/prompts/themes. (`package-manager.ts:944-965`, manifest read at `loader.ts:470-526`.)

### Autoload on boot

Loader scans, in order (`loader.ts:575-621`):

1. `./.pi/extensions/` (project-local)
2. `~/.pi/extensions/` (global user scope)
3. Paths configured in `package.json#pi.extensions` (cwd)
4. Paths configured in `settings.extensions[]` (global + project)
5. All registered `packages[]` (their `package.json#pi.extensions` is read recursively)

Discovery rules per directory: a direct `.ts`/`.js` file, OR a subdir with `index.ts`/`index.js`, OR a subdir with `package.json#pi` manifest. **Only one level deep — no recursive descent.**

### The config-driven mechanism we missed

`Settings.packages?: PackageSource[]` (`settings-manager.ts:95`). `PackageSource` is either a string source or `{source, extensions?, skills?, prompts?, themes?}` for filtered loading (`settings-manager.ts:66-74`).

When pi boots, missing packages in `settings.packages[]` are auto-installed. This is the manifest the user is asking for — **it already exists.** pij just isn't using it.

Caveats:
- **No hooks API in core** — extensions get event subscriptions (`on("tool_call", ...)`) but no pre/post-tool gates that can block the model. `pi-yaml-hooks` (if it works as described) layers this on top via tool_call interception.
- **No permission/sandbox in core** — `carderne/pi-sandbox` provides OS-level confinement.
- **No `pi sync` / `pi install --all` command** — but boot does the equivalent for `settings.packages[]` entries that are missing.

---

## Gap-by-gap status

Prior-turn tier list, re-annotated. **Bold = already exists.** Sources marked ⚠ are perplexity-claimed and unverified.

### Tier 1 — was: "the big absences"

| # | Gap | Status | Existing solution | Notes |
|---|---|---|---|---|
| 1 | MCP server support | ⚠ **Exists** | `nicobailon/pi-mcp-adapter` | Token-efficient MCP bridge; advertises lazy capability loading |
| 2 | Persistent memory | ⚠ **Two exist** | `jayzeng/pi-memory`, `tickernelz/pi-memory` | Different approaches (daily logs + qmd semantic search vs. flat MEMORY.md). pij's `scratch` is in this space |
| 3 | AGENTS.md auto-load | ✅ **Built into pi core** | n/a | Loads from `~/.pi/agent/` + project `.pi/`. Not a gap |
| 4 | Permission / sandbox | ⚠ **Exists (partial)** | `carderne/pi-sandbox` (OS-level), `pi-yaml-hooks` (declarative tool gates) | No core permission API yet |
| 5 | Subagents / parallel | ⚠ **Two exist** | `@ineersa/my-pi-subagents`, `nicobailon/pi-subagents` | Both register a Task-like tool; competing models |

### Tier 2 — "essential usability"

| # | Gap | Status | Existing solution | Notes |
|---|---|---|---|---|
| 6 | Token / cost telemetry | ⚠ **Two exist** | `@firstpick/pi-extension-git-footer-status` (footer UI), `mprokopov/pi-otel-telemetry` (OTel export) | Footer one renders live $/tok/sec; OTel one exports spans |
| 7 | Resume / checkpoint | ✅ **Built into pi core** | n/a | Session persistence + fork API (`waitForIdle`, `fork` in extension context). Not a gap |
| 8 | Web search / fetch | ⚠ **Three exist** | `nicobailon/pi-web-access`, `georgebashi/pi-web-fetch`, `thinkscape/pi-smart-fetch` | First has Exa→Perplexity→Gemini fallback chain. Crowded space |
| 9 | Hooks (pre/post-tool, etc) | ⚠ **Exists** | `pi-yaml-hooks` | YAML-declared; covers `tool.before.*`, `tool.after.*`, `file.changed`, `session.created`, `session.idle`. Core doesn't ship hooks API |
| 10 | Slash-command discovery | ⚠ **Partial** | `pi.dev/packages` catalog, `qualisero/awesome-pi-agent` list | Catalog is npm-driven, awesome list is curated. No in-pi `/install` browser |

### Tier 3 — "appreciated"

| # | Gap | Status | Existing solution | Notes |
|---|---|---|---|---|
| 11 | Diff review / hunk approval | ⚠ **Two exist** | `earendil-works/pi-review` (official), `badlogic/pi-diff-review` | First is official, second adds a `/diff-review` slash with scope toggles |
| 12 | Image input | ✅ **Built into pi core (partial)** | n/a | Attachment handling exposed via ExtensionAPI; not fully documented |
| 13 | Voice input | ❌ **NOT FOUND** | — | No terminal-side voice extension; "Say, Pi" is a different product (browser ext for ChatGPT) |
| 14 | ACP / IDE bridge | ⚠ **Exists** | `svkozak/pi-acp` | Spawns `pi --mode rpc`, bridges JSON-RPC over stdio to Zed/ACP clients |
| 15 | Background tasks | ❌ **NOT FOUND** | — | `earendil-works/pi#3062` requests async-tasks example. Architecturally feasible, no reference |
| 16 | Headless / non-interactive | ❌ **NOT FOUND** | — | TUI-centric architecture; `--mode rpc` exists for ACP but not a general headless mode |

### Genuine unfilled gaps (the short list)

After this survey, only three of my original 16 are actually unfilled:
- **Voice input** (terminal-side speech-to-text)
- **Background async tasks** (issue #3062 is open)
- **Headless mode** (CI/CD use case)

Everything else has at least one community attempt, or is in core.

---

## Discovery infrastructure

| Where | What | How to use |
|---|---|---|
| `https://pi.dev/packages` | Official catalog. Auto-populated from npm packages with pi metadata; shows monthly downloads | Browse, then `pi install npm:<pkg>` |
| `github.com/qualisero/awesome-pi-agent` ⚠ | Curated awesome list | Read, then `pi install <git-url>` |
| GitHub topic `pi-extension` ⚠ | Canonical tag (no `pi-plugin`/`pi-addon`) | `https://github.com/topics/pi-extension` |
| `earendil-works/pi` discussions ⚠ | Official feature/ecosystem chatter | — |

---

## How to install — three paths

### Path A: install someone else's pi extension

```bash
# from npm
pi install npm:@firstpick/pi-extension-git-footer-status

# from git
pi install https://github.com/nicobailon/pi-mcp-adapter.git

# pin a version
pi install npm:pi-yaml-hooks@1.2.0

# from a local checkout (no copy; registered in place)
pi install ./forks/pi-memory
```

Lands in `~/.pi/git/...` (global) by default. Manage with `pi update [source]`, `pi remove [source]`, or `pi list`.

### Path B: install your own (development workflow)

What pij already does, by stage of polish:

| Stage | Command | When |
|---|---|---|
| 1. Local cwd autoload | nothing — `.pi/extensions/scratch/` auto-discovers from cwd | Working inside the pij repo |
| 2. User-scope symlink | `npm run link` (already built — `harness/scripts/link-global.ts`) | Want it global on this machine without publishing |
| 3. Git install | `pi install https://github.com/AI-Substrate/pij.git` | Sharing with someone who hasn't cloned pij |
| 4. npm publish (future) | `npm publish` + `pi install npm:@you/pi-scratch` | Public release |

Stage 1 covers dev. Stage 2 covers "I want it everywhere on my laptop." Stage 3 is the share-link. Stage 4 is when you commit to a name.

### Path C: config-driven (the one the user is asking about)

This is what `settings.packages[]` does. Two scopes:

**Global** (`~/.pi/settings.json`) — applies to every pi session on this machine:

```json
{
  "packages": [
    "npm:@firstpick/pi-extension-git-footer-status",
    "https://github.com/nicobailon/pi-mcp-adapter.git",
    "https://github.com/svkozak/pi-acp.git"
  ]
}
```

**Project** (`.pi/settings.json` in repo root) — applies when pi runs from this repo:

```json
{
  "packages": [
    {
      "source": "https://github.com/jayzeng/pi-memory.git",
      "extensions": ["pi-memory"]
    },
    "./.pi/extensions/scratch"
  ]
}
```

On boot, pi auto-installs anything missing. The object form lets you load only specific extensions/skills/prompts/themes from a multi-purpose package — useful when a repo ships several things but you only want one. `pi update` refreshes them all.

This is the "modules manifest" the user described. **It already exists in pi-mono.** pij just isn't using it.

---

## Proposed pij config-driven layout

The cleanest pij-shaped layout is:

```
pij/
├── .pi/
│   ├── extensions/
│   │   └── scratch/                 # our own extensions live here (cwd autoload)
│   └── settings.json                # NEW: list of third-party extensions
├── package.json                      # already has pi.extensions: ["./.pi/extensions"]
└── harness/scripts/
    ├── link-global.ts                # existing — symlinks our stuff to ~/.pi/extensions
    └── sync-third-party.ts           # NEW: optional, run `pi install` for each entry in .pi/settings.json
```

`.pi/settings.json` becomes the curated list of *other people's* extensions we want when working in pij. Our own stuff stays in `.pi/extensions/<name>/`.

A bootstrap helper (`npm run bootstrap`) would:
1. Read `.pi/settings.json#packages[]`
2. Call `pi install <source>` for each missing one (or just let pi do it on next boot — which it will anyway)
3. Optionally `npm run link` our own stuff into the user scope

There's an argument for **doing nothing on the pij side** — once `.pi/settings.json` is committed, pi handles install on first boot in the repo. A `bootstrap` script just makes the install eager instead of lazy. I'd recommend lazy (no script) unless an extension is required for `npm run smoke`/`npm run new` to work, in which case eager.

### One subtlety

`settings.packages[]` is read by pi when running pi. The pij `npm run *` scripts (smoke, new, link) don't invoke pi — they're tsx scripts. So if a pij script depended on a third-party extension being installed, `npm install` wouldn't trigger it. Either:

- Keep third-party extensions strictly for *runtime* (use them inside pi), not for *tooling* (the harness scripts). This is the natural shape.
- Or have `harness/scripts/bootstrap.ts` shell out to `pi install` for each entry. Less elegant but explicit.

The first is correct: pij's harness is for *authoring* extensions, not for orchestrating which third-party ones load. Keep them separate.

---

## Critical discoveries

### 🚨 CD-01: `settings.packages[]` is the answer to the user's question

**Impact**: Critical
**Source**: `pi-mono/packages/coding-agent/src/core/settings-manager.ts:62-74,95`
**What**: Pi already supports a typed array of multi-source extension specs, with per-resource filtering. On boot, missing packages auto-install.
**Why it matters**: There is nothing to build for the config-driven model. We just need to document it for pij and commit a starter `.pi/settings.json` if we want curated recommendations to travel with the repo.

### 🚨 CD-02: Three "gaps" from prior turn are not gaps

**Impact**: High
**Source**: pi-mono README + perplexity research [11][15]
**What**: AGENTS.md auto-load, resume/checkpoint, and image input are core features, not extension opportunities.
**Why it matters**: A planned "build pi-agents-md / pi-memory-resume" extension would be duplicating core capability. Steer clear.

### 🚨 CD-03: The remaining real gaps are voice, headless, and background tasks

**Impact**: Medium
**Source**: perplexity [39] + absence in pi.dev/packages
**What**: Of 16 originally-listed features, only these three have no community implementation.
**Why it matters**: Highest-novelty extension targets. Headless mode (#3062) has the clearest demand signal.

### 🚨 CD-04: Hooks and permissions are extension-layer, not core

**Impact**: Medium
**Source**: pi-mono Extension API surface (no pre-tool-call hooks); `pi-yaml-hooks` exists as community extension
**What**: pi's `on("tool_call", ...)` is observer-only; no documented way for an extension to *block* a tool call. `pi-yaml-hooks` and `carderne/pi-sandbox` work around this from above.
**Why it matters**: If we want first-class hooks/sandboxing, that's a core-pi PR, not a pij extension. The right pij move is to *use* `pi-yaml-hooks` if it does what we need, and only build our own if it doesn't.

---

## Recommendations

### If pij wants to use the ecosystem

1. Add a `.pi/settings.json` in the repo with a `packages[]` array of third-party extensions worth having when developing pi extensions (telemetry footer, MCP adapter, diff-review).
2. Document it in README's "Path 2" alongside `npm run link`.
3. Don't build a wrapper; pi already auto-installs on boot.

### If pij wants to build new extensions (next workshop topics)

In order of leverage:

1. **Headless / `--mode rpc` extension** — adapt pi-acp's RPC mode for non-ACP CI use cases. Real demand, no incumbent.
2. **Better-than-pi-memory** — two competing implementations exist but the space isn't settled. scratch is already in this lane; could grow into the kept extension.
3. **Background tasks reference impl** — close issue #3062 with a real example. High visibility, low scope.

Voice input is high-novelty but terminal audio capture is a rabbit hole; deprioritise.

### What NOT to build

- pi-agents-md (it's built in)
- pi-resume / pi-checkpoint (it's built in)
- Yet another pi-memory unless we have a sharply different angle than the two existing
- Yet another pi-web-fetch (crowded)

---

## External research opportunities

Most of what I called "external" last turn turned out to be answerable by 30 minutes with pi-mono + perplexity. Remaining open:

1. **Do the perplexity-cited extensions actually work?** I'd verify the top ~5 by `pi install`ing them in a throwaway dir and checking they load + do what they claim. (pi-mcp-adapter, pi-yaml-hooks, pi-subagents, pi-otel-telemetry, pi-acp.) Worth ~1 hour.
2. **What's the relationship between pi.dev/packages and npm?** Is the catalog scraping npm with a topic filter, or is there a separate registration step? Affects whether publishing pij extensions to npm auto-appears in the catalog.
3. **`pi-yaml-hooks` trust model details** — perplexity says it has separate global vs project trust gates with env-var controls. Worth reading the actual code before committing pij to it.

---

## Appendix: the third-party extensions, ranked by likely interest

| Extension | Source ⚠ | Why interesting for pij authors |
|---|---|---|
| `@firstpick/pi-extension-git-footer-status` | npm | live $/token feedback while developing extensions |
| `pi-yaml-hooks` | npm | guardrails on agent destructive actions while testing |
| `nicobailon/pi-mcp-adapter` | git | MCP brings entire other ecosystem in |
| `svkozak/pi-acp` | git | drives pi from Zed; useful for non-terminal workflows |
| `mprokopov/pi-otel-telemetry` | git | structured spans for harness validation |
| `carderne/pi-sandbox` | git | sandbox the agent while iterating on a new extension |
| `earendil-works/pi-review` | git | official code-review slash workflow |
| `@ineersa/my-pi-subagents` | npm | parallel orchestration for batch validation runs |

All ⚠ — verify before trusting.

---

**Research complete.** Next user-driven move is either (a) commit a starter `.pi/settings.json` to pij, (b) workshop the headless-mode extension, or (c) verify the top 5 third-party extensions and write up which actually work.

---

## Category dossiers (going forward)

This dossier is the general ecosystem survey + install model. Each
category that warrants depth gets its own folder:

| Category | Dossier |
|---|---|
| Dynamic context management | `docs/plans/006-pi-context-management/research-dossier.md` |

