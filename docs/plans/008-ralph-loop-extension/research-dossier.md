# Research Dossier: Ralph Loop pi extension

**Generated**: 2026-05-14
**Research Query**: "We need to add a new Pi extension that is a Ralph Loop. Research Ralph loops and their prompts and first principles. Make sure you understand how to add Pi extensions in the pij repo."
**Mode**: Pre-Plan (new plan folder `008-ralph-loop-extension`)
**FlowSpace**: not available this session
**Domain registry**: none (`docs/domains/` missing)
**Perplexity MCP**: ✅ **refilled and verified** (three `perplexity_ask` calls succeeded; `perplexity_research` endpoint timed out — see D-021). External Ralph Loop content verified in `external-research/ralph-loop-provenance.md`.

---

## Executive Summary

### What a Ralph Loop is (verified from primary sources)

A **Ralph Loop** (a.k.a. *Ralph Wiggum technique*, coined by Geoffrey Huntley / @ghuntley, viral late 2025) is an agentic-coding pattern where:

1. A long-lived plain-text artifact (typically `prd.json` + `progress.txt`) holds the **task list and progress**; git history is the durable memory.
2. A near-stateless coding agent (Claude Code, Amp, Codex, **pi**, etc.) is invoked **repeatedly** in **fresh context per iteration**.
3. Each iteration: read PRD → do **one task and one task only** → run tests/typecheck → commit → update progress → exit.
4. An **outer loop** (`while true; <agent>; done` — *"Ralph is a Bash loop."* — Huntley) drives the iterations.
5. The agent terminates the loop by emitting **`<promise>COMPLETE</promise>`** in its output. A stop-hook watches for this token; if absent on exit, the loop re-injects the prompt.
6. snarktank/ralph's published **default cap is 10 iterations**.

**Why it works (verified evidence)**: trades cost-per-iteration for *infinite patience and zero context bloat*. Huntley: *"The more you allocate, the more likely you are to get bad outcomes. Ralph is a deliberate attempt to minimize allocation so I never get a compaction event."* Sonnet 4.5 + Ralph runs at a documented **~$10.42/hr** (Huntley via LinearB / Dev-Interrupted). Real shipped artifacts include reverse-Ralph clones of HashiCorp Nomad and Tailscale specs.

**Why it fails (verified evidence)**: 40,000-line PRs that break code review; cost overruns when iteration caps are absent; thrashing on under-specified scope; destructive edits when the loop is given write secrets. Huntley: *"You don't provision write secrets. You introduce tests, enable change data capture, and rely on audit logs. You engineer your way out of failure scenarios."*

> Provenance: all of the above is verified in `external-research/ralph-loop-provenance.md` against ghuntley.com, github.com/snarktank/ralph, github.com/ghuntley/how-to-ralph-wiggum, the Anthropic-official Ralph-loop plugin, and 20+ other primary/secondary sources.

### Business purpose (in pij)

A `ralph-loop` extension in pij would:

- give pi a first-class **"keep going until done"** mode without the user babysitting a chat
- exercise every part of the pij harness in one go: extension scaffold, custom tool, custom commands, session persistence, smoke harness, link script
- be a stress-test of pi's headless modes (`--mode json`, `--mode rpc`, SDK `createAgentSession`)
- generate honest data for the harness: each iteration is a difficulty-ledger opportunity

### Key insights

1. **Ralph Loops are mostly an outer-loop pattern, not an inner-agent pattern.** The interesting work in a pi extension is **not** reimplementing Claude inside pi — it is wrapping a plan file + stop conditions + budget around pi's existing capabilities.
2. **pi already has the primitives.** `pi.appendEntry` for persistence, `pi.registerTool` for plan-mutation tools, `--mode json` for headless iterations, `createAgentSession` for in-process iteration. The extension is a thin orchestrator.
3. **Two implementation shapes are viable in pij** and they have different harness implications (§ Architecture & Design below).
4. **The single biggest risk is stop conditions.** Every Ralph Loop horror story is a stop-condition failure. Encode these as harness-enforced gates, not prompt prose.
5. **Perfect candidate for the difficulty ledger.** First Ralph Loop run on any non-trivial task will produce 3–6 difficulty rows. That's the actual harness value of building this.

