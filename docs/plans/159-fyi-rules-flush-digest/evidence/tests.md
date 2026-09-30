# Plan 159 evidence: tests and mutants

## RED before the change (daemon wire tests, `crates/daemon/tests/fyi_http.rs`)
```
test a_hook_claim_of_a_large_pile_is_a_digest_too ... FAILED
test a_claim_needs_binding_evidence_that_matches_the_seat ... ok
test a_held_pile_flushes_when_the_seat_turns_warm ... FAILED
test a_held_fyi_survives_a_daemon_restart ... ok
test a_hook_claim_racing_a_ride_along_delivers_each_fyi_once ... ok
test a_duplicate_of_a_delivered_carrier_leaves_the_fyi_pending ... ok
test a_hook_publishes_activity_by_pane_alone ... ok
test a_question_held_as_an_fyi_warns_but_is_still_held ... FAILED
test a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full ... FAILED
test a_retried_carrier_still_queued_does_not_swallow_a_newer_fyi ... ok
test a_tombstone_drops_pending_fyis_and_records_how_many ... ok
test a_seats_own_turn_boundaries_publish_busy_then_idle ... ok
test a_tombstone_resets_a_working_seat_to_idle ... ok
test fyi_refuses_controls_and_remote_seats ... ok
test fyis_to_a_seat_not_known_to_be_warm_are_never_flushed ... ok
test an_fyi_is_held_then_rides_along_appended_to_the_next_message_once ... ok
test whoami_carries_the_pending_count_for_the_status_lines ... ok
test the_fifth_fyi_to_a_warm_seat_flushes_them_as_one_message ... FAILED
test racing_hook_claims_deliver_each_fyi_exactly_once ... ok
thread 'a_hook_claim_of_a_large_pile_is_a_digest_too' (153028756) panicked at crates/daemon/tests/fyi_http.rs:767:5:
thread 'a_held_pile_flushes_when_the_seat_turns_warm' (153028755) panicked at crates/daemon/tests/fyi_http.rs:656:5:
thread 'a_question_held_as_an_fyi_warns_but_is_still_held' (153029200) panicked at crates/daemon/tests/fyi_http.rs:558:5:
thread 'a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full' (153029104) panicked at crates/daemon/tests/fyi_http.rs:694:5:
thread 'the_fifth_fyi_to_a_warm_seat_flushes_them_as_one_message' (153029962) panicked at crates/daemon/tests/fyi_http.rs:599:5:
test result: FAILED. 14 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.23s
```
The sixth new test, `fyis_to_a_seat_not_known_to_be_warm_are_never_flushed`, guards pre-existing behaviour; mutant F2 kills it.

## GREEN after the change
19/19 fyi_http tests pass. The core `fyi` and `cold_wake` render and warmth tests pass.

## Mutants (fyi_http plus the core fyi and cold_wake tests)
| mutant | result |
|---|---|
| F1-flush-only-above-5 | KILLED a_held_pile_flushes_when_the_seat_turns_warm, the_fifth_fyi_to_a_warm_seat_flushes_them_as_one_message |
| F2-warmth-not-checked | KILLED a_held_pile_flushes_when_the_seat_turns_warm, a_hook_claim_of_a_large_pile_is_a_digest_too, a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full, fyis_to_a_seat_not_known_to_be_warm_are_never_flushed |
| F3-no-recheck-on-activity | KILLED a_held_pile_flushes_when_the_seat_turns_warm |
| F4-digest-at-5 | KILLED the_fifth_fyi_to_a_warm_seat_flushes_them_as_one_message, five_are_listed_in_full_and_six_are_a_digest, a_flush_is_its_own_message_and_a_read_is_everything_in_full |
| F5-no-question-warning | KILLED a_question_held_as_an_fyi_warns_but_is_still_held |
| F6-warm-ignores-last-call | KILLED warm_means_working_or_a_known_recent_last_call |
| F7-flush-lead-also | KILLED a_held_pile_flushes_when_the_seat_turns_warm, the_fifth_fyi_to_a_warm_seat_flushes_them_as_one_message |
| F8-digest-shows-oldest | KILLED a_hook_claim_of_a_large_pile_is_a_digest_too, a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full, a_pile_over_five_is_a_digest_matching_the_golden_fixture, five_are_listed_in_full_and_six_are_a_digest |

## TS/Copilot question-warning tests (RED, then GREEN)
- generation-routing: RED received `pij send: held (fyi) — m-2` with no warning line.
- index.fyi: RED, the tool text was missing the warning line.
- rust-runtime: RED, no `warning` key in the send result.
- Copilot cold-wake.test.mjs: RED, actual `undefined`.

All GREEN afterwards. pij-skill-check is all green.

