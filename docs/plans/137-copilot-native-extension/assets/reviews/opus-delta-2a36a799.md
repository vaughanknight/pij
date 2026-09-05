# Targeted delta review — `2a36a799ca63593a4f252177db3219b838a683ad`

Reviewer seat `pij-static-rhinoceros` (OMP, github-copilot/claude-opus-5).
Packet: `assets/inputs/pm-review-delta-2a36a799.json`.
Base: `0de7932273d1f3577cc64177bd1a8abe6442daba` (reviewed in
`assets/reviews/opus-convergence-0de79322.md`).

## Source pin

Read-only. Nothing built, run, linted or tested. `0de79322` is an ancestor of
`2a36a799`; the range is 76 files, +9496/-171, of which the packet scopes five
deltas. Every claim below is derived from committed content — `git show
2a36a799:<path>` — so it survives the tree moving again. Working tree was at
the pin with only plan docs and this reviewer's own artifacts dirty; no source
file differed from the pin at read time.

**Verdict: approve the five listed deltas on source correctness.** Two P2
findings, both about evidence integrity rather than behaviour; two P3 source
findings. Not a release verdict.

---

## D1 — own unanswered inbox deadline renews

**Correct, and the best-tested change in this range.**

The classification predicate (`.copilot/extensions/pij/store.mjs:221`) is four
conjuncts, each load-bearing:

```js
if (inboxWait && !response && timeout.aborted && error === timeout.reason)
```

- `inboxWait` is set only by `claimInbox` (`:173`). `/v1/inbox/ack`,
  `/v1/register`, `/v1/send`, `/v1/seats` and a non-waiting `/v1/inbox` all go
  through `request` with the default `false`.
- `!response` separates a connect/read-deadline from a **body** stall:
  `response` is assigned before `raw = await response.text()` (`:208-217`), so
  a truncated body cannot renew.
- `error === timeout.reason` is object identity, not a name test. A foreign
  `DOMException(..., "TimeoutError")` is a different object and stays a
  retryable `NativeError`.
- External cancellation is intercepted one line earlier (`:219`, `if
  (signal?.aborted) throw signal.reason`), so a caller abort rethrows the
  caller's own reason and never renews.

The consume loop (`:580-591`) excludes only the renewal from failure handling.
`InboxWaitDeadline` therefore does not set `registered = false`, does not emit
`reconnecting`, and does not set `failureEpisode` — and because
`connection-ready` is emitted only after a **successful** claim (`:561`), a
renewal cannot falsely close an open outage episode. It does take the existing
capped delay (`:589-590`). Both halves of the packet claim hold.

**Why the fix is required, not cosmetic:** the daemon's wait loop
(`crates/daemon/src/http/mod.rs:1328-1346`) blocks on `subscription.next()`
with **no server-side deadline**. On an idle seat the daemon never answers, so
the client's 65s timeout *is* the normal idle path — pre-fix, every idle
Copilot consumer emitted a false outage every 65 seconds. The daemon side
corroborates the diagnosis.

**Test quality is high and answers the concern I would otherwise have raised.**
`deadlineHttpFixture` (`store.test.mjs`) stands up a real `node:http` server and
uses the real global `fetch` with `requestTimeoutMs: 150`, so abort-reason
identity propagation through `AbortSignal.any` → undici is proven by execution
rather than assumed. The six tests pin each conjunct separately: capped waits
`[250,500,1000,2000,4000,5000,5000,5000]` with exactly one `/v1/register` and
no outage/recovery/hold events; a mixed 401-and-renewal run asserting exactly
three registrations, one `reconnecting` and one `connection-ready` with an
in-delay assertion that `connection-ready` count stays 0 during the episode;
five non-wait endpoints plus body-stall and socket-disconnect all still
retryable; a foreign `TimeoutError` still retryable; an external abort whose
reason *is* a `TimeoutError` rejecting with that same object; and shutdown
during a renewal delay issuing no further claim or registration.