### Quick stats

- **Implementation surface**: 1 extension (T2 layout) + optional 1 helper script
- **External dependencies**: none beyond pi itself (loop is shell or `createAgentSession`)
- **Prior learnings surfaced**: 5 directly relevant (D-005, D-007, D-013, D-018, D-019)
- **External research gaps**: 1 large gap (Ralph Loop provenance + canonical prompt)
- **Estimated complexity**: medium (the *code* is small; the *protocol* is everything)

---

## How an extension reaches pi (pij-specific, fully verified)

This is the part I can answer with certainty — it's all local.

### Authoring path in pij

```bash
npm run new -- ralph-loop          # scaffold T2 layout from harness/templates/
cd pij && pi                        # auto-loads .pi/extensions/ralph-loop/
/reload                             # after edits (P10 is your friend)
npm run typecheck && npm test       # store-layer tests (P2 + P8)
npm run smoke -- ralph-loop         # tmux-driven end-to-end
npm run self-check                  # full pipeline before merge
```

**Generator output** (verified by reading `harness/scripts/new-extension.ts`):

```
.pi/extensions/ralph-loop/
├── AGENTS.md          # per-extension agent rules
├── index.ts           # wiring: pi handlers, command, tool registration
├── store.ts           # pi-free data layer (P2)
├── store.test.ts      # vitest against store
├── smoke.ts           # tmux scenario for npm run smoke
└── .generated         # marker; T035 teardown uses this
```

`{{name}}` → `ralph-loop`, `{{ClassName}}` → `RalphLoop` in templates.

### Patterns the extension MUST follow (P1–P10, from AGENTS.md)

| # | Pattern | Ralph Loop specific |
|---|---------|---------------------|
| P1 | T2 layout by default | Yes — multi-concern (state + tools + commands + driver) |
| P2 | Pi-free `store.ts` | `RalphLoopStore` is plain TS; no `@earendil-works/*` imports |
| P3 | Inject side effects via constructor | Pass `appendEntry` + `runIteration` callbacks into the store |
| P4 | Tagged-union returns | `{ ok: true, iteration: N } \| { ok: false, reason: "budget_exhausted" \| "stop_token" \| ... }` |
| P5 | Constants in `store.ts` | `MAX_ITERATIONS_DEFAULT`, `MAX_USD_PER_RUN_DEFAULT`, `PLAN_FILE_DEFAULT` |
| P6 | Structural entry types at boundary | Replay guards for `ralph-loop:iteration`, `ralph-loop:stop`, `ralph-loop:budget` |
| P7 | `.js` extension on relative imports | `import { RalphLoopStore } from "./store.js";` |
| P8 | Tests target the store | Test budget math, replay, stop-condition evaluation — **not** the loop itself |
| P9 | Persist before mutate | Append `ralph-loop:iteration` entry **before** updating in-memory counter |
| P10 | One `session_start` handler | Rehydrate iteration history on `startup`/`resume`/`fork`/`reload`/`new` |

### Pi APIs the extension will use (verified from docs)

- `pi.registerCommand("ralph", ...)` — `/ralph` slash command (start/stop/status/configure)
- `pi.registerTool({ name: "ralph_iterate", ... })` — LLM-callable tool that drives one iteration (relevant if Ralph is *inside* pi as a tool the model invokes)
- `pi.appendEntry(customType, data)` — persist each iteration's outcome (P9)
- `pi.on("session_start", ...)` — replay history on every entry reason (P10)
- `ctx.ui.setStatus("ralph-loop", "iter 7/50")` — footer pill (remember **D-006**: pass `undefined` not `""` to clear)
- `ctx.ui.notify(message, "info" | "warning" | "error")` — note **D-018**: no `"success"`
- `ctx.ui.confirm(...)` — optional human-in-the-loop gate before destructive iterations

---

## How it currently works (existing pi/pij capabilities relevant to Ralph)

