# Review 01 — Phase 14 / 15-FX (SIGTERM child test: tsx relay race)

**Reviewer**: `pij-powerful-whale` (cold cross-model — claude-opus-5 via GitHub Copilot CLI)
**Frozen SHA**: `c7199ea26b88e0b2e6c30797eac812421828883d` · **Branch**: `s391/item15fx-sigterm-relay`
**Base**: `f6621fe1cc1ee2f3ed940f236f3f511b5074914e` (= `origin/main` = `git merge-base origin/main HEAD`)
**Range reviewed**: `f6621fe..HEAD` (2 commits: `52454fe` → `c7199ea`)
**Verdict**: **APPROVE** · **Highest finding**: **low** · no open major/high → **not FIX_REQUIRED**

---

## R0 — Scaffolding, and the limits of this pass

Stated first, so a gate I did not examine never looks like a gate I found clean.

**Scaffolding I built** (all outside the repo; the worktree was read-only apart from mutations that were restored byte-identical):

| Path | What it is |
|---|---|
| `/tmp/pwfx3/mut.sh` | Hardened Dim-0 harness: pins HEAD to `c7199ea`, refuses a dirty tree *before* mutating, keeps a pristine byte-copy, **aborts if the mutation produces an empty diff** (the false-GREEN guard), restores + `cmp`, re-asserts a clean tree. |
| `/tmp/pwfx3/load.sh` | Differential concurrency driver (relay arm vs direct arm under N-way parallelism). |
| `/tmp/pwfx3/probe/{child,drive}.*` | Synthetic relay-race reproduction (exit code only). |
| `/tmp/pwfx3/probe/{child2,drive2}.*` | Same, instrumented for **shutdown completion and lock leakage**. |
| `/tmp/pwfx3/probe/topology.mjs` | Process-identity probe: compares the spawned pid to the pid the daemon stamps into its own lock. |
| `/tmp/pwfx3/scripts/m3_break_guard.py` | The run-if-main guard break (spawn through a symlink). |
| `/tmp/pwfx3/out/**` | Per-run logs for all 133 test invocations below. |

**Limits — what I did NOT verify:**

- I did **not** reproduce the flake. 92 runs of the reverted (relay) form on the frozen tree were all green (§R3 M1). Per the brief this is *not* disproof; my verdict rests on the mechanism (§R2), which I proved deterministically by other means.
- I did **not** run `just lint` repo-wide, nor `harness checks`. I ran `tsc -p .` (whole project) and `biome check` scoped to the one changed file.
- Repo-wide `vitest` is **not runnable on this machine** — `pwsh` is absent, so `harness/scripts/release-age-policy.test.ts:196` fails for an unrelated environmental reason. I ran the dossier form (`.pi/extensions/pij/`), as the coder did.
- I did **not** exercise a real tmux daemon window, a real `pij daemon start/stop`, or any Windows path. The production-topology reasoning in **F-2** is read from source plus a synthetic reproduction — it is *not* an observation of a live daemon.
- Timing numbers are single-machine (16 cores, macOS, node 26.3.1, tsx 4.23.0), warm cache. They establish **shape and a threshold**, not an SLA.
- The live daemon (pid 82643, window @211) was untouched and still running at the end of this pass; no mutation ever wrote to `~/.pij/spine`.

---

## R1 — Freeze, fence, and gates

**Freeze** — verified, not assumed:

```
HEAD            c7199ea26b88e0b2e6c30797eac812421828883d   ✓ matches dispatch
branch          s391/item15fx-sigterm-relay                ✓
merge-base      f6621fe = origin/main                      ✓ 2 commits ahead, no drift
tracked tree    clean before and after every mutation      ✓
```

**Fence** — `git diff --name-only f6621fe..HEAD` returns **exactly two paths**, both allowed:

```
.pi/extensions/pij/daemon.test.ts
docs/plans/391-day3-core/tasks/phase-14-item-15fx-sigterm-flake/execution.log.md
```

