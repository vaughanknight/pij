# Workshop: pij dev loop — edit → reload → test

**Type**: Integration Pattern + CLI Flow
**Plan**: 001-pi-extensions
**Spec**: (no spec yet — workshop seeded from research dossier)
**Created**: 2026-05-09
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Loading extensions into pi](001-loading-extensions-into-pi.md)
- [Research dossier](../research-dossier.md)
- [`findings/01-extension-api.md`](../findings/01-extension-api.md) — full ExtensionAPI surface
- [`findings/05-context-management.md`](../findings/05-context-management.md) — what gets re-emitted on reload
- pi-mono `packages/coding-agent/docs/extensions.md` § Lifecycle, § ctx.reload, § Error Handling
- pi-mono `packages/coding-agent/docs/development.md` § Debug Command (`/debug`)
- pi-mono `AGENTS.md` § Testing pi Interactive Mode with tmux

**Domain Context**:
- **Primary**: future `extensions/` domain — this is its dev infrastructure
- **Related**: future `harness/` (per Boot/Interact/Observe — not yet established)

---

## Purpose

Pi runs as a long-lived TUI process. Re-launching pi every time you edit a `.ts` file is friction we can't afford. This workshop nails the actual edit-reload-test cycle: what `/reload` does, what it doesn't, what state survives, and how to debug when things go wrong. It also covers the **headless** alternatives (print mode, RPC mode, SDK) for cases where you'd rather iterate without the TUI in the loop.

## Key Questions Addressed

- What does `/reload` actually do? Which event hooks fire? In what order?
- Does pi watch files automatically, or do we have to type `/reload` ourselves?
- What state survives a reload, and what gets blown away?
- Can extensions trigger their own reload (`ctx.reload()`)?
- Where do errors show up if my extension throws on load?
- How do I `console.log`-debug an extension when stdout is owned by the TUI?
- Is there a way to develop without launching the full TUI on every iteration?
- How do I write tests for an extension?

---

## The reload semantics — what `/reload` actually does

```
              user types /reload  (or extension calls await ctx.reload())
                                │
                                ▼
            ┌────────────────────────────────────────────────┐
            │ session_shutdown { reason: "reload" }          │ 1. tear down old runtime
            └────────────────────────────────────────────────┘
                                │
                                ▼
            ┌────────────────────────────────────────────────┐
            │ runner re-discovers + re-loads all extensions  │ 2. fresh imports via jiti
            │   • reads ~/.pi/agent/extensions/ + .pi/...    │
            │   • reads settings.json packages[]+extensions[]│
            │   • runs each default-export factory again     │
            │   • applies queued register* calls             │
            └────────────────────────────────────────────────┘
                                │
                                ▼
            ┌────────────────────────────────────────────────┐
            │ session_start { reason: "reload" }             │ 3. extensions get a fresh start
            └────────────────────────────────────────────────┘
                                │
                                ▼
            ┌────────────────────────────────────────────────┐
            │ resources_discover { reason: "reload" }        │ 4. dynamic skill/prompt/theme paths
            └────────────────────────────────────────────────┘
                                │
                                ▼
                       agent loop resumes
                  (same session file, same history)
```

**Things to notice**:

- The **session file** is preserved. Conversation history is intact. Compaction state is preserved.
- The **extension instance** is *not* preserved — your factory runs from scratch.
- jiti **re-evaluates the source** — code edits are picked up.
- Provider registrations queued during the factory are flushed.
- Tools/commands/shortcuts/flags are re-registered.

### What pi does NOT do automatically

> Pi has **no file watcher**. There is no `--watch` mode. Source changes are picked up only when you explicitly type `/reload` (or an extension calls `await ctx.reload()`).

This is a deliberate choice — file watchers in TUIs cause flicker, half-loaded states, and racing factories. Manual reload keeps the model crisp.

### The two reload "free passes"

Some `register*` calls **don't** need a reload:

| API | Reload needed? | Notes |
|-----|----------------|-------|
| `pi.registerTool` | ❌ No, post-startup calls take effect immediately | Tool appears in `pi.getAllTools()` instantly |
| `pi.registerProvider` | ❌ No, post-startup calls take effect immediately | New models selectable next turn |
| `pi.registerCommand` | ✅ Yes — full reload required | Commands are wired into the slash dispatcher at load |
| `pi.registerShortcut` | ✅ Yes | Keybinding map rebuilt at load |
| `pi.registerFlag` | ✅ Yes (and a relaunch — flags parse at CLI startup) | The CLI parser only sees flags registered before argv is parsed |
| `pi.registerMessageRenderer` | ✅ Yes | Renderer table rebuilt at load |
| `pi.on(event, …)` subscription | ✅ Yes | Handler list rebuilt at load |

So if you're iterating on **tool implementations** (the most common case — tweaking the body of an `execute` function), you don't even need `/reload` *for new tools added at runtime via a command handler*. But for "I edited a tool's source and want the new code", you do need `/reload` (jiti re-evaluates the file). The "free pass" is for *adding* tools mid-session, not for *editing* their source.

---

## State survival across `/reload`

```
┌──────────────────────────────────────────────────────────────┐
│ SURVIVES the reload:                                         │
│   • Session file (history of user/assistant/tool messages)   │
│   • Compaction summaries already in the entry list           │
│   • CustomEntry data written via pi.appendEntry(...)         │
│   • Session name, labels                                     │
│   • cwd                                                      │
│   • The current model + thinking level                       │
│                                                              │
│ DOES NOT SURVIVE:                                            │
│   • Module-level `let x = 0;` / closure variables            │
│   • Map / Set / class instances created at factory load      │
│   • In-flight Promises (cancelled via session_shutdown)      │
│   • Spawned child processes the extension didn't kill        │
│   • Tool/command/shortcut registrations (re-built from src)  │
└──────────────────────────────────────────────────────────────┘
```

### Pattern: rehydrate state via appendEntry on `session_start`

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

let counter = 0;

export default function (pi: ExtensionAPI) {
  // Rehydrate from session — works after both initial load AND /reload
  pi.on("session_start", async (event, ctx) => {
    const last = ctx.sessionManager.entries
      .filter((e) => e.type === "custom" && e.customType === "counter:state")
      .at(-1);
    counter = (last?.data as { value?: number } | undefined)?.value ?? 0;

    if (event.reason === "reload") {
      ctx.ui.notify(`Reloaded — counter restored to ${counter}`, "info");
    }
  });

  pi.registerCommand("bump", {
    description: "Bump the counter",
    handler: async (_args, ctx) => {
      counter++;
      pi.appendEntry("counter:state", { value: counter });   // crystallize
      ctx.ui.notify(`counter = ${counter}`, "info");
    },
  });
}
```

After `/reload`, `counter` is rebuilt from the latest `counter:state` entry in the session. This is the canonical pattern for any stateful extension.

---

## Programmatic reload — `ctx.reload()`

Extensions can trigger reload from a command handler:

```typescript
pi.registerCommand("reload-pij", {
  description: "Reload pij extensions",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;     // ← return immediately. See gotcha below.
  },
});
```

### The `await ctx.reload()` gotcha (from extensions.md § ctx.reload)

> Code after `await ctx.reload()` still runs from the **pre-reload version** of the file. Code after `await ctx.reload()` must not assume old in-memory extension state is still valid.
>
> For predictable behavior, treat reload as terminal for that handler (`await ctx.reload(); return;`).

i.e. don't try to do post-reload setup in the same handler. Move it to the next `session_start { reason: "reload" }`.

### Tools cannot call `ctx.reload()`

`ToolDefinition.execute` receives an `ExtensionContext`, not the command-context flavour. To reload from an LLM-callable tool, register a tool that **queues a follow-up command**:

```typescript
pi.registerTool({
  name: "reload_runtime",
  label: "Reload",
  description: "Reload pij extensions",
  parameters: Type.Object({}),
  async execute(_id, _params, _signal, _onUpdate, _ctx) {
    pi.sendUserMessage("/reload-pij", { deliverAs: "followUp" });
    return {
      content: [{ type: "text", text: "Queued /reload-pij." }],
      details: {},
    };
  },
});
```

(Pattern lifted directly from `pi-mono/packages/coding-agent/examples/extensions/reload-runtime.ts`.)

---

## Errors during load — where they show up

| Failure mode | Where it surfaces |
|---|---|
| Syntax error in `.ts` | `pi` startup or `/reload` fails with a stack trace at the top of the TUI; the offending extension is skipped, others continue to load |
| Throw inside the factory function | Same as above — startup/reload prints the stack, that extension is skipped |
| Unhandled promise rejection in event handler | TUI toast (`error`-style notification) + entry in `~/.pi/agent/pi-debug.log` (when `/debug` is on) |
| Tool `execute()` throws | The tool result becomes an error message visible to the LLM; pi keeps running |
| Type mismatch between params + Type.Object schema | Caught at runtime when the LLM calls the tool — schema validation rejects the call before `execute` runs |
| Invalid `pi.registerProvider` config | Logged at next provider-bind step; provider is unavailable |

**`/debug`** (a hidden, undocumented-in-help slash command) toggles a debug log at `~/.pi/agent/pi-debug.log`:
```
> /debug
✓ debug logging enabled → ~/.pi/agent/pi-debug.log
```
The log captures: rendered TUI lines (with ANSI), last messages sent to the LLM, and runtime errors. Tail it during dev:

```bash
tail -f ~/.pi/agent/pi-debug.log
```

---

## Debugging — getting output without owning the screen

`console.log` collides with the TUI's terminal control. Two reliable channels:

### 1. `ctx.ui.notify` — toast in the TUI

```typescript
ctx.ui.notify(`tool received: ${JSON.stringify(params)}`, "info");
```

### 2. Write to the debug log directly

```typescript
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEBUG_LOG = join(homedir(), ".pi", "agent", "pij-debug.log");

