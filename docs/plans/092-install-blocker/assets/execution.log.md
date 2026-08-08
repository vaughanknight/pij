# Execution log — plan 092, Phase 1

Stream `s092/install-blocker` · issue pij#118 · worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s092-install-blocker`.

## Task 2 — the pre-fix failure (AC-02)

**This is the artifact that makes the phase worth anything.** This machine has a populated
`~/.pij`, so the defect is invisible here; the run below is the proof that the new test
actually reproduces a fresh-install daemon start, and therefore that its later green is a
result rather than a tautology.

Run **before** any change to `daemon.ts` (`.pi/extensions/pij/daemon.bootstrap.test.ts`
existed; `daemon.ts` was untouched):

```
$ npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts
```

Verbatim output:

```
 RUN  v4.1.10 /Users/jordanknight/pi-hacking/pij-worktrees/s092-install-blocker

 ❯ .pi/extensions/pij/daemon.bootstrap.test.ts (4 tests | 2 failed) 7ms
     × creates the home directory before acquiring the lock (case A: injected pijHome) 4ms
     × creates the home resolved from PIJ_HOME when no pijHome is injected (case B) 0ms
     ✓ still acquires a cwd-relative lock when PIJ_HOME is empty (case C) 1ms
     ✓ acquires normally in an existing, populated home (case D: idempotence) 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  .pi/extensions/pij/daemon.bootstrap.test.ts > runDaemon — first-run home bootstrap > creates the home directory before acquiring the lock (case A: injected pijHome)
Error: ENOENT: no such file or directory, open '/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-bootstrap-ouXfps/fresh/.pij/daemon.lock'
 ❯ runDaemon .pi/extensions/pij/daemon.ts:1126:4
    1124|  for (let attempt = 0; attempt < 2; attempt++) {
    1125|   try {
    1126|    writeFileSync(lockPath, lockBody, { flag: "wx" });
       |    ^
    1127|    break; // acquired
    1128|   } catch (e) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  .pi/extensions/pij/daemon.bootstrap.test.ts > runDaemon — first-run home bootstrap > creates the home resolved from PIJ_HOME when no pijHome is injected (case B)
Error: ENOENT: no such file or directory, open '/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-bootstrap-EYpgpY/from-env/.pij/daemon.lock'
 ❯ runDaemon .pi/extensions/pij/daemon.ts:1126:4
    1124|  for (let attempt = 0; attempt < 2; attempt++) {
    1125|   try {
    1126|    writeFileSync(lockPath, lockBody, { flag: "wx" });
       |    ^
    1127|    break; // acquired
    1128|   } catch (e) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
   Start at  13:51:52
   Duration  537ms (transform 252ms, setup 0ms, import 457ms, tests 7ms, environment 0ms)
```

Two readings worth keeping:

1. The failure is the **real** `ENOENT: no such file or directory, open '…/daemon.lock'`, thrown
   from the `wx` create at `daemon.ts:1126` — the same line and the same error a fresh install
   hits. The test reproduces the defect, it does not simulate it.
2. **Cases C and D pass before the fix.** That is the point of including them: they pin the two
   behaviours the fix must not disturb (empty `PIJ_HOME` → cwd-relative lock; existing populated
   home → normal acquire). A case that is green on both sides of a change is a regression guard;
   only cases A and B are the bug.

## Task 3 — the fix

`.pi/extensions/pij/daemon.ts`: `mkdirSync` added to the `node:fs` import, `dirname` to the
`node:path` import, and

```ts
mkdirSync(dirname(lockPath), { recursive: true });
```

inserted immediately before the acquire loop. `dirname(lockPath)` rather than `pijHome`
deliberately — with `PIJ_HOME=""`, `lockPath` is `"daemon.lock"` and `dirname` yields `"."`
(a no-op mkdir), whereas `mkdirSync("")` throws `ENOENT` and would have shipped a new bug in
place of the old one. Case C is the standing proof.

The `wx` acquire loop, its `EEXIST` live-refuse / dead-reclaim semantics, and the
`if (code !== "EEXIST") throw e` guard are **unchanged**. The fix removes the *cause* of the
`ENOENT`; it must never swallow the *report* of one.

## Task 3 (verify) — the same command, post-fix

