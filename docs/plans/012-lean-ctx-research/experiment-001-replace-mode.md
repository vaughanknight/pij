# Experiment 012-001 — lean-ctx replace mode + MCP off

**Status**: ACTIVE (started 2026-05-21)
**Owner**: jordanknight
**Hypothesis source**: [research-dossier.md §7.1](./research-dossier.md#71-operational-defaults-for-pij-agent-loops-on-anthropic) — the recommended cache-friendly default for pij on Anthropic.
**Rollback file**: `~/.zshrc:144-148` (preserve old behaviour by re-setting `LEAN_CTX_PI_ENABLE_MCP=1` and removing the `LEAN_CTX_PI_MODE` line).

---

## Hypothesis

Switching the local pi environment from **additive + MCP bridge on** to **replace + MCP bridge off** will:

1. **Stop the model from picking pi's built-in `read`/`bash`/`grep`/`find`/`ls`** alongside `ctx_*` — cementing one tool surface per session and improving prompt-cache hit rate (the model can no longer cache-bust by varying which tool it picks for the same file).
2. **Shrink the cached tools-definition prefix** by removing the ~9 MCP-bridge tool defs (`ctx_session`, `ctx_knowledge`, `ctx_semantic_search`, `ctx_overview`, `ctx_compress`, `ctx_metrics`, etc.). Expected ~1.3 K cached-token reduction.
3. **Remove a major source of non-deterministic tool-result content** — `ctx_session` and `ctx_knowledge` are stateful by design and inherently cache-hostile when they sit above any `cache_control` breakpoint.

It will also have a **known cost**: any pi subagent / skill whose frontmatter allowlist hardcodes raw pi tool names (`read`, `grep`, `find`, `ls`, `bash`) will fail to resolve those tools — they're hidden in replace mode. The pij `.pi/APPEND_SYSTEM.md` already flags this (line 7).

---

## What changed

`~/.zshrc:144-148`:

```diff
- # pi-lean-ctx MCP bridge
- export LEAN_CTX_PI_ENABLE_MCP=1
+ # pi-lean-ctx env — experiment 012-001
+ # replace: pi's built-in read/bash/grep/find/ls hidden; only ctx_* surfaced → cache-stable tool selection
+ # MCP=0:   avoids cache-hostile stateful tools (ctx_session, ctx_knowledge) and shrinks tools-def prefix
+ export LEAN_CTX_PI_MODE=replace
+ export LEAN_CTX_PI_ENABLE_MCP=0
```

No changes to `pij/.pi/APPEND_SYSTEM.md`, `pij/.pi/packages.yaml`, or the pi-lean-ctx extension itself. This is purely a runtime-env change.

### Scope caveat (machine portability)

`~/.zshrc` is sourced only by **interactive zsh**. Non-interactive pi invocations (scripts, some launchers) will not pick these up. If this experiment graduates to a permanent default, the durable location is `~/.zshenv` (sourced unconditionally) or — better for machine portability — encoded into `pij/justfile`'s `install` recipe so a fresh clone applies it automatically.

For now: interactive shells only. Other shells fall back to defaults (additive + MCP off, since `LEAN_CTX_PI_ENABLE_MCP` defaults to 0 when unset).

---

## Activation

Open a new terminal **OR** in an existing shell:

```sh
source ~/.zshrc
```

Verify:

```sh
echo "LEAN_CTX_PI_MODE=$LEAN_CTX_PI_MODE"       # should print 'replace'
echo "LEAN_CTX_PI_ENABLE_MCP=$LEAN_CTX_PI_ENABLE_MCP"  # should print '0'
```

Then start pi from any cwd. Confirm in pi:

- `pi -p "list every tool starting with ctx_ you have"` — should return the 6 CLI-backed tools only (`ctx_read`, `ctx_shell`, `ctx_grep`, `ctx_find`, `ctx_ls`, `lean_ctx`). **No** `ctx_session` / `ctx_knowledge` etc.
- `pi -p "list every tool you have whose name is exactly 'read' or 'bash'"` — should return none (replace mode hid them).

---

## Verification — what to watch for

### Success signals (week 1, qualitative)

- [ ] Pi sessions feel similar or faster — no obvious regression in tool latency.
- [ ] No "tool not found" errors when running pij's normal workflows (smoke tests, vetting, dossier work).
- [ ] Existing subagent skills work — particularly `flowspace-research-v2` (it uses ctx_* names, should be fine).

### Failure signals (any → consider rollback)

- [ ] A skill's frontmatter tool allowlist references `read`/`bash`/`grep`/`find`/`ls` directly → that skill fails to find those tools. Workaround: edit the allowlist to add `ctx_*` equivalents, OR (last resort) revert this experiment.
- [ ] A capability the user actually used from the MCP bridge (`ctx_session` for session continuity, `ctx_knowledge` for cross-session memory, `ctx_semantic_search`) is now unavailable and missed.
- [ ] Pi session loads but immediately errors at extension load — would indicate something else (unrelated to this experiment) since `LEAN_CTX_PI_MODE=replace` is documented behaviour.

### Quantitative measurement (the real test)

Per research-dossier §8 (Open verification opportunities), the load-bearing experiment is **#2 — the KO test**:

> Run identical 20-turn agent session twice — once with `LEAN_CTX_PI_MODE=replace`, once without lean-ctx. Sum `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens` from each turn's API response. Compute total billed cost; compare.

Not run yet. Until this is measured, the cache-friendliness claim from §4 of the dossier remains modelled, not observed. **Magic wand**: a `just measure-cache <prompt>` recipe that does the paired run automatically.

Less rigorous but cheap intermediate checks:

| Check | How |
|---|---|
| Tool-defs prefix shrinks | `pi -p --no-session "respond with the count of tools you have available"` — compare counts before/after (this experiment moves the count from ~15 to ~6 + pi builtins…actually since replace hides the builtins too, expect ~6). |
| Determinism on `mode=auto` reads | `pi -p --no-session 'use ctx_read auto on /Users/jordanknight/pi-hacking/pij/justfile, output exact result text only' > /tmp/a.txt` twice; diff. If diff is non-empty, `auto` is unstable as predicted. |
| Determinism on `mode=full` reads | Same as above but `mode=full`. Diff should be empty. |

---

## Decision matrix (when to keep, when to roll back)

| Outcome after ~7 days of use | Action |
|---|---|
| No regressions, sessions feel normal, no missed MCP features | **Promote** — move env vars to `~/.zshenv` and/or encode in `just install` for machine portability. |
| Specific skills broke (frontmatter allowlist issue) | **Patch the skills** to use `ctx_*` names; keep experiment active. |
| Missed `ctx_session` / `ctx_knowledge` features | **Partial revert** — keep `LEAN_CTX_PI_MODE=replace` (the cache-friendly part), re-enable `LEAN_CTX_PI_ENABLE_MCP=1` (the missed-features part). Document the trade-off explicitly. |
| Significant unexplained regressions | **Full revert** — restore `LEAN_CTX_PI_ENABLE_MCP=1` and remove `LEAN_CTX_PI_MODE=replace`. Document what failed. |

---

## Rollback

```sh
# In ~/.zshrc, replace the experiment block with:
# pi-lean-ctx MCP bridge
export LEAN_CTX_PI_ENABLE_MCP=1
# (delete the LEAN_CTX_PI_MODE line)
```

Then `source ~/.zshrc` (or open a new terminal).

---

## Discoveries & learnings

(Append entries here as the experiment runs.)

| Date | Type | Finding | Action taken |
|---|---|---|---|
| _empty_ | | | |

---

## Related

- [research-dossier.md §4.2](./research-dossier.md#42-cache-friendliness-of-the-additive-vs-replace-toggle) — why replace mode is cache-friendlier
- [research-dossier.md §7.1](./research-dossier.md#71-operational-defaults-for-pij-agent-loops-on-anthropic) — the recommended config
- [research-dossier.md §4.4](./research-dossier.md#44-the-dragons-what-could-break-cache) — known risks
- `pij/.pi/APPEND_SYSTEM.md` line 7 — pre-existing flag for the scout/delegate allowlist issue
