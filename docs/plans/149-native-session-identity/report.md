# Plan 149 — native session identity implementation

Coder: `pij-dry-pavetta`. Branch: `149-native-session-identity`.
Pre-fix source: `86855c61dc26551ac7339de61883c067433b9982`.

## Delivered behavior

- `registration_target` selects the Copilot session before process/pane/spawn heuristics. Verified resume clears both tombstone fields and retains the address even if old-process observation would block or fail.
- `seat.native-resumed` carries old/new process, old/new pane, and `reason:native-session-resume` for an incarnation change or tombstone revival. Existing `seat.put` publication remains authoritative registry persistence.
- Queue jobs, parent, authoritative role and Telegram binding remain on the same id. Same-host bootstrap conversations can be retired when returning to a saved session. Explicit verified prebind intent cannot replace the saved address; its own queued work stays on its old prebind id.
- Typed transient registration refusal: HTTP 409, v2 `error:refused`, `details.retryable:true`. Native JS refreshes/retries and never manufactures an id. Wrong endpoint/command/version/error/status and untyped refusal text remain terminal.
- Different native sessions, harness mismatches, relay ownership, unrelated process/pane ownership and incorrect spawn correlation still refuse. Foreign-provenance rows refuse; registry rows are local at rest (`SeatDescriptor.machine` is a federated-view field).
- API paragraph: `docs/how/pij-rs-api.md`, Native Copilot registration.

## Acceptance evidence

| AC | Evidence |
|---|---|
| AC1 | `native_session_resume_lifts_tombstone_and_publishes_incarnation_change`: stable id, new tuple/pane, both tombstone fields cleared, exact event fields |
| AC2 | `native_session_fast_restart_does_not_consult_old_process`; JS retired/withdrawn candidate regressions; actual extension subprocess HTTP409 retry and queue consumption; `native_session_ambiguity_returns_typed_retry_without_mutation` |
| AC3 | `native_session_resume_preserves_queued_mail`: real SQLite/HTTP/OS host, queued original job id/body claimable after revival |
| AC4 | `native_session_resume_preserves_parent_role_and_telegram_binding`: original parent, authoritative role and persisted Telegram binding asserted |
| AC5 | foreign-machine RED regression; distinct-session HTTP registration/mail guard, existing same-pane different-session supersede and spawn-correlation controls |
| AC6 | `native_session_resume_state_shows_new_process_and_no_tombstone`; live `pij state` HTTP projection asserts `pid`, `procStart`, `tombstonedAt`, `tombstoneReason`; API paragraph |
| AC7 | `native-resume-live.ts`, `live-red-final.json`, `live-green-release.json`; real installed Copilot CLI + real isolated daemon/tmux/SQLite, deterministic local provider |

## RED outputs — production source unchanged

Command/cwd: `/Users/jordanknight/.cargo/bin/cargo test -p pij-daemon native_session_ -- --nocapture`, this worktree. Exit **101**. Six new criterion regressions failed; one existing control passed. Full raw output: [red-rust.log](red-rust.log).