### Entry points the extension would expose

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `/ralph` | command | `index.ts` | start/stop/status; primary user surface |
| `/ralph plan` | command | `index.ts` | show/edit the active plan file |
| `ralph_iterate` | tool | `index.ts` | one-shot iteration; LLM-callable for in-conversation Ralph |
| `ralph_check_stop` | tool | `index.ts` | evaluate stop conditions; returns structured verdict |
| `session_start` | handler | `index.ts` | rehydrate iteration history on every reason (P10) |

### Two viable inner-loop shapes (this is the key design decision)

**Shape A — In-session, tool-driven ("Ralph as a pi tool").**

The user runs `/ralph start ./PLAN.md` once. Pi's *current* LLM (whatever the user picked) is steered by an extension-injected system prompt or skill to repeatedly call `ralph_iterate` until `ralph_check_stop` says stop. No subprocess. One pi session, many iterations.

- **Pros**: dead simple; pi handles model/auth/UI; cost is metered by the same pi session; easy to interrupt with Ctrl-C.
- **Cons**: shares context window with the user → not truly stateless per iteration; risk of context drift / token bloat across many iterations.
- **Mitigation**: extension forcibly invokes `/compact` between iterations, OR enforces a "tool-result-only" pattern.

**Shape B — Out-of-session, subprocess-driven ("Ralph as a loop runner").**

The user runs `/ralph start ./PLAN.md`. Extension forks/spawns `pi --mode json <prompt>` per iteration with a fresh context, streams the JSON event log back, parses `message_end`, then loops.

- **Pros**: true fresh context per iteration (canonical Ralph); easy to swap models per iteration; matches the original Ralph pattern from ghuntley.com (per my unverified knowledge).
- **Cons**: child-process management; cost accounting must be reconstructed from JSON events; harder to interrupt; per-iteration startup cost.
- **Reference**: this is exactly the pattern `npm:pi-subagents` (already installed here) uses for subagent dispatch — see dossier `007-options-for-pi-extensions-that-do-subagents/`.

**Shape C (hybrid) — In-process via SDK.**

Use `createAgentSession()` from `@earendil-works/pi-coding-agent` to spin a fresh agent session per iteration **inside the extension's Node process**. Best of both: fresh context, no subprocess overhead, full control over the session lifecycle.

- **Pros**: cleanest control; aligns with pij's "harness is the product" philosophy because the loop becomes inspectable in-process.
- **Cons**: requires careful resource teardown per iteration; the SDK API is documented but newer than the JSON/RPC modes.

**Recommendation (subject to spec): start with Shape A, design for Shape C.** Shape A delivers value in one afternoon and proves the protocol. Shape C is the durable form once the protocol is stable. Shape B is what we'd build if pij needed to manage Ralph across a session boundary — not needed yet.

### Data flow (single iteration, Shape A)

```
user types /ralph start ./PLAN.md
  └─► store.startRun({ planPath, budgets }) → append ralph-loop:run-start
  └─► extension nudges model: "call ralph_iterate"
       └─► tool: read PLAN.md, identify next undone task, return prompt-context
       └─► model: do the task (edit files, run tests via pi's bash tool)
       └─► tool: ralph_check_stop → reads PLAN.md, checks budget, checks tests
            └─► if stop → append ralph-loop:run-end, notify, exit loop
            └─► else   → append ralph-loop:iteration, status pill++, loop
```

### State management

- **Persistent**: each iteration appends `ralph-loop:iteration` with `{ id, iterationNumber, taskTitle, taskFingerprint, durationMs, costUsd?, gitSha?, verdict }`. The store rehydrates this on every `session_start` reason (P10), so `/compact`, `/resume`, `/fork`, and reload all preserve iteration history. **D-005** flags that `customType` durability across `/compact` is unverified — Ralph Loop is the perfect re-test vehicle.
- **In-memory**: the active run config (`planPath`, `maxIterations`, `maxUsd`, `startedAt`, …) and a counter. Lost on session end if no `ralph-loop:run-start` was appended (P9 keeps us honest).
- **External**: the plan file itself (`PLAN.md` or whatever the user points at). Lives on disk, version-controlled by the user. The store NEVER mutates it; only the running LLM does, through pi's standard file-write tools.

