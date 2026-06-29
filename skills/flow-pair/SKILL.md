---
name: flow-pair
description: |
  Orchestrate a flow-pair run: an expensive orchestrator session supervises planning, delegation, review, and learning, driving a small roster of pij **colleague** sessions — a **coder** that implements bounded packets and a separate **(cross-model) reviewer** — acquired lazily and reused across the run. Use for: starting a flow-pair run, delegating a task packet to a worker, reviewing worker output, recording prompt-cluster learnings, or querying the run ledger. Also invoked as /flow-pair.
---

# /flow-pair

Wrap `the-flow` with an **orchestrator + colleague-peer delegation seam** (a coder
and a separate cross-model reviewer — § Fleet lifecycle) and a central
prompt-learning ledger. `the-flow` remains the inner route authority;
`flow-pair` is the delegation wrapper — never a replacement.

## Hard Invariants

1. **Flow-state non-write**: NEVER write `.the-flow-state.json`, `the-flow.json`,
   or `the-flow.md`. `the-flow` guided mode is the **sole** writer of these files.
   Any dual-writer corrupts resume/adopt.
2. **Pointer delivery**: worker packets are saved to the ledger first; only a short
   **path pointer** is sent via `pij send` — never a full packet body inline.
3. **Forbidden paths in every packet**: every worker packet must enumerate
   `.the-flow-state.json`, `the-flow.json`, `the-flow.md` as explicitly forbidden.
4. **Bounded scope**: each packet defines allowed paths; the worker executes ONLY
   within those paths.
5. **Persist before mutate** (P9): ledger records are written before state changes.
6. **Cluster isolation**: a prompt learning writes ONLY to the cluster it was tagged
   to — never cross-cluster.

## Orchestrator Decision Protocol

The expensive orchestrator follows this finite-state loop each turn:

| State | When | Action |
|-------|------|--------|
| `ASK_USER` | Requirement ambiguous or needs human decision | Pause and ask; never proceed without answer |
| `RUN_LOCAL` | Task is safe, cheap, read-only, or needs no delegation | Execute directly in orchestrator session |
| `DELEGATE` | Task is bounded, executable, and suitable for a cheap worker | Compile context pack → render packet → `pij send` path pointer. **Delegate a whole phase per packet, and make the packet say so** (worker-implement template § Completion Discipline): the coder implements *every* task in the phase in one run, not a couple-then-handback — fragmenting wastes a round-trip per slice and loses the worker's warm context |
| `REVIEW` | Worker reports completion | **Compact the worker FIRST** (reflex; § Fleet lifecycle) → acquire/canary the **reviewer peer** if not yet live → dispatch a review pointer to it. The verdict (+ mandatory Dim-0 mutation gate) is produced **by the reviewer**, handled on its return |
| `FIX` | Review verdict = `FIX_REQUIRED` | **Compact the reviewer FIRST** → render a narrowed fix packet (review findings only) → **dispatch it to the coder** (DELEGATE) |
| `APPROVE` | Review verdict = `APPROVE` or `APPROVE_WITH_NOTES` | **Compact the reviewer FIRST** → record approval → update ledger → advance state |

### Worker context hygiene — compact EARLY, not late (reflexive)

**The instant a worker (or reviewer) reports it is done, compact it — before you do
anything else with its report.** Do NOT wait until you're about to dispatch the
next packet. This is a reflex, not a remembered step: the first action after
receiving a "done" report is `pij_send({ to: <id>, command: "compact" })`.

**Why early, not late:** the session is idle for the entire time you review /
verify / synthesize / write the next packet, so the ~30–90s compact+summarize
latency overlaps work you're doing anyway. By the time you need the session
again it's already on a clean slate — **zero wait**. Compacting *late* (right
before dispatch) forces you to wait that latency each time, and on a saturated
post-stage context it has repeatedly caused the worker to **stall** (it reads
the packet, runs one tool call, then goes idle without starting the stage).

This applies to **every** worker session AND the reviewer — compact a reviewer
the moment it returns its verdict, so it's clean-slate ready for the next
re-review.