**`daemon.ts` byte-identical** — proven by blob identity, not by reading a diff:

```
base  git rev-parse f6621fe:.pi/extensions/pij/daemon.ts  = 53fea054884c5192f4fe217d26002dd80dc37075
head  git rev-parse HEAD:.pi/extensions/pij/daemon.ts     = 53fea054884c5192f4fe217d26002dd80dc37075
```

**Anti-vacuity — the exhaustive line enumeration.** A count comparison cannot see an assertion deleted from a surviving test, so I enumerated *every* changed line in the range. There are five, and no test declaration or assertion is among them:

```
- import { createRequire } from "node:module";
- const nodeRequire = createRequire(import.meta.url);
- const TSX_CLI = nodeRequire.resolve("tsx/cli");
- 		const child = spawn(process.execPath, [TSX_CLI, DAEMON_BIN], {
+ 		const child = spawn(process.execPath, ["--import", "tsx", DAEMON_BIN], {
```

That is the whole code change. The assertion at `daemon.test.ts:2517` — `expect(exit).toEqual({ code: 0, signal: null })` — and both lock-removal assertions are **untouched**; the assertion was not loosened to tolerate 143.

**No retry / skip / loop crept in.** `daemon.test.ts` contains exactly **two** `it.skip(` declarations — `:1219` and `:1248` — plus one comment at `:1218` that merely mentions the string (`"Re-enable them (it.skip → it) …"`); a bare `grep -c it.skip` returns 3 and would misreport this. Both skips are the pre-existing s069 pane-input quarantine, present identically at base and HEAD and textually outside this diff. No `.retry(`, `retry:`, `it.fails`, or attempt loop exists anywhere in the file.

**Gates — re-run by me, not taken from the log:**

| Gate | Command | Result |
|---|---|---|
| Full extension suite | `npx vitest run .pi/extensions/pij/` via `pij bg` (`bg-mtc8ulkz-yyb29o`) | **172 files passed, 2 skipped · 4115 passed, 15 skipped · 0 failed** (193 s) |
| Types | `npx tsc --noEmit -p .` | exit **0** |
| Lint | `npx biome check .pi/extensions/pij/daemon.test.ts` | exit **0** (also confirms the removed `createRequire` import left nothing unused) |

My suite numbers match the coder's claim (`172 / 4115 / 0`) **exactly**.

**E22 evidence discipline — the kept logs exist and match their claims:**

| Directory | Claimed | Present |
|---|---|---|
| `docs/plans/391-day3-core/logs/sigterm-probe/` | 60 runs, `failed_run=0` | 60 logs + summary ✓ |
| `docs/plans/391-day3-core/logs/sigterm-direct-proof/` | 20 runs, `failed_run=0` | 20 logs + summary ✓ |
| `docs/plans/391-day3-core/logs/sigterm-direct-proof-rebased/` | 20 runs, `failed_run=0` | 20 logs + summary ✓ |
| `docs/plans/391-day3-core/logs/sigterm-run-if-main-probe.log` | `guardMatches:true` | present ✓ |

---

## R2 — The mechanism (the dispatch's central demand)

The brief asked me to **judge the mechanism, not the count**. I did four things: read both halves of the relay, identified the exact source of `143`, measured the constant that governs it, and reproduced the fault deterministically.

### R2.1 — The relay forwards SIGTERM, and it can exit 143 on its own initiative

`tsx/cli` resolves to `node_modules/tsx/dist/cli.mjs` (the package `bin`). The bare specifier `tsx` used by `--import tsx` resolves to `dist/loader.mjs` — **a different file with a different job**. That distinction is the whole fix.

In `cli.mjs`, the default (non-watch) run path calls `relaySignals(childProcess, ipcChannel)` — I confirmed the call site (`wl(o,D)`, offset 120217), so this is the code path the old `node <tsx/cli> daemon.ts` form actually took. De-minified (offset 119057):