```text
Compiling pij-daemon v0.1.0 (/Users/jordanknight/pi-hacking/fs3-native-identity/crates/daemon)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 16.68s
     Running unittests src/lib.rs (target/debug/deps/pij_daemon-043514ab0ddb16b1)

running 7 tests

thread 'registration::tests::native_session_resume_lifts_tombstone_and_publishes_incarnation_change' (9598247) panicked at crates/daemon/src/registration.rs:1540:9:
assertion `left == right` failed
  left: SeatId("pij-mild-elisabet")
 right: SeatId("pij-durable")
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

thread 'registration::tests::native_session_cannot_resume_a_row_from_another_machine' (9598245) panicked at crates/daemon/src/registration.rs:1520:9:
Ok(SeatDescriptor { id: SeatId("pij-remote-native"), machine: Some("another-machine"), harness: Copilot, harness_session: Some("00000000-0000-4000-8000-000000000137"), extension_build: None, extension_path: None, pane: Some("%137"), proc: Some(ProcIdentity { pid: 4242, proc_start: 126 }), folder: "/isolated/native-registration", state: Idle, semantic_state: None, role: None, parent: None, relay: false, tombstoned_at: None, tombstone_reason: None, cross_session_inbound_accept: None, native_extension_delivery: true, spawn_id: None, model: None, provider: None, effort: None })
test registration::tests::native_session_cannot_resume_a_row_from_another_machine ... FAILED
test registration::tests::native_session_resume_lifts_tombstone_and_publishes_incarnation_change ... FAILED
test http::tests::a_native_session_boundary_supersedes_its_own_seat_but_never_another ... ok

thread 'registration::tests::native_session_fast_restart_does_not_consult_old_process' (9598246) panicked at crates/daemon/src/registration.rs:1572:20:
resume must not await the old incarnation sensor: Elapsed(())
test registration::tests::native_session_fast_restart_does_not_consult_old_process ... FAILED

thread 'http::native_tests::native_session_resume_preserves_queued_mail' (9598242) panicked at crates/daemon/src/http/native_tests.rs:293:5:
assertion `left == right` failed: mail: durable address
  left: String("pij-mild-elisabet")
 right: "pij-copilot-fixture"

thread 'http::native_tests::native_session_resume_preserves_parent_role_and_telegram_binding' (9598241) panicked at crates/daemon/src/http/native_tests.rs:293:5:
assertion `left == right` failed: bindings: durable address
  left: String("pij-mild-elisabet")
 right: "pij-copilot-fixture"

thread 'http::native_tests::native_session_resume_state_shows_new_process_and_no_tombstone' (9598243) panicked at crates/daemon/src/http/native_tests.rs:293:5:
assertion `left == right` failed: state: durable address
  left: String("pij-mild-elisabet")
 right: "pij-copilot-fixture"
test http::native_tests::native_session_resume_preserves_queued_mail ... FAILED
test http::native_tests::native_session_resume_preserves_parent_role_and_telegram_binding ... FAILED
test http::native_tests::native_session_resume_state_shows_new_process_and_no_tombstone ... FAILED

failures:

failures:
    http::native_tests::native_session_resume_preserves_parent_role_and_telegram_binding
    http::native_tests::native_session_resume_preserves_queued_mail
    http::native_tests::native_session_resume_state_shows_new_process_and_no_tombstone
    registration::tests::native_session_cannot_resume_a_row_from_another_machine
    registration::tests::native_session_fast_restart_does_not_consult_old_process
    registration::tests::native_session_resume_lifts_tombstone_and_publishes_incarnation_change

test result: FAILED. 1 passed; 6 failed; 0 ignored; 0 measured; 367 filtered out; finished in 0.30s

error: test failed, to rerun pass `-p pij-daemon --lib`
```

Command/cwd: `just copilot-native-test` (expands to `node --test .copilot/extensions/pij/*.test.mjs`), this worktree. Exit **1**. Eight changed-contract regressions failed. Full raw output: [red-js.log](red-js.log). Failure output:

