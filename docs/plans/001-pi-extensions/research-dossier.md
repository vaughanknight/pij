# Research Report: How to Extend Pi (the Hackable TUI Coding Agent)

**Generated**: 2026-05-09
**Research Query**: "How do you extend pi? Map every extension surface in the pi-mono repo, survey real third-party extensions, and compare pi's extensibility to peer harnesses (Claude Code, Copilot CLI, Codex, Aider, OpenCode). Find innovative patterns for context management, MCP integration, sub-agents, and TUI."
**Mode**: Pre-Plan (research-only)
**Location**: `docs/plans/001-pi-extensions/`
**FlowSpace**: ✅ available — codebase queries used `graph_name="pi-mono"`
**Findings**: 182 across 8 deep-dives

---

## Executive Summary

### What pi is, in one paragraph

Pi (`@earendil-works/pi-coding-agent`, formerly `@mariozechner/pi-coding-agent` — Earendil Works acquired the project in April 2026 and the npm scope rename is in flight) is a minimal, terminal-first coding agent harness that runs in four modes — interactive TUI, print/JSON, RPC (for editor integration), and SDK (for embedding). It deliberately ships a tiny built-in feature set (4 default tools — read/write/edit/bash; no plan mode, no sub-agents) and pushes everything else out to **extensions, skills, prompt templates, themes, and "pi packages"**. The runtime exposes one ExtensionAPI object to TypeScript modules, with **18 distinct capability families** including 20+ lifecycle event hooks, custom tool registration, full LLM-provider registration (with OAuth), custom TUI components, programmatic session control (new/fork/navigate/switch), and an inter-extension event bus.

### Key Insights

1. **The extension surface is broader than the docs let on.** ExtensionAPI exposes 18 capability families — not just commands and tools but full provider registration, system-prompt/context inspection, custom message rendering, persistent session entries, programmatic compaction, and an event bus. The most powerful primitive is `registerProvider`, which lets a single extension wire in an entirely new LLM backend with custom OAuth and streaming.
2. **Pi has no native MCP support and no native sub-agents — by design.** Both are intentional gaps the community has already filled with extensions (`pi-mcp-adapter`, `pi-subagents`, `PiSwarm`). This is the single biggest delta vs Claude Code / Copilot CLI / Codex, and the most fertile area for new extension work.
3. **Context management has six phases with hooks at each.** Input → resource discovery → system-prompt assembly → pre-LLM injection → model interaction → session lifecycle. The two highest-leverage hooks are `before_agent_start` (rewrite system prompt + inject messages per turn) and `context` (final authority over the message list, after compaction).
4. **The ecosystem is young but moving very fast.** The official catalog reports **2,301 packages**; the `pi-extension` GitHub topic alone has 218 repos updated within the last fortnight. Categories that are mature: MCP bridging, sub-agent orchestration, sandboxing, UI re-skinning, chat bridges, and theming. Categories that are notably absent: Linear/Jira integrations, IDE plugins (JetBrains/Neovim), public eval harnesses, and a converged compaction strategy.
5. **The peer harnesses give us a roadmap.** Claude Code's hooks (PreToolUse, UserPromptSubmit, PreCompact) are *blocking* in a way pi's events are not; Cursor's glob-scoped rules, Aider's repo-map, and Codex's tiered memory are concrete patterns we can implement as pi extensions today. The 7 highest-leverage ports are listed in §"Top Opportunities" below.

### Quick Stats

- **Extension surfaces**: 5 (TS extensions, skills, prompt templates, themes, pi packages) + 2 embed paths (SDK, RPC)
- **ExtensionAPI capability families**: 18
- **Lifecycle events**: 20+ (from `resources_discover` through `session_compact`)
- **Built-in tools**: 4 (read, write, edit, bash) + several internal helpers
- **In-tree example extensions**: 7 (3 in `.pi/extensions`, 4 in `examples/extensions/`)
- **Third-party extensions surveyed**: ~80 unique projects across 37 finding clusters
- **Peer harnesses compared**: 11 (Claude Code, Copilot CLI, Codex, Aider, OpenCode, Cursor, Cline, Continue, Goose, Sourcegraph Cody, OpenInterpreter)

---

## How Pi Extensions Actually Work

### The five extension surfaces