---

## Architecture & Design

### Core components

- **`store.ts` — `RalphLoopStore`**: pi-free data layer.
  - `startRun(config) → { ok, runId } | { ok: false, reason }`
  - `recordIteration(data) → void` (appends + updates counter)
  - `endRun(verdict) → void`
  - `evaluateStop(currentState, budgets) → { stop: boolean, reason?: StopReason }`
  - `rehydrate(entries)` — replay history; P6 structural guards
- **`index.ts` — wiring**: registers `/ralph` command, `ralph_iterate` tool, `ralph_check_stop` tool, `session_start` handler, status pill.
- **`store.test.ts`**: vitest. Targets stop-condition math, budget exhaustion, replay determinism, malformed-entry tolerance.
- **`smoke.ts`**: tmux scenario. Drives `/ralph start` against a fake `PLAN.md` with one tiny task and asserts the iteration count appears in the status pill.
- **`AGENTS.md`** (per-extension): extension-specific rules — e.g., "never bypass stop conditions in tests".

### Design patterns identified (pij-encoded)

1. **Event sourcing** (P9 + P10) — every iteration is an entry; in-memory state is derived.
2. **Constructor injection** (P3) — `appendFn`, plus optional `runIteration` for Shape C testing.
3. **Tagged unions** (P4) — `StopVerdict`, `IterationResult`, `RunStartResult`.
4. **Structural guards at the boundary** (P6) — replay entries are validated with `isIterationData()` etc., never cast.

### Stop conditions (the actual product)

This is where Ralph Loops live or die. The extension MUST enforce **all** of:

| Condition | Default | Source |
|-----------|---------|--------|
| Max iterations | 50 | extension config + `MAX_ITERATIONS_DEFAULT` in `store.ts` |
| Max USD cost | $5 | extension config; cost from pi's per-iteration token meter |
| Max wall-clock | 30 min | extension config |
| Plan file says "DONE" / has no undone tasks | always-on | reads plan, matches a configurable regex |
| Tests fail twice in a row on the same task | always-on | iteration history check |
| Same task fingerprint for N consecutive iterations | 3 | iteration history check (catches "spinning") |
| `STOP` token in plan file | always-on | escape hatch the user can write manually |
| User Ctrl-C | always-on | pi's signal handling |

**Each stop condition is its own `StopReason` union case** so the run summary tells the user *why* it stopped. This is the actual differentiator vs `while true; pi ...; done` shell scripts.

### System boundaries

- **Internal**: the store and the in-process tool handlers.
- **External**: pi's file-edit tools (model uses them), pi's bash tool (model uses for tests), the plan file on disk, the user's git repo state.
- **Out of scope**: model selection (let `/model` and `~/.pi/agent/models.json` handle it — see RUNBOOK § "Custom / unlisted pi models", D-020), provider auth, sandboxing.

---

## Dependencies & Integration

### What this depends on

#### Internal (pi APIs)

| Dependency | Type | Purpose | Risk if changed |
|------------|------|---------|-----------------|
| `pi.registerCommand` | required | `/ralph` UX | none (stable API) |
| `pi.registerTool` | required | LLM-callable iteration | none (stable API) |
| `pi.appendEntry` | required | P9 event-sourcing | none (stable API) |
| `pi.on("session_start")` | required | P10 replay | none (stable API) |
| `ctx.ui.setStatus` | required | iter counter pill | mind **D-006**: `undefined` not `""` |
| `ctx.ui.notify` | required | iteration outcomes | mind **D-018**: no `"success"` |
| `ctx.ui.confirm` | optional | human checkpoint | none |
| `createAgentSession` (SDK) | Shape C only | fresh-context iteration | SDK newer than RPC/JSON modes |

#### External

None beyond pi itself. No npm runtime deps (peerDeps stay correct per **D-004**).

### What depends on this

Direct consumers (this extension will likely be consumed by):

