# Plan149 — fix round2 report

Coder: `pij-dry-pavetta`; prime: `pij-far-jackal`; branch: `149-native-session-identity`.

**Fix source commit: `2675854c93d823385018172cdd3fa31e5e46e037`.** Completion SHA includes the subsequent evidence-only commit. Review baseline: `6be799ec248e1a4c2456aba97c7396e48bdc8834`. Parent-authored reviewer/fix packet commits are preserved. Rulings: [packet-fix.md](packet-fix.md); original cross-model findings: [review.md](review.md).

## Delivered contract

- Verified spawn prebind wins its allocated **id and parent**. Otherwise native `harness_session` selects the address: live first, greatest `proc_start`, ascending id only as final tie.
- Only **multiple live** same-session addresses are ambiguous. One live address plus tombstones resumes that address; all-history sessions resume the newest incarnation. A verified unbound prebind is explicit spawn intent, not another incumbent.
- Ordinary native resume retains queue address, parent, authoritative role and Telegram binding; clears both tombstone fields; records `seat.native-resumed`. New native incarnation does not wait for incumbent liveness/death sweep.
- Explicit spawn retires the saved live address with `seat.native-superseded` (`successor`, `spawn_id`, `reason:native-spawn-prebind`). Both addresses keep their original jobs/bindings. The actual `/v1/spawn` waiter now resolves the allocated child rather than504. Non-native parent-update behavior remains unchanged.
- Owner drift returns typed retry without retirement. Register/adopt error projections preserve HTTP409, v2 `error:refused`, boolean `details.retryable:true`; other ownership refusals remain terminal. Current ordinary adopt cannot enter native owner-observation; its new proof is explicitly an error-projection test.

## Corrections to round1 claims

| Finding | What was claimed; what was true; correction |
|---|---|
| F001 | Historical duplicates were described as transient ambiguity and deferred reconciliation. They actually caused permanent409 because tombstones never disappear. Four real production sessions are now proven to register from a read-only snapshot. |
| F007 | Session lookup was described as identity-first but selected registry alphabetical order, including tombstones. Ranking is now explicit; adversarial live/history/newest/id-tie fixtures prove it. |
| F002 | Keeping a saved parent was called preservation. During explicit spawn it flipped the requested parent to the old parent, retired the allocated id and left its waiter timing out504. Verified prebind now wins; registration and real spawn-waiter tests independently prove retirement and unchanged queue addresses. |
| F003 | Fast restart was proven, but incumbent exclusivity was not. The dependency on Copilot's `inuse.<pid>.lock` is now named in the API and risks below; no liveness probe was reintroduced. |
| F004 | The foreign-machine RED test used a synthetic in-memory row. SQLite clears `machine` on every write, so no reachable production refusal was demonstrated. Guard retained; evidence now explicitly defence-in-depth. |
| F005 | Adopt silently collapsed Retryable to400. It now preserves409 and the discriminator, with a projection-boundary test, not a fabricated claim of reachable native adoption. |
| F006 | Restored owner-drift test; pane diagnostic brake and independent retirement/correlation witnesses each went RED by deletion. Old prebind-retirement and client `!prebind` escapes were removed rather than retained as compatibility code. |
| F008 | Routine full gate logs were needless bulk. Every committed `gate-*`, `red-*`, `green-*` log now has command/exit headers and at most60 output lines. Four round1 inline Node probes are marked historical; their inline fixture source was not retained and they are not round2 proof. |

## Production defect population — actual isolated daemon

Source opened SQLite **read-only** and used its online backup API for a consistent snapshot, including committed WAL data. Immutable snapshot SHA256:

`1853577747618141a7fca4a9a73bad3f483ccb3cbf675cccf6bb7aa816a931b0`

Snapshot: `/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-149-round2-mi4r7sn_/production-readonly.sqlite`. It remained byte-identical after replay. The fixed daemon used a separate writable clone, not the source or immutable snapshot. All seat rows were preserved. Only executable work was removed from the **private clone** before boot:9096 queued jobs,82 background jobs,0 spawn records. This prevents replaying production work; it is not evidence of queue migration. Queue preservation is independently proven by the SQLite HTTP tests.

