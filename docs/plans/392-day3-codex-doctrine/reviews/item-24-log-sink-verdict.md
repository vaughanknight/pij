# item-24 log-sink fold — cold review verdict

> **TERMINAL REPORT.** This pass is CLOSED. No mutation was run after this file
> was written. Every claim below was produced by execution on disk, before this
> file existed.

**Candidate**: `65560901e78a652dec593c38c6a7f6d9d58ac122` (`fix(telegram): persist in-process bridge logs`)
**Parent / correct base**: `ae8622fe` (sits **on top of the item-24 chain**)
**Reviewed**: 2026-08-28
**Packet**: `docs/plans/392-day3-codex-doctrine/reviews/item-24-log-sink-packet.md`

---

## VERDICT: ⚠️ **CONDITIONAL APPROVE — one blocking defect (B1)**

The packet's mechanical bar is **met in full**: `MUT-LOGSINK` applies, REDs T-LOG1
at exactly `index.test.ts:721`, and `git apply -R` restores to a **byte-identical
sha** with a GREEN re-run. The fix genuinely works — I measured the durable file
receiving the lines on **both** in-process paths. Format parity, no double-append
and no collateral are all confirmed **by measurement**.

**But I cannot recommend merging as-is.** The new tee introduces a way for
*logging* to **kill the daemon process** — and it does so from inside the very
error handler that exists to prevent a crash, on the component that supervises
the live Telegram channel. I proved this by execution and attributed it to the
new line using the packet's own oracle. The fix is ~3 lines.

Separately, and importantly: **the acceptance test covers the path the daemon
does not use.** Reverting the wiring on the **production** path is repo-wide
silent.

| id | finding | severity |
|---|---|---|
| **B1** | an unwritable/missing log file **crashes the process** via the tee, from inside the queue-consumer's catch | **BLOCKING** |
| **B2** | the **production** path (`bridgeSupervisorForDaemon`) is unsensored — reverting it is repo-wide silent | **major** |
| A3 | T-LOG1 depends on the item-24 chain; on current `main` it REDs — the fold is not independently mergeable | advisory (sequencing) |
| A4 | the durable log now grows ~150 B per forwarded message with no rotation | advisory |

---

## 1. Scaffolding — stated before findings

| tree | contents | purpose |
|---|---|---|
| `/tmp/pij-ls-asis` | `65560901` as committed | **candidate on its correct base** |
| `/tmp/pij-ls-prebase` | `ae8622fe` (candidate's parent) | **pre-fix control** |
| `/tmp/pij-ls-picked` | `origin/main` + cherry-picked fold | integration probe → found A3 |
| `/tmp/pij-ls-main` | `origin/main` unmodified | environmental baseline |

Mutation harness enforced on every apply: pristine precondition → **anchor
uniqueness** → no-op refusal → print mutated sha → restore from self-captured
bytes → verify sha + `git status`. The packet's oracle was applied with
`git apply` exactly as specified.

### 1.1 What I did NOT examine — a stated gap, not a clean bill

- **No live Telegram send and no live daemon.** Everything is in-process, with
  the network faked via a grammy API transformer.
- **B1's trigger is simulated**, not observed in production: I induced `EACCES`
  with `chmod 0444` and `ENOENT` with a missing home. I did **not** observe a
  real disk-full or a real permissions incident on the operator's machine, so I
  am claiming a **reachable failure mode**, not an observed outage.
- **No concurrency.** I did not race the standalone bridge and the in-process
  bridge appending to the same file — a real possibility this fold makes more
  likely, and one I did not test.
- **`bridgeFileLog` is not exported**, so my format-parity check (§5.3)
  reproduces the published expression verbatim rather than importing it. It is a
  transcription equivalence plus an end-to-end file check, not a direct
  import-level proof.
- I did not review the item-24 chain underneath this commit (reviewed separately),
  nor the 128 commits of main drift beyond identifying what breaks T-LOG1.
- I did not measure log growth beyond 12 messages; the per-message figure is
  extrapolated from that sample.
- The `.skip`-ped test in `index.test.ts` I did not investigate.

### 1.2 Pristine shas (re-verified at exit)

```
6559246526b4609b0b3ec0aae77e5939ac539b0e5ecef836bd1be49c521d8b3c  telegram/index.ts
d6def5635e740367ac83648ba114263b69475f3e708afe11ee1c1b8e2c64d7b0  telegram/index.test.ts
```

---

## 2. Branch shape and pick fidelity

`65560901`'s own delta is 3 files (`index.ts` +70/−26, `index.test.ts` +63, the
patch artifact) — matching the packet.

