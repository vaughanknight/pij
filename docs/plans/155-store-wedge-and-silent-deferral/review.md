# Review: plan 155 — store wedge, silent deferral, hold collision, observer budget

Reviewer `pij-sunny-tarsier`. Range `62aba16f..6d46c110` (`21098074` code, `dda4d052` observer budget, `6d46c110` evidence), off main `10798fce`. Reviewed in a fresh detached worktree at `6d46c110` with worktree-local deps and a worktree-local `CARGO_TARGET_DIR`; a second worktree at `10798fce` supplied every RED control. Machine load ranged 25–67 on 16 cores throughout; every timing-sensitive result below says which.

## Verdict

**APPROVE-WITH-FIXES.** One blocking.

Both defects are genuinely fixed, both root causes are proven rather than asserted, and each defence is independently load-bearing under mutation. The coder also disproved the plan's own hypothesis for defect B with evidence and found the real cause — I reproduced that independently.

The blocking finding is a new one this plan introduced: the fix for *"a store call can hang forever"* ends the daemon's shutdown path with a wait that can itself hang forever. I reproduced it twice in nine runs on this branch, zero in six on main, and instrumented the exact mechanism.

| # | Severity | Location | Summary |
|---|---|---|---|
| F1 | **blocking** | `crates/store/src/migrate.rs:58-63` + `crates/daemon/src/lib.rs:226-228` | `close()` polls `pool.size() != 0` with no deadline; it is the last statement of `Daemon::shutdown()`. Observed `pool.size()=1` still checked out after `Pool::close()` returned, never decrementing. 2 hangs / 9 runs here, 0 / 6 on main, one hang ran 2 h 8 m. |
| F2 | should-fix | `crates/daemon/src/registration.rs:3145` | New `600ms` `ps` fixture leaves 400 ms of margin against the 1 s budget it tests; it failed in my workspace run at load 65 and passed 3/3 isolated. The plan's own report documents >1 s `ps` on this machine. |
| F3 | should-fix | `crates/store/src/queue.rs:722-725` | Event sampling is per *(job, reason)*, not per job. Measured: steady reason 720 attempts → 60 events; alternating `human-typing`/`composer-busy` → **720**. |
| F4 | report-only | `crates/daemon/src/delivery/mod.rs:1521,1570,1584` | Native inbox-pull holds return a reason to the caller but never increment the durable counter, so `pij state` shows no `delivery deferred:` line for that class. Different transport class from the incident; the receiver lease bounds it. Naming the coverage boundary, not asking for a change. |

---

## Bar 1 — the wedge cannot recur

### RED on main, with the production error string

I copied `crates/store/tests/cancellation.rs` unchanged onto `10798fce`:

```text
thread 'cancelled_custom_begin_never_returns_an_open_transaction_to_pool' panicked at
  crates/store/tests/cancellation.rs:36:5:
cancelled BEGIN must not poison the pool:
  Err(Adapter { adapter: "store", message: "attempted to call begin_with at non-zero transaction depth" })

thread 'cancelling_an_admitted_write_cannot_interrupt_commit' panicked at
  crates/store/tests/cancellation.rs:107:9:
assertion `left == right` failed: admitted INSERT must commit after caller cancellation; timeout=false
  left: 0
 right: 1

test result: FAILED. 0 passed; 2 failed.
```

That is the production message from `evidence/daemon-wedge-36206.txt`, reproduced from a cancellation, on main, by me. On `6d46c110` the same file is `ok. 2 passed`.

The first test earns its keep by construction: it pumps `begin_with` past its BEGIN acknowledgement, confirms `is_in_transaction()` **before** asserting anything, and only then checks that the next `begin_write` succeeds. It cannot pass by failing to poison.

### Two defences, each load-bearing, neither masking the other

| Mutation | `cancelled_custom_begin…` (pool guard) | `cancelling_an_admitted_write…` (ownership) | `disconnected_http_report…` (real HTTP drop) |
|---|---|---|---|
| none | pass | pass | pass |
| **A** — `after_release`/`before_acquire` deleted | **FAIL**, non-zero transaction depth | pass | pass |
| **B** — `owned_write` awaits inline instead of `tokio::spawn` | pass | **FAIL**, 0 events vs 1 | **FAIL** |

Mutant A restored `dirty=0`; mutant B restored `dirty=0`. This is the matrix the bar asked for: removing either defence reds only its own test, so neither is decoration and neither hides the other's absence. Mutant B is the stronger of the two because it also reds the real-`reqwest`-disconnect test — the exact production vector.

### Cancellation inventory, and one I checked myself

The report's inventory is: HTTP client disconnect; the `lib.rs` governance-observer `select!` around `follow_deliveries`; lifecycle scheduler and pane observer (await *inside* the selected branch); native inbox `timeout_at`/`select!` (event streams, not transactions); federation shutdown selects; registration timeouts; the new health waiter.

I enumerated the production `select!`/`timeout` sites myself rather than accepting the list. Three production `tokio::time::timeout` call sites are **not** named in the report — I read all three:

- `crates/daemon/src/background.rs:530` `await_runner_ready` — wraps `child.try_wait()` and `tokio::fs::remove_file`. No store transaction. Clean.
- `crates/daemon/src/http/decisions.rs:973` — `#[tokio::test]`, not production.
- `crates/daemon/src/pane_observer.rs:730,784` — `#[tokio::test]` helpers, not production.

And the two production `select!` sites in the delivery path:

- `crates/daemon/src/delivery/mod.rs:493` — `sleep_until` vs a change notification. No store work.
- `crates/daemon/src/delivery/mod.rs:1615` — event-stream `next()` vs a 500 ms sleep. No store work.

The one that matters is `crates/daemon/src/lib.rs:761`: `follow_deliveries()` genuinely can be dropped mid-await, and it genuinely can be awaiting a store write. That is the arm mutant B proves is now survivable. The inventory holds under spot-check.

---

## F1 (BLOCKING) — the shutdown drain can wait forever

`crates/store/src/migrate.rs:58-63`:

```rust
pub async fn close(pool: &StorePool) {
    pool.close().await;
    while pool.size() != 0 {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}
```

No deadline. `crates/daemon/src/lib.rs:226-228` makes it the last thing `Daemon::shutdown()` does, once per pool. If `size()` never reaches zero, `shutdown()` never returns.

The doc comment argues the wait is safe because "the pool is already closed: no new acquisition can prolong the wait". That reasoning bounds *growth*, not *termination* — it says nothing about a connection that is already checked out and never comes back, which is precisely the condition the same commit message says sqlx 0.8.6 produces (`is_closed=true, size=1`). The race was not closed; it was converted into a hang.

### Reproduction

`cargo test -p pij-daemon --test review_regressions` (14 tests, default parallelism, unmodified source):

| tree | runs | hangs | clean-run time |
|---|---|---|---|
| `6d46c110` | 9 | **2** (`rev-rr3`, `rev-rr6`, both blew a 300 s / 240 s ceiling) | 0.51–0.74 s |
| `10798fce` | 6 | **0** | 0.64–1.22 s |

`crates/daemon/tests/review_regressions.rs` is not in this range's diffstat, so the test is byte-identical on both trees; only the shutdown implementation beneath it changed.

It first surfaced as a 2-hour hang inside my `cargo test --workspace` gate. A `sample` of the stuck process showed the test thread parked in the tokio timer with a live `sqlx-sqlite-worker` thread — a sleep loop that never exits.

### Mechanism, instrumented

I replaced the loop with the identical loop plus a 5 s deadline and a diagnostic:

```text
REVIEWER-PROBE: store drain gave up after 5.008791s; pool.size()=1 still checked out
```

With the bound in place: 6/6 runs completed, but **4 of 6 sat at 5.5 s** — i.e. the drain routinely burns the whole ceiling before giving up. Unbounded, that is the hang. Source restored, `dirty=0`.

### Why this is blocking rather than a should-fix

This plan's own Rule for defect A is that a store wait is bounded, and AC3 is "store-bound calls answer or fail within a bound instead of hanging". The daemon's shutdown is the one path where an unbounded wait is worst: the incident's remedy was *"restarted 11:27 by prime"*. `pij daemon stop`, `daemon bounce`, and SIGINT all funnel into `Daemon::shutdown()`. A daemon that has wedged its store is exactly the daemon most likely to have a connection stuck checked out — so the failure mode selects for the moment you need the restart to work.

**Honest scope:** I reproduced this in a test binary running fourteen daemons in one process under load 25–65, not against a single production daemon. The *rate* in production is unknown. The *unboundedness* is certain from source, and 2/9 is not a rate I can call negligible. Suggested fix: give the drain a deadline and log/refuse on expiry, or — better — join the tasks the service already tracks for shutdown instead of polling `size()`, which is an inference about sqlx's bookkeeping rather than a fact about your own work.

---

## Bar 2 — health is honest

### RED on main

My own probe on `10798fce` (`crates/daemon/tests/s155_health_red.rs`), poisoning the pool exactly as the incident did:

```text
MAIN store write  -> HTTP 500 Internal Server Error:
  {"ok":false,"command":"pij report","meta":"store: attempted to call begin_with at non-zero transaction depth","error":"adapter"}
MAIN /health      -> HTTP 200 OK:
  {"ok":true,"command":"pij ping","data":{"status":"healthy",...}}
```

That is the incident's headline sentence — *"`/health` answered but every store-bound call hung"* — reproduced as a unit. Second probe, occupied pool:

```text
MAIN occupied-pool state after 6.001577542s: Err(reqwest::Error { kind: Request, source: TimedOut })
panicked: MAIN HUNG: no answer within the 6s client timeout
```

### GREEN here

```text
legacy-poisoned-pool health 503 Service Unavailable:
  {"ok":false,"data":{"status":"unhealthy","store":{"status":"unavailable","timeout_ms":2000}},
   "meta":"store: attempted to call begin_with at non-zero transaction depth","error":"adapter"}
saturated health=503 state=500 elapsed_ms=4009
HTTP client disconnected during INSERT; one report committed; store healthy
test result: ok. 5 passed.
```

`4009 ms` for two sequential 2 s waits is the bound doing its job, and `check_health` (`crates/store/src/status.rs:80-101`) proves schema *and* write-lock availability rather than merely answering — it opens a real `BEGIN IMMEDIATE` and rolls it back.

One thing worth naming: `health()` reads `state.services.status`, which is a separate adapter from `services.queue`/`services.spine`. In `build_services` they share a pool, so this is honest today; a future config that gives `status` a different backend would make `/health` honest about the wrong store. Not a finding — the composition is correct as shipped.

---

## Bar 3 — status never gates mail

### RED on main, with my own probe

`crates/core/tests/s155_status_red.rs` on `10798fce`:

