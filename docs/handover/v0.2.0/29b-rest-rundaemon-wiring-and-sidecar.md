# 29b-rest — runDaemon-booted notifier-wiring assertion + sidecar reject-all silent-loss

**Item id / stream at handover:** 29b (remainder after 29b-T001) · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** partially landed. 29b-T001 (deps fold + call-site pin + supervisor overrides) shipped in PR #30 (main `ae7356b`); item-24's C1/C2/C3 added `T-LOG1-SUP` driving the REAL `bridgeSupervisorForDaemon` (PR #32). What REMAINS: (a) a test that boots **runDaemon itself** and asserts the notifier wiring; (b) the `parseSidecar` reject-all silent-loss (E29).
**Size estimate:** M, ~4–6 h · **Order / dependencies:** after 29b-T001 (PR #30) and item 24 (PR #32), both merged.

## 1. Why this exists (the observed failure, with evidence)
- **Wiring is proxy-tested only.** `runDaemon` (`daemon.ts:1727`) wires `bridgeSupervisorForDaemon(pijHome, { … notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(...)) })` at `:1842`/`:1861`. Cold review PROVED (rulings `docs/plans/392-day3-codex-doctrine/rulings.md:283`) that reintroducing the original single-prime bug AT THE CALL SITE left ALL sensors green (the factory test drives the factory, not runDaemon's use). 29b-T001 pinned the call-site as a source string + `T-LOG1-SUP` drives the factory — but **no test boots runDaemon and asserts the notice reaches a watcher**. E28/E34 one level up, on the human channel.
- **Sidecar reject-all (E29 silent-loss).** `parseSidecar` (`adapters/watchdog-store.ts:35`) returns `undefined` on ANY bad field — `enabled`(:38), `intervalMs`(:39), `pausedBy`(:41), `pausedAtMs`, `exemptUntilMs`, non-object — SIX reasons, only one about watchers. One malformed NON-watcher field silently drops EVERY watcher, so a real prime watching pij-telegram gets NOTHING on a bridge restart. The skip log (`daemon.ts:168-188`) now counts malformed entries (`:168-170` "N dropped, M malformed") but still can't see watchers that `parseSidecar` threw away wholesale.

## 2. What is ruled (design / spec)
- **runDaemon-booted behavioural assertion** (o-prime Dim-1 #4, `reviews/item-29b-t001-deps.md`): NOT "add a boot test" (`daemon.bootstrap.test.ts` already boots runDaemon 6×) — add an ASSERTION on the notifier wiring inside the already-booted runDaemon: fake registry of N live primes + 1 pij-telegram watcher → the restart notice reaches the watcher, never "the single prime".
- **ADV-2/5 (E29):** `parseSidecar` must reject only the OFFENDING entry, not the whole sidecar — a valid watcher must survive a malformed sibling field. Silent loss of watchers on the human channel is the forbidden degradation.
- **ADV-4:** the skip log names the honest reason and count (already partly done at `:170`); finish so a dropped valid watcher is never reported as "has no watchers" (`:175`/`:188`).

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/daemon.ts`: `runDaemon` `:1727`; the `notifyOwner` closure builder `:246`; the wiring `bridgeSupervisorForDaemon(pijHome, {…})` `:1842` and `notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(...))` `:1861`; the skip-log branches `:168-188`.
- `.pi/extensions/pij/adapters/watchdog-store.ts`: `isWatcher` `:25`; `parseSidecar` `:35-` (the reject-all — change to per-entry filtering that keeps valid watchers).
- Boot harness: `daemon.bootstrap.test.ts` (drives `runDaemon`; add the wiring assertion here).
- Prior-art anchors + full advisory table: `docs/plans/392-day3-codex-doctrine/tasks/item-29b-bridge-advisories/tasks.md` rows T001c (wiring test), T001b/T001d (honest log/count); rulings `rulings.md:283,308,331-332`.

## 4. Acceptance (behavioural, mechanical)
- **Test (wiring):** boot runDaemon (via `daemon.bootstrap.test.ts`) with a fake registry of ≥3 live primes + 1 pij-telegram watcher; assert the restart-owner notice is delivered to the WATCHER. `MUT-WIRING` = reintroduce the single-prime call-site gate at `:1861` with the factory intact → the test REDs with EVERY source-pin grep DELETED (grep allowed only as a 2nd sensor, E37/E40). If runDaemon's wiring is genuinely un-drivable in a test, say why in the report and escalate (o-prime ruled this the proper fix; the bootstrap frankenstein blocked it on the old stream tree — a fresh-main base unblocks it, `rulings.md:332`).
- **Test (sidecar):** a sidecar with one valid watcher + one malformed non-watcher field → the valid watcher SURVIVES and receives the notice. `MUT-SIDECAR-REJECT-ALL` = revert `parseSidecar` to reject-the-whole-sidecar → the survive test REDs.
- **Gates:** full suite at the merge product (fresh worktree), `just typecheck`, two green runs, logs kept (E22/E35).

## 5. Live verification (after a daemon restart carrying it)
On a multi-prime machine, register a watcher (`pij watchdog watch pij-telegram`, E47) then restart the daemon: the restart-owner notice must reach that watcher (check its inbox / the bridge log), even with a deliberately malformed extra field in `~/.pij/pij-telegram/watchdog.json`. Failure looks like: the notice skipped with "has no watchers" while a valid watcher is registered.

## 6. Risks / gotchas that already bit us
- **E28/E34/E40** — the factory test is not the call-site test; MUT must hit the wiring runDaemon actually runs, with greps deleted.
- **E29** — reject-all is silent loss on the human channel; the whole point of ADV-2/5.
- **E42/E43** — a "notice reached nobody" claim names the sidecar file + its watcher ids, never a count.

## 7. Open questions for the human
- Confirm the zero-watchers fallback: o-prime lean was "zero watchers → notify all LIVE primes, liveness-filtered" (`rulings.md:261`). Ship that here, or keep honest silence + guidance? (Recommend: honest silence + the resolved sidecar path logged; a live-prime broadcast risks noise.)
