# pij watchdog supervision

Every live pij session is supervised by a daemon-owned watchdog unless it is
paused or exempt. With no `watchdog.json` sidecar, the watchdog is **on by
default** and sends its first turn after 20 minutes of descriptor-level quiet.
The watchdog keeps firing blind while a peer is frozen; there is no provider
banner parser or special thaw scheduler. Recovery is emergent when real peer
activity appears again.

This whole-life supervision watchdog is distinct from the short spawn
phone-home watchdog used while a control-plane peer binds.

Lifecycle notices for `bound`, `failed`, `stalled`, and `dead` seats go to the
seat's current structural parent when `parentId` names one, falling back to the
original `spawnedBy` owner. A `pij link` therefore changes where future
lifecycle notices go without changing close authorization. Explicit
`pij watchdog watch` subscriptions remain a separate fan-out mechanism.

## Intent — never watch a peer whose silence is deliberate

The watchdog exists to catch a peer that *should* be making progress but has gone
quiet. Its premise — idleness might be a stall — is false for two classes, which
it must never nudge:

- **Relays / bridges / control-plane infrastructure** (the deliberate-silence
  class). A peer that forwards its inbox to an external sink — e.g. the
  `pij-telegram` bridge → the operator's phone — is *supposed* to sit idle waiting
  for events. A watchdog nudge into it becomes a real-world message (this once
  sent ~20 nudges to the operator's phone). These peers carry `relay: true` on
  their descriptor and are **born exempt**: never watched, no sidecar needed. Any
  new bridge/relay must set `relay: true` at registration.
- **A peer under an explicit operator/manual pause.** Completion and blockers
  use the semantic report axis instead; see § Reporting state below.

## Commands

```sh
pij watchdog status <id> [--json]
pij watchdog pause <id> [--json]
pij watchdog resume <id> [--json]
pij watchdog exempt <id> [duration] [--json]
pij watchdog reset <id> [--json]   # back to default: on, 20m, un-paused, UN-exempt
pij watchdog interval <id> <duration> [--json]   # set the timeout: 30s, 20m, 1h, or ms
pij watchdog watch <id> [--capture anomaly|always|never] [--max-lines N] [--max-bytes N] [--for <seat>]
pij watchdog unwatch <id> [--for <seat>] [--json]
pij watchdog list [--json]

pij watchdog disable-all           # machine-wide OFF — one command, no per-sidecar edits
pij watchdog enable-all            # machine-wide ON again

pij state <id> --json              # includes a watchdog block
pij list --json                    # each row includes a watchdog block
pij spawn --harness <h> --no-watchdog
```

**Machine-wide switch.** `disable-all`/`enable-all` is the fleet kill switch. It
writes a single `~/.pij/pij-watchdog/global.json` that the daemon honors on its
next tick for **every** session — including ones spawned while it is off — with
no per-session sidecar writes. Use it to silence the whole fleet in one command
rather than exempting peers one at a time. Absent file ⇒ enabled (fail-safe: a
missing or malformed switch never silently disables supervision).

## Who may subscribe — and on whose behalf

`watch`/`unwatch` bind a **watcher** to a target. Two things decide whether a
call is allowed: **who is asking**, and **who is being bound**.

**A `pa` (Prime Assistant) may bind only ITSELF or its own parent.** A PA is
read-only by construction, but supervising the seat it assists is the one
supervision act it is uniquely placed to perform, so the boundary is scoped by
**target** rather than by party:

```sh
pij watchdog watch <my-parent>      # allowed — a PA may watch its own parent
pij watchdog unwatch <my-parent>    # allowed — and may remove it again
pij watchdog watch <anyone-else>    # refused
pij watchdog pause <my-parent>      # refused — pause changes supervision POLICY
```

"Parent" means the seat `pij state <id> --json` reports as `parent` — the
explicit `parentId` when set, otherwise the seat that spawned it. **It need not
be a prime**; a PA's parent is frequently a `pm`. Every other `watchdog` action
(`pause`, `resume`, `exempt`, `reset`, `interval`, `status`, `list`,
`disable-all`, `enable-all`) stays refused for a PA against every target.

A refusal names the role, the field it is keyed on, and both permitted ids, so a
seat can check the decision itself rather than guessing:

```
E-OWN: 'watchdog watch' is not available to a PA — refused by role 'pa'
(field: orchestrationRole): 'pij-stranger' is neither you nor your parent — a PA
may act only on ITSELF ('pij-pa') or its own parent ('pij-boss'), so ask
'pij-boss' to do it or relay the request. Run 'pij whoami --json' to see your
role and capabilities, or 'pij state <id> --json' to read orchestrationRole and
parent on any seat.
```

`pij whoami --json` answers this with a single exhaustive `verbs` map — one entry
per classified verb, valued `allow`, `conditional` or `refuse` — beside a
`capabilitySchema` marker. `watchdog` reads `conditional`: permitted *depending
on the action and target*. The older `refusedVerbs`/`conditionalVerbs` pair was
removed rather than kept, because it partitioned a space the payload never
enumerated, so a verb's **absence** from `refusedVerbs` read as *allowed* and a
consumer could not tell a permitted verb from one the producer had never heard
of.

### `--for <seat>` — binding on another seat's behalf

The **recovery path**. When a seat is already stamped, unreachable, or dead, a
prime or PM can bind or unbind a subscription for it:

```sh
pij watchdog watch <target> --for <seat>     # <seat> becomes the watcher, not you
pij watchdog unwatch <target> --for <seat>   # removes <seat>'s subscription
```

- The **named seat** is registered as the watcher — never the caller.
- Re-binding an existing subscription **replaces** it; it does not add a second
  entry, and `unwatch --for` removes the named seat's entry rather than yours.
- **A `pa` caller is refused `--for`**, including when it names itself. The flag
  exists for acting on another seat's behalf, and a PA acts only for itself —
  which the plain form already does. Allowing it would let a PA bind any watcher
  to any target and bypass the target rule above.
- `--for` is rejected on actions with no watcher concept (`pause`, `resume`,
  `reset`, `status`, …) rather than silently ignored.

### `addedAt` is preserved on re-bind

A subscription records when it was **created**. Re-binding — by any path: plain
`watch`, a PA binding its parent, or `--for` — **preserves the original
`addedAt`**; only a genuinely new subscription stamps it. Capture settings still
update, because preservation applies to the creation time, not the record.

This matters because the timestamp is the only evidence of when supervision
began, and the sanctioned re-bind path used to overwrite it — which is why a
subscription's history once had to be restored by hand-editing a sidecar. So the
re-bind stays visible instead: the command reports `re-bound (original addedAt
preserved)`, and `--json` carries `watcherRebound: true`.

## Timeouts

The default interval is 20 minutes. Change a peer's timeout with one command,
using a human duration (`30s`, `20m`, `1h`) or bare milliseconds:

```sh
pij watchdog interval pij-example 45m
```

`pij watchdog reset <id>` clears a peer back to the default (on, 20 min,
un-paused, and **un-exempt**) immediately. `resume` never downgrades a live
exemption; reset is the explicit early re-arm path.

`watch` subscribes the calling peer, resolved from `PIJ_SESSION_ID` or its
adopted pane. `unwatch` removes that caller's subscription. Status/state/list
JSON exposes:

```json
{
  "watchdog": {
    "enabled": true,
    "intervalMs": 1200000,
    "pausedBy": null,
    "exempt": false,
    "exemptUntilMs": null,
    "exemptRemainingMs": null,
    "lastFireAt": null,
    "watchers": []
  }
}
```

## Ruled defaults

The three ruled defaults are:

1. **Explicit operator/manual pause/resume verbs** — `pij watchdog pause <id>`
   and `pij watchdog resume <id>`. Completion is declared with
   `pij report state done`; it is not encoded by silencing supervision.
2. **First-class, bounded exemption** — `pij spawn --no-watchdog` or
   `pij watchdog exempt <id> [duration]`. It defaults to 60 minutes and accepts
   the same `30s`/`20m`/`1h`/milliseconds grammar as intervals. The persisted
   `exemptUntilMs` deadline is absolute: at the deadline the watchdog re-arms,
   rather than granting one extra tick. `pause` cannot downgrade a live exemption
   and `resume` does not override it.
3. **40 lines/4 KiB anomaly-only tail capture** — watcher capture defaults to
   the last 40 lines **and** 4,096 UTF-8 bytes, only when a fire is anomalous.
   `--capture always` is an explicit opt-in.

Per-watcher `--max-lines` and `--max-bytes` can tune capture down or up, subject
to hard ceilings of 200 lines and 16 KiB. `--capture never` keeps anomaly
notices but disables pane text.

## Pause tiers

| Tier | Set by | Resume behavior |
|---|---|---|
| `self` | `pij watchdog pause <id>` | Explicit `resume`, or a newly delivered dispatch/committed assignment, clears it. |
| `compact` | Remote `pij send <id> --command compact` or a bare `/compact` message | Clears automatically on the next **real** working transition. The sidecar is persisted before compact is injected. |
| `exempt` | `pij watchdog exempt <id> [duration]` or spawn `--no-watchdog` | Bounded by a persisted absolute deadline (default 60m); excluded from watchdog-driven stall derivation only while live. `reset` clears it immediately; pause/resume do not weaken it. |

A pause is the peer's claim that watchdog turns are unnecessary; it does not
disable existing dead/provider-failure supervision.

## Reporting state

If a nudge reaches you, use the visible semantic axis:

- still working: `pij report now "<what I just did>" "<what's next>"`;
- done: `pij report state done`;
- idle but available on a standing assignment: `pij report state ready`;
- awaiting a human answer: `pij report question "<what I need from you>"`;
- waiting on an external dependency: `pij report blocked "<what I am waiting on>"`.

Actively working has no semantic state word; absence is honest by design. These
declarations are visible on the rail, can be corrected or cleared, and `done`
can be independently verified. Do not encode completion or blockers as a
watchdog pause.

The mute set is `blocked|question|hold|waiting`; `done` and `ready` never mute.
This is the exhaustive `mutesWatchdogNudge` split in
`.pi/extensions/pij/core/watchdog.ts`.

## What a watchdog turn means

A turn is self-teaching and ordinal, for example:

```text
[pij watchdog #2 for pij-example] Keep going if working. Report in one call with
`pij report now "<what I just did>" "<what's next>"`. If this unit of work is
finished, run `pij report state done`; if you are idle but available on a
standing assignment, run `pij report state ready`.
```

If work is still in progress, continue normally. If the assigned work is done,
declare `done`; if a standing assignment is idle but available, declare `ready`.
Watchdog-attributable pane, working-state, and descriptor movement never counts
as peer recovery; only typed real activity does.

## Suspect, stalled, and recovery

After a delivered turn receives no observable response, the next due fire is
`suspect`. Two consecutive silent delivered fires make the peer `stalled` and
persist `failureReason:"stalled"`. No output means:

- no real not-busy → busy transition;
- no real pre-injection pane change; and
- no real descriptor `lastEventAt` advance.

Owner and anomaly-watcher stalled notices share one episode latch: each gets at
most one stalled notice during uninterrupted silence. Real typed recovery
clears both the reason and latch. Blind scheduling continues during the frozen
episode; the next turn is simply processed if the peer thaws.

The descriptor is the activity-axis truth. Watchdog decisions do **not** read
`events.ndjson`.

## Capture delivery

For a tmux-paned target, a requested capture is written under:

```text
~/.pij/<watcher>/watchdog-captures/<timestamp>-<target>.txt
```

The notice contains that pointer plus at most five inline head lines. The file
contains a UTF-8-safe bounded tail; it never exceeds both the watcher's line and
byte caps.

Pi/pull peers can be paneless. Their watchdog uses descriptor event advance
only, and watcher notices say `capture unavailable (paneless target)` without
creating a fake capture file.

## Operational notes

- The daemon owns scheduling and tmux delivery; pi/pull watchdog turns use the
  durable inbox ownership path.
- Pre-bind, failed, dissolved, dead, paused, and **live** exempt targets are not fired. At expiry the manager writes the cleared sidecar before evaluating a due fire.
- A legacy `exempt` sidecar with a valid `pausedAtMs` derives exactly one 60-minute deadline; missing or invalid time re-arms immediately rather than silently extending safety-off.
- Watchdog turns never refresh descriptor activity or pane heartbeats merely by
  changing the pane themselves.
- A live-daemon restart is an operations action. Tests and proofs use a
  disposable `PIJ_HOME`; do not point proof tooling at the real `~/.pij`.
