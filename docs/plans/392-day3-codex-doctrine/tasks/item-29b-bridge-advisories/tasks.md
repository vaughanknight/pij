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

## T001 FOLD (o-prime ruling — PRE-MERGE, after item-24 fold, same coder)
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T001a (ADV-1 behavioural test) | ONE test that drives the REAL `notifyOwner` closure (extract a small factory if needed) with a REGISTRY holding 3 primes + a watcher list → asserts EXACTLY the watcher is notified, primes are NOT. It must go RED against a notify-nobody impl EVEN WITH the source-pin grep deleted. MUT-OWNER must RED on THIS behavioural test (keep the grep as a 2nd sensor if you like). | `daemon.ts` (extract factory if needed), `daemon.test.ts` | RED→GREEN; MUT-OWNER reds the behavioural test | today the ONLY guard is a substring grep (E28 false-green) |
| [ ] | T001b (ADV-2 honest log — E29 silent-loss) | when `store.read(TELEGRAM_PEER_ID)` returns undefined (unreadable/malformed sidecar — parseSidecar rejects the WHOLE sidecar on one bad entry), log "watchers file unreadable/malformed (N entries rejected)" NOT "has no watchers" — so a real watcher silently dropped isn't reported as "none". The underlying every-rejects-all drop is pre-existing store code → 29b-rest. | `daemon.ts` (+test) | RED→GREEN: a malformed-sidecar case logs the honest reason | MUT: revert to the "no watchers" line → the honest-log test RED |

## T001 WIRING FOLD (o-prime ruling — PROPER wiring test; E28 wiring-vacuity never ships)
The fold closed the NOTIFIER's vacuity but not the WIRING's: a re-intro of the single-prime bug AT THE CALL SITE (factory intact) stays fully green. Base = 29b-T001 fold 87a0c13.
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T001c (PROPER wiring test) | drive runDaemon's bridge-supervision wiring (`daemon.ts:1680-1699` `bridgeSupervisorForDaemon(pijHome, { … notifyOwner })`) — reached via `daemon.bootstrap.test.ts` (drives runDaemon), OR extract the `notifyOwner` wiring into a named fn, test IT, AND pin that runDaemon passes it. Fake registry of 3 primes + 1 pij-telegram watcher → the notice reaches the watcher. MUT-WIRING = reintroduce the single-prime call-site gate with the factory intact → RED with EVERY grep deleted (cheap grep allowed only as a 2nd sensor). If runDaemon's bridge wiring is genuinely unreachable in a test, SAY WHY in the report and the o-prime rules again. | `daemon.ts`, `daemon.bootstrap.test.ts` (or the extracted-fn test) | RED→GREEN; MUT-WIRING reds standalone | closes the WIRING E28 |
| [ ] | T001d (ADV-3 honest count) | the malformed-sidecar log should read "N dropped (M malformed)" (via filter(isWatcher)), not "N entries rejected" (which counts VALID watchers as rejected). | `daemon.ts` (+test) | RED→GREEN | ADV-2/4/5 → 29b-rest (ADV-5 E29 first) |

## T001 WIRING RE-FOLD (o-prime ruling — PROPER, mechanical acceptance; rename≠extraction)
ad32ecb only RENAMED the factory; the CALL SITE (`notifyOwner: notifyBridgeOwner`, daemon.ts:1800) is still unguarded (a single-prime re-intro passes all 4 sensors). Base = 29b-T001 chain 87a0c13/ad32ecb.
**MECHANICAL ACCEPTANCE** (the reviewer RUNS this, does not read it):
- `MUT-WIRING.patch` (in this packet) reintroduces the call-site single-prime gate.
- With EVERY source-pin grep DELETED: `git apply MUT-WIRING.patch` → the NEW wiring test RED; `git apply -R MUT-WIRING.patch` → GREEN.
| # | Task | Path(s) | Done When | Notes |
|---|------|---------|-----------|-------|
| [ ] | T001e (PROPER wiring test) | boot the real daemon composition via the `daemon.bootstrap.test.ts` seam (OR drive `bridgeSupervisorForDaemon`'s call-site wiring) with a fake registry of 3 primes + 1 pij-telegram watcher → assert the notice reaches the WATCHER. The MUT-WIRING.patch (call-site single-prime gate) must RED this test with every grep deleted. | `daemon.ts`, `daemon.bootstrap.test.ts` (+ `daemon.test.ts` if needed) | mechanical acceptance passes | NOT a rename — the TEST must exercise the CALL SITE |
| [ ] | T001f (extraction FALLBACK, only if runDaemon is genuinely unbootable — write WHY) | make `wireBridgeRestartNotifier(registry, watcherStore, send)` the ONLY thing runDaemon calls on that path (one line); test the fn with the same fake registry; the cheap pin `toContain("notifyOwner: wireBridgeRestartNotifier(")` pins THAT one call line. Re-target MUT-WIRING.patch to the new call-site line + commit it. | `daemon.ts`, `daemon.test.ts` | fallback justified + mechanical acceptance passes | an EXTRACTION, not a rename |
| [ ] | T001g (cheap pin, 2nd sensor) | `expect(source).toContain("notifyOwner: notifyBridgeOwner")` (or the extracted call-line) — pins the USE, not the declaration. As a SECOND sensor, never alone. | `daemon.test.ts` | present | |
| [ ] | T001h (ADV-2 catch branch) | daemon.ts:184's catch still emits hardcoded "(0 entries rejected)" (the unparseable-JSON case → the LESS informative one, unsensored). Make it honest ("watchers file unreadable/malformed") AND sensored (a MUT reverting it reds a test). | `daemon.ts` (+test) | RED→GREEN | |
| [ ] | T001i (ADV-3 export isWatcher) | replace the hand-copy `isBridgeWatcherEntry` with the EXPORTED `isWatcher` (watchdog-store.ts) — no schema-drift misattribution. | `daemon.ts`, `adapters/watchdog-store.ts` | uses the shared predicate | ADV-4 → 29b-rest |

Then: cold re-review (reviewer RUNS the MUT-WIRING.patch acceptance) + two green full runs on the fresh-main PR worktree → 29b-T001 PR (union+drop-resolve daemon.test.ts imports). Run ONLY the daemon fence as coder gate (E35).
