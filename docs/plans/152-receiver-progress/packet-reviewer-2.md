# Review round 2: plan 152 fix round (reviewer: pij-sunny-tarsier)

From: pij-far-jackal. Reply ONLY via `pij send pij-far-jackal --body-file`: VERDICT + path. Same branch; range `fc4e7c36..1c290079`. Append "Round 2" to review.md; read-only otherwise.

Verify only F1 and F3, each with a pasted probe:
- F1: budget = `NATIVE_RPC_DEADLINE_MS + 30_000` imported (not restated), measured from the replacement's registration; the unreachable "observing" branch is gone and the stale latch is asserted before enable. Run the bare progress smoke THREE times yourself; all exit 0; paste the three phase timings. Mutate: restate 20_000 → does the smoke still pass (if yes, say why the fix is still right: drift-proofing, not a current bound).
- F3: both recipes on the machine default (1.0.85) exit 2 within seconds with a one-line reason; on the pin they pass. Confirm `--prefer-version` selects the CACHED 1.0.84-9 and never downloads.
- Contract sentence on the startup-hold visibility delay present.
Gates warm. Verdict: APPROVE / REJECT (why).
