# Plan 143 — post-compaction delivery report

Commit: `510b5bec10857ae9a972340602e7ee39a62bee06` on `143-omp-post-compaction-delivery`.

This is a post-commit, untracked delivery receipt so it can name the exact single implementation commit. Source, regression tests, how-doc/peer doctrine and supporting proof assets are in that commit. No push, PR, merge, production daemon restart, installed OMP modification, or global configuration change was performed.

## Acceptance and rulings

| Claim | Result / proof |
|---|---|
| AC1 | Compaction brackets suppress claims and resends. `session_compact` schedules a next-tick repoll even when no push callback ran; `turn_start`/`agent_end` retain the pushed-during-compaction fallback. The deterministic repoll witness fires from `session_compact` and claims within two ticks. |
| AC1a — prime ruling | Wall-time changed from 2s to **10s after session_compact**, with no human turn. Large live probe: first-running observation **+5.431s**, ACK **+5.458s**. One smaller probe with private `keepRecentTokens:1024`: **+45ms** and **+58ms**. This establishes size-sensitive timing, not its cause; no OMP event-loop tuning was attempted. |
| AC2 / AC2a — prime ruling | First observed `tool_result`, `turn_end` or `agent_end` schedules a single prompt resend after **BOUNDARY_RESEND_GRACE_MS = 1000**. Matching native consumption cancels it. Compaction postpones it. Subsequent attempts retain the 10s idle fallback; one shared counter caps all resends at 3. Healthy-steer and shared-budget controls pass. |
| AC3 | Heartbeat returns `{job_id,state}`; `running` renews only claim age, while recipient-owned `done`/`failed` is read-only. Terminal responses remove pending tracking without resend. A heartbeat also precedes every resend, avoiding replay after an external reader settles the job. Reclaim responses carry `running`; the parser accepts terminal `done` and existing parked rows. |
| AC4 | Required RED-first tests and controls retained; final runtime/client gate **108 passed**. Additional startup-peek/compaction race ran RED, then a pre-claim bracket guard closed it. |
| AC5 | Real OMP **18.1.14**, discovered/canaried **github-copilot/gpt-5-mini**, three seats launched from this worktree with its exact extension path. Isolated daemon **127.0.0.1:54905**, private HOME/state/tmux socket. Compaction mail and swallowed custom mail both ACKed automatically; busy prompt consumption observed with `isIdle() === false`. |
| AC6 | `docs/how/pij-rs-api.md` has the five-line “Compaction and resend” section and current heartbeat wire shape. The peer route's now-wrong “never resend while streaming” rule was replaced. |

The compaction check is a **one-directional safety interlock (brake)**: removing it can only permit more claims/resends. Existing parking is still a **policy**: it changes delivery outcome. Serial-per-seat queue semantics, three resend attempts, parked outcomes and control non-replay semantics remain unchanged.

## RED and gates

- [Initial extension RED](red-extension.txt): **7 failed**, including all four requested behavior/control cases, missed push callbacks, compaction-deferred resend and done-reclaim cleanup.
- [Boundary control RED](red-boundary-control.txt): **2 failed** — healthy steer draining during grace; one boundary resend with later idle retries.
- [Daemon RED](red-daemon.txt): **2 failed, 1 passed** — response lacked state; terminal heartbeat refused before the fix. Foreign/control/native authority control stayed passing.
- [Startup-race RED](red-startup-race.txt): one claim was made after startup peek crossed compaction start. The added guard prevents that claim until the bracket closes.
- [Intermediate extension migration](intermediate-extension-contract.txt) retains five old idle-only boundary expectations that failed under the new contract. Idle fallback cases now deliberately omit boundaries; boundary and shutdown transitions assert the new contract.

