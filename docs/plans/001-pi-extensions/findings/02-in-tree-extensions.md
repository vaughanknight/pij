# In-Tree Pi Extensions: Real Examples Catalog

## Overview
This document catalogs real, working extension examples shipped in the pi-mono repository. Each finding demonstrates a specific extension capability, API pattern, or integration technique. Extensions range from simple tools (10 lines) to complex providers with OAuth and sandboxing (600+ lines).

---

## BE-01: Hello Tool (Minimal Tool Registration)

**What it does**
Simplest extension possible: registers a single greeting tool via `pi.registerTool()`. Demonstrates the minimal boilerplate needed to expose a custom callable interface to the agent.

**APIs called**
- `pi.registerTool()` at `/Users/jordanknight/pi-hacking/pi-mono/packages/coding-agent/examples/extensions/hello.ts:24`
- Tool schema via `Type.Object()` from `@earendil-works/pi-ai`

**Notable techniques**
- TypeBox schema for parameter validation (`Type.Object({ name: Type.String() })`)
- Tool returns structured result with `content` and `details` keys
- No UI interaction, no hooks, no custom events

**Code anatomy** (key snippet, 12 lines)
```typescript
const helloTool = defineTool({
  name: "hello",
  label: "Hello",
  description: "A simple greeting tool",
  parameters: Type.Object({
    name: Type.String({ description: "Name to greet" }),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { greeted: params.name },
    };
  },
});
```

**Copy-paste starter**
Start here if you're adding a simple tool. Use `defineTool()` helper, define shape with TypeBox, implement `execute()` returning `{ content, details }`.

---

## BE-02: Commands Extension (Command List & Metadata API)

**What it does**
Registers `/commands` slash command that inspects all available commands (from extensions, prompts, skills) and displays them filterable. Demonstrates introspection of the session state.

**APIs called**
- `pi.registerCommand()` at line 16
- `pi.getCommands()` at line 24 — retrieves all `SlashCommandInfo` objects
- `ctx.ui.select()` at line 57 — interactive selection UI
- `ctx.ui.confirm()` at line 64 — yes/no dialog

**Notable techniques**
- Argument completion via `getArgumentCompletions()` hook
- In-session filtering by source (extension/prompt/skill)
- Access to command metadata (path, source, description)
- Chained UI prompts (select → optional confirm)

**Code anatomy** (key snippet, 15 lines)
```typescript
pi.registerCommand("commands", {
  description: "List available slash commands",
  getArgumentCompletions: (prefix) => {
    const sources = ["extension", "prompt", "skill"];
    const filtered = sources.filter((s) => s.startsWith(prefix));
    return filtered.length > 0 ? filtered.map((s) => ({ value: s, label: s })) : null;
  },
  handler: async (args, ctx) => {
    const commands = pi.getCommands();
    const filtered = sourceFilter ? commands.filter((c) => c.source === sourceFilter) : commands;
    // ... build selection UI and show
  },
});
```

**Copy-paste starter**
Build introspection tools or system commands that need to list/filter session state. Use `pi.getCommands()`, `pi.getAllTools()`, session manager APIs.

---

## BE-03: TPS (Tokens Per Second) Monitor

**What it does**
Reads token usage from agent completion events and calculates tokens-per-second throughput. Reports cache hit/write stats and elapsed time. Demonstrates event-driven monitoring.

**APIs called**
- `pi.on("agent_start")` at line 13 — session lifecycle hook
- `pi.on("agent_end", (event, ctx))` at line 17 — receives completion messages with usage stats
- `ctx.ui.notify()` at line 45 — fire-and-forget notification
- `AssistantMessage` type with `usage.cacheRead`, `usage.cacheWrite` fields

**Notable techniques**
- Type guard for discriminating assistant messages: `role === "assistant"`
- Accumulates tokens across multiple messages (loop at line 31)
- Calculates derived metrics (TPS = output / elapsed seconds)
- Silently returns if no UI available (lines 18–19)

