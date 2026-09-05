# Code review — plan 137, composed `6ff2f981`

Reviewer: Opus seat `pij-static-rhinoceros`. Diff base `46c9314c..6ff2f981`, 100 files,
+12799/-615. Static/contract review only — no Rust or workspace gate run (PM owns serialized
passes). Worktree `/Users/jordanknight/pi-hacking/fs3-copilot-native-extension`.

The daemon-side attestation work is genuinely good: the ownership invariant is keyed on the
registry, not on caller-supplied fields, so the bypass-by-omission hole I named at preflight is
actually closed. Two findings below are not visible from the tests that exist, and both are
reachable by ordinary supported user actions.

---

## P1-A — A stale native-target job permanently blocks every later message to the seat

**Location** `crates/daemon/src/delivery/mod.rs:697-707` (claim-side mismatch handling),
`crates/store/src/queue.rs:253-259` (claim selection), `crates/store/src/queue.rs:373-390` (retry).

**Mechanism.** `delivery_job` stamps `native_target_session` from the recipient's
`harness_session` at enqueue. On claim, a session mismatch does:

```rust
self.queue.retry(job_id, Duration::ZERO).await?;
return Ok(NativeInboxPage { claims: Vec::new(), held_reason: Some(reason) });
```

`retry` sets `state='pending', not_before = unixepoch() + 0, attempt = attempt + 1`. The claim
query is `... AND not_before <= unixepoch() ... ORDER BY id LIMIT 1`. There is no attempt cap, no
dead-letter, and no skip.

**Consequence.** Sequence entirely inside the supported lifecycle:

1. Seat S on native session `A`; message M1 enqueued, stamped `A`.
2. User starts a new Copilot session — the path the rulings explicitly support (checked explicit
   supersedes). Seat now on session `B`.
3. Peer sends M2. It is enqueued and stamped `B`, so M2 is perfectly deliverable.
4. Every claim selects M1 first (lowest id, immediately eligible), mismatches, retries at zero
   delay, returns held. **M2 is never reached. Nor is M3, or anything after it.**

The seat is permanently deaf on inbound from that moment, `attempt` grows without bound, and each
consumer poll costs a write transaction. Nothing expires the blocker.

**Why the suite does not show it.** `native_tests.rs:439` —
`queued_native_target_holds_different_session_but_allows_same_session_restart` — asserts the hold,
asserts the row returned to pending, asserts the same job is still at the head (`:490-499`), then
jumps straight to resuming session `A`. It never enqueues a second message for session `B` and
never asserts that one arrives. The assertion that is missing is exactly the failure.

**The intent is right, the mechanism is wrong.** Refusing to hand old-session mail to a new session
is correct and must stay. Zero-delay retry of a head-of-line row is the wrong way to express it.
Any of these preserves the invariant: skip the mismatched row and claim the next eligible one; or
terminate the stale row with an explicit outcome and a visible receipt; or drain/re-stamp at the
supersede boundary. The last is the only one that also tells the sender.

**Accept-test to add:** after a session rollover, a message sent to the new session is claimed and
acked while the stale row is still queued.

---

## P1-B — The duplicate barrier is keyed so that it cannot survive the crash it exists for

**Location** `.copilot/extensions/pij/store.mjs:219-235`.

```js
/** Each exclusive intent file is also an inter-process duplicate barrier. Nothing is evicted. */
...
hash(JSON.stringify([registration.id, registration.harness_session,
                     registration.pid, registration.proc_start]))
```

The journal directory is namespaced by **pid and proc_start**, so every process incarnation gets a
fresh, empty journal. The comment claims an inter-process barrier; the key makes it strictly
intra-process.

**Consequence.** The daemon deliberately re-delivers on lease expiry — its own words at
`crates/store/src/queue.rs:226-236`: *"The residual window is a duplicate read if the first client
read and died before acking — deliberately safer than losing the message."* The consumer journal is
the designated compensating control. So:

1. Incarnation A claims M, `journal.begin`, `native.send` succeeds, `journal.accept` written.
2. A crashes before `POST /v1/inbox/ack`.
3. Lease expires; job returns to pending.
4. Same native session reconnects in a **new process** — explicitly permitted, proven by
   `native_tests.rs:501-516` and `native_reconnect_retains_address_and_explicit_new_session_...`.
5. B claims M, `journal.load` looks in a *different directory*, finds nothing, and
   **injects M into the same native session a second time.**

