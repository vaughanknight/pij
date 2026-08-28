# Item 29 — cold CODE review: Telegram bridge supervision (`ebdc984`)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or file change was
> run after this file was written. Everything below was executed on disk in
> throwaway worktrees, which have been removed.

**Verdict: ✅ APPROVE** — all 3 mandated Dim-0 mutations (run as 4, because MUT-LOUD
names two lines) RED→restore→GREEN with sha verification; all 6 Dim-1 questions
answered by execution, not reading. **4 non-blocking advisories + 5 INFO.** The
headline: the double-start/409 guard is real and *doubly* protected, and the sync
flush survives a real abrupt process death — but **the owner capture's "bridge log
tail" is only ever populated by the standalone path, so a supervised in-process
restart attaches an absent-or-STALE tail with no freshness check** (ADV-1).

---

## 1. Scaffolding, and the limits of this pass — stated before any finding

**Scaffolding I built** (all torn down; §8):

- `/tmp/pij-i29` — detached worktree at `origin/main` (`90ba189c`), then
  `git cherry-pick ebdc984` → `df0fca8`. `node_modules` symlinked from `~/GitHub/pij`.
- `/tmp/pij-i29-main` — detached worktree at `origin/main`, untouched baseline.
- `/tmp/i29-mut.py` — mutation harness: refuses a non-unique anchor, refuses a
  no-op, sha256s before/after, runs the fence, restores, re-runs.
- `/tmp/i29-probeA.ts` + `/tmp/i29-probeA2.py` — **real child processes** for the
  sync-flush claim.
- Two scratch vitest files in the candidate tree (`probe.i29.test.ts`,
  `probeD.i29.test.ts`), each deleted with existence re-verified.

**Pristine sha256 of the 4 fence files** (re-verified identical after every
mutation and at teardown):

| file | sha256 |
|---|---|
| `telegram/index.ts` | `394337e27fab72a3c5acd0fc03705ce2412e374f833e359be75489bcf56b9c81` |
| `telegram/index.test.ts` | `fabc9201d268ad30d5ea29ccb9f4d4abeec4512f1a2c62ef392671563ecb4ad0` |
| `daemon.ts` | `7cebe51ce56050658c2de5b7966f39394058aed440e6fafc31577f9dd23d986e` |
| `daemon.test.ts` | `17b2d008d7ab341cafefcbba531e895a52296126984e249ae2ef3452c0315d28` |

**What I did NOT examine — do not read these as clean:**

1. **No live Telegram network call anywhere in this pass.** Every probe stops short
   of `bot.start()`. The 409 behaviour itself is *reasoned from `acquireLock` +
   the supervisor's liveness gate*, never observed against Telegram. My
   double-start analysis is about whether a second `getUpdates` consumer can be
   *created*, not about what Telegram then does.
2. **No live daemon.** `runDaemon`'s `note` / `notifyOwner` closures
   (`daemon.ts:1645-1704`) were **read, not executed**. Dim-1 #5 (0 primes) is
   answered by code reading plus the surrounding try/catch structure — there is no
   test and I built none, because the closures are inline in `runDaemon` and not
   reachable without booting a daemon.
3. **`FsWatchdogStore.writeCapture` and `channel.deliver` were not mutated.** I
   verified the call arity/signature only.
4. The dossier `tasks/item-29-telegram-bridge-supervision/tasks.md` was not read.
5. The pre-existing red is environmental *on this host* (`pwsh` absent); behaviour
   on a PowerShell-equipped host is unknown to me.
6. My SIGTERM result (§5.1) was obtained under `tsx`; the production launcher may
   differ. The SIGKILL result is launcher-independent.

---

## 2. Branch shape and the fence — the drift hazard was live, and I handled it

`ebdc984` is **not** a single commit on top of `origin/main`:

```
origin/main               = 90ba189c   (PR #25 = item 21, which I reviewed)
candidate base (claimed)  = e19fdb1
merge-base(ebdc984, main) = 10483d8e   ≠ main
```

So I did exactly what the packet instructed (COORD-004) rather than reviewing the
stream branch:

```
git cherry-pick ebdc984      → df0fca8   (clean, no conflicts)
git show ebdc984 | git patch-id --stable → 2ccd77301409c1794f462d984f4040c1cdb6c75b
git show df0fca8 | git patch-id --stable → 2ccd77301409c1794f462d984f4040c1cdb6c75b
```

**Byte-faithful.** (`--stat` was *also* identical, but stat cannot distinguish a
changed line from an equal-sized different line — `patch-id` can.)

**Main's drift is disjoint from the fence.** `git diff --stat e19fdb1 origin/main`
touches exactly `core/daemon/index-state.test.ts`, `core/daemon/loop.test.ts`,
`core/daemon/loop.ts` — the item-21 delta. **None** of the 4 fence files. So
reviewing the cherry-pick is reviewing the item-29 delta and nothing else.

**Fence** (`+482 / −31`): `telegram/index.ts` (+234/−31 → the whole production
change bar the daemon wiring), `daemon.ts` (+97/−…), `telegram/index.test.ts`
(+150), `daemon.test.ts` (+32).

---

## 3. Dim-0 mutation ledger — 4 mutations, all RED → restore → GREEN

Baseline (both fence test files): **95 passed | 3 skipped**, exit 0, 6.7 s.

The packet names three mutations but gives **two** lines for MUT-LOUD, so I ran it
as two independent sub-mutations, which is the only way to attribute each RED.

| # | mutation (what I deleted/inserted) | mutated sha256 | result | RED tests |
|---|---|---|---|---|
| **MUT-LOUD-A** | deleted the `deps.onUncaughtException(...)` + `deps.onUnhandledRejection(...)` registrations (`index.ts:624-625`) | `c78d86a63269b873b7d41b27b3535258ee5b6365629311a613f51aa2ab504af7` | **RED** 2F/93P | `sync-writes uncaughtException reason + code before exiting`; `…unhandledRejection…` |
| **MUT-LOUD-B** | deleted the `deps.onExit((code) => …)` registration (`index.ts:626-628`) | `2502fd1fe5337c357e0643a1965836b4bdb1779ade31a5516efd6fa172e2aa17` | **RED** 1F/94P | `sync-writes a non-signal process exit code` |
| **MUT-SUPERVISE** | left detection intact, removed the action: inserted `return {kind:"not-started",reason:"skipped"}` immediately after `activeStop = undefined;` (`index.ts:461`) | `38d633551bf27b5ea9944326effb6e78354bcd0d2cefb4b1ce6dac88be0a75f8` | **RED** 2F/93P | `restarts a dead bridge within one tick…` (`expected {kind:'not-started'} to match {kind:'restarted'}`); `backs off and caps…` |
| **MUT-LIVE** | deleted the live short-circuit `if (previousPid !== null && deps.isAlive(previousPid)) { return {kind:"live"…} }` (`index.ts:442-444`) | `5fc7155b69c8dc7dcb7f5804b1a2584f4fe7e2a599b28a89dccc4ac8915a4519` | **RED** 2F/93P | **`never restarts a live bridge`** — `expected { kind: 'restarted', …(2) } to deeply equal { kind: 'live', pid: 4242 }` |

After every mutation the file sha returned to pristine and the fence returned
**95 passed | 3 skipped, exit 0**.

**MUT-LIVE is the one that matters** and it has teeth: with the guard removed, the
supervisor *does* restart a live holder and the suite says so in exactly those
words. The 409 hazard is sensored.

**Line-claim accuracy** (the packet flags these UNVERIFIED — correctly, per DL-011):

