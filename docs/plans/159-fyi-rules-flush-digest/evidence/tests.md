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
