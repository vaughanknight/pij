# Item 23 review packet — transport receipt honesty (cold, CODE)

**PR**: #23, branch `s392-pr23` (built as CHERRY-PICK of `5a986e3` onto fresh main — review THAT branch; additive hunks, no whole-file drops).
**Base**: current origin/main. **Dossier**: `../tasks/item-23-transport-receipt-honesty/tasks.md`. **Write verdict to** `reviews/item-23-review.md`.
**Files**: ports.ts, claude-socket.ts(+test), copilot-rpc.ts(+test), daemon-tmux.ts(+test), loop.ts(+test), daemon.ts(+test), core/cli.ts(+test), + `reports/item-23-ack-measurement.md`.

## The ruling this implements (o-prime)
1. flushed claude socket/RPC write, no positive app ack → **`sent`** (new outcome, non-pessimistic); positive `orig_msg_id`/`messageId` → `confirmed`; NAK or pre-write fail → `failed`; `unverified` kept for pane-submission uncertainty. `sent` CONSUMES (no retry).
2. `daemon.ts emitSendReceipt` DEFERS to the durable reader-ack: a successful `markRead` ⇒ receipt `delivered` regardless of transport.
3. Measured: live 1000ms probe → `sent`, no positive orig_msg_id (`reports/item-23-ack-measurement.md`); `socketAckWaitMs` stays 150.
E21: `pij send` hint repointed to `pij queue --to <sender>` (the `tail --type` filter fix is out of fence).

## Dim-0 mutation gate — MANDATORY, sha-verify RED→restore→GREEN on disk (lines below are CODER-CLAIMED — VERIFY against the file, do not trust [DL-011])
- **MUT-SENT** (claimed claude-socket.test.ts:114 & copilot-rpc.test.ts:139): make a flushed-no-ack write return `unverified`/`confirmed` instead of `sent` ⇒ RED. Proves `sent` is pinned in both transports.
- **MUT-NAK** (claimed claude-socket.test.ts:137): make the `dropped` NAK return `sent` ⇒ RED. NAK must stay `failed` (retry-safe), not become a delivered-ish `sent`.
- **MUT-DEFER** (claimed daemon.test.ts:444) — **THE headline**: remove the durable-ack deference in emitSendReceipt ⇒ RED (a durably-acked `sent` wrongly reads `unverified`/pessimistic). Verify hardest.

## Semantic checks (Dim-1)
1. **Taxonomy boundaries** exhaustive & correct: enumerate every path in claude-socket.ts / copilot-rpc.ts — pre-write fail → `failed`; flushed then (no status | close | ack-window elapse) → `sent`; positive orig_msg_id/messageId → `confirmed`; `dropped` NAK → `failed`. No path silently mis-buckets. `sent` never re-enqueues (loop.ts drain consumes it).
2. **Defer correctness — the danger is OVER-reporting delivered**: confirm emitSendReceipt reads `delivered` ONLY when markRead actually succeeded; a NON-acked send (no durable marker) must still read `sent`/`unverified`, NOT falsely `delivered`. Probe both branches (marked vs not-marked).
3. **E21 honesty**: does `pij queue --to <sender>` actually surface the receipt the sender wants (the delivered/sent state)? Confirm the repointed hint names a command that WORKS (unlike the old `tail --type receipt`). Note whether the `tail --type` filter bug itself remains (out-of-fence residual → flag for a follow-up, don't fail the PR on it).
4. **Probe validity**: `reports/item-23-ack-measurement.md` — single bounded probe against a real Claude socket (pid 19208), honestly caveated ("does not prove no Claude version can emit one"). Confirm the conclusion (confirmed unreachable on success here) is stated as measured-not-proven.
5. **No collateral (structural, E17/INS-001)**: PR is a cherry-pick onto fresh main. Confirm with `npx vitest list` (NOT grep) on both trees that NO main test was removed, AND a LINE diff of the changed test files that no existing assertion was weakened (the decl-list is blind to weakened assertions).

Report verdict + the 3 mutation shas/RED lines + Dim-1 findings to me.
