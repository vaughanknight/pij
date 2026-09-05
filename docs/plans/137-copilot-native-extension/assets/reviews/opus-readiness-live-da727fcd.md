# Readiness / diagnostics / live-evidence review — `da727fcd`

Reviewer seat `pij-static-rhinoceros` (OMP, github-copilot/claude-opus-5).
Packet: `assets/inputs/pm-review-readiness-live-delta.json`.
Prior: `opus-paired-v4-5222f518.md`, `opus-correlation-sensor.md`,
`opus-convergence-0de79322.md`, `opus-delta-2a36a799.md`.

Read-only against the committed pin. Nothing built, run, linted or launched.
Working-tree drift is reported but not reviewed.

**Verdict: source-correct. Both of my open findings are closed — F-E upstream,
F-F here.** One evidence-record gap (G1), one design residual (G2). Neither is a
code defect. No release verdict: the run that carries the live typing proof still
aborts at the old disabled-ready glyph, so four native modes remain unproven.

---

## Ground

`da727fcd` is a two-parent merge (`96cba695` + `362b4785`) with an **empty
combined diff** — no evil merge. Delta from `5222f518` is 86 files, but most is
upstream: plans 135 and 136 arrive via `de9c8bb5` / `bb5383c4`. The 137-owned
source surfaces are small and I read each in full:

| surface | delta | owner |
|---|---|---|
| `store.mjs` | +87/−26 | 137 |
| `harness/scripts/copilot-native-smoke.ts` | +231 | 137 |
| `crates/harnesses/src/composer.rs` | +31 | 137 (`2d2242c6` only) |
| `crates/daemon/src/http/mod.rs` | +97 | **upstream only** |

`git log 5222f518..da727fcd -- crates/daemon/src/http/mod.rs` returns only
`ae427e2d` (136 reviewer fixes), `897b7cd7` (135 identity), and merges. **No
137-side duplicate fix**, as claimed — verified by provenance, not assertion.

---

## R1 — startup / reconnect readiness

**Satisfied.** `#waitForTypingAvailability` is called only from the
`if (!this.registered)` branch, immediately after `register()` and before
`claimInbox`.

The loop admits on `snapshot.state === "observed"` alone. It deliberately does
**not** consult `retry_after_ms` or `semantic_hold`, and the comment says why:
*"Availability permits acquisition, not injection; every new send still checks
fresh consent."* That is the right line. Readiness asks whether the sensor can be
read; consent is a per-send question answered later by `#prepareNewSend`, which
is unchanged. Had readiness waited for quiet, the hold path could never be
exercised at all — a human typing at startup would block acquisition rather than
produce a hold.

Terminal-vs-wait separation is exact, and I traced every exit:

- **Valid `unavailable`** → wait, exponential backoff on the pre-existing
  `INITIAL_RETRY_MS`/`MAX_RETRY_MS`. No new constant.
- **Malformed / forged** → `typingSnapshot`'s validation throws
  `TypingSensorError`, which is not `retryable`, so the inner catch rethrows to
  the outer catch → terminal `receive-held`. Forged data cannot be waited out.
- **Retryable transport error** → inner catch sets `this.registered = false`, so
  the next iteration re-registers **and re-runs readiness**. There is no path
  where a mid-readiness failure falls through to `claimInbox` with readiness
  skipped.
- **`InboxWaitDeadline`** → cannot arise here. `typingSnapshot` uses
  `this.request`, not `#requestEnvelope(..., inboxWait)`, so the long-poll renewal
  branch (which does *not* reset `registered`) is unreachable from the sensor. The
  D1 separation I reviewed earlier is what makes this safe.

The wait loop lives *inside* `#waitForTypingAvailability`, not the outer `while`,
so a long unavailable episode does not re-POST `/v1/register` — pinned by
*"startup readiness rechecks after ${failure} reconnect without registration
churn while unavailable"*.

Recovery behaviour is exactly as claimed: readiness gates **acquisition**, but a
recovered accepted record skips `#prepareNewSend` entirely (it is only reached
under `if (!record)`), so recovered acceptance never waits for quiet and never
reinjects. Pinned by *"startup readiness waits before loading recovered acceptance
but never waits for quiet or reinjects it"*.

The strongest proof here is not a unit test. `extension.test.mjs` drives a **real
spawned extension process against a real HTTP fixture** and now asserts the
observed request *order*:

```
["/v1/inbox/typing", "/v1/inbox", "/v1/inbox/typing", "/v1/release", "/v1/inbox/ack"]
```