```text
MAIN route(hold seat, reachable transport) = Ok(Queue(OperatorHold))
MAIN route_control(hold seat, reachable transport) = Queue(OperatorHold)
assertion failed: a status report must not revoke the inbox needed for the awaited ruling
  left: Ok(Queue(OperatorHold))
 right: Ok(Transport)
```

That is defect B's actual mechanism, on main, in one line: a seat that self-reported `hold` queued its own mail before any socket or composer was consulted.

### The plan's stated hypothesis was wrong, and I checked that myself

`plan.md` blamed the Claude 2.1.281 footer on the composer classifier. I ran the real gate against the captured panes at their recorded cursor:

```text
%486: InjectionVerdict { permitted: true, composer_idle: true, reason: None, draft_sha: None, ... }
%495: InjectionVerdict { permitted: true, composer_idle: true, reason: None, draft_sha: None, ... }
test result: ok. 1 passed.
```

The classifier accepted both panes. `crates/harnesses/tests/incident155.rs` keeps that as a fixture driven from `evidence/pane-*.txt` with the cursor parsed out of the capture, so it is a real regression rather than a restatement. Correcting the plan's own diagnosis with evidence, and keeping the disproof, is the right way to handle this.

### Grep receipt

Sweep of `crates/`, `.omp/extensions/pij/`, `.copilot/extensions/pij/` for `semantic_hold|semanticHold|OperatorHold|operator-hold` on the reviewed tree returns **four** hits, all benign:

- `crates/daemon/src/delivery/mod.rs:154` — field declaration.
- `crates/daemon/src/delivery/mod.rs:1300` — the sole construction site, literal `semantic_hold: false`.
- `crates/daemon/src/delivery/mod.rs:5236`, `http/native_tests.rs:3739,4081`, `.copilot/…/store.test.mjs:3364` — tests.

`OperatorHold` and `operator-hold` are **absent from the tree**. That matters more than a grep: deleting the `QueueReason::OperatorHold` variant (`crates/core/src/delivery.rs`) makes the removal compiler-enforced, so no delivery path can consult self-reported status without a build failure. The equivalent sweep against `10798fce` returns the live gate at `delivery.rs:289-290`, the conditional emission at `delivery/mod.rs:1236`, and `store.mjs:1259 if (!snapshot.semantic_hold) return true;` — the before picture, for contrast.

Still allowed and still present, correctly: the explicit per-job `/v1/hold` typing mechanism, the receiver lease/stale brake, native consent and native-target holds. None reads `semantic_state`.

`HeldEvent` (`crates/core/src/delivery.rs:17-26`) has no `job_id`, so the new `ProjectedHold.job_id.is_none()` filter at `http/mod.rs:2360-2379` separates sampled deferral events from explicit holds cleanly. No regression to `held[]`.

### Rolling compatibility — rerun, and mutated

Rerun of the compat proof with the genuinely unchanged main-checkout receiver:

```text
node-initial / node-resume:
  reportedState: "hold"
  moduleDigest: ecdce862aea71ce61e330aef79533e3c7fa431f5d0a3f5bb995de316edfe3475
  jobId: 1; messageId: cross-language-original-m1
  old host: %137-cross-old; resumed host: %137-cross-new
test result: ok. 1 passed.
```

I verified the digest independently: `ecdce862…` is both the file on disk at `/Users/jordanknight/pi-hacking/pij/.copilot/extensions/pij/store.mjs` and `git show 10798fce:` of the same path, before and after the run. The old module is really old and really unmodified. The reviewed tree's new receiver is `16a6020d…`, matching the SHA recorded for issue #429.

Then I made the compatibility field load-bearing instead of taking it on trust. **Mutant C** — `#[serde(skip)]` on `semantic_hold`, i.e. the daemon stops emitting it:

```text
NativeError: Native consent observation unavailable or invalid; receiving stopped without injection
  at DaemonClient.consentSnapshot (…/pij/.copilot/extensions/pij/store.mjs:255:10)
test result: FAILED.
```

Red at line 255 of the *real* old receiver. So "no paired cutover required" is proven, not asserted, and the removal gate in #429 is justified. Restored, `dirty=0`.

The new receiver never names `semantic_hold` at all, so absent / `false` / historical `true` are ignored identically — `.copilot/extensions/pij/store.test.mjs:3356-3393` covers absent and historical-`true` explicitly.

---

## Bar 4 — deferrals are observable, and what actually bounds the events

All four gate reasons funnel to one recorder. `TapUnowned`/`Unrecognized` → `retry_deferred` (`worker.rs:372`); `HumanTyping`/`ComposerBusy` → `release_held_body` → `retry_deferred` (`worker.rs:563`); transport-held → `record_deferral` (`worker.rs:274`); the native socket path → `publish_delivery_held` (`delivery/mod.rs:978`). `retry_deferred` records **before** `queue.retry`, and deliberately returns the diagnostic error after the retry so a diagnostic failure cannot strand a claim (`worker.rs:579-582`). Facts and the sampled event commit in one transaction (`queue.rs:704-762`).

`pij state` renders it in both surfaces: `crates/cli/src/main.rs:1802-1806` and `.omp/extensions/pij/core/generation-routing.ts:112-116`, both tested.

### The rate limit, measured rather than computed

I wrote a throwaway store-level probe against the real `SqliteQueue`, ran it, and deleted it:

```text
STEADY:      attempts=720 spine_events=60  durable_count=720 since_ms=1000000000000
ALTERNATING: attempts=720 spine_events=720 held_rows_in_spine=720
```

