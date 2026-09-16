# Code Review — plan 154: a successful registration never leaves a tombstone behind

**Plan**: `docs/plans/154-tombstone-lift-all-harnesses/plan.md`
**Implementation report**: `docs/plans/154-tombstone-lift-all-harnesses/report.md`
**Reviewed range**: `d64fa0e4..ecbdd9bc` on `154-tombstone-lift-all-harnesses` (code `6d907986`, evidence `ecbdd9bc`), off main `1fd636c4`
**Reviewer**: `pij-hot-alligator` (cross-model)
**Probe worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s154-review`, detached at `ecbdd9bc`, worktree-local `CARGO_TARGET_DIR`. Every mutant, probe and gate ran there and the tree was restored byte-for-byte after each. The production daemon was touched exactly once, read-only (`pij list --json`, to size the paneless population for § E.1). The only files this review adds to the coder's worktree are this `review.md` and `reviewer-probes/`.
**Reviewer probes** (preserved, runnable): `docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes/` — `mutants.py` (M1–M8), `probes.rs` + `apply.py` (P1–P4).

---

## A) Verdict

**APPROVE-WITH-FIXES**

The measured production defect is fixed, and I could not break it. Every rung of the continuity ladder is independently mutation-killed by a named test; the invariant is not merely tested but **structurally total**; no 149 or 151 control is weakened, and I verified that by byte-comparing the four native admission helpers rather than by reading the diff. The AC5 live receipt is honest evidence, not a dressed-up fixture.

Three things need attention before ship, and none of them is in the code the plan set out to change:

- **F001 (MEDIUM)** — the **paneless** registration path never resumes a retired address. `paneless_target` filters retired rows out of its own candidate set, so a returning Claude/Codex/Copilot pull-mode session either mints a **new memorable id** and abandons the old address with its mail, parent, role and Telegram binding, or — when the retired row still records the returning host — is **refused outright** with a misleading `"a subagent of <id>, not a seat"`. AC2's claude/codex witnesses pass an explicit id and therefore never reach this function. Proven, both shapes, all three paneless harnesses.
- **F002 (MEDIUM)** — the ladder is **not** "same harness AND (session OR spawn OR proc)" as the review packet states. Only the *session* rung is harness-gated. A retired `omp` row is lifted by a `pi` claim on the process rung and by a `claude` claim on the spawn rung, each with a completely foreign session, and the row's `harness` flips. The shipped doc paragraph describes the code correctly; the packet's contract does not. Somebody's model of this is wrong and it should not be mine to guess which.
- **F003 (LOW)** — one of the six refusal shapes in `retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity` is refused by **admission**, not by the ladder. `refused()` accepts any `Refused`, so the row cannot tell.

Everything the packet asked me to try to break, I tried to break. It held.

---

## B) Summary of what I actually ran

| # | Probe | Result |
|---|---|---|
| M1 | keep the tombstone on one harness path (`if resuming && harness != Harness::Omp`) | **4 tests red**, incl. the AC1 invariant |
| M2 | drop the harness check from the session rung | 1 test red |
| M3 | drop the session check, keep only the harness check | 2 tests red, incl. the HTTP envelope test |
| M4 | accept any `spawn_id` (presence, not equality) | 1 test red |
| M5 | PID-only incarnation match | 1 test red |
| M6 | delete the refusal entirely (main's behaviour) | 2 tests red |
| M7 | AC4 fixture reordered to **non**-overlapping | **red** — the interleave is load-bearing, the test is not vacuous |
| M8 | drop the sweep's CAS | 3 tests red, two of them **pre-existing** |
| P1 | assert `tombstoned_at.is_none()` at **both** `Ok` exits of `register_inner`, run the whole daemon suite | **409 passed / 0 failed** — no exit in any mode ever returns a tombstone (negative control in § C.1) |
| P2 | exact refusal message for all six shapes | 5/6 name the tombstone; `missing-process` does not (F003) |
| P3 | paneless retired address, dead-host and live-host shapes | abandoned / refused (F001) |
| P4 | spawn and process rungs across harness boundaries | both lift, harness flips (F002) |

Gates on my own checkout at `ecbdd9bc`, clean tree: `cargo fmt --all --check` **exit 0**; `cargo clippy --workspace --all-targets -- -D warnings` **exit 0**; `cargo test --workspace` **0 failed**; `cargo test -p pij-daemon --lib` **409 passed / 0 failed**; `just self-check` see § C.7.

---

## C) Verdict bar, item by item

### C.1 — "Invariant is total"

**Holds, and for a stronger reason than the AC1 test gives.**

`register_inner` has exactly two `Ok` exits: the paneless short-circuit at `registration.rs:829` and the tail at `:993`. `descriptor` is only ever `existing.cloned()` or `SeatDescriptor::new(...)` (`:752-754`) — there is no third source. And:

```rust
let retired = existing.filter(|seat| seat.tombstoned_at.is_some());   // :726
let resuming = retired.is_some() || native && …;                      // :744
if resuming { descriptor.tombstoned_at = None; … }                    // :782-785
```

`existing` tombstoned ⟹ `retired.is_some()` ⟹ `resuming` ⟹ cleared. `existing` absent ⟹ a fresh descriptor, which is born live. So a tombstoned `Ok` is unreachable by construction, not by test coverage. The paneless exit at `:829` is additionally guarded: it requires `existing == Some(&descriptor)`, which a lift makes false (the clone differs from the row precisely in the two tombstone fields).

Every other path that writes a seat row on registration:

| path | writes | tombstone risk |
|---|---|---|
| `register` / `register_with_harness_session` (`:83`, `:92`) | via `register_inner`, Ordinary | covered above |
| `register_native` (`:218`) | via `register_inner`, NativeExtension | covered above |
| `register_paneless_with_observer` (`:111`) | via `register_inner`, Paneless | covered above |
| `/v1/adopt` (`http/identity.rs:603`) | `register_with_harness_session` | same path |
| `/v1/spawn` prebind (`http/mod.rs:1076-1084`) | direct `registry.put` of `SeatDescriptor::new(...)` | born live, no clone |
| predecessor / dead-native retirement (`:877`, `:910`) | *adds* a tombstone to a **different** row | by design |
| `/v1/revive` | explicit operator verb | plan non-goal |

**Named uncovered exit.** `successful_registration_never_returns_a_tombstone` calls `register_inner` with `RegistrationMode::Ordinary` for all five harness spellings — including `Copilot`, which is an *ordinary* registration of a copilot-harness row, not a native-extension one. So AC1 never exercises `NativeExtension` or `Paneless`.

**P1 closes it empirically.** With `assert!(descriptor.tombstoned_at.is_none(), …)` injected at *both* `Ok` exits and the full daemon suite run — 409 tests covering all three modes, 149's native resumes, 151's holds, spawn prebind, adopt and the paneless fixtures:

```
test result: ok. 409 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

