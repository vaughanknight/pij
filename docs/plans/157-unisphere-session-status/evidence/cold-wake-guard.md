# Plan 157 phase 2: cold-wake guard, live proof and RED → GREEN

## Live proof (worktree build, NOT the production daemon)
- **Setup:** an in-process pij daemon over a `sqlite3 .backup` copy of the production store (taken 2026-09-29, schema 23).
  - The session source is the real `pij_unisphere` adapter on Unisphere 029 at `0d48d80`, as local path deps.
  - tmux and transport are FAKE (asserted at start), so no send could reach a real seat.
- **Run:** for every non-tombstoned Claude seat with a session (48), it sent one real `POST /v1/send` from `pij-yelling-trout`. Built as debug and run under `nice -n 19`.
- **Results:**
  - **18 refused** (HTTP 400, `E-RS-COLD-WAKE`). Every one had more than 300k context, was idle for more than 60 min and was not working, and none was delivered. The refused wakes would have re-written a combined ≈ **$64.53** at list price.
  - **30 allowed** with `cold_check: "clear"` (small or recently called).
  - **Guard latency** per send, with the cursor warm: median 2.3 ms, max 9.4 ms.
- **`--force`:** proven in tests only, per the ruling: never wake a big cold seat to prove it.

| seat | idle | context | estimate |
|---|---|---|---|
| pij-anxious-toucan | 34h43m | 377k | ≈ $3.02 |
| pij-exceptional-bug | 34h45m | 520k | ≈ $4.16 |
| pij-fixed-roadrunner | 27h22m | 503k | ≈ $4.02 |
| pij-fun-shrimp | 3h04m | 561k | ≈ $4.49 |
| pij-lucky-horse | 2h01m | 420k | ≈ $3.36 |
| pij-minimum-mammal | 6h | 475k | ≈ $3.80 |
| pij-nice-heigan | 2h56m | 534k | ≈ $4.28 |
| pij-noisy-tsarina | 6h49m | 373k | ≈ $2.99 |
| pij-preliminary-junglefowl | 28h37m | 573k | ≈ $4.59 |
| pij-reduced-elwynn | 27h19m | 389k | ≈ $3.11 |
| pij-resonant-clam | 3h58m | 357k | ≈ $2.86 |
| pij-silly-inigo | 24h28m | 530k | ≈ $4.24 |
| pij-spatial-skink | 22h40m | 350k | ≈ $2.81 |
| pij-specific-kiwi | 3h11m | 349k | ≈ $2.79 |
| pij-splendid-justine | 3h11m | 424k | ≈ $3.39 |
| pij-statistical-whale | 2h15m | 370k | ≈ $2.96 |
| pij-unusual-cockroach | 24h32m | 439k | ≈ $3.51 |
| pij-zonal-geddon | 6h50m | 518k | ≈ $4.15 |

One refusal verbatim:
```
E-RS-COLD-WAKE: pij-exceptional-bug is cold (idle 34h45m, 520k context). Waking it rewrites ~520k tokens ≈ $4.16 at list price. Use --fyi to hold it, or --force --reason "<why>".
```

## RED → GREEN
- **Daemon HTTP tests** (`crates/daemon/src/http/tests.rs`, cold-wake section):
  - Missing behaviour, before the guard existed:
    - `a_send_to_a_cold_seat_is_refused_with_its_price`: FAILED (HTTP 200, queued).
    - `a_forced_cold_wake_needs_a_reason_and_is_audited`: FAILED (200 without a reason).
    - `busy_and_unknown_recipients_are_never_refused`: FAILED (no `cold_check`).
    - `the_shim_send_is_guarded_and_forceable`: FAILED (200).
    - All four are GREEN after.
  - `fyis_and_controls_are_never_refused`: RED under mutant M5 (the FYI takes the guarded send path), GREEN on the code.
- **Core** (`crates/core/src/cold_wake.rs` tests), mutants:
  - M1 (size boundary `<=` → `<`): FAILED.
  - M2 (idle boundary): FAILED.
  - M3 (busy not exempt): FAILED.
  - M4 (unknown refuses; also kills the daemon unknown test): FAILED.
  - All are GREEN on the code.
