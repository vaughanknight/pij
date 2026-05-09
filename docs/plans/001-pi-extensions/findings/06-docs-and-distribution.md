# DD: Documentation Surface & Distribution

## DD-01: Documentation Map

| Capability | Primary Doc | Secondary Docs |
|------------|-------------|----------------|
| **Extensions** | `docs/extensions.md` (37KB) | README.md "Extensions" section, examples/extensions/ |
| **Skills** | `docs/skills.md` | README.md, agentskills.io standard |
| **Prompt Templates** | `docs/prompt-templates.md` | README.md |
| **Themes** | `docs/themes.md` | README.md |
| **Pi Packages** | `docs/packages.md` | README.md "Pi Packages" section |
| **SDK** | `docs/sdk.md` (150KB) | examples/sdk/, packages/coding-agent/src/core/sdk.ts |
| **RPC Mode** | `docs/rpc.md` (140KB) | README.md, src/modes/rpc/rpc-types.ts |
| **Custom Providers** | `docs/custom-provider.md` | examples/extensions/custom-provider-* |
| **Architecture** | AGENTS.md (project rules) | CONTRIBUTING.md, philosophy (blog post) |

---

## DD-02: The Official Extension Story

Pi's extensibility philosophy: **core stays minimal, features come as extensions**. Three layers:

1. **Extensions (TypeScript modules)**: Register custom tools, subscribe to events, customize UI/compaction, gate permissions. Load from `~/.pi/agent/extensions/`, `.pi/extensions/`, or packages. Subscribe to 20+ lifecycle events (agent_start, tool_call, session_before_fork, etc.). Default export is factory function receiving `ExtensionAPI`.

2. **Skills (Markdown+assets)**: Reusable workflows following Agent Skills standard. SKILL.md with frontmatter (name, description, optional fields: license, compatibility, allowed-tools, disable-model-invocation). Loaded on-demand; descriptions in system prompt, full content fetched when needed. No code—just instructions + reference docs.

3. **Pi Packages (npm/git bundles)**: Distribute extensions, skills, prompts, themes via `package.json` with `pi` manifest key. Install via `pi install npm:@scope/name` or `pi install git:github.com/user/repo@tag`. Automatically discover from conventional dirs or explicit `pi.extensions`, `pi.skills`, `pi.prompts`, `pi.themes` arrays.

---

## DD-03: "Hello, Extension" Walkthrough

Create `~/.pi/agent/extensions/my-extension.ts`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Lifecycle event
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Loaded!", "info");
  });

  // Event interception
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked" };
    }
  });

  // Custom tool
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone",
    parameters: Type.Object({ name: Type.String() }),
    async execute(toolCallId, params) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Custom command
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

Test: `pi -e ./my-extension.ts`. On success, move to `~/.pi/agent/extensions/` for auto-discovery, reload with `/reload`.

---

## DD-04: SDK Entry Point

**File:** `packages/coding-agent/src/core/sdk.ts`

**When to use SDK vs Extension:**
- **Use SDK** for embedding pi in custom applications, building custom UIs, automated workflows, or subprocess integration with type safety.
- **Use Extension** for modifying existing interactive mode, adding tools/commands, gating permissions, or customizing behavior without spawning a subprocess.

**Main factory:** `createAgentSession(options)` or `createAgentSessionRuntime(factory, config)` for session replacement (new, resume, fork, clone, import).

**Key exports:**
- `AuthStorage`, `ModelRegistry` - credential & model management
- `DefaultResourceLoader` - extensions/skills/prompts/themes discovery
- `SessionManager` - session persistence, in-memory, continue, fork
- `SettingsManager` - global + project settings merging
- `defineTool()` - custom tool schema with typebox
- `codingTools`, `readOnlyTools` - pre-built tool sets
- `InteractiveMode`, `runPrintMode`, `runRpcMode` - run modes

---

## DD-05: RPC Mode for Editor Integration

**Start:** `pi --mode rpc [options]`

**Protocol:** Strict JSONL (split on `\n` only, not Unicode line separators). Commands on stdin, responses + events on stdout.

