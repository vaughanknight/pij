# tmux delivery audit (prime's subagent, 2026-09-01) — key facts for s122

- TmuxPort (crates/core/src/ports.rs:227-305): 13 verbs, production impl COMPLETE in crates/tmux/src/lib.rs (submit :326, send_keys :336, taps :354-495, user_typing :571). No stubs.
- Ladder: crates/core/src/delivery.rs:72-95 select_rung Observe→typing-veto→Pty→Socket→Pointer→Queue.
- Non-Claude pane seat today: commands typed via submit_command_claim (worker.rs:333-352 → pointer/mod.rs:78-79); BODIES never typed — pointer line only (pointer/mod.rs:40-45), seat must pull. This is what the ruling retires.
- First-attempt path (crates/daemon/src/delivery/mod.rs:236-250) has NO pointer/pty branch — only the DrainWorker reaches tmux. Consider whether first-attempt should type immediately (instant is the point) or stay queue→drain; decide with the reviewer, record why.
- Politeness gate WIRED upstream: permits_injection_fresh (worker.rs:270, delivery/mod.rs:236) composes user_typing + tap activity + fresh composer capture (plan 111 F-1112). select_rung's (false,true) at worker.rs:299 are discharged preconditions — invisible at the call site; thread or comment while there.
- Hazard: >1022-byte pty chunk on macOS — send-keys silently keeps only the tail (measured, plan 110 #330). Probe live; chunk-with-verify or load-buffer+paste-buffer.
- Copilot/codex CAN register/bind/spawn in rs today (model.rs:42-53, admission.rs:133-135, adapter.rs:169-284, spawn.rs:139-141).

## Operator repro, 2026-09-01 (screenshot in prime's session)
An OMP pane received `[pij-rs from pij-still-weasel]message waiting — run: pij inbox`. Jordan:
omp seats "should never need to get that — they just get messages via the extension". rs has no
pi-extension transport (uds is the only Transport impl), so pi/omp seats fall to the pointer rung.
s122 REQUIREMENT SHARPENED: the live witness set must include an OMP pane receiving a typed full
body (in addition to copilot/codex). The pi-extension transport itself is a separate follow-on unit.