function log(...args: unknown[]) {
  appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${args.map(String).join(" ")}\n`);
}
```

Then `tail -f ~/.pi/agent/pij-debug.log` in another pane. This survives reload, doesn't need `/debug` to be on, and gives you full structured output.

### 3. The footer status line

For long-running tools, mark progress in a place users won't miss:

```typescript
ctx.ui.setStatus("pij-mcp", "spawning servers…");
// later
ctx.ui.setStatus("pij-mcp", undefined);     // clear
```

---

## Headless dev loops (when you'd rather not boot the TUI)

For testing logic that doesn't need keyboard interaction, three options that bypass the TUI:

### a) Print mode — single prompt, no interactive UI

```bash
pi --print "use the /hello command and tell me what happens"
```

Loads extensions, runs one prompt, prints result, exits. Auto-discovery still applies (so `cd pij; pi --print ...` will load pij extensions). Good for smoke-testing tools end-to-end.

### b) JSON mode — same as print, machine-readable

```bash
pi --print --json "..." | jq .
```

Useful in CI to assert your tool produces the expected JSON-shaped result.

### c) RPC mode — send commands programmatically over JSONL

```bash
pi --mode rpc < commands.jsonl > output.jsonl
```

Each line is a JSON-RPC request/response. Read `pi-mono/packages/coding-agent/docs/rpc.md` for the protocol. This is how editor integrations drive pi; it's also a great way to drive end-to-end tests.

### d) SDK — embed pi in a Node script

```typescript
// pij/scripts/dev-harness.ts
import { createAgentSession } from "@earendil-works/pi-coding-agent";

const session = await createAgentSession({
  cwd: process.cwd(),
  extensions: ["./.pi/extensions/hello.ts"],
  model: { provider: "anthropic", id: "claude-sonnet-4-6" },
});

const result = await session.prompt("/hello jordan");
console.log(result);
await session.shutdown();
```

Run with `npx tsx scripts/dev-harness.ts`. Lets you write scenario tests without ever opening a terminal UI.

---

## The tmux pattern — driving the real TUI from a script

Lifted from pi-mono `AGENTS.md` § Testing pi Interactive Mode with tmux. Useful when you *do* need the TUI behaviour (renderers, custom UI, keyboard handlers):

```bash
# 1. Headless tmux session at known dimensions
tmux new-session -d -s pij-test -x 100 -y 30

# 2. Boot pi from pij root
tmux send-keys -t pij-test "cd /Users/jordanknight/pi-hacking/pij && pi" Enter
sleep 3      # allow startup

# 3. Drive it
tmux send-keys -t pij-test "/hello jordan" Enter
sleep 2

# 4. Capture the screen
tmux capture-pane -t pij-test -p

# 5. Reload after editing
tmux send-keys -t pij-test "/reload" Enter
sleep 2
tmux capture-pane -t pij-test -p

# 6. Cleanup
tmux kill-session -t pij-test
```

Wrap that in a `pij-tui-smoke.sh` script and you have a repeatable end-to-end check that survives any TUI rendering quirk.

---

## The recommended dev cycle (one-screen summary)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  TERMINAL A — pi running                                                │
│  ────────────────────────────                                           │
│  $ cd ~/pi-hacking/pij                                                  │
│  $ pi                                                                   │
│   …TUI…                                                                 │
│  >                                                                      │
│                                                                         │
│  TERMINAL B — your editor                                               │
│  ────────────────────────────                                           │
│  vim .pi/extensions/hello.ts                                            │
│                                                                         │
│  TERMINAL C — type-check on save (optional but recommended)             │
│  ──────────────────────────────────                                     │
│  $ npx tsc --noEmit --watch                                             │
│   ✓ no errors                                                           │
│                                                                         │
│  TERMINAL D — debug log tail (optional, when actively chasing a bug)    │
│  ──────────────────────────────────                                     │
│  $ tail -f ~/.pi/agent/pij-debug.log                                    │
│                                                                         │
│                                                                         │
│  cycle:  edit (B) → save → /reload (A) → test (A) → repeat              │
│                              │                                          │
│                              └─► tsc-watch (C) catches type errors      │
│                                  before /reload would explode           │
└─────────────────────────────────────────────────────────────────────────┘
```

The loop is: **edit → save → `/reload` → test**. Type-check in a separate tab so type errors don't get smuggled to runtime.

---

## Failure-mode quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `/hello` not registered after editing the file | You forgot `/reload` (no auto-watch) | Type `/reload` in the TUI |
| `/reload` says "extension failed: SyntaxError" | TS syntax broken | Read stack at top of TUI; fix; `/reload` |
| Extension loads but my command does nothing | Handler threw silently | Add `try/catch` + write to `~/.pi/agent/pij-debug.log`; or wrap with `ctx.ui.notify` |
| Tool param schema rejects calls the LLM tries | TypeBox schema doesn't match what model produces | Check `parameters: Type.Object({...})` matches the description in `description` |
| Module-level state lost after `/reload` | Expected — factory re-runs | Use `pi.appendEntry` + rehydrate on `session_start` |
| Stale code runs after `await ctx.reload()` | Pre-reload code-path continues; only fresh modules see new code | Treat reload as terminal: `await ctx.reload(); return;` |
| `package.json` deps not resolved | Forgot `npm install` after editing it | Run `npm install` next to the extension; `/reload` |
| `peerDependencies` errors after `pi install` | npm prod-install dropped peer deps | Move pi-bundled types to `peerDependencies: "*"`, runtime code to `dependencies` |
| Flag `--my-flag` not recognized | Flags must be registered before `argv` parses → restart pi | Quit + relaunch (flags can't be registered live) |
| Command name collision | Two extensions registered same name | Pi disambiguates as `name:1`, `name:2`. Rename one, `/reload` |

---

## Open Questions

### Q1: Do we want a file-watcher wrapper script?

**OPEN**: Pi has no built-in watcher and it's a deliberate choice. But we could ship a `pij-watch.sh` that:
1. Starts pi in tmux.
2. Uses `fswatch` / `entr` on `.pi/extensions/`.
3. On change, sends `/reload\n` to the tmux session.

Tradeoff: re-introduces the flicker pi avoided, but speeds the loop. Recommend trying without first; build the watcher only if `/reload` finger-fatigue is real.

### Q2: How do we run automated tests for extensions?

**OPEN — three candidates**:
- A) **SDK-based tests** — `createAgentSession` + a faux provider (`packages/coding-agent/test/suite/harness.ts` shows the pattern in pi-mono itself).
- B) **RPC-mode integration tests** — drive pi via JSONL fixtures.
- C) **tmux-based UI smoke tests** — for renderer and keyboard logic.

Recommend (A) for unit-ish tests, (B) for end-to-end without UI, (C) only when (A)+(B) can't catch the bug.

### Q3: Should we wire the `/debug` log into a permanent dev pane?

**RESOLVED**: Yes — the recommended dev cycle has terminal D tailing `~/.pi/agent/pij-debug.log`. Use `/debug` once at the start of a session to enable it.

### Q4: Can we get TS errors in the TUI directly, instead of in terminal C?

**RESOLVED — no**: jiti loads at runtime and surfaces errors as runtime stack traces. There's no in-TUI type checker. Run `tsc --noEmit --watch` in a separate tab — that's the canonical workflow per pi-mono's AGENTS.md.

### Q5: Do skills/prompts/themes also reload via `/reload`?

**RESOLVED — yes**: `/reload` re-runs `resources_discover { reason: "reload" }`, which re-walks `.pi/skills/`, `.pi/prompts/`, `.pi/themes/` and the equivalents from installed packages. Edit a SKILL.md, `/reload`, the new content shows up.

### Q6: What if I want to debug startup before any TUI is alive?

**OPEN**: Two options today:
- Set `PI_DEBUG=1` (if pi honours it — confirm via `pi --help`).
- Use SDK mode with `console.log` (no TUI competing for stdout).

If neither pans out, that's a feature gap to file upstream (a `--log-startup-to <file>` flag).

---

## Quick Reference

```bash
# THE DEV LOOP
cd /Users/jordanknight/pi-hacking/pij
pi
# (in TUI) type /reload after editing

# TYPE-CHECK IN PARALLEL
npx tsc --noEmit --watch

# ENABLE DEBUG LOG (in TUI)
/debug
# tail in another shell:
tail -f ~/.pi/agent/pi-debug.log

# YOUR-OWN STRUCTURED LOG (recommended)
tail -f ~/.pi/agent/pij-debug.log

# HEADLESS TESTS
pi --print "drive my extension"           # one-shot
pi --print --json "..." | jq              # machine-readable
pi --mode rpc < cmds.jsonl                # JSONL-driven E2E
npx tsx scripts/dev-harness.ts            # SDK-embedded

# TMUX SMOKE TEST
tmux new-session -d -s pij -x 100 -y 30
tmux send-keys -t pij "cd ~/pi-hacking/pij && pi" Enter
sleep 3
tmux send-keys -t pij "/hello world" Enter
sleep 2
tmux capture-pane -t pij -p
tmux kill-session -t pij

# RELOAD FROM AN EXTENSION (command handler only — not from a tool)
await ctx.reload();
return;     // treat as terminal!

# REGISTER WITHOUT NEEDING /reload (post-startup adds)
pi.registerTool({...});       // ← OK, immediately callable
pi.registerProvider(...);     // ← OK, immediately usable
```

---

## See Also

- Workshop 001 — How extensions get loaded (the *what*; this workshop is the *how to iterate on it*)
- pi-mono `examples/extensions/reload-runtime.ts` — canonical example of the reload-tool-handoff pattern
- pi-mono `examples/extensions/file-trigger.ts` — file watcher *inside* an extension (interesting if we want to react to file changes outside `.pi/extensions/`, e.g. failing tests)
- pi-mono `examples/extensions/snake.ts` — useful only as proof that `ctx.ui.custom` + keyboard handlers work; helpful when debugging UI-heavy extensions
