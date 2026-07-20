# Carry-forward — observable terminal-notice delivery failure

**Status**: non-blocking enhancement; not a Plan 059 Phase 3 gate.

Phase 3 intentionally persists the terminal/notice latch before proactive delivery, choosing at-most-once behavior so restart cannot replay old death as a new incident. The terminal transition remains durable/queryable if the push is lost.

Follow-up: persist a separate delivery-failed marker when the creator notice cannot be written, including attempt time and channel error. This makes the missed push actively discoverable without weakening the terminal latch or retrying into duplicates.