And the assertion is not decorative. Negative control — the same injection with M1 applied on top:

```
NEGATIVE CONTROL exit 101
INVARIANT VIOLATED at the main Ok exit: SeatDescriptor { id: SeatId("pij-registration-invariant"), … harness: Omp, …
test result: FAILED. 0 passed; 1 failed
```

**Mutation (requested):** keeping the tombstone on one harness path kills four tests —

```
M1 if resuming && harness != Harness::Omp
  registration::tests::successful_registration_never_returns_a_tombstone
  registration::tests::retired_omp_session_resumes_with_bindings
  registration::tests::retired_registration_accepts_spawn_or_observed_process_continuity
  registration::tests::retired_session_resume_does_not_replace_recorded_role
  405 passed; 4 failed
```

The AC1 invariant is the one that catches a *harness-shaped* hole; the per-harness witnesses catch the rest. Note the single clear site means there is no per-harness branch to mutate in the real code — the fix is harness-agnostic by construction, which is the right shape for the rule.

### C.2 — "Continuity ladder, no widening"

**Each rung is independently load-bearing.** One mutant per rung, one named red test per mutant:

```
M2 drop `seat.harness == harness` from the session rung
   → registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
M3 drop the session comparison, keep only the harness check
   → registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
   → http::tests::retired_registration_refuses_foreign_session_without_writing
M4 `seat.spawn_id.is_some()` instead of nonempty equality
   → registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
M5 `old.pid == new.pid` instead of the whole ProcIdentity
   → registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
M6 delete the refusal (i.e. main's silent rewrite)
   → registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
   → http::tests::retired_registration_refuses_foreign_session_without_writing
```

M5 reproduces the coder's own claimed `red-process-incarnation-mutant.log` independently; the exact-tuple comparison is genuinely required.

**Foreign session claiming a retired id.** Refusal text, HTTP status, envelope shape, row and spine all pinned by `http::tests::retired_registration_refuses_foreign_session_without_writing`. The row comparison is `assert_eq!(registry.get(&old.id).await.unwrap(), Some(old.clone()))` — full `SeatDescriptor` equality, every field, not a spot check — and the spine tail is compared as a whole. The AC5 live receipt does the same thing against real SQLite with `JSON.stringify(before) === JSON.stringify(after)` over a `SELECT *` spread. That is a genuine byte-compare at both layers.

**Widening — see F002.** The ladder as written is `(harness AND session) OR spawn OR proc`, not `harness AND (session OR spawn OR proc)`.

### C.3 — "149 and 151 preserved"

**Yes, and I checked it structurally rather than by eye.** The four native selection/admission helpers are byte-identical across the range:

```
                       d64fa0e4         ecbdd9bc
native_prebind         2e904e6dde4f83c2 2e904e6dde4f83c2
registration_target    79199c3e4f7a70b9 79199c3e4f7a70b9
check_native_roster    1d80237344b5756c 1d80237344b5756c
same_native_owner      6753f3393d705b2e 6753f3393d705b2e
```

**Admission order is unchanged.** The 151 hold is still returned at `:723-725`, *before* the new continuity block at `:726` and before every registry write (`:883`, `:921`). Stronger than ordering: the two are **mutually exclusive by construction** — `check_native_roster` only produces `NativeSessionHold` under `unknown_session`, which requires `existing.is_none()` (`:1224`), while the continuity check requires `existing.is_some()`. A hold can never be converted into a terminal refusal by this change.

Named tests, run unchanged:

```
native_transient_hold_never_masks_invalid_claims ... ok
native_transient_hold_requires_local_attested_native_owner ... ok
native_known_session_foreign_pane_collision_is_never_a_transient_hold ... ok
cold_resume_preserves_operator_hold_even_after_capability_withdrawal ... ok
native_session_resume_lifts_tombstone_and_publishes_incarnation_change ... ok
```

**The one modified pre-existing assertion is honest.** `ordinary_registration_never_inherits_native_capability` line `:2747` changed from `assert_eq!(registered.tombstoned_at, old.tombstoned_at)` to `== None`. That is the contract change itself, and the guard that test exists for — `assert!(!registered.native_extension_delivery, "case {change}")` — is untouched and still asserted for the retired case. The mechanism behind it is pre-existing and unchanged: `:810-815` refuses to inherit the flag from an owner with `tombstoned_at.is_some()`. Only the comment on those lines moved. An ordinary lift therefore cannot mint native delivery capability.

**The one native behaviour that did change** is diagnostic: an explicit-address native claim against a retired row of a different session now returns the retired refusal (`:527-529`) instead of `"seat id belongs to a different native session"`. Both are terminal `Refused`, in the same position, before the retryable multi-address check at `:534`. No admission authority moved; the caller learns the tombstone reason and timestamp, which a bearer-authenticated caller could already read from the row.

### C.4 — "Sweep race (AC4)"

**The test really interleaves, and the packet's blocking condition does not fire.**

`SuspendedDeathProbe` suspends on the *second* observation of the old pid. That is deliberate and correct: `reaper.rs` calls `eligibility` twice — once to nominate the candidate (`:159`) and once to re-verify immediately before the CAS (`:174`). The suspension therefore lands between the sweep's final death observation and its write, and the whole registration read-modify-write completes inside that window. The packet phrased the race the other way round ("an observation of the old pid dead lands between the claim's read and its write"); what the fixture builds is the production shape — sweep observes death, restart wins, sweep must not clobber — and that is the right one.

