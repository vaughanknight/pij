---
name: flow-pair
description: |
  Superseded front door — use /pij pair. Orchestrate a flow-pair run: an expensive orchestrator drives a roster of pij colleague sessions — a coder that implements bounded packets and a separate cross-model reviewer, acquired lazily and reused across the run. Use for starting a flow-pair run, delegating a task packet to a worker, reviewing worker output, recording prompt-cluster learnings, or querying the run ledger. Also invoked as /flow-pair.
---

# /flow-pair → superseded by /pij pair

Pairing has moved to the **`/pij` router**. Invoke it as **`/pij pair`** (module:
`skills/pij/references/routes/pair.md`); `/pij` also routes `delegate`, `agent`, `peer`, `ops`.
`/flow-pair` stays a **supersession alias** — its trigger phrases still route, and this pointer
forwards to `/pij pair`. The protocol lives in **one** place (`skills/pij/`); this file holds none.

**The engine is unchanged and still owned here**: the `flow-pair` CLI (`skills/flow-pair/lib/cli.ts`),
the `.flow-pair/` ledger, `schemas/`, `test/`, `prompt-lab/`. `/pij pair` shells out to this CLI.

See `skills/pij/SKILL.md` · `docs/how/flow-pair.md`.
