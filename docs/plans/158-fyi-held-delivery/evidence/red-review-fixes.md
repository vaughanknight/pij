# RED → GREEN for the #452 review fixes (uther, REQUEST_CHANGES)

Each new test was seen failing before it passed. The failure came either from the behaviour being missing, or from a mutant of the code that now passes it. Mutants were applied in place and reverted, so the tree carries no mutant.

## Rust (daemon, store)

| test | RED source | RED | GREEN |
|---|---|---|---|
| `fyi_http::a_retried_carrier_still_queued_does_not_swallow_a_newer_fyi` (HIGH-1 a) | missing behaviour, pre-fix HEAD `d0ef4d67`+ | panicked fyi_http.rs:402 (fyi-B lost: pending 0) | ok |
| `fyi_http::a_tombstone_resets_a_working_seat_to_idle` (MEDIUM-3) | missing behaviour | panicked fyi_http.rs:502 (state `working`) | ok |
| `delivery::a_failing_fyi_claim_never_fails_the_send` (MEDIUM-1) | missing behaviour, then mutant "no plain fallback" | `Err(Adapter "fake/spine: FYI claim receipt unavailable")`; mutant: FAILED | ok |
| `fyi_http::a_duplicate_of_a_delivered_carrier_leaves_the_fyi_pending` (HIGH-2) | mutant R6 (no duplicate restore, pre-rework) | FAILED | ok |
| `delivery::a_failing_carrier_never_loses_its_fyis` (HIGH-2) | mutant R5 (no carrier-failed restore, pre-rework) | FAILED | ok |
| `fyi_http::a_hook_claim_racing_a_ride_along_delivers_each_fyi_once` (HIGH-2) | mutant R1 (claim without `state='pending'`) | FAILED | ok |
| `registration::a_new_incarnation_does_not_inherit_working` (MEDIUM-3) | mutant: no reset on a new process | FAILED | ok |
| `registry_contract` §8, set_activity over SQLite and the fake (MEDIUM-2) | mutant: activity update without the tombstone guard | FAILED (`store_integration`) | ok |
| store `fyi_contract`: carrier-linked claim, queued retry and delivered duplicate claim nothing | new port method (compile-RED); behaviour covered by the HTTP RED above | — | ok |

Mutant logs (numbers only):

### MEDIUM1-no-plain-fallback
```
test delivery::tests::a_failing_fyi_claim_never_fails_the_send ... FAILED
thread 'delivery::tests::a_failing_fyi_claim_never_fails_the_send' (113897538) panicked at crates/daemon/src/delivery/mod.rs:4575:14:
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 447 filtered out; finished in 0.03s
```

### MEDIUM2-activity-revives-tombstone
```
test the_sqlite_registry_honours_the_same_contract_the_fake_does ... FAILED
thread 'the_sqlite_registry_honours_the_same_contract_the_fake_does' (113902799) panicked at crates/testkit/src/contract.rs:187:5:
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 22 filtered out; finished in 0.05s
```

### MEDIUM3-no-incarnation-reset
```
test registration::tests::a_new_incarnation_does_not_inherit_working ... FAILED
thread 'registration::tests::a_new_incarnation_does_not_inherit_working' (113888774) panicked at crates/daemon/src/registration.rs:3084:13:
  left: Working
 right: Idle
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 447 filtered out; finished in 0.03s
```

### R1-claim-without-pending-guard
```
test a_hook_claim_racing_a_ride_along_delivers_each_fyi_once ... FAILED
thread 'a_hook_claim_racing_a_ride_along_delivers_each_fyi_once' (113504318) panicked at crates/daemon/tests/fyi_http.rs:471:9:
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 11 filtered out; finished in 0.15s
```

### R5-no-carrier-restore
```
test delivery::tests::a_failing_carrier_never_loses_its_fyis ... FAILED
thread 'delivery::tests::a_failing_carrier_never_loses_its_fyis' (113478769) panicked at crates/daemon/src/delivery/mod.rs:4608:9:
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 446 filtered out; finished in 0.03s
```

### R6-no-duplicate-restore
```
test a_duplicate_of_a_delivered_carrier_leaves_the_fyi_pending ... FAILED
thread 'a_duplicate_of_a_delivered_carrier_leaves_the_fyi_pending' (113451119) panicked at crates/daemon/tests/fyi_http.rs:440:5:
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 11 filtered out; finished in 0.11s
```

## Extensions (ExtGuardTests; see agent report)

| id | test | RED |
|---|---|---|
| T3 | agent_end repairs idle when turn_end's idle publication failed | mutant: delete the `!willContinue` idle → `expected ['working'] to deeply equal ['working','idle']` |
| T9 | agent_end publishes nothing while the agent will continue | mutant `if (true)` → length 3 ≠ 2 |
| T11 | an in-process OMP subagent's turn claims nothing | mutant: drop the embedded-child guard → `expected {message} to be undefined` |
| T12 | stops publishing once the daemon has no activity route | mutant: ignore 404 → length 4 ≠ 1 |
| C1 | Copilot sub-agent turns never flip state | mutant: drop the `agentId` guard → deepEqual failure (store.test.mjs:1328) |
| C2 | Copilot `session.idle` settles to idle | mutant: drop `session.idle` → deepEqual failure (store.test.mjs:1336) |
| C4 | Copilot hook ignores a foreign session's prompt | mutant: drop the session check → extension.test.mjs:948 |
| MEDIUM-3 | OMP session_shutdown publishes idle (once, never throws) | missing behaviour → `['working']` ≠ `['working','idle']` |
| MEDIUM-3 | Copilot stop and exit publish idle (once, own signal, never throws) | missing behaviour → `['working']` ≠ `['working','idle']` |

## GREEN (whole touched surface, `nice -n 19`)
- `cargo clippy --workspace --all-targets -D warnings`: clean.
- `cargo test --workspace` (`-j 4`, 6 threads): exit 0.
- vitest `index.fyi`, `index.send-schema`, `rust-runtime` and `index`: 156 passed.
- Copilot `node --test`: 265 passed, 3 skipped.
- Biome is clean.