**Code anatomy** (key snippet, 15 lines)
```typescript
pi.on("agent_end", (event, ctx) => {
  if (!ctx.hasUI) return;
  const elapsedMs = Date.now() - agentStartMs;
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const message of event.messages) {
    if (!isAssistantMessage(message)) continue;
    input += message.usage.input || 0;
    output += message.usage.output || 0;
    cacheRead += message.usage.cacheRead || 0;
    cacheWrite += message.usage.cacheWrite || 0;
  }
  const tokensPerSecond = output / (elapsedMs / 1000);
  ctx.ui.notify(`TPS ${tokensPerSecond.toFixed(1)} tok/s...`, "info");
});
```

**Copy-paste starter**
Monitor agent behavior or collect metrics. Hook into `agent_start` / `agent_end` events, read `message.usage`, emit notifications.

---

## BE-04: TUI Custom Component (UI Widget)

**What it does**
Registers a custom TUI widget (redraws extension) that reports full-redraw statistics via `/tui` command. Shows how to render custom UI elements and integrate with the theme system.

**APIs called**
- `pi.registerCommand("tui")` at line 11
- `ctx.ui.custom<T>()` at line 16 — render custom TUI component, receive TUI/theme/keybindings
- `tui.fullRedraws` at line 17 — internal stat from TUI instance
- `ctx.ui.notify()` at line 21 — display result

**Notable techniques**
- Custom lambda component: `(tui, _theme, _keybindings, done) => { ... done(result) }`
- Returns `Text("")` as dummy render (UI handled outside custom)
- Access to low-level TUI state (redraw counter) for debugging/profiling
- Theme integration but minimal use here

**Code anatomy** (key snippet, 10 lines)
```typescript
pi.registerCommand("tui", {
  description: "Show TUI stats",
  handler: async (_args, ctx) => {
    if (!ctx.hasUI) return;
    let redraws = 0;
    await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
      redraws = tui.fullRedraws;
      done(undefined);
      return new Text("", 0, 0);
    });
    ctx.ui.notify(`TUI full redraws: ${redraws}`, "info");
  },
});
```

**Copy-paste starter**
Access TUI internals or collect render stats. Use `ctx.ui.custom()` to capture `tui` instance, read properties, call `done()` to exit.

---

## BE-05: Prompt URL Widget (Session Name & GitHub Integration)

**What it does**
Detects GitHub PR/issue URLs in the initial user prompt. Fetches metadata via `gh` CLI, displays a custom widget showing PR title and author, and auto-sets the session name. Demonstrates prompt parsing, external CLI calls, and dynamic widget updates.

**APIs called**
- `pi.on("before_agent_start", (event, ctx))` at line 94 — before first agent run
- `pi.exec("gh")` at line 43 — spawn git-hub CLI, returns `{ code, stdout }`
- `ctx.ui.setWidget()` at line 63 — register named widget component
- `pi.setSessionName()` and `pi.getSessionName()` at lines 86, 84
- `ctx.sessionManager.getEntries()` at line 129 — read session history
- `DynamicBorder` TUI component at line 73

**Notable techniques**
- Regex pattern matching on prompt text (lines 4–5)
- Lazy async metadata fetch with promise handling (lines 103–108)
- Widget update pattern: set placeholder, then update with fetched data
- Session branch navigation awareness (lines 111–158)
- Fallback to session history if current branch has no matching prompt

**Code anatomy** (key snippet, 20 lines)
```typescript
pi.on("before_agent_start", async (event, ctx) => {
  const match = extractPromptMatch(event.prompt);
  if (!match) return;
  
  setWidget(ctx, match);  // Placeholder
  applySessionName(ctx, match);
  
  // Lazy load metadata
  void fetchGhMetadata(pi, match.kind, match.url).then((meta) => {
    const title = meta?.title?.trim();
    const authorText = formatAuthor(meta?.author);
    setWidget(ctx, match, title, authorText);  // Update with real data
    applySessionName(ctx, match, title);
  });
});
```

**Copy-paste starter**
Build context-aware extensions that parse prompts, fetch external data, and display in widgets. Pattern: hook → parse → set placeholder → async fetch → update widget.

---

## BE-06: With Dependencies (npm Package Inclusion)

