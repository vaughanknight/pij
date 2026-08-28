# 29b-T001 cold review — owner notice via watcher list

**TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file
was written, and no further pass is open on my side.

**Reviewer**: `pij-wilful-morton` (cold) · **Date**: 2026-08-28
**Candidate**: `816a7269aed3b0430ef05334732fd0e68cd233ba` (reviewed as the
cherry-pick `0b02acf779501134ade82363f2d924a825e877a8` onto fresh main)
**Packet**: `reviews/item-29b-t001-review-packet.md`
**Dossier**: `tasks/item-29b-bridge-advisories/tasks.md` T001

---

## VERDICT: ✅ APPROVE

The change does what it claims. The owner notice no longer depends on there
being exactly one live prime; it resolves from `pij-telegram`'s watcher list,
notifies each watcher independently over the raw channel, and skips honestly
(logged, no crash) when the list is empty. All three shipped behaviours I could
reach are correct under execution, and the fix **does** resolve a real recipient
on the live machine (§5.7).

I approve with **four advisories**, the two most important of which are about
what the change's *tests* prove rather than what the change does:

- **ADV-1** — the headline "3 primes + 1 watcher" test is **structurally
  incapable** of detecting a production-wiring regression. The mandated
  MUT-OWNER went RED on the *source-pin* only. The packet's and the dossier's
  stated Dim-0 expectation is factually wrong; I measured it.
- **ADV-2** — a **single malformed watcher entry silently drops every watcher**,
  and the skip log then claims "has no watchers". That is silent loss of the
  exact notice this fix exists to deliver, with a log that misattributes the
  cause. Reproduced live.

Neither is a reason to hold the change: both are pre-existing/adjacent exposures
that this fix inherits rather than creates, and the fix is a strict improvement
on the single-prime resolution it replaces.

---

## 1. Scaffolding, and the limits of this review — stated first

**Scaffolding I built** (all torn down, §9):

- `/tmp/pij-i29b` — detached worktree at `origin/main` (`cd98f546`), then
  `git cherry-pick 816a726` → `0b02acf`. `node_modules` symlinked from
  `~/GitHub/pij`.
- `/tmp/pij-i29b-main` — detached worktree at `origin/main` (`cd98f546`), the
  baseline for the pre-existing-red proof and the declaration-list diff.
- `/tmp/i29b-mut.py` — mutation harness enforcing a pristine-fence
  precondition, anchor uniqueness (exactly 1 occurrence), no-op refusal, sha
  capture of the mutated file, and restore + sha re-verify.
- `.pi/extensions/pij/i29b-probe.mts` — my own probe file, run inside the
  worktree, deleted and `git status --porcelain` verified empty **before** the
  collateral and gate runs.

**Pristine sha256 (candidate tree, both fence files):**

| file | sha256 |
|---|---|
| `.pi/extensions/pij/daemon.ts` | `1309f0505d730cdc7300a6a3254821550c21f0cce9c6c64fdd7c5d7fcd88807d` |
| `.pi/extensions/pij/daemon.test.ts` | `7fe1f47ff4d8fb4a708fd82af7f1fcc87f1e974579cac1be51edd9d454f2227a` |

**What I did NOT examine.** A gate I did not look at must not read as a clean
one:

1. **No live Telegram bridge restart was triggered.** I never caused a real
   restart, so I did not observe the notice arriving on the operator's phone.
   I proved the *resolution* and the *delivery to the inbox*; the leg from the
   watcher's inbox onward is out of this change and unexamined.
2. **`notifyOwner` (the production closure) was never executed.** No shipped
   test drives it, and I did not build a `runDaemon` harness. I read it, and I
   mutated it (MUT-OWNER), but I never ran it. This is the substance of ADV-1.
3. **Only the `FsChannel` backend was exercised.** Production `openChannel`
   may return `SqliteQueue` or `DualWriteChannel` (INFO-2). I did not run
   either.