| Surface | What it is | Authoring | Distribution |
|---|---|---|---|
| **Extensions** (TS) | TypeScript modules with default-exported factory `(pi: ExtensionAPI) => …` calling `registerCommand` / `registerTool` / `pi.on(…)` etc. Loaded at startup; `/reload` to refresh. | TS file. Optional `package.json` for deps. | Local file (`-e ./foo.ts`), `.pi/extensions/`, `~/.pi/agent/extensions/`, or bundled in a pi package |
| **Skills** | Markdown SKILL.md files with frontmatter `name + description`. Description goes into system prompt; full body lazy-loaded via the read tool or `/skill:name`. | Markdown + optional asset files. | `.pi/skills/`, `~/.pi/skills/`, or bundled in a pi package |
| **Prompt templates** | Single `.md` file with `$1`, `$@`, `${@:N:L}` substitution. Invoked via `/template-name args…`. | Markdown + optional frontmatter (description, argument-hint). | `.pi/prompts/`, `~/.pi/prompts/`, or bundled in a pi package |
| **Themes** | JSON files with 51 mandatory color tokens (UI / markdown / syntax / thinking-level). Hot-reload while editing the active theme. | JSON conforming to `theme-schema.json`. | `.pi/themes/`, `~/.pi/themes/`, or bundled in a pi package |
| **Pi packages** | npm/git/local bundles that combine any of the above. Manifest is a `pi:` key in `package.json` declaring resource paths and override operators (`+/-`). | npm or git repo with `package.json` + `pi:` manifest. | `pi install <npm-pkg>`, `pi install <git-url>`, or local path |

(Detailed per-surface findings: [`findings/03-skills-prompts-themes-packages.md`](findings/03-skills-prompts-themes-packages.md) — 18 findings.)

**When to author each**:

- **Reusable single prompt** → prompt template
- **Multi-file capability with instructions** → skill
- **Dynamic behaviour, new tools, new providers, UI changes, hooks** → TS extension
- **Color palette / branding** → theme
- **Bundled distribution of any of the above** → pi package

### The ExtensionAPI in one page

(Full detail: [`findings/01-extension-api.md`](findings/01-extension-api.md) — 18 findings.)

```ts
// Registration
pi.registerCommand(name, { description, getArgumentCompletions, handler })  // /slash commands
pi.registerTool(toolDef)                                                     // LLM-callable tools (TypeBox schema)
pi.registerShortcut(keychord, { description, handler })                       // keybindings
pi.registerFlag(name, { type, default })                                      // CLI flags
pi.registerMessageRenderer(customType, renderer)                              // custom TUI message rendering
pi.registerProvider(name, ProviderConfig)                                     // entire new LLM provider w/ OAuth
pi.unregisterProvider(name)

// Lifecycle hooks (20+ event types)
pi.on(event, handler)
// events include: resources_discover, session_start, session_before_switch,
// before_agent_start, agent_start, agent_end, turn_start, turn_end,
// before_provider_request, provider_response, tool_call, tool_result,
// context, input, custom_message, session_before_compact, session_compact,
// session_before_fork, session_shutdown, …

// Conversation injection
pi.sendMessage(customMessage, { triggerTurn, deliverAs: "steer"|"followUp"|"nextTurn" })
pi.sendUserMessage(content, { deliverAs })

// Persistent session state (does NOT enter LLM context)
pi.appendEntry(customType, data)
pi.setSessionName(name) / pi.getSessionName()
pi.setLabel(entryId, label)

// Tool & command introspection
pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names)
pi.getCommands()

// Model & context control
pi.setModel(model) / pi.getThinkingLevel() / pi.setThinkingLevel(level)
pi.getSystemPrompt() / pi.getContextUsage()
pi.compact({ customInstructions, onComplete, onError })

// Session control (commands only, not event handlers)
ctx.newSession({ withSession })
ctx.fork(entryId, { position, withSession })
ctx.navigateTree(targetId, { summarize, customInstructions, label, withSession })
ctx.switchSession(path, { withSession })

// Misc
pi.exec(command, args, options): Promise<{code, stdout, stderr}>
pi.events: EventBus  // emit/on/offAll on arbitrary channels (inter-extension pub/sub)

// UI (interactive mode only — gate on ctx.hasUI)
ctx.ui.select / confirm / input / notify / setStatus / setWidget / setFooter / setHeader
ctx.ui.custom<T>(factory)         // bespoke TUI component
ctx.ui.editor(title, prefill)     // open the editor as a dialog
ctx.ui.pasteToEditor / setEditorText / getEditorText
ctx.ui.addAutocompleteProvider(factory)
ctx.ui.theme / setTheme / getAllThemes
```

