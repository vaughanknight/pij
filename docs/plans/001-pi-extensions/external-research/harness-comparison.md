# Harness Comparison: Pi vs Peer Coding Agents

**Scope.** Comparison of pi's extensibility model against Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, Aider, OpenCode, Cline, Continue, Goose, Cursor, OpenInterpreter, and Cody — plus broader MCP ecosystem, sub-agent orchestration, and context-management innovations. Aim: identify ideas worth porting to pi extensions.

**Pi baseline (for mapping).** Pi today exposes: `pi.registerTool` (TypeBox schemas, custom render), `pi.registerCommand` (slash commands), `pi.registerProvider` (custom LLMs), event hooks (`session_start`, `session_shutdown`, `tool_call`, `tool_result`, `agent_start`, `agent_end`, `session_tree`), Skills (CLI tools with READMEs), no native MCP, no per-operation permission prompts, single-process tool overrides via spread/operations pattern.

---

### HC-01: Claude Code — PreToolUse / PostToolUse Hooks
**Harness**: Claude Code
**Surface type**: hook
**Description**: Lifecycle hooks fire around every tool invocation. `PreToolUse` can block/deny a call before it runs; `PostToolUse` runs validators (linters, tests, audit log) after completion. Configured in `.claude/settings.json` under a `hooks` key, executed as shell commands with JSON stdin context.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/hooks ; https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns
**Innovative aspect**: Hooks are the primary policy/governance surface — they enforce CI/CD-grade gates (e.g., reject `rm -rf` on prod paths, auto-format after every Edit) without changing the agent's logic.
**Pi mapping idea**: Pi already has `tool_call` / `tool_result` events, but they cannot **block** execution and don't have a documented "deny + reason returned to LLM" path. Add a `pi.on("tool_call")` return contract: `{ block: true, reason: "..." }` re-injects an error result so the LLM self-corrects. Ship a built-in `pi-hooks` extension that reads JSON config from `.pi/hooks.json` so non-TypeScript users can write shell-script gates.

---

### HC-02: Claude Code — UserPromptSubmit Hook
**Harness**: Claude Code
**Surface type**: hook
**Description**: Fires on every user prompt before it reaches the model. Used to inject context, redact secrets, log to audit, or transform the prompt (e.g., expand `@file` mentions).
**Reference URL**: https://docs.claude.com/en/docs/claude-code/hooks
**Innovative aspect**: Lets extensions transparently augment user prompts without the user knowing — perfect for "always include git diff" or "always pass through corp secrets scanner."
**Pi mapping idea**: Pi has no documented `user_prompt` event. Add `pi.on("user_prompt", (event, ctx) => { event.text = transform(event.text); })` with mutation semantics matching the existing `tool_call` event. Enables in-tree extensions like `auto-context` (inject fs2 graph hits) or `secret-scrub`.

---

### HC-03: Claude Code — SessionStart / SessionEnd / Stop / SubagentStop / PreCompact
**Harness**: Claude Code
**Surface type**: hook
**Description**: Granular lifecycle events. `Stop` fires before the agent finishes a turn (last chance to validate); `PreCompact` fires before context compaction (chance to inject "do not lose X"); `SubagentStop` runs when a Task sub-agent finishes (chance to summarize before merging back).
**Reference URL**: https://docs.claude.com/en/docs/claude-code/hooks
**Innovative aspect**: `Stop` = "agent self-quality-gate" — extension can demand the agent run tests before declaring done; `PreCompact` = "memory crystallizer" — extension forces durable state to disk before summarization throws away detail.
**Pi mapping idea**: Pi has `agent_end` but no `pre_compact`. Wire a `pi.on("pre_compact")` and `pi.on("stop")` event: extensions can return `{ continue: true, message: "tests failing" }` to push the agent into another turn. Maps directly to the planned compact-aware persistent memory extension.

---

### HC-04: Claude Code — Skills with Progressive Disclosure
**Harness**: Claude Code
**Surface type**: skill
**Description**: Skills are folders with `SKILL.md` (YAML frontmatter + markdown). Frontmatter has `name` and `description`; only those load into context until the LLM picks the skill, then full body + bundled scripts load. Lives in `~/.claude/skills/` (user) or `.claude/skills/` (project).
**Reference URL**: https://docs.claude.com/en/docs/claude-code/skills
**Innovative aspect**: **Progressive disclosure** — skills cost ~50 tokens until activated. Lets you ship 100 skills with no bloat. Skills can include scripts, templates, examples, all loaded only when relevant.
**Pi mapping idea**: Pi has skills (CLI + README) but every README is fully loaded eagerly. Add a `frontmatter` mode where pi only injects `name + description` until `getSkill(name)` is called by the model. Plus support a `bundled-scripts/` subfolder per skill that's exposed as pre-approved bash invocations only when the skill activates.