Reordering to non-overlap does **not** make it vacuous:

```
M7 fetch_add(...) == 1  →  == 999   (the sweep completes before the claim)
   reaper::tests::death_sweep_preserves_registration_during_old_process_observation ... FAILED
```

So the finding the packet was hunting for is **not present**.

**But it does not witness this change.** With the reaper test held at `ecbdd9bc` and `registration.rs` reverted to `d64fa0e4`:

```
test reaper::tests::death_sweep_preserves_registration_during_old_process_observation ... ok
test result: ok. 1 passed; 0 failed
```

It passes on the pre-fix tree, because the seat is live when the claim lands and the interlock it exercises — `tombstone_if_unchanged` — already existed. M8 confirms the interlock was already covered: dropping it also kills `death_sweep_matches_manual_candidates_and_commits_observation_once` and `reap_concurrent_revive_between_observation_and_commit_is_preserved`, both pre-existing. `report.md:47` states this plainly ("a new discriminating witness, not a newly discovered missing interlock"), so this is honest work described honestly; the plan's AC4 wording promises more than the change had to deliver. Recorded as F006, non-blocking.

### C.5 — "AC5 live proof honesty"

**The receipt is real evidence.** `tombstone-lift-live.ts` kills the host with `SIGKILL`, kills the pane, kills the tmux server, and then **waits for the canonical sweep** to produce the tombstone — it never writes one:

```ts
const retired = await until("canonical observed-dead tombstone", async () => {
  ... return row.tombstoned_at != null ? row : undefined; });
assert.equal(retired.tombstone_reason, "observed-dead");
await until("canonical seat.tombstone event", () => frames.find(... "seat.tombstone" ...));
```

The recreated-pane caveat is enforced, not merely narrated: the driver refuses to run without `--allow-recreated-pane-address` (`:65`), and the foreign rider re-creates the *same* pane address and asserts a *different* session and pid before expecting the refusal. That is what makes "the saved session authorised the lift, not the recycled pane address" a supported claim rather than an assertion. The row comparison spreads every column (`{...row}` over `SELECT *`), so `report.md:88`'s "the complete stored descriptor … remained unchanged" is accurate.

**`reaper.rs` is untouched** — the range modifies exactly four files and it is not one of them; `reaper_tests.rs` changes are additive test code only (one struct, one test). The two-witness brake at `reaper.rs:78-85` is byte-identical, and it remains what it is: a one-directional safety interlock. Remove it and the sweep retires *the same set or more*, so it can only spare a seat, never condemn one.

### C.6 — "Contract"

`pij-rs-api.md` gains `## Registration and tombstone continuity` at `:52`, stating the invariant, all three rungs, the exact refusal string, HTTP 400 + v2 envelope, and what a lift preserves. The 149 native-only sentence is gone:

```
$ grep -c "reuses its id, adopts the observed host tuple and pane, and clears its tombstone" docs/how/pij-rs-api.md
0
```

and the native section now defers to the shared contract. The `#registration-and-tombstone-continuity` anchor that `report.md` links resolves.

One correction is needed there, and it is F001's other half: the paragraph reads as an *iff* ("An existing retired address is resumed only with continuity"), but on the paneless path a retired address is not resumed **even with continuity**.

### C.7 — Gates on my checkout

Clean tree at `ecbdd9bc`, worktree-local target dir:

```
cargo fmt --all --check                                   exit 0
cargo clippy --workspace --all-targets -- -D warnings     exit 0
cargo test --workspace                                    0 failed (all suites ok)
cargo test -p pij-daemon --lib                            409 passed; 0 failed
just self-check                                           exit 0 (warm), 11/11 smoke scenarios
```

**One caveat on `just self-check`, and it is not this change's fault.** My *first* run — the cold one, on a freshly created worktree — failed:

```
smoke: file-watch-notify ... ✗
{ "kind": "idle-timeout", "message": "waitIdle timed out after 30000ms
  … HEAD is now at 1dae698 release: v0.3.0 community theme expansion
  up to date, audited 1 package in 114ms … Cloning int…" }
error: Recipe `self-check` failed on line 225 with exit code 1
```

The tail shows the scenario mid-`git clone` and `npm` install: it is paying first-run network cost inside a 30 s idle budget, not failing a behaviour. Re-run alone it takes 2.66 s (`npx tsx harness/scripts/smoke.ts file-watch-notify ... ✓`), and the warm full gate is exit 0 with zero `error: Recipe` lines. This is `report.md`'s DL-002 reproducing exactly, on a second machine-state, which is decent corroboration that it is a real harness sharp edge and not a one-off — the scenario's readiness budget does not distinguish "hung" from "still downloading".

Note on the coder's own log: `gate-rust.log:1` runs `cargo fmt --all && cargo fmt --all --check && …`. The formatting write precedes its own check, so that particular gate cannot fail. Mine (F004) was the check alone, and it passes — the tree is genuinely formatted — but the log does not prove that.

---

## D) Findings

| id | sev | where | what |
|---|---|---|---|
| F001 | MEDIUM | `registration.rs:1022` (`paneless_target`) + `docs/how/pij-rs-api.md:54` | A retired paneless address is never resumed: the returning session gets a new id (old address keeps its mail/parent/role/binding) or is refused as a "subagent". The contract paragraph claims otherwise. |
| F002 | MEDIUM | `registration.rs:728-739`; packet bar 2 | The ladder is `(harness AND session) OR spawn OR proc`. The spawn and process rungs are not harness-gated and a lift rewrites `descriptor.harness`. The doc matches the code; the packet does not. |
| F003 | LOW | `registration.rs:1968-2010` (`missing-process` shape), `:1750` (`refused`) | That shape is refused by admission, not by the ladder, so it witnesses nothing; the helper cannot tell. |
| F004 | LOW | `gate-rust.log:1` | `cargo fmt --all` before `cargo fmt --all --check` makes the fmt gate tautological. |
| F005 | LOW | `registration.rs:926-962` | `seat.resumed` has no consumer anywhere in the repo, and a native retired resume emits both `seat.resumed` and `seat.native-resumed` for one transition. |
| F006 | LOW | `reaper_tests.rs:384` | AC4's witness passes unchanged on the pre-fix tree; it pins the pre-existing CAS. Already stated in `report.md:47`. |
| F007 | INFO | `registration.rs:527-529` | The retired refusal discloses tombstone reason/timestamp to a foreign native session. Bearer-authenticated; the row already carried it. No action. |

