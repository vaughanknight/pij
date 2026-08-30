# u-uds done report — authenticated Claude socket wire, closed by default

**Unit**: u-uds · **Branch**: `s108/w3-uds` · **Date**: 2026-08-30

## Headline finding — silence was not an acknowledgement

The first-party implementation probe disproved the inherited receipt premise.

Reproduction, against an isolated Claude Code 2.1.251 seat:

1. Started Claude under tmux with `--dangerously-skip-permissions` and no `crossSessionInbound: accept` setting.
2. Resolved its fresh session record and the peer key whose `procStart` and `pidDomain` matched it.
3. Opened the 0600 UDS, authenticated with `peerToken`, and wrote the exact newline-terminated user frame this unit now builds. The frame named a stable `msg_id` and asserted no `from-mode`.
4. Claude's pane displayed: `Held peer message ... not delivered to Claude (1 held). The sender did not attest its permission mode` and opened the five-minute Deny/Deliver dialog.
5. The authenticated socket returned **zero bytes for two seconds**. No `peer_message_status`, no `wereHeld`, no drop report. The inherited 150 ms timer therefore returned `Delivered { origin: InjectedToTransport }` for a message the recipient had observably not delivered to the model.

A second isolated seat, launched with `--settings '{"crossSessionInbound":"accept"}'`, accepted the same frame shape and the model replied `ACK-UDS-251`. The hold is not a Claude bug: independent prime evidence corroborates that attestation is derived from the sender's verified PID being a Claude session. A daemon can never truthfully attest that mode. Recipient-side explicit acceptance is the only pij-owned opening.

**Resulting contract**: `SeatDescriptor.cross_session_inbound_accept == Some(true)` is a precondition checked before discovery or socket IO. `None` means unknown and is closed; `Some(false)` is closed. Wave 3 therefore ships the wire inert in production, rather than live and lying. Wave 4's spawn surface owns the first truthful `Some(true)` stamp.

The documented drop/hold decoder remains, fixture-tested, for a connection shape that may emit it. Its evidence class is explicit: **documented in GH #311, not observed on this daemon-origin connection**.

## Delivered

- `UdsTransport` implements the frozen async `Transport` port.
- Capability requires all of: Claude harness, body rather than command, explicit inbound acceptance, resolved session record with `messagingSocketPath`, and exactly one peer key whose `procStart` and `pidDomain` match the record.
- Discovery is ordered: descriptor PID record first; otherwise scan records for `tmux` ending in `.<paneId>`.
- `can_deliver` reads records only. It never connects as a capability probe.
- Auth and user frames are newline-delimited JSON. The user frame carries our `msg_id`, daemon origin, escaped sender name, ordinary `[pij from ...]` body, and no invented permission mode.
- Negative outcomes are conservative: connect/write/early-EOF/malformed-status/correlated-drop return `Queued`; a correlated `wereHeld` maps to `Held { reason: "from-mode approval" }`; only the configured timer win maps to `Delivered { origin: InjectedToTransport }`.
- Peer tokens are never included in a `Debug` representation.
- Five indexed UDS fixtures: sanitized 2.1.251 session record and key, accepted frame golden, and documented drop/held status lines.
- Human-typing politeness remains a caller gate. Socket safety does not authorize interrupting a person composing in tmux.

## First-party re-verification

Observed on this machine:

```text
claude --version
2.1.251 (Claude Code)

session record fields:
pid, sessionId, cwd, startedAt, procStart, version, peerProtocol,
peerFeatures, kind, entrypoint, pidDomain, tmux, messagingSocketPath,
name, status, bridgeSessionId

socket:
srw------- 600 /tmp/cc-socks/<pid>.sock
```

Confirmed: record shape; PID and `tmux` coordinates; sibling peer key shape; `procStart`/`pidDomain` identity match; socket mode 0600; authenticated NDJSON frame acceptance and model delivery with explicit inbound acceptance; held UI and zero response bytes without it.

Not measured and not relied on: ~1 MB frame ceiling, 50-deep receive queue, per-sender rate limit, identical-repeat dedupe.

## Tests

`cargo test --locked -p pij-transport`: **10 passed**.

The table covers:

- direct PID discovery;
- PID miss plus pane-suffix hit;
- both miss;
- all non-Claude harness variants;
- command refusal despite a healthy record/key;
- absent, mismatched, malformed and ambiguous peer keys;
- `None`/`Some(false)` acceptance causing no socket connect;
- recorded frame byte equality and sender attribute escaping;
- correlated drop, correlated hold, unrelated and malformed status;
- fragmented status reads;
- timer outcome origin;
- lost acknowledgement channel before timer.