---

### HC-05: Claude Code — `allowed-tools` in Skill Frontmatter
**Harness**: Claude Code (and Copilot CLI Skills)
**Surface type**: skill
**Description**: Skill frontmatter declares `allowed-tools: [Bash(npm test:*), Read]` — the listed tools auto-approve while that skill is the active intent, even in interactive mode.
**Reference URL**: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
**Innovative aspect**: Per-skill auto-approval. Reduces approval fatigue without globally relaxing permissions — security stays scoped to the skill's narrow purpose.
**Pi mapping idea**: Pi has tools allowlist (global) but no skill-scoped auto-approval. Add `allowed-tools` to skill frontmatter; while the skill is "in flight" pi pre-approves matching tool calls. Implementation: small extension intercepting `tool_call` events that consults the active-skill stack.

---

### HC-06: Claude Code — Slash Commands as Files (`/commands/*.md`)
**Harness**: Claude Code
**Surface type**: command
**Description**: Slash commands live as plain markdown files in `.claude/commands/foo.md`. Frontmatter sets `description`, `argument-hint`. Body is a prompt template using `$ARGUMENTS`. Discovery is automatic.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/slash-commands
**Innovative aspect**: Zero code, version-controlled team workflows. A markdown file *is* an executable workflow — the prompt template is the program.
**Pi mapping idea**: Pi has `pi.registerCommand` (TypeScript). Add a `prompts/*.md` discovery path mirroring Claude Code: any `.pi/commands/*.md` becomes a slash command whose body is sent verbatim with `$ARGUMENTS` substitution. Lowers the bar for non-TS users dramatically.

---

### HC-07: Claude Code — Sub-Agents (`.claude/agents/*.md`) + Task Tool
**Harness**: Claude Code
**Surface type**: sub-agent
**Description**: Sub-agents are markdown files declaring a system prompt, allowed tool set, and description. The main agent invokes them via the `Task` tool, getting a fresh isolated context window per sub-agent. Used for parallel research, code review fan-out, planner/executor split.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/sub-agents
**Innovative aspect**: **Context isolation as the primary feature.** Sub-agents multiply effective context (5 sub-agents = 5× window). Specialized prompts (e.g., security reviewer) outperform generalists.
**Pi mapping idea**: Pi has no first-class sub-agent primitive. Build a `pi-task` extension exposing a `task` tool: takes `agent_name`, `prompt`, spawns a child runner with a separate session, injects its trimmed result into the parent. Ship reference sub-agents: `code-reviewer`, `researcher`, `test-runner`. This is the highest-impact missing primitive.

---

### HC-08: Claude Code — Output Styles
**Harness**: Claude Code
**Surface type**: UI
**Description**: User-installable output style (`~/.claude/output-styles/*.md`) that swaps the system prompt's persona/voice/format. Toggleable via `/output-style`.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/output-styles
**Innovative aspect**: Decouples the agent's tone/format from its tools. Same harness, totally different feel (e.g., "concise senior reviewer" vs "explain-like-I'm-five teacher").
**Pi mapping idea**: Pi has no equivalent. Add `pi.registerOutputStyle({ name, systemPromptOverride })` plus `~/.pi/output-styles/*.md` discovery. Trivial to implement, big UX win.

---

### HC-09: Claude Code — Status Line
**Harness**: Claude Code
**Surface type**: UI
**Description**: `settings.json` `statusLine` field runs a shell command on each turn; stdout becomes the bottom-of-screen status. Used to show git branch, model, tokens, cost, build status.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/statusline
**Innovative aspect**: Pluggable persistent UI without writing TUI code. Any script that prints a line works.
**Pi mapping idea**: Pi has TPS extension via `ctx.ui.notify` (toast). Add a real `statusLine` slot in the TUI bound to either an extension callback or a shell command (mirroring Claude Code). Map cleanly to TPS, git branch, fs2 hot-spot indicator.

---

### HC-10: Claude Code — Plugin Marketplace (`/plugin`)
**Harness**: Claude Code
**Surface type**: plugin / distribution
**Description**: `/plugin marketplace add owner/repo` adds a marketplace, then `/plugin install <name>` pulls a bundle (skills + commands + agents + hooks + MCP servers). Marketplaces are GitHub repos with `.claude-plugin/marketplace.json`.
**Reference URL**: https://code.claude.com/docs/en/discover-plugins ; https://just-be.dev/blog/why-i-built-a-claude-code-plugin-marketplace/
**Innovative aspect**: Bundles **everything** — a single install adds commands, agents, hooks, MCP, skills together. Decentralized: any GitHub repo is a marketplace.
**Pi mapping idea**: Pi has `-e ./file.ts` and `~/.pi/agent/extensions/` discovery. Add `pi extension add github:owner/repo` that pulls a manifest declaring the bundle's tools/commands/skills/hooks. No central registry needed — git URLs as identity.

