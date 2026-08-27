# node — declare & read node truth: projects, tasks, states, adoption, anomalies

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: work the pij platform's governance surface — projects, stream/fence/dispatch records, canaries, per-node assignments, the attributed spine, node cards, adoption repair, and anomaly queries. Writes are attributed; safety is DERIVED, never enforced.

## Attribution (resolved BEFORE any write)

`--actor <label>` asserts and wins; otherwise your resolved self (`PIJ_SESSION_ID`, else a unique pane match) is used; an unresolvable caller is refused naming `--actor` — nothing mutates on refusal. Seats that write often should `export PIJ_SESSION_ID=<own-id>`.

Everything under `report` is a first-person claim about yourself.
`report now|question|blocked|state|clear` take no node or `--actor` and require
the caller to resolve to a registered descriptor. `report verify <node>` keeps
its supervisory target but stamps the registered caller.

## Projects

```bash
pij project create "<description>" [--json]   # kebab slug, collision-suffixed
pij project list [--json]
pij project show <slug> [--json]
pij project set <slug> [--plan <path>] [--prime <id>]
```

## Tasks & reports (per-assignment semantic truth)

```bash
pij task set <node> "<task>" [--project <slug>]    # opens/points an assignment
pij report now "<did>" "<next>" [--state <word>] [--note "<text>"] [--project <slug>]
pij report question "<what I need from you>" [--assignment <id>]
pij report blocked "<what I am waiting on>" [--assignment <id>]
pij report state <state> [--assignment <id>] [--refs a,b,…]
pij report clear [--assignment <id>]
pij report verify <node> [--assignment <id>]       # done is a CLAIM until verified
```

Semantic states: `blocked|question|hold|waiting|ready|failed|cancelled|done`. A
reporting seat with no assignment falls back to its implicit general assignment
(`asg-general-<node>`). The node badge derives worst-first across open assignments;
the mechanical axis (`starting|working|idle|stalled|stopped|dead|unknown`) is
pij-computed and never writable here.

Use `report question` when a human answer is needed and `report blocked` when
progress is waiting on something external. In compound progress, `--note` is
valid only with `--state question|blocked`. Actively working has no semantic state
word: absence is the honest expression by design, so never invent `working`.

**Cadence**: global invariant 12 owns both-edge reporting and stale-card semantics.
Report when work starts and finishes; never wait for the watchdog backstop. Consumers
render `now`/`next` as current, so stale text misinforms. Use `report clear` after a
declared state such as `waiting` no longer applies.

**pij tells you when you have drifted.** Once your card is >10min old, every pij
command appends one line to **stderr**:

```
⚠ pij: your now/next card is 23m old — pij report now "<did>" "<next>"
```

Treat it as the instruction it is and report; it clears itself the moment you do.
It never appears on stdout (`--json` stays parseable), never fires on `report`
itself, and never fires for a seat that has parked itself in
`waiting|hold|blocked|question` — those are correct declarations, not drift.

**Who reads this.** Status renders for **prime/PM** seats; worker reports remain
ledger-only. Roles use `pij orchestration role set <id> pm|worker`; unstamped seats
render `ROLE UNKNOWN` with no status.

**Limits, enforced at write**: did/next cap at **280 characters each**, `--note` at
**200**, after whitespace collapse; overflow is `E-ARG`, never truncation. Renderers
may visually truncate, but that is not a second write limit. Size your text; do not discover the cap by hitting it.

**A declared question does not expire.** It remains in needs-attention until
`report clear` or another state; do not re-ask, self-nudge, or duplicate it in the
spine.

Inline markdown is supported in report text (`` `code` ``, `**bold**`,
`[links]`). Block markdown is not: newlines are refused. Shell-quote markdown
containing backticks with single quotes so the shell does not execute it.

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
pij link <child> --parent <parent-id> --role <pm|worker>  # governor places + designates
pij link <child> --root                  # sanctioned root placement (also audited)
```

Role always arrives from above: the governor that gives a seat work designates
it while placing it. A seat never infers or self-declares its own role.
Prevention beats repair: spawn from a seat with `PIJ_SESSION_ID` exported so
caller-truth parentage lands at spawn. Prime seats are legal roots and are never
flagged.

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
