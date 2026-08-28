# Cutover design — TS daemon -> pij-rs daemon
**Status**: DESIGN, pre-plan (executes as its own plan per plan-108 non-goals) · **Author**: pij-dominant-vicuna · 2026-08-28
**Jordan's framing (verbatim intent)**: no restart needed for Claude Code or Copilot instances; OMP and pi seats carry the in-process pij extension and must change over to the new formats to talk to the new daemon properly.

## The asymmetry that shapes everything

| Seat class | How it touches the daemon | Cutover impact |
|---|---|---|
| claude / copilot / codex | NONE in-process. Daemon binds them from outside (transcript discovery / --session-id); delivery arrives via tmux send-keys or UDS; they run `pij` CLI as a subprocess | **Survive the swap live. No restart.** Their only coupling is (a) the `pij` binary on PATH and (b) store continuity |
| pi / OMP | In-process pij EXTENSION (.pi/extensions/pij) loaded at seat boot — speaks the daemon's wire directly | **Cannot hot-swap.** Old seats keep the old extension until they die; new seats load the new one. Needs a compat story, not a flag day |

## Phases

1. **Parity soak (pij-rs read-only)** — pij-rs CLI answers read verbs against an IMPORTED snapshot of the TS store; byte-goldens diff computed payloads per PRD req-0002. TS daemon stays authoritative. Exit: goldens stable N days, zero diffs on the parity set.
2. **State import, rehearsed** — one-shot importer: TS JSON registry + spine + inboxes -> SQLite. Rehearse repeatedly against live snapshots BEFORE the swap; importer is idempotent and reports row counts both sides (set-equality, not "looked fine").
3. **The swap (one daemon-restart baton window)** — stop TS daemon -> final import -> start pij-rs daemon -> canary: one send to a live claude seat, one to a copilot seat, receipts verified. Claude/copilot/codex seats: NOTHING done to them — binding re-derives from the store, transport unchanged. Rollback = stop pij-rs, restart TS daemon (store export back OR accept the window's delta loss — ruled at plan time).
4. **`pij` binary swap** — PATH points at pij-rs (TS CLI kept as `pij-ts` for the soak). All seat classes pick it up on next invocation; no seat restart (subprocess surface).
5. **Extension changeover (pi/OMP), version-gated not flag-day** — new extension speaks pij-rs HTTP/envelope (v field + Hello). pij-rs daemon serves a COMPAT SHIM for the old extension's surface for one window, so in-flight OMP seats keep working until natural turnover; shim logs each old-format contact (a consumed deprecation sensor, not a silent one). New spawns load the new extension immediately. Shim retires when the contact log is quiet N days — measured, not assumed.
6. **TS retirement** — after soak + quiet shim: TS daemon code frozen, `pij-ts` removed, cutover plan post-flighted.

## Rules carried in from doctrine
- Swap window runs under the `daemon-restart` baton with heads-up broadcast (C6).
- Every phase has a receipt (import counts, golden diffs, canary receipts, shim contact log) — no phase exits on "seems fine".
- The importer and the shim are BOTH disposable code with tests — deleting them at retirement is part of the plan's done bar.

## Open questions (ruled at cutover-plan time, not now)
- Rollback data policy: re-export SQLite->JSON, or accept delta loss in the window?
- Shim scope: full old surface, or only the verbs live OMP extensions actually call (measure first from daemon logs)?
- Does the UDS/socket transport (s105) land before or after the swap? (Either works; before = one less moving part during soak.)
