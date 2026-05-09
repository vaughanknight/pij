# Pi Tools & MCP Integration — Research Findings

**TM-01: No Native MCP Support**
Pi explicitly does not include MCP (Model Context Protocol) support. From the README: "**No MCP.** Build CLI tools with READMEs (see [Skills](#skills)), or build an extension that adds MCP support. [Why?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)"
- Location: `packages/coding-agent/README.md`
- **Implication for extension authors:** To use MCP servers, you must write a third-party extension that bridges MCP into pi's tool system. No first-class wiring exists.

**TM-02: Extension Tool Registration API**
Extensions register LLM-callable tools via `pi.registerTool(definition)`.
- Location: `packages/coding-agent/src/core/extensions/types.ts:1133–1135` (ExtensionAPI.registerTool method)
- Tool registration is valid and takes effect immediately during extension loading or at runtime (post-session_start).
- Tools are registered into the extension object: `extension.tools.set(tool.name, { definition, sourceInfo })`
- Location: `packages/coding-agent/src/core/extensions/loader.ts:217–224` (createExtensionAPI.registerTool)

**TM-03: ToolDefinition Shape & Contract**
A `ToolDefinition` is the core unit for extending pi with LLM-callable tools.
```typescript
interface ToolDefinition<TParams extends TSchema, TDetails = unknown, TState = any> {
  name: string;                              // Tool identifier for LLM calls
  label: string;                             // UI label
  description: string;                       // LLM system prompt description
  promptSnippet?: string;                    // Optional 1-line snippet for system prompt
  promptGuidelines?: string[];              // Optional guidelines appended to system prompt
  parameters: TParams;                       // TypeBox schema for parameters
  renderShell?: "default" | "self";         // Rendering framing in TUI
  prepareArguments?: (args: unknown) => Static<TParams>;  // Pre-validation compat shim
  executionMode?: ToolExecutionMode;        // "sequential" | "parallel"
  execute(...): Promise<AgentToolResult>;   // Main execution function
  renderCall?: (args, theme, context) => Component;      // Optional call rendering
  renderResult?: (result, options, theme, context) => Component;  // Optional result rendering
}
```
- Location: `packages/coding-agent/src/core/extensions/types.ts:426–473`
- Schema uses TypeBox (`typebox` package) for type-safe parameter definitions. Extensions get TypeBox bundled automatically.

**TM-04: Execute Function Signature**
The core work happens in `execute()`:
```typescript
execute(
  toolCallId: string,
  params: Static<TParams>,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
  ctx: ExtensionContext
): Promise<AgentToolResult<TDetails>>
```
- The function receives the resolved parameters (validated against the schema), an abort signal for cancellation, and `ExtensionContext` (for UI, session, model data, etc.).
- Returns `{ content: (TextContent | ImageContent)[], details?: TDetails }`.
- Location: `packages/coding-agent/src/core/extensions/types.ts:454–461`

**TM-05: Built-in Tool Creation Helpers**
Pi provides factory functions for creating standard tools (bash, read, write, edit, etc.) with pluggable "operations" interfaces. This enables extensions to wrap, override, or customize tool behavior.
- Location: `packages/coding-agent/src/core/tools/index.ts`
- Examples: `createBashTool(cwd, options?)`, `createReadTool(cwd, options?)`, etc.
- Each tool accepts an optional `options` parameter with custom `operations` (e.g., `BashOperations`, `ReadOperations`).
- This pattern is used in the **SSH example** (`packages/coding-agent/examples/extensions/ssh.ts`) to redirect all file operations to a remote machine via SSH.

**TM-06: Extension Loading & Runtime Initialization**
Extensions are loaded asynchronously via `loadExtensions(paths, cwd, eventBus?)`:
- Location: `packages/coding-agent/src/core/extensions/loader.ts:437–449`
- Each extension path is resolved (relative or absolute, supports `~` home expansion), loaded via jiti (dynamic TypeScript loader), and its factory function is executed.
- The factory receives an `ExtensionAPI` object with `registerTool()` and event subscription methods.
- Tool registration is valid immediately; action methods (sendMessage, etc.) throw during load and are bound later by the runner.

