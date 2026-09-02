# Phase 1 execution log

## tk-1341 — Route Omp/Pi through the extension stream

**Status**: code and live proof complete; commit/push pending

- Corrected the plan premise: production `UdsTransport` is Claude-only; Omp/Pi delivery is the queue-backed `message.pushed` event stream plus inbox claim/ack.
- RED: `~/.cargo/bin/cargo test -p pij-daemon omp_and_pi_use_the_extension_stream_without_composer_gates -- --nocapture` failed because the observed reason was `human-typing`, expected `extension-stream` (`artifact://46`).
- Intended cutover: Omp/Pi select `DeliveryRung::Observe` before transport availability, both composer gates, and `select_rung`; other harnesses remain unchanged.
- GREEN: focused regression passed (`artifact://51`); full daemon delivery module passed 20/20 (`artifact://58`).
- LIVE: two hand-started OMP clients against isolated port `17462`; a message sent during the target's 60-second tool call returned `queued/reason:extension-stream`, was inbox-acked six milliseconds after `message.pushed`, and appeared at turn end with `LIVE134-SEEN` (`assets/live-proof.md`).
- Production daemon/state remained untouched. The pre-flight baseline was retained: typecheck passed; timing-sensitive `file-watch-notify` smoke failed after 82.7 seconds and will be rerun once before PR per prime ruling.

## tk-1344 — Make Claude veto composer-box authoritative

**Status**: complete

- VERIFIED cause: `refresh_live_tap` treated any drained pane-output byte as `record_tap`; the recognized blank capture preserved that latch and produced `human-typing`.
- RED: `fresh_boundary_streamed_output_with_blank_composer_permits` failed on the pre-fix latch (`artifact://127`).
- FIX: fresh boundary still drains the tap but never classifies output as input; a recognized blank composer is authoritative and permits, while non-blank content returns `human-typing` with the first 12 hex characters of SHA-256 in typed `draft_sha` fields.
- GREEN: interaction suite 24/24 (`artifact://156`); delivery suite 20/20 including serialized `draft_sha` (`artifact://157`); workspace tests compile.
- LIVE: worktree-built UDS delivered the 3,080-byte `PLAN134-U3-MAGPIE-EMPTY` sentinel to magpie's real Claude PID `13020` in 152.743625ms; magpie confirmed a real user turn, 40/40 ordered lines, no truncation, composer empty, and production daemon/tap untouched (`assets/live-proof.md`).
