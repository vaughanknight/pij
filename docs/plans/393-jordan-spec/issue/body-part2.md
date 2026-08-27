> **Continuation (2 of 2)** of the spec in the issue body: sections 12–17 and Appendix A, verbatim from `docs/specs/claude-copilot-sqlite-sockets-comms.md` @ `0e7adee9`.

---

## 12. Doctrine — two rules that used to be one

Until 2026-08-27 the operating rule read "never inline a body; persist it and send a pointer". That compressed two independent rules, and the compression caused a real defect (the doc claimed the pointer path was universal while the code already sent bodies over sockets). They are now separate, and the separation is what a future transport must inherit correctly:

- **P1 — transport safety.** *A pty can clip a typed body.* Therefore, under a backend with a SQLite state machine (`sqlite`, the default, or `dual`), a seat with **no non-pty endpoint** receives only a short pointer, after the composer-idle guard, and pulls the body; `PIJ_QUEUE_BACKEND=fs` has no row to park a pointer against and still types the body (§7.4, G7). A seat with a channel that **cannot** clip terminal input — Claude inbox socket, Copilot `--ui-server` RPC, `pi` in-process — receives the **byte-exact body** over that channel. The pointer is the remedy for the clip; where the precondition is absent, so is the remedy.
- **P2 — persistence/audit.** *Packets and large bodies are written durably before the delivery they authorise.* Unchanged by P1; true on every transport. This is what `SqliteQueue.deliver` before any send, and `--body-file` for large agent-to-agent packets, implement.