---

## E) Detailed findings

### E.1) F001 (MEDIUM) — the paneless path abandons retired addresses

`paneless_target` picks the seat a headless Claude/Codex/Copilot host binds to, and its very first line excludes retired rows:

```rust
for seat in seats.iter().filter(|seat| seat.tombstoned_at.is_none()) {   // :1022
```

so the returning session's own retired row is never a candidate and a **new** memorable id is minted at `:1050`. AC2's claude and codex witnesses call `register_with_harness_session` with an explicit id, which routes to `RegistrationMode::Ordinary` and never reaches this function — that is why the shipped suite is green and this is not.

Probe P3, both reachable shapes, all three paneless harnesses:

```
PROBE dead-host Claude:  first=pij-complete-mawhrin second=pij-zestful-tochee      resumed=false orphan_tombstoned_at=Some(154)
PROBE dead-host Codex:   first=pij-eerie-odette     second=pij-changing-butterfly  resumed=false orphan_tombstoned_at=Some(154)
PROBE dead-host Copilot: first=pij-mild-elisabet    second=pij-high-radovid        resumed=false orphan_tombstoned_at=Some(154)
PROBE live-host Claude refusal:  a subagent of pij-complete-mawhrin, not a seat: it inherited PIJ_* from its parent
PROBE live-host Codex refusal:   a subagent of pij-eerie-odette, not a seat: it inherited PIJ_* from its parent
PROBE live-host Copilot refusal: a subagent of pij-mild-elisabet, not a seat: it inherited PIJ_* from its parent
```

- **dead-host** (the ordinary restart): new address. The old one stays retired with its queued mail, parent, asserted role and Telegram binding — exactly the loss the contract paragraph promises a lift avoids.
- **live-host** (manual retirement, or a recycled-pid sweep, where the retired row still records the returning host): the registration is **refused entirely**, and the message names a subagent relationship that does not exist. The seat cannot come back at all until someone hand-edits SQL — which is the very thing plan 154 exists to stop.

Note the invariant half of the rule still holds in both shapes: whatever row is written is live. It is the *continuity* half that does not.

**Severity is MEDIUM, not HIGH, and I want to be exact about why.** `pij list --json` against production right now: 33 live seats, **0 paneless** (16 copilot, 10 omp, 4 pi, 3 claude, all with panes). This is a latent gap on a path nobody is currently standing on, not a live outage. But the plan names claude and codex in AC2, and pull-mode is their real registration shape when there is no tmux.

**Fix**: either give `paneless_target` the same retired-row candidacy the native branch of `registration_target` already has (it sorts retired rows last rather than excluding them, `:1096-1102`), guarded by the same session equality it already computes at `:1023-1024`; or state the exclusion in the contract paragraph so the *iff* stops being a promise. The first is a few lines and matches the rest of the design; the second is honest and cheap. Not my call which.

### E.2) F002 (MEDIUM) — the ladder is not harness-gated the way the packet says

```rust
let continuous = (seat.harness == harness && sessions_match)   // harness-gated
    || spawn_ids_match_and_nonempty                            // not gated
    || seat.proc.is_some_and(|old| Some(old) == proc);         // not gated
```

Probe P4:

```
PROBE process-rung cross-harness: Ok(("pij-retired-cross", Pi,     None, Some("a-totally-different-session")))
PROBE spawn-rung   cross-harness: Ok(("pij-retired-spawn", Claude, None, Some("a-totally-different-session")))
```

A retired `omp` row, claimed by a `pi` process on the proc rung or a `claude` process on the spawn rung, with a session bearing no relation to the saved one: lifted, and `descriptor.harness = harness` at `:767` rewrites the row's harness.

**I am not calling this a control regression, and here is the directional reason.** Ask what removing the whole retired block does: on main, *any* claim rewrites a retired row silently — that is the defect. Every rung of this ladder therefore only ever *narrows* what was previously unconditional. Neither rung is a new capability:

- the **process rung** requires `pid` + `proc_start` that the daemon itself re-observes as currently live (`:464-477`), so matching the retired row's recorded incarnation means it is literally the same running process;
- the **spawn rung** requires a `spawn_id`, which is a 128-bit CSPRNG token minted at `http/mod.rs:2628-2640` and **not** serialised into any roster response — it reaches the child through its launch environment. It is a capability token, not a published field, so it does not have the `pij list --json` exposure problem that a session id would.

What is wrong is the **mismatch**: the packet states the contract as "same harness AND (…)", the code and the shipped doc paragraph both say otherwise, and the harness flip on lift is documented nowhere. That is a live disagreement about what was built, and it should be settled explicitly rather than discovered later.

**Fix**: pick one. Either add `seat.harness == harness` as a conjunct over all three rungs (and add the cross-harness case to `retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity`), or keep the current semantics and add one clause to the contract paragraph saying the spawn and process rungs are harness-independent and that a lift adopts the claimed harness.

### E.3) F003 (LOW) — one refusal shape is refused by the wrong guard

`refused()` (`:1750`) asserts only `matches!(result, Err(RegistrationError::Refused(_)))`. Probe P2 asserts the exact string instead:

```
PROBE foreign-session:  seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it
PROBE missing-session:  seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it
PROBE empty-spawn:      seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it
PROBE missing-process:  no bind evidence — an id can be claimed from an inherited environment, but a live session cannot
PROBE foreign-harness:  seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it
PROBE recycled-pid:     seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it
```

`missing-process` never reaches the ladder: admission refuses the unbound claim first, at `:704-715`, twenty lines earlier. The row would pass with the continuity block deleted entirely, so as a witness it is empty. The other five are real and, per M6, they are what keeps that test honest.