4. **The bridge-log tail** (`captureText` accumulation) is untouched by this
   change and I did not re-review it; it is dossier T002's subject.
5. **No concurrency test** — two daemon ticks notifying simultaneously.
6. **T002–T005 are out of fence** and were not reviewed.

---

## 2. Branch shape, and the fidelity proof

The drift hazard was live again, so I did not trust the fence:

```
origin/main                       = cd98f546597cd1c5bb7b92903f87609f8a9e7380
candidate 816a726 parent          = c9d1d10a8b55ab85dc77c2835fed3e7bd275c5dd
git merge-base origin/main 816a726 = 10483d8e22f923a3683de7bf285ea3b5ffa1b04a   ← ≠ origin/main
```

The packet says "base reconciled to main `031ccce`", but main has moved two
commits further since dispatch. Both are docs-only and neither touches
`daemon.ts`:

```
cd98f54 gov(orient-local): human-channel ruling principle — silent loss outranks noisy duplicate (E29)
f212d55 gov(encode): E29 — positional idempotency keys need the partition identity; degrade to dup, never loss
```

`git diff --stat 10483d8e..cd98f546 -- .pi/extensions/pij/daemon.ts
.pi/extensions/pij/daemon.test.ts` → **empty**. No fence overlap.

I performed the cherry-pick literally (COORD-004) and proved byte-fidelity with
`patch-id`, not `--stat`:

```
git show 816a726 | git patch-id --stable  → 4be94a1ba68edfb407d6008cdc596df098c162f8
git show 0b02acf | git patch-id --stable  → 4be94a1ba68edfb407d6008cdc596df098c162f8
```

Identical. The cherry-pick applied clean; 2 files, +110/−35.

---

## 3. Dim-0 — mutation ledger (all sha-verified RED → restore → GREEN)

**Baseline** (`npx vitest run .pi/extensions/pij/daemon.test.ts`):
**70 passed | 2 skipped (72)**, exit 0, 7.47 s.

| # | mutation | mutated sha256 (`daemon.ts`) | scope | RED at |
|---|---|---|---|---|
| **MUT-OWNER** (mandated) | revert the `notifyOwner` callback to the old single-prime resolution verbatim | `8541f1b1062c21a6420ec973371f212a094c39ffc0a9703b9c634c553f13ad80` | 1F / 69P / 2skip | **`daemon.test.ts:244`** — `expected '#!/usr/bin/env …' to contain 'notifyBridgeRestartWatchers(message, {'` |
| MUT-NOTIFY (mine) | replace `deps.channel.deliver({…})` with a fake `{ok:true}` — never actually deliver | `39527692295877bf9e2b4400aa7edba6dc470b8f4c4d7daeb3c19bcfc2ec6520` | 1F / 69P | `daemon.test.ts:222` — `expected [] to have a length of 1 but got +0` |
| MUT-DEDUP (mine) | drop the `new Set(...)` dedup | `126431c10467d5eced3c5cf502adcb858f553d8714579204471e6c2307a5703a` | **GREEN — 70P** | **unsensored** (ADV-1b) |
| MUT-SKIPLOG (mine) | delete the honest 0-watcher skip log (still `return 0`) | `d1dcbae2f6739d14937a8d425875077069a3e3f42c34d956f7bdca27259d6c71` | 1F / 69P | `daemon.test.ts:239` — `expected '' to contain 'no watchers'` |
| MUT-PEER (mine) | resolve watchers from `"pij-not-telegram"` instead of `TELEGRAM_PEER_ID` | `280031f378f2b926c7207acbd869d4524ce4186de9122b5104e0b8a5c20403fd` | 1F / 69P | `daemon.test.ts:221` — `expected +0 to be 1` |

Every mutation was restored and `daemon.ts` re-verified at
`1309f050…88807d`; the harness printed `ALL FENCE FILES PRISTINE` after each
batch.

### 3.1 Line-claim accuracy