- `npm:pi-subagents` (already installed) — could dispatch a Ralph Loop as a subagent
- pij's own validator agent (`agents/extension-validator/`) — could use Ralph as a stress-test target
- Future workshop on long-running agentic patterns

---

## Quality & Testing

### Current test coverage in pij (relevant patterns)

- Store tests: vitest, fast, mocked `appendFn`, replay-determinism + malformed-entry coverage. Pattern is solid (P8). Ralph Loop fits this exactly.
- Smoke: tmux + pi binary on PATH. **D-008** flags that smoke can't run in CI; Ralph Loop's smoke will have the same limitation.
- Driver SDK at `harness/driver/` is the cleanest substrate for Ralph's smoke scenarios because it offers idle-wait + assertion primitives.

### Test strategy for `ralph-loop`

| Layer | Target | Tool | Where |
|-------|--------|------|-------|
| Stop-condition math | `RalphLoopStore.evaluateStop` | vitest | `store.test.ts` |
| Budget exhaustion | `RalphLoopStore.recordIteration` | vitest | `store.test.ts` |
| Replay determinism | `RalphLoopStore.rehydrate` | vitest | `store.test.ts` |
| Malformed entries | P6 structural guards | vitest | `store.test.ts` |
| `/ralph` command surface | TUI rendering | smoke (tmux) | `smoke.ts` |
| One-iteration golden path | end-to-end with a fixture plan | smoke (tmux) | `smoke.ts` |
| Ctrl-C cancels cleanly | signal handling | manual + driver SDK | scenario file |

### Known issues / tech debt (carried into this build)

| Issue | Severity | Source | Impact on Ralph Loop |
|-------|----------|--------|----------------------|
| D-005 — `customType` durability across `/compact` unverified | high | difficulties.md | Ralph's iteration history MUST survive `/compact`; this build is the re-test |
| D-006 — `setStatus(..., "")` leaves a stale pill | low | difficulties.md | clear with `undefined` when no active run |
| D-007 — no file watcher | medium | difficulties.md | `/reload` after edits to plan-related logic |
| D-008 — smoke needs tmux + pi binary | medium | difficulties.md | CI won't run Ralph's smoke until SDK-driven smoke lands |
| D-013 — fresh-clone empty `.pi/extensions/` | high (encoded) | difficulties.md | not a Ralph risk; encoded fix in place |
| D-018 — notify `"success"` rejected | low | difficulties.md | use `"info"` for positive iteration completion |
| D-019 — `list({ limit: 0 })` returns all | low | difficulties.md | if Ralph paginates iteration history, short-circuit `limit === 0` |
| D-020 — `/model` arbitrary names rejected | low | difficulties.md | unrelated; model choice happens outside Ralph |

### Performance characteristics (predicted)

- Iteration overhead from the extension itself: **negligible** (a few appendEntry calls + a stop check).
- Dominant cost: the LLM call inside each iteration. Ralph's value is in **shape** (fresh context, plan-as-memory), not perf.
- Memory: bounded by iteration history length × per-entry size; trim on long runs if needed.

---

## Modification Considerations (for the build)

### ✅ Safe to ship in v1

- Shape A (in-session, tool-driven).
- Single plan file, no multi-plan support.
- Markdown-only plan format (regex for "DONE" / "STOP").
- Hard-coded default budgets; overridable via slash-command args.
- Tmux-driven smoke covering one happy path.

### ⚠️ Worth being explicit about

- **Stop-condition order matters.** Always evaluate cheap conditions first (counter, budget) before expensive ones (re-reading the plan file).
- **Cost accounting** — we need pi's per-message token meter exposed in the context. If it isn't, that's a difficulty row.
- **Plan file mutation race** — if the user edits PLAN.md while Ralph is running, Ralph might re-read it mid-iteration and get inconsistent state. Snapshot at iteration start.

### 🚫 Don't do in v1

