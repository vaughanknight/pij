# Item 24b — bounded in-lease backoff (DRAFT — HOLD, do NOT dispatch)

**Status**: PREPARED per o-prime heads-up 2026-08-28 (spine 31162). **Do NOT start the coder.** Dispatch trigger: the post-restart-#6 measurement shows residual first-attempt failures surviving item-24's SINGLE retry (residual > 0), **right after item 30**. Live rate on 188c877 is 9/24 real sends (38%) — a single retry almost certainly leaves residual, so this will likely fire.

## Problem
Item 24 adds ONE retry for a transient attempt-1 `sendMessage` failure. At a 38% first-attempt failure rate, one retry cuts but does not eliminate residual; a still-failing row waits out the 60 s lease and re-delivers late (the attempt-2 ~65 s pattern in the pre-fix baseline).

## Fix: bounded backoff INSIDE the 60 s lease
- Retry schedule ~ **0.5 s / 2 s / 5 s** (bounded; total well inside the 60 s lease so the row never escapes its lease to a late redelivery). Tune counts so the worst case stays < lease.
- **Idempotent via plan-hash marks (E29 positional idempotency)**: each attempt is keyed by a mark carrying the IDENTITY of the exact message content/position it retries — never a bare counter — so under partition drift a retry cannot resend a DIFFERENT row's content. The mark names what its skip-record was computed against (orient-local E26/E29 ruling).
- **Within-pass ambiguous-retry dup — STATED**: if a send's ack is lost (sent-but-unacked), a retry may DUPLICATE to Vaughan's phone. Per the iron ruling (silent loss outranks noisy duplicate, ALWAYS) this is the correct degradation: **degrade to duplicate, never to loss.** Document it; do not try to make it exactly-once.

## Also folded here (from earlier scope notes)
- Legacy-identity handling for the mark (older rows without a plan-hash mark load and are retried safely).
- (W3 write-once / capture — ALREADY shipped in item 24; NOT here.)

## Mutant gate (packet precondition)
- A mutant that removes a backoff step (0.5/2/5 -> single) must RED a test proving multiple in-lease retries occur.
- A mutant that drops the plan-hash identity from the mark (bare counter) must RED a test proving a retry under drift does not resend a different row.
- E40: each guard line covered by a named new test, >=1 = none.

## Acceptance
Transient fail x2 then success within lease -> delivered on attempt 3, one row, no late redelivery. Idempotency: drift + retry -> same content only. Ambiguous ack -> duplicate (never loss), asserted. tsc 0, biome clean, fence GREEN.

## Trigger checklist (before dispatch)
1. Restart #6 done (item 24 + item 30 live).
2. Post-restart hour measured (deliveries.attempt); residual > 0 confirmed against reports/item-24-live-acceptance-baseline.md.
3. Then dispatch to coder on fresh main.