The fifth of those is the one that matters most — it is the test that would
fail if anyone "simplified" the identity check into a `name === "TimeoutError"`
check.

### R1 (P3) — a wedged daemon is now indistinguishable from an idle one

The trade is deliberate and correct for the false positive, but it is a trade.
A daemon that accepts connections and never answers `/v1/inbox` produces an
unbroken sequence of renewals: no `reconnecting`, no diagnostic, no event.
Previously that condition was surfaced — wrongly on idle seats, but rightly on
wedged ones. Inbound delivery silently stops with nothing said.

Partially mitigated: an outgoing `send` from the same seat still fails loudly,
so an operator who acts surfaces it. Cheap remedy if wanted: count consecutive
renewals and emit a low-frequency `waiting` diagnostic after N, which stays
silent on a healthy idle seat.

### R2 (P3) — renewals share the failure backoff

`retry` is reset only by a successful `deliver` (`:579`) and is advanced by
renewals (`:590`). An idle seat therefore sits at `MAX_RETRY_MS` (5s), so a
message arriving during the delay window waits up to 5s, and the *first*
genuine reconnect after a long idle starts at 5s and reports `retryMs: 5000`.
Latency and diagnostic cosmetics only, no correctness impact. Resetting `retry`
on the renewal path would decouple the two.

---

## D2 — installer consent guard

**Correct, and stricter than the packet claims.**

`verifyToolApproval` (`harness/scripts/copilot-native-smoke.ts:295-339`)
requires the modal to be **bottom-anchored**: `╭─+╮` opens it and
`lines.at(-1)` must be `╰─+╯`. Transcript text echoed earlier in the scrollback
cannot satisfy that, which is the packet's "transcript text cannot authorize"
and it is enforced structurally rather than by keyword absence.

The remaining assertions are exact, not permissive:

- title is exactly `Run extension tool "pij_send"`;
- exactly one `{` and one `}` (`lastIndexOf === indexOf` on both) — this is what
  stops a crafted message body containing braces from being parsed as the
  arguments;
- `assert.deepEqual(args, expected)` — **exact**, so an extra argument key
  fails rather than passing a subset check;
- the choice list must be exactly the four options **with `❯ ` on `1. Yes`
  alone**. That is the sharpest assertion in the file: it proves the *selection
  cursor position*, so `Enter` cannot land on `2. Yes, and approve "pij_send"
  for the rest of the session`. "No repeat keys" is proven, not assumed;
- the controls footer is pinned, guarding against a differently-keyed dialog
  where `Enter` means something else.

`confirmSmokeToolInvocation` (`:342-380`) captures `before`, **re-captures and
re-verifies immediately before sending the key** (`before_confirm`, refusing
with "dialog changed before confirmation"), sends exactly one `Enter`, records
`decision: "approve-once"` and `keys: ["Enter"]`, captures `after_input`, then
waits for dismissal. Any failure sets `decision: "withhold"`. The TOCTOU
recheck is the step most such scripts omit; it is present and load-bearing.

Consent is simulated and transport is not: `HUMAN_KEYS` is
`{clearDraft: "C-u", approveOnce: "Enter"}` — no text is ever typed into a
pane, so tmux keys cannot stand in for the message path.

### F2 (P3) — dead assertion in the witness chain

`verifyToolApproval(afterInput, args);` (`:369`) discards its return value. The
function returns `false` exactly when no modal box is found, which is the
*expected* post-dismissal state, so this line can only ever throw on a
malformed capture and otherwise does nothing. A reviewer reading the
before/recheck/after chain will read it as a check that the dialog is still the
expected one immediately after the keypress. Either assert what is intended or
drop the call and keep the capture — an assertion-shaped no-op in a consent
gate is worse than no line at all.

### R3 (P3) — capture-race brittleness, safe direction

