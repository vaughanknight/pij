# pij watchdog supervision

Every live pij session is supervised by a daemon-owned watchdog unless it is
paused or exempt. With no `watchdog.json` sidecar, the watchdog is **on by
default** and sends its first turn after 20 minutes of descriptor-level quiet.
The watchdog keeps firing blind while a peer is frozen; there is no provider
banner parser or special thaw scheduler. Recovery is emergent when real peer
activity appears again.

This whole-life supervision watchdog is distinct from the short spawn
phone-home watchdog used while a control-plane peer binds.

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
- **A peer that has deliberately paused** (done, or blocked awaiting a human).
  See § Blocked on a human below.

## Commands

```sh
pij watchdog status <id> [--json]
pij watchdog pause <id> [--json]
pij watchdog resume <id> [--json]
pij watchdog exempt <id> [duration] [--json]
pij watchdog reset <id> [--json]   # back to default: on, 20m, un-paused, UN-exempt
pij watchdog interval <id> <duration> [--json]   # set the timeout: 30s, 20m, 1h, or ms
pij watchdog watch <id> [--capture anomaly|always|never] [--max-lines N] [--max-bytes N]
pij watchdog unwatch <id> [--json]
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

1. **Explicit pause/resume verbs** — `pij watchdog pause <id>` and
   `pij watchdog resume <id>`; completion is not inferred.
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
| `self` | `pij watchdog pause <id>` | Only the explicit `resume` verb clears it. |
| `compact` | Remote `pij send <id> --command compact` or a bare `/compact` message | Clears automatically on the next **real** working transition. The sidecar is persisted before compact is injected. |
| `exempt` | `pij watchdog exempt <id> [duration]` or spawn `--no-watchdog` | Bounded by a persisted absolute deadline (default 60m); excluded from watchdog-driven stall derivation only while live. `reset` clears it immediately; pause/resume do not weaken it. |

A pause is the peer's claim that watchdog turns are unnecessary; it does not
disable existing dead/provider-failure supervision.

## Blocked on a human

If a nudge reaches you while you are neither working nor done but **blocked
awaiting a human ruling**, self-pause (`pij watchdog pause <your-id>`): that is
the honest signal that your silence is intentional, not a stall. Known limitation
(field-reported): a `self` pause for "blocked on human" is today
indistinguishable from a `self` pause for "finished" — a supervisor cannot tell
done from blocked. A richer `awaiting-human` pause reason (auto-resume-worthy,
unlike a plain `self`) is a planned follow-up.

## What a watchdog turn means

A turn is self-teaching and ordinal, for example:

```text
[pij watchdog #2 for pij-example] Keep going if working. If done, pause me with
`pij watchdog pause pij-example`; resume with `pij watchdog resume pij-example`.
```

If work is still in progress, continue normally. If the assigned work is done,
pause the watchdog explicitly. Watchdog-attributable pane, working-state, and
descriptor movement never counts as peer recovery; only typed real activity
does.

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
