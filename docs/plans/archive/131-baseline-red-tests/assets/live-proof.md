# Plan 131 live proof

**Surface**: fresh linked worktree with canonical `node_modules` symlink
**tmux pane**: `%2911`
**Command**: `just test`
**Verdict**: PASS (`__PLAN131_JUST_TEST_EXIT__=0`)

```text
npm run test -- "$@"
npm warn Unknown project config "min-release-age". This will stop working in the next major version of npm.

> pij@0.1.0 test
> vitest run

(node:57067) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

 RUN  v4.1.10 /Users/jordanknight/pi-hacking/fs3-baseline-red-tests

 ✓ harness/scripts/copilot-models.test.ts (1 test) 4981ms
     ✓ retries a stale Pi credential with a fresh OMP token  4981ms
 ✓ .pi/extensions/pij/body-file.integration.test.ts (14 tests) 8209ms
     ✓ AC-08/09: a hostile body from a file arrives byte-for-byte and is never lexed as argv  672ms
     ✓ AC-09: --wait BEFORE --body-file cannot swallow the file's contents  1084ms
     ✓ AC-10: --body-file - reads stdin, so a heredoc is a single literal command  1725ms
     ✓ AC-08: --body-file combined with --command is an explicit error  1149ms
     ✓ AC-11: `pij send --help` shows the safety guidance it documents  636ms
     ✓ F1: a whitespace-only --body-file is refused, and nothing lands in the inbox  661ms
     ✓ F1 preserved: a padded but non-empty --body-file keeps every pad byte  740ms
     ✓ F2: a two-target broadcast --body-file delivers the hostile body byte-for-byte to BOTH  748ms
     ✓ F2: a whitespace-only broadcast --body-file is refused for EVERY target  790ms
 ✓ skills/flow-pair/test/identity.test.ts (6 tests) 9986ms
     ✓ derives host-owner-repo from HTTPS remote  1489ms
     ✓ derives host-owner-repo from SSH remote  3376ms
     ✓ falls back to basename-hash when git has no remote  2065ms
     ✓ falls back to basename-hash when no .git dir at all  945ms
     ✓ is stable across repeated calls  2109ms
E-NOID: current claude session is not push-attached to the current process pane %9; run pij adopt "$TMUX_PANE" --harness claude from this exact pane
 ✓ .pi/extensions/pij/core/agents/cli-verbs.test.ts (25 tests) 11889ms
     ✓ runs a project pack and prints the report summary  653ms
     ✓ --json emits the {run, report} envelope on stdout only  773ms
     ✓ records a named run (runDir present, non-null) by default  971ms
     ✓ --ephemeral leaves zero new entries under the pack's runs/ (AC-06)  2193ms
     ✓ override warnings are surfaced on stderr (progress), never block  1799ms
     ✓ ephemeral run: --permissions yolo reaches minih (pure-allow ⇒ adapter gets no permission handler)  3265ms
     ✓ runs an inline prompt and leaves nothing under ~/.pij/tmp  606ms
     ✓ reads the prompt from stdin for --prompt -  1219ms
 ✓ .pi/extensions/pij/core/cli.test.ts (458 tests) 11618ms
       ✓ runs create → fence show → close end-to-end and serves generic family help  6946ms
       ✓ real bin timeout persists delivered-unacked, then a matching ack transitions to acked  1680ms
       ✓ real bin timeout leaves delivered-unacked, no CanaryRecord, and a named terminal refusal  896ms
       ✓ real bin PASSES with an unverified tier when the effective context tier is unobservable  1875ms
{"error":"E-NOID","message":"current claude session is not registered as a paneless pull peer; run pij inbox register"}
 ✓ skills/flow-pair/test/cli-learning.test.ts (3 tests) 3314ms
     ✓ learn: stdout = exactly 'learning: learn-0001' and writes implement-code candidate  1541ms
     ✓ learn --json: stdout includes candidatePath and cluster  776ms
     ✓ learn invalid cluster exits 2 and writes no candidate  997ms
{"error":"E-NOID","message":"current claude session is not registered as a paneless pull peer; run pij inbox register"}
 ✓ .pi/extensions/pij/core/agents/inline.test.ts (8 tests) 1935ms
     ✓ runs an inline prompt and removes the temp tree on success  339ms
     ✓ removes the temp tree even when the adapter fails (cleanup on failure)  336ms
     ✓ writes an optional output schema into the synthesized pack  545ms
     ✓ runs a named pack and leaves nothing on disk, source pack untouched  397ms
     ✓ cleans up even when the adapter fails  306ms
 ✓ skills/flow-pair/test/cli-review.test.ts (6 tests) 10651ms
     ✓ review: stdout = exactly 'verdict: FIX_REQUIRED' (missing log), exit 0  2476ms
     ✓ review --json: stdout parses as JSON with verdict field and findings array  2376ms
     ✓ review: missing required arg → non-zero exit + stderr message  1258ms
     ✓ fix --json: fix packet has allowedFiles array and pointerMsg  2034ms
     ✓ fix rejects traversal runId before reading escaped review records  1201ms
     ✓ fix rejects traversal reviewId before reading outside reviews/  1306ms
 ✓ harness/driver/compact-assert.test.ts (17 tests) 7600ms
     ✓ case (a): pre + postCompact + postReload all match → ok: true, no divergences  1508ms
     ✓ case (b): postCompact diverges (D-005 confirmed shape) → ok: false, phase=compact  1507ms
     ✓ case (c): includeReloadCheck=false omits postReload entirely  1003ms
     ✓ case (d): timeouts plumb through (small compact/reload/status timeouts accepted on idle)  1507ms
     ✓ case (e) — F004 regression: stale pre JSON in scrollback does NOT pass when post emits no fresh JSON  1006ms
     ✓ case (e2) — F004 regression: malformed post JSON also throws (no silent {} pass)  1004ms
 ✓ harness/scripts/bounce-daemon.test.ts (3 tests) 17198ms
     ✓ fetches and refuses a canonical checkout behind origin/main before stopping  7720ms
     ✓ refuses daemon-relevant dirt unless --force is explicit  4618ms
     ✓ announces, gracefully stops, restarts the captured invocation, and verifies health  4859ms
 ✓ .pi/extensions/pij/orchestration-notice.integration.test.ts (8 tests) 17372ms
     ✓ 'delivered for an idle live pi target'  1608ms
     ✓ 'queued for a working live pi target'  3059ms
     ✓ 'queued for a live control-plane targe…'  1989ms
     ✓ 'unverified for a live control-plane t…'  1931ms
     ✓ 'unverified for a dead target'  1919ms
     ✓ 'unverified without persisting for a m…'  1912ms
     ✓ 'unverified without persisting for a d…'  2235ms
     ✓ 'queued with one persisted notice for …'  2716ms
 ✓ .pi/extensions/pij/adapters/fs-registry.test.ts (41 tests | 1 skipped) 5628ms
     ✓ overlapping processes claiming one free native identity all converge on attempt zero  2639ms
     ✓ overlapping processes skip an unowned legacy attempt zero without changing its bytes  2744ms
 ✓ .pi/extensions/pij/daemon.test.ts (62 tests | 2 skipped) 17554ms
     ✓ retains a BOUND tmux message, marks it after injection outcome, and skips replay  406ms
     ✓ persists a receipt event before marking its retained envelope and never injects it  550ms
     ✓ does not resurrect or notify for a descriptor dissolved during a queued activity drain  1238ms
     ✓ idle-releases at 60 seconds even while rendered composer text remains  404ms
     ✓ flushes an unattended orchestrator hold after undefined-layout timeout  740ms
     ✓ holds on a PARTIAL echo frame rather than certifying it as our own output  386ms
     ✓ coalesces repeated watchdog intervals while the composer hold is active  724ms
     ✓ clears stale failureReason and provider-failure latch when the session recovers  338ms
     ✓ AC-02: performs zero registry writes for the tick heartbeat  489ms
     ✓ AC-03: still exactly one persist with 50 owned descriptors  3760ms
     ✓ AC-03b: the one persist carries every owned id, and only owned ids  968ms
     ✓ AC-07: the RAW on-disk descriptor no longer accrues lastTickAt  439ms
 ✓ .pi/extensions/pij/core/agents/runner.test.ts (13 tests) 1621ms
     ✓ runs the pack through the injected adapter and surfaces parsedReport  700ms
     ✓ passes the resolved model/effort through to the adapter  351ms
     ✓ valid input against a schema → validated:true and the run proceeds  475ms
 ✓ .pi/extensions/pij/core/agents/contract.test.ts (2 tests) 1701ms
     ✓ writes an envelope-valid report.json through the real runAgent  437ms
     ✓ is idempotent — the repo fixture tree stays clean after runs  1263ms
 ✓ .pi/extensions/pij/adapters/spine-store.test.ts (21 tests) 3965ms
     ✓ multi-process atomicity: 4 concurrent writers x 25 appends allocate seqs exactly 1..100  889ms
     ✓ a held (fresh) events.lock makes append err E-NOREG after the acquisition budget  2026ms
{"error":"E-AMBIG","message":"COPILOT_AGENT_SESSION_ID is not a UUID: not-a-uuid"}
 ✓ .pi/extensions/pij/adapters/git-repository.test.ts (3 tests) 5668ms
     ✓ resolves one canonical common directory for a main checkout and linked worktree  3201ms
     ✓ distinguishes unrelated repositories and returns null outside git  2466ms
 ✓ .pi/extensions/pij/daemon.durability.test.ts (7 tests) 2608ms
     ✓ a failed send is retried on the very next pass, not only after a restart  316ms
     ✓ delivers EXACTLY ONCE after the daemon is killed and restarted  963ms
     ✓ control — a delivered message is NOT redelivered after a restart  677ms
 ✓ .pi/extensions/pij/core/memorable-id.test.ts (12 tests) 857ms
       ✓ walks the full space from a SHIP start too, not only a pair start  410ms
     ✓ walks the full space without repeating (pairs + ships)  435ms
 ✓ .pi/extensions/pij/core/daemon/watchdog-manager.test.ts (75 tests) 2215ms
     ✓ keeps an idle watchdog stall latched until real recovery and notices once  655ms
     ✓ keeps persisted lastEventAt byte-identical across a watchdog-attributable busy pane  587ms
{"error":"E-NOID","message":"COPILOT_AGENT_SESSION_ID 11111111-2222-4333-8444-555555555555 has no matching session-state directory"}
 ✓ .pi/extensions/pij/daemon.delivery.test.ts (8 tests) 2222ms
     ✓ injects pending mail WITHOUT a tick — delivery no longer rides tick duration  760ms
     ✓ is idempotent — a pass with nothing pending injects nothing  559ms
 ✓ .pi/extensions/pij/adapters/tmux.test.ts (6 tests) 2581ms
     ✓ kills a newly created pane when title assignment fails  573ms
     ✓ kills a newly split pane when title assignment fails  2006ms
{"error":"E-AMBIG","message":"CODEX_THREAD_ID is not a UUID: not-a-uuid"}
 ✓ .pi/extensions/pij/acceptance-sweep.test.ts (14 tests) 1157ms
     ✓ step 11 · AC-10 (+AC-03 immutability) — the real bin renders spine.md byte-identical to the pure render  661ms
     ✓ state clear makes a parked assignment undeclared without disturbing its mechanical axis  327ms
 ✓ skills/flow-pair/test/cli-dispatch.test.ts (2 tests) 1280ms
     ✓ stdout is EXACTLY the pointer line — one line, no prefix, no metadata  1271ms
 ✓ skills/flow-pair/test/cli-observe.test.ts (3 tests) 22078ms
     ✓ success: stdout = exactly 'diffId: diff-NNNN' (one line, exit 0)  6694ms
     ✓ --json: stdout parses as full ObserveResult shape (exit 0)  9314ms
     ✓ error: invalid --run-id → stderr + exit 2  6069ms
 ✓ .pi/extensions/pij/adapters/daemon-http.test.ts (17 tests) 1649ms
     ✓ reconnects with the complete cursor map and refreshes the daemon key  318ms
     ✓ caps reconnect backoff after exponential growth  370ms
{"error":"E-NOID","message":"CODEX_THREAD_ID aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb has no matching readable rollout"}
 ✓ harness/driver.test.ts (24 tests) 796ms
     ✓ Session.run() throws DriverAssertionError when expect never matches  605ms
 ✓ .pi/extensions/pij/core/agents/builtin-flowspace.test.ts (3 tests) 357ms
     ✓ runs always-ephemeral: zero writes under builtin-agents/ and runDir null  329ms
 ✓ harness/scripts/npm-resolution-policy.integration.test.ts (1 test) 9162ms
     ✓ revalidates stale metadata, fails closed on proxy gaps, enforces age, and never falls back  9161ms
 ✓ .pi/extensions/pij/adapters/rust-runtime.test.ts (7 tests) 839ms
     ✓ re-attaches after key rotation, preserves seat continuity, and consumes replay once (seat known: false)  306ms
 ✓ harness/scripts/packages-bootstrap.test.ts (2 tests) 1519ms
     ✓ attempts every install and exits nonzero after execution failures  953ms
     ✓ keeps stale fail vet verdicts report-only when installs succeed  566ms
 ✓ .pi/extensions/pij/telegram/bridge.test.ts (71 tests | 1 skipped) 940ms
 ✓ .pi/extensions/pij/core/registry-write-law.test.ts (4 tests) 546ms
     ✓ no write sets a contested field without naming the authority that owns it  464ms
 ✓ harness/scripts/local-path-check.test.ts (4 tests) 412ms
     ✓ scans both tracked and untracked non-ignored operational files  409ms
 ✓ .pi/extensions/pij/daemon.bootstrap.test.ts (14 tests) 283ms
 ✓ .pi/extensions/pij/adapters/process.test.ts (8 tests) 215ms
 ✓ .pi/extensions/pij/telegram/index.test.ts (20 tests | 1 skipped) 586ms
     ✓ shares successful outbound speech with numeric inbound chat ids and isolates other chats  399ms
 ✓ .pi/extensions/pij/adapters/channel.test.ts (14 tests | 1 skipped) 595ms
 ✓ .pi/extensions/minih-workbench/minih-adapter.test.ts (11 tests) 139ms
 ✓ .pi/extensions/pij/core/agent-peer.test.ts (26 tests) 141ms
 ✓ .pi/extensions/pij/adapters/platform-stores.contract.test.ts (103 tests) 327ms
 ✓ skills/flow-pair/test/context-pack-compile.test.ts (15 tests) 116ms
 ✓ .pi/extensions/pij/core/daemon/watch.test.ts (13 tests) 162ms
⚠️  tmux GONE: pane %42 does not exist — the binding is stale, not the send; message left unconsumed in the mailbox and this pane will no longer be targeted — can't find pane: %42
⚠️  tmux FAILED: send to pane %42 threw before submission — nothing reliably landed; the message stays queued — error connecting to /private/tmp/tmux-501/default (No such file or directory)
⚠️  copilot UNVERIFIED: send to pane %42 (pid ?) lacked positive submission confirmation; payload was typed once — text tail «…lztp8] (pij delivery diagnostic — please ignore)».
⚠️  copilot UNVERIFIED: send to pane %42 (pid ?) lacked positive submission confirmation; payload was typed once — text tail «…lztp8] (pij delivery diagnostic — please ignore)».
⚠️  copilot UNVERIFIED: send to pane %42 (pid ?) lacked positive submission confirmation; payload was typed once — text tail «…lztp8] (pij delivery diagnostic — please ignore)».
 ✓ .pi/extensions/pij/core/daemon/death-reconciler.snapshot.test.ts (5 tests) 137ms
 ✓ .pi/extensions/file-watch-notify/index.test.ts (14 tests) 159ms
 ✓ harness/scripts/vetters/agent.test.ts (3 tests) 3044ms
     ✓ returns fail Verdict when packagePath missing (with PIJ_VET_SKIP_AGENT unset)  3041ms
 ✓ .pi/extensions/pij/adapters/fs-registry.archive.test.ts (29 tests) 115ms
⚠️  tmux GONE: pane %99999999 does not exist — the binding is stale, not the send; message left unconsumed in the mailbox and this pane will no longer be targeted — Command failed: tmux send-keys -t %99
999999 -l x
can't find pane: %99999999

 ✓ .pi/extensions/pij/adapters/daemon-tmux.test.ts (32 tests) 245ms
 ✓ .pi/extensions/pij/daemon-real-adapter.test.ts (5 tests) 386ms
 ✓ skills/flow-pair/test/learning.test.ts (11 tests) 139ms
 ✓ .pi/extensions/pij/adapters/fs-registry.overlay.test.ts (44 tests) 206ms
 ✓ .pi/extensions/pij/daemon.archive.test.ts (13 tests) 109ms
 ✓ .pi/extensions/pij/adapters/platform-write-lock.test.ts (6 tests) 156ms
(node:66885) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ .pi/extensions/pij/core/focus.test.ts (15 tests) 100ms
 ✓ skills/flow-pair/test/review.test.ts (21 tests) 182ms
 ✓ .pi/extensions/session-sql/store.test.ts (40 tests) 87ms
 ✓ skills/flow-pair/test/context-pack-extract.test.ts (11 tests) 114ms
 ✓ skills/flow-pair/test/ledger-records.test.ts (7 tests) 96ms
 ✓ .pi/extensions/file-watch-notify/watcher.test.ts (9 tests) 148ms
 ✓ .pi/extensions/pij/core/identity-selfheal.test.ts (16 tests) 73ms
 ✓ .pi/extensions/pij/core/liveness-cost.test.ts (10 tests) 29ms
 ✓ skills/flow-pair/test/ledger-p9.test.ts (9 tests) 60ms
 ✓ harness/scripts/sync-models.test.ts (8 tests) 62ms
 ✓ .pi/extensions/pij/adapters/op-journal.test.ts (20 tests) 105ms
 ✓ skills/flow-pair/test/ledger-run.test.ts (10 tests) 96ms
(node:66988) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ .pi/extensions/pij/core/agents/report.test.ts (5 tests) 137ms
 ✓ .pi/extensions/pij/cli.inbox.integration.test.ts (12 tests) 25029ms
     ✓ runs whoami through process.execPath and the tsx entrypoint without tmux  719ms
     ✓ delivers a raw message through the real CLI into an isolated PIJ_HOME  950ms
     ✓ 'Claude' ambient registration is idempotent and finite wait returns JSON  3744ms
     ✓ 'Copilot' ambient registration is idempotent and finite wait returns JSON  2191ms
     ✓ 'Codex' ambient registration is idempotent and finite wait returns JSON  2243ms
     ✓ refuses inbox --wait immediately for a pushed-delivery seat  1537ms
     ✓ keeps finite inbox waits available to pull-delivery seats  2454ms
     ✓ registers an already-bound pushed seat from TMUX_PANE without ambient identity  2664ms
     ✓ registers a self-registered OMP seat from TMUX_PANE without ambient identity  1581ms
     ✓ keeps register fail-loud when ambient identity and TMUX_PANE are both absent  675ms
     ✓ round-trips wait → dead-pid send → read → delivered receipt without tmux or daemon  5670ms
     ✓ appendOnce hard-link race publishes one atomic event across two processes  599ms
 ✓ .pi/extensions/pij/core/tree.test.ts (24 tests) 29ms
 ✓ .pi/extensions/pij/adapters/generation-seam.test.ts (82 tests) 42ms
 ✓ .pi/extensions/todo/store.test.ts (20 tests) 69ms
 ✓ .pi/extensions/pij/core/chores/reduce.test.ts (12 tests) 148ms
 ✓ .pi/extensions/pij/adapters/project-store.test.ts (10 tests) 111ms
 ✓ skills/flow-pair/test/packet-write.test.ts (13 tests) 238ms
 ✓ .pi/extensions/pij/adapters/event-log.test.ts (8 tests) 49ms
 ✓ .pi/extensions/pij/adapters/assignment-store.test.ts (12 tests) 60ms
 ✓ .pi/extensions/pij/daemon.wiring.test.ts (3 tests) 38ms
 ✓ harness/scripts/link-global.test.ts (6 tests) 41ms
 ✓ .pi/extensions/pij/core/session.test.ts (52 tests) 10ms
 ✓ .pi/extensions/minih-workbench/index.test.ts (2 tests) 33ms
 ✓ .pi/extensions/pij/adapters/baton-store.test.ts (5 tests) 15ms
 ✓ .pi/extensions/pij/core/daemon/tick-heartbeat.test.ts (33 tests) 26ms
 ✓ skills/flow-pair/test/packet-render.test.ts (14 tests) 38ms
 ✓ .pi/extensions/pij/adapters/chore-store.test.ts (6 tests) 16ms
 ✓ .pi/extensions/pij/index.test.ts (17 tests) 2451ms
     ✓ reasserts immediately on the first turn when startup publication missed  334ms
     ✓ cancels a stale retry window on session shutdown  352ms
     ✓ reuses on reload, mints on new, and preserves an existing opaque id with prime metadata  507ms
     ✓ passes the exact shutdown reason: replacement dissolves, quit stays observable  423ms
 ✓ .pi/extensions/pij/core/daemon/pane-signals.test.ts (39 tests) 28ms
 ✓ .pi/extensions/pij/adapters/dispatch-store.test.ts (3 tests) 19ms
 ✓ .pi/extensions/pij/core/daemon/death-reconciler.test.ts (36 tests) 22ms
 ✓ .pi/extensions/pij/core/agents/pack.test.ts (8 tests) 19ms
 ✓ harness/scripts/omp-install-policy.test.ts (8 tests) 13ms
 ✓ .pi/extensions/pij/core/watchdog.test.ts (54 tests) 15ms
 ✓ .pi/extensions/pij/core/revive.test.ts (60 tests) 11ms
 ✓ .pi/extensions/pij/core/orchestration/role.integration.test.ts (13 tests) 23ms
 ✓ .pi/extensions/minih-workbench/store.test.ts (23 tests) 11ms
 ✓ .pi/extensions/pij/adapters/process-states.test.ts (14 tests) 12ms
 ✓ .pi/extensions/pij/core/death-reason.test.ts (20 tests) 3ms
 ✓ .pi/extensions/pij/adapters/generation-router.test.ts (20 tests) 17ms
 ✓ .pi/extensions/pij/adapters/fence-store.test.ts (4 tests) 17ms
 ✓ .pi/extensions/pij/core/platform/types.test.ts (152 tests) 10ms
 ✓ .pi/extensions/pij/core/models/registry.test.ts (49 tests) 16ms
 ✓ .pi/extensions/pij/core/daemon/loop.test.ts (67 tests) 13ms
 ✓ .pi/extensions/pij/core/orchestration/pa-capability.test.ts (34 tests) 11ms
 ✓ .pi/extensions/pij/core/status-nudge.test.ts (9 tests) 4ms
 ✓ .pi/extensions/pij/core/platform/boundary.test.ts (46 tests) 23ms
 ✓ .pi/extensions/pij/core/spawn.test.ts (159 tests) 13ms
 ✓ .pi/extensions/pij/core/orchestration/baton.test.ts (30 tests) 12ms
 ✓ harness/scripts/vetters/audit-writeback.test.ts (6 tests) 11ms
 ✓ .pi/extensions/pi-peacock/ui.test.ts (13 tests) 11ms
 ✓ .pi/extensions/pij/telegram/lockfile.test.ts (12 tests) 27ms
 ✓ .pi/extensions/pij/core/chores/boundary.test.ts (12 tests) 27ms
 ✓ .pi/extensions/pij/core/chores/resolve.test.ts (4 tests) 18ms
 ✓ .pi/extensions/pij/core/platform/render-spine-md.test.ts (21 tests) 3ms
 ✓ .pi/extensions/pij/core/platform/assignment.test.ts (39 tests) 7ms
 ✓ .pi/extensions/pij/core/anomalies.test.ts (82 tests) 9ms
 ✓ .pi/extensions/pij/core/platform/journal.test.ts (46 tests) 12ms
 ✓ .pi/extensions/pij/core/state.test.ts (74 tests) 9ms
 ✓ .pi/extensions/pij/core/inbox.test.ts (17 tests) 9ms
 ✓ .pi/extensions/pij/core/agents/boundary.test.ts (31 tests) 24ms
 ✓ .pi/extensions/ralph-loop/store.test.ts (65 tests) 8ms
 ✓ .pi/extensions/pij/core/binding.test.ts (37 tests) 5ms
 ✓ .pi/extensions/pij/core/bind-health.test.ts (10 tests) 4ms
 ✓ .pi/extensions/pij/adapters/allocation-store.test.ts (4 tests) 10ms
 ✓ .pi/extensions/pij/core/orchestration/role.test.ts (31 tests) 8ms
 ✓ .pi/extensions/pij/telegram/config.test.ts (8 tests) 17ms
 ✓ .pi/extensions/pij/core/orchestration/cli.test.ts (55 tests) 9ms
 ✓ .pi/extensions/pij/core/daemon/typing-guard-contract.test.ts (32 tests) 12ms
 ✓ .pi/extensions/pij/core/bg.test.ts (24 tests) 5ms
 ✓ .pi/extensions/pij/core/daemon/runtime-axis.test.ts (10 tests) 9ms
 ✓ .pi/extensions/pij/core/platform/spine.test.ts (20 tests) 5ms
 ✓ .pi/extensions/pij/core/daemon/anomaly-sweep.test.ts (14 tests) 7ms
 ✓ .pi/extensions/pij/adapters/context-reader.test.ts (7 tests) 19ms
 ✓ .pi/extensions/pij/core/archive.test.ts (38 tests) 5ms
 ✓ .pi/extensions/pij/core/stream.test.ts (7 tests) 6ms
 ✓ .pi/extensions/pij/core/models/validate.test.ts (38 tests) 3ms
 ✓ .pi/extensions/pij/core/generation-routing.test.ts (38 tests) 8ms
 ✓ harness/scripts/lockfile-allowlist.test.ts (6 tests) 18ms
 ✓ .pi/extensions/pij/core/harness/transcript.test.ts (9 tests) 11ms
 ✓ .pi/extensions/pij/core/agents/paths.test.ts (7 tests) 2ms
 ✓ .pi/extensions/pij/index.send-schema.test.ts (8 tests) 5ms
 ✓ .pi/extensions/pij/telegram/init.test.ts (10 tests) 6ms
 ✓ .pi/extensions/pij/core/models/cli-models.test.ts (24 tests) 7ms
 ✓ .pi/extensions/pij/core/agents/peer-packet.test.ts (5 tests) 15ms
 ✓ .pi/extensions/pij/adapters/spawn-expectation-store.test.ts (1 test) 7ms
 ✓ .pi/extensions/pij/core/platform/project.test.ts (43 tests) 6ms
 ✓ .pi/extensions/pij/adapters/atomic-file.test.ts (4 tests) 11ms
 ✓ .pi/extensions/pij/adapters/watchdog-global-store.test.ts (4 tests) 11ms
E-NOID: no session 'missing' in registry
 ✓ .pi/extensions/pi-peacock/index.test.ts (3 tests) 10ms
 ✓ .pi/extensions/pij/core/platform/time.test.ts (8 tests) 4ms
 ✓ .pi/extensions/file-watch-notify/store.test.ts (25 tests) 6ms
 ✓ .pi/extensions/pij/adapters/focus-store.test.ts (3 tests) 8ms
 ✓ .pi/extensions/pij/core/invariant-guard.test.ts (2 tests) 2ms
 ✓ .pi/extensions/pij/core/daemon/baton-sweep.test.ts (5 tests) 6ms
 ✓ .pi/extensions/pij/core/agents/cli-args.test.ts (42 tests) 6ms
 ✓ .pi/extensions/minih-workbench/ui.test.ts (7 tests) 7ms
 ✓ .pi/extensions/minih-workbench/session-persistence.test.ts (5 tests) 3ms
 ✓ .pi/extensions/pij/core/registry-write.test.ts (18 tests) 4ms
 ✓ .pi/extensions/pij/core/discovery.test.ts (27 tests) 4ms
 ✓ .pi/extensions/pij/adapters/fakes.test.ts (14 tests) 6ms
 ✓ harness/scripts/snapshot-refresh.test.ts (7 tests) 2ms
 ✓ .pi/extensions/pij/core/interstitial.test.ts (13 tests) 4ms
 ✓ .pi/extensions/pij/core/watch-subscription.test.ts (17 tests) 14ms
 ✓ .pi/extensions/pij/core/usage-flags.test.ts (3 tests) 5ms
 ✓ .pi/extensions/pij/core/session-join.test.ts (14 tests) 5ms
 ✓ .pi/extensions/pij/telegram/commands.test.ts (17 tests) 5ms
 ✓ harness/scripts/vetters/scorecard.test.ts (7 tests) 2ms
 ✓ .pi/extensions/pij/core/daemon/router.test.ts (22 tests) 5ms
 ✓ .pi/extensions/pij/core/daemon/tap-retention.test.ts (12 tests) 4ms
 ✓ harness/scripts/smoke.test.ts (4 tests) 5ms
 ✓ harness/scripts/vetters/aggregate.test.ts (8 tests) 3ms
 ✓ .pi/extensions/pij/core/context/window.test.ts (8 tests) 5ms
 ✓ .pi/extensions/pij/core/spawn-expectation.test.ts (4 tests) 3ms
stderr | harness/scripts/vetters/override-scope.test.ts > parseOverrides (FX001-1) > parses legacy free-text strings as { rules: [], reason: <text> } (fail-safe — accepts nothing)
⚠ deprecated: vetted.overrides as a plain string accepts no rules; migrate to { rules: [<rule-slug>], reason: <text> }

 ✓ harness/scripts/vetters/override-scope.test.ts (10 tests) 3ms
 ✓ .pi/extensions/pij/telegram/media.test.ts (19 tests) 6ms
 ✓ .pi/extensions/pi-peacock/store.test.ts (10 tests) 5ms
 ✓ harness/scripts/cli-invocation.test.ts (3 tests) 2ms
 ✓ .pi/extensions/pij/core/daemon/lifecycle.test.ts (26 tests) 4ms
 ✓ .pi/extensions/pij/core/current-session.test.ts (13 tests) 4ms
 ✓ .pi/extensions/pij/core/daemon-wire.test.ts (6 tests) 6ms
 ✓ .pi/extensions/pij/adapters/tmux-keys.test.ts (11 tests) 3ms
 ✓ .pi/extensions/pij/core/orchestration/pa-target.test.ts (9 tests) 4ms
 ✓ .pi/extensions/ralph-loop/runner.test.ts (8 tests) 4ms
 ✓ .pi/extensions/pij/core/types.test.ts (49 tests) 5ms
 ✓ .pi/extensions/pij/core/harness/codex.test.ts (17 tests) 3ms
 ✓ .pi/extensions/pij/core/session-name.test.ts (6 tests) 3ms
 ✓ .pi/extensions/pij/core/harness/claude.test.ts (19 tests) 4ms
 ✓ .pi/extensions/pij/core/canary.test.ts (12 tests) 3ms
 ✓ .pi/extensions/file-watch-notify/inject.test.ts (13 tests) 4ms
 ✓ .pi/extensions/pij/core/harness/types.test.ts (11 tests) 2ms
 ✓ .pi/extensions/pij/core/agents/adapters/codex.test.ts (11 tests) 4ms
 ✓ harness/scripts/skill-link-policy.test.ts (3 tests) 4ms
 ✓ .pi/extensions/pij/core/close.test.ts (15 tests) 3ms
 ✓ .pi/extensions/pij/core/daemon/index-state.test.ts (7 tests) 3ms
 ✓ .pi/extensions/pij/core/agents/adapters/claude.test.ts (9 tests) 4ms
 ✓ .pi/extensions/pij/core/context/gauge.test.ts (13 tests) 4ms
 ✓ .pi/extensions/pij/core/readiness.test.ts (17 tests) 3ms
 ✓ .pi/extensions/image-see/store.test.ts (14 tests) 3ms
 ✓ .pi/extensions/pij/core/models/match.test.ts (10 tests) 2ms
 ✓ .pi/extensions/pij/core/events.test.ts (10 tests) 3ms
 ✓ harness/scripts/vetters/audit-unmanifested.test.ts (5 tests) 3ms
 ✓ .pi/extensions/pij/telegram/chunk.test.ts (9 tests) 3ms
 ✓ .pi/extensions/pij/core/platform/allocation.test.ts (4 tests) 4ms
 ✓ .pi/extensions/skill-runner/store.test.ts (14 tests) 3ms
 ✓ .pi/extensions/pij/core/models/spawn-validation.test.ts (14 tests) 4ms
 ✓ .pi/extensions/pij/core/orchestration/prime.test.ts (10 tests) 3ms
 ✓ harness/scripts/vetters/npm-audit.test.ts (4 tests) 3ms
 ✓ skills/flow-pair/test/paths.test.ts (8 tests) 2ms
 ✓ .pi/extensions/pij/core/harness/badmodel.test.ts (16 tests) 3ms
 ✓ .pi/extensions/pij/core/message.test.ts (10 tests) 4ms
 ✓ .pi/extensions/pij/telegram/match.test.ts (13 tests) 3ms
E-AMBIG: cannot resolve self among 3 local sessions: pij-A, pij-B, pij-C2. Set who you are — `export PIJ_SESSION_ID=pij-A` — or run `pij adopt "$TMUX_PANE" --harness <h>` so this pane resolves itself.
 ✓ .pi/extensions/pij/core/daemon/watchdog-scheduler-projection.test.ts (8 tests) 3ms
 ✓ .pi/extensions/pij/core/commands.test.ts (5 tests) 2ms
 ✓ .pi/extensions/pij/core/harness/copilot.test.ts (11 tests) 4ms
 ✓ harness/scripts/vetters/resolve-path.test.ts (6 tests) 2ms
 ✓ .pi/extensions/pij/core/receipts.test.ts (10 tests) 3ms
 ✓ .pi/extensions/pij/core/platform/dispatch.test.ts (3 tests) 3ms
 ✓ .pi/extensions/pij/core/agents/adapters/copilot.test.ts (3 tests) 3ms
 ✓ harness/scripts/vetters/types.test.ts (9 tests) 2ms
 ✓ .pi/extensions/pij/core/daemon/source-staleness.test.ts (12 tests) 3ms
 ✓ .pi/extensions/pij/core/seat-label.test.ts (2 tests) 3ms
 ✓ .pi/extensions/pij/core/daemon/process-staleness.test.ts (9 tests) 5ms
 ✓ .pi/extensions/pij/core/daemon/lock.test.ts (6 tests) 2ms
 ✓ harness/test-utils.test.ts (2 tests) 2ms
 ✓ .pi/extensions/pij/core/harness/pi.test.ts (3 tests) 2ms
 ✓ .pi/extensions/minih-workbench/feed.test.ts (3 tests) 5ms
 ✓ .pi/extensions/pij/core/platform/fence.test.ts (3 tests) 2ms
 ↓ harness/driver.it.test.ts (2 tests | 2 skipped)
 ✓ .pi/extensions/pij/core/seq.test.ts (3 tests) 3ms
 ↓ harness/scripts/vetters/agent.live.test.ts (2 tests | 2 skipped)
 ↓ .pi/extensions/pij/core/agents/peer.live.test.ts (3 tests | 3 skipped)
 ↓ .pi/extensions/pij/core/agents/adapters/adapters.live.test.ts (3 tests | 3 skipped)
 ✓ .pi/extensions/pij/core/worktree.test.ts (7 tests) 8636ms
     ✓ creates from a base SHA resolved at create-time and verifies branch/SHA/common-dir  1602ms
     ✓ refuses an existing destination before invoking worktree add  444ms
     ✓ refuses a dirty source checkout  487ms
     ✓ refuses a bad base ref with a named E-ARG and creates nothing  721ms
     ✓ verify refuses a branch or SHA mismatch  2591ms
     ✓ safeRemove refuses WIP and removes a clean linked worktree  2770ms
 ✓ harness/scripts/release-age-policy.test.ts (11 tests) 28165ms
     ✓ propagates governed values through the fail-closed runner and preserves child status  779ms
     ✓ rejects a stale global pij bin while accepting the wrapper target  1631ms
     ✓ restores the Windows caller environment even when a governed command fails  25748ms
E-ARG: --prime does not take a value
 ✓ .pi/extensions/pij/daemon-push.test.ts (21 tests | 2 skipped) 31990ms
     ✓ pushes a stalled notice to the creator when a bound session is working+stale  2359ms
     ✓ does NOT push for a non-stalled session (working with fresh events)  3373ms
     ✓ DOES push stalled when the pane is byte-STABLE past the window (genuine stall)  4582ms
     ✓ pushes a dead notice to the creator when the bound session's pid is gone  1847ms
     ✓ pushes only once for a dead session (latch)  3988ms
     ✓ dead push: registry descriptor carries failureReason after tick  1403ms
     ✓ stalled push: registry descriptor carries failureReason='stalled' after tick  534ms
     ✓ daemon driveSession detects bad model → fail with model-not-supported → creator notified  372ms
     ✓ detects quota error in pane of idle pid-alive bound session → pushes once to creator  2476ms
     ✓ does NOT push yet for an idle pid-alive bound session with fresh activity  729ms
     ✓ pushes only ONCE per provider-failure (latch)  5287ms
     ✓ persists failureReason='quota' on the descriptor after provider-failure push  1231ms
     ✓ does NOT push for an idle session with no recognisable error (transient text)  883ms
     ✓ detects the sakana credit error in a pi worker's pane → pushes once to creator  840ms
     ✓ persists failureReason='quota' on the pi worker descriptor  572ms
     ✓ does NOT push for a pi worker whose pane shows only transient text  440ms
     ✓ a dead session whose pane shows only billing-domain prose → failureReason unknown  371ms
     ✓ a stale-idle pid-alive session with only billing prose → no provider-failure push  414ms
 ✓ skills/flow-pair/test/observe.test.ts (17 tests) 32944ms
     ✓ returns {ok:true} with a real git fixture  4552ms
     ✓ writes diff-0001.patch (non-empty)  4743ms
     ✓ writes diff-0001.stat.txt (non-empty)  6749ms
     ✓ writes diff-0001.changed-files.json with required fields  4173ms
     ✓ result.changedFiles includes the staged file  2323ms
     ✓ result.changedFiles includes the untracked file (HIGH-B: porcelain sourcing)  1575ms
     ✓ MED-2: .patch includes synthetic patch content for untracked file  3902ms
     ✓ nested docs/plans/016-flow-pair/.the-flow-state.json staged → {ok:false} + no writes [HIGH-A load-bearing]  524ms
     ✓ root-level the-flow.json staged → {ok:false} + no writes  743ms
     ✓ .flow-pair/runs/x staged → {ok:false} + no writes [prefix guard]  746ms
     ✓ untracked the-flow.md (not staged) → {ok:false} + no writes [HIGH-B guard-bypass test]  336ms
     ✓ space-in-dirname forbidden path → {ok:false} + no writes [HIGH-1: NUL-delimited parsing]  875ms
     ✓ P9: appendFileSync(events.jsonl) before any writeFileSync(diffs/)  420ms
     ✓ P9 guard: FailDeps appendFileSync throws → {ok:false} + diff files NOT written  355ms
     ✓ files.changed event in events.jsonl has required field set  316ms
     ✓ LOW-3: writeFileSync throws → {ok:false} + P9 event already appended  319ms
E-NOID: no session 'pij-MISSING' in registry
E-NOID: no session 'pij-MISSING' in registry
E-AMBIGUOUS: model 'shared-model' exists under multiple providers: openrouter/shared-model, sakana/shared-model; qualify --model with the intended provider
{"error":"E-NOREG","message":"model catalog is incomplete; inventory unavailable for runtime(s): omp"}
{"error":"E-NOREG","message":"model inventory for runtime 'omp' is unavailable"}
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
E-ARG: session 'pij-rebooted-reused-pane': a pane with the recorded id exists but is running a different process — tmux re-issues pane ids from %0 in every new server, so after a reboot that id is almos
t certainly somebody else's. Re-run with --print (safe, mutates nothing) or --assume-dead to override
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
E-ARG: session 'pij-rebooted-young-pane-process': the pane's pid matches, but that pane's process did not start before this seat's last recorded activity (ps lstart, whole-second resolution), so it cann
ot be shown to be the process that produced that activity — the kernel recycled the pid, and a matching pid cannot corroborate a matching pane id, both are reissued from the bottom after a reboot. Re-ru
n with --print (safe, mutates nothing) or --assume-dead to override
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
E-ARG: session 'pij-unavailable-obs': the recorded pane is gone but the recorded pid still answers — the OS may have recycled it. Re-run with --print (safe, mutates nothing) or --assume-dead to override
E-NOID: no pij seat is registered for folder '/private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-nofolder-DESUuQ'
⚠️ could not auto-start pij daemon: tmux new-window failed: Command failed: tmux new-window -P -F #{pane_id} #{window_id} -n pij-daemon -d -c /private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij
-folder-YNscL8 -e PIJ_DAEMON_OWNED=1 npx tsx /Users/jordanknight/pi-hacking/fs3-baseline-red-tests/.pi/extensions/pij/daemon.ts
E-ARG: tmux split-window failed: Command failed: tmux split-window -P -F #{pane_id} #{window_id} -t %1 -h -d -p 33 -c /private/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-folder-YNscL8 -e PIJ_SE
SSION_ID=pij-revive-spawn-failure -e PIJ_HARNESS=claude -e PIJ_SPAWN_ID=revive-1788317769460-95316 -e PIJ_PARENT_ID=pij-A claude --dangerously-skip-permissions --resume 21111111-2222-4333-8444-555555555
555
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
E-NOID: no terminal session 'pij-revive-registry-race' to revive
⚠️ started a pij daemon in tmux window 'pij-daemon' (pane %90) but could NOT verify it running within 2500ms — it may still be coming up, or it may have failed to boot. Check with `pij daemon status`.
E-NOREG: copilot native session artifact is missing
E-ARG: session 'pij-still-live': the recorded pane is gone but the recorded pid still answers — the OS may have recycled it. Re-run with --print (safe, mutates nothing) or --assume-dead to override
E-ARG: session 'pij-still-live' still has a live prior attachment; close it before reviving
 ✓ .pi/extensions/pij/core/chores/drive.test.ts (36 tests) 120254ms
     ✓ persists full-every counters and receipt-first removal purges state  304ms
     ✓ degrades one malformed roster while probing healthy scopes and keeps JSON stable  835ms
     ✓ keeps the definition retryable when state purge fails after the removal receipt  596ms
     ✓ prints family help through the pre-registry intercept  2470ms
     ✓ frames record-looking full stdout and probe stderr so they cannot forge records  4899ms
     ✓ reports the exact sampled values, re-reports them, then becomes quiet only after ack  9436ms
     ✓ bounds sampled stdout visibly without changing the comparison fingerprint  2421ms
     ✓ keeps a returned delta visible as a flap until ack  7832ms
     ✓ resolves an adopted seat from its pane and rejects an unknown explicit seat id  2851ms
     ✓ keeps repo and fleet roster authoring available without a resolved seat  2181ms
     ✓ normalizes repo-local absolute paths, runs repo probes from another worktree and a subdirectory, and writes formatted JSON  2609ms
     ✓ validates add/update probe/full paths by resolved worktree containment  7068ms
     ✓ accepts static multi-argument commands and refuses unknown executables by default  2470ms
     ✓ refuses 'quoted variable' across add/update and probe/full without roster mutation  3127ms
     ✓ refuses 'braced variable' across add/update and probe/full without roster mutation  3134ms
     ✓ refuses 'tilde expansion' across add/update and probe/full without roster mutation  3542ms
     ✓ refuses 'later variable expansion' across add/update and probe/full without roster mutation  3437ms
     ✓ refuses 'inline interpreter payload' across add/update and probe/full without roster mutation  3302ms
     ✓ refuses 'command substitution' across add/update and probe/full without roster mutation  3323ms
     ✓ refuses 'backtick substitution' across add/update and probe/full without roster mutation  3091ms
     ✓ refuses 'unterminated quote' across add/update and probe/full without roster mutation  3423ms
     ✓ allows only exact safe runner flags before the repo script path  9917ms
     ✓ still warns fleet-roster authors about absolute paths  630ms
     ✓ warns when a shared chore invokes a pij verb refused to PA seats  660ms
     ✓ updates a chore in place and preserves its creator attribution  2461ms
     ✓ ignores unknown roster and state fields while list, run, and ack keep working  3834ms
     ✓ reports direct roster probe edits as re-instrumentation, not world movement  4339ms
     ✓ reports path-referenced script edits as probe changes, not value changes  5466ms
     ✓ accepts free-text values that begin with dashes  1304ms
     ✓ keeps a repo chore baseline independent for two seats  3550ms
     ✓ runs the full command on the third and sixth separate invocations only  6549ms
     ✓ runs a configured full command on every delta even without a periodic cadence  3575ms
     ✓ remove then re-add starts from a clean first observation  5012ms
E-NOID: current claude session descriptor is dissolved; run pij revive pij-whoami-dissolved-remediation --attach "$TMUX_PANE" from this exact pane
E-AMBIG: pij id pij-existing-opaque is already bound to claude:native-existing
E-NOID: pij id pij-caller-chosen does not exist
E-ARG: link 'pij-root' → 'pij-grandchild' would create a cycle
{"error":"E-AMBIG","message":"cannot resolve self: no local session and PIJ_SESSION_ID unset (pass --actor <label> to assert attribution)"}
E-NOID: no parent session 'missing' in registry
E-ARG: link 'pij-root' → 'pij-grandchild' would create a cycle
E-ARG: --debounce must be a positive duration in ms or s (for example 750ms or 2s)
pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch
E-ARG: --debounce must be a positive duration in ms or s (for example 750ms or 2s)
pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch
E-ARG: --debounce must be a positive duration in ms or s (for example 750ms or 2s)
pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch
E-ARG: --debounce must be a positive duration in ms or s (for example 750ms or 2s)
pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch
E-NOID: no such session 'missing'
E-ARG: watch requires at least one glob
pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch
E-ARG: pij watch is for non-pi peers only; use the file-watch-notify extension inside pi sessions
E-ARG: assignment 'asg-general-pij-B' is already undeclared — nothing to clear
E-ARG: --project takes a kebab project slug (got '../escape')
⚠ pij: your now/next card is 40497m old, never reported — pij report now "<did>" "<next>"
⚠ pij: your now/next card is 40497m old, never reported — pij report now "<did>" "<next>"
E-OWN: 'watchdog watch' is not available to a PA — refused by role 'pa' (field: orchestrationRole): 'pij-stranger' is neither you nor your parent — a PA may act only on ITSELF ('pij-pa') or its own pare
nt ('pij-parent'), so ask 'pij-parent' to do it or relay the request. Run 'pij whoami --json' to see your role and capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any se
at.
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
E-OWN: 'watchdog pause' is not available to a PA — refused by role 'pa' (field: orchestrationRole): a PA may 'list' the watchdog roster for any target, 'unwatch' any target — which removes only its OWN
subscription and changes nothing else about that seat — and 'watch' only ITSELF or its own parent; every other watchdog action changes supervision policy for a seat and stays refused. Run 'pij whoami --
json' to see your role and capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any seat.
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
E-OWN: 'close' is not available to a PA — refused by role 'pa' (field: orchestrationRole): it changes seat lineage or existence — a PA never creates, adopts, or ends a seat. Run 'pij whoami --json' to s
ee your role and capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any seat.
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
E-OWN: 'watchdog watch' is not available to a PA — refused by role 'pa' (field: orchestrationRole): '--for' binds a subscription on ANOTHER seat's behalf, which is a prime's repair path — a PA acts only
 for itself, so run it without '--for'. Run 'pij whoami --json' to see your role and capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any seat.
⚠ pij: your now/next card is 40498m old, never reported — pij report now "<did>" "<next>"
 ✓ .pi/extensions/pij/cli.integration.test.ts (98 tests | 1 skipped) 225319ms
     ✓ top-level help advertises the prime list filter  824ms
     ✓ report help prints only the report family block  745ms
     ✓ top-level help and skill guidance distinguish pull from push delivery  2197ms
     ✓ auto-registers an ambient session before E-NOREG and aliases adopt --current  3930ms
     ✓ rejects and repairs a contaminated external ambient identity in place  10278ms
     ✓ 'invalid Copilot UUID' prevents pane/cwd fallback  1210ms
     ✓ 'Copilot UUID without matching session…' prevents pane/cwd fallback  737ms
     ✓ 'invalid Codex UUID' prevents pane/cwd fallback  716ms
     ✓ 'Codex UUID without matching rollout' prevents pane/cwd fallback  854ms
     ✓ sets, filters, unsets, and durably reattaches prime designations through the real CLI  5783ms
     ✓ rejects valued --prime=false instead of silently disabling the filter  685ms
     ✓ AC-1 discovery: list --here sees both peers in this folder  707ms
     ✓ AC-5/whoami: PIJ_SESSION_ID resolves self unambiguously  571ms
     ✓ AC-3 send: message reaches the peer's inbox on disk (raw body)  611ms
     ✓ broadcast send writes the same raw body once to each target inbox  634ms
     ✓ broadcast --wait timeout names every unresolved target  776ms
     ✓ single-target --wait timeout output remains byte-identical  745ms
     ✓ broadcast preflights the full target set before writing any inbox  547ms
     ✓ AC-7/8 tail: --since filters to seq>N, events are ordered + timestamped  1164ms
     ✓ AC-9/10 state: reports state + liveness without a stream parse  567ms
     ✓ AC-11 path: prints the readable events.ndjson path  549ms
     ✓ AC-6 errors: invalid target exit codes are honored (E-NOID exit 2)  586ms
     ✓ standalone pi spawn persists a pane-correlated five-minute expectation before launch without a descriptor  741ms
     ✓ pins an ambiguous OMP model to github-copilot before tmux launch  743ms
     ✓ refuses other provider ambiguity before expectation or tmux mutation  535ms
     ✓ projects live-shape OMP thinking arrays through the real models command  521ms
     ✓ fails bare and filtered discovery when requested OMP inventory is unavailable or malformed  1336ms
     ✓ keeps --harness openrouter as an upstream-provider filter through the real bin  556ms
     ✓ keeps --harness sakana as an upstream-provider filter through the real bin  550ms
     ✓ keeps --harness github-copilot as an upstream-provider filter through the real bin  582ms
     ✓ control-plane spawn correlates one prelaunch expectation with descriptor and pane  3389ms
     ✓ real pi and daemon-bound spawns carry unresolved and not-probeable plan warnings into JSON and human receipts  20808ms
     ✓ revives a dissolved Claude session under the same pij id with fail-loud resume argv  3863ms
     ✓ resolves the prime seat from the CURRENT FOLDER and prints a paste-able line  736ms
     ✓ a REUSED pane id reads uncertain, not live, and says which id was recycled  5474ms
     ✓ a matching pane pid does NOT rescue a descriptor that predates this host's boot  4292ms
     ✓ a matching pane pid is uncertain when ps says that process started after our last event  5116ms
     ✓ a pane process born FOUR SECONDS after our last activity is uncertain, not live  4167ms
     ✓ --print survives tmux being unreachable, degrading to an unprobed pane  1265ms
     ✓ --attach binds the operator's OWN pane to the seat without spawning one  3674ms
     ✓ resolves an ARCHIVED seat and --print leaves it archived  1274ms
     ✓ prints the human-readable form with the self-adopt truth spelled out  616ms
     ✓ states the REAL reason a pi seat needs no attach step  687ms
     ✓ an UNAVAILABLE terminal observation is not evidence of death  641ms
     ✓ refuses to print for a folder that has no seat, naming the folder  571ms
     ✓ cleans the expectation when revival pane launch fails  701ms
     ✓ kills the spawned pane and removes its expectation when tombstone replacement fails  4364ms
     ✓ launches pi revival asynchronously with an unconditional reframe  1045ms
     ✓ launches omp revival asynchronously with an unconditional reframe  951ms
     ✓ reports the interim Copilot session-in-use action instead of waiting silently  4554ms
     ✓ refuses a missing Copilot native artifact before tmux mutation  591ms
     ✓ refuses revival while the prior process incarnation is still alive  1538ms
     ✓ daemon-bound Copilot descriptor records github-copilot provider  4095ms
     ✓ agent spawn correlates its prelaunch expectation, pane, descriptor, and harness  4315ms
     ✓ CLI close traces intent → kill → requested terminal → dissolve and retains history  744ms
     ✓ Copilot adopt uses only the validated current env uuid, never the global newest session  1186ms
     ✓ Copilot adopt ignores global newest when env is absent, then phonehome binds the pending id  1278ms
     ✓ adopt --id renders the stored final binding when no native artifact is discoverable  1430ms
     ✓ T001 regression-locks live and pending adopt outcomes before dissolved recovery  2610ms
     ✓ T002 refuses to report a dissolved adopt binding that was not persisted  661ms
     ✓ T005 whoami directs a dissolved ambient identity to revive  631ms
     ✓ adopt --id is reattachment-only, preserves prime, and can explicitly recover a reservation  2528ms
     ✓ first adopt without --id allocates a memorable primary id  536ms
     ✓ no-native adopt reserves then publishes one memorable pending descriptor  907ms
     ✓ tree/link/adopt/spawn compose over a real repository, linked worktree, and scratch registry  26438ms
     ✓ AC-6 command: send --command compact is accepted + the peer executes it  1256ms
     ✓ AC-13 receipt loop: B records inbound + emits a receipt; A records it; tail shows it  2292ms
     ✓ peer watch CLI mutates the caller sidecar via PIJ_SESSION_ID  2538ms
     ✓ peer watch CLI parses and upserts --debounce values  2315ms
     ✓ peer watch CLI rejects invalid debounce values before writing a sidecar  3255ms
     ✓ peer watch CLI errors for unresolved self, missing args, and pi sessions  3151ms
     ✓ state clear round-trips through the real CLI without materializing a second assignment  3296ms
     ✓ report now round-trips state-set → status and projects the durable denorm  1422ms
     ✓ issue-#20 kill: env unset + no pane match ⇒ NO parent, even with a lone cwd cohabitant  6524ms
     ✓ env unset + pane-exact match resolves the caller across the FULL registry (cross-cwd)  6220ms
     ✓ PIJ_SESSION_ID wins over both cwd cohabitants and pane matches  4141ms
     ✓ pi spawn announce target follows the same rule: pane identity yes, cwd cohabitant no  2637ms
     ✓ adopt honors --parent end-to-end and stays parentless without it  1409ms
     ✓ writes spine/spine.md byte-identical to the pure render; --json reports path/bytes/events  1878ms
     ✓ re-render of an unchanged log is byte-stable; human mode names the path  568ms
     ✓ renders an EMPTY spine as the header-only document (fresh temp home)  605ms
     ✓ --project publishes a FILTERED view to spine/<slug>.spine.md — spine.md untouched (s057)  1434ms
     ✓ --project rejects a non-slug shape with E-ARG (the slug becomes a filename)  582ms
     ✓ tree --global --liveness dead --json over 1200 descriptors parses complete THROUGH A REAL PIPE  2069ms
     ✓ lets a PA watch and unwatch its own parent THROUGH THE REAL BIN  2897ms
     ✓ refuses a PA watching a stranger THROUGH THE REAL BIN, naming role and field  857ms
     ✓ refuses a policy-changing watchdog action through the bin, even on its own parent  723ms
     ✓ still refuses a FLATLY refused verb at the bin seam — the gate is not disarmed  895ms
     ✓ whoami through the bin reports watchdog as CONDITIONAL, not flatly refused  737ms
     ✓ lets a PA `chore add` THROUGH THE REAL BIN — the raw-argv subverb mapping  2772ms
     ✓ registers the NAMED seat, re-binds without duplicating, and unwatches it again  4148ms
     ✓ preserves addedAt across a re-bind THROUGH THE BIN, and stamps a new one  1384ms
     ✓ refuses --for to a PA through the bin, while the plain form still works  2104ms
     ✓ names --for on BOTH the watch and the unwatch usage lines  730ms
     ✓ explains what --for DOES, not merely that it exists  892ms
     ✓ the help path is REACHABLE — guards this whole pin against being vacuous  849ms

 Test Files  231 passed | 4 skipped (235)
      Tests  4645 passed | 19 skipped (4664)
   Start at  12:54:29
   Duration  226.73s (transform 10.79s, setup 0ms, import 25.52s, tests 677.43s, environment 14ms)


__PLAN131_JUST_TEST_EXIT__=0
```