**TM-07: Permissioning & User Approval**
Built-in tools (read, bash, edit, write, grep, find, ls) can be filtered via a tools allowlist in settings.json. Custom extension tools respect this allowlist if configured by the user.
- Location: Test file `packages/coding-agent/test/suite/regressions/2835-tools-allowlist-filters-extension-tools.test.ts`
- **Per-tool permission prompts:** Not found in core. Permissioning is at the tool level (allow/deny entire tool), not per-operation.
- **Auto-approval:** Extensions don't prompt; tools are exposed to the LLM if active. User approves via settings.json (static) or can disable a tool at runtime via `/tools` command.

**TM-08: Extension Context Object**
All extension event handlers and tool.execute() receive an `ExtensionContext` with:
- `ui`: UI methods (dialogs, notifications, editor, theming, etc.)
- `cwd`: Current working directory
- `sessionManager`: Read-only access to the session history and entries
- `model`: Current LLM model
- `isIdle()`, `signal`, `abort()`: Streaming and agent state
- `getContextUsage()`, `compact()`: Context management
- Location: `packages/coding-agent/src/core/extensions/types.ts:298–327`
- **Mutation capability:** Tools can mutate tool call inputs via `tool_call` event handlers (intercepting before execution).
- Tool result handlers can intercept and modify results via `tool_result` events.