**What it does**
Extension with its own `package.json` declaring npm dependencies (e.g., `ms` for parsing durations). Registers a `/parse_duration` tool that uses the imported module. Demonstrates dependency management via jiti module resolution.

**APIs called**
- `pi.registerTool()` with custom parameters using `ms()` library (line 14)
- Tool execution calls imported `ms(duration)` at line 22

**Notable techniques**
- `package.json` with `"pi"` field listing extension entry points (line 11)
- Dependencies auto-resolved from `node_modules/` via jiti runtime
- Tool schema remains typed (`ms.StringValue` type hint)
- Project-local installation: `npm install` in extension directory

**Code anatomy** (key snippet, 8 lines)
```typescript
import ms from "ms";
pi.registerTool({
  name: "parse_duration",
  parameters: Type.Object({
    duration: Type.String({ description: "Duration like '2 days', '1h'" }),
  }),
  execute: async (_toolCallId, params) => {
    const result = ms(params.duration as ms.StringValue);
    return { content: [{ type: "text", text: `${params.duration} = ${result}ms` }], details: {} };
  },
});
```

**Copy-paste starter**
Add third-party libraries. Include `package.json` with `"pi": { "extensions": ["./index.ts"] }`, declare deps, run `npm install` once.

---

## BE-07: Event Bus (Inter-Extension Communication)

**What it does**
Demonstrates `pi.events` for broadcasting and listening to custom events. One extension emits events; others subscribe. Provides `/emit` command to trigger notifications across extensions.

**APIs called**
- `pi.events.on("my:notification", handler)` at line 21 — subscribe to custom event
- `pi.events.emit("my:notification", data)` at line 31 — broadcast event
- `pi.on("session_start")` at line 16 — lifecycle hook stores ctx for use in listeners
- `ctx.ui.notify()` at line 23

**Notable techniques**
- Event namespace convention: `my:notification` (colon-separated)
- Event payload is plain object: `{ message, from }`
- Listener depends on `currentCtx` being set by lifecycle hook
- Fire-and-forget emit pattern for loose coupling

**Code anatomy** (key snippet, 10 lines)
```typescript
pi.events.on("my:notification", (data) => {
  const { message, from } = data as { message: string; from: string };
  currentCtx?.ui.notify(`Event from ${from}: ${message}`, "info");
});

pi.registerCommand("emit", {
  description: "Emit my:notification event",
  handler: async (args, _ctx) => {
    const message = args.trim() || "hello";
    pi.events.emit("my:notification", { message, from: "/emit command" });
  },
});
```

**Copy-paste starter**
Coordinate multiple extensions. Define event namespace, emit from one, subscribe in another. Store ctx on `session_start` for UI access in listeners.

---

## BE-08: Custom Provider—Anthropic OAuth (Full Streaming Implementation)

**What it does**
Implements a complete alternative provider (`custom-anthropic`) with Anthropic SDK integration, PKCE OAuth flow, and full streaming support. Routes token usage through custom calculation. Demonstrates maximum extensibility: providers can delegate to built-in Anthropic logic or implement from scratch.

**APIs called**
- `pi.registerProvider()` at line 569 — register named provider with models and auth
- `provider.oauth`: `login`, `refreshToken`, `getApiKey` callbacks (lines 596–600)
- `provider.streamSimple()` at line 602 — streaming implementation (lines 334–562)
- `createAssistantMessageEventStream()` at line 339 — builds stream object
- `Anthropic()` SDK client at line 390 with custom headers and beta flags
- OAuth PKCe flow: `generatePKCE()`, fetch token exchange at lines 97–125

**Notable techniques**
- Model definitions with cost, reasoning, input types, context window
- OAuth token refresh with TTL tracking
- Anthropic SDK streaming with tool name mapping (stealth mode: Claude Code tool names)
- Cache control insertion (`ephemeral` cache_control blocks)
- Proper error handling with abort signal support
- Stream event mapping (thinking, text, tool calls, deltas)