Readiness precedes the first claim, and the second sensor read is the per-send
gate. That is an observed wire ordering, not a mocked one.

### G2 (P3, design residual) — `unavailable` waits at acquisition but is terminal at injection

`#prepareNewSend` still does `if (snapshot.state !== "observed") throw new
TypingSensorError()`, so a `state: "unavailable"` snapshot at send time
permanently stops receiving until reload, while the identical snapshot at startup
is merely waited out. The actual-shell test makes the asymmetry explicit
(readiness observed, then unavailable → exactly 2 typing requests, 1 claim, 0
acks, 0 sends, 1 notice) and comments *"Registration readiness is not fresh-send
consent."*

The **direction is right**: acquisition is reversible, injection is not, so
failing closed at the injection boundary is correct and I would object to
changing it to a silent retry.

What I want to flag is the motivation gap. This delta exists because transient
unavailability at startup was frequent enough to produce a permanent stop — a real
bug worth fixing. But nothing about that transience is startup-specific: a mid-
session repaint captured between frames yields the same `unavailable`, and there
the outcome is still a terminal stop requiring `/reload`. Either startup
unavailability had a startup-specific cause (pane not yet painted — plausible, and
if so this is complete), or the same class remains live in a worse place.

Not a defect; a question the live evidence can answer. If `install-final-sensor-capture`
or the local runs ever show an `unavailable` after a successful readiness, the
answer is the second one and a single bounded re-observation before going terminal
would be justified. Until then, fail-closed is the defensible default.

---

## R2 — diagnostic suppression correction

**Satisfied, and it fixes a real bug rather than adding a message.** The prior
reporter did `if (unavailable) return;` for every warning kind, so once any
episode set the flag, a *later terminal* `receive-held` was silently swallowed —
the operator saw a reconnect notice and then nothing, with receiving permanently
stopped. The new predicate is:

```js
if (unavailable && event.kind !== "receive-held") return;
```

so terminal refusal is never suppressed, while ordinary reconnect churn is still
deduped. That is the correct exemption: `receive-held` is emitted from the outer
catch, which terminates `consume`, so it can fire at most once per bridge
lifetime and exempting it cannot spam.

`typing-sensor-wait` bypasses the `unavailable` flag entirely and is instead
deduped one level up by `this.typingReadinessWaiting`, which is set on first wait
and cleared on success. So a readiness episode prints exactly one line, a later
episode after reconnect prints one more, and neither poisons the flag that governs
terminal visibility. Pinned by *"startup readiness diagnostic says waiting and
retrying without hiding later invalidity${reconnect ? " after reconnect" : ""}"*.

No false permanent-stop language: the waiting advice is *"waiting for native
typing-sensor availability; retrying before claiming inbox work; outgoing pij_send
remains available"* — retry-shaped, and it preserves the outgoing-usability
statement that every other advice string carries.

I checked whether `typingReadinessWaiting` leaking `true` after a terminal error
matters. It does not: `stop()` aborts a controller that is never replaced, and
`run()` guards on `this.running`, so the bridge is single-use and the flag is
unreachable after termination. No finding.

---

## R3 — F-C native-event diagnostics

**Satisfied within its stated scope.** The metadata block is computed *before*
`completion?.observe(event)` and the comment states the reason: *"Successful
terminal observation clears ancestry; capture its pre-state, not the aftermath."*
`terminal` is read *after* observe. So a single emission carries both the
pre-observe ancestry and the post-observe terminal — which is precisely what makes
the record diagnostic rather than a snapshot of the wrong instant.

`parentKnown: completion?.descendants.has(event.parentId) ?? false` is the field
that matters: it makes the **observed** missing-parent cause visible at runtime
instead of only in a post-hoc investigation. `descendantCount`, `completionLive`
and `completionNativeId` give the surrounding state needed to interpret it.

Scope discipline holds. Every field is a scalar id, boolean or count; there is no
body, no content, no credential. Each string is type-guarded
(`typeof x === "string" ? x : null`), so a non-string payload cannot be projected
into the native timeline — this also tightened the two pre-existing fields.
No new timer, no new policy, no unblock path: a rejected event is still rejected,
it is now merely explicable. That matches F-C's disposition as an accepted
residual — the wedged-consumer wait remains unbounded, and this delta does not
claim otherwise.

Pinned by three tests, including *"native-event diagnostics expose only scalar IDs
and never callback or buffered bodies"* (the safety property) and *"native-event
diagnostics identify rejected idle without declaring a stall"* (the scope
property — it reports the observation without asserting a conclusion).

---

