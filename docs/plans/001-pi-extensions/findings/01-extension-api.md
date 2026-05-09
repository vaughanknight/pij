# Pi ExtensionAPI Surface

**Source**: `/Users/jordanknight/pi-hacking/pi-mono/packages/coding-agent/src/core/extensions/`
**Graph**: `graph_name="pi-mono"`
**Total findings**: 18 (IA-01..IA-18)

---

### Finding IA-01: Event Subscription System
**Category**: hook
**File**: `packages/coding-agent/src/core/extensions/types.ts:1089-1126`
**Signature**:
```ts
on(event: "resources_discover" | "session_start" | "session_before_switch" | /* ... 20+ event types */,
   handler: ExtensionHandler<EventType, ResultType>): void
```
**Lifecycle**: At extension load (registration) and runtime (callbacks fire on lifecycle events).
**Purpose**: Subscribe to 20+ lifecycle and agent events. Handlers run sync or async; some `before_*` events can be cancelled by handler return value. Deep integration without modifying core.
**Example**:
```ts
pi.on("session_start", async (event, ctx) => {
  if (event.reason === "startup") {
    console.log("Session started at", ctx.cwd);
  }
});
```
**Notes**: Handlers chain across extensions; order matters for cancellable `before_*` events.

---

### Finding IA-02: Tool Registration
**Category**: tool
**File**: `packages/coding-agent/src/core/extensions/types.ts:1132-1135`
**Signature**:
```ts
registerTool<TParams extends TSchema, TDetails = unknown, TState = any>(
  tool: ToolDefinition<TParams, TDetails, TState>
): void
```
**Lifecycle**: During extension load; tools become callable immediately by the LLM.
**Purpose**: Register custom LLM-callable tools with TypeBox schema validation, custom call/result rendering, and streaming via `onUpdate`.
**Example**:
```ts
pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({ query: Type.String() }),
  execute: async (id, params, signal, onUpdate, ctx) => {
    if (signal?.aborted) return { error: "aborted" };
    return { type: "text", text: `Result: ${params.query}` };
  }
});
```
**Notes**: First registration per name wins; TypeBox schema mandatory.

---

### Finding IA-03: Command Registration
**Category**: command
**File**: `packages/coding-agent/src/core/extensions/types.ts:1141-1142`
**Signature**:
```ts
registerCommand(name: string, options: {
  description?: string;
  getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | Promise<AutocompleteItem[]>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}): void
```
**Lifecycle**: During load; available immediately as a slash command.
**Purpose**: Register `/commands` with completion. Handler receives raw args + a special command context with session control APIs (newSession, fork, navigateTree, switchSession).
**Example**:
```ts
pi.registerCommand("greet", {
  description: "Greet the user",
  handler: async (args, ctx) => {
    const name = args.trim() || "World";
    await ctx.ui.notify(`Hello, ${name}!`, "info");
  }
});
```
**Notes**: Conflicting names disambiguated `extension:1`, `extension:2`, …; interactive mode only.

---

### Finding IA-04: Keyboard Shortcut Registration
**Category**: command
**File**: `packages/coding-agent/src/core/extensions/types.ts:1144-1151`
**Signature**:
```ts
registerShortcut(shortcut: KeyId, options: {
  description?: string;
  handler: (ctx: ExtensionContext) => Promise<void> | void;
}): void
```
**Lifecycle**: During load; active in interactive mode.
**Purpose**: Bind handlers to keychords (`"ctrl+shift+x"`). Reserved bindings (interrupt, exit, model.select, …) cannot be overridden — see `runner.ts:62-80`.
**Example**:
```ts
pi.registerShortcut("ctrl+shift+t", {
  description: "Test shortcut",
  handler: async (ctx) => { if (ctx.hasUI) ctx.ui.notify("Shortcut triggered!"); },
});
```
**Notes**: Last registration wins on conflict.

---

