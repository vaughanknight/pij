# PM acknowledgement rulings — plan137

2026-09-05, PM pij-grim-gurgeh. These refine frozen contracts before source GO.

## Daemon ACK
1. Stale-consumer gap upheld. Contractv2 adds `native_session`, `pid`, `proc_start` to Copilot native claim query and ack JSON. Revalidate against current attested descriptor at actual handoff and before ack; ack also verifies job recipient. Other harness requests unchanged. No new bearer credential framework.
2. Same native-session reconnect retains seat. A user-driven new native session uses checked explicit supersedes for the same host process; unsolicited mismatch refuses. Never newest-by-mtime or silent identity takeover.
3. Named `.pi/extensions/pij/cli.ts` and `core/generation-routing.ts` Copilot-only unsupported-control guards and direct tests are narrow fence exceptions. The hold queue and other .pi sources remain excluded.
4. Existing InteractionGate is authoritative; stop only consent-dependent work if existing API cannot meet required handoff, present evidence. No policy/timer edits in136-owned files.

## Runtime ACK
1. Actual host PID/native context must be verified, not extension-child identity. Carry immutable tuple on every native claim/ack (v2).
2. Durable acceptance storage under PIJ_RS_STATE_DIR/native-extensions/copilot is approved. Namespace by hash of seat/native-session/host-incarnation; use private filesystem permissions, atomic persistence, no traversal from opaque ids. Exact file layout is unit-local and not a smoke contract. Do not evict unresolved accepted/unacked records or invent retention.
3. When native event/history cannot prove an ambiguous send, hold explicitly without reinjection/ack. Keep outgoing tool available; report evidence grade honestly.
4. No new nack/deadletter API. Malformed/unsupported incoming claim yields actionable diagnostic and stops only receiving that affected claim/session without ack; no tight replay loop or silent discard. Producer refuses programmatic Copilot controls. This is explicit failure, not successful handling.

## Installer ACK
1. Manual launch forbids Pij identity/preallocation env and Copilot RPC flags. Test-only PIJ_RS_ADDR/PIJ_RS_STATE_DIR transport isolation overrides ARE allowed, together with isolated HOME/COPILOT_HOME; never contact live fleet for acceptance.
2. Test injection seam must exercise actual installer operations in isolated homes; production guard canonical-main-only remains. Do not add global guard bypass.
3. Observe actual daemon and native session event artifacts; runtime durable acceptance file layout is private. Coordinate any missing observation contract through PM.
4. Standalone fixtures are not actual composed manual/spawned proof. Final real scenario and full gate belong to PM after merging unit source.

GO follows committed v2 synchronization; these are not instructions to change other units' files. PM authors docs, three coder fences unchanged except explicitly named guards. C10.