That is packet i2's "crash after native accept before durable mapping/ack" landing as a visible
duplicate user message. The durable mapping is written correctly — fsync on the handle, atomic
rename, fsync on the directory — and then filed where the next incarnation will not look.

**Fix.** Key the directory on `id` + `harness_session` only. Keep `pid`/`proc_start` inside the
record for diagnostics, and compare them on load if a staleness signal is wanted.

---

## P2-C — Consumer discards `envelope.meta`, so every hold is indistinguishable from an empty inbox

**Location** `.copilot/extensions/pij/store.mjs:182` (`return envelope.data;`) vs
`crates/daemon/src/http/mod.rs:1146-1150`, which sets `meta = native-consumer-held:<reason>`.

You found this independently; confirming against source and adding what makes it worse than a
missing diagnostic. `consume()` branches only on `claims.length === 0` and backs off. The daemon
emits a correct, actionable reason for all three hold classes — `human-consent` /
`semantic-hold`, `sensor-unavailable:<err>`, `native-target-session:<sess>` — and the client
throws all of them away.

Compounded with P1-A this is the whole failure: the seat is permanently deaf, the daemon knows
exactly why and says so on every response, and neither the user, the model, nor the operator
ever sees it. The `failureEpisode` diagnostic path covers transport errors only; holds are not
failures, so they produce no report at all.

Branch on the marker: report `native-target-session` once per episode as an actionable event
(it needs a human decision), and treat consent holds as ordinary quiet backoff.

---

## P2-D — One global mutex now serializes registration, claim and ack across all harnesses, with blocking OS and tmux work inside it

**Location** `crates/daemon/src/http/mod.rs:248-252` (`with_native_lock` replaces the registration
lock with the delivery lock), `crates/daemon/src/registration.rs` (`_guard` taken *before* the 2s
`tokio::time::timeout` wrapping `verify_native_host`), `crates/daemon/src/delivery/mod.rs:672`
(held across the loop body) and `:776` (`acknowledge_inbox`).

The correctness rationale is sound and I am not asking you to drop it — `shared_native_lock_prevents_concurrent_process_takeover` is a real invariant, and holding one lock across
`claimed_delivery` → `ack_delivery` is what closes the read-then-act race I raised at preflight.
The objection is **span**, not existence:

- `claim_inbox_inner` takes the lock on every iteration, for **every** harness (the legacy
  `claim_inbox` routes through the same inner), and holds it across
  `interaction.fresh_injection_verdict(pane)` at `:614` — a tmux round trip.
- `register_native_with_observer` holds it for up to 2 seconds, across up to 32 ancestry process
  observations plus two `tmux pane_process` calls.
- Native consumers re-enter it roughly twice a second each (the 500 ms select tick at
  `delivery/mod.rs:~730`), and again on every 65 s client timeout re-registration.

So one Copilot registration can stall every other seat's inbox ack machine-wide for up to two
seconds, and steady-state native polling puts tmux syscalls on a global critical section. Narrow
the lock to the registry-mutation window, or key it per seat; the takeover invariant only needs
mutual exclusion on the same seat.

---

## P2-E — `just install` now hard-requires the Copilot CLI

**Location** `justfile:69` (`just copilot-native-doctor` appended to the final step of `install`),
`justfile:114-117` (`copilot --version`).

AGENTS.md declares `just install` the single-command bootstrap for a fresh clone or new machine.
`copilot --version` exits 127 where the Copilot CLI is absent, and `just` fails the recipe, so
bootstrap now fails on any machine that does not have Copilot installed. Make the doctor advisory
inside `install` (report and continue), or gate it on the binary being present. Keep
`just copilot-native-doctor` hard-failing when invoked directly — that is its job.

---

## P2-F — The control guard refuses non-Copilot targets, not just Copilot ones

**Location** `.pi/extensions/pij/cli.ts`, `copilotControlRefusalForInvocation`, final
`return \`Cannot verify the harness for ${subject}...\``.

When neither `FsRegistry` nor the daemon can identify the target, the guard refuses — for any
harness. `compact-self` always sets `command = "compact"`, which is in the unsupported set, so an
OMP or Pi seat that is not in the legacy registry cannot self-compact while the rs daemon is
unreachable. Previously that path proceeded to send-keys.