### Finding IA-05: CLI Flag Registration
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:1153-1164`
**Signature**:
```ts
registerFlag(name: string, options: {
  description?: string;
  type: "boolean" | "string";
  default?: boolean | string;
}): void;
getFlag(name: string): boolean | string | undefined
```
**Lifecycle**: Registered at load; parsed at CLI startup; readable any time.
**Purpose**: Define custom CLI flags consumed by the harness and accessible from extension code.
**Example**:
```ts
pi.registerFlag("debug-mode", { type: "boolean", default: false });
const isDebug = pi.getFlag("debug-mode");
```
**Notes**: Extensions only see flags they registered; values stored in `runtime.flagValues`.

---

### Finding IA-06: Custom Message Rendering
**Category**: UI
**File**: `packages/coding-agent/src/core/extensions/types.ts:1170-1171`
**Signature**:
```ts
registerMessageRenderer<T = unknown>(
  customType: string,
  renderer: (message: CustomMessage<T>, options: MessageRenderOptions, theme: Theme) => Component | undefined
): void
```
**Lifecycle**: During load; renderer fires whenever a matching custom message is displayed.
**Purpose**: Render custom message types as TUI components with theme-aware styling.
**Notes**: Use TUI primitives from `@earendil-works/pi-tui`; return `undefined` to fall back to default.

---

### Finding IA-07: Message Sending (Inject into Conversation)
**Category**: session
**File**: `packages/coding-agent/src/core/extensions/types.ts:1177-1190`
**Signature**:
```ts
sendMessage<T = unknown>(
  message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
  options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }
): void;

sendUserMessage(
  content: string | (TextContent | ImageContent)[],
  options?: { deliverAs?: "steer" | "followUp" }
): void
```
**Lifecycle**: Any time (queues if streaming).
**Purpose**: Inject custom messages (no LLM call) or user messages (triggers agent loop). `deliverAs` controls timing.
**Notes**: `"steer"` interrupts streaming; `"followUp"` queues after current turn; `"nextTurn"` queues for next iteration.

---

### Finding IA-08: Session Entry Appending (Persistent State)
**Category**: session
**File**: `packages/coding-agent/src/core/extensions/types.ts:1192-1193`
**Signature**:
```ts
appendEntry<T = unknown>(customType: string, data?: T): void
```
**Lifecycle**: Any time; persisted to session file.
**Purpose**: Store extension-specific state in the session. Survives reload. Does **not** participate in LLM context (use `sendMessage` for that).
**Example**:
```ts
pi.appendEntry("index_state", { version: 2, count: 100 });
// Reconstruct on reload:
pi.on("session_start", (event, ctx) => {
  const entries = ctx.sessionManager.entries
    .filter(e => e.type === "custom" && e.customType === "index_state");
});
```

---

### Finding IA-09: Session Metadata Management
**Category**: session
**File**: `packages/coding-agent/src/core/extensions/types.ts:1199-1206`
**Signature**:
```ts
setSessionName(name: string): void;
getSessionName(): string | undefined;
setLabel(entryId: string, label: string | undefined): void
```
**Purpose**: Display name (shown in session selector) + per-entry labels for bookmarking/navigation.

---

### Finding IA-10: Tool and Command Introspection
**Category**: tool
**File**: `packages/coding-agent/src/core/extensions/types.ts:1211-1221`
**Signature**:
```ts
getActiveTools(): string[];
getAllTools(): ToolInfo[];
setActiveTools(toolNames: string[]): void;
getCommands(): SlashCommandInfo[]
```
**Purpose**: Inspect/manipulate the active tool set; `setActiveTools` updates the system prompt and tool choices for the model.

---

### Finding IA-11: Model & Thinking Level Control
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:1227-1234`
**Signature**:
```ts
setModel(model: Model<any>): Promise<boolean>;
getThinkingLevel(): ThinkingLevel;
setThinkingLevel(level: ThinkingLevel): void
```
**Notes**: `setModel` requires a valid API key; `setThinkingLevel` clamps silently to model capability on next use.

---

### Finding IA-12: Provider Registration (Custom LLM Providers)
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:1240-1307`
**Signature**:
```ts
registerProvider(name: string, config: ProviderConfig): void;
unregisterProvider(name: string): void;

interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  api?: Api;
  streamSimple?: (model, context, options) => AssistantMessageEventStream;
  headers?: Record<string, string>;
  authHeader?: boolean;
  models?: ProviderModelConfig[];
  oauth?: { login, refreshToken, getApiKey, modifyModels? };
}
```
**Lifecycle**: At load (queued, applied post-bind) or runtime (immediate).
**Purpose**: Register entirely new LLM providers — custom URLs, OAuth flows, model lists, even custom streaming. The most powerful API in the surface.
**Example**: see `examples/extensions/custom-provider-anthropic` and `custom-provider-gitlab-duo`.

---

### Finding IA-13: System Prompt and Context Inspection
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:322-326`
**Signature**:
```ts
getSystemPrompt(): string;
getContextUsage(): ContextUsage | undefined;
interface ContextUsage { tokens: number | null; contextWindow: number; percent: number | null }
```
**Purpose**: Read-only inspection. Useful for usage-driven compaction triggers, dashboards.

