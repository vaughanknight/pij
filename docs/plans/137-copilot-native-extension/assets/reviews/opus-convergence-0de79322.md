# Targeted convergence review — `0de7932273d1f3577cc64177bd1a8abe6442daba`

Reviewer seat `pij-static-rhinoceros` (OMP, github-copilot/claude-opus-5).
Packet: `assets/inputs/pm-review-convergence-0de79322.json`.
Baseline: `assets/reviews/opus-code-review-6ff2f981.md`.

## Source pinning and the moving tree

Read-only, product code untouched. Nothing was built, run, linted or tested.

Mid-review the PM began composing `main136/be778b9c`, `runtime07a8f9af` and
`consent5efd0ccc`. The worktree moved from `0de79322` to `fed36094` (26 files,
+4507/-117) **while this review was in progress**. Of the files this review
reads, exactly two drifted after first read — `crates/daemon/src/http/mod.rs`
and `crates/daemon/src/http/identity.rs`. Every claim made about those two was
**re-derived from committed content at `0de79322`** (`git show
0de79322:<path>`), not from the working tree, and the re-derivation is what is
cited below. The remaining files were verified byte-identical to the pin.

**Scope limit, stated up front:** renewal (`runtime07a8f9af`) and consent
(`consent5efd0ccc`) are **not in this pin** and are therefore **not reviewed**.
Nothing here should be read as clearing them. A final delta review against the
resolved composed SHA is owed and is not substituted for by this artifact.

---

## Check 1 — 135 binding reports + pane normalization vs 137 native authority

**Pass.**

`PutBinding` is computed inside the same write transaction that performs the
upsert (`crates/store/src/registry.rs:212-228`): `begin_write`, then the
`SELECT pid, proc_start`, then the spine insert and the seat upsert, then one
`commit`. The binding therefore cannot report a transition the registry did not
take.

Malformed tuples are rejected before any mutation. `row_proc`
(`registry.rs:51-68`) returns `Err` on a half identity (pid without proc_start
or the reverse), and `put_reporting` reaches it at `:227` via `?` — **before**
either `INSERT` statement executes. The transaction drops uncommitted. The
packet's "reject malformed tuples without mutating registration" holds by
construction, not by convention.

The native invariant is enforced at the store boundary too
(`registry.rs:133-147`): a row carrying `native_extension_delivery = 1` with a
non-Copilot harness, an out-of-range pid, a non-positive proc_start, an empty
harness session, or a tombstone is an adapter error on read, so a corrupt row
cannot be projected into a descriptor that then attests native delivery.

Pane normalization coexists correctly: `adopt` derives its process identity
through `pane_harness_identity` → `pij_tmux::harness_process`
(`http/mod.rs:407-443` at pin), which walks pane descendants for the harness
entrypoint and falls back to the pane root. That resolution is 135's, and it
feeds an **ordinary** registration (see C1 below), never the native one.

---

## Check 2 — cold resume owner selection and anti-steal

**Pass on selection and anti-steal. This is the strongest part of the change.**

The P1-B gap from the baseline review is closed, and closed at the right layer.

**Address is now session-derived, not process-derived.** `chooseRegistration`
(`.copilot/extensions/pij/store.mjs:59-142`) gained a session-keyed fallback at
`:101` — `nativeAttested(seat) && seat.session === sessionId` — and, more
importantly, the minted id at `:122` is `hash([sessionId])`. A cold resume
therefore lands on the same address **even when the roster lookup finds
nothing**, which is the case the baseline review said the previous journal-key
change could not reach. Ordinary pane reuse and same-session resume are both
covered.

The wire names line up, which was worth checking rather than assuming: the JS
reads `seat.session`, and `SeatDescriptor::harness_session` carries
`#[serde(rename = "session")]` (`crates/core/src/model.rs:267`), flattened raw
into `SeatProjection` with no `rename_all` on the `/v1/seats` path. The
session-keyed fallback is live, not inert.

**Death is proven by the daemon, nominated by the client.** The JS comment at
`store.mjs:98` states the split and the code honours it — `nativeAttested` is a
shape test, not a liveness test. The daemon collects the witness in
`observe_dead_native_owners` (`crates/daemon/src/registration.rs:145-213`):
three disjoint qualifying shapes (`same_address_resume`, `stale_pane_owner`,
`explicit_same_native_prebind`), each gated on
`liveness.proc_start(previous.pid) != Some(previous.proc_start)`.

