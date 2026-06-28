# Original ask — fix-false-provider-death
**Captured**: 2026-06-28  ·  **By**: /the-flow (queued via /flow-pair)

> write up the fix task now using /the-flow then log it to do after codex work

**Context (the bug):** during the plan-022 flow-pair run, the daemon pushed
`💀 pij-1f3q58b has exited (reason: quota). The session is dead and will not
recover.` for a coder that was **alive and actively working** (`pid` alive,
`lastEventAt` advancing, footer `✽ Schlepping…`). It had hit a transient
rate-limit, the harness retried through it, and it kept going. The provider-failure
peek (FIX-A / DL-005, daemon.ts:175) classifies a terminal death from pane
scrollback text alone, with no liveness corroboration. Full root-cause:
`docs/plans/019-pij-tmux-control-plane/control-plane-feedback.md` § Fourth run.

**Queue note:** do this AFTER the plan-022 codex build lands + reviews — the fix
touches `daemon.ts` / `core/state.ts` / `core/binding.ts`, which the codex coder
is editing live. See [[plan 023 fail-loud-model]] — this fixes a defect in the
whole-life creator-notify that 023 shipped.