```js
const waitForSignalFromChild = () => {
  const r = new Promise((i) => { setTimeout(() => i(undefined), 30); resolveSignal = i; });   // 30 ms
  ...
};
const relaySignalToChild = async (sig) => {
  if (await waitForSignalFromChild() !== sig) {          // window 1 — child hasn't reported
    child.kill(sig);                                     // forward
    if (await waitForSignalFromChild() !== sig) {        // window 2 — still hasn't reported
      child.on("exit", () => process.exit(128 + signals[sig]));   // <-- SIGTERM: 128+15 = 143
      child.kill("SIGKILL");                             // <-- and it KILLS the daemon
    }
  }
};
process.on("SIGINT", relaySignalToChild);
process.on("SIGTERM", relaySignalToChild);
```

So **`143` is not an inference — it is literally `process.exit(128 + 15)` in the relay**, reached on a timeout. There is a second 143 path in the same file (`o.on("close", c => { if (c===null) c = signals[o.signalCode]+128; process.exit(c); })`), which fires if the child dies *by* signal; that one is not the flake here, because the daemon handles SIGTERM.

### R2.2 — What the 30 ms window waits for, and why the daemon can defeat it

The thing the relay waits for is a message from the child, sent by tsx's **child-side hidden handler** in `dist/preflight.cjs`:

```js
isMainThread && (async () => {
  const client = await connectingToServer;          // async: a socket connect
  if (client) bindHiddenSignalsHandler(["SIGINT","SIGTERM"], (s) => client({ type:"signal", signal:s }));
})();
```

Two properties make this losable:

1. `send(...)` is an **asynchronous socket write**.
2. The daemon's own handler is **fully synchronous and ends in `process.exit(0)`** — `daemon.ts:1847-1850`: `stop?.()` → `releaseHeldLocks()` → `exit(0)`. `process.exit()` does not flush pending async writes.

So if the daemon's synchronous shutdown (which does real filesystem work releasing two locks) occupies the thread past the relay's budget, the report never lands, both windows lapse, and **the relay reports 143 for a daemon that exited 0** — and SIGKILLs it on the way out.

### R2.3 — Reproduced deterministically, with the constant measured

I built a child that handles SIGTERM, spends `BLOCK_MS` synchronously (standing in for `releaseHeldLocks()` under load), then exits **0**. Same child, both spawn forms, 12 runs each:

| `BLOCK_MS` | relay form (`[TSX_CLI, BIN]`) | direct form (`["--import","tsx",BIN]`) |
|---:|---|---|
| 0 | `code=0 signal=null` ×12 | `code=0 signal=null` ×12 |
| 40 | **`code=143 signal=null` ×12** | `code=0 signal=null` ×12 |
| 80 | **`code=143` ×12** | `code=0` ×12 |
| 200 | **`code=143` ×12** | `code=0` ×12 |

Boundary sweep on the relay arm (8 runs each) — it lands **exactly** on the source constant:

| `BLOCK_MS` | 10 | 20 | 25 | **30** | 35 | 50 |
|---|---|---|---|---|---|---|
| relay result | 0 | 0 | 0 | **143** | 143 | 143 |

The flip is at 30 ms, matching `setTimeout(() => i(undefined), 30)` exactly. **The mechanism is confirmed quantitatively, not merely plausibly.**

### R2.4 — The flake is worse than a wrong exit code

Instrumenting the same probe to record whether the handler *finished* and whether the "lock" was released:

| arm | `BLOCK_MS` 40 / 500 / 3000 |
|---|---|
| relay | `code=143 · shutdownCompleted=false · lockLeaked=true` (6/6 at every delay) |
| direct | `code=0 · shutdownCompleted=true · lockLeaked=false` (6/6 at every delay) |

The relay's `kill("SIGKILL")` lands **mid-shutdown**. So a flaky run of the old test was not a cosmetic exit-code mismatch: the harness was actively destroying the behaviour under test, and all three assertions would have failed — `{code:143}` merely reported first. This makes the fix a correctness restoration, not a flake suppression.