Steady reason, 5 s retry, one hour: **60 events**, durable count 720, `since_ms` pinned to the first deferral. That is the bar's question answered — ≤61/hour/job, a 12× reduction against the attempt rate, and the `×1029` count from the live incident is preserved exactly.

**F3.** The bound is per *(job, reason)*: `publish = previous != reason || elapsed >= 60_000` (`queue.rs:722-725`). A reason that alternates every attempt publishes every attempt — 720/hour/job measured. `human-typing` and `composer-busy` are exactly the pair that can alternate while a person types near the grace boundary, and the incident had eight jobs behind two seats. The incident's own reason was stable, so this does not weaken the fix for the observed defect; it means Rule 2's "rate-limited" is conditional in a way the contract does not say. Cheapest honest fix: sample on the job's event clock regardless of reason, and let the reason field carry the change.

**F4 (report-only).** The native inbox-pull holds at `delivery/mod.rs:1521`, `:1570`, `:1584` call `queue.retry(job_id, ZERO)` and return `held_reason` in the HTTP response without touching the durable counter. Not silent — the receiver sees the reason, and `native_receiver_reason` surfaces in `pij state` — but a reader looking for `delivery deferred: … ×N` will not find one for that class. Different transport from the incident and bounded by the receiver lease; recording the boundary so it is explicit. `worker.rs:637` (`backoff_held`) is likewise unrecorded but terminates at `HELD_ATTEMPT_LIMIT`, so it is not an unbounded silent retry.

---

## Bar 5 — the observer budget is a brake

Both limits are named production constants: `HOST_OBSERVATION_TIMEOUT = 5s` (`registration.rs:60`), `PROCESS_OBSERVATION_TIMEOUT = 1s` (`registration.rs:1518-1519`). Targeted suite: **72 passed, 0 failed**, including `native_ps_admits_a_600ms_observation_without_weakening_identity` and `native_ps_never_answering_refuses_with_pid_within_total_bound`.

### Brake or policy — settled by mutation, not by assertion

**Mutant D** — both budgets widened 600×, to 600 s each:

```text
test registration::tests::native_host_observation_has_a_wall_clock_bound ... FAILED
test registration::tests::native_ps_never_answering_refuses_with_pid_within_total_bound ... FAILED
test registration::tests::paneless_host_observation_has_a_wall_clock_bound ... FAILED
test result: FAILED. 69 passed; 3 failed.
```

Only the three tests that assert the bound itself changed verdict. **Zero** identity, ownership, continuity or admission tests flipped. Removing the check makes the operation slower to refuse and nothing else — which is the repo's own directional definition of a brake. Restored, `dirty=0`.

The start-time sandwich is unchanged, and not by inspection: `require_process` and `observe_identity` hash **byte-identical** across `62aba16f..6d46c110` (below).

### Only the timeout class became retryable

`registration.rs:1574-1593`, read in full:

```rust
Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(5)),
Ok(None) => { … break Err(RegistrationError::Retryable(format!(
        "process observation for pid {pid} timed out after {}ms", …))); }
Err(error) => { … break Err(native_refusal(format!(
        "process observation for pid {pid} failed: {error}"))); }
```

Every non-timeout outcome stays `native_refusal` → terminal HTTP 400: spawn failure, reader failure, >64 KiB output, and `!status.success() => Ok(None)` (process absent), which flows into the identity check and refuses terminally. A **dead** owner makes `ps` exit fast and non-zero; it can never reach the deadline branch. The three conversions in this range are exactly the three timeout sites — paneless host observation, native host observation, per-process `ps`.

