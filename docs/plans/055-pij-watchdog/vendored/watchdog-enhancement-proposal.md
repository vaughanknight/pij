# Enhancement request: first-class watchdog in the pij core CLI

**Origin**: s054 overnight loop (R8), 2026-07-16. **Ruled by**: Jordan (in-pane) — "Report it to the Prime and we'll log it as a future enhancement request to make a first class option in the core CLI." **Proposer**: pij-civilian-takin (s054 orchestrator).

> **STATUS UPGRADE — 2026-07-17, ruled by Jordan (in-pane)**: "we are going to implement the pij watchdog so that next time limits happens it will auto resume." No longer a future request — ruled for implementation, with **auto-resume after usage-limit freezes** added as a first-class requirement (§ Limits auto-resume below). Stream placement: dove (o-prime) to assign.

## The concept (as proven tonight, hand-rolled)

Orchestrators supervising a long-running coder peer need two signals pij doesn't emit today:

1. **Hard failure, immediately** — peer liveness flips to `stalled`/`dead` → wake the supervisor now.
2. **Silence as a signal** — no event from the peer for N minutes is itself assessment-worthy, even when state reads `idle`/`active`. Tonight's loop: a background shell loop polls `pij state <id> --json` every 60s for a 20-min window; early-exits on stall/death, else emits a heartbeat line ("assessment due"). Either way the *loop* does the polling and the orchestrator only wakes on an event — push-not-poll is preserved at the orchestrator level.

On wake, the supervision protocol is cheap and graduated: one liveness read → status request (COMPLETE/CONTINUING/BLOCKED) only if silent past threshold → recovery poke → redispatch only after both fail. The watchdog restarts each cycle.

## Proposed first-class shape (sketch, dove/Jordan to refine)

- `pij watchdog start <peer-id> [--heartbeat 20m] [--poll 60s] [--notify <peer-id>]` — daemon-owned timer (the daemon already ticks peers; no shell loop needed). On stall/death: pushed turn to the owner/`--notify` target immediately. Every heartbeat interval: pushed heartbeat turn with a state snapshot.
- `pij watchdog stop <peer-id>` / `pij watchdog list` — lifecycle + visibility; auto-cancel when the watched peer closes.
- Registry-visible (a `watchdog` block on the descriptor) so a future UI can render supervision edges — fits the s054 UI-shaped-data doctrine.

## Limits auto-resume (the 2026-07-17 requirement)

Field evidence from s054 P1 fix cycle 1: the account hit usage limits mid-cycle and the coder froze for **~7.5 hours** with a signature no current signal catches — `state=idle`, `activity=done`, **`liveness=active`** (daemon ticks fine, peer process alive), but `lastEventAt` frozen since 14:10Z with an open assignment. Recovery required a human ("continue, we hit limits") + a manual orchestrator poke.

What the watchdog must add:

1. **Freeze detection** — `lastEventAt` age > threshold *while an assignment/dispatch is open* must degrade the effective liveness signal (today `active` lies). Open-assignment awareness can ride s054 P2's per-node current-task/`system_state`.
2. **Limits classification** — distinguish limit-starvation from a genuine wedge: pane-tail match on the harness's limit banner (per-harness regex table, like BUSY_RE) and/or API-error patterns in the peer's events. Banner usually carries the reset time — parse it when present.
3. **Auto-resume** — on limits-reset (parsed time, else periodic retry with backoff): push a resume turn to the frozen peer — re-orient from your own logs/packet, verify what actually landed on disk before trusting prior in-flight state (background subagents/workflows die silently in the freeze), continue. Notify the `--notify` target that an auto-resume fired.
4. **No false pokes** — resume fires only on (freeze signature ∧ limits classification ∧ reset reached); a plain wedge still routes to the supervisor as today.

## Relation to s054

Phase 2 makes `system_state` (starting·working·idle·stalled·stopped·dead·unknown) first-class; the watchdog is the natural *consumer* of those states — supervision built on the platform store, not a competing state source. Out of s054 scope (fence + phase plan locked); this is a future stream's work.
