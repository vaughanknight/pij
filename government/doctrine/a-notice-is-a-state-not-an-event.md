# A notice is a state, not an event

**Status**: doctrine + acceptance criteria for the Rust delivery design.
**Raised**: 2026-08-31, from Vaughan via `pij-ordinary-raccoon` (anz-studio prime), after
hundreds of obsolete axis-disagreement notices kept interrupting a shared Copilot session
*after the condition they reported had already cleared*.
**Not coded**: ruling `AI-Substrate/pij#318` defers TS delivery fixes to the Rust port. This
is the specification that port work should satisfy. Companion defect: **E55**.

## The rule

A sensor notice reports a **condition that is currently true**. It is not a log line and not a
letter. Two notices with the same sender, recipient, kind and governed subject are not two
facts — they are one fact, observed twice. Delivering the older one after the newer exists
tells the recipient something that is no longer true; delivering any of them after the
condition clears tells the recipient something that was never actionable.

Conversation is the opposite: every message is its own fact and must arrive intact.

**So: coalesce notices, never conversation — and let a cleared condition withdraw its own
unconsumed notices.**

## Why the current design produces the harm

The two defects compound, and neither is sufficient on its own to explain the incident:

1. **E55** — endpoint delivery (Claude socket, Copilot `--ui-server` RPC) never consults the
   composer gate, so pij hands turns to the endpoint *eagerly*, including while a human is
   mid-keystroke.
2. **This one** — nothing collapses repeat notices, so a condition that stays true for an hour
   mints an unbounded series of turns.

Together they are worse than their sum: because pij hands over eagerly, the backlog ends up
**inside the endpoint's session queue**, where pij has no lever at all (measured 2026-08-31:
447/447 delivery rows to the affected seat were `acked` — pij's queue was empty while the
human was still being interrupted). **A message pij has not yet handed over can be superseded;
one it has handed over usually cannot.**

The architectural consequence, which is the important line in this document:

> **Hold and then send. Never send and then regret.**
> Do not hand a notice to an endpoint you cannot retract it from while the reason to retract it
> is still plausible — i.e. while the recipient is busy or composing, and while the underlying
> condition can still change.

## Control 1 — supersession before hand-over

Before a notice is handed to an endpoint (`sendSocket`) or typed, derive a **coalescing key**:

```
sender · recipient · notice kind · governed subject
```

* **sender** — mechanically available and already the right discriminator: `SENSOR_DAEMON`
  (`pij-daemon`) and `SENSOR_WATCHDOG` (`pij-watchdog`) in `core/watchdog.ts`. Anything not
  from a sensor is conversation and is **never** coalesced.
* **notice kind** — the queue already carries `kind` and `command` columns; the notice family
  (`stalled`, `dead`, `provider-failure`, `status-stale`, `axis-disagreement`, …) belongs there
  as data, not parsed back out of body text.
* **governed subject** — the node, assignment, baton or anomaly axis the notice is *about*.
  Two notices about different subjects are different facts even from the same sender.

Rules:

1. If an **unconsumed** row with the same key exists, the newer message **supersedes** it: the
   older row moves to a terminal `superseded` state carrying `supersededBy = <new seq>`, and
   only the newest is delivered.
2. Supersession is **latest-state-wins**, never text equality. Timestamps, ages and spine
   references change on every re-emission while the meaning is identical — matching on body
   text would never fire.
3. Supersession applies only while a row is genuinely unconsumed. Once handed over it is out
   of reach, and pretending otherwise is the mistake this document exists to prevent.

## Control 2 — retraction when the condition clears

Supersession alone does not solve the reported incident: the condition **cleared**, and the
correct number of remaining notices was then *zero*, not one. A sensor that can raise a
condition must be able to withdraw it:

* when a sensor observes its condition resolved, every unconsumed row under that key is
  retracted (terminal state `retracted`, reason recorded);
* the retraction is recorded on the spine even when nothing was delivered, so the episode
  remains visible to a supervisor;
* a retraction never rewrites a row already delivered — history is not edited.

## Control 3 — endpoint purge, and what to do when it does not exist

The requested "cancel an already-enqueued turn" depends on a capability the endpoint may simply
not have. As of 2026-08-31 pij's Copilot adapter knows exactly two ui-server methods,
`session.send` and `session.getForeground`; no cancel/clear/dequeue is known, and `--ui-server`
is an undocumented flag this repo reverse-engineered.

Therefore:

* **If** an endpoint exposes a supported cancel, use it for retracted and superseded turns.
* **If it does not**, that is not a blocker — it is a constraint that pushes the work earlier.
  Satisfy the requirement by **not over-committing**: hold notices in pij's own queue (where
  Controls 1 and 2 have force) until the recipient is actually able to consume them. Never
  probe undocumented methods against a live human session to find out.

## Safety properties (all must hold)

| must never be coalesced | why |
|---|---|
| ordinary agent↔agent or human↔agent conversation | every message is its own fact |
| receipts | they carry unique protocol meaning keyed to one message id |
| distinct findings, even from the same sender | different content, not a repeat observation |
| messages about different governed subjects | different facts that happen to share a sender |
| anything not from a sensor sender | the discriminator is the sender, and it is mechanical |

Further:

* **Coalescing must not become silent suppression.** The latest state is still delivered
  exactly once; a key that is superseded fifty times still results in one delivery, not zero.
* **The audit trail lives outside the human's chat.** Superseded and retracted rows are marked
  in the queue with their successor/reason and stay queryable — the queue *is* the trail. Do
  not delete rows to make a chat quieter.
* **Bounded staleness.** A held notice is not held forever; if the recipient never becomes
  available, escalation is a supervisor's problem and must remain visible, not dissolve.

## Acceptance criteria

1. Two consecutive sensor notices with the same key, the second raised while the first is
   unconsumed → exactly one delivery, carrying the later state; the first is `superseded` with
   `supersededBy` set.
2. Fifty such notices → exactly one delivery, forty-nine `superseded` rows, no chat noise.
3. The condition clears while notices are unconsumed → **zero** deliveries; all rows
   `retracted` with a reason; one spine record of the episode.
4. Two notices from the same sender about **different** subjects → two deliveries. Never merged.
5. Two ordinary messages from the same sender with identical text → two deliveries. Never merged.
6. A receipt is never coalesced or retracted under any circumstances.
7. A notice is not handed to an endpoint while the recipient's composer is held (E55) — proving
   this also proves Controls 1–2 still had jurisdiction at the moment of the decision.
8. Negative test: a sensor key whose condition clears *after* hand-over must NOT be reported as
   retracted — the system tells the truth about what it could not take back.
