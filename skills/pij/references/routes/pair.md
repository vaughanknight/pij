# pair — orchestrate a coder + cross-model reviewer fleet

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: run a whole build phase through an **orchestrator + colleague-peer delegation
seam** — wrap `the-flow` (the inner route authority) with a small **roster** of pij
colleague sessions (a **coder** that implements bounded packets + a separate
**cross-model reviewer**), acquired lazily and reused across the run, plus a central
prompt-learning ledger. This is the delegation *wrapper* — never a replacement for
`the-flow`, which stays the sole writer of its own state.

**Preconditions**: mode detected once per run (§ C1 — control-plane mode also needs the
one-time self-adopt so colleague replies can reach you); a `pij daemon` (auto-starts on
first spawn). The **engine is already built** — the `flow-pair` CLI
(`skills/flow-pair/lib/cli.ts`) + the `.flow-pair/` ledger. This route *drives* that CLI;
it never reimplements it, never imports it into pi (P2), and never writes the ledger by hand.

## Hard invariants

1. **Flow-state non-write** — NEVER write `.the-flow-state.json`, `the-flow.json`, or
   `the-flow.md`. `the-flow` guided mode is their **sole** writer; a dual-writer corrupts
   resume/adopt.
2. **Pointer delivery** — a worker packet is written to the ledger first; only a short
   **path pointer** is sent (never a full packet body inline).
3. **Forbidden paths in every packet** — each packet enumerates the three flow-state files
   above (plus any ledger dir) as explicitly off-limits to the worker.
4. **Bounded scope** — each packet defines its allowed paths; the worker executes ONLY
   within them.
5. **Persist before mutate (P9)** — ledger/roster records are written before the state they
   describe changes.
6. **Cluster isolation** — a prompt learning writes ONLY to the cluster it was tagged to,
   never cross-cluster.

## Orchestrator Decision Protocol

**You own the deliverable — delegation moves the work, not the accountability.**
You are the expensive model in this fleet for a reason: the coder may be a cheaper,
less-capable model, and the reviewer is a *different* model that may have skimmed.
A worker's green tests and a reviewer's `APPROVE` are both **claims**, not proof.
Trust them enough to keep moving — but the last critical eye on every deliverable
is **yours**. Trust, but verify: before you record any approval, cast your own eye
over the load-bearing part of the result (§ APPROVE). If the verdict doesn't survive
your glance, you re-open it — you never rubber-stamp a verdict you can't stand behind.
This is one cheap spot-check, **not** a re-review; the reviewer still does the deep pass.

The expensive orchestrator runs this finite-state loop each turn:

| State | When | Action |
|-------|------|--------|
| `ASK_USER` | Requirement ambiguous / needs a human decision | Pause and ask; never proceed without the answer |
| `RUN_LOCAL` | Safe, cheap, read-only, or needs no delegation | Execute directly in the orchestrator session |
| `DELEGATE` | Bounded, executable, suitable for a cheap worker | Compile context pack → render packet → send the path pointer. **Delegate a whole phase per packet and make the packet say so**: the coder implements *every* task in the phase in one run — not a couple-then-handback, which wastes a round-trip per slice and loses the worker's warm context |
| `REVIEW` | Worker reports completion | **Compact the worker FIRST** (reflex, § C3) → acquire/canary the **reviewer peer** if not yet live → dispatch a review pointer. The verdict (+ mandatory Dim-0 mutation gate) is produced **by the reviewer**, handled on its return |
| `FIX` | Verdict = `FIX_REQUIRED` | **Compact the reviewer FIRST** (§ C3) → render a narrowed fix packet (review findings only) → dispatch it to the coder (DELEGATE) |
| `APPROVE` | Verdict = `APPROVE` / `APPROVE_WITH_NOTES` | **Compact the reviewer FIRST** (§ C3) → run the sanity pass below → record approval → update ledger → advance |

### The orchestrator sanity pass — the last gate before APPROVE (reflexive)

A reviewer `APPROVE` is the *input* to your approval, not a substitute for it. Before
you record approval, spend **one cheap glance** confirming the verdict survives your
own eye — this is the "verify" half of trust-but-verify, and it is **not** a re-review:

- **Re-read the actual diff hunk** behind the single highest-severity claim the reviewer
  cleared (or, for a clean CODE pass, the one load-bearing guard). Does the code in front
  of you actually match the verdict's story?
- **Confirm Dim-0 was really exercised** for CODE delegations — the review carries mutation
  evidence (the guard, the sed expr, RED→GREEN), not just the word "non-vacuous." If the
  reviewer asserts test quality with no mutation/named-assertion evidence, that is a missing
  proof — treat it as `FIX_REQUIRED`, not APPROVE.
- **Sniff for a rubber-stamp**: an `APPROVE` with no findings, no files named, and no
  evidence on a non-trivial diff is itself suspect. A reviewer can skim. When the verdict
  is thinner than the change deserves, re-open it (bounce back to the reviewer, or look
  yourself) before recording.

If the verdict holds, record it and move on — the goal is a 30-second confidence check,
not a second review. If it doesn't, you do **not** record APPROVE: loop to `FIX` or
re-dispatch the review. The buck stops with you.

## Fleet lifecycle — the colleagues (coder + reviewer)

A run keeps a small **roster**, acquired **lazily** and reused across the whole run (never
torn down between phases — only at final tidy). The roster lives in the ledger (`run.json`)
as `role → { pijId, paneId, model, spawnedByUs }`, **persisted before use (P9)** so a later
tidy can find and close our panes even after a crash.

**Roles & default models** (override per run via `--coder-model` / `--reviewer-model`; confirm
exact ids with `pij models`, § C4):

| Role | Default model | Acquire when |
|------|---------------|--------------|
| coder | `github-copilot/claude-sonnet-4.6:xhigh` | first `DELEGATE` |
| reviewer | `github-copilot/gpt-5.5:xhigh` (cross-model, deliberately ≠ coder) | first `REVIEW` |

- **Acquire — provided-or-spawn, lazy.** If a role's peer id was provided, use it; else spawn
  the *first time that role is needed* (coder on first `DELEGATE`, reviewer on first `REVIEW`)
  and never hijack ambient idle peers. **Mandate: do NOT pre-spawn the reviewer with the
  coder** — an idle-but-live peer is not free (its warm context is re-cached every
  compact/keep-alive cycle, and cache TTL forces rewrites), so a reviewer stood up a phase
  early quietly burns cache-token writes + a pane with zero reviews to show. Spawn it at the
  *moment* of the first `REVIEW`. Spawn transport per § C1; placement per § C5 (the default
  side-stack keeps the fleet visible — keep it unless told to hide).
- **Canary-verify before trusting (§ C2)** — a ready-ping is NOT proof; a wrong `--model` is
  accepted silently then 400s on first inference. Verify footer + no-400 before first use —
  for *provided* peers too.
- **Reuse across phases — compact, never close (§ C3)** — the same coder + reviewer carry the
  whole run, clean-slate each phase.
- **Heal** — a dead/stale peer, or one that fails its canary, is closed and re-spawned on next
  need; **persist the updated roster before** re-delivering the packet (P9).
- **Teardown — end only** — close **only** peers with `spawnedByUs === true` (§ C1 verb); leave
  *provided* peers for their owner. Close is ownership-aware either way.
- **Buggy-extension safety** — if a running session still has a known-crashy extension loaded,
  `reload` it onto the fix and confirm it survives *before* compacting (a compact triggers a
  render that can crash it). Fresh spawns already have the fix.

> **Real peers, not builtin subagents.** Builtin subagents are **read-blind** here (they cannot
> read files), so a coder/reviewer must be a real pij peer (spawned or provided) — never a
> builtin-subagent fanout.

## Pipeline while a colleague is busy (§ C7)

The decision loop is per-turn, but never idle while a colleague works: the instant you dispatch
(a packet to the coder, or a review to the reviewer), advance the **next independent** work —
prep the next phase's tasks/context pack, draft the next packet, update the flight plan. **Let
the daemon's push re-invoke you** on the colleague's done-report (or a `stalled`/`dead` push);
do **not** sit in a `pij state` poll loop or nudge a peer that merely looks idle (§ C7 owns this,
incl. the one broken-transport spot-check exception).

## Verdict law — what the CLI does and doesn't decide (finding 03)