- Don't build the loop driver in shell. Keep it in TS so the harness can introspect it.
- Don't share state between concurrent Ralph runs. Either one-run-at-a-time, or use the existing worktree pattern from the subagents extension (out of scope for v1).
- Don't auto-`git push`. Ever. Commits yes (configurable); pushes no.
- Don't bypass P9. Every iteration must append before mutating the counter — otherwise `/compact` and `/resume` lose data and **D-005** stays unverified.

### Extension points (designed for future)

- **Plan format adapter**: today markdown-with-checkboxes; future YAML, TOML, JSON-Schema-validated.
- **Iteration strategy**: Shape A → Shape C (SDK-based) → Shape B (subprocess).
- **Stop-condition plugins**: register additional conditions from other extensions.
- **Hooks**: `before_iteration`, `after_iteration`, `on_stop`.

---

## Prior Learnings (from pij's own ledger)

### 📚 PL-01 — `customType` durability across `/compact` is unverified

**Source**: `docs/difficulties.md` D-005
**Type**: open (high severity)
**Why it matters now**: Ralph Loop is **the most persistent extension we'll ever build**. If `/compact` drops `customType` entries, the iteration history vanishes and replay is broken. Ralph's smoke MUST exercise this path.
**Action**: include a `/compact` step in `smoke.ts` and assert iteration count is preserved.

### 📚 PL-02 — `setStatus(..., "")` STORES an empty string

**Source**: `docs/difficulties.md` D-006
**Type**: encoded (low)
**Why it matters now**: when Ralph isn't running, we want zero pill — pass `undefined`, not `""`.
**Action**: status helper in `index.ts` uses `count === 0 ? undefined : "ralph: …"` exactly per template pattern.

### 📚 PL-03 — `notify` doesn't accept `"success"`

**Source**: `docs/difficulties.md` D-018
**Type**: mitigated (low)
**Why it matters now**: iteration-complete and run-complete are positive events; we'll be tempted to type `"success"`.
**Action**: map success → `"info"`. Encode as a one-line helper if the pattern repeats.

### 📚 PL-04 — `list({ limit: 0 })` returns full array

**Source**: `docs/difficulties.md` D-019
**Type**: mitigated (low)
**Why it matters now**: if Ralph paginates `iterations()` (likely for `/ralph status`), explicit `if (limit === 0) return [];` short-circuit.
**Action**: copy the short-circuit pattern from scratch's retired implementation.

### 📚 PL-05 — `await ctx.reload()` runs post-reload code from pre-reload version

**Source**: `docs/difficulties.md` D-002
**Type**: mitigated (medium)
**Why it matters now**: if Ralph offers `/ralph reload-plan` that triggers a reload, end the handler with bare `return`.
**Action**: template already encodes this; respect it.

### Prior learnings summary

| ID | Type | Plan | Key insight | Action for ralph-loop |
|----|------|------|-------------|-----------------------|
| PL-01 | gotcha | difficulties D-005 | `customType` + `/compact` durability untested | smoke must include `/compact` |
| PL-02 | gotcha | difficulties D-006 | `setStatus(..., "")` leaves stale pill | clear with `undefined` |
| PL-03 | gotcha | difficulties D-018 | no `"success"` notify level | use `"info"` |
| PL-04 | gotcha | difficulties D-019 | `slice(-0)` returns whole array | short-circuit `limit === 0` |
| PL-05 | gotcha | difficulties D-002 | `await ctx.reload()` returns to old code | end handler with `return` |

---

## Domain Context

No `docs/domains/registry.md` exists. Domain & Boundary Scout output (synthesized inline since this is solo, not parallel):

**Potential domain identified**: `agentic-loops` (proposed slug).

| Proposed domain | Evidence | Boundary | Files (current/future) |
|-----------------|----------|----------|------------------------|
| `agentic-loops` | This extension + `npm:pi-subagents` + `agents/extension-validator/` + `agents/code-review-companion/` are all variations of "drive an agent over a fresh-context iteration cycle" | Inputs: a goal/plan + budgets; outputs: iteration history + verdict | `.pi/extensions/ralph-loop/`, `agents/extension-validator/`, `agents/code-review-companion/`, third-party `npm:pi-subagents` |

