# How-to: Ralph Loop in pij

**The Ralph Loop** is Geoffrey Huntley's pattern for autonomous coding agents:
spin a fresh model session per iteration, hand it a markdown plan file as the
workspace, and stop on a closed set of conditions. pij ships it as
`.pi/extensions/ralph-loop/`.

> Attribution: pattern = Huntley (<https://ghuntley.com/ralph/>);
> reference CLI = [snarktank/ralph](https://github.com/snarktank/ralph) (default
> 10 iterations, `<promise>COMPLETE</promise>` sigil); prompt structure
> borrows from [coleam00/ralph](https://github.com/coleam00/ralph).

This doc is for **operators and agents** using `ralph-loop`. For internals
(`StopReason` semantics, `IterationRunner` contract, P1–P10 invariants),
read `.pi/extensions/ralph-loop/AGENTS.md` and the workshops at
`docs/plans/008-ralph-loop-extension/workshops/`.

---

## Quick start

1. **Write a plan file** (any path; convention `PLAN.md`):

   ```markdown
   # My plan

   - [ ] Write the README
   - [ ] Add a test
   - [ ] Run typecheck
   ```

2. **Inside `pi`, start the loop**:

   ```text
   /ralph start ./PLAN.md
   ```

   The status pill shows `ralph-loop: iter N/M` as the loop progresses.

3. **Watch it work**. Each iteration spawns a fresh agent session, picks the
   first unchecked task, does that ONE task, checks it off, and stops. The
   outer loop re-runs until a stop condition fires.

4. **It stops when**:
   - The agent emits `<promise>COMPLETE</promise>` (a "sigil" stop).
   - The plan has no remaining unchecked tasks (`complete: plan_exhausted`).
   - The plan contains a standalone `STOP` line (`manual_stop`).
   - Iteration cap reached (default 10; `max_iterations`).
   - Budget cap reached (USD opt-in; wallclock default 30 min).
   - Last N iterations spun on the same task (`spinning`; default N=3).
   - You ran `/ralph stop` or pressed Ctrl-C (`user_cancel`).

   See [`StopReason` reference](#stopreason-reference) for the exact taxonomy.

5. **Inspect what happened**:

   ```text
   /ralph status
   /ralph status --json   # machine-readable envelope; used by the smoke
   ```

---

## Plan file conventions (workshop 003)

A plan is a UTF-8 text file (any extension). The parser scans line-by-line
with a tiny grammar:

| Token | Regex (line-anchored) | Semantics |
|-------|----------------------|-----------|
| **Undone task** | `^[ \t]*[-*][ \t]+\[[ ]\][ \t]+(?<title>.+?)\s*$` | An unchecked GFM task list item. |
| **Done task** | `^[ \t]*[-*][ \t]+\[[xX]\][ \t]+(?<title>.+?)\s*$` | A checked item. |
| **Stop marker** | `^[ \t]*[sS][tT][oO][pP][ \t]*$` | A line whose trimmed content is exactly `STOP` (case-insensitive). |
| **Anything else** | (no match) | Ignored. |

Notes:

- **Empty title rows** (`- [ ] `) are recorded as warnings, not consumed
  as tasks. Check `/ralph status` for them.
- **`STOP` inside a task title** (`- [ ] STOP`) parses as a task, NOT a
  marker. The marker must be the whole line.
- **Nested tasks** are independent — each `- [ ]` is one task regardless
  of indentation; the agent picks the leaf or parent in document order.
- **CRLF / BOM / UTF-8 errors** are tolerated; warnings logged.

### Examples

```markdown
- [ ] Refactor auth
  - [ ] Move tokens to vault
  - [x] Rotate signing key
- [ ] Update docs

STOP

- [ ] Implement payments (later)
```

The loop stops **pre-iteration 1** via `manual_stop` (the standalone
`STOP` line ends the run BEFORE any iteration runs).

```markdown
# Done!

- [x] All of it
```

The loop stops **pre-iteration 1** via `complete: plan_exhausted` (no
undone tasks remaining).

---

## Command surface

| Command | What it does |
|---------|-------------|
| `/ralph start <plan-path> [--max-iters N] [--max-usd N] [--max-wallclock-ms N] [--spinning-n N]` | Begin a run against `<plan-path>`. Default caps: 10 iterations, no USD cap, 30 min wallclock, spinning detected over last 3 iterations. |
| `/ralph stop` | Cancel the current run at the next iteration boundary (or mid-iteration if the runner forwards the AbortSignal). |
| `/ralph status` | Print human-readable run summary (iterations, last task, run-active, last stop reason, spent USD). |
| `/ralph status --json` | Same envelope as JSON. Stable shape — the AC-05 smoke parses this directly. |
| `/ralph plan` | Print the active plan path. |

The two LLM-callable tools:

| Tool | Purpose |
|------|---------|
| `ralph_check_stop` | Returns the latest run's `StopReason` so an outer agent can introspect lifecycle. |
| `ralph_iterate` | Drive one more iteration against an existing run by id. Rare — the command surface is the usual driver. |

---

## StopReason reference

The closed taxonomy. Every run ends with exactly one of these (see
`agentic-loops` domain doc § Contracts § Headline for the verbatim TypeScript):

| `kind` | Fires when | Default cap | Configurable | What you do |
|--------|-----------|-------------|--------------|-------------|
| `complete` (`reason: "sigil"`) | Agent output contained `<promise>COMPLETE</promise>` | n/a | no | success — verify the work in the plan/diff |
| `complete` (`reason: "plan_exhausted"`) | No undone tasks remain (pre or post iter) | n/a | no | success — agent did everything you asked |
| `max_iterations` | iteration counter at cap | 10 | `--max-iters` | review: was progress real or did the loop plateau? |
| `budget_usd` | spent ≥ `maxUsd` and a cap was set | OFF | `--max-usd` | cost forensic — was the model verbose? |
| `budget_wallclock` | elapsed ≥ `maxWallClockMs` | 30 min | `--max-wallclock-ms` | progress-per-minute trend — model thrashing? |
| `spinning` | last N iterations share a task fingerprint | N=3 | `--spinning-n` | the agent is stuck — manual intervention (refine the task, add context) |
| `manual_stop` | plan file contains `STOP` on its own line | n/a | edit the plan | explicit user override; usually intentional |
| `user_cancel` | you pressed `/ralph stop` or Ctrl-C | n/a | no | clean shutdown |
| `unverified` | rare; outer guard fallback | n/a | no | bug — file a difficulty row |

### Tie-breaking

When multiple conditions could fire in the same iteration, priority is:

1. **`user_cancel`** wins everything. Your intent trumps the loop's.
2. **Explicit done** (`manual_stop` OR `complete`) before caps. If the
   agent emitted the sigil AND the iteration cap was reached this turn,
   the sigil wins.
3. **Caps** in increasing-cost order: iteration count → USD → wall-clock.
4. **`spinning`** last — most expensive to evaluate.

The evaluator is split into a `pre` pass (before each iteration) and a
`post` pass (after). The pre pass catches `manual_stop`, `complete:
plan_exhausted`, `user_cancel`-between-iters, and caps already exceeded.
The post pass catches `complete: sigil`, `spinning`, caps newly tripped.

---

## Per-iteration cost guidance

By default, ralph-loop captures whatever cost the SDK exposes via
`session.getSessionStats().cost`. If the SDK doesn't expose cost (varies
by provider), per-iteration `costUsd: null` is recorded and `budget_usd`
won't fire even if you set `--max-usd`. Treat USD caps as **best-effort**.

Rough order-of-magnitude (per Ralph Loop research):

- Sonnet 4.5 / Opus 4.5: ~$1–$10/hour at typical iteration rates
  (Huntley reports ~$10.42/hour as a high-water).
- GPT-5/5.5 Codex: somewhere similar; varies by reasoning tier.
- Copilot subscription routes: no per-iteration USD reported.

If you need a hard ceiling, use `--max-iters` AND `--max-wallclock-ms` —
those are deterministic.

---

## Troubleshooting

### "ralph-loop: real SDK runner not wired in v1"

The v1 default factory throws this error when `PIJ_RALPH_FAKE_RUNNER` is
NOT set. v1 does not auto-wire a nested pi `createAgentSession` — that's
deferred. Two options:

1. **Set the env var** to use a deterministic 3-iteration fake runner:
   ```bash
   PIJ_RALPH_FAKE_RUNNER=1 pi
   ```
   Useful for smoke testing the structural path (workshop 004's
   choreography).

2. **Drive iterations manually via the `ralph_iterate` tool**, supplying
   your own IterationResult shape — useful for integration with a host
   agent that already has its own model session.

Real-SDK auto-wire is tracked as a follow-up; see `docs/difficulties.md`
D-005 (gated smoke requirement).

### "Nothing to compact (no messages yet)"

Under `PIJ_RALPH_FAKE_RUNNER=1` the host pi session has no LLM messages
of its own (the fake runner skips the model). pi's `/compact` therefore
emits this no-op message. The structural smoke (`compact-survival`)
accepts this as a valid response — the real AC-05 evidence is the
post-`/reload` replay path. To pressure-test `/compact` for real, run a
live conversation in pi before invoking `/ralph start`.

### `unverified` stop reason

This means the loop knew it should stop but couldn't classify which of
the 8 normal reasons applied. Causes (per `cause` field):

- `cost_unavailable` — wanted to honour a USD cap but SDK didn't report cost.
- `sigil_missing` — agent output never contained the completion sigil and
  no other terminator fired (rare — should be impossible after spinning + caps).
- `session_error` — the runner threw an unexpected error.

Every `unverified` firing is a bug; file a difficulty row with the
`detail` string as the title.

### D-005 / `/compact` durability — current status

Verified for the **replay path** via the structural smoke (T024).
Deferred for the **compact-pressure path** (requires real-model
conversation history). If you observe `customType` entries DROPPED after
`/compact` in a real session, that confirms D-005 — escalate per
workshop 004 § Upstream escalation by filing a pi-mono issue.

---

## "Why did Ralph stop?" — quick diagnosis

```text
/ralph status
```

shows the last `StopReason`. Map it to:

| Reason | Question to ask yourself |
|--------|------------------------|
| `complete (sigil)` | Did the agent actually finish? Check tests + diff. |
| `complete (plan_exhausted)` | Was the plan complete BEFORE Ralph ran? |
| `max_iterations` | Was progress real or stuck? Inspect each iteration's task title. |
| `budget_usd` | Costlier than expected — investigate prompt size + model choice. |
| `budget_wallclock` | Slow path? Tool latency? Network? |
| `spinning` | Same task three times — split it smaller or add context. |
| `manual_stop` | Intentional. |
| `user_cancel` | Intentional. |
| `unverified` | Bug. File a difficulty row. |

---

## See also

- Per-extension AGENTS.md: `.pi/extensions/ralph-loop/AGENTS.md`
- Workshops: `docs/plans/008-ralph-loop-extension/workshops/`
- Domain: `docs/domains/agentic-loops/domain.md`
- Difficulty ledger: `docs/difficulties.md` (rows D-005, D-014, D-024, D-025, D-026)
- Companion-mode harness governance: `docs/project-rules/agent-harness.md`