**Fix**: assert the message. A one-line change to that loop (`assert_eq!` against the expected retired string) turns five genuine rows into five *provably* genuine rows and forces an honest decision about the sixth — either drop it or give the shape a bound claim so it actually exercises the ladder.

### E.4) F005 (LOW) — `seat.resumed` has no reader, and fires alongside `seat.native-resumed`

Repo-wide, `seat.resumed` appears at exactly two places: the publish at `:932` and its own test at `:1869`. Nothing in `crates/`, `.pi/extensions/`, `.copilot/extensions/` or `harness/` consumes it; the same is true of 149's `seat.native-resumed`. On a native Copilot resume of a retired row both fire, so one transition produces two facts. Harmless today because neither drives behaviour — worth knowing before someone builds a timeline on them and double-counts. If the pair is intentional, a comment at `:944` saying so costs nothing.

### E.5) Evidence hygiene

The artifact set is proportionate: 13 logs, three receipts, one driver, ~155 KB total, and the two live receipts (36.6 KB + 35.7 KB) are the substance of AC5 rather than padding. Both record replayable invocations and the driver SHA. `live-fixture-gap.json` is kept and labelled as a fixture defect rather than behavioural RED, which is the right call and the right label.

One presentational note: `red-invariant.log` shows the AC1 loop panicking on its *first* case (`Omp/retired`), so that log alone does not demonstrate the pi/claude/codex REDs — `red-registration.log` does, via the four per-harness witnesses. Worth one sentence in `report.md` so a reader does not mistake the first log for the whole claim.

---

## F) Coverage map

| AC | claim | independent status |
|---|---|---|
| AC1 | invariant over every successful outcome | **Proven structurally** (§ C.1) and by mutation (M1). AC1's own test covers only `Ordinary` mode; P1 extends the assertion to every exit across the whole suite. |
| AC2 | resume by continuity, all harnesses | **Proven for omp/pi/claude/codex via the Ordinary path** (four witnesses; M1 kills). **Not met for the paneless path** (F001). |
| AC3 | refuse without continuity, row unchanged | **Proven.** Message, status, envelope, full row and spine pinned at the HTTP layer; M3/M6 kill. One of six unit shapes is vacuous (F003). |
| AC4 | death sweep vs restart race | **Test is genuinely interleaving** (M7 kills the reordering). **It pins a pre-existing interlock**, not this change (passes on the pre-fix tree; M8 also kills two older tests). Acknowledged in the report. |
| AC5 | live proof, isolated daemon | **Honest.** Canonical sweep, real OMP, recreated-pane caveat enforced by a required flag, full-row byte-compare on the foreign refusal, reaper untouched. |
| AC6 | contract paragraph | **Present and accurate to the code.** Old 149 wording gone (grep = 0), anchor resolves. Needs the paneless carve-out (F001) and the harness clause (F002). |

---

## G) Reproducing this review

```bash
git worktree add --detach ~/pi-hacking/pij-worktrees/s154-review ecbdd9bc
cd ~/pi-hacking/pij-worktrees/s154-review && export CARGO_TARGET_DIR=$PWD/target
# the probes are untracked at ecbdd9bc; copy them in (they resolve ROOT from their own path)
P=docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes
mkdir -p $P && cp ~/pi-hacking/fs3-tombstone-lift/$P/* $P/

# M1–M8: apply one mutant, run the daemon suite, restore, repeat
python3 docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes/mutants.py

# P2–P4: append the reviewer tests to registration.rs, run, restore
python3 docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes/apply.py probes reviewer_probe

# P1: assert the invariant at both Ok exits, run the whole daemon suite
python3 docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes/apply.py totality

# AC4 against the pre-fix tree
git show d64fa0e4:crates/daemon/src/registration.rs > /tmp/prefix.rs
cp crates/daemon/src/registration.rs /tmp/keep.rs && cp /tmp/prefix.rs crates/daemon/src/registration.rs
cargo test -p pij-daemon --lib death_sweep_preserves_registration_during_old_process_observation
cp /tmp/keep.rs crates/daemon/src/registration.rs

# native helpers, byte-compared across the range
for f in native_prebind registration_target check_native_roster same_native_owner; do
  for rev in d64fa0e4 ecbdd9bc; do
    git show $rev:crates/daemon/src/registration.rs \
      | awk -v f="fn $f" 'index($0,f){p=1} p{print} p&&/^}/{exit}' | shasum -a 256 | cut -c1-16
  done
done
```

---

## H) Recommended before ship

| # | file | what |
|---|---|---|
| 1 | `registration.rs:1022` **or** `docs/how/pij-rs-api.md:54` | Resolve F001: let `paneless_target` consider its own retired row under the session equality it already computes, or carve the paneless path out of the contract paragraph's "resumed only with continuity". |
| 2 | `registration.rs:728-739` **or** `docs/how/pij-rs-api.md:54` | Resolve F002 with prime: harness-gate all three rungs, or document that the spawn and process rungs are harness-independent and that a lift adopts the claimed harness. |
| 3 | `registration.rs:1968-2010` | Assert the exact refusal message per shape; drop or repair the `missing-process` row. |
| 4 | `justfile` / gate log | Split `cargo fmt --all` from `cargo fmt --all --check` so the recorded gate can fail. |
| 5 | `registration.rs:944` | One comment: `seat.resumed` and `seat.native-resumed` are both emitted for a native retired resume, and neither currently has a consumer. |
| 6 | `report.md` | One sentence noting `red-invariant.log` stops at the first loop case; the four per-harness REDs are in `red-registration.log`. |

---

# Round 2 — `86ed585c..23f5cb76`

