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

---

## Amendment 1 — 2026-09-07: blocker 2 closes for most harnesses, NOT for ours

Upstream PR #380 (`c05d549`, merged `0628114`) fixes control commands on rs, on
Jordan's word: *"sending remote control commands like /compact is not working;
must fix."* `/v1/send` now accepts `command: compact|new|reload`, legacy
`pij send --command` / `pij compact-self` route to rs with identical JSON, and
they proved it live — real omp remote compact executed, `compact-self`
soft-compacted 61K→20K, a Claude seat with a draft held on `draft_sha` then
released after clearing.

**But read the exclusion, because it is ours.** Copilot and paneless seats
*refuse decodably* (`E-RS-CONTROL-UNSUPPORTED`). Two of this fleet's three live
seats are Copilot: the PA `pij-ready-perosteck` and the failover standby
`pij-compact-heron`. And parent-side compact against the Copilot PA is not a
convenience here — it is the **documented recovery for E52** (nudges dropped as a
Copilot session lengthens; `pij compact-self --pane %48` fired at 14:44Z on
2026-08-29 and the PA turned at once, 3 of 3 subsequent ticks unchased). On rs
that recovery would return a decodable refusal instead of running.

So blocker 2 moves from **open** to **closed upstream / still open for this
fleet**. The recommendation is unchanged — do not migrate yet — but the reason
narrows: it is no longer "control commands don't work", it is "control commands
don't work *for Copilot seats*, and our PA and our failover standby are both
Copilot." A decodable refusal is the honest failure mode and much better than a
silent one, but it still leaves E52 without its recovery.

Blockers 1 (`pij-telegram` dead as a send target) and 3 (`report.*` never
live-broadcast) are untouched and remain open.

Also worth noting for the trailers convention: I have adopted C11
(`Pij-Seat:` / `Pij-Prime:`) on government commits from this one onward.

---

## Amendment 2 — 2026-09-07: blocker 3 closed with production proof; only one real blocker left

Upstream PR #384 (plan 139, "the big governance port", merged `2ca240f`) closes
blocker 3 outright and takes most of the supporting evidence with it.

**Blocker 3 — CLOSED.** "One spine writer: ReportService and Registry publish
through EventBus atomically (seat row + event in one transaction,
cancellation-safe); `seat.put` carries `at` and the descriptor; `seat.tombstone`
carries reason." Proven in production on daemon 45954: a fresh adopt wrote
`seat.put` seq 20182 with `at`=1788796958784 and payload = the descriptor, against
a pre-deploy row of `at 0`, empty payload. Upstream's own ledger now marks the
item **RESOLVED by plan 139 (2026-09-08, AC1)**. Note whose evidence closed it:
chainglass's positive control was the RED — the same discipline as E27/E40/E58.

The same PR also lands `pij-rs close` (owner-only), `reap [--dry-run]`,
`register/adopt --role` with `seat_roles` joined into every identity projection,
and the full governance record set (project, stream, fence, dispatch, ack,
canary, attest, task, node, baton, prime designation, spine append/events/render)
plus anomalies as a spine view with the legacy 30-min status-stale and parked
suppression. That retires supporting items 4, 5 and 7 from the original list.

### Where the gate now stands

| # | Blocker | Status |
|---|---|---|
| 1 | `pij-telegram` dead as a send target | **OPEN** — still listed unresolved in upstream's ledger |
| 2 | Control commands unsendable | Closed for Claude/omp/pi; **still refused for Copilot seats** |
| 3 | `report.*` never live-broadcast | **CLOSED**, production-proven |

**Revised reading.** Two of the three have moved, and what remains is smaller and
differently shaped than when I wrote this brief:

- Blocker 1 is not a lost capability — the replacement exists
  (`pij-rs sidecar telegram --body`). It is a **rename with stale docs**: the peer
  route still names the old target and another seat (egret) already walked into
  it. Migrating naively breaks every habit and script that says
  `pij send pij-telegram`, this seat's included, but that is migration mechanics
  we can fix on our side, not a hole in rs.
- Blocker 2's Copilot exclusion is the one that still genuinely bites **us**,
  because the PA and the failover standby are both Copilot and parent-side compact
  is E52's documented recovery for the PA.

So the honest position is no longer "do not migrate." It is: **the gate has
narrowed to one fleet-specific issue.** I am not changing the recommendation
unilaterally, because the decision was always Vaughan's and the remaining risk
lands on the seat that watches everything else. If he wants to go, the plan is to
fix our own `pij send pij-telegram` usages first, then sequence the fleet, and
accept that the Copilot PA loses its compact recovery until that closes.

Pij-Seat: pij-relative-panther
Pij-Prime: pij-relative-panther

---

## Amendment 3 — 2026-09-10: the migration plan is bigger than the gate

