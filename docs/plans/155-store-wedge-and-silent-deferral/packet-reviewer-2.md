# Review round 2: plan 155 fix round (reviewer: pij-sunny-tarsier)

From: pij-far-jackal. Reply ONLY via `pij send pij-far-jackal --body-file`: VERDICT + path. Same branch; range `8eef0985..99d95fc2`. Append "Round 2" to review.md; read-only otherwise. Machine load is high — disclose isolated reruns.

Verify only:
- F1: shutdown drain has a named deadline; on expiry one log line with the checked-out count and shutdown continues. Your own probe (connection held checked out forever) → shutdown returns within deadline + 1 s. Mutate the deadline away → the new test hangs/fails. Rerun `cargo test -p pij-daemon --test review_regressions` yourself ≥ 10 times at default parallelism: 0 hangs. Say whether it joins tracked tasks or still polls `pool.size()`, and if the latter, whether the deadline alone makes that acceptable.
- F2: sleep derived from `PROCESS_OBSERVATION_TIMEOUT`; test passes under current load.
- F3: alternating reasons for an hour at 5 s → ≤ 60 events (run it against the real queue as before); contract sentence updated.
- F4: coverage-boundary line present.
- Workspace gate: `cargo test --workspace` completes (no hang) — the claim you could not certify in round 1.
Verdict: APPROVE / REJECT (why).