`verifyToolApproval` **throws** (rather than returning `false`) on a partial or
ambiguous box: a mid-repaint capture with `╭─╮` present but the closer not yet
on the last line trips `incomplete or non-active modal`, and an unrelated
box-drawn block above the live modal trips `ambiguous modal boundary`, because
`top` is the *first* `╭─+╮`. Inside both `until(...)` loops a throw aborts the
smoke instead of retrying. The direction is safe — it fails closed and never
approves — but it makes the smoke fail on a repaint race rather than wait one
more poll. Returning `false` for "not yet a complete modal" while keeping the
throw for "a complete modal that is the wrong one" would separate the two.

---

## D3 — 136 convergence

**Correct, and it caught the one merge regression that mattered.**

**Subscribe-before-claim** (`http/mod.rs:1316-1322`): the `wake` subscription is
created before the loop's first `claim_native_inbox` at `:1329`, closing the
lost-wakeup window in which a send landing between claim and subscribe would
have gone unnoticed until the client's deadline. The filter covers both
`delivery.outcome` and `delivery.released`, scoped `for_seat`, so releasing a
typing hold wakes an already-blocked reader — the packet's second claim.

**Claim is non-waiting and re-validated each pass**: `claim_native_inbox(&seat,
false, &identity)`. Identity validation therefore re-runs on every wakeup, and
because the continue-condition is `is_ok_and(empty && no hold)`, an `Err`
breaks the loop immediately (`:1334-1338`) — a refusal is never swallowed by
the wait.

**Holds return promptly with metadata**: only `claims.is_empty() &&
held_reason.is_none()` continues, so a consent or native-target hold breaks at
once and is rendered as `native-consumer-held:{reason}` (`:1357`), which is
what the JS parses at `store.mjs:178-188`. Holds carry an operator action, so
returning them immediately rather than at deadline is the behaviour that
matters.

`peek` short-circuits before subscribing (`:1310-1314`), and a closed event bus
breaks with the empty page rather than hanging (`:1343-1345`).

### The merge-preservation catch

Worth stating explicitly because it is the class of regression a merge produces
silently. At `be778b9c` (main 136) the extension-stream union was:

```rust
let extension_stream = matches!(recipient.harness, Harness::Omp | Harness::Pi);
```

At the pin (`delivery/mod.rs:322-327`) it is `Harness::Omp | Harness::Pi |
Harness::Copilot`. Had the merge taken main's version, Copilot would have
fallen into the `else` branch — `transport.can_deliver`, then socket/PTY rung
selection — and the daemon would have tried to **type into the Copilot pane**
instead of queueing for the native extension. The union is restored, and this
is the packet's "pointer skip union Copilot|OMP|Pi".

Defence in depth confirms it: `pointer/worker.rs:104` excludes all three
harnesses from the drained kinds, and `:195` re-reads after claiming and
returns `release_body(job_id)` for a Copilot recipient — with a comment naming
the TOCTOU (registration may change the harness after the inventory). A seat
that becomes Copilot mid-drain has its row returned to the queue rather than
typed or dropped.

---

## D4 — native strict consent checks `!composer_idle`

**Correct, load-bearing, and red-green proven.**

136 made the shared verdict **recency-only**. In the recognized-composer branch
(`crates/harnesses/src/interaction.rs:418-443`), `permitted = !human_typing`
where `human_typing` is purely "last edit within `typing_grace`", while
`composer_idle` is a *content* fact (`content.chars().all(char::is_whitespace)`).
So a stale non-empty draft — typed five minutes ago, still sitting in the
composer — yields `permitted: true, composer_idle: false, reason: None`. Under
the pre-fix native guard that admitted the claim.

The added conjunct at `delivery/mod.rs:616-619` restores the strict rule, and
the divergence from the shared policy is principled rather than incidental:
`select_rung` (`crates/core/src/delivery.rs:172-177`) lets `socket_available`
short-circuit **before** the `!composer_idle` queue, because a socket cannot
corrupt a composer. Native Copilot has no socket rung — the extension pulls the
claim into the same UI the human is drafting in — so it is exactly the case the
shared short-circuit does not cover. The in-code comment is accurate.