**Core flow:**
1. Send `{"type": "prompt", "message": "..."}` → response with `success: true/false`
2. Stream events (agent_start, message_update, tool_execution_*, agent_end)
3. Can queue steering (steer) or follow-up (follow_up) while streaming
4. Query state: get_state, get_messages, get_available_models, get_commands
5. Control: set_model, set_thinking_level, compact, fork, switch_session

**Extension UI sub-protocol:** Extensions emit `extension_ui_request` on stdout (select, confirm, input, editor, notify, setStatus, setWidget). Clients respond with `extension_ui_response` (id match required for dialogs).

---

## DD-06: Publishing a Pi Package

**manifest (package.json):**
```json
{
  "name": "@my-scope/my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**Auto-discovery (no manifest):** Looks for `extensions/`, `skills/`, `prompts/`, `themes/` by convention.

**Install:** `pi install npm:@my-scope/my-pi-package` (global) or `-l` (project-local).

**Pinning:** Versioned specs skip updates. `pi update` respects pins.

**Dependencies:**
- Core pi packages (@earendil-works/pi-*) go in `peerDependencies` with `"*"` range; NOT bundled.
- Other dependencies in `dependencies`; bundled automatically for npm/git installs.

**Gallery (npmjs.com):** Tag with `pi-package` keyword. Add optional `video` or `image` fields for preview in package gallery.

---

## DD-07: Key Gotchas from AGENTS.md

1. **No `any` types** — Always define proper types. Check node_modules for external API defs.
2. **NEVER inline imports** — No `await import()` or `import("pkg").Type` in type position. Always top-level imports.
3. **Never hardcode keybindings** — All keybindings must be configurable. Add DEFAULT_* to matching object.
4. **Never modify models.generated.ts** — Update generate-models.ts instead.
5. **`npm run check` REQUIRED** — After code changes; fix all errors, warnings, infos before commit.
6. **Never use git -A or .** — Always `git add <specific-files>` to avoid picking up other agents' work.
7. **No inline tools** — Use SDK `defineTool()` + `customTools` array, not inline `pi.registerTool()` in SDK context.

---

## DD-08: Contribution Gate

**Automation:** `.github/workflows/issue-gate.yml`, `pr-gate.yml`, `approve-contributor.yml`

- New issues/PRs auto-closed by default.
- Maintainer approval: `lgtmi` (future issues only), `lgtm` (issues + PR rights).
- Non-weekend review queue (Friday–Sunday auto-closed, not reviewed).
- Quality bar: short, concrete, one-screen, written voice, clear WHY.
- CHANGELOG.md entries added by maintainers, not contributors.

---

## DD-09: Extension Event Hierarchy

**Startup:** `session_start` → `resources_discover`

**Per prompt:** `input` → `before_agent_start` → `agent_start` → (turns) → `agent_end`

**Per turn:** `turn_start` → `context` → `before_provider_request` → `after_provider_response` → (tools loop) → `turn_end`

**Tool lifecycle:** `tool_execution_start` → `tool_call` (can block) → `tool_execution_update` → `tool_result` (can modify) → `tool_execution_end`

**Session ops:** `session_before_switch`, `session_before_fork`, `session_before_compact`, `session_shutdown`

**Re-subscription after session switch:** Yes—extensions reload; previous subscriptions lost.

---

## DD-10: Available Imports in Extensions

✅ **Bundled:**
- `@earendil-works/pi-coding-agent` (types)
- `@earendil-works/pi-agent-core` (Agent, AgentEvent)
- `@earendil-works/pi-ai` (Model, streaming, StringEnum)
- `@earendil-works/pi-tui` (TUI components)
- `typebox` (schema definitions)

✅ **npm packages:** Add `package.json` next to extension, run `npm install`, import from node_modules.

✅ **Node.js built-ins:** `node:fs`, `node:path`, etc.

⛔ **Dynamic imports:** Only for async extensions (fetching configs). Never for types.

---

## DD-11: Async Extension Factories

Extension can return a Promise for one-time initialization (fetch remote models, auth, warm caches). Pi awaits before `session_start`, before `resources_discover`, before provider registrations are flushed.

```typescript
export default async function (pi: ExtensionAPI) {
  const models = await fetch("http://localhost:1234/v1/models").then(r => r.json());
  pi.registerProvider("local-llm", { ... models ... });
}
```

This pattern makes fetched models available during startup and to `pi --list-models`.

---

## DD-12: Session Format & Persistence

**Location:** `~/.pi/agent/sessions/<dir>/` organized by working directory. Tree structure: JSONL with `id` + `parentId` fields enabling in-place branching (no new files).

**SessionManager API:** `list()`, `listAll()`, `open()`, `continueRecent()`, `inMemory()`

**Tree traversal:** `getEntries()`, `getTree()`, `getPath()`, `getLeafEntry()`, `getEntry(id)`, `getChildren(id)`

**Labeling:** `getLabel(id)`, `appendLabelChange(id, label)` for bookmarks/checkpoints

**Session format doc:** `docs/session-format.md` covers full JSONL schema

---

## DD-13: Settings Merging (Global + Project)

**Location:** `~/.pi/agent/settings.json` (global) + `.pi/settings.json` (project)

**Merge:** Project overrides global. Nested objects merge keys. Setters modify global by default.

**SettingsManager API:** `create(cwd, agentDir)` (file-backed), `inMemory(overrides)` (testing)

**Async durability:** Getters/setters are sync for in-memory state. Persistence enqueued asynchronously. Call `await flush()` before exit or test assertions.

---

## DD-14: Skills vs Extensions

| Aspect | Skill | Extension |
|--------|-------|-----------|
| **Form** | Markdown + assets (SKILL.md) | TypeScript module |
| **Language** | None (instructions only) | JavaScript/TypeScript |
| **Registration** | Auto-discovered (name matching dir) | Manual `registerTool()`, `registerCommand()` |
| **When loaded** | On-demand (model reads it) | Startup + hot-reload |
| **System prompt** | Descriptions always in context | N/A (extensions don't appear in prompt) |
| **Executable code** | No (asset scripts + instructions) | Yes (full system access) |
| **Use case** | Workflows, reference docs | Permission gates, custom tools, UI, events |

---

## DD-15: Contradiction: Docs vs Code on Dynamic Imports

**Docs say:** "NEVER use inline imports; no `await import()`"

**Code reveals:** Async extension factories CAN fetch remote config, but must avoid type-position imports. Distinction: runtime-only `await import()` in async factory is OK; type-position imports are not.

**Impact:** Extensions that dynamically fetch models (e.g., local LLM servers) work as designed; no contradiction if author avoids type imports.

---

## DD-16: Gap: Compaction Customization Underdocumented

**Docs say:** Extensions can customize compaction via `session_before_compact` event.

**Reality:** Event exists, allows cancellation + custom instructions, but no API shown for *replacing* the compaction strategy. Needs example in extensions.md or reference in docs/compaction.md.

---

## DD-17: CLI Publishing Flow

No built-in `pi publish` command. Publishing path:
1. Create `package.json` with `pi` manifest + `pi-package` keyword.
2. `npm publish` to npmjs.com, OR push to GitHub + tag version.
3. User: `pi install npm:@scope/name` or `pi install git:github.com/user/repo@v1`.
4. Gallery: npmjs.com filters on `pi-package` keyword; README + `video`/`image` fields optional.

**Version policy:** Semantic versioning (minor = breaking API, patch = features + fixes). No major releases. Lockstep all packages in pi-mono.

---

## Summary: Extension Story

Pi is extensible without forking. Three entry points: **Extensions** for code-driven customization (tools, events, UI), **Skills** for workflow documentation (no code), **Packages** for distribution. SDK for embedding; RPC for editor integration. 20+ lifecycle events, full TUI component access, async startup for dynamic providers. Type-safe TypeScript, bundled types, `typebox` schemas. CONTRIBUTING.md strict on quality (no auto-closed PRs without maintainer approval); AGENTS.md strict on code (no `any`, no inline imports, configurable keybindings). Compaction customization exists but needs clearer docs.

---

*Count: 17 findings. Generated from analysis of README.md, docs/*.md, AGENTS.md, CONTRIBUTING.md, packages.md, sdk.md, rpc.md, extensions.md, skills.md, and examples/.*