---

### Finding IA-14: Compaction Trigger
**Category**: session
**File**: `packages/coding-agent/src/core/extensions/types.ts:324`
**Signature**:
```ts
compact(options?: {
  customInstructions?: string;
  onComplete?: (result: CompactionResult) => void;
  onError?: (error: Error) => void;
}): void
```
**Purpose**: Trigger compaction with optional bespoke instructions. Fires `session_before_compact` and `session_compact` events.

---

### Finding IA-15: Session Control (New / Fork / Navigate / Switch)
**Category**: session
**File**: `packages/coding-agent/src/core/extensions/types.ts:337-360` (commands only)
**Signature**: `newSession`, `fork`, `navigateTree`, `switchSession` — each takes a `withSession?` callback that runs in the **post-switch** context.
**Lifecycle**: Command handlers only (not event handlers).
**Notes**: After a switch, the original `ctx` is invalidated — must use `withSession` to act in the new session.

---

### Finding IA-16: Shell Command Execution
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:1208-1209`
**Signature**:
```ts
exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>
```
**Notes**: No shell features (pipes/redirects) unless wrapped via `sh -c`. Defaults `cwd` to `ctx.cwd`.

---

### Finding IA-17: UI Context (Interactive Mode)
**Category**: UI
**File**: `packages/coding-agent/src/core/extensions/types.ts:124-275`
**Signature** (abridged):
```ts
interface ExtensionUIContext {
  select(title, options, opts?): Promise<string | undefined>;
  confirm(title, message, opts?): Promise<boolean>;
  input(title, placeholder?, opts?): Promise<string | undefined>;
  notify(message, type?): void;
  setStatus(key, text): void;
  setWorkingMessage(message?): void;
  setWidget(key, content, options?): void;
  setFooter(factory): void;
  setHeader(factory): void;
  custom<T>(factory, options?): Promise<T>;
  pasteToEditor(text): void;
  setEditorText(text): void;
  getEditorText(): string;
  editor(title, prefill?): Promise<string | undefined>;
  addAutocompleteProvider(factory): void;
  setEditorComponent(factory): void;
  readonly theme: Theme;
  getAllThemes(): { name, path }[];
  setTheme(theme): { success, error? };
}
```
**Notes**: Always check `ctx.hasUI` first — no-op in print/RPC modes.

---

### Finding IA-18: Event Bus (Inter-Extension Pub/Sub)
**Category**: other
**File**: `packages/coding-agent/src/core/extensions/types.ts:1310` + `event-bus.ts`
**Signature**:
```ts
readonly events: EventBus;
class EventBus {
  on(channel: string, handler: (data: any) => void): () => void;
  emit(channel: string, data: any): void;
  offAll(channel: string): void;
}
```
**Purpose**: Loose pub/sub between extensions. No schema, no namespace enforcement — convention only.

---

## Gaps & Surprises

**Gaps**
1. **No native sub-agent / nested-agent API.** Extensions can't spawn child agents within a turn. Workarounds spawn `pi` as a subprocess (e.g. `pi-subagents`, the `subagent` example).
2. **No direct RPC server binding.** RPC mode is generic; extensions cannot expose bespoke RPC endpoints.
3. **No code-level skill/prompt/theme registration.** Use `resources_discover` event to point at filesystem paths instead.
4. **No file-sandbox primitives.** Extensions go through `exec()` or `ctx.cwd`; no `readFile` helper.
5. **Command-arg autocomplete only in editor.** No autocomplete for non-editor surfaces.

**Surprises**
1. **`ProviderConfig` is wide open** — full OAuth flows, custom streaming, arbitrary headers. Effectively a plugin API for entire LLM providers.
2. **Event handlers can mutate `event.input` in place** for `tool_call`. No re-validation against schema.
3. **`before_provider_request`** receives the raw API payload (Anthropic/OpenAI/etc.) — extensions can rewrite the wire format.
4. **`CustomEntry` vs `CustomMessage`** — both persist, but only the latter participates in LLM context. Easy to confuse.
5. **`setThinkingLevel` doesn't validate against the current model** — silent clamp on use.