The packet claimed **`daemon.test.ts:244`** for MUT-OWNER. The **line is
correct** — line 244 is
`expect(source).toContain("notifyBridgeRestartWatchers(message, {");`, inside
the source-pin test at 242–247.

The packet's **prose is not**: it says MUT-OWNER makes "the 3-primes-1-watcher
test" fail. It does not. Exactly one test failed and it was the source-pin. The
dossier repeats the same claim ("revert T001 to the single-prime resolution ⇒
the 3-primes-1-watcher test RED"). See ADV-1.

---

## 4. What the change actually is

`daemon.ts` +95/−35, `daemon.test.ts` +50/−1.

**New exported surface** (`daemon.ts:134-186`):

- `BridgeRestartWatcherNoticeDeps` — `store` (narrowed to
  `Pick<FsWatchdogStore, "read" | "writeCapture">`), `channel`, `nowMs`,
  `captureText`, `log`.
- `notifyBridgeRestartWatchers(message, deps): number` — reads
  `deps.store.read(TELEGRAM_PEER_ID)?.watchers ?? []`, maps to `watcherId`,
  dedups via `Set`; empty ⇒ log skip + `return 0`; otherwise per watcher:
  `writeCapture` → `channel.deliver` → count. `delivered.ok === false` logs and
  continues; a throw is caught per watcher and continues.

**Call site** (`daemon.ts:1718-1732`): `notifyOwner` keeps the bridge-log tail
accumulation verbatim, then delegates. The whole 33-line prime-resolution block
is deleted. `registry` remains used elsewhere in `runDaemon` (passed to
`new Daemon(...)`) — no orphaned binding, and `tsc`/biome agree.

**Tests added** (3): the 3-primes-1-watcher behaviour test (200), the
0-watcher honest-skip test (228), and the source-pin (242).

---

## 5. Dim-1

### 5.1 3 primes + 1 watcher → exactly the watcher — ✅ true, but the test does not prove it

The behaviour is right. The **test cannot establish it**, because
`notifyBridgeRestartWatchers` takes **no registry**. The three
`registry.write(desc({prime:true}))` lines and the
`for (…) expect(messageBodies(id)).toEqual([])` loop are decoration: the
function under test has no path by which a prime could ever be notified, so
those assertions cannot fail under **any** implementation of it. See ADV-1.

What *is* genuinely sensored, and what I proved by mutation: the watcher is
resolved from the right peer (MUT-PEER RED), and the message is really
delivered (MUT-NOTIFY RED).

### 5.2 0 watchers → skip logged, no crash — ✅ confirmed, three ways

`P-EMPTYLIST` (`watchers: []`), `P-MALFORMED` (corrupt `watchdog.json`), and an
absent sidecar all return `0` with no throw and log
`telegram: restart owner notice skipped — pij-telegram has no watchers`.
MUT-SKIPLOG proves the log line is sensored.

### 5.3 Multiple watchers → each notified once; dedup real — ✅ true, ❌ unsensored

Measured directly (no shipped test covers either):

```
P-DEDUP: watchers ["w1","w1","w1"] → returned=1  inbox(w1)=1  logs=0
P-MULTI: watchers ["w1","w2","w3"] → returned=3  w1=1 w2=1 w3=1  logs=[]
```

Dedup is real and multi-watcher fan-out is correct. But **MUT-DEDUP was
GREEN**: deleting the `Set` breaks nothing in the suite, because no test ever
supplies a duplicate id. ADV-1b.

### 5.4 Partial failure — ✅ correct, ❌ unsensored

With a store whose `writeCapture` throws for the first watcher only:

```
P-PARTIAL: returned=1  boom=0  w2=1
  logs=["telegram: restart watcher capture failed for boom — disk full"]
```

One watcher's failure does not suppress the others, and the count is honest.
No shipped test covers this.

### 5.5 Exemption bypass genuine — ✅ confirmed

`channel` in `runDaemon` is `openChannel(pijHome)` (`daemon.ts:1663`), which
returns `SqliteQueue` / `DualWriteChannel` / `FsChannel`
(`adapters/channel-factory.ts:138-151`). I grepped all channel adapters for
`exempt` — **no matches**. `FsChannel.deliver` (`adapters/channel.ts:158-`)
mints an id and writes straight into `inboxDir(message.to)`. There is no
composer gate, relay hop, or watchdog-exemption filter on this path.

This is the *same* raw path the old code used, so the property is **preserved,
not newly introduced** — the change is neutral here, which is the right answer.

### 5.6 The source-pin — ✅ it works, and it is currently the *only* wiring guard

MUT-OWNER proves the pin is reachable and non-vacuous: reverting the callback
turns it RED. It is fail-safe against its own scaffolding too — `readFileSync`
on `join(import.meta.dirname, "daemon.ts")` would throw, not silently pass, if
the file moved.

Its strength is bounded, and that bound should be understood rather than
assumed away (INFO-6): it is a substring grep asserting (a) the literal
`notifyBridgeRestartWatchers(message, {` is present and (b) the literal
`expected one live prime` is absent. A regression that keeps the call site but
resolves watchers wrongly — e.g. filtering the watcher list down to primes, or
reverting with a *reworded* skip message — passes the pin. Given ADV-1, the pin
is not a supplement to a behavioural wiring test; it is a substitute for one.

### 5.7 Does this actually fix the live failure? — ✅ yes, on this machine

I checked the real machine state rather than assuming it:

```
~/.pij/pij-telegram/watchdog.json
{"watchers":[{"watcherId":"pij-relative-panther",
              "addedAt":"2026-08-27T18:50:45.865Z","capture":{"mode":"always"}}]}
```

Exactly one watcher, and `~/.pij/pij-relative-panther.json` is
`lifecycle: "bound"`, `prime: true`, `pid: 11619`, shown by `pij list` as
`working / active`. So the new resolution yields exactly one live recipient
where the old one yielded a skip ("found 3"). The live-confirmed failure is
genuinely closed on this host.

Worth stating plainly: this works because a watcher *happens* to be registered.
The fix has no fallback — if nobody has run `pij watch pij-telegram`, the
restart notice reaches no one, honestly logged but silent to the human. That is
a deliberate and defensible trade (an honest skip beats a wrong recipient), but
it moves the single point of failure from "exactly one prime" to "at least one
registered watcher".

---

## 6. Gates (all reproduced first-hand)

| gate | result |
|---|---|
| `npx vitest run .pi/extensions/pij/daemon.test.ts` | **70 passed / 2 skipped**, exit 0, 7.47 s |
| `npx tsc --noEmit` | exit **0** |
| `npx biome check --max-diagnostics=200` (2 fence files) | exit **0**, "Checked 2 files … No fixes applied" |
| `npx vitest run` (full) | **4673 passed / 1 failed / 19 skipped** across 235 files, 188.6 s |

**The single red is pre-existing and environmental, and I proved it rather than
assumed it**: `harness/scripts/release-age-policy.test.ts:196` →
`Error: spawnSync pwsh ENOENT`.

- Reproduced in the **`origin/main` worktree**: `1 failed | 9 passed (10)`.
- `which pwsh` → **absent** on this machine.
- `grep -c "pwsh\|release-age"` on both fence files → **0** and **0**.

So `gatesClean:false` is confirmed pre-existing, out of fence, and unrelated.

### 6.1 No collateral (E17) — decomposed

**Declaration-list diff** (`npx vitest list` in both trees, `comm` on sorted
output):

```
main = 67 declarations   candidate = 70 declarations
REMOVED (in main, not in candidate): (none)
ADDED (3):
  … > notifies every pij-telegram watcher instead of inferring one prime owner
  … > logs an honest skip when pij-telegram has no watchers
  … > wires production restart notices through watchers, never single-prime inference
```

**Paired with a line diff**, because a declaration list is blind to assertions
deleted from a *surviving* test. Deleted lines in `daemon.test.ts`, in full:

```
-import { Daemon, touchDaemonHeartbeat } from "./daemon.js";
```

replaced by the same import plus `notifyBridgeRestartWatchers`. Deleted
`expect(` lines: **0**. Deleted `it(`/`test(` declarations: **0**.

---

## 7. Advisories

### ADV-1 (medium) — the headline test cannot detect the regression it names

`daemon.test.ts:200` is titled "notifies every pij-telegram watcher **instead of
inferring one prime owner**", and writes three primes to prove the negative. But
`notifyBridgeRestartWatchers` receives `{store, channel, nowMs, captureText,
log}` and **no registry**. Prime inference is unreachable from inside it. The
three `expect(messageBodies(prime)).toEqual([])` assertions are therefore
unfalsifiable — they would pass against an implementation that notified nobody,
or one that hardcoded a single id.

Measured consequence: **MUT-OWNER — a verbatim revert of the production callback
to the single-prime block — leaves this test GREEN.** Only the source-pin at
:244 goes RED. Both the packet and the dossier assert the opposite.

The behaviour is fine. The *proof* is a string grep. Suggested fix: one test
that drives the real `notifyOwner` closure (or a small extracted factory for it)
with a registry holding 3 primes + a watcher list, asserting the watcher's inbox
and the primes' empty inboxes. That test would fail under MUT-OWNER for the
reason the title claims.

**ADV-1b (low-med)** — dedup and multi-watcher fan-out are correct (§5.3) but
**unsensored**: MUT-DEDUP is GREEN. No test supplies a duplicate id or more than
one watcher. Add a `["w1","w1","w2"]` case.

### ADV-2 (medium) — one malformed watcher entry silently drops *all* watchers, and the log misattributes it

`parseSidecar` (`adapters/watchdog-store.ts`) rejects the **entire sidecar** if
any watcher fails `isWatcher`:

```ts
if (sidecar.watchers !== undefined) {
    if (!Array.isArray(sidecar.watchers) || !sidecar.watchers.every(isWatcher)) return undefined;
}
```

Reproduced (`P-SCHEMA-DRIFT`) with one good watcher and one bad entry
(`{watcherId: 42}`):

```
returned=0   good's inbox=0
logs=["telegram: restart owner notice skipped — pij-telegram has no watchers"]
```

The good watcher is real, registered, and gets **nothing**, while the log states
there are no watchers. The identical message is emitted for a corrupt
`watchdog.json` (`P-MALFORMED`), for `watchers: []`, and for an absent sidecar —
four causes, one indistinguishable line.

This is silent loss of the very notice the fix exists to deliver, which is
squarely the class main just encoded as E29 ("silent loss outranks noisy
duplicate"). The `every`-rejects-all behaviour is **pre-existing store code, not
introduced here** — but this change is what makes its consequence load-bearing
for a human channel. Note the store already contains the gentler
`.filter(isWatcher)` in its return path; it is unreachable because the `every`
guard returns first.

Suggested fix (cheap, in this function): distinguish the causes —
`read(...) === undefined` ⇒ log "sidecar unreadable or malformed" rather than
"has no watchers". Better: relax the store to `filter` rather than reject-all.

### ADV-3 (low-med) — no liveness filter on watchers; the old code had one

The deleted code filtered `lifecycle !== "dissolved" && lifecycle !== "failed"`.
The new code notifies every id in the list unconditionally. Reproduced
(`P-GHOST`) with a watcher id that is not a registered session:

```
returned=1   inbox=1   dirCreated=true   registryList=[]
home entries = ["pij-long-dissolved","pij-telegram"]
```

The notice is written, and `writeCapture`'s `mkdirSync(…, {recursive:true})`
**materialises `~/.pij/<watcherId>/`** for a session that may be long gone.

Two mitigations that make this an advisory rather than a finding: (a) the
created entry is a *directory*, so `FsRegistry.list()`'s top-level `.json`
filter does not pick it up — I verified `registryList=[]`, i.e. **no phantom
peer**, the F-01 trap is not triggered; and (b) watchers are removed on resign
(`core/cli.ts:2622`).

But the codebase's own comment records that stale watchers do occur in practice
— `core/daemon/anomaly-sweep.ts:86` cites "`pij-continuing-ermine` watched only
by the dissolved `pij-respectable-starfish`". So this is a precedented shape,
not a hypothetical. Worth either restoring a lifecycle filter (notify live
watchers, log the skipped dead ones) or documenting the deliberate choice to
notify unconditionally.

### ADV-4 (low) — three small honesty nits in the notice path

1. The `catch` logs `restart watcher capture failed for ${id}` but wraps **both**
   `writeCapture` *and* `channel.deliver`. A delivery throw is reported as a
   capture failure.
2. `notifyOwner` **discards the returned count**. If watchers exist but every
   delivery fails, the per-watcher failures are logged but nothing states the
   notice reached zero people. A `if (notified === 0)` summary line would close
   this.
3. `watcher.capture` is ignored here (INFO-1).

---

## 8. INFO

- **INFO-1** — `watcher.capture` policy is honoured by the watchdog path
  (`core/daemon/watchdog-manager.ts:688,694,705` — `shouldCapture`,
  `captureSlice`) but ignored by `notifyBridgeRestartWatchers`, which always
  writes a capture. Defensible (a restart is an infrastructure event, not a pane
  capture) and harmless today (the live watcher is `mode:"always"`), but it is
  an inconsistency a future reader will trip on. The capture text is bounded
  (message + last 4096 bytes of the bridge log), so it is not an unbounded
  write.
- **INFO-2** — production `channel` may be `SqliteQueue` or `DualWriteChannel`;
  every test and probe here used `FsChannel`. The `deliver` contract is shared,
  so I expect no divergence, but I did not run the other two.
- **INFO-3** — `from: TELEGRAM_PEER_ID` is retained. Dossier T004/INFO-4 wants
  `pij-daemon` (the actual author). Correctly deferred, not a regression.
- **INFO-4** — the `Pick<FsWatchdogStore, "read" | "writeCapture">` narrowing on
  the deps type is good practice and made my `P-PARTIAL` fault-injection probe
  possible without a full fake.
- **INFO-5** — the packet's claimed line 244 was **accurate** (second packet in
  a row). Its prose about *which* test REDs was not (§3.1).
- **INFO-6** — the source-pin's guarantee is bounded to two literals; a
  regression preserving the call site while changing the resolution passes it
  (§5.6).

---

## 9. Teardown

- `/tmp/pij-i29b` and `/tmp/pij-i29b-main` (+ their `node_modules` symlinks) —
  `git worktree remove --force`, verified gone; `git worktree list` back to the
  4 legitimate worktrees.
- `/tmp/i29b-mut.py`, `/tmp/i29b-cand.txt`, `/tmp/i29b-main.txt` — removed.
- `.pi/extensions/pij/i29b-probe.mts` — deleted **before** the collateral and
  gate runs; `git status --porcelain` verified empty at that point.
- Both fence files sha-verified pristine after every mutation and at teardown.
- No branch checked out (both worktrees `--detach`). No commit. No push.

---

## 10. Bottom line

**APPROVE.** Small, well-shaped, correctly scoped change that closes a
live-confirmed failure and is a strict improvement on what it replaces. The
production behaviour is right in every dimension I could execute, the exemption
bypass is genuinely preserved, the skip is honest about its outcome, and the
gates are clean apart from a pre-existing environmental red I reproduced on
`origin/main`.

The work to do next is in the *sensors*, not the code: the test that names the
regression cannot detect it (**ADV-1**), and the notice can still vanish
silently on a malformed sidecar while the log says "no watchers" (**ADV-2**).
Neither blocks this landing.