---

### HC-11: Claude Code — Agent SDK
**Harness**: Claude Code
**Surface type**: SDK
**Description**: TypeScript and Python SDKs (`@anthropic-ai/claude-agent-sdk`) let third parties embed the full Claude Code agent loop in their own apps — pass system prompt, tool list, settings, and run programmatically.
**Reference URL**: https://docs.claude.com/en/api/agent-sdk
**Innovative aspect**: Same agent runtime powers both the CLI and arbitrary apps. Custom UIs, batch jobs, GitHub Actions all reuse the loop.
**Pi mapping idea**: Pi's `coding-agent` package is already library-grade. Document and harden a public `runAgent({ extensions, model, prompt })` API and ship a `@earendil-works/pi-agent-sdk` shim. Critical for Codex/Devin-style "background coding agent" extensions.

---

### HC-12: Copilot CLI — Hooks (`copilot-cli-policy.json`)
**Harness**: GitHub Copilot CLI
**Surface type**: hook
**Description**: Hooks at `.github/hooks/copilot-cli-policy.json` fire on `sessionStart`, `userPromptSubmitted`, `preToolUse`. Each can run a command/HTTP webhook, gate execution, or log for audit.
**Reference URL**: https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks
**Innovative aspect**: Org-policy-first design — the canonical install location is `.github/`, not user dotfiles. Hooks support **HTTP webhooks** so policy lives on a central server, not in repos.
**Pi mapping idea**: Pi extensions are TypeScript-only. Add a config-only "policy hook" loader that reads JSON and POSTs context to a configured URL — letting infosec teams enforce gates without writing TS. Maps to event-driven extension intercepts.

---

### HC-13: Copilot CLI — `/fleet` (Multi-Agent Parallel Dispatch)
**Harness**: GitHub Copilot CLI
**Surface type**: sub-agent
**Description**: `/fleet <objective>` decomposes a goal into independent work items, dispatches each as a background subagent (separate context), polls for completion, and aggregates. Works on five files in parallel where one agent would serialize.
**Reference URL**: https://github.blog/ai-and-ml/github-copilot/run-multiple-agents-at-once-with-fleet-in-copilot-cli/
**Innovative aspect**: User-facing parallelism primitive. Not a hidden internal optimization — `/fleet` is a deliberate developer tool with explicit dependency-aware scheduling.
**Pi mapping idea**: Build on HC-07. Add a `/fleet` command extension that takes an objective, asks the LLM to produce a DAG of subtasks, and dispatches them via the new `task` tool. Show progress in TUI as a parallel checklist.

---

### HC-14: Codex CLI — Sandbox Modes (read-only / workspace-write / yolo)
**Harness**: OpenAI Codex CLI
**Surface type**: security
**Description**: Three OS-level sandbox modes enforced via OS sandbox APIs (Seatbelt on macOS, Landlock on Linux): `read-only`, `workspace-write` (default; mutations confined to cwd, no network), and `dangerously-bypass-approvals-and-sandbox` (`--yolo`).
**Reference URL**: https://developers.openai.com/codex/agent-approvals-security
**Innovative aspect**: Sandbox is **two-layered** — sandbox enforces what's *technically possible*, approval policy decides *when to ask*. OS-enforced (not LLM-enforced) means jailbreaks can't escape the cage.
**Pi mapping idea**: Pi's `sandbox.ts` example overrides bash but is single-tool. Promote to a first-class `pi.setSandbox({ mode: "workspace-write" })` API that wires Seatbelt/Landlock at the process level for all tools. Ship as a built-in opt-in extension.

---

### HC-15: Codex CLI — Granular Approval Policies
**Harness**: OpenAI Codex CLI
**Surface type**: security / hook
**Description**: `approval_policy` in `~/.codex/config.toml` chooses `untrusted` / `on-request` / `never` / `granular`. Granular mode lets ops define per-category rules (e.g., always-allow read, always-deny secret-probe, ask for write).
**Reference URL**: https://smartscope.blog/en/generative-ai/chatgpt/codex-cli-approval-policy-implementation/
**Innovative aspect**: Approval is **policy-as-code with categories**, not per-tool toggles. Includes built-in detectors for credential probing and persistent security weakening.
**Pi mapping idea**: Pi's tools allowlist is binary on/off. Build a `pi-approval` extension that wraps `tool_call`, applies regex/argument-shape rules from `.pi/approvals.toml`, and surfaces an approval prompt only when categories say so. Drastically reduces approval fatigue.

