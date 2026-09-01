# Plan 117 — findings

Coder: `pij-female-hummingbird`. O-prime: `pij-dominant-vicuna`.
Branch `s117/delivery-repro`. Evidence gathered 2026-09-01.

> **`report` was not one verb with a bug. It was the first verb of three with the
> same design, and the only one anybody had typed.**
>
> This is the second time in one day that the verb someone happened to type was
> mistaken for the extent of the defect — the first was F-U8, where
> `grep -c 'render:'` returned zero and *every* routed row was missing its
> renderer; `adopt` was simply first. **Enumerate the set before fixing the
> member.**

Three defects were found. Two were fixed here. The third is someone else's row.
The brief named two suspects for the delivery failure; **both are refuted**, and
the real cause was only visible once they were gone.

---

## F1 — `report` could not derive its own subject (FIXED, commit 1)

`pij report now` refused for every **rs-resident, hand-started** seat — the exact
population that owes status cards, and the exact population whose shell has no
`PIJ_SESSION_ID`.

### The discriminating experiment

Two POSTs to the live daemon at `127.0.0.1:7461`, byte-identical caller context —
one pane, no session id — same seat, same instant:

```
POST /v1/whoami {"caller":{"tmuxPane":"%255"}}
  -> 200  {"id":"pij-dominant-vicuna","pane":"%255", ...}
POST /v1/report {"caller":{"tmuxPane":"%255"},"argv":["report","now",...]}
  -> 400  "no reporting seat was supplied"
```

Same evidence in; seat named vs. seat "not supplied". That excludes environment,
routing and forwarding in one move, without changing a line.

### Cause

`whoami` / `state` / `phonehome` resolve through the shared identity ladder
(`identity::resolve_seat`, `crates/daemon/src/http/identity.rs`), which takes a
**pane** as its strictest evidence and checks it against the live roster.
`report` (`crates/daemon/src/http/mod.rs`) carried its **own** resolution: `seat`,
else `caller.session_id`, and nothing else. It never looked at `caller.pane`,
which was sitting in the struct it had already deserialized.

So `report` was the one routed verb whose subject could be **asserted** but never
**derived**.

### What it was NOT

Follow-the-seat. It fired and correctly resolved to a no-op, because the seat
**is** in the rs store — verified directly:

```
sqlite3 ~/.pij-rs/pij.sqlite \
  "select id,pane,state,tombstoned_at from seats where id like '%vicuna%';"
-> pij-dominant-vicuna|%255|idle|          (live, not tombstoned)
ps -p 90803 -> claude, started Fri 28 Aug 13:55:32  (== the row's proc_start)
```

The initial fleet-wide diagnosis assumed legacy residency **from memory of how
the seat was started**, and reasoned outward from it. The store was one query
away. Nothing on the routing path was touched.

### The fix

Call the shared ladder instead of growing a second one. It is **strictly
stronger** than what it replaced: the old path accepted a bare asserted id on an
existence check alone; the ladder checks a pane against the live roster and,
where a pane and an asserted id **disagree**, refuses both rather than preferring
the claim.

### The security arm

On the pre-fix tree, `report` **accepted an asserted seat id that contradicted an
observable pane, and wrote the card**. That is one seat writing a status card as
another seat — attribution by claim, in the one surface whose entire purpose is
telling a supervisor who did what. It was live on `main`.

This is recorded as a finding, not a test detail. It is also the answer to anyone
reading "report now derives from the pane" as loosening: **it resolves more ways
and trusts less.**

### The message was part of the defect

The refusal said *"the caller must forward it"* — naming the **wrong side of the
wire**. The caller had forwarded its pane; the handler was the side that never
looked. That wording sent the first investigator to the shim and cost a
fleet-wide misdiagnosis before anyone read the function.

