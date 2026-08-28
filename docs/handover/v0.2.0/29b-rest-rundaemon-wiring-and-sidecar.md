# 29b-rest — runDaemon-booted notifier-wiring assertion + sidecar reject-all silent-loss

**Item id / stream at handover:** 29b (remainder after 29b-T001) · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** partially landed. 29b-T001 (deps fold + call-site pin + supervisor overrides) shipped in PR #30 (main `ae7356b`); item-24's C1/C2/C3 added `T-LOG1-SUP` driving the REAL `bridgeSupervisorForDaemon` (PR #32). What REMAINS: (a) a test that boots **runDaemon itself** and asserts the notifier wiring; (b) the `parseSidecar` reject-all silent-loss (E29).
**Size estimate:** M, ~4–6 h · **Order / dependencies:** after 29b-T001 (PR #30) and item 24 (PR #32), both merged.

## 1. Why this exists (the observed failure, with evidence)
- **Wiring is proxy-tested only.** `runDaemon` (`daemon.ts:1727`) wires `bridgeSupervisorForDaemon(pijHome, { … notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(...)) })` at `:1842`/`:1861`. Cold review PROVED (rulings `docs/plans/392-day3-codex-doctrine/rulings.md:283`) that reintroducing the original single-prime bug AT THE CALL SITE left ALL sensors green (the factory test drives the factory, not runDaemon's use). 29b-T001 pinned the call-site as a source string + `T-LOG1-SUP` drives the factory — but **no test boots runDaemon and asserts the notice reaches a watcher**. E28/E34 one level up, on the human channel.
- **Sidecar reject-all (E29 silent-loss).** `parseSidecar` (`adapters/watchdog-store.ts:35`) returns `undefined` on ANY bad field — `enabled`(:38), `intervalMs`(:39), `pausedBy`(:41), `pausedAtMs`, `exemptUntilMs`, non-object (SIX non-watcher checks) plus the watcher check — so a malformed NON-watcher field ALONE makes `parseSidecar` return `undefined` and drops EVERY watcher; a real prime watching pij-telegram gets NOTHING on a bridge restart. The skip log (`daemon.ts:168-188`) then reads "watchers file unreadable/malformed (N dropped, M malformed)" (`:168-170`) — the operator sees a malformed COUNT, never the valid watcher silently discarded. Reviewer-verified live: malformed `intervalMs` + 1 valid watcher → notified 0, log "(1 dropped, 0 malformed)".

## 2. What is ruled (design / spec)
- **runDaemon-booted behavioural assertion** (o-prime Dim-1 #4, `docs/plans/392-day3-codex-doctrine/reviews/item-29b-t001-deps.md`): NOT "add a boot test" (`daemon.bootstrap.test.ts` already boots runDaemon 7×) — add an ASSERTION on the notifier wiring inside the already-booted runDaemon: fake registry of N live primes + 1 pij-telegram watcher → the restart notice reaches the watcher, never "the single prime".
- **ADV-2/5 (E29):** `parseSidecar` must reject only the OFFENDING entry, not the whole sidecar — a valid watcher must survive a malformed sibling field. Silent loss of watchers on the human channel is the forbidden degradation.
- **The honest-reason/count skip log is ALREADY SHIPPED** — this was ADV-3 (not ADV-4); rulings `docs/plans/392-day3-codex-doctrine/rulings.md:312` records APPROVE. `daemon.ts:168-170` already reads "(N dropped, M malformed)", reviewer-verified live. The ONLY outstanding sidecar work is the `parseSidecar` reject-all above (ADV-2/5). The real ADV-4 (`docs/plans/392-day3-codex-doctrine/rulings.md:286`) is a separate advisory — read it there.
- **Zero-watcher fallback (OPEN, see §7):** when the roster resolves to NO live watcher, today the notice is honest silence; the o-prime's recorded lean (spine 28966) is "notify all LIVE primes, liveness-filtered". This is an unruled design decision for 29b-rest — build it only after the human decides (§7).

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/daemon.ts`: `runDaemon` `:1727`; the `notifyOwner` closure builder `:246`; the wiring `bridgeSupervisorForDaemon(pijHome, {…})` `:1842` and `notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(...))` `:1861`; the skip-log branches `:168-188`.
- `.pi/extensions/pij/adapters/watchdog-store.ts`: `isWatcher` `:25`; `parseSidecar` `:35-` (the reject-all — change to per-entry filtering that keeps valid watchers).
- Boot harness: `daemon.bootstrap.test.ts` (drives `runDaemon`; add the wiring assertion here).
- Prior-art anchors + full advisory table: `docs/plans/392-day3-codex-doctrine/tasks/item-29b-bridge-advisories/tasks.md` rows T001c (wiring test), T001b/T001d (honest log/count); rulings `docs/plans/392-day3-codex-doctrine/rulings.md:283,308,331-332`.

## 4. Acceptance (behavioural, mechanical)
- **Test (wiring):** boot runDaemon (via `daemon.bootstrap.test.ts`) with a fake registry of ≥3 live primes + 1 pij-telegram watcher; assert the restart-owner notice is delivered to the WATCHER. `MUT-WIRING` = reintroduce the single-prime call-site gate at `:1861` with the factory intact → the test REDs with EVERY source-pin grep DELETED (grep allowed only as a 2nd sensor, E37/E40). If runDaemon's wiring is genuinely un-drivable in a test, say why in the report and escalate (o-prime ruled this the proper fix; the bootstrap frankenstein blocked it on the old stream tree — a fresh-main base unblocks it, `docs/plans/392-day3-codex-doctrine/rulings.md:332`).
- **Test (sidecar):** a sidecar with one valid watcher + one malformed non-watcher field → the valid watcher SURVIVES and receives the notice. `MUT-SIDECAR-REJECT-ALL` = revert `parseSidecar` to reject-the-whole-sidecar → the survive test REDs.
- **Gates:** full suite at the merge product (fresh worktree), `just typecheck`, two green runs, logs kept (E22/E35).

## 5. Live verification (after a daemon restart carrying it)
On a multi-prime machine, register a watcher (`pij watchdog watch pij-telegram`, E47) then restart the daemon: the restart-owner notice must reach that watcher (check its inbox / the bridge log), even with a deliberately malformed extra field in `~/.pij/pij-telegram/watchdog.json`. Failure looks like: the notice skipped with "has no watchers" while a valid watcher is registered.

## 6. Risks / gotchas that already bit us
- **E28/E34/E40** — the factory test is not the call-site test; MUT must hit the wiring runDaemon actually runs, with greps deleted.
- **E29** — reject-all is silent loss on the human channel; the whole point of ADV-2/5.
- **E42/E43** — a "notice reached nobody" claim names the sidecar file + its watcher ids, never a count.

## 7. Open questions for the human
- Zero-watchers behaviour — OPEN design question, decide WITH THE HUMAN. **Shipped today = no fallback, honest silence**: if nobody ran `pij watchdog watch pij-telegram`, the notice reaches no one (the stream's record of the reviewer finding, `docs/plans/392-day3-codex-doctrine/rulings.md:257`: "NO FALLBACK … SPOF moved" — this is the SHIPPED behaviour, not a ruling that closes the question). **The o-prime's recorded LEAN for 29b-rest** (spine 28966, 21:3xZ, which routed the zero-watcher fallback into 29b-rest): "zero watchers → notify all LIVE primes, liveness-filtered". So the choice is: keep honest silence + log the resolved sidecar path, OR add the liveness-filtered live-prime fallback (the prime's lean). Neither is ruled yet.
