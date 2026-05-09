# Context Management & Extension Hook Points

## Summary

**16 extension hook points** control context flow from user input through system prompt assembly, compaction, and model calls. The **primary context pipeline** is: **input → before_agent_start → context → model** with session lifecycle events (compact, tree navigation, fork) branching off. Three **most powerful hooks** are `before_agent_start` (modify system prompt + inject messages), `context` (rewrite message list), and `resources_discover` (extend skills/prompts/themes).

---

## Extension Hook Points in Execution Order

### Phase 1: User Input → Message Preparation

#### CM-01: input event
**File:** `extensions/types.ts:750-765`, `extensions/runner.ts:1039-1067`  
**Signature:**
```ts
on("input", (event: InputEvent, ctx) => InputEventResult | void)
```
- Fires **before** skill/template expansion, extension command detection
- Three actions: `continue` (pass through), `transform` (modify text + images), `handled` (short-circuit to skip LLM)
- Transform is **chainable** across extensions; first "handled" wins
- **Injection point:** Modify user message or pre-process input

#### CM-02: Session lifecycle discovery
**File:** `extensions/types.ts:512-519`, `extensions/runner.ts:990-1036`  
**Event:** `resources_discover`
- Fires at session startup/reload, before resource loading
- Extensions return `{ skillPaths?, promptPaths?, themePaths? }`
- Allows dynamic skill/prompt registration
- **Injection point:** Extend available skills, prompt templates, themes

---

### Phase 2: System Prompt Assembly

#### CM-03: System prompt construction options
**File:** `core/system-prompt.ts:8-25` (BuildSystemPromptOptions)
- **Before hook:** Extensions provide customPrompt, appendSystemPrompt, promptGuidelines, toolSnippets
- Built via `_rebuildSystemPrompt()` in agent-session.ts:918-952
- Loaded from resourceLoader: skills, context files (AGENTS.md/CLAUDE.md), append sections
- Order: base system prompt → append section → context files → skills → date/cwd

#### CM-04: Context file loading (AGENTS.md / CLAUDE.md)
**File:** `resource-loader.ts:58-114` (loadContextFileFromDir, loadProjectContextFiles)
- **Candidates:** AGENTS.md, AGENTS.MD, CLAUDE.md, CLAUDE.MD
- **Search path:** `agentDir` (global ~/.pi) → ancestor directories up to root
- **Deduplication:** later files only loaded if path not seen
- **Insertion:** Appended after base prompt as "# Project Context"
- **Extension override:** `agentsFilesOverride` in ResourceLoader (resource-loader.ts:146)

#### CM-05: Skills & prompt templates auto-loading
**File:** `resource-loader.ts:31`, `core/system-prompt.ts:162-165`
- Skills inserted via `formatSkillsForPrompt()` when read tool available
- Prompt templates expanded via `expandPromptTemplate()` in agent-session.ts
- **Extension override:** resourceLoader extensionFactories / resource discovery

#### CM-06: Append system prompt sections
**File:** `system-prompt.ts:48-58`, `agent-session.ts:934-937`
- Loaded via `resourceLoader.getAppendSystemPrompt()` → array of strings
- Joined with "\n\n", appended after main prompt
- **Injection point:** Extension can return appendSystemPrompt array

---

### Phase 3: Before LLM Call

#### CM-07: before_agent_start event (system prompt + custom messages)
**File:** `extensions/types.ts:624-634`, `extensions/runner.ts:924-988`  
**Signature:**
```ts
on("before_agent_start", (event: BeforeAgentStartEvent, ctx) => BeforeAgentStartEventResult | void)

interface BeforeAgentStartEvent {
  prompt: string;           // Expanded user text
  images?: ImageContent[];
  systemPrompt: string;     // Full assembled prompt
  systemPromptOptions: BuildSystemPromptOptions;  // What was loaded
}

interface BeforeAgentStartEventResult {
  message?: Pick<CustomMessage, ...>;  // Inject message into context
  systemPrompt?: string;                // Replace system prompt
}
```
- Chained: each extension's result feeds into next extension's event
- **Messages injected:** Appended as `role: "custom"` in buildSessionContext()
- **System prompt:** Last extension's override wins
- **Called in:** `AgentSession.prompt()` line 1073-1078