| claim | actual content | verdict |
|---|---|---|
| index.test.ts:641 | `const written = readFileSync(logPath, "utf8");` | **near** — the read line of the right block; assertions at 642-646 |
| index.test.ts:664 | `const written = readFileSync(logPath, "utf8");` | **near** — same, processExit block |
| index.test.ts:796 | `expect(supervisor.tick()).toMatchObject({ kind: "restarted", previousPid: 4242 });` | **exact** |
| index.test.ts:820 | `expect(supervisor.tick()).toEqual({ kind: "live", pid: 4242 });` | **exact** |

---

## 4. What the change actually is

Production delta is two independent pieces plus wiring.

**(a) Die loud** — `installStandaloneFailureHandlers` (`index.ts:612-629`), plus
`telegramStart`'s `log` now `appendFileSync`s every ordinary line to
`~/.pij/telegram-bridge.log` (`index.ts:636-642`), and `handleStartError`'s `fail`
appends too (`index.ts:701-704`). A `fatalRecorded` latch means the exit handler
never double-writes after a fatal.

**(b) Supervise** — `superviseBridge` (`index.ts:429-478`) plus the production
factory `bridgeSupervisorForDaemon` (`index.ts:515-546`), invoked from
`Daemon.tick()` at `daemon.ts:403` inside a try/catch, and disposed at
`daemon.ts:1497`. `maybeStartBridge` was refactored to delegate to a new
`attemptDaemonBridgeStart` that returns a tagged union carrying the pid + stop —
the old public signature is preserved verbatim, doc comment and all.

**Constructor arity — checked, because a positional pad is exactly where this
breaks.** `Daemon`'s constructor (`daemon.ts:269-283`) takes, in order: `pijHome`,
`rawPorts`, `registry`, `channel`, `log`, `watchManager?`, `batonSweep?`,
`watchdogManager?`, `heartbeat` (defaulted), `bridgeSupervisor?` — **10**. The call
site passes 10 with four explicit `undefined` pads. `undefined` triggers the
`heartbeat` default, so `FsTickHeartbeatStore` is still constructed. **Correct.**

**Detection model — worth stating plainly, because the two modes are not
symmetric.** The supervisor's liveness question is *"is the pid named in the lock
alive?"*, not *"is the bridge polling?"*.

- **Standalone bridge**: lock pid is that process. Pid death is a faithful proxy. ✓
- **In-process bridge**: `runtimeFor` sets `pid: process.pid` (`index.ts:306-312`),
  i.e. the **daemon's own pid**, which is alive by construction. So
  `isAlive(previousPid)` is a tautology there, and the *only* in-process detector
  is `readPid() === null` — which happens because `stop()` calls
  `releaseLock(lockPath, rt.pid)` (`index.ts:264-268`), driven by the
  fire-and-forget `.catch` at `index.ts:373`.

That chain is sound for the failure it targets, but it means an in-process bridge
that *stops polling without its promise rejecting* is invisible to supervision.
That is an honest scope limit of this design, not a defect in it — I raise it only
so it is not mistaken for health-checking.

---

## 5. Dim-1 — the live-channel risks, answered by execution

### 5.1 "The flush is genuinely SYNC" — ✅ **proven end-to-end against a real death**

