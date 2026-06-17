---
name: flow-pair
description: |
  Orchestrate a two-session flow-pair run: an expensive orchestrator session supervises planning, delegation, review, and learning while a cheap worker session executes one bounded packet at a time. Use for: starting a flow-pair run, delegating a task packet to a worker, reviewing worker output, recording prompt-cluster learnings, or querying the run ledger. Also invoked as /flow-pair.
---

# /flow-pair

Wrap `the-flow` with a **two-session orchestrator/worker delegation seam** and a
central prompt-learning ledger. `the-flow` remains the inner route authority;
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
| `DELEGATE` | Task is bounded, executable, and suitable for a cheap worker | Compile context pack → render packet → `pij send` path pointer |
| `REVIEW` | Worker reports completion | Read worker report → apply 10-dimension rubric → emit verdict |
| `FIX` | Review verdict = `FIX_REQUIRED` | Render narrowed fix packet scoped to review findings only |
| `ACCEPT` | Review verdict = `ACCEPT` | Record acceptance → update ledger → advance state |

## Invocation

```
/flow-pair start "<request>" [--repo <path>] [--ledger-root <path>]
/flow-pair dispatch --packet <path>
/flow-pair observe [--run-id <id>]
/flow-pair review --delegation <id>
/flow-pair fix --review <id>
/flow-pair accept --delegation <id>
/flow-pair ledger [--run-id <id>]
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
4. **Deliver** — run `flow-pair dispatch --packet <path>` which saves the packet
   to `.flow-pair/runs/<run-id>/prompts/` first, then send the path pointer via
   `pij send <worker-id> "<path>"`.
5. **Await and review** — on inbound worker report, apply the rubric in
   `references/review-rubrics.md`. **Dimension 0 (test quality) is mandatory for
   CODE packets**: the worker wrote its own tests, so green ≠ good — prove the
   tests are non-vacuous (`just flow-pair-mutate <file> '<sed-expr>'`, or a reasoned
   mutation argument naming the assertion that flips) before ACCEPT. Emit `ACCEPT`
   or `FIX_REQUIRED`.
6. **Learn** — after `ACCEPT`, write a candidate learning note to
   `prompt-lab/clusters/<cluster>/candidates/` (never auto-promote to
   `active.md`; manual approval required).

## References

- [`references/architecture.md`](./references/architecture.md) — system architecture and CLI → lib → ledger call chain
- [`references/orchestrator-worker-protocol.md`](./references/orchestrator-worker-protocol.md) — full protocol spec (packet schema, report schema, allowed/forbidden paths contract)
- [`references/ledger-schema.md`](./references/ledger-schema.md) — run/delegation/trial/review/learning record schemas
- [`references/prompt-taxonomy.md`](./references/prompt-taxonomy.md) — cluster taxonomy (implement-code, fix-code, review-code, docs-writing, codebase-research, validation-runner, …)
- [`references/context-packs.md`](./references/context-packs.md) — context pack extraction rules (inclusion/exclusion, section mapping, size contract)
- [`references/review-rubrics.md`](./references/review-rubrics.md) — 10-dimension rubric and verdict model (`ACCEPT` / `FIX_REQUIRED`)
- [`references/templates/orchestrator-stage.md`](./references/templates/orchestrator-stage.md) — orchestrator stage prompt template
- [`references/templates/worker-implement.md`](./references/templates/worker-implement.md) — worker implementation packet template
- [`references/templates/worker-fix.md`](./references/templates/worker-fix.md) — worker fix packet template
- [`references/templates/review-synthesis.md`](./references/templates/review-synthesis.md) — review synthesis template
- [`references/templates/learning-synthesis.md`](./references/templates/learning-synthesis.md) — learning synthesis template

## Domain

`docs/domains/flow-pair/domain.md`
