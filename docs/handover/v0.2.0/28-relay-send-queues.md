# 28 — `pij send` to a dead RELAY seat (pij-telegram) must queue with a note, not refuse `E-DEAD`

**Item id / stream at handover:** 28 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (Phase 12 of the s391 plan; dossier + packet ready; no branch). Partly overtaken: since item 29 (PR #26) the bridge runs in-process under the daemon and is auto-restarted, so the window in which `pij-telegram` is "dead" is short — but the refusal path is unchanged and still loses the message in that window.
**Size estimate:** S (2 h) · **Order / dependencies:** item 34 (queue hygiene) should land first or together — a relay that never returns must not accumulate rows forever (item 1's operator retire and item 19's parking bound it).

## 1. Why this exists (the observed failure, with evidence)
- 2026-08-27 ~18:4x–18:48Z: the Telegram bridge process was dead; `pij send pij-telegram …` was refused CLIENT-SIDE with `E-DEAD` and the message was lost (o-prime, encode E25; s391 plan Phase 12 evidence line). Human-channel doctrine (E29, README § rules): silent loss outranks noisy duplicate — a refusal that drops a message to the human channel is the worst outcome.
- At `d120c53`, `core/cli.ts preflightSendTargets` (`:2232-2260`): for each target it computes liveness (`liveOf`) and returns `err("E-DEAD", "session <id> is <why>")` (`:2249`) for dead/dissolved targets, regardless of the target's class. `SessionDescriptor.relay?: boolean` (`core/types.ts:239`) marks relay/control-plane seats (`pij-telegram` today; `core/cli.ts:1928` `const relay = d.relay === true` already uses it for the deliberate-silence class). The preflight does not consult it — but it already has the precedent: a `dead` target with `deliveryMode === "pull"` (non-tmux external peers that block on `pij inbox --wait`) is allowed through (`:2245-2248`); the relay branch is the same shape with `descriptor.relay === true`.

## 2. What is ruled (design / spec)
- AC-26 (plan): a send to a dead relay seat QUEUES (returns ok with `state: queued` and a `recipient-dead` note/receipt) and is delivered when the relay is back; a send to a dissolved ORDINARY seat is still refused `E-DEAD` (item 1 retires its mail on close); a live relay behaves as today.
- Sender output: `queued — relay is down; delivers on revive`. Receipt row for the sender: `queued` with note `recipient-dead`.
- Bound: rows queued to a relay are subject to item 34's stale line and item 1's `pij queue retire`; nothing auto-drops them (E29).

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/cli.ts` — `preflightSendTargets` `:2232-2260` (add the `descriptor.relay === true && dead` branch → allow, tag the send as `relay-down`); send result shapes — receipt `"delivered"` `:2288`, wording `:2397`, `deliveryState` `:4619` (add the `queued`/`recipient-dead` shape); `:1928` the existing relay classification.
- `.pi/extensions/pij/adapters/sqlite-queue.ts` — receipt helper for the note (grep `receipt`); the row is a normal `queued` delivery that drains when the bridge (in-process in the daemon since item 29) consumes it.
- `.pi/extensions/pij/core/cli.test.ts` (send preflight tests; fake dead descriptor fixtures) and `cli.integration.test.ts`.
- `docs/how/pij.md` (send semantics) and `docs/how/pij-watchdog.md` (deliberate-silence class).

## 4. Acceptance (behavioural, mechanical)
- Tests: fake descriptor `relay: true` + dead pid → `pij send` exit 0, `state: queued`, output line as ruled, receipt/note `recipient-dead`; fake DISSOLVED ordinary seat → `E-DEAD` unchanged; live relay → `delivered`/`unverified` as today; then (integration) the queued row is delivered once a fake relay consumer appears.
- **MUT-28a**: remove the relay branch → the relay test RED (E-DEAD). **MUT-28b**: make the branch apply to ALL dead seats → the dissolved-ordinary test RED. **MUT-28c**: drop the note → the receipt assertion RED.
- Gates: full `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check`.

## 5. Live verification (after a daemon restart carrying it)
`pij daemon stop` (bridge dies with the daemon) → `pij send pij-telegram --body-file <f>` → `queued — relay is down; delivers on revive`, exit 0; `pij daemon start` → the message appears in Telegram; `pij queue --to pij-telegram` shows the row `acked`. Failure looks like 2026-08-27: `E-DEAD: session pij-telegram is dead` and nothing in Telegram.

## 6. Risks / gotchas that already bit us
- E25/E29: the human channel lost a message to a client-side refusal; any at-least-once change must degrade to duplicate, never loss.
- Item 34 (queue hygiene): rows to seats that never return sat `queued` for days — the relay branch must not become a third such class; it relies on the bridge's auto-restart (item 29) and the stale line (item 34).
- The bridge is now in-process (item 29): "dead relay" mostly means "daemon down", in which case `pij send` cannot reach the daemon either — the queue write still succeeds (sqlite, client-side), which is exactly why queuing is right.

## 7. Open questions for the human
None.
