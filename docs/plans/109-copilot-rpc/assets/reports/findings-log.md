# Plan 109 — findings log

Recorded as they land, not at close. A finding written down after the fact is a
recollection.

## Grading convention (standing, ruled after F0-2)

Every entry carries a grade, and **an ungraded entry is labelled UNGRADED until a
reviewer has passed it.**

- **UNGRADED** — a coder self-report. It may be true; nothing has checked it.
- **GRADED** — a reviewer reproduced or refuted it independently.
- **REFUTED** — checked and false. Corrected **in place**, never rewritten.

The rule exists because F0-2 was written here as fact from a self-report, propagated
into a binding, the prime's memory, an upstream document's in-place retraction and a
fork-facing hazard note — **and was false.** Units 1 and 2 were being held on the
reviewer's verdict for exactly that reason. **The hold applies to the RECORD, not just
the dispatch queue.**


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

## F0-1 — GRADED — the id is not the problem; the CONNECTION is

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

## F0-2 — REFUTED then RE-FOUNDED — RPC runs a turn in a live human session mid-compose

> **RETRACTED AS ORIGINALLY WRITTEN.** This entry first said `mode:"enqueue"`
> DESTROYS a human's unsent composer text. **That is false.** The reviewer rebuilt
> the rig exactly, reproduced the same "after" observation, and then ran the step
> nobody had run — **pressed Enter.** Both sentinels submitted **intact and in
> order**, both modes, reproduced twice.
>
> Left in place rather than rewritten, because a corrected claim that shows its
> history is worth more than a clean one.

### Why two instruments agreed and both were wrong

- **The PTY capture showed a blank composer.** That is the **placeholder**, which the
  TUI renders *over* a populated buffer.
- **The `jq` search of `~/.copilot` returned exit 4.** An **unsent draft is in-memory
  TUI state** and is absent from session state **whether preserved or destroyed** —
  its negative was guaranteed before it ran.

Two instruments answering a *different question from the one asked*, agreeing with
each other, and **the agreement read as corroboration.** The bounding in the receipt
("no Copilot-owned persistence found") was locally honest and doing globally
misleading work: it bounded a loss that never occurred.

### What is true, and it is still enough

**A model turn RAN in a live human session while a draft was pending — both modes,
every test.** That is **unconsented interruption**, E55's class, confirmed
first-party.

### The binding stands; its justification changes

The composer gate remains a **HARD PRECONDITION** of Copilot RPC delivery, honoured on
the RPC path itself, with the two-stable-blank-observations shape. **Founded on
CONSENT, not data loss.**

> **A correct rule resting on a false reason is weaker than the same rule resting on a
> true one, because the reason is what gets re-examined.** Anyone reproducing the Enter
> result would find the old justification false and might conclude the gate can be
> relaxed.

Consequently: the 2026-08-27 typing-gate operator question is **REOPENED** — it was
closed on this false premise. "There is no polite mode" is **half true**: both modes
interrupt without consent (true); neither destroys the buffer (false).

The `"socket is transport, tmux is politeness"` exception also stands on the corrected
ground — a Copilot RPC frame cannot corrupt a buffer, but it *can* seize a turn from a
human mid-sentence, which a Claude UDS frame cannot.

### The composer's failure, recorded

This premise was propagated into a binding, this log, the prime's memory, an upstream
document's in-place retraction, and a fork-facing hazard report — **all before the
reviewer had graded it**, and while the PM was telling the prime that units 1 and 2
were being held precisely so a coder's self-report could not drive the reshape. The
hold was right. **The findings log bypassed it.**

## F0-3 — GRADED (verdict upheld, mechanism corrected) — no ordering guarantee within a burst

Two `mode:"enqueue"` sends written in order on ONE persistent connection **executed in
reverse**. Proven from session JSONL timestamps, not from the acks — both acked, and
both acks told nobody anything.

The busy-then-enqueue discriminator lands on **dispatch race, not queue LIFO**: once a
model turn is established, enqueue defers correctly; back-to-back frames can race
before busy state exists.

**Binding for unit 2 (UNCHANGED, and reviewer-endorsed verbatim):** assume no ordering
across RPC sends and encode none. Ordering we need is ordering **we** make — one in
flight per seat, the next sent only after the previous is **observed** complete
(observed, not acked).

**MECHANISM CORRECTED — the phrase "races before busy state is established" is
STRUCK**, so nobody builds the mitigation it invites. The receipt said frames "race
before busy state is established". The reviewer held busy FIXED and re-ran the batched write: both frames
came back `delivery=queued` — busy WAS established and correctly detected — **and they
still reversed.** So it is concurrent handling of pipelined frames, independent of busy
state. This matters because the original mechanism invites the mitigation *"establish a
turn first, then send"*, **which does not work.** The mitigation is serialize-and-await.

