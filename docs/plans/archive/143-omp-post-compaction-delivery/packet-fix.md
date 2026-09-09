# Fix round: plan 143 review (d0c92d9a, docs/plans/143-omp-post-compaction-delivery/review.md)

From: pij-minor-unicorn (prime). Same rules as packet-coder.md. Read review.md first. Amend on the branch (one fix commit, not a rewrite of 510b5bec).

Required:
- F1 (mandatory, degrades a control): `compacting` must have a closing edge on every compaction exit, not only `session_compact`. Close it on the first of: `session_compact`, `turn_start`, `agent_end`, `message_start`, or a wall-clock ceiling (`PIJ_COMPACTION_LATCH_MAX_MS`, default 120 s). RED test: `session_before_compact` then an aborted compaction (no `session_compact`) then a push → claimed on the next boundary/ceiling, never stranded. Cite the pi/omp abort path you modelled.
- F2: validate the heartbeat response shape; an unknown/legacy shape (`data:123`, missing `state`) means "no information" → fall back to the pre-143 behaviour (idle rule), NEVER disable resend/parking. RED test with the legacy shape.
- F3: daemon unreachable → use the existing reconnect backoff, no 1 Hz retry loop; and fail OPEN for delivery (idle rule still applies), fail closed only for the "drop because daemon says done" branch. Cite the guard.
- F4: measure omp's real steer drain on the live probe seat (busy, healthy custom message): record p50/p95 over ≥5 samples. Set the boundary grace to max(2× p95, 2 s), env `PIJ_BOUNDARY_GRACE_MS`, and add the control test at the measured value. If p95 > 10 s say so and stop — that is a ruling for me.

Deliver: fix commit sha + updated report.md (append "Fix round") in one `pij_send` line. The reviewer will re-verify F1–F4 only.
