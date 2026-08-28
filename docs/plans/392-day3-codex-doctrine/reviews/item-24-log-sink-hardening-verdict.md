# Item-24 log-sink hardening — COLD REVIEW verdict

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe or tree
> modification was run after this file was written. Every number below was
> produced before writing. Nothing in this review is pending.

**Candidate**: `66d0acd3fc7db4e80d2a98e99661bde69c004e01`
**Parent**: `65560901e78a652dec593c38c6a7f6d9d58ac122` (the commit I CONDITIONAL-APPROVED in `item-24-log-sink-verdict.md`)
**Branch**: `s392/item24-logsink-hardening-falcon`
**Reviewer**: `pij-wilful-morton` (cold, second pass on my own findings)
**Packet**: `reviews/item-24-log-sink-hardening-packet-cold.md`

---

## VERDICT: ✅ **APPROVE** — B1 is genuinely closed; 2 major advisories, 2 packet corrections

**B1 (my blocking finding) is closed.** I reproduced my own EACCES scenario in a
real Node process, not a vitest worker: the message now **acks**, the pane line
is **present**, the degradation is reported **exactly once**, and the throw no
longer reaches `queue-consumer.ts:57` at all. With the guard removed under the
identical probe, the message hangs at `claimed` and the error escapes to the
process top level. The attribution is unambiguous.

**B2 is HALF closed.** The new T-LOG1-SUP drives the *real* production
`bridgeSupervisorForDaemon` — I proved that with a sentinel throw. But the
supplied oracle mutates **two** sites at once. Mutated separately, one of them is
still **repo-wide silent** (§7.1).

**W3 is genuine new coverage** — but the supplied oracle does not prove it
(§7.3). I built the oracle that does.

Nothing was removed; no collateral; the original T-LOG1 and its assertions
survive intact.

---

## §1 Scaffolding — what I actually built and ran

Three detached worktrees off `/Users/vaughanknight/GitHub/pij`, each with
`node_modules` symlinked from the main checkout:

| tree | commit | role |
|---|---|---|
| `/tmp/pij-lsh-cand` | `66d0acd` | candidate, as-committed |
| `/tmp/pij-lsh-pre` | `65560901` | **pre-fix differential control** (the tree I previously reviewed) |
| `/tmp/pij-lsh-main` | `2094bde` | `origin/main` at review time, for drift/sequencing checks |

Mutation harness `/tmp/lsh-mut.py`, enforcing: pristine precondition (file must
equal its HEAD blob), **anchor uniqueness (exactly N occurrences)**, no-op
refusal, printed mutated sha256, and restore-from-self-captured-bytes with a sha
verification. Supplied `.patch` oracles were applied with `git apply` / `git
apply -R` and sha-verified on both sides.

Four throwaway probes, written inside the candidate worktree and **deleted
before writing this file**: `b1probe.mts` (real-process crash reproduction),
`ownlogprobe.mts` (supervisor own-log harm), `sinkprobe.mts` (double-append +
latch scope), `concprobe.mts` (concurrency + latch cycle).

**Because I did not build on bare main** (per the packet), the review base is the
item-24 chain. That is correct and I verified *why* it is necessary — see §7.5.

### §1.1 What I did NOT examine

State plainly, so an unexamined item does not read as a clean one:

- **No production / post-restart LIVE proof.** Every B1 trigger I exercised was
  *simulated* (`chmod 0444`, a directory at the log path). I have never observed
  this failure on Vaughan's real phone channel. The packet assigns live proof to
  the orchestrator; I did not attempt it.
- **`bridgeFileLog` is not exported.** The latch *scope* across sinks was tested
  through the real exported path (§5.3), but the fail→recover→fail *cycle*
  (§7.2) was measured against a re-implementation of the sink transcribed from
  the source. That is transcription-equivalence, not identity.
- **Concurrency was tested on the primitive, not the product.** I proved
  `appendFileSync` does not tear across two processes (§5.4). I did **not** run a
  standalone bridge and an in-process bridge simultaneously against one file.
