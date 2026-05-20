# Research Dossier: How `ctx_*` (lean-ctx) Works and Its Effect on LLM Prompt Caching

**Generated**: 2026-05-21
**Research Query**: "explore how ctx_ works. create new dossier. I want to know what it does, how it does it and why it's important. also I want to know how it affects LLM context caching upstream (cache tokens etc) and does it invalidate the token cache on the server?"
**Mode**: Pre-Plan / Research-Only
**Location**: `docs/plans/012-lean-ctx-research/`
**FlowSpace**: Not used this run (lenses used direct file reads + perplexity)
**Subagent lenses**: 8 (extension source, CLI binary, Anthropic cache, OpenAI/Gemini cache, cache-interaction synthesis, pij usage, prior learnings, domain & boundary)
**Findings**: ~75 across all lenses

---

## Executive Summary

### What it does

`ctx_*` is a family of tool-call interceptors provided by the **pi-lean-ctx** Pi extension (`npm:pi-lean-ctx@3.6.6`). It registers six replacements for Pi's built-in read/shell/grep/find/ls tools (`ctx_read`, `ctx_shell`, `ctx_grep`, `ctx_find`, `ctx_ls`, plus a `lean_ctx` passthrough) and routes each call through the `lean-ctx` Rust binary (`/opt/homebrew/bin/lean-ctx`, v3.6.0). The Rust binary compresses tool output — typically 60–96 % token savings on `map`/`signatures`/cache_hit modes — and returns a smaller payload to the LLM. The extension formats the payload, appends a `Compressed N → M tokens (-X %)` footer, and hands the result block back to Pi for delivery to the upstream model.

### Why it's important

For an agent loop that reads code, runs commands, and feeds the output back into the model, the **tool-result content is the single largest input-token category**. Shrinking it 10× shrinks the most expensive input bucket on every provider:

- On Anthropic, the volatile tail below the last `cache_control` breakpoint is billed at full 1.0× input rate — exactly where lean-ctx's savings concentrate. (ANT-07.)
- On OpenAI and Gemini, smaller tool results lower input billed at full rate AND reduce the data needed to cross the 1024-token cacheable-prefix floor. (OPT-01, OPT-06.)
- Less obvious: it lets Pi keep more conversation history in the same cache window, raising effective context per minute of wall-clock time.

### The cache question (short answer)

**Does ctx_ invalidate the server-side prompt cache?** No, when used as designed. Yes, if you misuse it.

Cache hits on every major provider are exact-prefix matches keyed on the linearised request (`tools` → `system` → `messages`). Compression affects cache outcomes via two paths:

1. **Tool-definition footprint.** Adding ~6 ctx_* tools adds ~1,200 tokens to the cached prefix. This is paid once per cache window (1.25× write on Anthropic, 1.0× write equivalent on OpenAI/Gemini) and read at 0.1× on every subsequent turn. **Net break-even ≈ 2 turns** in a normal session.
2. **Tool-result content stability.** If `ctx_*` output is byte-deterministic for the same input, the next turn's prefix is identical → cache hits. If output varies (auto-mode flipping at size boundaries, entropy-mode bandit exploration, MCP state tools), the cache breaks at the diverging byte for that turn and beyond.

The dangerous modes are `auto`, `entropy`, `task` and the MCP state tools (`ctx_session`, `ctx_knowledge`). The safe modes are `full`, explicit `map`/`signatures`, `lines:N-M`, and `reference`. Recommended pij config: `LEAN_CTX_PI_MODE=replace`, MCP disabled unless semantic features are needed, system prompt forces `mode=full` for any file the agent intends to edit.

### Key insights (ranked)

1. **lean-ctx is a 52 MB Rust binary** with ~60 MCP tools, only ~7 of which are surfaced via the pi-lean-ctx wrapper — there is a large unused capability surface (CCP sessions, Context Ledger handoff, PR context packs, property-graph indexing, dashboards). [CLI-03, CLI-12]
2. **`auto` mode is a 4-tier decision tree**, not a file-size heuristic: instruction-file override → `FileSignature` ML predictor → budget-tight bandit override → adaptive policy. The bandit alone makes `auto` **non-deterministic across sessions** and therefore **cache-hostile**. [CLI-07, SYN-01]
3. **The "60–95 % token savings" headline is mode-specific**: benchmark corpus shows `map` 96.0 %, `signatures` 95.7 %, `cache_hit` 99.6 %, but `aggressive` only 4.1 % and `entropy` only 0.4 %. The marketing applies cleanly to `map`/`signatures` reads of medium-to-large source files; `aggressive`/`entropy` paths are weak. [CLI-10]
4. **Anthropic's prompt cache is the most lean-ctx-friendly** of the three majors because the developer controls breakpoint placement; OpenAI and Gemini both use automatic left-anchored prefix matching, so a 1-byte tool-result diff inside the first 1024 tokens kills caching for the entire request. [ANT-06, OPT-04, OPT-05, OPT-08]
5. **pij has already explored this in plan 006-pi-context-management**: lean-ctx is the "workhorse" of the recommended context stack (plus `pi-context-prune`, `pi-airgun`), and `npm:pi-lean-ctx` is the only one of the three vetted (score 100). The Claude Code global rule (`~/.claude/rules/lean-ctx.md`) and pij's `.pi/APPEND_SYSTEM.md` both encode the "always prefer ctx_*" preference. [PL-01, PL-02, PIJ-01]

### Quick stats

