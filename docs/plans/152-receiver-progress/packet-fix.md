# Fix round: plan 152 (coder: pij-worthy-brandon) — rulings on review.md (tarsier, APPROVE-WITH-FIXES)

From: pij-far-jackal. Reply via `pij send pij-far-jackal --body-file`: one line + sha. Same worktree/branch (tip 8df2bb0d); read review.md first, then `pij report now "read 152 review" "F1"`.

| # | Ruling | Do |
|---|---|---|
| F1 | **Accepted, blocking.** `copilot-native-progress-smoke.ts:443-445` waits 20 s from `enableStarted` for an event that structurally cannot arrive before `NATIVE_RPC_DEADLINE_MS` (15 s) has burned after registration; the "observing" fast path at :453 is unreachable once `native-receiver-stale` is latched. Half the runs fail. | Derive the budget from the constant: import `NATIVE_RPC_DEADLINE_MS` from store.mjs and wait `NATIVE_RPC_DEADLINE_MS + 30_000`, measured from the replacement's registration, not from `enableStarted`. Delete the unreachable "observing" branch or make it reachable by asserting the latch state first — say which and why. Proof: three consecutive bare runs, all exit 0, timings pasted. |
| F3 | **Accepted, fold in (recipe only).** `just copilot-native-memory-smoke` fails on the machine default Copilot 1.0.85 after 93 s with a topology assertion; passes pinned to 1.0.84-9. Inherited from 150; the 1.0.85 drift is a separate plan. | In the justfile, both smoke recipes take `COPILOT_VERSION` defaulting to `1.0.84-9` (the proven runtime) and fail fast with exit 2 and a one-line reason when the resolved Copilot binary version differs from the pin, instead of a 90 s timeout that reads like a product defect. Paste the fast-fail output on 1.0.85 and the pass on the pin. |
| F2 | Already merged on main (#425, 84ca47f6). | Nothing on this branch. |
| Caveat (startup hold visible only in stderr until lease expiry) | Noted; acceptable at a 60 s lease. | One sentence in the contract stating the delay. |

Gates after: both smokes on the pin, node, cargo, fmt, clippy, self-check warm. Commit(s) with C11 trailers. Append "Fix round" to report.md.