Isolated daemon: `127.0.0.1:63385`; tmux socket: `pij-149-copy-75602de7-0d78-40a1-92a7-36e613121909`; HOME/Copilot/Claude homes are private under `/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-149-round2-mi4r7sn_/production-proof`. Acceptance never used127.0.0.1:7461, production tmux, production credentials, or production homes. Death sweep interval was3600000ms, preventing the fixture's original live/history distinction changing before registration. The proof uses real HTTP/SQLite and owned OS-verified inert `copilot` executables, **not** SDK/model inference. Separate AC7 below uses the real Copilot CLI.

Command: `python3 /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-149-round2-mi4r7sn_/production-copy-proof.py` — **exit0**. Full four request/response records and isolation facts are retained in [artifact-provenance.json](artifact-provenance.json) under `round2.production_copy`.

| Native session | Rows / live before | HTTP | Resumed address |
|---|---:|---:|---|
| `3ca048e4-9f2f-486c-a652-b85e60726922` | 3 / 0 | 200 | `pij-isolated-mollusk` |
| `47a987ea-9191-4543-a144-330009718afb` | 2 / 1 | 200 | `pij-religious-rennala` |
| `7a582862-748a-4b07-b35c-2dcd067b3e7b` | 3 / 1 | 200 | `pij-continental-flamingo` |
| `d0d682ed-4249-498b-b974-1795c3476e12` | 2 / 1 | 200 | `pij-other-sobeck` |

Each request used `id:""`, the original session UUID and a newly observed owned host tuple. Returned id matched the ranked original row; tombstone was absent. The `7a582862…` session is the defect named in the plan itself.

## RED proof — unchanged reviewed production code

Baseline `6be799ec248e1a4c2456aba97c7396e48bdc8834` production registration/client modules were restored temporarily while retaining the new test bodies, then fixed sources restored in `finally`. Commands and exit codes are in [red-round2-rust.log](red-round2-rust.log), [red-round2-js.log](red-round2-js.log), and [red-round2-spawn-extension.log](red-round2-spawn-extension.log).

`cargo test -p pij-daemon --lib native_ -- --nocapture`: **exit101,63 pass /5 fail**. Both history fixtures returned409 instead of200. Spawn waiter returned504 instead of200. Saved-id precedence selected `pij-copilot-fixture` instead of `pij-new-prebind`.

```text
thread 'http::native_tests::native_session_all_tombstones_resume_newest_process_not_first_id' (12442972) panicked at crates/daemon/src/http/native_tests.rs:213:5:
thread 'http::native_tests::native_session_live_address_outranks_two_newer_tombstones' (12443291) panicked at crates/daemon/src/http/native_tests.rs:213:5:
thread 'http::native_tests::native_spawn_wait_resolves_prebound_child_resuming_saved_session' (12444962) panicked at crates/daemon/src/http/native_tests.rs:791:5:
thread 'http::native_tests::native_sqlite_http_prebind_precedes_saved_session_without_retargeting_work' (12448946) panicked at crates/daemon/src/http/native_tests.rs:641:5:
thread 'registration::tests::native_historical_session_tie_uses_id_only_after_incarnation' (12450401) panicked at crates/daemon/src/registration.rs:2724:20:
test result: FAILED. 63 passed; 5 failed; 0 ignored; 0 measured; 312 filtered out; finished in 7.50s
```

`node --test .copilot/extensions/pij/store.test.mjs .copilot/extensions/pij/extension.test.mjs`: **exit1**. Verbatim baseline failures for ten new/changed contract witnesses:

```text
✖ two-live native ambiguity refreshes until one live address remains beside tombstoned history (1843.143417ms)
✖ live native address outranks newer tombstones in adversarial alphabetical order (0.097583ms)
✖ all-tombstoned native addresses select newest process with missing starts last and id tie break (0.065667ms)
✖ same-session nomination leaves missing historical process verification to the daemon (0.459542ms)
✖ verified spawn allocation retains its id and parent over a correlated session address (0.203541ms)
✖ fresh verified spawn keeps its allocated identity and journal separate from the saved session (21.03525ms)
✖ verified spawn with a compatible saved session retains the allocated parent (0.236959ms)
✖ spawn prebind cannot bypass ownership for relay allocation (0.217291ms)
✖ spawn prebind cannot bypass ownership for different native session (0.066083ms)
✖ saved native session alone cannot corroborate a wrong requested id with matching spawn (0.116458ms)
```