**Code anatomy** (key snippet, 40 lines, OAuth)
```typescript
async function loginAnthropic(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const { verifier, challenge } = await generatePKCE();
  const authParams = new URLSearchParams({
    code_challenge: challenge, code_challenge_method: "S256", state: verifier,
    client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  callbacks.onAuth({ url: `${AUTHORIZE_URL}?${authParams.toString()}` });
  const authCode = await callbacks.onPrompt({ message: "Paste the authorization code:" });
  const [code, state] = authCode.split("#");
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code", client_id: CLIENT_ID, code, state,
      redirect_uri: REDIRECT_URI, code_verifier: verifier,
    }),
  });
  const data = (await tokenResponse.json()) as { access_token: string; refresh_token: string };
  return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + ... };
}
```

**Copy-paste starter**
Implement a custom provider: define OAuth handlers, streaming function. Map model config, handle token exchange, return event stream. See full file for complete streaming loop.

---

## BE-09: Custom Provider—GitLab Duo (Proxy Pattern)

**What it does**
Registers `gitlab-duo` provider that proxies requests through GitLab's AI Gateway to both Anthropic and OpenAI backends. Demonstrates provider composition: delegates to built-in `streamSimpleAnthropic` and `streamSimpleOpenAI` functions rather than reimplementing streaming.

**APIs called**
- `pi.registerProvider("gitlab-duo")` at line 328 with models array
- `streamSimpleAnthropic()` at line 287 — reuse built-in Anthropic streaming
- `streamSimpleOpenAIResponses()` at line 289 — reuse built-in OpenAI streaming
- `getDirectAccessToken()` at line 281 — fetch GitLab session token via fetch
- OAuth flow similar to BE-08 (lines 193–260)

**Notable techniques**
- Provider multiplexing: models map to either Anthropic or OpenAI backend
- Direct access token caching with TTL (25 min) to avoid repeated fetches
- Token invalidation on refresh (line 229, 254)
- Reuses existing streaming implementations: delegates to built-in providers
- Unified error path for both backends (lines 293–317)
- Model list exported for reuse in tests

**Code anatomy** (key snippet, 15 lines, streaming dispatch)
```typescript
export function streamGitLabDuo(model: Model<Api>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
  const cfg = MODEL_MAP.get(model.id);
  const directAccess = await getDirectAccessToken(gitlabAccessToken);
  const modelWithBaseUrl = { ...model, baseUrl: cfg.baseUrl };
  const headers = { ...directAccess.headers, Authorization: `Bearer ${directAccess.token}` };
  const streamOptions = { ...options, apiKey: "gitlab-duo", headers };
  
  const innerStream = cfg.backend === "anthropic"
    ? streamSimpleAnthropic(modelWithBaseUrl as Model<"anthropic-messages">, context, streamOptions)
    : streamSimpleOpenAIResponses(modelWithBaseUrl as Model<"openai-responses">, context, streamOptions);
  
  for await (const event of innerStream) stream.push(event);
}
```

**Copy-paste starter**
Wrap existing providers or act as a proxy. Register models, fetch auth tokens, reuse built-in streaming functions. Minimal custom code.

---

## BE-10: Sandbox Extension (OS-Level Security via @anthropic-ai/sandbox-runtime)

**What it does**
Replaces the built-in `bash` tool with a sandboxed version using `@anthropic-ai/sandbox-runtime`. Enforces filesystem and network restrictions at the OS level (sandbox-exec macOS, bubblewrap Linux). Reads config from `~/.pi/` and `.pi/sandbox.json`, initializes on session start.

**APIs called**
- `pi.registerFlag("no-sandbox")` at line 202 — CLI flag to disable
- `pi.registerTool()` at line 214 — override built-in bash tool
- `pi.on("session_start")` at line 234 — initialize sandbox config
- `pi.on("session_shutdown")` at line 287 — cleanup
- `SandboxManager.initialize()` at line 264, `SandboxManager.wrapWithSandbox()` at line 139
- `createBashTool()` from `pi-coding-agent` (line 49)
- Config load from JSON files (lines 79–130, `deepMerge`)

**Notable techniques**
- Config layering: global (~/.pi/) + project-local (.pi/) with project precedence
- Feature detection (platform check at line 251)
- Graceful degradation: disables sandbox if init fails (line 282)
- Tool replacement pattern: intercept execute, optionally delegate to sandboxed version
- Status indicator in UI (line 276–279)
- Lifecycle management: init on start, reset on shutdown

