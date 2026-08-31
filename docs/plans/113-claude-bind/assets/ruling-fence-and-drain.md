# o-prime ruling — fence stands, core routing is correct, one AC arm added (2026-08-31)

1. FENCE STANDS, and core is not a bug: `proc:null -> Queue(PreBind)` (core/delivery.rs:143) is the
   HONEST verdict for an unbound seat — same doctrine as the trust-modal ruling: a readiness
   signal's absence is information; delivery must not bypass it. The binder is the true fix,
   exactly as you concluded.
2. KEEP your green pane-fallback fix at can_deliver — still owed by req-0002 for the
   bound-but-proc-degraded case; state in its receipt which case it covers now.
3. NEW AC ARM (free, valuable): send while pre-bind (observe Queued), let the binder complete,
   assert the queued row DRAINS to a real user turn with NO re-send. That proves the spawn->send
   race every orchestrator runs.

# Ruling 2 — session-record bind APPROVED with one condition (2026-08-31)

The circularity find is real (delivery IS the first user turn; a transcript-gated binder can
never deliver it). Binding on the session record is consistent WITH the trust-modal ruling,
not around it — the record is the honest readiness signal.

CONDITION (non-negotiable, standing scar): the record is keyed by PID and pids recycle at
boot. Pane/cwd corroboration does NOT break a recycling tie. The bind match MUST corroborate
PROCESS START TIME against the live process (crates/core liveness table already has start-time
identity). New test arm beside the wrong-pane mutation: a record whose pid is ALIVE but whose
start time MISMATCHES must NOT bind.
