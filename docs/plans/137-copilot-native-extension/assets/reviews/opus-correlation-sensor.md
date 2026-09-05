# Slice review — C1 / completion / daemon typing sensor

Reviewer seat `pij-static-rhinoceros` (OMP, github-copilot/claude-opus-5).
Packet: `assets/inputs/pm-review-correlation-sensor.json`.
Prior artifacts: `opus-convergence-0de79322.md`, `opus-delta-2a36a799.md`.

## Pins and topology

Read-only. Nothing built, run, linted or tested. Every claim is derived from
committed content (`git show <sha>:<path>`), so it survives the worktree moving.

The four pins are **not a linear chain**, and the per-slice diffs the packet
implies are not diffs against the stated baseline. Established by merge-base:

| slice | pin | correct base | diff |
|---|---|---|---|
| C1 | `d59ef9a6` | parent `fed36094` | 1 file, +109/−13 |
| completion | `2b180f4f` | parent `5aba3d26` | 2 files, +231/−9 |
| daemon sensor | `c36b86ad` | parent = baseline `379e54b9` | 4 files, +951/−207 |

`d59ef9a6` is already **contained in** the baseline `379e54b9` (merge-base of the
two is `d59ef9a6` itself) — which is what produces finding **F-A** below.
`2b180f4f` branches from `07a8f9af` and reaches HEAD via merge `47d501f9`.
`c36b86ad` is the only pin **not** in HEAD `137cfb9b`; it exists solely on
`137-copilot-native-daemon`. That containment is load-bearing — see **F-D**.

**Verdict: source-accept all three slices.** One P1 merge-ordering constraint
(currently honoured), two P2 findings, one P3. Not a release verdict; the paired
v4 receiver review is still owed.

---

## S1 — C1 flag preservation (`d59ef9a6`)

**Correct.** The predicate at `crates/daemon/src/registration.rs:549-555`:

```rust
descriptor.native_extension_delivery = native
    || existing.is_some_and(|owner| {
        owner.native_extension_delivery
            && owner.tombstoned_at.is_none()
            && same_native_owner(owner, &descriptor)
    });
```

Against the three prohibitions:

- **No grant.** `owner.native_extension_delivery` must already be true. A seat
  that never attested stays false, and `SeatDescriptor::new` defaults the field
  to `false` (`crates/core/src/model.rs:419`), so a first registration
  (`existing == None`) can only be granted by `native` — this request's own
  verified observation. Fail-closed.
- **No transfer.** `descriptor.proc` is assigned from the claim before this
  line, so `same_native_owner` compares the pre-registration `proc` against the
  claimed one. A new **or recycled** PID differs and preservation is denied —
  and `check_native_roster:402-418` refuses the registration outright first. The
  new test drives both replacements (`OTHER_HOST` and `proc_start + 1`) and
  asserts the roster is unchanged.
- **No revival.** `tombstoned_at.is_none()` excludes retired rows, and a seat
  whose capability was withdrawn has the flag false so the first conjunct fails.
  `ordinary_withdrawal_preserves_session_and_does_not_enable_later_takeover` was
  updated to seed `native_extension_delivery = false` and now asserts exactly
  that ("ordinary registration cannot revive withdrawn capability").

**PutBinding is untouched.** The diff has exactly one non-test hunk — the eight
lines above. Binding behaviour is instead newly *pinned* by the tests, which
assert `binding.inserted` and `binding.previous_proc` on both the preserving
path and all seven no-grant cases.

### F-A (P2) — C1 leaves a red test whose repair is trapped in the unmergeable slice

`crates/daemon/src/http/tests.rs:2140` (`ordinary_registration_clears_native_-
attestation_but_preserves_claude_consent`) asserts `!native_extension_delivery`
at `:2215`. The C1 slice touched only `registration.rs`, so that expectation is
unchanged at `d59ef9a6` **and at the baseline `379e54b9`**.

