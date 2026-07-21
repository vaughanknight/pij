# Deterministic pij team scaffolding

These building-block verbs make stream construction, packet delivery, and canary evidence durable. They do not choose work, write briefs, select models, or automate canary leg (c).

## Verb family

| Command | Durable result |
|---|---|
| `pij project create` / `project set` | Named project and autonomy/plan/prime metadata |
| `pij stream create` / `stream close` | Attributed allocation, worktree, branch, base SHA, and transaction steps |
| `pij fence set` / `fence show` | Descriptive notify-only ownership and overlap evidence |
| `pij dispatch` / `ack` | Packet SHA plus `undelivered` → `delivered-unacked` → `acked` receipt state |
| `pij canary` | Real nonce dispatch; pass-time pane+pid+native-session and runtime evidence |
| `pij anomalies` | Read-only derived findings, including stale unacked dispatches and half-open allocations |

## Worked stream stand-up

The parent runs the construction commands. The worker runs each `pij ack` command printed in the received dispatch header.

```bash
pij project create "Team scaffold demo" --slug team-scaffold-demo --actor pij-prime

pij stream create \
  --project team-scaffold-demo \
  --slug api-rework \
  --ordinal 61 \
  --actor pij-prime

pij fence set api-rework \
  --paths "src/api/**" \
  --actor pij-prime

pij dispatch pij-worker \
  --packet government/briefs/s061.md \
  --json
```

On `pij-worker`, acknowledge with the exact id and SHA from the dispatch header:

```bash
pij ack <dispatch-id> --packet-sha <sha256>
```

Then the parent runs the mechanical canary. The nonce is stored in a real packet; the worker uses the same standard ack command, so SHA verification proves the nonce bytes were read and the brief ack supplies declared runtime.

```bash
pij canary pij-worker \
  --expect-model github-copilot/gpt-5.6-sol \
  --wait=5000
```

On `pij-worker`:

```bash
pij ack <canary-dispatch-id> --packet-sha <canary-sha256>
```

Inspect derived safety without mutating anything, then close only when teardown is intended:

```bash
pij anomalies --json
pij stream close alloc-s061-api-rework --actor pij-prime
```

A canary timeout intentionally leaves the real dispatch `delivered-unacked` and writes no `CanaryRecord`; `pij anomalies` later surfaces a stale instance. Identity or model mismatch leaves the acknowledged transport record but no pass record. Canary leg (c), proving that the brief was understood, remains the kickoff ritual's human/agent judgment.

## Team-manifest template

The future composition verb consumes this shape. Values such as model, effort, brief content, and fences remain human/prime-authored; pij does not invent them.

```json
{
  "schema_version": 1,
  "project": "team-scaffold-demo",
  "autonomy": "power-through",
  "streams": [
    {
      "slug": "api-rework",
      "base": "main",
      "plan": "docs/plans/0NN-api-rework",
      "brief": "government/briefs/s0NN.md",
      "fence": {
        "touchSet": ["src/api/**"],
        "shared": []
      },
      "seats": [
        {
          "role": "pm",
          "harness": "claude",
          "model": "<judgment>",
          "effort": "high"
        },
        {
          "role": "coder",
          "harness": "copilot",
          "model": "<judgment>",
          "effort": "xhigh"
        },
        {
          "role": "reviewer",
          "harness": "copilot",
          "model": "<judgment>",
          "effort": "xhigh"
        }
      ]
    }
  ]
}
```