- **Wrapper**: TypeScript Pi extension at `~/.pi/agent/npm/node_modules/pi-lean-ctx/extensions/index.ts` (1018 LOC equiv. by file size)
- **Engine**: Single 52 MB Rust Mach-O binary, Apache-2.0, ~89 % Rust
- **Tools registered**: 6 CLI-backed (always) + ~9 MCP-bridge tools (if `LEAN_CTX_PI_ENABLE_MCP=1`)
- **Read modes**: 10 (`auto`, `full`, `map`, `signatures`, `task`, `reference`, `aggressive`, `entropy`, `diff`, `lines:N-M`)
- **Benchmark corpus**: 50 files, 266.9 K tokens, fixed
- **Tokens per ctx_ tool def (Anthropic encoding, est.)**: 200–300, ~1,200 total prefix tax
- **Anthropic cache discount**: cache writes 1.25× base (5m) / 2.0× (1h); cache reads 0.1× base
- **Break-even on prefix tax**: ~2 turns
- **Prior learnings**: 5 from plan 006 (context management survey), plan 009 (vetting), and AGENTS.md
- **Domain fit**: not cleanly inside any existing pij domain; recommended action = add a "token-optimizing tool compression" concept to `agent-tooling-interface`

---

## 1. How it currently works

### 1.1 Two-layer architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Pi runtime                                                  │
│  (loads extensions from ~/.pi/agent/extensions and packages) │
└──────┬───────────────────────────────────────────────────────┘
       │ extension load
       ▼
┌──────────────────────────────────────────────────────────────┐
│  pi-lean-ctx (TypeScript wrapper)                            │
│  ~/.pi/agent/npm/node_modules/pi-lean-ctx/                   │
│   extensions/index.ts   ← registers ctx_* tools              │
│   extensions/mcp-bridge.ts ← optional MCP bridge             │
│   extensions/types.ts                                        │
└──────┬───────────────────────────────────────────────────────┘
       │ spawn / exec
       ▼
┌──────────────────────────────────────────────────────────────┐
│  lean-ctx (Rust binary, 52 MB)                               │
│  /opt/homebrew/bin/lean-ctx (Homebrew: yvgude/lean-ctx)      │
│   rust/src/cli/         ← argv parsing                       │
│   rust/src/tools/ctx_*.rs ← ~60 MCP tools                    │
│   rust/src/shell/compress/ ← per-cmd compression engine      │
│   rust/src/core/        ← bandit, AST, BM25, policy          │
│   rust/src/hooks/agents/pi.rs ← pi-aware integration         │
└──────────────────────────────────────────────────────────────┘
```

The wrapper is a thin shell-out layer; all real compression logic lives in the Rust binary.

### 1.2 Tool registration

The wrapper registers exactly 6 tools at extension load time (`index.ts:324–575`):

| Tool         | Replaces (Pi builtin) | Routing                                           |
|--------------|-----------------------|---------------------------------------------------|
| `ctx_read`   | `read` / `cat`        | `lean-ctx read <abs-path> -m <mode> [--fresh]`    |
| `ctx_shell`  | `bash`                | spawn-hook wraps as `lean-ctx -c <command>`       |
| `ctx_ls`     | `ls`                  | `lean-ctx ls <abs-path>`                          |
| `ctx_find`   | `find`                | `lean-ctx find <pattern> <abs-path>`              |
| `ctx_grep`   | `grep`                | `lean-ctx -c rg --line-number ...` (rg-wrapped)   |
| `lean_ctx`   | (additive only)       | direct CLI passthrough — any subcommand           |

Every invocation passes `LEAN_CTX_COMPRESS=1` and `LEAN_CTX_SAVINGS_FOOTER=always` in the child env (`index.ts:285, 310, 345, 545`).

### 1.3 Modes and the `auto` decision tree

The CLI exposes ten read modes (CLI-05). The wrapper's `chooseReadMode()` (`index.ts:131–142`) implements a coarse client-side fallback **only** when no mode is specified — pure function of `(extension, file-size-in-bytes)`:

```
ext in FULL_READ_EXTENSIONS         → "full"   (configs, .env, .yaml, .toml, .json)
ext NOT in CODE_EXTENSIONS:
  size > 48 KB                      → "map"
  otherwise                         → "full"
ext in CODE_EXTENSIONS:
  size >= 96 KB                     → "signatures"
  size >= 8 KB                      → "map"
  otherwise                         → "full"
```

If the agent passes `mode=auto`, the wrapper still forwards `-m auto` and the **binary** picks the mode using a much richer decision tree (CLI-07):

1. **Instruction-file override** — paths matching `.cursorrules`, `skill.md`, `agents.md`, `lean-ctx.md`, or anything under `/skills/` or `/.cursor/rules/` are forced to `full`. This is why agent rule files are never compressed.
2. **`FileSignature` ML predictor** — extension/length/content-shape features fed into a `ModePredictor` whose weights are baked into the binary.
3. **Budget-tight bandit override** — if `original_tokens > 2000 && budget_ratio < 0.25`, the predictor's pick is overridden to `aggressive`.
4. **Adaptive policy layer** — `policy.choose_auto_mode(task, &predicted)` applies session/task overrides to produce the final mode.

> **Critical finding**: passing `mode=auto` therefore does NOT guarantee a stable mode for the same file across calls. The session's task, current token budget, and the multi-armed bandit's exploration state all influence the choice. For cache-stable behaviour, pass an explicit mode.

### 1.4 Output formatting

After the CLI returns stdout, the wrapper post-processes via `parseLeanCtxOutput()` (`index.ts:169–200`) to extract the inline `[lean-ctx: N → M tok, -X%]` footer lines into structured `CompressionStats`, then re-emits a clean footer via `withFooter()` (`index.ts:207–233`):

```
<compressed file content>

