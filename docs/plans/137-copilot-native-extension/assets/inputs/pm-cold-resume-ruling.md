# PM cold-resume and fresh-process native identity requirements

2026-09-05; follows Opus P1-B composition finding.

Removing PID from FileJournal is necessary but not sufficient if chooseRegistration remints the Pij id. Implement and prove the WHOLE chooseRegistration -> daemon registration -> FileJournal path:

1. Same native session resumed by a new real Copilot process keeps its existing Pij address when that prior process incarnation is proven dead/replaced. Runtime may nominate a unique same-native-session roster candidate; daemon remains authority, observes prior incarnation liveness, refuses any still-live owner, verifies new actual Copilot/pane ancestry, and revalidates under mutation exclusion. Do not rely on state text or session UUID alone. Stable fallback manual naming should not depend on PID. Existing spawned preallocated identity/correlation takes precedence when valid.
2. A NEW native session in a pane previously occupied by a now-dead native-attested Copilot must not fail forever on stale roster pane ownership. New native conversation gets new Pij address; checked stale native resource retirement releases the pane, preserves predecessor messages and does not retarget them. Live/conflicting/prebind uncorroborated owners still refuse. Legacy unverified shell-PID records are not silently taken over.
3. Same-host user-driven /new continues checked new-id supersedes. No automatic old-context message migration. Native restart tests must call real chooseRegistration rather than holding registration.id constant in a fabricated object.
4. Use existing additive register request shape if possible; any new cross-unit field needs PM ruling before implementation. No broader generic identity rewrite or new endpoint. New-process same-session private journal survives because the Pij id and native session are both stable; active pid/start validation remains strict.

Proof: real filesystem accepted-before-ack restart with changed host process + same native session and actual registration-selection path, plus public HTTP/real SQLite dead-owner rebind/live-owner refusal/new-native new-address with old queued body preserved. This addresses cold resume and everyday manual pane reuse, not unrequested migration of pre-feature sessions.
