# Restart #6 — post-restart live-proof checklist (this stream's obligations)

Restart #6 asked at main 3411794 / live checkout 916e915 (carries 24 + 30 + 15/15-FX/16/29b/31). Do these AFTER the daemon restarts and FREEZE is LIFTED. Baseline for comparison: `reports/item-24-live-acceptance-baseline.md` (pre-fix ~38% attempt-1 fail, NOT length-related).

## Item 24 — log-sink live proof
- [ ] `~/.pij/telegram-bridge.log` mtime ADVANCES on the first forwarded message post-restart (the in-process bridge now writes it — sensor was stale since item 29).
- [ ] A forwarded message's success line appears: `[pij-telegram] forwarded <id> part N/M`.
- [ ] On a retried (attempt-2) row, the durable file carries the attempt-1 error line (`forward error (<id>)` / `queue consumer error`).
- [ ] Crash-safety holds: no daemon crash from the tee (B1) — the daemon stays up across forwards.

## Item 24 — residual measurement (gates 24b)
- [ ] Measure `deliveries.attempt` over ≥ 1 h (PA chore 6 reports `TG attempt>1: N` every ~20 min).
- [ ] If residual first-attempt failures survive the single retry (residual > 0) → DISPATCH 24b (packet `tasks/item-24b-backoff-DRAFT-HOLD.md`, base fresh main). Else 24b not needed.

## Item 30 — routing behavior live
- [ ] Bare Telegram text now routes to the newest live prime WATCHING pij-telegram (watchdog roster), NOT the last speaker. Confirm I am a watcher: `pij watchdog watch pij-telegram` (roster ~/.pij/pij-telegram/watchdog.json).
- [ ] Message to nobody → guidance names `pij watchdog watch pij-telegram`.
- [ ] 29b: bridge-restart owner notice reaches the watchers (I should receive it if I'm watching).

## Then
- [ ] 12-FX (dispatch coder — `tasks/item-12-FX-DRAFT-HOLD.md`).
- [ ] Tail: 22 (unpark), E22, 23b, 21b, 29b-rest.

## RESULTS (observed 2026-08-28 ~14:13, restart #6 / pid 63524 / checkout 916e915)
- **Item-24 log-sink LIVE ✓**: ~/.pij/telegram-bridge.log mtime advanced to 14:13 (was stale since 20:53Z pre-item-24). Tail shows real item-24-format writes: `[pij-telegram] forwarded <id> part 1/1` + `forward complete <id> <sender> → chat`, plus `skip receipt`. Daemon up (pid 63524) — no crash from the tee (B1 holds). The human-channel diagnostic is now real/provable.
- **Item-30 routing LIVE ✓**: watchdog roster (~/.pij/pij-telegram/watchdog.json) = pij-relative-panther (o-prime) + pij-vocal-kingfisher (prime, newest 04:13). Bare text → newest live watching prime (kingfisher) — primes are the watchers, as designed. (Memory line 43 "I am pij-telegram's single watcher" is STALE — correctly I'm not a watcher; I'm a stream orchestrator, not the prime.)
- **Residual early-read**: post-restart (updated_at>14:06) pij-telegram deliveries = attempt-1 ×6, attempt-2 ×0. 0 retries in the first ~7 min (small n). FULL residual = chore-6 over ≥1 h; 24b trigger (residual>0) NOT yet met → HOLD 24b, await the hour.
- **Spine locks clean** (item 15 lock-release held across restart). **Fleet survived** (coder + reviewer done/active).