## F0-5 — GRADED (reviewer-originated) — Content-Length is a BYTE count; a framing defect is invisible on the wire

New, from review. Framing is mandatory and the declared length is authoritative, but a
client framing defect presents as **either silence or an uncorrelatable error** — never
as "your frame was malformed":

```
bare JSON / newline-delimited  -> SILENCE
Content-Length under-declared  -> -32700 with "id":null   (uncorrelatable)
Content-Length over-declared   -> SILENT HANG, server awaits bytes never sent
```

The realistic form, observed: TypeScript `.length` is **UTF-16 code units**; pij bodies
routinely carry em-dashes and emoji. A body measuring 108 by `.length` and 113 bytes
declared at 108 returns `-32700`; declared at 113 it succeeds.

**Binding for unit 2:** `Buffer.byteLength(body,'utf8')`, never `body.length`; a
contract test with a **non-ASCII** body, because an ASCII-only fixture cannot fail this
— the two lengths coincide by construction; and the client needs its own response
deadline, because **the transport's own silence is one of its failure modes**.

It also sharpens the ambiguous-window rule: a timeout now has **three** causes —
malformed frame (nothing ever enqueued), enqueued-but-slow, and dead seat — and the
transport cannot tell them apart. At-least-once retry is right for the second and
**wrong for the first**, which retries a frame that can never parse.



## F0-4 — GRADED — the readiness call is a false positive, and is not a busy gate

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

## F0-6 — GRADED (reviewer-originated) — prefer a discriminator that fails by CONTENT, not by silence

Unit 0's corrected Enter probe distinguishes *preserved* from *destroyed* by
**presence vs absence**: if the draft were destroyed, Enter submits **nothing**. The
reviewer demonstrated the red arm — composer empty at RPC time, Enter pressed, **no
`user.message` produced at all** — so the probe is genuinely capable of returning the
other answer and is not a formality.

But a better shape appeared **by accident**. A composer-clear that silently failed
(the literal six characters `\u0015` sent instead of a control byte) left two strings
in the buffer, and the submission came back **concatenated**:

```
preserved  -> "SENTINEL_A + <esc> + MARKER_B"
destroyed  -> "MARKER_B" alone
```

**Both worlds yield a positive artifact.** Enter-alone discriminates by
presence-vs-absence; concatenation discriminates by **content**.

> **A witness whose failure mode is silence is the class this plan family has been
> bitten by repeatedly** — a filtered runner summarising a hard failure as `OK`, a
> `jq` search whose negative was guaranteed, a fake that stopped injecting so a clean
> pass looked exactly like the original defect.

**Carry for unit 2's regression test:** use the concatenation form.

## F0-7 — GRADED — evidence must be as durable as the claim it corrects

Unit 0's ordering evidence cites a **committed artifact**; its corrected
buffer-survival evidence cited a **machine-local absolute path** under
`~/.copilot/session-state/`. The corrected claim was therefore evidenced only under the
reviewer's committed reproductions, not its own.

**Standing:** when a correction lands, its evidence is committed beside the receipt.
A retraction resting on a path that exists on one machine is a retraction that decays
back into the claim it replaced.

## F0-8 — GRADED (reviewer-originated, pre-code) — the registry contract cannot see an upsert defect

**Mechanism named by mutation, not repetition.** Three single-column mutations of the
`ON CONFLICT DO UPDATE SET` list, each applied alone, each reverted, full suite each
time:

```
removed cross_session_inbound_accept = excluded…  -> GREEN
removed pane = excluded.pane                      -> GREEN
removed tombstoned_at = excluded.tombstoned_at    -> RED
```

The update path **is** exercised. The gap is that **every update in the contract writes
the same value over the same value** — put a descriptor, put the identical descriptor,
put it again. For any column whose value does not *change* between two writes, a missing
`excluded.<col>` and a present one produce **byte-identical rows**.

The only two columns it catches are the tombstone pair, and only because an intervening
`tombstone()` changes them **out of band**.

> **The two behaviours coincide by construction.** It reads as full round-trip coverage
> and is real for 2 columns out of 17 — the config-echo shape, in a contract test.

### Direct consequence for unit 1

A coder following the precedent inherits a contract that **cannot see the defect**.
`rpc_port` in the INSERT list and the binds but missing from `DO UPDATE SET` is **green
on this suite and green at every stage of the gate**, while frozen at the stale value
for ever after a re-registration — *the exact defect this unit exists to prevent,
shipped green through a full gate.*