**Probe worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s154-r2`, detached at `23f5cb76`, worktree-local `CARGO_TARGET_DIR`. Every mutant and probe ran there; the tree was restored byte-for-byte after each and verified by re-read. Production daemon touched once, read-only (`pij list --json`). Round-2 probes are preserved next to the round-1 ones in `reviewer-probes/` (`probes-r2.rs`, `apply-r2.py`).

**Verdict: APPROVE.** Every finding I raised is fixed, each fix is killed by a named test when mutated, and the pre-fix tree goes red on the new tests. Two things are worth reading before merge — neither blocks: one requested mutant **cannot** go red because the guard it protects is unreachable (§ R.2b), and the F001 fix changes four retired paneless shapes from "mint a new id" to "refuse" (§ R.8). Both are described exactly, with the commands.

## R.0 — What I re-ran

| probe | what | result |
|---|---|---|
| P1 | invariant assertion at **both** `Ok` exits, whole daemon suite, on the new tree | **419 passed / 0 failed** |
| P1-control | same injection + M1 (keep the tombstone on omp) | **exit 101**, `INVARIANT VIOLATED at the main Ok exit` |
| M-r2-prefix-paneless | restore `86ed585c`'s `paneless_target` body | **8 red** — all six resume witnesses, plus the foreign refusal and the selection test |
| M-r2-harness-gate | delete the new pre-rung harness gate | **3 red** — both new HTTP tests + the refusal loop |
| M-r2-harness-rewrite | restore the unconditional `descriptor.harness = harness` | **419 passed — green** (§ R.2b) |
| M-r2-continuity-deleted | delete the continuity block | **2 red** — incl. the exact-message loop |
| M-r2-double-event | let a native resume also emit `seat.resumed` | **1 red** — `native_session_resume_lifts_tombstone_and_publishes_incarnation_change` |
| R2a | five retired paneless attribute shapes, fix vs pre-fix | 1 resumes, 4 refuse (§ R.8) |
| R2b | my round-1 F001 probes, verbatim | all six resume, address/parent/harness preserved |
| R2c/R2d | my round-1 F002 probes, verbatim, plus the same-harness complement | cross-harness refused + named; same-harness still lifts |

## R.1 — F001: fixed, and the fix is load-bearing

My two round-1 shapes, re-run verbatim on the new tree:

```
PROBE R2b Claude/dead-host:  Ok(id=pij-retired-paneless-probe, tombstoned=None, parent=Some(SeatId("pij-original-parent")), harness=Claude)
PROBE R2b Claude/live-host:  Ok(id=pij-retired-paneless-probe, tombstoned=None, parent=Some(SeatId("pij-original-parent")), harness=Claude)
PROBE R2b Codex/dead-host:   Ok(id=pij-retired-paneless-probe, …, harness=Codex)
PROBE R2b Codex/live-host:   Ok(id=pij-retired-paneless-probe, …, harness=Codex)
PROBE R2b Copilot/dead-host: Ok(id=pij-retired-paneless-probe, …, harness=Copilot)
PROBE R2b Copilot/live-host: Ok(id=pij-retired-paneless-probe, …, harness=Copilot)
```

The address is reused (not a fresh mint), the tombstone is cleared, the parent survives, the harness survives. The false `a subagent of <id>` refusal is gone on the live-host shape.

**Pre-fix check, as asked.** I restored `86ed585c`'s `paneless_target` body onto the new tree — nothing else — and ran the daemon suite. Eight of the new tests go red, not six:

```
--- M-r2-prefix-paneless: exit 101
    test result: FAILED. 411 passed; 8 failed
    RED retired_paneless_claude_reuses_dead_host_address
    RED retired_paneless_claude_reuses_same_host_address
    RED retired_paneless_codex_reuses_dead_host_address
    RED retired_paneless_codex_reuses_same_host_address
    RED retired_paneless_copilot_reuses_dead_host_address
    RED retired_paneless_copilot_reuses_same_host_address
    RED retired_paneless_foreign_session_names_tombstone_without_writes
    RED retired_paneless_selection_prefers_live_then_newest_then_id
```

The two extra REDs matter: `..._foreign_session_names_tombstone_without_writes` proves the *refusal* half (a foreign session holding the retired row's pid gets the AC3 diagnostic, not a lift and not the paneless "subagent" text), and `..._selection_prefers_live_then_newest_then_id` proves the tie-break is deterministic rather than iteration-order luck. Both would have been easy to skip.

**The removed refusal case is honest.** `paneless_refuses_ambiguous_session_stale_tuple_and_false_push_attestation` lost its `8 => incumbent.tombstoned_at = Some(1)` row and shrank `0..10` to `0..9`. That row asserted the defect (a retired same-session incumbent must be refused), so keeping it would have pinned F001. The other eight shapes — stale tuple, foreign pid, pane, relay, native delivery, spawn id, duplicate address — are all still there, and the duplicate-address case is still reachable because the new "multiple Pij addresses" refusal only skips *retired* duplicates.

## R.2 — F002: harness now gates every rung

### R.2a The gate itself

New code at `registration.rs:597-603`, before every rung and before the spawn/collision logic:

```rust
if let Some(seat) = existing
    .filter(|seat| seat.tombstoned_at.is_some() && seat.harness.as_str() != claim.harness)
{
    return Err(retired_refusal(seat, &claim.harness));
}
```

My round-1 probes, verbatim, now refused and named:

```
PROBE R2c process-rung cross-harness: seat pij-retired-cross is retired (observed-dead, 154); a different session may not take it; harness mismatch: row omp, claim pi
PROBE R2c process-rung row-unchanged=true
PROBE R2c spawn-rung  cross-harness: seat pij-retired-cross is retired (observed-dead, 154); a different session may not take it; harness mismatch: row omp, claim claude
PROBE R2c spawn-rung  row-unchanged=true
```

And the complement I added, so the gate is a gate and not a wall — identical claims with a matching harness still lift, still across a foreign session, on both rungs:

```
PROBE R2d process-rung same-harness: Ok(id=pij-retired-same, harness=Omp, tombstoned=None)
PROBE R2d spawn-rung  same-harness: Ok(id=pij-retired-same, harness=Omp, tombstoned=None)
```

Deleting the gate kills three tests, including both new HTTP-level ones:

```
--- M-r2-harness-gate: exit 101
    test result: FAILED. 416 passed; 3 failed
    RED http::tests::retired_registration_refuses_claude_spawn_continuity_on_omp_row
    RED http::tests::retired_registration_refuses_pi_process_continuity_on_omp_row
    RED registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