### R2.5 — `--import tsx` removes the relay entirely, and the daemon becomes the signalled process

`dist/loader.mjs` is 743 bytes and contains **zero** occurrences of `SIGTERM`, `SIGINT`, `preflight`, or `spawn` — it only re-exports the ESM hooks (`resolve`, `load`, `initialize`, `globalPreload`). There is no relay process, no IPC channel, no hidden handler and no 30 ms budget. The race is **structurally removed**, not narrowed.

Proven directly rather than inferred: the daemon stamps its **own pid** into the lock token (`daemon.ts:1866` region), so the spawned pid can be compared against it.

| form | spawned pid | pid inside `write.lock` | same process? |
|---|---:|---:|---|
| relay | 20048 | 20051 | **no — an intermediate process sits in between** |
| direct | 20558 | 20558 | **yes — the signalled process IS the daemon** |

This satisfies the brief's "the process under test is the daemon itself (no intermediate node)" as an *observation*.

### R2.6 — The old test was the topologically unfaithful one

Worth stating because it inverts the obvious objection ("production uses `npx tsx`, so the relay form was more realistic").

Production launches the daemon as `npx tsx <daemonPath>` (`cli.ts:1598`) — relay topology. But `pij daemon stop` sends the signal to **`plan.pid`, the pid read from the daemon lock** (`cli.ts:1765`), which is the *inner* daemon's own pid. Production therefore signals the daemon **directly**, exactly as the fixed test now does. The old test signalled the relay — something production never does. The change moves the test *towards* the production shutdown path, not away from it. (The residual relay exposure is recorded as **F-2**, out of scope.)

---

## R3 — Dim-0 ledger

All mutations applied through the hardened harness: HEAD pinned, dirty tree refused, non-empty diff asserted before running, restored and `cmp`-verified after. **133 test invocations total.** Every restore was byte-identical and left `git status` clean.

| # | Mutation | Runs | Result |
|---|---|---:|---|
| **M1** | **Dim-0 (1)** — revert `daemon.test.ts` to base (`git show f6621fe:…`), i.e. the `[TSX_CLI, DAEMON_BIN]` relay form. Because the range's only code change is those five lines, this is an exact revert. | 20 serial | **0 red / 20** |
| M1b | Same revert, run **8-way concurrently** (approximating full-suite contention) | 24 | **0 red / 24** |
| M1c | Same revert, run **16-way concurrently** on 16 cores | 48 | **0 red / 48** |
| **M2** | **Dim-0 (2)** — fix in place, unmutated | 40 serial | **40 green / 40, 0 red** ✓ |
| **M3** | **Dim-0 (3)** — break the run-if-main guard: spawn `daemon.ts` **through a symlink**, so `process.argv[1]` is the link path while `import.meta.url` is the realpath, defeating `daemon.ts:1870` | 1 | **RED — loud** ✓ |

**On M1's 0/92.** I could not reproduce the flake, and I say so plainly. The brief anticipated this (≈1/200) and directed me to judge the mechanism instead. I went further than a serial loop — I ran the reverted form under 8-way and 16-way concurrency, since the original sighting was during a full parallel suite — and it still stayed green. My conclusion rests on §R2, where the identical fault **is** produced on demand and its governing constant measured. Note also that the coder's own 60-run base probe was run at `e6a55e8` (a pre-rebase ancestor of HEAD), not at the frozen base; my 92 runs close that gap on the frozen tree (see **F-3**).

**On M3's failure mode** — it is louder and faster than the brief expected:

```
FAIL .pi/extensions/pij/daemon.test.ts > daemon signal shutdown >
     the real daemon SIGTERM path releases write.lock and events.lock in a temp home
Error: daemon exited before marker: code=0 signal=null
```

With the guard defeated, `daemon.ts` loads but never calls `runDaemon()` / `holdSignalTestLocks()`, so nothing keeps the process alive and it exits immediately. The test's pre-existing `child.once("exit", …)` reject arm (`daemon.test.ts:2501`) catches this by name in ~1 s rather than waiting out the 5 s marker timeout at `:2491`. **The test cannot pass vacuously**: its green depends on the daemon genuinely running under `--import tsx` and reaching the `PIJ_TEST_LOCKS_HELD` marker.