Structural: `writeSync` is wired to `appendFileSync` at both call sites
(`index.ts:670`, and `telegramStart`'s `log` at `index.ts:638`). No
`createWriteStream`, no async fd anywhere on the path.

I did not stop at reading it. **Probe A** spawned real child processes via `tsx`
that wire the *real* `installStandaloneFailureHandlers` to real `process.once` +
real `appendFileSync` + real `process.exit`, then die. Contents of the log file
*after the child was reaped*:

| child death | exit | on disk |
|---|---|---|
| uncaught throw in a timer | 1 | `[pij-telegram] uncaughtException code=1` + full `Error: PROBE long-poll exploded` + stack + `stop() ran` |
| unhandled rejection | 1 | `[pij-telegram] unhandledRejection code=1` + reason + stack + `stop() ran` |
| `process.exit(7)` | 7 | `[pij-telegram] processExit code=7` |
| **SIGTERM** | 143 | `[pij-telegram] processExit code=143` |
| **SIGKILL** | −9 | **nothing** — only the pre-death line |

Two things worth noting. The fatal cases wrote **no** `processExit` line — the
`fatalRecorded` latch works, so the reason is not buried under a redundant record.
And **SIGKILL is the honest residual**: an uncatchable death still leaves no
reason. That is unavoidable and I do not hold it against the change; it is simply
the boundary of what (a) can promise.

### 5.2 "No double-start / 409" — ✅ **two independent layers, both verified**

**Layer 1 — the supervisor's liveness gate.** MUT-LIVE proves it is sensored (§3).

**Layer 2 — the lock is atomic.** `acquireLock` (`lockfile.ts:78-101`) creates with
`flag: "wx"` (`O_CREAT|O_EXCL`) and, on `EEXIST`, refuses when the existing holder
is a *different* live pid. So two simultaneous starts cannot both win.

**The race the packet asks about — a bridge that JUST started, lock not yet
written — was probed directly.** `P-RACE` drives the supervisor with `readPid() →
null` (racer hasn't written yet) and a `start()` that returns `refused` because the
racer won the `wx` create in between:

```
P-RACE: {"kind":"not-started","reason":"refused"} {"kind":"live","pid":5555} starts= 1
```

One start attempt; the outcome is `not-started/refused`, **and `note` /
`notifyOwner` were rigged to throw if called — neither fired**, so a lost race
emits no false "restarted" evidence. The next tick reads `live`. The healthy bridge
is not stomped.

**The reclaim only fires on a genuinely dead pid**, on both layers: the supervisor
will not call `start()` while `isAlive(previousPid)`, and even if it did,
`acquireLock` refuses a live foreign holder. **Note the conservative failure
direction**: if a dead bridge's pid has been *recycled* by an unrelated live
process, `isAlive` says true and the bridge is never restarted — the channel stays
down rather than double-starting. For a 409-sensitive channel that is the right way
round.

**Residual (→ ADV-2)**: `stop()` does **not** stop the grammY long-poll.

### 5.3 "Both death modes, no false-positive on a bridge-less daemon" — ✅

- **Standalone holder dead** → dead pid → `start()` → `acquireLock` reclaims the
  stale lock (`lockfile.ts:95-98`) → in-process bridge. ✓
- **In-process stop removed the lock** → `readPid() === null` → restart. ✓ (This is
  the *only* in-process detector — §4.)
- **Bridge-less daemon** → probed on the real factory. `P-FACTORY-NOENV`:
  `disabled,disabled`, zero starts, zero owner notices, and exactly one boot log
  line — `telegram: no usable telegram.env — bridge auto-start skipped` — identical
  to the pre-change `autoStartBridgeForDaemon` behaviour. **`P-NOENV` additionally
  showed `readPid` is called 0 times** when the env is absent, so a bridge-less
  daemon does no per-tick lock I/O at all. ✓
- **Stale lock + no env** (`P-FACTORY-STALE`): the constructor's immediate
  `supervisor.tick()` at `index.ts:544` fires and returns `disabled` — safe no-op,
  no start, no log. ✓

### 5.4 "Storm guard bounds without permanent lockout" — ✅ **probed; the shipped test does not cover recovery**

The shipped test (`index.test.ts:823-850`) stops at the first `capped`. It never
shows the cap *lifting*, which is precisely the Dim-1 question. So I probed it —
`P-CAP`, `cooldown=10 / window=100 / max=2`:

```
0:restarted  10:restarted  20:capped  30:capped  60:capped  99:capped
100:restarted  110:restarted  111:backoff        (total starts: 4)
```

**Per-window, not a lockout.** `restartTimes` is filtered by `now - t < windowMs`
each tick (`index.ts:446`), so entries age out and the budget refills. At
production values (`5s` cooldown / `60s` window / `3` max) the steady-state ceiling
is 3 restarts per minute. The daemon tick is never hot-looped: a capped tick
returns without calling `start()`, and `capLogged` limits the cap message to once
per cap episode.

`P-BURN` also confirms a **throwing** `start()` consumes budget (3 throws → capped)
— correct, since a boot-failure loop is exactly what the cap exists to bound.

`P-DISPOSE`: `dispose()` runs the active `stop()` once and is idempotent on a
second call; `initialStop` is correctly consumed by the first restart. No leak.

### 5.5 "Owner capture safe with 0 primes" — ✅ by construction (read, not executed)

`daemon.ts:1668-1704`. Owners are `prime === true` minus `dissolved`/`failed`; then
`if (owners.length !== 1) { log(...); return; }` — **0 primes and 2+ primes both
take the same early return**, followed by a redundant `if (!owner) return;`. The
log-tail read is in its own try/catch, and `writeCapture` + `deliver` share a
second try/catch. The only unguarded call is `registry.list()`; if it threw, the
supervisor tick would throw *after* the restart and spine note had already
succeeded, and `daemon.ts:402-405` catches it. **No crash path with 0 primes.**

The capture does carry the reason: `superviseBridge` builds
`telegram bridge restarted after dead pid <n> (new pid <m>)` (`index.ts:472-473`)
and passes the same string to `note`, `notifyOwner`, and `log`. The shipped test
asserts `"dead pid 4242"` reaches both the spine note and the owner capture.

**Exemption bypass is real**: `notifyOwner` uses the raw `channel` created in
`runDaemon`, not the composer-gated `ports`, so the relay/watchdog exemption on the
telegram peer does not suppress it. The `daemon.ts:1694` comment says exactly this.

**But the log tail is the weak part — see ADV-1.**

### 5.6 Spine event

`buildSpineEvent` (`core/platform/spine.ts`) does **not** validate `kind` against an
enum — it is a free string — so `telegram-bridge-restarted` is accepted; the only
failure mode is a bad timestamp, and both `built.ok` and `appended.ok` are checked
and logged. `actor: "pij-daemon"`, `peer: TELEGRAM_PEER_ID`, `refs:
["supervision","restart"]`. Correct.

---

## 6. No collateral — structurally proven

**Declaration diff** (`npx vitest list` on both fence files, in the candidate tree
and the `origin/main` tree, `comm`-diffed): **88 → 95**.

- **REMOVED: none.** (empty `comm -23`)
- **ADDED: 7** — 1 in `daemon.test.ts` (`invokes bridge supervision once per tick
  and disposes it with the daemon`), 3 fatal-handler cases, 3 `superviseBridge`
  cases.

**Paired with a line diff**, because a name diff is blind to assertions deleted
from a *surviving* test. Removed non-blank lines across both test files:

```
-import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
```

**Exactly one**, and it is superseded by the multi-line import that *adds*
`appendFileSync` + `readFileSync` while keeping all four originals. **Zero
`expect(` lines removed. Zero assertions weakened.**

Production removals are all accounted for: the `maybeStartBridge` doc comment is
re-added verbatim above the new thin wrapper; the daemon's old
`autoStartBridgeForDaemon` call and `stopBridge()` disposer line are replaced by
the supervisor and `daemon.dispose()`.

---

## 7. Gates — all reproduced first-hand

| gate | result |
|---|---|
| fence (`index.test.ts` + `daemon.test.ts`) | **95 passed / 3 skipped**, exit 0 |
| `npx tsc --noEmit` | exit **0** |
| `npx biome check --max-diagnostics=200` on the 4 fence files | exit **0**, no fixes |
| full suite (`.pi/extensions/pij/` + `harness/`) | **4215 passed / 1 failed / 19 skipped** across 200 files, 180 s |

**The single red is pre-existing and environmental.**
`harness/scripts/release-age-policy.test.ts:196:17` → `spawnSync pwsh ENOENT`.
Proven, not assumed:

- identical in the **`origin/main`** worktree: 1 failed / 9 passed;
- `grep -c "release-age-policy\|pwsh"` across all 4 fence files = **0, 0, 0, 0**;
- `which pwsh` → not installed on this host.

`gatesClean:false` is therefore honest and does not touch the fence.

---

## 8. Teardown

- `/tmp/pij-i29`, `/tmp/pij-i29-main` + their `node_modules` symlinks →
  `git worktree remove --force`; `git worktree list` verified back to the 4
  legitimate worktrees.
- `/tmp/i29-mut.py`, `/tmp/i29-probeA.ts`, `/tmp/i29-probeA2.py`, all
  `/tmp/i29-probeA-*.log|.out`, `/tmp/i29-cand.txt`, `/tmp/i29-main.txt` → removed.
- Both scratch test files deleted, non-existence re-verified.
- All 4 fence files sha-verified pristine; `git status --porcelain` empty in the
  candidate tree before removal.
- No branch checked out (both worktrees `--detach`), no commit, no push. The only
  repo mutation from this pass is **this file**.

---

## 9. Advisories (none blocking)

**ADV-1 — the owner capture's "bridge log tail" is absent or STALE for every
in-process restart, with no freshness check.** *(medium — evidence honesty on the
live channel)*

`daemon.ts:1683` appends `readFileSync(join(pijHome,"telegram-bridge.log"),"utf8")
.slice(-4096)` to the capture. But **only the standalone path ever writes that
file** — `telegramStart`'s `log` at `index.ts:636-642`. The in-process bridge is
built with `runtimeFor(pijHome, callbacks.log)` where `callbacks.log` is
`runDaemon`'s `log`, which is `process.stdout.write` (`daemon.ts`, `opts.log ??
…`). Verified by grep: `telegram-bridge.log` appears only at `index.ts:636`
(write), `daemon.ts:1683` (read), and two test lines.

Consequence: the tail is genuinely useful for the *headline* case (daemon reclaims
a dead **standalone** bridge — that is the whole payoff of (a)). For an
**in-process** death it is either missing (→ "restart capture has no bridge log
tail") or, worse, **a stale tail from a standalone run days earlier, attached to
today's restart with no timestamp check and presented as the reason**. Suggested
fix: stamp the capture with the log file's mtime, or state which mode died, or skip
the tail when it predates the restart.

**ADV-2 — `stop()` is a process-exit teardown being reused as a restart teardown;
it does not stop the long-poll.** *(low-medium)*

`startBridge`'s `stop` (`index.ts:264-268`) disposes the forwarder, removes the
descriptor and releases the lock. It **never calls `bot.stop()`** — the only
`bot.stop()` in the file is `index.ts:682`, inside the standalone SIGINT/SIGTERM
path. Its own doc comment calls it "the exact teardown a SIGINT/SIGTERM (or a 409)
must run" — i.e. it was written for a process that is *about to die*. The
supervisor now calls it at `index.ts:459` (`activeStop?.()`) in a process that
**survives**.

Reachability is narrow: a restart requires `readPid()` null-or-dead, which for the
in-process bridge normally means `stop()` already ran off a *failed* long-poll. The
exposed path is an externally-removed lock while an in-process bot is still
polling — then a second `getUpdates` consumer is created in the same process. The
storm guard bounds the fallout to 3/60s. Suggested fix: `void bot.stop()` in the
supervisor's teardown, or amend the doc comment to record the new reliance.

**ADV-3 — `telegram-bridge.log` has no rotation, and the tail read loads the whole
file.** *(low)*

Every ordinary bridge log line is now `appendFileSync`ed forever; nothing prunes or
rotates it (grep found no rotation logic). `daemon.ts:1683` then reads the **entire
file into memory** to take the last 4 KB. This repo has form here — pij#183 was a
205 MB accumulation. A tail-read (or a size cap) would cost nothing.

**ADV-4 — the production factory and the daemon-side callbacks have zero test
coverage.** *(low)*

`bridgeSupervisorForDaemon` (`index.ts:515-546`) — including the
`initialPid === null ? attemptDaemonBridgeStart : undefined` branch and the
immediate reclaim tick at `:544` — is referenced **only** by its definition and
`daemon.ts:1645`; no test names it. Same for the `note` / `notifyOwner` closures at
`daemon.ts:1645-1704`. Every shipped `superviseBridge` test injects all deps, so
the *wiring* to the real lock path, real `existsSync`, and real
`attemptDaemonBridgeStart` is unsensored. I probed it by hand (`P-FACTORY-*`, §5.3)
and it behaves — but nothing would catch a regression.

---

## 10. INFO

- **INFO-1 — `autoStartBridgeForDaemon` is now orphaned and its doc comment is
  stale.** `index.ts:492` has **zero callers** in production or test (repo-wide
  grep incl. hidden paths). Its comment at `index.ts:488` still reads "the single
  call the daemon makes", which is no longer true. Dead exported code next to a
  live supervisor is an invitation to wire the wrong one.
- **INFO-2 — a PRESENT-but-malformed `telegram.env` now retries forever.**
  `envPresent()` is `existsSync` (`index.ts:534`) but the config only fails later
  inside `loadConfig`. `P-FACTORY-BADENV` (real fs): `not-started` then `backoff…`,
  settling into ~3 attempts + 1 cap line per 60 s, each logging *"no usable
  telegram.env — bridge auto-start skipped"*. Previously this logged **once at
  boot**. Self-healing upside if the operator fixes the file; ~5.7k daemon log lines
  a day on a misconfigured host is the cost.
- **INFO-3 — MUT-LOUD line claims are approximate.** 641 and 664 are the
  `readFileSync` lines of the correct assertion blocks (assertions at 642-646 and
  665-667). 796 and 820 are exact. No claim was misleading.
- **INFO-4 — the `capped` state notifies nobody.** `notifyOwner` fires only on a
  successful restart (`index.ts:476`). A permanently crash-looping bridge gives the
  owner 3 notices and then silence, while the channel is down. The cap message goes
  to `deps.log` only.
- **INFO-5 — `notifyOwner` delivers `from: TELEGRAM_PEER_ID`** (`daemon.ts:1697`)
  although the daemon authored the message; the spine event correctly uses
  `actor: "pij-daemon"`. Cosmetic, but the owner sees a bridge-death notice
  apparently sent *by the bridge*.

---

## 11. Bottom line

**APPROVE.** The two behaviours the packet cares most about are the two I could
break and the suite caught: remove the live-holder short-circuit and
`never restarts a live bridge` fails by name; make the restart a no-op and the
dead-holder test fails by name. The sync-flush claim is not merely structural — I
killed real processes five ways and read the file afterwards. The cap is
per-window, the bridge-less daemon does strictly less per-tick I/O than I expected,
and the double-start guard is backed by an atomic `wx` lock underneath the
supervisor's own gate.

Nothing here is worse than the silent death it replaces, which is the bar the
packet set. The four advisories are all about *evidence quality and reuse
boundaries* rather than control flow — ADV-1 is the one I would fix before this
supervises the phone for long, because a stale log tail attached to a fresh restart
is the kind of wrong evidence that costs an hour at 2am.

*Reviewer: `pij-wilful-morton` (cold). Candidate `ebdc9846bf78c6616df72fe2bc49c2f360dc89ac`,
verified as cherry-pick `df0fca81a1cbcc758de5ecb7047c3d78e4232ffa` onto `origin/main` `90ba189c`.*