Compressed 12453 → 612 tokens (-95%)
```

If the CLI didn't emit a footer, the wrapper estimates token counts via `Math.ceil(text.length / 4)` (`index.ts:158`) and synthesises one. The text body itself is not modified beyond CRLF normalization and trailing-blank-line collapse.

### 1.5 Additive vs replace mode

Controlled by `LEAN_CTX_PI_MODE` env var (`index.ts:43, 297–302`):

- **`additive`** (default): both Pi builtins (`read`, `bash`, `ls`, `find`, `grep`) AND ctx_* tools are exposed. Model has free choice.
- **`replace`**: at `session_start`, the extension calls `pi.setActiveTools()` to filter out the disabled builtins. Only ctx_* tools remain. This eliminates the "model sometimes picks `read`, sometimes `ctx_read`" variance that destroys cached prefixes.

> **Implementation detail**: replace mode does NOT unregister the builtins globally — it only filters them from the *active* tools list emitted into the API request. Other extensions and skills that reference builtin names by string can still break (this is the issue documented in `.pi/APPEND_SYSTEM.md` line 7: scout/delegate subagents' allowlists hardcode `read`/`grep`/etc).

### 1.6 Optional MCP bridge

`mcp-bridge.ts` (10 KB) implements an embedded MCP-over-stdio client that spawns `lean-ctx` as an MCP server. Activates only when `LEAN_CTX_PI_ENABLE_MCP=1` AND no `pi-mcp-adapter` is detected (`index.ts:577–579`). When active, it auto-discovers the binary's MCP tool surface and registers a filtered subset directly in Pi — `ctx_session`, `ctx_knowledge`, `ctx_semantic_search`, `ctx_overview`, `ctx_compress`, `ctx_metrics`, plus more — while CLI-override names (`ctx_read`, `ctx_multi_read`, `ctx_shell`, `ctx_search`, `ctx_tree`) are filtered out to avoid collision with the CLI-backed registrations. Auto-reconnects up to 3× with exponential backoff.

### 1.7 The Rust binary surface (what we're NOT using)

The wrapper exposes ~7 commands out of ~60 available in the binary. Notable unused capabilities (CLI-12):

- `ctx_session` — Context Continuity Protocol (task/finding/save/load)
- `ctx_knowledge` — remember/recall/search/export/import
- `ctx_handoff` — Context Ledger Protocol (deterministic hashed handoff between agents/sessions)
- `ctx_pack --pr` — PR Context Pack
- `ctx_plan` + `ctx_compile` — Phi-scored context plan + knapsack/Boltzmann compilation
- `ctx_smells`, `ctx_impact`, `ctx_callgraph`, `ctx_architecture` — Property-Graph code analysis on the SQLite index
- `ctx_control` — overlay-based exclude/pin/priority
- `lean-ctx serve` — HTTP MCP server (port 3344) and dashboard (3333)
- `lean-ctx proxy start` — intercepts tool_results between Pi and the LLM API
- `lean-ctx benchmark`, `lean-ctx gain`, `lean-ctx watch` — telemetry
- `lean-ctx index build-graph` — SQLite property graph

If pij ever wants deterministic handoff, structured planning, or PR context packs, those exist in the binary already and would require expanding the wrapper, not building from scratch.

---

## 2. Anthropic prompt-cache behaviour (the key consumer)

This is the load-bearing section for the user's caching question. All numbers cited from Anthropic-owned sources via ANT-01–10.

### 2.1 Mechanics

- **Placement**: `cache_control` is a per-content-block object that can attach to `tools[]`, `system[]`, or `messages[].content[]` blocks (including `tool_result` and `document` blocks).
- **Breakpoints**: up to **4 per request**. Top-level automatic `cache_control` consumes one slot.
- **TTLs**: 5-minute default (`{"type":"ephemeral"}`) or 1-hour opt-in (`{"type":"ephemeral","ttl":"1h"}`). 1h is now GA on Claude API without the legacy beta header. [VERIFY Bedrock parity.]
- **Minimum cacheable prefix**:
  - Opus 4.5/4.6/4.7, Haiku 4.5: **4096 tokens**
  - Sonnet 4/4.5/4.6, Opus 4/4.1: **1024 tokens**

### 2.2 Hit determination

Cache lookup is a **byte/token-exact prefix hash** over the canonicalised request, linearised as `tools → system → messages`, ending at (and including) the block carrying `cache_control`.

- Granularity: **per-prefix**, not per-block. The cache entry covers the contiguous range from start-of-request to the breakpoint.
- On miss at the breakpoint, the system walks **20 blocks backward** searching for a prior write before giving up. This is why long conversations with a single trailing breakpoint silently lose cache hits — the prior write falls outside the lookback window.

### 2.3 Billing

| Token category                    | Multiplier vs base input |
|-----------------------------------|--------------------------|
| `input_tokens` (uncached suffix)  | 1.0×                     |
| `cache_creation_input_tokens` 5m  | **1.25×**                |
| `cache_creation_input_tokens` 1h  | **2.0×**                 |
| `cache_read_input_tokens`         | **0.1×**                 |

Usage object shape:
```json
{
  "usage": {
    "input_tokens": 50,
    "cache_read_input_tokens": 100000,
    "cache_creation_input_tokens": 0,
    "output_tokens": 503,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 148,
      "ephemeral_1h_input_tokens": 100
    }
  }
}
```
Identity: `total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens`.

### 2.4 Invalidation table

Changes propagate down the prefix hierarchy `tools → system → messages`:

| Change                                            | tools cache | system cache | messages cache |
|---------------------------------------------------|-------------|--------------|----------------|
| Tool definition edit (name/desc/schema)           | INVALID     | INVALID      | INVALID        |
| Web search / citations toggle                     | valid       | INVALID      | INVALID        |
| `tool_choice` change                              | valid       | valid        | INVALID        |
| Add/remove images                                 | valid       | valid        | INVALID        |
| Extended-thinking parameter change                | valid       | valid        | INVALID        |
| Model ID change                                   | INVALID     | INVALID      | INVALID        |
| System prompt edit                                | valid       | INVALID      | INVALID        |
| Edit upstream of a breakpoint                     | (depends)   | (depends)    | INVALID        |
| Tool-result change **above** the last breakpoint  | (depends)   | (depends)    | INVALID        |
| Tool-result change **below** the last breakpoint  | valid       | valid        | valid          |

[VERIFY] sampling parameters (`temperature`, `top_p`, `top_k`) — Anthropic's published table doesn't enumerate them; treat as part of the hash until proven otherwise.

### 2.5 The tool-result determinism rule (THE answer to the user's question)

Three scenarios on Anthropic specifically:

1. **Tool result lives BELOW the last breakpoint** (typical: breakpoint on the static system+tools prefix; tool_result later in messages):
   - Result content varies turn-to-turn → **no effect** on the cached prefix above. System+tools cache continues to hit.
2. **Tool result lives ABOVE / AT the breakpoint** (e.g., explicit breakpoint on a `tool_result` block to cache historical context):
   - If the tool_result differs by even one byte, the prefix hash differs → **miss for that turn, fresh write**. Subsequent turns can hit the new entry if byte-stable from there onward, but each variation creates a new prefix branch, each used at most once. Non-deterministic tool output above a breakpoint silently shreds cache effectiveness.
3. **Beyond the 20-block lookback window**:
   - Even byte-identical content can fail to hit if the prior write is too far back. Mitigation: advance an intermediate breakpoint every ~15 blocks.

> **Net answer**: lean-ctx output that sits ABOVE a cache breakpoint must be byte-deterministic or it will destroy cache reuse. Lean-ctx output that sits BELOW the last breakpoint is fine even if it varies — it's billed at 1.0× either way and never touches the cached prefix.

### 2.6 Recommended breakpoint pattern for a compression-using agent

```
[ tools[] ]                          ← breakpoint A (lifetime of tool set)
[ system: persona + rules ]          ← breakpoint B (lifetime of system prompt)
[ messages: long stable history ]    ← breakpoint C (rolling, advanced per session)
[ messages: latest tool_result / user msg / compressed tail ]   ← no breakpoint
```

[VERIFY at Pi source] What `cache_control` strategy does Pi actually emit when calling Anthropic? Critical to know whether tool_results are placed above or below the last breakpoint.

### 2.7 Cost dynamics under 60–90 % compression

For a steady-state turn with a warmed cache:
```
cost ≈ base_rate × (0.1 · cache_read + 1.25 · cache_create + 1.0 · input_tokens_uncached)
```

- **Case A — compression below the last breakpoint** (compresses fresh tool output per turn):
  - Reduces the 1.0× uncached bucket linearly. **Largest absolute savings.**
- **Case B — compression above the last breakpoint** (becomes part of cached prefix on the next turn):
  - First turn: pays 1.25× write on compressed text.
  - Subsequent hits: pays 0.1× read on the smaller cached prefix.
  - Reads already 10× cheaper than base — absolute savings smaller than Case A unless the cached prefix is very large.

**Practical guidance**: lean-ctx's biggest absolute wins come from shrinking the **uncached suffix**, not the cached prefix. Compressing a long-lived history compounds slowly because reads are already at 10 % rate.

### 2.8 Tool-definition cache footprint

Tool definitions sit at the top of the prefix hierarchy. Token cost per tool definition (Anthropic encoding, heuristic):

- Short tool: ~80–150 tokens
- Typical custom tool with multi-line description and 3–6 params: **~200–500 tokens**
- Heavy tool with rich schema (enums, nested objects, examples): **600–1,500+ tokens**

For 6 ctx_* tools in additive mode at the typical-tool size: **~1,200–1,800 cached tokens**. MCP-enabled adds ~1,350 more.

Cost: one-time 1.25× write per cache window, then 0.1× read on every turn. Stable tool schemas amortise to the cheapest rate.

> **Risk**: any edit to a ctx_* tool's name, description, or schema invalidates the entire request's cache. **Lock the schemas.** Batch description edits and accept one full cache-miss cycle.

---

## 3. OpenAI and Gemini cache behaviour (for completeness)

### 3.1 OpenAI

| Property                  | Value                                                                                       |
|---------------------------|---------------------------------------------------------------------------------------------|
| Mechanism                 | Fully automatic. No `cache_control` equivalent. `prompt_cache_key` for routing only.        |
| Minimum prompt size       | **1024 tokens**; then 128-tok block increments                                              |
| TTL                       | 5–10 min idle in-memory (≤1 h hard cap); 24 h via `prompt_cache_retention="24h"`            |
| Default TTL by model      | 5.1/5.2/5.3-codex/5.4: explicit; 5.5/5.5-pro and future: 24 h default, in_memory unavailable |
| Hit discount              | 50 % legacy, 75 % on 4.1, **90 %** on 5.x and Codex, **0 % on GPT-5.5-pro**                  |
| Cache key                 | Hash of first ~256 tokens (+ optional `prompt_cache_key`) for routing; then token-level prefix scan on the engine |
| Determinism               | A 1-byte tool-result diff: reuse stops at the last 128-tok block boundary before the diff, recompute from there to end. If diff is in first 1024 tokens, `cached_tokens = 0` for the whole request. |

### 3.2 Google Gemini

Two mechanisms in 2026 (OPT-06–08):

- **Explicit** — `CachedContent` API: developer creates a cache containing `contents`, optional `system_instructions`, optional `tools`. Immutable; only TTL is mutable. Default TTL 1 h, min 1 min, **no maximum**. Cached-token discount: 75 % on Gemini 2.0, 90 % on 2.5+.
- **Implicit** — default-on for 2.5+, no API change. Same discount as explicit but no storage cost and an opaque TTL (≤24 h).

Minimum cacheable prefix:

| Surface              | Model              | Min tokens |
|----------------------|--------------------|------------|
| Gemini Developer API | 2.5 Flash          | 1024       |
| Gemini Developer API | 2.5 Pro, 3.x Pro   | 4096       |
| Gemini Developer API | 3.5 Flash          | 1024       |
| Vertex AI            | 2.0 / 2.5 (all)    | 2048       |
| Vertex AI            | 3.x                | 4096       |

The legacy "~32 K minimum" figure is **not in any official Google doc**.

Determinism rule: same as OpenAI — left-anchored exact-prefix; a 1-byte change in tool-result mid-history invalidates everything after it.

**Explicit-cache gotcha**: when referencing a `cached_content` at use time, you must NOT also set `tools`/`system_instructions`/`tool_config` — those must live inside the cache. Per-call tool-result variability already lives outside explicit caches.

### 3.3 Comparison

| Provider   | Mechanism              | Min size     | TTL                           | Discount               | 1-byte tool-result diff impact                                  |
|------------|------------------------|--------------|-------------------------------|------------------------|------------------------------------------------------------------|
| Anthropic  | Manual breakpoints (4) | 1024–4096    | 5 min default, 1 h opt-in     | 90 % read / 25 % write surcharge | Below last breakpoint: no effect. Above: misses for that turn  |
| OpenAI     | Automatic              | 1024 + 128-tok blocks | 5–10 min idle, 24 h opt | 50/75/90 %, **0 % on 5.5-pro** | Reuse up to last 128-tok block before diff; if in first 1024, all lost |
| Gemini     | Explicit + implicit    | 1024 / 2048 / 4096 | 1 h default, no max (explicit) | 75–90 %               | Left-anchored exact prefix; reuse stops at diff                  |

### 3.4 Implications for a tool-result compressor

Universal rule across providers:

> **Compress at first emission, deterministically. Never re-compress historic tool results that have already entered the cache** — that is pure cache destruction.

Provider-specific:

- **Anthropic**: most lean-ctx-friendly — developer controls where the breakpoint falls. Place the breakpoint before the volatile tail; compress the tail; cached prefix unaffected.
- **OpenAI**: helps if compression is byte-deterministic and applied at first emission. Severely hurts otherwise — even a 1-token diff at history-position N erases caching for N+1…end at the 128-token block granularity.
- **Gemini**: for tool-result content, same calculus as OpenAI. Gemini-only opportunity: very large but stable tool outputs (database dumps, retrieval bundles) can be hoisted into an **explicit `CachedContent`** rather than re-embedded textually.

---

## 4. Synthesis: does ctx_ invalidate the cache?

### 4.1 Determinism map of pi-lean-ctx surfaces

| Invocation                                       | Determinism verdict                | Cache safety           |
|--------------------------------------------------|------------------------------------|------------------------|
| `ctx_read mode=full` (explicit)                  | PROBABLY-DETERMINISTIC [VERIFY]    | Safe                   |
| `ctx_read mode=map` (explicit)                   | PROBABLY-DETERMINISTIC [VERIFY]    | Safe                   |
| `ctx_read mode=signatures` (explicit)            | PROBABLY-DETERMINISTIC [VERIFY]    | Safe                   |
| `ctx_read lines:N-M`                             | PROBABLY-DETERMINISTIC             | Safe                   |
| `ctx_read mode=reference`                        | DETERMINISTIC (1-line stub)        | Safe                   |
| `ctx_read mode=auto`                             | NON-DETERMINISTIC (bandit + policy)| **Risky above bkpt**   |
| `ctx_read mode=task`                             | NON-DETERMINISTIC (session-state)  | **Risky above bkpt**   |
| `ctx_read mode=entropy`                          | NON-DETERMINISTIC (bandit-recorded)| **Risky above bkpt**   |
| `ctx_read mode=aggressive`                       | PROBABLY-DETERMINISTIC (ratio-safeguarded fallback) | Mostly safe |
| `ctx_read mode=diff`                             | DEPENDS on cache state             | Risky                  |
| `ctx_ls` / `ctx_find` / `ctx_grep`               | DEPENDS on filesystem state        | Tool-result-natural    |
| `ctx_shell`                                      | DEPENDS on command                 | Tool-result-natural    |
| `ctx_session` / `ctx_knowledge` (MCP)            | STATEFUL by design                 | **Cache-hostile**      |
| `ctx_semantic_search` / `ctx_overview` (MCP)     | PROBABLY-NON-DETERMINISTIC         | Risky                  |

The wrapper's own footer (`Compressed N → M tokens (-X %)`) is derived from input size; for a given input file the footer **should** be byte-identical across calls, but there is a low-severity risk of rounding flicker between consecutive percent values (e.g. `-89 %` vs `-90 %`) if the binary's output varies by 1 token across runs (SYN-08 #6). Verifiable by repeated calls.

### 4.2 Cache-friendliness of the additive vs replace toggle

`LEAN_CTX_PI_MODE=replace` is **more cache-friendly** for a non-obvious reason: it eliminates the variance source where the model sometimes picks `read` and sometimes `ctx_read` on the same file. Two calls to the same file via different tools produce DIFFERENT tool_result content → cache breaks at the diverging block.

Replace mode forces consistent tool selection, which forces consistent tool-result content, which preserves the cache.

Trade-offs:
- Replace mode prefix is roughly the same size as vanilla Pi (5 builtins removed, 6 ctx_* added, but ctx_* descriptions are verbose — net likely ~+5–10 %). [VERIFY by token-counting both prefixes — SYN-10 #5.]
- Replace mode breaks any subagent/skill whose frontmatter allowlists raw Pi tool names. `.pi/APPEND_SYSTEM.md` line 7 already flags this (scout/delegate built-ins are hardcoded to `read`/`grep`/etc).

### 4.3 Cost math (concrete numbers on Anthropic)

Worked example for a single 10 KB code file:

- Uncompressed `read`: ~2500 tokens.
- Compressed `ctx_read mode=map`: ~100 tokens (96 % savings, in-line with BENCHMARKS.md `map` results).
- Tokens saved: ~2400.

**One-time saving** if this read enters the cached prefix once:
- Write cost reduction: `2400 × 1.25 = 3000` base-equivalents.

**Recurring per-turn saving** as long as the cache lives:
- `2400 × 0.1 = 240` base-equivalents per turn.

**Over a 50-turn agent loop reading 5 such files** (each cached once, then re-read):
- One-time writes saved: `5 × 3000 = 15,000` base-equivalents
- Recurring reads saved: `49 × 5 × 240 = 58,800` base-equivalents
- **Total saved**: ~73,800 base-token equivalents

Against this, the tool-definition prefix tax (~1,200 tokens for 6 ctx_* defs):
- One-time write cost: `1200 × 1.25 = 1500` base-equivalents
- Recurring per-turn read cost: `1200 × 0.1 = 120` base-equivalents

The prefix tax pays itself back in **<2 turns** of a single compressed file read. Over 50 turns it costs `1500 + 49 × 120 = 7,380` base-equivalents — less than 10 % of the savings on this small example.

> **Bottom line**: net-positive for any non-trivial agent session on Anthropic. The bigger and longer the session, the better the ROI.

### 4.4 The dragons (what could break cache)

| # | Risk                                                                  | Severity | Mitigation                                                    |
|---|-----------------------------------------------------------------------|----------|---------------------------------------------------------------|
| 1 | Mode flip at 8 KB or 96 KB size boundary in `auto` mode               | HIGH     | Pass explicit mode= on every call                              |
| 2 | `auto`/`entropy`/`task` bandit non-determinism between sessions       | HIGH     | Avoid these modes when output sits above a cache breakpoint    |
| 3 | Footer percent-rounding drift                                         | MED      | Strip footer at harness level if cache stability is critical   |
| 4 | lean-ctx binary version bump mid-session changes compression patterns | MED      | Pin lean-ctx version in CI; warn on version-change mid-session |
| 5 | Path normalization: `./foo.ts` vs `/abs/foo.ts` produces different banners | MED  | Wrapper already resolves to absolute paths — should be moot    |
| 6 | Locale/timestamp leakage in error messages                            | LOW      | Errors rarely cache anyway                                     |
| 7 | `auto` mode reading `stat()` mid-edit during a build/watch loop       | LOW      | Edge case                                                       |
| 8 | MCP bridge reconnect mid-session producing varied session IDs         | LOW      | Only affects MCP tools; not cache-stable by design              |

---

## 5. pij-specific context

### 5.1 Registration and configuration

**`.pi/packages.yaml`** (lines 45–56) lists pi-lean-ctx as enabled, with a `requires.install` shell command that auto-installs the Rust binary via Homebrew:

```yaml
- source: npm:pi-lean-ctx
  enabled: true
  note: 60-90% token compression on bash/read/grep/find/ls
  requires:
    bin: lean-ctx
    install: brew tap yvgude/lean-ctx && brew install lean-ctx && mkdir -p ~/.local/bin && ln -sf "$(brew --prefix)/bin/lean-ctx" ~/.local/bin/lean-ctx
  vetted:
    date: 2026-05-17T05:41:18.779Z
    score: 100