---

## R4 — The brief's "look hard at" list

| Item | Verdict | Evidence |
|---|---|---|
| Process under test is the daemon itself, no intermediate node | ✅ | §R2.5 pid-identity probe: `20558 == 20558` direct, `20048 ≠ 20051` relay |
| Assertion unchanged (`{code:0, signal:null}` + both locks gone) | ✅ | §R1 exhaustive line enumeration — assertion lines are not in the diff |
| No retry / loop / `it.skip` crept in | ✅ | §R1 — exactly two `it.skip(` declarations (`:1219`, `:1248`), both the pre-existing s069 quarantine, identical at base and HEAD; no `.retry(`/`retry:`/`it.fails` in the file |
| `daemon.ts` byte-identical | ✅ | §R1 blob identity `53fea05…` at both commits |
| E22 evidence discipline (per-run logs kept, first red preserved) | ✅ | §R1 table — 60/20/20 logs + summaries all present. No red was ever produced, so there was no first red to preserve; the coder reported `0/60` rather than omitting it, which is the honest outcome the dossier explicitly permits |
| Fence = `daemon.test.ts` + `execution.log.md` only | ✅ | §R1 — exactly those two paths |
| Latent exposure in sibling tests | ✅ none | `daemon.test.ts:2509` is the **only** `kill("SIGTERM"\|"SIGINT")` to a spawned child in the entire extension. Eight sibling files still use the `tsx/cli` relay form, but none signals a child and asserts its exit code, so none is exposed to this race. The fix's scope is exactly right — minimal *and* complete |

---

## R5 — Findings

All findings are **low** or **info**. None blocks.

### F-1 (low) — the execution log's root-cause sentence is correct but materially incomplete

`execution.log.md` § T002 says the relay's *"default SIGTERM exit could race the inner daemon's handled exit 0"*. True, but it omits the two facts that make this diagnosable by the next reader:

1. the race has a **hard 30 ms budget** (measured, §R2.3) — so the trigger is any shutdown or scheduling delay past 30 ms, which names the conditions under which it recurs;
2. the relay **`SIGKILL`s the daemon** after the second window, so the failure is not a mislabelled exit code but a **destroyed shutdown that leaks both locks** (§R2.4).

As written, a future reader would reasonably believe the old test was merely reporting the wrong number. **Remedy**: one or two sentences in `execution.log.md` naming the 30 ms budget and the SIGKILL escalation. Documentation only; no code change.

### F-2 (low, out of packet scope) — the production relay exposure is real, and now untested

Production still runs the daemon under the relay: `cmd: "npx", args: ["tsx", daemonPath]` (`cli.ts:1598`). `pij daemon stop` is safe because it signals the inner pid (`cli.ts:1765`, §R2.6). But any signal delivered to the **relay** — e.g. a process-group signal to the daemon pane, or an operator interrupt in that window — gives the daemon roughly 60 ms and then `SIGKILL`s it, leaving `write.lock` and `events.lock` behind (§R2.4 measured this at `lockLeaked=true` in 18/18 relay runs).

This is **not introduced by this change** — it pre-exists and is *why* the old test flaked. It is also mitigated: item 15's dead-pid lock reclaim exists precisely to recover locks held by a dead pid. But the consequence of this fix is that **no test now exercises the relay topology at all**, so if that exposure matters it is unobserved. I am recording it, not failing on it: it is outside this packet's fence (`daemon.test.ts` + `execution.log.md`) and outside AC-31. Suggested disposition: an orchestrator-level follow-up deciding whether production should launch the daemon via `node --import tsx` for the same reason the test now does.

### F-3 (info) — the base probe ran on a pre-rebase base