Directionally this is a **brake** — removing the check makes the CLI do more (type into a pane) —
so it is safe by construction and I am not asking for it to be removed. But the prime constraint
scoped this fence exception to *Copilot-only* guards, and daemon-down is a first-class scenario in
this very plan's acceptance list. Either narrow the unverifiable case to "refuse only if the
target could be Copilot", or record the widening explicitly as an accepted scope change.

---

## P3 — smaller items

- **`~/.copilot/settings.json` is rewritten without fsync.** `harness/scripts/link-global.ts`,
  `manageCopilotExtension`: `writeFileSync(temporary, ...)` then `renameSync`, with no
  `fsync` of the file or the directory. The JS journal in this same change does both correctly.
  A crash mid-install can leave the user's global Copilot settings truncated — a strictly
  higher-stakes file than the journal.
- **Installer success is reported as a no-op.** `link-global.ts:453` does
  `skipped += manageCopilotExtension(options)` but never increments `changed`, so a run whose only
  effect was linking the Copilot extension prints `everything already linked`. That is the shape of
  message that convinces an operator an install did not happen.
- **A non-retryable refusal permanently stops the receive loop.** `store.mjs` `consume()`:
  `if (!error.retryable) throw error` exits the loop, and only the retryable branch resets
  `this.registered = false`. `refused()` is HTTP 400 (`http/mod.rs:1943`) and the client treats
  400 as non-retryable (`store.mjs:180`). So `native-extension-unavailable` — recoverable by
  simply re-registering — halts receiving for the session with a single `receive-held` line.
  Genuine ambiguity should hold; a refusal that re-registration would clear should re-register
  under the existing bounded backoff.
- **Pre-existing queued control rows become unackable holds.** `delivery/mod.rs:695-698` returns
  an error without acking when a native claim carries `command`. New sends are refused at accept
  (`:268-284`) and at the HTTP boundary, so this only bites rows enqueued before the upgrade —
  but such a row head-of-line-blocks the seat by the same mechanism as P1-A.

---

## Verified good — no action

- **Bypass-by-omission is closed.** `acknowledge_inbox` (`delivery/mod.rs:762-790`) resolves the
  recipient from `job.serial_key` and gates on `native_recipient`, which keys on the registry's
  harness. An empty tuple against a Copilot job errors rather than falling through to legacy
  semantics. This is the registry-attested trigger I asked for.
- **Side doors are closed.** `shim_inbox` and `shim_inbox_ack` (`shim.rs:388`, `:422-440`) route
  through the same `DeliveryService` with a default identity, so both refuse Copilot work; the
  honest `KNOWN RESIDUAL` comment was replaced with an accurate one rather than deleted quietly.
- **Consent is enforced twice** — before `queue.claim` and again after, with `retry(ZERO)` on the
  second — and `DeliveryDeferralReason::Unrecognized` cannot decay into permission
  (`delivery/mod.rs:611-625`). Hold returns promptly under `wait=true`, proven at
  `delivery/mod.rs` `native_claim_consent_holds_then_admits_without_touching_composer`.
- **No tmux path for Copilot arrival.** `extension_stream` short-circuits rung selection before the
  pane-oriented selector; the test asserts an empty tmux call list.
- **Migration is safe.** `ALTER TABLE seats DROP COLUMN rpc_port_intent` against 0009's inline
  column `CHECK` — I reproduced this on SQLite 3.51 rather than reasoning about it; the inline
  constraint is removed with the column definition and the drop succeeds. The new
  `native_extension_delivery` CHECK is consistent with all three remaining `UPDATE seats`
  statements.
- **`min_connections(0)` + single-connection migration** (`migrate.rs:55-130`) is a real fix for a
  genuine sqlx/SQLite hazard, correctly explained in the comment.

---

## Live evidence still missing — not assumed

Naming these explicitly per the packet; none is satisfied by anything in this tree.

1. **No real-run witness at all.** Smoke 01 is red (PM `pm-native-local-01.json`), failing before
   any daemon interaction on a folder-trust prompt. Nothing here has been exercised against a real
   Copilot process.
2. **No pane-backed proof.** `research-evidence.json` remains two paneless seats on a deterministic
   local provider. Every consent-gate path in P2-D and the hold semantics in P2-C are unwitnessed
   on a real pane.
3. **No real-model proof.** `unproven[0..2]` stands.
4. **`harness checks` does not cover the shipping path.** The new `copilot-native` sensor runs
   `just copilot-native-test` (node:test contracts) only; `copilot-native-smoke` is deliberately
   not registered. A green `harness checks` currently proves unit contracts, not delivery.