That comparison is the anti-steal brake, and it answers the question I put to
the PM after the P1-B ruling. "Dead" here means **the exact incarnation is
gone**, not "the pid is absent". A pane now hosting a *different live* Copilot
yields a different `proc_start` for a recycled pid, which correctly reads as
"the recorded incarnation ended" — the new occupant is never mistaken for the
predecessor, and the predecessor is never presumed alive because its pid
happens to be in use.

**A live owner is refused, terminally.** With no dead witness,
`check_native_roster:701-706` refuses `seat id belongs to a different process
incarnation`, and the runtime test asserts the client treats it as
non-retryable (`crates/daemon/tests/native_runtime_cold_resume.rs:55-61`:
`error.retryable === false`, "live-owner refusal is terminal, never steal").
That matches the terminal-vs-recoverable split recommended in the baseline
review.

**Observation is outside the exclusion window and revalidated at commit.** The
P2-D remedy holds: `observe_dead_native_owners` and `verify_native_host` run
before `register_inner` takes `registration_lock` at `:353`; the roster is then
**re-read under the lock** at `:354`, and every observed dead seat *and the
prebind* must still satisfy `same_native_owner` against the fresh row
(`:359-372`) or the whole registration is refused with `native owner changed
during death observation; retry registration`. `same_native_owner`
(`:638-647`) compares proc, pane, session, spawn, native flag, relay and
tombstone — not just presence. The `.expect("revalidated native owner")` at
`:557` is safe precisely because of that guard and because it indexes the same
`seats` vec.

**Retired identities are not recycled.** `store.mjs:124-125` re-mints a random
address when the derived id collides with a tombstoned row, so A → B → A never
regains the retired address; `native_sqlite_http_exact_prebind_...` and
`retired_or_prebind_copilot_cannot_be_relabelled_to_bypass_native_inbox`
(`native_tests.rs:2044-2133`) cover the roster side.

**Queued work is not stranded.** Retirement at `registration.rs:553-569`
explicitly skips `seat.id == descriptor.id`, so a same-address resume updates
its own row rather than tombstoning it — the jobs keyed `delivery:{seat}` stay
claimable under the unchanged address. The tombstone reason states the
invariant in the row itself.

**Valid new prebind outranks old native context**: `registration_target:624-627`
declines the spawn/pane fallback when a native claim carries `supersedes`, and
`prebind` selection (`registration.rs:156-172`) requires `proc.is_none()`, an
exact non-empty spawn match, an exact pane match, and either a matching or
absent harness session.

---

## Check 3 — ack bypass and journal survival

**Pass.** One control-flow shape is worth naming because it reads as a hole and
is not one.

`acknowledge_inbox` (`crates/daemon/src/delivery/mod.rs:829-874`) wraps its
attempt/recipient/target checks in `if
self.native_recipient(&recipient, identity).await?.is_some()`. Read alone that
looks like "a caller who fails the native identity test skips the guard and
acks anyway". It is not, because `native_recipient` (`:575-603`) is **total on
the Copilot branch**: a Copilot recipient yields either `Ok(Some)` or `Err` —
tombstoned or capability-withdrawn → `native-extension-unavailable`; identity
mismatch → `native incarnation mismatch`. `Ok(None)` is reachable only for a
non-Copilot or absent seat *with no identity supplied*, i.e. the legacy path.
So no native job can be acked with the guard skipped.

I flag it despite being correct: the guard's safety lives in a different
function's exhaustiveness, and a later edit adding an `Ok(None)` arm to the
Copilot branch would silently open an ack bypass with no local signal. A
`debug_assert` or an explicit `else` arm refusing Copilot recipients would make
the invariant local.

The refusal split I asked for after the baseline review **is done**:
`delivery/mod.rs:595` (seat absent, identity supplied) now emits
`native-extension-unavailable` — the retryable class the client re-registers
on — while `:598-600` keeps `native incarnation no longer belongs to a current
Copilot seat` as terminal for a seat that exists but is no longer Copilot.
`native_tests.rs:1102-1139` pins both.

The cross-language literal risk I raised is **closed by pinning rather than by
a machine-readable code**. `store.mjs:236-237` still matches an exact Rust
prose string, but `native_tests.rs:1116-1119` now asserts that exact string
Rust-side, and `:1142-1162` pins the `native-consumer-held:` framing. A reword
now fails the Rust suite instead of leaving both suites green and production
deaf. Weaker than a stable code, sufficient against the failure mode.

