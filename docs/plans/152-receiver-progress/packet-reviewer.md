# Review: plan 152 — receiver observation progress is liveness (reviewer: pij-sunny-tarsier)

From: pij-far-jackal (prime). Reply ONLY via `pij send pij-far-jackal --body-file <path>`: VERDICT + path. You are registered; do not adopt. Load the pij skill and the builder skill. Read-only on the branch; write ONLY docs/plans/152-receiver-progress/review.md (+ reviewer-probes/).

Worktree: /Users/jordanknight/pi-hacking/fs3-receiver-progress, branch 152-receiver-progress — REBASED by prime onto main 6b8d8504 (151 + 153 in). Range `0e907e46..facee441` (plan 0e907e46 mine; code f57623ad; evidence facee441). Prime resolved one conflict by hand in `.copilot/extensions/pij/store.mjs`: the constants block (union) and the receive loop (151's `holdStarted` register block followed by 152's `observeStartup` + heartbeat + `receiverWatch` block). Review that resolution first. `cd` there; `just worktree-deps` if needed; production daemon read-only; isolated daemon for anything live; Rust via `~/.cargo/bin/cargo`.

Read plan.md, report.md (esp. § AC0 and § "Scheduled recycle and the observed SDK-read stall"), then the diff. `pij report now "read 152" "probing"`.

Verdict bar — APPROVE only if each holds with a pasted probe:
1. **Conflict resolution.** Exactly one `keepReceiverAlive()` start site; 151's hold escalation tests and 152's progress tests both pass on the rebased tree; no path starts the heartbeat before `observeStartup` resolves.
2. **AC1 deadlines are real.** Every receiver RPC (`eventLog.tail/read`, `queue.pendingItems`, `metadata.isProcessing`, `native.send`) is bounded by `NATIVE_RPC_DEADLINE_MS`; a never-settling fake → `receive-held` naming the call within the bound. Mutate: unbound one call, name the red test. Calibration: report.md shows the bound against the 105 MB session — cite the measured read times.
3. **AC2 staleness → re-baseline → hold.** Fake SDK that re-bases its log (H2 shape): N empty reads while the session moved → `receiver-rebaselined` with the gap, next delivery accepted; re-baseline fails → `receive-held`. Mutate `RECEIVER_EMPTY_READ_LIMIT` to ∞ and name the red test.
4. **AC3 heartbeat carries progress; daemon consults it.** Frozen `observed_at` with outstanding deliveries across K renewals → renewal refused, decodable reason, deliveries park, manual `pij inbox` pull succeeds. Rust test RED on main (renews forever) — verify by running it against main's `delivery/mod.rs`. Brandon's startup gap: a fresh replacement fork emits zero progress before observing its SDK — show the bounded startup observation prevents a false stale-hold (test named) and what happens if the SDK never answers at startup (the "SDK-enable" HELD case in the report) — is that fail-closed outcome the right one, and is it visible to an operator?
5. **AC4 no silent exits.** The hourly recycle case: on shutdown with an outstanding completion, exactly one line names msgId/jobId and cause. Consumed+acked jobs stay done; unconsumed park; journal recovery never blind-reinjects — the boundary brandon pinned, with the counter-reset and replay-timestamp fixes. Name each test.
6. **AC0 honesty.** The production mechanism is UNPINNED (three repro attempts, incl. 105 MB on 1.0.84-9). Confirm report.md says so plainly, labels the 15 s startup-read stall "candidate H1, unproven", and does not let the controlled fault injection stand in for a natural repro anywhere in the prose.
7. **Fence**: `registration.rs`, `.omp/extensions/pij/**` (only `generation-routing.ts` strings expected), spawn paths — zero unexpected delta vs merge-base; `.gitignore` change explained.
8. Gates on YOUR checkout: cargo test --workspace, fmt, clippy -D warnings, `node --test .copilot/extensions/pij/*.test.mjs`, `just copilot-native-memory-smoke`, `just copilot-native-progress-smoke`, `just self-check` (warm).

Verdict: APPROVE / APPROVE-WITH-FIXES (file:line each) / REJECT (why). Report at both edges.

## Addendum (post rebase-integration, tip 0d1a85e6)

Range is now `0e907e46..0d1a85e6`; brandon's integration commit(s) follow bb061988. Two things changed since the hold — verify them first, then run the original bars 1–8:
- **Idle poller removed** (prime ruling): no always-on 1 s SDK probe; bounded probes run only while a completion/delivery is outstanding. Assert: no `RECEIVER_PROBE_INTERVAL_MS` timer while idle-and-empty; probes present during completion-wait; the new idle→delivery→completion test is load-bearing (mutate: re-add an idle probe → which test goes red).
- **Fixture timers tagged by owner**; 151's waiters select by identity. Confirm the exclusion `ms !== 1000` was NOT used, and that extension.test.mjs:490's 1000 ms retry step still asserts.
- Startup-observation failure is `receive-held`, never a registration retry — named test.
- Brandon reports the windows-compat focused-tests stage runs zero files after 153 (a separate follow-up is fixing it on main); do not count that stage as coverage here.
Your s152-rev worktree at facee441 must be moved to 0d1a85e6.