The `flow-pair` CLI's `review` verb is an **artifact/contract gate**, not a code reviewer: it
computes a verdict from the **severity of the findings you feed it** (`lib/review.ts` —
critical/high → `FIX_REQUIRED`, medium → `APPROVE_WITH_NOTES`, else `APPROVE`); it never reads
the diff for correctness. So:

- The **real verdict is the reviewer peer's** judgment (with the mandatory **Dim-0** mutation
  gate), hand-persisted to the review record — that is the law, not the CLI's exit.
- `fix` is real (renders a narrowed fix packet); **`accept` is unimplemented** (a stub) — do
  not rely on it to close a run; record approval + advance the ledger yourself.
- Full 10-dimension rubric + verdict model: `skills/flow-pair/references/review-rubrics.md`.

## Invocation

```
/pij pair start "<request>" [--repo <path>] [--ledger-root <path>] [--coder-model <m>] [--reviewer-model <m>]
/pij pair dispatch --run-id <id> --plan-path <p> --phase <text> --tasks-dir <p> [--task-description <t>] [--allowed-paths <p1,...>]
/pij pair observe [--run-id <id>]
/pij pair review --delegation <id>
/pij pair fix --review <id>
/pij pair accept --delegation <id>
/pij pair ledger [--run-id <id>]
/pij pair learn --run-id <id> --delegation-id <id> --cluster <c> --miss-type <t> --summary <text> [--evidence <text>] [--candidate-delta <text>] [--json]
```

Every state-mutating operation shells to the `flow-pair` CLI (never imported into pi — P2
boundary). Call chain (CLI → lib → ledger): `skills/flow-pair/references/architecture.md`.

## Procedure

1. **Resolve intent** → a decision-protocol state (above).
2. **Load context pack** — the relevant plan sections + **same-cluster** learnings from
   `prompt-lab/clusters/<cluster>/active.md` only (cluster isolation). Extraction rules:
   `skills/flow-pair/references/context-packs.md`.
3. **Render packet** — `skills/flow-pair/references/templates/worker-implement.md` (or
   `worker-fix.md` for a FIX). These templates are **runtime-read by the engine** — cited,
   never moved.
4. **Deliver** — `flow-pair dispatch …` compiles the pack, writes the packet to
   `.flow-pair/runs/<run-id>/prompts/<delegationId>.md`, and prints exactly ONE line:
   `[flow-pair <delegationId>] Packet at: <rel-path>`. Send **that pointer** to the worker
   (§ C1 verb). The lib never sends — the orchestrator does.
5. **Review via the reviewer peer** — on the worker's report, compact it FIRST (§ C3), then
   hand the diff to the reviewer (acquire/canary if not live) with the rubric
   (`review-rubrics.md`). **Dim-0 (test quality) is mandatory for CODE packets** — the worker
   wrote its own tests, so green ≠ good; the reviewer proves them non-vacuous
   (`just flow-pair-mutate <file> '<sed>'`, or a named-assertion argument) before approval.
   On the verdict, compact the reviewer FIRST, then run the sanity pass and APPROVE, or loop
   to FIX.
6. **Learn** — after approval, write a candidate note to
   `prompt-lab/clusters/<cluster>/candidates/` (never auto-promote to `active.md`).
7. **End-of-work gate** — before declaring any delegation/phase done, run `harness checks`
   (all sensors; `--quick` skips smoke mid-iteration, full run before ship). It supersedes
   `just self-check`'s first-fail behavior (runs ALL sensors, surfaces every failure at once).

## References (cited in place — engine-owned, not moved)

- `skills/flow-pair/references/review-rubrics.md` — 10-dimension rubric + verdict model
- `skills/flow-pair/references/ledger-schema.md` — run/delegation/trial/review/learning schemas
- `skills/flow-pair/references/context-packs.md` — context-pack extraction rules
- `skills/flow-pair/references/prompt-taxonomy.md` — cluster taxonomy (implement-code, fix-code, review-code, …)
- `skills/flow-pair/references/architecture.md` — CLI → lib → ledger call chain
- `skills/flow-pair/references/orchestrator-worker-protocol.md` — packet/report schema + allowed/forbidden-paths contract (also injected by the runtime-read `worker-fix.md`)
- `skills/flow-pair/references/templates/` — orchestrator-stage · worker-implement · worker-fix · review-synthesis · learning-synthesis (worker-* are runtime-read)