5. **Corpus manifest hashes** for the two changed CLI golden envelopes are not yet updated.
6. **Daemon-down, crash-before-ack, and session-rollover** are proven only by fakes. P1-A and P1-B
   both live precisely in that unwitnessed band, which is why I would not treat the green unit
   count as coverage of them.

## Verdict

**Changes requested.** P1-A and P1-B are correctness defects on supported user paths, each
reachable without any failure of the environment, and neither is covered by the existing suite.
P2-C is confirmed and is what makes P1-A silent. The attestation core is sound and I would not ask
for rework there.

No code review claim in this document rests on a run; all of it is source-derived and cited by
path and line. The evidence list above stays open until you deliver receipts.

> **Superseded in part.** P1-A above is withdrawn — see the PM-adjudication addendum. P2-C and the
> installer items are closed by the targeted re-review addendum. P1-B stands. The original text is
> left intact rather than rewritten so the corrections stay auditable.

**Toolchain evidence.** This review made and makes no claim about the Rust toolchain: it contains
no build, no test run, and no version assertion. The observed environment is rustc/cargo 1.95.0
(Homebrew) with clippy 0.1.98; `rust-toolchain.toml` names 1.98.0 but that pin is **not enforced**,
because rustup is absent. Nothing here should be read as saying the observed 1.95.0 is the pinned
toolchain. `--locked` in any receipt refers to the dependency lock only, never to a compiler
version. No toolchain was installed or updated for this review.

---

## Addendum — PM adjudication (`assets/inputs/pm-code-review-rulings.md`)

**P1-A is withdrawn as written. My routing premise was wrong and PM's correction is verified.**