**Code anatomy** (key snippet, 20 lines, config + init)
```typescript
function loadConfig(cwd: string): SandboxConfig {
  const globalConfigPath = join(getAgentDir(), "extensions", "sandbox.json");
  const projectConfigPath = join(cwd, ".pi", "sandbox.json");
  let globalConfig = existsSync(globalConfigPath) ? JSON.parse(readFileSync(...)) : {};
  let projectConfig = existsSync(projectConfigPath) ? JSON.parse(readFileSync(...)) : {};
  return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

pi.on("session_start", async (_event, ctx) => {
  if (pi.getFlag("no-sandbox")) { sandboxEnabled = false; return; }
  const config = loadConfig(ctx.cwd);
  if (!config.enabled) return;
  
  await SandboxManager.initialize({
    network: config.network,
    filesystem: config.filesystem,
  });
  sandboxEnabled = true;
  ctx.ui.notify("Sandbox initialized", "info");
});
```

**Copy-paste starter**
Add security layers. Use lifecycle hooks for init/cleanup, layered config files, feature detection. Wrap tools or override behavior conditionally.

---

## BE-11: Modal Editor (Custom Input Component via CustomEditor)

**What it does**
Subclasses `CustomEditor` to create a vim-like modal editing mode. Escape toggles between insert and normal mode; normal mode uses hjkl navigation. Demonstrates complete control over editor key handling and mode display.

**APIs called**
- `pi.on("session_start")` at line 82 — lifecycle hook
- `ctx.ui.setEditorComponent()` at line 83 — replace editor with custom subclass
- `CustomEditor` base class at line 28 — provides `handleInput()`, `render()` contract
- `super.handleInput(data)` at line 44 — delegate to parent for standard handling
- `matchesKey(data, "escape")` at line 33 — key event detection

**Notable techniques**
- State machine: `mode: "normal" | "insert"` (line 29)
- Key mapping table: maps characters to ANSI escape sequences (lines 16–26)
- Dual-mode rendering: mode indicator appended to bottom border (lines 67–78)
- Vim conventions: hjkl, 0/$, x (delete), i/a (mode switches)
- Pass-through for unmapped printable chars in normal mode (line 63)

**Code anatomy** (key snippet, 20 lines, key dispatch)
```typescript
class ModalEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";
  
  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.mode = this.mode === "insert" ? "normal" : "insert";
      if (this.mode === "insert") super.handleInput(data);  // Abort if already normal
      return;
    }
    
    if (this.mode === "insert") {
      super.handleInput(data);
      return;
    }
    
    const seq = NORMAL_KEYS[data];
    if (seq) super.handleInput(seq);  // Map to arrow keys, etc.
    else if (data.charCodeAt(0) < 32) super.handleInput(data);  // Pass control keys
  }
}
```

**Copy-paste starter**
Create custom input modes. Subclass `CustomEditor`, override `handleInput()` and `render()`, set via `ctx.ui.setEditorComponent()`.

---

## BE-12: Overlay Component (TUI Rendering with Edge Cases)

**What it does**
Demonstrates a floating overlay menu with inline text inputs, handled focus, and wide-character support. Tests compositing with borders, styled text, emoji, and cursor markers for IME support. Shows advanced TUI component authoring.

**APIs called**
- `ctx.ui.custom<T>()` at line 18 with `{ overlay: true }` option
- `Focusable` interface at line 31 — implement `handleInput()`, `render()`, `focused` property
- `visibleWidth()`, `CURSOR_MARKER` from `pi-tui` at line 12
- `matchesKey()` for keybinding detection
- `theme.fg()` for color/styling

**Notable techniques**
- Overlay mode (separate UI layer, not full-screen)
- Focusable interface for input handling
- Inline inputs within menu items (state tracking for cursor position)
- Wide-character measurement (`visibleWidth`) for correct alignment
- Hardware cursor marker (`CURSOR_MARKER`, escaped `\x1b[7m`) for IME
- Edge case rendering: emoji, styled text, wide chars (lines 102–109)
- Menu selection with arrow keys (lines 63–66)