---

### HC-16: Codex CLI — AGENTS.md Hierarchy
**Harness**: OpenAI Codex CLI (also Cursor, Copilot, Sourcegraph — universal standard)
**Surface type**: context
**Description**: Walks from repo root → cwd, concatenating `AGENTS.md` files (with `AGENTS.override.md` precedence). Global `~/.codex/AGENTS.md` provides defaults. Size capped via `project_doc_max_bytes`.
**Reference URL**: https://developers.openai.com/codex/guides/agents-md
**Innovative aspect**: **Cross-tool standard** (OpenAI + Sourcegraph + Cursor + Google convergence as of 2025). Hierarchical override = enterprise-friendly per-folder rules.
**Pi mapping idea**: Pi has no project-instructions discovery. Ship an `agents-md` extension that injects the cascaded `AGENTS.md` chain into the system prompt at session start. Lets pi participate in the universal standard with one extension.

---

### HC-17: Codex CLI — Plugin Bundles (Skills + Apps + MCP)
**Harness**: OpenAI Codex CLI
**Surface type**: plugin
**Description**: `/plugins` browser shows plugins that bundle skills + app integrations (Gmail, Drive, Slack OAuth) + MCP servers. Auth runs at install or first-use. `enabled = false` keeps installed but inactive.
**Reference URL**: https://developers.openai.com/codex/plugins
**Innovative aspect**: **OAuth at install time** — plugin marketplace handles auth flow, not the user. First-class for SaaS connectors.
**Pi mapping idea**: Add `pi.registerOAuthFlow` to ExtensionAPI for plugins that need a browser-based auth dance. Reference impl: gmail/slack extensions in pi marketplace.

---

### HC-18: Aider — Repository Map (Graph-Ranked, Token-Bounded)
**Harness**: Aider
**Surface type**: context
**Description**: Aider builds a repo-wide map of class/function signatures (no bodies). Uses tree-sitter for parsing and a PageRank-style graph algorithm to dynamically pick the most-referenced symbols that fit `--map-tokens` (default 1024). Map updates per chat turn based on focus.
**Reference URL**: https://aider.chat/docs/repomap.html ; https://aider.chat/2023/10/22/repomap.html
**Innovative aspect**: **The map is recomputed every turn** using which files are in chat as graph "personalization" — the LLM always sees the structure most relevant to the current focus.
**Pi mapping idea**: Pi already has fs2/FlowSpace as a project graph. Build a `repo-map` extension that uses fs2's existing graph + tree-sitter to emit a token-bounded signature map and inject via `user_prompt` event (HC-02). Compare cost per turn and tune budget.

---

### HC-19: Aider — `/architect` Mode (Planner/Executor Split)
**Harness**: Aider
**Surface type**: command / sub-agent
**Description**: Two-stage flow: "architect" model proposes a plain-English fix; "editor" model converts it into precise diff edits. Pair `o1-preview` (reasoning) with `claude-sonnet` or `deepseek` (editing) for SOTA edit benchmarks.
**Reference URL**: https://aider.chat/2024/09/26/architect.html
**Innovative aspect**: Mixes models per stage, exploiting reasoning vs editing strengths. Improved benchmark scores 5-10% across model pairs vs solo runs.
**Pi mapping idea**: Pi has `pi.registerProvider`. Add an `/architect` command extension that runs a planning turn on a configured "architect_model" then re-routes to the default model for edits. Implementation: spawn a sub-agent (HC-07) with a planning prompt and pipe its output as user message to main.

---

### HC-20: Aider — Auto-Lint and Auto-Test on Every Edit
**Harness**: Aider
**Surface type**: hook / quality gate
**Description**: After every file edit, Aider runs the configured linter (`--lint-cmd`) and optional test command (`--test-cmd`). On non-zero exit, the error is fed back to the LLM which auto-attempts a fix.
**Reference URL**: https://aider.chat/docs/usage/lint-test.html
**Innovative aspect**: Quality gate = recovery loop, not blocking error. The LLM owns fixing the lint/test failure it caused.
**Pi mapping idea**: Equivalent to a `tool_result` event handler on `edit`/`write`. Build a `quality-gate` extension reading `.pi/quality.json` (lint cmd, test cmd) — runs after edits, on failure injects an error tool result so the LLM retries. Maps cleanly to existing event API.