- A worker packet always carries full re-grounding context (findings, file:line,
  fixes), so a compacted worker re-reads the files and continues fine — even for a
  `FIX` iteration on its own code. When in doubt, compact early.
- **Safety for running sessions on a buggy extension:** compacting (and reloading)
  triggers a render. If a session still has a known-crashy extension loaded
  (e.g. the pi-peacock narrow-width crash), **reload it onto the fix first**
  (`command: "reload"`) and confirm it survives, *then* compact — otherwise the
  compact's render can crash it. Freshly-spawned sessions already have the fix.
- **Always confirm `command:compact, executed:true`** (via `pij tail <id>`) before
  sending the next pointer. After dispatch, **do not poll** for the session to flip
  to `working` and **do not nudge an "idle" peer** — trust the daemon's push and
  pipeline instead (§ Pipeline while a colleague is busy — the daemon pushes, you
  don't poll).

## Harness mode — pi tools vs the tmux control plane

flow-pair runs under **two harnesses**, and the colleague-comms seam differs.
**Detect once at run start** and use that mode for every spawn/send/tail/close:

- **pi mode** — the orchestrator is a **pi** session, so the in-process `pij_*`
  **tools** exist (`pij_spawn` / `pij_send` / `pij_close`). Use them. Inbound peer
  messages inject into your turn automatically (the in-process receiver). This is
  the original path and is **unchanged**.
- **control-plane mode** — the orchestrator is **Claude Code (or any non-pi
  client)**: the `pij_*` tools do **not** exist. Drive the **`pij` CLI + a running
  `pij daemon`** instead (Plan 019). The daemon spawns/binds the colleague in a
  tmux pane and relays messages via `send-keys`.

**Detection:** if the `pij_spawn` tool is callable → pi mode; otherwise →
control-plane mode (you're in Claude/other; the `pij` CLI is on `$PATH`).

**The one extra step in control-plane mode — self-adopt so colleagues can reach
*you*.** In pi, inbound is automatic; in control-plane mode you must register your
own pane as a peer **once at start**, or colleague replies have nowhere to land:

```
pij adopt "$TMUX_PANE" --harness claude    # → your pij-id; peers' sends now type
                                           #   into your pane as [pij from <id>] turns
```

**Command mapping** (same intent, per mode — full detail in
[`references/harness-modes.md`](./references/harness-modes.md)):

| Intent | pi mode (tools) | control-plane mode (CLI + daemon) |
|---|---|---|
| Prereq | pi extension loaded | a `pij daemon` (auto-started by `pij spawn`; else `pij daemon start`) + `pij adopt` self |
| Spawn colleague | `pij_spawn({ model, layout:"split" })` | `pij spawn --harness claude\|copilot --model <m>` (returns id at once; daemon drives boot→bind) |
| Deliver pointer / message | `pij_send({ to, message })` | `pij send <id> "<text>"` |
| Compact a colleague | `pij_send({ to, command:"compact" })` | `pij send <id> "/compact"` |
| Compact YOURSELF (+ auto-continue) | `pij compact-self [instruction]` | `pij compact-self [instruction]` — same in both modes |
| Peek (non-disturbing) | `pij tail <id>` | `pij tail <id> [--follow]` (reads the bound transcript) |
| Close (teardown) | `pij_close({ to })` | `pij close <id>` (ownership-aware; add `--force` to close a peer you didn't spawn) |

**Discover models with `pij models` — never grep config or hardcode strings.**
`pij models` (add `--json` to parse) lists every model id + provider pij knows —
`claude` (`claude-opus-4-8`, `claude-sonnet-4-6`, …), `copilot` (`gpt-5.5`, …),
`codex`, and `openrouter` incl. pi presets (`@preset/glm-1m`). Run it at fleet
setup to confirm the exact id for `--coder-model` / `--reviewer-model` before you
spawn. (`*`-marked rows are a best-effort alias list, not a live registry —
canary-verify the footer regardless.)

**Model names differ by mode.** The default-model table below is for pi/copilot
peers (`github-copilot/…` strings via `pij_spawn`). In control-plane mode the
colleague is a real **Claude**, **Copilot**, **codex**, or **pi** process:
`--harness claude` takes claude names (`opus`/`sonnet`/`haiku` or a full id like
`claude-opus-4-8`); `--harness copilot` takes copilot names (`gpt-5.5`,
`claude-sonnet-4.6`, …); `--harness pi` takes a pi model/preset (e.g.
`@preset/glm-1m`). `pij spawn` auto-applies the
harness's blanket-permission flag (`--dangerously-skip-permissions` for claude,
`--yolo` for copilot — a daemon-driven pane has no human to approve prompts). The
canary-verify, compact-early, and reuse-never-close disciplines below apply
**identically** across modes and harnesses — only the transport verb changes.

## Fleet lifecycle — the colleagues (coder + reviewer)

A run keeps a small **roster** of colleague sessions, acquired **lazily** and
**reused** across the whole run (never torn down between phases — only at final
tidy-up). The roster lives in the ledger (`run.json`) as
`role → { pijId, paneId, model, spawnedByUs }`, persisted before use (P9), so a
later `tidy` can find and close our windows even after a crash.

**Roles & default models** (overridable per run via `--coder-model` /
`--reviewer-model`):

| Role | Default model | Acquire when |
|------|---------------|--------------|
| coder | `github-copilot/claude-sonnet-4.6:xhigh` | first `DELEGATE` |
| reviewer | `github-copilot/gpt-5.5:xhigh` (cross-model, deliberately ≠ coder) | first `REVIEW` |

**Lifecycle:**

- **Acquire — provided-or-spawn, lazy (truly lazy for the reviewer).** If a role's
  peer id was provided, use it. Otherwise spawn the *first time that role is needed*
  — the coder on the first `DELEGATE`, the reviewer on the first `REVIEW` — and
  **never hijack ambient idle peers**.
  **Mandate: do NOT pre-spawn the reviewer alongside the coder.** It is tempting to
  stand up both peers at fleet setup "so they're ready," but the reviewer has
  nothing to do until the coder's first packet comes *back* for review — typically a
  whole phase (many minutes) later. **A spawned-but-idle peer is not free:** it is a
  live session holding a warm context that gets **re-sent and re-cached on every
  compact / keep-alive cycle**, and the prompt cache's short TTL means an untouched
  session's warmth lapses and must be **rewritten** to stay usable — so a reviewer
  pre-spawned a phase early quietly burns cache-token writes (plus a tmux pane) the
  entire time, with zero reviews to show for it. Spawn the reviewer at the *moment*
  of the first `REVIEW`, not one step sooner. *pi mode:*
  `pij_spawn({ model, layout: "split" })`. *Control-plane mode:* `pij spawn
  --harness claude --model <m>` (§ Harness mode; the daemon drives boot→bind and
  returns the id immediately). `layout:"split"` keeps the whole fleet in one window:
  orchestrator **main-left**, coder + reviewer **stacked on the right** — which is
  exactly the 3-pane cap (main + 2). Pass `layout:"window"` (the default) to fan
  the colleagues out into separate tmux windows instead.
- **Canary-verify before trusting — a ready-ping is NOT proof.** A wrong `--model`
  is accepted **silently** at startup (the bogus name even shows in the footer);
  the child still boots, registers, and ready-pings — then **400s on its first real
  inference** (`API error (400): model not supported`). Cost stays **$0.00** —
  there is **no expensive silent fallback**, but you get a *useless* worker that
  *looks* healthy. So after spawn, **capture the new window's footer**, confirm it
  shows the *expected* model, and confirm the boot turn completed without a 400.
  Mark the role healthy only then. **This canary applies to *provided* peers too**
  — verify a given peer's footer/model + no-400 before first use; never trust an
  inherited session blind.
- **Reuse across phases — compact, never close.** Between phases `pij_send({ to,
  command: "compact" })` each colleague so the same coder + reviewer carry the
  entire run, clean-slate each phase. (This is the compact-early reflex extended
  to "compact, keep, reuse.")
- **Heal.** A dead/stale colleague — or one that fails its canary — is closed and
  `pij_spawn`-replaced on next need; **persist the updated roster before**
  re-delivering the packet (P9).
- **Teardown — end only.** When tidying up after the run, close **only**
  colleagues with `spawnedByUs === true` (use the mode-appropriate verb —
  `pij_close({ to })` in pi mode, `pij close <id>` in control-plane mode); leave
  *provided* peers for their owner. Close is ownership-aware either way: pi's
  `pij_close` warns on a non-owner, while the CLI `pij close` **refuses** a peer
  you didn't spawn unless you pass `--force`.

> **Real peers, not builtin subagents.** Builtin subagents are **read-blind** in
> this harness (they cannot read files), so a coder/reviewer must be a real pij
> peer session (spawned or provided) — **never** a builtin-subagent fanout.

### Pipeline while a colleague is busy — the daemon pushes, you don't poll

The decision loop is per-turn, but the orchestrator must **not idle** while a
colleague works. The instant you dispatch — a packet to the coder, or a review to
the reviewer — advance the **next independent** work in parallel: prep the next
phase's tasks / context pack, draft the next packet, update the flight plan. The
colleague's run-time then overlaps orchestrator prep; collect the report when it
lands. (Same overlap logic as compact-early, applied to the whole busy window.)

**Let the push re-invoke you — never sit in a `pij state` poll loop.** The daemon
owns liveness and **pushes** it back to you: the colleague's **done-report**
re-invokes you on completion, and a **`stalled`** (went idle without finishing) or
**`dead`** (crashed / quota-died) push re-invokes you on failure. So after you
dispatch you do **not** confirm the session flipped to `working` within ~10s, and
you do **not** nudge a peer that merely looks idle — that old polling-nudge reflex
just burns your own expensive turns watching state the daemon already tracks and
will hand you unprompted. **Dispatch → do independent prep → let the push wake you.**

**Caveat — broken-transport peers still need a spot-check.** A peer whose
transport is broken (seen live with **codex v0.142.3**: `send` keystrokes don't
land and no events flow back) will never deliver a done-report *or* a
`stalled`/`dead` push, so its silence is **ambiguous — not a guarantee it's still
working**. For a peer on a known-broken transport only, fall back to a **periodic
`pij tail <id>` spot-check** (read its bound transcript directly; a slow heartbeat,
never a tight loop) to learn whether it actually finished or stalled. Healthy-
transport peers need no such poll — the push covers them.

## Invocation

```
/flow-pair start "<request>" [--repo <path>] [--ledger-root <path>] [--coder-model <m>] [--reviewer-model <m>]
/flow-pair dispatch --run-id <id> --plan-path <p> --phase <text> --tasks-dir <p> [--task-description <t>] [--allowed-paths <p1,...>]
/flow-pair observe [--run-id <id>]
/flow-pair review --delegation <id>
/flow-pair fix --review <id>
/flow-pair accept --delegation <id>
/flow-pair ledger [--run-id <id>]
/flow-pair learn --run-id <id> --delegation-id <id> --cluster <cluster> --miss-type <type> --summary <text> [--evidence <text>] [--candidate-delta <text>] [--prompt-lab-root <p>] [--json]
```

The skill shells out to `flow-pair` CLI (`skills/flow-pair/lib/cli.ts`) for all
state-mutating operations. The CLI is **never imported into pi** (P2 boundary,
Finding 08). See `references/architecture.md` for the full call chain.

## Procedure

1. **Resolve intent** — map the user's request to a decision-protocol state (above).
2. **Load context pack** — read the relevant plan sections + same-cluster learnings
   from `prompt-lab/clusters/<cluster>/active.md`. Do NOT load unrelated
   clusters (cluster isolation).
3. **Render packet** — follow `references/templates/orchestrator-stage.md` for
   orchestrator decisions; follow `references/templates/worker-implement.md` or
   `references/templates/worker-fix.md` for delegation packets.
4. **Deliver** — run `flow-pair dispatch --run-id <id> --plan-path <p> --phase <text> --tasks-dir <p>`,
   which compiles the context pack, renders the packet, writes it to
   `.flow-pair/runs/<run-id>/prompts/<delegationId>.md`, and prints exactly ONE line to stdout:
   `[flow-pair <delegationId>] Packet at: <rel-path>`
   Capture that line and deliver it to the worker (§ Harness mode for the verb).
   *pi mode:* the **`pij_send` tool** — `pij_send({ to: workerId, message: pointerMsg })`;
   do NOT shell `pij send` (the tool call is the transport boundary — P2: lib never
   sends; orchestrator sends). *Control-plane mode:* there is no in-process tool, so
   shell `pij send <workerId> "<pointerMsg>"` (the daemon injects it into the
   colleague's pane). Either way the **lib never sends** — the orchestrator does.
5. **Review via the reviewer peer** — on inbound **worker** report, **compact the
   worker FIRST**, then hand the diff to the **reviewer colleague** (acquire/canary
   it if not yet live; § Fleet lifecycle) with the rubric in
   `references/review-rubrics.md`. **Dimension 0 (test quality) is mandatory for
   CODE packets**: the worker wrote its own tests, so green ≠ good — the reviewer
   proves the tests are non-vacuous (`just flow-pair-mutate <file> '<sed-expr>'`, or a
   reasoned mutation argument naming the assertion that flips) before approval. On
   the reviewer's **verdict** (`APPROVE` / `APPROVE_WITH_NOTES` / `FIX_REQUIRED`),
   **compact the reviewer FIRST**, then APPROVE or loop back to the coder via FIX.
6. **Learn** — after approval, write a candidate learning note to
   `prompt-lab/clusters/<cluster>/candidates/` (never auto-promote to
   `active.md`; manual approval required).
7. **End-of-work gate** — before declaring any delegation or phase done, run
   `harness checks` (all sensors: typecheck→lint→test→smoke→pkg-audit→snapshots,
   per-sensor verdicts, non-zero exit on any failure). Use `harness checks --quick`
   to skip heavy smoke for a fast static+unit gate mid-iteration; run the FULL
   `harness checks` before ship/declare-done. This supersedes `just self-check`'s
   first-fail behavior — it runs ALL sensors so one pass surfaces every failure.

## References

- [`references/harness-modes.md`](./references/harness-modes.md) — pi tools vs the tmux control plane: detection, self-adopt, per-mode command mapping, daemon prerequisite (Plan 019)
- [`references/architecture.md`](./references/architecture.md) — system architecture and CLI → lib → ledger call chain
- [`references/orchestrator-worker-protocol.md`](./references/orchestrator-worker-protocol.md) — full protocol spec (packet schema, report schema, allowed/forbidden paths contract)
- [`references/ledger-schema.md`](./references/ledger-schema.md) — run/delegation/trial/review/learning record schemas
- [`references/prompt-taxonomy.md`](./references/prompt-taxonomy.md) — cluster taxonomy (implement-code, fix-code, review-code, docs-writing, codebase-research, validation-runner, …)
- [`references/context-packs.md`](./references/context-packs.md) — context pack extraction rules (inclusion/exclusion, section mapping, size contract)
- [`references/review-rubrics.md`](./references/review-rubrics.md) — 10-dimension rubric and verdict model (`APPROVE` / `APPROVE_WITH_NOTES` / `FIX_REQUIRED`)
- [`references/templates/orchestrator-stage.md`](./references/templates/orchestrator-stage.md) — orchestrator stage prompt template
- [`references/templates/worker-implement.md`](./references/templates/worker-implement.md) — worker implementation packet template
- [`references/templates/worker-fix.md`](./references/templates/worker-fix.md) — worker fix packet template
- [`references/templates/review-synthesis.md`](./references/templates/review-synthesis.md) — review synthesis template
- [`references/templates/learning-synthesis.md`](./references/templates/learning-synthesis.md) — learning synthesis template

## Domain

`docs/domains/flow-pair/domain.md`