**Code anatomy** (key snippet, 25 lines, render + input)
```typescript
class OverlayTestComponent implements Focusable {
  private items = [
    { label: "Search", hasInput: true, text: "", cursor: 0 },
    { label: "Run", hasInput: true, text: "", cursor: 0 },
  ];
  
  handleInput(data: string): void {
    if (matchesKey(data, "up")) this.selected = Math.max(0, this.selected - 1);
    if (matchesKey(data, "down")) this.selected = Math.min(this.items.length - 1, this.selected + 1);
    if (matchesKey(data, "return")) this.done({ action: this.items[this.selected].label });
    
    const current = this.items[this.selected];
    if (current.hasInput && matchesKey(data, "backspace")) {
      current.text = current.text.slice(0, current.cursor - 1) + current.text.slice(current.cursor);
    }
  }
  
  render(_width: number): string[] {
    // Build box with borders, items, and styled content
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const inputDisplay = item.cursor < item.text.length
        ? `${item.text.slice(0, item.cursor)}${CURSOR_MARKER}\x1b[7m${item.text[item.cursor]}\x1b[27m${item.text.slice(item.cursor + 1)}`
        : item.text + CURSOR_MARKER + "\x1b[7m \x1b[27m";
      // ... render item with input
    }
  }
}
```

**Copy-paste starter**
Build floating menus or dialogs. Implement `Focusable`, use `ctx.ui.custom({ overlay: true })`, handle key events and render with `visibleWidth()` for alignment.

---

## BE-13: RPC Extension UI (Custom TUI for RPC Mode)

**What it does**
Standalone example showing how to build a custom TUI client on top of pi's RPC protocol. Spawns the agent in `--mode rpc`, communicates via JSON over stdin/stdout, and renders agent output while handling extension UI requests (select, confirm, input, editor dialogs).

**APIs called**
- Spawns agent with `spawn(node, [cliPath, --mode rpc, ...])` at line 250
- JSON protocol: sends `{ type: "prompt", message: ... }` (line 594), receives agent events
- Custom components: `OutputLog`, `LoadingIndicator`, `PromptInput`, `SelectDialog`, `InputDialog` (TUI-based)
- Handles `extension_ui_request` events at line 533 (select, confirm, input, editor, notify, setStatus, setWidget)
- Responds with `{ type: "extension_ui_response", id, value/confirmed/cancelled }` (lines 384–420)

**Notable techniques**
- RPC mode spawns lightweight agent process with JSON communication
- Async dialog handling: pause input, show dialog, resume on response
- Bottom component swapping (prompt vs. dialog) at lines 304–322
- Loading indicator with animated dots (lines 100–126)
- ANSI styling for colored output (lines 29–36)
- Graceful exit on Ctrl+D (lines 297, 598)

**Code anatomy** (key snippet, 20 lines, RPC send/receive)
```typescript
const agent = spawn("node", [cliPath, "--mode", "rpc", ...], { stdio: ["pipe", "pipe", "pipe"] });

function send(obj: Record<string, unknown>): void {
  agent.stdin!.write(`${JSON.stringify(obj)}\n`);
}

const stdoutRl = readline.createInterface({ input: agent.stdout! });
stdoutRl.on("line", (line) => {
  const data = JSON.parse(line);
  if (data.type === "agent_start") showLoading();
  if (data.type === "extension_ui_request") handleExtensionUI(data);
  if (data.type === "message_update") { /* render text */ }
  if (data.type === "agent_end") hideLoading();
});

promptInput.input.onSubmit = (value) => {
  send({ type: "prompt", message: value });
};
```

**Copy-paste starter**
Build alternative UIs. Spawn agent in `--mode rpc`, implement JSON protocol, handle extension UI requests, render text/tools as they stream.

---

## BE-14: Subagent Tool (Spawn Isolated Agents with Message Passing)

**What it does**
Registers a tool that spawns separate `pi` processes (subagents) to delegate tasks. Supports three modes: single (one agent, one task), parallel (multiple agents concurrently), and chain (sequential with output sharing via `{previous}` placeholder). Collects message history, usage stats, and tool call traces from each subagent.

**APIs called**
- `pi.registerTool()` at line 432 with complex parameters (single/parallel/chain modes)
- Tool execution spawns subprocess: `spawn(invocation.command, invocation.args, { cwd, stdio })` at line 306
- Reads JSON events from agent stdout (lines 313–348)
- Config discovery: `discoverAgents()` at line 445 scans `~/.pi/agent/agents` and `.pi/agents`
- `ctx.ui.confirm()` at line 489 for security gate before running project agents
- Custom rendering: `renderCall()` at line 672 shows chain/parallel preview, `renderResult()` at line 716 displays results with usage

**Notable techniques**
- Concurrency control: `mapWithConcurrencyLimit()` (line 597, max 4 concurrent)
- Temp file handling for prompt persistence (lines 210–218)
- Message accumulation and usage aggregation (lines 328–340)
- Context chaining: `{previous}` placeholder replaced with prior output (line 507)
- Graceful error handling and abort signal support (lines 370–379)
- Rich rendering with collapsed/expanded modes and usage formatting

**Code anatomy** (key snippet, 30 lines, parallel spawn)
```typescript
const results = await mapWithConcurrencyLimit(params.tasks, MAX_CONCURRENCY, async (t, index) => {
  const invocation = getPiInvocation(["--mode", "json", "-p", "--no-session", t.agent, t.task]);
  const proc = spawn(invocation.command, invocation.args, {
    cwd: ctx.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  let buffer = "";
  proc.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message) {
        const msg = event.message;
        currentResult.messages.push(msg);
        currentResult.usage.input += msg.usage.input || 0;
        currentResult.usage.output += msg.usage.output || 0;
      }
    }
  });
});
```

**Copy-paste starter**
Build task delegation and orchestration tools. Spawn agents with isolated context, collect JSON events, support concurrent/sequential execution, aggregate results.

---

## BE-15: Session Persistence via Custom Entries (Tools Extension)

**What it does**
Registers `/tools` command that lets users enable/disable tools interactively. Persists the selection across session reloads by storing a custom entry (`tools-config`) in the session history. Respects branch navigation: when switching branches, restores the saved tool selection for that branch.

**APIs called**
- `pi.registerCommand("tools")` at line 67 — interactive tool selector
- `ctx.ui.custom()` at line 73 — render TUI `SettingsList` component
- `pi.appendEntry<T>()` at line 29 — save custom data to session
- `ctx.sessionManager.getBranch()` at line 43 — read current branch entries
- `pi.on("session_start")` and `pi.on("session_tree")` at lines 133, 138 — restore on branch change
- `pi.setActiveTools()` at line 35 — update active tool set

**Notable techniques**
- Custom entry type: `appendEntry("tools-config", { enabledTools: [...] })`
- Branch-aware restoration: searches `getBranch()` for last saved config
- Reactive UI: `SettingsList` change handler directly calls `applyTools()` (line 103)
- Fallback: if no saved state, sync with currently active tools (line 62)
- State validation: filter saved names against available tools (line 58)

**Code anatomy** (key snippet, 15 lines, persist & restore)
```typescript
function persistState() {
  pi.appendEntry<ToolsState>("tools-config", {
    enabledTools: Array.from(enabledTools),
  });
}

function restoreFromBranch(ctx: ExtensionContext) {
  const branchEntries = ctx.sessionManager.getBranch();
  let savedTools: string[] | undefined;
  for (const entry of branchEntries) {
    if (entry.type === "custom" && entry.customType === "tools-config") {
      savedTools = entry.data.enabledTools;
    }
  }
  if (savedTools) {
    enabledTools = new Set(savedTools.filter(name => allTools.map(t => t.name).includes(name)));
    applyTools();
  }
}
```

**Copy-paste starter**
Persist extension state across sessions. Use `pi.appendEntry()` to save, `ctx.sessionManager.getBranch()` to read, hook into `session_start` / `session_tree` for restoration.

---

## Cross-Cutting Patterns & Observations

### API Patterns
1. **Lifecycle hooks**: `session_start`, `session_shutdown`, `agent_start`, `agent_end`, `before_agent_start`, `session_switch`, `session_tree`, `user_bash`
2. **UI APIs**: `ctx.ui.custom()`, `ctx.ui.notify()`, `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.input()`, `ctx.ui.setWidget()`, `ctx.ui.setEditorComponent()`
3. **Introspection**: `pi.getCommands()`, `pi.getAllTools()`, `pi.getActiveTools()`, `pi.getSessionName()`
4. **Mutation**: `pi.registerCommand()`, `pi.registerTool()`, `pi.registerProvider()`, `pi.registerFlag()`, `pi.setActiveTools()`, `pi.setSessionName()`
5. **Persistence**: `pi.appendEntry()`, `ctx.sessionManager` (read-only), `pi.events` (pub/sub)

### File Organization
- Single-file extensions: `hello.ts`, `commands.ts`, `event-bus.ts` (10–50 lines)
- Multi-file with deps: `with-deps/`, `custom-provider-anthropic/`, `sandbox/`, `subagent/` include `package.json`, `package-lock.json`
- Root examples: `.pi/extensions/` (redraws, tps, prompt-url-widget)

### Configuration & Setup
- Extensions auto-loaded from `.pi/extensions/` or via `-e` flag
- `package.json` with `"pi": { "extensions": ["./index.ts"] }` declares entry points
- npm deps auto-resolved via jiti (transparent to author)
- Config files: `~/.pi/` (global), `.pi/` (project-local), with merging (sandbox example)

### Testing & Discovery
- Use `/commands` to list available commands
- Use `/tools` to enable/disable and test tool availability
- RPC mode (`--mode rpc`) decouples TUI, useful for testing custom UI

---

## Recommendation: Best Starter Template

**Use `with-deps` as the template** for new pij extensions:
- Clean package structure with npm support
- Minimal but complete: demonstrates tool registration + dependency import
- Immediately runnable: `npm install && pi -e .`
- Scales up: add more tools, hooks, UI components to the same entry point

**If building complex features**, reference these combinations:
- **UI + persistence** → tps.ts (hooks) + tools.ts (custom entries)
- **External integration** → prompt-url-widget.ts (async, gh CLI, widget updates)
- **Custom provider** → custom-provider-anthropic/index.ts (full streaming) or custom-provider-gitlab-duo/index.ts (proxy pattern)
- **OS-level features** → sandbox/ (config layering, lifecycle, graceful degradation)

---

## Finding Summary Table

| ID | Extension | Lines | Key APIs | Technique |
|----|-----------|-------|----------|-----------|
| BE-01 | hello | 27 | registerTool | Minimal tool with TypeBox schema |
| BE-02 | commands | 73 | registerCommand, getCommands | Command introspection, filtering |
| BE-03 | tps | 48 | on(agent_end), usage stats | Event monitoring, metrics |
| BE-04 | redraws | 25 | custom, ui.notify | TUI stats collection |
| BE-05 | prompt-url-widget | 159 | before_agent_start, setWidget, gh exec | Prompt parsing, async metadata, widget updates |
| BE-06 | with-deps | 32 | registerTool, npm deps | Dependency management via jiti |
| BE-07 | event-bus | 44 | events.on/emit | Inter-extension pubsub |
| BE-08 | custom-provider-anthropic | 605 | registerProvider, OAuth, streamSimple | Full OAuth, streaming, tool mapping |
| BE-09 | custom-provider-gitlab-duo | 350 | registerProvider, proxy streaming | Provider composition, token caching |
| BE-10 | sandbox | 322 | on(session_start), SandboxManager | Config layering, init/cleanup, feature detection |
| BE-11 | modal-editor | 85 | setEditorComponent, CustomEditor | State machine, vim mode, key mapping |
| BE-12 | overlay-test | 150 | custom({ overlay: true }), Focusable | Advanced TUI, wide chars, IME support |
| BE-13 | rpc-extension-ui | 633 | RPC mode, JSON protocol, dialog handling | Standalone TUI client, RPC protocol |
| BE-14 | subagent | 988 | registerTool, spawn, JSON streaming | Process delegation, concurrency, chaining |
| BE-15 | tools | 142 | appendEntry, getBranch, session_tree | Session persistence, branch-aware state |