### Six-phase context lifecycle (where you can hook)

(Full detail: [`findings/05-context-management.md`](findings/05-context-management.md) — 16 findings.)

```
1. INPUT
   └── input event ────────────────────► transform user text/images, or short-circuit
2. RESOURCE DISCOVERY (load/reload)
   └── resources_discover event ──────► register skill/prompt/theme paths dynamically
3. SYSTEM PROMPT ASSEMBLY (per turn)
   ├── buildSystemPrompt: base → sections → AGENTS.md/CLAUDE.md (ancestor walk)
   │                                   → skills index → date/cwd
   └── ResourceLoader can be overridden
4. PRE-LLM INJECTION (per turn)
   ├── before_agent_start ────────────► read+rewrite systemPrompt, inject messages
   ├── pending custom-message queue ──► nextTurn deliveries land here
   └── context event ─────────────────► FINAL authority over the message list
5. MODEL INTERACTION
   ├── before_provider_request ───────► rewrite raw API payload (Anthropic/OpenAI/…)
   ├── provider_response ─────────────► observe/transform model output
   ├── tool_call ─────────────────────► mutate args, redirect, or block
   └── tool_result ───────────────────► rewrite results before they hit history
6. SESSION LIFECYCLE
   ├── session_before_compact ────────► cancel or replace compaction with custom logic
   ├── session_compact ───────────────► observe outcome
   ├── session_before_fork / switch ──► policy gates
   └── session_shutdown ──────────────► cleanup (kill spawned processes, close MCP, …)
```

**Highest-leverage hooks**: `before_agent_start` (per-turn injection of "now" context — git branch, failing tests, live metrics — alongside system prompt edits) and `context` (final filter / windower / synthetic-message injector after compaction).

### Tool architecture — pi has no native MCP, but bridging is straightforward

(Full detail: [`findings/04-tools-and-mcp.md`](findings/04-tools-and-mcp.md) — 16 findings.)

- A `ToolDefinition` is a TypeScript object: `name`, `label`, `description`, TypeBox `parameters`, async `execute(id, params, signal, onUpdate, ctx)`. Streaming via `onUpdate`. Cancel via `signal`.
- Tools are session-scoped active/inactive — there is **no per-call approval prompt**. Permissioning is "is the tool active this session", which extensions can manipulate via `setActiveTools`.
- **No native MCP support.** The pattern: write an extension that on `session_start` spawns the MCP servers (stdio transport via `pi.exec`/Node `child_process`), enumerates each server's tools, wraps each into a `ToolDefinition`, and `registerTool`s it. Clean up on `session_shutdown`. The community already has `pi-mcp-adapter` doing exactly this.
- **Custom providers** (the `registerProvider` API) are similarly powerful — see `examples/extensions/custom-provider-anthropic` and `custom-provider-gitlab-duo` for working OAuth-backed templates.

### In-tree examples (your starter templates)

(Full detail: [`findings/02-in-tree-extensions.md`](findings/02-in-tree-extensions.md) — 15 findings.)

| Example | Demonstrates |
|---|---|
| `.pi/extensions/redraws.ts` | Minimal `/command` + UI custom component |
| `.pi/extensions/tps.ts` | Status-bar widget + token-per-second metric |
| `.pi/extensions/prompt-url-widget.ts` | Input transform — fetch URL metadata, paste into editor |
| `examples/extensions/with-deps/` | **Best starter**: clean `package.json`, npm deps, full tool registration |
| `examples/extensions/custom-provider-anthropic/` | OAuth-backed provider registration |
| `examples/extensions/custom-provider-gitlab-duo/` | Same, against GitLab Duo |
| `examples/extensions/sandbox/` | Runs the agent in a sandbox; lifecycle of `session_start`/`session_shutdown` |
| `examples/rpc-extension-ui.ts` | Driving pi via RPC |

### Distribution & docs surface

(Full detail: [`findings/06-docs-and-distribution.md`](findings/06-docs-and-distribution.md) — 17 findings.)