- **Message-length limits on concurrency untested.** My concurrency lines were
  ~30 bytes. O_APPEND atomicity for very long forwarded messages is unverified.
- **The `.skip`ped test in `index.test.ts`** remains uninvestigated (carried from
  my previous review).
- **No rotation testing.** A4 is unchanged and I did not re-measure growth.

### §1.2 A probe defect I caught in myself

My first concurrency run reported **"torn lines: 800"** — an alarming and
entirely false result. Cause: with `node -e <script> <arg>`, the extra argument
lands at `process.argv[1]`, not `argv[2]`, so every tag rendered as `undefined`
and my well-formedness regex rejected every line. Corrected to `argv[1]`, the
true result is **800/800 well-formed, 0 torn**. I report this because the wrong
number would have manufactured a finding out of my own bug.

My first `ownlogprobe` run also produced a silent no-op (the lock file must be
JSON `{pid, startedAt}`, not a bare pid). Corrected before use.

### §1.3 Pristine at exit

All four fence files verified byte-identical to HEAD after every mutation:

```
.pi/extensions/pij/telegram/index.ts       2a89dfcb03b6b051b1ea6d1946b0f798d86a8ad7e1599f21d9045b8cb90789d2
.pi/extensions/pij/telegram/index.test.ts  1c7cb60d2dcbdf81524b2a1743e958153fc07496e389cc2fbfa1baad0ece7a56
.pi/extensions/pij/daemon.ts               00ff4d9f43519de4bc02f0bf7a04b1de38d0e8a097b1581c36f2fb0b2d8d770e
.pi/extensions/pij/daemon.test.ts          be14d47b1fc485a2dd4ddca47d0c2872d59663958b8d80619f535e8017bad38d
```

`git status --porcelain` empty in both the candidate and the pre-fix tree.

---

## §2 Branch shape

`66d0acd`'s parent is exactly `65560901`, so this is a direct parent→child fold —
no cherry-pick was needed to isolate it, and `git diff 65560901 66d0acd` **is**
the commit's own delta (7 files: 3 source/test + 4 mutant patches; +247/−2).

`origin/main` had moved again since my last review (`8f5dd3a → 2094bde`); I
re-derived it. Merge-base `10483d8e`; main is 143 ahead, candidate 153 ahead.

**Baseline (telegram + daemon fence): `296 passed | 4 skipped` — exactly the
packet's number.** `tsc --noEmit` exit 0. `biome check` on the three touched
files: clean, no fixes applied.

---

## §3 Mechanical oracles (E37) — all four RUN, all four RED at the claimed line

| oracle | packet claim | **observed** | restore |
|---|---|---|---|
| `MUT-TEE-UNGUARDED` | RED `index.test.ts:707` | **RED `:707`** — *and also `:740`* | sha `2a89dfcb…` = pristine, GREEN |
| `MUT-REPORT-ONCE` | RED `index.test.ts:744` | **RED `:744`** — *and also `:712`* | pristine, GREEN |
| `MUT-SUPERVISOR-UNWIRE` | RED `index.test.ts:957` | **RED `:957`**, single failure | pristine, GREEN |
| `MUT-CAPTURE-TAIL-PATH` | RED `daemon.test.ts:234` | **RED `:234`**, single failure | sha `00ff4d9f…` = pristine, GREEN |

Mutated shas (recorded so the runs are reproducible):

```
MUT-TEE-UNGUARDED      index.ts  201a8312ec37179ab3ce2162f20e6a5afdb80621946d1edeb20e7f4822ac0184
MUT-REPORT-ONCE        index.ts  9668000ca5ca28c59eff5ad8c57a2387137cdb10090a2683d41685945446aff3
MUT-SUPERVISOR-UNWIRE  index.ts  8ab5021a23a135e9c98fd78f6922b931f98b921c74a1ae29cec4a5e37ad2ea55
MUT-CAPTURE-TAIL-PATH  daemon.ts 7729ca49f9ca150fffaae47e0c81f2212d5ce12660dc401878f0c3f2b4a73d29
```