P1 introduces **no body-size cap** on socket/RPC delivery (Claude's documented ceiling is ~1 MB per frame). Remote session-control commands stay on the typed path regardless (§6.2). The executable statement of P1 is the routing-invariant test (§6.2); the prose statement is `docs/how/pij.md:76-112` ("Delivery routing — body or pointer"). If you add a transport, add a case to that `describe` before you touch `drainTmuxInbox`.

---

## 13. Gotchas actually hit (field notes, in the order they bit)

Each entry: **symptom → cause → state on `ed20a68`**. "Fixed" means merged and tested; "open" points to §14.

**G1 — 1022-byte pty clip (Claude Code ≥ 2.1.246).** Multi-line bodies > 1022 B arrived as their last chunk only, unframed; the daemon reported `confirmed` because its oracle matched the surviving tail. Cause: kernel pty chunking + a composer regression that *replaces* on a short trailing multi-line chunk (§1). State: **fixed by construction** — Claude bodies go over the socket, everything else gets a ≤ ~60 B pointer; the typed path remains only for commands and the `fs` backend. Regression guard: routing-invariant tests + `sqlite-queue.test.ts:38` ("round-trips a 3 KB multi-line body byte-exact (the clipped-head failure)"). Do not reintroduce body typing for any harness "because it's short" — single-line safety was shown to be timing-dependent (report §2.4).

**G2 — `--context long_context` 400s on `gemini-3.6-flash`.** Every pinned Copilot model got `--context long_context` appended; Flash rejects it (HTTP 400) so the seat was unspawnable. Cause: a per-model capability emitted unconditionally. State: **fixed** — `COPILOT_NO_LONG_CONTEXT` deny-set (`EXT/core/models/registry.ts:83`), tri-state `ControlSpawnInput.longContext` (`spawn.ts:350`, `:468-470`; `undefined` ⇒ emit, `false` ⇒ suppress, so unknown models never silently lose the tier). **Still open**: a Flash seat spawned *without* the flag still 400s interactively — Flash is unusable as an interactive Copilot seat for a separate reason; use `gpt-5.6-sol` / terra. Revive never emitted the flag at all (follow-up).

**G3 — dual backend silently lost the pointer path and lease recovery.** `daemon.ts` gated "do we have a state machine?" on `this.channel instanceof SqliteQueue`, which is false for `DualWriteChannel` even though it wraps one. Under `PIJ_QUEUE_BACKEND=dual` a socketless seat got the **body typed** (the clip risk the pointer exists to avoid) and `recoverStaleClaims` never ran (no retry leg). Cause: type test instead of the `sqliteOf` unwrapper that exists for exactly this. State: **fixed** — `daemon.ts:1172` uses `sqliteOf(this.channel)`; a dual-backend test covers pointer + recovery; `docs/how/pij.md:90-93` footnote corrected (dual now behaves like sqlite; only `fs` types bodies). The remaining `instanceof SqliteQueue` at `daemon.ts:1628` picks which object's `resetClaimsOnStart()` to call (both branches reach the same `SqliteQueue`, so it is redundant, not a decision) and `:1629` picks the boot log label; neither gates behaviour. **Rule**: never `instanceof SqliteQueue` in decision code.

**G4 — at-least-once duplicate windows (W1/W2, §8).** A Telegram message can be sent twice: ack failed after a successful send (W1), or the daemon restarted while the bridge was mid-send and `resetClaimsOnStart` re-queued the bridge's claim (W2). Cause: send and ack are not one transaction; the boot reset is unscoped by `claim_token`. State: **documented as the contract** (`docs/how/pij-telegram.md`), bounded to rows in flight at that instant; token-scoped reset is open (§14).

**G5 — ForwardIncomplete: a failed text send must never ack.** The original forwarder closure swallowed every `deps.send` error ("log, continue"); a consumer acking after it resolved would have acked a message Telegram never received. Cause: at-least-once needs the handler to *reject* on partial delivery. State: **fixed** — `forwardOne` counts undelivered required text parts and throws (`bridge.ts:662-669`); tests drive the production closure with a rejecting `send`, proven live (a failed text send left the row `claimed`, lease recovery resent it).

**G6 — sender receipt lied for pull seats.** `pij send pij-telegram …` printed `delivered: peer was idle` while the row sat `queued`. Cause: `classifySendReceipt` tested raw `descriptor.deliveryMode === "pull"`; the bridge descriptor has `deliveryMode: null, paneId: null`. State: **fixed** — `effectiveDeliveryMode` in both `classifySendReceipt` and `daemonReceiptAuthoritative` (`cli.ts:2272`, `:707`), pinned by a pane-less descriptor test. A post-merge review found the mutation survived because fixture widenings removed the witness; a negative test was added (daemon tick fields must be *absent* for a pull seat).

**G7 — pointer path is SQLite-only.** Under `fs` a socketless seat still gets the body typed. Cause: no store to hold a "told, not read" row. State: **by design**, documented (`docs/how/pij.md:90-93`; live skill invariant scoped to the sqlite default). A doc once claimed the pointer rule was global — corrected.

**G8 — spawn-verification timeout fires before a slow Copilot first turn.** The round-trip check that a freshly spawned seat is alive (`E-CANARY-TIMEOUT`, `EXT/core/canary.ts:12, :211`) expired ~2 s before a Copilot seat's first-turn ack landed. Cause: fixed timeout vs. Copilot's boot latency. State: **open** as tooling ergonomics; the operational rule is *process args are the identity truth* (`ps -o command= -p <pid>`: `--session-id`, `--model`, `--effort`, `--ui-server --port`), never the seat's self-report or the timeout.

**G9 — the bridge never sweeps its own leases.** A failed row stays `claimed` until *the daemon's* `recoverStaleClaims` runs. Cause: single-sweeper design (deliberate: two sweepers would race). State: **documented**; a standalone bridge with no daemon has no retry leg.

**G10 — daemon restart strands the event-spine locks.** After a daemon stop/kill, `~/.pij/spine/write.lock` and `~/.pij/spine/events.lock` (two exclusive-create lock files under `~/.pij/spine/`: the machine-wide *platform write lock* `write.lock`, `EXT/adapters/platform-write-lock.ts:3, :44` — "never stolen; if its writer is dead, remove the file manually", `:123` — and the append-only NDJSON event log's `events.lock`, `EXT/adapters/spine-store.ts:10, :78`) remained owned by the dead pid, and **every** seat's spine writes failed with `E-NOREG … lock held` for minutes. Cause: no release on SIGTERM and no dead-pid reclaim. State: **open** (§14). Interim operator step after every restart: read the pid in each lock file; if dead, delete the file.

**G11 — CLI/daemon code skew after a fast-forward.** The global `pij` is an `npm link` symlink into the main checkout, so a merge is **live for every CLI invocation immediately**, while the daemon keeps running the code it booted with until restarted — and extension edits in a worktree do nothing to either. Daemon-side guards (anything in `loop.ts`/`daemon.ts`, e.g. the bind guard) are therefore not in force at merge time. Cause: two deploy events, neither announced. State: **operational** — record a restart when the daemon is actually restarted; `gh pr view --json state` answers "merged", nothing answers "running" except the daemon's own boot log line.

**G12 — 64 KiB stdout truncation on pipes.** `pij queue | head` etc. cut off at exactly 65,536 bytes. State: **fixed** (§9.4).

**G13 — mail for a dissolved seat typed into a stranger's pane.** ~10 min after a seat was closed, its still-`queued` preamble was typed into an unregistered Copilot pane of the same harness and that pane acted on it. Cause: (a) mail to a deliberately closed seat stayed open and retried; (b) pane resolution accepted any live pane of the harness. State: **fixed in two halves** — auto-retire on complete deliberate close + never inject for a `dissolved` descriptor (`daemon.ts:848-856`, incident replay test); one lifecycle-filtered pane resolver everywhere + a bind guard requiring the pane to run *this seat's own* session id (Copilot `--session-id`, Claude/Codex native session evidence) + a source sweep rejecting new ad-hoc `.paneId ===` resolvers. Four advisories remain (§14).

**G14 — `pij send "<body>"` executes backticks.** Three incidents in one day, one pasting 1,500 lines: a relayed body containing `` ` `` or `$( )` was expanded by the *sender's* shell before pij ran; the message delivered mangled with a success receipt. Cause: shell, not pij — pij's path is argv-only end to end. State: **rule** — every relayed body via `--body-file` from a quoted heredoc; a CLI guard refusing unescaped backticks is open.

**G15 — a second daemon stole the live daemon's pane taps.** `refreshPaneSignals` ran `tmux pipe-pane` on every pane of the tmux server, so an isolated test daemon on the default server disconnected the production daemon's output taps. State: **fixed** (taps only panes owned by a registered seat); the isolation recipe for any test daemon is still `tmux -L <private>` + `PIJ_HOME=<scratch>` + `PIJ_QUEUE_BACKEND=sqlite` + `TMUX="$(tmux -L <private> display -p '#{socket_path}'),0,0"` (report §11 "How to run it").

**G16 — Copilot accepts `session.send` while its first model turn is hung.** Once, after an MCP reload: a fresh seat returned a `messageId` and never processed it (0 AIC, pending). State: **fixed** — `probeCopilotReady` before the first RPC delivery per session (§7.2).

**G17 — backgrounded Copilot swallows Enter.** With tmux `focus-events on`, a pane you switched away from is in focus-OUT and Copilot ignores Enter-as-submit; typed text stranded in the composer. State: **fixed** on the typed path (`CSI I` focus-IN before typing and before each retry Enter, `daemon-tmux.ts:99-105, :488, :526-529`); irrelevant on RPC.

**G18 — `send-keys` argv cap.** A framed body > ~16,300 B fails with tmux `command too long` (`MAX_IMSGSIZE 16384`), threw, was re-enqueued unread, and retried every tick forever, blocking that seat's FIFO. Mechanism verified, never observed in production. State: **moot** for Claude/Copilot (no body typing); still theoretically reachable for `fs`-backend bodies and pathological commands.

**G19 — `unverified` consumes on the typed path.** A body typed but not confirmed is marked read (at-most-once), so a composer cleared by Esc/`/clear`/auto-compact loses it. State: **inherent to typing**; the reason the design moved off typing; still true for `fs` bodies. The pointer path deliberately does *not* consume (`settle injected` + lease).

**G20 — mid-turn arrivals are invisible to transcript tooling.** Claude turns a message queued during a turn into a `queued_command` attachment after the next tool result, not a `user` turn; `pij tail`'s transcript summariser renders only `user`/`assistant`. The model still sees it once. State: **known**; the socket path's `<cross-session-message>` wrapper gives structural provenance so a mid-turn arrival is never mistaken for the human; the LOAD benchmark's 14/50 transcript count is this effect, not loss.

**G21 — Claude socket `from-mode` is a self-assertion.** A frame claiming `from-mode="bypass"` is delivered to a bypass-permissions seat regardless of the real sender. Fine on a single-user box with 0600 sockets; not a security boundary. State: **open** — spawn seats with `--settings '{"crossSessionInbound":"accept"}'` so the hold logic is explicit rather than bypassed (§14).

**G22 — socket bind failure looks like "no socket".** A Claude session record without `messagingSocketPath` (bind failed, or one of the disabling env vars) silently routes to the pointer path. State: **by design** — `no-socket` ⇒ pointer is the safe fallback; watch the daemon log for a Claude seat that keeps taking pointers.

**G23 — the local Codex install was broken, then unauthenticated.** `@openai/codex@0.98.0` lacked its vendor binary (`spawn …/vendor/aarch64-apple-darwin/codex/codex ENOENT`); a later 0.148.0 ran but every call was 401 without `codex login`. State: the reason the Codex transport is design-only (§14).

**G24 — schema vs. design drift.** The review's DDL had `not_before`, `body_path`, `acked_seq`; the shipped schema (§3.2) does not. Anyone implementing backoff or large-body offload must add them; do not assume they exist because the design doc says so.

**G25 — daemon-delivered rows never park.** A pointer to a seat that never runs `pij inbox` is re-announced every 90 s **forever**: the daemon delivers from `listQueued` and settles with `settle(seq,"injected",{leaseMs})` (`daemon.ts:1174, :1243`) without ever calling `claim()`, and `claim()` is the only writer of `attempt` (`sqlite-queue.ts:371-378`; `settle` preserves it, `:385-403`). `recoverStaleClaims` parks only when `attempt ≥ 6` (`:437-443`), so a daemon row stays at `attempt 0` through every `redelivered` receipt. Consumer rows (§8) do go through `claim()` and do park. State: **open** — §14 item 21. Until fixed, retire a stuck pointer row by hand (`pij queue retire --to <id> --state queued,injected --reason …`).

---

## 14. Outstanding work

Ordered roughly by how much the comms path depends on it. Each item names the symptom, the fix shape, and where to start.

1. **Codex over the app-server socket (deferred; design exists).** Today: pointer only. Design: pij owns `codex app-server --listen unix://<PIJ_HOME>/<id>/codex.sock` and the pane runs `codex --remote unix://…`; the daemon is a second websocket client calling `turn/start` / `turn/steer`. Frame builders are done (§7.5). Three findings must be resolved first (`docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md`): (a) the socket-first gate in `loop.ts:657-663` needs a `codex` capability branch (a `codexRemoteSock` descriptor field, additive) with a RED routing test; (b) the spawn contract is one `{cmd,args,env}` process with no shell composition (`spawn.ts:145-149`), so "start app-server *and* the TUI" needs a pij-owned supervisor/sidecar with allocation, revive, teardown, orphan reap; (c) codex-cli 0.148 requires `initialize` first, `threadId` on every read/start/steer, and `expectedTurnId` **mandatory** on `turn/steer` (the builder makes it optional, `codex-rpc.ts:60`) — decide whether `harnessSessionId` is the thread id. Also needs `codex login` on the box and a `--ws-auth` decision. Proof plan and Python probe snippet: `reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md` §Codex.
2. **Token-scoped `resetClaimsOnStart`.** Boot currently re-queues every `claimed` row (`sqlite-queue.ts:408-423`), including a consumer's in-flight claim in another process (W2). Fix: reset only rows whose `claim_token` belongs to the daemon (its own token prefix), or record the claimant pid and reset only dead claimants.
3. **Spine-lock release/reclaim (G10).** `~/.pij/spine/write.lock` and `events.lock` outlive a killed daemon; every seat's event writes fail `E-NOREG … lock held`. Fix: release on SIGTERM; reclaim a lock whose recorded pid is dead (and append a spine note saying so). Related: queue/dispatch retire and un-retire should append a spine note (id, reason, actor, prior state) — today that history lives only in `receipts`/the dispatch record.
4. **Bridge `--skip-backlog`.** On restart the bridge forwards every `queued` row it finds (correct, but a long-dark bridge floods the phone). Add a flag/setting to retire (with reason) rather than forward rows older than a threshold at boot.
5. **Durable retry on Telegram API failure for media.** Text failures already retry through the lease (G5). Media gets one bounded retry then an echo to the sender; a durable retry would mean not counting a failed media part as handled — decide the contract first (a media-only message that can never send would otherwise park after 6 attempts, which may be the right answer).
6. **`crossSessionInbound: accept` at spawn (G21).** Add `--settings '{"crossSessionInbound":"accept"}'` to the Claude argv in `spawn.ts` (and revive) so delivery does not depend on the `from-mode` self-assertion. Verify Claude Code still honours the setting on the installed version.
7. **Hook-driven drain.** `pij inbox --inject` exists (§7.3) but pij installs no `SessionStart`/`UserPromptSubmit` hook for Claude or Copilot; a socketless seat only learns about mail when the daemon types a pointer and the model happens to act on it. Ship the hook files (Claude `settings.json` hooks; Copilot `~/.copilot/hooks/*.json` — note Copilot's `userPromptSubmitted` command-hook output is dropped, so use `sessionStart` `additionalContext` or the `notification`/`agentStop` hooks) and document them.
8. **`pij agent spawn` Copilot peers lack `rpcPort`.** Only the primary spawn and revive allocate a port; agent-pack peers fall to the pointer path (correct, slower). Plumb `pickFreePortSync` + `--ui-server` through `spawnAgentPane`.
9. **Card-write race (descriptor status fields).** The daemon's periodic `system-state` descriptor write carries a pre-read snapshot and can clobber a seat's own CLI status write (`statusAt`/`statusSeq`) that landed in between — evidence: a seat whose spine `status` event exists while its descriptor stayed at an older seq. Fix: merge-on-write for the status fields daemon-side, or CLI read-back-and-reapply. (Not on the message path, but the daemon's registry write path is shared with binding.)
10. **Watchdog/liveness notice routing.** Stall and liveness notices go to the seat's original spawner (`spawnedBy`), not its current `parent` link, so an adopted seat notifies the wrong session. Fix: route to `parent`, fall back to `spawnedBy` only when no parent.
11. **Bind-guard follow-ups (from G13).** (a) `isCopilotSessionId` has no direct test; (b) a bind refusal is silent and indefinite, and a probe that *cannot run* is treated as "foreign" — log it and distinguish indeterminate (retry with backoff) from foreign (refuse); (c) the resolver grep-sweep can be bypassed by reversed operands / destructuring / an allow-list window; (d) the sweep allow-list is disarmed on win32 (`endsWith` vs. `path.join` separators).
12. **Test ratchet on emitter text.** An integration test pins the *old* watchdog-nudge sentence and a doc is its only carrier, so the test is green when the doc is wrong and red when it is fixed. Fix: assert against the emitter's output (`buildWatchdogTurn`) minus its header; same stale quote in `docs/how/pij-watchdog.md`. (Pattern to avoid anywhere a test pins prose.)
13. **`pij send` backtick guard (G14).** Refuse (or warn on) a positional body containing unescaped `` ` `` / `$(` when stdin is a TTY, pointing at `--body-file`.
14. **Revive `--context long_context` (G2 follow-up).** `buildRevivedDescriptor`/revive argv never emits the flag; a revived Copilot silently loses the long-context tier. Reuse `resolveLongContext`.
15. **Flash interactive seats (G2).** `gemini-3.6-flash` still 400s interactively without the flag; root cause unknown. Until then treat it as headless-only.
16. **Option D — daemon socket for push.** `pij send` still relies on the ~600 ms tick to be noticed. The designed phase 2 (`c-durable-queue-design.md` §3, §7 "Wakeup path"): `<PIJ_HOME>/daemon.sock` (`net.createServer`, unlink-on-`ECONNREFUSED` at boot, keep the path < 103 bytes), `pij send` does insert+claim in one daemon event-loop turn on the socket and falls back to direct DB insert when the socket is absent, `subscribe` pushes `notify {to, seq}` to long-lived consumers, `pij tail -f` over receipts. No schema change needed.
17. **Lease extension for mid-turn recipients.** The pointer lease is a flat 90 s; a recipient in a long tool call gets re-pointed every 90 s (harmless: one line each, all acked at once by the next `pij inbox` — but unbounded, because daemon rows never increment `attempt`, G25). The review design borrowed the message-broker idea of an "in-progress" ack that extends the lease while pane signals show the recipient busy, instead of re-injecting. Add `not_before`/backoff if you do this (G24).
18. **Coalesced pointers.** `cursors.notified_seq` + `pointerLine(from, N)` exist for "N new — run: pij inbox --since <seq>"; the drain sends one row at a time. Batch per drain pass if pointer spam becomes a problem.
19. **Transcript-oracle CI.** The test matrix in `reports/pij-comms-review-2026-08-27.md` §10 (transcript-verified delivery of 500 B / 1.3 KB×12 / 2.6 KB / 3 KB×31 / single-line 1.3 KB bodies; receipt honesty; restart replay; event-spine completeness; a nightly multi-seat soak diffing sent ids against transcript-observed ids) is only partly encoded: restart replay and pty-chunk tests exist as unit tests; nothing runs a real `claude -p` in CI, and **no CI workflow currently runs any of the suite** — gates are run locally before merge.
20. **Archive/prune.** `messages`/`deliveries`/`receipts` grow forever. Add a prune of terminal rows older than N days by `seq` (keep `messages` if you want the audit).
21. **Attempt counting for daemon-delivered rows (G25).** `settle(seq,"injected")` never increments `attempt`, so `recoverStaleClaims` can re-queue a pointer row forever and `parked` is unreachable for it; a seat that never runs `pij inbox` gets a pointer every 90 s until retired by hand. Fix: have the daemon `claim()` before delivering (one code path for both consumers and the daemon, `resetClaimsOnStart` then covers it too), or increment `attempt` in `settle(...,"injected")`; add a test that a never-pulled pointer row parks.

---

## 15. Test map

| File | Covers | Named cases worth reading first |
|---|---|---|
| `EXT/adapters/sqlite-queue.test.ts` (379 lines) | store contract, leases, retire/unretire, summary, migration | `:38` 3 KB body byte-exact; `:120` crash between claim and inject is redelivered; `:150` settle(injected) keeps the row unacked until the recipient claims it; `:166` parks after maxAttempts; `:202` every mutator preserves terminality |
| `EXT/adapters/channel-factory.test.ts` | backend selection, `sqliteOf`, dual write | `:26` defaults to sqlite; `:70` finds the sqlite behind any backend; `:91` dual writes both under one id |
| `EXT/adapters/queue-consumer.test.ts` | §8 contract | all five (`:61`, `:96`, `:119`, `:158`, `:193`) |
| `EXT/adapters/claude-socket.test.ts` | frame, send, drop report, record resolution | `:70`, `:86`, `:98`, `:110`, `:124` |
| `EXT/adapters/copilot-rpc.test.ts` | RPC framing, errors, readiness | `:105`, `:119`, `:126`, `:134`, `:147` |
| `EXT/adapters/codex-rpc.test.ts` | frame builders only | `:15`, `:31`, `:49` |
| `EXT/core/daemon/loop.test.ts` (1513 lines) | routing | `:1171` socket-first; `:1281` copilot RPC; `:1308` pointer path; **`:1405-1513` routing invariant** |
| `EXT/adapters/daemon-tmux.test.ts` | typed path, outcomes, pointer log wording, `sendSocket` | search `pointer`, `UNVERIFIED`, `classifySendFailure` |
| `EXT/daemon.delivery.test.ts`, `EXT/daemon*.test.ts` | real-`Daemon` composition: `opts.kind` reaches the port, dual-backend pointer + recovery, auto-retire on deliberate close, dissolved-seat never injected (incident replay) | search `dual`, `retire`, `dissolved` |
| `EXT/telegram/bridge.test.ts` | sqlite forwarder: forwards once + acked after send; receipt not forwarded; backlog; production closure with a rejecting `send` stays claimed then resends after `recoverStaleClaims`; fs parity | search `sqlite` |
| `EXT/index.test.ts` | pi receiver on the consumer; fs parity; reload disposes the consumer | search `startQueueConsumer` |
| `EXT/core/cli.test.ts`, `EXT/core/inbox.sqlite.test.ts` | receipt classification incl. pane-less pull seat; `pij inbox` over sqlite | search `pull-inbox` |
| `EXT/cli.integration.test.ts` | real bin over a pipe: > 65,536 bytes of `pij queue` output | search `65_536` / `setBlocking` |

Run the repository's own gates, never ad-hoc `npx` compositions: `just typecheck` (`tsc --noEmit`), `just test [path/to/x.test.ts]` (vitest; the full pij extension suite is `just test .pi/extensions/pij/` — ~3,970 tests, ~15 skipped, ~1 min), and before declaring anything done or shipping, `harness checks` (the full deterministic gate: local-path portability → typecheck → lint → test → smoke → `pkg audit` → snapshots; `--quick` skips heavy smoke) — `justfile:74-86, 166-175`; `AGENTS.md:158-169`. Tests are written first, against fakes (`EXT/adapters/fakes.ts`), and reviewed by **mutation**: for every load-bearing hunk, revert or break it, re-run the named test, require RED, restore byte-identical, require GREEN — a green suite whose guards cannot be made to fail is treated as untested.

---

## 16. Operating notes

- **Inspect a delivery**: `pij queue --to <id>` (state + trail), or `sqlite3 ~/.pij/queue/pij.sqlite "select r.* from receipts r join messages m on m.seq=r.seq where m.id='<id>' order by r.id"`.
- **Inspect the transport**: daemon stderr — `queue backend: sqlite (…)` at boot; `route <id>: injected N message(s)`; `⚠️ claude SOCKET FAILED …`; `copilot NOT READY …`; `ℹ️ … pointer typed … submission unconfirmed …`; `retire <id>: N open deliveries retired (recipient closed)`.
- **Prove a Claude delivery**: the recipient's transcript `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` — look for the `<cross-session-message from="uds:pij-daemon" …>` content as a `user` turn or a `queued_command` attachment. **Never** take the model's own "I received …" as evidence.
- **Prove a Copilot delivery**: `~/.copilot/session-state/<uuid>/events.jsonl` — a `user.message` whose text is the framed body.
- **Which transport will a seat get?** `harness:"claude"` + a `~/.claude/sessions/<pid>.json` with `messagingSocketPath` ⇒ socket. `harness:"copilot"` + `rpcPort` on the descriptor (`pij list --json | jq '.[]|select(.id=="…")|.rpcPort'`) ⇒ RPC. Else pointer (sqlite/dual) or typed body (fs).
- **Run a second daemon safely** (tests, benchmarks): G15 recipe. Never point a second daemon at the production tmux server or `PIJ_HOME`.
- **After any daemon restart**: check both spine lock files (G10); confirm the boot log line shows the backend and the re-queued count; expect W2 duplicates for consumers that were mid-send.
- **Changing `SessionDescriptor`**: additive and migration-safe only — legacy descriptors must load. `rpcPort` is the model (`types.ts:254-256`).
- **Changing skill/prompt text** (`skills/pij/**`) is a production push: it is symlink-deployed to every agent on the machine the moment it lands.

---

## 17. Glossary

- **ack** — `deliveries.state='acked'`; the recipient (or the transport on its behalf) has taken the body. Terminal.
- **attempt** — per-row counter incremented **only by `claim()`** (consumer path); daemon-delivered rows keep `attempt` 0, so `parked` (attempt ≥ 6) applies to consumer rows only (G25).
- **claim / lease** — a time-boxed exclusive right to deliver one row (`claim_token`, `lease_until`).
- **composer** — the harness TUI's input box; the *composer-idle guard* refuses to type while a human is mid-sentence.
- **dual** — the rollout backend: SQLite truth + fs mirror.
- **framed body** — `[pij from <id>] <body>`.
- **inbox socket** — Claude Code's per-session Unix socket `/tmp/cc-socks/<pid>.sock`.
- **injected** — the recipient was *told* (pointer typed) but has not pulled; lease running.
- **parked** — open but exhausted (6 attempts); needs an operator.
- **pointer** — the one-line `… run: pij inbox` notice.
- **pull seat** — a session with no pane (or `deliveryMode:"pull"`); reads with `pij inbox`; the daemon never drains it.
- **retired / requeued** — operator or daemon terminal decision, and its reversal for `recipient-closed` only.
- **rpcPort** — descriptor field = Copilot `--ui-server` port = "this seat has an RPC endpoint".
- **seat** — one registered agent session (`~/.pij/<id>.json`).
- **seq** — global message rowid; per-recipient order.
- **settle** — daemon verb moving a row to `injected` (with lease) or back to `queued` (release).
- **spine** — the append-only NDJSON event log under `~/.pij/spine/` that `pij tail`/status use; unrelated to the queue except that it shares the daemon's lifecycle (G10).
- **tick** — the daemon's ~600 ms loop.
- **unverified** — typed, Enter unconfirmed; consumed for bodies, *not* for pointers.

---

## Appendix A — source index (all on `ed20a68`)

| Concern | File | Lines |
|---|---|---|
| Store, schema, state machine | `EXT/adapters/sqlite-queue.ts` | schema 93-131 · open 178-188 · deliver 219-260 · listUnread 265-278 · listQueued 284-292 · claimUnread/ack 302-353 · claim 359-381 · settle 385-405 · resetClaimsOnStart 408-423 · recoverStaleClaims 427-447 · retire 478-528 · unretire 533-561 · cursors 575-588 · importUnread 594-608 · summary 620-673 |
| Backend selection | `EXT/adapters/channel-factory.ts` | DEFAULT_BACKEND 44 · DualWriteChannel 56-102 · sqliteOf 106-110 · migrateFsInboxes 118-136 · openChannel 138-151 |
| Consumer | `EXT/adapters/queue-consumer.ts` | 22-74 |
| Claude socket | `EXT/adapters/claude-socket.ts` | resolve 43-65 · frame 92-107 · send 122-185 |
| Copilot RPC | `EXT/adapters/copilot-rpc.ts` | send 39-102 · readiness 117-173 |
| Codex builders | `EXT/adapters/codex-rpc.ts` | 42-79 |
| Daemon ports adapter (sockets + typed path) | `EXT/adapters/daemon-tmux.ts` | settle table 60-65 · sendSocket 272-327 · sendText 445-472 · sendTextUnchecked 477-565 |
| Pure routing | `EXT/core/daemon/loop.ts` | POINTER_LEASE_MS 51 · DaemonPorts 59-122 · composer guard 588-617 · pointerLine 622-626 · drainTmuxInbox 632-737 |
| Route decision / buffer | `EXT/core/daemon/router.ts` | injectionText 40 · route 77-87 · SendBuffer 99-176 |
| Daemon drain + boot | `EXT/daemon.ts` | auto-retire 848-856 · deliverPass 899 · per-seat drain 1169-1270 · boot/migrate/reset 1607-1639 |
| Framing | `EXT/core/message.ts` | frame 11-13 · parseFrame 16-23 · receiptBody 38-40 |
| `pij inbox` | `EXT/core/inbox.ts` | args 104-170 · consumeInbox 207-256 |
| `pij send` receipts, PIJ_SENDER, flush | `EXT/core/cli.ts` | daemonReceiptAuthoritative 707 · PIJ_SENDER 2008-2019 · classifySendReceipt 2263-2283 · effectiveDeliveryMode 2318-2322 · E-EMPTY 3356 |
| CLI bin entry (pipe flush) | `EXT/cli.ts` | setBlocking 4749-4750 |
| Spawn argv (Copilot flags, port) | `EXT/core/spawn.ts` | rpcPort/longContext inputs 347-350 · argv 455-508 · pickFreePortSync 1152-1161 |
| Revive re-allocates port | `EXT/core/revive.ts` | 51-53, 535-536 |
| Descriptor fields | `EXT/core/types.ts` | SessionDescriptor 175 · paneId 229 · harness 243 · deliveryMode 248 · harnessSessionId 252 · rpcPort 256 · lifecycle 274 · ReceiptState 577 |
| Outcome vocabulary | `EXT/core/ports.ts` | SendOutcome 47 |
| Init text telling a seat to `pij inbox` | `EXT/core/harness/claude.ts` | 158-161 |
| Long-context deny-set | `EXT/core/models/registry.ts` | 83 |
| Telegram forwarder | `EXT/telegram/bridge.ts` | startForwarder 558 · forwardOne 562-656 · sqlite branch 658-671 · fs branch 673-683 |
| pi receiver | `EXT/index.ts` | 320, 364-383 |
| Event-spine lock (`events.lock`) | `EXT/adapters/spine-store.ts` | 10, 78 |
| Platform write lock (`write.lock`) | `EXT/adapters/platform-write-lock.ts` | 3, 44, 58, 123 |
| Bind-health predicates (`pre-bind`, `bind-limbo`, `bind-failed`) | `EXT/core/bind-health.ts` | 30-47 |
| Operating guide | `docs/how/pij.md` | push/pull 61-73 · delivery routing 76-112 · queue inspection 114-152 · protocol 339-410 |
| Bridge guide | `docs/how/pij-telegram.md` | § Queue backend & restart semantics |
| Research + measurements | `reports/pij-comms-review-2026-08-27.md` (§1-13) and `reports/pij-comms-review-2026-08-27/{a-source-diagnosis,b-tmux-injection,benchmarks,c-durable-queue-design,d-prior-art,e-copilot-codex-ipc}.md` | — |
| Deferred Codex phase | `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md` | — |