`.copilot/extensions/pij/store.mjs:95-99`: `replacing` is true whenever the prior seat carries a
non-empty session that differs from the current one, and the id is then re-derived as
`pij-copilot-<hash([sessionId, pid, proc_start])>` with `supersedes: prior.id`. A session rollover
therefore produces a **new seat id**, not a re-stamped old one. M2 is addressed to the successor
seat and queues under a different `serial_key`, so it is not behind M1. The head-of-line argument
in P1-A does not hold on the ordinary path, and the step 3 I wrote ("M2 is enqueued and stamped
`B`" against the same seat) never occurs. The hash covers `sessionId` as well as the process
tuple, so a `/new` inside a surviving process also yields a fresh id.

The residual case — same seat id, different native session — is the deliberate hold, and PM's
ruling stands: resume the original session or use a new seat, no deletion and no re-stamp.

**One thing I checked that supports that ruling rather than contesting it.** `retry` increments
`attempt` on every held poll (`crates/store/src/queue.rs:381`) and there is no attempt cap anywhere
in the daemon: `attempt` is read only by `federation/mod.rs:400-438` and `pointer/worker.rs` to
compute their own backoff delays, never as a poison or dead-letter threshold. That is exactly why
the hold stays recoverable indefinitely, which is what "resume that native session" requires.

**It is also a latent coupling worth a comment.** The intentional-hold policy silently depends on
the absence of a max-attempts rule. If anyone later adds one to `queue.rs` — an ordinary,
reasonable thing to add to a job queue — a held native message becomes a dropped native message,
with no test tying the two together. A line at the `retry(job_id, Duration::ZERO)` call site saying
the zero-delay retry is a hold rather than a failure, and must not be subject to attempt-based
expiry, would keep the next person from breaking a policy they cannot see.

Minor, and I am not asking for a change: in the held state each wait iteration costs a write
transaction (500 ms internal tick inside a 65 s client wait), so a parked hold writes on the order
of 10^2 transactions per wait cycle. Bounded and cheap; noting it only because it scales with the
number of parked native seats.

**P1-B, P2-D, P2-E upheld; P2-C fix delivered; P2-F accepted and documented as fail-closed scope;
P3 settings fsync / reporting / recoverable-capability noted.** No other finding in this document
is affected by the P1-A correction — each stands on its own citation.

---

## Targeted re-review — `40ded909`, `70dbf39c`, `236d7507`/`16122ce7` (HEAD `669a991d`)

### P2-C hold metadata — FIXED, verified

`store.mjs:137-158` adds `claimInbox`, and `NativeBridge.consume` uses it on the shipping path
(`store.mjs:524`), not a helper. The wire contract matches the daemon: `http/mod.rs:1155-1157`
emits `meta = "native-consumer-held:{held_reason}"`, and `delivery/mod.rs` builds the target reason
as `native-target-session:{target}; resume that native session or use a new seat…`, which is the
exact discriminator the client keys on. Target holds stop receiving with the operator action
spelled out (`store.mjs:530-538`); consent holds back off and retry (`539-544`). Neither path acks.
This is what the finding asked for.

Two residuals, both fail-safe, neither worth changing: an unrecognised `meta` prefix degrades to
"empty inbox" (`148-149`) and an unrecognised reason classifies as `consent` (`155`). Both keep
polling without acknowledging, so they cost a diagnostic, never a message.

### Recoverable capability — PARTIALLY fixed

The mechanism is right: `store.mjs:549-550` re-registers on `retryable`, so widening the retry
class does cause re-registration rather than a bare re-poll.

**But only one of three native refusals is covered.** `delivery/mod.rs:583-597` produces:

|refusal|when|client|
|---|---|---|
|`native-extension-unavailable: …`|seat exists, tombstoned or capability off|retryable → re-register ✅|
|`native incarnation mismatch: …`|seat exists, tuple differs|fatal — defensible, a superseded process should stop|
|`native incarnation no longer belongs to a current Copilot seat`|**registry has no seat**|fatal ❌|

The third is the empty-registry case — daemon restarted on a fresh or pruned state dir — and it is
precisely the case re-registration repairs. Today it kills receiving permanently
(`store.mjs:549` → outer catch → `receive-held`, `consume` returns). It is adjacent to the DB0
symptom you are already diagnosing. The daemon also collapses "seat absent" and "seat is no longer
Copilot" into that one string (`delivery/mod.rs:595`), so the client cannot discriminate even if it
wanted to; splitting them is the enabling change.

Separately, the match is on an exact Rust literal (`store.mjs:211` vs `delivery/mod.rs:585`), and
the only assertions of it are JS-side copies of the same literal (`store.test.mjs:60`,
`extension.test.mjs:355`). **No test on either side pins the pair.** Reword the Rust string and
every suite stays green while production reverts to permanent deafness. Either assert the literal
in a Rust test at the constructor as a change-both tripwire, or emit a stable machine-readable code.

### P1-B acceptance across restart — NOT fixed; the change is inert

`70dbf39c` removes `pid`/`proc_start` from the journal key, leaving `hash([id, harness_session])`
(`store.mjs:259-266`). That only helps if `id` is stable across a restart. It is not:

- `sameProcess` requires exact `pid` **and** `proc_start` (`store.mjs:12-13`).
- `prior` is sourced only from that exact process match or a spawn prebind (`store.mjs:77, 85`).
  **There is no lookup by `harness_session`.**
- With no `prior`, the id falls through to `pij-copilot-<hash([sessionId, pid, proc_start])>`
  (`store.mjs:96-99`).

A restarted process has a new pid, therefore no `prior`, therefore a **new id**, therefore a new
journal directory — and the accepted-not-acked message is reinjected. The commit's own test encodes
the opposite conclusion at `store.test.mjs:47-48`: a registration differing only by `id` loads
nothing.

The change cannot help anywhere, because the two hash inputs are functionally dependent: in every
branch where `id` is reused, `pid` and `proc_start` are unchanged as well (exact-process match, or
prebind against the current host). Removing them from the key alters no path.

**The test holds `id` constant by construction.** `store.test.mjs:79-83` builds `resumed` as
`{...registration, pid: +1, proc_start: +100}` and never calls `chooseRegistration`. It proves
`FileJournal` is not pid-keyed — true, and not the claim. The composition
`chooseRegistration → FileJournal` is what restart exercises, and it is untested and false.

There is a second horn. If the daemon has **not** reaped the dead seat and a pane is set, restart
throws `Pane belongs to a different process identity` (`store.mjs:80-84`) — a non-retryable
`NativeError`, so a hard registration failure. Reaped means duplicate injection; unreaped means
refusal to start. Either way, "retain acceptance across native process restarts" does not hold.

A session-keyed `prior` lookup (adopt the live seat whose `harness_session` matches when no process
matches, superseding its stale process identity) is the shape that would make both the id and the
journal stable — and it is the same lookup the unreaped-pane throw needs. This is exactly what the
pending live host-resume proof would have exposed; it should not be signed off on unit evidence.

### Installer `236d7507`/`16122ce7` — ACCEPT

`link-global.ts:355-395`: settings temp file is `openSync`/`writeFileSync(fd)`/`fsync`/`close`/
`rename`, with a directory fsync tolerating `EINVAL`/`ENOTSUP`/`EISDIR` only. Durability item
closed. `changed`/`skipped` are now counted separately and folded into the caller
(`:473-478`), so the "everything already linked" verdict is no longer wrong, and the failure text
no longer asserts "without replacing foreign settings" after changes were applied (`:404`).
Every preservation brake is intact: non-directory/symlinked home, foreign symlink target,
non-regular or multiply-linked settings, non-object JSON. `_copilot-native-install-check`
(`justfile:118-125`) skips only on an absent CLI and stays strict when one is present — correct
shape for an optional dependency.

### Verdict on this pass

P2-C closed. Capability recovery incomplete on the empty-registry refusal and coupled to an
unpinned string. P1-B open and, in my reading, untouched by the commit that claims it. Installer
items closed. Every live-evidence row named earlier remains open; the P1-B analysis above is the
specific reason the live host-resume witness cannot be treated as a formality.

---

## P2-D re-review — `4bdadd92`

### Span objection — FIXED

Both slow observations are now outside the exclusion, which is exactly what I asked for:

- `registration.rs:256-259`: the guard moved *below* the process/ancestry observation, so the up-to-2s
  `verify_native_host` no longer excludes anyone. The roster is re-read under the guard, which is the
  right correction — the reason to hold it was never the observation, it was the mutation.
- `delivery/mod.rs:657-663`: `native_recipient` + `native_claim_permitted` (the tmux round trip) run
  before the lock; `:673-681` drops the guard, re-observes, and re-takes it. Steady-state native
  polling no longer puts tmux syscalls on a global critical section.

`blocked_native_host_observation_does_not_block_unrelated_inbox_ack` (`registration.rs:1559+`) is a
real proof, not a restatement: it parks the observer on a `Notify` and drives an OMP and a Pi seat
through claim+ack to completion. It would fail against the previous code. Accepted.

The read-then-act closure is also sound. `revalidate_native_observation` re-runs `native_recipient`
(so tombstone, capability and identity are rechecked) and compares the pane, which covers both
inputs the stale verdict depended on. The `.or(held_reason)` ordering at `:667` and `:694` is
right — clearing a semantic hold cannot override an observed consent veto, while setting one after
observation still vetoes. The `claimed_delivery(job_id)` / `attempt` check at `:684-691` correctly
refuses to hand out or retry a *successor* attempt.

### P2-G (new) — the P2-D fix adds two client-fatal refusals, neither tested

Narrowing the lock created two new failure paths, and both are `Err(native_refusal(...))`:

- `delivery/mod.rs:637` `native pane changed during consent observation`
- `delivery/mod.rs:690` `native delivery claim attempt is no longer running`

Both reach the client as HTTP 400 `refused` with meta `daemon/native-inbox: {message}`. The client
treats a 400 as retryable **only** on one exact literal (`store.mjs:205-215`,
`native-extension-unavailable: …`). Neither of these matches, so both are non-retryable →
`store.mjs:549` rethrows → outer catch → `receive-held` → `consume` returns. **The native consumer
goes permanently deaf.**

Both describe transient, recoverable conditions. The comment at `:686-687` states the author's own
expectation that an ack or lease reclaim *will* finish an attempt while observation waits — that is
ordinary timing, not an error, and the correct response is to re-loop. A pane change is repaired by
re-registration. Neither warrants killing the consumer.

They are also inconsistent with their siblings: every other verdict in the same block returns
`Ok(NativeInboxPage { held_reason })`, which the client handles recoverably. Same situation class,
opposite shape.

`grep` finds each string only at its construction site — **no test exercises either path**, in the
273. This is the concrete case where the green count is not coverage.

Cheapest fix for `:690` is `continue` rather than `Err`: the job is back in the queue and the next
iteration re-observes. For `:637`, a held page with the pane-change reason keeps the client alive
and re-registering.

### Structural — the retryable allowlist defaults to fatal and is now wrong twice

I raised this last round about one string; `4bdadd92` makes it a pattern. The client's
fatal-vs-retryable decision is a manual allowlist containing exactly one daemon message, so **every
refusal the daemon adds defaults to permanently killing the consumer**, silently, with no test on
either side able to notice. That default is backwards for a transport whose failures are
overwhelmingly transient. Invert it: carry a machine-readable code with an explicit `terminal` flag,
and let unknown refusals be recoverable. Native attestation refusals that genuinely must stop the
process are the short list, not the long one.

### Host attestation — improved

`comm=` → `ucomm=` (`registration.rs:716`) fixes a real Darwin truncation, and pairing the kernel
accounting name with the existing argv/entrypoint check is stronger than what it replaced:
`real_shell_process_is_not_an_actual_copilot_host` now spawns with `.arg0("copilot")` and still
refuses, so a forged argv[0] cannot outrank the observed executable. The rejection corpus also now
pins `…/.copilot/extensions/pij/extension.mjs`, i.e. the extension child is not mistaken for the
host — the case I flagged at preflight. Accepted.

### Status of everything else

P1-B remains open and unaddressed on the analysis in the previous addendum; composition does not
bear on it. The boxed-Copilot gate verdict is **unchanged and preserved** pending Jordan's decision
on the AC6 draft-interjection consequence; I am not adjudicating a native-owned gate here. All
previously named live-evidence rows stay open.

---

## Corrections after PM's P1-B ruling

### My reinjection causality was wrong for the case I applied it to

PM is right. `Queue::claim` (`crates/store/src/queue.rs:199`) selects on `kind`, and delivery builds
the kind list as `delivery:{seat}`, so jobs are partitioned by seat ID. When the ID churns, the old
seat's jobs are not redelivered under the new ID — they are **unreachable**, not duplicated. The
harm in the fall-through path is loss of reachability plus refusal, and that is already sufficient
to uphold the defect.

Reinjection is real but belongs to the *stable*-ID restart only: with the ID preserved (spawn
prebind), old jobs stay claimable under the same `kind`, and a journal directory keyed on
pid/proc_start rotated on restart, so the same msgId injected twice. That is the case `70dbf39c`
addresses. I labelled the two harms with one mechanism; they are distinct.

### Consequence: `70dbf39c` stops being inert exactly when the dispatched fix lands

I called the journal-key change inert, which was accurate at HEAD because no path produced a stable
ID across a cold restart. The dispatched fix creates that path. Once a resumed process adopts the
live seat's ID, its queued jobs become claimable again — and at that moment the journal key is what
decides whether the resumed conversation is re-injected with everything it already saw. `70dbf39c`
is a **prerequisite** for the cold-resume fix, not an independent one. Withdrawing "inert" as a
forward-looking characterisation; the ordering was correct.

### Self-correction on P2-G's trigger

I told PM `delivery/mod.rs:690` fires on ordinary timing and cited the lease reclaim. The lease is
300s (`crates/core/src/config.rs:159`), and the observation window the guard is dropped for is tens
of milliseconds, so lease expiry is **not** a realistic trigger. The reachable one is a concurrent
`acknowledge_inbox` interleaving through the dropped guard — available because `queue.rs:212-219`
deliberately preserves a duplicate-read window, so two readers can legitimately be in flight.

P2-G's severity therefore rests on consequence, not frequency: a rare race that permanently deafens
a consumer, with no test on the path. That is still worth closing, but it is not the common case I
implied.

### Two asks against the dispatched work

**Scoped service retry over invert-the-default is accepted** — narrower is right, and I withdraw the
broad recommendation. The residual ask is only about the discriminator: if the scope is enumerated
as more exact prose literals matched in `store.mjs`, the failure mode I raised survives intact
(a Rust-side reword leaves every suite green and production permanently deaf). Whatever the client
matches on should be a stable machine-readable code, and a Rust-side assertion should pin it.

**Sequencing.** The cold-resume fix necessarily adds refusals — non-unique same-native candidate,
and old owner still alive. Under the current classification those are non-retryable by default and
will deafen a consumer. Each new refusal needs a deliberate terminal-or-recoverable decision at the
point it is written, and ideally the retry scoping lands first. Of the two, "old owner alive" looks
genuinely terminal (do not steal) while "candidate not unique" looks recoverable (the ambiguity
resolves when the other window exits).

One question on the anti-steal brake: what evidence establishes the old owner is dead? If it is the
process identity alone, ordinary pane reuse where the pane now hosts a *different live* Copilot
needs to refuse adoption rather than treat a changed pane occupant as a dead predecessor.