#### CM-08: Custom message injection (nextTurn delivery)
**File:** `agent-session.ts:1066-1070`
- Pending custom messages queued in `_pendingNextTurnMessages`
- Injected alongside user message to LLM
- Set via `pi.sendMessage(..., { deliverAs: "nextTurn" })`

#### CM-09: context event (message rewriting)
**File:** `extensions/types.ts:605-609`, `extensions/runner.ts:858-888`  
**Signature:**
```ts
on("context", (event: ContextEvent, ctx) => ContextEventResult | void)

interface ContextEvent { type: "context"; messages: AgentMessage[]; }
interface ContextEventResult { messages?: AgentMessage[]; }
```
- Fired before agent loop **after** buildSessionContext() and before LLM
- Allows rewriting entire message list
- Chained: each extension transforms the message array

---

### Phase 4: During Model Interaction

#### CM-10: before_provider_request event
**File:** `extensions/types.ts:611-614`, `extensions/runner.ts:890-922`
- Fires **after** messages assembled, **before** API request sent
- Can rewrite entire request payload (API-specific)
- Chained: each extension's result feeds into next

#### CM-11: after_provider_response event
**File:** `extensions/types.ts:617-621`
- Fires after HTTP response, before stream consumption
- Read-only: can observe status/headers but not modify
- Info: `status: number`, `headers: Record<string, string>`

---

### Phase 5: Message & Tool Execution

#### CM-12: Tool call interception (tool_call event)
**File:** `extensions/types.ts:822-830`, `extensions/runner.ts:806-856`  
**Signature:**
```ts
on("tool_call", (event: ToolCallEvent, ctx) => ToolCallEventResult | void)
// Mutable: event.input can be mutated in place to patch args
```
- Fired **before** tool execution
- **Mutation:** Direct mutation of `event.input` affects tool args
- **Block:** Return `{ block: true, reason?: string }` to prevent execution
- Per-tool variants: BashToolCallEvent, ReadToolCallEvent, etc.

#### CM-13: Tool result modification (tool_result event)
**File:** `extensions/types.ts:881-889`, `extensions/runner.ts:756-804`  
**Signature:**
```ts
on("tool_result", (event: ToolResultEvent, ctx) => ToolResultEventResult | void)

interface ToolResultEventResult {
  content?: (TextContent | ImageContent)[];  // Rewrite output
  details?: unknown;                          // Extension metadata
  isError?: boolean;                          // Change error status
}
```
- Fired **after** tool execution
- Allows transforming tool output before it reaches LLM
- Details stored in session for audit

#### CM-14: Message end event (final message override)
**File:** `extensions/types.ts:676-679`, `extensions/runner.ts:1074-1076`  
**Signature:**
```ts
on("message_end", (event: MessageEndEvent, ctx) => MessageEndEventResult | void)

interface MessageEndEventResult {
  message?: AgentMessage;  // Replace the entire message
}
```
- Fired when a message finalizes (user/assistant/tool-result)
- Must preserve role
- Last handler's result wins

---

### Phase 6: Session Lifecycle & Compaction

#### CM-15: session_before_compact event
**File:** `extensions/types.ts:536-542`, agents/types.ts:1097-1099`  
**Signature:**
```ts
on("session_before_compact", (event: SessionBeforeCompactEvent, ctx) => SessionBeforeCompactResult | void)