```text
✖ failing tests:

test at .copilot/extensions/pij/extension.test.mjs:555:2
✖ retired native attachment retains its durable id across dropped registration response (379.114417ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   '',
  +   'pij-bright-otter'
  -   'pij-copilot-0123456789abcdef01234567',
  -   'pij-copilot-0123456789abcdef01234567'
    ]
  
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/extension.test.mjs:569:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ '', 'pij-bright-otter' ],
    expected: [ 'pij-copilot-0123456789abcdef01234567', 'pij-copilot-0123456789abcdef01234567' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at .copilot/extensions/pij/extension.test.mjs:578:2
✖ actual HTTP 409 registration retry retains the native id and later consumes queued work (112.4925ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/extension.test.mjs:599:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at .copilot/extensions/pij/store.test.mjs:1347:2
✖ same native session nominates its durable address when tombstoned (0.44275ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  '' !== 'pij-test'
  
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/store.test.mjs:1355:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: 'pij-test',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at .copilot/extensions/pij/store.test.mjs:1347:2
✖ same native session nominates its durable address when native delivery withdrawn (0.036542ms)
  Error [NativeError]: Pane belongs to a different process identity
      at chooseRegistration (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/store.mjs:106:9)
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/store.test.mjs:1348:20)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    retryable: false,
    safeDiagnostic: 'Pane belongs to a different process identity'
  }

test at .copilot/extensions/pij/store.test.mjs:1394:1
✖ same-process A to B to A restores the retired native address and accepted journal (20.70925ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + ''
  - 'pij-bright-otter'
  
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/store.test.mjs:1434:9)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '',
    expected: 'pij-bright-otter',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at .copilot/extensions/pij/store.test.mjs:1505:1
✖ same-session address precedes spawn preallocation and retains correlated parent (0.147208ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'pij-preallocated'
  - 'pij-test'
         ^
  
      at TestContext.<anonymous> (file:///Users/jordanknight/pi-hacking/fs3-native-identity/.copilot/extensions/pij/store.test.mjs:1525:9)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)

[Showing lines 1-300 of 350. Use :301 to continue]
```

AC5's already-correct distinct-session refusals are green pre-fix controls; falsifying those to manufacture RED would not prove preservation. The new foreign-machine guard did fail pre-fix. Some old tests encoded the obsolete incarnation-as-identity policy; their assertions were migrated or replaced, not suppressed.

## AC7 live execution

Reproduce with a newly built worktree binary:

```sh
node_modules/.bin/tsx docs/plans/149-native-session-identity/native-resume-live.ts /tmp/unique-native-149-receipt.json
```

The script refuses receipt overwrite. Launch under a supervised process; it creates its own daemon port/state-dir, HOME/COPILOT_HOME, Claude config home, tmux `-L` socket and workspace, and shuts down only those owned resources. No production daemon restart, production send, global extension/config write, push, PR or merge.

Pre-fix live failure: after native `/exit`, same-window resume retained `pij-distinct-wolf`; after the next exit and canonical owner-close, new-window `--resume` changed it to `pij-youthful-indiscretion`. Both refer to the same native session. Exact failure:

```text
AssertionError [ERR_ASSERTION]: native session retains seat id
+ actual - expected

+ 'pij-youthful-indiscretion'
- 'pij-distinct-wolf'
       ^

    at <anonymous> (/Users/jordanknight/pi-hacking/fs3-native-identity/docs/plans/149-native-session-identity/native-resume-live.ts:112:10)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
```

Final live **passed**, native session `f010da4e-09a9-4270-8ee2-eb3f8b43ae63`, daemon `127.0.0.1:52395`, private tmux socket `pij-149-fad09fae-a502-4a62-a690-486f2a0065d5`:

| Leg | Seat id | Pane | Host pid | Message id | Job id |
|---|---|---|---|---|---|
| spawn | pij-better-ifechi | %1 | 84354 | — |  |
| same-window | pij-better-ifechi | %1 | 87580 | 6637af55-7a65-4045-933c-370bdf6db389 | 1 |
| new-window | pij-better-ifechi | %2 | 88468 | 25a11faf-e2ad-4bdd-a1de-ebe6ab46ee07 | 2 |

Both gap messages have native-history arrival and `reader-read` acknowledgements; state readbacks contain the new process and null tombstone fields. New-window proof retires the exited seat using canonical self-close after a dry-run reaper proves dead process + absent pane; this exercises tombstone revival without depending on sweep cadence. Captured receipts include old/new tuple, job payload/state, native terminal and daemon output. Same-window stays in the same pane; new-window uses a different pane.