## R4 — approved draft footer

**Additive only.** `is_copilot_footer` gains one disjunct,
`lower.starts_with("@ files · # issues")`, inside an existing `||` chain. No
previously-recognised footer can become unrecognised; this is structurally
incapable of regressing the other four clauses, and
`copilot_footer_preserves_existing_variants` guards them anyway.

The positive test is honest evidence: it loads a **captured real terminal**
(`tests/fixtures/2026-09-05-copilot-v1.0.84-live06-draft.json`), takes the actual
last line, and asserts recognition — rather than asserting against a
hand-retyped string. The negative test rules out prose embedding and partial
hints.

Context worth recording, since a reviewer may reach for it: `starts_with` means a
user draft beginning with exactly `"@ files · # issues"` would be misread as a
footer. That is real but not a new class — the same function already accepts
`lower.contains("context")` and `contains("esc interrupt")`, which are far looser
(any draft containing the word "context"). **The new clause is the tightest of the
five.** No finding against this delta.

"Unavailable still safe" holds: an unrecognised footer resolves to the
`unrecognized` unavailable reason rather than a synthesised quiet, which the
sensor slice already pins, and R1 above now waits on it at acquisition and refuses
at injection. Nothing fabricates consent.

---

## R6 — diagnostic viewport / cursor / final sensor captures

**Satisfied.** All three additions are read-only and outcome-preserving.

`captureSmokePaneViewport` issues **one** tmux invocation with `display-message`
and `capture-pane` joined by `;`, so the coordinates and the viewport come from
the same paint — separate calls would race and pair a cursor with a different
frame. `preserveOutput` exists because `.trim()` would delete leading and trailing
blank rows and shift every line index, destroying the geometry the capture is for.
The whole body is wrapped so a failure returns a partial record with `error`; it
never throws.

`captureSmokeFinalTyping` filters the roster to attested Copilot seats whose pane
still exists, validates the tuple before use, and issues **GET only**
(`api(path, undefined, signal)` with `body === undefined`). No POST, no send-keys,
no queue interaction. Per-seat failures are captured into that seat's sample
without hiding the others, and the whole function has an outer catch.

Two honest self-labels deserve credit, because they prevent a future reader from
over-reading the artifact: `timing: "nearby-not-atomic"`, and *"This is a
subsequent physical viewport, not the daemon's earlier sensor frame."* The capture
does not claim to be the frame the sensor decided on.

`finishSmokePanes` orders capture-before-teardown and returns `false` **only** on
`kill-server` failure, so `code = 1` is reachable from cleanup failure alone —
identical to the previous inline `finally`. Diagnostic errors land in
`final_typing_capture_error` and cannot change the exit code or overwrite
`receipt.status`. The per-mode capture is pushed before `kill-pane` for the same
reason, and `captureSmokeFinalTyping` never throws, so it cannot convert a passing
mode into a failure.

The test additions cover exactly the properties that matter here, including
*"keeps cleanup failures distinct from diagnostic failures"*, *"retains
unexpected diagnostic callback failure without blocking teardown"*, *"rereads
current tuples and preserves a later observed result without rewriting the
original failure"*, and *"pairs actual cursor coordinates with unjoined final
viewport, preserving scrollback"*.

**This one is proven in the field, not just in tests** — see local-08 below.

---

## R7 — earlier invariants

Verified unchanged at the pin: `#prepareNewSend` reached only under `if (!record)`
(`:831`), `journal.begin` before injection (`:833`), `#declareRelease` before ACK
(`:869`), sensor refusal still terminal at send (`:771`). No `send-keys` or
control-sequence path exists anywhere in `store.mjs`. Exact owner/tuple/target
binding, completion correlation, and current-release declaration are all
untouched by this delta.

### F-F — **closed**

`activeBottomModal` now matches the known welcome body against
`COPILOT_WELCOME_ROWS` and returns `undefined` (keep waiting) instead of treating
it as an active dialog. This is the hardening I proposed, in the shape I proposed:
recognise the welcome by content, keep the throw for genuinely unknown boxes.
Backed by a real fixture and *"treats retained welcome truncated at its closer as
an incomplete repaint"*.

Maintenance coupling worth recording: the rows are content-specific — they pin
`/experimental`, `/init` and `/model` as the suggested commands. The version is
pattern-tolerant (`v\d+\.\d+\.\d+(?:-\d+)?`), the command list is not. A Copilot
release that changes the welcome suggestions drops out of the allowlist and
reverts to the F-F failure mode. That fails **loudly** at a named assertion rather
than silently, which is the right trade, but it is a per-CLI-version dependency to
carry.

