# Review packet — cold review of `docs/specs/claude-copilot-sqlite-sockets-comms.md`

**Role**: cold reviewer (you have no prior context; that is the point). **Wire discipline**: your reply follows pij C10 (`~/.claude/skills/pij/references/00-routing.md` § C10): line 1 = verdict, then delta + ids; no praise, no restatement.
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s393-jordan-spec` (your cwd) · branch `s393/jordan-spec` · spec commit `939c08f` on top of `main@ed20a68`. Every source path in the spec is relative to this worktree root; `EXT/` = `.pi/extensions/pij/`.
**Read-only review.** You may create exactly ONE file: `docs/plans/393-jordan-spec/reviews/spec-review.md`. Do not edit the spec, any source, any test, or anything under `government/`, `docs/plans/**` other than that one file, `.the-flow-state.json`, `the-flow.json`, `the-flow.md`. Do not run `git commit`, `git stash`, `pij spawn`, or `pij close`. Do not restart the daemon.

## What you are reviewing
A handoff spec meant to be read by an engineer with ZERO context on this repo: it must let them own the SQLite-queue + Claude-socket + Copilot-RPC + pointer message path. Its author's claim: every `file:line` is verified on `ed20a68`, it contains no project/organisation meta, and it covers the required list below.

## Three review dimensions — report findings per dimension

### D1 — Standalone-ness (no meta leaked)
Read the whole spec as a stranger. Flag ANY sentence that requires knowledge of: who the people are; team/organisation structure, roles, hierarchy, governance, "streams", "primes", "batons", "briefs", "rulings", "day-3 items", item numbers, seat ids of specific sessions (system peers `pij-telegram`, `pij-watchdog`, `pij-daemon` are fine), plan/stream numbering used as identity rather than as a file path. A path under `docs/plans/…` cited as a *source location* is acceptable; a sentence that only makes sense if you know what that plan *was* is not. Also flag jargon used before it is defined (the spec has a §0 conventions and a §17 glossary — check they cover what is used).

### D2 — Factual anchors on `ed20a68`
Mechanically verify at least 40 `file:line` citations spread across §3, §4, §6, §7, §9, §13, Appendix A: open the file at the line and confirm the cited construct is there (a range may start at a doc comment). Then verify SEMANTICALLY (not just presence) these load-bearing claims — read the code and say whether the prose is true:
1. §4.1/§4.2: the daemon does NOT call `claim()` for socket/pointer deliveries; pointer ⇒ `settle(seq,"injected",{leaseMs:90_000})`; socket success ⇒ `markRead` (ack). (`EXT/daemon.ts:1169-1270`, `EXT/core/daemon/loop.ts:632-737`)
2. §4.1: `recoverStaleClaims` parks at `attempt >= 6` and is recipient-agnostic; `resetClaimsOnStart` is unscoped by token.
3. §5: `sqliteOf` returns the queue for `dual`; `daemon.ts:1172` uses `sqliteOf` (not `instanceof`); the remaining `instanceof` at `:1628-1629` only picks a log label.
4. §6.2: commands are never sent over socket/RPC and never via pointer (`!m.command` in both gates).
5. §7.1: the Claude frame shape and `from-mode="bypass"`; the 150 ms ack window; `ENOENT` ⇒ failed.
6. §7.2: Copilot request/response framing; `mode:"enqueue"`; readiness probe runs once per session before the first send; revive allocates a fresh port.
7. §7.3: the exact `pointerLine` text; `pij inbox` lists `injected` rows (`listUnread` includes claimed/injected); `--inject` exists.
8. §7.7/§8: `forwardOne` throws when `undeliveredText > 0`; consumer leaves a rejected row `claimed` and never acks it; default lease 60 s / poll 500 ms.
9. §9.1: `classifySendReceipt` order and `effectiveDeliveryMode` definition.
10. §9.4: the `setBlocking` fix is in `EXT/cli.ts` (the bin), not `core/cli.ts`.
11. §3.2 "design vs shipped" claim: the shipped schema has NO `not_before`, `body_path`, `acked_seq`.
12. §11 benchmark numbers match `reports/pij-comms-review-2026-08-27/benchmarks.md` (MERGE rows).
Report every mismatch with the spec line, the cited location, and what the source actually says.

### D3 — Completeness vs the required coverage list
The spec MUST cover, each findable by a stranger: (a) architecture — WAL queue tables, state machine, leases/park; backend selection sqlite/fs/dual; delivery routing — Claude inbox socket, Copilot `--ui-server` RPC, pointer path for socketless seats; generic queue-consumer at-least-once; Telegram bridge + pi in-process receiver on it; (b) the exact wire frames; (c) benchmarks; (d) the P1-transport vs P2-persistence doctrine; (e) gotchas actually hit: pty 1022-byte clipping; Flash + `--context long_context`; the dual-backend `instanceof` gate; at-least-once duplicate windows; daemon restart strands spine locks; CLI/daemon code skew after a fast-forward; 64 KiB stdout truncation on pipes; sender-receipt false positive for bridge/pull targets; (f) outstanding: Codex app-server path (deferred design), bridge `--skip-backlog`, token-scoped `resetClaimsOnStart`, durable retry on Telegram API failure, pane-binding hardening follow-ups, the descriptor card-write race, spine-lock reclaim, notice routing. Name anything missing or too thin for a stranger to act on. Also name anything a stranger would need that is absent (e.g. how to run the tests, how to inspect the DB).

## Verdict
Write `docs/plans/393-jordan-spec/reviews/spec-review.md` with: `Verdict: APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED` on line 1; then per dimension a findings table (`# | severity critical/high/medium/low | spec §/line | evidence (file:line or quote) | what to change`); then the count of anchors you checked and how many failed. FIX_REQUIRED if any anchor is wrong in a way that would mislead, any meta leak, or any required topic missing. Then `pij send pij-dependent-ptarmigan --body-file - <<'PIJ'` with line 1 = the verdict and line 2 = the path of your review file. Nothing else in the message.