**Evidence grade:** actual installed Copilot CLI and its SDK extension, real OS processes, real daemon HTTP and SQLite, real tmux. Provider responses are a deterministic local fixture, not a remote-model/provider claim. AC7 does not require model reasoning. Initial warmup writes a real native user turn so Copilot persists the session before `/exit`.

## Operational risks and harness feedback

- Existing ambiguous duplicate rows remain a typed retryable refusal rather than guessing which address owns queued work. This change prevents new duplication; it does not merge historical ids or move their queues. Operator reconciliation of already-duplicated production conversations is separate, destructive work.
- Native session claims are trusted within the existing machine bearer/verified executable+process boundary; this does not introduce per-seat cryptographic authentication.
- Registry persistence and the additional resume notification use existing registry/event-bus patterns; the registry `seat.put` is authoritative. The new descriptive event is not a second identity store.
- Encoded improvement: retained focused same-window/new-window+tombstone scenario, with persisted native warmup and queue/ACK assertions. The old large native smoke only covered a dead-host new-window leg and could pass without touching tombstones.
- Harness observation `DL-001` / fingerprint `f21ccd4d854b` captures this proof gap. Worktree dependency boot was repaired with `just worktree-deps` (358 local links), never touching main dependencies. No changelog exists in this checkout; API documentation is updated instead.

## Spawn/session composition edge

The first implementation passed the daemon prebind test but JS rejected a fresh verified spawn correlation when the saved session carried an older spawn id. A throwaway real-module probe reproduced that refusal before the correction ([red-prebind.log](red-prebind.log)). The boundary now keeps the saved address/parent, carries the newly corroborated spawn correlation, and the daemon discovers and retires that exact unbound prebind while retaining its queue. The new correlation is stored on the resumed incarnation so a repeated registration remains valid after the prebind retires; the HTTP regression checks the repeated response is `binding:same`. The probe then passed ([green-prebind.log](green-prebind.log)).

Retirement checks are **brakes**, not age-based retention policy: removing the verified prebind/spawn or same-host predecessor conditions could only broaden retirement. Retirement changes registry rows only; it neither deletes queued work nor terminates a process/pane. Native session matching is the identity policy.

The final nomination check also found that stale pane metadata was examined before session identity. The real-module probe failed before the ordering fix ([red-pane.log](red-pane.log)) and then passed ([green-pane.log](green-pane.log)); the regression also ensures duplicate same-session/process candidates remain retryable. The daemon still verifies the claimed pane ancestry.

Live resume events on the final artifact: `10` (`pij-better-ifechi`), `17` (`pij-better-ifechi`). Binary and file SHA-256 provenance: [artifact-provenance.json](artifact-provenance.json).

## Gate evidence

Implementation commit: **`7f9e1cb2e88adc00c4b570683be7d649d34a78eb`**. The completion SHA includes this source commit and a subsequent evidence-only commit. All source hashes and the exercised binary hash are in [artifact-provenance.json](artifact-provenance.json).

| Gate | Actual result |
|---|---|
| `/Users/jordanknight/.cargo/bin/cargo test --workspace` | exit 0; 1079 passed across 85 suites; `RUST_TEST_THREADS=1` in final run, no test-selection filter |
| `/Users/jordanknight/.cargo/bin/cargo fmt --all --check` | exit 0; empty output |
| `/Users/jordanknight/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` | exit 0 |
| `/Users/jordanknight/.cargo/bin/cargo build -p pij-cli --bin pij-rs` | exit 0; final live scenario exercised this binary |
| `node --test .copilot/extensions/pij/*.test.mjs` | exit 0; 181 tests, 178 passed, 3 platform skips, zero failed |
| `just self-check` | exit 0; 241 Vitest files passed, 4 skipped; 5306 tests passed, 22 skipped; native JS, Windows-compatible focused tests, all 11 smoke scenarios, report-only audit, snapshots, attribution all executed |
| bare `node_modules/.bin/biome check` | direct `$?` captured as `BIOME_EXIT=0`; 540 files checked; no fixes; one pre-existing schema-version info notice |

