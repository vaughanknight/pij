# Third-Party Pi Extensions — Survey of the Wider Ecosystem

Survey date: 2026-05-09. Pi version current at time of survey: 0.74.0 (Unreleased adds Together AI provider). The `@mariozechner/*` npm scope is in the process of being renamed to `@earendil-works/*` after Mario Zechner joined Earendil Works in April 2026 (see Finding TP-22). Repository hosting moved from `badlogic/pi-mono` to `earendil-works/pi`. Both scopes still resolve at the time of survey via redirects.

The `pi.dev/packages` catalog reports **2,301 total packages** across npm and git. This survey samples the highest-traffic, most-starred, and most-architecturally-novel ones; it is not exhaustive.

---

## Ecosystem context

- **Official org**: `earendil-works/pi` (47k stars), with sister repos `pi-review` (209), `pi-tutorial` (141), `pi-chat` (216), `gondolin` (1.1k micro-VM sandbox), `absurd` (1.7k durability experiment).
- **Curated awesome list**: `qualisero/awesome-pi-agent` (839 stars) lists ~73 community resources.
- **Topic counts on GitHub** (May 2026): `pi-extension` topic has 218 public repos; `pi-skills` ~6; `pi-agent` 20+. The actual long tail is much larger (see pi.dev catalog count).
- **Hugging Face**: `badlogicgames/pi-mono` dataset — open dataset of redacted pi sessions, with `badlogic/pi-share-hf` tooling for community contributions. There's also `badlogicgames/pi-diff-review` and forks like `invincible-jha/pi-mono`.
- **Discord**: referenced from pi.dev (community-owned, not Earendil property per Zechner's "I've sold out" post).

---

## Findings

### Finding TP-01: pi-subagents (nicopreme)
**Url**: https://www.npmjs.com/package/pi-subagents
**Type**: npm-package
**Author**: nicopreme
**What it does**: Delegates tasks to subagents with chains, parallel execution, and TUI clarification. The most-installed third-party extension on the catalog.
**Extension surfaces used**: `registerTool` (subagent dispatch), `ctx.ui.custom()` for clarification overlays, session persistence.
**Notable techniques**: Chained pipelines (research → plan → implement) using isolated context windows.
**Stars / downloads / freshness**: 65.1K downloads/mo, updated 5d ago.
**Why it matters**: The de-facto sub-agent extension; a baseline anyone building multi-agent workflows on pi will compare against.

### Finding TP-02: context-mode (mksglu)
**Url**: https://www.npmjs.com/package/context-mode
**Type**: npm-package
**Author**: mksglu
**What it does**: MCP plugin that "saves 98% of your context window" — context compression / pruning across 14 platforms.
**Extension surfaces used**: MCP server + pi extension, custom compaction hooks.
**Notable techniques**: Aggressive context pruning to keep more turns in-window.
**Stars / downloads / freshness**: 55.4K downloads/mo, 4d ago. Also tagged `pi-agent` topic with 14k cross-platform stars.
**Why it matters**: Targets one of pi's known weak spots (context management) and is gaining adoption fast.

### Finding TP-03: pi-mcp-adapter (nicopreme)
**Url**: https://www.npmjs.com/package/pi-mcp-adapter
**Type**: npm-package
**Author**: nicopreme
**What it does**: MCP (Model Context Protocol) adapter — exposes MCP servers as pi tools.
**Extension surfaces used**: Custom tool registration (one per MCP tool), provider-style registration of MCP endpoints.
**Notable techniques**: Bridges the entire MCP ecosystem (Anthropic's protocol) into pi's tool surface.
**Stars / downloads / freshness**: 53.4K/mo, 3d ago.
**Why it matters**: Pi has no built-in MCP support (it's intentionally minimal). This is how the community wires up the existing MCP ecosystem.

### Finding TP-04: pi-web-access (nicopreme)
**Url**: https://www.npmjs.com/package/pi-web-access
**Type**: npm-package
**Author**: nicopreme
**What it does**: Web search, URL fetching, GitHub repo cloning, PDF extraction, YouTube video understanding, local video analysis.
**Extension surfaces used**: Multiple `registerTool` calls with prompt snippets.
**Notable techniques**: Bundles many "browse the web" capabilities into one extension; local video analysis is unusual.
**Stars / downloads / freshness**: 29.6K/mo, 6d ago.
**Why it matters**: Demonstrates that single extensions can package broad capability sets (effectively replacing several MCP servers).

### Finding TP-05: @ollama/pi-web-search (jmorgan)
**Url**: https://www.npmjs.com/package/@ollama/pi-web-search
**Type**: npm-package (vendor-published)
**Author**: jmorgan (Ollama)
**What it does**: Web search and fetch tools backed by Ollama's web search/fetch APIs.
**Extension surfaces used**: `registerTool`.
**Notable techniques**: A vendor (Ollama) shipping an official pi extension is signal that the ecosystem is becoming a target for first-party integrations.
**Stars / downloads / freshness**: 26.1K/mo, 1mo ago.
**Why it matters**: Vendor adoption — Ollama treats pi as worth shipping a package for. Also Ollama announced a Pi integration on 2026-02-26.

### Finding TP-06: @plannotator/pi-extension (backnotprop)
**Url**: https://www.npmjs.com/package/@plannotator/pi-extension
**Type**: npm-package
**Author**: backnotprop
**What it does**: Plannotator — interactive plan review with annotations, annotate agent messages, review code/PRs.
**Extension surfaces used**: `registerCommand`, custom TUI overlays, message-level annotation hooks.
**Notable techniques**: User-in-the-loop plan annotation that survives compaction.
**Stars / downloads / freshness**: 20.7K/mo, 18h ago — extremely active.
**Why it matters**: Most-developed answer to "how do I keep humans steering the agent on long tasks." Pairs with `ndom91/open-plan-annotator` (47 stars).

### Finding TP-07: pi-lens (apmantza)
**Url**: https://www.npmjs.com/package/pi-lens (also github.com/apmantza/pi-lens)
**Type**: npm-package
**Author**: apmantza
**What it does**: Real-time code feedback via LSP, linters, formatters, type-checking, structural analysis, "booboo" detection.
**Extension surfaces used**: `registerTool`, `tool_call` interception (post-write feedback), prompt-snippet injection.
**Notable techniques**: Wires editor-grade signals (LSP) directly into the agent loop so the model sees lint/type errors immediately after a write.
**Stars / downloads / freshness**: 13.2K/mo, 12h ago.
**Why it matters**: Closes the loop pi famously leaves open (no built-in LSP). One of the strongest "fix what pi deliberately omits" examples.

### Finding TP-08: @juicesharp/rpiv-pi (juicesharp)
**Url**: https://pi.dev/packages/@juicesharp/rpiv-pi
**Type**: npm-package (suite)
**Author**: juicesharp
**What it does**: Skill-based development workflow — five skills (research, design, plan, implement, validate) plus a "ship loop" with named subagents and shared lifecycle hooks. Suite includes companion packages: rpiv-todo (live overlay), rpiv-advisor (second-opinion model), rpiv-ask-user-question (typed questionnaires), rpiv-web-tools (Brave search), rpiv-btw (side-question slash command), rpiv-args (shell-style $1/$ARGUMENTS placeholders).
**Extension surfaces used**: Multiple extensions + skills + subagents + shared event bus + `session_start` lifecycle hooks.
**Notable techniques**: A composed workflow product split across 7+ npm packages with an enforced peer-dependency graph (requires `@tintinweb/pi-subagents`).
**Stars / downloads / freshness**: ~8-11K/mo per package, all updated 5h ago.
**Why it matters**: Most-mature example of someone building a "product" on top of pi using the package system as a multi-extension installer. Demonstrates inter-extension dependency.

### Finding TP-09: pi-doom (badlogic)
**Url**: https://github.com/badlogic/pi-doom
**Type**: github-repo
**Author**: Mario Zechner (badlogic)
**What it does**: Plays DOOM in a pi terminal overlay at 35 FPS using doomgeneric WASM, half-block (▀) characters with 24-bit color.
**Extension surfaces used**: `ctx.ui.custom()` overlays, kitty keyboard protocol input, async render loop.
**Notable techniques**: Proof that the TUI can host real-time interactive applications — the "if pi can run DOOM, your agent UI can do anything" demo.
**Stars / downloads / freshness**: Maintained by the project author; referenced from the official README.
**Why it matters**: Calibrates how much UI ambition the extension surface actually supports.

### Finding TP-10: pi-listen (codexstar69)
**Url**: https://github.com/codexstar69/pi-listen
**Type**: github-repo (npm: @codexstar/pi-listen)
**Author**: baanditeagle (codexstar69)
**What it does**: Hold-to-talk voice input — Deepgram streaming STT (cloud, 56 languages) or local sherpa-onnx ONNX models (19 models, 43MB-1.8GB).
**Extension surfaces used**: `registerShortcut` (spacebar), custom TUI panel (`/voice-settings`), input pipeline replacement.
**Notable techniques**: Pre-roll/tail-roll buffer to avoid clipped words; both cloud and offline backends.
**Stars / downloads / freshness**: 53 stars, v5.0.0 March 16 2026.
**Why it matters**: Shows pi's input pipeline can be hijacked for non-keyboard modalities. Reference for any ambient/voice extension.

### Finding TP-11: pi-phone (MaliNamNam)
**Url**: https://github.com/MaliNamNam/pi-phone
**Type**: github-repo
**Author**: MaliNamNam
**What it does**: Phone-first remote UI — local web server mirrors live pi CLI session over WebSocket to a mobile web app; spawns child `pi --mode rpc` sessions for phone-side parallel work.
**Extension surfaces used**: `pi --mode rpc` JSON protocol, session tree introspection, image upload tokens, Tailscale Serve integration.
**Notable techniques**: Single-ownership write model between CLI and phone; uses pi's RPC mode (not SDK) as a remoting transport.
**Stars / downloads / freshness**: 44 stars, ~13 commits, active.
**Why it matters**: Reference design for any remote-control or mobile companion to pi. Validates RPC mode as production-suitable.

### Finding TP-12: pi-ios (dannote)
**Url**: https://github.com/dannote/pi-ios
**Type**: github-repo
**Author**: dannote
**What it does**: Native iOS app running pi locally — Swift/SwiftUI shell, custom Bun port using JavaScriptCore C_LOOP interpreter (no JIT), Ghostty terminal with Metal rendering, manual termio backend.
**Extension surfaces used**: SDK mode (embeds the agent JS bundle); App Store-compliant.
**Notable techniques**: ~600ms cold start, 10x slower than JIT but works under iOS sandboxing rules. Ships pi as a native mobile app.
**Stars / downloads / freshness**: 23 stars, 37 commits.
**Why it matters**: Demonstrates pi is portable enough to run inside heavily-restricted runtimes; a model for Android, embedded, or sandboxed deployments.

### Finding TP-13: pi-elixir (dannote)
**Url**: https://github.com/dannote/pi-elixir
**Type**: github-repo
**Author**: dannote
**What it does**: BEAM/Elixir live introspection — auto-detects Tidewave (localhost 4000-4009), exposes 13 tools: `elixir_eval`, `elixir_docs`, `elixir_source`, `elixir_sql`, `elixir_logs`, `elixir_top`, `elixir_process_info`, `elixir_sup_tree`, `elixir_types`, `elixir_deps_tree`, `elixir_schemas`, `elixir_hex_search`.
**Extension surfaces used**: 13× `registerTool`, prompt-snippet additions for each.
**Notable techniques**: First-class language-runtime integration (the agent can poke at a *running* app, not just files).
**Stars / downloads / freshness**: 69 stars, v0.2.0 Feb 2026.
**Why it matters**: Best example of language-specific deep integration. A template for Ruby/Rails, Python/Django, .NET, etc.

### Finding TP-14: PiSwarm (lsj5031)
**Url**: https://github.com/lsj5031/PiSwarm
**Type**: github-repo (shell)
**Author**: lsj5031
**What it does**: Hierarchical orchestrator — Commander → Captain → swarm.sh runs parallel pi instances in isolated git worktrees, one per issue/PR, with dependency-aware wave execution.
**Extension surfaces used**: `pi --mode json` for structured monitoring; not a pi extension itself but uses pi's JSON output protocol.
**Notable techniques**: External orchestrator rather than in-process subagent; resume/retry/lockfile/quota-aware.
**Stars / downloads / freshness**: 9 stars, 13 commits.
**Why it matters**: Reference for "Devin-style" parallel agent orchestration on top of pi using JSON mode. Pairs with `patleeman/task-factory` (queue-first orchestrator).

### Finding TP-15: pi-supervisor (tintinweb)
**Url**: https://github.com/tintinweb/pi-supervisor
**Type**: github-repo (npm: pi-supervisor)
**Author**: tintinweb
**What it does**: A second LLM watches the main agent; after each turn it decides Continue/Steer/Done and injects guidance "as the user" when the agent drifts. `/supervise <outcome>` sets the goal.
**Extension surfaces used**: `turn_end` event, `before_provider_request` for steering injection, optional `SUPERVISOR.md`.
**Notable techniques**: Independent observer LLM session; sensitivity-tunable check intervals (low/med/high). Doesn't touch system prompt.
**Stars / downloads / freshness**: 42 stars, v0.4.3 May 2026.
**Why it matters**: A novel "model-as-conscience" pattern — useful research target for steerability and agent reliability.

### Finding TP-16: pi-gitnexus (tintinweb)
**Url**: https://github.com/tintinweb/pi-gitnexus
**Type**: github-repo
**Author**: tintinweb
**What it does**: Auto-augments grep/find/bash/read tool *results* with execution-flow / caller-callee / related-symbol context from a GitNexus knowledge graph. Also exposes 7 explicit graph tools (impact analysis, blast radius, coordinated refactor).
**Extension surfaces used**: `tool_call` post-processing (result rewriting), 7× `registerTool`, stdio bridge to GitNexus.
**Notable techniques**: Inline context augmentation — every search becomes a graph query. Offline-only.
**Stars / downloads / freshness**: 105 stars, May 8 2026.
**Why it matters**: Shows the *result-mutation* hook is powerful enough to layer code-graph reasoning across all built-in tools without registering new ones.

### Finding TP-17: pi-tool-display (MasuRii)
**Url**: https://github.com/MasuRii/pi-tool-display
**Type**: github-repo
**Author**: MasuRii
**What it does**: Compact tool-call rendering, adaptive split/unified diff visualization, syntax highlighting, three render profiles (opencode/balanced/verbose), MCP-aware rendering modes.
**Extension surfaces used**: Custom rendering API for built-in tools (read/grep/find/ls/bash/edit/write), interactive settings modal.
**Notable techniques**: Demonstrates how to fully restyle pi's TUI without forking — a community alternative to the default chrome.
**Stars / downloads / freshness**: 137 stars (highest in `pi-extension` topic), v0.3.6 May 4 2026.
**Why it matters**: Most-popular pure-UX extension. Reference for re-skinning pi.

### Finding TP-18: pi-rewind (arpagon) + pi-rewind-hook (nicobailon)
**Url**: https://github.com/arpagon/pi-rewind ; https://github.com/nicobailon/pi-rewind-hook
**Type**: github-repo (two related)
**Author**: arpagon / nicobailon
**What it does**: Per-turn checkpoint snapshots with diff preview and a redo stack; git-based session branching.
**Extension surfaces used**: `turn_start`/`turn_end`, `ctx.fork()` (added in 0.68 to support exactly this), session-tree integration.
**Notable techniques**: Time-travel debugging for agent sessions. Mirrors `examples/extensions/git-checkpoint.ts` but ships full UI.
**Stars / downloads / freshness**: pi-rewind 53 stars (Mar 2026); pi-rewind-hook actively maintained.
**Why it matters**: Pi's `ctx.fork(position: "before"|"at")` was added by mitsuhiko (PR #3431) specifically to enable this class of extension — early example of community demand driving core API.

### Finding TP-19: pi-messenger-bridge (tintinweb) + whatsapp-pi (castelloes) + @llblab/pi-telegram (llblab)
**Url**: https://github.com/tintinweb/pi-messenger-bridge ; whatsapp-pi/llblab on npm
**Type**: github-repo + npm packages
**Author**: tintinweb / castelloes / llblab
**What it does**: Bridge pi to Telegram, WhatsApp, Slack, Discord, Signal, iMessage so the agent is reachable from chat.
**Extension surfaces used**: `pi --mode rpc`, custom event handlers, attachment passthrough.
**Notable techniques**: pi-messenger-bridge unifies multiple platforms; pi-telegram and whatsapp-pi each focus on one.
**Stars / downloads / freshness**: pi-messenger-bridge 33 stars (Mar 2026); whatsapp-pi 5.3K/mo; pi-telegram 4.5K/mo (13h ago).
**Why it matters**: Chat is the dominant deployment model for "always-on" pi. Compare with `earendil-works/pi-chat` (official, sandboxed via Gondolin) — a hint Earendil sees this as core, not third-party.

### Finding TP-20: pi-lens companion category — @samfp/pi-memory + jayzeng/pi-memory
**Url**: npm `@samfp/pi-memory` ; https://github.com/jayzeng/pi-memory
**Type**: npm-package + github-repo
**Author**: samfp / jayzeng
**What it does**: Persistent memory across sessions — learns corrections, preferences, patterns; daily logs, scratchpad, semantic search.
**Extension surfaces used**: `session_start`/`session_end`, `pi.appendEntry()` for cross-session state, prompt snippet injection.
**Notable techniques**: Two independent implementations of "memory" — community is converging on this need (analogue to Cursor/Cline rules).
**Stars / downloads / freshness**: @samfp/pi-memory 8K/mo; jayzeng/pi-memory 47 stars.
**Why it matters**: Memory is the second most-requested gap (after MCP). Shows multiple competing approaches.

### Finding TP-21: pi-schedule-prompt / pi's heartbeat (tintinweb)
**Url**: https://github.com/tintinweb/pi-schedule-prompt
**Type**: github-repo (npm: pi-schedule-prompt)
**Author**: tintinweb
**What it does**: Cron-like scheduler for recurring and one-shot agent prompts (heartbeat).
**Extension surfaces used**: `registerCommand`, `appendEntry` for persistence, background timers, prompt injection on fire.
**Notable techniques**: Turns pi into an autonomous polling agent without external orchestration.
**Stars / downloads / freshness**: 45 stars, 5K/mo, May 3 2026.
**Why it matters**: Foundation for autonomous-loop deployments where pi isn't just interactive.

### Finding TP-22: glimpseui (haza) + pi-canvas (jyaunches) + VVander/pi-gui + Graffioh/pi-sketch
**Url**: npm `glimpseui` ; https://github.com/jyaunches/pi-canvas ; etc.
**Type**: npm-package + github-repos
**Author**: haza / jyaunches / VVander / Graffioh
**What it does**: Native WebView windows with bidirectional JSON communication (glimpseui), interactive TUI canvases inline (pi-canvas), full GUI shell (pi-gui), browser-based sketch pad input (pi-sketch).
**Extension surfaces used**: `ctx.ui.custom()` overlays, external WebView processes, RPC bridges.
**Notable techniques**: Move beyond TUI — embed real UI surfaces (web, native) inside or alongside pi.
**Stars / downloads / freshness**: glimpseui 7.9K/mo; others 40-95 stars.
**Why it matters**: Shows the upper bound of UI ambition; counterpart to pi-doom from a different angle.

### Finding TP-23: pi-mermaid (gurpartap) + pi-markdown-preview (omacl) + pi-k-excalidraw (kostyay)
**Url**: npm packages + https://github.com/kostyay/pi-k-excalidraw
**Type**: npm-package + github-repo
**Author**: gurpartap / omacl / kostyay
**What it does**: Diagram and rich-content rendering — Mermaid as ASCII in TUI, Markdown+LaTeX preview (terminal/browser/PDF), native Excalidraw with live webview.
**Extension surfaces used**: Custom rendering, external preview process, file-watch triggers.
**Notable techniques**: Brings "thinking-in-diagrams" workflows into a terminal agent.
**Stars / downloads / freshness**: pi-mermaid 5.1K/mo; pi-markdown-preview 11.9K/mo; pi-k-excalidraw 61 stars (May 3 2026).
**Why it matters**: Counterargument to "pi is just a CLI" — visual artifacts are first-class.

### Finding TP-24: pi-permission-system (MasuRii / @gotgenes/pi-permission-system) + permission-gate examples
**Url**: https://github.com/MasuRii/pi-permission-system ; npm `@gotgenes/pi-permission-system`
**Type**: github-repo + npm package
**Author**: MasuRii / gotgenes
**What it does**: Permission enforcement / access control for tool calls; competes with `examples/extensions/permission-gate.ts`.
**Extension surfaces used**: `tool_call` interception (block/modify), `ctx.ui.confirm()`, project-local rules.
**Notable techniques**: Two independent productions of pi's "ask before dangerous bash" example into hardened, configurable extensions.
**Stars / downloads / freshness**: pi-permission-system 43 stars (May 4); @gotgenes 5.5K/mo.
**Why it matters**: Safety/sandboxing is the most-shipped category — many users distrust default tool permissions.

### Finding TP-25: pi-listen + agent-browser-native + pi-docparser + pi-smart-fetch
**Url**: respective github/npm
**Type**: npm packages
**Author**: codexstar69 / fitchmultz / maxedapps / thinkscape
**What it does**: New tool surfaces — voice (pi-listen), browser automation (pi-agent-browser-native, 4.4K/mo), PDF/Office/spreadsheet parsing (pi-docparser, 5K/mo), TLS-impersonating fetch with defuddle extraction (pi-smart-fetch, 7.3K/mo).
**Extension surfaces used**: Mostly `registerTool` plus prompt snippets.
**Notable techniques**: Each replaces a class of MCP servers with a focused, pi-native single-package install.
**Stars / downloads / freshness**: All updated within last week, mid-thousands monthly.
**Why it matters**: Shows where capability gaps still exist; gives a buyer's guide to "things pi isn't shipping built-in."

### Finding TP-26: pi-depo (fulgidus) + pi-agent-config + @astrofoundry/pi-astro + ben-vargas/pi-packages
**Url**: npm `pi-depo`, `pi-agent-config`, `@astrofoundry/pi-astro`; https://github.com/ben-vargas/pi-packages
**Type**: npm-package + github-repo
**Author**: fulgidus / vtemian / astronaute / ben-vargas
**What it does**: Meta-packaging — declarative package managers ("pi-depo: skills, extensions, hooks, MCP servers"), and curated personal-config bundles that install many extensions+skills+prompts+themes at once.
**Extension surfaces used**: pi packages (npm/git), pi-manifest extension/skills/prompts/themes lists.
**Notable techniques**: Treat pi configuration as code; reproducible setups.
**Stars / downloads / freshness**: pi-depo 5.3K/mo; pi-packages 73 stars.
**Why it matters**: An emergent layer above the package system itself — declarative environment management.

### Finding TP-27: tintinweb/vscode-pi-model-chat-provider
**Url**: https://marketplace.visualstudio.com/items?itemName=tintinweb.vscode-pi-model-chat-provider
**Type**: vscode-extension
**Author**: tintinweb
**What it does**: VS Code Language Model Chat Provider that exposes Pi's models in VS Code's `vscode.lm.*` API so GitHub Copilot Chat (and any extension consuming the LM API) can use pi's configured providers.
**Extension surfaces used**: pi CLI as a backend; uses pi's `/login`-stored credentials.
**Notable techniques**: pi-as-provider — turns pi into a model-routing daemon for IDEs.
**Stars / downloads / freshness**: Updated 2026-05-08.
**Why it matters**: Demonstrates pi can be the *hub* for credentials/providers used by other tools, not just an end-user agent.

### Finding TP-28: piclaw (rcarmo)
**Url**: https://github.com/rcarmo/piclaw
**Type**: github-repo (Docker image)
**Author**: rcarmo
**What it does**: Self-hosted single-user AI workspace built on pi — chat, code editor, terminal, file management, Office/PDF viewers, VNC, browser automation via MCP, encrypted credential storage. Containerized.
**Extension surfaces used**: SDK mode (embeds pi), full extension stack, MCP integration.
**Notable techniques**: pi as the engine for an entire web app, not just a CLI.
**Stars / downloads / freshness**: 640 stars, v2.3.2 May 8 2026, 15 releases.
**Why it matters**: Most-built-out "pi-as-app" reference. Pairs with `lukehinds/nono` (kernel-enforced sandbox) and `earendil-works/gondolin` (microvm) as the deployment pyramid.

### Finding TP-29: openclaw (Armin Ronacher / Sentry)
**Url**: https://github.com/openclaw/openclaw ; https://lucumr.pocoo.org/2026/1/31/pi/
**Type**: github-repo
**Author**: Armin Ronacher (Earendil founder) and others
**What it does**: Personal multi-channel AI assistant — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams + 15 others, voice (wake words on macOS/iOS, continuous on Android), Live Canvas UI, companion apps for macOS/iOS/Android, sandboxing for group/channel contexts.
**Extension surfaces used**: pi as an SDK (per Ronacher's blog: "Pi is a collection of little components that you can build your own agent on top. That's how OpenClaw is built"); uses `mcporter` for MCP rather than extending pi directly.
**Notable techniques**: Treats pi as the kernel; OpenClaw is the userspace. The reference flagship "pi as SDK" deployment.
**Stars / downloads / freshness**: Reported as 370k stars / 76.3k forks / 43k commits — note: that figure looks inflated; likely a fetch-time number from a search aggregator. The repo is the key real-world SDK consumer cited in pi-mono's official README.
**Why it matters**: Earendil's flagship pi consumer. Drives the SDK API. The reason `createAgentSession` and `ResourceLoader` exist as public surfaces.

### Finding TP-30: badlogicgames/pi-mono (Hugging Face dataset) + pi-share-hf
**Url**: https://huggingface.co/datasets/badlogicgames/pi-mono ; https://github.com/badlogic/pi-share-hf
**Type**: dataset + tool
**Author**: badlogic
**What it does**: Public, redacted pi session traces from Mario's own work on pi-mono. `pi-share-hf` does deterministic-secret-redaction + LLM-review then uploads. Christine Yip (`christinetyip`) turned this into a *skill* so agents can auto-share/learn from the dataset (collective intelligence).
**Extension surfaces used**: Skill that uses session export tooling; not an extension.
**Notable techniques**: Open-traces movement — pi sessions are JSONL with tree-structured ids/parent_ids, supporting branches.
**Stars / downloads / freshness**: Active dataset, multiple forks (e.g. `invincible-jha/pi-mono`).
**Why it matters**: Eval and post-training data for community models. Aligns with Earendil's emphasis on open weights / open agents (vLLM pods are in the pi monorepo).

### Finding TP-31: pi-cost-dashboard / splitrail / steipete/CodexBar / marckrenn/pi-sub
**Url**: https://github.com/mrexodia/pi-cost-dashboard ; https://github.com/Piebald-AI/splitrail ; https://github.com/steipete/CodexBar ; https://github.com/marckrenn/pi-sub
**Type**: github-repos
**Author**: mrexodia / Piebald-AI / steipete / marckrenn
**What it does**: Cost/usage tracking — web dashboard, real-time multi-agent tracker (177 stars), macOS menubar app, monorepo with shared usage core.
**Extension surfaces used**: pi event hooks for cost data, JSON-mode export, in some cases pi's session JSONL files.
**Notable techniques**: Out-of-process observability instead of in-extension.
**Stars / downloads / freshness**: splitrail 177 stars; rest small but active.
**Why it matters**: Cost is a recurring concern; the "watch from outside" pattern is a useful alternative to in-extension instrumentation.

### Finding TP-32: pi-superpowers / pi-superpowers-plus / fgladisch/pi-skills / kostyay/agent-stuff / butttons/pi-kit
**Url**: https://github.com/coctostan/pi-superpowers ; https://github.com/coctostan/pi-superpowers-plus ; https://github.com/fgladisch/pi-skills ; https://github.com/kostyay/agent-stuff ; https://github.com/butttons/pi-kit
**Type**: github-repos
**Author**: coctostan / fgladisch / kostyay / butttons
**What it does**: Skill libraries — many users porting Anthropic's Superpowers skill collection to pi (fgladisch explicitly says "mostly adapted from Superpowers"); kostyay has TUI tools+code review+planning; pi-superpowers ecosystem at 79+44 stars.
**Extension surfaces used**: pi skills (markdown + frontmatter + assets), prompt templates, themes — not extensions per se.
**Notable techniques**: Cross-pollination from the Claude Code skill ecosystem.
**Stars / downloads / freshness**: pi-superpowers 44 stars (Mar 5 2026).
**Why it matters**: Skills are a major surface alongside extensions. The community is reusing prior-art from Anthropic's Superpowers and porting it.

### Finding TP-33: jmcombs/pi-extensions (Tavily search, prompt enhancer) + jonas-merkle/aliou/many others
**Url**: https://github.com/jmcombs/pi-extensions ; https://github.com/aliou/pi-extensions ; https://github.com/tmustier/pi-extensions
**Type**: github-repos
**Author**: jmcombs / aliou / tmustier
**What it does**: Personal extension monorepos — typically 2-5 extensions covering bespoke needs. tmustier's `pi-agent-teams` (65 stars) experiments with agent swarms; aliou's `pi-synthetic` adds Synthetic provider; jmcombs ships Tavily search and prompt enhancer; @aliou/pi-processes (8K/mo) handles process management.
**Extension surfaces used**: Wide variety — `registerTool`, `registerCommand`, custom providers, project-config integration.
**Notable techniques**: Strict CI (Release Please, lint/test/audit) — these aren't toys.
**Stars / downloads / freshness**: jmcombs 0 stars but 9 releases (May 8); tmustier 65 stars.
**Why it matters**: Snapshot of the "everyone has a personal pi-extensions repo" pattern, parallel to dotfiles.

### Finding TP-34: Earendil sister projects — gondolin (sandbox) + nono (Lukehinds, kernel-enforced) + lima
**Url**: https://github.com/earendil-works/gondolin ; https://github.com/lukehinds/nono ; https://github.com/lima-vm/lima
**Type**: github-repos
**Author**: earendil-works / lukehinds / lima maintainers
**What it does**: Sandbox infrastructure — Gondolin is Earendil's TypeScript-control-plane Linux microVM (1.1k stars) used by `pi-chat` to isolate per-channel sessions. nono uses Landlock/Seatbelt for kernel-level capability sandboxing. Lima is a generic Linux microVM tool the awesome list points at.
**Extension surfaces used**: `examples/extensions/sandbox/` ships with pi-mono using `@anthropic-ai/sandbox-runtime`; these are *alternatives* to that.
**Notable techniques**: Pi assumes you'll bring your own sandbox; this is the menu.
**Stars / downloads / freshness**: Gondolin 1.1k, May 8; nono active.
**Why it matters**: For our research on extension safety, these are the canonical isolation primitives the community has converged on.

### Finding TP-35: pi-rose-pine + pi-ds + ogulcancelik/pi-ghostty-theme-sync + ferologics/pi-system-theme
**Url**: https://github.com/zenobi-us/pi-rose-pine ; https://github.com/zenobi-us/pi-ds ; ogulcancelik/pi-ghostty-theme-sync
**Type**: github-repos
**Author**: zenobi-us / ogulcancelik / ferologics
**What it does**: Theming and design-system surface — Rose Pine variants, a TUI design system reusable across extensions, terminal-theme syncing (Ghostty, macOS dark/light).
**Extension surfaces used**: pi themes; extensions that consume theme events.
**Notable techniques**: pi-ds is unusual — a *library* for other extensions to share visual vocabulary.
**Stars / downloads / freshness**: Modest; active.
**Why it matters**: Theming is a real surface; pi-ds suggests an emerging "framework for extensions."

### Finding TP-36: pi-tutorial (earendil-works) + pi-prompt-suggester (guwidoe)
**Url**: https://github.com/earendil-works/pi-tutorial ; https://github.com/guwidoe/pi-prompt-suggester
**Type**: github-repos
**Author**: earendil-works / guwidoe
**What it does**: Onboarding/learning — pi-tutorial is an experimental tutorial mode (141 stars); pi-prompt-suggester suggests likely-next user prompts (44 stars).
**Extension surfaces used**: Custom commands, conversation-state inspection, predictive UI overlays.
**Notable techniques**: Both close the new-user-discoverability gap pi has by design.
**Stars / downloads / freshness**: Both fresh (May 2026).
**Why it matters**: Early signal that pi cares about onboarding — relevant context for any extension that wants to be discoverable.

### Finding TP-37: kcosr/pi-extensions (tool auditing) + qualisero/pi-agent-scip
**Url**: https://github.com/kcosr/pi-extensions ; https://github.com/qualisero/pi-agent-scip
**Type**: github-repos
**Author**: kcosr / qualisero
**What it does**: kcosr ships a tool-auditing system (logs/reviews tool calls); qualisero ships SCIP code-intelligence tooling (Sourcegraph's index format).
**Extension surfaces used**: `tool_call` event interception (audit), `registerTool` (SCIP queries).
**Notable techniques**: SCIP is the third "code graph" approach (alongside pi-gitnexus and codemap) — community is iterating on this category.
**Stars / downloads / freshness**: Low stars, active.
**Why it matters**: For our research: at least three competing "code-graph" extensions (gitnexus, scip, codemap) — none has won, opportunity exists.

---

## Negative findings / gaps

- **The `@earendil-works` npm scope is brand-new (April 2026)**. Most packages still publish under `@mariozechner/*` or unscoped names; the scope migration is in progress (changelog 0.73.1 added `pi update --self` support for renaming). At survey time, only the four core packages are confirmed in `@earendil-works/*`: `pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`, plus `pi-web-ui`.
- **No third-party Linear/Jira/GitHub-Issues integrations stand out** in the catalog beyond GitHub PR review (pi-review official) and PiSwarm (issue worktree orchestrator). This is a clear gap.
- **No widely-adopted eval harness for pi** specifically, though the pi-mono Hugging Face dataset enables one. Would-be builders should look at SWE-bench harnesses adapted to pi's session JSONL format.
- **Few production-grade compaction extensions.** `examples/extensions/custom-compaction.ts` and `trigger-compact.ts` exist in-tree; `context-mode` (TP-02) and `pi-dcp` are the main third-party plays. Community has not converged.
- **No standout IDE bridges** other than tintinweb's VS Code provider (TP-27). No JetBrains, Neovim plugin (despite obvious fit), or Cursor integration discovered.
- **The ecosystem skews "single-author hobby projects"**: of ~218 `pi-extension`-tagged repos, only ~30 have >40 stars. Median repo is one author, <100 commits. Compare: this is more nascent than the Claude Code skills ecosystem but moves fast (most repos updated within 2 weeks).
- **License diversity is healthy** — most extensions are MIT; pi itself is MIT. The "Fair Source" tier Zechner outlined applies to Earendil's commercial value-adds, not the core.

---

## Sources

Primary:
- https://github.com/earendil-works/pi (the canonical repo)
- https://github.com/badlogic/pi-mono (legacy redirect target)
- https://pi.dev/packages (catalog: 2,301 packages)
- https://github.com/qualisero/awesome-pi-agent (curated list, 839 stars)
- https://mariozechner.at/posts/2026-04-08-ive-sold-out/ (acquisition context)
- https://lucumr.pocoo.org/2026/1/31/pi/ (Armin Ronacher on pi as SDK)
- pi-mono `packages/coding-agent/CHANGELOG.md` (extension API additions ~0.59-0.74)
- https://huggingface.co/datasets/badlogicgames/pi-mono (open session traces)

Topic indexes used:
- https://github.com/topics/pi-extension (218 repos)
- https://github.com/topics/pi-skills
- https://github.com/topics/pi-agent
- https://github.com/orgs/earendil-works/repositories

Twitter/X: @badlogicgames thread history covering Hugging Face traces, pi-doom, skills support, NPM extension migration (v0.35), Windows/Git Bash, and Ollama integration (Feb 2026).
