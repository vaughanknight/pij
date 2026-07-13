# pij prime — multi-agent repository governance

`/pij prime` is the progressive-disclosure entry point for running one o-prime
seat above multiple plan-owning stream orchestrators. It is a skill route, not a
`pij` CLI verb; the route composes the existing spawn, adopt, send, state, close,
daemon, and harness-flow surfaces.

## Start here

Invoke:

```text
/pij prime
```

The route runs deterministic role triage and points to one next file:

- [prime route](../../skills/pij/references/routes/prime.md)
- [o-prime orient](../../skills/pij/references/prime/orient-oprime.md)
- [stream orchestrator landing](../../skills/pij/references/prime/orchestrator.md)

Load only the selected rung. The consuming repo's stream path also reads its
portable orient, generated `government/orient-local.md`, and item brief through
the landing module.

## Operator index

| Need | Canonical page |
|---|---|
| See the canonical hierarchy and real examples | [prime hierarchy](./pij-prime-tree.md) |
| Enter the stream-orchestrator role and journey | [orchestrator landing](../../skills/pij/references/prime/orchestrator.md) |
| Stand up a government and seat | [bootstrap ritual](../../skills/pij/references/prime/rituals/bootstrap.md) |
| Spawn/adopt, canary, brief, or tear down a stream | [kickoff ritual](../../skills/pij/references/prime/rituals/kickoff.md) |
| Serialize an exclusive resource | [baton ritual](../../skills/pij/references/prime/rituals/batons.md) |
| File, verify, relay, or digest evidence | [reports ritual](../../skills/pij/references/prime/rituals/reports.md) |
| Inspect the full portable contract | [protocol](../../skills/pij/references/prime/protocol.md) |
| Create government files | [templates](../../skills/pij/references/prime/templates/) |
| See labeled historical evidence | [exemplars](../../skills/pij/references/prime/exemplars/) |

The ritual pages own procedure. This guide intentionally does not duplicate it.

## Stream lifecycle

The o-prime allocates and records one worktree/branch/base per stream, then runs
peer spawn from that worktree into a new orchestrator window. `/pij prime` lands
the stream on its role module; after thesis, preamble, guided Builder planning,
and cold validation, it waits for the human's fleet configuration.

Implementation runs through `/pij pair`: coder and separate reviewer are splits
inside the orchestrator window and inherit the stream cwd. Approved work lands
through `/builder 8 ship` (confirm-gated push and PR, watched CI, optional merge).
Remove the worktree only after merge or an explicit abandonment ruling. Batons
remain for timing/runtime purity, external resources, merge coordination, and
shared-tree fallback.

## Registry designation

The o-prime seat is marked directly on its pij session descriptor:

```bash
pij orchestration prime set [<id>] [--json]
pij orchestration prime unset [<id>] [--json]
pij list --prime [--here] [--json]
```

Without `<id>`, set/unset requires exact self-resolution through
`PIJ_SESSION_ID`, the registered tmux pane, or a lone local descriptor.
Ambiguity returns `E-AMBIG`; an unknown explicit target returns `E-NOID`.
Neither error writes anything, and pij never substitutes the baton's
`operator` actor fallback.

Mutation JSON is `{id,prime,changed}`. Set/unset are idempotent, and unset
persists explicit `false`. Ordinary human `pij list` marks prime rows in the
`P` column; list JSON always projects `prime:boolean`, including `false` for a
legacy descriptor with no field.

The marker survives reload, restart, durable native-identity snapshots, and
reattachment. It is mutable external registry state: before daemon writes, the
latest persisted `true` or `false` overrides the daemon's stale tick snapshot.
This differs from append-only external fields such as `reportedAt`.

Designation is an honor-system coordination signal, not an ACL or uniqueness
lock. Bootstrap marks the proved seat before government creation. Handover
marks the incoming seat before writer-line transfer, then unsets the live
outgoing seat after its final relay and before descriptor teardown.

## Distribution and local state

Portable levers and the prime-flow schema ship under
`skills/pij/references/prime/`. A consuming repo generates its own local orient
and prime-flow instance inside the repo; it does not fork the portable levers.

Run `just pij-skill-check` after changing the route or payload. The gate checks
registry parity, pointer integrity, the orchestrator journey, worktree lifecycle,
portability, sibling-blindness, expected evidence, and line budgets.
