# pij watchdog supervision

Every live pij session is supervised by a daemon-owned watchdog unless it is
paused or exempt. With no `watchdog.json` sidecar, the watchdog is **on by
default** and sends its first turn after 20 minutes of descriptor-level quiet.
The watchdog keeps firing blind while a peer is frozen; there is no provider
banner parser or special thaw scheduler. Recovery is emergent when real peer
activity appears again.

This whole-life supervision watchdog is distinct from the short spawn
phone-home watchdog used while a control-plane peer binds.

## Commands

```sh
pij watchdog status <id> [--json]
pij watchdog pause <id> [--json]
pij watchdog resume <id> [--json]
pij watchdog exempt <id> [--json]
pij watchdog watch <id> [--capture anomaly|always|never] [--max-lines N] [--max-bytes N]
pij watchdog unwatch <id> [--json]
pij watchdog list [--json]

pij state <id> --json              # includes a watchdog block
pij list --json                    # each row includes a watchdog block
pij spawn --harness <h> --no-watchdog
```

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
    "lastFireAt": null,
    "watchers": []
  }
}
```

## Ruled defaults

The three ruled defaults are:

1. **Explicit pause/resume verbs** — `pij watchdog pause <id>` and
   `pij watchdog resume <id>`; completion is not inferred.
2. **First-class, non-expiring exemption** — `pij spawn --no-watchdog` or
   `pij watchdog exempt <id>`. Exemption is stronger than an ordinary pause;
   `pause` cannot downgrade it and `resume` does not override it.
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
| `exempt` | `pij watchdog exempt <id>` or spawn `--no-watchdog` | Non-expiring and excluded from watchdog-driven stall derivation. It is not weakened by pause/resume. |

A pause is the peer's claim that watchdog turns are unnecessary; it does not
disable existing dead/provider-failure supervision.

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
- Pre-bind, failed, dissolved, dead, paused, and exempt targets are not fired.
- Watchdog turns never refresh descriptor activity or pane heartbeats merely by
  changing the pane themselves.
- A live-daemon restart is an operations action. Tests and proofs use a
  disposable `PIJ_HOME`; do not point proof tooling at the real `~/.pij`.
