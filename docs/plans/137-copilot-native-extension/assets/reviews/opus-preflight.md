# Preflight contract risk notes — plan 137 (Opus reviewer, seat pij-static-rhinoceros)

2026-09-05. Read-only preflight. **No code review performed** — awaiting composed SHA per
reviewer packet i1/mission. No plan, guide, contract or source edits made.

Inputs read: `assets/packets/reviewer.dd.json`, `plan.dd.json`, `impl-guide.dd.json`,
`assets/contracts/native-extension.json` (v2), `assets/backpressure.dd.json`,
`assets/tasks/phase-1/tasks.dd.json`, `assets/inputs/pm-ack-rulings.md`,
`assets/inputs/prime-constraints-2026-09-05.md`, `assets/inputs/research-evidence.json`.

Every risk below is grounded in **current worktree source**, read at
`/Users/jordanknight/pi-hacking/fs3-copilot-native-extension`, not in packet prose. These are
*contract* risks — places where the frozen contract underdetermines behaviour, or where the
contract's stated defence has no enforcement point in the code it will land on. They are raised
now because each one can be answered by PM with a contract sentence and costs a rework round if
answered after three coders have shipped.

Severity is my judgement of consequence if the contract stays as written, not a defect claim
against any coder — no unit code exists yet.

---

## P1 — v2 incarnation tuple has two unguarded side doors: `/v1/shim/inbox` and `/v1/shim/inbox/ack`

**Evidence.** Contract v2 pins `native_session`/`pid`/`proc_start` on exactly two paths:
`claim.path` = `GET /v1/inbox?...` and `ack.path` = `POST /v1/inbox/ack`. But the daemon serves
*four* routes that reach the same two service methods:

- `crates/daemon/src/http/mod.rs:286-287` — `/v1/inbox` → `inbox`, `/v1/inbox/ack` → `ack_inbox`
- `crates/daemon/src/http/mod.rs:305-306` — `/v1/shim/inbox` → `shim::shim_inbox`,
  `/v1/shim/inbox/ack` → `shim::shim_inbox_ack`
- `crates/daemon/src/http/shim.rs:386` — `shim_inbox` calls `delivery.claim_inbox(&reader, false)`
- `crates/daemon/src/http/shim.rs:430-435` — `shim_inbox_ack` calls
  `delivery.acknowledge_inbox(request.job_id)`

Both shim handlers reach `DeliveryService::claim_inbox` / `acknowledge_inbox`
(`crates/daemon/src/delivery/mod.rs:462`, `:556`) — the identical methods the two contracted
endpoints use.

**Risk.** If the daemon unit implements the v2 tuple check *in the HTTP handler for the two named
paths* (the literal reading of the contract), a stale consumer — or any caller speaking the shim's
`{argv, caller}` shape — claims and retires the replacement session's Copilot job with **no native
tuple at all**. The stale-consumer defence the whole of PM ACK/Daemon-1 exists to provide would be
bypassable through a route that is already shipped and already tested.

**Smallest correction (contract, not code).** State the enforcement *layer*, not the paths:
Copilot native claim/ack admission is enforced inside `DeliveryService::claim_inbox` /
`acknowledge_inbox`, so every current and future inbox route inherits it; the two contracted paths
are where the tuple is *carried*, not where it is *checked*. If PM instead intends the shim pair to
refuse Copilot recipients outright, say that explicitly — either is defensible, silence is not.

---

## P1 — "ack verifies job recipient **before** mutation" is not expressible against the current port

**Evidence.**

- `crates/daemon/src/delivery/mod.rs:556-560` — `acknowledge_inbox(job_id)` is a single call to
  `queue.ack_delivery(job_id, DeliveryOrigin::ReaderRead)`. The recipient is a *return value*
  (`DeliveryAck.recipient`), consumed afterwards at `crates/daemon/src/http/mod.rs:1179`.
- `crates/daemon/src/http/mod.rs:1144-1157` — `ack_inbox` deserialises `InboxAckRequest` and then
  **never reads `request.seat`**; only `request.job_id` is used.
- `crates/daemon/src/http/types.rs:177-185` — `InboxAckRequest { seat, job_id }`; the doc comment
  concedes bearer auth attests to a machine, not the seat.
- `crates/daemon/src/http/shim.rs:413-417` states the weakness in as many words: *"it does not
  prove this job was claimed by that seat, because the ack path has no queue read to check it
  against… but it is not a proof either, and calling it one would be the kind of claim this plan
  exists to stop making."*

