# Plan 118 execution log

## Renderer inventory

The workspace-wide literal search found exactly three pij-rs production render sites:

1. `crates/transport/src/uds.rs` — UDS body inside Claude's cross-session envelope.
2. `crates/daemon/src/pointer/mod.rs::render_pointer` — ordinary queued-message pointer.
3. `crates/daemon/src/pointer/mod.rs::render_final_pointer` — parked final reminder.

The byte-exact UDS fixture and Rust expectations are consumers, not producers. The production head literal now exists only in `crates/core/src/framing.rs`; `crates/testkit/tests/message_framing.rs` guards that ownership.

## Decisions and findings

- Canonical frame: `[pij-rs from <seat>]\n<payload>\n[/pij]`; remote senders remain address-qualified as `<seat>@<machine>`.
- Pointers use the tail marker despite carrying no body. Uniform framing means no reader must distinguish pointer and body message kinds; callers supply only payload text, and one formatter owns the complete envelope.
- The interaction gate accepts an equivalent legacy frame recorded before the cutover when the composer subsequently exposes the pij-rs frame. The exemption remains exact to sender and body; adjacent human text still acquires a hold.
- Legacy TypeScript framing is a decided non-goal, not parity debt. During dual-run, the asymmetry carries the generation signal: pij-rs emits its label and tail; legacy does not. Porting either marker to legacy would erase or falsify the distinction Jordan requested.
- Live worked example: this coder's initial ACK reached `pij-dominant-vicuna` only as the unlabelled parked final reminder after three announcements. The recipient had to run `pij-rs inbox --seat pij-dominant-vicuna` manually and could not identify the delivering generation from the pane. The new final pointer names `pij-rs` directly.

## Red-green evidence

RED, before implementation:

- `cargo test -p pij-transport back_to_back_messages_have_two_explicit_body_boundaries` — failed with zero `[/pij]` boundaries.
- `cargo test -p pij-daemon pointer_bytes_name_sender_and_pull_command_without_body` — failed because the pointer still used the legacy one-line frame.
- `cargo test -p pij-harnesses legacy_frame_observed_as_pij_rs_frame_remains_a_self_echo` — failed because the generation transition acquired a hold.

GREEN, after implementation:

- `cargo test -p pij-core framing` — 2 passed.
- `cargo test -p pij-transport uds::tests` — 21 passed.
- `cargo test -p pij-daemon pointer` — 27 passed.
- `cargo test -p pij-harnesses self_echo` — 6 passed.
- `cargo test -p pij-harnesses generation_transition_with_adjacent_human_text_acquires_a_hold` — 1 passed.
- `cargo test -p pij-testkit --test message_framing` — 1 passed.
- `cargo test -p pij-cli rendered_pointer_advertises_a_verb_the_real_cli_exposes` — 1 passed.

## Gate

The first full gate correctly rejected the changed byte fixture because its corpus manifest still named the old checksum and answer. After re-reading the new contract, `MANIFEST.toml` was updated to name the pij-rs wrapper and tail.

`~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — all stages green: toolchain, lock, fmt, clippy, test, arch (9 crates, 0 violations).

`harness checks` was also attempted with `PIJ_DAEMON_GENERATION=legacy` so the live dual-run daemon could not capture legacy integration tests. Typecheck, lint, and Windows compatibility passed. The composite remained non-zero on unrelated repository surfaces: 13 existing absolute governance paths under `skills/pij/`, the npm resolution-policy replay under local npm 11.5.1, and its in-run smoke stage. A standalone `just smoke` immediately afterward passed all 11 scenarios, including `pij`.
