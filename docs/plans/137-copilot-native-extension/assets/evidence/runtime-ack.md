# Runtime coder acknowledgement — plan 137

Status: **awaiting PM GO; no source edits or implementation checks run**.

## Verified identity and ownership

- Seat: `pij-worldwide-rat`; PM: `pij-grim-gurgeh`.
- Actual harness/model/configured effort: **OMP / github-copilot/gpt-6-astra-1m / high**. Model comes from runtime context; own tmux `%3476` footer confirmed GPT-6 Astra (1M), high, and seat. Canary: `CANARY-S137-RUNTIME-61BE`.
- Exact root: `/Users/jordanknight/pi-hacking/fs3-copilot-native-runtime`.
- Exact branch: `137-copilot-native-runtime`.
- Verified HEAD/base: `e3e9b6ac5a069a71922ea0ef80a3aa917ac9a32d`.
- Identity command: `git rev-parse --show-toplevel --abbrev-ref HEAD && git rev-parse HEAD`, run in the exact root above.
- Read the dispatch, `plan.dd.md`, `impl-guide.dd.md` (including full extension row), `assets/contracts/native-extension.json` v1, `assets/backpressure.dd.md`, `assets/inputs/prime-constraints-2026-09-05.md`, and both vendored research/manual evidence JSON files.
- Sole source fence: `.copilot/extensions/pij/extension.mjs`, `.copilot/extensions/pij/store.mjs`, adjacent `*.test.mjs`. Evidence fence: this worktree's `docs/plans/137-copilot-native-extension/assets/evidence/runtime-*`.

## Numbered execution steps after GO

1. Inspect installed native SDK/session/process evidence and existing identity/wire patterns read-only; use actual `flowspace3` search/get for meaning-shaped questions and LSP where available. Pin observable SDK lifecycle and verified host-incarnation inputs before implementing registration. Record discovery failures rather than silently replacing tools.
2. Write focused `node:test` contract cases with injected native runtime, HTTP and storage. Cover capability readback, immutable sender identity, one outstanding claim, cancellation, and exact claim/send/persist/ack ordering. Demonstrate negative witnesses against plausible defects, not source-text assertions.
3. Implement the SDK-free store and native extension shell with top-level bundled SDK import. Join the current session, subscribe before receive, register truthful Copilot native-session/host PID/start/exact pane and corroborated spawn correlation. Refuse identity or capability mismatch; tolerate additive registration fields.
4. Implement authenticated `pij_send({to,message})` with immutable registered `from`, freshly minted `msg_id`, daemon receipt and honest acceptance grade. User/assistant/idle events never automatically forward replies; incoming command/data never becomes shell or typed control execution.
5. Implement one abortable blocking inbox consumer per session. Consume daemon-owned consent admission only. Persist claim intent and native acceptance mapping before acknowledgement; suppress accepted duplicates. Preserve ambiguous accepted-before-record state without blind reinjection or false completion. Keep native events distinct from acknowledgement evidence.
6. Exercise and implement reconnect/key refresh, bounded empty/error waits, transport diagnostics, disposal and native rollover. Cancel old consumers and prevent stale async results/claims from reaching another native session. No typing fallback, forced clear, remote control protocol or competing consent timer.
7. Run scoped tests in this tree (installer-provided `just copilot-native-test` when available; direct `node --test` against owned test files until composition). Capture acceptance, duplicate, crash ambiguity, refusal, malformed/error, key rotation, event-loop and stale-generation witnesses. Report native/daemon integration and real-client proof as pending until actually exercised.
8. Record versions, commands, results, assumptions and exact source commit in `runtime-receipt.*`; commit explicit owned paths with a conventional commit, no hook bypass. Send PM SHA plus receipt pointer and remaining composition needs. PM owns all plan/guide/AC state, final gates, real manual/spawned/model witnesses and independent review.

## Interface concerns and proof unknowns

1. **Host identity and native rollover APIs need source/runtime confirmation.** The frozen contract specifies truthful host PID/start and native session, but not the SDK field/event that supplies them. Vendored PoC receipts prove paneless parent registration, not pane-backed ancestry or replacement safety. I will verify available runtime context/ancestor evidence, never use the child PID or uncorroborated `PIJ_SESSION_ID` as authority. An unavailable proof is a dependent-work stop reported to PM.
2. **No durable acceptance namespace/format is frozen.** Proposed local detail: private acceptance records under `PIJ_RS_STATE_DIR`, isolated by registered seat plus native session and host incarnation, storing intent before send and native message ID before ack. No eviction of unresolved/accepted-unacked records. Storage errors keep work unacknowledged. This adds no HTTP interface; report any required cross-unit change before implementing it.
3. **Crash/native-history reconciliation is a proof boundary.** The contract names native events but no guaranteed history/reconciliation API. Without evidence tying a pending Pij ID to native acceptance, retain an explicit ambiguous/held state and do not resend or acknowledge. Do not claim universal exactly-once or treat native idle as proof of a particular message.
4. **Malformed/unsupported claims lack a rejection operation.** Guide forbids persistent poison replay; frozen wire offers claim and acceptance ack only. Proposed conservative behavior: diagnose and hold the claim without ack/reinjection, stop only affected receive work, keep outgoing tool usable. Any discard/dead-letter/nack contract requires PM ruling, not sibling renegotiation.
5. **Unit proof cannot establish daemon consent, actual capability attestation or install behavior.** Tests can prove use of the frozen admission/readback contract, not actual daemon arbitration, pane composer preservation, manual/spawned identity or real-model behavior. Those remain composed acceptance. The existing file-watch-notify red baseline is PM-provided evidence, not rerun or reclassified here.

## Constraints retained

No plan/guide/contracts/backpressure/flight-plan/governance edits; no Rust, installer, justfile, Cargo.lock or `.pi` edits. No sibling source writes. No dependency/toolchain changes, OMP update, machine daemon restart, legacy TS/Telegram daemon, `flowspace3 daemon`, real global setup, push or main merge. Only isolated homes and processes owned by this unit. Full builds/lint/test gates are deferred to PM during the concurrent wave. Consent is the existing **one-directional safety interlock (brake)**: removing it permits more deliveries; this unit does not invent a policy.

ACK preparation changed only this requested evidence file. Await explicit PM GO before source work.
