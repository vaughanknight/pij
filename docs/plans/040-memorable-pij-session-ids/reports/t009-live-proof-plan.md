# s040 T009 live proof plan
**Prerequisite**: final review APPROVE (satisfied)
**Baton**: queued daemon-restart request
`request-265381bb-4cd4-4d28-9be7-6f4357042217`

## Required post-restart probes

1. **Reviewed daemon generation**
   - restart once under baton;
   - confirm new daemon PID and healthy tick.
2. **Existing memorable peer delivery**
   - resend a nonce to `pij-gigantic-goat`;
   - require inbound receipt/reply without manual pane injection.
3. **Normal memorable spawn**
   - create a new peer;
   - prove `pij-<word>-<word>` id, bound descriptor, send/state/path behavior.
4. **Copilot `/new`/adopt F004**
   - current `COPILOT_AGENT_SESSION_ID` wins even when another global directory is newer;
   - old descriptor/tuple/pane remain unchanged.
5. **Late session-state automatic recovery**
   - current Copilot env UUID is valid but its state directory is absent/late at adopt;
   - adoption remains safely pending and never steals a global id;
   - after the state signal becomes available, the daemon's existing init/watchdog
     phonehome path must bind without manual pane injection.
   - If automatic recovery fails, reopen Plan 040; do not defer it silently.
6. **Regression floor**
   - FX001/FX002, baton, broadcast, and prime behavior remain green;
   - full `harness checks` after live cleanup.

## Field datum disposition

The pre-restart `pij-concrete-reptile` test timed out waiting for a receipt but later
received and replied to the nonce. This is delayed confirmation, not delivery loss.
The observed Enter/input issue remains watch-only until reproducible.
