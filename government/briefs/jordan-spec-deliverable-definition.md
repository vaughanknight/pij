<!-- verbatim copy by the o-prime (2026-08-27) of s392's uncommitted docs/plans/392-day3-codex-doctrine/jordan-spec-deliverable.md, sha256 c38bb2d672f88b36a035c41256606bb13ec89eb1bfd31070213697ea18b78a8e; canonical home is that plan folder once s392 pushes it -->
# Deliverable — handoff spec for Jordan (another Claude) on the sqlite+sockets comms approach

**From Vaughan (in-pane + Telegram), 2026-08-27.** A distinct deliverable, AFTER the s392 code lands.

**Governance**: recorded as project `jordan-spec` under o-prime pij-relative-panther, queued AFTER the day-3 list. Do NOT start before items 9/10 land. The Fable seat is BRIEFED BY THE O-PRIME — I tell it when I would spawn the seat; I do not ad-hoc spawn it.

## Trigger / sequence (in order)
1. **Finish item 10b**, then **merge everything and push** (all s392 day-3 comms work green on main).
2. When we judge **claude + copilot on the new sqlite + sockets approach is READY**, produce the spec.
3. **Create a seat in Fable** (this model) for the spec work.
4. Write a **detailed, self-contained spec** for another Claude (Jordan) to pick up and run with.
5. **Create an issue on the `ai-substrate`/`ai-substrates` pij repo** (confirm exact org/repo via `gh` — orient names `AI-Substrate/pij`) with the spec; Jordan picks it up from there.

## Spec requirements (from Vaughan, verbatim intent)
- **Standalone**: "do not include any other project information" — ONLY the claude+copilot sqlite+sockets comms architecture. No pij-day3 governance/orchestration meta, no other streams' unrelated work, no internal fleet chatter.
- **LOTS of detail** — "it can be huge, another Claude will be reading it." Enough that a fresh agent can pick it up and run without this context.
- **Gotchas and other aspects** — the real traps we hit (see candidate list below).
- **Outstanding items documented** — so Jordan knows what's left to do.

## Content the spec should cover (draft outline — build when ready)
- **Architecture**: SQLite WAL durable queue (`adapters/sqlite-queue.ts` — messages/deliveries/receipts/cursors, state machine queued→claimed→injected→acked, lease/park); backend selection (`adapters/channel-factory.ts`, default sqlite, fs/dual); socket/RPC delivery (Claude inbox socket `adapters/claude-socket.ts`, Copilot `--ui-server` RPC `adapters/copilot-rpc.ts`); daemon routing (`core/daemon/loop.ts drainTmuxInbox` socket-first → pointer → typed); the pointer path (socketless, pty-clip remedy) and its sqlite-only gate.
- **Consumers**: the generic `adapters/queue-consumer.ts` (claim→handler→ack, at-least-once, ForwardIncomplete); Telegram bridge + pi in-process receiver both on it.
- **Doctrine**: pointer-delivery relaxation (P1 transport vs P2 persistence) — `government/doctrine/preconditions-travel-with-remedies.md` amendment + orient-global iron rule 2.
- **Gotchas (real, from this build)**: (a) `daemon.ts:1089` uses `instanceof SqliteQueue` not `sqliteOf` → pointer path + `recoverStaleClaims` OFF under `dual` (finding-C ticket, `reports/finding-C-daemon-instanceof-ticket.md`); (b) at-least-once, two duplicate windows (ack-after-send failure; daemon restart mid-send re-queues via unscoped `resetClaimsOnStart`); (c) ForwardIncomplete: a failed text send must leave the row claimed, never ack (proven live, WIN-001); (d) receipt honesty — `classifySendReceipt`/`daemonReceiptAuthoritative` must use `effectiveDeliveryMode`, not raw `deliveryMode`, or a pull seat reads "delivered: peer was idle"; (e) pointer path is sqlite-backend-only (fs/dual type the body); (f) canary `E-CANARY-TIMEOUT` fires ~2s before a slow copilot first-turn ack (process args are truth); (g) the bridge never sweeps its own leases — the retry leg needs a running daemon.
- **Outstanding / TODO for Jordan**: finding-C (dual → sqliteOf + the 6 ad-hoc pane resolvers, item 10b territory); Codex `app-server --remote` (DEFERRED — full design in `deferred-codex-phase.md`, needs `initialize`/`threadId`/`expectedTurnId`, a pij-owned supervisor topology, and `codex login`); `--skip-backlog` for the bridge; token-scoped `resetClaimsOnStart`; `pij queue retire` verb.

## Notes
- Source material to mine (do NOT copy governance meta): `reports/pij-comms-review-2026-08-27.md` (§5 socket, §11–13 PoC+benchmarks), `docs/how/pij.md` Delivery routing, the s392 plan + phase reports, `deferred-codex-phase.md`.
- The spec is TECHNICAL and standalone; strip all fleet/orchestration/pij-governance framing.