interface SessionBeforeCompactResult {
  cancel?: boolean;
  compaction?: CompactionResult;  // Extension-generated summary
}
```
- Extension can **generate entire compaction** and bypass pi's compaction logic
- Preparation data provided: branchEntries, customInstructions, signal
- **Injection point:** Custom summarization algorithms

#### CM-16: session_before_tree event (branch summarization)
**File:** `extensions/types.ts:574-580`, `extensions/runner.ts:1147-1217`  
**Signature:**
```ts
on("session_before_tree", (event: SessionBeforeTreeEvent, ctx) => SessionBeforeTreeResult | void)

interface SessionBeforeTreeResult {
  cancel?: boolean;
  summary?: { summary: string; details?: unknown };
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}
```
- Fired when navigating session tree (fork, goto entry)
- Extension can provide custom branch summary
- Replaces default compaction summarization

---

## Context Flow: Step-by-Step Execution Path

```
USER INPUT
  ↓
[CM-01: input event] ← Extension can intercept/transform/handle
  ↓
Extension command check → /command dispatch
  ↓
Skill expansion & prompt template expansion
  ↓
[CM-02: resources_discover] ← Extension provides skill/prompt/theme paths
  ↓
buildSystemPrompt()
  ├─ Base system prompt from default or customPrompt
  ├─ [CM-04] Load AGENTS.md/CLAUDE.md from cwd + ancestors
  ├─ [CM-05] Load skills (if read tool available)
  ├─ [CM-06] Append system prompt sections
  └─ Add date + working directory
  ↓
sessionManager.buildSessionContext()
  ├─ Walk session tree root → leaf
  ├─ Handle compaction entries (emit summary first)
  └─ Collect messages (custom_message, branch_summary, compaction_summary)
  ↓
[CM-07: before_agent_start event]
  ├─ Extension reads: systemPrompt, systemPromptOptions
  ├─ Extension can: inject custom messages, replace systemPrompt
  └─ Chained: N extensions, last systemPrompt wins
  ↓
[CM-08] Inject _pendingNextTurnMessages alongside user message
  ↓
Build final message array:
  user message + custom messages from before_agent_start + pending messages
  ↓
[CM-09: context event] ← Extension can rewrite entire message list
  ↓
Set agent.state.systemPrompt & agent.state.messages
  ↓
agent.prompt(messages) ← Triggers agent loop
  ↓
[CM-10: before_provider_request] ← Extension can rewrite API payload
  ↓
HTTP request sent
  ↓
[CM-11: after_provider_response] ← Read-only: observe status/headers
  ↓
AGENT LOOP (tool call → execution → result)
  ├─ [CM-12: tool_call] ← Extension can patch args or block execution
  ├─ Tool executes
  ├─ [CM-13: tool_result] ← Extension can rewrite output
  └─ Result fed back to LLM
  ↓
[CM-14: message_end] ← Extension can override finalized message
  ↓
Session persisted → SessionEntry appended
  ↓
COMPACTION CHECK (context tokens > threshold)
  ├─ [CM-15: session_before_compact] ← Extension can generate summary
  └─ Compaction entry stored if needed
  ↓
