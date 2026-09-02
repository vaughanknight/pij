# s122 review fixes

Response to `review.c5c7fd2c.md`, `review.047ea0ed.md`, and `review.2701005f-second.md` (`REQUEST_CHANGES`).

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

`InteractionGate` now owns one `PaneTransaction`; `TmuxAdapter` owns its durable tmux half:

1. Each transaction receives a fresh 128-bit OS-random token. Adapter instances and process lifetimes cannot recycle identity.
2. One tmux-server `if-shell` CAS requires an empty owner and enabled input, then queues marker reservation, watchdog arming, and input disable in the same server command list. Two adapters or processes cannot both acquire the pane.
3. Every paste, abort, recovery, and commit transition is conditional on the same token. The watchdog first moves an active token to a private `-recovering` state, making every resumed stale write ineligible; it retries enable/clear without ever clearing a failed restoration.
4. `PaneTransaction` owns the self-injection exemption through RAII. Success, error, abort, deadline, unwind, and object destruction all drop it.
5. Commit first transitions the matching owner to `-committed`; only that token may send Enter. A failed transition cannot send. Once Enter succeeds it is the irreversible delivery receipt: cleanup failure stays successful while the already-armed watchdog clears the completed marker.

Bound and recovery:

- Body staging aborts after **1 second**.
- The tmux-server watchdog restores input after **2 seconds** even if the daemon panics, hangs, is SIGSTOPed, or is SIGKILLed. It leaves `PIJ STAGED UNSENT — inspect composer; Ctrl-C clears` visible for unsent staged text.
- Every ownership mismatch or pre-Enter error has one postcondition: pane input enabled; no unmatched process may clear or mutate a later owner's transaction.
- The supported pane-typing domain is an explicit **8,192-byte maximum for the complete `frame_message` output**. Reference-machine probes passed at 16,020 and 18,020 bytes but crossed the one-second bound at 19,012 and 20,020 bytes; 8 KiB is conservative and covers the 6,647-byte live witness. `submit_pastes_maximum_supported_body_intact` constructs and byte-checks an exact 8,192-byte frame; `submit_refuses_one_byte_above_supported_maximum_without_writing` proves an 8,193-byte frame writes nothing. `oversized_direct_frame_queues_without_typed_delivery` leaves direct delivery pullable; `oversized_worker_frame_is_named_and_immediately_pullable` emits one named 8,193/8,192 refusal and immediately re-exposes the intact row.

### Exit table

`transaction_exit_table_clears_marker_input_and_exemption` asserts every cell in the in-process table; the named real-tmux tests below cover the external deadline, cleanup, pause, and death mechanisms.

| exit | marker | input | exemption | outcome | external witness |
| --- | --- | --- | --- | --- | --- |
| success | clear | enabled | clear | `Submitted` | `staged_submit_excludes_human_input_mid_body_and_before_enter` |
| stage fail | clear | enabled | clear | error; not submitted | exit-table injected stage error |
| commit fail before Enter | clear | enabled | clear | error; not submitted | exit-table injected commit error |
| commit-marker transition fail | clear | enabled | clear | error; no Enter | `committed_marker_transition_failure_never_sends_enter` |
| cleanup fail after Enter | watchdog-cleared | enabled | clear | `Submitted`; never retried | `post_enter_cleanup_failure_remains_success_and_submits_once` |
| abort | clear | enabled | clear | deferred; no Enter | `abort_leaves_recovery_notice_unsent_and_restores_input` |
| drop without commit | watchdog-cleared | enabled | clear | no Enter | `dropped_staged_submit_restores_input_without_enter` |
| deadline | clear | enabled | clear | error; no Enter | `stage_deadline_aborts_and_restores_input` |
| daemon death | watchdog-cleared | enabled | process memory reclaimed | no delivery receipt | `daemon_death_mid_stage_restores_input_within_bound` |

Concurrency and recovery proofs:

- `forced_old_read_write_interleaving_allows_only_one_adapter`: forces both independent adapters past the old empty-marker read, then releases writes in order; the CAS admits one. Replacing the CAS with the old check-then-set failed red: `atomic CAS must reject adapter B`.
- `separate_processes_cannot_both_reserve_one_pane`: forces the same old read/write schedule across two OS processes. The CAS admits one; the check-then-set mutation failed red with two winners (`left: 2`, `right: 1`).
- `ownership_tokens_do_not_recycle_across_adapters` and `stale_watchdog_cannot_release_a_later_adapter_transaction`: distinct tokens are measured and adapter A's executed watchdog cannot change adapter B's marker or input.
- `watchdog_expiry_before_disable_cannot_strand_input`: a wrapper pauses the daemon while tmux executes the atomic acquisition; the watchdog restores input and clears ownership before SIGCONT, and a real human key is accepted afterward.
- `staged_submit_excludes_human_input_mid_body_and_before_enter`: real tmux sends repeated external `send-keys` during chunking and after bracket-close/before commit; captured PTY bytes contain only the automated body and one Enter.
- `daemon_death_mid_stage_restores_input_within_bound`: a helper acquires/stages, is killed, and tmux restores input plus clears the marker within the asserted 2-second bound.
- `stage_deadline_aborts_and_restores_input` and `abort_leaves_recovery_notice_unsent_and_restores_input`: deadline and explicit abort restore input, clear ownership, retain visible recovery text when needed, and emit no Enter.
- Live hand-run Copilot `pij-whole-zakalwe`, pane `%2299`: `S122-ACQUIRE-FIRST-HUMAN-DRAFT` remained the only composer text, send returned `queued`, body never appeared, `pane_input_off` returned to `0`.
- Live extension-free OMP `pij-nervous-energy`, pane `%2297`, and hand-run Copilot `pij-imperial-rattlesnake`, pane `%2298`: full frames arrived through the owned transaction as one turn.
- `committed_marker_transition_failure_never_sends_enter` forces the `-committed` transition itself to fail and captures staged bytes without CR; `post_enter_cleanup_failure_remains_success_and_submits_once` separately fails later cleanup and captures exactly one submitted turn.
- Rust `Drop` clears only the in-memory self-injection exemption; async tmux restoration cannot depend on the dying process. The watchdog is armed in the same server-side CAS that disables input and owns drop/death recovery. `dropped_staged_submit_restores_input_without_enter` proves an ordinary uncommitted object drop restores input and marker with no Enter.

### Pre-existing current-main parser blast radius

`origin/main` returned immediately from the first rounded `╰…╯` candidate even when its row did not contain the cursor. The fix scans onward only to positively identified prompt/footer composers; it no longer admits a generic blank rule region after a failed rounded candidate. `rounded_border_above_cursor_does_not_hide_later_composer` preserves the false-negative repair, while `decorative_blank_rule_region_is_not_an_idle_composer` proves unrelated blank decoration cannot authorize staging.

### Live draft/tap authorization

Pane submission always requires the freshly captured composer to be whitespace-only; draft age can relax socket policy but never `composer_idle`. Before that capture, `refresh_live_tap` drains the attached tap; unread bytes veto even when renderer lag still shows blank, and an absent tap is absence of evidence and vetoes. `owned_submit_hard_vetoes_stale_draft_and_fresh_tap` proves both arms and asserts no stage/submit call.

The full-daemon hang introduced by the new absent-tap veto was a fixture defect, not a relaxed production rule. `drain_loop_survives_transient_delivery_ack_failure_and_processes_next_message` now arranges live taps for all three manual panes and completes. Post-r2 suites: real tmux 29 main tests plus 3 helper-process runs (`artifact://799`), harnesses 67 passed/2 ignored (`artifact://801`), daemon 216 passed (`artifact://796`).

### Control-body error exits

`keep_control_body_pullable` is the single error boundary for the retained pull exception. A durable-notice lookup error, timestamp error after the notice lands, publication error, or submission error releases the claimed job before propagating. `control_pointer_lookup_error_leaves_body_immediately_claimable` and `control_pointer_timestamp_error_leaves_body_immediately_claimable` force both reviewed failures and immediately claim the original bytes. `latest_matching_message` performs durable suppression by seat, kind, and message id; `two_control_bodies_for_one_seat_each_receive_one_notice` proves two unsafe bodies for one seat each receive exactly one notice without cross-talk.

## F003 — deterministic-document identifiers

Acceptance IDs are `ac-0a01` through `ac-0a07`. Checked task `tk-0a01` carries seven schema-typed `satisfies` links, providing one incoming accounting edge for every claim. Both deterministic siblings were regenerated. `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` reports **status ok: 0 errors, 0 warnings, 0 orphans, 0 contradictions**.

## Final gate

At rebased head `232e07a5`, `~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` is green: toolchain, committed lock, fmt, clippy, tests, and architecture (9 crates, 0 violations; `artifact://915`). `harness checks` is also green across all eight sensors: local paths, TypeScript, Biome, Vitest, Windows compatibility, smoke, package audit, and snapshots. Supporting focused receipts: async-serialized real-tmux suite 29 main tests plus 3 helper-process runs (`artifact://860`); `pij-harnesses` 68 passed/2 ignored (`artifact://850`); `pij-daemon` 216 passed (`artifact://796`).

## Out-of-scope findings

The live no-extension OMP witness exposed return-path configuration, wrong-generation duplicate-adopt, and rs body-file defects. Prime accepted them into governance as `req-0026` and `req-0027`; this stream does not modify those surfaces.
