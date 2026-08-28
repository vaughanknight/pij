# 29b-T001 review packet — owner notice via watcher list (cold, CODE, live-confirmed fix)

**Candidate**: `816a7269aed3b0430ef05334732fd0e68cd233ba` (base reconciled to main 031ccce; cherry-pick onto FRESH main — COORD-004). Small: daemon.ts(+test).
**Dossier**: `../tasks/item-29b-bridge-advisories/tasks.md` T001. **Write verdict to** `reviews/item-29b-t001-review.md`.

## What this lands (fixes the LIVE-confirmed owner-notice failure)
Item-29 live acceptance: the restart owner-notice was SKIPPED because `notifyOwner` required exactly one live prime (`daemon.ts:1673` `if (owners.length !== 1) return`) and this machine runs 3 governments. Fix: resolve the owner from `pij-telegram`'s WATCHER list — `store.read(TELEGRAM_PEER_ID).watchers` → dedup watcherId → notify EACH independently (bypassing relay/watchdog exemption via direct channel); 0 watchers → honest skip log, no crash. A source-pin guards against drifting back to "one live prime".

## Dim-0 (MANDATORY, sha-verify RED→GREEN; line CODER-CLAIMED — verify)
- **MUT-OWNER** (claimed daemon.test.ts:244): restore the single-prime callback ⇒ RED (the 3-primes-1-watcher test fails — proves the notice now follows watchers, not prime count).

## Dim-1
1. **3 primes + 1 watcher → EXACTLY the watcher** notified (not the primes); **0 watchers → skip logged, no crash**; multiple watchers → each notified once (dedup real).
2. **Exemption bypass genuine**: the notice reaches an exempt/relay watcher via the raw channel, not the composer-gated/exemption path.
3. **The source-pin** actually prevents regression (a test that fails if the resolution reverts to prime-count).
4. Bridge-less/no-watcher daemon: no crash, no spurious notice.
5. No collateral (E17): cherry-pick onto fresh main; vitest list + line-diff. gatesClean:false pre-existing only.

Report verdict + the MUT-OWNER sha/RED line + Dim-1 findings to me.