```

**Install path**: `just install` → `just pkg bootstrap` → `pi install npm:pi-lean-ctx` writes to `~/.pi/agent/settings.json#packages[]`. The Homebrew install is triggered by the `requires.install` block before the npm extension can register.

**Update path**: `just update-pi` runs `pi update` after the binary bump, which re-fetches the npm:pi-lean-ctx package.

### 5.2 Tool-preference directives

**Two source files encode "prefer ctx_*"**:

1. `~/.claude/rules/lean-ctx.md` — global Claude Code rule:
   ```
   CRITICAL: ALWAYS use lean-ctx tools instead of native equivalents. This is NOT optional.
   | ctx_read(path, mode)         | Read / cat / head / tail | Cached, 10 read modes, re-reads ~13 tokens
   | ctx_search(pattern, path)    | Grep / rg                | Compact, token-efficient results
   | ctx_shell(command)           | Shell / bash / terminal  | Pattern compression for git/npm/cargo output
   | ctx_tree(path, depth)        | ls / find                | Compact directory maps
   | ctx_edit(path, old, new)     | Edit (when Read unavail) | Search-and-replace without native Read
   ```

2. `.pi/APPEND_SYSTEM.md` § "Lean-ctx tool preference" (added 2026-05-21 in commit `e97656a`):
   ```
   When ctx_* tools are exposed in the session (provided by the pi-lean-ctx
   extension), ALWAYS prefer them over pi's raw built-ins. They route through
   lean-ctx for 60-90% token savings... This is a hard preference, not a tiebreaker.
   ```

   Synced to `~/.pi/agent/APPEND_SYSTEM.md` via `just install` so the directive applies in every cwd, not just inside pij.

