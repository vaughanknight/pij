# Plan 160 evidence: tests and mutants

## RED first
- Core: the refusal golden and `a_wake_is_priced_as_a_cold_write_plus_five_calls` were RED as missing behaviour (no `wake_estimate_usd`). Prime's worked example, 600k on Opus, prices at ~$5.39 and is pinned.
- TS shim (`.omp/extensions/pij/core/roster-table.test.ts`), before the route was wired:
```
     ✓ renders the same golden as the Rust CLI from the same JSON 2ms
     × is what the shim prints for a human `pij list` 5ms
     × appends the daemon's size lines to a human `pij state` 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 1 passed (3)
```
- The daemon size tests were written alongside the code; mutants P5-P7 prove each one fails without its behaviour.

## Mutants (core cold_wake, daemon size and refusal tests, TS roster and routing tests)
| mutant | result |
|---|---|
| P1-wake-is-one-write-only | KILLED a_forced_cold_wake_needs_a_reason_and_is_audited, a_large_seat_idle_past_the_ttl_is_cold_with_its_price, a_provider_qualified_or_dotted_model_id_finds_its_price, a_send_to_a_cold_seat_is_refused_with_its_price, a_wake_is_priced_as_a_cold_write_plus_five_calls, the_state_card_shows_size_coldness_and_the_guard, the_state_lines_name_size_cache_and_the_guard |
| P2-refusal-drops-fyi-row | KILLED a_large_seat_idle_past_the_ttl_is_cold_with_its_price, a_send_to_a_cold_seat_is_refused_with_its_price, an_unpriced_model_still_refuses_but_says_the_price_is_unknown |
| P3-snow-ignores-idle | KILLED a_seat_is_marked_cold_exactly_when_the_guard_would_refuse, the_state_lines_name_size_cache_and_the_guard |
| P4-cache-cold-no-duration | KILLED a_seat_is_marked_cold_exactly_when_the_guard_would_refuse, the_state_lines_name_size_cache_and_the_guard |
| P5-list-ignores-sizes | KILLED a_slow_seat_makes_the_list_wait_a_bounded_time_and_show_unknown, the_roster_carries_sizes_only_when_asked |
| P6-state-size-missing | KILLED the_state_card_shows_size_coldness_and_the_guard |
| P7-list-wait-60s | KILLED a_slow_seat_makes_the_list_wait_a_bounded_time_and_show_unknown |
| P9-shim-no-sizes-query | KILLED list returns unmodified rs data with no registry union 4ms, bare list keeps its real GET endpoint and complete envelop, list preserves and URL-encodes every declared GET filter w |
| P10 shim state drops size lines | RED shown before wiring (`appends the daemon's size lines to a human pij state`, above) |

## Shared golden
`crates/testkit/fixtures/golden/cli/list-sized.{json,txt}` is rendered identically by `pij_cli::roster::render_table` (Rust test `the_sized_roster_table_matches_the_committed_golden`) and `renderRosterTable` (TS).
