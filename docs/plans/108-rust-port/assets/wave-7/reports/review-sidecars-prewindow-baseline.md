# Pre-window baseline — captured by the reviewer, before the live-fire

`pij-favourite-araminta`, **2026-08-30T23:40:58Z** (09:40:58 local).

Captured independently so the "before and after" of the Telegram window does not
rest solely on the coder's transcript. The falsifier ratified by the prime needs
**both** halves, and both are measured against these numbers.

## The three numbers that decide the reply leg

| what | value at capture |
|---|---|
| legacy bridge lock | `{"pid":83646,"startedAt":"2026-08-30T23:40:25.116Z"}` |
| legacy bridge inbox entries | **917** |
| pij-rs spine rows (`~/.pij-rs/pij.sqlite`, `spine_events`) | **11** |

Newest three legacy inbox entries at capture:

```
msg-1788133242373-000001-84062.json
msg-1788133125008-000001-65529.json
msg-1788132205732-000001-85756.json
```

Lock holder confirmed alive: `83646 Mon Aug 31 09:40:24 2026 …/node …`.

## What each number is for

* **Lock pid `83646`** — this is *not* the pid I registered the falsifier against.
  That was `59939`, started 2026-08-28T04:32:45Z. The bridge has been restarted
  since, most recently **33 seconds before this capture**. Any "before and after"
  quoting 59939 is stale; the window's before-value is **83646**.
* **Inbox count `917`** — the legacy bridge must **not** receive Jordan's reply
  during the window. If this grows by an entry matching the reply, the legacy
  path served it and the leg is one-way-only regardless of what the Rust side
  logged.
* **Spine rows `11`** — `~/.pij-rs` now exists and has been exercised, so the
  directory's mere presence is no longer evidence of anything (it was, when I
  pre-registered it and it did not exist). The reply must appear as a **new row**
  above 11, identified by kind and payload, not by the store having grown.

## Standing

The falsifier is unchanged and still binds:

1. the injected turn present as a row in the pij-rs spine, **and**
2. the legacy bridge demonstrably not the receiver for that window — lock
   released or pid `83646` stopped, plus **no new matching entry** in
   `~/.pij/pij-telegram/inbox/` above 917.

If (1) holds and (2) does not, the leg is one-way-only, which Jordan's amendment
says is not a pass.

Restore is part of the proof, not an afterthought: the legacy bridge must
re-acquire the lock with a **new** pid after the window, verified, and that pid
recorded. Abort-restore-report beats the proof.