### 5.3 Vetting state

`agents/package-vetter/__snapshots__/npm-pi-lean-ctx.json` records score 80 (`warn` level) with two **R-07** findings — "tool description imperatives" where the extension instructs the model to prefer `ctx_*` over builtins. The vetter correctly classifies these as intentional safety guidance, not prompt injection. No override needed.

### 5.4 Usage evidence

The code-review-companion agent's execution logs reference `ctx_grep` and `ctx_read` during reviews (visible in the workshop doc for plan 007). No dedicated smoke test exercises ctx_* directly — the surface is covered indirectly through whatever native pij ops do read/bash/grep.

### 5.5 Prior learnings (lens 7)

- **PL-01 — pi-lean-ctx is pij's primary context-compression tool.** Selected in plan 006 (2026-05-15 research) for the 60–90 % savings claim.
- **PL-02 — Recommended stack.** Plan 006 established `pi-lean-ctx` (workhorse) + `pi-context-prune` (summarizer) + `pi-airgun` (cache optimization), plus `pi-token-burden` + `pi-cache-graph` for diagnostics. Only the first is currently installed in pij.
- **PL-03 — Session-based tool preference documented** in `.pi/APPEND_SYSTEM.md`.
- **PL-04 — Agent stochasticity on pi-lean-ctx.** Plan 009 vetting found the minih vetter agent shows higher drift (2 findings) on pi-lean-ctx than on other packages (0–1), attributed to text-heavy markdown trees.
- **PL-05 — System-dependency lifecycle.** The RUNBOOK and packages.yaml encode the brew tap + Cellar install path as the canonical lean-ctx binary source.