> If after ralph-loop ships we agree this is a real cluster, run `/plan-v2-extract-domain` and write `docs/domains/agentic-loops/domain.md`. Until then, just note it.

---

## Agent Harness Status

Read from `docs/project-rules/harness.md`: **L2** maturity (auto boot, deterministic observe, tmux-driven interact). Ralph Loop work needs:

- **Boot**: `npm install` — present.
- **Interact**: `pi` + `/reload` + `npm run smoke` — present.
- **Observe**: `npm run self-check` — present.

No agent-harness gaps block this build. The build itself is a great L2 → L3 exercise: a successful Ralph Loop run is the first **autonomous** workload pij has executed end-to-end without human babysitting.

---

## Critical Discoveries

### 🚨 CD-01 — External Ralph Loop facts verified ✅ (was: Perplexity quota exhausted)

**Impact**: Resolved
**Source**: `external-research/ralph-loop-provenance.md` (Perplexity refilled mid-session; three focused `perplexity_ask` calls succeeded; `perplexity_research` still timed out — see D-021).
**What**: All Ralph Loop "first principles", canonical prompt text (`<promise>COMPLETE</promise>`), attribution to Geoffrey Huntley, and outcome claims (Sonnet 4.5 ≈ $10.42/hr; Nomad/Tailscale clones; 10-iteration default) are now verified against primary sources (ghuntley.com/ralph, github.com/snarktank/ralph, github.com/ghuntley/how-to-ralph-wiggum, the Anthropic-official Ralph-loop plugin).
**Why it mattered**: We're naming an extension after a community pattern. Attribution and design choices must be grounded in what the community actually built, not training-knowledge approximations.
**Action taken**: Executive Summary updated with verified facts. Implications for the build distilled into `external-research/ralph-loop-provenance.md` §10 (10 specific design implications, each tied to a primary source).

### 🚨 CD-02 — Iteration history durability across `/compact` is THE thing this build must prove

**Impact**: Critical
**Source**: D-005 (open since 2026-05-09)
**What**: Pi appends iteration entries via `pi.appendEntry("ralph-loop:iteration", ...)`. `/compact` is documented to compress conversation, but whether `customType` entries survive has not been verified.
**Why it matters**: If they don't, every Ralph Loop horror story repeats here: 30 iterations in, user `/compact`s, all history gone, Ralph loops forever.
**Required action**: smoke scenario explicitly exercises `/compact` mid-run and asserts the iteration counter survives. If it doesn't, fix the persistence path (or surface it upstream to pi-mono) **before** any v1 announcement.

### 🚨 CD-03 — Stop conditions are the product

**Impact**: High
**Source**: synthesis of training knowledge + pij ledger
**What**: A Ralph Loop without disciplined stop conditions is `while true; pi ...; done` in a trench coat.
**Why it matters**: differentiation against shell-wrapper Ralphs IS the encoded stop-condition machinery.
**Required action**: spec must list all stop conditions, their defaults, and which are user-overridable.

---

## Recommendations

### If we build this

1. **Start with Shape A** (in-session, tool-driven). Ship in one afternoon. Prove the protocol.
2. **Bake `/compact` into the smoke**. D-005 verification is half the value of this build.
3. **Encode every stop condition as a tagged union case**. No magic numbers in `index.ts`; all in `store.ts` (P5).
4. **Run a real Ralph Loop on a fixture project** as part of pij's own self-check. If it loops or stops correctly, the harness has graduated.
5. **Update the velocity log** with start/end timestamps. This is exactly the kind of phase the compounding hypothesis is for.

### If we extend later

- Shape C (SDK-driven, fresh context per iteration) is the durable form.
- Multi-Ralph swarms become a `npm:pi-subagents` consumer, not a re-implementation.
- Plan-file format becomes pluggable.

### If we refactor later

- The store layer is the seed for `docs/domains/agentic-loops/`.
- Stop-condition plugins are an extension-of-extensions opportunity.

---

## External Research Opportunities

### Opportunity 1 — Ralph Loop provenance and canonical prompts ✅ RESOLVED

