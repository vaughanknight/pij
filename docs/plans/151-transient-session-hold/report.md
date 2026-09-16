# Plan151 — transient native session hold

**Source commit:** `6216e984dbd46cebf46c3c1812bd6dc9c9c660dc`.
**Baseline:** `f619fc05ca49d5cc0d127b38d568333fdb1e0267` (plan packet on main cf08eacd).
AC0–AC6 verified. Rust and canonical gates exited0; the invalid Node directory invocation was corrected to the complete native test-file selection. No production daemon, Copilot seat or pane was changed. Prime owns PRD reconciliation, push, PR and merge.

## AC0 — RED before implementation; branch pinned

The first exact-shape probe used real installed Copilot, `/restart`, a private HOME/state directory and tmux socket, HTTP and SQLite. Before forwarding the restarted host's real saved-session registration, it submitted a **synthetic unknown-session claim** from that same real host. Pane process and owning host were both52512; claimant54125 had observed parent52512. This is production-shape HTTP/OS evidence, not a claim that Copilot emitted the synthetic session. [ac0-exact-red.json](ac0-exact-red.json):

```json
{"ok":false,"command":"pij register","v":2,"meta":"native Copilot registration refused: process, native session, or pane already belongs to seat `pij-determinist`","error":"refused"}
```

HTTP400, scenario exit1 (`400 !== 409`). Pinned **pre-fix `registration.rs:1165–1173`, refusal at1170**; not the explicit foreign-seat-id refusal at523.

A stronger baseline subsequently reproduced the **actual extension's own throwaway-session claim**. The unmodified baseline daemon and extension were frozen outside the worktree before implementation could change them. Only the owned restarted CLI child was paused for15s, after the transient extension had joined the SDK and requested the roster. Its extension process continued normally. This explicit scheduling control lets a brief native bootstrap window exercise registration; it does not modify Copilot or manufacture a session/HTTP response.

[ live-stretch-red.json ](live-stretch-red.json): owner48396, restarted child50909, pane `%1`, transient `abcb67b1-a757-45b0-aeda-bbb8025317ef`:

```json
{"ok":false,"command":"pij register","v":2,"meta":"native Copilot registration refused: process, native session, or pane already belongs to seat `pij-dull-nigel`","error":"refused"}
```

```text
HTTP: 400
SCENARIO EXIT: 1
[pij-native] {"at":"2026-09-16T03:12:57.903Z","kind":"extension-unavailable","holdKind":null,"safeDiagnostic":"Pij HTTP 400","retryMs":null}
```

The paused CLI could not render the pending native log before its transient fork stopped. Therefore this baseline proves actual400→terminal extension failure, **not a measured wall of native timeline lines or repeated supervisor forks**. The production observation remains the user's evidence for those effects.

## AC1 — typed HOLD; not admission

The new `native_transient_session_holds_without_mutating_owner_or_queue` test failed before production changes. [red-daemon.log](red-daemon.log):

```text
COMMAND: cargo test -p pij-daemon --lib native_transient_session_holds_without_mutating_owner_or_queue -- --nocapture
EXIT: 101
assertion `left == right` failed: HTTP envelope: {"command":"pij register","error":"refused","meta":"native Copilot registration refused: process, native session, or pane already belongs to seat `pij-resume-owner`","ok":false,"v":2}
  left: 400
 right: 409
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 390 filtered out
```

GREEN: HTTP409, `command:"pij register"`, `error:"refused"`, `details:{retryable:true,hold:"native-session"}`. Exact tested reason:

```text
native Copilot registration held: pane owned by seat `pij-resume-owner`; awaiting resumed session
```

`RegistrationError::NativeSessionHold(SeatId)` carries the subtype without parsing prose. The roster scan excludes known sessions, existing targets, dead/tombstoned owners and non-local/non-native ownership. Other roster refusals still win. Normal id/folder/process admission checks run before the pending hold returns; **all returns precede mutation**. Tests assert unchanged roster, queued mail and event history. No new death probe, queue retargeting or identity allocator is added.

This is a conservative non-admission result, not a destructive-action policy. It never retires or kills an owner; removing HOLD restores refusal rather than authorizing a takeover. Existing observed-dead retirement remains unchanged.

## AC2 — guards preserved

[guard-provenance.json](guard-provenance.json) records an exact baseline/current text comparison: both Rust test surfaces contain only inserted tests; every existing test line is unchanged. All15 witnesses below ran and passed in the full workspace gate:

| Existing witness | Protected boundary | Result |
|---|---|---|
| `native_refuses_different_session_harness_and_relay_ownership` | Explicit address/session, harness, relay | PASS unchanged |
| `native_prebind_requires_exact_spawn_id_pane_and_harness` | Spawn correlation | PASS unchanged |
| `native_supersedes_refuses_same_id_same_session_wrong_process_or_existing_target` | Invalid supersedes | PASS unchanged |
| `native_session_cannot_resume_a_row_from_another_machine` | Synthetic foreign provenance | PASS unchanged |
| `cold_resume_can_retire_same_host_bootstrap_without_changing_saved_address` | Bootstrap process/harness/pane/tombstone cases | PASS unchanged |
| `native_saved_resume_cannot_borrow_unrelated_spawn_intent` | Unrelated launch | PASS unchanged |
| `native_bootstrap_other_pane_refusal_identifies_conflicting_address` | Foreign bootstrap pane | PASS unchanged |
| `native_observation_revalidates_cross_seat_process_takeover_before_commit` | Concurrent ownership | PASS unchanged |
| `ordinary_registration_refuses_changed_native_owner_after_readoption` | Ordinary process replacement | PASS unchanged |
| `ordinary_registration_never_inherits_native_capability` | Ordinary capability inheritance | PASS unchanged |
| `ordinary_registration_cannot_relabel_or_supersede_active_copilot_seat` | Ordinary relabel/relay/spawn/supersedes | PASS unchanged |
| `ordinary_withdrawal_preserves_session_and_does_not_enable_later_takeover` | Capability withdrawal | PASS unchanged |
| `native_session_rejects_unverified_spawn_correlation_without_retiring_owner` | HTTP forged spawn preserves mail | PASS unchanged |
| `native_sqlite_http_different_session_cannot_take_existing_address_or_mail` | HTTP foreign address | PASS unchanged |
| `native_sqlite_http_dead_legacy_and_uncorrelated_prebind_owners_are_not_taken_over` | Legacy/prebind owners | PASS unchanged |

New GREEN witnesses:
- `native_transient_session_tombstoned_or_observed_dead_owner_admits_new_address`: tombstone permits a new address; an actual live-owner HOLD becomes admission after killing/reaping only the owned inert fixture host. Mail remains at its original address.
- `native_known_historical_session_resumes_instead_of_holding_live_bootstrap`: a saved historical address follows149, not HOLD.
- `native_transient_hold_never_masks_invalid_claims`, `native_transient_hold_requires_local_attested_native_owner`, `native_known_session_foreign_pane_collision_is_never_a_transient_hold`: refusal precedence and subtype boundaries.

These preservation checks are intentionally GREEN on preserved behavior; they are not falsely labeled pre-fix REDs. The new hold-transition witness supplies the behavioral RED.

## AC3 — alive and quiet

Corrected plan premise: the pre-fix **typed409 already retries** in startup. The measured400 is terminal. Existing retryable diagnostics also immediately print an unavailable banner. Reporter RED:

```text
COMMAND: node --test .copilot/extensions/pij/hold.test.mjs
EXIT: 1
AssertionError [ERR_ASSERTION]: a transient hold must not print an unavailable banner
+ [ '[pij native] unavailable: registration-wait; check the Pij daemon and PIJ_RS_ADDR/PIJ_RS_STATE_DIR; retrying when available; ordinary Copilot remains usable' ]
- []
```

GREEN: only the validated typed registration envelope supplies `NativeError.holdKind`. Startup and bridge re-registration preserve250ms exponential backoff, capped5000ms. Monotonic hold episodes emit no timeline line before10000ms, then one fixed safe waiting line on the first retry at/after that threshold. There is no independent timer; network/request latency can delay that retry beyond10s. Success and non-hold transitions reset the episode. Other terminal/network failures remain visible.

Spawned-extension tests use real extension code, HTTP, disk and subprocess lifetime with explicit SDK/process/clock fixtures: startup and bridge hold→success, five-second cap, threshold silence, one notice, restored delivery/outgoing tools, EOF/native-shutdown cancellation, and re-registration recovery. Reporter/envelope tests cover generic409 and malformed status/version/command/error/retryability without leaking body/key text. **221 passed, 3 platform skips** across all224 native tests.

Fixture repair: the preload's eager `store.mjs` import cached real timers before hooks were installed. The unchanged reporter-only test moved into `hold.test.mjs`; subprocess preload no longer imports store early. Tests await the asynchronous native-log event rather than racing its sink. Timeout diagnostics now include observed events. The initial4 integration failures were fixture defects, not accepted failures; all pass after repair.

