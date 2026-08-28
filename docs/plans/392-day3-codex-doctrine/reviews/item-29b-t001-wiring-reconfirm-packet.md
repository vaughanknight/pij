# 29b-T001 WIRING fold — re-confirm (hunk only, cold)

**Candidate**: `ad32ecb6e0bc1bf5de847ed9bc4b473566b674dc` — the 29b-T001 chain (816a726 → 87a0c13 → ad32ecb). **Cherry-pick the chain onto FRESH main; union-resolve the daemon.test.ts import conflict** (main's items 10a/10b/13/15/29 drift lands in-fence). Full-suite gate is on THIS PR worktree, not the stream tree (E35).
**Prior**: 29b-T001 + its fold both APPROVE. This re-confirms the WIRING fold that closes the E28-one-level-up you found. **Write to** `reviews/item-29b-t001-wiring-reconfirm.md`.

## What this closes (o-prime E28-wiring ruling)
The behavioural test previously exercised the FACTORY in isolation; a re-intro of the single-prime bug AT THE CALL SITE stayed fully green. Now the call-site wiring is extracted into a named `wireBridgeRestartNotifier` and tested behaviourally; production uses the same fn. Plus ADV-3 honest count.

## Dim-0 (MANDATORY, sha-verify RED→GREEN; lines CODER-CLAIMED — verify)
- **MUT-WIRING** (claimed daemon.test.ts:228) — headline: reintroduce the single-prime gate INSIDE `wireBridgeRestartNotifier` (factory intact) ⇒ RED on the behavioural test **with EVERY grep DELETED**. This is the fix — prove the behavioural test alone catches a call-site regression (contrast the pre-fold state where only the grep, or nothing, caught it). Re-run YOUR own call-site-reintro-with-grep-deleted probe.
- **MUT-HONESTLOG** (claimed daemon.test.ts:274): revert "N dropped (M malformed)" to "entries rejected" ⇒ RED.

## Dim-1
1. `wireBridgeRestartNotifier` is the ACTUAL production wiring (runDaemon calls it), not a parallel copy — a single-prime re-intro inside it is caught behaviourally WITHOUT the grep. Confirm production path: runDaemon → wireBridgeRestartNotifier → notifyOwner.
2. The honest count is now "N dropped (M malformed)" — M via filter(isWatcher); a valid watcher beside a malformed entry is counted in N (dropped) but NOT in M (malformed). Confirm A4 (3 valid + 1 malformed) reads "4 dropped, 1 malformed".
3. Owner resolution behaviour unchanged from the approved fold (only the wiring got a real test + the count got honest).
4. No collateral (E17): vitest list + line-diff on daemon.test.ts.

Report verdict + the 2 mutation shas/RED lines + Dim-1 to me. Then I run two green full runs on the PR worktree → 29b-T001 PR.
