# `pij chore`

`pij chore` is a durable roster of named shell probes. `run` fingerprints probe stdout,
computes changes against the current seat's acknowledged baseline, and keeps every delta
open until an explicit `ack`.

## Commands

```text
pij chore add <name> --probe '<cmd>' [--full '<cmd>'] [--full-every N]
                     [--scope seat|repo|fleet] [--timeout <ms>] [--json]
pij chore run [--dry] [--json]
pij chore list [--verbose] [--json]
pij chore ack <name|scope:name> [--json]
pij chore remove <name|scope:name> --reason '<why>' [--json]
```

- `add` registers a definition. The default scope is `seat`; an existing
  `<scope>:<name>` returns `E-EXISTS` without overwriting it.
- `run` probes the union of all three scopes. `--dry` computes the same report but writes
  no baseline, pending delta, or periodic-run counter.
- `list --verbose` shows the stored probe, optional full command, cadence, timeout, scope,
  last run, and pending delta.
- `ack` advances exactly one current-seat baseline. A bare name works only when unique;
  otherwise use `scope:name`.
- `remove` records the reason and timestamp before deleting the definition, then purges
  that chore's current-seat baseline, pending delta, and periodic-run counter.

## Scopes

| Scope | Definition store | Meaning |
|---|---|---|
| `seat` | `~/.pij/<seat>/chores.json` | Duties belonging only to one pij seat |
| `repo` | `<worktree>/.pij/chores.json` | Duties carried by a repository/worktree |
| `fleet` | `~/.pij/pij-chores/chores.json` | Machine-wide duties |

Scopes **union; they do not shadow**. `seat:health`, `repo:health`, and `fleet:health`
are three distinct chores and are all probed. Their fingerprints and pending deltas are
always stored in `~/.pij/<seat>/chore-state.json`, so one seat's ack cannot silence
another seat.

## State machine

1. `run` executes the probe with `sh -c` in the caller's cwd and fingerprints trimmed
   stdout with SHA-256 (displayed as 12 hex characters).
2. A fingerprint different from the acknowledged baseline opens or refreshes a pending
   delta. `old` remains the last acknowledged baseline; `new` follows the latest probe.
3. **`run` never advances the baseline.** The same unacknowledged delta is reported on
   every later run.
4. `ack` sets the baseline to `pending.new` and clears the pending delta.
5. A non-zero or timed-out probe reports `NOT-PROBEABLE`, remains registered, counts in
   the probed denominator, and changes no baseline.

The first successful observation is a change from `none`; acknowledge it after relaying
the result to establish the initial baseline.

## Periodic full output

`--full '<cmd>' --full-every N` runs the full command on every Nth `chore run` invocation
for that chore and prints it under `FULL <scope>:<name>`. The counter is per seat and
durable across CLI processes. `run --dry` does not advance it.

Probe-controlled stdout and stderr are never emitted as record lines. Human output prefixes
every untrusted line with `  | ` beneath its trusted `FULL` or `NOT-PROBEABLE` header;
`--json` carries the same text only in escaped `fullOutput` or `reason` string fields.

## Probe-authoring rule

The fingerprint probe must be a **superset signal** for the change you care about: every
relevant change must alter its stdout. A probe that prints only a partial or lossy summary
can stay byte-identical while the watched state moves, producing an honestly computed but
blind `NO CHANGE`.

Probes are repository/user-authored shell commands and run with the caller's privileges.
Keep them deterministic, bounded, readable in `list --verbose`, and free of secrets.