No prior pij document explored the LLM-cache-interaction angle — this dossier is the first to do so.

---

## 6. Domain context (lens 8)

### 6.1 Does lean-ctx fit an existing pij domain?

**No, not cleanly.** `agent-tooling-interface` owns the model-facing tool contract layer (sql, todo, /minih). Lean-ctx interposes at the **process I/O compression layer**, which the existing domain Concepts table does not cover.

### 6.2 Cross-domain effects

- `agentic-loops/domain.md` has an unverified `AC-05` about `customType` entries surviving `/compact` — directly relevant because lean-ctx-compressed tool outputs flow through `/compact`.
- `agent-tooling-interface` `/todo overlay` and `todo-strip` widgets display compressed bytes — if lean-ctx output format changes (e.g. footer rounding flicker), it affects what the widget renders.

### 6.3 Recommendation

**Path B — add a "Tool-output compression" concept to `agent-tooling-interface`** (low-effort clarification). Acknowledges the gap without creating new governance.

Alternative — Path C, create a `context-optimization` domain — only worth it if pij decides to own compression *policy* (per-tool TTLs, token-budget gates, `/compact` durability guarantees). Currently pij is a consumer, not a policy owner; Path B is sufficient.

Status quo (Path A — no formalization) is also safe: lean-ctx works as an installed extension regardless.