```
$ npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts

 ✓ .pi/extensions/pij/daemon.bootstrap.test.ts (4 tests) 6ms
   ✓ creates the home directory before acquiring the lock (case A: injected pijHome)
   ✓ creates the home resolved from PIJ_HOME when no pijHome is injected (case B)
   ✓ still acquires a cwd-relative lock when PIJ_HOME is empty (case C)
   ✓ acquires normally in an existing, populated home (case D: idempotence)

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Task 7 — the existing daemon suite

```
$ npx vitest run daemon

 Test Files  21 passed (21)
      Tests  430 passed | 4 skipped (434)
```

That is every daemon-matching spec (`daemon.test.ts`, `daemon-push`, `daemon.delivery`,
`daemon.durability`, `daemon.archive`, `daemon-real-adapter`, `adapters/daemon-tmux`, and the
whole of `core/daemon/**`) plus this stream's new file. `daemon.test.ts` on its own is
53 passed / 2 skipped, unchanged from before the fix; the 4 net-new tests are cases A–D. No
pre-existing test changed behaviour, and the 4 skips are the same 4 that were skipped before.

## Task 8 — gates

```
$ just typecheck   # tsc --noEmit — clean
$ just lint        # Biome — exit 0
```

Biome initially reformatted the multi-line `runDaemon({ … })` calls in the new test
(`npx biome check --write` on the two owned files); no rule was suppressed. The 9 warnings
`just lint` still reports are pre-existing and in files owned by other streams — none is in
`daemon.ts` or `daemon.bootstrap.test.ts`.

## Task 9 (packet AC-06) — `harness checks`

```
$ harness checks   # exit 0
local-paths ✓  typecheck ✓  lint ✓  test ✓  windows-compat ✓  smoke ✓  pkg-audit ✓  snapshots ✓
```

**Two transient failures were seen on the first full run and are recorded here rather than
quietly re-rolled**, because "I re-ran it and it went green" is only honest if the reason is
stated:

- `test` — `skills/flow-pair/test/observe.test.ts` failed with
  `ENOTEMPTY, Directory not empty: /var/folders/…/observe-t003-…` in its own `afterEach`
  `rmSync` of its temp dir. **Flaky; passes in isolation; unrelated package.** Two runs on this
  exact tree establish that: `npx vitest run skills/flow-pair/test/observe.test.ts` → 17/17
  passed, and the full suite → 4044 passed / 19 skipped across 211 files eight minutes earlier.
  Different package from `.pi/extensions/pij/`, and the file contains zero references to
  `daemon`. No mechanism for the intermittency is claimed here — none was investigated.
- `smoke` — `can't find pane: %37` followed by a `waitIdle` timeout. Five agents share this
  machine's tmux server. The re-run was 11/11 green.

Neither failure touched a file this stream owns. The final full `harness checks` above is green
across all eight sensors with no skips.

## Files changed

```
$ git status --porcelain
 M .pi/extensions/pij/daemon.ts
?? .pi/extensions/pij/daemon.bootstrap.test.ts
?? docs/plans/092-install-blocker/
```

Exactly the owned set (AC-05). `docs/how/fleet/ledger.md` also shows as modified, but that edit
**predates this stream** — it was already dirty in the worktree before the first change here, and
nothing in this phase wrote to it. It is deliberately left untouched: the authoritative task list
scopes this stream to three paths and does not list the ledger among them.


---

# Phase 2 — `pij daemon start` reports a verified daemon, not a launched one

Issue pij#118 defect 2. Phase 1 removed the *cause* of one crash-on-boot; this phase fixes the
reporting that hid it — and would have hidden any other.

## Tasks 1–2 — the pure decision

`daemonStartOutcome(status: DaemonStatus): DaemonStartOutcome` added to
`core/daemon/lifecycle.ts`, with `DaemonStartOutcome = { kind: "verified"; pid } | { kind:
"unverified" }`. `running` → verified (carrying the pid proven alive); `stale` and `absent` →
unverified. No I/O, no timers, no clock, no new imports — testable without a filesystem, per the
repo's core/bin split.

`stale` is deliberately not a third state: a lock whose holder is dead is, if anything, *worse*
evidence than no lock, because the daemon got far enough to claim it and still is not there.

Five cases added to `lifecycle.test.ts` (running / stale / absent, plus one pinning that
`unverified` carries **no** cause field, and one that an owned `window` does not substitute for
liveness):

```
$ npx vitest run .pi/extensions/pij/core/daemon/lifecycle.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)          # 9 pre-existing + 5 new
```

## Tasks 3–4 — `ensureDaemonRunning()` polls, then reports what it verified

Only the post-`newWindow` path changed. The not-in-tmux branch, the `newWindow` failure branch,
the double-start guard, `needsAutoStart`, `daemonStatus` and `planStop` are untouched.

- **verified** → the same `⚙` note, now carrying `verified up as pid N`.
- **unverified** → a `⚠️` note that says the daemon **may still be coming up, or may have failed
  to boot**, points at `pij daemon status`, and appends the pane tail via
  `capturePane(paneId, { scrollback: 30 }, execFileRunner)`. It shows the output rather than
  naming a cause — asserting death not established would be the original sin inverted.

## The budget is measured, not assumed — and the plan's figure was wrong

The plan specified a budget "well under a second", reasoning that the daemon writes its lock
before anything else. That reasoning is correct about the daemon and still yields the wrong
number, because the dominant cost is not the daemon — it is `npx` plus the `tsx` transform of the
daemon's import graph, which runs *before* any of the daemon's own code.

Measured, three cold starts (spawn `npx tsx daemon.ts` with a fresh `PIJ_HOME`, poll for the lock):

```
run 1: lock after 584 ms
run 2: lock after 572 ms
run 3: lock after 576 ms
```

A 500ms budget would therefore have reported **every healthy auto-start** as unverified — the
same false report as pij#118 defect 2, merely inverted, and noisier. Settled on:

```ts
const DAEMON_VERIFY_BUDGET_MS = 2_500;   // ceiling on the FAILURE case only
const DAEMON_VERIFY_POLL_MS = 50;
```

The poll returns the instant the lock goes live, so the happy path costs the real boot time
(~580ms), not the budget — the packet's actual constraint ("`pij send` must not feel stalled") is
met by the early exit, not by a small ceiling. ~4x headroom over the measurement covers a loaded
machine. This is a deliberate, evidenced deviation from the stated figure and is flagged to the
orchestrator rather than quietly taken.

## Task 5 — suites

```
$ npx vitest run daemon lifecycle cli
 Test Files  33 passed (33)
      Tests  1112 passed | 5 skipped (1117)
```

## Task 6 — gates

```
$ just typecheck   # exit 0
$ just lint        # exit 0 — zero findings in lifecycle.ts, lifecycle.test.ts or cli.ts
```

Full `harness checks` not re-run: the orchestrator owns the final gate for this phase.

## Files changed

```
$ git status --porcelain          # counted with wc -l (4), never truncated through `head`
 M .pi/extensions/pij/cli.ts
 M .pi/extensions/pij/core/daemon/lifecycle.test.ts
 M .pi/extensions/pij/core/daemon/lifecycle.ts
 M docs/how/fleet/ledger.md
```

The first three are the owned set. `docs/how/fleet/ledger.md` was already dirty in this worktree
before either phase began and neither phase wrote to it.

---

# Phase 3 — one `PIJ_HOME` resolver, all seven sites (pij#169)

## Site enumeration — verified before the first edit

Counted with `wc -l`, never truncated through `head`. A truncated enumeration ending exactly at
the limit is indistinguishable from a complete one — which is how this issue was first reported
as six sites instead of seven.

```
$ rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ \
    | tee /tmp/pijhome-sites.txt | wc -l
7

.pi/extensions/pij/index.ts:48:	const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
.pi/extensions/pij/telegram/index.ts:79:	return process.env.PIJ_HOME ?? join(homedir(), ".pij");
.pi/extensions/pij/daemon.ts:1094:	const pijHome = opts.pijHome ?? process.env.PIJ_HOME ?? join(homedir(), ".pij");
.pi/extensions/pij/cli.ts:240:const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
.pi/extensions/pij/cli.ts:556:		const home = process.env.PIJ_HOME ?? join(homedir(), ".pij");
.pi/extensions/pij/adapters/focus-store.ts:53:	constructor(pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij")) {
.pi/extensions/pij/core/daemon/watch.ts:67:		this.pijHome = deps.pijHome ?? process.env.PIJ_HOME ?? join(homedir(), ".pij");
```

Seven, matching the task list. The two `cli.ts` lines sit at 240/556 rather than the planned
235/551 — Phase 2 added the verify constants above them.

After the sweep:

```
$ rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ | wc -l
0
```

## Injection seams preserved

Each site kept its own precedence, so nothing that injects a home lost the ability to:

- `daemon.ts` — `opts.pijHome ?? resolvePijHome()`
- `core/daemon/watch.ts` — `deps.pijHome ?? resolvePijHome()`
- `adapters/focus-store.ts` — `constructor(pijHome = resolvePijHome())` (still a default
  parameter; the resolution did **not** move into the body)

`homedir` became unused in five files (`daemon.ts`, `index.ts`, `telegram/index.ts`,
`focus-store.ts`, `watch.ts`) and its import was removed. `cli.ts` keeps `homedir` — it has ~20
other uses.

## The behaviour that changed, deliberately

`PIJ_HOME=""` no longer yields cwd-relative paths. `??` only falls through on null/undefined, so
the inlined form produced `""` and every derived path became cwd-relative; `resolvePijHome()`
treats empty as unset. Phase 1's case C pinned the old value, and was updated — **the invariant is
that the writer and the reader agree, not the particular path**. The rewritten case asserts the
daemon's actual on-disk lock location against what a reader independently resolves, so it cannot
be satisfied by a hard-coded string that drifts.

Making that case hermetic required one addition: with an empty `PIJ_HOME` the fallback is now
`~/.pij`, so the test would otherwise write a lock into the developer's **real** home and could
fight a live daemon. `HOME` is redirected to the temp tree for every case. Verified first rather
than assumed:

```
$ node -e '...'
real: /Users/jordanknight
after HOME override: /tmp/pij-home-probe
honours HOME: true
```

## The agreement test is not tautological — proven by reverting one site

A test that asserts seven surfaces agree is worthless if it would pass with the sweep undone. So
one site (`focus-store.ts`) was reverted to the inlined form and the suite re-run:

```
FAIL … > PIJ_HOME empty: every surface treats it as unset — the case the sweep fixed
AssertionError: expected '.' to be '/var/folders/…/pij-agree-HfyrCu/.pij'
Expected: "/var/folders/…/pij-agree-HfyrCu/.pij"
Received: "."

FAIL … > empty and unset land on the same home, so a reader cannot miss a live daemon
AssertionError: expected '.' to be '/var/folders/…/pij-agree-04ZM5R/.pij'

 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
```

`"."` versus `~/.pij` is exactly the split-home failure the phase exists to prevent: a daemon
writing one home while a reader looks in another. The site was restored and the file returned to
14/14 green.

Four surfaces (`cli.ts`, `index.ts`, `telegram/index.ts`, `watch.ts`) are not constructible in a
unit test without heavy fixtures — the CLI's is a module-level const, the extension's needs an
`ExtensionAPI`, telegram's resolver is unexported, and `PeerWatchManager` keeps its home private.
For those the test asserts at source level that the inlined form is gone (counted, so a file with
two sites must lose both) and that `resolvePijHome` is imported at the correct relative depth.
The three reachable surfaces — the resolver, `FsFocusStore`, and `runDaemon`'s real lock location
— are checked behaviourally across set / unset / empty.

## Gates

```
$ rg -n --hidden 'process\.env\.PIJ_HOME \?\?' … | wc -l   # 0
$ just typecheck                                           # exit 0
$ just lint                                                # exit 0 — zero findings in the 8 owned files
$ npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts   # 14 passed
$ npx vitest run daemon focus-store watch paths telegram cli lifecycle
   Test Files  52 passed (52)
        Tests  1451 passed | 7 skipped (1458)
```

The full-suite run reported 3 failures in `core/daemon/lifecycle.test.ts`, which pass in isolation
(14/14) and whose subject is a pure function untouched by this phase. Eighteen concurrent vitest
processes were live across the fleet at the time. No mechanism is claimed here — only that it
passes in isolation and that the phase's own files are not implicated.

---

# Phase 4 — make the *reporting decision* testable (pij#118 defect 2)

## The finding this phase answers

Phase 2's five tests all targeted the pure `daemonStartOutcome()`; **zero** touched
`ensureDaemonRunning()`. The poll loop could have been deleted and the old unconditional success
line restored with every test still green — a check that agrees with reality without being able to
disagree with it, on the phase whose entire subject is not reporting success you have not
verified.

## What moved

`reportDaemonStart(ctx, probe)` now lives in `core/daemon/lifecycle.ts` with the poll loop and
**both** note strings. Every side effect is injected (P3): `status()`, `sleep()`, `capturePane()`,
plus optional `budgetMs`/`pollMs` so tests run instantly. The measured constants moved with it as
the defaults — `DAEMON_VERIFY_BUDGET_MS = 2500`, `DAEMON_VERIFY_POLL_MS = 50`, unchanged.
`ensureDaemonRunning()` is now wiring only: no loop, no note text, no `sleepSync` of its own.

The "success note" is defined by an exported marker (`DAEMON_START_SUCCESS_MARK`) so the property
can be stated against something machine-checkable rather than a duplicated string literal.

## Task 8 — the mutation proof

`reportDaemonStart`'s body was replaced with the pre-fix behaviour (an unconditional success note,
verifying nothing) and the targeted suite re-run.

**RED:**

```
     ✓ no lock → absent 1ms
     ✓ lock + holder alive → running (carries the owned window) 0ms
     ✓ running without an owned window omits it (human-started daemon) 0ms
     ✓ lock + holder dead → stale 0ms
     ✓ only a running daemon suppresses auto-start 0ms
     ✓ running → verified, carrying the pid that was proven alive 0ms
     ✓ stale → unverified: the daemon wrote a lock and then died 0ms
     ✓ absent → unverified: a created window is not a running daemon 0ms
     ✓ carries no cause on unverified — it never asserts the daemon is dead 0ms
     ✓ ignores the owned window — only liveness verifies a start 0ms
     ✓ absent → nothing 0ms
     ✓ stale → cleanup (clear the lock, no signal) 0ms
     ✓ running with an owned window → kill pid AND window 0ms
     ✓ running without an owned window → kill pid only (never a human's window) 0ms
       × absent throughout — the daemon never wrote a lock 3ms
       × stale throughout — it wrote a lock and died 0ms
       × absent then stale — it got as far as the lock, then crashed 0ms
       × stale then absent — the lock was reaped and nothing replaced it 0ms
     × polls rather than returning early: absent → absent → running verifies after exactly 2 sleeps 1ms
     × returns the instant the lock goes live — a daemon already up costs no sleeps 0ms
     × bounds the failure case at budgetMs / pollMs polls 1ms
     × defaults to the MEASURED budget when the probe does not override it 0ms
     × a stale lock renders unverified, never verified — it is WORSE evidence than no lock 0ms
       × carries the pane tail, trimmed 0ms
       × still renders when capturePane THROWS — a failed capture degrades the note, never replaces the outcome 0ms
       ✓ omits the pane block entirely when the pane is empty 0ms

 Test Files  1 failed (1)
      Tests  11 failed | 15 passed (26)
```

**Restored green:**

```
 ✓ .pi/extensions/pij/core/daemon/lifecycle.test.ts (26 tests) 4ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
```

The most informative line in that output is not the 11 failures. It is that **the 14 pre-existing
tests are all still ticks under the mutant** — the exact gap the review found, now visible as
data rather than as an argument. The pre-fix behaviour is genuinely unshippable.

One test survived the mutant that should be read carefully: *"omits the pane block entirely when
the pane is empty"* passes either way, because the mutant's note contains no pane block at all.
It is a rendering detail, not a statement of the property, and the four property cases cover the
same input.

## Gates

```
$ just typecheck    # exit 0
$ just lint         # exit 0 — zero findings in lifecycle.ts, lifecycle.test.ts, cli.ts
$ npx vitest run lifecycle daemon cli
   Test Files  33 passed (33)
        Tests  1134 passed | 5 skipped (1139)
```

`daemon.ts` was not touched — two other streams hold declared regions in it and nothing in this
phase needed it.