The official docs in `pi-mono/packages/coding-agent/docs/` are the source of truth: `extensions.md`, `skills.md`, `prompt-templates.md`, `themes.md`, `packages.md`, `custom-provider.md`, `sdk.md`, `rpc.md`, `keybindings.md`, `settings.md`, `compaction.md`, `sessions.md`, `session-format.md`, `tui.md`. Two lagging spots in the docs:

1. **Compaction customization is under-documented.** Events exist (`session_before_compact`) but no canonical example for replacing the strategy.
2. **The `await import()` rule in AGENTS.md** ("no inline imports") feels in tension with async extension factories. The intended distinction: type-position dynamic imports are forbidden; runtime-only dynamic imports inside async factories are fine.

---

## The Wider Pi Ecosystem (third-party extensions)

(Full detail: [`external-research/third-party-pi-extensions.md`](external-research/third-party-pi-extensions.md) — 37 finding clusters covering ~80 projects.)

**Numbers**: official `pi.dev/packages` catalog → 2,301 packages. GitHub topic `pi-extension` → 218 repos. Most updated within the last two weeks.

**Mature categories**:

- **MCP bridging** — `pi-mcp-adapter` is the de-facto pattern. Several other variants exist.
- **Sub-agent orchestration** — `pi-subagents` (badlogic), `@tintinweb/pi-subagents`, **PiSwarm**. All work around the missing native sub-agent API by spawning pi as a subprocess and streaming JSON.
- **Safety / sandboxing** — multi-layered permission systems plus Earendil Works' own `gondolin` (microVM-backed sandbox) and `nono` (Lukehinds' permission system).
- **UI re-skinning** — `pi-tool-display` is the most-starred UI extension; demonstrates `registerMessageRenderer` + custom widgets.
- **Chat bridges** — Telegram, WhatsApp, Discord, Slack adapters.
- **Theming** — many published themes, a few "theme-pack" pi packages.
- **Personal config monorepos** — the new dotfiles. Authors bundle their preferred extensions + skills + prompts + theme into one git-installable pi package.
- **Diagram/markdown rendering** — Mermaid/Graphviz/PlantUML widgets via `registerMessageRenderer`.

**Notable individual extensions** (the 3 most-interesting per the survey):

1. **`pi-supervisor` (tintinweb)** — A second LLM observes each turn and decides Continue / Steer / Done, injecting "as the user" guidance when drift is detected. Pure use of `before_agent_start` + `sendUserMessage`. Sensitivity tunable. *Pattern*: model-as-conscience.
2. **`openclaw` (Armin Ronacher / Earendil)** — pi-as-SDK reference flagship. Multi-channel (WhatsApp/Telegram/Slack/Discord/iMessage/Teams + voice), Live Canvas, sandboxed group contexts. Drives the SDK API surface (`createAgentSession`, `ResourceLoader`).
3. **`pi-elixir` (dannote)** — 13 tools (`elixir_eval`, `elixir_sql`, `elixir_top`, `elixir_sup_tree` …) auto-detect a running Tidewave instance on localhost so the agent pokes at the *running* Elixir VM, not just files. The strongest example of language-runtime-deep integration; clear template for Ruby/Rails, .NET, Python/Django.

**Notably absent** (gap = opportunity):

- Linear / Jira / Asana / Notion deep integrations (a few thin wrappers, no flagship).
- IDE plugins beyond VS Code — no JetBrains, no Neovim.
- Public eval harnesses for pi extensions.
- A converged compaction strategy — multiple competing approaches, no winner.
- Anything in the "code knowledge graph" space — three competing extensions, none mature. *(This is interesting given fs2/FlowSpace is right here.)*

---

## How Pi Compares to Peer Harnesses

(Full detail: [`external-research/harness-comparison.md`](external-research/harness-comparison.md) — 45 findings across 11 harnesses.)

### Surface coverage matrix (high-level)

