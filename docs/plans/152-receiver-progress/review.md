# Review: plan 152 — receiver observation progress is liveness

Reviewer `pij-sunny-tarsier`. Range `0e907e46..8df2bb0d` on branch `152-receiver-progress`, merge-base main `6b8d8504` (151 and 153 in). Plan `0e907e46`, code `f57623ad`, evidence `facee441`, rebase integration `0d1a85e6`, packet addendum `8df2bb0d`. Reviewed in a detached worktree at `8df2bb0d` with worktree-local deps and `CARGO_TARGET_DIR`.

This review covers two sittings: an initial pass that was **held** by prime when the rebased tree failed six extension tests, and this pass against the integration that fixed them.

## Verdict

**APPROVE-WITH-FIXES** — one blocking, two reported-not-owned.

The rule the plan set out to establish is implemented, and it is pinned. Every guard I tried to remove produced a named, targeted failure; nothing I mutated passed silently. The product code is correct and I found no defect in it. The one blocking item is in the proof harness this plan authored: the new `copilot-native-progress-smoke` gate fails roughly half the time on a clean machine, and I have its exact cause and a one-line fix.

| # | Severity | Location | Summary |
|---|---|---|---|
| F1 | **blocking** | `harness/scripts/copilot-native-progress-smoke.ts:445` | New gate is non-deterministic: 20,000 ms budget for an event that cannot arrive before 15,000 ms, with the fast path structurally unreachable. Failed run 1, passed run 2. |
| F2 | report-only (not 152's) | `harness/scripts/windows-compat.ts:18-21` | `focused-tests` stage runs zero files and exits 0. Confirmed empirically. Caused by 153's `.pi`→`.omp` move; already assigned to `pij-continued-bug`. |
| F3 | report-only (not 152's) | `harness/scripts/copilot-native-memory-smoke.ts:739` | Bare `just copilot-native-memory-smoke` fails on Copilot 1.0.85 (current default). Passes pinned to 1.0.84-9. Check pre-exists unchanged at merge-base. |

## Bar 1 — conflict resolution

Cleared, and prime's hand-resolution was **not** the cause of the hold. I proved that structurally before the integration landed, and the integration's own report agrees.

- Diff-of-diffs: the added/removed line set of `git diff d232e7ea~1 d232e7ea -- store.mjs` (pre-rebase) is byte-identical to `git diff 6b8d8504 facee441 -- store.mjs` (rebased). Nothing of 152 dropped or invented.
- 152's change set touches zero 151 symbols — `grep -E "^[+-].*(holdStarted|HOLD_ESCALAT|registration-wait|connection-ready)"` over the rebased diff returns nothing.
- Counts identical main vs rebased: `holdStarted` 7/7, `HOLD_ESCALATION_MS` 3/3, `HOLD_ESCALATED_RETRY_MS` 2/2, `registration-wait` 3/3.
- Constants block is a correct union (`store.mjs:6-12`, all exported).

**One `keepReceiverAlive()` start site** in production code, `store.mjs:920`, and it is the line after `await this.observeStartup()`:

```js
if (!this.heartbeat) {
    await this.observeStartup();
    this.heartbeat = this.keepReceiverAlive();
}
```

Because the assignment follows the await, no path starts the heartbeat before startup observation resolves; a throw leaves `this.heartbeat` unset. Ordering is register → observe → heartbeat → claims, as `report.md:19` states.

Both suites now pass together: **261 passed, 3 skipped, 0 failed, exit 0** (`node --test .copilot/extensions/pij/*.test.mjs`).

### What actually broke, for the record

Two independent gaps, both because 152 was authored and gated on a pre-151 base (`b715be4f` atop `cf08eacd`), so no one had run this combination before prime rebased:

1. The AC4 child fixture re-exported an explicit allowlist that omitted 151's `HOLD_ESCALATION_MS` and `HOLD_ESCALATED_RETRY_MS`, which `extension.mjs:13-14` imports — the child died at module instantiation with `SyntaxError: The requested module './store.mjs' does not provide an export named 'HOLD_ESCALATED_RETRY_MS'`.
2. 151 selected fixture timers by *exclusion* (`event.ms !== 20000`), and 152's idle poller added an unexcluded 1000 ms timer, so the waiters returned the wrong one — the `1000 !== 250` and `1000 !== 60000` failures.

Both repairs are good, and the first is better than the bug required. `progress.test.mjs:325` now asserts the wrapper is a superset of the real module:

```js
test("shutdown fixture exports every real store symbol", () => { … })
```

That is future-proof rather than a patch: any store export added later fails it, instead of failing as a module error inside a spawned child three plans from now.

## Bar 2 — AC1 deadlines are real

`NATIVE_RPC_DEADLINE_MS = 15000` (`store.mjs:10`), and all eight SDK call sites route through `nativeRpc(call, operation)` (`store.mjs:715-753`), which arms the timer, removes the abort listener, and clears the timer on every settle path.

Coverage is parameterised over all five required calls (`progress.test.mjs:342-386`) and the test is two-sided — it proves the call was actually made, that nothing holds at `DEADLINE - 1`, and that it holds at `DEADLINE`:

```js
assert.ok(f.calls.includes(call), "the hung native operation was actually invoked");
await f.advance(DEADLINE - 1);
assert.equal(held(f).length, 0, "no early hold");
await f.advance(1);
assert.equal(held(f).length, 1, "the native hang must not renew silently forever");
```

It then proves the late resolution cannot escape (`f.acks` stays empty) and that timers are released.

**MUTANT-I** — unbind exactly one call, `queue.pendingItems`, by calling the SDK directly instead of through `nativeRpc`:

```
✖ AC1: queue.pendingItems hangs hold at the SDK deadline without ACK or reinjection
  AssertionError: the native hang must not renew silently forever
MUTI_EXIT=1   — exactly one failure, no collateral
```

Calibration against the large session is in the evidence and is honest about direction: the 105 MB / 25,010-event session read in **0–1 ms, 7/7 reads settled** (`report.md:46`). Healthy reads of a session that size are four orders of magnitude inside the bound, so 15 s is a genuine outlier trap rather than a value tuned to pass.

## Bar 3 — AC2 staleness, re-baseline, hold

`RECEIVER_EMPTY_READ_LIMIT = 3` and `RECEIVER_PROBE_INTERVAL_MS = 1000` are named constants, and the recovery condition reads both (`store.mjs:1043-1044`). Forward and backward cursors never mix, and an inaccessible gap holds rather than spoofing a completion.

**MUTANT-J** — `RECEIVER_EMPTY_READ_LIMIT = Number.MAX_SAFE_INTEGER`:

```
MUTJ_EXIT=124   (whole file hangs at the default)

with --test-timeout=6000, 11 named failures, led by:
✖ AC2 H2: empty stale cursor recovers correlated terminal from a bounded backward window
✖ AC2: inaccessible {consumption-only,empty,expired,subagent-spoof,unrelated-terminal} gap holds …
✖ AC3: daemon stale lease is receive-held once, stops renewals and preserves outgoing tools
  'test timed out after 6000ms'
```

Removing the bound does not make the receiver wrong in a detectable way — it makes it wait forever, which is precisely the production symptom plan 152 exists to kill. That the un-bounded suite *hangs* rather than asserting is the most faithful possible RED here.

Live H2 confirmation, from my own run (not the coder's): `receiver-rebaselined` recovering a contiguous four-event gap, then the next message accepted.

```
{"kind":"receiver-rebaselined","jobId":1,"gap":{"afterEventId":"add0828c…","throughEventId":"f24054e1…","observed":4,"contiguous":true}}
{"kind":"native-accepted","msgId":"de662689-3b12-4895-8214-007f47da1a80"}
```

## Bar 4 — AC3 heartbeat carries progress, daemon consults it

The heartbeat carries real observation, not timer ticks: `observeProgress` (`store.mjs:756-767`) advances only on a genuinely new event id, bounded by a 256-entry dedup set.

**On the requested RED-on-main:** it cannot be produced by reverting `delivery/mod.rs` to main. I tried, and it is a compile failure, not a behavioural one —

```
error[E0599]: no method named `attest_native_receiver` found for struct `Arc<DeliveryService>`
error[E0599]: no method named `native_receiver_reason` found …
```

The new test binds to new API surface, so a source revert can only fail to build. `report.md:23` anticipates this exactly — *"Failures below are behavioral, not compiler failures"* — and their evidence used the honest method instead: a genuine pre-fix daemon binary spoken to over HTTP with the new payload, yielding `live,live,live,live` and `'live' !== 'stale'`. I accept that as the RED, and substituted a stronger probe on the composed tree.

**MUTANT-K** — delete only the frozen-renewal guard (`delivery/mod.rs:386-390`), so frozen heartbeats move the lease horizon, which is the pre-fix "renews forever" behaviour:

```
test http::native_tests::native_frozen_progress_http_expires_at_k_and_manual_pull_preserves_identity … FAILED
panicked at crates/daemon/src/http/native_tests.rs:2445:9:
assertion `left == right` failed: a frozen heartbeat must not add another lease before K
  left: Number(60000)
 right: 40000
test result: FAILED. 90 passed; 1 failed
```

One red out of 91, and the exact assertion `report.md:29` claims. The guard is subtle and worth stating plainly: without it, K misses *plus another whole lease* would defer manual recovery past the stated bound, so the comment at `:383-385` is load-bearing and correct.

K counts daemon-clock opportunities, not request bursts (`:368-375`), so a chatty client cannot inflate its way past the threshold — and a missed request cannot buy extra ones either (`:376-381`). Both directions closed.

Operator visibility is real, end to end, from my own run:

```
pij-unacceptable-behaviour: idle · active
  … native_receiver_reason: native-receiver-stale
```

and the `.omp` renderer change that surfaces it (`generation-routing.ts:105`) **is pinned by a new test** (`generation-routing.test.ts:118`, "human state exposes stalled native observation beside active host liveness"). Worth noting explicitly because the equivalent renderer change in plan 153 shipped unpinned and I raised it there; this plan did not repeat it.

### Bar 4b — Brandon's startup gap

A fresh replacement fork emits zero progress before it has observed anything, so it would look stale on arrival. The ordering fix prevents the false hold, and the named test is `AC3: healthy replacement observes SDK history before its first stale-lease renewal` (`progress.test.mjs:657`), which makes the daemon answer `stale` unless `observed_at > 99999 && observed_seq > 0` and then asserts:

```js
assert.deepEqual(held(f), [], "replacement must not hold before proving its responsive SDK view");
assert.equal(f.heartbeats[0].observed_seq, 1);
assert.equal(f.state.claims, 1, "replacement reaches ordinary inbox admission");
```

**If the SDK never answers at startup**, `observeStartup` throws a non-retryable `NativeError` (`store.mjs:1066-1068`; `NativeError` defaults `retryable = false` at `:29`), so it escapes the retry branch at `:951` and reaches `holdReceiving` — `receive-held`, never a registration retry. Pinned by `AC1: rejected SDK reads name the call without projecting private native errors` (`:403`), which also proves the safe diagnostic names `eventLog.read`, that no private error text leaks, and that the outgoing tool still works.

**Is fail-closed the right outcome here, and is it visible?** Yes, and yes with a caveat worth stating. It is right: the alternative is a receiver that holds a lease it cannot honour, which is the exact production defect. Because the hold happens *before* the heartbeat starts, and `holdReceiving` also aborts the heartbeat controller (`:780`), the lease simply expires — deliveries park and manual pull unlocks, which is the designed recovery rather than a new dead end. Visibility is layered: the `receive-held` line is immediate but only in the extension's stderr log, while the operator-facing `native_receiver_reason` appears via `pij state` only after lease expiry, i.e. up to 60 s later. That is acceptable for a 60 s lease, but it does mean the first minute of a startup-stall is diagnosable only by reading the extension log. I would not block on it; it is worth knowing.

I saw this path fire for real, twice, at the deadline:

```
{"at":"07:12:46.395Z","kind":"registered"}
{"at":"07:13:01.398Z","kind":"receive-held","safeDiagnostic":"eventLog.read deadline exceeded (15000ms)"}
```

15,003 ms apart — matching the report's 15,002/15,003 ms captures.

## Bar 5 — AC4 no silent exits

`stop(cause)` (`store.mjs:694-709`) emits exactly one `receiver-stopped` carrying `cause`, `msgId`, `jobId` and `nativeMessageId`, guarded by the already-aborted check so it cannot double-fire, and only when a completion is outstanding and non-terminal.

Named tests: `AC4: shutdown logs one outstanding job identity {before,after} consumption` (`:718`, both `accepted` values), the three real-child cases `AC4: actual extension {process.exit:0,session.shutdown,SIGTERM} logs outstanding completion exactly once` (`:748`), and — importantly — the negative `AC4: completed native work is not reported as outstanding on stop` (`:705`), which stops the fix degenerating into "always log a line".

I saw the negative case hold in a live run: a fork whose last completion had already reached `native-completed` exited `=== exit code=0 disposition=stopped-normally ===` with no `receiver-stopped` line, correctly.

The recycle boundary is pinned by `native_recycle_keeps_consumed_job_done_and_parks_only_unconsumed_work` (`native_tests.rs:2815`), and `report.md:85-87` states the rule in the right terms: consumed+ACKed stays **done**, accepted-but-not-ACKed stays recoverable or parks for explicit manual recovery, and ambiguous intent is never blindly reinjected. Counter-reset and replay-timestamp fixes are pinned by `AC3: callback/history overlap counts once and observation time advances despite clock rollback` (`:621`) and `AC3: fast replay cannot manufacture a future lease watermark` (`:640`).

## Bar 6 — AC0 honesty

Clean. The report does not let the fault injection stand in for a natural repro anywhere:

- `:5` — "The original production mechanism remains **unpinned**"
- `:11` — "Natural koi stall not reproduced"
- `:45` — "the exact production resubmission shape was not reproduced"
- `:57` — "This is a labelled fault-injection stand-in, not a claimed reproduction of koi's mechanism"
- `:93` — "**Candidate H1, not proven** … the experiments do not prove identical causality"

The 15 s startup-read stall is labelled candidate H1 and explicitly distinguished from koi's trigger (abort/model change vs an explicit SDK enable). `:44` even declines to claim an Esc success — "This is not an Esc-success or real-provider inference claim". The event grades carry the same discipline into the machine-readable evidence: `native-accepted-not-model-complete`, `observed-native-terminal-not-model-success`, `native-event-not-pij-ack`. A terminal event of type `abort` is graded as an observed terminal, not a success.

The rebase section supersedes its own earlier numbers rather than leaving them to be misread: *"earlier gates and runtime measurements above remain historical, not proof of this composed tree"*.

## Bar 7 — fence

Zero unexpected delta. The non-plan file set vs merge-base is identical to the set vs the plan commit — no stowaways from the rebase.

- `crates/daemon/src/registration.rs` — absent from the diff entirely.
- `.omp/extensions/pij/**` — only `generation-routing.ts` (+1 key in the detail list) and its test (+17, pinning it). Expected and minimal.
- `.copilot/` changes are all in-scope; spawn paths untouched apart from `crates/cli/tests/spawn.rs` (+2).
- `.gitignore` (+1): `docs/plans/152-receiver-progress/evidence/*/runtime/`, mirroring the plan-150 line directly above it, keeping private daemon keys and copied runtime out of Git. Justified and consistent.

## Findings

### F1 (blocking) — the new progress smoke is non-deterministic

`harness/scripts/copilot-native-progress-smoke.ts:443-445` waits 20,000 ms for the SDK-enable probe to resolve:

```ts
const replacement = await until(
    "replacement either observes or explicitly holds an unresponsive SDK",
    20_000,
```

Two facts make that budget too tight to rely on:

1. The event it waits for **cannot** arrive sooner than `NATIVE_RPC_DEADLINE_MS` = 15,000 ms, and in practice lands at 15,003 ms after the replacement registers. The budget is measured from `enableStarted` (`:439`), i.e. before registration, leaving under 5 s for the replacement to come up.
2. The fast path out is structurally unreachable. `:453` returns `observing` only when `card.native_receiver_reason === undefined`, but the preceding phase has already latched `native-receiver-stale` — `delivery/mod.rs:399` sets `frozen_renewals = NATIVE_RECEIVER_STALE_RENEWALS`, and the contract this plan wrote states "parking or an empty queue cannot clear an already-stale latch". So the probe must always burn the full 15 s.

Observed directly, same command, same pinned runtime, back to back:

```
run 1: PROG_EXIT=1  error: PIJ_NATIVE_MEMORY_TIMEOUT: replacement either observes or explicitly holds an unresponsive SDK
run 2: PROG2_EXIT=0  (held at 15,003 ms, inside budget)
```

Everything before that phase passed in *both* runs — rebaseline, next-delivery acceptance, verified extension PID death, `lease_expiry` 54,986 / 54,976 ms inside the 60,000 ms bound, `delivery.parked` seq 23 with `undelivered:native-receiver-unavailable`, `native-receiver-stale` in both CLI renderers, and manual inbox recovery with exactly one `reader-read` ACK leaving job 3 `done`. The product behaviour is right; only the gate is unreliable.

This matters because of what this repo believes about harnesses. A gate that fails half the time on a clean machine gets re-run, then ignored, then disbelieved when it finally catches something real. Fix: raise the budget to comfortably exceed the deadline it is waiting on — derive it from `NATIVE_RPC_DEADLINE_MS` rather than restating 20,000, so the two cannot drift apart. `NATIVE_RPC_DEADLINE_MS + 30_000` would leave honest margin without weakening the assertion, which still requires the specific `eventLog.read deadline exceeded` diagnostic.

### F2 (report-only, not 152's) — windows-compat measures nothing

`harness/scripts/windows-compat.ts:18-21` filters vitest to four `.pi/extensions/pij/...` paths. After 153 moved the source to `.omp` and `vitest.config.ts:63` excluded `.pi/extensions/pij/**`, the filter matches nothing — and vitest treats that as success:

```
$ npm run test -- .pi/extensions/pij/adapters/channel.test.ts … 
No test files found, exiting with code 0
FOCUSED_EXIT=0
```

`just self-check` duly prints `windows-compat: all portable stages passed`. `report.md` discloses this and prime has assigned it to `pij-continued-bug`, so it is correctly out of 152's fence — I am confirming it with evidence, and counting that stage as zero coverage as the addendum instructed.

It is worth naming the pattern, because this is the **second** instance I have found in two consecutive plans, both from the same `.pi`→`.omp` move: plan 153's `bounce-daemon.sh` dirty-source brake had gone blind in exactly the same way. The shape is a tool whose own traversal or matching policy silently stops matching reality, while still reporting success. I swept the remaining tooling references for a third: the import/exec paths (`harness/driver/*`, `pane-signals-smoke.ts`, `step-on-probe.ts`) traverse the symlink fine, and `local-path-check.ts` sources its files from `git ls-files`, so it still sees all 372 real `.omp` paths. Only its test input `local-path-check.test.ts:13` names a path git no longer produces — cosmetic, not a coverage hole. So: two real, both known, no third.

### F3 (report-only, not 152's) — memory smoke fails on current Copilot

Bar 8 asks for bare `just copilot-native-memory-smoke`. On this machine that resolves to `/Users/jordanknight/.npm-global/bin/copilot`, **1.0.85**, and fails after 93 s:

```
"error": "PIJ_NATIVE_MEMORY_TIMEOUT: unique extension descendant of registered isolated host"
"copilot": "GitHub Copilot CLI 1.0.85."
```

Pinned to the runtime the proof used, it passes:

```
$ just copilot-native-memory-smoke --copilot-bin ~/.local/bin/copilot \
    --copilot-runtime-dir ~/.copilot/pkg/darwin-arm64/1.0.84-9
MEM2_EXIT=0
```

Not 152's: the failing assertion at `copilot-native-memory-smoke.ts:739` exists unchanged at merge-base, and `git log -S` finds no commit in this range touching it. It is 1.0.85 process-topology drift inherited from plan 150. Recommend the recipe either pin its runtime or fail fast with a version-prerequisite message (exit 2, which this harness already reserves for that) instead of a 90 s timeout that reads like a product defect.

## Gates — my checkout

| Gate | Result |
|---|---|
| `cargo test --workspace --no-fail-fast` | **exit 0** — 1135 passed, 0 failed |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — 261 passed, 3 skipped, 0 failed |
| `just copilot-native-memory-smoke` | **fails on 1.0.85** (F3); **exit 0** pinned to 1.0.84-9 — 30 messages, 32 RSS samples, 101,840–113,600 KiB, ending 107,616 KiB |
| `just copilot-native-progress-smoke` | **flaky** (F1) — run 1 exit 1, run 2 exit 0 |
| `just self-check` (warm) | **exit 0** — 243 files / **5307 passed** / 22 skipped, smoke 11/11, `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001…)` |

The first `just self-check` in this fresh worktree exited 1 on `file-watch-notify`, the same cold-clone idle-timeout I recorded on plans 151 and 153 — the scenario is mid `git clone` of `pi-askuserquestion` into the per-worktree `.pi/git/` when the 30 s idle window expires. Warm re-run is green. Environmental, not plan-152.

My independent memory-smoke numbers (101,840–113,600 KiB over 32 samples) sit within a percent of the report's (102,544–114,112), which is a real reproduction of the bounded-RSS claim rather than a restatement of it.

## Commands executed

```bash
git worktree add --detach …/pij-worktrees/s152-rev 8df2bb0d && node harness/scripts/worktree-deps.mjs
# conflict proof: diff-of-diffs pre-rebase vs rebased store.mjs; 151 symbol counts main vs rebased
node --test .copilot/extensions/pij/*.test.mjs
# MUTANT-H re-add watchIdleReceiver + call site      → 9 named failures incl. both addendum-named tests
# MUTANT-I queue.pendingItems bypasses nativeRpc     → 1 failure, exact call
# MUTANT-J RECEIVER_EMPTY_READ_LIMIT = MAX_SAFE_INT  → file hangs; 11 named timeouts at --test-timeout=6000
# MUTANT-K delete frozen-renewal guard               → 1 failure, "must not add another lease before K"
# each mutant restored immediately; git status --porcelain empty after every one
cargo test --workspace --no-fail-fast ; cargo fmt --all --check ; cargo clippy --workspace --all-targets -- -D warnings
npm run test -- .pi/extensions/pij/adapters/channel.test.ts …   # F2: "No test files found, exiting with code 0"
just copilot-native-memory-smoke [--copilot-runtime-dir …/1.0.84-9]
just copilot-native-progress-smoke --large-history --inject-empty-cursor …   # x2
just self-check
```

All live work used isolated daemons on ephemeral ports with private `HOME`/Copilot/Claude homes and `tmux -L` sockets; every receipt records `"production_contacted": false` and `owned_tmux_stopped`/`owned_daemon_stopped` true. The production daemon was never contacted and the production registry was never written. `bounce-daemon.sh` was never executed — it stops the production daemon by design.

---

# Round 2 — fix round

Range `fc4e7c36..1c290079`, single commit `1c290079 fix(harness): budget receiver startup proof and pin Copilot smokes`. Base `fc4e7c36` is a packet-only commit on top of the round-1 reviewed source `8df2bb0d`, so the product source under review is unchanged. Fresh detached worktree at `1c290079`, worktree-local deps, worktree-local `CARGO_TARGET_DIR`.

## Verdict

**APPROVE.**

F1 and F3 are both fixed, and I could break each fix by mutating it. No receiver or Rust behaviour changed: the diff is 8 files, and the only non-harness edits are a one-line type declaration, one documentation sentence, and evidence. The contract sentence is present. Warm gates green.

One correction to the packet's expected result for F3, in the coder's favour — see below.

## F1 — registration-relative budget

Every element of the ruling is present at `harness/scripts/copilot-native-progress-smoke.ts`:

- **imported, not restated** — `:17` `import { NATIVE_RPC_DEADLINE_MS } from "../../.copilot/extensions/pij/store.mjs"`, used at `:455` as `NATIVE_RPC_DEADLINE_MS + 30_000`.
- **measured from registration** — `:449` waits for the replacement's own `registered` event (filtered to `Date.parse(event.at) >= enableStarted`), and `:457` starts the window at `registeredAt`, not `enableStarted`.
- **unreachable branch gone** — the `card.native_receiver_reason === undefined → observing` early return and the whole `if (replacement.kind === "observing")` arm are deleted; `kind` is now only ever `"held"`.
- **stale latch asserted before enable** — `:440-444`, immediately before the `enable-pij` command is written.

Two things tightened beyond the ruling, both worth noting: the diagnostic match moved from a regex (`/eventLog\.read deadline exceeded/`) to exact string equality against `` `eventLog.read deadline exceeded (${NATIVE_RPC_DEADLINE_MS}ms)` ``, so a wrong deadline value can no longer satisfy it; and the receipt now records `registration_elapsed_ms`, `held_after_registration_ms` and `budget_ms`, which is what let me check margins without instrumenting anything.

I confirmed `until` (`copilot-native-smoke.ts:271-283`) is a `do…while`, so a zero or negative remaining budget probes once and then throws `PIJ_NATIVE_TIMEOUT` — `Math.max(0, …)` at `:458` cannot spin or silently pass.

### Three bare runs

`just copilot-native-progress-smoke`, no flags, back to back. All exit 0.

| Run | Enable → registered | Registered | Exact-deadline hold | Registered → held | Budget | Elapsed | Exit |
|---|---:|---|---|---:|---:|---:|---:|
| 1 | 224 ms | 07:38:39.284Z | 07:38:54.289Z | **15,005 ms** | 45,000 ms | 80 s | 0 |
| 2 | 394 ms | 07:39:58.595Z | 07:40:13.599Z | **15,004 ms** | 45,000 ms | 79 s | 0 |
| 3 | 271 ms | 07:41:17.764Z | 07:41:32.768Z | **15,004 ms** | 45,000 ms | 80 s | 0 |

All three carried the exact diagnostic `eventLog.read deadline exceeded (15000ms)` with `holdKind: null` and `retryMs: null` — i.e. a hold, not a registration retry, which is also the round-1 bar-4b contract. Margin is now 30,000 ms instead of the ~5,000 ms that produced the round-1 failure, and it no longer competes with registration latency.

These numbers independently reproduce the report's three runs (15,002 / 15,001 / 15,016 ms), from a different worktree and a different hour.

### Mutation: is the import load-bearing?

The packet asked whether restating `20_000` still passes. It does — and that is the honest answer, not a reason to weaken the fix. I ran the triple that settles *why*:

| # | Mutation | Result |
|---|---|---|
| MUT-1 | `replacementBudgetMs = 20_000` (deadline unchanged) | **exit 0** — held 15,003 ms against `budget_ms: 20000` |
| MUT-2 | `replacementBudgetMs = 20_000` **and** `NATIVE_RPC_DEADLINE_MS = 25000` | **exit 1** |
| MUT-3 | shipped import **and** `NATIVE_RPC_DEADLINE_MS = 25000` | **exit 0** — held 25,002 ms against `budget_ms: 55000` |

MUT-2's receipt:

```json
{"status":"failed",
 "error":"PIJ_NATIVE_MEMORY_TIMEOUT: registered replacement explicitly holds an unresponsive SDK",
 "cleanup":{"owned_tmux_stopped":true,"owned_daemon_stopped":true}}
```

So: MUT-1 proves the literal is *currently* sufficient; MUT-2 proves it stops being sufficient the moment the runtime constant it shadows moves; MUT-3 proves the shipped form absorbs exactly that move, rescaling itself to 55,000 ms and still passing. The fix is drift-proofing, and the drift it proofs against is demonstrated rather than asserted.

That matters more than a margin argument. A restated `20_000` is not wrong today — it is a **silent** dependency on a number defined somewhere else, and the failure mode when that number changes is a red harness blamed on the product. The import turns that into a compile-time-visible relationship.

### The declaration file

`store.d.mts` exists because `harness/**/*.ts` is inside `tsconfig.json`'s `include` and the project has no `allowJs`, so the first TS consumer of a `.copilot` `.mjs` needs one. It declares one of the module's 18 exports.

That is a deliberate minimum rather than a lie, and it fails in the right direction: a future TS importer of another symbol gets "has no exported member" rather than a wrongly-typed value. If the constant were renamed in `store.mjs`, the import would become `undefined`, the budget `NaN`, and `until` would throw on its first probe — plus the exact-diagnostic assertion would never match. Loud, not silent. Worth one sentence in a future doc; not a finding.

## F3 — Copilot version prerequisite

`justfile:130-180`: both public recipes now delegate to `_copilot-native-pinned-smoke`, which resolves the launcher's version through `--prefer-version $COPILOT_VERSION --version` under `COPILOT_OFFLINE=true`, checks the installed runtime's `package.json` version, and only then launches the smoke with `--copilot-bin` / `--copilot-runtime-dir` pinned.

### Correction to the packet's expected result

The packet expects "both recipes on the machine default (1.0.85) exit 2 within seconds". **They do not, and should not.** On this machine the ambient npm-global launcher *can* select the cached pin:

```
$ copilot --version
GitHub Copilot CLI 1.0.85.
$ COPILOT_OFFLINE=true copilot --prefer-version 1.0.84-9 --version
GitHub Copilot CLI 1.0.84-9.
```

So the bare recipe prints `copilot-native-smoke: copilot resolved 1.0.84-9` and proceeds. This is the better outcome — the round-1 finding asked for "pin its runtime **or** fail fast", and the fix does the first, falling back to the second. The coder disclosed this precisely rather than letting the packet's framing stand: `fix-round-proof.json` records `"ambient": "Bare ambient launcher can select 1.0.84-9 using --prefer-version; without selection it reports 1.0.85."` I am recording the discrepancy so it is not read later as an unmet ruling.

### Refusal paths — five probes, all exit 2 in ≤1 s

| Probe | Command | Result |
|---|---|---|
| A | `COPILOT_BIN=<launcher that ignores --prefer-version, reports 1.0.85>` | `… resolved 1.0.85, expected COPILOT_VERSION=1.0.84-9; runtime drift is not a product failure` |
| B | `COPILOT_BIN=/tmp/s152/does-not-exist` | `… could not report version 1.0.84-9; select an installed native launcher with COPILOT_BIN` |
| C | `COPILOT_VERSION=1.0.83` (published, **not** cached) | `copilot resolved 1.0.85, expected COPILOT_VERSION=1.0.83; …` — refused, nothing downloaded |
| D | `--copilot-runtime-dir …/1.0.85` with a valid launcher | `…/1.0.85 does not contain COPILOT_VERSION=1.0.84-9` |
| E | `--copilot-bin` with no value | exit 2 |

Each is a single `PIJ_NATIVE_PREREQUISITE_VERSION:` line, and each fires **before** any tmux server, daemon or evidence directory is created — the round-1 complaint was a 90-second timeout that read like a product defect; this is under a second and names the cause.

Probe D matters most: it proves the runtime-metadata check is independently live rather than decorative, since the launcher check had already passed. Probe C is the "never downloads" case — an available-but-uncached version is refused rather than fetched.

### Cached selection, no downloads

`~/.copilot/pkg/darwin-arm64` fingerprinted before the first probe and after every probe and all seven full smoke runs:

```
0.0.412-2 1771542219    1.0.84-5 1789426615    1.0.84-7 1789453356
1.0.84-8 1789530125     1.0.84-9 1789530128    1.0.85 1789530132
```

Identical both times — same six directories, same mtimes, `1.0.84-9` still stamped 13:42:08 local, hours before this review. Nothing was downloaded, replaced or touched. `COPILOT_OFFLINE=true` on the version probe makes that structural rather than lucky.

I also hit the intended refusal by accident, which is the best evidence it works: my fresh worktree had no `pij-rs` binary, and the bare memory smoke stopped in 0.9 s with

```
PIJ_NATIVE_PREREQUISITE_BINARY: build the composed worktree with CARGO_TARGET_DIR=$PWD/target cargo build -p pij-cli --bin pij-rs
```

leaving `owned_daemon_stopped: true` and no started resources. Wrong-environment refusals are now actionable one-liners across the board.

## Contract sentence

Present, `docs/how/pij-rs-api.md:242-243`, in the receiver section:

> Startup hold is immediately visible in extension stderr; `pij state` exposes the receiver reason only after the unrenewed lease expires, up to 60 seconds later.

That is the round-1 caveat stated as a contract, in the right place and in the right terms — it names both surfaces and the bound between them.

## Provenance

`fix-round-proof.json` lists sha256 for the five files it claims to have changed. I recomputed all five against the checked-out tree: **5 match, 0 differ**. `reviewed_source` is recorded as `8df2bb0d` and `base_note` states `fc4e7c36` is a packet-only commit — so the proof does not quietly claim the product source was re-verified.

The report's fix-round section is candid in the same way as the original: it labels the SDK-enable phase "not a healthy-reload witness", keeps H1 unproved, states the Windows-focused stage still runs zero tests and points at `84ca47f6` on main rather than counting it here, and discloses two aborted preliminary invocations as **not** acceptance evidence.

## Fence

`1c290079` touches 8 files: 3 evidence/report, and 5 real —

| File | Change |
|---|---|
| `harness/scripts/copilot-native-progress-smoke.ts` | +64/−37, the F1 fix |
| `justfile` | +55/−4, the F3 prerequisite |
| `.copilot/extensions/pij/store.d.mts` | new, 1 line |
| `docs/how/pij-rs-api.md` | +2, the contract sentence |
| `.gitignore` / evidence | unchanged / additive |

No receiver, daemon or CLI source changed in this round, which is what "no product behaviour changed" should look like. Against merge-base `6b8d8504` the non-plan path set is unchanged from round 1 apart from `store.d.mts`.

## Gates — my checkout, warm

| Gate | Result |
|---|---|
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — 262 tests, **259 passed**, 3 skipped, 0 failed |
| `cargo test --workspace --no-fail-fast` | **exit 0** — **1135 passed**, 0 failed |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0**, zero errors |
| `just copilot-native-progress-smoke` ×3 (bare) | **exit 0, 0, 0** |
| `just self-check` | **exit 0** — 243 files / **5307 passed** / 22 skipped, smoke 11/11, `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001…)` |

Matches the report's claimed final gates exactly (259/3 native, 1135 Rust, 5307 Vitest).

### Two flakes seen, both traced, neither 152's

**`smoke: file-watch-notify ✗` on the first run in a fresh worktree.** Same cold-clone cause I logged on plans 151 and 153 — the captured pane shows `Cloning into '…/s152-r2/.pi/git/github.com/ghoseb/pi-askuserquestion'` while the 30 s idle window expires. `.pi/git/` is per-worktree, so every new worktree pays it once. Green on re-run.

**`cli.inbox.integration.test.ts` failed once under full-suite load**, and is worth naming precisely because the message looks alarming:

```
pij register → {"ok":false,"meta":"native Copilot registration refused:
  process observation failed or timed out: Ok(None)","error":"refused"}
expected { code: 4 } to match { code: 0 }
```

That is **not** the receiver observation this plan is about. It is host-process observation in `crates/daemon/src/registration.rs:1453`, which forks `/bin/ps` and gives it a hard **250 ms** wall-clock deadline; under 243 parallel Vitest files the fork can miss it, `try_wait` returns `Ok(None)`, and registration refuses. `registration.rs` has **zero commits** in `6b8d8504..1c290079` — last touched by `b3f8378c`, which predates the merge-base — and the file passed 17/17 twice in isolation and in two of three full self-check runs on this same tree.

Untouched code, unrelated subsystem, load-dependent. Not a blocker and not 152's, but a 250 ms budget for forking `/bin/ps` on a loaded machine is thin, and the refusal text points a reader straight at native registration. Worth a harness ticket alongside the `file-watch-notify` cold-clone one.

## Round 2 commands

```bash
git worktree add --detach …/pij-worktrees/s152-r2 1c290079 && node harness/scripts/worktree-deps.mjs
cargo build -p pij-cli --bin pij-rs
just copilot-native-progress-smoke                      # x3 bare, all exit 0
# MUT-1 replacementBudgetMs = 20_000                    → exit 0  (budget_ms 20000, held 15003)
# MUT-2 MUT-1 + NATIVE_RPC_DEADLINE_MS = 25000          → exit 1  PIJ_NATIVE_MEMORY_TIMEOUT
# MUT-3 shipped import + NATIVE_RPC_DEADLINE_MS = 25000 → exit 0  (budget_ms 55000, held 25002)
COPILOT_BIN=<forced-1.0.85 launcher> just copilot-native-memory-smoke     # exit 2, 0s
COPILOT_BIN=/tmp/s152/does-not-exist just copilot-native-progress-smoke   # exit 2, 0s
COPILOT_VERSION=1.0.83 just copilot-native-memory-smoke                   # exit 2, 1s
just copilot-native-memory-smoke --copilot-runtime-dir …/1.0.85           # exit 2
just copilot-native-progress-smoke --copilot-bin                          # exit 2
stat -f '%N %m' ~/.copilot/pkg/darwin-arm64/*          # before and after: identical
node --test .copilot/extensions/pij/*.test.mjs ; cargo test --workspace --no-fail-fast
cargo fmt --all --check ; cargo clippy --workspace --all-targets -- -D warnings ; just self-check
# every mutation restored immediately; git status --porcelain showed 0 tracked modifications after each
```

All seven smoke runs used isolated daemons on ephemeral ports with private `HOME`/Copilot/Claude homes and `tmux -L` sockets, and every receipt recorded `owned_tmux_stopped` / `owned_daemon_stopped` true. The production daemon was never contacted; the Copilot package cache was never written.