The first spawned-extension test used an invalid fixture pane and timed out; **that timeout is excluded as proof**. Corrected numeric-pane fixture was rerun against the baseline client with `node --test --test-name-pattern="spawned extension" .copilot/extensions/pij/extension.test.mjs`: **exit1**, actual identity mismatch:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'pij-saved-session'
  - 'pij-allocated-child'
         ^
```

All fixed native tests then passed before mutation probes. Already-correct guards are not falsely labelled baseline failures: their RED evidence is deletion below.

## RED by deletion —20 independent mutations

Each mutation changed one condition on otherwise fixed production code; its targeted tests ran; the original source was restored before the next. All eight Rust runs exited101, all twelve JS runs exited1, **none failed compilation**. Full command, exact before/after mutation text and observed failure names are in `artifact-provenance.json#round2.mutations`.

- `rust-owner-drift`: delete post-observation owner revalidation. Both dead-owner and prebind ownership changes are tested; no mutation may escape on retry.
- `rust-live-ambiguity`: delete the live ambiguity guard.
- `rust-pane-brake`: delete auto-bootstrap pane equality. Later guards still reject; the test pins the **actual conflicting address in the diagnostic**, not literal prose or a claim that deletion alone permits retirement.
- `rust-retirement`: delete `.chain(spawn_predecessor)`; both HTTP registration/queue and spawn-waiter consumers fail independently.
- `rust-spawn-correlation`: delete exact spawn authorization; an invented correlation and another pane's real allocation fail independently.
- Ranking mutations remove live/incarnation ordering; adopt mutation restores400. JS mutations remove live ambiguity, ranking/id tie, requested-id/spawn authorization, legitimate same-process successor correlation, or individual prebind/harness brakes.

Verbatim failure lines, covering every new/changed guard test:

```text
rust-owner-drift (exit 101)
thread 'registration::tests::native_observed_owner_drift_returns_retryable_without_retirement' (12717698) panicked at crates/daemon/src/registration.rs:2748:13:

rust-live-ambiguity (exit 101)
thread 'http::native_tests::native_session_ambiguity_returns_typed_retry_without_mutation' (12722229) panicked at crates/daemon/src/http/native_tests.rs:213:5:

rust-pane-brake (exit 101)
thread 'registration::tests::native_bootstrap_other_pane_refusal_identifies_conflicting_address' (12727614) panicked at crates/daemon/src/registration.rs:2787:9:

rust-retirement (exit 101)
thread 'http::native_tests::native_spawn_wait_resolves_prebound_child_resuming_saved_session' (12734727) panicked at crates/daemon/src/http/native_tests.rs:862:5:
thread 'http::native_tests::native_sqlite_http_prebind_precedes_saved_session_without_retargeting_work' (12736766) panicked at crates/daemon/src/http/native_tests.rs:213:5:

rust-spawn-correlation (exit 101)
thread 'http::native_tests::native_session_rejects_unverified_spawn_correlation_without_retiring_owner' (12744095) panicked at crates/daemon/src/http/native_tests.rs:213:5:
thread 'registration::tests::native_saved_resume_cannot_borrow_unrelated_spawn_intent' (12749098) panicked at crates/daemon/src/registration.rs:1647:9:

rust-live-ranking (exit 101)
thread 'http::native_tests::native_session_live_address_outranks_two_newer_tombstones' (12753421) panicked at crates/daemon/src/http/native_tests.rs:213:5:

rust-incarnation-ranking (exit 101)
thread 'http::native_tests::native_session_all_tombstones_resume_newest_process_not_first_id' (12757982) panicked at crates/daemon/src/http/native_tests.rs:213:5:

rust-adopt-discriminator (exit 101)
thread 'http::identity::tests::adopt_registration_retryable_error_preserves_conflict_discriminator' (12762311) panicked at crates/daemon/src/http/identity.rs:668:9:

js-live-ambiguity (exit 1)
✖ two live native addresses remain retryable despite tombstoned history (0.288041ms)
✖ native session resolution precedes stale pane metadata and duplicate process candidates (0.149458ms)
✖ two live same-session addresses cannot hide behind an exact process or verified prebind (0.09ms)

js-live-ranking (exit 1)
✖ live native address outranks newer tombstones in adversarial alphabetical order (0.482375ms)

js-incarnation-ranking (exit 1)
✖ all-tombstoned native addresses select newest process with missing starts last and id tie break (0.462292ms)

js-id-tie (exit 1)
✖ all-tombstoned native addresses select newest process with missing starts last and id tie break (0.483167ms)

js-requested-id (exit 1)
✖ manual identity requests daemon allocation; exact process rollover supersedes predecessor (0.606625ms)
✖ saved native session alone cannot corroborate a wrong requested id with matching spawn (0.103541ms)
✖ same-session nomination cannot corroborate an unrelated requested identity (0.06275ms)
✖ exact native process cannot corroborate an incorrect requested id (0.066583ms)

js-spawn-correlation (exit 1)
✖ spawn binding requires exact process, pane and correlation (0.301625ms)
✖ same-process A to B to A restores the retired native address and accepted journal (19.704708ms)
✖ correct requested id cannot corroborate an incorrect spawn correlation (0.225375ms)

js-successor-correlation (exit 1)
✖ same-process native successor reload corroborates immutable launch id by spawn correlation (0.092916ms)
✖ spawned native rollover preserves correlation across extension reload (0.094083ms)

js-prebind-tombstone (exit 1)
✖ spawn prebind cannot bypass ownership for tombstoned allocation (0.290583ms)

js-prebind-pane (exit 1)
✖ spawn prebind cannot bypass ownership for different pane (0.301125ms)

js-prebind-process (exit 1)
✖ spawn prebind cannot bypass ownership for bound process (0.286541ms)

js-prebind-harness (exit 1)
✖ spawn prebind cannot bypass ownership for foreign harness (0.290083ms)

js-candidate-harness (exit 1)
✖ foreign harness cannot nominate a native session or yield its occupied pane (0.447584ms)
```