The pre-existing non-timeout retryables (`Retryable("native owner changed during death observation…")` at `:515-527`, `Retryable("native session has multiple Pij addresses…")` at `:548-564`, and plan 151's `NativeSessionHold` at `:1277-1323`) are **untouched by this range** — no hunk falls in those spans. So this plan cannot turn a genuine foreign/dead-owner refusal into a retry loop.

### F2 — the new admission fixture is thin

`native_ps_admits_a_600ms_observation_without_weakening_identity` sleeps 600 ms against a 1 s budget: 40 % margin, in a real subprocess, with real spawn overhead. It **failed in my `cargo test --workspace` run at load 65**, then passed 3/3 isolated at 0.93 s / 0.80 s / 0.68 s — note that the whole *test* takes 0.68–0.93 s, so the margin at idle is already slim.

The plan's own report documents >1 s `ps` observations on this very machine, and the packet pre-authorised isolated reruns for exactly this class. But a gate that fails under the load its own report describes will get re-run, then ignored, then disbelieved when it finally catches something real. Derive the fixture sleep from `PROCESS_OBSERVATION_TIMEOUT` (e.g. 30 %), or assert admission with a short sleep and keep the boundary assertion where it already lives, in the virtual-clock tests.

---

## Bar 6 — timestamps, including sidecars

`crates/cli/src/daemon_log.rs:23-38` flushes Rust stdout/stderr, clones the original descriptors, then `dup2`s **fd 1 and fd 2** onto `UnixStream` writers; reader threads `read_until(b'\n')` and prefix each physical line with `OffsetDateTime::now_utc()` in RFC 3339 under one mutex (`:97-118`), preserving a final unterminated fragment (`:115-121`).

Working at the descriptor level is the right choice, and it is what makes the sidecar question answerable at all: **anything** in the process — or any child that inherits stdio — is captured regardless of which crate or language emitted it. There are exactly two escapes, and I checked both:

- Code that opens `daemon.log` by path: only `crates/cli/src/bounce/mod.rs:225-247`, which opens it *before* exec and hands the handles to the child as stdout/stderr. The child then wraps them. No emitter writes the log by path.
- Children with redirected stdio: `sidecars/src/background.rs:214-227` and `daemon/src/background.rs:139-170` send bg *command payload* output to a per-job `<id>.log`. That cannot create an untimestamped `daemon.log` line because it never touches `daemon.log`.

The four sources named in the incident all emit in-process on the daemon's own fd 2 and are therefore covered: telegram/chore/bg loop errors via `sidecars/src/common.rs:44-60` (all three started in-process at `sidecars/src/runtime.rs:66-75`), telegram diagnostics at `sidecars/src/telegram.rs:323,529-531`, drain at `daemon/src/lib.rs:486-492`, bg reconciliation at `daemon/src/lib.rs:780-789`. A sweep for `tracing::`/`log::`/`env_logger` across `crates/` returns nothing, so there is no alternate sink to miss.

Installation is daemon-foreground-only (`crates/cli/src/main.rs:652-660`, `Command::Daemon { action: None, .. }`), so ordinary CLI output is genuinely unchanged, as claimed.

The end-to-end regression is real: `crates/cli/tests/daemon_log.rs` launches an actual private daemon with a deliberately newline-bearing `CLAUDE_CONFIG_DIR` (`root.join("broken\nclaude-config")`) to force a *multi-physical-line* error, then asserts every line of the final log parses as RFC 3339 — not a sample, all of them. **1 passed.**

One honest note: `crates/sidecars/tests/sidecars.rs` `+36` is entirely `Queue` trait plumbing for the two new methods — it adds no timestamp assertion. The sidecar coverage is architectural (descriptor-level capture) plus the E2E all-lines assertion, not a test that forces a telegram/chore/bg/drain line specifically. That is adequate given the mechanism, and the report never claims otherwise.

---

## Bar 7 — fence

Changed **production** lines in `crates/daemon/src/registration.rs` across the whole range, exhaustively: the two new constants; `Duration::from_secs(2)` → `HOST_OBSERVATION_TIMEOUT` at two sites with their refusals reclassified; extraction of `read_native_process_using` so a `Command` can be injected; `250ms` → `PROCESS_OBSERVATION_TIMEOUT`; the timeout branch gaining kill/reap, the pid, and `Retryable`; the pid added to the failure message. Nothing else.

Function-level hashes across `62aba16f..6d46c110`:

```text
fn registration_target           old=763f3ca40561e514 new=763f3ca40561e514 lines=44   IDENTICAL
fn check_native_roster           old=4c446d99b4cf9a0a new=4c446d99b4cf9a0a lines=138  IDENTICAL
async fn register_inner          old=e13ec34c41925ae1 new=e13ec34c41925ae1 lines=562  IDENTICAL
async fn require_process         old=8073978c6c78e2ad new=8073978c6c78e2ad            IDENTICAL
async fn observe_identity        old=000317d2f1d56eef new=000317d2f1d56eef            IDENTICAL
fn parse_native_process          old=bb1468b460d5fce3 new=bb1468b460d5fce3            IDENTICAL
fn native_refusal                old=b1dc8d0482f00d80 new=b1dc8d0482f00d80            IDENTICAL
fn retired_refusal               old=59f1b7856cd34095 new=59f1b7856cd34095            IDENTICAL
```

`register_inner` contains the continuity ladder in full (562 lines, byte-identical), so plans 151 and 154's admission order and authority are untouched. The refusal constructors are identical too, which is what makes the retryability argument above airtight: only the three call sites changed class, not the classes themselves.

---

## Bar 8 — gates on my checkout

| Gate | Result |
|---|---|
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — 259 tests, 256 passed, 3 skipped, 0 failed |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0**, zero errors |
| `cargo test --workspace` | **not certifiable on this sha** — see below |
| `just self-check` (cold) | exit 1 — `smoke: file-watch-notify ✗` |
| `just self-check` (warm) | **exit 0** — 244 files / **5308 passed** / 22 skipped, windows-compat all stages, smoke all ✓, `✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001…)` |

Targeted suites, all green on my checkout: store cancellation 2/2; daemon `store_wedge` 5/5; `incident155` 1/1; registration 72/72; `daemon_log` 1/1; CLI deferral rendering 1/1; cold-resume compatibility 1/1.

**The workspace gate is the one claim I cannot reproduce.** The report records `exit 0 — 1183 reported passes across 92 result summaries`. My attempts:

- `RUST_TEST_THREADS=1`: killed at 3600 s, 31 of ~92 summaries, load 67.
- default parallelism: 26 summaries, 617 passed, 1 failed (`native_ps_admits_a_600ms…`, F2, passes isolated).
- default parallelism `--no-fail-fast`: 45 summaries, **728 passed, 0 failed**, then hung for 2 h 8 m in `review_regressions` and was killed — that hang is F1.

So: everything that ran, passed. But a suite that hangs 2/9 cannot be certified green, and the hang is a product defect rather than an environment one. Fixing F1 should make this gate reproducible.

`file-watch-notify` in the cold run is the known per-worktree flake, not this plan's: the captured pane shows `Cloning into '…/s155-rev/.pi/git/github.com/ghoseb/pi-askuserquestion'` while the 30 s idle window expires. Fourth consecutive plan where a fresh worktree pays this once; green on the warm rerun. Worth a harness ticket to pre-seed `.pi/git/` in `worktree-deps.mjs`.

---

## What I thought was good

The honesty is unusually load-bearing here, not decorative. The report states plainly that the old log has no timestamps and therefore *"does not prove which production request triggered the incident"* — it would have been easy and unfalsifiable to claim otherwise. It labels the SDK boundary as simulated while everything else is real. It records that the classifier hypothesis in `plan.md` was wrong and shows the receipt. And the fix for defect B is a deletion: no new "operator mailbox hold" field was invented to replace the one being removed, because none existed. Removing a veto without inventing a replacement veto is the harder and better call.

The two-defence structure for defect A is the right shape: remove the cause *and* make the pool boundary self-healing, with each independently provable. My mutation matrix is a stronger statement of that than either test alone.

---

## Commands

```bash
git worktree add --detach …/pij-worktrees/s155-rev  6d46c110 && node harness/scripts/worktree-deps.mjs
git worktree add --detach …/pij-worktrees/s155-main 10798fce   # RED controls
cp …/s155-rev/crates/store/tests/cancellation.rs …/s155-main/crates/store/tests/   # RED, both tests
#  + s155_health_red.rs (mine)  -> main: /health 200 healthy on a poisoned pool; 6s hang on an occupied one
#  + s155_status_red.rs (mine)  -> main: route(hold seat) = Ok(Queue(OperatorHold))
# MUTANT A  delete after_release/before_acquire        -> 1 red  (pool guard only)
# MUTANT B  owned_write awaits inline                  -> 2 red  (ownership only, incl. real HTTP disconnect)
# MUTANT C  #[serde(skip)] semantic_hold               -> red at old store.mjs:255 (compat field is load-bearing)
# MUTANT D  both observer budgets ×600                 -> 3 red, all bound-assertions; 69 pass (brake, not policy)
# MUTANT E  bound close()'s drain at 5s                -> 0 hangs/6; 4 runs sit at the 5s ceiling
#           instrumented: "store drain gave up after 5.008791s; pool.size()=1 still checked out"
cargo test -p pij-daemon --test review_regressions     # x9 here: 2 hangs;  x6 on main: 0
cargo test -p pij-store --test cancellation ; cargo test -p pij-daemon --test store_wedge
cargo test -p pij-harnesses --test incident155 ; cargo test -p pij-daemon --lib registration::
cargo test -p pij-cli --test daemon_log ; cargo test -p pij-cli --bin pij-rs state_exposes_delivery_deferrals
PIJ_NATIVE_RUNTIME_MODULE=…/pij/.copilot/extensions/pij/store.mjs \
  cargo test --locked -p pij-daemon --test native_runtime_cold_resume -- --ignored
node --test .copilot/extensions/pij/*.test.mjs ; cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings ; just self-check
# every mutation and probe file restored/removed; `git status --porcelain` empty after each
```

Production daemon never contacted; every daemon in every probe was private and ephemeral. Both review worktrees removed.

---

# Round 2

Range `8eef0985..99d95fc2`, one commit. Fresh detached worktree at `99d95fc2`, worktree-local deps and `CARGO_TARGET_DIR`. Machine load ran 39–86 on 16 cores throughout; the build itself landed at load 85.66. Every result below states its load, and nothing is counted from a rerun that isn't disclosed.

## Verdict

**APPROVE.** All four findings are fixed, each with a probe I ran myself, and the workspace gate I could not certify in round 1 now completes clean. Three report-only observations follow; none blocks.

The F1 fix is the interesting one, and it is better than the minimum I asked for: rather than only bounding the pool drain, it puts one named deadline across *both* the tracked-work join and both pool closes, so shutdown as a whole has a ceiling instead of each piece having its own. The API doc states the cost of that honestly — "an expired drain cannot promise their completion" — which is the part that would have been tempting to leave out.

| # | Severity | Location | Summary |
|---|---|---|---|
| R2-1 | report-only | `crates/daemon/src/lib.rs:239-247` | The expiry line reports `size - num_idle`, but the drain loop waits on `size() != 0`. In the only expiry mode I could actually observe, sqlx reports `size=1, num_idle=1`, so the line prints `0`. |
| R2-2 | report-only | `crates/core/src/delivery.rs:126` | `reason_changes` has no reader anywhere in the repo. |
| R2-3 | report-only | `docs/how/pij-rs-api.md:383-391` | The F4 coverage boundary is recorded in `report.md` but not next to the deferral-source enumeration that implies the opposite. |

---

## F1 — the shutdown drain has a named deadline

### The bound, measured by my own probe

I wrote my own test rather than rerun theirs. It leaks every lease both live pools can grant, never returns them, and measures wall-clock across `shutdown()`:

```text
REVIEWER-PROBE leaked 2 leases; s0_size=1 s1_size=1
pij-rs shutdown drain expired after 5000ms; spine_checked_out=1 background_checked_out=1; continuing shutdown
REVIEWER-PROBE shutdown returned after 5.095121125s; outcome_ok=false
test store_shutdown_tests::reviewer_shutdown_bound_with_leaked_leases ... ok
```

`SHUTDOWN_DRAIN_TIMEOUT` + 95 ms, at load 43, with the leases never coming back. Round 1's equivalent condition ran 2 h 08 m.

One note on my own probe, because it changed what it proves: my first version asserted `shutdown().unwrap()`, and it failed — starving *every* lease also starves the daemon's own background reconciliation, so `shutdown()` returns `Err(... pool timed out while waiting for an open connection)`. That is my fixture being more hostile than reality, not a defect: the deadline still fired at 5000 ms and shutdown still returned. I rewrote the probe to assert the bound and report the outcome separately (`outcome_ok=false` above) rather than quietly weaken the scenario.

### MUTANT F — the deadline is load-bearing

Reverting `migrate::close` to the round-1 shape (ignore the deadline parameter, poll `size()` forever):

```text
MUTANT F applied
test store_shutdown_tests::shutdown_drains_detached_sql_before_returning ... ok
test store_shutdown_tests::shutdown_returns_with_connections_never_returned ... FAILED
REVIEWER-PROBE leaked 2 leases; s0_size=1 s1_size=1
test store_shutdown_tests::reviewer_shutdown_bound_with_leaked_leases has been running for over 60 seconds
```

Their new test fails, my probe hangs to the 240 s ceiling, and the *normal* drain test still passes — so the new test discriminates the bound specifically rather than the drain generally. Restored, `dirty=0`.

### Repeat runs

`cargo test -p pij-daemon --test review_regressions`, default parallelism, unmodified source, **12 consecutive runs at load 76**:

| | round 1 (`6d46c110`) | round 2 (`99d95fc2`) |
|---|---|---|
| runs | 9 | 12 |
| hangs | 2 | **0** |
| 14/14 passed | 7 | 12 |

Nine runs finished in 0.59–0.78 s; three took 5.59–5.64 s and printed the expiry line. That 5.5 s tail is the deadline being spent, and the coder disclosed it unprompted ("this receipt does not claim zero drain expiries") rather than presenting 20 green runs as if nothing fired. Correct call — it is what led me to R2-1.

### R2-1: the line reports a different quantity than the loop tests

The drain waits on `size() != 0`. The expiry line prints `size() - num_idle()`. Those disagree in exactly one case, and it is the case that actually happens. I added a temporary raw dump next to the existing line and ran until expiries appeared — twice, byte-identical:

```text
REVIEWER-PROBE raw: admitted_err=false spine_closed=false background_closed=true \
  s0_size=1 s0_idle=1 s1_size=0 s1_idle=1
pij-rs shutdown drain expired after 5000ms; spine_checked_out=0 background_checked_out=0; continuing shutdown
```

So: the tracked-work join was fine (`admitted_err=false`), the background pool closed, and the spine pool's drain expired holding `size=1` — while simultaneously reporting that connection as **idle**. That is precisely the sqlx 0.8.6 over-release bookkeeping the code's own doc comment describes. `1 - 1 = 0`, so the operator-facing line reads `spine_checked_out=0 background_checked_out=0`: an expiry that reports nothing was holding anything.

Across 20 runs of `review_regressions` I observed 5 expiries, **all** printing `0/0`. The count is accurate when a lease is genuinely held — my leaked-lease probe printed `1/1` — but the genuine-leak case is the one I had to construct, and the phantom case is the one that occurs on its own. Cheapest fix: print what the loop actually waited on (`size`, or `size` and `num_idle` both). Report-only: shutdown completes, the line fires, the deadline works; only its payload is uninformative. Instrumentation removed, `dirty=0`.

### Your explicit question: joins or polls?

**Both, in that order** — and the deadline does make the polling acceptable.

`Daemon::shutdown` now joins the work it owns first (`delivery.flush()`, `event_bus.flush()`) inside `timeout_at(deadline, …)`, then runs both `migrate::close` calls against the *same* deadline. The polled `pool.size()` loop survives only as the fallback for standalone `owned_write` tasks, which have no registry to join.

That is the right trade. Adding a write-admission registry would put global mutable bookkeeping on every store write to buy something only shutdown consumes — and round 1's defect was caused by trusting a derived signal (`size()`) as a liveness dependency, not by polling as such. With the deadline the poll is demoted from "the thing shutdown waits on" to "a witness we consult until the clock runs out", which is the correct status for a number sqlx does not guarantee. R2-1 is the residue of that same distrust: since `size()` is only a witness, the log should quote it rather than arithmetic derived from it.

Two consequences worth stating plainly, both already in the API doc: a slow-but-legitimate flush now eats the same budget the pool close needs, and on expiry the flush's error is dropped rather than returned (`if let Ok(admitted) = admitted`). Both are the intended cost of "stop must terminate", and the doc says so in the sentence about not promising completion.

---

## F2 — fixture derived from the budget

`PROCESS_OBSERVATION_TIMEOUT.mul_f64(0.3)` — 300 ms against the 1 s production limit, both limits unchanged (1 s per process, 5 s per host). Margin goes from 40% to 70%, and the test is renamed off the hardcoded number, so the next budget change can't leave a lying test name behind.

**10/10 runs, load 41–53**, 0.34–0.39 s each. The whole test now finishes faster than the old fixture's sleep alone. Round 1's failure was at load 65; this has room.

---

## F3 — sampling is per job, and I pushed it past the ask

You asked for alternating reasons over an hour at 5 s. I ran that, plus two cases the fix could plausibly have missed, counting `spine_events` rows directly rather than trusting returned values:

```text
STEADY:            attempts=720 returned_events=60 spine_rows=60 durable_count=720 since_ms=1000
ALTERNATING:       attempts=720 returned_events=60 spine_rows=60 durable_count=720 since_ms=1000
EVERY-ATTEMPT-NEW: attempts=720 returned_events=60 spine_rows=60 durable_count=720 since_ms=1000
RESTART-EVERY-30s: attempts=720 reopens=120 spine_rows=60
```

- **ALTERNATING** was 720 in round 1 and is 60 now — the finding is closed.
- **EVERY-ATTEMPT-NEW** gives all 720 attempts a *distinct* reason, the worst input the sampler can receive. Still 60.
- **RESTART-EVERY-30s** reopens the store 120 times across the hour. Still 60 — so the sampling checkpoint really is durable, not process-local. That is what migration 0022 plus the pre-existing `deferral_event_at_ms` buy, and it is the case where a naive fix would have leaked 120 events.

Durable `count=720` and `since_ms=1000` are preserved in every case, so the diagnostic did not get cheaper by losing facts. The coder's own test additionally pins `reason_changes == 12` on later samples, which is arithmetically right for 12 alternations per minute. Probe deleted, `dirty=0`.

Contract updated in all three places that state it: `delivery.rs:100-101`, `ports.rs:389-390`, and `docs/how/pij-rs-api.md:385-389`. No stale "reason transitions emit immediately" survives — I grepped.

**R2-2 (report-only).** `reason_changes` is emitted and never read: no consumer in `crates/`, `.omp/extensions/pij/`, or `.copilot/extensions/pij/` outside tests. Harmless, and the spine is a durable record whose value doesn't depend on a renderer existing. But the trade F3 makes is "transitions no longer interrupt the clock, they get summarized in the next sample" — and today that summary is only reachable by reading raw spine payloads, since `pij state` renders the current reason and count only. If the transition signal was worth keeping, something should surface it.

The projection is genuinely unchanged: `ProjectedHold` (`http/mod.rs:2360-2365`) has no `deny_unknown_fields`, so the added field is ignored, and sampled events are still excluded by `job_id.is_none()`. `HeldEvent` still deserializes from the sampled payload via `#[serde(flatten)]`, so nothing in `held[]` shifted.

---

## F4 — coverage boundary

Present, `report.md:260-262`: native inbox-pull holds and `backoff_held` do not increment the durable counter; native holds return reasons and are lease-bounded, `backoff_held` terminates at `HELD_ATTEMPT_LIMIT`. Accurate, and correctly labelled "no behavior change" — I asked for the boundary to be named, not closed.

**R2-3 (report-only).** It lives in the plan report. The sentence that creates the wrong impression lives elsewhere: `docs/how/pij-rs-api.md:389-391` enumerates "Deferrals include composer safety, missing binding/pane/transport, pending consent, and transport errors" with no exclusions, and that doc outlives the plan. One clause there would put the boundary where someone will actually hit it.

---

## Gates, all on my checkout

| Gate | Result |
|---|---|
| **`cargo test --workspace`** | **exit 0 — 92 result summaries, 1185 passed, 0 failed, 166 s, no hang** |
| `cargo test -p pij-daemon --test review_regressions` ×12 | 0 hangs, 14/14 each |
| `registration::tests::native_ps_admits_a_delayed_observation…` ×10 | 10/10, 0.34–0.39 s |
| `cargo test -p pij-store --test queue -- deferral` | 4 passed |
| `alternating_deferrals_emit_at_most_sixty_events_per_hour` | passed |
| `cargo fmt --all --check` | exit 0 |
| `cargo clippy --workspace --all-targets -- -D warnings` | 0 errors |
| `node --test .copilot/extensions/pij/*.test.mjs` | exit 0 — 259 tests, 256 pass, 0 fail, 3 skipped |
| `just self-check` (cold) | exit 1 — `file-watch-notify ✗` only |
| `just self-check` (warm) | **exit 0** — 244 files / 5308 passed / 22 skipped, windows-compat all portable stages, 11/11 smokes ✓, `snapshot-check: briefing.md SHA matches (cdf5f5b25001…)` |

The workspace gate is the headline: round 1 could not certify it because it hung, and it now completes in 166 s with 1185 passes and zero failures — matching the coder's reported figure exactly, independently reproduced at load 47.

The cold `file-watch-notify` failure is the same per-worktree flake as the last four plans, and the captured message names the cause outright: `waitIdle timed out after 30000ms` with `Cloning…` still in the last 800 bytes. Green on the warm rerun. Still worth a harness ticket to pre-seed `.pi/git/` in `worktree-deps.mjs`; it has now cost five sessions one wasted self-check each.

No isolated rerun was needed to reach any verdict above — every count is from an unmodified run at the stated load. Mutation and instrumentation were reverted and `git status --porcelain` verified empty after each. Production daemon never contacted; every daemon was private and ephemeral.

```bash
git worktree add --detach …/pij-worktrees/s155-r2 99d95fc2 && node harness/scripts/worktree-deps.mjs
# my own probe: leak every lease, never return it, measure shutdown  -> 5.095121125s
# temporary raw dump beside the expiry line                           -> s0_size=1 s0_idle=1 (twice)
# MUTANT F: migrate::close ignores the deadline                       -> their test FAILED, my probe hung to 240s
# my own sampling probe (steady / alternating / 720 distinct / 120 restarts), counted from spine_events
for i in $(seq 1 12); do cargo test -p pij-daemon --test review_regressions; done   # 0 hangs
for i in $(seq 1 10); do cargo test -p pij-daemon --lib registration::tests::native_ps_admits; done
cargo test --workspace   # exit 0, 1185 passed, 0 failed, 166s
cargo fmt --all --check ; cargo clippy --workspace --all-targets -- -D warnings
node --test .copilot/extensions/pij/*.test.mjs ; just self-check
```
