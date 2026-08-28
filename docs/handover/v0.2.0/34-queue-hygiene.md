# 34 — Queue hygiene

**Item id / stream at handover:** 34 · s391-day3-core  
**Status at v0.2.0 (tag `d120c53`, 2026-08-28 05:2xZ):** designed, not started; one narrow pseudo-seat guard already shipped incidentally with Item 31, while terminal sweeping, watcher cleanup, stale reporting, and complete regression coverage remain outstanding (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:1-28`; `d120c53:.pi/extensions/pij/daemon.ts:1669-1690`; `d120c53:.pi/extensions/pij/daemon.test.ts:2612-2631`).  
**Size estimate:** L, 1-2 days; five ordered tasks span daemon delivery, SQLite state, watchdog sidecars, CLI rendering, docs, and merge-product gates (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:17-28`). · **Order / dependencies:** after Item 33; preserve Item 1/1b retirement and revive behavior (`docs/plans/391-day3-core/391-day3-core-plan.md:686-710`; `docs/plans/391-day3-core/rulings.md:148-150`).

## 1. Why this exists (the observed failure, with evidence)

- Restart #6 exposed **119 queued rows**: 78 receipts addressed to pseudo-seat `pij-watchdog` — written by the READING seats, not the daemon (see the correction at the end of this section; 83 rows at seq 166–6975 measured 2026-08-28T06:16Z, newest created 06:16:10Z, growing with every nudge read), 39 rows addressed to `pij-glorious-termite` after that prime had been dissolved for 78 hours, and two singleton rows (`docs/plans/391-day3-core/rulings.md:148-150`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:1-7`).
- The pseudo-seat leak: every seat that READS a watchdog nudge writes a `kind: "receipt"` row back to `message.from` = `pij-watchdog` (three seat-side writers — `core/session.ts:696-703`, `cli.ts:1285-1290`, `core/cli.ts:4854-4859` — none consults the registry); the daemon's own writer `emitSendReceipt` (`daemon.ts:1669-1690`) already returns for an unregistered sender and is NOT the source. The fix is one predicate in the shared enqueue seam every writer passes through, with one sensor per writer (E34).
- The terminal sweep is still closed-only: it requires `lifecycle === "dissolved"`, a `closeIntent`, `terminal.disposition === "requested"`, and no `revivePendingAt`; failed seats, death-dissolved seats, and stale revive markers therefore evade retirement (`d120c53:.pi/extensions/pij/daemon.ts:1000-1013`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:3-7`).
- The concrete termite record had `revivePendingAt=2026-08-24T06:41:45.340Z`, then a later CLI close at `2026-08-24T21:39:24.896Z`; the stale marker incorrectly overrode the later terminal transition (`docs/plans/391-day3-core/rulings.md:150-151`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:5-6`).
- The same dead seat remains in `pij-gravitas-shortfall`'s watcher sidecar beside live watcher `pij-vocal-kingfisher`, so status can present a terminal watcher as current (`docs/plans/391-day3-core/rulings.md:150-151`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:14`).
- A read-only live query at handover time found 80 queued receipt rows to `pij-watchdog`, oldest seq 166 and newest seq 6705; the 39 termite rows had been retired at seq 160-6251, while 17 older termite rows were already `failed` at seq 122-138. The exact query was:

  ```sql
  SELECT m.to_id,d.state,COUNT(*),MIN(m.seq),MAX(m.seq),
         datetime(MIN(m.created_at)/1000,'unixepoch'),
         datetime(MAX(m.created_at)/1000,'unixepoch')
  FROM messages m
  JOIN deliveries d ON d.seq=m.seq
  WHERE m.to_id IN (
    'pij-watchdog',
    'pij-glorious-termite',
    'pij-chubby-echidna',
    'pij-improved-chicken'
  )
  GROUP BY m.to_id,d.state
  ORDER BY m.to_id,d.state;
  ```

  This was read-only against the live queue; the historical 119-row snapshot and the later operator retirement are recorded at `docs/plans/391-day3-core/rulings.md:148-150`.


