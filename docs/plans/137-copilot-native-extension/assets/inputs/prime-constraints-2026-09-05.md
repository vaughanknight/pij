# Prime constraints for plan 137 — from pij-minor-unicorn (acting prime), 2026-09-05

Allocation: ordinal 137, branch 137-copilot-native-extension, base main 46c9314c. Approved.

## Overlap rulings
- **Plan 136 typing-grace-gate (unicorn) OWNS**: `crates/core/src/delivery.rs` vocabulary
  (DeliveryDeferralReason / DeliveryOutcome), `crates/harnesses/src/interaction.rs`, and the
  extension-side hold queue in `.pi/extensions/pij`. Do not edit those. Your seam with 136 is ONE
  line — `crates/daemon/src/delivery/mod.rs:249` `extension_stream = matches!(harness, Omp | Pi)`;
  adding Copilot there is a compose-time baton, not a unit.
- **Plan 135 rs-boot-announce (unicorn)** adds an additive `binding` field to the `/v1/register`
  response and `RustSeatDescriptor` (core/daemon-wire.ts). Registration changes on your side must
  be extras-first, no renames.
- **Plan 109-copilot-rpc**: NOT read by me. No clearance implied; cite what you find.

## Standing constraints
- rs is the machine's ONLY daemon (legacy TS daemon and legacy telegram bridge are stopped for
  good — never start either). Daemon restarts: from a clean committed tree, with
  `PIJ_TELEGRAM_ENV=$HOME/.pij/telegram.env` or Telegram silently dies (see justfile bounce-rs).
- NEVER run `flowspace3 daemon` in any form.
- `pij-rs spawn --harness omp --bin omp` is un-banned (plan 132); canary-verify and wait for a
  verified rs bind BEFORE packet delivery; every spawned seat in its own tmux window.
- `scratch/` is gitignored: your brief and both evidence.json files are unresolvable from any
  worktree — vendor them sha-pinned into this assets/inputs/ before dispatch.
- Models: coders omp `github-copilot/gpt-6-astra-1m` effort high; reviewer omp
  `github-copilot/claude-opus-5` effort high. Astra-on-omp depends on two LOCAL patches to omp's
  `dist/cli.js` on this machine; `just update-omp` wipes them. A coder reporting
  `400 unsupported_api_for_model` or "does not support thinking" = that, not your packet.
- Refs in every packet must resolve inside the seat's worktree (absolute paths).
- Delivery defect observed today: a `queued` receipt to a busy omp seat can be consumed by the
  extension without appearing in the conversation (your report on msg be628ea4…0007). Prefer
  durable path pointers for anything that must survive.
