# `pij chore`

`pij chore` is a durable roster of named shell probes. `run` compares probe-output
fingerprints while reporting the bounded stdout that actually produced each fingerprint.
Every real delta stays open until an explicit `ack`.

## Commands

```text
pij chore add <name> --probe '<cmd>' [--full '<cmd>'] [--full-every N]
                     [--scope seat|repo|fleet] [--timeout <ms>] [--json]
pij chore update <name|scope:name> [--probe '<cmd>'] [--full '<cmd>']
                     [--full-every N] [--timeout <ms>] [--json]
pij chore run [--dry] [--json]
pij chore list [--verbose] [--json]
pij chore ack <name|scope:name> [--json]
pij chore remove <name|scope:name> --reason '<why>' [--json]
```

- `add` registers a definition. The default scope is `seat`; an existing
  `<scope>:<name>` returns `E-EXISTS` without overwriting it.
- `update` rewrites one existing definition atomically. Unspecified fields are preserved,
  so re-authoring never passes through a missing roster entry.
- `run` probes the union of all three scopes. `--dry` computes the same report but writes
  no baseline, pending delta, or periodic-run counter.
- `list --verbose` shows the creator seat, stored probe, optional full command, cadence,
  timeout, scope, last run, and pending delta. JSON emits `creatorSeatId` (`null` for
  definitions created before attribution existed or outside a resolved seat).
- `ack` advances exactly one current-seat baseline. A bare name works only when unique;
  otherwise use `scope:name`.
- `remove` records the reason and timestamp before deleting the definition, then purges
  that chore's current-seat baseline, pending delta, and periodic-run counter.

`list` and `run` begin with `SCOPES seat: <id|unresolved> | repo: <path|unavailable> |
fleet: <path>`, so an unresolved seat roster cannot masquerade as an empty roster. JSON
returns the same information in `scopes`; `list --json` returns `{ scopes, chores }`.

Seat identity is derived from the registered pane/folder binding. `PIJ_SESSION_ID` is only
an override: it must name a live registered seat **and** match the seat derived for the
calling process. Unknown harness UUIDs, typo ids, and valid cross-seat ids fail non-zero
before any roster or baseline state is read or written.

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

The repo roster is shared source: **commit `.pij/chores.json`**. `chore add --scope repo`
prints that reminder. Ignoring the file silently turns a repo duty into a local-only duty.

## State machine

1. `run` executes the probe with `sh -c` in the caller's cwd and fingerprints trimmed
   stdout with SHA-256 (displayed as 12 hex characters). The reported value is the same
   probe invocation's stdout, bounded to 4096 UTF-8 bytes with `…[truncated]` appended.
2. A fingerprint different from the acknowledged baseline opens or refreshes a pending
   delta. `old` remains the last acknowledged value; `new` follows the latest probe.
3. **`run` never advances the baseline.** The same unacknowledged delta is reported on
   every later run.
4. If the sampled value returns to the acknowledged baseline before `ack`, the pending
   delta stays open as `FLAPPED`: the endpoints match, but a sampled excursion occurred
   and remains relayable until ack.
5. `ack` sets the baseline to `pending.new` and clears the pending delta.
6. `run` fingerprints the instrument: the probe definition plus the content of a directly
   referenced script file. If either differs from what was stored beside the baseline,
   it reports `CHANGED-PROBE ... instrument changed; ack resets baseline`. Any already-open
   value delta is preserved and rendered beside it; both re-surface until one ack resets the
   baseline to the latest sample from the new instrument. World movement uses the distinct
   `CHANGED-VALUE` record.
7. A non-zero or timed-out probe reports `NOT-PROBEABLE`, remains registered, counts in
   the probed denominator, and changes no baseline.

The first successful observation is a change from `none`; acknowledge it after relaying
the result to establish the initial baseline.

## Periodic full output

`--full '<cmd>'` supplies richer absolute-state context. It runs automatically whenever
that chore reports a delta, even without `--full-every`. `--full-every N` additionally
runs it periodically while the probe is unchanged, so persistent bad state remains
visible without turning every run into a full report. The counter is per seat and durable
across CLI processes. `run --dry` does not advance it.

Probe values, full output, and failure text are never emitted as record lines. Human output
prefixes every untrusted line with `  | ` beneath trusted headers; JSON carries values in
`old`/`new`, digests in `oldFingerprint`/`newFingerprint`, and optional absolute state in
`fullOutput`.

## Probe-authoring rule

The fingerprint probe must be a **superset signal** for the change you care about: every
relevant change must alter its stdout. A probe that prints only a partial or lossy summary
can stay byte-identical while the watched state moves, producing an honestly computed but
blind `NO CHANGE`.

**A probe emits only the decision variable.** Every other field is diagnostic and belongs
in `--full`. A staleness probe should emit only the staleness verdict, not a clock, age,
idle state, or any other fast-moving axis that would make the chore fire for the wrong
reason.

Every probe should carry a **denominator** such as `21subs clean`, so empty success can be
distinguished from a parser or loop that observed nothing. If required input cannot be
parsed or no data was observed, exit non-zero so the result is `NOT-PROBEABLE`, never a
false clean.

Repo- and fleet-scoped probes must be checkout-portable. `add`/`update` warn when a shared
probe contains an absolute path. Prefer relative commands, or resolve the active checkout
inside the probe with `git rev-parse --show-toplevel`.

Shared chores must also be runnable by every intended seat role. `add`/`update` warn when a
repo/fleet probe or full command invokes a `pij` verb refused by the PA capability table.
The warning does not block authoring, and a runtime refusal remains loudly
`NOT-PROBEABLE` with its original `E-OWN` reason.

Probes are repository/user-authored shell commands and run with the caller's privileges.
Keep them deterministic, bounded, readable in `list --verbose`, and free of secrets.