## Review round 1 (uther REQUEST_CHANGES on `453057ca`; prime rulings 1-4)
- **Strict warmth.** `cold_wake::is_warm(block, now)` is true only with positive evidence: the last call is known and within `min(cache TTL, 60 min)`. `working` alone is never evidence; an unknown TTL, an unknown last call or a status timeout means hold. The flush uses the hold's own receipt time, so there is no separate clock read (W6 has no code left to mutate).
- **No flush on activity.** Only the hold that brings the pile to 5 flushes.
- **No blank carriers.** The new `Queue::enqueue_fyi_flush` claims in the carrier's transaction and, when it claims nothing, rolls back and returns `None`. `DeliveryService::flush_fyis` queues through it directly and publishes the same `pushed` and `delivery.outcome` facts a queued send does. A deterministic race test sits in the shared sqlite+fake FYI contract (`crates/store/tests/queue.rs`): the hook claims first, then the flush → `None`, no row, no event.

### RED before the fixes
```
test http::tests::the_shim_fyi_path_warns_and_flushes ... ok
test http::tests::a_working_state_alone_never_flushes ... FAILED
test http::tests::five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime ... FAILED
test http::tests::facts_that_never_arrive_never_flush ... ok
thread 'http::tests::a_working_state_alone_never_flushes' (155895456) panicked at crates/daemon/src/http/tests.rs:7137:9:
assertion `left == right` failed: stale working, cold 2 h
  left: 1
 right: 0
thread 'http::tests::five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime' (155895458) panicked at crates/daemon/src/http/tests.rs:7113:9:
assertion `left == right` failed: 5m cache, called 30 min ago
  left: 1
 right: 0
test result: FAILED. 2 passed; 2 failed; 0 ignored; 0 measured; 470 filtered out; finished in 3.22s
test a_turn_boundary_never_flushes_so_the_turn_carries_the_pile ... FAILED

failures:

--
thread 'a_turn_boundary_never_flushes_so_the_turn_carries_the_pile' (155958370) panicked at crates/daemon/tests/fyi_http.rs:622:5:
no flush message
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

--
test result: FAILED. 18 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.79s

error: test failed, to rerun pass `-p pij-daemon --test fyi_http`
```
The new `Queue::enqueue_fyi_flush` contract test was RED as a missing method; uther's probe measured the blank carrier (33 of 40 races).

### Mutants after the fixes
| mutant | result |
|---|---|
| W5-status-timeout-warm | KILLED facts_that_never_arrive_never_flush |
| W9-shim-skips-after-hold | KILLED the_shim_fyi_path_warns_and_flushes |
| W10-read-later-batches | KILLED a_read_returns_exactly_the_batch_one_claim_delivered |
| W11-read-drops-delivered-filter | KILLED a_read_returns_exactly_the_batch_one_claim_delivered |
| R1-working-counts-warm | KILLED a_hook_claim_of_a_large_pile_is_a_digest_too, a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full, a_turn_boundary_never_flushes_so_the_turn_carries_the_pile, a_working_state_alone_never_flushes, five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime, fyis_to_a_seat_not_known_to_be_warm_are_never_flushed, warm_needs_a_known_last_call_inside_the_real_cache_lifetime |
| R2-ttl-ignored-60min | KILLED five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime, warm_needs_a_known_last_call_inside_the_real_cache_lifetime |
| R3-unknown-ttl-60min | KILLED five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime, warm_needs_a_known_last_call_inside_the_real_cache_lifetime |
| R4-sqlite-blank-carrier | KILLED sqlite_and_fake_queues_share_the_fyi_contract |
| R5-fake-blank-carrier | KILLED sqlite_and_fake_queues_share_the_fyi_contract |
| F1-flush-only-above-5 | KILLED five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime, the_shim_fyi_path_warns_and_flushes |
| F4-digest-at-5 | KILLED a_flush_is_its_own_message_and_a_read_is_everything_in_full, five_are_listed_in_full_and_six_are_a_digest, five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime |
| F5-no-question-warning | KILLED a_question_held_as_an_fyi_warns_but_is_still_held, the_shim_fyi_path_warns_and_flushes |
| F7-flush-lead-also | KILLED five_fyis_flush_only_on_a_last_call_inside_the_cache_lifetime |
| F8-digest-shows-oldest | KILLED a_hook_claim_of_a_large_pile_is_a_digest_too, a_large_pile_rides_along_as_a_digest_and_stays_readable_in_full, a_pile_over_five_is_a_digest_matching_the_golden_fixture, five_are_listed_in_full_and_six_are_a_digest |
| R6-activity-flushes-again | KILLED a_turn_boundary_never_flushes_even_when_warm |

Finding 6 (the OMP tool text shows "held (fyi)" twice) is LOW and left as is: the warning text is the plan's exact wording.

### Finding 6 (prime ruling a)
The warning is now `this looks like a question; if you need an answer, resend without --fyi`, shown after the receipt (which already says `held (fyi)`). RED first: `a_question_held_as_an_fyi_warns_but_is_still_held` received the old text. GREEN on Rust (fyi_http 19/19, shim, CLI), OMP vitest 180/180, Copilot node --test 6/6.
