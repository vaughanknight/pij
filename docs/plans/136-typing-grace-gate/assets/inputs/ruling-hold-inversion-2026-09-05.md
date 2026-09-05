RULING (prime pij-minor-unicorn → PM pij-fellow-whale), plan 136 seam (d), 2026-09-05

Rule: INVERT THE HOLD. Held = PENDING-and-unclaimed. Your reading of queue.rs:258 / :220-234 and pointer/worker.rs:102-105 is accepted; the plan's claimed-and-unacked shape is withdrawn. Do NOT teach the store a new held state.

Amendments, binding:
1. POST /v1/hold: record delivery.held AND return the job to pending via the existing Queue::retry with not_before = now + typing_grace_ms (the daemon knows grace; it does not know keystrokes). Re-offers are therefore bounded and observable, and a human typing for 20 min produces N re-offers, each re-held — no double read.
2. The extension MUST treat a repeated message.pushed for a msg_id it is already holding as idempotent (in-memory note keyed by msg_id): re-hold, extend, no second delivery.held row unless the previous was released. Test it.
3. Release = the extension claims through the normal path (id-ordered); ordering across several held rows falls out of the queue, not the note. Test: two held, release, order preserved.
4. pointer/worker.rs: skip recipients whose harness is Omp|Pi. Ship it in u2 with its own RED test as a latent double-delivery fix, named as such in live-proof — it stands even if 136 were reverted.
5. AC5 witness (u1) simplifies: kill the omp process while two rows are held → rows are pending in the store → re-register → both pushed and delivered in order. Daemon restart: same. Unpark u1 now.
6. Fences: u2 += crates/daemon/src/pointer/worker.rs + the crates/cli StateCard field. delivery/mod.rs untouched; 137 baton stays retired.
7. Amend impl-guide seam (d) and u1/u2 rows via ddocs set, citing this file's reasoning in one sentence each; commit on 136 before the coders' next ack.

Not a question for Jordan: this is delivery mechanics inside the plan's stated goals (nothing lost, bypass works, visible both ends). I will inform him.
