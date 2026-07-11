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
- [stream orient](../../skills/pij/references/prime/orient-global.md)

Load only the selected rung. The consuming repo's stream path also reads its
generated `government/orient-local.md`.

## Operator index

| Need | Canonical page |
|---|---|
| Stand up a government and seat | [bootstrap ritual](../../skills/pij/references/prime/rituals/bootstrap.md) |
| Spawn/adopt, canary, brief, or tear down a stream | [kickoff ritual](../../skills/pij/references/prime/rituals/kickoff.md) |
| Serialize an exclusive resource | [baton ritual](../../skills/pij/references/prime/rituals/batons.md) |
| File, verify, relay, or digest evidence | [reports ritual](../../skills/pij/references/prime/rituals/reports.md) |
| Inspect the full portable contract | [protocol](../../skills/pij/references/prime/protocol.md) |
| Create government files | [templates](../../skills/pij/references/prime/templates/) |
| See labeled historical evidence | [exemplars](../../skills/pij/references/prime/exemplars/) |

The ritual pages own procedure. This guide intentionally does not duplicate it.

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
registry parity, pointer integrity, portability, sibling-blindness, expected
evidence, and advisory line budgets.