```

Those two HTTP tests are the right shape: they go through the real router and assert the whole v2 envelope plus `registry.get(&old.id) == Some(old)`, so "refused without writing" is proven at the boundary, not just in the service.

The `harness_session` rung also lost its own `seat.harness == harness` conjunct, which is correct — it is now redundant with the gate, and leaving both would have hidden which one was doing the work.

### R.2b The second half of the ruling is unfalsifiable — requested mutant does not go red

The packet asked me to mutate `descriptor.harness` back to an unconditional assignment and name the red test. There isn't one:

```
--- M-r2-harness-rewrite: exit 0
    test result: ok. 419 passed; 0 failed
```

This is not a coverage gap the coder should close — it is a consequence of the gate above, and it is provable rather than empirical:

- `Harness::parse` and `Harness::as_str` are exact inverses over five lowercase spellings (`crates/core/src/model.rs:57-79`), so `seat.harness.as_str() != claim.harness` ⟺ `seat.harness != harness` for any claim that reached here (`claim.harness` must already have parsed at `:121`).
- Therefore after the gate, `existing.tombstoned_at.is_some()` ⟹ `existing.harness == harness`. On every lift, `descriptor` is `existing.cloned()`, so `descriptor.harness = harness` is a **no-op by identity**.
- `resuming` is also true for a *native, non-retired* resume — but `register_native_with_observer` refuses anything except `claim.harness == "copilot"` at `:239`, and `registration_target`'s native branch only selects `Harness::Copilot` rows, so the assignment is a no-op there too. The only surviving way to observe the guard is a non-copilot row whose `harness_session` exactly equals a native Copilot session uuid — a fixture, not a state the system can reach.

So `if !resuming { descriptor.harness = harness; }` is correct, harmless, and untestable. I would keep it (it states the intent locally, next to the clear) but the report's claim "A lift no longer assigns `descriptor.harness`" is carried by the gate, not by this line. Worth one comment saying so, so a later reader does not go hunting for the test that pins it.

## R.3 — F003: the loop now asserts what it refuses

`missing-process` became `missing-recorded-process`, and the mutation is the right one: it now removes only `old.proc`, keeping `claim.pid`/`claim.proc_start`, so the claim is admissible and the *ladder* is what refuses it. Every one of the six shapes asserts its exact message, with the `foreign-harness` shape asserting the new `; harness mismatch: row omp, claim pi` suffix.

Deleting the continuity block makes the loop red, which is what makes the assertions load-bearing:

```
--- M-r2-continuity-deleted: exit 101
    test result: FAILED. 417 passed; 2 failed
    RED http::tests::retired_registration_refuses_foreign_session_without_writing
    RED registration::tests::retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity
```

Round 1 that mutant left the loop green, because `refused()` accepted any `Refused`. It no longer can.

The HTTP-side refusal test was generalised into `retired_registration_refusal_contract(harness, proof)` with three call sites. The shared body still asserts the exact meta string, the unchanged row and an unchanged spine tail — parameterising it did not dilute it.

## R.4 — AC4 sentence excised

```
$ grep -rc 'the registration wins' docs/plans/154-tombstone-lift-all-harnesses/plan.md
0
```

The replacement — *"The pre-existing `tombstone_if_unchanged` CAS is pinned by an interleaving test; the sweep cannot re-tombstone a re-registered incarnation"* — matches what `report.md:47` said was delivered (*"already had transactional whole-descriptor CAS; this is a new discriminating witness, not a newly discovered missing interlock"*), and matches my round-1 finding that the AC4 test passes unchanged on the pre-fix tree. Documentation correction, no reaper code touched — `reaper.rs` is not in the round-2 diffstat.

## R.5 — Minor 2: exactly one event per transition

`!native && let Some(previous) = retired` on the ordinary branch; the native branch keeps `seat.native-resumed` and now carries `prior_reason` too. Three tests assert the *list* of resume events, not just its presence:

- ordinary retired lift → `["seat.resumed"]`
- native retired resume → `["seat.native-resumed"]`
- paneless retired resume → exactly one, `seat.resumed`

Mutating the guard away is caught:

```
--- M-r2-double-event: exit 101
    test result: FAILED. 418 passed; 1 failed
    RED registration::tests::native_session_resume_lifts_tombstone_and_publishes_incarnation_change
```

Asserting the whole filtered list rather than "contains" is what makes this a real pin — a "contains" assertion would have stayed green under the mutant.

## R.6 — Invariant still structurally total on the new tree

F001 added a resume path through `paneless_target`, so the round-1 totality argument needed re-proving rather than re-quoting. Both `Ok` exits of `register_inner` re-asserted, whole suite:

```
--- P1 totality (all 419): exit 0
    test result: ok. 419 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Negative control, so it is not a decorative assertion:

```
--- P1 negative control: exit 101
    INVARIANT VIOLATED at the main Ok exit: SeatDescriptor { id: SeatId("pij-registration-invariant"), … harness: Omp, …
    test result: FAILED. 0 passed; 1 failed
```

The structural argument survives the new path unchanged: `descriptor` is still only ever `existing.cloned()` or `SeatDescriptor::new(…)`, and the paneless resume reaches the same `if resuming { descriptor.tombstoned_at = None; … }` clear. The paneless short-circuit exit at `:825` cannot return a tombstoned row for a different reason — it requires `existing == Some(&descriptor)`, and a cleared descriptor is never equal to its retired original.

## R.7 — Gates, warm, on my checkout at `23f5cb76`

```
cargo fmt --all --check                                   exit 0
cargo clippy --workspace --all-targets -- -D warnings     exit 0
cargo test --workspace                                    1140 passed, 0 failed
cargo test -p pij-daemon --lib                            419 passed, 0 failed
just self-check                                           2 non-plan flakes, both reproduced as flakes (below)
```

**`just self-check` on my checkout, three runs, no plan-154 code involved** — the round-2 range contains **zero** TypeScript/JavaScript (`git diff --stat 86ed585c..23f5cb76 -- '*.ts' '*.mjs' '*.js'` is empty), so none of this can be the change:

1. First run, fresh worktree, exit **127** at stage one: `local-path-check: node_modules/.bin/tsx: No such file or directory`. A new worktree has no deps; `just worktree-deps` fixes it. Worth encoding — the failure names a missing file, not the recipe that creates it.
2. Second run, exit 1: `harness/scripts/worktree-deps.test.ts` failed in **teardown**, `ENOTEMPTY` removing its temp `git worktree` tree (`harness/test-utils.ts:34`, `rmSync` already has `force` + 3 retries). Re-run alone: **18/18 passed**. Flake.
3. Third run: vitest **241 files / 5307 passed / 22 skipped**, green — confirming (2) was a flake. Smoke failed at `file-watch-notify` with `idle-timeout` again; warm re-run `npx tsx harness/scripts/smoke.ts file-watch-notify` → `✓` in **2.6 s**.

That is DL-002 reproducing a **third** time, now on a brand-new worktree with a cold scenario cache. Two independent machine-states, three runs: the scenario's 30 s idle budget does not distinguish "hung" from "still cloning". The coder's own `gate-self-check.log` is exit 0 with all 11 scenarios, and prime already ruled the cold timing out of scope for this plan — recording it here only so the ledger has a third data point.

The coder's `gate-rust.log:1` is now `cargo fmt --all --check && cargo clippy … && cargo build … && cargo test --workspace`, exit 0, 1140 passed — the formatting write is gone from the chain, so F004 is resolved and the recorded gate can now fail.

## R.8 — One behaviour change the fix introduces, named precisely

The F001 fix lets a retired row become the paneless target, which means the pre-existing pull-shape guard now runs *against a retired row* for the first time. Four retired attribute shapes that previously minted a fresh id are now hard refusals. Same fixture, fix vs pre-fix body:

```
PROBE R2a pane:            REFUSED paneless external registration refused: host process or native session conflicts with seat `pij-retired-shape`
PROBE R2a relay:           REFUSED …
PROBE R2a native-delivery: REFUSED …
PROBE R2a spawn-id:        REFUSED …
PROBE R2a clean:           RESUMED id=pij-retired-shape tombstoned=None

PRE-FIX PROBE R2a pane:            RESUMED id=pij-complete-mawhrin   ← a NEW id, not the retired one
PRE-FIX PROBE R2a relay:           RESUMED id=pij-complete-mawhrin
PRE-FIX PROBE R2a native-delivery: RESUMED id=pij-complete-mawhrin
PRE-FIX PROBE R2a spawn-id:        RESUMED id=pij-complete-mawhrin
PRE-FIX PROBE R2a clean:           RESUMED id=pij-complete-mawhrin
```

The realistic trigger is a pij-spawned claude/codex/copilot peer (spawn always sets `spawn_id`, and a spawned peer has a pane) that dies, is swept, and whose session then returns headless — `claude --resume <session>` outside tmux. Pre-fix it silently got a new address; now it cannot register at all.

**Why this is not a finding.** It is deliberate and documented: `docs/how/pij-rs-api.md:54` says *"Their existing live-owner, session and pull-shape restrictions remain stronger than the continuity ladder"*, and the new behaviour makes a retired row behave exactly like a **live** row of the same shape, which has refused since before this plan. Failing closed on an ambiguous host is the conservative direction, and production has **0 paneless seats** (`pij list --json`: 34 live — 16 copilot, 11 omp, 4 pi, 3 claude; 19 external-harness, none paneless, 5 with `spawn_id`), so nothing is exposed today.

**What is worth one line of follow-up**: the refusal text. For a retired row the message is `host process or native session conflicts with seat pij-retired-shape`, which names neither the tombstone nor the actual disqualifier (`pane.is_some()`). That is the same diagnostic complaint I filed as round-1 F001 — the operator is told about a conflict that does not exist. Routing the retired branch through `retired_refusal` (or appending the shape) would close it. Non-blocking; nobody can hit it until a paneless seat exists.

## R.9 — Round-1 findings, disposition

| id | round-1 | round-2 |
|---|---|---|
| F001 | MEDIUM — paneless retired address abandoned or falsely refused | **fixed**, 8 tests, pre-fix red (§ R.1); residual shape named in § R.8 |
| F002 | MEDIUM — ladder not harness-gated, lift rewrote `harness` | **fixed**, gate + 3 tests (§ R.2a); the `!resuming` half is unfalsifiable (§ R.2b) |
| F003 | LOW — `missing-process` refused by admission, `refused()` accepted anything | **fixed**, exact messages, deletion-mutant red (§ R.3) |
| F004 | LOW — `cargo fmt --all` preceded its own check | **fixed**, `gate-rust.log:1` is check-only |
| F005 | LOW — `seat.resumed` has no consumer; native emitted both events | **half fixed** — the double emit is gone (§ R.5); still no consumer anywhere in the repo, which is fine for an audit fact but worth knowing |
| F006 | LOW — AC4 witness passes pre-fix | **fixed** by excision (§ R.4) |
| F007 | INFO — retired refusal discloses reason/timestamp | unchanged, and now also discloses the row's harness. Still bearer-authenticated, still a fact the claimant's own row carried. No action. |
| minor | `red-invariant.log` stops at the first case | **fixed** — `report.md` now says so explicitly |

## R.10 — Reproducing round 2

```bash
git worktree add --detach ~/pi-hacking/pij-worktrees/s154-r2 23f5cb76
cd ~/pi-hacking/pij-worktrees/s154-r2 && export CARGO_TARGET_DIR=$PWD/target
P=docs/plans/154-tombstone-lift-all-harnesses/reviewer-probes
mkdir -p $P && cp ~/pi-hacking/fs3-tombstone-lift/$P/* $P/

python3 $P/apply-r2.py mutants           # M-r2-*, one at a time, tree restored after each
python3 $P/apply-r2.py probes            # R2a–R2d, printed with --nocapture
python3 $P/apply-r2.py totality          # invariant at both Ok exits, whole suite
python3 $P/apply-r2.py totality-control  # same, plus M1 — must panic
```

`apply-r2.py` resolves the repo root from its own path, edits `registration.rs` in place and restores it in a `finally`, verifying the restore by comparison. Run it only on a throwaway detached worktree.