| Command (worktree cwd) | Result | Receipt |
|---|---|---|
| `just test .pi/extensions/pij/adapters/rust-runtime.test.ts .pi/extensions/pij/adapters/daemon-http.test.ts` | **108 passed**, exit 0 | [Final focused gate](extension-final-gate.txt) |
| `RUST_TEST_THREADS=4 CARGO_BUILD_JOBS=4 ~/.cargo/bin/cargo test --workspace` | **1,058 passed**, 85 suites, 8 ignored, exit 0 | [Full Rust log](cargo-test.txt) |
| `CARGO_BUILD_JOBS=4 ~/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 | [Static-check output](cargo-static.txt) |
| `~/.cargo/bin/cargo fmt --all -- --check` | Exit 0, no output | Same ordered static-check invocation |
| `just pij-skill-check` | All green, exit 0 | [Skill output](skill-gate.txt) |
| `VITEST_MAX_WORKERS=4 VITEST_MAX_THREADS=4 harness checks --json` | Exit 0; all **10 sensors ran**, zero skipped | [Final completion fields](harness-final-gate.txt) · [Prior complete envelope](harness-gate.json) |

The prior complete envelope reports nine pass results and one advisory warning; the final post-guard invocation also returned status:ok with all ten sensors run. Its long one-line tool display was truncated, so the final receipt preserves only observed fields, not a reconstructed per-sensor envelope. The canonical warning belongs to the existing branch commit `70556f6e5609c28647578e0ec6f8a6cdb2dbf037`: unresolved historical `Pij-Prime` attribution. No historical trailer was guessed or rewritten. Baseline `harness boot` typecheck passed but smoke timed out at 90s before source edits; the final full smoke sensor passes. One earlier Rust run failed the deliberately changed shared claim fixture's missing `state:running`; fixture reconciled, full workspace then passed.

The live proof preceded only the final one-line startup-peek guard. That new race has its own RED/green regression; the normal compaction, prompt-resend and daemon paths exercised live did not change afterward.

## Live evidence

[Launch arguments, cwd, binary SHA-256, seat incarnations and observer](live-launch.json) · [Computed summary](verification-summary.json).

Daemon binary SHA-256: `1a7c187040f7e92b1fde13ee41d9fe9f78660361b556d9f50ee27236094a5302`.

Exact daemon launch:

`target/debug/pij-rs --state-dir /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij143-proof-s1thfepd/state daemon --bind 127.0.0.1:54905`

HOME and CLAUDE_CONFIG_DIR were private proof directories; TMUX named the private socket. OMP used `--no-extensions -e <this-worktree>/.pi/extensions/pij/index.ts -e <temporary-observer.ts>`, avoiding accidental global-extension loading. Full exact busy-seat argv is in the launch receipt. All synthetic senders below are test addresses, not registered peer sessions.

**Claims emit no spine event.** Per prime's AC5 ruling, claim evidence is the read-only SQLite query and first-running observation, not an invented claim seq. A claim-event affordance is a follow-up, not scope.

`SELECT id,state,claimed_at,acked_at,attempt,lease_expirations FROM jobs WHERE dedupe_key = ?`

| Scenario | Message / job | Native boundary and claim | Real spine seqs |
|---|---|---|---|
| Large compaction | `134860e2-dbd8-462c-8b36-22e50c039d03`, job 1, seat `pij-detailed-veppers` | Before compact 1788926546988; end **1788926556655**; first running **1788926562086**; claimed_at **1788926562**; ACK at **1788926562113** | Push **5**; ACK **8** |
| One smaller compaction | `7930f005-a62d-4cc3-b8cc-2505bb15eee3`, job 2, seat `pij-fast-sturgeon` | End **1788926728828**; first running **1788926728873**; claimed_at **1788926728**; ACK at **1788926728886** | Push **11**; ACK **14** |
| Busy swallowed inject | `cfbe90ed-f7b8-49da-9462-a4327d8f14ae`, job 3, seat `pij-dusty-ermine` | First tool_result **1788926754831**; prompt message_start **1788926764642**, **idle:false**, before final agent_end | Push **15**; ACK **18** at **1788926764641** |

Compaction action was native `/compact`; sends occurred inside the observed `session_before_compact`/`session_compact` bracket. No human turn followed compaction to release either message. Large corpus used default keepRecentTokens 20000; the one smaller probe used only a per-run override of 1024. No claim was observed during the smaller bracket. [Large JSON](live-compaction-large.json) · [Large pane](compaction-large-pane.txt) · [Smaller JSON](live-compaction-small.json) · [Smaller pane](compaction-small-pane.txt).

Busy action: three separate `bash sleep 8` calls, each foreground. The process had **PIJ_TEST_SWALLOW_INJECT=1**. Native observer recorded **zero custom envelopes** for the id and exactly **one user envelope prefixed [pij resend 1]**, consumed while busy. The real prompt then waited for OMP's next drain boundary; the unit witness proves the first-boundary grace trigger rather than claiming native drain itself is immediate. The pane returned the requested nonce. A subsequent real heartbeat returned `{job_id:3,state:done}`. [Busy JSON](live-busy.json) · [Busy pane](busy-resend-pane.txt).

## Deployment, cleanup and harness handoff

Deploy the new daemon and refreshed extension together: the heartbeat response shape changed. Do not treat an installed OMP `/reload` as extension-code refresh. The test-only swallow flag must remain unset outside deliberate isolated proof. Compaction gating relies on the matching session_compact event; no new timeout silently closes an unended bracket.

Owned tmux server, all three proof seats and isolated daemon were stopped; the read-only DB handle was closed and the owned temporary proof directory removed. Hub's exit-1 client statuses are the expected result of deliberately stopping that private tmux server, not failed scenarios. No temporary executable or corpus remains in the repository. There is no changelog for this surface.

The engineering harness improved through compaction-window, startup-race, healthy-drain, terminal-state and shared Queue parity regressions. Existing fake/SQLite contracts still exercise real delivery authority; heartbeat never fabricates ReaderRead. Harness observations **DL-001/DL-002** remain in the ignored worktree buffer for prime-owned reconciliation; they were not cleared. This report preserves their substance: baseline smoke timeout, compaction fixture sizing and bracketed-paste timing. PRD/velocity/retros ledger ownership remains with the prime.

**Encoding offered:** a reusable isolated OMP delivery-smoke command that selects a small private compaction window, scrubs inherited spawn identity, waits for bracketed-paste processing and emits lifecycle/claim/ACK/pane evidence together. The new regressions already encode this change's failure modes; the reusable live driver is an explicit follow-up offer, not unfinished acceptance.

## Commit attribution

Derived immediately before commit by `pij-rs commit-trailers`:

```text
Pij-Seat: pij-practical-guanaco
Pij-Prime: pij-minor-unicorn
Pij-Plan: 143-omp-post-compaction-delivery
```


## Fix round

Fix commit: **`3fbd0a835bc7905b5274ef4fbeeee76ace3d24ac`** (separate commit; does not rewrite 510b5bec). This section supersedes the original report's unbounded-latch, coordinated-deployment and 1000ms-grace statements. The exact-SHA report remains an untracked post-commit receipt for prime-owned convergence.

### Findings and controls

- **F1:** `repollAfterCompaction` releases the latch at the first `session_compact`, `turn_start`, `agent_end`, or `message_start`, or at the wall-clock ceiling checked by the 1s ticker. `PIJ_COMPACTION_LATCH_MAX_MS` defaults to 120000ms. All releases capture `delivery.compaction-repoll`; ceiling releases identify `boundary:ceiling`. Claims remain suppressed before release. Four abort regressions cover the non-success exits; existing successful-compaction and in-flight startup-peek controls still pass.
- **F2:** `PijDaemonClient.heartbeatInbox` parses unknown input and accepts only a matching `job_id` plus `running|done|failed`. Legacy numeric data, missing state, and foreign-job terminal data mean no information. They produce a capture and preserve the ordinary idle resend/parking path, not the accelerated busy-boundary path. All three malformed/legacy cases reach three resends and then parking in the regressions.
- **F3:** The existing stream reconnect loop owns outage retries (250ms exponential base, 5s cap, existing jitter unchanged). `isReconnecting()` guards inbox polling, claims, heartbeat and ACK transport; the local idle resend path stays available. In `heartbeatPending`, `(!force || pending.heartbeatUncertain) && now - pending.lastHeartbeatAt < CLAIM_HEARTBEAT_MS` prevents failed/unknown forced probes bypassing the 20s throttle. `recoverPending` makes unknown authority use the full idle window. Only validated terminal authority drops tracking; parking/ACK reconciliation resumes when transport returns. Tests prove bounded heartbeat calls and zero inbox/heartbeat/ACK calls while reconnecting, with local delivery continuing.
- **F4:** Five real healthy busy-seat samples measured tool_result → matching custom message_start. Nearest-rank p50=**30ms**, p95=**139ms**; default grace is **max(2×139ms, 2000ms)=2000ms**, with `PIJ_BOUNDARY_GRACE_MS` override. A healthy-drain control consumes at 1999ms (the last millisecond inside that calibrated margin) without a prompt duplicate; a separate 3500ms override test exercises tick rounding. Later retries retain the 10s idle rule and the shared three-resend budget.

**Abort path modelled:** installed Pi `~/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`: manual compaction emits before at 1392, can throw on cancel at 1401 or after awaited compaction at 1431, and reaches session_compact only at 1442; catch emits internal compaction_end at 1470 without that extension success event. Auto-compaction cancellation returns at 1635 or 1672, again without session_compact. The regressions model precisely the open-without-success-event sequence; they are not represented as a live aborted-compaction run.

The latch is still a **one-directional safety interlock**, but now bounded: removing it permits more delivery. The explicit ceiling/other-boundary release trades indefinite stranding for possible delivery during a compaction that outlives the ceiling or continues after a release event. That is the requested F1 ruling, not a claim to observe upstream abort completion. The five-sample OMP p95 is local evidence, not a universal latency bound for every machine or Pi version.

### RED and final gates

| Evidence | Observed result |
|---|---|
| [F1–F3 RED](fix-red.txt) | 8 failed / 88 skipped before their production fixes |
| [F4 RED](fix-grace-red.txt) | 2 failed / 95 skipped before the grace change |
| [Focused final tests](fix-focused.txt) | 118 passed: runtime 98, daemon HTTP 20; exit 0 |
| [Complete canonical gate](fix-harness-gate.json) | harness checks --json exit 0; nine passes, one advisory, zero skipped |
| [Skill contract gate](fix-skill-gate.txt) | just pij-skill-check exit 0; [stderr](fix-skill-stderr.txt) |

The attribution advisory still concerns historical commit 70556f6e5609c28647578e0ec6f8a6cdb2dbf037 and its unresolved Pij-Prime. No attribution was invented or rewritten. Rust production/fixtures did not change in this round; the original workspace/clippy/fmt evidence above remains historical, not a newly run Rust gate. Readiness attempt `harness boot --full --json` refused E108 despite --help advertising --full; the complete final canonical gate passed.

### Live proof

OMP **18.1.14**, **github-copilot/gpt-5-mini**, seat **pij-reasonable-excuse**, private daemon **127.0.0.1:63186**. Healthy custom injection had no swallow flag. Five separate foreground `sleep 6` calls each received one mail while busy; all five matching custom starts had `idle:false`. Drain samples: **65, 27, 25, 30, 139ms**. Push/ACK seq pairs: **5/8, 9/12, 13/16, 17/20, 21/24**. Measurement preceded calibration; the subsequent outage probe loaded the final edited runtime. [Measurement, launch and observer](fix-live-drain.json) · [Healthy pane](fix-live-pane.txt) · [Actual spine/SQL rows](fix-live-spine.json).

**Final-code real outage smoke:** `PIJ_TEST_SWALLOW_INJECT=1`, message `f284054a-e7f8-471b-80bf-6cd330169074`, job **8**. SQLite observed running before stopping the private daemon at **1788928740694**. Prompt resend 1 reached native message_start at **1788928750929**, **10.235s after stop**, without a human turn or daemon response. The stored job remained running/unacked while the daemon was down. Restart began **1788928766524**; ACK seq **37** at **1788928769920** settled the job as done (attempt 0, lease_expirations 0). Push seq **34**. [Outage receipt](fix-live-outage.json) · [Outage pane](fix-outage-pane.txt). The receipt names two discarded setup probes; neither counts as offline proof. The observer's global-fetch replacement did not intercept the client's captured dependency: retry-frequency proof comes from deterministic tests, not that live hook.

Query: `SELECT id,state,claimed_at,acked_at,attempt,lease_expirations FROM jobs WHERE dedupe_key = ?`. The raw authority is retained locally at `/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij143-fix-a6tNrF/state/pij.sqlite` for read-only re-verification. Claims still emit no spine event.

### Cleanup and harness handoff

Only the owned private daemon and private tmux/OMP seat were stopped. Their exit-1 notifications reflect intentional teardown. Temporary observer/measurement/gate executables, session files, and private HOME/CLAUDE_CONFIG_DIR trees were removed; read-only SQLite handles were closed. Private authority and raw observer data remain outside the repo; credentials were not committed. Production daemon was not restarted. No push, PR or merge.

DL-001/002/003 were listed; the ignored buffer remains intact for prime-owned retrospective reconciliation. DL-003 records misleading boot help and the private-TMUX registration requirement. **Encoding offered:** promote the bounded isolated launcher/measurement approach into one repeatable delivery-proof command that verifies socket, health, seat, SQLite claim and native consumption before fault injection. The new abort/legacy/offline/margin regressions already encode the review's failure modes; that larger launcher remains an offer, not an acceptance dependency.

Fresh commit-time attribution came from `pij-rs commit-trailers` (stderr derivation: role=prime):

```text
Pij-Seat: pij-practical-guanaco
Pij-Prime: pij-minor-unicorn
Pij-Plan: 143-omp-post-compaction-delivery
```
