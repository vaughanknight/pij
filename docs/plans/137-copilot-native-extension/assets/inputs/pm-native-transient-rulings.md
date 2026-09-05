# PM native transient outcome ruling

2026-09-05; closes Opus P2-G without broad retry-all.

- A claimed delivery that completed or changed attempt while observation was unlocked is ordinary contention: service re-loops/re-observes rather than emitting client-fatal refusal. Never hand out/retry/ack the successor claim using stale observation.
- A same-native pane-observation change is a recoverable held/re-observe outcome; do not terminate the whole consumer. Genuine native tuple mismatch/live-owner conflict remains a refusal.
- Missing registry seat is registration-required, not the same as a current non-Copilot/mismatching seat. Reuse the existing precisely retryable native-extension-unavailable registration-required response for the missing-seat case where appropriate; do not widen every HTTP400.
- Pin machine discriminators on the PRODUCER side with exact HTTP/constructor assertions, and verify the actual producer shape against the runtime client. Human prose must not be the only unstated contract. Prefer existing stable held/error token shapes and a shared fixture/tripwire over a new general error framework. Any new public field requires PM approval first.
- New cold-resume ambiguity gets an explicit decision: non-unique candidate can boundedly refresh roster without choosing; old owner still alive refuses takeover with actionable diagnostic. Security/identity uncertainty never enables transport fallback or unguarded injection.

Current composer-gate semantics remain unchanged pending Jordan. These service lifecycle/reconnect corrections do not decide that policy.
