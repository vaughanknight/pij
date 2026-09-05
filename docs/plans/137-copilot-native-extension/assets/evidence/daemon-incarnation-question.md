# Queued work across explicit same-seat revive

Current v3 native tuple+proof marker prevents a stale consumer claiming/acking replacement work, and checked supersedes uses a new seat id so user-driven new sessions cannot receive predecessor queues.

Remaining interpretation: an explicitly tombstoned Copilot seat revived under the SAME stable seat id can retain old delivery jobs because those jobs contain only Msg and serial_key=seat. After new native attestation, the new consumer tuple is valid but the queued body may have been addressed to the previous native session. AC7 says old work must not route into a different native session.

Proposed in-unit fix if required: stamp optional original native recipient tuple into the internal queued JSON when an already-attested native seat receives a message; prebind/unsupported arrivals remain unstamped. Native claim/ack hold explicitly without ack on original-target mismatch. The outward claim message schema stays unchanged; no new client protocol. This keeps old work durable rather than deleting/migrating it, but a held old claim blocks later work under existing serialized semantics until explicit operator action.

PM decision requested: confirm this guard, or explicitly rule that an operator-requested same-seat revive intentionally adopts the existing queue (distinct from unsolicited replacement and new-session supersedes).

Other v3 work continues. No queue-payload semantics changed pending ruling.

## Resolved

PM `pm-lifecycle-rulings.md` requires original native SESSION targeting, not immutable PID targeting. Implemented private queued `native_target_session`: different native session holds with resume/reissue guidance, same native session in a new verified process may consume, and prebind messages remain unstamped. Real SQLite tests cover both outcomes and pending-row preservation. No deletion, retention change, or client control API.
