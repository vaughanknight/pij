# Pi Context Management — extension survey

**Generated**: 2026-05-15
**Research Query**: "Dynamic context management extensions for pi — drop old file reads, summarize earlier turns, per-tool TTL, token-budget gates, etc. What exists, what's still gap."
**Parent**: `docs/plans/005-pi-ecosystem-survey/research-dossier.md` (general ecosystem)
**Sources**: perplexity research pass 2026-05-15. URLs ⚠ unverified — worth `pi install`ing before relying on them.

---

## TL;DR

Pi has built-in `/compact`. The community has built a layer above it for proactive pruning, compression, and provider-cache optimization. Five active pi extensions plus two diagnostics cover most of what you'd want; three genuine gaps remain (per-tool TTL, token-budget-aware tool gating, auto-living-spec for in-session task state).

Recommended stack for pij: **`pi-lean-ctx` + `pi-context-prune` + `pi-airgun`**, with `pi-token-burden` + `pi-cache-graph` for visibility.

---

## What exists

Star counts via `gh api repos/...` on 2026-05-15.

| Extension | Repo | ⭐ | What it does | Mechanism |
|---|---|---:|---|---|
| **`pi-context`** | `ttttmr/pi-context` (npm:pi-context) | 187 | Git-like session versioning — `context_tag` / `context_log` / `context_checkout`; lossless time-travel across the session tree. `/acm` and `/context` slash commands | Wraps session state, doesn't destroy old messages — lets agent navigate them |
| **`pi-context-prune`** | `championswimmer/pi-context-prune` | 103 | Summarizes completed tool-call batches; strips raw tool outputs from future context | Tool-call tree pruning; pairs with `pi-cache-graph` for cache-reuse verification |
| **`pi-lean-ctx`** | `yvgude/lean-ctx` (npm:pi-lean-ctx) | 1650 | **60–90% token savings.** Routes built-in `bash` / `read` / `grep` / `find` / `ls` through the `lean-ctx` compression runtime. Ships skills bundle: `ctx_session`, `ctx_knowledge`, `ctx_semantic_search`, `ctx_overview`, `ctx_compress`, `ctx_metrics`, `ctx_delta`, `ctx_preload` | CLI override + optional MCP bridge (`LEAN_CTX_PI_ENABLE_MCP=1`) |
| **`pi-airgun`** | `blai/pi-airgun` (npm:pi-airgun v0.1.0) | 1 | Provider-cache optimization — intercepts tool results + LLM window to identify token waste; footer shows `~N tok saved (X%)`; ~28% savings reported | Two-pipeline architecture targeting Anthropic prompt caching |
| **`pi-read-map`** | `Whamp/pi-read-map` | 16 | Structural map (functions/classes/constants) for files >2k lines or 50KB instead of full read | Intercepts `read` tool; smart retention by section |
| **`pi-token-burden`** | `Whamp/pi-token-burden` | 43 | Token-budget breakdown of the assembled system prompt | Diagnostic only — shows where the budget goes |
| **`pi-cache-graph`** | `championswimmer/pi-cache-graph` | 14 | Cache-hit/miss inspection commands; live monitoring | Provider cache instrumentation |
| **lean-ctx** (standalone) | `yvgude/lean-ctx` | 1650 | Local-first compression runtime that `pi-lean-ctx` wraps. Cached re-reads drop to ~13 tokens. ~95 known bash output patterns | Out-of-process; can also run via MCP |

---

## What's still gap

