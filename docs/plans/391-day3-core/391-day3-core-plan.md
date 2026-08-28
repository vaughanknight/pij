# Day-3 core fixes — long_context gate · queue retire · dispatch retire · honest pointer warning · status-stale vs working
**Mode**: Full
**Plan Version**: 1.22.0
**Created**: 2026-08-27
**Status**: READY
**Spec source**: unified (this file)

ℹ️ No `research-dossier.md` (brief + implementer notes + two read-only scouts stand in; see § Key Findings). No `workshops/` yet.

## Business Specification

### Summary
Four small, independent gaps left by the comms merge (`f14915b`, main `2953d75`) make pij lie or block in ways a human must work around: (6) every pinned copilot model is spawned with `--context long_context`, which `gemini-3.6-flash` rejects (HTTP 400) — the model is unusable via `pij spawn`; (1) there is no operator verb to retire stale deliveries (the o-prime retired 138 migrated rows by a raw `UPDATE`), and mail queued to a seat that is later deliberately closed sits `queued` forever; (5) a pointer line whose Enter the daemon cannot confirm logs a loud `⚠️ UNVERIFIED … never confirmed submission` although the body is safe in the queue and is re-announced when its 90 s lease expires; (4) `pij report now --state working` is rejected with no remedy, and the briefed fix (exempt working seats from `status-stale`) would have deleted the detector — ruled **(c-remedy)** 2026-08-27T08:47Z: the rejection and the anomaly detail carry the remedy; predicates untouched. Each gap ships as its own PR off `main`, in the ruled order 6 → 1 → 1b → 5 → 4 — item **1b** (re-scope ruled 09:40Z) extends retire to platform DISPATCH records, which are what actually rot on the anomaly board (`delivered-unacked-stale`).

### Goals
- G-A `pij spawn --harness copilot --model gemini-3.6-flash` produces argv WITHOUT `--context long_context`; `gpt-5.6-sol` (and every other pinned copilot model) keeps it — behaviour for unknown models is unchanged (emit), never silent suppression.
- G-B `pij queue retire <filter> --reason "<text>"` moves matching sqlite deliveries to a terminal `retired` state, keeps the `messages` row, appends a `retired` receipt carrying the reason, and is idempotent; the daemon auto-retires open deliveries addressed to a seat whose close is **complete and deliberate** (`lifecycle === "dissolved"` AND `closeIntent` AND `terminal.disposition === "requested"`), never a pane-gone seat; and because `close → revive` is a supported flow (`core/revive.ts:577-612`), a revive **un-retires** rows retired with reason `recipient-closed` (ruled R-5 (a), 09:18Z) — operator-retired rows stay retired through a revive.
- G-B2 (item 1b) `pij dispatch retire <dispatch-id|--to <seat>> --reason "<text>"` moves a `delivered-unacked` (or `undelivered`) dispatch record to an additive terminal `retired` state with a written receipt; the complete-close sweep arm also retires the closed recipient's open dispatch records (reason `recipient-closed`); `pij revive` un-retires them under the R-5 guard; `pij anomalies` stops rendering retired dispatch rows.
- G-C A pointer-path send that types but cannot confirm submission no longer emits the alarming `⚠️ UNVERIFIED` line; it logs a calm, honest line naming the lease re-announce; outcome vocabulary, consumption (`injected` under `POINTER_LEASE_MS`), receipts and the composer-idle guard are byte-identical.
- G-D `pij report now --state working` still rejects (`E-ARG`) but the message carries its remedy; the `status-stale` anomaly detail carries the same remedy line; no predicate, `SemanticState`, or rail change.