- **Correction (orchestrator's cheap look, 2026-08-28 ~06:5xZ)**: the 80 `pij-watchdog` receipt rows are NOT written by the daemon's `emitSendReceipt()` (which already returns when `registry.read(sender)` is absent, `daemon.ts:1669-1690`). They are written by the RECEIVING SEAT when it reads a watchdog nudge — three seat-side writers, none of which consult the registry: `core/session.ts:~697-703` (pi extension: `ports.delivery.deliver({ from: self, to: r.to, kind: "receipt" })` on injection), `cli.ts:~1285-1292` (`pij inbox` read receipt for claude/copilot/codex seats: `channel.deliver({ from: self, to: action.to, kind: "receipt" })`), and `core/cli.ts:~4858`. Live proof: the newest rows are `seq 6831 from pij-static-giraffe`, `6705 from pij-ordinary-raccoon`, `6493 from pij-gravitas-shortfall` — ordinary seats replying to `pij-watchdog` (and, since item 31, to `pij-daemon`). So the fix must sit in the ONE shared enqueue seam every writer goes through, not at the daemon writer.

- Watcher-sidecar evidence (inline, read 2026-08-28 ~06:5xZ): `~/.pij/pij-gravitas-shortfall/watchdog.json` lists `pij-glorious-termite` (dissolved 2026-08-24; `addedAt: 2026-08-22T04:11:18.853Z`, `capture: always`) beside the live `pij-vocal-kingfisher` (`addedAt: 2026-08-28T04:16:25.490Z`, `capture: anomaly`).

## 2. What is ruled (design / spec)

- Any `kind: "receipt"` row — whichever writer produces it (the three seat-side writers `core/session.ts:696-703`, `cli.ts:1285-1290`, `core/cli.ts:4854-4859`, or the daemon's already-guarded `emitSendReceipt` at `daemon.ts:1675`) — is enqueued only when its destination has a registry record in the hot or archive view, enforced ONCE in the shared enqueue seam; missing pseudo-seats are recorded-and-dropped, while receipts to registered senders remain delivery evidence (`docs/plans/391-day3-core/391-day3-core-plan.md:688-708`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:20-23`).
- One `isTerminalRecipient(descriptor, nowMs)` decision must classify complete close, other dissolved records, failed records, and records with terminal evidence; its reason is class-specific: `recipient-closed`, `recipient-dissolved`, `recipient-failed`, or `recipient-dead` (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:21-23`).
- `revivePendingAt` is a bounded brake, not permanent immunity: it exempts retirement only when newer than the terminal transition and younger than `REVIVE_PENDING_MAX_MS = 1 h` (`docs/plans/391-day3-core/391-day3-core-plan.md:691-708`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:21-23`).
- The existing sweep cadence remains the only archive-tier scan; no new per-tick `listTerminal()` read is allowed (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:7,23`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/review-brief.md:4`).
- That sweep must also remove terminal watcher ids from sidecars, log the target/watcher pair once, and make `pij watchdog status <id>` label a terminal watcher before removal (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:22-23`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:14`).
- `pij queue` must add text `stale: N row(s) queued > 24 h (oldest seq S, to <id>)` and JSON `stale:{count,oldestSeq,oldestTo}` without changing `pij queue retire` (`docs/plans/391-day3-core/391-day3-core-plan.md:691-710`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:24-25`).
- Accepted degradations: the live queue remains untouched until the o-prime retires rows after verification, and archive scanning remains on the existing sweep cadence (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:3,7`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:10-14`).

## 3. Where the code is (at tag `d120c53`)

| Surface | Current behavior at `d120c53` | Required change |
|---|---|---|
| `.pi/extensions/pij/daemon.ts:1669-1690` | `emitSendReceipt()` already returns when `registry.read(sender)` is absent, then enqueues registered-sender receipts. | Preserve the guard; strengthen it through both sensor ids, real SQLite, and one diagnostic naming sender + sequence. |
| `.pi/extensions/pij/core/session.ts:~697-703`, `.pi/extensions/pij/cli.ts:~1285-1292`, `.pi/extensions/pij/core/cli.ts:~4858` | Seat-side receipt writers (pi extension on injection; `pij inbox` read receipt; CLI ack path) enqueue `kind: "receipt"` to `message.from` with no registry check — the source of the `pij-watchdog` rows. | Do NOT patch each writer. Put `canEnqueueTo(to)` (registry row exists, hot or archive) in the shared `MessageChannel.deliver` / `sqlite-queue.ts enqueue` path for `kind: "receipt"` (record-and-drop with one log line naming sender + seq); each writer then gets ONE sensor proving its receipt to a pseudo-seat is dropped and its receipt to a registered seat survives (E34). |
| `.pi/extensions/pij/daemon.ts:1000-1045` | `retireForClosedRecipients()` builds only the complete-close set and retires queue plus open dispatch rows with `recipient-closed`. | Replace the closed-only predicate with the single terminal classifier and carry its class reason through both queue and dispatch retirement. |
| `.pi/extensions/pij/adapters/fs-registry.ts:402-415` | `listTerminal()` begins a combined hot/archive terminal view. | Reuse this existing sweep input; do not add another archive traversal. |
| `.pi/extensions/pij/adapters/channel-factory.ts:104-110,138-150` | `sqliteOf()` exposes the SQLite adapter and `openChannel()` selects `sqlite`, `dual`, or `fs`. | Keep daemon and CLI tests on these production seams rather than constructing a substitute path. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts:540-593` | `retire()` transitions any selected open state and appends a reason receipt. | Reuse it with the terminal class reason; do not change operator-retire semantics. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts:683-739` | `summary()` returns rows, attempts, leases, and receipt trails but no stale aggregate. | Add a read-only stale-queued query or equivalent projection used by `pij queue`. |
| `.pi/extensions/pij/cli.ts:812-897` | `runQueue()` opens through `openChannel()`, calls `sqliteOf()`, prints rows, and emits JSON `{rows,total,shown}`. | Add the stale text footer and JSON field without changing filters or truncation behavior. |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts:258-285,681-750` | Reconciliation drops ineligible watched sessions from runtime state; sidecars are cached and watcher notices are emitted from stored watcher ids. | Add terminal watcher classification/removal only; leave the fire path unchanged. |

## 4. Acceptance (behavioural, mechanical)

- Add `daemon.delivery.test.ts` coverage named `drops receipts to unregistered sensor senders but preserves registered receipts`: drive a real `SqliteQueue` through the daemon, send from `pij-watchdog` and `pij-daemon`, assert no receipt rows to those ids, then send from a registered seat and assert its receipt plus exactly one drop log per pseudo sender (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:20`).
- Add terminal-sweep cases in `daemon.test.ts` / `daemon.delivery.test.ts`: dissolved-by-exit, failed, terminal-with-active-lifecycle, termite's stale revive marker, and a fresh post-terminal revive marker; seed two queue rows and an open dispatch per terminal case, then assert class-named retirement while the fresh case remains open (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:21`).
- Add watcher tests in `daemon.test.ts`, `core/daemon/watchdog-manager.test.ts`, and `cli.integration.test.ts`: status first renders `W — terminal`, the sweep removes W once with one log naming X and W, and a live watcher remains byte-identical (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:22`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:14`).
- Add text/JSON CLI tests for the exact stale summary, including zero, one, and multiple recipients and a stable oldest-sequence tie break (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:24`; `d120c53:.pi/extensions/pij/cli.ts:812-897`).
- `MUT-QUEUE-PSEUDO-RECEIPT`: remove the registry-presence guard at `d120c53:.pi/extensions/pij/daemon.ts:1675`; the pseudo-sender SQLite test must go RED.
- `MUT-QUEUE-REGISTERED-RECEIPT`: make that guard reject every sender at `d120c53:.pi/extensions/pij/daemon.ts:1675`; the registered-sender receipt case must go RED.
- `MUT-QUEUE-CLOSED-ONLY`: restore the predicate at `d120c53:.pi/extensions/pij/daemon.ts:1003-1009`; the dissolved, failed, and dead-terminal cases must each go RED.
- `MUT-QUEUE-REVIVE-UNBOUNDED`: treat any `revivePendingAt` as exempt at the future terminal predicate replacing `d120c53:.pi/extensions/pij/daemon.ts:1003-1009`; the termite-shaped stale-marker case must go RED.
- `MUT-QUEUE-WATCHER-SWEEP`: skip terminal watcher removal at `d120c53:.pi/extensions/pij/core/daemon/watchdog-manager.ts:258-285`; the sidecar-removal test must go RED.
- `MUT-RECEIPT-SEAT-WRITERS`: revert the shared-seam predicate to the daemon-writer guard only → the pi-extension (`session.ts`) and `pij inbox` (`cli.ts`) receipt-to-`pij-watchdog` tests RED (rows appear); a receipt to a registered seat via each writer stays GREEN.
- `MUT-QUEUE-STALE-QUERY`: remove the stale aggregate added beside `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:683-739`; the `pij queue` text and JSON tests must go RED.
- Gates are the merge-product full extension suite in a fresh worktree, `just typecheck`, `just pij-skill-check`, two consecutive green full runs, and retained logs before teardown (`docs/handover/v0.2.0/README.md:7-11`; `docs/handover/v0.2.0/TEMPLATE.md:16-19`).

## 5. Live verification (after a daemon restart carrying it)

1. Before restart, record the read-only baseline with:
   `sqlite3 -readonly ~/.pij/queue/pij.sqlite "SELECT m.to_id,d.state,COUNT(*),MIN(m.seq),MAX(m.seq) FROM messages m JOIN deliveries d ON d.seq=m.seq GROUP BY m.to_id,d.state ORDER BY m.to_id,d.state;"`; do not retire rows from the implementation seat (`docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:10-14`).
2. Restart only under the shared-daemon freeze protocol, then run `pij queue --all` and `pij queue --json`; expect the stale summary to identify the current old queued population and oldest sequence, while newly injected sensor-authored messages create no new pseudo-seat receipt rows (`docs/handover/v0.2.0/README.md:7-11`; `d120c53:.pi/extensions/pij/cli.ts:812-897`).
3. Run `pij watchdog status pij-gravitas-shortfall`; expect `pij-glorious-termite` removed after the sweep and `pij-vocal-kingfisher` preserved unchanged (`docs/plans/391-day3-core/rulings.md:150-151`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/packet-addendum.md:14`).
4. Query the queue again and compare ids/ranges, not only totals; failure is any new queued row to `pij-watchdog`/`pij-daemon`, any terminal-recipient row still open, a missing registered-sender receipt, or a stale summary that disagrees with SQL (`docs/handover/v0.2.0/README.md:17-18`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/review-brief.md:4`).

## 6. Risks / gotchas that already bit us

- **E29 — silent loss outranks noisy duplicate:** the registry predicate must drop only impossible pseudo-seat destinations; a real sender's receipt remains durable (`docs/handover/v0.2.0/README.md:14`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/review-brief.md:4`).
- **E34 — a sensor proves exactly the layer it drives:** exercise the daemon receipt call site and the production channel factory, not only a queue helper (`docs/handover/v0.2.0/README.md:15`; `d120c53:.pi/extensions/pij/daemon.ts:1669-1690`; `d120c53:.pi/extensions/pij/adapters/channel-factory.ts:104-110,138-150`).
- **E40 — mutate previously uncovered code:** separately mutate pseudo-seat filtering, registered receipts, each terminal class, revive freshness, watcher cleanup, and stale reporting (`docs/handover/v0.2.0/README.md:15`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/review-brief.md:4`).
- **E35/E22 — fresh merge-product gates and full red logs:** long-lived-worktree green is diagnostic only, and every failing run must survive before teardown (`docs/handover/v0.2.0/README.md:16`).
- **E42/E43 — absence and counts are weak evidence:** cite queue ids, sequence ranges, timestamps, and the named sidecar rather than “no new rows” or a count alone (`docs/handover/v0.2.0/README.md:17`; live queue rows above).
- **E45 — production factories are mandatory:** use `openChannel()`/`sqliteOf()` so dual/default behavior cannot disappear behind a hand-picked adapter (`docs/handover/v0.2.0/README.md:18`; `d120c53:.pi/extensions/pij/adapters/channel-factory.ts:104-110,138-150`).
- **E47 — execute operational commands before publishing them:** verify the exact `pij watchdog status` and `pij queue` forms during the live proof (`docs/handover/v0.2.0/README.md:19`).

## 7. Open questions for the human

- None. AC-34 already fixes the recipient classes, revive bound, watcher behavior, and stale-query scope; implementation should encode deterministic class precedence and count every queued row rather than reopen those decisions (`docs/plans/391-day3-core/391-day3-core-plan.md:691-710`; `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/tasks.md:20-25`).
