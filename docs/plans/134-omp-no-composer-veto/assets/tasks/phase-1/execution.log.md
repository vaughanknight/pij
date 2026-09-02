# Phase 1 execution log

## tk-1341 — Route Omp/Pi through the extension stream

**Status**: code and live proof complete; commit/push pending

- Corrected the plan premise: production `UdsTransport` is Claude-only; Omp/Pi delivery is the queue-backed `message.pushed` event stream plus inbox claim/ack.
- RED: `~/.cargo/bin/cargo test -p pij-daemon omp_and_pi_use_the_extension_stream_without_composer_gates -- --nocapture` failed because the observed reason was `human-typing`, expected `extension-stream` (`artifact://46`).
- Intended cutover: Omp/Pi select `DeliveryRung::Observe` before transport availability, both composer gates, and `select_rung`; other harnesses remain unchanged.
- GREEN: focused regression passed (`artifact://51`); full daemon delivery module passed 20/20 (`artifact://58`).
- LIVE: two hand-started OMP clients against isolated port `17462`; a message sent during the target's 60-second tool call returned `queued/reason:extension-stream`, was inbox-acked six milliseconds after `message.pushed`, and appeared at turn end with `LIVE134-SEEN` (`assets/live-proof.md`).
- Production daemon/state remained untouched. The pre-flight baseline was retained: typecheck passed; timing-sensitive `file-watch-notify` smoke failed after 82.7 seconds and will be rerun once before PR per prime ruling.