**TM-09: Minimal Extension Template**
A complete, runnable extension that adds one tool:
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function myExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Does something cool",
    parameters: Type.Object({
      input: Type.String({ description: "Input text" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `You said: ${params.input}` }],
        details: { processed: true },
      };
    },
  });
}
```
- Save as `.ts` file, load via `pi -e ./my-tool.ts` or place in `~/.pi/agent/extensions/` for auto-discovery.

**TM-10: Event-Driven Tool Customization**
Extensions intercept tool calls and results via event handlers:
- `pi.on("tool_call", (event, ctx) => { event.input.command = "sanitized"; })` — mutate arguments before execution (applies to all tools, built-in or custom).
- `pi.on("tool_result", (event, ctx) => { return { content: [...], isError: false }; })` — intercept and modify results.
- Location: `packages/coding-agent/src/core/extensions/types.ts:816–889` (event types)
- Example: The **todo.ts** extension reconstructs in-memory state by replaying tool result events during session navigation (`session_tree` event).

**TM-11: Built-in Tool Override Pattern**
To replace a built-in tool, register a tool with the same name. The extension-registered version takes precedence.
- Example: **sandbox.ts** overrides `bash` with a sandboxed version:
  ```typescript
  pi.registerTool({
    ...localBash,  // Spread the built-in definition to keep schema, label, etc.
    async execute(id, params, signal, onUpdate, _ctx) {
      // Use sandboxed bash operations
      const tool = createBashTool(localCwd, { operations: createSandboxedBashOps() });
      return tool.execute(id, params, signal, onUpdate);
    },
  });
  ```
- Location: `packages/coding-agent/examples/extensions/sandbox/index.ts:214–227`

**TM-12: Provider Registration (Custom LLM Models)**
Extensions can register new LLM providers or override existing ones via `pi.registerProvider()`:
```typescript
pi.registerProvider("my-proxy", {
  baseUrl: "https://proxy.example.com",
  apiKey: "MY_API_KEY",
  api: "anthropic-messages",
  models: [
    {
      id: "model-id",
      name: "Model Name",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 16384,
    },
  ],
});
```
- Location: `packages/coding-agent/src/core/extensions/types.ts:1240–1292`
- Registration is queued during extension load and applied when the runner binds.
- Enables custom proxies, fine-tuned models, or entirely new providers (OpenAI, Ollama, etc.).

**TM-13: MCP Bridge Strategy (Third-Party Extension)**
To add MCP support, a third-party extension should:
1. Spawn MCP server process(es) during `session_start` event.
2. For each MCP tool, call `pi.registerTool()` with a wrapper that translates MCP RPC calls to the tool definition contract.
3. Manage server lifecycle: spawn on start, kill on shutdown (via `session_shutdown` event).
4. Example structure:
   ```typescript
   export default function mcpBridge(pi: ExtensionAPI) {
     let server: ChildProcess;
     pi.on("session_start", async (event, ctx) => {
       server = spawn("mcp-server", [...args]);
       // Discover MCP tools and registerTool() for each
     });
     pi.on("session_shutdown", async () => {
       server.kill();
     });
   }
   ```
- No existing code in pi-mono implements this; it is left as an extension responsibility.
- Location: README states this is the intended path.

**TM-14: Tool Rendering & Custom Components**
Tools can provide custom rendering for both call arguments and results:
```typescript
renderCall?(args, theme, context): Component
renderResult?(result, options, theme, context): Component
```
- Location: `packages/coding-agent/src/core/extensions/types.ts:464, 467–472`
- Rendering happens in the TUI. Extensions receive `Theme` for styling and can return any `Component`.
- Example: **todo.ts** renders a full interactive todo list UI for the `/todos` command via custom component factory.

**TM-15: Cleanest Path to Ship a Third-Party Tool**
1. **Write as a standalone `.ts` file** with a default export matching `ExtensionFactory`:
   ```typescript
   export default function myExtension(pi: ExtensionAPI) { ... }
   ```
2. **Use TypeBox for parameter schema** (bundled, no install needed):
   ```typescript
   import { Type } from "typebox";
   ```
3. **Implement `execute()` with the tool definition contract** — accept `toolCallId`, `params`, `signal`, `onUpdate`, and `ctx` (ExtensionContext).
4. **Load via `-e ./path` or place in `~/.pi/agent/extensions/`** and it auto-discovers on startup.
5. **Test locally:** pi loads and runs extensions without requiring npm publish or global installation.
6. **Optional: publish as npm module** and users can load via `pi -e "npm:@scope/package"` if the extension is a module export.

**TM-16: Why No MCP in Core?**
From the linked article: MCP adds complexity (separate protocol, server lifecycle, discovery, schema translation). Pi's extension system is simpler: TypeScript code, direct APIs, no protocol overhead. Tools can be custom (via extension) or delegated to CLI tools (via Skills with embedded READMEs). Users get both flexibility and simplicity.
- This philosophy explains the decision and reflects pi's design: lightweight, embedded, no external protocol.

---

## Summary for Extension Authors

**Native MCP:** None. Pi has no first-class MCP integration.

**To add MCP support:** Write a third-party extension that spawns MCP servers and wraps their tools into `ToolDefinition` objects registered via `pi.registerTool()`. Lifecycle is managed via session events (`session_start`, `session_shutdown`).

**To ship a custom tool:** Export a default `ExtensionFactory` function that calls `pi.registerTool()` with a `ToolDefinition`. Use TypeBox for schemas. Implement `execute()` to accept the tool input and extension context. Load via `-e ./file.ts` or auto-discovery in `~/.pi/agent/extensions/`.

**Permissioning:** No per-operation prompts. Tools are active/inactive at the session level (via settings or `/tools` command). Built-in tools can be filtered; extension tools inherit the same model.

---

## Finding IDs
- TM-01: No native MCP
- TM-02: Extension tool registration API
- TM-03: ToolDefinition shape
- TM-04: Execute function signature
- TM-05: Built-in tool creation helpers (operations pattern)
- TM-06: Extension loading runtime
- TM-07: Permissioning model
- TM-08: ExtensionContext object
- TM-09: Minimal extension template
- TM-10: Event-driven tool customization
- TM-11: Built-in tool override pattern
- TM-12: Provider registration for custom models
- TM-13: MCP bridge strategy (third-party)
- TM-14: Tool rendering & custom components
- TM-15: Cleanest path to ship a third-party tool
- TM-16: Why no MCP in core (philosophy)