## AC4 — actual native `/restart`, one transient fork

Final receipt: [live-green-release.json](live-green-release.json), scenario exit0. Real installed native Copilot CLI/SDK, extension, daemon, HTTP, SQLite and private tmux; deterministic local provider, no remote inference. The15s scheduling intervention described under AC0 is explicit and identical in purpose to the baseline control. The driver verifies the paused child belongs to the recorded owner, resumes it, cancels the timer on cleanup and tears down only its private socket/daemon.

| Observation | Final receipt |
|---|---|
| Address before and after | `pij-specified-barnacle` |
| Saved native session | `49c2573f-54b5-4b6f-94ee-80d5c4a3b96a` |
| Pane | `%1` |
| Owner/pane PID → restarted PID | `15919` → `17809` |
| Actual throwaway session | `26e1bc6c-e118-4f93-8ca1-bbf9c30ec141` |
| Transient registration responses | seven409s |
| Transient extension forks | exactly1 |
| User-visible `[pij native] unavailable` lines | 0 |
| Terminal `extension-unavailable` events | 0 |
| Daemon binary SHA256 | `b1fa5874ec754c95831912b6c1fb44ef75340c05b84670e5c70b9d98086198f5` |

Both **complete extension stderr snapshots** are retained (command/exit headers, fewer than60 output lines each): [live-transient.log](live-transient.log), [live-resumed.log](live-resumed.log). They are also pasted as `extension_logs[].text` in the final JSON receipt. The transient fork is stopped normally by Copilot when the real session resumes; it is not re-forked by a failure loop.

The paused CLI cannot render native timeline RPCs during the control. Its captured timeline has zero waiting/unavailable lines; the exact one-line-after-threshold behavior is independently proven by the subprocess SDK fixture, not falsely claimed as a rendered15s native UI observation.

The first uncontrolled native run's bootstrap ended in about190ms before registration; [live-red.json](live-red.json) is a **proof-gap receipt**, not a behavioral RED. [ac0-red.json](ac0-red.json) used the npm loader as pane process; only `ac0-exact-red.json` proves that the pane process itself is the recorded host. Earlier composed control: [live-stretch-green.json](live-stretch-green.json).

## AC5 — no transient identity or work leak

Final read-only queries against the private SQLite file, after native resume:

```sql
SELECT id FROM seats WHERE harness_session = ?;
-- ['26e1bc6c-e118-4f93-8ca1-bbf9c30ec141'] => []
SELECT id FROM jobs
WHERE serial_key = ? OR json_extract(payload, '$.native_target_session') = ?;
-- [same transient session, same transient session] => []
SELECT id,harness_session FROM seats;
-- [{id:'pij-specified-barnacle',harness_session:'49c2573f-54b5-4b6f-94ee-80d5c4a3b96a'}]
```

The script asserts both empty results and retains schema, parameters/results and complete remaining seat population. No transient row was admitted. Copilot's own temporary session directory is not a Pij seat or job.

## AC6 — contract