### §3.1 Line-claim accuracy (packet claims treated as UNVERIFIED)

`daemon.test.ts:234` is **exact** — it is literally
`expect(readFileSync(capturePath ?? "", "utf8")).toContain("bridge tail")`.
The three `index.test.ts` line claims are assertion lines inside tests declared
at `:683`, `:721` and `:910`; all three were confirmed empirically by the run,
not by reading. **No line claim in this packet was wrong** — a first across the
packets I have reviewed in this stream.

`MUT-SUPERVISOR-UNWIRE`'s hunk header reads `@@ -557,20 +557,20 @@`, and
`bridgeSupervisorForDaemon` begins at `:553` with the mutated statements at
`:558`–`:571` — the hunk range genuinely contains the code under review.

---

## §4 No collateral — proven structurally, not by counts

`npx vitest list` over the fence in both trees, sorted and diffed:

- **REMOVED (present in `65560901`, absent in `66d0acd`): EMPTY.**
- ADDED: exactly 3 —
  - `bridgeSupervisorForDaemon production logging > persists supervisor-owned forward success and failure logs`
  - `maybeStartBridge (daemon auto-start) > keeps delivery alive and pane-visible when the durable tee cannot append`
  - `maybeStartBridge (daemon auto-start) > reports a failed durable tee only once across repeated forwards`

293 → 296.

Because a declaration diff is blind to assertions deleted from a *surviving*
test, I also ran a line-level deletion diff over both test files:
**zero deleted lines.** The fold is purely additive.

The original T-LOG1 assertions survive verbatim at `index.test.ts:798` and
`:800` (`forward error (…)`, `queue consumer error (…, attempt 1):
ForwardIncomplete`), and the new supervisor test mirrors them at `:961`/`:963`.
T-LOG1 itself (`persists in-process forward success and failure logs to
telegram-bridge.log`) passes in the baseline run.

**Full suite**: `3 failed | 4704 passed | 19 skipped` across 236 files. All three
classified, none in the fence, none additional:

| failure | classification | evidence |
|---|---|---|
| `daemon.delivery.test.ts` — "retires open dispatches on close…" | **pre-existing** | reproduces on the `65560901` pre-fix tree |
| `daemon.delivery.test.ts` — "continues retiring dispatches when a best-effort sweep spine note fails" | **pre-existing** | reproduces on the pre-fix tree |
| `release-age-policy.test.ts` — "restores the Windows caller environment…" | **environmental** | `pwsh` not installed on this machine (carried from prior reviews) |

---

## §5 Review asks, answered by execution

### 5.1 — B1 no-crash, for real (ask #1)

Real Node process, real `SqliteQueue`, real forward path. Not a vitest worker.

| scenario | queue final state | pane `forwarded` lines | tee-failure reports | process |
|---|---|---|---|---|
| control (writable log) | `acked` | 1 | 0 | survived |
| **EACCES (`chmod 0444`)** | **`acked`** | **1** | **1** | **survived** |
| EACCES, **guard removed** | **`claimed`** | 1 | 0 | error escaped to top level |

Under the guard the seed file is untouched (5 bytes — the append correctly never
lands) yet delivery completes and the operator still sees the line on the pane.

With `MUT-TEE-UNGUARDED` applied, the same probe produces
`EACCES … at index.ts:336 … at scan (queue-consumer.ts:57)` and the message is
left **`claimed`** — i.e. eligible for redelivery, which is precisely the
duplicate-on-the-phone class of bug item-24 exists to prevent. **The throw path
through `queue-consumer.ts:56-57` is dead on the candidate**: no error reaches it
at all.