### Non-Goals
- No change to the fs queue backend (retire is sqlite/dual only; fs users get a pointer to `rm ~/.pij/<id>/inbox/msg-*.json`).
- No change to `SEMANTIC_STATES`, `SystemState`, or the chainglass rail (spine 25457 asymmetry stands).
- No `SessionDescriptor` schema change in any item (all four are build-time or queue-side).
- `core/revive.ts` copilot `buildCommand` never emitted `--context` — left as-is, recorded as follow-up F-1.
- No live-daemon restart by this stream (baton `daemon-restart` is the o-prime's); live proofs run against an isolated `PIJ_HOME` + `tmux -L` only if the reviewer asks for one.
- Codex `--remote` (day-3 item 2) and pointer-doctrine relaxation (item 7) belong to s392.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-orchestration (platform records) | existing | **modify** | item 1b: dispatch record `retired` state (`core/platform/dispatch.ts`, `types.ts`), `pij dispatch retire`, anomaly skip |
| pij-control-plane | existing | **modify** | spawn argv composition (`core/spawn.ts`), models registry capability (`core/models/registry.ts`), CLI verbs (`cli.ts`), daemon tick sweep (`daemon.ts`), send-outcome warning (`adapters/daemon-tmux.ts`, `core/daemon/loop.ts`) |
| pij-messaging | existing | **modify** | SQLite delivery state machine gains terminal `retired` (`adapters/sqlite-queue.ts`) |
| pij-orchestration | existing | **modify** | PA capability classification for `queue` subverbs (`core/orchestration/pa-capability.ts`); status-stale predicate / `cardCanMislead` (`core/anomalies.ts`, `core/orchestration/role.ts`) |
| pij-skill | existing | **consume** | `skills/pij/**` is NOT edited; `docs/how/pij.md` operator docs updated |

### Testing Strategy
- **Approach**: Full TDD (house practice: `.test.ts` sibling per module, fakes in `adapters/fakes.ts`, mutation-gated review).
- **Rationale**: every seam is pure or fake-backed (`buildControlSpawnCommand` is pure; `SqliteQueue` runs on a tmpdir; daemon/loop have fake ports; `cardCanMislead`/`detectAnomalies` are pure). No live copilot/tmux needed to prove argv, state transitions, log wording, or predicate outcomes.
- **Focus Areas**: argv exactness (item 6); state-machine terminality + idempotence + receipt trail + sweep predicate (item 1); log wording per path with outcome/receipt invariance (item 5); PA scrape totality for `queue` subverbs; detector non-deletion (item 4).
- **Excluded**: live copilot 400 reproduction (environment-dependent; the argv is the contract), live daemon.
- **Mock Usage**: B — targeted; existing fakes/fake ports only, no new mocking framework.

### Documentation Strategy
- **Location**: B — `docs/how/` only: `docs/how/pij.md` (queue retire verb, pointer-warning wording), `docs/how/pij-models-discovery.md:99` (long-context law amendment); domain docs `docs/domains/{pij-messaging,pij-control-plane}/domain.md` concept rows (F-8).
- **Rationale**: operator-facing verbs and daemon log semantics live in the how-guides; README stays quick-start.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=0, F=1, T=1 (sum 5)
- **Confidence**: 0.85
- **Assumptions**: registry data for `longContext` is a curated in-file deny-set (no external catalog carries it — F-2); the sweep enumerates recipients from the queue, not `registry.list()` (F-3).
- **Dependencies**: none between items; s392 rebases after each merge. Base: `main@d2dbab0` (4 gov/docs commits over `2953d75`; `git diff 2953d75..d2dbab0 -- '.pi/extensions/pij/**/*.ts'` is empty, so every code citation on `2953d75` holds).
- **Risks**: see § Risks & Assumptions.
- **Phases**: 4 (one per item = one PR = one review checkpoint; the brief mandates one PR per item, so four phases is the floor, not ceremony).

### Acceptance Criteria
- AC-01 `buildControlSpawnCommand({harness:"copilot", model:"gemini-3.6-flash", longContext:false})` argv contains `--model gemini-3.6-flash` and NOT `--context`; `{model:"gpt-5.6-sol", longContext:true}` and `{model:"gpt-5.6-sol"}` (undefined) both contain `--context long_context`; `{harness:"claude", model:"x"}` never contains `--context`.
- AC-02 `resolveLongContext(known, "gemini-3.6-flash") === false` when `known` is the MERGED `loadModels()` order with the raw `github-copilot` entry FIRST and the remapped `copilot` entry second (duplicate-order test), AND when `known` is the offline snapshot only (no pi `models.json`), AND when `known` is empty — the curated deny-set is consulted by normalized bare id inside the resolver, independent of which registry entry `findKnownModel` returns; `gpt-5.6-sol` → `undefined`; an id absent from both registry and deny-set → `undefined` (today's emit). Every copilot-provider entry (`github-copilot` and `copilot`) for a denied id carries `longContext:false` post-merge (annotation for `pij models`). Proven at both bin resolve sites by an EXECUTABLE composition test in `cli.integration.test.ts` (fake-tmux harness, `:140-150`): `pij spawn --harness copilot --model gemini-3.6-flash` and `pij agent spawn … --model gemini-3.6-flash` both produce a final tmux `split-window`/`new-window` argv WITHOUT `long_context`, while `gpt-5.6-sol` retains it on both paths.
- AC-03 `SqliteQueue.retire({to:"pij-x"}, "stale")` → matching rows `state="retired"`, `claim_token`/`lease_until` NULL, one `retired` receipt with `detail="stale"` per row; `listQueued`/`listUnread` exclude them; a `queued` row for `pij-y` is untouched; second call returns `{retired:0}`; `ack`/`settle`/`claim`/`claimUnread`/`recoverStaleClaims` never move a `retired` row (terminal set `["acked","retired"]`). `parked` is classified OPEN-BUT-STUCK (not terminal): a retire with no `--state` filter matches `queued|claimed|injected|parked`; a `parked` row retires with its receipt trail intact; `stats()`/`summary()` count `retired` distinctly from `parked`.
- AC-04 `pij queue retire --to pij-x --reason "stale"` (sqlite backend) prints the count and receipt evidence; without `--reason` exits `E-ARG` with usage; on the fs backend exits with the `rm ~/.pij/<id>/inbox/msg-*.json` pointer; on the `dual` backend it resolves the SQLite source of truth via `sqliteOf(channel)` (`adapters/channel-factory.ts:96-101`), retires there, and best-effort mirrors an fs read-marker for each retired id (same advisory pattern as `DualWriteChannel.claimUnread`) so an old fs reader does not re-inject; `--dry-run` mutates nothing; `--json` emits `{retired, matched, reason}`.
- AC-05 Daemon tick sweep (`sqliteOf(this.channel)`, so sqlite AND dual): an open (`queued|claimed|injected|parked`) delivery to a descriptor with `lifecycle==="dissolved"` AND `closeIntent` AND `terminal.disposition==="requested"` is retired with reason `recipient-closed` on the next tick; NOT retired: (a) a descriptor dissolved by `unbindGonePane` (no `closeIntent`), (b) a LIVE descriptor carrying `closeIntent` but no `terminal` yet (the pre-dissolve window, `cli.ts:3550-3583` / `core/session.ts:482-520`), (c) a live seat's rows. AC-05b (R-5 (a)): fake-backed end-to-end `close → tick (retire recipient-closed) → revive → tick` — after `pij revive` re-registers the seat, rows retired with reason `recipient-closed` for that id are un-retired to `queued` with a `requeued` receipt whose detail carries the revive evidence (revived id + `revivePendingAt`/new pane), the next tick delivers each EXACTLY ONCE (no duplicate delivery to the revived seat), and rows retired for any other reason (e.g. `pij queue retire --reason …`) stay retired through the revive.
- AC-06 `pa-capability.test.ts` scrapes `queue` subverbs (`migrate`, `retire`) with an anti-vacuity floor; `queue retire` is classified `refuse` (mutating operator maintenance), `queue migrate` stays `allow`; `paCapabilityVerb("queue","retire") === "queue retire"`.
- AC-07 `DaemonTmux.sendText(pane, text, harness, pid, {kind:"pointer"})` on the exhausted-Enter fixture returns `"unverified"` (unchanged) and writes a stderr line that does NOT contain `UNVERIFIED`/`⚠️` and DOES name the lease re-announce; the same fixture without `kind` writes today's `⚠️ … UNVERIFIED` line verbatim; `describe("sendText outcome vocabulary (plan 071 D7)")` stays green.
- AC-08 `drainTmuxInbox` pointer path passes `{kind:"pointer"}` to `ports.sendText` (asserted via fake), still reports `{outcome, via:"pointer"}`, and `loop.test.ts:1260` composer-idle guard (Amendment 4) is unchanged.
- AC-08b The production `Daemon` port wrapper (`daemon.ts:283-290`) forwards the 5th `opts` argument to `rawPorts.sendText` — proven by a real-`Daemon` composition test whose raw-port fake records its arguments during a pointer-path delivery (a 4-arg wrapper is silently assignable to the widened port type, so only a composition test catches the drop).
- AC-09 `parseArgs`/`report now … --state working` → `E-ARG` whose message contains `pij report now "<did>" "<next>"` and `waiting|hold|blocked|question`; the status-stale anomaly `detail` contains the same remedy line; `cardCanMislead`/`role.ts` unchanged; a `systemState:"working"` + fresh `lastEventAt` + old `statusAt` pm seat STILL raises `status-stale`.
- AC-05c (incident 2026-08-27 cross-government pane misbind) Mail queued BEFORE a complete deliberate close is retired on the first tick after the close and is NEVER retried or re-announced afterwards: across ≥3 further ticks (with lease expiry elapsed) and with a NEW live pane carrying the closed seat's old `paneId` (recycled id), the daemon makes zero `sendText`/socket calls for that recipient; the drain also refuses to inject for any descriptor whose `lifecycle === "dissolved"` regardless of queue state (belt-and-braces guard in `drainInboxLocked`/`deliverPass`).
- AC-18 (s392 ticket, folded into item 5) With a `DualWriteChannel` as the daemon's channel, a queued message to a legacy (no socket/rpcPort) seat is delivered via the POINTER path (`via:"pointer"`, row settled `injected` under `POINTER_LEASE_MS`) and `recoverStaleClaims` runs each drain — i.e. `daemon.ts:1089` (and the `{ pointer: sq !== undefined }` at `:1137`) resolve the store via `sqliteOf(this.channel)`, never `instanceof SqliteQueue`; fs backend behaviour unchanged.
- AC-15 (item 1 add-on, o-prime 11:30Z) `pij queue` never silently truncates: unfiltered output of >64 KiB is emitted in full (root cause: `process.exit(0)` right after a large `stdout.write` drops the unflushed pipe buffer at 64 KiB — fix by setting `process.exitCode` and returning, or writing with a callback); default listing = the LATEST 200 rows with a trailing `showing 200 of M (latest) — --all for everything, --since <seq>, --tail N` line; `--all` lists everything; `--since <seq>` and `--tail N` filter; `--json` carries `{rows, total, shown}`; pinned by a test that writes >70 KiB through a pipe and asserts the last row is present.
- AC-11 `retireDispatch(d, {reason, actor, ts})` (pure, `core/platform/dispatch.ts`) → `state:"retired"`, `retirement:{reason, actor, ts}` on the record; idempotent on `acked`/`retired` (returns the record unchanged, `ok`); canonical JSON field order extended; `DISPATCH_STATES` gains `retired` additively (legacy records load).
- AC-12 `pij dispatch retire <id> --reason R` and `--to <seat> --reason R` write the retired record(s) via the dispatch store and print counts; missing `--reason` → `E-ARG`; `--json` emits `{retired, matched, reason}`; classified `refuse` in `pa-capability.ts` (ruled 09:48Z — PA is zero-actuator) and scraped by the exhaustive test.
- AC-13 The complete-close sweep arm (same predicate as AC-05) retires the closed recipient's `undelivered|delivered-unacked` dispatch records with reason `recipient-closed`; pane-gone and live-with-closeIntent seats untouched; `pij revive` un-retires ONLY `recipient-closed` dispatch retirements for the revived id (R-5 guard), restoring the prior state (`delivered-unacked` or `undelivered`) with a `requeued` stamp.
- AC-14 `detectAnomalies` never emits `delivered-unacked-stale` for a `retired` dispatch (fixture: a retired record older than the threshold → no row); a `delivered-unacked` record still flags.
- AC-10 Gates: `npx vitest run .pi/extensions/pij/` green per PR; `harness checks` at ship (KNOWN-RED `release-age-policy.test.ts` — `pwsh` absent — reported, not fixed); no `skills/pij/**` edits so `just pij-skill-check` is a no-op confirmation.

### Risks & Assumptions
| Risk | Note |
|---|---|
| `gemini-3.6-flash` spawned without `--context` may present a smaller context tier than the 1 M catalog value, so `pij canary --expect-model` context join could report `E-CANARY-CONTEXT` | Record in `docs/how/pij-models-discovery.md`; canary context join is opt-in; verify on first live spawn (o-prime's fleet) |
| A `retired` row that a mixed-version daemon (old code) reads | old `listUnread` filters `IN ('queued','claimed','injected')` so `retired` is invisible to it — safe; no schema DDL needed (state is free TEXT) |
| Widening `sendText` port | optional 5th param keeps 12 test fakes compiling |
| Item 4 premise | briefed option (b) deletes the detector — **ruled (c-remedy)**, gap closed |

### Open Questions
- R-5 **ruled (a)** 2026-08-27T09:18Z (see `rulings.md`; guards: un-retire only `recipient-closed`; `requeued` receipt + deliver-once end-to-end test). Evidence retained: Verified: `pij close` persists `closeIntent` BEFORE killing the pane and BEFORE writing `terminal` (`cli.ts:3550-3583`, `core/session.ts:482-520`), and `close → revive` is a supported flow (`planRevive` accepts dissolved/terminal seats, `core/revive.ts:577-612`; `buildRevivedDescriptor` strips `closeIntent`/`terminal`, `:670-690`; archived seats are still revivable). Candidates: **(a, recommended)** retire on COMPLETE deliberate close (dissolved + closeIntent + terminal.requested) and have `pij revive` un-retire `recipient-closed` rows for that id (`SqliteQueue.unretire`, receipt `requeued`) — keeps the brief's auto-retire, closes the race, honours revive; **(b)** ship the operator verb only, defer the auto-sweep to a follow-up plan (smaller PR; brief's second half not delivered); **(c)** retire on complete close and accept that a revived seat does not get pre-close mail (document it). Request: `reports/ruling-request-R5.md`.
- Scope check answered (`reports/scope-check-dispatch-records.md`): dispatch records are out of item 1's reach → **re-scope ruled (i)** 09:40Z → Phase 2b / item 1b added. PA class ruled 09:48Z: both retire verbs REFUSE for a PA (zero-actuator).
- R-4 (item 4) **ruled (c-remedy)** 2026-08-27T08:47Z — see `rulings.md` and `reports/ruling-request-R4.md` (evidence: `core/anomalies.ts:636-645`, `core/state.ts:120`).

### Workshop Opportunities
| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| none | — | all four items are scalpel cuts with verified seams; R-4 is a ruling, not a design space | — |

### Clarifications
#### Session 2026-08-27
- Q: Workflow mode? → **Full** (4 phases = 4 mandated PRs; source: brief "each = one PR", ruling O-2).
- Q: Testing strategy? → **Full TDD** with fakes (source: local orient "TDD with fakes… mutation-gated review").
- Q: Mock usage? → **B targeted** — existing `adapters/fakes.ts` / fake ports only.
- Q: Documentation? → **B docs/how only** (source: brief touch set names `docs/how/pij.md`).
- Q: Branching? → per-item branches off `main`, one PR each, no stack, order 6→1→5→4 (ruling O-2, `rulings.md`).
- Q: Fleet? → copilot `gpt-5.6-sol` xhigh coder + cross-model cold reviewer via `/pij pair`; canary effort mechanically (build-config pre-confirmation, `rulings.md`).
(No modal question UI was used — global invariant 9; every answer is sourced from a ruling or the orient stack.)

#### Session 2026-08-27 (re-entry, 08:47Z)
- Q (R-4): item 4 implementation, given option (b) deletes the detector? → **(c-remedy)** ruled by o-prime: remedy-bearing E-ARG at `core/cli.ts:1646` + same remedy line in status-stale detail; predicates untouched; NOT (c-alias); test pins reject+remedy. Brief text for item 4 superseded by this ruling. Phase 4, AC-09, G1 regenerated; Status → READY; Plan Version 1.1.0.

#### Session 2026-08-27 (re-entry, validate-v2 NEEDS ATTENTION, 09:05Z)
- Validator `reports/validate-v2-plan-01.md` (cold copilot gpt-5.6-sol, on sha 0c94a04d): F1 critical (close→revive mail), F2 high (Daemon wrapper drops `opts`), F3 high (deny-set on losing duplicate entry), F4 medium (dual/`sqliteOf`), F5 medium (`parked`). All five verified in source by the orchestrator.
- F2 → AC-08b + task 3.2b + `daemon.ts` in Phase 3 manifest. F3 → AC-02 rewritten (resolver consults deny-set; duplicate-order + offline tests). F4 → `sqliteOf` in 2.7/2.8, dual cases in AC-04/05, fs read-marker mirror on retire. F5 → `parked` classified open-but-stuck, retireable, not terminal.
- F1 → sweep predicate tightened to complete deliberate close (dissolved + closeIntent + terminal.requested) and ruling R-5 requested for the revive half (recommended (a): un-retire on revive). Status → DRAFT (G1 gap scoped to Phase 2 tasks 2.3b/2.8b); Plan Version 1.2.0.

#### Session 2026-08-27 (re-entry, R-5 ruled, 09:20Z)
- Q (R-5): close→revive mail semantics? → **(a)** ruled: retire on complete deliberate close; revive un-retires ONLY `recipient-closed` rows, writing `requeued` receipts with revive evidence; end-to-end deliver-once test. AC-05b, tasks 2.3b/2.8b regenerated; G1 PASS; Status READY; Plan Version 1.3.0.
- Scope check (not a ruling) recorded in § Open Questions; answered at the next checkpoint.

#### Session 2026-08-27 (re-entry, re-scope (i), 09:42Z)
- Q: dispatch records? → re-scope **(i)** ruled: item 1b / Phase 2b added (AC-11..14, tasks 2b.1–2b.10, PR `s391/item1b-dispatch-retire`); order 6 → 1 → 1b → 5 → 4; PA class REFUSE (ruled 09:48Z, superseding the earlier ALLOW note); revive un-retires dispatches under the R-5 guard (ruled). Plan Version 1.4.0; Status READY.

#### Session 2026-08-27 (re-entry, validate-v2 delta NEEDS ATTENTION, 10:05Z)
- Validator-2 (`reports/validate-v2-plan-02.md`, on 89deeb77): F2/F4/F5 CLOSED, F3 core closed; one HIGH — Phase 1 task 1.5 not implementable as written (`spawnAgentPane` has no registry in scope) and no test crosses the CLI composition boundary. Applied its smallest fix verbatim: task 1.5 rewritten with explicit plumbing, new RED task 1.5a (fake-tmux composition test for both spawn paths), AC-02 verification row gains `cli.integration.test.ts`. Base note updated to `main@d2dbab0`. Plan Version 1.5.0; Status READY.

#### Session 2026-08-27 (add-on, 11:35Z)
- O-prime add-on to item 1: `pij queue` unfiltered listing truncates at 709 rows. Orchestrator found the cause (exit-before-flush at 64 KiB, `cli.ts runQueue`). AC-15 + task 2.8c added to Phase 2 (same PR). Plan Version 1.6.0.

#### Session 2026-08-27 (class-fix ruling, 11:45Z)
- O-prime: fix the CLASS at the shared seam, own small PR first. 137 `process.exit(` sites in the bin; async-flush replacement is unsafe (non-`never` control flow), so the class fix is blocking stdio on pipes at `main()` entry. Phase 1a + AC-16 added; PR #2 (item 6) merged → main 5445c85. Plan Version 1.7.0.

#### Session 2026-08-27 (incident + item 6b, 12:05Z)
- Incident (cross-government pane misbind): AC-05c + tasks 2.3c/2.8d added to Phase 2 (retire at first tick after complete close; drain never injects for a dissolved descriptor). Item 6b added as Phase 2c (after 1b): isolate Flash interactive 400 outside tmux; fix or honest catalog mark; AC-17. Order 6 → 1a → 1 → 1b → 6b → 5 → 4. Plan Version 1.8.0.

#### Session 2026-08-27 (s392 ticket, 12:40Z)
- Finding C (s392): `daemon.ts:1089` `instanceof SqliteQueue` disables pointer path + stale-claim recovery under `dual`. Folded into Phase 3 as task 3.4b + AC-18 (dual-backend fake test). Plan Version 1.9.0.

#### Session 2026-08-27 (item 13 + order, 16:35Z)
- O-prime: item 13 (descriptor lost-update race) added as Phase 5 after 6b; order 6 → 1a → 1 → 5 → 1b → 4 → 6b → 13 (5 before 1b ruled 15:55Z to unblock s392 item 10b). Plan Version 1.10.0.

#### Session 2026-08-27 (item 15, 18:40Z)
- O-prime: item 15 (stale spine write-lock: release on shutdown + dead-pid reclaim) added as Phase 6 after 13 (evidence DL-006). Plan Version 1.11.0.
- 18:50Z widened to both lock layers (`events.lock` blocked journal replay right after `write.lock` was cleared). Plan Version 1.11.1.

#### Session 2026-08-27 (item 16, 19:00Z)
- O-prime: item 16 (watchdog notice routing → current `parent`) added as Phase 7 after 15; AC-21. Plan Version 1.12.0.

#### Session 2026-08-28 (1b acceptance follow-ups, 03:05Z)
- Item 1b live acceptance met. Ruled: spine note on dispatch retire/un-retire + "0 open (N already retired)" wording fold into item 15 (Phase 6 task 6.3b, AC-20b). Plan Version 1.12.1.

#### Session 2026-08-28 (item 19, 05:10Z)
- O-prime: item 19 (pointer rows never park) added as Phase 8 after 16; AC-22. Plan Version 1.13.0.

#### Session 2026-08-28 (6b isolation result, 08:00Z)
- Isolation matrix (copilot CLI 1.0.81-14, outside tmux, 8 rows): Flash 400s on ALL paths incl. `-p`; Sol passes all. Verdict upstream → honest catalog mark; AC-17 corrected (no `-p` remedy). Plan Version 1.13.1.
- 08:20Z final ruling: discrepancy carried (o-prime's `-p` success 07:33Z vs matrix 16:0xZ) → instability wording with both observations. Plan Version 1.13.2.

#### Session 2026-08-28 (items 25/26, 12:30Z)
- O-prime (encode E19/E20 from DL-008/DL-009): item 25 (busy-but-wedged stall detection) as Phase 9, item 26 (pane move ≠ death) as Phase 10; order 13 → 15 → 16 → 19 → 25 → 26. Plan Version 1.14.0.
- 13:55Z: item 25 widened with the inverse case (pane-buffer growth = activity; DL-010). Plan Version 1.14.1.

#### Session 2026-08-28 (item 27, 14:50Z)
- O-prime (E21): item 27 (`pij tail --type` filter) as Phase 11 after 26; AC-25. Plan Version 1.15.0.

#### Session 2026-08-28 (item 28, 15:05Z)
- O-prime (E25): item 28 (dead relay sends queue-with-note) as Phase 12 after 27; AC-26. Plan Version 1.16.0.
- O-prime (E32, 21:5xZ): item 31 (watchdog projection + unknown never delivered) as Phase 13 after 15; AC-27/AC-28. Plan Version 1.17.0.
- O-prime (22:05Z) amendment to item 31, same packet: legacy stall threshold ignores the seat's watchdog interval → tasks 13.5/13.6, AC-29. Plan Version 1.17.1.
- O-prime (22:1xZ, E26/E33) amendment to item 31: sensor notices signed as the observed seat → task 13.7 (six sites), AC-30. Plan Version 1.17.2.
- O-prime (23:5xZ, E22): 15-FX — item 15's real-SIGTERM child test flakes 1/7 (tsx relay race) → Phase 14 before 31; AC-31. Plan Version 1.18.0.
- O-prime (01:0xZ, from 15-FX reviewer F-2): item 32 — production daemon must not die by the tsx relay → Phase 15 after 31, pre-tag; AC-32. Plan Version 1.19.0.
- O-prime (02:0xZ, DL-018): item 33 — resurrect the plan-055 watchdog smoke proof (three layered drifts) → Phase 16 after 32, not pre-tag; AC-33. Plan Version 1.20.0.
- O-prime (04:2xZ): item 34 — queue hygiene (pseudo-seat receipts; sweep covers every terminal liveness; `pij queue` stale line) → Phase 17 after 33, low; AC-34. Plan Version 1.21.0.
- O-prime addendum (04:4xZ) + survey: termite's rows were blocked by a STALE `revivePendingAt` (exemption unbounded); terminal watcher entries dropped by the same sweep; `pij watchdog status` marks terminal watchers. Plan Version 1.21.1.
- O-prime (04:5xZ): item 31b — legacy stall sensor reads the subtree (active child ⇒ parent not stalled) → Phase 18 after 34, low; AC-35. Plan Version 1.22.0.
- Review-01 (6b): APPROVE-WITH-FINDINGS; F-1 the shipped stamp was future-dated (local date + UTC clock) — corrected to 2026-08-27 UTC in FX-01; the same slip is corrected in this plan text.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved
- Open rulings: none (R-4, R-5, re-scope (i), PA class ruled). Both retire verbs REFUSE for PA.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | two read-only scout reports folded into § Key Findings |
| workshops/*.md | n | — |
| implementer notes (`~/.pij/pij-primitive-toucan/day3-implementer-notes.md`, sha `7fe92b57…`) | y | entry points + first tests; path corrected (`daemon.ts` is at extension root) |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | R-4 and R-5 ruled; no markers remain |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` (harness.md/agent-harness.md are not layer rules) |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | test tasks precede implementation in every phase; criteria measurable |
| G7 | Domain Completeness | PASS | 3 modify + 1 consume, all in `docs/domains/registry.md`; manifest covers every file in task tables |

### Summary
Four disjoint seams, each proven by a pure or fake-backed unit test first, each its own PR off `main`. Item 6 threads a tri-state `longContext` from a curated registry deny-set into the pure spawn builder at both bin sites. Item 1 adds a terminal `retired` delivery state with a terminal-set guard, an operator verb, a tick-scope sweep keyed on deliberate close (never bare dissolved), and closes the PA-classification hole for `queue` subverbs. Item 5 makes the adapter path-aware via an optional `kind` arg so the pointer path logs honestly with no semantic change. Item 4 is ruled (c-remedy): remedy-bearing rejection + anomaly detail, predicates untouched, plus a fixture that pins the detector cannot be deleted silently.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | contract | `ControlSpawnInput.longContext?`; gate at :463 |
| `.pi/extensions/pij/core/spawn.test.ts` | pij-control-plane | internal | argv pins (:453-480 change; new cases) |
| `.pi/extensions/pij/core/models/registry.ts` | pij-control-plane | contract | `ModelEntry.longContext?` + curated deny-set |
| `.pi/extensions/pij/core/models/registry.test.ts` | pij-control-plane | internal | deny-set + default pins |
| `.pi/extensions/pij/core/models/validate.ts` | pij-control-plane | contract | `resolveLongContext(known, model)` beside `findKnownModel` |
| `.pi/extensions/pij/core/models/validate.test.ts` | pij-control-plane | internal | resolver pins |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | resolve at :2606 + :3995; `runQueueRetire`; `queue` subverb switch at :4475 |
| `.pi/extensions/pij/cli.integration.test.ts` | pij-control-plane | internal | `pij queue retire` CLI pins |
| `.pi/extensions/pij/adapters/sqlite-queue.ts` | pij-messaging | contract | `retired` state, `TERMINAL` set, `retire()`, header diagram |
| `.pi/extensions/pij/adapters/sqlite-queue.test.ts` | pij-messaging | internal | terminality/idempotence/receipt pins |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Phase 2: `retireForClosedRecipients()` in `tickLocked` via `sqliteOf`; Phase 3: port wrapper `:283-290` forwards `opts` |
| `.pi/extensions/pij/daemon.test.ts` | pij-control-plane | internal | Phase 3: real-`Daemon` composition test (AC-08b) |
| `.pi/extensions/pij/adapters/channel-factory.ts` | pij-messaging | contract | `sqliteOf` consumed (read-only) by `pij queue retire` and the sweep |
| `.pi/extensions/pij/core/revive.ts` / `cli.ts` revive bin (`:1976`, `:2190-2300`) | pij-control-plane | internal | Phase 2 (R-5 a): un-retire `recipient-closed` rows on revive; Phase 2b: same for dispatch records |
| `.pi/extensions/pij/core/platform/types.ts` | pij-orchestration | contract | Phase 2b: `DISPATCH_STATES += retired`, `retirement?` |
| `.pi/extensions/pij/core/platform/dispatch.ts` (+test) | pij-orchestration | contract | Phase 2b: `retireDispatch`/`unretireDispatch` |
| `.pi/extensions/pij/core/cli.ts` (dispatch verbs `:4404-4698`) | pij-control-plane | internal | Phase 2b: `pij dispatch retire` |
| `.pi/extensions/pij/daemon.delivery.test.ts` | pij-control-plane | internal | sweep predicate pins (closed vs pane-gone) |
| `.pi/extensions/pij/core/orchestration/pa-capability.ts` | pij-orchestration | contract | `paCapabilityVerb` maps `queue` subverbs; classifications |
| `.pi/extensions/pij/core/orchestration/pa-capability.test.ts` | pij-orchestration | internal | `queueSubverbs()` scrape + floor |
| `.pi/extensions/pij/adapters/daemon-tmux.ts` | pij-control-plane | contract | `sendText(..., opts?: {kind?})`; honest pointer line |
| `.pi/extensions/pij/adapters/daemon-tmux.test.ts` | pij-control-plane | internal | wording-per-path pins |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | contract | port signature :71; pass `{kind:"pointer"}` at :647 |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | pij-control-plane | internal | pointer-path fake asserts `kind` |
| `.pi/extensions/pij/core/cli.ts` | pij-control-plane | internal | Phase 4: `--state working` remedy text at :1646 |
| `.pi/extensions/pij/core/cli.test.ts` | pij-control-plane | internal | Phase 4 pins |
| `.pi/extensions/pij/core/anomalies.ts` | pij-orchestration | internal | Phase 4: status-stale detail remedy line |
| `.pi/extensions/pij/core/anomalies.test.ts` | pij-orchestration | internal | Phase 4 pins; adds a `systemState:"working"` fixture (detector-non-deletion guard) |
| `.pi/extensions/pij/core/orchestration/role.ts` | pij-orchestration | contract | Phase 4: UNTOUCHED (ruled) — listed so the reviewer checks it stayed so |
| `docs/how/pij.md` | — (docs) | internal | queue retire; pointer-warning wording; report/working remedy |
| `docs/how/pij-models-discovery.md` | — (docs) | internal | amend the "always include `--context long_context`" law at :99 |
| `docs/domains/pij-messaging/domain.md` | pij-messaging | contract | add `adapters/sqlite-queue.ts` source row + `Delivery state machine` concept |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | `Model registry entry` shape row (:110) gains `contextWindow?`, `longContext?` |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `status-stale` already gates on FRESH `lastEventAt` (`core/anomalies.ts:636-640`) and `systemState:"working"` means "event age ≤ 60 s" (`core/state.ts:120`); option (b) exempts the detector's entire target population and the suite stays green (`anomalies.test.ts:31-40` fixture omits `systemState`) | Ruled (c-remedy); Phase 4 implements it; the missing `systemState:"working"` fixture ships so the detector cannot be deleted silently |
| 02 | Critical | `lifecycle:"dissolved"` is also written by `unbindGonePane` (`daemon.ts:168-180`) which deliberately leaves mail "for a revive"; deliberate closes additionally write `closeIntent` + `terminal.disposition:"requested"` (`cli.ts:3572-3583`); `registry.list()` filters dissolved out (`adapters/fs-registry.ts:277`) | Sweep predicate = `closeIntent !== undefined ‖ terminal?.disposition === "requested"`; enumerate recipients from the queue (`SELECT DISTINCT to_id … state IN (queued,claimed,injected)`) then `registry.read(to)`; run in `tickLocked` (`daemon.ts:367-390`), NOT `drainInboxLocked` (never visits dissolved seats; `recoverStaleClaims` selects only leased rows `sqlite-queue.ts:403-406`) |
| 03 | High | `ack()`/`settle()` guard only `'acked'` (`sqlite-queue.ts:317-324`, `:365`); all state filters are SQL literals; only `stats()`'s `Record<DeliveryState,…>` (`:428-435`) breaks at compile time; `state` column has no CHECK, no `user_version` | `const TERMINAL = ["acked","retired"]` used by `ack/settle/claim/claimUnread/recoverStaleClaims`; `retire()` NULLs `claim_token`/`lease_until`; exhaustive render map in `runQueue` (`cli.ts:637-647`); update header diagram (`:8-11`) |
| 04 | Critical | `ModelEntry` has no capability field; `contextWindow` cannot discriminate (`gemini-3.6-flash` and `claude-opus-5` both 1 000 000; gpt-5.6 aliases carry none) (`core/models/registry.ts:16-36`, `.pi/models.json`); `loadModels()` degrades offline to a 3-id snapshot (`:248-250`) | `ModelEntry.longContext?: boolean` from a curated deny-set `COPILOT_NO_LONG_CONTEXT = ["gemini-3.6-flash"]` (pattern: `COPILOT_GPT56_LEVELS` `:74`); absent ⇒ `undefined` ⇒ today's emit (warn-don't-block law, `docs/domains/pij-control-plane/domain.md:26`) |
| 05 | High | `buildControlSpawnCommand` has 3 call sites — `cli.ts:2606` (threads `rpcPort`), `cli.ts:3995` (agent spawn; `loadModels()` in hand at `:3892`/`:4080`), `core/focus.ts:330` (pure core, no registry); `revive.ts:525-538` never emits `--context` today | tri-state `longContext?`: `undefined` = today's behaviour (focus untouched), `false` suppresses; resolve at both bin sites via `resolveLongContext(findKnownModel(...))` (`core/models/validate.ts:13-20`); revive = follow-up F-1 |
| 06 | Critical | `paCapabilityVerb` maps subverbs only for `chore` (`pa-capability.ts:295-298`); a `queue retire` routed as `process.argv[3]` matches none of the scrape patterns (`pa-capability.test.ts:50-60`) → a mutating verb inherits `queue: ALLOW` with a green build — the exact hole `:281-293` documents | map `queue` subverbs like `chore`; `"queue retire": refuse(...)`, `"queue migrate": ALLOW`; `queueSubverbs()` scrape with anti-vacuity floor; refactor `cli.ts:4475-4481` to a `switch (process.argv[3])` so the scrape has a real switch |
| 07 | High | The `UNVERIFIED` line is written inside `sendTextUnchecked` (`daemon-tmux.ts:540-551`) with no caller context; `loop.ts` is pure (no stderr); the pointer path never reaches `emitSendReceipt` (`daemon.ts:1155-1163` `continue`s first) so receipts are unaffected; no test asserts the string; pointers hit `unverified` after ONE Enter because the short tail can't be matched (`daemon-tmux.ts:150-154`, `:527`) | optional 5th arg `opts?: { readonly kind?: "pointer" \| "body" }` on port (`loop.ts:71`) + adapter (`:445/:471`); set only at `loop.ts:647`; swap the prefix/wording for pointers; outcome word untouched (`daemon-tmux.test.ts:511-527` guard) |
| 09 | High | `Daemon` wraps `sendText` with a 4-arg lambda (`daemon.ts:283-290`) — a widened port type accepts it silently, so `{kind}` never reaches `DaemonTmux` (validator F2) | Phase 3 widens the wrapper and adds a composition test (AC-08b) |
| 10 | High | `loadModels()` returns raw `github-copilot` entries BEFORE the remapped `copilot` seed (`registry.ts:284-323`); `findKnownModel` (`validate.ts:13-19`) returns the first, so a deny-set applied only in the seed/snapshot is invisible (validator F3) | resolver consults the deny-set by normalized bare id; post-merge annotation of ALL copilot-provider entries; duplicate-order + offline tests (AC-02) |
| 11 | Critical | `closeIntent` precedes `terminal` and `close → revive` is supported (`cli.ts:3550-3583`, `core/session.ts:482-520`, `core/revive.ts:577-612,670-690`) — a sweep keyed on close evidence alone races the close and strands revived seats (validator F1) | predicate = complete deliberate close; un-retire on revive; R-5 ruling (AC-05, AC-05b) |
| 12 | Medium | `pij queue` and the drain narrow with `instanceof SqliteQueue` (`cli.ts:614`, `daemon.ts:1089`) which excludes `DualWriteChannel`; `sqliteOf` exists for exactly this (`channel-factory.ts:96-101`) (validator F4) | 2.7/2.8 use `sqliteOf`; dual mirrors an fs read-marker on retire (AC-04/05) |
| 13 | Medium | `parked` (`sqlite-queue.ts:38, :397-437`) had no retirement semantics (validator F5) | classified open-but-stuck: retireable by operator and sweep; not terminal (AC-03/05) |
| 08 | High | No domain doc mentions `sqlite-queue.ts`/`pij queue`; `pij-control-plane` `Model registry entry` row (:110) is already stale (omits `contextWindow`); no domain claims status cards | doc rows in Phases 1–2; status-card ownership recorded as gap F-2 (not claimed by this stream) |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Item 6 — gate `--context long_context` per model | pij-control-plane | `gemini-3.6-flash` spawns without the flag; everything else unchanged | None — **SHIPPED PR #2, merged 5445c85** |
| 1a | Item 1a — stdout flush before exit (class fix) | pij-control-plane | no verb truncates piped output at 64 KiB | None (ruled 11:40Z; lands before Phase 2) |
| 2c | Item 6b — Flash interactive 400 under `--ui-server` | pij-control-plane | isolate; fix or honest catalog mark | (re-ruled order 6 → 1a → 1 → 5 → 1b → 4 → 6b → 13) |
| 5 | Item 13 — descriptor lost-update race (daemon system-state vs CLI card write) | pij-control-plane | card writes survive an interleaved daemon write | after 6b; dossier when reached |
| 6 | Item 15 — stale spine write-lock: release on shutdown + dead-pid reclaim | pij-control-plane | a killed daemon can never block spine writes machine-wide | after 13; dossier when reached |
| 7 | Item 16 — watchdog notices route to the current `parent` link | pij-control-plane | an adopted seat's stall/liveness notice reaches its governing parent | after 15; dossier when reached |
| 8 | Item 19 — pointer-path rows park after N re-announcements | pij-control-plane / pij-messaging | a never-read pointer stops being re-announced forever | after 16; dossier when reached |
| 9 | Item 25 — busy-but-wedged stall detection (static buffer + composer queue) | pij-control-plane | a wedged copilot turn with queued inputs raises a stall, never reads `working`/`paused (compact)` | after 19; dossier when reached |
| 10 | Item 26 — death reconciler: pane move ≠ death | pij-control-plane | a `join-pane`/window change re-probes after a grace and reports `moved` | after 25; dossier when reached |
| 11 | Item 27 — `pij tail --type` actually filters | pij-control-plane (CLI) | `--type receipt` returns receipt lines only; unknown type errors | after 26; dossier when reached |
| 12 | Item 28 — sender preflight: dead RELAY seats queue-with-note, not E-DEAD | pij-control-plane (CLI) · pij-messaging | a message to a dead bridge drains on revive instead of being lost | after 27; dossier when reached |
| 2 | Item 1 — `pij queue retire` + closed-recipient sweep | pij-messaging | terminal `retired` state, operator verb, deliberate-close sweep, PA totality | None (sequenced after 1 by ruling) |
| 3 | Item 5 — honest pointer-path UNVERIFIED line | pij-control-plane | path-aware wording, zero semantic change | None (sequenced after 2) |
| 4 | Item 4 — `--state working` remedy (ruled c-remedy) | pij-orchestration | rejection + anomaly detail carry the remedy; detector untouched | None (sequenced after 3) |
| 2b | Item 1b — dispatch record retire (re-scope (i)) | pij-orchestration | `retired` dispatch state, verb, close-sweep arm, anomaly skip | Phase 2 (reuses sweep + un-retire guard); sequenced 6 → 1 → 1b → 5 → 4 |

#### Phase 1: Item 6 — gate `--context long_context` per model

**Objective**: Emit `--context long_context` only for copilot models not known to reject it, resolved from the registry at the bin, with the pure builder unchanged in default behaviour.
**Domain**: pij-control-plane
**Delivers**: `ModelEntry.longContext?`; curated `COPILOT_NO_LONG_CONTEXT`; `resolveLongContext()`; `ControlSpawnInput.longContext?` (tri-state); both bin sites resolved; docs amended.
**Depends on**: None
**Key risks**: silent suppression for unknown models — pinned by AC-01/02 (undefined ⇒ emit).
**Branch / PR**: `s391/item6-long-context` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | TEST `core/spawn.test.ts`: rewrite `:471-480` to the tri-state contract; add `longContext:false` omits `--context`; `undefined` keeps it; claude/codex never emit | pij-control-plane | RED on base | AC-01; mirror `:1572-1591` shape |
| 1.2 | TEST `core/models/registry.test.ts` + `validate.test.ts`: `resolveLongContext` → `false` for `gemini-3.6-flash` in (i) merged order with raw `github-copilot` entry first, (ii) offline snapshot only, (iii) empty registry; `gpt-5.6-sol` → undefined; unknown id → undefined; post-merge every copilot-provider entry for a denied id carries `longContext:false` | pij-control-plane | RED | AC-02; findings 04, 10 |
| 1.3 | IMPL `core/models/registry.ts`: `longContext?: boolean` on `ModelEntry`; exported `COPILOT_NO_LONG_CONTEXT` deny-set; post-merge annotation in `loadModels()` of every `github-copilot`/`copilot` entry whose normalized id is denied; `core/models/validate.ts`: `resolveLongContext(known, model): boolean \| undefined` = entry annotation ?? deny-set lookup by normalized bare id ?? undefined | pij-control-plane | 1.2 GREEN | keep `absent ⇒ undefined`; finding 10 |
| 1.4 | IMPL `core/spawn.ts`: `readonly longContext?: boolean` beside `rpcPort` (`:346-348`); `:463` → `if (harness==="copilot" && model!==undefined && input.longContext !== false)`; doc comment `:408-410` | pij-control-plane | 1.1 GREEN | finding 05 |
| 1.5a | TEST (RED first) `cli.integration.test.ts`: composition through the fake-tmux harness for BOTH `pij spawn` and `pij agent spawn` — `gemini-3.6-flash` final argv omits `long_context`; `gpt-5.6-sol` retains it | pij-control-plane | RED on base | validator-2 HIGH; AC-02 |
| 1.5 | IMPL `cli.ts`: peer spawn `:2606` — `resolveLongContext(known, model)` in `runSpawn` scope, `...(lc === false ? { longContext: false } : {})`; agent spawn — resolve in `runAgentSpawn` (`:4080` `models`), add `longContext?: boolean` to the `spawnAgentPane` plan parameter (`:3939-3946`), pass it at `:4162`, forward to the builder at `:3995` | pij-control-plane | 1.5a GREEN | `core/focus.ts:256-257` rejects copilot before its builder call; revive never emitted `--context` — both out of scope |
| 1.6 | DOCS `docs/how/pij-models-discovery.md:99` amend law; `docs/domains/pij-control-plane/domain.md:110` shape row | — | rows present | finding 08 |
| 1.7 | GATE `npx vitest run .pi/extensions/pij/` green; commit pathspec-mandatory; PR → o-prime | — | CI green + cold verdict | AC-10 |

#### Phase 1a: Item 1a — stdout flush before exit (class fix, ruled 11:40Z)

**Objective**: No `pij` verb can silently truncate its output at 64 KiB when stdout/stderr is a pipe — fixed once at the bin's shared entry seam, pinned by one >64 KiB pipe test through the bin.
**Domain**: pij-control-plane
**Delivers**: blocking stdio on pipes at the top of `main()` (`cli.ts:4440`) — a guarded `setBlocking(true)` on each stdio `_handle` (typed via a narrow structural cast, never `as any` — AGENTS.md bans it; the coder rightly deviated from an earlier draft of this line) — no-op in effect on TTYs/files; one integration test through the bin.
**Depends on**: None
**Key risks**: none functional (blocking writes are the TTY default; only pipe throughput semantics change). AC-16.
**Branch / PR**: `s391/item1a-stdout-flush` off `main@5445c85`, one tiny PR, lands BEFORE Phase 2.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1a.1 | TEST (RED) `cli.integration.test.ts`: seed enough sqlite rows that `pij queue --all`-equivalent unfiltered output exceeds 70 KiB (or use `pij spine events`/any verb that can emit >64 KiB deterministically — pick the cheapest to seed; `pij queue` on the sqlite backend with ~900 tiny deliveries is fine); run the bin via the existing spawnSync harness (stdout is a pipe); assert byte length > 65536 AND the last row/line is present. On base this fails (output is exactly 65536 bytes). | pij-control-plane | RED | AC-16 |
| 1a.2 | IMPL `cli.ts main()` first statement: the guarded `setBlocking(true)` for stdout+stderr with a 4-line comment naming the incident (709/812 rows, 64 KiB, 2026-08-27) | pij-control-plane | 1a.1 GREEN; full suite green | class fix, zero call-site churn |
| 1a.3 | GATE + PR | — | vitest green; PR → o-prime | AC-10 |

- AC-16 Any bin verb writing >64 KiB to a piped stdout emits it in full and exits with its intended code; proven through the bin with one integration test; `process.exit(` call sites are untouched.

#### Phase 2: Item 1 — `pij queue retire` + closed-recipient sweep

**Objective**: Give operators a receipted, idempotent retire verb and make the daemon retire open deliveries to deliberately-closed seats, without touching mail that `pij revive` must redeliver.
**Domain**: pij-messaging (state machine) · pij-control-plane (verb, sweep) · pij-orchestration (PA)
**Delivers**: `retired` terminal state + `TERMINAL` guard + `retire()`; `pij queue retire`; `retireForClosedRecipients()` in `tickLocked`; PA subverb mapping + scrape; docs.
**Depends on**: None
**Key risks**: retiring revivable mail (findings 02, 11) — pinned by AC-05 negatives + AC-05b; resurrection via `ack`/`settle` (finding 03) — pinned by AC-03.

R-5 ruled (a): tasks 2.3b/2.8b are in scope with the two guards (un-retire only `recipient-closed`; `requeued` receipt + deliver-once end-to-end).
**Branch / PR**: `s391/item1-queue-retire` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | TEST `adapters/sqlite-queue.test.ts`: retire sets state/NULLs lease/receipt-with-reason; excluded from `listQueued`/`listUnread`; other recipient untouched; idempotent; `ack`/`settle`/`claim`/`claimUnread`/`recoverStaleClaims` cannot move a retired row; `stats()`/`summary()` carry `retired` | pij-messaging | RED | AC-03; mirror `:165`, `:72`, `:201` |
| 2.2 | TEST `core/orchestration/pa-capability.test.ts`: `queueSubverbs()` scrape (floor ≥ 2); `queue retire` refuse; `queue migrate` allow; `paCapabilityVerb("queue","retire")` | pij-orchestration | RED | AC-06; finding 06 |
| 2.3 | TEST `daemon.delivery.test.ts` (or `daemon.test.ts`): complete deliberate close → retired `recipient-closed` on tick (sqlite AND dual fixtures); pane-gone dissolved → untouched; LIVE + closeIntent, no terminal → untouched; live seat untouched; `parked` row of a closed seat → retired | pij-control-plane | RED | AC-05; findings 02, 11, 12, 13 |
| 2.3c | TEST (RED) incident replay: queue 2 messages → complete deliberate close → 4 ticks with a recycled-pane-id live seat present → zero sends for the closed id, rows `retired`, receipts `recipient-closed`; plus a direct drain test that a `dissolved` descriptor is never injected | pij-control-plane | RED | AC-05c; incident 2026-08-27 |
| 2.3b | TEST (R-5 a) fake-backed end-to-end: close → tick retires `recipient-closed` → revive → tick delivers exactly once; `requeued` receipt carries revive evidence; operator-retired rows stay retired | pij-control-plane | RED | AC-05b |
| 2.4 | TEST `cli.integration.test.ts`: `pij queue retire --to X --reason R` output; missing `--reason` → E-ARG; fs backend → pointer message; `--dry-run`; `--json` | pij-control-plane | RED | AC-04 |
| 2.5 | IMPL `adapters/sqlite-queue.ts`: `DeliveryState` + `retired`; `TERMINAL=[acked,retired]`; `retire(filter:{to?,from?,olderThanMs?,state?}, reason): {matched, retired}` (default open set incl. `parked`); `unretire({to, reason})` (R-5 a); guards; `stats` zero-init; header diagram | pij-messaging | 2.1 GREEN | findings 03, 13 |
| 2.6 | IMPL `core/orchestration/pa-capability.ts`: `paCapabilityVerb` maps `queue` subverbs; classification keys; comment | pij-orchestration | 2.2 GREEN | |
| 2.7 | IMPL `cli.ts`: `runQueueRetire` (sibling of `runQueueMigrate`) resolving the store via `sqliteOf(openChannel(pijHome))` (dual → also fs read-marker mirror); `switch (process.argv[3])` at `:4475`; exhaustive state render map in `runQueue` | pij-control-plane | 2.4 GREEN | `--older-than` accepts `30m/2h/1d`; finding 12 |
| 2.8d | IMPL `daemon.ts` drain guard: skip (never inject, never claim) any recipient whose current descriptor is `dissolved` — independent of the sweep | pij-control-plane | 2.3c GREEN | AC-05c |
| 2.8 | IMPL `daemon.ts`: `retireForClosedRecipients()` called from `tickLocked` on `sqliteOf(this.channel)`; enumerate open recipients from the queue; `registry.read(to)`; predicate = dissolved + closeIntent + terminal.requested; log one line per retired batch | pij-control-plane | 2.3 GREEN | name avoids `diff.retired` (pane) collision; findings 02, 11 |
| 2.8b | IMPL (R-5 a) revive bin (`cli.ts:2190-2300`): after the revived descriptor is written, `sqliteOf(channel)?.unretire({to:id, reason:"recipient-closed"}, {detail: <revive evidence>})` — reason-filtered, writes `requeued` receipts | pij-control-plane | 2.3b GREEN | guards per R-5 |
| 2.8c | TEST+IMPL (add-on) `pij queue` listing ergonomics: default latest-200 with `showing N of M` footer, `--all`, `--since`, `--tail`, `--json {rows,total,shown}` (the 64 KiB truncation itself is fixed by Phase 1a) | pij-control-plane | RED→GREEN | AC-15 |
| 2.9 | DOCS `docs/how/pij.md` queue section; `docs/domains/pij-messaging/domain.md` source row + `Delivery state machine` concept | — | present | finding 08 |
| 2.10 | GATE vitest green; PR → o-prime | — | CI green + cold verdict | AC-10 |

#### Phase 2b: Item 1b — dispatch record retire (re-scope ruled (i), 09:40Z)

**Objective**: Make the anomaly board stop rotting on dispatches to closed seats: an additive `retired` dispatch state, an operator verb, the same complete-close sweep arm, revive un-retire under the R-5 guard, and a detector that skips retired rows.
**Domain**: pij-orchestration (platform records) · pij-control-plane (verb, sweep)
**Delivers**: `DISPATCH_STATES += "retired"`; `retireDispatch`/`unretireDispatch` pure fns; `pij dispatch retire`; sweep arm; anomaly skip; docs.
**Depends on**: Phase 2 (sweep function + un-retire guard shape)
**Key risks**: legacy record load (additive field only); double-render on the board (AC-14 pins the skip).
**Branch / PR**: `s391/item1b-dispatch-retire` off `main` (rebased after item 1 merges).
**O-prime acceptance (live, run by the o-prime)**: the five current board rows (determinist, federal-gorilla, persistent-capybara, curious-mawhrin, ancient-xoxarle) disappear after a retire.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2b.1 | TEST `core/platform/dispatch.test.ts`: `retireDispatch` state/retirement stamp/idempotence/canonical JSON; `unretireDispatch` restores prior state only for `recipient-closed`; legacy record (no `retirement`) round-trips | pij-orchestration | RED | AC-11 |
| 2b.2 | TEST `core/anomalies.test.ts`: retired dispatch older than threshold → no `delivered-unacked-stale`; live `delivered-unacked` still flags | pij-orchestration | RED | AC-14 |
| 2b.3 | TEST `pa-capability.test.ts` + CLI test: `dispatch retire` classified `refuse` (ruled 09:48Z) and scraped; verb output/E-ARG/`--json` | pij-orchestration / control-plane | RED | AC-12 |
| 2b.4 | TEST sweep arm + revive: closed recipient's open dispatches retired `recipient-closed`; revive restores them (R-5 guard); operator-retired stay retired | pij-control-plane | RED | AC-13 |
| 2b.5 | IMPL `core/platform/types.ts` (`DISPATCH_STATES`, `retirement?`), `core/platform/dispatch.ts` (`retireDispatch`, `unretireDispatch`, field order) | pij-orchestration | 2b.1 GREEN | additive only |
| 2b.6 | IMPL `core/anomalies.ts:695-707` skip `retired` | pij-orchestration | 2b.2 GREEN | |
| 2b.7 | IMPL `core/cli.ts`/`cli.ts` `pij dispatch retire`; `pa-capability.ts` (`dispatch retire`: refuse — map `dispatch` subverbs like `chore`/`queue`) | pij-control-plane | 2b.3 GREEN | ruled REFUSE 09:48Z |
| 2b.8 | IMPL `daemon.ts` sweep arm (dispatch store read/write beside the deliveries retire in `retireForClosedRecipients`); revive bin un-retire | pij-control-plane | 2b.4 GREEN | |
| 2b.9 | DOCS `docs/how/pij.md` (dispatch retire; board semantics) | — | present | |
| 2b.10 | GATE vitest green; PR → o-prime; o-prime runs the live acceptance | — | CI green + cold verdict + board rows gone | AC-10 |

#### Phase 2c: Item 6b — Flash interactive 400 under `--ui-server` (o-prime 12:05Z; after 1b)

**Objective**: Isolate why `copilot --yolo --session-id … --model gemini-3.6-flash --ui-server --port N` (no `--context`) still returns HTTP 400 on every turn while `copilot -p … --model gemini-3.6-flash` works from the same dir; fix if it is ours, else mark the catalog honestly.
**Domain**: pij-control-plane
**Delivers**: an isolation record (`tasks/phase-2c-flash-ui-server/isolation.md`: matrix of flags × outcome, run OUTSIDE tmux with a scratch copilot, PIJ_HOME isolated — never a pane-less pij seat); then EITHER a spawn-argv fix (pure builder + tests) OR `ModelEntry.interactive:false`-style catalog mark + `pij spawn` warn-don't-block message "Flash unusable interactively (400 under --ui-server); use -p" + docs.
**Depends on**: Phase 2b (order 6 → 1a → 1 → 1b → 6b → 5 → 4)
**Key risks**: the variable is upstream (copilot interactive request body) and not fixable here — then the honest catalog mark IS the deliverable.
**Branch / PR**: `s391/item6b-flash-ui-server` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2c.1 | ISOLATE (outside tmux, scratch copilot, isolated PIJ_HOME): matrix `{--yolo, --ui-server --port, --session-id, --effort}` × `gemini-3.6-flash` vs `gpt-5.6-sol`; capture the 400 body if any; record in `isolation.md` | — | matrix complete, variable named or "upstream" | never spawn a pane-less pij seat |
| 2c.2 | FIX or MARK: (fix) TEST+IMPL in `core/spawn.ts`/`core/models/*` per the isolated variable; (mark) TEST+IMPL `ModelEntry.interactive?: false` for gemini-3.6-flash + spawn warning + `docs/how/pij-models-discovery.md` | pij-control-plane | tests green | AC-17 |
| 2c.3 | GATE + PR | — | vitest green; PR → o-prime | AC-10 |

- AC-17 After Phase 2c, `pij spawn --harness copilot --model gemini-3.6-flash` either produces a seat that completes a canary turn (fix), or prints a warn-don't-block line stating the MEASURED fact (HTTP 400 on every request path — `-p` and interactive — with the named copilot CLI version and date; pick terra/sol) — never a silent 400. (Isolation 2026-08-28: upstream INSTABILITY on copilot CLI 1.0.81-14 — s391's 8-row matrix 400'd on every path incl. `-p` at 2026-08-27 ~16:0xZ UTC (= 02:0x +10:00 on 08-28; request IDs decode to 16:04–16:07Z) while the o-prime's `-p` one-shot succeeded 2026-08-27 ~07:33Z; final ruling 08:20Z: the warning names the CLI version and BOTH observations and says "treat as unavailable until a fresh probe passes"; no `-p` remedy; item 6's argv gate stays.)

#### Phase 3: Item 5 — honest pointer-path UNVERIFIED line

**Objective**: Log the truth for a pointer whose Enter was not confirmed — safe in the queue, re-announced on lease expiry — without changing any outcome, receipt, or guard.
**Domain**: pij-control-plane
**Delivers**: optional `opts.kind` on the `sendText` port and adapter; pointer wording; docs.
**Depends on**: None
**Key risks**: accidental semantic change — pinned by the outcome-vocabulary guard and the three pointer-path tests.
**Branch / PR**: `s391/item5-pointer-unverified` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | TEST `adapters/daemon-tmux.test.ts`: exhausted fixture with `{kind:"pointer"}` → `"unverified"` + stderr line without `UNVERIFIED`/`⚠️`, names lease re-announce; without `kind` → today's line verbatim | pij-control-plane | RED | AC-07; mirror `:454` |
| 3.2 | TEST `core/daemon/loop.test.ts`: pointer path passes `{kind:"pointer"}` (fake records args); `:1216-1240` and `:1260` unchanged | pij-control-plane | RED | AC-08 |
| 3.2b | TEST `daemon.test.ts`: real `Daemon` with a raw-port fake recording `sendText` args; a pointer-path delivery reaches the raw port with `opts.kind === "pointer"` | pij-control-plane | RED | AC-08b; finding 09 |
| 3.3 | IMPL `core/daemon/loop.ts:71` port `opts?: { readonly kind?: "pointer" \| "body" }`; `:647` passes `{kind:"pointer"}`; `daemon.ts:283-290` wrapper accepts and forwards `opts` | pij-control-plane | 3.2/3.2b GREEN | typed-body call `:672` unchanged |
| 3.4 | IMPL `adapters/daemon-tmux.ts:445/:471`: accept `opts`; at `:540-551` branch wording on `opts?.kind === "pointer"` (info line naming `POINTER_LEASE_MS` re-announce; keep pid/pane/tail) | pij-control-plane | 3.1 GREEN | finding 07 |
| 3.4b | TEST (RED) `daemon.delivery.test.ts`: Daemon constructed with `new DualWriteChannel(new SqliteQueue(home), new FsChannel(home))` → pointer path taken for a legacy seat (fake `sendText` receives the pointer line, row `injected` with lease) and an expired-lease row is recovered on the next drain; IMPL `daemon.ts:1089` → `const sq = sqliteOf(this.channel)` (finding C, s392 ticket) | pij-control-plane | RED→GREEN | AC-18 |
| 3.5 | DOCS `docs/how/pij.md` (daemon log vocabulary) | — | present | |
| 3.6 | GATE vitest green; PR → o-prime | — | CI green + cold verdict | AC-10 |

#### Phase 4: Item 4 — `--state working` remedy (ruled (c-remedy) 2026-08-27T08:47Z)

**Objective**: Make the `--state working` rejection and the `status-stale` detail carry the remedy, so an active seat learns to refresh its card instead of reaching for a state word — and pin that the detector cannot be deleted silently.
**Domain**: pij-orchestration (anomalies) · pij-control-plane (cli)
**Delivers**: remedy-bearing E-ARG; remedy line in status-stale detail; `systemState:"working"` fixture; docs. `role.ts` and `SEMANTIC_STATES` untouched.
**Depends on**: None
**Key risks**: none — wording + a guard test.
**Branch / PR**: `s391/item4-card-working` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | TEST `core/anomalies.test.ts`: a `systemState:"working"`, fresh `lastEventAt`, old `statusAt`, role pm seat STILL raises `status-stale`, and its `detail` contains the remedy line | pij-orchestration | RED (detail) + mutation-proof (predicate inverted → fails) | finding 01 |
| 4.2 | TEST `core/cli.test.ts`: `report now --state working` → still `E-ARG`; message contains `pij report now "<did>" "<next>"` and `waiting|hold|blocked|question` | pij-control-plane | RED | AC-09 |
| 4.3 | IMPL `core/cli.ts:1646` remedy text; `core/anomalies.ts:676-683` detail gains the same remedy line | both | 4.1/4.2 GREEN | no alias; no predicate change |
| 4.4 | DOCS `docs/how/pij.md` report/state section | — | present | |
| 4.5 | GATE vitest green; PR → o-prime | — | CI green + cold verdict | AC-10 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.4 | `core/spawn.test.ts` |
| AC-02 | 1.2, 1.3, 1.5a, 1.5 | `core/models/registry.test.ts`, `validate.test.ts`, `cli.integration.test.ts` (composition, both spawn paths) |
| AC-03 | 2.1, 2.5 | `adapters/sqlite-queue.test.ts` |
| AC-04 | 2.4, 2.7 | `cli.integration.test.ts` |
| AC-05 | 2.3, 2.8 | `daemon.delivery.test.ts` |
| AC-05c | 2.3c, 2.8d, 2.8 | `daemon.delivery.test.ts` (incident replay) |
| AC-05b | 2.3b, 2.8b | `daemon.delivery.test.ts` / revive tests |
| AC-06 | 2.2, 2.6 | `core/orchestration/pa-capability.test.ts` |
| AC-07 | 3.1, 3.4 | `adapters/daemon-tmux.test.ts` |
| AC-08 | 3.2, 3.3 | `core/daemon/loop.test.ts` |
| AC-08b | 3.2b, 3.3 | `daemon.test.ts` |
| AC-18 | 3.4b | `daemon.delivery.test.ts` (dual fake) |
| AC-09 | 4.1–4.3 | `core/anomalies.test.ts`, `core/cli.test.ts` |
| AC-15 | 2.8c | `cli.integration.test.ts` (pipe >64 KiB) |
| AC-11 | 2b.1, 2b.5 | `core/platform/dispatch.test.ts` |
| AC-12 | 2b.3, 2b.7 | `pa-capability.test.ts`, CLI test |
| AC-13 | 2b.4, 2b.8 | daemon/revive tests |
| AC-14 | 2b.2, 2b.6 | `core/anomalies.test.ts` |
| AC-10 | 1.7, 2.10, 2b.10, 3.6, 4.5 | vitest log per PR; `harness checks` at ship |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unknown copilot model silently loses long-context | Low | High | tri-state default = emit; AC-01/02 pin it |
| Sweep retires revivable mail | Low (predicate pinned) | High | AC-05 negative case; predicate on `closeIntent`/`terminal.requested` only |
| `retired` row resurrected by `ack`/`settle` | Low (guarded) | Med | `TERMINAL` set; AC-03 |
| Tick races `pij close` between `closeIntent` and `terminal` | Med | High | sweep requires dissolved+closeIntent+terminal.requested; AC-05(b) |
| `close → revive` loses mail | Med (supported flow) | High | AC-05b un-retire on revive (R-5 (a)); duplicate delivery pinned by deliver-once test |
| `Daemon` wrapper drops `opts` | Certain without fix | High | AC-08b composition test |
| Deny-set attached to the losing duplicate registry entry | Certain without fix | High | resolver consults deny-set directly; AC-02 duplicate-order + offline tests |
| Port widening breaks test fakes | Low | Low | optional trailing param |
| A later change re-introduces (b) | Low | High (detector loss) | 4.1 guard fixture keeps it visible in the suite |
| s392 overlap (`spawn.ts`, `daemon-tmux.ts`, `types.ts`, `pij.md`) | Med | Low | small diffs; s392 rebases after each merge (brief) |

#### Phase 5: Item 13 — descriptor lost-update race (o-prime 16:35Z; after 6b)

**Objective**: A `pij report now` card can never be silently lost to a concurrent daemon `system-state` write, and vice versa.
**Domain**: pij-control-plane
**Delivers**: merge-on-write for the status fields on daemon-side descriptor writes (never carry `statusPrev/Next/At/Seq/WrittenBy` from a stale snapshot), and/or a CLI read-back-and-reapply-once after `writeExact` (`core/cli.ts:4017-4040`); a fake-backed interleaving test.
**Depends on**: Phase 2c (order). **Evidence**: spine 25304 → 25305 → 25306 (pij-static-giraffe), descriptor `statusAt/statusSeq` stuck at 25199.
**Key risks**: the registry merge law (`daemon.ts` merge-law write) — the fix must live in the write seam, not in callers.
**Branch / PR**: `s391/item13-status-lost-update` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | TEST (RED) with fakes: CLI re-reads → daemon `system-state` write lands → CLI `writeExact` → the card fields (`statusNow/Next/At/Seq/WrittenBy`) survive AND the daemon's system-state fields survive | pij-control-plane | RED on base (one side lost) | AC-19 |
| 5.2 | IMPL per fix direction (merge-on-write at the registry write seam for status fields; optional CLI read-back once) | pij-control-plane | 5.1 GREEN | |
| 5.3 | DOCS + GATE + PR | — | vitest green | AC-10 |

- AC-19 An interleaved daemon system-state write between the CLI's re-read and `writeExact` never drops the card (and the card write never drops the daemon's system-state fields); pinned by a fake-backed interleaving test.

#### Phase 6: Item 15 — stale spine write-lock (o-prime 18:40Z; after 13)

**Objective**: A killed daemon can never leave `~/.pij/spine/write.lock` OR `~/.pij/spine/events.lock` blocking spine writes or journal replay/recovery machine-wide.
**Domain**: pij-control-plane (daemon lifecycle) · platform store (lock acquirer)
**Delivers**: for BOTH lock layers (`write.lock`, `events.lock` — the journal-replay/recovery path included): (1) graceful-shutdown release (SIGTERM/SIGINT handler in the daemon); (2) every acquirer (start, first write, replay) reclaims a lock whose writer pid is not alive, writing a receipt/spine note naming the dead pid and the layer; fake-backed test pairs per layer.
**Evidence**: 2026-08-27 18:2xZ restart — lock content `91876:<uuid>` (old daemon), `E-NOREG … held for over 5000ms` on every `pij report now` until removed by hand (DL-006).
**Key risks**: pid reuse after reboot (same class as the revive pid checks — reuse their liveness shape: pid alive AND process start time not newer than the lock).
**Branch / PR**: `s391/item15-spine-lock-reclaim` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | TEST (RED), per layer (`write.lock`, `events.lock`): fake lock with a DEAD pid → next spine append (write.lock) / journal replay (events.lock) reclaims and succeeds with a spine/receipt note naming the dead pid + layer; lock with a LIVE pid (the test's own) → still refuses with the existing E-NOREG / "recovery blocked" text | pij-control-plane | RED on base | AC-20 |
| 6.2 | TEST (RED): daemon SIGTERM handler releases the lock it holds (fake fs + signal dispatch) | pij-control-plane | RED | AC-20 |
| 6.3 | IMPL lock acquirer (pid-liveness + start-time guard) and daemon shutdown handler | pij-control-plane | 6.1/6.2 GREEN | |
| 6.3b | (ruled 03:05Z, from 1b acceptance) dispatch `retireDispatch`/`unretireDispatch` call sites (sweep arm, verb, revive) append a spine note `{kind: dispatch-retired|dispatch-requeued, dispatchId, reason, actor, priorState}`; `pij dispatch-retire` reports `0 open (N already retired)` instead of a bare 0/0; tests for both | pij-control-plane | RED→GREEN | AC-20b |
| 6.4 | DOCS + GATE + PR | — | vitest green | AC-10 |

- AC-20b Every dispatch retire/un-retire leaves a spine note naming the dispatch id, reason, actor and prior state; `pij dispatch-retire` distinguishes "0 open (N already retired)" from a true 0/0.
- AC-20 Neither a spine write (`write.lock`) nor journal replay/recovery (`events.lock`) ever fails on a lock whose writer pid is dead (reclaimed with a spine note naming pid + layer); a lock held by a live pid is still honoured; a graceful daemon stop leaves neither lock behind.

#### Phase 7: Item 16 — watchdog notices route to the current parent (o-prime 19:00Z; after 15)

**Objective**: A seat's watchdog stall/liveness notice reaches the seat that currently governs it (`parent`, set by spawn or `pij link`), not whoever originally spawned it.
**Domain**: pij-control-plane (`core/daemon/watchdog-manager.ts` + test)
**Delivers**: notice recipient = `descriptor.parent` when present, else `spawnedBy`; test: adopted seat with `parent ≠ spawnedBy` → notice to `parent` ONLY; un-adopted seat → `spawnedBy` (unchanged); no parent and no spawner → no notice (unchanged).
**Evidence**: spine 25711 (toucan adopted under the o-prime; notice went to pij-vocal-kingfisher).
**Branch / PR**: `s391/item16-watchdog-parent-route` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | TEST (RED) `watchdog-manager.test.ts`: the three cases above (adopted → parent only; plain → spawnedBy; neither → none) | pij-control-plane | RED on the adopted case | AC-21 |
| 7.2 | IMPL recipient resolution in `watchdog-manager.ts` (single helper; used by every notice kind) | pij-control-plane | 7.1 GREEN | |
| 7.3 | DOCS (`docs/how/pij-watchdog.md`) + GATE + PR | — | vitest green | AC-10 |

- AC-21 Watchdog notices (stall, liveness, nudge-escalation) are delivered to `parent` when the descriptor has one, else `spawnedBy`; pinned by the adopted-seat test.

#### Phase 8: Item 19 — pointer-path rows park after N re-announcements (o-prime 05:10Z; after 16)

**Objective**: A seat that never reads its pointer stops being re-announced every 90 s forever; the row parks with a reason receipt, mirroring the body path's `maxAttempts`.
**Domain**: pij-control-plane (`daemon.ts` pointer settle, `core/daemon/loop.ts`) · pij-messaging (`SqliteQueue.settle`/`recoverStaleClaims` attempt accounting)
**Delivers**: each pointer re-announcement increments `attempt` (today `settle(seq,"injected")` does not count); lease expiry past `maxAttempts` parks the row with receipt `parked` / detail `pointer-unread`; the operator sees it in `pij queue` (open-but-stuck, retireable per item 1); fake-backed test with a seat that never reads.
**Evidence**: spec seat cold review OBS-03 — `attempt` stays 0 on pointer rows.
**Key risks**: parking mail for a seat that is merely slow (choose N and lease so N×lease ≫ a long turn; document); interaction with revive/un-retire (parked stays open).
**Branch / PR**: `s391/item19-pointer-park` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 8.1 | TEST (RED) fake seat that never reads its pointer: after N lease expiries the row is `parked` with a `pointer-unread` receipt and is NOT re-announced on the next tick; a seat that reads on the 2nd announce acks normally; `attempt` increments per announce | pij-control-plane | RED on base (attempt stays 0, re-announced forever) | AC-22 |
| 8.2 | IMPL attempt accounting on the pointer settle + park on `recoverStaleClaims` beyond `maxAttempts` (shared constant with the body path or a pointer-specific N — decide and document) | pij-control-plane / pij-messaging | 8.1 GREEN | |
| 8.3 | DOCS (`docs/how/pij.md` delivery states) + GATE + PR | — | vitest green | AC-10 |

- AC-22 A pointer row is re-announced at most N times; beyond that it parks with a reason receipt and stays open-but-stuck (retireable); `pij queue` shows the honest attempt count.

#### Phase 9: Item 25 — busy-but-wedged stall detection (o-prime 12:30Z; after 19)

**Objective**: A seat whose harness turn is stuck with inputs queued behind it raises a stall notice instead of reading `working`; a queued `/compact` never masquerades as an active compact.
**Domain**: pij-control-plane (`core/daemon/runtime-axis.ts`, `core/daemon/pane-signals.ts`, `watchdog-manager.ts`, `pij state`)
**Delivers**: (1) runtime-axis signal: pane buffer size unchanged for N min AND composer shows `Queued (k>0)` (copilot) ⇒ `stalled` verdict + owner notice; (2) `pij state` surfaces the Copilot composer queue count; (3) watchdog `paused (compact)` only when the compact is RUNNING (compactingAt stamped by an observed compact turn), not merely queued; (4) **inverse case (ruled 13:55Z, DL-010)**: pane-buffer GROWTH counts as activity — a seat whose pane output is growing is `working` even with `lastEventAt` frozen (RPC-driven copilot work makes no pij CLI calls).
**Evidence**: pij-mobile-reptile 2026-08-28 ~10:40–12:00Z (DL-008): >80 min on one turn, `Queued (4)`, daemon `working`, watchdog `paused (compact)`.
**Branch / PR**: `s391/item25-wedged-stall` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 9.1 | TEST (RED) with pane-signal fakes: static buffer ≥ N min + `Queued (2)` → stalled verdict + notice to the parent (item 16 routing); same buffer static but queue 0 → not stalled (a long legitimate tool call); `/compact` queued-not-running → watchdog not `paused (compact)` | pij-control-plane | RED on base | AC-23 |
| 9.2 | IMPL the signal + `pij state` queue count + compact-running gate | pij-control-plane | 9.1 GREEN | N documented |
| 9.2b | TEST (RED) + IMPL: pane buffer growing across ticks with `lastEventAt` frozen ⇒ `systemState: working` (not idle/stalled); no growth + frozen ⇒ existing behaviour | pij-control-plane | RED on base (reads idle) | AC-23b |
| 9.3 | DOCS (`docs/how/pij-watchdog.md`) + GATE + PR | — | 0 fail | AC-10 |

- AC-23b A seat whose pane buffer grows across ticks is `working` even when `lastEventAt` is frozen (activity from pane signals, not only pij events).
- AC-23 A copilot seat with a static pane buffer for ≥ N minutes and a non-empty composer queue is reported `stalled` (notice to its parent); `pij state` shows the queue count; a queued `/compact` never yields `paused (compact)`.

#### Phase 10: Item 26 — death reconciler: pane move ≠ death (o-prime 12:30Z; after 25)

**Objective**: A `join-pane`/window change never produces a terminal-absence notice while the process is alive; the reconciler re-probes after a grace and reports `moved`.
**Domain**: pij-control-plane (`core/daemon/death-reconciler.ts`, `daemon.ts unbindGonePane`)
**Delivers**: on a pane-id/window mismatch, re-probe by pid (and start time) after a grace; if alive → update `paneId`/`windowId` and emit `moved` (not `exited`); only a dead pid → terminal absence.
**Evidence**: pij-powerful-whale 2026-08-28 12:07Z (DL-009): "has exited; terminal absence … unrequested-by-pij" during `tmux join-pane`, bound seconds later.
**Branch / PR**: `s391/item26-pane-move-not-death` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 10.1 | TEST (RED) death-reconciler fakes: pane id changes window while the pid stays alive → no terminal absence, descriptor `paneId`/`windowId` updated, `moved` notice; pid dead → terminal absence as today | pij-control-plane | RED on base | AC-24 |
| 10.2 | IMPL grace + re-probe + `moved` | pij-control-plane | 10.1 GREEN | reuse the revive pid-liveness shape |
| 10.3 | DOCS (C5 team-window recipe note) + GATE + PR | — | 0 fail | AC-10 |

- AC-24 Moving a live seat's pane (join-pane / window change) never yields an `exited`/terminal-absence notice; the seat's pane/window ids follow it and a `moved` notice is emitted; a dead pid still yields the terminal absence.

#### Phase 11: Item 27 — `pij tail --type` filters (o-prime 14:50Z; after 26; E21)

**Objective**: `pij tail <id> --type <T>` filters the transcript to kind `T` (receipt lines only for `receipt`), errors on an unknown type, and behaves identically with `--json`.
**Domain**: pij-control-plane (CLI `tail` verb)
**Delivers**: real filtering in the tail renderer; `E-ARG` for an unknown type naming the valid set; help text; a mixed-kind fixture transcript test (text, receipt, cmd, bg) pinning both the filtered set and the unfiltered default.
**Evidence**: o-prime verified from its seat that the flag is accepted and ignored (item 23 already stopped advertising it in the send hint).
**Branch / PR**: `s391/item27-tail-type-filter` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 11.1 | TEST (RED): fixture transcript mixing kinds → `--type receipt` yields only receipt lines (text + `--json`); no `--type` → all lines (unchanged); `--type bogus` → `E-ARG` listing valid types | pij-control-plane | RED on base (unfiltered) | AC-25 |
| 11.2 | IMPL the filter + arg validation + help | pij-control-plane | 11.1 GREEN | |
| 11.3 | DOCS (`docs/how/pij.md`) + GATE + PR | — | 0 fail | AC-10 |

- AC-25 `pij tail <id> --type receipt` prints only receipt lines (same with `--json`); an unknown `--type` is an `E-ARG` naming the valid kinds; the unfiltered default is unchanged.

#### Phase 12: Item 28 — sender preflight: dead relay seats queue-with-note (o-prime 15:05Z; after 27; E25)

**Objective**: A send to a relay/control-plane seat (`relay: true`, the deliberate-silence class — `pij-telegram` today) whose process is dead is QUEUED with a `recipient-dead` note and drains when the bridge revives; ordinary dissolved seats keep the E-DEAD refusal (item 1 retires their mail on complete close).
**Domain**: pij-control-plane (`core/cli.ts preflightSendTargets` `:~2232-2249` at main e935c88) · pij-messaging (receipt note)
**Delivers**: preflight branch on `descriptor.relay` (dead → `ok` + queued + receipt `queued`/`recipient-dead`; dissolved ordinary → `E-DEAD` as today); the sender output says "queued — relay is down; delivers on revive"; tests for both shapes; docs.
**Evidence**: Telegram bridge dead ~18:4x–18:48Z; `pij send pij-telegram` refused client-side, message lost.
**Key risks**: mail queued to a relay that never returns — bounded by item 1's operator retire and item 19's parking; document.
**Branch / PR**: `s391/item28-relay-send-queues` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 12.1 | TEST (RED): fake descriptor `relay:true` + dead pid → `pij send` returns ok with `state: queued` and a `recipient-dead` note/receipt; fake dissolved ordinary seat → `E-DEAD` (unchanged); a live relay → normal | pij-control-plane | RED on base (relay refused) | AC-26 |
| 12.2 | IMPL preflight branch + output wording + receipt note | pij-control-plane / pij-messaging | 12.1 GREEN | |
| 12.3 | DOCS (`docs/how/pij.md`, `docs/how/pij-watchdog.md` deliberate-silence class) + GATE + PR | — | 0 fail | AC-10 |

- AC-26 A send to a dead relay seat queues (with a `recipient-dead` note) and is delivered when the relay is back; a send to a dissolved ordinary seat is still refused with `E-DEAD`.

#### Phase 13: Item 31 — watchdog projection tracks the live fire clock; "unknown" is logged, never delivered (o-prime 21:5xZ; after 15; E32)

**Objective**: `pij watchdog status` must show the same "next due" the manager will actually fire on, and a fire that examined nothing must never reach a watcher as a verdict.
**Domain**: pij-watchdog (`core/daemon/watchdog-manager.ts`, `core/watchdog.ts`, `core/daemon/watchdog-scheduler-projection.ts`) · docs.
**Root cause (read-only survey 21:45Z)**: (a) the projection at `watchdog-manager.ts:~472` computes `nextDueAt = scheduleAnchorAtMs + intervalMs`, but `scheduleAnchorAtMs` is set only at RuntimeState birth (`:394`) and when `statusAt` moves (`:432`); the fire clock `isFireDue` (`core/watchdog.ts:158`) uses `max(lastFireAtMs, scheduleAnchorAtMs)`. A seat that never writes a card (the PA `pij-ready-perosteck`) keeps its spawn-time anchor forever → "next due" 13.7 h in the past while fires land every 20 min. (b) `:~562` sets `response = "unknown"` whenever `awaitingResponse` is false at fire time (the peer recovered before the next fire — every cycle for a busy seat); `notifyWatchers(:~580)` is then called unconditionally and `verdictNoticeLines` (`core/watchdog.ts:289`) renders the "not a health claim" bubble to every watcher, every cycle. The existing test `watchdog-manager.test.ts:612-630` PINS that delivery ("expect(notice).toContain('watchdog unknown: peer')").
**Root cause (c) — amendment (o-prime 22:05Z)**: the daemon's LEGACY stall detector (`daemon.ts:~1059-1080`, main f6621fe) fires `buildStalledNotice` whenever `state === "working"` and `lastEventAt` is older than the global `STALE_AFTER_MS` (60 s, `core/state.ts:22`); the latch clears on recovery and re-trips next episode. It consults `watchdogManager.isExempt` but never the seat's configured watchdog interval, so a ready seat on a 20-min standby cadence (the PA `pij-ready-perosteck`, interval 20m) — or any coder inside a 3-min test run — delivers "gone quiet (stalled)" to its creator every cycle. Same attention-cost class as (b).
**Root cause (d) — provenance (o-prime 22:1xZ, E26/E33)**: every creator-facing sensor notice is signed AS the observed seat: `daemon.ts:1081/:1115` (legacy + watchdog stalled) and `:1171` (provider-failure) deliver `{ from: d.id }`; `core/daemon/loop.ts:181 notify(delivery, from, …)` (callers `:441`, `:493`, `:622` incl. bind-refusal) signs bind/fail notices with the seat id; `core/daemon/death-reconciler.ts:322/:381` sign dead notices `from: descriptor.id`. Queue seq 4583 (22:05:37Z) shows "⏸ pij-ready-perosteck has gone quiet" with `from_id = pij-ready-perosteck`. A sensor must sign its own notices.
**Delivers**: one exported `nextFireDueAtMs(cfg, lastFireAtMs, scheduleAnchorAtMs)` in `core/watchdog.ts` used by BOTH `isFireDue` and the projection (single source of truth; projection can no longer disagree with the clock); `unknown` verdicts are logged (`deps.log`, one line naming the seat) and the watcher notice + capture are skipped — captures for a real verdict unchanged; docs/how/pij-watchdog.md states the rule.
**Evidence**: o-prime 21:5xZ — `pij watchdog status pij-ready-perosteck` → next due 2026-08-27T08:05:10Z (13.7 h past) while nudges fired 21:25Z/21:45Z; "watchdog unknown … nothing was examined" delivered to the watcher both times (captures `~/.pij/pij-relative-panther/watchdog-captures/1787865933037-*`, `1787867133791-*`).
**Key risks**: changing `isFireDue` semantics — must stay `max(anchors)`; the `statusAt` re-anchor rule (`:432`) and parked-seat clock advance are untouched; a watcher that relied on the "unknown" bubble as a heartbeat loses it — the sidecar capture on real verdicts remains.
**Branch / PR**: `s391/item31-watchdog-projection` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 13.1 | TEST (RED): manager harness — fire at t0, advance one interval, reconcile → `schedulerProjection()[id].nextDueAt` equals the instant `isFireDue` first returns true (t0+interval), not anchor+interval; second fire moves it again; a `statusAt` move still re-anchors | pij-watchdog | RED on base (projection stuck at anchor+interval) | AC-27 |
| 13.2 | IMPL `nextFireDueAtMs` in `core/watchdog.ts`; `isFireDue` = `now >= nextFireDueAtMs`; projection uses it | pij-watchdog | 13.1 GREEN; every existing `isFireDue` test green | |
| 13.3 | TEST (RED): fire with `awaitingResponse=false` → NO watcher delivery, NO capture, one log line `watchdog unknown: <id> (not delivered)`; the fire itself still goes to the seat and sets `awaitingResponse`; invert `watchdog-manager.test.ts:612-630` (keep its (a) intent for a REAL verdict in a sibling case) | pij-watchdog | RED on base (notice delivered) | AC-28 |
| 13.4 | IMPL: gate `notifyWatchers` + capture on `response !== "unknown"`; log otherwise | pij-watchdog | 13.3 GREEN; `pij#161` guard (no verdict from a declaration) intact | |
| 13.5 | TEST (RED): daemon harness — seat `working`, sidecar `intervalMs = 20 min`, event age 5 min → NO stalled notice, no `failureReason`; same seat at age 21 min → notice once; a seat with no sidecar keeps the 60 s rule | pij-watchdog / daemon | RED on base (notice at 61 s) | AC-29 |
| 13.6 | IMPL: legacy detector threshold = `max(STALE_AFTER_MS, effective watchdog intervalMs)` via a sibling seam next to `watchdogManager.isExempt` (e.g. `staleAfterMsFor(id)`); no other daemon.ts change | pij-watchdog / daemon | 13.5 GREEN | standby-aware, not a global bump |
| 13.7 | TEST (RED) + IMPL: every daemon sensor notice carries the SENSOR as `from` — `pij-watchdog` for watchdog-derived stall verdicts, `pij-daemon` for legacy stall, provider-failure, bind/fail (loop.ts `notify`), and dead (death-reconciler) — never the observed seat; the observed seat stays in the body text; a receipt addressed back to a sensor id is a no-op (pin it) | pij-watchdog / daemon | RED on base (from = seat id) at each of the six sites | AC-30 |
| 13.8 | DOCS (`docs/how/pij-watchdog.md` § next due + unknown + stall threshold + provenance) + GATE + PR | — | 0 fail | AC-10 |

- AC-27 `pij watchdog status <id>` "next due" equals the manager's live fire clock (`max(lastFire, anchor) + interval`) for a seat that has fired at least once and never wrote a card; it advances on every delivered fire.
- AC-28 A fire with no response outstanding is logged and never delivered to a watcher (no notice, no capture); real verdicts (`responsive|suspect|stalled`) are delivered exactly as before.
- AC-29 The legacy "gone quiet (stalled)" notice never fires before the seat's effective watchdog interval has elapsed since its last event (threshold = `max(60 s, intervalMs)`); seats without a sidecar keep today's 60 s.
- AC-30 No daemon sensor notice (stalled ×2, provider-failure, bound/failed, dead) is signed with the observed seat's id; `from` is `pij-watchdog` or `pij-daemon` and receipts to those ids are dropped without error.

#### Phase 14: 15-FX — item 15's real-SIGTERM child test flakes (tsx relay race) (o-prime 23:5xZ; before 31; E22)

**Objective**: `daemon.test.ts` "the real daemon SIGTERM path releases write.lock and events.lock in a temp home" must be deterministic: same process receives the signal, runs `installDaemonShutdownHandlers`, releases both locks, exits 0.
**Domain**: pij-watchdog/daemon test harness (`daemon.test.ts` only).
**Root cause (survey 2026-08-28T00:0xZ)**: the test spawns `node <tsx/cli> daemon.ts` (`daemon.test.ts:46-47`, `:2119`). tsx's CLI is a RELAY PROCESS: it spawns the real node child and forwards SIGTERM to it; the relay's own exit status then races the inner child's `exit(0)` (`daemon.ts:~1940-1943`) — 1-of-7 runs report 143 (128+SIGTERM, the relay's default) instead of the daemon's 0 (s392 fresh-main runs; log path via o-prime). The daemon itself is not racy: handlers are installed BEFORE the `PIJ_TEST_LOCKS_HELD` marker (`daemon.ts:~1960-1972`), so the signal always meets a handler.
**Delivers**: the test spawns the daemon IN ONE PROCESS — `spawn(process.execPath, ["--import", "tsx", DAEMON_BIN], …)` (precedent `adapters/channel.test.ts:155`) — so the process under test is the daemon; assertion unchanged (`{code: 0, signal: null}`, both locks gone). If `--import tsx` cannot execute `daemon.ts`'s run-if-main guard (`import.meta.url === file://argv[1]`), assert that first and fall back to E22 quarantine with the named reason, never a retry loop.
**Evidence**: o-prime 23:5xZ — expected `{code:143}` vs `{code:0}` 1/7 on s392's runs (their wording; the assertion on main expects 0 — the flake is the 143 side). E22 rule: name it, keep the log, fix or quarantine, never re-run into green.
**Key risks**: `--import tsx` + run-if-main guard: `process.argv[1]` is the script path in this form, so the guard holds; verify with a one-line probe before editing. Do not touch `daemon.ts`.
**Branch / PR**: `s391/item15fx-sigterm-relay` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 14.1 | PROBE: run the SIGTERM test 20× on base (`npx vitest run daemon.test.ts -t "real daemon SIGTERM"` in a loop) → record the flake count + one failing output verbatim into execution.log.md (E22: keep the log) | test | ≥1 failure reproduced, or "0/20 — not reproduced locally" stated plainly | AC-31 |
| 14.2 | IMPL: spawn via `--import tsx` (no relay); keep assertions; run 20× → 20/20 green; record | test | 20/20 | |
| 14.3 | GATE (full vitest via `pij bg`, tsc, biome) + PR-ready (no push); report root-cause line | — | 0 fail | AC-10 |

- AC-31 The real-SIGTERM daemon test passes 20/20 consecutive local runs with the daemon as the direct child (no tsx relay), and the run log with the reproduced failure is kept in the phase folder.

#### Phase 15: Item 32 — the production daemon must not die by the tsx relay (o-prime 01:0xZ; after 31; pre-tag, not RC-blocking; from 15-FX reviewer F-2)

**Objective**: a signal that reaches the daemon's outer pid runs the daemon's graceful path (item 15's lock release) — never tsx's relay SIGKILL.
**Domain**: pij-control-plane (`cli.ts` daemon launch `:~1592`) · daemon shutdown handlers (`daemon.ts:~1930` at main 16a7c42) · tests.
**Root cause**: `startDaemonWindow` launches `npx tsx daemon.ts` (`cli.ts:1592-1600`): two wrappers (npx, tsx's CLI relay) sit above the daemon. tsx's relay forwards SIGTERM, waits 2×30 ms for the child to report over an async socket, then SIGKILLs it and exits 143 (15-FX review, `tsx/dist/cli.mjs relaySignalToChild`); the daemon's synchronous `exit(0)` defeats the report. `pij daemon stop` is safe only because it signals the INNER pid from `daemon.lock` (`cli.ts:1765`); tmux `kill-window`, OS shutdown, or a kill of the wrapper pid all hit the relay → daemon SIGKILLed mid-shutdown, `write.lock`/`events.lock` leaked (mitigated by item 15's dead-pid reclaim on next start).
**Design (stated with evidence, coder may refine)**: launch the daemon as Node's DIRECT child — `cmd: process.execPath, args: ["--import", <tsx loader resolved ABSOLUTELY from the CLI's own install, as a file URL>, daemonPath]` — no npx, no relay; the pane's process IS the daemon, so the outer pid == `daemon.lock` pid. Add `SIGHUP` to `installDaemonShutdownHandlers` (tmux `kill-window` delivers SIGHUP to the pane process, which is now the daemon). Resolve tsx absolutely (not from cwd): `startDaemonWindow` runs with the operator's cwd, which need not contain `node_modules/tsx`. Alternative (rejected unless the direct child proves impossible): keep the relay and lengthen its window — not controllable from outside tsx.
**Delivers**: direct-child launch; SIGHUP handled; `pij daemon status` unchanged (pid from `daemon.lock`); Windows launcher unaffected unless `cli-invocation.ts` derives from this argv (check).
**Evidence**: 15-FX review-01.md (instrumented: relay → `code=143, shutdownCompleted=false, lockLeaked=true` 18/18; direct → clean 18/18; pid-identity proof).
**Key risks**: `--import` needs an absolute loader path (cwd independence); the daemon window's `npx` also provided PATH/node resolution — verify `process.execPath` is the same node the CLI runs on; `daemon status` "process: running <sha>" reads the lock, unchanged; live proof rides the next daemon restart (o-prime baton).
**Branch / PR**: `s391/item32-daemon-direct-child` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 15.1 | TEST (RED): fake-tmux composition — `startDaemonWindow` builds `cmd === process.execPath`, args `["--import", <file URL ending in tsx's loader>, daemonPath]`, no `npx`; loader path is absolute and exists | pij-control-plane | RED on base (`npx tsx`) | AC-32 |
| 15.2 | TEST (RED): real launch through the PRODUCTION argv builder (spawn exactly what 15.1 asserts, temp `PIJ_HOME`, `PIJ_TEST_HOLD_LOCKS_ON_START=1`), signal the OUTER pid with SIGTERM and separately SIGHUP → `{code: 0, signal: null}`, both locks gone; MUT: restore `npx tsx` argv → RED (143 / locks leaked) | daemon | RED on base | AC-32 |
| 15.3 | IMPL: launch argv + absolute loader resolution; `SIGHUP` in `installDaemonShutdownHandlers` | pij-control-plane / daemon | 15.1 + 15.2 GREEN; item 15 SIGTERM test still green | |
| 15.4 | DOCS (`docs/how/pij.md` daemon section; release-notes known-gap line removed/updated by the o-prime) + GATE (full vitest via `pij bg`, tsc, biome) + PR-ready (no push) | — | 0 fail | AC-10 |

- AC-32 The production daemon launch has no relay process between tmux and `daemon.ts`; SIGTERM or SIGHUP to the pane's pid runs the graceful path (exit 0, both spine locks released), proven by a real launch through the production argv builder; restoring the relay reddens the sensor.

#### Phase 16: Item 33 — resurrect the plan-055 watchdog smoke proof against the current delivery model (o-prime 02:0xZ; after 32; not pre-tag; DL-018)

**Objective**: `harness/scripts/smoke.ts` → `docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke` is a LIVE sensor again: green on the PR head, and its output names the pwsh/OSC baseline reds separately so they can never mask it again.
**Domain**: plan-055 proof script (docs), harness smoke output.
**Root cause (three layered drifts, each reproduced on clean main with the previous fix applied — evidence `docs/plans/391-day3-core/kept-logs/smoke-red.log.txt`, `smoke-red-2.log`, `smoke-red-3.log`, partial patch `run-proofs-partial.patch`)**: (1) the proof calls async `daemon.tick()` without awaiting (`:322/:330/:369/:375/:411`) → "smoke first fire was not queued"; (2) its daemon is built on `FsChannel` (`:304`) while the CLI it drives writes the default sqlite queue (item 1 / Amendment 4) → "smoke compact pause failed"; (3) `:1217` asserts the first delivered TURN contains `pij report state done`, but socketless tmux seats receive the pointer line since item 5 (the body still carries the text, `watchdog.ts:419`) → "smoke done report command missing". Possibly more behind (3) — stop-and-report discipline continues.
**Delivers**: awaited ticks; proof daemon via `adapters/channel-factory.ts openChannel` (the `runDaemon` seam); assertions rewritten for the pointer model (assert the durable body in the queue/inbox, and the pointer line on the pane); any further drift fixed the same way with its red log kept; smoke output that separates "baseline red (pwsh/OSC)" from the watchdog smoke verdict.
**Evidence**: DL-018 rows in `rulings.md`; the three red logs; o-prime ruling 02:0xZ.
**Key risks**: a fourth drift that is a REAL regression — the stop condition (different reason → STOP with the log) stays mandatory; the proof must not become a tautology (assert what the daemon actually delivers, mutation: break the fire path → proof red).
**Branch / PR**: `s391/item33-watchdog-smoke-proof` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 16.1 | Apply `run-proofs-partial.patch` (drifts 1–2), re-run, keep the log; confirm reason (3) reproduces | proof | red-3 reproduced | AC-33 |
| 16.2 | Rewrite the pointer-era assertions (`:~1209-1217` and any sibling): body in the durable channel, pointer line on the pane; run; keep each log; on a NEW reason: fix if it is the same class (delivery-model drift) and log it, STOP if it looks like a daemon regression | proof | smoke green | |
| 16.3 | Sensor honesty: break the watchdog fire path (e.g. `isFireDue` → false) → smoke RED; restore → GREEN (record) | proof | RED/GREEN recorded | AC-33 |
| 16.4 | Smoke output separation: `harness checks` (or the smoke runner) prints the watchdog smoke verdict on its own line, with pwsh/OSC baseline reds named separately (fence: `harness/scripts/smoke.ts` only if needed — ask first) + DOCS (release-notes known-gap line for the o-prime) + GATE (full vitest via `pij bg`, tsc, biome) + PR-ready | — | 0 fail; smoke line green | AC-10 |

- AC-33 The harness watchdog smoke is green on the PR head and reddens when the watchdog fire path is broken; its output names baseline reds separately from the smoke verdict; every red encountered on the way is kept as a log in the phase folder.

#### Phase 17: Item 34 — queue hygiene: pseudo-seat receipts never queue; the terminal-recipient sweep covers every terminal liveness; `pij queue` shows stale rows (o-prime 04:2xZ; low; after 33; item-1 territory)

**Objective**: no delivery row can sit `queued` forever because its recipient cannot exist (pseudo-seat) or can never return (any terminal liveness); the operator sees stale rows without SQL.
**Domain**: pij-messaging (daemon receipt write, closed-recipient sweep), CLI (`pij queue`).
**Root cause (survey 04:3xZ on main 916e915)**: after restart #6, 119 rows `queued` for hours/days. (a) 78 to `pij-watchdog`: `daemon.ts:~1690` writes a `kind: "receipt"` row back to `message.from` for every injected message; watchdog nudges are authored `from: "pij-watchdog"` — a PSEUDO-seat with no registry row (E-NOID) and no consumer, so every receipt queues forever (and item 31's `pij-daemon` sender adds a second pseudo-seat of the same class). (b) 39 to `pij-glorious-termite`, a prime dissolved 78 h ago: `retireForClosedRecipients` (`daemon.ts:~1001`) retires only for `lifecycle === "dissolved" && closeIntent !== undefined && terminal.disposition === "requested" && revivePendingAt === undefined`. Termite's archived descriptor HAS a cli-close `closeIntent` (2026-08-24T21:39Z) but ALSO a stale `revivePendingAt` from 15 h EARLIER (2026-08-24T06:41Z) — the revive marker never expires, so the exemption blocked retirement for 78 h. Two defects: the exemption is unbounded (a revive marker older than the close intent, or older than a bound, cannot be "pending"), and dissolved-by-death/exit or `failed` seats never qualify at all.
**Delivers**: (1) receipts (and any daemon-authored row) addressed to a non-registry pseudo-seat (`pij-watchdog`, `pij-daemon`, `pij-bg`, `pij-telegram`? — NO: `pij-telegram` is a registered relay; the rule is "no registry row at write time") are recorded to the sender's log/spine or dropped at write — never enqueued; one shared predicate. (2) the sweep covers EVERY terminal liveness — `dissolved` (any disposition), `failed`, dead-terminal (`terminal !== undefined`) — with `revivePendingAt` an exemption ONLY while it is newer than the terminal transition and younger than a bound (say 1 h; a revive that has not landed in an hour is not pending); (2b — o-prime addendum) the same sweep drops watcher entries (`watchdog.json` sidecar `watchers[]`) whose watcher seat is terminal, and `pij watchdog status` marks a terminal watcher as such rather than listing it as live; reason string names the class (`recipient-dissolved` / `recipient-failed` / `recipient-dead`); machine-wide (all tiers `listTerminal` returns). (3) `pij queue` prints a `stale: N row(s) queued > 24 h (oldest seq S, to <id>)` line (and `--json` field). Existing 119 rows stay for the test's real-row proof; the o-prime retires them after.
**Evidence**: o-prime drain check 04:2xZ (78 + 39 + 2 singles); `sqlite3 ~/.pij/queue/pij.sqlite` group-by to_id.
**Key risks**: receipts are the sender's delivery evidence (E26) — dropping them for pseudo-senders must not lose a REAL seat's receipt (predicate = registry absence at write, tested on a registered seat too); the sweep must not retire mail for a seat mid-revive (`revivePendingAt`) — keep the exemption; `listTerminal()` is archive-tier (G-2 in item 16: unthrottled scans cost ms per 1000) — keep the sweep on its existing cadence, do not add a per-tick read.
**Branch / PR**: `s391/item34-queue-hygiene` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 17.1 | TEST (RED): real sqlite home — inject a `from: "pij-watchdog"` turn → NO receipt row queued; a receipt to a REGISTERED seat still queues; the dropped receipt leaves one log line | pij-messaging | RED on base (row appears) | AC-34 |
| 17.2 | TEST (RED): registry with (a) dissolved-by-death seat (no `closeIntent`, disposition ≠ requested), (b) `failed` seat, (c) `terminal` set, (d) termite's exact shape (cli-close + STALE `revivePendingAt` older than the close) — each with queued rows → sweep retires all four with class-named reasons; a seat with a FRESH `revivePendingAt` (newer than its terminal transition, < 1 h) keeps its rows; existing closed case unchanged | pij-messaging | RED on base (only the closed case retires; (d) blocked by the stale marker) | AC-34 |
| 17.2b | TEST (RED): watcher sidecar lists a terminal seat as a watcher → sweep removes the entry (one log line); `pij watchdog status <id>` marks a terminal watcher `(terminal)` before removal | pij-watchdog | RED on base | AC-34 |
| 17.3 | IMPL (1)+(2): one `canReceive(to, registry)` predicate at the receipt write; sweep predicate widened; reasons; spine note per retire (existing path) | pij-messaging | 17.1/17.2 GREEN | no per-tick archive read |
| 17.4 | TEST (RED) + IMPL: `pij queue` (text + `--json`) `stale` line/field for rows queued > 24 h (count, oldest seq, recipient); real-row proof against the live DB's 119 rows recorded in execution.log.md (read-only against `~/.pij` — do NOT retire them) | CLI | RED on base (no line) | AC-34 |
| 17.5 | DOCS (`docs/how/pij.md` delivery states + queue) + GATE (full vitest via `pij bg`, tsc, biome) + PR-ready | — | 0 fail | AC-10 |

- AC-34 A daemon-authored row to a recipient with no registry row is never enqueued; queued rows for a recipient in ANY terminal liveness (closed, dissolved, failed, dead-terminal; a `revivePendingAt` exempts only while fresh and newer than the terminal transition) are retired by the sweep with a class-named reason; the sweep drops terminal watcher entries and `pij watchdog status` marks them; `pij queue` reports rows queued > 24 h.

#### Phase 18: Item 31b — the legacy stall sensor reads the subtree: a seat with an active child is not stalled (o-prime 04:5xZ; low; after 34)

**Objective**: a working PM/orchestrator whose child is actively working is never reported "gone quiet (stalled)"; a working seat whose whole subtree is idle past the threshold still is.
**Domain**: pij-watchdog / daemon legacy stall detector (`daemon.ts pushWholeLifeTransition` `:~1184-1230` at main 74891a2; `const stalled = isWorking && staleAge` `:~1206`).
**Evidence**: 04:3xZ "⏸ pij-falling-outside has gone quiet (stalled)" delivered while its coder `pij-remote-falcon` was `working` with fresh events. Item 31 (AC-29) made the threshold interval-aware; the sensor still reads the seat alone — an orchestrator waiting on a worker is silent by design.
**Delivers**: one clause in the legacy detector — `stalled = isWorking && staleAge && !hasActiveChild(d)` where a child is any registry row whose `parentId` (or, absent that, `spawnedBy`) is `d.id`, is `state === "working"` and whose `lastEventAt` is younger than the CHILD's own `staleAfterMsFor`; the check reads the hot registry list already in hand for the tick (no extra I/O); when the parent is suppressed by a child, one log line names the child (not a notice). The watchdog-derived stall path (`pushWatchdogResponse`) is untouched (it fires only on unanswered nudges).
**Key risks**: a zombie child that stays `working` with no events would keep a dead parent "alive" — the child's own freshness guard closes that; must not read the archive tier (item 16 G-2); the clause is a policy, so it needs a fixture on both sides (DL-019).
**Branch / PR**: `s391/item31b-subtree-stall` off `main`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 18.1 | TEST (RED): daemon harness — parent `working`, event 3 min old, sidecar interval 60 s; child (`parentId` = parent) `working`, event 10 s old → NO stalled notice for the parent, no `failureReason`, one log line naming the child; same parent with the child `idle` (or `working` but 5 min old) → notice once; child linked by `spawnedBy` only → same as parentId; a child of ANOTHER parent → no effect | pij-watchdog | RED on base (notice regardless of child) | AC-35 |
| 18.2 | IMPL the clause + log line; hot-tier only; reuse `staleAfterMsFor` for the child's freshness | daemon | 18.1 GREEN; item 31's AC-29 tests green | |
| 18.3 | DOCS (`docs/how/pij-watchdog.md` stall-threshold paragraph) + GATE (full vitest via `pij bg`, tsc, biome) + PR-ready | — | 0 fail | AC-10 |

- AC-35 The legacy "gone quiet (stalled)" notice is suppressed while any child (parentId, else spawnedBy) of the seat is `working` with an event younger than the child's own stale threshold; it fires once the whole subtree is quiet; suppression logs the child and never reads the archive tier.