**The red proof is real.** `pm-136-consent-red.log:53-55` shows
`native_claim_consent_holds_then_admits_without_touching_composer` panicking at
`delivery/mod.rs:2698` on the assertion `static draft remains held` — the new
assertion, failing on the pre-fix tree (41 passed, 1 failed). The green log
shows 233/233 plus six further suites. That is a genuine red-green pair for the
exact claim, not a green-only receipt.

**Test grace is test-scoped.** The fixture builds
`InteractionGate::with_typing_grace(tmux, Duration::from_secs(60), 100)` — the
signature is `(tmux, idle_window: Duration, grace_ms: u64)`, so the grace is
100ms, and `DEFAULT_TYPING_GRACE_MS` is unchanged at `60_000`
(`crates/core/src/delivery.rs:13`). No production policy override, as claimed.

### F1 (P3) — the precise reason exists and is not used

`DeliveryDeferralReason::ComposerBusy` already exists, with the stable wire
spelling `"composer-busy"` and the doc comment *"A recognized composer contains
non-whitespace text"* — which is verbatim the condition `!composer_idle`
detects. But `fresh_injection_verdict` sets `reason` only for `HumanTyping`
(`interaction.rs:440`), so when the new veto fires on an aged draft the verdict
carries `reason: None` and `native_claim_permitted` falls to the generic
`"human-consent"` default (`delivery/mod.rs:623`).

Behaviour is unaffected — the JS routes it to `hold.kind === "consent"`, backs
off and never acks. The cost is diagnosability: the operator is told
"human-consent" when the actionable truth is "an unsent draft is sitting in
your composer", which is a *clear-and-retry* condition, not a *wait* condition.
The vocabulary is already on the wire, so this is a one-line fix, not a design
change.

The new test asserts only `claims.is_empty()` for the aged-draft and
post-clear-grace cases; the `"human-typing"` assertion covers only the first,
recency-driven hold. So the generic string is currently unpinned in both
directions — whichever reason is chosen, the aged-draft case should assert it.

---

## D5 — captured 135 response extras

**Correct, and the check is two-directional.**

`crates/daemon/src/http/tests.rs:1336-1364`:

- every key/value in the captured fixture must be present and **equal** in the
  live response (`:1340-1346`), so neither a changed value nor a removed field
  can pass;
- observed keys absent from the fixture must be in the allow-list
  `{"typing_grace_ms", "native_extension_delivery"}` or the assertion names them
  as "undocumented keys" (`:1347-1360`);
- and `native_extension_delivery` is additionally pinned to `false` on this
  non-native path (`:1361-1364`) — the default is asserted, not merely
  tolerated.

The fixture bytes are unchanged: blob `e74035da7e2c99b02cee7ae7d18a74afa571f5d0`
at base and at the pin, the same object first committed at `ee3defa1` in plan
135. Verified by object id. Resolution still goes through
`pij_testkit::fixtures::read` (`:1292-1294`) with the comment explaining why the
helper replaced a path string. This is precisely the shape that would have
caught 136 adding a field to the register response unnoticed.

---

## Cross-cutting findings

### F3 (P2) — the D4 red proof cannot be recovered from any commit

`.gitignore:36` is a bare `*.log`, so
`assets/evidence/pm-136-consent-red.log` and
`assets/evidence/pm-136-convergence-green.log` — two of the four evidence
pointers this packet cites — are **untracked**. `git log --all` knows nothing
about either path; they exist only in this working tree, on this machine.

The claims they support are independently verifiable from source, and I did
verify D4 statically, so this is not a correctness risk. It is an evidence
risk, and a governing one: the project rule is that *a requirement row is
checked by a RECEIPT — a sha, a test name, or a run id — never by prose*. A red
proof is the only artifact distinguishing "we added a guard" from "we added a
guard that was already implied", and this one evaporates on a fresh clone while
its `.json` and `.tap` siblings survive. The asymmetry is accidental, not
chosen.