| Behavior | Status | Closest match |
|---|---|---|
| Drop file reads older than N turns | ⚠ partial | `pi-lean-ctx`'s `ctx_delta` reads changed-lines-only; `pi-context-prune` prunes old tool outputs as summary. No explicit "older than N turns" TTL |
| Drop redundant repeated reads | ⚠ partial | `pi-lean-ctx` caches re-reads to ~13 tokens; `pi-read-map` discourages full reads. Caching ≠ true dedup |
| Per-tool TTL | ❌ **NOT FOUND** | SWE-Pruner (academic, arxiv 2601.16746) is the task-aware-pruning blueprint — not a pi extension yet |
| Token-budget-aware tool gating (block expensive tools at ≥80%) | ❌ **NOT FOUND** | `pi-token-burden` shows budget; permission-gate example shows gating pattern; nobody's combined them |
| Auto-living-spec (external task state injected into fresh contexts) | ❌ **NOT FOUND** | `pi-memory` covers cross-session facts, not in-session task state |
| Auto-compact on idle | ⚠ adjacent | `pi-yaml-hooks` has `session.idle` hook → could fire `/compact`. No off-the-shelf wiring |
| Bundle of recommended context-mgmt config | ❌ **NOT FOUND** | Each extension solo; no curated stack |

---

## Recommended pij stack

Layered combo, in order of must-have to nice-to-have:

1. **`pi-lean-ctx`** — the workhorse. Compresses tool I/O at the source. Stops most of the bloat.
2. **`pi-context-prune`** — strips raw tool outputs from earlier turns once their decisions are recorded.
3. **`pi-airgun`** — provider-cache optimization, additive (works on top of the others).
4. **`pi-token-burden`** + **`pi-cache-graph`** — diagnostics so you can verify the above are actually paying.
5. **`pi-context`** — only if you want session-tree time-travel. Optional.

Add via `npm run pkg add <source>` with a `note:` explaining role. Disable any that misbehave.

---

## Why pi has this problem in the first place

Pi's core compaction (`packages/coding-agent/src/core/compaction/` in pi-mono) walks backward from the newest message, sums tokens, and at a cutoff asks the LLM for a structured summary that replaces the middle of the conversation. Limitations that motivate the extensions above:

- Triggers only when the **hard limit** is approached — leaves plenty of room for suboptimal use earlier
- Treats all tool outputs equally — bash build logs and critical file reads are summarized with the same logic
- May discard fine-grained implementation details that code agents need
- No token-budget-aware tool gating, no per-tool TTL, no provider-cache aware structuring

Practitioners observe **context degradation is a cliff, not a slope**: a fresh context with a good handover beats a bloated context by 5–15 pp success rate. Proactive rotation at 60–70% utilization wins. Pi's extensions are the tools for this; nobody's automated the policy yet.

---

## Opportunities for pij to build

In order of leverage:

1. **Per-tool TTL extension** — `{ read: { ttlTurns: 10 }, bash: { ttlTurns: 3 } }`; on each turn, replace expired tool results with a stub. Concrete, no incumbent, small scope.
2. **Token-budget gate** — at ≥N% utilization, refuse `mcp.call`, `web_fetch`, `bash` outputs predicted >M tokens. Combines `pi-token-burden` instrumentation with the permission-gate pattern.
3. **`/compact on idle`** — wire `pi-yaml-hooks`' `session.idle` to `/compact`. Mostly config; one-page extension.

All three are good 1-day pij extension candidates and slot directly into the Driver-SDK-validated workflow.

---

## Verification queue

Before pij endorses any of these in `.pi/packages.yaml`:

1. `pi install pi-lean-ctx` → run an extension dev session and observe `ctx_metrics` token-savings output
2. `pi install github:championswimmer/pi-context-prune` → check it loads and `/context-prune` is exposed
3. `pi install github:blai/pi-airgun` → confirm footer widget renders
4. `pi install github:Whamp/pi-token-burden` → confirm budget breakdown command works

Update this dossier with verified status after each.

---

## Sources

Perplexity research pass 2026-05-15. Key citations: pi.dev/packages/pi-context, pi.dev/packages/pi-lean-ctx, github.com/championswimmer/pi-context-prune, github.com/blai/pi-airgun, github.com/Whamp/pi-token-burden, github.com/Whamp/pi-read-map, github.com/championswimmer/pi-cache-graph, github.com/yvgude/lean-ctx. arxiv.org/html/2601.16746v3 (SWE-Pruner).