---

### HC-21: Aider — Voice Coding (`/voice`)
**Harness**: Aider
**Surface type**: UI / input
**Description**: `/voice` starts mic capture, transcribes via Whisper, injects as the next user message. Hands-free coding on long debugging sessions.
**Reference URL**: https://aider.chat/docs/usage/voice.html
**Innovative aspect**: Treats voice as just-another-input — no special UI mode, just a pre-processor for the prompt buffer.
**Pi mapping idea**: A `pi-voice` extension registers a `/voice` command that calls a local Whisper.cpp binary (or Whisper API), then calls `pi.sendMessage(transcript)`. Trivial given existing `sendMessage` and `registerCommand`.

---

### HC-22: Aider — `/copy-context` for Web Pasting
**Harness**: Aider
**Surface type**: command
**Description**: `/copy-context` copies the current chat + repo map + open files as a markdown blob suited for pasting into ChatGPT/Claude.ai web UIs (when CLI hits a wall).
**Reference URL**: https://aider.chat/docs/usage/commands.html
**Innovative aspect**: Acknowledges agents fail and gives a clean escape hatch to a more capable web model. Cross-tool collaboration baked in.
**Pi mapping idea**: A `pi-export` command that snapshots session + active files + fs2 graph hits as markdown, copies to clipboard. Useful for handoffs to Claude.ai or Gemini.

---

### HC-23: Aider — Multi-Provider via `litellm`
**Harness**: Aider
**Surface type**: provider abstraction
**Description**: Built on `litellm` so any LLM provider works — OpenAI, Anthropic, DeepSeek, Ollama, Gemini, Bedrock. `.aider.model.metadata.json` registers context windows and costs for unknown models.
**Reference URL**: https://aider.chat/docs/config/adv-model-settings.html
**Innovative aspect**: Provider-neutral by construction. Lets users pick model per task without rewriting code.
**Pi mapping idea**: Pi has `registerProvider`. Ship a `pi-litellm` bridge extension that exposes the entire litellm catalog as registered providers without per-provider extension code.

---

### HC-24: OpenCode — Share Links
**Harness**: OpenCode (sst/opencode)
**Surface type**: distribution / UI
**Description**: Generate a persistent shareable URL of an active session (config + prompts + tool calls + outputs). Recipients open the link to replay or fork.
**Reference URL**: https://opencode.ai
**Innovative aspect**: Sessions become artifacts. Closest peer-to-peer mechanism for "look at my agent run" — no Loom video needed.
**Pi mapping idea**: A `pi-share` extension that uploads compressed session JSON to a configured backend (s3/gist) and prints a URL. Could integrate with the existing harness telemetry.

---

### HC-25: Cline — Browser Use as First-Class Tool
**Harness**: Cline
**Surface type**: tool
**Description**: Built-in browser automation: agent navigates pages, fills forms, screenshots, and extracts content as part of normal tool flow — used to test frontend changes the agent just wrote.
**Reference URL**: https://github.com/cline/cline
**Innovative aspect**: Closes the loop on web work — the same agent that edits React can verify the rendered page.
**Pi mapping idea**: A `pi-browser` extension wrapping Playwright; exposes tools `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_extract`. Critical for full-stack workflows.

---

### HC-26: Continue — Custom Context Providers
**Harness**: Continue
**Surface type**: context
**Description**: Pluggable context providers implement a small interface and feed retrievals into the prompt at any `@`-mention. Users author custom providers in TS for proprietary docs, internal wikis, ticket systems.
**Reference URL**: https://docs.continue.dev/customize/custom-providers
**Innovative aspect**: First-class **information injection** primitive separate from tools. Tools "do," providers "know."
**Pi mapping idea**: Add `pi.registerContextProvider({ name, getContext(query) })`. Used at prompt construction time and `@`-mention completion. Maps cleanly to fs2 + AGENTS.md + skill index.

---

### HC-27: Goose — Agentic Loop Customization (Recipes)
**Harness**: Goose (block/goose)
**Surface type**: agent loop / recipe
**Description**: "Recipes" are reusable blueprints for the planner/executor reasoning loop — they specify tool ordering, retry rules, and reflection steps for a given task class (e.g., "refactor recipe").
**Reference URL**: https://block.github.io/goose/
**Innovative aspect**: Loop **structure** is data, not code. Lets users craft specialized agents without forking the runtime.
**Pi mapping idea**: Pi today wires the agent loop in code. Expose hooks at planning/reflection points (`pi.on("plan")`, `pi.on("reflect")`) so extensions can reorder or inject steps. Recipes become extension JSONs declaring step sequences.