Retirement predicates are **one-directional brakes**: removing them can broaden eligible retirement. Native identity ranking and explicit spawn precedence are **policies**: removing them changes which address wins. No operation deletes mail or kills an incumbent process/pane.

## AC1–AC7 and final native runtime

| AC | Final evidence |
|---|---|
| AC1 | Tombstone revival, stable id and exact `seat.native-resumed` payload test; historical duplicate HTTP fixtures; four production-copy sessions above |
| AC2 | `native_session_fast_restart_does_not_consult_old_process`; real extension typed-retry test; live-only ambiguity/no mutation; deterministic owner-drift interleaving |
| AC3 | `native_session_resume_preserves_queued_mail`; both prebind/saved queue tests; final live reader ACKs below |
| AC4 | `native_session_resume_preserves_parent_role_and_telegram_binding`; explicit-spawn exception retains allocated parent/coder role and saved address's original bindings |
| AC5 | Reachable distinct-session, harness, relay, process/pane and spawn ownership refusals; synthetic foreign-provenance guard only |
| AC6 | Real `/v1/state` new `pid`/`procStart` and cleared `tombstonedAt`/`tombstoneReason`; unchanged v2 envelopes except typed retry; updated API |
| AC7 | Real installed Copilot CLI, actual native extension, daemon/HTTP/SQLite, private tmux and deterministic local provider; final receipt [live-green-release.json](live-green-release.json) |

Final binary SHA256: `0aa87ed15b8707808b1dc249feabb2d44a6263927598f273bf4f744cfa8e20c0`. Final native session: `9048a6f8-0833-41b0-8a8f-c337d9891271`. Daemon: `127.0.0.1:63383`; socket: `pij-149-1f37b103-bd56-4067-ad6c-989eb818379b`. Initial id `pij-tory-pig`, pid95476, pane`%1`.

Command: `node_modules/.bin/tsx docs/plans/149-native-session-identity/native-resume-live.ts /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-149-round2-mi4r7sn_/live-green-final-artifact.json` — **exit0**.

| Leg | Stable address | Pane | New host pid | Original job / message | ACK |
|---|---|---|---:|---|---|
| same-window | `pij-tory-pig` | `%1` | 99994 | 1 / `9f8bb980-380b-48b2-bcf8-97ead76f2e6c` | reader-read |
| new-window | `pij-tory-pig` | `%2` | 2137 | 2 / `e34f73da-4902-4177-adc4-b410029e70cc` | reader-read |

Both jobs changed `pending`→`done`; actual native arrival and `reader-read` ACK were observed. New process and cleared tombstones were asserted via real `/v1/state`. Resume events were spine seq10 and17. Warmup persisted the native conversation before exit. New-window leg used canonical self-close after dry-run reap proved the owned pane absent; this proves deterministic tombstone revival, not automatic death-sweep timing. No remote inference claim. Original pre-feature live RED remains [live-red-final.json](live-red-final.json).