**Pick fidelity is exact.** Both fence blobs are byte-identical between
`origin/main` and the candidate's parent, so I cherry-picked onto fresh main and
verified two ways:

```
index.ts       IDENTICAL  6559246526b4609b0b3ec0aae77e5939ac539b0e5ecef836bd1be49c521d8b3c
index.test.ts  IDENTICAL  d6def5635e740367ac83648ba114263b69475f3e708afe11ee1c1b8e2c64d7b0
git patch-id --stable :  850a5e54c2fa23f1eed6da3a714adfb910f793a7  ==  850a5e54…  (byte-faithful)
```

**And that is exactly what exposed A3** — see §7.3. Identical *fence* files do
not imply identical *behaviour*, because T-LOG1's assertion depends on
`bridge.ts`, which is **out of fence** and differs between the two bases.

---

## 3. The mechanical oracle — RUN, not read

`MUT-LOGSINK.patch` removes only the `appendFileSync` tee inside `bridgeFileLog`,
preserving `baseLog(message)` (it substitutes `void logPath;` so the file still
type-checks).

```
git apply <patch>  → "Applied patch cleanly"
mutated sha        : 58f89b3deeaa7d8aeaf9b04737d0cb8787985f1e63324fe0ce630ea77c607aa5
```

**Result — RED at exactly the claimed line:**

```
FAIL index.test.ts > maybeStartBridge (daemon auto-start) > persists in-process forward … logs
❯ .pi/extensions/pij/telegram/index.test.ts:721:4
❯ waitFor .pi/extensions/pij/telegram/index.test.ts:124:45
Error: waitFor: condition never held
Tests  1 failed | 28 passed | 1 skipped (30)
```

`:721` verified against the file as
`await waitFor(() => readFileSync(logPath,"utf8").includes("ForwardIncomplete"))`.
**Line claim accurate.**

**Restore:**

```
git apply -R  → exit 0
restored sha  : 6559246526b…d8b3c  ==  pristine   git-clean: []
re-run        : 29 passed | 1 skipped (30)   GREEN
```

**Sha-verified RED → restore → GREEN. The packet's necessary condition is met.**

### 3.1 One correction: the packet's baseLog reasoning is not observable here

The packet argues *"because baseLog is preserved, the daemon-callback assertion
still passes under the mutant → T-LOG1 senses FILE PERSISTENCE specifically."*
That inference **cannot be observed in this run** — the test aborts at `:721`,
never reaching the `daemonLogs` assertion at `:730`.

So I established the discrimination the other way round, with the inverse mutant:

| mutant | change | result |
|---|---|---|
| MUT-LOGSINK (packet's) | drop the tee, keep `baseLog` | **RED @ :721** (file half) |
| **MUT-BASELOG** (mine) | keep the tee, drop `baseLog` | **RED @ :730** (callback half) |

**Both halves are independently sensored** — which is a *stronger* result than the
packet claimed, established by execution rather than inference. Credit to the
test; the packet's stated reasoning just doesn't prove it.

### 3.2 E40 uniqueness — true, but needs restating for the full suite

The packet says the full-suite mutant "reds exactly T-LOG1". A reader running the
whole repo will see **5 failures** and conclude the claim is false. It is not —
but the honest statement requires the baseline:

| run | failures |
|---|---|
| pristine candidate, full suite | **3** — `daemon.delivery` ×2, `release-age-policy` |
| under MUT-LOGSINK, full suite | **5** — the same 3, **+ T-LOG1**, + `drive.test.ts` |

I classified every one rather than waving them off:

- `daemon.delivery.test.ts` ×2 → **reproduce on the pre-fix base `ae8622f`**
  (2 failed / 18 passed). **Pre-existing, not this fold.**
- `drive.test.ts` → **36 passed in isolation** on the pristine candidate. **Flaky
  under full-suite parallelism**, not caused by the mutant.
- `release-age-policy` → `spawnSync pwsh ENOENT`; **re-derived this run on the
  unmodified `origin/main` worktree**, `which pwsh` → not installed.
  **Environmental (macOS).**

**Correctly stated: exactly one *additional* red is attributable to the mutant —
T-LOG1. E40 holds.** `bridgeFileLog` is new in this commit (`grep` on the pre-fix
base returns 0), so no pre-existing test could have driven it.

---

## 4. No collateral (E17)

Declaration lists via `npx vitest list`, pre-fix base vs candidate:

```
pre 28   candidate 29
REMOVED : (none)
ADDED   : … > persists in-process forward success and failure logs to telegram-bridge.log
```

A declaration diff is blind to assertions deleted from a **surviving** test, so I
also line-diffed: **assertions removed from surviving tests = NONE.** Clean.

---

## 5. The packet's review asks, answered by execution

### 5.1 Ask #4 — does T-LOG1 drive the REAL in-process runtime? ✅ **Yes**

Real `SqliteQueue`, real `queue.deliver`, real `runtimeFor` forwarding. Only
`loadConfig` (offline) and `runBot` (a grammy API transformer that fakes a
deterministic 400) are overridden — the forward path itself is not stubbed. The
`MUT-BASELOG`/`MUT-LOGSINK` pair confirms it is really exercising the code.

**Design note (not a defect):** the `overrides` parameter added to
`autoStartBridgeForDaemon` is production API surface that exists solely for this
test. It defaults to `{}` so runtime behaviour is unchanged — but note in §7.2
that the seam was added to the path production **doesn't** use.

### 5.2 Ask #2 — no double-append? ✅ **Confirmed by measurement**

Not by reading. I forwarded 12 real messages and tallied the file:

```
messages sent        : 12
file lines           : 24
daemon pane lines    : 24
DUPLICATE lines      : NONE
file == pane count?  : true
```

Exactly 1:1 between the durable file and the pane logger, zero duplicates. The
supervisor's own `log:` and the runtime log are distinct call sites sharing one
`bridgeLog` closure; each call appends once. **Claim holds.**

### 5.3 Ask #3 — `telegramStart` dedup preserves the prior format? ✅ **Exact parity**

I transcribed the pre-fix logger verbatim from `ae8622f` and ran both over
normal, unicode, emoji, quote/backtick and empty-string messages:

```
FILE bytes   old=194 new=194  IDENTICAL=true
STDOUT       old=194 new=194  IDENTICAL=true
```

Path expressions are identical at both sites (`index.ts:332` and `:656`, both
`join(pijHome, "telegram-bridge.log")`), and the write order (file, then stdout)
is preserved. **Byte-for-byte parity.** (Caveat in §1.1: `bridgeFileLog` is not
exported, so this is a transcription equivalence plus an end-to-end file check.)

### 5.4 Ask #1 — oracle + E40 — ✅ reproduced (§3, §3.2)

### 5.5 Ask #5 — post-restart LIVE proof — **not attempted**, per the packet it
stays with the orchestrator and is not a blocker. I did not observe it.

---

## 6. Gates (candidate, pristine, `git status` empty)

| gate | result |
|---|---|
| `tsc --noEmit` | **exit 0** |
| `biome check` (2 changed files) | **clean** |
| `index.test.ts` | **29 passed \| 1 skipped (30)** |
| full suite | 4701 passed \| 19 skipped, 3 failed — **all classified pre-existing/env/flaky (§3.2)** |

---

## 7. Findings

### B1 — **BLOCKING**: the tee can kill the daemon, from inside the crash-guard

`bridgeFileLog` (`index.ts:334`) calls `appendFileSync` **unguarded**. Every log
call is now a filesystem write that can throw — `EACCES`, `ENOENT`, `ENOSPC`,
`EISDIR`. Pre-fix this was impossible: the in-process logger did no I/O.

**Measured.** Same scenario, one message, only the log file's mode differs:

| scenario | message delivered | pane logs | outcome |
|---|---|---|---|
| log writable (control) | **true** (`acked`) | 2 | fine |
| log **read-only** (`chmod 0444`) | **false** (`queued`) | **0** | **PROCESS CRASHED** |

```
Error: EACCES: permission denied, open '…/telegram-bridge.log'
    at appendFileSync (node:fs:2488:6)
    at <anonymous> (…/telegram/index.ts:334:3)
    at scan (…/adapters/queue-consumer.ts:57:4)
Node.js v26.3.1     ← process exit
```

**Attributed with the packet's own oracle**, so this is not speculation: with
`MUT-LOGSINK` applied (tee removed) the identical read-only scenario **delivers
successfully** (`acked`, 2 pane logs). The crash is caused **exclusively by the
new tee line**.

**The stack line is the important part.** `queue-consumer.ts` is written
defensively — an inner `catch` at `:47` and an outer `catch` at `:56`, and **both
handlers call `log`**. My stack shows the throw at **`scan (queue-consumer.ts:57)`
— inside the outer catch**. So:

> the logger throws from inside the error handler whose whole purpose is to stop
> an error from crashing the process. There is no handler left above it.

That directly violates the invariant documented in this very file at
`index.ts:421–423` — *"A long-poll failure … must NEVER crash the daemon"* — and
it lands on the daemon that supervises the **live Telegram channel to the
operator's phone**, the thing items 29/29b exist to keep alive.

**A second, quieter regression rides along:** the tee appends *before* calling
`baseLog`, so a file failure **also suppresses the pane log** (`pane logs: 0`
above). Previously the pane log always got the line. The durable-log feature can
therefore destroy the log path it was meant to supplement.

**Suggested fix (~3 lines):**

```ts
return (message) => {
    baseLog(message);                    // never lose the pane line
    try {
        appendFileSync(logPath, `[pij-telegram] ${message}\n`);
    } catch (error) {
        // durable log is best-effort; report once, never crash the daemon
    }
};
```

I did **not** implement or test this fix — it is a suggestion, and the
report-once semantics (avoiding a per-message error storm) need a decision.

**Honest scoping:** the trigger is uncommon (same-user file, normally writable).
I did not observe it in production. I am rating it blocking on **blast radius and
violated invariant**, not on likelihood — the cost of the guard is three lines,
and the cost of the failure is a dead daemon and a silent Telegram channel.

### B2 — major: the **production** path is unsensored

The daemon calls **`bridgeSupervisorForDaemon`** (`daemon.ts:1711`).
`autoStartBridgeForDaemon` has **no production caller**. T-LOG1 drives
`autoStartBridgeForDaemon`.

I mutated each wired site separately rather than trusting one mutant:

| mutant | site | result |
|---|---|---|
| MUT-AUTOSTART-UNWIRE | `:532` — the tested path | **RED @ :721** |
| MUT-BASELOG | drop `baseLog` | **RED @ :730** |
| **MUT-SUPERVISOR-UNWIRE** | `:548` — **the production path** | **SILENT — 29 passed** |
| **MUT-SUPERVISOR-OWNLOG** | `:561` `log: bridgeLog` | **SILENT — 29 passed** |

`MUT-SUPERVISOR-UNWIRE` (`bridgeLog = callbacks.log`, mutated sha
`aa3a0462b4e6792c81b8974e58e6ca6cbc4c3cc436661e2c8646d5bf9de23b24`) reverts
**both** supervisor wirings at once — i.e. it **restores the exact bug this fold
exists to fix, for the path the daemon actually runs**. Repo-wide:

```
tsc      : exit 0
full     : 4701 passed | 19 skipped | 3 failed  ← identical to the pristine baseline
```

**Completely silent.**

**To be fair to the fold, I verified the fix is genuinely correct there** — this
is a coverage gap, not a broken path. Driving the real
`bridgeSupervisorForDaemon` with no `telegram.env`:

```
file content    : ["[pij-telegram] telegram: no usable telegram.env — bridge auto-start skipped"]
daemon callback : ["telegram: no usable telegram.env — bridge auto-start skipped"]
```

The production path **does** tee. Nothing guards it.

**Structural cause, worth recording:** `daemonBridgeDepsFor` accepts `overrides`,
and `autoStartBridgeForDaemon` exposes them — but `bridgeSupervisorForDaemon`
calls `daemonBridgeDepsFor(pijHome, bridgeLog)` with **no overrides** and exposes
none. The test seam was added to the path production doesn't use, which is
precisely why the production path can't be covered the same way.

### A3 — the fold is **not independently mergeable** (sequencing)

I cherry-picked onto fresh `origin/main` with byte-identical fence files, and
**T-LOG1 failed**:

```
expected : [pij-telegram] forwarded 1787879706517-000001-35838 part 1/1
in file  : [pij-telegram] forwarded pij-success → chat (1 text part)
```

Cause: the `forwarded <messageId> part N/M` line is emitted at
`bridge.ts:749` **on the item-24 chain**; `origin/main` still has the older
summary form at `bridge.ts:652`. `b1f0e0a` (item-24 final) **is** an ancestor of
this candidate and is **not** on main.

So T-LOG1 has a hidden, **out-of-fence** dependency on item-24's `bridge.ts`.

- **In its stated destination this is fine** — the packet folds it into item-24's
  PR, where that chain is present. On the correct base the test is GREEN.
- **But the fold cannot land on main independently**, and if item-24 is reordered,
  reverted or re-scoped, this test REDs for a reason unrelated to log persistence.
- Note the other two assertions (`forward error`, `queue consumer error`) pass on
  **both** bases — **the log sink itself works on main.** Only the
  success-line *format* assertion is base-coupled.

Worth stating because the packet presents the fold as a self-contained unit with
its own oracle; its acceptance test is not self-contained.

### A4 — advisory: unbounded growth on the operator's machine

Measured: **~150 B and 2 lines per forwarded message**, with no rotation or
truncation anywhere in `bridgeFileLog`. Pre-fix, only `telegramStart` wrote to
this file and only start-time lines. This fold makes it grow with **traffic**.

The daemon's own consumer reads it with `.slice(-4096)`, so unbounded retention
buys that reader nothing beyond the last 4 KB. A size cap or rotation would cost
little. Not blocking.

### 7.5 — credit

- **The oracle is honest** and the line claim is exact — reproduced first-hand.
- **Both halves of T-LOG1 are sensored** (§3.1) — better than the packet argued.
- **The test is genuinely behavioural**: real queue, real forwarding, only the
  network faked.
- **No double-append, exact format parity, zero collateral** — all three claims
  survived measurement rather than reading.

---

## 8. Teardown

Probe files removed **before** the reported gate runs (`git status --porcelain`
empty for every gate). All mutations restored and sha-verified; fence shas
re-verified pristine at exit (§1.2). All four worktrees removed; `/tmp` scratch
cleared.

---

## 9. Bottom line

The mechanism is right and the evidence for it is real: `MUT-LOGSINK` REDs
T-LOG1 at `:721` and reverses byte-identically, the inverse mutant proves the
callback half is sensored too, E40 holds once the pre-existing baseline is
stated, and the durable file demonstrably receives the lines on **both**
in-process paths with no duplication and exact format parity.

**Two things should change before this lands.** **B1**: guard the
`appendFileSync` and call `baseLog` first — as written, an unwritable log file
throws from inside the queue consumer's own catch and takes the daemon down,
which I proved by execution and attributed with the packet's own oracle. **B2**:
the daemon runs `bridgeSupervisorForDaemon`, and reverting its wiring is
repo-wide silent — the acceptance test guards the path production does not use.

**A3** is a sequencing constraint the o-prime should hold explicitly: this fold
must land with or after item-24, not before. **A4** is a small operational
advisory.

`65560901e78a652dec593c38c6a7f6d9d58ac122`
