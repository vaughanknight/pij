# s122 review fixes

Response to `review.c5c7fd2c.md` (`REQUEST_CHANGES`).

## F001 — terminal-control bodies

**Resolution: ruled narrow pull exception; no fake terminal escaping.** Bracketed paste has no escape for its `ESC[201~` terminator, and stock OMP/Copilot have no decoder that could restore a local textual encoding. The measured body domain is recorded in [`../terminal-control-measurement-2026-09-01.md`](../terminal-control-measurement-2026-09-01.md): LF survived byte-identically; every other measured `char::is_control()` value was dropped, expanded, normalized, or interpreted. A stray ESC—not only the closing delimiter—was explicitly measured as dropped, so the refusal does not over-classify a provably safe ESC.

Mechanism:

1. Socket remains preferred and may carry the original control bytes.
2. Without a socket, `DeliveryRung::ControlBodyPull` keeps the original `Msg` queued.
3. The pane receives exactly one durable `delivery.control-body-pointer` explanation: `message contains terminal control bytes that cannot be typed safely — body remains queued; run: pij inbox`.
4. The body is released with zero delay, so `pij inbox` can claim it immediately. The durable event suppresses repeat notices for that message.
5. `TmuxAdapter` rejects unsafe controls before any pane write as defense in depth.

Proofs:

- `terminal_control_body_uses_socket_or_named_pull_never_typing`
- `terminal_control_body_is_announced_and_remains_readable_in_inbox`
- `submit_rejects_bracket_terminator_before_touching_real_pane`
- Live OMP `pij-inc-anaconda`, pane `%2300`: one explanatory framed notice appeared; isolated `pij-rs inbox --seat pij-inc-anaconda` returned the original 67-byte body with embedded `\u001b`; SHA-256 `9ebd0ef342e5755ddc521f483460aeabcbba789008ab221e123f7ce07d820ec5`; one control-pointer event; queue row ended `done` after read.

## F002 — human input during submit

**Resolution: ACQUIRE → CAPTURE → STAGE → COMMIT. Structure prevents the race; rendered-pixel comparison was deleted.**

`TmuxPort` now exposes an opaque `StagedSubmit` transaction:

1. `acquire_submit` mints a token, schedules a tmux-server-owned recovery watchdog, records the pane marker, disables pane input, and verifies `#{pane_input_off}=1`.
2. `InteractionGate::submit_with_owned_input` performs the existing fresh permission/composer capture only after ownership. Non-empty or unrecognized composers are deferred before any text is staged.
3. `stage_submit` writes UTF-8-safe chunks inside one bracketed-paste transaction. Each programmatic write uses one tmux command list that temporarily enables input, pastes, and disables input again; external keys cannot interleave between those commands.
4. `commit_submit` atomically enables input and sends the one named Enter. `abort_submit` never sends Enter; if any body text was staged, it appends an in-composer recovery notice telling the operator to inspect it and press Ctrl-C, then restores input.

Bound and recovery:

- Body staging aborts after **1 second**.
- A tmux-server `run-shell` watchdog restores input and clears the ownership marker after **2 seconds** even if the daemon panics, hangs, or is SIGKILLed. It sets the pane title to `PIJ STAGED UNSENT — inspect composer; Ctrl-C clears`.
- Marker-before-mutate and enable-before-clear ordering prevent an unmarked disabled pane.

Load-bearing proofs:

- `staged_submit_excludes_human_input_mid_body_and_before_enter`: real tmux; sends repeated real `send-keys` input during chunking and once after bracket-close/before commit; captured PTY bytes contain only the automated body and Enter.
- `daemon_death_mid_stage_restores_input_within_bound`: a helper process acquires/stages, is killed, and tmux restores input plus clears the marker within the watchdog bound.
- `stage_deadline_aborts_and_restores_input`: a 200,000-byte transaction crosses the 1-second limit, aborts, restores input, clears the marker.
- `abort_leaves_recovery_notice_unsent_and_restores_input`: recovery text is present, no CR/Enter is emitted, input is restored.
- `expired_nonempty_draft_still_vetoes_typed_body_delivery` and `expired_nonempty_composer_still_retries_typed_body`: direct and drain paths defer typed bodies; forcing the guarded composer fact true was mutation-proved red before repair.
- Live hand-run Copilot `pij-whole-zakalwe`, pane `%2299`: `S122-ACQUIRE-FIRST-HUMAN-DRAFT` remained the only composer text, send returned `queued`, body never appeared, `pane_input_off` returned to `0`.
- Live extension-free OMP `pij-nervous-energy`, pane `%2297`: full multi-line body arrived intact through acquire/capture/stage/commit. Hand-run Copilot `pij-imperial-rattlesnake`, pane `%2298`, also received the full frame as one turn.

### Pre-existing current-main parser blast radius

`origin/main` returns immediately from the first rounded `╰…╯` candidate even when its row does not contain the cursor. Any welcome panel or rounded bordered output above the real prompt can therefore hide the current composer. This is live on current main: the committed OMP pane fixture was explicitly pinned as `Unrecognized`; `PaneObserver` and `fresh_injection_verdict` inherit that result, delaying delivery until uncertainty expires and then falling back to tmux mode without actual composer evidence. The generic fix now returns only when a candidate clips at the cursor; otherwise scanning continues. `rounded_border_above_cursor_does_not_hide_later_composer` was mutation-proved red; the existing live OMP fixture is retargeted to `Recognized("")`.

## F003 — deterministic-document identifiers

Acceptance IDs are now `ac-0a01` through `ac-0a07`, written through `ddocs`; each criterion also has the schema-required `claim`. `plan.dd.md` was regenerated. `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` reports **0 errors**. Seven `orphan-claim` warnings remain because this prototype task dossier has no typed `proven_by` rows; receipts are present and the E403 release blocker is gone.

## Final gate

`~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` is green after all review fixes: toolchain, lock, fmt, clippy, test, and architecture (9 crates).

## Out-of-scope findings

The live no-extension OMP witness exposed return-path configuration, wrong-generation duplicate-adopt, and rs body-file defects. Prime accepted them into governance as `req-0026` and `req-0027`; this stream does not modify those surfaces.