---

### HC-28: Cursor — `.cursor/rules/*.mdc` (Glob-Scoped Rules)
**Harness**: Cursor
**Surface type**: context
**Description**: Project rules in `.cursor/rules/` with frontmatter `globs: ["src/**/*.ts"]` apply only when the agent is touching files matching the glob. Multiple rule files compose.
**Reference URL**: https://docs.cursor.com/context/rules
**Innovative aspect**: **Path-scoped instructions** — a frontend rule only loads when editing frontend files. Avoids global-prompt bloat.
**Pi mapping idea**: Extend HC-16 (AGENTS.md) with a `pi-rules` extension supporting glob frontmatter. Hooks `tool_call` for read/write/edit, sees which paths are touched, swaps in the matching rule subset.

---

### HC-29: Cursor — Background Agents
**Harness**: Cursor
**Surface type**: sub-agent / scheduling
**Description**: Long-running agents run in cloud sandboxes against a branch, working autonomously while the user does other things. Surface progress via PRs.
**Reference URL**: https://www.cursor.com/background-agents
**Innovative aspect**: Async dev. Agent runs hours/days; user reviews PRs at their pace.
**Pi mapping idea**: Pi has `/loop` and `/schedule` (Claude Code) inspirations. A `pi-detached` extension forks a session into a background process working on a worktree, posts status to a notification surface. Pairs with `EnterWorktree` if exposed.

---

### HC-30: OpenInterpreter — Profiles
**Harness**: OpenInterpreter
**Surface type**: configuration mode
**Description**: Named profiles bundle model, system prompt, tools, custom instructions. `interpreter --profile fast` swaps the entire stance in one command.
**Reference URL**: https://docs.openinterpreter.com/guides/profiles
**Innovative aspect**: Mode-as-data. Quick context-switching between deep-think setup and fast-iter setup.
**Pi mapping idea**: Pi's `~/.pi/profiles/<name>.json` (proposed) — a profile is a settings overlay loaded at start. CLI flag `pi --profile review`. Implementable as a wrapper extension that reads the profile and re-applies tool/extension allowlists.

---

### HC-31: Sourcegraph Cody — Code Graph as Built-in Context
**Harness**: Sourcegraph Cody
**Surface type**: context
**Description**: Inherits Sourcegraph's cross-repo code graph (precise definitions/refs) — agent answers like "who calls this function across 200 repos" without indexing.
**Reference URL**: https://sourcegraph.com/docs/cody
**Innovative aspect**: Cross-repo precision graph trumps embeddings for structural questions.
**Pi mapping idea**: Pi's fs2/FlowSpace IS a code graph. Wrap fs2 queries as MCP-style tools (`fs2_callers`, `fs2_definition`, `fs2_tree`) registered via `pi.registerTool`. Already half-built; productize as a default-on extension.

---

### HC-32: MCP Ecosystem — Sequential Thinking Server
**Harness**: MCP (Anthropic reference)
**Surface type**: MCP / context
**Description**: `sequentialthinking` MCP server exposes a tool that enforces structured "thought 1 → thought 2 → revision → conclusion" reasoning. Agent gets a scratchpad with explicit revision support.
**Reference URL**: https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
**Innovative aspect**: Reasoning **structure** is a tool, not a prompt convention. Enforces think-before-act.
**Pi mapping idea**: A pi extension `pi-think` registering a `think` tool that enforces a JSON-shaped sequence of steps with a "revise" action. No MCP needed — TypeBox schema + state stored in extension.

---

### HC-33: MCP Ecosystem — Knowledge Graph Memory
**Harness**: MCP (`knowledgegraph-mcp`)
**Surface type**: MCP / memory
**Description**: Persistent entity-relationship graph (PostgreSQL or SQLite). Agent stores facts as `(entity, relation, entity)` triples, retrieves connected subgraphs by query.
**Reference URL**: https://github.com/n-r-w/knowledgegraph-mcp
**Innovative aspect**: Graph beats vector for relational facts ("user works in Python, at company X, using framework Y") because relationships carry meaning.
**Pi mapping idea**: A `pi-memory` extension backed by SQLite + a small graph schema. Tools: `memory_remember(triple)`, `memory_recall(query)`, `memory_forget`. Cross-session via `~/.pi/memory.db`. Plays directly with `pre_compact` hook (HC-03) for automatic memory crystallization.

---