Response complete
```

---

## Most Powerful Hooks for Novel Behavior

### 🥇 **CM-07: before_agent_start**
- **Why:** Controls both system prompt AND message injection simultaneously
- **Use case 1:** Inject domain-specific context ("you are a CLI debugger") + relevant code files before each turn
- **Use case 2:** Intercept system prompt to add real-time metrics/status to instructions
- **Use case 3:** Inject "now" context (current git branch, uncommitted files, failing tests) as custom message

### 🥈 **CM-09: context**
- **Why:** Rewrites entire message list (including session history) before LLM sees it
- **Use case 1:** Implement context windowing (keep last N turns + first M turns)
- **Use case 2:** Dynamic message filtering (hide certain tool calls from LLM, show summaries)
- **Use case 3:** Inject "synthetic" messages (e.g., AI-mediated user corrections)
- **Note:** Runs **after** compaction and buildSessionContext, so has final say

### 🥉 **CM-02 + CM-04: Resource Discovery & Context Files**
- **Why:** Extend what gets loaded into system prompt without code changes
- **Use case 1:** Extension auto-discovers `.pi/context.md` → auto-loads as context file
- **Use case 2:** Dynamic skill registration based on cwd (detect Go project → load Go-specific skills)
- **Use case 3:** Load project-specific theme/prompt templates from extension sources

---

## Extension Hooks Cannot Directly Reach

- **Session replay:** Cannot intercept earlier messages (CM-09 only sees what buildSessionContext returns)
- **Compaction tuning:** Can override entire compaction (CM-15) but cannot tune default algorithm (reserved to pi core)
- **Model selection:** Cannot intercept model.prompt() call; use "context" event to manipulate messages instead
- **Tool registration:** registerTool() happens at extension load time, not dynamically per turn

---

## Key Data Structures

### BuildSystemPromptOptions (CM-03)
```ts
{
  customPrompt?: string;           // Replaces default prompt entirely
  selectedTools?: string[];        // Active tools
  toolSnippets?: Record<string, string>;  // One-liner for each tool
  promptGuidelines?: string[];     // Extra guidelines
  appendSystemPrompt?: string;     // Extra section appended
  cwd: string;
  contextFiles?: Array<{ path: string; content: string }>;  // From CM-04
  skills?: Skill[];                // From CM-05
}
```

### CustomMessage (extension message injection)
```ts
interface CustomMessage<T = unknown> {
  customType: string;              // "my_domain_context", "test_runner_status", etc.
  content: string | (TextContent | ImageContent)[];
  display: boolean;                // TUI rendering flag
  details?: T;                      // Extension-specific metadata
}
```

### CompactionEntry (session persistence for extensions)
```ts
interface CompactionEntry<T = unknown> {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: T;                      // Extension data (ArtifactIndex, etc.)
  fromHook?: boolean;              // True if from CM-15
}
```

---

## Finding Inventory

| ID | Hook | Type | Signature Location | Execution Order |
|---|---|---|---|---|
| CM-01 | input | Transform | types.ts:750 | Early: before skill expansion |
| CM-02 | resources_discover | Discovery | types.ts:495 | Early: at startup/reload |
| CM-03 | buildSystemPrompt options | Config | system-prompt.ts:8 | Build-time |
| CM-04 | Context file loading | Auto-load | resource-loader.ts:58 | Build-time |
| CM-05 | Skills & templates | Auto-load | core/system-prompt.ts:162 | Build-time |
| CM-06 | Append section | Auto-load | system-prompt.ts:48 | Build-time |
| CM-07 | before_agent_start | Inject+Override | types.ts:624 | Pre-LLM |
| CM-08 | Custom message queue | Inject | agent-session.ts:1066 | Pre-LLM |
| CM-09 | context | Rewrite | types.ts:605 | Pre-LLM (final) |
| CM-10 | before_provider_request | Override | types.ts:611 | During call |
| CM-11 | after_provider_response | Read-only | types.ts:617 | During call |
| CM-12 | tool_call | Block/Patch | types.ts:822 | Before execution |
| CM-13 | tool_result | Rewrite | types.ts:881 | After execution |
| CM-14 | message_end | Override | types.ts:676 | On finalization |
| CM-15 | session_before_compact | Override | types.ts:536 | On compaction |
| CM-16 | session_before_tree | Override | types.ts:574 | On tree nav |

---

## Related Code Locations

- **Session context building:** `session-manager.ts:315-422` (buildSessionContext function)
- **System prompt rebuild:** `agent-session.ts:918-952` (_rebuildSystemPrompt)
- **Prompt execution:** `agent-session.ts:967-1111` (prompt method entry)
- **Extension runner core:** `extensions/runner.ts:224-1068` (event dispatch)
- **Resource loading:** `resource-loader.ts:153-300+` (DefaultResourceLoader)
- **Compaction trigger:** `agent-session.ts:1595-1700+` (_checkCompaction)

