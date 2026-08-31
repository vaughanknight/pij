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

## F0-1, resolved — the id is not the problem; the CONNECTION is

The isolated seat was launched with an **assigned** `--session-id` (a UUID the coder
chose, which is why the zeroed shape was not a sentinel). `session.send` to that
assigned id returned `-32603` **without** consulting `getForeground`, and still did
after a real TUI turn. `getForeground` returned exactly the assigned UUID.

A **one-shot `session.resume` whose socket closed did not make later sends work.**
Keeping the resumed TCP connection open made subsequent sends succeed and visibly
drive the TUI.

> **The sendable id was right all along. The session had to be LIVE ON THIS
> CONNECTION.**

So the transport needs a **long-lived RPC connection per seat**, not a per-message
connect — which makes connection lifetime a thing the daemon owns, with reconnect,
ownership and shutdown attached. That is a materially different unit 2 from the one
designed, and it is the direct consequence of holding the transport behind
verification.

**Rider (from s105, applied):** if a connection is held, **the connection is itself a
recycled identifier.** Re-stamping `rpc_port` on revive is not sufficient — the old
connection must be closed as an **ACT**, or the daemon holds a live socket to whatever
now owns the old port while the descriptor truthfully advertises the new one. E-036
one layer out, and tested as a transition: revive, assert the old connection is
CLOSED, then assert nothing re-establishes it. *Asserting only that the new port is
stamped would pass on a build that leaves the old socket open forever.*

## F0-2 — `mode:"enqueue"` DESTROYS a human's unsent composer text

Sentinel typed into the TUI composer and deliberately **not** submitted, visible.
`session.send` with `mode:"enqueue"` acked immediately with a server-created
messageId; the TUI entered `Working`, ran the RPC prompt, answered — and returned to a
**blank composer**. The sentinel was gone.

`mode:"immediate"` behaves the same way. **There is no polite mode.**

Recovery search: no match anywhere under `~/.copilot`, nothing in the session
`events.jsonl`. The only surviving copy was in the external PTY capture the probe
harness happened to be recording. Stated as a **boundary** — no Copilot-owned
persistence found — rather than as absolute unrecoverability.

**This is not a politeness defect. It destroys the words a person was still writing,
with no record anywhere that they existed.**

### Binding for unit 2

The composer gate is a **HARD PRECONDITION** of Copilot RPC delivery, not a politeness
layer above it. Honoured on the RPC path itself — *placing a fast path around the gate
disables it without deleting it, and the code still reads as guarded.* Quiet-pane
shape applies: recognised layout, owned sensor, **two stable blank observations**. A
single look is not enough when being wrong deletes someone's sentence.

**"Socket is transport, tmux is politeness" DOES NOT HOLD HERE.** True for Claude UDS —
a socket frame cannot corrupt a composer. False for Copilot RPC. Anyone carrying that
phrase into unit 2 will under-rate the gate exactly where it matters most.

It also closes a standing operator question: the 2026-08-27 typing-gate ruling carried
an open item to confirm queue-vs-splice before ever relaxing the gate. **The gate is a
data-loss guard, not etiquette.**

## F0-3 — no ordering guarantee within a burst

Two `mode:"enqueue"` sends written in order on ONE persistent connection **executed in
reverse**. Proven from session JSONL timestamps, not from the acks — both acked, and
both acks told nobody anything.

The busy-then-enqueue discriminator lands on **dispatch race, not queue LIFO**: once a
model turn is established, enqueue defers correctly; back-to-back frames can race
before busy state exists.

**Binding for unit 2:** assume no ordering across RPC sends and encode none. Ordering
we need is ordering **we** make — one in flight per seat, the next sent only after the
previous is **observed** complete (observed, not acked).

## F0-4 — the readiness call is a false positive, and is not a busy gate

Before any `resume`, `getForeground` returned the exact assigned UUID with workspace
and capabilities while `session.send` for that UUID failed. **Equality is not
sufficient readiness.** During a controlled turn it returned the same success payload,
so it does not answer "is the composer busy". No server-side latch observed; any
once-per-session latch is client policy.

**Caching that pre-resume success would cache a false-positive readiness.**

## What the four findings cost, and what they saved

Four of six claims in a document that honestly marked itself as not first-party are
now known false, and the two that stand were confirmed by connecting rather than by
launching without error. **Every one would otherwise have been found by a coder
mid-transport with a design already committed.**