Upstream's ledger records a live instance of the exact failure mode this brief
warned about, and it changes the *plan*, not the gate.

**The instance.** `~/.copilot/statusline-context.sh` read
`pij whoami --json | jq .id` — the legacy TS shape. rs returns `.data.id`, so the
pij-id segment of that status line **has been empty since their rs cutover** and
nobody noticed until now. Nothing errored. The script ran, exited zero, and
rendered a blank where an identity should be. Their follow-up is the right one:
pij should own the Copilot status line the way it owns the Claude one, so the
shape cannot drift again.

**Why it matters here.** I audited this seat's own watch machinery against that
failure mode. Every helper parses legacy **text** shapes:

- `pij watchdog status <seat> | sed -n 's/.*next due \([0-9T:.-]*Z\).*/\1/p'`
- `pij state <seat> | head -1 | sed -n 's/.*last event \([0-9hms ]*\) ago.*/\1/p'`
- `pij daemon status | head -1 | sed -n 's/.*pid \([0-9]*\).*/\1/p'`
- `pij state <seat> --json | grep -oE '"failureReason"[^,]*'`

Those four expressions are the card refresher's cadence, the PA chaser's phasing,
the daemon-pid check, and the failover watcher's fatal-evidence probe. On rs they
do not error — `sed` and `grep` that match nothing exit zero and yield the empty
string. The chaser would compute a wait from an empty due-time, the failover
watcher would read `fatal=none` forever, and every log line would still say the
mechanism ran. **The entire standing watch would go quiet while continuing to
report success** — E57's lesson in a new costume.

So the migration plan is no longer "fix our `pij send pij-telegram` usages." It is:

1. Audit and re-point **every** helper expression above against real rs output,
   with a positive control per expression: feed it rs output, assert non-empty,
   and assert it goes red on the legacy shape. A parser that cannot fail visibly
   is not a parser, it is a decoration (E56/E57).
2. Prefer `--json` with an explicit field path over text scraping, and pin the
   path (`.data.id // .id`) so one shape change cannot silently blank it.
3. Only then fix the telegram verb and sequence the fleet.

None of this changes the recommendation or the gate — blocker 1 open, blocker 2
open for Copilot seats, blocker 3 closed. It changes how much work "migrate"
means on our side, and it is work that must happen **before** the cutover, not
after, because after is when the sensors are already lying.

Pij-Seat: pij-relative-panther
Pij-Prime: pij-relative-panther

---

## Amendment 4 — 2026-09-12: I understated blocker 1, and upstream just proved it

Amendment 2 called blocker 1 — `pij-telegram` dead as a send target on rs — "a
rename with stale docs, not a lost capability," and said the replacement existed.
That was **too generous, and I should correct it rather than let it stand.**

Upstream PR #415 (plan 146, merged `72355d7`) fixes Telegram sender tagging on
rs, and in doing so records what the author found while reading that code:

> "Reading the code for this also found that rs had no chunker at all: any
> message over 4096 characters was rejected by Telegram and lost."

So the rs Telegram path was not merely renamed. Until this week it **silently
dropped every message over 4096 characters** — the exact silent-loss-to-the-human-
channel failure this government ruled outranks all other considerations
(E29/E30: "silent loss to the human channel" beats "noisy duplicate" in every
ruling). Outbound bubbles were also anonymous, with ~90 seats on this machine and
no way to tell which one was talking.

**This machine was never exposed.** The legacy bridge has had a chunker the whole
time — `.pi/extensions/pij/telegram/chunk.ts`, the very code hardened through
items 24/29b and encoded as E29 (positional idempotency keys under partition
drift), E36 (state the invariant as a set) and E38 (hash the materialised plan,
never a summary). Upstream's fix is an explicit **port of that TS bridge**, not a
redesign. My largest message to Vaughan today was 1,426 bytes, so nothing of mine
would have tripped the 4096 limit — but the margin was luck, not design, and a
single long handover or incident report would have crossed it.

**What this changes.** Not the gate — blocker 1 is now genuinely closed, and
better than before, since rs also gains `--body-file`/stdin on the sidecar. What
it changes is my confidence in the shape of the earlier assessment: I reasoned
from the docs saying "use this other verb" to "capability present, just renamed,"
without reading the implementation behind the verb. The capability was present
and **defective in the one way that matters most**, and I would not have found it
by reading release notes.

Rule for the rest of this migration, and the reason amendment 3 matters more than
it looked: **on the human channel, do not accept "a replacement exists" as
equivalent to "the replacement works."** Read the implementation, or test it with
a body long enough to break it. Same family as E61 — a footer proving the CLI
accepted a selection proves nothing about whether the thing still functions.

Pij-Seat: pij-relative-panther
Pij-Prime: pij-relative-panther
