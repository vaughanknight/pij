# Paired v4 review — atomically composed receiver + daemon sensor (`5222f518`)

Reviewer seat `pij-static-rhinoceros` (OMP, github-copilot/claude-opus-5).
Packet: `assets/inputs/pm-review-paired-v4.json`. Contract:
`assets/inputs/pm-typing-sensor-contract-v4.json`, canonical1142 clause.
Prior: `opus-correlation-sensor.md`, `opus-convergence-0de79322.md`, `opus-delta-2a36a799.md`.

Read-only. Nothing built, run, linted or launched. All claims from committed
content at the pin.

**Verdict: source-correct. F-D discharged properly.** One new P2 (evidence
attribution, daemon-side, pre-existing), one P3 (driver repaint edge). Neither
blocks the composition. No release verdict — live/default/lifecycle/real-provider
acceptance remains outstanding.

---

## Composition (check 7)

`5222f518` is a **three-parent octopus**: `50a90140` (PM line) + `051f7666`
(receiver) + `c36b86ad` (daemon sensor).

`git diff-tree --cc` emits **no hunks** — every line in the merge result comes
from at least one parent. No evil merge, no hand-resolution. Blob-level check:

- `delivery/mod.rs`, `http/mod.rs`, `http/native_tests.rs` — **identical** to `c36b86ad`
- `store.mjs`, `extension.mjs` — **identical** to `051f7666`
- `copilot-native-smoke.ts` — **identical** to `50a90140`

So the composition is a pure union of three reviewed lines, and **F-D is
discharged in the strongest available form**: the gate removal and the receiver
enter mainline history in one commit, with no intermediate first-parent state
where the gate is absent and the receiver missing. This is the "clean octopus"
option, and it is genuinely clean.

Worth recording why the merge was frictionless: `50a90140` carried the F-A repair
**byte-identical** to `c36b86ad`'s copy, so the two-line correction merged as a
no-op rather than a conflict. That is the payoff of applying the identical patch
rather than an equivalent one.

Two topology facts the packet's file list obscures, both benign:

- The receiver **code** is `c37f45a0` ("gate native injection with typing
  snapshots", +1055/−7 across `store.mjs` and its two test files). `051f7666` on
  top adds only four `.tap`/receipt evidence files (+2920, no source). I reviewed
  `c37f45a0`'s diff as the receiver.
- `extension.mjs` is **unchanged** by this work — identical across all three
  parents. It is listed as a target but contributes nothing to review.
- `copilot-native-smoke.ts` does not exist on the receiver branch (which forked at
  `a5de7cb3`); the driver changes are `ab0cf05e` and `373ffe3c` on the PM line.

Disposition of prior findings, as stated in the packet and confirmed here: **F-A**
landed independently in `50a90140`; **F-B**'s comment is in the same commit
("Compare before assignment: the clone still carries the incumbent's flag and
tombstone"); **F-C** is correctly *not* claimed done.

---

## Check 1 — validated sensor state before new intent

**Satisfied.** `DaemonClient.typingSnapshot` (`store.mjs:201`) validates before
returning: `native_consumer` must echo all three tuple fields
(`native_session`, `pid`, `proc_start`); `typing_grace_ms` and `observed_at_ms`
must be non-negative safe integers; `semantic_hold` must be a boolean. For
`state: "observed"` it additionally requires `retry_after_ms` non-negative,
`retry_after_ms <= typing_grace_ms`, `source === "pane-observed-edit-recency"`,
and a coherence check that `observed_at_ms` is not smaller than the implied
elapsed interval. `"unavailable"` must carry the exact contract reason. Anything
else throws `TypingSensorError`.

**No quiet fallback.** The catch rethrows only when `signal.aborted` or
`error.retryable` (preserving abort and reconnect semantics); every other failure
becomes `TypingSensorError`, which propagates out of `consume`'s `while` loop to
the outer catch and stops receiving. A sensor that cannot be read or cannot be
trusted therefore blocks delivery rather than defaulting to quiet.

**No competing grace default.** I grepped the whole receiver module: there is no
grace constant of any kind. Every decision uses `snapshot.typing_grace_ms` and
`snapshot.retry_after_ms` as returned by the daemon, and the poll cadence reuses
the pre-existing `INITIAL_RETRY_MS`/`MAX_RETRY_MS` (pinned by the test *"typing
sensor polling backs off within existing 250 to 5000 cadence"*). The daemon side
is already single-resolver (`http::resolve_typing_grace_ms`, verified last round),
so there is exactly one grace value in the system and the receiver only mirrors it.

**Gate placement is correct.** `#prepareNewSend` is called from `deliver` **only
inside `if (!record)`** — the new-intent branch — and before `journal.begin`. A
recovered accepted record never re-enters the gate, which is right: it was already
delivered to the human, and re-holding it would gate a message that is already on
screen. Contract line 23 asks for exactly this.

---

## Check 2 — the hold owns no body copy

**Satisfied, and structurally rather than incidentally.**

The loop in `#prepareNewSend` has one admitting exit:

```js
if (snapshot.retry_after_ms === 0 && !snapshot.semantic_hold) {
    if (!held) return true;
    await this.#declareRelease(claim);
    return false;   // Un-deferral invalidates this held claim...
}
```

Trace the `held` flag: on the first iteration, `retry > 0` either posts `/v1/hold`
and sets `held = true` or returns `false`; `retry === 0` with `semantic_hold`
falls to the tail, delays once, and hits `if (!held) return false`. So **`held`
is never false on a second iteration**. Consequently `return true` can only fire
on the *first* observation, with no intervening `await` other than the snapshot
request itself.

That is the property the check is after: **every path that waits returns `false`**.
A held claim is never injected — it is released and discarded, and the body is
re-fetched by a normal reclaim. The extension holds no copy of the body across the
hold; the durable queue row does. The driver proves this from the other side
(below): while held, the job is `pending` with the body still in its payload.

Long waits, cancellation and lease changes therefore cannot produce a stale
unvalidated send, because there is no code path that carries a claim across a wait
into an injection. `throwIfStopped(signal)` before and after every await, and
`abortable()` around each, make cancellation prompt as well as safe — pinned by
*"shutdown during typing ${phase} cancels old-context work without release intent
send or ACK"* and *"typing snapshot HTTP wait is externally abortable and its
deadline is not inbox renewal"*. That second one matters: `typingSnapshot` uses
`this.request`, not `#requestEnvelope(..., inboxWait)`, so a snapshot timeout can
never be mistaken for the inbox long-poll renewal introduced in D1.

The `/v1/hold` `since_ms` is derived as
`observed_at_ms - (typing_grace_ms - retry_after_ms)` exactly per contract line 24,
and — importantly — it is **not a policy input**: `hold_inbox` defers for
`state.typing_grace_ms`, the daemon's own value, and carries `since_ms` only in the
published event payload. Client-supplied time is descriptive here, never an ageing
anchor.

---

## Check 3 — current release precedes ACK

**Satisfied.** In `deliver`, after durable acceptance and before the ACK request:

```js
// ACK-stage declarations do not invalidate this current claim; recovered acceptance also declares.
await this.#declareRelease(claim);
```

This runs on **every** path that reaches ACK, including recovered accepted records
that carry no local memory of a hold — contract line 26's "declare CURRENT release
even without local historical notes". The driver confirms the ordering at the spine
(`released.seq < ackEvents[0].seq`).

**No fabricated pairing.** `#declareRelease` accepts the receipt only if
`receipt.msg_id === msgId` **and** (`released === true` or
`released === false && noop === true`). A no-op is accepted as a current
declaration, matching "A no-op release is a current declaration, not invented
evidence of an earlier hold" — and because `msg_id` is checked, it cannot be
attributed to a different message.

**Reuse within cycle, reset on re-hold.** `declaredReleases` is a `Map` keyed by
`job_id` → `msg_id`, and it deliberately outlives a single `deliver` call. The
reuse path is precise: hold → expiry → release (memo set) → `return false` →
reclaim returns the *same* `job_id` → quiet snapshot → inject → ACK-stage
`#declareRelease` sees the memo and skips the redundant POST. A new hold on that
job calls `declaredReleases.delete(job_id)` first — commented "A new hold starts a
new declaration cycle, including an uncertain HTTP outcome" — so a re-held job must
re-declare. Both are pinned (*"successful held release is reused before ACK when
the same job is freshly reclaimed"*, *"renewed typing on a reclaimed job
invalidates its earlier release declaration"*).

The uncertain-outcome reasoning is the right call: an HTTP hold whose response was
lost may or may not have deferred the job, so discarding the memo and re-declaring
is the conservative direction.

**No reinjection on error.** Injection is inside `if (await this.journal.begin(...))`,
so a post-injection failure replays as record-load → release → ACK, never a second
send. Memo hygiene is complete: `delete` after successful ACK, `clear()` in
`consume`'s `finally`. Pinned by *"ACK-stage ${failure} retry preserves acceptance
and reuses only successful release declarations"*.

---

## Check 4 — degraded visibility and rollover isolation

**Satisfied.** `TypingSensorError` extends `NativeError`, so it reaches the outer
catch and emits `receive-held` with `holdKind: "typing-sensor"`. The reporter maps
that to a distinct operator message naming the actual surface to check — *"native
typing-sensor unavailable or invalid; check the daemon sensor and pane ownership;
receiving stopped without acknowledgement; **outgoing pij_send remains
available**"*. Outgoing usability is preserved in the message and in fact, since
only the receive loop terminates.

Semantic Hold surfaces as `consent-held` with `reason: "semantic-hold"`, and is
never cleared by the receiver — the comment says so ("Operator Hold can race a
claim. Do not clear it or reuse that delayed claim") and the driver asserts
`semantic_hold === false` throughout its own proof so it cannot pass by clearing
one. Authority stays with the operator; the receiver only reports.

Backoff ownership is clean, which I checked because a discarded claim resets
`retry` at `consume:641`. The steady-state hold is the daemon's: a semantically
held seat gets a `hold` envelope rather than a claim, handled at `consume:634-639`
with proper exponential backoff. `#prepareNewSend`'s semantic-hold branch is only
the race window between the daemon's revalidation and the sensor read, so the
reset cannot become a poll loop — the daemon stops handing out the claim.

Rollover isolation is unchanged and still holds: `declaredReleases.clear()` joins
`completion = undefined` and `unsubscribe()` in the `finally`, so a reload starts
with no memo and no stale subscription (*"late stale claim after stop cannot reach
native send"*, *"spawned native rollover preserves correlation across extension
reload"*).

---

## Check 5 — driver: draft unchanged, independent validation

**Satisfied, and this is the strongest artifact in the change.**

`driveSmokeTypingWitness` re-asserts `nativeComposer(terminal) === draft` on
**every** sample, so the invariant is checked continuously rather than at the
endpoints. It refuses to start unless the composer is empty ("refusing to
overwrite existing composer"), and the draft must match `/^HUMAN_DRAFT_[a-zA-Z0-9-]+$/`
— so the only thing it can ever type is a fixture-shaped marker. **No message body
ever reaches tmux**; the single `send-keys` is `-l -- <draft>`.

Snapshot validation is independent of the receiver's own: `native_consumer`
deep-equals the tuple, `source` exact, `semantic_hold === false`, all three numeric
fields non-negative safe integers, `retry <= grace`, **`grace` constant across the
whole proof** ("daemon grace changed during proof"), and `observed_at_ms`
monotonic ("sensor observation clock moved backwards").

Durable state while held is pinned hard: exactly one job, `state === "pending"`
(i.e. unclaimed), a real positive integer id, and payload `to`/`msg_id`/`body`/
`native_target_session` all matching. That is the independent confirmation that the
queue — not the extension — owns the body during the hold.

The expiry proof is honest about its own race. When acceptance appears while
`retry > 0`, it re-samples and requires `retry === 0`, with the comment "Sensor is
read before files/SQLite: those later reads can cross the expiry boundary." That is
a real ordering hazard (the SQLite view is younger than the sensor read), and
handling it by re-observing rather than widening a tolerance is the right
treatment. It then requires `expired.observedAt >= deadline` against the
*witnessed* expiry point, not a wall-clock guess.

Ordering and exactly-once are proven at the spine: `at_ms >= max(deadline,
since_ms + grace)` (release follows the hold *and* a full observed grace),
`native.length <= 1 && acknowledgements.length <= 1` checked on every sample so a
duplicate fails whenever it appears, then exactly one of each; `ack.origin ===
"reader-read"`; **the completed job is the same `held.job_id`** (proving reclaim of
the original durable row, not a duplicate); and `released.seq < ack.seq` with
exactly one matching ack event.

### F-E (P2) — `delivery.released` is client-attributed while `delivery.held` is queue-attributed

The driver's independence rests on the spine pair. Those two events do not have
the same evidential grade.

`hold_inbox` (`http/mod.rs:1490-1495`) rebuilds the event from the queue outcome:

```rust
// Bearer identity is machine-grade: the queue, not the request, attributes the event.
let event = HeldEvent { seat: recipient, msg_id, ..request.event };
```

`release_inbox` (`:1527-1532`) publishes `request.event` verbatim, with
`&request.event.seat` as the event seat — even though `ReleaseOutcome::Released`
carries `recipient: SeatId` and `msg_id: String` whose own doc comments in
`crates/core/src/ports.rs:170-175` read *"identity is authority-owned"* and
*"Recipient recorded by the queue."* The match arm discards `recipient` via `..`
and uses the queue's `msg_id` only in the HTTP response, never in the event.

Consequences, in order of how much I think they matter:

1. The driver filters delivery events on `row.seat === seat.id &&
   row.payload.seat === seat.id && row.payload.msg_id === msgId`. For
   `delivery.held` all three are queue-derived — genuinely independent. For
   `delivery.released` all three are echoes of what the extension asserted, so
   that half of the check-5 evidence pair corroborates the extension against
   itself. The two halves are presented as equivalent and are not.
2. On the `Released` path the response names the queue's `msg_id` while the
   published event names the client's. An honest receiver keeps them equal (and
   `#declareRelease` validates the response), so this is not reachable by the
   product — but the spine record, which is the durable operator-visible evidence
   and the input to `is_held`, is not cross-checked against the authority that
   just performed the release.
3. `is_held` (`:1407-1418`) decides heldness by comparing latest `delivery.held`
   and `delivery.released` sequence numbers for a (seat, msg_id). A
   released event naming an arbitrary pair can therefore mark an actually-held
   message as not-held. Impact is limited — it only suppresses a duplicate
   `delivery.held` publish and clears readback — and any caller is already
   bearer-authenticated. This is an evidence-integrity issue, not a delivery-safety
   one: it cannot cause a send, an injection or an ACK.

I do not think the current shape is arbitrary — publishing unconditionally is
deliberate, because a no-op release has no queue row to attribute from and the
contract wants it recorded anyway. The fix keeps that: on `Released`, publish with
the queue's `recipient`/`msg_id` exactly as `hold_inbox` does; keep the client's
declaration verbatim only for `NotDeferred`/`NotLive`, where there is nothing to
attribute against. Small, non-behavioural, and it makes the driver's release
evidence as independent as its hold evidence.

Ownership: daemon (`pij-grotesque-armadillo`). Not a merge blocker.

---

## Check 6 — active-modal guard and lifecycle controls

**Satisfied.** `activeBottomModal` returns a deliberate tri-state — `false` (no
active box), `undefined` (incomplete repaint), or the body — and callers use all
three correctly. `verifyToolApproval` returns `true` only for the exact dialog and
**throws** for any *complete* active box that is not it: unknown title, ambiguous
boundary, missing/ambiguous/malformed arguments, `deepEqual` mismatch on
recipient/body, wrong choice list, unknown controls. So "rejects complete unexpected
or mismatched active dialogs" is enforced by fail-fast, not by timeout.

Welcome and transcript boxes are ignored structurally: a box whose closing line is
not the final line is history, not the control surface. The fixture backing this is
a **real captured terminal** (`pm-native-real-canary-01.json`), and the tests cover
the combinations that matter — welcome recognised as history with an empty
composer, exact dialog below welcome, mismatching dialog below welcome throwing,
and bounded waiting through welcome + incomplete repaint before two exact
confirmations.

Waiting is keyless. The pre-confirm recheck moved *inside* the `until` loop, so a
transient repaint retries instead of failing, while a complete mismatched dialog
still throws from within the loop — the exactness guarantee is unchanged, only
transients became tolerant. Dismissal now requires `=== false` (proved absence)
rather than falsiness, so an incomplete repaint can no longer be misread as
dismissal.

Lifecycle controls: `nativeComposer` returns `undefined` on incomplete repaint and
asserts `modal === false` otherwise, so any complete active dialog during a
lifecycle operation raises `PIJ_NATIVE_UNEXPECTED_LIFECYCLE_DIALOG` instead of
typing into an unknown surface.

### F-F (P3) — a bottom-most complete box with no composer painted is read as an active dialog

`activeBottomModal` treats "complete box whose `╰─╯` is the last line" as active by
definition. That is the correct discriminator — a real approval dialog occupies the
bottom with no composer beneath it — but it means the only thing preventing a
benign welcome box from being classified active is that the product always paints
the composer below it. That is a **product-UI invariant, not one the guard
establishes**, and the captured fixture confirms it holds in practice (its
`nativeComposer` is `""`, i.e. composer present).

If a capture ever lands between the box painting and the composer painting, the
welcome body is returned as active and `verifyToolApproval` throws
`unknown dialog title` — a hard failure on a benign frame, where `undefined`
(keep waiting) is the correct response. I have **not observed this flake**; I am
reporting it as reachable-in-principle, and the shape-only information available at
that instant genuinely cannot distinguish it from a foreign active dialog.

Cheap hardening if it ever bites: recognise the welcome/history box by content and
return `undefined` for it, keeping the throw for genuinely unknown boxes. Low
priority — a retry-shaped failure, not a correctness one.

---

## Proof limits

- **This review:** source only, at the pin. Nothing built, run, linted or launched.
- **PM's reported passes** (124 native, 139 installer/smoke, 486 Rust, cross-language,
  `moduleDigest` matching `d0b2c2ff`) are taken as reported; I ran nothing.
- **Daemon sensor** carries no live `/v1/inbox/typing` exercise from a real Copilot
  session — Rust tests over real SQLite and HTTP with a fake tmux.
- **Driver** is authored and unit-tested against real captured terminal fixtures;
  its live end-to-end run against a real client is the pending acceptance.
- **Not established:** actual v4 behaviour at default 60 s grace, lifecycle proofs,
  real-provider inference, AC6, full final gates.
- **Not reopened:** the missing-parent completion cause (observed); strict draft
  blocking (superseded); F-A/F-B (landed and verified); F-C (separately owned,
  correctly not claimed).

## Verdict

**Source-correct; the composition is sound and F-D is properly discharged.**

The receiver's central safety property is structural rather than incidental: the
only admitting exit executes on the first observation before any wait, and every
waiting path discards the claim, so no code path carries a body across a hold into
an injection. Release-before-ACK, memo reuse, and re-hold reset are each pinned by
a test that names the exact scenario, and the ACK-stage declaration fires for
recovered records with no local history — the canonical1142 clause read correctly.

Two findings, neither blocking: **F-E (P2)** — `delivery.released` is
client-attributed while `delivery.held` is queue-attributed, so half of the
driver's independent evidence is the extension corroborating itself; the authority
identity is already available and documented as authority-owned. **F-F (P3)** — a
narrow repaint frame can be read as an active dialog and fails hard where it should
wait.

No release verdict. Live default-grace, lifecycle and real-provider acceptance
remain the gap between this and shippable.
