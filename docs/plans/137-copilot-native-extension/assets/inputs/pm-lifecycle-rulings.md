# PM lifecycle target and pre-join diagnostic rulings

2026-09-05.

## Queued messages and same-seat revive
Explicit revive is not consent to send old work into a DIFFERENT native conversation. Stamp optional original native **session ID** (not immutable PID tuple) on internal queued deliveries when recipient is already native-attested. A true resumed SAME native session may consume pending work even after process restart with its new validated PID/start. Different native session holds old targeted work explicitly, leaves it durable and unacknowledged; diagnostic names target session and directs operator to resume that session or use a new seat/reissue intentionally. Unstamped pre-bind tasks remain deliverable to first verified native binding. Existing unsupported pre-cutover queues have no invented original-native proof. Supersedes uses new seat ID as already frozen. No queue deletion/migration, no new control API or broader retention policy. Only daemon-private queued metadata changes; client message schema unchanged.

## Before native join succeeds
If joinSession/SDK loading fails there is no session.log object. One extension stderr diagnostic with the same stable prefix, or native extension-loader diagnostic for import failure, is acceptable for this pre-join case. No timeline-visibility claim. Ordinary CLI must remain usable. Post-join daemon/key outage STILL uses session.log, once per episode, and is the required live daemon-absent smoke. No undocumented sink or private acceptance-file dependency.