Final full project gate environment: inherited PATH preserved with Cargo added; `VITEST_MAX_WORKERS=1`. Every sensor/test runs: this changes concurrency, not coverage. Earlier concurrent runs had varying real-process observation refusals; a first ad-hoc PATH override also hid installed `/usr/local/bin/pwsh`, corrected by preserving inherited PATH. The first cold Pi smoke waited on extension package cloning and failed the 30-second idle window; `just smoke` then passed alone, and the full final `just self-check` passed including smoke. Harness observation **DL-002** records the concurrency/boot friction. The installed Vitest 4.1.10 supports this worker environment variable; the old configuration comment saying otherwise is stale.

Full receipts: [gate-rust.log](gate-rust.log), [gate-native-js.log](gate-native-js.log), [gate-self-check.log](gate-self-check.log), [gate-biome.log](gate-biome.log).

Compiled gates tail:

```text
running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

    Checking pij-daemon v0.1.0 (/Users/jordanknight/pi-hacking/fs3-native-identity/crates/daemon)
    Checking pij-cli v0.1.0 (/Users/jordanknight/pi-hacking/fs3-native-identity/crates/cli)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.40s
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.39s
```

Native JS tail:

```text
✔ invalid semantic consent or native proof holds receiving without hiding outgoing (2.696375ms)
ℹ tests 181
ℹ suites 0
ℹ pass 178
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 8351.727958
```

Self-check tail:

```text

⚠ REVIEW (report-only, not blocking): 1/4 entry flagged — aggregate fail
  • git:github.com/ghoseb/pi-askuserquestion: fail (4 fail, 13 warn) — keep, or: npm run pkg disable git:github.com/ghoseb/pi-askuserquestion
just snapshots-check
npm run snapshots:check

> pij@0.1.0 snapshots:check
> tsx harness/scripts/snapshot-check.ts

✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
just pij-commit-trailers
node_modules/.bin/tsx harness/scripts/pij-commit-trailers.ts "$@"
pij-commit-trailers: warn — 0 missing across 1 harness commit(s) since merge-base with main
86855c61dc26551ac7339de61883c067433b9982: Pij-Seat applicability unresolved (no unique registered native session); confirm whether the committer was the prime
Advisory only: add derived trailers after a blank line alongside harness attribution; do not rewrite shared history automatically.
```

## Report-and-continue audit findings

The green exit does **not** mean every third-party package is safe. The unchanged manifest entry `git:github.com/ghoseb/pi-askuserquestion` reports **aggregate fail (score 58), 4 fail / 13 warn**: disallowed Microsoft-feed lockfile hosts; critical Vitest/coverage-istanbul findings; high nanoid and undici findings; moderate pi-coding-agent / Vitest mocker findings; no detected license. Full rule-level findings are retained in `gate-self-check.log`. Policy is report-and-continue: no package was removed or accepted on the user's behalf. Operator choice remains keep, or `npm run pkg disable git:github.com/ghoseb/pi-askuserquestion`.

Attribution audit also flags only the pre-existing plan commit `86855c61dc26551ac7339de61883c067433b9982` as having unresolved Pij-Seat applicability, with **0 missing** trailers. No shared history was rewritten. Both implementation/evidence commits use native `pij-rs commit-trailers` output at commit time.

## Closeout

All ACs have concrete transition/guard evidence; ambiguity of historically duplicated production ids remains explicitly unmerged. No push, PR, merge or production restart. Friction is harvested here from DL-001/DL-002; the focused native resume scenario is the encoded harness improvement. Next improvement offered to the parent: wire this focused scenario into the opt-in native smoke recipe so future lifecycle changes cannot miss same-window and tombstone revival coverage.