### HC-34: MCP Ecosystem — Playwright/Puppeteer Browser MCPs
**Harness**: MCP (Microsoft Playwright MCP)
**Surface type**: MCP / tool
**Description**: Browser automation exposed as MCP tools, used heavily in CI/CD and frontend dev. Pre-installed in Codex Cloud.
**Reference URL**: https://github.com/microsoft/playwright-mcp
**Innovative aspect**: Industry-standard browser MCP; same interface across Claude Code, Cursor, Copilot, Codex.
**Pi mapping idea**: Same as HC-25 but as MCP-compatible bridge — let pi consume the Playwright MCP server unchanged via the planned MCP-bridge extension (TM-13). One extension unlocks 100+ MCP servers.

---

### HC-35: MCP Ecosystem — Smithery.ai / MCP Registry Discovery
**Harness**: Cross-harness
**Surface type**: distribution
**Description**: Smithery.ai and registry.modelcontextprotocol.io aggregate 370+ MCP servers across 33 categories with metadata, install commands, OAuth helpers. CLI: `smithery mcp search`, `smithery tool list`.
**Reference URL**: https://smithery.ai
**Innovative aspect**: Centralized discovery + standardized install. Lowers cost of adding capabilities.
**Pi mapping idea**: Even without core MCP, build a `pi extension search` that queries a curated pi-extension registry (or Smithery MCP catalog) and prints install commands. Distribution is half of extension UX.

---

### HC-36: Sub-Agent Pattern — Parallel Code Review (9 Reviewers)
**Harness**: Claude Code (community pattern)
**Surface type**: sub-agent / orchestration
**Description**: Spawn 9 parallel sub-agents — security, perf, complexity, deps, tests, lint, dead-code, style, simplification — each reviews the same diff with a specialist prompt. Main agent synthesizes severity-ranked findings.
**Reference URL**: https://hamy.xyz/blog/2026-02_code-reviews-claude-subagents
**Innovative aspect**: ~75% wall-time reduction vs sequential. Specialized prompts beat one generalist on every dimension.
**Pi mapping idea**: Once HC-07 (sub-agents) lands, ship a `pi-review` extension as a flagship plugin: `/review` runs the 9-fanout pattern. Demonstrates pi's parallelism story to community.

---

### HC-37: Context Pattern — Hierarchical Memory (Cloudflare Agent Memory)
**Harness**: Cloudflare Agents
**Surface type**: context / memory
**Description**: Three-tier memory: hot (active), warm (priority), cold (archive). Memories are extracted, classified, content-addressed (deterministic IDs prevent dupes), redistributed by user-relevance.
**Reference URL**: https://blog.cloudflare.com/introducing-agent-memory/
**Innovative aspect**: Naive store-everything overwhelms retrieval; pruning loses important rare facts. Tiering with relevance promotion solves both.
**Pi mapping idea**: Extend HC-33 with tiering. `pi-memory` extension tags facts with score; promotion happens on retrieval-hit, eviction on staleness. Pi's `getContextUsage()` is already plumbed — wire it.

---

### HC-38: Context Pattern — Anthropic `compact_20260112` Native Compaction
**Harness**: Claude Code / Anthropic API
**Surface type**: context / compaction
**Description**: Native `context_edits=[{type: "compact"}]` triggers auto-summarization at >50K tokens, returns a typed `compaction` block; client serializes it and trims prior history. Tool-use pairs handled across the boundary.
**Reference URL**: https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
**Innovative aspect**: Compaction is **a model API feature**, not client-side hand-rolled. Tool-pair-aware boundary handling.
**Pi mapping idea**: Pi has `ctx.compact()`. Wire it to the Anthropic native compaction primitive when on Claude models, fall back to client-side summarization on other providers. Add `pre_compact` event (HC-03) for extensions to inject "preserve X."

---

### HC-39: Context Pattern — Semantic Caching (Vector-Match Cache Hits)
**Harness**: General (Redis Vector, Pinecone, Weaviate)
**Surface type**: context / caching
**Description**: Cache by intent embedding similarity (>0.90 cosine), not exact key. Variations of the same question hit cache; saves model calls + RAG fetches.
**Reference URL**: https://learn.deeplearning.ai/courses/semantic-caching-for-ai-agents
**Innovative aspect**: 30-70% cache hits in RAG-heavy agents where exact-match would get 5%.
**Pi mapping idea**: A `pi-semcache` extension intercepts `tool_call` for expensive tools (web fetch, fs2 graph search), embeds args, checks local sqlite-vss / embedded vector store. Drops latency for repeat exploration.

---