`execution.log.md` § T001 records the 60-run probe at `e6a55e81163a8f95e7302f536f8423035ad7e99b`, not at the frozen base `f6621fe`. The coder disclosed this plainly and re-ran the *direct* proof after the rebase (`sigterm-direct-proof-rebased`, 20/20), but did not re-run the *relay* probe on the rebased tree. I closed that gap myself: 92 relay-form runs on the frozen tree, serial and at 8-/16-way concurrency, all green (§R3 M1/M1b/M1c). No action needed — recorded so the evidence trail is not misread as covering the frozen base when it does not.

### F-4 (info) — a stronger guard sensor already exists than the dossier assumed

The dossier and brief both frame the run-if-main failure mode as a **marker timeout** (5 s, `daemon.test.ts:2491`). In practice the pre-existing `child.once("exit", …)` reject at `:2501` fires first with a named message (§R3 M3), turning a 5 s silent hang into a ~1 s explicit `daemon exited before marker: code=0 signal=null`. Nothing to fix — worth recording because it is the reason this test cannot silently degrade into vacuity, and a future refactor that removes that arm would lose the property without any test noticing.

---

## R6 — Disposition

| Dossier item | Status | Basis |
|---|---|---|
| T001 — base probe, logs kept, counts recorded | ✅ | 60 logs + summary present; `0/60` reported honestly; run-if-main probe log present and `guardMatches:true` (§R1) |
| T002 — `--import tsx` direct child, assertions unchanged, 20/20 | ✅ | Exhaustive line diff (§R1); my own 40/40 (§R3 M2); topology proof (§R2.5) |
| T003 — full vitest + tsc + biome, 0 fail | ✅ | Reproduced independently: 172/4115/0, tsc 0, biome 0 (§R1) |
| AC-31 — daemon is the DIRECT child | ✅ | pid identity `20558 == 20558` (§R2.5) |
| Non-goal: no `daemon.ts` change | ✅ | Blob identity `53fea05…` (§R1) |
| Non-goal: assertion not loosened to accept 143 | ✅ | `:2517` untouched (§R1) |
| Non-goal: no retries/re-runs in the test | ✅ | §R1 |
| Root-cause claim (relay races the daemon's exit 0) | ✅ **confirmed, and sharpened** | Source read both sides + 143 located as `process.exit(128+15)` + 30 ms constant measured + fault reproduced on demand (§R2) |

**Summary.** The claim is correct, and the evidence for it is stronger than the coder's log states. `143` is literally `process.exit(128 + signals.SIGTERM)` inside tsx's CLI relay, reached when the child fails to report a signal within two 30 ms windows — and I measured the flip at exactly 30 ms. The relay does not merely mislabel the exit code: it `SIGKILL`s the daemon mid-shutdown and leaks both locks, which is why this presented as a hard 143-vs-0 failure. `--import tsx` loads `loader.mjs`, which has no relay, no IPC and no timeout, making the daemon the direct child — verified by pid identity. The change is five lines, `daemon.ts` is byte-identical, the assertion is untouched, no retry or skip crept in, and the fence holds. I could not reproduce the flake in 92 relay-form runs and say so plainly; per the brief the mechanism carries the verdict, and it is now demonstrated rather than argued. The four findings are documentation precision (F-1), a pre-existing and mitigated production exposure that is now untested (F-2), and two informational notes (F-3, F-4).

**VERDICT: APPROVE** — highest finding **low**, no open major/high.

---

## TERMINAL REPORT

This pass is **CLOSED**. No mutation was run after this verdict was written; every mutation listed in §R3 was applied, run, restored and `cmp`-verified before this file was created. The tracked tree is byte-identical to `c7199ea` and `git status --porcelain --untracked-files=no` is empty. The live daemon (pid 82643) was never signalled, and no probe wrote to `~/.pij`. No pass is left open. Evidence is retained under `/tmp/pwfx3/` and `~/.pij/pij-powerful-whale/bg-mtc8ulkz-yyb29o.log` should any claim need re-deriving.

c7199ea26b88e0b2e6c30797eac812421828883d