One honesty note on my own prior wording. My earlier verdict said the process
*crashed*. More precisely: the rejection escapes to the process top level
(`uncaughtException`/`unhandledRejection`), and whether that terminates depends
on whether the host has installed a handler. My probe installed one, so it
observed a hang-at-`claimed` rather than an exit. Either outcome is a real
defect, and the guard removes both.

### 5.2 — Double-append 1:1 preserved under baseLog-first (ask #2)

Six real forwards through the live path:

```
messages forwarded      : 6
pane lines              : 12
file lines              : 12
every file line prefixed: true
stripped file === pane  : true      <- ordered deep equality, not a count
duplicate file lines    : 0
```

This is a stronger check than my previous review's count-only measurement: after
stripping `[pij-telegram] `, the file's line sequence is **deeply equal** to the
pane's. The reordering did not disturb the 1:1 property.

### 5.3 — Report-once latch scope (ask #3)

Three real sinks in one process (two broken, one healthy):

```
brokenA tee reports : 1   (exactly once)
brokenB tee reports : 1   (proves the latch is per-sink, NOT global)
healthy2 tee reports: 0
healthy2 file lines : 6   (a broken peer did not silence a healthy sink)
brokenA / brokenB forwards: 3 / 3  (delivery unaffected)
```

The latch is a per-closure variable, and the behaviour matches: not zero, not
per-message, exactly once per failing sink, with no cross-sink suppression.
**Its limit across time is a separate matter — see §7.2.**

### 5.4 — Concurrency (ask #8, deferred/non-blocking)

Two concurrent processes, 400 appends each, one file:
`800 expected / 800 actual / 800 well-formed / 0 torn / 800 unique`.

The fold does not change the write mechanism (`appendFileSync`, O_APPEND), so it
does not worsen concurrent append. **It arguably improves it**: a concurrent-write
failure that previously escaped is now caught. The residual is §7.2 — after the
first report, subsequent failures are silent.

---

## §6 E40 — covering test per touched line (ask #6)

Every mutation below was run with the greps intact and the whole fence executed.

| touched line(s) | covering test | proven by |
|---|---|---|
| `baseLog(message)` hoisted before the append (`:335`) | `keeps delivery alive and pane-visible…` (`:683`) | **MUT-BASELOG-INSIDE-TRY** → RED `:709` + `:745` |
| `try { appendFileSync … }` (`:336`–`:337`) | same (`:683`) | supplied `MUT-TEE-UNGUARDED` → RED `:707` |
| `let teeFailureReported = false` (`:333`), `if (teeFailureReported) return` (`:339`), `teeFailureReported = true` (`:340`) | `reports a failed durable tee only once…` (`:721`) | supplied `MUT-REPORT-ONCE` → RED `:744` |
| `overrides` param + threading into `daemonBridgeDepsFor` (`:556`, `:559`) | `persists supervisor-owned forward…` (`:910`) | **MUT-SUP-DEPS-ONLY** → RED `:957` |
| W3 capture-tail assertion (`daemon.test.ts:232`–`:234`) | `notifies every pij-telegram watcher…` | **MUT-CAPTURE-EMPTY-TAIL** → cand RED, pre GREEN |
| `log: bridgeLog` (`:571`) — **not touched by this fold** | **NONE** | **MUT-SUP-OWNLOG-ONLY → SILENT** (§7.1) |

**"≥1 must be none":** the entire `try/catch` + latch block is new code with no
prior test, and — more interestingly — the *silently-empty tail* behaviour had
**no prior coverage at all**, which I proved rather than asserted (§7.3).

One mutant I ran was **equivalent, not a gap**: `MUT-BASELOG-LAST` (move
`baseLog` to after the try/catch, preserving delivery) is repo-wide silent, but
it preserves the observable contract and only reorders the pane output. I
mention it so the silence is not mistaken for a coverage hole. The
behaviour-changing variant (`baseLog` back *inside* the try, where a throw skips
it) **is** sensed — RED at `:709` and `:745`. The test name's "and pane-visible"
clause is therefore honest.

---

## §7 Findings