### F-E — **closed upstream, and I under-graded it**

`ae427e2d` (plan 136 reviewer finding f2) fixes release attribution on `main`,
consumed here by merge with no 137-side duplicate. The fix is exactly the shape I
recommended: attribute from the queue on `ReleaseOutcome::Released`, keep the
caller's declaration verbatim for `NotDeferred`/`NotLive` where there is no
authority to correct with — preserving the deliberate publish-on-no-op behaviour.

Their comment names a consequence I did not identify. I graded the impact as
bounded ("suppresses a duplicate held publish, clears readback"). In fact **both**
readers key on `(seat, msg_id)` — `is_held` *and* `active_holds` — so a mismatched
key leaves a phantom hold in `state --json` permanently and a seat long-polls
through its own release. That is an operator-visible stuck state, not a cosmetic
one. My P2 was too low, and two independent reviewers converging on the same fix
from different consequences is the outcome I would want.

---

## Evidence grades

### `pm-native-real-canary-04.json` — real-model roundtrip, manual mode

`status: passed`, `provider: real-model`, `mode: manual`.

**Digest chain closed independently.** The receipt records
`store.mjs = 2cc04cb1…`, `extension.mjs = 567fccce…`. I recomputed both from the
pin blob and from the worktree: all three agree. The real-model run demonstrably
executed the exact committed receiver — verified, not taken from the receipt.

Real throughout: Copilot CLI 1.0.84-0 with binary sha256, tmux 3.6a, real panes,
real approval dialog (`dismissed` → `approve-once`, `keys: ["Enter"]`), and
**`model: "gpt-5.6-luna"`** on the inference. This is the first proof in the plan
that is not `deterministic-local-fixture-not-real-inference`, so it closes the
real-provider gap for this mode.

Chain proven: inbound `user.message` carrying the pij frame → assistant
`toolRequests` invoking `pij_send` → outbound job `state: "done"` → completion
`assistant.message` with `PIJ_NATIVE_DONE` and an `interactionId` → duplicate
resolves `delivered`/`reader-read` → second receive via `completion-next-claim`.
Completion correlation therefore holds on **real** event ancestry, not fixtures.

Self-grading is honest: `native-accepted-not-model-complete`, scope *"correlated
completion permits a second real native receive; not full acceptance"*.

**Excludes:** the typing gate, lifecycle, every automated driver guard (this is
`mode: manual`), and the remaining native modes.

### `pm-native-local-08.json` witness[6] — actual default 60 000 ms

`kind: manual-typing-held-then-aged-draft-admitted`, `status: passed`, same pin,
same module digests.

This is a **real 60-second wall-clock proof**, not a shortened one:

| stage | `observed_at_ms` | `retry_after_ms` |
|---|---|---|
| typing observed | 1788580225219 | **60000** |
| held | 1788580225533 | 59686 |
| expired | 1788580285452 | 0 |
| accepted | 1788580288604 | 0 |

`observed_expiry_ms = 1788580285219` is exactly `observed + 60000` — derived from
the witnessed observation, not wall clock — and the expiry sample satisfies it.
Elapsed observation-to-acceptance is **63.4 s**. `typing_grace_ms` is 60000
throughout, `semantic_hold` false throughout (not passed by clearing a hold), and
`keys` contains exactly one `send-keys -l -- HUMAN_DRAFT_…` — the message body
never touched tmux.

Two live corroborations beyond the packet's claim:

1. **R2's new diagnostic is proven on a real terminal.** The `staged` capture
   contains, rendered in an actual Copilot pane:
   `● [pij native] unavailable: typing-sensor-wait; waiting for native
   typing-sensor availability; retrying before claiming inbox work; outgoing
   pij_send remains available`.
2. **R6 is proven on a failing run.** `metadata_raw: "50\t45\t160\t48"` — cursor
   (50, 45) in a 160×48 pane, consistent with a 44-char draft on the composer row
   near the bottom. And despite `status: failed`, `final_typing_capture` is present
   with 2 observations and the *only* error key is the original top-level `error`.
   No `final_typing_capture_error`, no `tmux_cleanup_error`. "Retained before
   teardown, errors preserve original outcome" is demonstrated in the exact
   circumstance it was written for.

**Grade:** real client, real terminal, real tmux, real daemon, real 60 s; fixture
model (`provider: deterministic-local-fixture-not-real-inference`,
`selectedModel: "pij-native-fixture"`). That is the **correct** grade for this
proof — the typing gate is model-independent, and the real-provider dimension is
covered by canary-04. Together the two receipts cover both axes; neither covers
both at once.