---

## 7. Recommendations

### 7.1 Operational defaults for pij agent loops on Anthropic

```
LEAN_CTX_PI_MODE=replace          # forces consistent tool selection → cache stability
LEAN_CTX_PI_ENABLE_MCP=0          # disable the MCP bridge unless ctx_session / ctx_knowledge needed
LEAN_CTX_BIN unset                # use Homebrew path
LEAN_CTX_COMPRESS=1               # set automatically by extension
LEAN_CTX_SAVINGS_FOOTER=always    # set automatically by extension
```

Plus a system-prompt directive: "When you intend to *edit* a file, pass `mode=full` explicitly to `ctx_read`. For exploration, `mode=auto` is fine but its output may vary slightly across sessions."

### 7.2 Decision tree for non-Anthropic models

- **OpenAI (gpt-5.x / Codex)**: compression helps only if byte-deterministic. Use `mode=full` or explicit `signatures` for any tool result that may be re-referenced. Avoid `auto` for tool-results that the agent will plausibly inspect later in the session.
- **OpenAI gpt-5.5-pro**: cache discount is **0 %**. Compression still helps for raw token reduction but cache mechanics are irrelevant.
- **Gemini**: same as OpenAI for tool results. For very large stable corpora, consider hoisting into an explicit `CachedContent` rather than relying on lean-ctx in-line compression.

### 7.3 Safe vs dangerous modes

| Mode set                         | Cache safety                                          |
|----------------------------------|--------------------------------------------------------|
| `full`, `map`, `signatures` (explicit) + `lines:N-M` + `reference` | **Safe** — deterministic, repeatable |
| `auto` for read-only exploration | OK — but variance across sessions is the cost         |
| `auto` for content the agent will edit | **Risky** — pass explicit mode instead             |
| `aggressive`                     | Mostly safe, ratio-safeguard fallback in CLI           |
| `entropy`                        | **Risky** — bandit-recorded, varies across runs        |
| `task`                           | **Risky** — requires `ctx_session` task; output depends on it |
| `diff`                           | Risky — depends on prior cached read                   |
| `ctx_session` / `ctx_knowledge` (MCP) | **Cache-hostile by design** — embed in below-breakpoint tail only |

### 7.4 Things to NOT do

- Don't re-compress historic tool results that have already been sent uncompressed to the model — that destroys the cache from the rewrite point onward.
- Don't edit ctx_* tool descriptions casually — every edit invalidates the entire request's cache (tools → system → messages).
- Don't enable the MCP bridge by default — its tools are stateful and cache-unfriendly. Enable only when you actually need `ctx_session`/`ctx_knowledge`/etc.
- Don't assume `auto` mode is stable; it isn't.

---

## 8. Open verification opportunities

Concrete experiments a follow-up agent could run to convert the [VERIFY] flags into facts. Listed in priority order:

| #  | Experiment                                                                      | Confirms                  |
|----|---------------------------------------------------------------------------------|---------------------------|
| 1  | Diff two consecutive `ctx_read foo.ts mode=full` calls — must be empty          | SYN-01 binary determinism |
| 2  | KO test: run identical 20-turn agent session twice (replace mode vs vanilla pi). Sum `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`. Compare. | All cache-cost claims     |
| 3  | Size-boundary flip: file at 7.9 KB vs 8.1 KB; expect `full` vs `map` modes; diff outputs | SYN-08 #1                 |
| 4  | Token-count the system+tools prefix in (a) vanilla Pi, (b) Pi+lean-ctx additive, (c) Pi+lean-ctx replace | SYN-05, SYN-06            |
| 5  | Inspect Pi's request payload to see where `cache_control` breakpoints actually go | Whether tool_results are above or below the last breakpoint |
| 6  | Run `ctx_read foo.ts` 100× in a row; collect footers; check no flicker          | SYN-08 #6                 |
| 7  | From two different `cwd`s, `ctx_read` the same file by absolute path; diff outputs | SYN-08 #3                 |
| 8  | Look for any version string in lean-ctx output that might leak into compressed payload | SYN-08 #2                 |
| 9  | Run `ctx_session` 10× in a row; diff outputs (expected to differ)               | Confirms stateful MCP tools are cache-hostile |
| 10 | Check Bedrock 1h-TTL header status                                              | ANT-10 [VERIFY]           |
| 11 | Check whether sampling params (temperature etc.) affect Anthropic cache hash    | ANT-04 [VERIFY]           |
| 12 | Run `lean-ctx benchmark run <pij>` and compare against BENCHMARKS.md            | CLI-10 corpus relevance to pij |

