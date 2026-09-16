# Plan 152 — receiver observation progress

**Implementation:** `d232e7ea01a438dea98db5618471b3ce49dbdb97`  
**Proof base:** `b715be4f74dccacf86883d6aedcc30c91738fd07` (plan packet atop `cf08eacd`, plan150 merged).  
**Verdict:** required gates and isolated AC5 **PASS**. The original production mechanism remains **unpinned**; the SDK-enable stall below is a **candidate H1**, not a proven explanation. No production lifecycle/extension changes, global linking, rebase, push, PR or merge. Prime owns upstream composition.

## Implemented contract

| AC | Result |
|---|---|
| AC0 | Actual isolated abort/model-picker sequences and a large-session repeat; read timing captured. Natural koi stall not reproduced. Exact differences and candidate below. |
| AC1 | `NATIVE_RPC_DEADLINE_MS=15000` bounds `eventLog.tail/read`, `queue.pendingItems`, `metadata.isProcessing` and `native.send`; misses log call-specific `receive-held`. Late proof cannot ACK/reinject; ambiguous send intent survives. |
| AC2 | Three empty reads plus an independently moved tail trigger bounded backward recovery; probe interval is at least 1000ms. Forward and backward cursors never mix. Inaccessible gaps hold. Correlated foreground abort closes only its consumed native turn, not model success or a differently identified resubmission. |
| AC3 | Actual `observed_at`/`observed_seq`, not timer ticks. Frozen outstanding work never extends the last-progress lease; K=3 uses daemon-clock opportunities, not request bursts. State/inbox and both CLI renderers expose the reason. Existing parked vocabulary is unchanged. |
| AC4 | Normal exit/shutdown records one `receiver-stopped` with cause and outstanding job/message identity. Recycle distinctions below are regression-protected. |
| AC5 | 105 MB real native session: controlled stale-cursor recovery, next native acceptance, actual SDK disable, expiry, visible reason and actual Copilot shell manual recovery passed. Extra SDK-enable probe ended explicitly held, not falsely healthy. |
| AC6 | Updated [API contract](../../how/pij-rs-api.md#native-copilot-receiver-lease-and-manual-recovery) and [native operator guide](../../how/copilot-native-extension.md#receiver-memory-and-emergency-manual-pull). |

Replacement ordering is **register identity → bounded SDK observation → first heartbeat/watch → claims**. A failed startup observation retains the registered outgoing tool. A same-host replacement may reset its local sequence only with a newer observation timestamp. Fast historical replay no longer invents one millisecond per event; a changed heartbeat alone receives a one-tick adjustment when needed for clock rollback.

## RED before GREEN

[Compact command/receipt ledger](proof.json). Failures below are behavioral, not compiler failures.

| Probe | RED output | GREEN |
|---|---|---|
| Frozen pre-fix JS modules | 26 tests: **24 failed / 2 passed**, exit 1; deadline cases: `the native hang must not renew silently forever: 0 !== 1` | Final native gate: **245 tests / 242 passed / 3 Linux skips** |
| Genuine pre-fix Rust daemon, valid old heartbeat payload | Three renewal opportunities with no observations: **live, live, live, live**, lease **3000,3000,3000,3000**, original job unparked; `'live' !== 'stale'`, exit 1 | Same isolated HTTP probe with progress fields: **live,live,live,stale**; remaining lease **3000,1892,791**, then parked original job; exit 0 |
| Delete only frozen-renewal guard | `a frozen heartbeat must not add another lease before K`: **60000 versus 40000**, exit 101 | Restored HTTP/SQLite regression passed; mutation restored in `finally` |
| Human `pij state` | `pij-copilot: idle · active` lacked `native-receiver-stale`, exit 1 | Renderer suite **47/47**; both actual CLI surfaces passed in AC5 |
| Correlated abort before picker resubmission | Completion event **undefined versus owned-abort**, exit 1 | Native turn released, original ACK count unchanged, no reinjection |
| Same-host local-counter reset | Fresh observation refused: **HTTP 400 versus 200**, exit 101 | Newer observation permits local-sequence restart; sequence alone does not renew |
| Fast 100k-event replay | `replay watermark 199999 exceeds actual time 101000`, exit 1 | Actual-time watermark, overlap dedup and rollback tests passed |
| No receiver reconnects after daemon boot | State reason **null versus native-extension-unavailable**, exit 101 | Real-host HTTP projection stays diagnostic after parking; no fictitious observation evidence |
| Healthy replacement starts with stale lease | `receive-held` array versus **[]**, exit 1 | SDK observation precedes first renewal; outgoing survives startup read failure |

The three-second lease above belongs only to the isolated old/new daemon **protocol comparison** with inert process fixtures. Live AC5 used the unchanged **60-second** lease.

The optional real chooser/client/bridge/journal + HTTP/SQLite cold-resume contract passed explicitly: **one simulated native acceptance, zero reinjection**. Its obsolete live-old-process veto was removed because plan149 intentionally permits verified same-native-session fast restart without consulting that old process. Registration implementation and plan151 retry paths were not changed.

## AC0 — what was and was not reproduced

- Official **1.0.84-8** ran unchanged baseline and then instrumented baseline receivers. Both accepted the next delivery after a real model-picker change. Instrumented reads: **7 started / 7 settled, 0–1 ms**, event counts **0,3,0,0,0,0,3**, all `cursorStatus:"ok"`.
- `Esc` did not abort the blocked, non-streaming local fixture request; actual `Ctrl-C` produced `abort {reason:"user_initiated"}`. The real `/model` picker then changed the named provider model. This is not an Esc-success or real-provider inference claim.
- The closer **1.0.84-9**, `gpt-6-astra` → `gpt-5.6-sol-fast` attempt sent Esc during the injected turn. Its picker queued the switch while that fixture turn was blocked; the exact production resubmission shape was not reproduced.
- Size repeat on **1.0.84-9**: **105,037,242 bytes / 25,010 events**, baseline address-preserving resume, injected turn, actual abort/model-picker and next acceptance. **7/7 reads settled in 0–1 ms**: healthy reads of this large session did not approach 15 seconds.
- [Production observations](production-observations.json) retain the actual original/resubmitted native IDs. The current koi journal preserves the pre/post-abort chain. Without an incident-time inode/length snapshot, a prior rewrite is neither proved nor ruled out; `rewind-file-snapshots` indexes workspace-file backups.

Evidence: [unchanged baseline](evidence/ac0-registry/summary.json), [instrumented baseline](evidence/ac0-instrumented/summary.json), [exact -9 attempt limitation](evidence/ac0-runtime9/summary.json), [large baseline receipt](evidence/ac0-large/summary.json), [large-session SDK read log](evidence/ac0-large/native-read.txt).

## AC5 — real isolated host, controlled H2 boundary

```sh
just copilot-native-progress-smoke --large-history --inject-empty-cursor --copilot-bin "$HOME/.local/bin/copilot" --copilot-runtime-dir "$HOME/.copilot/pkg/darwin-arm64/1.0.84-9"
```

The fixture hides callbacks and returns empty pages at one old forward cursor. **Tail/backward recovery uses the actual SDK and actual native history.** This is a labelled fault-injection stand-in, not a claimed reproduction of koi's mechanism. Inference alone is a deterministic local provider; its two-model picker uses the supported `COPILOT_PROVIDERS_CONFIG` registry.

Final run: **105,037,257 bytes / 25,010 events**, Copilot **1.0.84-9**. At **05:42:13.390Z**, `receiver-rebaselined` recovered a contiguous four-event gap for job **1**, message `5421ec68-0b3c-4830-a52b-40cd3295cc3b`. The next message `d78ce894-5b41-4400-844e-8a244cfde20c` reached `native-accepted`.

The companion invoked actual `session.rpc.extensions.disable({id:"user:pij"})`; the verified extension PID exited while host **58329** stayed active. Job **3**, message `9da71965-1e06-4e62-a5ac-79460446ea14`, parked **54,943 ms** after disconnect, within the **60,000 ms** lease. Sender-addressed `delivery.parked` sequence **23** retained `undelivered:native-receiver-unavailable`. Actual Rust and TS-shim `state` output showed:

```text
pij-realistic-gamefowl: idle · active
  ... native_receiver_reason: native-receiver-stale
```

After clearing operator Hold, the actual Copilot `!` shell ran the native CLI inbox. It returned that same message, recorded exactly **one `reader-read` ACK**, and left job **3 done**. No automatic reinjection or receiver lease renewal was inferred from manual reading.

Executed store queries included:

```sql
SELECT seq,at,kind,seat,payload FROM spine_events
WHERE kind='delivery.parked' AND json_extract(payload,'$.messageId')=?;
SELECT recipient,msg_id,origin FROM delivered_messages WHERE recipient=? AND msg_id=?;
SELECT id,state,dedupe_key,outcome FROM jobs WHERE serial_key=?;
```

[Final compact receipt](evidence/ac5-acceptance/summary.json) · [receiver log](evidence/ac5-acceptance/receiver.txt) · [actual shim state](evidence/ac5-acceptance/state-shim.txt) · [actual manual inbox](evidence/ac5-acceptance/emergency-inbox.json). Owned tmux/daemon/provider teardown completed; private runtime/history remain ignored locally, never staged.

## Scheduled recycle and the observed SDK-read stall

Prime reports host **70552** started **12:26:30 local**, with child recycling at **13:26:58** and **14:26:59**. Old forks exited `0 stopped-normally` mid-completion; queued work flowed after recycle and prime reported **zero pending**. The scheduled lifecycle cause is recorded here; extension code logs its observable stop cause and outstanding IDs rather than guessing a schedule from wall time.

- **Consumed/ACKed before recycle:** daemon job remains **done**, even if model completion is still outstanding. It is not requeued.
- **Accepted but not consumption-ACKed:** original pending/running work remains recoverable. An observing replacement can renew and recover its accepted journal; otherwise the unchanged lease expires and it parks for explicit manual recovery. Ambiguous intent is never blindly reinjected.
- `native_recycle_keeps_consumed_job_done_and_parks_only_unconsumed_work` pins that boundary. The final live query also left jobs **1,2,3 done** after the extra SDK-enable attempt.

**First actually observed SDK-read stall class:** after the controlled H2 phase, actual SDK disable, expiry and manual recovery, the companion called **`session.rpc.extensions.enable({id:"user:pij"})`** in the same still-live host/session. On **1.0.84-9**, with about **105 MB / 25,010 events**, the replacement's **`eventLog.read({direction:"backward",max:128,includeEphemeral:false})`** remained pending until its **15,000 ms deadline** fired.

Representative repeated capture: registration **05:26:38.609Z**, `receive-held` **05:26:53.612Z** (**15,003 ms** registration-to-held; call-start itself was not separately timestamped). The final run repeated it at **05:43:09.237Z → 05:43:24.239Z** (**15,002 ms**). A real 128-event backward response was logged after the held diagnostic; later latency and whether cleanup released a shared SDK wait are unproven. The extra probe's result is **HELD**, not healthy hot-reload success. No retry, deadline increase or supervisor modification was added.

**Candidate H1, not proven:** a shared SDK session-refresh/read blockage could explain koi's silent wait when no per-call deadline existed. Koi's observed trigger was abort/model change, not an observed explicit SDK enable; the experiments do not prove identical causality or that the original promise would remain pending forever. [Exact trigger/timing and one-line repro](sdk-enable-stall.json) · [actual SDK stall log](sdk-enable-stall.txt). The one-line command above reproduces the controlled lifecycle probe for follow-up.

## Gates and remaining operational caveats

| Gate | Observed result |
|---|---|
| `~/.cargo/bin/cargo test --workspace` | **1117 passed**, 88 suites, 8 ignored; exit 0 |
| `~/.cargo/bin/cargo fmt --all --check` | exit 0 |
| `~/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings` | exit 0 |
| `node --test .copilot/extensions/pij/*.test.mjs` | **245 tests / 242 passed / 3 Linux skips**; both constrained heap child cases passed |
| Explicit ignored cross-language cold-resume contract | **1 passed**, actual runtime module + HTTP/SQLite; one simulated acceptance, no reinjection |
| `just self-check` | exit 0; **5309 Vitest passes / 22 skips**, native suite, **84 Windows-compat passes / 2 skips**, all **11 smoke scenarios**, audit and snapshots |

[Exact gate tails](gate-tails.txt). Snapshot: `briefing.md SHA matches snapshots (cdf5f5b25001...)`.

Earlier overlapping heavy suites hit conservative process-observation refusals and one tmux interleaving timeout; serial final Rust and self-check gates passed without weakening tests. A cold Pi package install caused one smoke timeout; warmed smoke and final self-check passed. Biome retains its existing schema-version **info** notice. Package audit is **report-only: 1/4 entry flagged, 4 fail / 13 warn**; this is not a security-clean claim. The pre-existing `b715be4f` plan commit has missing/unresolved C11 attribution; shared history was not rewritten. New commits use freshly derived seat/prime/plan trailers.

Independent scoped JS/Rust reviews found timestamp inflation, absent-bootstrap diagnostics and bootstrap outgoing-identity ordering; all were corrected, behaviorally proved and re-reviewed. Harness lessons are executable: named RPC deadlines, restart/progress regressions and the reusable isolated recipe. No production rollout or upstream rebase is included in this proof.

## Rebase integration

Prime rebased this branch onto main **6b8d8504** (plans 151 and 153 included), producing **aedf5ee3**, with plan152 source at **f57623ad**. This section supersedes the earlier idle-probe design; earlier gates and runtime measurements above remain historical, not proof of this composed tree. No further rebase or production mutation was performed.

- **AC4 wrapper:** the child fixture now uses `export *` plus explicit seam overrides, rather than a frozen store-export allowlist. A separate namespace-superset assertion failed behaviorally before that repair and passes afterward; all three actual process-stop cases pass.
- **Timer identity, not duration:** controlled delay events identify `registration`, `receiver`, `heartbeat`, or fallback `store` ownership. Registration retry assertions select retry owners, never exclude `20000` or `1000`. The real 1000 ms retry step remains tested. The reported three failures were selecting the independent idle timer; `observeStartup` and prime's conflict resolution were not the cause.
- **Workload-gated SDK observation:** removed the redundant permanent `watchIdleReceiver` loop and its delay injection. The existing consumption/completion loop already performs bounded reads and independent tail checks while delivery or completion is outstanding. Empty receivers retain callback observation, daemon heartbeats and inbox waiting, but no idle SDK poller; the next delivery captures a fresh tail. No replacement supervisor or extra timer was added.
- **Composition rule:** successful registration resets registration-hold escalation before startup observation. A failed startup SDK observation becomes `receive-held`, never another registration retry. One actual child run covers 250 ms registration retry → 60000 ms escalated retry → success → startup read failure; a further minute produces no registration retry, heartbeat or claim, while the outgoing tool remains usable.
- **New behavioral RED/GREEN:** an idle child originally exposed an extra `store` timer alongside receiver/heartbeat waits. The regression now proves startup-only SDK reads while empty, active polling during completion-wait without another claim, and no continuing SDK reads after completion. The full native suite passed **262 tests / 259 passed / 3 Linux-only skips**, including every reported failure.
- **Harness lesson encoded:** timer ownership is explicit fixture data, and workload gating is a lifecycle regression rather than an instruction to remember. Friction was captured as harness observation **DL-004**. The receiver API contract documents the revised rule.

Fresh Rust gates passed: **1135 tests / 88 suites / 8 ignored**, `cargo fmt --all --check`, strict all-target clippy, and a worktree-local native CLI build. No Rust source changed in this integration round.

Fresh large-session progress smoke passed on **Copilot 1.0.84-9**, **105,037,245 bytes / 25,010 events**, seat **pij-front-raven**, session **7e8a89bc-6b42-4f98-8133-5e50d15a0503**. The controlled stale cursor rebaselined and the next message was accepted. Actual SDK disable parked job **3**, message **aba85289-5c57-4872-8796-89a85500e376**, after **54,713 ms** under the unchanged **60,000 ms** lease. Actual Copilot-shell manual inbox recorded exactly one `reader-read` ACK and left the same job done.

The extra SDK-enable attempt again produced **HELD**, not healthy reload: registration **06:29:26.385Z**, `eventLog.read deadline exceeded (15000ms)` at **06:29:41.387Z**, **15,002 ms** later. Production causality remains a candidate H1, not proved. Jobs **1,2,3** remained done. [Fresh progress receipt](evidence/ac5-rebase/summary.json) · [decisive receiver events](evidence/ac5-rebase/receiver.txt). The isolated daemon and tmux were stopped; private history, keys and repetitive captures remain ignored.

Fresh memory smoke also passed on **1.0.84-9**, **84,024,782 bytes / 20,010 events**, with **30 native-consumed, model-completed, ACKed deliveries at the default 10-second spacing**. Extension **23556** had **32 RSS samples over 302,441 ms**: **102,544–114,112 KiB**, ending **108,848 KiB**. Its death parked job **31**, message **8680f9ed-e135-4606-b6ec-47a8f151017a**, after **56,623 ms**; actual manual inbox recovered the same job with one `reader-read` ACK and final **done**. [Memory receipt](evidence/ac6-rebase/summary.json) · [RSS series](evidence/ac6-rebase/rss.csv) · [30-message witness ledger](evidence/ac6-rebase/deliveries.csv). Both owned runtime teardowns completed.

Final warm `just self-check` exited **0**: **243 Vitest files / 5307 tests passed**, **4 files / 22 tests skipped**; native **259 passed / 3 skipped**; all **11 smoke scenarios** passed. Closing snapshot proof: `snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)`. [Exact commands, content hashes, RED assertions and gate ledger](rebase-proof.json).

**Composed-base caveats:** the Windows-focused stage still selects `.pi/extensions/pij/*`, now excluded after plan153's `.omp` migration: **zero focused tests ran**, despite exit 0. This is not fresh Windows coverage. Prime acknowledged the plan153 miss and assigned **pij-continued-bug** to fix selectors plus a zero-files-fails guard separately on main; no such change is included here. Package audit remains report-only (**4 fail / 13 warn** in one of four entries). Biome reports its existing schema-version info. C11 audit warns about missing historical prime attribution in **bb061988**, **aedf5ee3**, and **0e907e46**; no historical identity was fabricated or rewritten.

## Fix round

Applied prime's [F1/F3 rulings](packet-fix.md) against **8df2bb0d**, following the [independent review](review.md). No receiver or Rust behavior changed.

- **F1:** the progress smoke imports the runtime-owned `NATIVE_RPC_DEADLINE_MS` (with a TypeScript declaration for this first TS consumer), waits for the actual replacement `registered` event, then measures **deadline + 30,000 ms = 45,000 ms** from that event. Registration latency no longer consumes the SDK-deadline allowance. It still requires the exact `eventLog.read deadline exceeded (15000ms)` diagnostic and the unchanged host/stale state.
- **Branch decision:** removed the misleading healthy `observing` branch. This phase explicitly asserts the stale latch immediately before SDK enable and witnesses the real startup-read hold; it is not a healthy-reload acceptance claim. Healthy replacement remains separately covered by the receiver regression suite. The packet's 60-second lease and manual-ACK assertions are unchanged.
- **F3:** both recipes share a recipe-only prerequisite, select `COPILOT_VERSION` (default **1.0.84-9**) through the actual launcher's `--prefer-version`, check the resolved CLI version and installed runtime metadata before launching the smoke, and refuse mismatches with **exit 2**. `COPILOT_BIN` or the existing CLI override selects another launcher; no install, updater, global linking or 1.0.85 topology workaround is added. The ambient npm loader can select the installed pin, so the acceptance commands need no runtime flags.
- **Visibility caveat:** the API contract now states that startup hold appears immediately in extension stderr, while `pij state` exposes the receiver reason only after unrenewed lease expiry, up to **60 seconds** later.

Real **1.0.85** prerequisite rejection was exercised through a controlled launcher that invokes the installed `index.js --no-auto-update --version` and ignores the requested preference, modeling a launcher unable to select the pin. It reports the actual runtime, not a fabricated version string. Both public recipes exited **2 in 0.92 seconds**, before starting private smoke resources:

```text
PIJ_NATIVE_PREREQUISITE_VERSION: /tmp/pij152-force-runtime-185 resolved 1.0.85, expected COPILOT_VERSION=1.0.84-9; runtime drift is not a product failure
```

The encoded harness improvement is the registration-relative budget plus shared version prerequisite, captured as **DL-006**. Production H1 remains unproved; a successful smoke still grades SDK enable as **HELD**, not healthy.

Three consecutive **bare** `just copilot-native-progress-smoke` invocations passed without runtime flags or acceptance shortcuts (**237.68 s** including recipe startup). These are the recipe's ordinary small-session runs; the previous large-history/H2 evidence remains separate.

| Run | Smoke elapsed | Enable → registered | Registered | Exact deadline hold | Registered → held | Exit |
|---|---:|---:|---|---|---:|---:|
| 1 | 78,663 ms | 364 ms | 07:25:05.441Z | 07:25:20.443Z | 15,002 ms | 0 |
| 2 | 78,589 ms | 304 ms | 07:26:24.574Z | 07:26:39.575Z | 15,001 ms | 0 |
| 3 | 78,329 ms | 242 ms | 07:27:43.782Z | 07:27:58.798Z | 15,016 ms | 0 |

All timestamps are **2026-09-16 UTC**. All three runs preserved the host, accepted the next delivery after real abort/model-picker interaction, parked/recovered the same pending message, recorded one manual ACK, left jobs **1–3 done**, and stopped their owned tmux/daemon. The hold budget was **45,000 ms from registration** in each receipt.

Bare `just copilot-native-memory-smoke` also exited **0**, in **365.14 s**, selecting **1.0.84-9**. It preserved the **84,024,839-byte / 20,010-event** seeded history and completed **30 native-consumed/model-completed/ACKed deliveries at default 10-second spacing**. Extension **37638** had **32 RSS samples over 302,470 ms**, **96,992–108,416 KiB**, ending **101,728 KiB**. Receiver death parked job **31** after **56,749 ms** under the unchanged **60,000 ms** lease; manual recovery recorded one `reader-read` ACK and final **done**. Both owned services stopped. [RSS series](evidence/fix-round/memory-rss.csv) · [delivery identities](evidence/fix-round/memory-deliveries.csv).

Final gates: native **259 passed / 3 Linux skips**, Rust **1135 passed / 88 suites / 8 ignored**, fmt and strict all-target clippy **exit 0**. Warm `just self-check` exited **0 in 88.07 s**: **243 Vitest files / 5307 tests passed**, **4 files / 22 tests skipped**, native **259 / 3 skipped**, all **11 smoke scenarios** passed. Closing receipt: `snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)`.

[Exact commands, source hashes, three registration/hold receipts and gate ledger](fix-round-proof.json). Parent's packet-only commit **fc4e7c36** is the actual fix-round base; reviewed product source remains **8df2bb0d**. The Windows-focused stage still ran **zero tests on this branch**; F2 is fixed separately on main at **84ca47f6**, not silently counted here. Report-only audit remains **4 fail / 13 warn** in one of four entries. Historical prime-trailer warnings now include **fc4e7c36** and **8df2bb0d** alongside the three noted above; no shared history was rewritten.

Two preliminary invocations were accidentally given a 30-second outer tool deadline while expecting a version refusal; pin selection succeeded and started real smokes instead. Those interrupted attempts are **not acceptance evidence**. Their private tmux servers were explicitly stopped and no matching owned daemons remained. All six owned runtime trees, raw logs and temporary recovery scripts are archived under ignored `evidence/fix-round/runtime/`; only compact proof is retained in the commit.