**Run-level:** `status: failed`, `error: "PIJ_NATIVE_TIMEOUT: disabled CLI
composer ready"`. I confirmed the cause at the pin — `copilot-native-smoke.ts:1390`
still tests `/❯|>/`. Consequence: **every mode after witness[6] never executed**,
so missing-consumer, spawned, rollover and cold-host-resume remain entirely
unproven, exactly as `pending` states.

### `harness checks 9/9`, Rust 742, `artifact://529`

**Taken as reported; not re-run, not read.** I have no independent evidence for
these. The register tightening from `897b7cd7` is the one upstream change that
could plausibly break 137 registration, so I checked its shape rather than lean on
the count: the new refusal fires only when `ProcSource::Pane && claim.pid.is_some()`
and the claimed identity is outside `observed.subtree`. `harness_process_from_snapshot`
builds that subtree by BFS from the pane root *including the root*, so both real
Copilot topologies pass — pane-runs-copilot (claim == root, in subtree) and
copilot-as-unique-descendant (`ProcSource::Harness`, refusal branch not taken).
Only a genuinely foreign pid is refused. **Native/shared integration intact.**

---

## G1 (material, record integrity) — both cited proofs are uncommitted

`pm-native-real-canary-04.json` and `pm-native-local-08.json` are **not in
`da727fcd`**. They exist only in the working tree, with mtimes 13:51 and 13:53
against the pin's 13:49:52.

Some of this is unavoidable: a run at commit *X* cannot be contained by *X*. And
the provenance is genuinely good — each records `source_commit: da727fcd…`, and I
closed the module-digest chain myself against the pin blobs rather than trusting
the receipts.

But right now the auditable record does not contain them. A later reviewer, a
gate, or CI reading the pin sees the readiness and diagnostics code with **no live
proof attached**, and my grading above is unreproducible from committed state.
This also collides with the packet's own "read committed pin, not moving tree"
constraint: I was asked to grade artifacts the constraint excludes.

Fix is trivial — commit both receipts (plus the follow-ups below) in the next
commit, so the pin *after* this one carries the evidence for this one. Worth doing
before any acceptance claim references them.

## Working-tree drift (not reviewed)

Present on disk, absent from the pin, therefore outside this verdict:
`copilot-native-smoke.ts` already replaces `/❯|>/` with
`nativeComposer(...) === ""`, plus `copilot-native-disabled.json`, a regression
test (`+9` in `copilot-native-smoke.test.ts`), and `composer.rs` `+29` for the
measured draft fixture. These match the `pending` list. The predicate replacement
is the right call — reusing the proven composer parser instead of a glyph guess —
but it is **unreviewed and unproven at this pin**, and it is the single change
gating whether the four remaining native modes can even be reached.

---

## Proof limits

- **This review:** committed pin only; nothing built, run, linted or launched.
- **Independently verified by me:** merge shape, file provenance, module digests
  against pin blobs, subtree semantics, receipt internals.
- **Taken as reported:** `harness checks 9/9`, Rust 742, `artifact://529`.
- **Not established:** typing gate under a real model; lifecycle; missing-consumer,
  spawned, rollover, cold-host-resume; AC6; final gates on the current tree.
- **Not reopened:** F-A/F-B (landed), F-C (accepted residual, correctly not
  claimed closed), F-D (discharged by the v4 octopus), F-E (closed upstream),
  F-F (closed here).

## Verdict

**Source-correct.** Every claim in the packet holds at the pin, and two of the
three deltas fix real defects rather than adding surface: the reporter previously
swallowed terminal refusals behind any prior warning, and a transient startup
`unavailable` previously became a permanent stop. The readiness gate draws the
acquisition/injection line in the right place and says so in a comment; the
diagnostic block captures pre- and post-observe state in one emission and stays
scalar-only; the capture helpers are read-only, outcome-preserving, and honest
about their own timing.

Both of my open findings are closed — F-F here in the shape proposed, F-E upstream
in the shape proposed, consumed by merge with no duplicate.

Two items carried forward: **G1**, the live receipts are uncommitted, so the
record does not yet support the grading above; **G2**, the acquisition-waits /
injection-refuses asymmetry is correctly directed but its motivation may extend to
mid-session transients, which live data can settle.

**No release verdict.** The one run carrying the live typing proof still dies at
the old disabled-ready glyph, and the fix for it is in the working tree, unreviewed.
Four native modes have no evidence at all.