**Resolved by**: `external-research/ralph-loop-provenance.md` (written 2026-05-14 after Perplexity refill).

**Headline verified facts**:
- Coined by Geoffrey Huntley (@ghuntley). Canonical post: <https://ghuntley.com/ralph/>.
- Original definition (verbatim): *"Ralph is a Bash loop."*
- Canonical stop sigil: `<promise>COMPLETE</promise>`.
- Reference implementation: `snarktank/ralph`. Default cap = **10 iterations**.
- Huntley's teaching repo: <https://github.com/ghuntley/how-to-ralph-wiggum>.
- Economic claim: Sonnet 4.5 + Ralph ≈ **$10.42/hr** (LinearB / Dev-Interrupted).
- Reported successes: Nomad clone, Tailscale rebuild (reverse-Ralph + forward-Ralph).
- Reported failures: 40k-line PRs, cost overruns without caps, prod incidents when the loop has write secrets.
- Compaction-avoidance is Ralph's design intent — maps directly to pij D-005.

**Remaining gaps for v1 build**:
- Read `anthropics/claude-plugins-official` plugin source directly for exact flag surface (`--completion-promise`, `--max-iterations`).
- Read `snarktank/ralph/prompt.md` and `coleam00/ralph-loop-quickstart/PROMPT.md` verbatim before authoring pij's default prompt.
- Read `ghuntley/how-to-ralph-wiggum` repo directly as first-party teaching reference.

These are reading tasks, not external-research tasks. Slot into plan-3 / plan-5.

---

## Appendix: file inventory (predicted)

### Core files (to be created)

| File | Purpose | Est. LOC |
|------|---------|----------|
| `.pi/extensions/ralph-loop/index.ts` | wiring + tools + command | 120–180 |
| `.pi/extensions/ralph-loop/store.ts` | pi-free data + stop logic | 200–260 |
| `.pi/extensions/ralph-loop/store.test.ts` | vitest | 150–220 |
| `.pi/extensions/ralph-loop/smoke.ts` | tmux scenario | 30–60 |
| `.pi/extensions/ralph-loop/AGENTS.md` | per-extension rules | 30–50 |

### Reference files (read by this dossier)

- `AGENTS.md`, `RUNBOOK.md`, `docs/project-rules/harness.md` — constitution + BIO loop
- `docs/difficulties.md` — D-002, D-005, D-006, D-007, D-008, D-013, D-018, D-019, D-020
- `docs/velocity.md` — measurement protocol
- `harness/templates/extension/*.template` — scaffold (all 5 read)
- `harness/scripts/new-extension.ts` — generator
- `harness/driver/{index,run}.ts` — typed smoke substrate
- `/Users/jordanknight/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/docs/{extensions,sdk,rpc,json}.md` — pi API surface
- `docs/plans/007-options-for-pi-extensions-that-do-subagents/research-dossier.md` — prior parallel-iteration design work

---

## Next Steps

1. **Optional**: read the three first-party repos directly to lift verbatim prompt text before authoring pij's default:
   - <https://github.com/ghuntley/how-to-ralph-wiggum>
   - <https://github.com/snarktank/ralph/blob/main/prompt.md>
   - <https://github.com/coleam00/ralph-loop-quickstart/blob/main/PROMPT.md>
2. **Run `/plan-1b-specify "ralph-loop pi extension"`** with this dossier + `external-research/ralph-loop-provenance.md` in the same plan folder.
3. **`/plan-2-clarify`** will need to resolve: Shape A vs C for v1, default budget values, plan-file format (snarktank `prd.json` shape vs lighter markdown), attribution wording.
4. **Commit cadence suggestion**: commit dossier + external-research + D-021 together now: `docs: plan-1a research dossier for ralph-loop extension + external research verified`.

---

**Research Complete**: 2026-05-14
**Report Location**: `docs/plans/008-ralph-loop-extension/research-dossier.md`
**Status**: ✅ Ready for `/plan-1b-specify`. External research verified in `external-research/ralph-loop-provenance.md`. CD-01 resolved.