Journal survives incarnation change: `FileJournal.directory` is
`hash([registration.id, registration.harness_session])`
(`store.mjs:289-292`), and with the address now session-derived both components
are stable across a cold restart. No blind reinjection —
`native_runtime_cold_resume.rs:69` asserts `native.send` is never called on the
replay stage.

---

## Check 4 — completion correlation, sequencing, holds, bounded retries

**Pass, with one wording correction on "bounded".**

Sequencing: `consume` (`store.mjs:546-572`) awaits `waitForCompletion()` before
each claim, and `waitForCompletion` (`:597-614`) refuses to proceed when an
accepted duplicate lacks an observed native completion. The emitted grades are
honest about what they prove —
`observed-native-terminal-not-model-success` and
`native-event-not-pij-ack`.

Holds are visible and distinct: a `native-target` hold stops receiving and
returns with an operator action string (`:556-564`); a consent hold emits
`consent-held` and backs off (`:565-570`); neither acknowledges. Reconnect
episodes emit `reconnecting` once and `connection-ready` on recovery
(`:554-579`), so a long outage is one event pair rather than a flood.

The scoped transient retries are correctly scoped. `store.mjs:104` marks
"multiple candidate Pij addresses" retryable — the ambiguity genuinely resolves
when the daemon retires one — and `:115` marks the prebind-corroboration
failure retryable **only when `!prior`**, so a real identity mismatch stays
terminal. That is the narrow scoping agreed in place of retry-all, and it is
narrower than I would have written.

**Correction on the packet's word "bounded":** retries are bounded in *rate*,
not in *count* — exponential backoff from `INITIAL_RETRY_MS` 250 capped at
`MAX_RETRY_MS` 5000, in a `while (!signal.aborted)` loop with no attempt
ceiling. For a long-poll consumer that is the right design and I am not asking
for a cap; I am declining to certify a claim of bounded attempts that the code
does not make.

---

## Check 5 — fixture durability and the simulation/proof boundary

**Pass.**

The 135 golden fixture survived relocation **byte-identically**: blob
`e74035da7e2c99b02cee7ae7d18a74afa571f5d0` is the same object at
`ee3defa1:docs/plans/135-rs-boot-announce/assets/contracts/register-response.json`
and at `0de79322:crates/testkit/fixtures/register-response.json`. Verified by
object id, not by diff.

Both fixtures are manifest-indexed with sha256 and byte count
(`crates/testkit/fixtures/MANIFEST.toml:320-325` and `:328-332`), and resolution
goes through `pij_testkit::fixtures::read`, which resolves from
`CARGO_MANIFEST_DIR` (`crates/testkit/src/fixtures.rs`) rather than a
cwd-relative path string. `verify_manifest` re-hashes, so a fixture cannot be
edited into meaning something else while its recorded `answer` stays behind.
Plan archival can no longer break the suites.

The simulation/proof boundary is stated **in the artifacts themselves**, which
is the right place for it:

- `MANIFEST.toml:332` — "this fixture itself proves no real SDK or model
  behavior".
- `native_runtime_cold_resume.rs:1` — "Cross-language contract proof, not real
  Copilot/SDK/model acceptance."
- `native_runtime_cold_resume.rs:25-26` — names the single faked boundary
  (`native.send`) and lists what is production: chooser, HTTP client,
  registration readback, delivery/dedupe, filesystem journal.

What that test genuinely exercises: real `node` against real HTTP against real
SQLite, with **real** process liveness (`pij_harnesses::proc::ProcLiveness`,
hosts actually spawned and killed). What it does not: tmux is `FakeTmux`, so
pane observation is simulated, and no Copilot SDK or model behaviour is
touched at all.

---

## Finding C1 — ordinary registration silently withdraws native capability (new, P3)

The only defect this review found. Not a correctness hole in the native path;
a hole in what the *non*-native path is allowed to do to it.

`register_inner` sets `descriptor.native_extension_delivery = native`
unconditionally (`registration.rs:549`), where `native = handoff.is_some()`.
The comment above it is one-directional — "Ordinary registration cannot
transfer or revive native capability. Only this request's verified
process/session observation can grant it" — and the *grant* direction is
airtight. The **withdraw** direction is neither stated nor guarded: an ordinary
registration assigns `false`.

The guard at `:393-421` is meant to stop an ordinary claim disturbing a live
Copilot incarnation, but it refuses only on *change*. A byte-identical claim —
same harness, same proc, same pane, no supersedes, no relay, matching or absent
session — passes every disjunct and falls through to `:549`, which clears the
flag on a live, correctly-attested native seat.