| Capability | Pi | Claude Code | Copilot CLI | Codex CLI | Aider | OpenCode | Goose |
|---|---|---|---|---|---|---|---|
| Slash commands | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom tools | ✅ | ✅ (MCP) | ✅ (MCP) | ✅ (MCP) | partial | ✅ | ✅ |
| Native MCP | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Hooks (blocking) | ❌ events only | ✅ | partial | ✅ | ❌ | ❌ | partial |
| Sub-agents (in-process) | ❌ | ✅ Task | ✅ /fleet | ✅ plugins | ❌ | partial | ✅ recipes |
| Skills | ✅ | ✅ | partial | ❌ | ❌ | ❌ | ❌ |
| Prompt templates | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Themes | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | partial |
| Custom providers | ✅ (powerful) | ❌ | ❌ | partial | ✅ | ✅ | ✅ |
| RPC / SDK | ✅ both | ✅ SDK | ❌ | partial | ❌ | ✅ | ✅ |
| Repo map / project graph | external (fs2) | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| AGENTS.md auto-load | partial | CLAUDE.md | partial | ✅ | ❌ | partial | ❌ |
| Output styles | ❌ | ✅ | ❌ | ❌ | ❌ | partial | ❌ |
| Status line | partial | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Tiered persistent memory | ❌ | partial | ❌ | ✅ | ❌ | ❌ | partial |
| Plugin marketplace | external | ✅ | ❌ | ❌ | ❌ | ❌ | partial |

### Single biggest gap

**Sub-agents with context isolation.** Every flagship harness — Claude Code (`Task`), Copilot CLI (`/fleet`), Codex (plugins), Goose (recipes) — treats parallel specialist agents with isolated context windows as a primitive. Pi has none. The community workaround (spawn pi as subprocess) is heavier and slower and shares no model context. This single missing primitive limits *every* downstream extension idea: parallel code review, planner/executor split, fan-out research, `/architect` mode.

---

## Top Opportunities for pij (and the wider community)

Distilled from the harness comparison + ecosystem gap analysis. Each is an extension-shaped opportunity — no pi-core changes required unless noted.

### 1. **`pij-task` — sub-agent runner with context isolation** *(highest leverage)*
Spawn child runners with isolated context windows. Expose a `task(agent_name, prompt)` tool. Reuse `pi.exec` for now (subprocess pi), but lobby for an in-process API. Once shipped, every other idea below gets easier.

