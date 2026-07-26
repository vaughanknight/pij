# node — declare & read node truth: projects, tasks, states, adoption, anomalies

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: work the pij platform's governance surface — projects, stream/fence/dispatch records, canaries, per-node assignments, the attributed spine, node cards, adoption repair, and anomaly queries. Writes are attributed; safety is DERIVED, never enforced.

## Attribution (resolved BEFORE any write)

`--actor <label>` asserts and wins; otherwise your resolved self (`PIJ_SESSION_ID`, else a unique pane match) is used; an unresolvable caller is refused naming `--actor` — nothing mutates on refusal. Seats that write often should `export PIJ_SESSION_ID=<own-id>`.

## Projects

```bash
pij project create "<description>" [--json]   # kebab slug, collision-suffixed
pij project list [--json]
pij project show <slug> [--json]
pij project set <slug> [--plan <path>] [--prime <id>]
```

## Tasks & states (per-assignment semantic truth)

```bash
pij task set <node> "<task>" [--project <slug>]    # opens/points an assignment
pij state set <node> <state> [--assignment <id>] [--refs a,b,…]
pij state verify <node> [--assignment <id>]        # done is a CLAIM until verified
```

Semantic states: `blocked|question|hold|waiting|ready|failed|cancelled|done`. A node with no assignment falls back to its implicit general assignment (`asg-general-<node>`). The node badge derives worst-first across open assignments; the mechanical axis (`starting|working|idle|stalled|stopped|dead|unknown`) is pij-computed and never writable here.

## Team-scaffold records

```bash
pij stream create --project <slug> --slug <stream> [--base <ref>] [--ordinal N]
pij stream close <allocation-id>
pij fence set <stream> --paths <a,b> [--shared <x,y>]
pij fence show [--path <repo-path>]
pij dispatch <id> --packet <file> [--wait]
pij ack <dispatch-id> --packet-sha <sha256>
pij canary <id> [--expect-model <model>]
```

Records live below `~/.pij/allocations/`, `fences/`, and `dispatches/`; canary pass evidence attaches to the real acknowledged dispatch. Worked flow and manifest example: [`../../../../docs/how/pij-team-scaffold.md`](../../../../docs/how/pij-team-scaffold.md).

## Seat attestation

```bash
pij attest <id> --plan-id <id>
```

`planId` is an opaque, explicit seat-level attestation. Absent means
unattested; it is never inferred from `Project.planPath`, a cwd, or ambient
`HARNESS_PLAN_ID`. Spawn creates it with `--plan-id`; attest corrects an
existing descriptor through the same CLI-owned write law.

## Node cards & the spine

```bash
pij node show <id> --json    # both state axes, assignment, context gauges, tmux window
pij spine events [--peer <id>] [--project <slug>] [--since N] [--json]
pij spine append --kind <k> [--refs a,b,…] [--peer <id>] [--project <slug>]
pij spine render             # regenerate ~/.pij/spine/spine.md (markdown view of the log)
```

Filters are exact (`--peer pij-a` never matches `pij-ab`); `--since` is exclusive.

## Adoption (unadopted nodes)

Unadopted = non-prime with **no effective parent** — legal to boot, invisible to its tree. Enumerate machine-wide, then link:

```bash
pij tree --global --json                 # filter unadopted == true (pij list --json carries the same boolean per row)
pij link <child> --parent <parent-id>    # audited on the spine as a node-linked event
pij link <child> --root                  # sanctioned root placement (also audited)
```

Prevention beats repair: spawn from a seat with `PIJ_SESSION_ID` exported so caller-truth parentage lands at spawn. Prime seats are legal roots and are never flagged.

## Anomalies (derived safety)

```bash
pij anomalies [--here] [--project <slug>] --json   # evidence refs into the spine
                        # --here: this folder's peers · --project: one project's
                        # assignments — detection stays machine-wide, only the
                        # VIEW scopes (repo primes: poll scoped, not global)
```

| Symptom | Read | Likely meaning |
|---|---|---|
| semantic active but system idle for hours | axis-disagreement finding | seat lost its dispatch — nudge or reassign |
| `done` with no `verifiedBy` | unverified-done finding | a claim awaiting verification — verify or challenge |
| hold cleared by a non-issuer | foreign-hold-clear finding | coordination bypass — raise with the issuer |
| dispatch delivered but unacked past threshold | delivered-unacked-stale finding | recipient never acknowledged; inspect the dispatch/packet |
| allocation journal stopped before create/close completed | allocation-half-open finding | resume or investigate the last successful step |
| node missing from its tree | `unadopted == true` in tree/list | link it to its true parent (above) |
