# Item 29b: bridge supervision advisories (owner-via-watchers FIRST)

**Source**: item-29 cold review (`../../reviews/item-29-review.md`) + o-prime LIVE ACCEPTANCE 2026-08-28. **T001 is the o-prime's "first fix, ahead of 24".**
**Base**: main (fetch at dispatch; cherry-pick fresh-from-main). CODE. **Fence**: `daemon.ts` (+test), `telegram/index.ts` (+test) as needed.

### Tasks
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T001 (owner-via-watchers — FIRST, LIVE-CONFIRMED FAIL) | `notifyOwner` (`daemon.ts:1664-1701`) currently `if (owners.length !== 1) return` ("expected one live prime, found N") — FAILS on a multi-government machine (found 3). Resolve the restart owner from pij-telegram's WATCHER list (watchdog sidecar `watchers`, daemon.ts:499) and/or an explicit owner/spawner field; notify ALL watchers; NEVER "the single prime". | `daemon.ts`(+test) | RED→GREEN: 3 primes + 1 watcher → exactly the watcher notified; 0 watchers → honest skip (logged), no crash | the headline live failure |
| [ ] | T002 (ADV-1 stale/missing tail) | the owner-capture bridge-log tail is stale/missing for an IN-PROCESS restart (only the standalone path writes ~/.pij/telegram-bridge.log). Stamp the tail with mtime, or name which mode died, so a stale tail isn't presented as today's reason. | `daemon.ts`(+test) | RED→GREEN | reviewer's fix-first |
| [ ] | T003 (INFO-3 capped silence) | a permanent crash-loop notifies the owner 3× then goes SILENT (`capped` notifies nobody). Emit ONE "capped / giving up" notice so the human knows the bridge is permanently down. | `telegram/index.ts`/`daemon.ts`(+test) | RED→GREEN | undercuts "the human knows" |
| [ ] | T004 (ADV-2/3/4 + INFOs, batch) | ADV-2: `stop()` reused as restart teardown — `void bot.stop()` or amend the comment. ADV-3: rotate/bound telegram-bridge.log (don't read the whole file for 4KB). ADV-4: cover bridgeSupervisorForDaemon + note/notifyOwner closures with tests. INFO-1: delete dead `autoStartBridgeForDaemon` + stale comment. INFO-2: a malformed telegram.env should log once, not ~5.7k lines/day. INFO-4: owner notice `from:` should be `pij-daemon` (it authored it), not TELEGRAM_PEER_ID. | telegram/index.ts, daemon.ts (+tests) | each addressed or explicitly deferred with reason | low-priority batch |
| [ ] | T005 | gates + pathspec commit + report | reports/ | recorded | |

### Cold-review Dim-0
- **MUT-OWNER**: revert T001 to the single-prime resolution ⇒ the 3-primes-1-watcher test RED.
- **MUT-TAIL**: drop the mtime stamp ⇒ the stale-tail test RED.
- **MUT-CAPPED**: remove the capped notice ⇒ the crash-loop-silence test RED.