### 7.1 — C1 (MAJOR, carried-over): the supervisor's own log line is still unsensored

`MUT-SUPERVISOR-UNWIRE` mutates **two** sites in one patch. Mutated separately:

| mutant | site | result |
|---|---|---|
| MUT-SUP-DEPS-ONLY | `daemonBridgeDepsFor(pijHome, bridgeLog, overrides)` (`:559`) | **RED `:957`** ✅ |
| **MUT-SUP-OWNLOG-ONLY** | `log: bridgeLog` (`:571`) | **SILENT — 296 passed, exactly baseline** |

So the supplied oracle's RED is carried entirely by the deps half. A regression
confined to `log: bridgeLog` would ship green.

**This is not a regression introduced by the fold** — `log: bridgeLog` is not in
the fold's diff; it is carried over from `65560901`. My original B2 named both
sites; this fold closed one.

**Harm measured, not asserted.** `superviseBridge` routes three lifecycle
messages through `deps.log`: the restart-cap storm guard, `supervised restart
failed`, and the restart evidence itself. Driving the real
`bridgeSupervisorForDaemon` with a dead lock pid:

| | durable file | pane |
|---|---|---|
| pristine | 153 bytes, **1** restart line | 1 |
| MUT-SUP-OWNLOG-ONLY | **64 bytes, 0** restart lines | 1 |

The line lost is
`[pij-telegram] telegram: telegram bridge restarted after dead pid 999999 (new pid …)`.

**This couples directly to W3.** W3's whole value is that the watcher capture
tails `telegram-bridge.log` after a restart. If the restart evidence never
reaches that file, the capture W3 now asserts on is empty of the very event it
was added to explain. C1 and W3 are the two halves of one guarantee, and only one
half is sensed.

**Recommended (one assertion closes it):** extend the existing T-LOG1-SUP to
drive a restart (write a lock file with a dead pid before constructing the
supervisor) and assert the durable file contains `bridge restarted`. I verified
that assertion is achievable through the real exported function.

### 7.2 — C2 (MAJOR): "report once" is once per sink *lifetime*, not once per outage

The latch is never reset. Measured across a fail → recover → fail cycle:

```
phase1-ok            -> written
phase2-broken-a/b    -> lost, reported ONCE
phase3-recovered     -> written
phase4-broken-again  -> LOST, reported NOT AT ALL
tee-failed reports total : 1
file content: "[pij-telegram] phase1-ok\n[pij-telegram] phase3-recovered\n"
```

After the first report the sink is permanently silent about durability. A later,
distinct outage silently drops lines from the file the operator is told to
trust — and, per C1, that is the same file the restart capture reads.

This is arguably the intended reading of "report once per sink", so I am not
treating it as blocking; it is a **scope question for the o-prime**, exactly like
the report-once semantics ruling my previous verdict asked for. The cheap fix is
to clear `teeFailureReported` on a successful append, converting it to
once-per-outage. That preserves the anti-spam property that motivated the latch
while restoring honesty about later failures.

### 7.3 — C3 (packet correction): MUT-CAPTURE-TAIL-PATH does not discriminate W3

The supplied W3 oracle REDs — but it **also REDs on the pre-fix tree**, at
`daemon.test.ts:233` (`expect(logs).toEqual([])`), because a broken path throws
and the catch logs. The *broken-path* case was already sensed before this fold,
so this oracle cannot show W3 adds coverage.

I built the oracle that can. **MUT-CAPTURE-EMPTY-TAIL** replaces
`.slice(-4096)` with `.slice(0, 0)` — the read succeeds, nothing throws, nothing
is logged, and the tail is silently empty:

| tree | result |
|---|---|
| candidate `66d0acd` | **RED** `daemon.test.ts:234` |
| pre-fix `65560901` | **GREEN** (73 passed) |