### Binding

The witness writes one seat **twice with a DIFFERENT `rpc_port`** and reads back through
`Registry::get` against a **real `SqliteRegistry`**. Not a fake: `FakeRegistry` stores
descriptors in a map and **cannot express this defect at all**, so a fake-backed test is
guaranteed green in both worlds — *a probe whose negative arm cannot occur, sitting in
the FIXTURE rather than in the assertion.*

Also required: the column in **both** lists, a schema bump with migration (a column
without the bump passes `require_current_schema` on a store that lacks it), and the
receipt must not cite the green suite as evidence for the update path — **that
instrument answers a different question.**

The contract's own gap predates this unit and belongs to whoever owns
`registry_contract`. What binds unit 1 is that it **cannot rely on it**.

## D-1 — DEFERRED (frozen, trigger named) — a negative asserted by a timeout passes BECAUSE the timeout elapsed

Not unit-1 work and **not to be done now**. Recorded here because it is a **defect
class**, and the class is the fourth member of *coincidence by construction*.

Three tests assert that a forbidden event does **not** happen, by waiting 20ms and
requiring `timeout(...).is_err()`:

```
crates/daemon/src/delivery/mod.rs:1222
crates/transport/src/uds.rs:566
crates/daemon/tests/review_regressions.rs:301
```

> **They pass because the timeout elapsed.** A loaded CI runner that merely *delays* the
> forbidden event produces the same green — so the assertion cannot distinguish *"this
> never happens"* from *"this did not happen within 20ms on this machine today."*

Same shape as the others in this family: the fixture cannot **produce** the case where
the two states differ, so no quantity of green separates them. And the failure direction
is the dangerous one — **green over a live regression**, not a false alarm.

The idiomatic fix is already in-tree at five sites (`start_paused = true`,
e.g. `lifecycle.rs:246`): with a paused clock, "nothing happened" stops being a wall-clock
claim about a loaded machine.

**Trigger:** first CI flake on any of the three, or post-release cleanup — whichever
comes first. **Owner:** unassigned until the trigger fires.

## F9 — GRADED — CAPABILITY ASYMMETRY: the fixture can produce a case production cannot reach

> **The only launcher that stamps a port is the one that does not transmit the
> correlator, and the only launcher that transmits the correlator never stamps a port.**

The F1 fix keys on a launch id the registering process must echo back. `build_spawn_plan`
emits `PIJ_SESSION_ID` and nothing else; `PIJ_SPAWN_ID` appears **zero times** across
`crates/`. The TypeScript bridge forwards the field *only when the env var exists*, and
the TS launcher that does export it **never emits `--ui-server`**.

Observed on shipped routes, both arms:

```
arm1  SHIPPED-LAUNCH   at_spawn Some(58224)  ->  after_bind None
arm2  TEST-SUPPLIED    at_spawn Some(58225)  ->  after_bind Some(58225)
```

**Arm 2 is the acceptance test's world. Arm 1 is production's.** The fix is correct and
unreachable: every Copilot seat still loses its port at bind, and absence-model rows 1
and 2 stay collapsed **in the fleet** while separated **in the test**.

### Why this is a NEW class, not the previous one

- **Coincidence by construction** — *the fixture cannot produce a case where the two
  states differ.* (The registration always followed a fresh spawn; the contract wrote
  equal values over equal values; the reported count was the configured limit.)
- **Capability asymmetry** — *the fixture can produce a case production cannot reach.*
  The witness reads the launch id out of the spawn response and hands it back on the
  command line. A real seat is handed `PIJ_SESSION_ID` and nothing else.

Same root — **the fixture's capabilities are not the shipped path's capabilities** — and
the same consequence: **a green test about a code path no seat will ever take.** The
first class is caught by asking *what can this fixture produce*; the second by asking
**what does a real caller actually know**.

### Ruled

Emit `PIJ_SPAWN_ID` in the spawn argv beside `PIJ_SESSION_ID` — one line, and the bridge
already forwards it. Chosen over inferring from `descriptor.proc.is_none()` because **a
correlator should be explicit and carried, not inferred from a signal that means several
things at once.**

**And every witness gains an arm that supplies ONLY what a launched process could know** —
a registration constructed from the recorded launched environment, and nothing else.
That arm, and only that arm, would have caught this.

### Second-order proof that the standard is working

The revive unit's own witness was **green** and its author checked it against F9
unprompted, found it read `spawn_id` from the persisted descriptor and passed
`--spawn-id` by hand, and **withdrew its own receipt** — *"the fixture has a capability
the shipped launcher did not provide; my prior green therefore does not prove fleet
first-bind preservation."*

