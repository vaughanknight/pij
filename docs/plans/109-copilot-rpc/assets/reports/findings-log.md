# Plan 109 — findings log

Recorded as they land, not at close. A finding written down after the fact is a
recollection.

## F0-1 — the discoverable session id was not a sendable session id

**Found in unit 0's first hour, against the installed binary, before any transport
code existed.**

Copilot CLI 1.0.82-0, isolated seat, `127.0.0.1:47777`:

```
session.getForeground -> sessionId 10900000-0000-4000-8000-000000000000
                         + workspace + capabilities
session.send (x2)     -> -32603 "Session not found for sessionId: 10900000-…"
```

The endpoint answered, the method existed, and **the identifier the server handed out
was rejected by the server.**

The design input's delivery story assumes `session.send` addressed by a *discoverable*
session. If the discoverable id is not a sendable id, the transport does not exist in
the shape it was designed in, and the descriptor unit may need to stamp more than a
port. **This is the sequencing ruling paying for itself before a line of transport
code** — units 1 and 2 were held precisely so a finding here could reshape them.

### Hypotheses, in cost order — eliminate, do not diagnose

1. **Fresh session not yet registered.** If a session must transact before it can be
   addressed, that is a spawn-ORDER constraint for unit 1, not a defect.
2. **A sentinel id.** `10900000-0000-4000-8000-000000000000` is a v4-shaped UUID with
   a zeroed tail — fixture-shaped rather than generated. If `getForeground` returns it
   when there is no foreground session, then **an absence-value is being served as a
   presence-value**: a null read as a positive, this plan family's signature defect,
   arriving from an upstream binary instead of our own code.
   **Ruled in advance**: if confirmed, our transport treats that id shape as ABSENT
   BY CONTRACT. We do not get to be the layer that believes it.
3. **Two id namespaces** — `getForeground` naming a UI surface while `send` wants a
   conversation. Then unit 2 needs a different acquisition path entirely.
4. **The endpoint serves a different process than assumed.** Pin the owning pid.

### Why it was cheap

The design input marked, per claim, what was first-party and what was report from
fork issue #311, and stated that a divergence would be a **finding rather than an
error**. Nobody had pointed those claims at the installed build. The first person to
do so found the addressing model divergent in the first hour — and did not reconcile
it toward the document.
