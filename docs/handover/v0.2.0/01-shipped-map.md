# 01 — What is already shipped at v0.2.0 (do not rebuild these)

Generated from the merged PR list at tag `d120c53`; every row is live on the daemon (restart #7). The day-3 item numbers in the titles are the same numbering used by the outstanding sections in this folder.

| PR | merge sha | title |
|---|---|---|
| #1 | `2707705` | feat(pij): Telegram bridge consumes the sqlite queue (at-least-once) + honest pull-seat receipt (day-3 item 3b) |
| #2 | `5445c85` | feat(spawn): gate Copilot --context long_context per model (day-3 item 6) |
| #3 | `048a3e1` | fix(cli): flush piped stdio before exit — 64 KiB truncation class fix (day-3 item 1a) |
| #4 | `2797717` | feat(pij): pi in-process receiver consumes the sqlite queue (day-3 item 3c) |
| #5 | `5d6b6a4` | feat(pij): pointer-delivery doctrine follows the pty-clip precondition (day-3 item 7) |
| #6 | `ee560fe` | test(pij): witness pane-less tick exclusion (day-3 FX001, fixes PR #1 gap) |
| #7 | `bc71a4b` | fix(pij): clear pij-skill-check debt, semantics preserved (day-3 item 9) |
| #8 | `9133733` | fix(harness): pij-skill-check order-check false-positive + read-back back-pressure (day-3 item 11) |
| #9 | `c8dc377` | feat(queue): pij queue retire, closed-recipient sweep, revive un-retire, PA totality, listing ergonomics (day-3 item 1) |
| #10 | `9912bf8` | fix(pij): restore test-pinned route strings + skip placeholder links (item 9-FX, unRED main) |
| #11 | `f4ba6ec` | fix(daemon): honest pointer-path unverified line + dual-backend pointer/recovery (day-3 item 5, finding C) |
| #12 | `be31e66` | fix(harness): harden pij-skill-check against decoy bypass (day-3 item 12) |
| #13 | `42b7268` | fix(pij): pane-misbind guard — lifecycle-filtered resolver + bind identity check (day-3 item 10a+10b) |
| #14 | `64f0815` | feat(dispatch): retire dispatch records for closed seats + pij dispatch-retire (day-3 item 1b) |
| #15 | `ed20a68` | docs(pij): C9 — report state done does not silence the watchdog (day-3 item 14) |
| #16 | `0e7adee` | docs(specs): Claude + Copilot comms over SQLite + sockets — standalone handoff spec |
| #17 | `73f4a90` | docs(jordan-spec): issue title/body files as filed on AI-Substrate/pij#311 |
| #18 | `b4f3432` | fix(report): --state working rejection and status-stale detail carry the remedy (day-3 item 4, ruled c-remedy) |
| #19 | `ef8e262` | fix(pij): harden bind-guard diagnostics (day-3 item 17) |
| #20 | `50a7cf0` | docs(pij): pin watchdog doc to buildWatchdogTurn output — E6 ratchet (day-3 item 18) |
| #21 | `488c758` | fix(pij): no duplicate delivery after a transport ack-loss (day-3 item 20) |
| #22 | `aefe145` | feat(models): gemini-3.6-flash on Copilot — isolation record + honest instability mark, warn-don't-block (day-3 item 6b) |
| #23 | `3adf051` | fix(pij): transport receipt honesty — sent outcome + defer to durable ack (day-3 item 23) |
| #24 | `e46eec8` | fix(registry): serialize descriptor publishes + caller-baseline exact writes (day-3 item 13) |
| #25 | `90ba189` | fix(pij): close bind-refusal notice gaps (day-3 item 21) |
| #26 | `7021817` | fix(pij): supervise the Telegram bridge — die loud + daemon auto-restart (day-3 item 29) |
| #27 | `bab9854` | fix(spine): stale write-lock release + dead-pid reclaim (day-3 item 15) + 1b acceptance follow-ups |
| #28 | `fecf633` | fix(spawn): creator notices route to the current parent, liveness-aware (day-3 item 16) |
| #29 | `a23fcd7` | test(daemon): SIGTERM test spawns the daemon directly (no tsx relay) — day-3 15-FX |
| #30 | `ae7356b` | item 29b-T001: bind bridge-restart notifier deps + call-site sensor |
| #31 | `16a7c42` | fix(watchdog): projection = live fire clock · unknown never delivered · standby-aware stall threshold · sensor-signed notices (day-3 item 31) |
| #32 | `f3016b3` | item 24: Telegram transient-send recovery + durable bridge log (crash-safe, once-per-outage) |
| #33 | `5ef1220` | fix(daemon): launch as Node's direct child (no tsx relay); handle SIGHUP — day-3 item 32 |
| #34 | `3411794` | item 30: dead-routing / prime-resolution (retire last-speaker; alive-checked; guidance) |

Earlier foundation (before day 3, all live): the SQLite WAL queue, socket/RPC delivery, pointer path and sqlite default landed in merge `f14915b` (Amendment 4) — see the spec on AI-Substrate/pij#311.
