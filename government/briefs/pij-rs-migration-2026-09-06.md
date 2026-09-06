# pij-rs migration — recommendation: NOT YET (2026-09-06)

**Status:** the decision is Vaughan's and remains open. Nothing has been installed
and nothing has been migrated on this machine. This brief exists because the
evidence changed, and I owe him the changed evidence, not a fresh question.

## What I told him on 2026-09-04

> "I have not migrated and have not installed anything… installing pij-rs is a
> machine-wide change affecting all four fleets, which is exactly the sort of
> shared-substrate move that needs your word rather than my initiative… Say when,
> and I will plan the migration properly — sequencing the fleet so nobody loses
> their inbox mid-flight."

At that point I could not recommend either way: the doc's migration trigger was
not met, pij-rs was not installed, the legacy daemon was healthy, and I had no
measured defect list for rs.

## What changed

Upstream's own prime ledger (`docs/plans/archive/misc/prime-ledger-2026-09.md`,
at `0453256`) now carries a measured open-defect list for rs, written by the
chainglass primes running it in anger. Several of these are not cosmetic on THIS
machine — they break surfaces this fleet depends on daily:

1. **`pij-telegram` as a send target is dead on rs.** Supported form is
   `pij-rs sidecar telegram --body`. `pij send pij-telegram` is Vaughan's own
   channel and the seat's standing way to reach him. A migration that silently
   retires it is a human-channel regression, which by our own ruling (E29/E30)
   outranks every convenience.
2. **Control commands are unsendable on rs.** `/v1/send` refuses `command` and
   the CLI hardcodes `command: None`, so `compact`/`new`/`reload` cannot be
   executed against an rs-hosted seat. That makes the §C3 compact discipline —
   "compact the peer at completion" — unexecutable, i.e. a documented protocol
   this fleet runs on has no implementation on rs.
3. **`report.now` / `report.state` never reach a live stream.** The spine has
   three writers and only `EventBus::publish` fans out to `/v1/events`;
   `ReportService` and `Registry::put`/`tombstone` insert rows directly. Card
   updates exist on replay but a live cursor burns past them. This seat's entire
   watch — PA sweeps, the staleness chase, the card cadence — is built on report
   events being observable live.
4. **No `close` verb; no reaper.** Teardown becomes "kill the tmux window" and
   rows stay untombstoned (~716 idle corpses observed upstream). Our
   ownership-aware teardown rule has nothing to call.
5. **Registry spine rows unstamped and empty** (`at=0`, `payload=''` across 1456
   `seat.put` rows). A descriptor event that carries no time and no descriptor is
   not a sensor — same family as E56/E57.
6. **`spawn --harness omp` verifier false-negative** leaves a live seat behind and
   the caller retries, producing duplicates (three corpse rows upstream). Root
   cause was an omp self-update swapping the governed symlink; the verifier
   fault is still open.

## Recommendation

**Do not migrate this machine yet.** Wait for at least items 1–3 to close: the
Telegram target, control commands, and live report/descriptor fan-out. Those
three are precisely the surfaces the pij government and this seat's standing
watch are built on, and losing them would be a silent downgrade — every mechanism
would keep *appearing* to work while the events behind it stopped arriving, which
is the exact failure this government has now filed three times (E55, E56, E57).

The legacy daemon on this machine is healthy (pid 58877, uptime days, retries 0),
so there is no forcing pressure. When the trigger is met I will plan the
migration properly and sequence the fleet so nobody loses an inbox mid-flight.

## Related

- E55 corroborated, not reopened: upstream `498113b` (PR #373) publishes ordered
  hold/completion receipts across the socket, typed, and reader delivery paths.
  For socket holds to be audited they must exist, which is consistent with the
  "ported-not-patched" closure. I have not read the Rust source to verify it and
  am not claiming more than the commit states.
- PR #367 (sender notices for delayed messages) is now 257 behind main with
  conflicts and needs a coder to reconcile — noted only so nobody cites it as
  landed.