Remedy is trivial and one line: a negation such as
`!docs/plans/**/assets/evidence/*.log`, or capture these as `.tap`/`.txt` like
`runtime-inbox-renewal-tests.tap` already is.

### F4 (P2) — the cross-language runtime proof is stale against the shipped module

`native_runtime_cold_resume.rs` — the strongest end-to-end artifact in this plan
(real `node`, real HTTP, real SQLite, real `ProcLiveness`) — records the sha256
of the `store.mjs` it exercised. `assets/evidence/daemon-cross-language-receipt.json`
pins `moduleDigest = 33119791f229046e7b1ac32a9b3227994ab646d1f8dff72d29ea6d2441f6299b`.

That is `store.mjs` **at base `0de79322`**. At the pin the module hashes
`872f0f30e13f50c17c85e7b2d1fd9cf0e7b2ab3ddaf7e536b19080742feacce5` — D1 changed
it. So at `2a36a799` there is **no executed cross-language proof of the shipped
module**; the receipt attests a file that is no longer in the tree.

The `runtime-inbox-renewal-receipt.json` states this itself, plainly, which is
good practice and the reason I can be brief about it. The residual problem is
mechanical: the digest is **recorded, not asserted**, so nothing fails on a
mismatch — only a human comparing two hashes notices, and a stale receipt reads
green. Since the test already computes the digest, having the consuming gate
compare it against the working `store.mjs` converts this from a diligence
question into a signal. Re-running the recipe is the direct fix.

---

## Known pending — verified, not misrepresented

The packet's `known_pending` is accurate:

- **C1 (from the convergence review) is still open at this pin.**
  `crates/daemon/src/registration.rs` is **byte-identical** between `0de79322`
  and `2a36a799` (empty diffstat), and `:549` still reads
  `descriptor.native_extension_delivery = native;`. Assigned to the daemon
  owner; correctly not claimed as fixed.
- **Lifecycle smoke driver additions** are not in the pin.
- **PM live05, full gates and the real-provider witness** remain outstanding.

## Proof ceiling

- **What this review establishes:** source correctness of the five listed
  deltas, from committed content, by reading. Nothing was executed.
- **What the cited evidence establishes:** a genuine red-green pair for D4
  (from an untracked log — see F3); 87/87 Node tests against a real loopback
  HTTP server for D1, with delay values asserted by injection rather than
  wall-clock measurement; a 55-line installer consent receipt for D2.
- **What nothing here establishes:** real Copilot SDK or model behaviour; live
  host resume; the round trip through a real provider. D2 proves the consent
  *guard* is exact and that a one-time approval was simulated — it is not a
  claim that a human approved anything, and the smoke's own header says so.
- **Stale:** the cross-language runtime proof, per F4.
- **Out of scope:** C1's repair, the lifecycle driver, main 136 beyond the
  convergence points listed, AC6 (verdict unchanged, frozen pending Jordan).

## Verdict

**Approve the five deltas on source correctness at `2a36a799`.**

D1 is right and unusually well tested — the identity check on the abort reason,
proven against real `fetch`, is the detail that makes it durable. D3's merge
preserved the one line whose loss would have sent Copilot down the PTY path.
D4 is load-bearing rather than defensive, and the red log proves it. D2 is
stricter than advertised, particularly the selected-choice assertion. D5 is a
two-directional contract on unchanged bytes.

Nothing here blocks composition. The two P2 findings are about the durability
and self-checking of evidence, not about behaviour, and both have one-line
remedies. The two P3 source findings (F1's unused `composer-busy` vocabulary,
F2's assertion-shaped no-op) should be fixed alongside C1 rather than deferred,
since both are small and both mislead a future reader about what is checked.

This is not a release verdict, and no pending item above has been represented
as complete.