[Native Copilot registration](../../how/pij-rs-api.md#native-copilot-registration) now documents when HOLD applies, its typed envelope, non-admission invariant, quiet retry behavior and both resolution paths.149's existing saved-session/spawn identity policies remain unchanged.

## Gates — actual outputs

All executed from this worktree. Cargo used `/Users/jordanknight/.cargo/bin/cargo`; inherited PATH retained with Cargo prefixed, `RUST_TEST_THREADS=1`, `VITEST_MAX_WORKERS=1`.

| Gate | Result | Receipt |
|---|---|---|
| `cargo fmt --all --check` | exit0 after formatter | [gate-rust.log](gate-rust.log) |
| `cargo clippy --workspace --all-targets -- -D warnings` | exit0 | same |
| `cargo build -p pij-cli --bin pij-rs` | exit0 | same |
| `cargo test --workspace` | **1117 passed, 88 suites, 8 ignored** | same |
| `node --test .copilot/extensions/pij/*.test.mjs` | **221 passed, 3 skipped, 0 failed** | [gate-native-js.log](gate-native-js.log) |
| `just self-check` | **exit0; 241 Vitest files, 5308 tests passed**; portable Windows84 passed; all11 smoke scenarios passed | [gate-self-check.log](gate-self-check.log) |
| Final actual native lifecycle | exit0 | [live-green-release.json](live-green-release.json) |

The packet's literal `node --test .copilot/extensions/pij/` exited1 on Node24.7.0 with `MODULE_NOT_FOUND`; Node treated the directory as a module. The explicit `*.test.mjs` selection ran **every native test file**, not a narrowed selection.

Canonical closing lines:

```text
snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
pij-commit-trailers: warn — 1 missing across 1 harness commit(s) since merge-base with main
f619fc05ca49d5cc0d127b38d568333fdb1e0267: missing Pij-Prime
```

That warning belongs to the pre-existing plan packet. Shared history was not rewritten. New commits use fresh derived C11 trailers for `pij-dry-pavetta`, `pij-far-jackal`, plan151. Biome's2.0.0-schema/2.4.14-CLI mismatch is informational.

Package audit remains report-and-continue: `git:github.com/ghoseb/pi-askuserquestion` aggregate fail,4 fail/13 warn. No package was removed and no risk accepted for the user. Operator choice remains keep or `npm run pkg disable git:github.com/ghoseb/pi-askuserquestion`.

## Harness closeout

Harvested DL-001–003 here:358 worktree dependency links repaired without changing main; cold boot smoke timed out but final canonical smoke passed unchanged; the clock-import and async-log fixture defects are fixed; unsupported Node directory invocation is recorded separately from behavior. The permanent real-runtime driver supplies an explicit scheduling control instead of relying on machine load to expose the transient window. Its guard fails if that window was not exercised; no fabricated green.

Encoded improvement: subprocess timeout output now says what was actually observed, and the native hold can be exercised reproducibly without production changes. A future cold-boot sensor could expose package warmup separately from the90s smoke budget; that remains an optional harness improvement, not silently added scope.

## AC4 full native fork stderr

### Transient fork — `user-pij-1789528935687-18384.log`

```text
=== launch pid=18384 module=/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs ===
[extension-fork] resolveBootstrapPath: __dir=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9, argv-bootstrap=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/preloads/extension_bootstrap.mjs
[extension-fork] resolveBootstrapPath: localBootstrap=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/preloads/extension_bootstrap.mjs, localExists=true
[extension-bootstrap] starting: pid=18384, COPILOT_SDK_PATH=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/copilot-sdk, EXTENSION_PATH=/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs, SESSION_ID=26e1bc6c-e118-4f93-8ca1-bbf9c30ec141
[extension-bootstrap] importing extension: /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs
[extension-resolver] resolver hook loaded: pid=18384, COPILOT_SDK_PATH=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/copilot-sdk
=== ready ===
[pij-native] {"at":"2026-09-16T03:22:15.913Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":0,"retryMs":250}
[pij-native] {"at":"2026-09-16T03:22:16.250Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":337.02083400000004,"retryMs":500}
[pij-native] {"at":"2026-09-16T03:22:16.840Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":926.7512919999999,"retryMs":1000}
[pij-native] {"at":"2026-09-16T03:22:17.911Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":1997.4190420000002,"retryMs":2000}
[pij-native] {"at":"2026-09-16T03:22:19.974Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":4060.5596669999995,"retryMs":4000}
[pij-native] {"at":"2026-09-16T03:22:24.046Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":8133.1470420000005,"retryMs":5000}
[pij-native] {"at":"2026-09-16T03:22:29.116Z","kind":"registration-wait","holdKind":"native-session","elapsedMs":13203.134,"retryMs":5000}
=== exit code=0 disposition=stopped-normally ===
```

### Resumed fork — `user-pij-1789528950922-27889.log`

```text
=== launch pid=27889 module=/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs ===
[extension-fork] resolveBootstrapPath: __dir=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9, argv-bootstrap=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/preloads/extension_bootstrap.mjs
[extension-fork] resolveBootstrapPath: localBootstrap=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/preloads/extension_bootstrap.mjs, localExists=true
[extension-bootstrap] starting: pid=27889, COPILOT_SDK_PATH=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/copilot-sdk, EXTENSION_PATH=/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs, SESSION_ID=49c2573f-54b5-4b6f-94ee-80d5c4a3b96a
[extension-bootstrap] importing extension: /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/.copilot/extensions/pij/extension.mjs
[extension-resolver] resolver hook loaded: pid=27889, COPILOT_SDK_PATH=/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-151-live-ivmK4m/home/Library/Caches/copilot/pkg/darwin-arm64/1.0.84-9/copilot-sdk
=== ready ===
[pij-native] {"at":"2026-09-16T03:22:31.140Z","kind":"registered","seat":"pij-specified-barnacle","nativeSession":"49c2573f-54b5-4b6f-94ee-80d5c4a3b96a","pid":17809,"procStart":20260916132215,"pane":"%1"}
```