### 2. **`pij-mcp` — MCP bridge done right**
Read `mcpServers` from settings (mirror Claude Code's `claude_desktop_config.json` format for portability). Spawn over stdio on `session_start`. Wrap each MCP tool as a pi `ToolDefinition`. Add a `/mcp` command for status. Clean shutdown.

### 3. **`pij-hooks` — Claude-Code-style blocking hooks**
Wrapper extension that turns pi's events into a hook spec with a return contract `{ block, reason, transform }`. Register `PreToolUse`, `UserPromptSubmit`, `PreCompact` analogues. Configure via `.pij/hooks.json`. Unlocks policy gates, secret scrubbing, automatic context injection in one stroke.

### 4. **`pij-repomap` — token-bounded repo map injected per turn**
Use the fs2/FlowSpace graph already wired into pij (`graph_name="pi-mono"` and friends). Pick top-N most-relevant nodes via PageRank-on-imports + recently-edited bias. Inject as a system-prompt section via `before_agent_start`. Beats embeddings on structural questions; aligns perfectly with the FlowSpace investment we already made.

### 5. **`pij-memory` — tiered persistent memory**
SQLite-backed entity-relationship store. Hot/warm/cold tiers. Crystallize on `PreCompact`. Hydrate relevant entities on `before_agent_start`. Solves cross-session continuity, which is currently DIY.

### 6. **`pij-skills-progressive` — replace eager skill loading**
Today pi includes all skill descriptions in the system prompt. Move to YAML-frontmatter `name+description` indexing with lazy body loading on first reference. Pair with `allowed-tools` per-skill scoping (Claude Code pattern) for friction-free auto-approval.

### 7. **`pij-output-styles` + `pij-statusline` + `pij-profiles` (UX trio)**
Output styles: switchable response personae (Concise / Tutor / Reviewer / etc.). Status line: rich bottom-bar with git, model, tokens, cwd. Profiles: named bundles of (model + tools + skills + style + theme). All three are cheap and high-impact.

### 8. **`pij-supervisor` — port the supervisor pattern**
Take `pi-supervisor`'s "second LLM watches the first" idea and harden it. Make sensitivity configurable per-project. Wire steer/done into `sendUserMessage` and the session lifecycle.

### 9. **`pij-elixir`-style language-runtime extensions for our stack**
The pattern is: detect a running runtime on localhost, expose `eval`, `inspect`, `top`, `tree` tools that poke at the live process. Templatable for Python/Django, Ruby/Rails, .NET, Node.

### 10. **Linear / Jira / Notion integrations**
Truly missing from the ecosystem. Slack/Discord adapters exist; project trackers don't. Extension authors a `/linear` command, registers a `linear_*` tool family, persists OAuth tokens via `appendEntry` (encrypted) or settings.

---

## Modification Considerations (for pij itself)

### ✅ Safe to start with
- A bare TS extension under `pij/.pi/extensions/hello.ts` calling `registerCommand` — fastest feedback loop. Use `with-deps/` as the template.
- A pi package skeleton (`package.json` with `pi:` manifest, empty extensions/skills/prompts/themes folders) — sets us up to publish whenever we have something worth shipping.

### ⚠️ Modify with caution
- Anything that mutates `event.input` or `event.messages` in place — schemas don't re-validate. Always emit a copy.
- `setModel` / `setThinkingLevel` mid-stream — silent clamp on capability mismatch.
- `withSession` callbacks after `fork`/`switchSession` — old `ctx` is invalidated; capturing it leaks to a dead session.

### 🚫 Danger zones
- `before_provider_request` rewriting raw API payloads — easy to break tool calling, caching, and provider quirks.
- Replacing compaction without preserving the `[summary]` entry contract — sessions become unrestorable.

### Extension points designed for modification
1. **`registerProvider`** — entire LLM backends, including OAuth.
2. **`before_agent_start` + `context` events** — system prompt and message-list authority.
3. **`registerMessageRenderer`** — bespoke TUI for any custom message type.
4. **`resources_discover` event** — dynamic skill/prompt/theme paths.
5. **`pi.events` bus** — inter-extension contracts (no schema; convention only).

---

## Domain Context

No domain registry exists in pij yet (`docs/domains/registry.md` absent). Natural domain boundaries surfaced by this research, ordered by likelihood of formalization:

| Proposed Domain | Evidence | Boundary | Files (when we have them) |
|---|---|---|---|
| `extensions/` | Anything calling `pi.register*` or `pi.on(…)` | Outbound: ExtensionAPI from `@earendil-works/pi-coding-agent`. Inbound: nothing yet. | `pij/.pi/extensions/*.ts` |
| `skills/` | SKILL.md authoring | Self-contained capability bundles | `pij/.pi/skills/<name>/SKILL.md` |
| `prompts/` | Reusable templates | Argument substitution surface | `pij/.pi/prompts/<name>.md` |
| `tools-bridge/` | MCP / language-runtime / IDE bridges | Wraps external systems as `ToolDefinition`s | (future) |
| `context/` | Repo-map / memory / supervisor extensions | Hooks `before_agent_start`, `context`, `PreCompact` | (future) |

**Recommendation**: defer domain formalization until we ship 2-3 extensions. Pre-domains is just structure-for-structure's-sake at this stage.

---

## Harness Status

No `docs/project-rules/harness.md` exists in pij. Pi itself is the agent harness for any project under it; for pij as an *extension* project, the relevant harness questions are:

- **Boot**: `pi` from project root (auto-loads `.pi/extensions/*.ts`).
- **Interact**: tmux + `pi-test.sh` (per pi-mono's `AGENTS.md` workflow).
- **Observe**: `tmux capture-pane`. Plus any extension-specific log it emits.

Recommendation: create `docs/project-rules/harness.md` once we ship the first extension — at that point it stops being theoretical.

---

## External Research Opportunities

The codebase research surfaced few unanswered "external" questions (unusual for a research-only run — explained by the fact that two of our subagents *were* external by design). The remaining gaps:

### Research Opportunity 1: Sub-agent orchestration patterns post-Anthropic Task tool

**Why needed**: pi's biggest gap. Before designing `pij-task`, we want a current snapshot of how Claude Code, Copilot, Codex, and Goose orchestrate sub-agents (context window sharing? tool inheritance? failure propagation? streaming UX?), and any post-2026 papers on multi-agent coding.

**Ready-to-use prompt**:
```
/deepresearch "Design space for in-process sub-agent orchestration in coding-agent harnesses,
2025-2026. Compare Claude Code Task, Copilot CLI /fleet, Codex sub-agent plugins, and Goose
recipes. Cover: context window sharing vs isolation, tool inheritance, parallel vs serial
execution, failure modes, streaming UX, observed productivity gains. Output: design
recommendations for a TypeScript extension that adds sub-agents to a host that doesn't
have them natively."
```

### Research Opportunity 2: Repo-map design with a real code graph (fs2/SCIP)

**Why needed**: pij-repomap is the highest-fit extension given we already use fs2. Aider's repo-map uses tree-sitter + token budgeting; we have a richer graph (semantic + cross-file SCIP edges + AI summaries). Want a survey of how to rank nodes for inclusion under a token budget — PageRank, retrieval, hybrid?

**Ready-to-use prompt**:
```
/deepresearch "Token-budgeted code-context selection for LLM coding agents using a
project knowledge graph (nodes: files/classes/functions; edges: imports, calls, type
references; per-node AI summaries; per-node embeddings). Compare PageRank-on-edges,
embedding-similarity-to-query, recency-weighted, and hybrid approaches. Aider's
repo-map is the best-known baseline. Output: a ranking algorithm sketch and an
evaluation methodology that could run on pi-mono itself as a corpus."
```

### Research Opportunity 3: Tiered persistent memory in coding agents

**Why needed**: `pij-memory` is on the roadmap. Want to confirm whether SQLite + entity-relationship is still the consensus, or if vector-first / graph-first / file-first approaches have overtaken it in 2026.

**Ready-to-use prompt**:
```
/deepresearch "State of cross-session persistent memory in coding-agent harnesses
as of 2026. Compare SQLite + entity-relationship (Codex), file-based memory.md
(Cursor), vector store + graph (LangChain memory), and emerging approaches. Cover:
crystallization triggers (compaction vs explicit), retrieval (hot/warm/cold tiers
vs flat), security (secret scrubbing on write), portability across harnesses.
Output: recommended architecture for a pi extension."
```

(Run any/all of these via `/deepresearch …` and save results to `external-research/<topic>.md`.)

---

## Appendix: Finding Files

| File | Findings | Topic |
|---|---|---|
| [`findings/01-extension-api.md`](findings/01-extension-api.md) | 18 (IA-01..IA-18) | Complete ExtensionAPI surface with TS signatures and examples |
| [`findings/02-in-tree-extensions.md`](findings/02-in-tree-extensions.md) | 15 (BE-01..BE-15) | Every example extension shipped in pi-mono |
| [`findings/03-skills-prompts-themes-packages.md`](findings/03-skills-prompts-themes-packages.md) | 18 (SP-01..SP-18) | The four non-TS extension surfaces + pi-package distribution |
| [`findings/04-tools-and-mcp.md`](findings/04-tools-and-mcp.md) | 16 (TM-01..TM-16) | Tool architecture, MCP gap, custom providers, sandbox |
| [`findings/05-context-management.md`](findings/05-context-management.md) | 16 (CM-01..CM-16) | Six-phase context lifecycle and every hook in it |
| [`findings/06-docs-and-distribution.md`](findings/06-docs-and-distribution.md) | 17 (DD-01..DD-17) | Official docs map, publishing flow, AGENTS.md rules |
| [`external-research/third-party-pi-extensions.md`](external-research/third-party-pi-extensions.md) | 37 (TP-01..TP-37) | Survey of ~80 community extensions, plus negative findings |
| [`external-research/harness-comparison.md`](external-research/harness-comparison.md) | 45 (HC-01..HC-45) | 11 peer harnesses, ideas worth porting |
| **Total** | **182** | — |

---

## Next Steps

1. **Decide which extension to build first.** From the Top Opportunities list, the highest-leverage / lowest-effort starting points are: a tiny "hello" extension (validates dev loop) → `pij-mcp` (high user value, well-documented pattern) → `pij-repomap` (showcases our fs2 investment).
2. **Optional external research** — run any of the three `/deepresearch` prompts in §"External Research Opportunities" before committing to a design for sub-agents / repo-map / memory.
3. **Then `/plan-1b-specify "<chosen extension>"`** — turn this research into a feature spec and tasks.

---

**Research Complete**: 2026-05-09
**Report Location**: `/Users/jordanknight/pi-hacking/pij/docs/plans/001-pi-extensions/research-dossier.md`