## Final gates

All listed commands exited0. Inherited PATH preserved with Cargo prefixed; `RUST_TEST_THREADS=1`, `VITEST_MAX_WORKERS=1` change concurrency, not test selection.

| Command | Observed result |
|---|---|
| `cargo test --workspace` | 1088 passed,85 suites,8 ignored |
| `cargo fmt --all --check` | clean, no output |
| `cargo clippy --workspace --all-targets -- -D warnings` | zero warnings |
| `cargo build -p pij-cli --bin pij-rs` | final exercised binary built |
| `node --test .copilot/extensions/pij/*.test.mjs` |197 tests:194 passed,3 platform skips,0 failures |
| `just self-check` |241 Vitest files passed,4 skipped;5306 passed,22 skipped; native tests,84 portable Windows tests, all11 smoke scenarios, report-only audit, snapshots and attribution all executed |
| bare `node_modules/.bin/biome check` then `$?` | `BIOME_EXIT=0`;540 files;1 pre-existing schema-version info |

Receipts: [gate-rust.log](gate-rust.log), [gate-native-js.log](gate-native-js.log), [gate-self-check.log](gate-self-check.log), [gate-biome.log](gate-biome.log). Closing canonical gate evidence:

```text
✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)
pij-commit-trailers: warn — 0 missing across 3 harness commit(s) since merge-base with main
Advisory only: add derived trailers after a blank line alongside harness attribution; do not rewrite shared history automatically.
```

Initial Clippy caught the adopt test module before production items; it was moved intact to file end and the full Rust gates rerun. Initial project gate failed only in unrelated flow-pair Git-fixture teardown (`ENOTEMPTY`,5305 other tests passed); retained `.git` contained only `ai/logs` and `ai/working_logs`. The fixture now reuses existing `removeTemporaryTree` with3 bounded native retries, still failing persistent cleanup errors. Its6 tests plus the helper's2 tests passed; then the complete canonical gate passed. No assertion, filter, hook or failure was suppressed. This is the only extra source path: `skills/flow-pair/test/identity.test.ts`. Failure tail: [red-round2-fixture-cleanup.log](red-round2-fixture-cleanup.log).

## Operational risks and closeout

- **External exclusivity dependency:** Copilot's `inuse.<pid>.lock` must allow only one live host per session. Pij does not prove incumbent death. Violation can leave an old long-poll while the new tuple takes the address, temporarily allowing two receivers. Adding incumbent liveness would defeat AC2; documentation, not a new probe, is the accepted fix.
- Bearer plus verified executable/process is the existing machine-trust boundary, not per-seat cryptographic authentication. SQLite clears foreign provenance at rest; the synthetic guard would refuse if it were ever stored.
- Multiple **live** duplicate addresses still409 and require closing the unwanted live address; historical queues are not merged. Explicit spawning is an intentional identity-policy exception, not transparent saved-mail migration.
- Registry `seat.put` remains authoritative; descriptive resume/supersession events use existing EventBus persistence patterns, not a second identity store.
- Audit remains report-and-continue: unchanged `git:github.com/ghoseb/pi-askuserquestion` reports aggregate **fail,score58,4 fail/13 warn** (critical Vitest/coverage findings, high nanoid/undici, disallowed lockfile hosts, no detected license). Nothing was removed or accepted on the user's behalf; operator may keep or `npm run pkg disable git:github.com/ghoseb/pi-askuserquestion`. Attribution warns on the three earlier harness/packet commits with0 missing trailers; shared history was not rewritten.

Harness observations DL-001/DL-002 are harvested here: fresh-roster tests missed historical production population; Git instrumentation repopulated a temporary `.git` during teardown. Encoded improvements are adversarial historical-roster regressions and adoption of the existing bounded fixture-cleanup helper. Suggested next harness improvement: run the retained focused native lifecycle scenario in the opt-in native smoke recipe. No push, PR, merge, production restart or production acceptance run. **No accepted finding refused.**

One-off baseline/mutation/production-copy driver scripts were removed after evidence capture. Exact mutation patches and production request/response bodies remain in provenance; the permanent native lifecycle scenario remains executable.