---

## 9. External research opportunities

None pending — the user's specific external questions (Anthropic / OpenAI / Gemini cache mechanics) were answered in-dossier via lenses 03–04 using perplexity research and provider documentation. All [VERIFY] flags are tactical verification items (experiments to run, not gaps requiring external research).

---

## 10. Recommended next steps

Not auto-progressing. Suggested options for the user:

1. **Run KO verification (experiment #2 above)** to convert the cost math from estimated to measured. This is the highest-leverage follow-up — once measured, the recommendations in §7 can be tightened to specific numeric thresholds.
2. **Promote `LEAN_CTX_PI_MODE=replace`** to a pij default. Add to `just install` step 3 (sync global pi prefs), or set in `~/.zshenv` alongside `PERPLEXITY_API_KEY`. (Note: replace mode may break subagents whose frontmatter allowlists raw `read`/`grep` — already flagged in `.pi/APPEND_SYSTEM.md` line 7.)
3. **Spec a small extension** to surface the un-wrapped lean-ctx capabilities (CCP `ctx_session`, Context Ledger Protocol `ctx_handoff`, PR Context Pack `ctx_pack --pr`). These already exist in the binary; a thin wrapper expansion could unlock structured session handoff.
4. **Add a "Tool-output compression" concept** to `docs/domains/agent-tooling-interface/domain.md` (Path B from §6.3) — clarifies the gap without creating new domain governance.
5. **Validate the dossier** via `/validate-v2` — has parallel agents cross-check the claims, particularly the cache-determinism rules per provider.
6. **Specify a feature** via `/plan-1b-v2-specify` if any of the above warrant a plan.

---

## Appendix A: File inventory

### pi-lean-ctx Pi extension (wrapper)

| File                                                                                                          | Lines | Purpose                          |
|---------------------------------------------------------------------------------------------------------------|-------|----------------------------------|
| `~/.pi/agent/npm/node_modules/pi-lean-ctx/extensions/index.ts`                                                | ~700  | Tool registrations, mode selection, footer parsing |
| `~/.pi/agent/npm/node_modules/pi-lean-ctx/extensions/mcp-bridge.ts`                                           | ~300  | Optional MCP-over-stdio bridge   |
| `~/.pi/agent/npm/node_modules/pi-lean-ctx/extensions/types.ts`                                                | ~30   | Type definitions                 |
| `~/.pi/agent/npm/node_modules/pi-lean-ctx/README.md`                                                          | ~250  | User-facing docs                 |
| `~/.pi/agent/npm/node_modules/pi-lean-ctx/package.json`                                                       | 35    | v3.6.6 manifest                  |

### lean-ctx CLI (engine)

| Path                                                                                | Purpose                          |
|-------------------------------------------------------------------------------------|----------------------------------|
| `/opt/homebrew/bin/lean-ctx`                                                         | Single 52 MB Rust Mach-O binary  |
| `/opt/homebrew/Cellar/lean-ctx/3.6.0/`                                              | Homebrew install root            |
| GitHub: `yvgude/lean-ctx` → `rust/src/`                                              | CLI source (~89 % Rust)          |
| GitHub: `yvgude/lean-ctx` → `rust/src/tools/`                                        | ~60 `ctx_*.rs` MCP tool files    |
| GitHub: `yvgude/lean-ctx` → `rust/src/shell/compress/`                               | Per-command compression engine   |
| GitHub: `yvgude/lean-ctx` → `rust/src/core/{bandit,adaptive,ccp_session,bm25}.rs`    | Decision-making and indexing     |
| GitHub: `yvgude/lean-ctx` → `rust/src/hooks/agents/pi.rs`                            | First-class Pi integration       |

### pij config

| File                                                              | Purpose                                                |
|-------------------------------------------------------------------|--------------------------------------------------------|
| `pij/.pi/packages.yaml` lines 45–56                               | npm:pi-lean-ctx registration + Homebrew install hook   |
| `pij/.pi/APPEND_SYSTEM.md` § Lean-ctx tool preference             | "Always prefer ctx_*" directive (synced globally)      |
| `~/.claude/rules/lean-ctx.md`                                     | Claude Code global lean-ctx rule                       |
| `pij/justfile` recipes `install`, `update-pi`                     | Install/update orchestration                            |
| `pij/agents/package-vetter/__snapshots__/npm-pi-lean-ctx.json`    | Vetting record (score 80, R-07 imperatives)             |
| `pij/docs/plans/006-pi-context-management/research-dossier.md`    | Prior survey — established pi-lean-ctx as workhorse    |

---

## Appendix B: Lens output files

Source data behind this dossier:

- `/tmp/lean-ctx-research/02-cli.md` — CLI investigation (12 findings, ~315 lines)
- `/tmp/lean-ctx-research/03-anthropic-cache.md` — Anthropic mechanics (10 findings, ~245 lines)
- `/tmp/lean-ctx-research/04-other-providers.md` — OpenAI + Gemini (10 findings, ~170 lines)
- `/tmp/lean-ctx-research/05-cache-synthesis.md` — Cache-interaction synthesis (10 findings, ~268 lines)
- Lenses 01 (extension), 06 (pij usage), 07 (prior learnings), 08 (domain) — returned inline; full content preserved in this dossier's body

---

**Research complete.** This is a read-only dossier; no follow-up commands have been launched. Choose a next step from §10 if you want to proceed.
