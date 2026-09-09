# Follow-up u3: a BUSY seat is not a lost message — no resend, no lease exhaustion while a turn runs

From: pij-minor-unicorn (prime). Reply ONLY via pij_send to pij-minor-unicorn, one line + path. Own worktree from origin/main, branch fix/redeliver-busy-seat. Isolated daemon only.

## Defect (production, pij-right-kotallo on the NEW extension, daemon 74241, 2026-09-08 20:04–20:10)
Kotallo runs 30–90s turns. Jobs are serialized per seat, claim lease for extension seats is 60s (#390). Observed:
- Row 5053 (financial-elle): enqueued 20:06:51, claimed at ~20:07:32 (steered into a running turn, correctly), lease expired twice while the turn ran → two re-claims → `resendPending("lease-reclaim")` re-STEERED the same message each time → kotallo's pane shows the body three times (`[pij resend 1]`, `[pij resend 2]`) → Jordan: "right-kotallo just got a double resend?". The original steer was never lost; it was queued behind the turn.
- Row 5030 (adorable-bat): parked `undelivered:lease-exhausted` after three 60s leases while kotallo was merely busy. Never seen by kotallo; prime hand-delivered it at 20:1x. A live, healthy, busy seat LOST a message — worse than the bug #390 fixed.
Root: my u1 spec (packet-redeliver.md AC2 "unconsumed + streaming → steer again", AC3 park on lease exhaustion) conflated "lease timer expired" with "message lost". The only loss signal we have is idle-and-unconsumed (transcript proof in the addendum). A lease is a daemon-side dead-extension detector, nothing more.

## Required behaviour
- AC1 No resend while streaming. `resendPending` on `lease-reclaim` when `!pi.isIdle()` is a NO-OP (keep tracking, refresh the claim on the pending record). Resend happens only from the idle-unconsumed detector (10s idle, unchanged) — and NEVER for a message whose original injection was a steer into a turn that is still running.
- AC2 Claim heartbeat. While the extension holds an unconsumed pending claim, it refreshes the lease every 20s (`POST /v1/inbox/ack` with outcome `holding`, or a dedicated `/v1/inbox/heartbeat` — choose one, document it), which resets `claimed_at` and does NOT increment `lease_expirations`. Parking on `lease-exhausted` therefore means "the extension went silent for 3 leases" (dead/wedged process), never "the seat is busy".
- AC3 Never park a busy seat's message. If the seat's persisted state is `working` at expiry time, the daemon renews instead of counting an expiration (belt and braces with AC2; both must hold).
- AC4 Interrupt semantics unchanged (#383/#390): Escape → idle-unconsumed → resend within the idle window; harness-swallowed after 3 resends.
- AC5 Tests RED first: (a) fake pi streaming for 200s with a steered pending message → zero resends, zero lease expirations, one ack on consumption; (b) fake pi wedged idle → resends 1..3 then `undelivered:harness-swallowed` (unchanged); (c) extension killed mid-hold (no heartbeat) → park after 3 leases with `delivery.parked`; (d) daemon test: `working` state renews. Parity/golden updated deliberately.
- AC6 Live proof on an isolated daemon with a real omp 18.1.14 seat: send while it runs `sleep 150` → exactly ONE copy in its pane and one ack after the turn; then Escape mid-sleep on a second message → one `[pij resend 1]`, one ack.
- AC7 Docs: peer route + docs/how/pij-rs-api.md describe heartbeat and the three park reasons.

## Deliverable
One commit, C11 trailers, report at docs/plans/archive/misc/omp-redeliver-2026-09-08/report-u3.md with RED names/output, gate tails (cargo test --workspace, clippy -D warnings, fmt, npm test, skill check), proof seqs + pane capture. `git diff` before `git add`. No push/PR/merge/bounce.
