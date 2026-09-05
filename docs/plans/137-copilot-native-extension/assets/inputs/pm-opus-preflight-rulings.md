# PM adjudication — Opus preflight

2026-09-05. Contractv3.

## Upheld and applied
1. **Inbox side doors:** native claim/ack enforcement belongs in DeliveryService shared by all producers/routes; uninstrumented shim refuses Copilot, not bypasses validation. Existing other-harness semantics unchanged.
2. **Pre-ack authority:** already authorized Queue::claimed_delivery + real/fake forwarding. Validate actual job recipient and current native tuple before terminal mutation, no posthoc comparison.
3. **Held wake:** Copilot pane consent hold returns data:[] promptly even wait=true, with meta `native-consumer-held:<reason>`; leaves message queued. Client bounded backoff, then retry. No fabricated consent event or indefinite wait for unrelated message. Normal empty-inbox long poll still revalidates after wake. Prove release delivers WITHOUT sending another nonce.
4. **Skew proof:** native Copilot claim row echoes `native_consumer:{native_session,pid,proc_start}` actually validated. Extension refuses absent/mismatched proof before injection or ack.
5. **Daemon-down startup:** new acceptance criterion: ordinary Copilot remains usable with absent daemon/key, one actionable diagnostic per failure episode and bounded abortable reconnect, no spam/fallback. Isolated real CLI witness.

## Clarified, not a new product gap
- Ownership and claim consent gate land in the SAME daemon unit/commit; no independent match-only composition.136 no longer edits delivery/mod.rs. Final tests must fail if claim gate removed.
- Missing native tests in installer-only tree are an EXPECTED COMPOSITION DEPENDENCY. Packet forbids project-wide gates during fan-out; installer runs scoped tests and leaves integrated recipe red until source composes. No no-tests skip, no stub, no weakening gate. PM runs full gate on composed tree.

## Refuted interpretations
- **Consent remains a brake.** Removing the human-input veto permits the same or more injections. That directional test makes it a one-directional safety interlock; label does not waive mandatory enforcement. Review statement that it is policy because it permits interruption reverses the defined test.
- **Paneless round trip WAS bidirectional.** research-evidence.json reply_receipt queued/unreachable is the initial enqueue receipt, not the final outcome. Its native_messages.driver contains the returned nonce user.message and assistant ACK; acknowledgements.driver records job3 ack; target records job2 ack; both inboxes empty. The event receipts prove both native injections. This still does NOT prove pane-backed routing, native tool-originated reply, or real model behavior, which remain mandatory final witnesses.
