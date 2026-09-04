# Copilot native extension delivery — coordination brief

## Human request
Replace Copilot CLI tmux sendkeys delivery with direct native extension messaging for NEW sessions launched both manually and by Pij. Existing sessions need not work. Keep tmux for presentation/layout where desired. Research and scratch PoCs were authorized first; Jordan now requests a worktree, a /builder plan and implementation guide, then OMP coder GitHub Astra 6 high and OMP reviewer Claude Opus 5 high. This originating seat is PM and personally authors plan/guide; coder/reviewer do not author them.

## Evidence and boundaries
- Native Copilot CLI 1.0.84-0 automatically loads user-level extensions when experimental features enabled. `joinSession()` from bundled `@github/copilot-sdk/extension` attaches current native session regardless of launcher. No external package install is needed.
- Scratch direct-native PoC: /Users/jordanknight/pi-hacking/pij/scratch/copilot-manual-extension-research/evidence.json. No --ui-server/--port; manual-equivalent CLI. Opting in during a session retained identity/history after native reinitialization.
- Full real-daemon PoC: /Users/jordanknight/pi-hacking/pij/scratch/copilot-pij-daemon-poc/evidence.json. Real isolated SQLite-backed pij-rs, two real Copilot CLI sessions, extension self-registration + blocking inbox claim + native send + explicit ack, target response routed through Pij to driver. Repeat msg_id suppressed duplicate; both inboxes empty. All processes stopped. Deterministic local provider, NOT real LLM proof.
- PoC seats were PANELLESS, using generic inbox. Production must explicitly express extension delivery ownership for pane-backed Copilot so daemon never also injects tmux. Do not register Copilot as Pi to fake ownership.
- Prototype auto-forwards target assistant answer only as a witness; do not promote this into automatic production reply behavior.
- Current Rust spawn emits --ui-server/--port and rpc_port_intent; actual Copilot RPC transport is absent. Plan109 holds graded wire/consent findings. Revisit obsolete RPC launch machinery as clean cutover, do not start competing work without coordination.

## Expected implementation scope to plan
Repo-managed Copilot user extension installation/enabling with preservation of user config; true session/PID identity adoption for manual and spawned Copilot; explicit exclusive extension-owned delivery including pane-backed sessions; durable inbox/ack semantics with honest receipt grade; lifecycle/reconnect/session rollover; outgoing Pij command/tool identity; no tmux fallback for new supported Copilot extension seats; tests and isolated real CLI smoke for manual AND Pij spawn, plus real model canary if available.

## Coordination request
Confirm ownership/overlap (especially Plan109), allocate/approve plan ordinal and worktree/branch/base, point at latest governing constraints and standard plan/impl-guide templates. PM will author documents and run coder/reviewer pairing per Jordan's model instructions.

## Forbidden paths for recipients
Do not edit `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, governance ledgers under `.harness/government/`, or any product files from this brief alone. This is a coordination packet, not an implementation dispatch.