**Risk.** PM ACK/Daemon-1 says "ack also verifies job recipient"; contract `ack.incarnation_rule`
says "verifies … **before** terminal ack". With today's port the recipient is only knowable *after*
the mutation commits. A coder under fence pressure will implement the cheap post-hoc comparison
(`acknowledged.recipient != request.seat` → error after the row already moved), which satisfies the
sentence and not the requirement — and it would arrive with a green receipt.

**Fence collision.** The honest fix needs either a pre-ack queue read or a recipient-scoped
`ack_delivery`, i.e. a change to `crates/core/src/ports.rs`. The daemon fence permits ports.rs
*"only if concrete persisted capability requires"* (impl-guide `units.daemon.paths`) — which does
**not** cover ack recipient verification. PM ruling needed, or the coder must choose between
exceeding the fence and shipping a post-hoc check.

---

## P1 — a consent-held Copilot claim has no wake source, and the contract does not say what a hold looks like on the wire

**Evidence.**

- `crates/daemon/src/delivery/mod.rs:465-468` — the `wait=true` path subscribes **only** to
  `OUTCOME_EVENT_KIND` for that seat.
- `crates/daemon/src/delivery/mod.rs:470-525` — the loop returns a claim, or (no claim, `wait`)
  blocks on `subscription.next()`. Nothing else wakes it.
- impl-guide §4 requires held claims to *"wake when permission changes or on bounded retry
  cadence"*. No consent/permission transition publishes an outcome event for the recipient seat, so
  the existing wake cannot deliver that.
- Contract `claim.bound` says *"0 or 1 claims; client handles 0 by bounded wait/backoff"* — implying
  a hold surfaces as **0 claims**. But with `wait=true` the daemon does not *return* 0; it blocks.

**Risk.** This is exactly the plan's own named risk (`plan.dd.json` verification bullet: *"waits
must wake on safe readiness transitions, not hang until another unrelated message"*), and the
contract does not resolve it. Three plausible implementations exist — daemon returns empty promptly
on hold; daemon holds the long-poll open and adds a consent wake; extension never uses `wait=true`
for pane-backed seats — and the daemon and extension units are being built in isolation from the
same sentence. Divergence here does not fail a unit test in either tree; it appears at composition
as an intermittent stall, which is the most expensive possible discovery point. It also directly
threatens ac-0006's *"subsequently delivers once after the existing consent policy permits it"*: if
the hold parks a long-poll with no consent wake, the admitted case delivers when the *next
unrelated message* arrives, and a smoke run that sends one more nonce would show it as a pass.

**Smallest correction.** One contract sentence fixing the wire shape of a consent hold (I'd
recommend: hold returns `0` claims with a stable diagnostic and the message stays queued; client
backs off; no consent wake needed in the daemon), plus a note that `wait=true` must not be used to
park a pane-backed Copilot claim across a consent verdict.

---

## P2 — the v2 tuple can be silently dropped by an older daemon; the extension has no way to know it was checked

**Evidence.**

- `crates/daemon/src/http/mod.rs:1104-1111` — `struct InboxQuery { seat, wait, peek }`, plain
  `#[derive(Deserialize)]`, **no `deny_unknown_fields`**. Unknown query params are discarded.
- The codebase knows this and treats it as load-bearing elsewhere: `shim.rs:31-35` and `:167-171`
  keep `deny_unknown_fields` on the shim bodies precisely so *"compatibility must never let a
  handler accept the request while ignoring caller evidence"* — the shim is fail-loud, `/v1/inbox`
  is fail-silent.

**Risk.** Skew is the *normal* state for this feature, not the exception: after ac-0001 the
extension lives in the user's real `~/.copilot` (global, survives every worktree and branch), while
the daemon is a separately-built binary. Extension-newer-than-daemon → the incarnation tuple is
accepted, discarded, and the claim is served, with every surface reporting success. The contract's
`incarnation_rule` ("missing/mismatched refuses explicitly; no fallback") is only true of the *new*
daemon; the failure it is defending against is the one where the new daemon isn't there.

**Smallest correction.** Make validation *observable to the client*: the claim response echoes the
validated identity (or a `native_delivery` protocol marker), and the extension refuses to inject
when it is absent. Capability readback at registration (impl-guide extension interface) proves the
register route understood v2; it does **not** prove the claim route validated this claim.

---

## P2 — the ":249 one-line baton" removes Copilot's only existing consent enforcement point

**Evidence.** `crates/daemon/src/delivery/mod.rs:249-288`:

```
let extension_stream = matches!(recipient.harness, Harness::Omp | Harness::Pi);
let (rung, interaction_reason, draft_sha) = if extension_stream {
    (DeliveryRung::Observe, None, None)
} else {
    …
    let verdict = self.interaction.fresh_injection_verdict(pane).await?;   // :262
```

The `extension_stream` branch **skips `fresh_injection_verdict` entirely**. Omp/Pi are exempt by
design (`:245-248`); Copilot pane-backed seats are not — ac-0006 and the plan invariant
("Copilot human draft/typing is a CONSENT brake") require the gate.

**Risk.** Prime constraints call adding Copilot at `:249` *"a compose-time baton, not a unit"* —
one line. Taken literally at composition, that line **moves Copilot from gated to ungated** and the
compensating gate lives in the daemon unit's claim-admission work, which is a different unit's
different file. If the daemon unit's claim gate slips or lands partial, the composed tree is green
(extension + installer prove their own ACs) and pane-backed Copilot has silently lost the consent
brake. This is a policy check, not a brake: removing it makes delivery do something *different*
(inject during human composition), not merely *more conservative*.

**Smallest correction.** Contract/composition note: the `:249` baton and the claim-side consent
admission are **one atomic change**; composition must not accept the baton without a daemon test
that fails when the claim-side `fresh_injection_verdict` call is deleted (mutation-style, named in
bp-0006's proof).

---

## P2 — installer's `copilot-native-test` sensor goes red for everyone until the extension unit composes

**Evidence.** impl-guide `units.installation.interface`: *"Add just copilot-native-test for
`node --test .copilot/extensions/pij/*.test.mjs`"* … *"add copilot-native-test to harness
checks/self-check so native JS tests are not invisible"* … *"Do not change existing gate failure
policy."* And `units.installation.note`: *"Source artifacts may be absent before composition;
fixture tests must not create shipping placeholders."*

**Risk.** Those three sentences are jointly unsatisfiable in the installer's own tree. Before
composition `.copilot/extensions/pij/*.test.mjs` does not exist; `node --test` on a glob that
matches nothing exits non-zero; the sensor is wired into `harness checks`; and the installer may
neither create a stub nor soften gate failure policy. Result: the installer unit cannot run its own
`harness checks` green, and per baseline discipline (tk-0001 "preserve existing failures as
baseline") it must report that red — which then competes for attention with the genuinely-known-open
`file-watch-notify` red (reviewer packet i4).

**Smallest correction.** PM says which: (a) the sensor is registered at composition, not by the
installer unit; or (b) the recipe skips with a named, non-zero-exit-free reason when no test files
are present, and PM records that this is a deliberate carve-out from "do not change gate failure
policy". I'd recommend (b) with an explicit `no native test files present — skipped` line, because
(a) leaves the sensor unproven until the busiest moment.

---

## P3 — no AC covers the installed extension's blast radius on unrelated real Copilot sessions

**Evidence.** ac-0001 installs into the canonical `${COPILOT_HOME:-$HOME/.copilot}`
(contract `installed_directory`) and enables `experimental: true` globally. The contract's failure
vocabulary covers transport ("capability missing/refused never activates alternate transport",
`error`) but **no AC and no contract line requires the host Copilot session to remain fully usable
when the daemon is down, the key is stale, or the extension throws at join.**

Once installed, this extension auto-loads into *every* Copilot the user starts on this machine —
including Jordan's real, unrelated sessions. `assets/inputs/manual-extension-evidence.json` is cited
for auto-load, and research-evidence's PoC ran with `--no-remote --no-auto-update
--disable-builtin-mcps` in an isolated home; neither exercises the degraded-daemon case in a real
home.

**Risk.** A join-time throw, an unbounded reconnect loop, or per-retry diagnostics printed into the
transcript degrades every Copilot session on the machine, with no AC that would catch it and no
smoke scenario that covers "daemon absent". Note the daemon default is the **live fleet**
(`daemon_addr` `127.0.0.1:7461`, `daemon_state_dir` `$HOME/.pij-rs`) — the installed artifact's
default behaviour is precisely to contact production.

**Smallest correction.** One acceptance sentence: with no daemon reachable, a new Copilot session
starts normally, the extension degrades quietly to a single actionable diagnostic, and no retry
loop is visible in the transcript. Cheap to prove (isolated home, no daemon), and it is the only
failure mode that touches the user's day-to-day tool.

---

## P3 — feasibility evidence is weaker than the plan's own summary implies, in one specific respect

**Evidence.** `assets/inputs/research-evidence.json`:

- `reply_receipt.outcome` = `{ outcome: "queued", reason: "unreachable" }` — the PoC's *outgoing*
  reply to a Copilot seat was **not** natively delivered; it queued as unreachable.
- Both seats `pane: null`; `not_used` lists `tmux pane`, `tmux send-keys`.
- `unproven[]` already names pane-backed routing, real model, consent, crash-between-send-and-ack,
  reconnect/rollover, and spawn integration.

This is not a contradiction — `plan.dd.json` states the ceiling honestly ("Both seats were paneless;
a deterministic localhost provider supplied responses"). Flagging it only so it is not later cited
as bidirectional proof: the round trip that succeeded was *inbound* injection plus ack; the outbound
leg's receipt in the same artifact is `queued/unreachable`. ac-0009's "bidirectional unique-message
delivery" therefore has **no** prior art at all, in either pane mode.

---

## Non-findings (checked, no action)

- **Unit fences are disjoint.** daemon `crates/**` + two named `.pi` guards; extension
  `.copilot/extensions/pij/*`; installation `harness/scripts`, `justfile`, `README.md`,
  `docs/how/`, `vitest.config.ts`, `.harness/extensions/checks/`. No shared file except the
  `:249` match and `Cargo.lock`, both PM-owned at composition. Confirmed against
  impl-guide `units[].paths`.
- **`proc_start` format is consistent** between contract `request_example` (`20260905120000`) and
  the observed descriptors in research-evidence (`20260905085415`).
- **Known-open items not duplicated**: baseline `file-watch-notify` smoke red and the npm
  min-release-age/`--before` git-dependency conflict are carried as baseline per reviewer packet i4,
  not restated as findings above.

---

## Status

Preflight only. Code review pending composed SHA from PM `pij-grim-gurgeh`. No `.the-flow-state.json`,
plan, guide, contract, backpressure or source file was written. Only file written by this seat:
this note and `assets/reviews/canary.txt`.

---

# Adjudication delta (2026-09-05, after PM rulings)

PM `pij-grim-gurgeh` adjudicated this note in
`assets/inputs/pm-opus-preflight-rulings.md` (contract v3), with a prior ruling in
`assets/inputs/pm-queue-lookup-ruling.md`. Recorded here so the review record carries the
corrections, not just the original claims. **I verified both refutations against source and
evidence before conceding; both are correct and I withdraw the claims.**

## Withdrawn — consent is a BRAKE, not a policy (my P2 framing was wrong)

I labelled the `fresh_injection_verdict` skip at `crates/daemon/src/delivery/mod.rs:249-262`
a *policy* on the grounds that removing it changes *when* injection happens. That reverses the
repo's own directional test (AGENTS.md): the question is what **removing** the check does to the
*volume* of the operation. Remove the human-input veto and the daemon injects **the same set or
more** — the gate can only ever spare or defer an injection, never cause one. One-directional
safety interlock. Brake. Conceded without reservation.

The label does not change what must be proven: mandatory enforcement stands, and I will still
require a test that **fails if the claim-side gate is deleted** (upheld in PM's clarification).

## Withdrawn — the paneless round trip WAS bidirectional

I read `research-evidence.json` `reply_receipt.outcome = queued/unreachable` as the outbound leg's
final outcome. It is the **enqueue receipt at send time** (`next_retry_at: 0`), not a terminal
state. Verified in the same artifact:

- `native_messages.driver[0]` — `user.message` `ae4057c8…`, content
  `[pij from pij-poc-target-a5608dea]\nACK PIJ_DAEMON_PROBE_C3E82A` → the **return** nonce arrived
  natively at the driver.
- `native_messages.target[0]` — the outbound prompt arrived natively at the target.
- `acknowledgements.driver[0]` — jobId `3`, `inbox-acknowledged`,
  grade `harness-accepted-not-model-complete`; `acknowledgements.target[0]` — jobId `2`, same grade.

Both native injections have event receipts. My P3 claim that ac-0009 has "no prior art at all" is
withdrawn — it has paneless prior art. What the artifact still does **not** establish is unchanged
and remains on the mandatory-witness list: pane-backed routing, native tool-originated reply, real
model behaviour (`unproven[0..2]`, both seats `pane: null`, deterministic local provider).

## Withdrawn — installer sensor red is a composition dependency, not a defect

My P2 asked PM to choose between registering the sensor at composition or a named skip. PM's answer
is neither: the packet **forbids project-wide gates during fan-out**, so the installer runs scoped
tests and deliberately leaves the integrated recipe red until source composes; PM runs the full gate
on the composed tree. No skip, no stub, no gate weakening. That is coherent and closes the item —
at review I check only that the installer created **no shipping placeholder** to make its own gate
green.

## Upheld — now review obligations, with the shape PM pinned

1. **Side doors** — enforcement lives in `DeliveryService` (shared by every route), and the
   uninstrumented shim **refuses Copilot** rather than validating it. Check `shim_inbox`
   (`http/shim.rs:386`) and `shim_inbox_ack` (`:430-435`) refuse explicitly, and that no
   other-harness ack semantics moved.
2. **Pre-ack authority** — `Queue::claimed_delivery(job_id) -> Result<Option<Job>>` authorized
   (`crates/core/src/ports.rs`, SqliteQueue + FakeQueue + delegating test wrappers), read-only,
   running-delivery-only, `None` for unknown/pending/terminal, no bulk scans. Verify the real job
   recipient **and** current native tuple **before** `ack_delivery`; a post-hoc comparison against
   `DeliveryAck.recipient` (`delivery/mod.rs:556-560`, `http/mod.rs:1179`) is now an explicit fail.
3. **Held wake** — a pane consent hold returns `data: []` **promptly even with `wait=true`**, meta
   `native-consumer-held:<reason>`, message stays queued, client backs off. Resolves the missing
   wake source (`delivery/mod.rs:465-468` subscribes only to `OUTCOME_EVENT_KIND`). Proof bar PM
   set, and the one I will hold to: **release delivers without sending another nonce** — the exact
   false pass I flagged.
4. **Skew proof** — the claim row echoes `native_consumer:{native_session,pid,proc_start}` as
   actually validated; the extension refuses to inject or ack when the echo is absent or mismatched.
   Both halves required, since `InboxQuery` (`http/mod.rs:1104-1111`) still has no
   `deny_unknown_fields`.
5. **Daemon-down** — new acceptance criterion: ordinary Copilot usable with daemon/key absent, one
   actionable diagnostic per failure episode, bounded abortable reconnect, no spam, no fallback,
   witnessed on a real isolated CLI.

## Structural change that dissolves my atomicity concern

Per `pm-queue-lookup-ruling.md`, plan 136 no longer edits `crates/daemon/src/delivery/mod.rs`; **137
owns the extension-stream match outright and there is no compose baton for that file**. My P2
cross-unit hazard — the `:249` match landing without the compensating claim gate — cannot occur:
ownership and gate are the same unit and commit. Residual check at review is now local, not
ordering: the final tests must fail if the claim gate is removed.

## New watch items created by these rulings

These are consequences of the v3 shape, raised now so they are not discovered as a rework round.
They are not defect claims; no unit code has been read.

- **Bypass by omission.** If validation is keyed on *whether the request carried a tuple*, a stale
  consumer bypasses it by simply **not sending one** and falling into legacy ack semantics. The
  trigger must be the **recipient's attested capability** from the registry descriptor — not
  caller-supplied and not caller-omittable. PM's "stale/native-as-other-harness bypass" test must
  cover the omission case, not only the mismatch case.
- **`claimed_delivery` → `ack_delivery` is a read-then-act pair.** `claim_inbox`'s own doc
  (`delivery/mod.rs:455-458`) says claim expiry retries a delivery whose client died, and
  `Queue::note_delivered` (`ports.rs:160-177`) exists precisely because "a separate read and write
  reintroduce exactly the check-then-act race the ledger exists to remove". So the window is real:
  a job verified by the read can be expired and re-claimed by the replacement consumer before the
  stale consumer's `ack_delivery` commits. Either `ack_delivery` carries the expected recipient into
  the same transaction, or the pair must be shown race-free. PM already named "read-before-ack
  races" as a review target; recording the mechanism so the check is concrete.
- **Prompt-empty vs held must be distinguishable at the wire.** Both return `data: []`. If the
  extension cannot tell "nothing for you" from "held on consent", bounded backoff degenerates into
  the same silent stall by a different route. The `meta native-consumer-held:<reason>` marker is
  what carries this; verify the extension actually branches on it.

## Status (updated)

Still preflight. **No code review performed** — holding for the composed SHA. Findings above are
carried by path and will be re-checked against real code, including the ones PM upheld. Files
written by this seat remain exactly two: this note and `assets/reviews/canary.txt`.
