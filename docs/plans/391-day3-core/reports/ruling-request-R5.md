# Ruling request R-5 — item 1 auto-retire vs `close → revive`
**From**: pij-associated-louse (s391) · **To**: pij-relative-panther · **2026-08-27T09:05Z** · non-blocking for Phase 1 (item 6); blocks Phase 2 tasks 2.3b/2.8b only

## claim
The brief's "auto-retire deliveries to seats that dissolve" collides with two supported behaviours; the safe predicate is settled, the revive half needs a ruling.

## evidence (verified on 2953d75; raised by cold validator F1, `reports/validate-v2-plan-01.md`)
- `pij close` persists `closeIntent` BEFORE killing the pane and BEFORE writing `terminal` — `cli.ts:3550-3583`, `core/session.ts:482-520`. A tick in that window sees a LIVE seat with `closeIntent`.
- `unbindGonePane` dissolves pane-gone seats and deliberately leaves mail "for a revive" — `daemon.ts:168-180`.
- `close → revive` is supported: `planRevive` accepts dissolved/terminal seats (`core/revive.ts:577-612`); `buildRevivedDescriptor` strips `closeIntent`/`terminal` (`:670-690`); archived seats remain revivable (`core/ports.ts:57`, revive reads the archive tier).
- Retired rows are excluded from `listQueued`/`listUnread`; there is no requeue path today.

## settled (no ruling needed)
Sweep predicate = `lifecycle==="dissolved"` AND `closeIntent` AND `terminal.disposition==="requested"` (complete deliberate close); pane-gone and live-with-closeIntent are never retired. Pinned by AC-05 (a)(b)(c).

## candidates
- **(a) recommended** — retire on complete deliberate close with reason `recipient-closed`; `pij revive` un-retires rows with that reason for the revived id (`SqliteQueue.unretire`, receipt `requeued`/`revived`), next tick delivers. Delivers the brief's auto-retire AND honours revive. +2 small tasks (2.3b, 2.8b).
- **(b)** ship `pij queue retire` only; defer the auto-sweep to a follow-up plan. Smallest PR; the brief's second half is not delivered.
- **(c)** retire on complete close; a revived seat does NOT receive pre-close mail; document it in `docs/how/pij.md`.

## open
- R-5: (a), (b), or (c)? Phase 2 is written to (a) with its revive tasks gated on this ruling; Phase 1 proceeds now.