The corpus integrity test passed after indexing all five fixtures.

## Mutation transcripts

### Discovery step 2

Mutation: remove the pane-record scan and return `None` after PID lookup.

```text
cargo test --locked -p pij-transport \
  uds::tests::discovery_is_pid_then_pane_suffix_then_absent -- --exact

FAILED: assertion failed at the `pane fallback` row
0 passed; 1 failed
```

Restored: test passed. This fails on the property the branch protects, not merely compilation.

### Origin qualifier

Mutation: timer win returned `DeliveryOrigin::VerifiedArrival` instead of `InjectedToTransport`.

```text
cargo test --locked -p pij-transport \
  uds::tests::timer_win_means_only_injected_to_transport -- --exact

FAILED:
left:  Delivered { origin: VerifiedArrival }
right: Delivered { origin: InjectedToTransport }
```

Restored: test passed.

### Closed acceptance precondition

Mutation: remove `cross_session_inbound_accept == Some(true)` from both capability and delivery guards.

```text
cargo test --locked -p pij-transport \
  uds::tests::unknown_or_refused_inbound_acceptance_is_closed_before_any_socket_write -- --exact

FAILED: assertion failed: !transport.can_deliver(...)
0 passed; 1 failed
```

Restored: test passed and the no-connect witness remained quiet.

## Gate

The first full gate correctly failed because the committed architecture metadata fixtures predated the new `pij-transport` dependency edges. Both derived fixtures were regenerated from the composed graph; the negative fixture then had only its two planted violations.

Final canonical invocation:

```text
PATH=$HOME/.cargo/bin:$PATH CARGO_INCREMENTAL=0 \
CARGO_TARGET_DIR=/tmp/pij-w3-u-uds-target \
cargo run --locked -p pij-testkit --bin pij-gate

pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

Observed environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail=210Gi on /System/Volumes/Data
```

## Composition recipe

The public recipe also lives on `UdsTransport`:

```rust
use pij_transport::UdsTransport;

let transport: Arc<dyn Transport> = match config.adapters.transport {
    AdapterChoice::Fake => Arc::new(FakeTransport::reachable()),
    AdapterChoice::Real => Arc::new(UdsTransport::new()?),
};
```

At compose:

1. Add `pij-transport.workspace = true` to `crates/daemon/Cargo.toml`.
2. Add the matching reviewed `pij-transport` internal edge to the daemon allow-list row.
3. Replace only `not_yet("transport", "u-uds, wave 3")`; do not change routing or tmux policy in this unit.
4. Treat the real adapter as intentionally inert until a descriptor carries `cross_session_inbound_accept: Some(true)`.

## Shared-merge and derived files

Authored shared-merge files:

- `crates/transport/Cargo.toml`
- `crates/testkit/arch-allowlist.toml`
- `crates/testkit/fixtures/MANIFEST.toml`

Regenerated, never hand-merged:

- `Cargo.lock`
- `crates/testkit/fixtures/arch/clean-metadata.json`
- `crates/testkit/fixtures/arch/drifted-metadata.json`

The merged base also carries the PM-owned descriptor/schema allocation and concurrent u-cli changes; they are not attributed to u-uds.

## Assumptions

1. `cross_session_inbound_accept` is authoritative only when explicitly stamped by the process that supplied the spawn setting. Reading Claude settings to infer it is forbidden.
2. Wave 3 production descriptors carry `None`, so the real transport is intentionally closed. This is honest incompleteness, not a fallback claim.
3. Filesystem record discovery is the ruled wave-3 exception to descriptor-stamped endpoint capability. Connecting to probe capability remains forbidden.
4. A peer key is usable only when exactly one key matches both record identity fields. Ambiguity fails closed.
5. The daemon-origin connection did not emit negative acknowledgements in the measured held case. Fixture-tested decoder behavior does not upgrade that documented report to measurement.
6. A post-write IO ambiguity may duplicate on retry; it must not produce an unsupported delivery claim. The contract remains at-least-once, never at-most-once loss.
7. The human-typing pane-signal gate remains outside this crate and still applies before a socket send.
8. UDS is Unix-only. Named pipes and the pointer/drain worker remain wave-4 work; this unit does not smuggle either behind the `Transport` implementation.
