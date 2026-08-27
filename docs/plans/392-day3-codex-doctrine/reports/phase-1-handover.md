# Phase 1 handover — Telegram sqlite forwarder

**Implementation commit**: `69f1c4524c39340ff63c26ba498fd489ca3faeec`

The Telegram bridge now consumes the sqlite-default queue at-least-once: it claims in
sequence, forwards, and acks only after every required text bubble succeeds. Receipt rows
are acked without reaching the phone, failed text remains claimed for lease recovery, and
the fs opt-out keeps its previous watch/log-and-continue behavior. Pane-less legacy `pi`
descriptors now report `queued (pull-inbox)` honestly.

## Gate evidence

Detailed command/result evidence is in
`docs/plans/392-day3-codex-doctrine/tasks/phase-1-telegram-sqlite-forwarder/execution.log.md`.

- `npx vitest run .pi/extensions/pij/`: **PASS** — 171 files passed, 2 skipped; 3920 tests
  passed, 15 skipped.
- `just typecheck`: **PASS**.
- Changed-file Biome check: **PASS** — all 11 changed TypeScript files clean.
- `just test`: known out-of-fence red — 4534 passed, 19 skipped, one Windows policy test
  failed because `pwsh` is unavailable (`spawnSync pwsh ENOENT`).
- `just lint`: known out-of-fence diagnostics; changed files are clean.
- `just pij-skill-check`: known route budget/pointer/order debt under `skills/pij/**`.
- `harness checks`: `local-paths`, `typecheck`, `pkg-audit`, and `snapshots` passed; `lint`,
  the missing-`pwsh` test, `windows-compat` at lint, and smoke remained red.
- `just smoke`: 9 scenarios passed; existing `pij-watchdog` and worktree `pi-peacock`
  scenarios failed.

The orchestrator-approved compatibility fixture edits are at
`.pi/extensions/pij/adapters/fs-registry.overlay.test.ts:166,181,197,550`. Each now states
that a daemon-owned control-plane seat has a pane, preserving the intended test while the
new pull-seat inference remains explicit.

## Start the bridge from this worktree

```bash
cd /Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine
PIJ_HOME="$HOME/.pij" npx tsx .pi/extensions/pij/cli.ts telegram start
```

After merge, use the installed main variant:

```bash
pij telegram start
```

## Pre-restart row 149 retirement

This is a **one-directional safety interlock (a brake), not a retention policy**. Removing
it can only make restart deliver more: row 149 was already delivered through fs before the
cutover, so the statement only spares that known row from duplicate delivery.

Run before restarting the bridge:

```bash
sqlite3 ~/.pij/queue/pij.sqlite "UPDATE deliveries SET state='failed', last_error='delivered-via-fs-pre-cutover', updated_at=strftime('%s','now')*1000 WHERE seq=149 AND state='queued'; INSERT INTO receipts(seq,state,attempt,at,detail) VALUES (149,'retired',0,strftime('%s','now')*1000,'delivered-via-fs-pre-cutover');"
```

## AC-07 live proof — o-prime baton

The coder did not restart the daemon/bridge or modify the live queue.

1. Run the row 149 brake above, then restart the bridge/daemon.
2. Confirm row 290 reaches the phone. The phone is the delivery oracle.
3. Send a fresh timestamped probe:

   ```bash
   pij send pij-telegram "s392 live proof $(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```

4. Confirm the probe appears on the phone within 5 seconds.
5. Inspect the durable sensor:

   ```bash
   pij queue --to pij-telegram
   ```

6. Confirm row 290 and the new probe are `acked`, each ack receipt is timestamped after its
   Telegram send, and row 120 remains `failed` and untouched.