It now says what rs actually **looked at**, and deliberately drops the
`?pane=` / `?seat=` query forms the ladder's own message advertises, because
`report` is POST-only and does not accept them — naming a door that is not there
is the same miscalibration one size down. The reason is written into the code
beside the wording so the next reader does not tidy it away.

---

## F2 — one dead recipient starved the entire delivery queue (FIXED, commits 2 and 3)

A `pij-rs send` returned `outcome=queued` with a receipt and the body never
arrived — for **every recipient on the machine**, for twenty-nine hours.

### Both of the brief's suspects are refuted, from the store's own face

```
id 32, 33 | delivery:pij-key-justine | pending | attempt 0 | not_before 0 | claimed_at NULL
```

- **Retry backoff — refuted.** `attempt 0`, `not_before 0`. Nothing was sleeping;
  there was no delay to sleep out.
- **Composer recognition — refuted, without needing the parser at all.**
  `claimed_at NULL`. A composer veto requires the job to be **claimed** and the
  pane **captured**. Neither ever happened. The tap facts in the brief (rs owns
  `%2129`'s tap; the file is 0 bytes) are true, and are about a different
  question.

### The third cause

**Nothing enqueued after job id 21 was ever claimed** — five recipients, nine
messages, all at `attempt 0` with `claimed_at NULL`. Delivery did not degrade for
one seat. It stopped for everyone, at a job id, and stayed stopped.

At the head sat job id 2, `delivery:pij-mammoth-ostrich`, at **attempt 20,165**,
observed climbing 20165 → 20166 → 20168 across sixteen seconds — one claim per
~5s drain tick.

```
tmux capture-pane -t %1861  -> exit 1, "can't find pane: %1861"
tmux capture-pane -t %2129  -> exit 0        (control: a live pane captures fine)
```

`pij-mammoth-ostrich` carried pane `%1861` (gone) and pid 94202 (dead), and was
**not tombstoned**.

### The mechanism

`DrainWorker::drain_once` builds its claimable kinds from
`seat.pane.is_some() && seat.tombstoned_at.is_none()` — which tests whether the
pane **field** is set, never whether the pane **exists**. Ostrich passes. It then
passes `recipient.proc.is_none()`, because its proc is **present**, merely stale —
an absence check standing where a liveness check belongs. It reaches
`permits_injection_fresh`, tmux errors, and the `?` on `handle_claim` **ends the
pass** before the loop's own `kinds.retain` can move to anyone else.

Because the failing release was `Duration::ZERO`, the job was the lowest
claimable id again on the very next tick. Forever.

### The most instructive artifact

`start_resilient_delivery_drain` already carries a comment describing this exact
outcome — written by the fix meant to prevent it:

> SURVIVE errors, for the same reason the federation worker does (review F2).
> TickLoop terminates on an Err, and a seat exiting with queued mail is ROUTINE:
> one dead pane between the registry read and the submit would have ended all
> below-socket delivery for the daemon's lifetime — no pointers, no commands, no
> socket bodies — silently, until someone restarted it.

That fix made the **tick loop** survive the error. It did not make the **pass**
survive it. So the loop lived and re-entered the same poisoned job 20,165 times,
and the described disaster happened anyway.

**A fix that hardens the outer layer while the inner layer still gives up is
indistinguishable from working — until a second consumer needs the resource.**
The outer layer's recovery is what hid the inner layer's surrender.

### The fixes

**Commit 2 — the pass continues.** The failure is **deferred, not swallowed**:
the pass serves every other recipient and still **returns** the first error, so
the daemon keeps its only report that a shared dependency is down. Catching and
discarding would have fixed the starvation and silently deleted that report —
trading a visible outage for an invisible one.

**Commit 3 — a failing release backs off.** `release_body` is
`retry(job, Duration::ZERO)`, which is right for a release the worker **chose**
(a vetoed composer, a parked pointer) and wrong for one that follows an **error**.
Eight error paths now use the shared `retry_delay` curve — the same one
`backoff_command` and `backoff_held` (plan 110) already use, reused rather than
re-minted.

> **The rule, stated once:** a success-shaped release does not back off; a failing
> release does.

### On the backlog purge

The backlog was purged on Jordan's call while this work was in progress, which
removed the poisoned head and restored delivery.

**The finding is that one row was poisoned and the queue was not — and the
vulnerability is untouched.** The next recipient whose pane vanishes becomes the
new head and re-freezes the fleet, and nothing in the platform will report it.
A reader who takes "delivery works again" as the headline has read the opposite
of the finding.

**The red witness for this defect is constructed, not observed.** What was
observed live is the frozen state and its arithmetic (above). The unit test was
run against the pre-fix tree and failed with `delivered = []` — the fleet symptom
reproduced in a fixture — which is a real witness of a real failure, and is not
the same claim as watching a queue unfreeze.

---

## F3 — reaping and liveness (NOT FIXED — PRD req-0018)

`seat.pane.is_some()` tests the **field**, not the **pane**.
`recipient.proc.is_none()` is an **absence** check standing where a **liveness**
check belongs: it can tell a recorded process from an unrecorded one, never a
live one from a dead one. `pij-mammoth-ostrich` sat un-tombstoned with a vanished
pane and a dead pid for twenty-nine hours.

Same family as the recycled-identifier lesson: an identifier that is *present* is
not an identifier that is *valid*. Minted as req-0018; not touched here.

---

## `outcome=queued` — what the sender could have been told (PRD req-0017, clause 2)

**`outcome=queued` was true.** The row really was durably enqueued. It is not a
lying receipt; it is an **honest receipt for work no worker would ever reach**.
That is worse in one specific way: nothing was broken enough to fail, so nothing
reported.

Three stalls were observed on this fleet, and **all three are indistinguishable at
the sender**:

1. **Nothing consuming the queue.** The pass aborts at a poisoned head; the row is
   never claimed. (F2.)
2. **A worker consuming, delivery refused.** Claimed, attempted, vetoed or
   released — the shape the brief's two suspects describe.
3. **The recipient cannot collect.** Job 34 reached 23 attempts, still pending:
   the queue was moving and the worker was reaching the recipient, but
   `pij-key-justine` registers only into rs while `inbox` and `send` are still
   served by legacy, so it could not drain its own mailbox. A half-migrated seat.

4. **The sender cannot even address the recipient.** Observed while this fix was
   being supervised: the o-prime's `pij-rs send` to its own coder was refused —
   *"pij-female-hummingbird: no registry row in the daemon registry"* — because
   the coder was spawned by the legacy daemon and lives in its registry while the
   o-prime now lives in rs. It fell back to the legacy CLI to reach its own
   worker. The mailbox-coverage gap and the dual-registry split, in one gesture,
   hitting the supervisor of the fix for it.

   **This refusal was correct and instant** — the one part of the delivery story
   that behaved. It is listed here not as a stall but as the boundary of the
   set: it is the only one of the four the sender CAN see, and it is the only one
   where the sender was told something true at the moment it mattered. The
   difference is that addressability is a near-end fact, so a receipt can carry
   it. Reachability is not, and cannot.

The conclusion this forces:

> **What a sender needs to know is whether the recipient CAN RECEIVE, and that is
> a fact about the far end that no receipt on the near end can carry.**

So `queued` cannot be repaired by choosing a truer word — every candidate word
describes the near end, and all three stalls are identical there. This reframes
req-0017's second clause from a **vocabulary** problem into a **reachability**
problem, which is a different thing to build.

### The larger absence

Twenty-nine hours, fleet-wide, and **nothing reported**. No alert, no anomaly row,
no stalled-queue signal. A queue whose head is permanently unclaimed is a state
the platform cannot currently see. That absence is a bigger finding than the bug.

The cheapest observable that would have caught it: **the age of the oldest
unclaimed job**, and **an attempt count that only ever rises**. Both are one query
on a table the daemon already writes.

---

## F4 — `report` was the first of three, not the only one (NOT FIXED — sized, not started)

`pij-key-justine` (hand-started Claude, rs-registered, pane `%2129`) can receive
pointers but cannot use its mailbox: `pij inbox` / `pij send` / `pij tail` answer
`E-NOID: current claude session is not registered`, which is **false of the rs
store and true of the legacy one** — the message never says which registry it
means. Cause is **coverage**, not resolution: those verbs are not in the rs route
table, so they fall to legacy, where a seat that registered only into rs has no
record. The half-migrated seat.

The obvious fix — "add a `send` row" — was probed against the live daemon first,
with the exact shapes the shim actually produces:

```
POST /v1/send  {"argv":[...],"caller":{"tmuxPane":"%255"}}
  -> 422  "missing field `from`"
GET  /v1/inbox?pane=%2129
  -> 400  "missing field `seat`"
```

`callRs` posts `{argv, caller}` and nothing else, for every routed row. rs's
`SendRequest` requires `from`/`to`/`body`/`msg_id` with no serde defaults and no
`caller`; `InboxQuery` requires `seat`. The body fails to deserialize before the
handler is entered, and **422 is not 404/405, so `classifyRsResponse` reads it as
`rs-error` — which never falls back.** Adding the row alone would have made every
`pij send` on the machine exit 4 with no legacy fallback.

A route row is a claim that the far side speaks the shim's language, and nothing
checks that claim. Same defect as plan 114's invented `/v1/report/<leaf>` paths,
one layer up, and again only visible by driving the real CLI against a real
daemon.

Underneath the wire problem is the same defect as F1, twice more: `send` derives
its sender from a required `from`, `inbox` from a required `seat` — both
**asserted-only, with no derivation path**. A hand-started seat has no
`PIJ_SESSION_ID` to assert. So **`report` was not one verb with a bug; it was the
first verb of three with the same design, and the only one anyone had typed.**

Sized as three parts — table row + deny-list leaf granularity, wire shape,
identity derivation — and deliberately left for its own unit with its own red
witnesses. Part three is the author of F1 applying that fix to two more call
sites, so it wants a reviewer who is not the author.

### Recommendation — a route row is an unchecked claim about the far side

The structural version of what was caught by hand above.

**A row in `RS_ROUTE_TABLE` is a claim that the far side speaks the shim's
language, and nothing checks that claim.** `callRs` posts `{argv, caller}` for
every routed row; only `report` and the identity verbs were ever built to receive
it. A row pointing at a handler that cannot deserialize that body yields 422,
which classifies as `rs-error`, which **never falls back by design** — so the
verb hard-fails fleet-wide the moment the row lands.

The deny list cannot protect against this. The deny list exists so that routing
is a **deliberate act**; this hazard arrives *through* a deliberate act. It is
the same defect as plan 114's invented `/v1/report/<leaf>` paths — which 404'd,
classified as not-implemented, fell back to legacy, and looked exactly like a
verb wave 2 had not landed yet, with every suite green — except that this one
fails **loud and unrecoverably** instead of quietly. The path-agreement test
added then checks that the PATH exists. Nothing checks that the BODY is accepted.

Proposed guard: **no row is addable to the route table without a test that the
far side accepts the shim's actual body.** Same shape as the existing
path-agreement test, one field deeper — and the same law as the deny list's:
safety must not depend on the person adding a row happening to check.

---

## Carried, not chased

`pij-dominant-vicuna` exists in **both** stores — `~/.pij/pij-dominant-vicuna` and
a live rs row — and with 121 rs seats it is unlikely to be alone. "Which store
owns this seat" is a fleet-wide question, not a per-seat one. Addressed to
whoever owns the residency row; not opened here.

```
sqlite3 ~/.pij-rs/pij.sqlite "select id,pane,state,tombstoned_at from seats;"
ls ~/.pij/
```