**W3 is genuine, load-bearing new coverage** — it senses a silently-empty capture
that no prior sensor could see. Only the packet's justification for it is wrong.
Recommend shipping `MUT-CAPTURE-EMPTY-TAIL` alongside (or instead of)
`MUT-CAPTURE-TAIL-PATH` as W3's committed oracle.

### 7.4 — C4 (packet under-report, no action): two oracles are stronger than claimed

`MUT-TEE-UNGUARDED` reds `:707` **and** `:740`; `MUT-REPORT-ONCE` reds `:744`
**and** `:712`. The packet claims one test each. This is more coverage than
advertised, not less — recorded only so the next reviewer is not surprised by an
extra RED and does not read it as collateral.

### 7.5 — A3 (carried, still open): the sequencing constraint is real and unchanged

I re-verified the finding from my previous review. `origin/main` still emits the
old summary form at `bridge.ts:652`
(``forwarded ${dm.from} → chat (N text parts)``), while the item-24 chain emits
``forwarded ${dm.messageId} part N/M`` at `bridge.ts:749`. The new B1 test at
`:683` asserts on the latter.

`b1f0e0a` is an ancestor of the candidate and is **not** on main. So this fold
still **must land with or after item-24**; on bare main its tests fail for
reasons unrelated to the fold. The packet states this correctly and I confirmed
it rather than assuming it.

### 7.6 — Minor note: B1's tests drive a function with no production caller

Both new B1 tests use `autoStartBridgeForDaemon`, which still has **no production
caller** (only its own definition — I re-grepped). This is *not* a defect,
because the guard lives in the shared `bridgeFileLog`, so a mutation there reds
regardless of which caller drives it. But if the two sinks were ever given
different log plumbing, B1's sensors would follow the dead path. Worth a comment
at the test.

### 7.7 — A4 (carried, unchanged): no rotation

~150 bytes / 2 lines per forwarded message, no rotation, daemon reads
`.slice(-4096)`. The fold adds at most one further line per sink lifetime.
Unchanged by this fold; still open.

---

## §8 Credit where due

Three things in this fold are better than the bar:

1. **B1's fix is the right shape.** `baseLog` first, then a guarded append, is
   exactly the ordering that keeps the operator informed when durability fails —
   and it is sensed in the load-bearing direction (§6).
2. **The B2 fix chose the honest path.** Rather than re-faking the dead
   `autoStart` route, it threaded `overrides` into the real
   `bridgeSupervisorForDaemon` and drove *that*. My sentinel throw REDs exactly
   one test, which proves T-LOG1-SUP is the genuine — and sole — sensor of the
   production function.
3. **Every line claim in the packet was correct**, and the baseline number
   (296/4) matched to the digit. That is not typical of the packets in this
   stream and it materially shortened this review.

---

## §9 Teardown

Probe files deleted from the worktree; all mutations restored and sha-verified
against HEAD; `git status --porcelain` empty in both the candidate and the
pre-fix tree; mutation-backup directory empty. Worktrees `/tmp/pij-lsh-cand`,
`/tmp/pij-lsh-pre`, `/tmp/pij-lsh-main` are throwaway and detached.

---

## §10 Bottom line

**APPROVE `66d0acd`.** My blocking B1 is closed and I proved it in a real
process, in both directions. W3 is real coverage. B2's fix drives the true
production path.

Two things should not be lost on the way to merge:

- **C1** — a single-site regression at `index.ts:571` still ships green, and it
  silently empties the very capture W3 was added to guarantee. One assertion on
  the existing supervisor test closes it.
- **C2** — durable-log degradation is reported once per *sink lifetime*; a second
  outage is silent. Needs the same report-once ruling my previous verdict asked
  for.

Neither blocks this fold: C1 is carried over rather than introduced, and C2 is
the documented design. **A3 does gate the merge order** — this cannot land before
item-24's `bridge.ts`.

Post-restart LIVE proof remains with the orchestrator; I did not attempt it and
this approval does not stand on it.

66d0acd3fc7db4e80d2a98e99661bde69c004e01
