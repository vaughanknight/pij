# 24b — bounded in-lease send backoff + within-pass ambiguous-retry duplicate

**Item id / stream at handover:** 24b · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** designed, NOT started. Held post-tag by ruling — item 24's single retry is currently sufficient (measured); build only if the residual becomes > 0.
**Size estimate:** S–M, ~3–5 h · **Order / dependencies:** after item 24 (merged, PR #32, main `f3016b3`). No other dep.

## 1. Why this exists (the observed failure, with evidence)
The Telegram bridge's first `sendMessage` attempt fails transiently (network) at a real rate. Item 24 added ONE immediate in-lease retry, which recovers a BRIEF transient but not a longer one.
- **Pre-fix rate (main `188c877`, pre item 24):** 9 of 24 real sends (≈38%, receipts excluded, 23:15–02:45Z) failed attempt 1 and delivered on attempt 2 after the 60 s lease. Full baseline: `docs/plans/392-day3-codex-doctrine/reports/item-24-live-acceptance-baseline.md` (on main, plan folder). NOT length-related (attempt-1 successes 51–463 ch overlap attempt-2 failures 351–629 ch).
- **Post-fix window (restart #6, `916e915`, the post-restart hour):** 0 of 8 real sends needed attempt 2; **3 transients were recovered IN-LEASE at attempt 1**. One is captured verbatim in `~/.pij/telegram-bridge.log`:
  `text deps.send retry after transient failure (1787891374462-000001-28652 part 1/1): Network request for 'sendMessage' failed!` → row acked on attempt 1. (The bridge log is MACHINE-LOCAL, not reproducible by a stranger; the stranger-checkable record is the residual measurement — 0 of 8 attempt-2 in the post-restart hour, spine 32247 — and the pre-fix baseline in the plan folder on main.)
- Conclusion the residual measurement drew (o-prime, 05:08:52Z — 57.8 min post-restart-#6; spine 32247): the single retry is enough for the transients seen; **24b is post-tag** unless chore 6 later reports a real `attempt>1`.

## 2. What is ruled (design / spec)
- **Bounded backoff INSIDE the 60 s lease** instead of one immediate retry: schedule ≈ **0.5 s / 2 s / 5 s** (bounded; worst case must stay well under the lease so the row never escapes to a late attempt-2 redelivery).
- **Idempotent via the plan-hash marks (E29 positional idempotency):** each retry is keyed by the identity of the exact message content/position it retries — never a bare counter — so under partition/plan drift a retry cannot resend a DIFFERENT row's content.
- **Within-pass ambiguous-retry duplicate — STATED and ACCEPTED:** if a send's ack is lost (sent-but-unacked), a retry may DUPLICATE to Vaughan's phone. Per the iron ruling **silent loss outranks noisy duplicate, always (E29)** this is the correct degradation — degrade to duplicate, never to loss. Document it; do not attempt exactly-once.
- Legacy-identity: pre-plan-hash rows (no mark) load and retry safely (see the legacy branch at `bridge.ts:719-722`, d120c53).

## 3. Where the code is (at tag `d120c53`)
`.pi/extensions/pij/telegram/bridge.ts`:
- **Single retry to replace** — text: `:766-776` (`try { await deps.send(operation.text, replyTo) } catch { if (!isTransientSendError) throw; log("text deps.send retry after transient failure…"); await deps.send(...) }`); media: `:777-796` (same shape, `operation.sendMedia`). Replace each single retry with the bounded-backoff loop; keep `isTransientSendError` as the gate (a non-transient still throws immediately).
- **Idempotency marks (keep intact)** — `:711-729`: `bubblesHash = createHash("sha256")…`; `sqlite.recordTelegramBubblesHash(dm.messageId, bubblesHash)`; drift branch logs `bubble plan drift …; sending all`; sent-parts skip at `:759-763` (`sentPartIndices.has(bubbleIndex)`). The backoff must not change which bubbles are considered sent.
- **The lease** — the 60 s default is `.pi/extensions/pij/adapters/queue-consumer.ts:24` (`leaseMs = deps.leaseMs ?? 60_000`); the row's `leaseUntil`/`attempt` and the state machine live in `.pi/extensions/pij/adapters/sqlite-queue.ts` (`:9-11`: `claimed ─… lease expiry …→ redelivered (attempt+1) → parked`). The backoff total must fit inside `leaseUntil - now`.
- `isTransientSendError` — defined in `.pi/extensions/pij/telegram/media.ts:128` (NOT bridge.ts); it defines which errors are retryable (network `sendMessage failed`). Do NOT widen it without a ruling.

## 4. Acceptance (behavioural, mechanical)
- **Tests** (`bridge.test.ts`): a text send that fails transiently twice then succeeds → delivered on the 3rd attempt, ONE row, no late attempt-2 redelivery (drive the real `deps.send` with a fake that fails N times then resolves; assert timing stays < lease). Mirror for media. Idempotency: plan drift + retry → only the unsent bubble is resent (assert against `sentPartIndices`). Ambiguous ack (sent-but-unacked) → duplicate, asserted (never loss).
- **Mutants (must go red):**
  - `MUT-BACKOFF-SINGLE` — collapse the 0.5/2/5 loop to a single retry → the "fails twice then succeeds" test REDs (proves ≥2 in-lease retries occur).
  - `MUT-MARK-BARE-COUNTER` — drop the plan-hash identity from the mark (bare counter) → the drift-retry test REDs (proves a retry under drift resends only the matching row).
  - Name the covering test per touched line; ≥1 line must be one no existing test drives (E40).
- **Gates:** full `npx vitest run .pi/extensions/pij/` at the merge product in a fresh worktree; `just typecheck`; two green full runs; logs kept under the plan folder before teardown (E22/E35).

## 5. Live verification (after a daemon restart carrying it)
Restart the daemon on the built checkout (README § daemon restart). Then over ≥ 1 h of real bridge traffic, watch `~/.pij/telegram-bridge.log`: a transient should show a retry line and the row should ack at attempt 1; `deliveries.attempt` (queue) should stay 1 for rows that previously needed 2. Failure looks like: `attempt>1` rows reappearing, OR a duplicate bubble on the phone that is NOT explained by an ambiguous-ack log line.

## 6. Risks / gotchas that already bit us
- **E29** silent-loss-over-duplicate — the whole reason within-pass dup is accepted, not "fixed".
- **E34/E40** — sensor the layer you change: a backoff-in-`bridge.ts` test must drive the real `deps.send` closure, not a stubbed retry helper.
- **Lease coupling** — a backoff total ≥ lease reintroduces the exact attempt-2 stall item 24 removed; keep it strictly under `leaseUntil`.
- **E42/E43** — any "0 attempt>1" claim names the queue and verifies by ids, never by a count.

## 7. Open questions for the human
- Is 0.5/2/5 the right schedule, or should the max in-lease retry count be a config? (Default: hard-code 0.5/2/5, revisit only if chore 6 shows residual.)
- Empty otherwise — the design is settled; this only builds if the measured residual turns positive.