The scenario meets every preservation conjunct — I checked all eight against the
fixture at `:2149-2156` and the payload at `:2192-2208`: harness `copilot`, proc
`{43, 20260831103043}`, pane `%43`, session `native-copilot` (the payload carries
no `harness_session`, so the descriptor keeps the owner's), spawn `spawn-copilot`,
`relay: false`, not tombstoned. Preservation therefore applies and the assertion
inverts.

That assertion is corrected only in `c36b86ad` (the packet's check 11), which is
the one commit that **must not merge alone** (F-D). So the two-line expectation
fix is currently reachable only behind a blocked merge.

This is not a correctness defect in C1 — the source fix is right and the stale
test was encoding the bug. It is a sequencing defect: the slice that changed the
behaviour did not carry the expectation that asserted the old behaviour, and the
repair was picked up by an unrelated owner. **Recommend cherry-picking those two
lines onto the C1/plan line** so the tree is self-consistent without the daemon
slice.

### F-B (P3) — two of eight conjuncts are tautological at this call site

`same_native_owner` (`:643-652`) compares eight fields. At `:553`, `descriptor`
is a clone of `existing` (`:501-503`) with claim-derived fields overwritten, so:

- `native_extension_delivery` — **self-comparison**. The RHS of the assignment is
  fully evaluated before the assignment lands, so `descriptor` still holds the
  clone's value, which is `owner`'s by construction. Always true here.
- `tombstoned_at` — not written between the clone and this line. Always true
  here; the real check is the separate `owner.tombstoned_at.is_none()` conjunct.
- `harness_session` — equal by construction whenever the request omits a session.

The other five (`harness`, `proc`, `pane`, `spawn_id`, `relay`) genuinely
discriminate, so the predicate is *sound*; it simply reads stronger than it is.
The helper is shared with `:366`, where the flag and tombstone conjuncts do
discriminate, so this is reuse rather than a defect.

The residual is a maintenance trap: a statement that reads a field it is
assigning changes meaning silently if descriptor construction ever moves. Today
it fails closed (a fresh descriptor defaults false → no preservation). One
sentence of comment at `:553`, or a purpose-built predicate, removes the trap.

---

## S2 — completion correlation (`2b180f4f`)

**Correct**, and the packet is right that the cause is observed rather than
hypothesised. I re-derived it from the trace rather than accepting the summary.

### The cause, from the product trace

`assets/evidence/pm-native-product-recipient.log`, one live session:

- **seq 6** `user.message`, `messageId = 40413538…` (our injected native id),
  `interactionId = e35165ab…` → anchor established, `descendants = 1`.
- seq 7-19 chain normally, `parentKnown: true`, `descendants` reaches 14.
- **seq 20** `permission.completed`, `parentId = d00c4cee…`, **`parentKnown:
  false`**. That parent — the `permission.requested` — was never delivered to the
  extension callback. `descendants` freezes at 14 for the rest of the session.
- seq 21-43 all descend from that severed node; every one is dropped.
- **seq 44** `session.idle`, parent `d82d81fc…`, unreachable. `afterTerminal`
  stays `null` through the entire run.

The ancestry gap is directly visible in the record, and the omitted node type is
identified. Not a hypothesis.

### The fix, checked against each rule

- **Only the matched user's message establishes the anchor.** `interactionId` is
  written in exactly one place — inside the `user.message` branch guarded by
  `!event.agentId && event.data?.messageId === this.nativeId` — and with `??=`,
  so it is first-write-wins.
- **Only matching foreground assistant/tool events re-anchor.** `sameInteraction`
  requires `!event.agentId`, a matching `interactionId`, and a type in
  `{assistant.turn_start, assistant.message, tool.execution_complete}`.
- **Idle still requires descendant parent.** `session.idle`/`session.error` are
  deliberately absent from that type list, so a terminal event can never
  re-anchor itself; it must inherit `descendants.has(parentId)`.
- **Current live generation only.** `observe` returns early unless `this.live`,
  and `live === (recoveredNativeId === undefined)`, so a recovered record can
  never complete from events.
- **No model text.** The pre-bind buffer projects only
  `{type, id, parentId, agentId, data:{messageId, interactionId}}`. Retaining
  `interactionId` there is what makes replay-time anchoring work, which is why
  the first hunk exists.

The conjunct that carries the most weight is `this.interactionId !== undefined`.
Without it, an unanchored completion would compare `undefined === undefined` and
**every** foreground assistant message would re-anchor. It is tested in all three
degenerate forms (`[undefined, "", "   "]`), which is the right way to pin it.

The negative space is pinned throughout: a foreign `user.message` sharing the
interaction, a subagent (`agentId: "child"`) user message carrying the right
`messageId`, a `turnId`-only event, a foreign interaction, and terminal events
shaped like anchors — all asserted non-completing. The regression test transcribes
the real trace (`product-6` … `product-44`) with the omitted permission ancestor
preserved, and asserts `native-completed` fires on `product-44` specifically.

### interactionId granularity — the assumption, empirically settled

The whole design rests on `interactionId` being per-interaction rather than
per-session; if it were session-scoped, a later turn's idle could complete an
earlier send. Two independent confirmations in the evidence:

- one interaction spans multiple turns — `e35165ab…` covers `turnId` 0 **and** 1
  in the product trace, which is the granularity the anchor needs;
- and it changes per user message on the **same** session `083af74a…`:
  `c0587d2d…` for the roundtrip, `467178df…` for the second receive
  (`pm-native-completion-live-01.json`, witnesses `manual-roundtrip` and
  `completion-next-claim`).

That second point *is* the successive-receive proof: correlation resolved the
first send and the same session accepted a second real native receive under a
fresh interaction.

### Receipt-to-pin binding — correct here

`pm-native-completion-live-01.json` records
`identity.source_modules["store.mjs"] = 8c3f892d…`, which is byte-identical to
`git show 2b180f4f:.copilot/extensions/pij/store.mjs` (and unchanged through
HEAD); `extension.mjs` matches `567fccce…` likewise. The live evidence therefore
attests **exactly the pinned bytes**. This is the pattern that finding F4 of
`opus-delta-2a36a799.md` asked for, and it is worth noting that it was met here
without being asked.

### F-C (P2) — the failure mode is repaired; the failure *class* is not observable

`waitForCompletion` blocks on
`await abortable(completion.done, this.controller.signal)` — bounded only by
shutdown. And the instrumentation that diagnosed this bug is **not in the
product**: `native-callback-probe` appears nowhere in the committed tree; it was
temporary scaffolding.

So the next unmodelled ancestry omission reproduces the identical signature: one
`completion-wait` report, then permanent silence, with inbound delivery stopped
because the consumer never claims again. Diagnosing it again would require
re-adding instrumentation and reproducing a live session.

This is the same class as R1 in the previous review (a wedged consumer that looks
idle), and the codebase already has the right pattern one commit away: the D1
renewal path proves a bounded loop can stay quiet on the healthy path and still
speak when something is wrong. Bounding the completion wait and emitting a
`completion-stalled` diagnostic — and/or keeping the probe behind an env flag —
converts a silent permanent stall into a reported one. Correlating correctly is
the fix; being able to *see* the next miscorrelation is the durable part.

---

## S3 — daemon typing sensor (`c36b86ad`)

**Conforms to `pm-typing-sensor-contract-v4.json`.** Rule by rule:

**Route.** `Endpoint::InboxTyping` → `GET /v1/inbox/typing`, added to
`Endpoint::ALL` (so it participates in the ALL-driven method/coverage checks) and
routed with `get(inbox_typing)`. Auth is the shared bearer middleware; the HTTP
test asserts an unauthenticated GET returns 401.

**One resolver.** `resolve_typing_grace_ms()` is called once, at
`http/mod.rs:300`, into `AppState.typing_grace_ms`; register (`:590`), the hold
defer (`:1437`) and the sensor all read that one field. The HTTP test asserts the
wire value equals `resolve_typing_grace_ms()`, so register and sensor agreeing is
proven at the wire, not by inspection.

**Observation, outside the lock.** `native_typing_snapshot` is two-phase: resolve
the recipient and do the slow pane capture with no lock held, then take
`native_lock`, **re-resolve** identity, and publish only if `current.pane ==
observed.pane`. Rule "observe outside fleet-wide native lock; revalidate exact
owner and pane" satisfied structurally.

**Remaining recency, from the shared sensor.** The case analysis is exhaustive
and every fall-through is conservative:

| verdict | result |
|---|---|
| `HumanTyping` with `next_retry_at: Some(d)` | `Observed { ceil_ms(d) }` |
| `HumanTyping` with `next_retry_at: None` | `Unavailable` |
| `permitted && reason.is_none()` | `Observed { 0 }` — the aged non-empty draft |
| `TapUnowned` / `Unrecognized` / `Err` | `Unavailable` |
| no pane, grace `== 0` | `Observed { 0 }` |
| no pane, grace `!= 0` | `Unavailable` |

`retry_after_ms` uses `remaining.as_nanos().div_ceil(1_000_000)`, so a positive
sub-millisecond veto rounds **up**, never down to quiet — the contract's
"positive sub-ms rounded conservatively", with the comment saying so and tests
pinning `retry_after_ms: 1..=100` rather than a bare "nonzero". `composer_idle`
appears nowhere in the new code. Unavailability is always an explicit
`{state: "unavailable", reason: "native-typing-sensor-unavailable"}`, never
synthetic quiet.

The extra `retry_after_ms <= typing_grace_ms` guard is a good defensive touch: if
the `InteractionGate`'s grace ever diverges from the daemon-resolved one, the
snapshot degrades to `unavailable` rather than publishing a value inconsistent
with the `typing_grace_ms` it advertises in the same object.

**No queue writes.** The function calls only `native_recipient` and the pane
capture. The HTTP test proves it end-to-end: `peek` identical before and after,
`claimed_delivery` `None` before a claim and **unchanged while a claim is
running**, registry row unchanged across every refusal case.

**Sensor is not transport — proven mechanically.** The HTTP test asserts
`tmux.calls()` contains no `type`, `stage` or `send_keys` call. That is the
strongest available statement of the ruling's "sensor is not transport", and it
is an assertion rather than a comment.

**No body or credentials.** `!body.to_string().contains("private queued body")`,
plus a full-object equality assertion on `data`, so an added key fails rather
than passing a subset check. The serialized shape (flattened internally-tagged
enum) matches the v4 `observed_data`/`unavailable_data` key sets exactly.

**Identity.** `native_recipient(seat, identity)` runs twice, both required
`Some`, else an explicit refusal. Tests loop missing/partial tuples (`all`,
`native_session`, `pid`, `proc_start`), an absent seat, and
`retired`/`noncopilot`/`unattested` states, asserting refusal **and** unchanged
registry and queue each time.

### Claim gate removal — scope is exactly as described

`native_claim_permitted` is deleted, and with it the composer/tap admission. What
survives, verified at the pin:

- **Semantic Hold** — still enforced at claim. `revalidate_native_observation`
  (`delivery/mod.rs:702-704`) returns `Some("semantic-hold")` for a held seat, and
  it is called both before the claim and again before handoff. The replacement
  test asserts `held_reason == Some("semantic-hold")`. The old code checked it in
  two places; one of those was the deleted function, and the surviving one is on
  every claim path.
- **Tuple** — `native_recipient(seat, identity)` still runs in the loop.
- **Exact attempt** — the `claimed_delivery(job_id)` guard is retained (comment
  narrowed to lease expiry, since registration change is now handled solely by
  revalidation).
- **Target-session** and payload validation — untouched by this diff.
- **No-tmux delivery** — unchanged: a pane-less seat was already ungated by the
  old `if let Some(pane)` and still is.

Lock ordering is now simpler and strictly better: `native_lock` is taken once for
the whole claim, which is safe precisely because the slow pane IO that motivated
the old drop-reacquire dance is gone. The comment states that invariant
("no pane IO occurs here"), and it holds.

### F-D (P1 — ordering, not code) — this commit inverts its own contract's sequence

`pm-typing-sensor-contract-v4.json` `daemon_change` states: *"Remove composer/tap
gate from native CLAIM **only after** v4 receiver is composed."* `c36b86ad`
removes the gate; the receiver does not exist yet.

Merged alone, native Copilot would deliver with **no typing consent at all** —
not the old strict draft veto, and not the ruled 60 s recency rule, because the
replacement gate lives entirely in the unwritten receiver. That is strictly
weaker than both the pre-change behaviour and the ruled behaviour, and it is the
one thing Jordan's ruling explicitly withholds: *"This is NOT permission for an
ungated native send."*

**Currently contained, and I verified it rather than taking it on trust:**
`c36b86ad` is not an ancestor of HEAD `137cfb9b`; `git branch --contains` reports
only `137-copilot-native-daemon`. The PM's statement that the daemon slice has
not been merged alone is accurate.

The residual is that the coupling is **procedural** — it lives in the packet, the
contract prose, and the PM's memory — while the hazard is a one-line merge. The
commit itself carries no marker that it must not ship alone, and its own tests
are green, so a future reader sees a clean, well-tested daemon slice with nothing
signalling the constraint. Recommend making it mechanical: land the gate removal
and the receiver in a single merge commit, or keep the claim gate in place until
the receiver is present so the removal is a no-op when it lands.

### Obsolete prior finding — correctly retired

F1 of `opus-delta-2a36a799.md` (the unused `composer-busy` reason on the native
consent veto) is **obsolete**, as the packet states: the ruling supersedes strict
draft blocking and the veto it described is deleted. The disposition is clean
rather than dropped — the D4 red-green test
`native_claim_consent_holds_then_admits_without_touching_composer` is renamed to
`native_typing_snapshot_expires_static_draft_and_renews_only_on_edit`, i.e. the
same scenario now proves the sensor's behaviour instead of the gate's. That is
the right way to retire a test whose subject moved.

### Check 11 — narrow HTTP expectation update

Two lines of substance: the function rename and the removal of `!` at
`http/tests.rs:2215`. The Claude half of the scenario and its assertion are
untouched, so `cross_session_inbound_accept` coverage is preserved. Correct — but
see **F-A** for where this fix currently lives.

---

## Proof ceiling

- **This review:** source correctness of three slices from committed content, by
  reading. Nothing built, run or tested by me.
- **Live completion evidence:** real Copilot CLI `1.0.84-0`, real SDK extension
  host, real permission dialog, real tmux, real daemon and SQLite — but
  `"provider": "deterministic-local-fixture-not-real-inference"`, model
  `pij-native-fixture`, five fixture `POST /v1/chat/completions`. Event **shapes
  and ordering** are genuine SDK behaviour, which is what correlation depends on;
  model **content** is fixture-determined. The receipt labels this itself.
- **`pm-native-completion-live-01.json` scope**, per its own field: *"manual
  roundtrip plus second native receive only; excludes typing and lifecycle"*.
- **Sensor evidence:** Rust tests over real SQLite, real HTTP and a fake tmux.
  No live Copilot session has yet exercised `/v1/inbox/typing`.
- **Not established:** real-provider inference, the v4 receiver's hold/release/
  reclaim behaviour, lifecycle and spawned-seat proofs, AC6 and the real welcome
  guard, full final gates.
- **Out of scope / not reopened:** the missing-parent cause (observed, not
  hypothesis); strict draft blocking (superseded by the ruling).

## Verdict

**Source-accept `d59ef9a6`, `2b180f4f` and `c36b86ad`.**

C1's preservation predicate is right in all three prohibited directions and fails
closed by default. The completion anchor is right, and the guard that stops it
degenerating (`interactionId !== undefined`) is both present and tested in every
degenerate form; its live receipt attests exactly the pinned module bytes. The
sensor conforms to v4 rule by rule, and proves the two properties that matter
most — no queue mutation and no emitted keys — by assertion rather than comment.

One P1 constraint, already honoured and now independently verified: **`c36b86ad`
must not merge without the v4 receiver**, and the coupling should be made
mechanical rather than procedural. Two P2s: the C1 expectation repair is trapped
in that same unmergeable commit and should be cherry-picked out (**F-A**); and a
future correlation failure would be as silent and as hard to diagnose as this one
was (**F-C**). One P3: a self-comparing conjunct that reads stronger than it is
(**F-B**).

No release verdict. The paired v4 receiver review is owed before any deployment
judgement, and the live/lifecycle/real-provider acceptance remains outstanding.