**Reachable through the ordinary operator action.** `adopt` builds a plain
`Registration` and calls `register_with_harness_session`, never
`register_native` (`http/identity.rs:516-535` at pin). Its process identity
comes from `pane_harness_identity` → `harness_process_from_snapshot`
(`crates/tmux/src/lib.rs:1230-1255`), which walks pane descendants for
`harness_command` — and for Copilot that matcher accepts `copilot` or
`node …/@github/copilot/…` (`:1257-1281`), the *same* host shape
`NativeProcess::is_copilot_host` attests (`registration.rs:760-777`). So
`pij adopt --harness copilot` run in a live native Copilot pane resolves
exactly `owner.proc`, satisfies every disjunct of the guard, and disarms native
delivery.

That is the sharp edge: `adopt` is what an operator reaches for when a seat
looks wrong, so this fires precisely during attempted repair.

**Consequence is bounded, which is why this is P3 and not higher.** No fallback
and no loss: `extension_stream` keys on `recipient.harness`, not on the flag
(`delivery/mod.rs:322-327`), so a Copilot seat always routes to
`DeliveryRung::Observe` → queue and never to PTY. Messages queue with the
visible reason `native-extension-unavailable` (`:485-494`). The client's next
claim gets the retryable refusal, clears `registered`, re-registers natively
with the same tuple, and `check_native_roster` re-grants the flag. Recovery is
one reconnect episode, ≤5s backoff, self-healing, and `adopt` is one-shot so it
cannot loop.

**No test covers it.** `retired_or_prebind_copilot_cannot_be_relabelled_to_bypass_native_inbox`
(`native_tests.rs:2044-2133`) is the closest, and it registers
`harness: "omp"`, which trips the earlier harness-change refusal at `:377-383`.
The `harness: "copilot"` identical-claim case is untested in both directions.

**Minimal remedy** — preserve rather than refuse, so the stated invariant
becomes the implemented one: when the ordinary path matches a live native
incumbent and changes nothing, carry `native_extension_delivery` forward
instead of assigning `false`. This still grants nothing without verified
observation. The alternative — refusing ordinary registration outright against
a live native incarnation — also works but makes `adopt` on that pane an error
rather than a no-op, which is a product decision, not a review call. Either way
the case wants a test asserting the flag's value after an identical ordinary
re-registration.

---

## Evidence limits

Stated separately from source correctness, per the packet's last constraint.

- **Source correctness at this pin: good.** The five packet checks pass; one
  P3 defect (C1) with a bounded, self-healing consequence.
- **Release readiness: not established here, and not concealed.** Still open
  from the baseline review and unchanged by this pin: real manual witness,
  Pij-spawned witness, daemon-down witness, consent witness, real-provider
  (non-mock) witness.
- **Known-open work acknowledged, not reviewed**: the 65s long-poll false-outage
  correction; per-invocation simulated human consent in isolated smoke (native
  incoming reached the actual CLI; the outgoing tool awaited approval, so there
  is **no round-trip claim**); final full gates and real-provider acceptance.
- **Not reviewed at all**: renewal `runtime07a8f9af`, consent `consent5efd0ccc`,
  main `136/be778b9c`, and the lifecycle driver — none are in this pin.
- **Nothing was executed.** Every claim above is static, from committed content
  at `0de79322`. The 273-daemon-test and clippy receipts are the PM's; this
  review neither reproduces nor disputes them.
- **AC6** gate verdict remains as frozen pending Jordan's decision; nothing here
  changes it.

## Verdict

**Approve with one P3 finding (C1), scoped to `0de79322`.**

The cold-resume design is sound and the anti-steal brake is the right shape —
incarnation equality, not pid presence, with a terminal refusal for a live
owner. P1-B is closed at the address layer, where it belonged. The P2-D lock
narrowing holds under revalidation. The ack path has no bypass. The
cross-language literal risk is closed by Rust-side pinning. Fixtures are
durable and byte-identical, and the simulation boundary is declared in the
artifacts rather than in a review note.

C1 does not block composition: bounded, visible, self-healing, no fallback and
no message loss. It should not ship unfixed either, because the invariant
comment claims a one-directionality the code does not have and the trigger is
an operator repair action.

This approval covers **source correctness at this pin only**. It is not a
release verdict, and the delta review covering renewal and consent is still
owed.