### HC-40: Context Pattern — Anthropic Prompt Caching with Cache Breakpoints
**Harness**: Anthropic API (used by Claude Code)
**Surface type**: context / caching
**Description**: Mark prompt prefixes with `cache_control: {type: "ephemeral"}`. 5-min TTL (1-hr extended). Cache rewards stable system prompt + tool definitions. Reads ~10% of write cost.
**Reference URL**: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
**Innovative aspect**: Cache TTL is **request-driven**, not server-managed — extends on each hit, lets engineers tune via call patterns.
**Pi mapping idea**: Audit pi's prompt structure for cache-friendliness. Make extension load order deterministic so cached prefix doesn't churn. Add a `pi-cache-stats` extension that surfaces hit rate in the status line (HC-09). Big cost win on multi-turn sessions.

---

### HC-41: Pattern — Universal `AGENTS.md` Standard
**Harness**: Cross-harness (OpenAI, Sourcegraph, Cursor, Google, Copilot)
**Surface type**: context / config
**Description**: Mid-2025 cross-vendor agreement on `AGENTS.md` (markdown, hierarchical override). Replaces tool-specific `.cursor.rules`, `.copilot.instructions.md`, `CLAUDE.md` etc. Pi conspicuously absent.
**Reference URL**: https://agents.md
**Innovative aspect**: Industry consolidation — first cross-vendor extension standard since LSP.
**Pi mapping idea**: **Highest-priority interop**. Built-in pi support for `AGENTS.md` discovery — auto-loaded into system prompt, no extension needed. Ship as default-on. Also document `PI.md` for pi-specific overrides (parallels CLAUDE.md).

---

### HC-42: Codex CLI — `--output-schema-file` Structured Output
**Harness**: OpenAI Codex CLI
**Surface type**: SDK / programmatic
**Description**: `codex exec` accepts a JSON schema; the agent's final answer is forced to conform. Used to build code-review bots that emit structured findings consumable by SCM APIs.
**Reference URL**: https://developers.openai.com/codex/cli/features
**Innovative aspect**: Composable in pipelines. Same agent emits prose interactively or strict JSON for a script.
**Pi mapping idea**: Add `pi --output-schema schema.json` that constrains the final assistant message via TypeBox + retries on schema violation. Maps directly onto pi's existing TypeBox dependency.

---

### HC-43: Cline / Cursor — Custom "Modes"
**Harness**: Cline, Cursor
**Surface type**: agent mode
**Description**: Modes are presets (system prompt + tool subset + behavior). User toggles "debug mode," "test-writing mode," etc., changing how the agent reasons.
**Reference URL**: https://docs.cline.bot/exploring-clines-tools/plan-and-act
**Innovative aspect**: Coarse but fast UX for "switch the agent's stance," composes with rules and tools.
**Pi mapping idea**: A `pi-modes` extension registers `/mode <name>` swapping system prompt and tool subset. Equivalent power to output styles + tool allowlist scoping.

---

### HC-44: Aider — Edit Format Selection (diff / udiff / whole)
**Harness**: Aider
**Surface type**: model integration
**Description**: Aider picks the optimal edit format per model (search/replace, unified diff, full-file rewrite) — exposed via `--edit-format`.
**Reference URL**: https://aider.chat/docs/more/edit-formats.html
**Innovative aspect**: Recognizes models differ in edit-format reliability; pick what your model does best.
**Pi mapping idea**: Pi's edit/write tools have one shape today. Add a per-provider edit-format hint in `registerProvider` so the bash/edit tool descriptions adapt to model strengths (e.g., GPT-4 Turbo gets udiff, Claude gets search/replace). Could be measured against pi's eval harness.

---

### HC-45: Claude Code — `/compact` with Custom Prompt
**Harness**: Claude Code
**Surface type**: command / context
**Description**: `/compact "preserve the auth refactor decisions"` triggers compaction with a user-specified preservation prompt. User steers what survives.
**Reference URL**: https://docs.claude.com/en/docs/claude-code/manage-costs
**Innovative aspect**: User has explicit control over what compaction prioritizes — not just a black box.
**Pi mapping idea**: Add an arg to pi's `/compact` (and the `compact()` API) — `compactionPrompt: string`. Combine with HC-03 PreCompact hook so extensions can inject preservation rules automatically.

---

## Summary

**Top extension surfaces pi is missing entirely**: blocking PreToolUse hooks, sub-agents/Task tool, output styles, status line, `AGENTS.md` discovery, plugin marketplace bundles, OS-level sandbox modes, context providers, browser tool, structured output schemas, prompt-caching telemetry.

**Pi strengths to preserve**: TypeScript-native (no protocol overhead), TypeBox schemas, in-process tool overrides, registerProvider, mature event bus.

**The strategic question for pi extensions**: replicate via extensions (no core changes) vs admit some surfaces (sub-agents, hooks-with-block) need core support to feel right.
