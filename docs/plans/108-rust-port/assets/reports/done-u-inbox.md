# Wave 6 receipt — u-inbox

## Result

`pij inbox` is reachable through the shipped Rust binary. The completed path is:

`pij-rs inbox` → `DaemonClient` → authenticated `GET /v1/inbox` → `DeliveryService::claim_inbox` → real queue → decoded message → authenticated `POST /v1/inbox/ack` → append-only machine-graded audit event → `ReaderRead` delivered-id record.

The GET never records `ReaderRead`. The client acknowledges only after receiving and decoding the complete response. If the client dies before acknowledgement, an expired `delivery:*` claim returns to pending and may be read twice. That residual duplicate read is deliberate: duplicate is safer than permanent loss carrying false `ReaderRead` evidence.

## Shipped behavior

- `pij inbox` resolves the recipient from non-empty `PIJ_SESSION_ID`.
- `pij inbox --seat <id>` is the explicit operator/debug path and takes precedence.
- Missing identity refuses by name: `no seat: set PIJ_SESSION_ID or pass --seat`.
- Rust spawn launches `env PIJ_SESSION_ID=<assigned-id> <harness> ...`; the value is the id allocated under the daemon spawn lock.
- `GET /v1/inbox` claims exactly one row. This is a structural bound, not a configuration knob: every delivery for one seat shares that seat's serial key, and the queue permits one running claim per serial key.
- `POST /v1/inbox/ack` appends `delivery.inbox-ack` before mutating the delivered-id ledger. The event records `job_id`, `authenticated_machine`, and `evidence_grade: machine` without storing bearer material or inventing seat-level identity.
- The current auth ring identifies the local key as `local`. Peer keys have no alias attached at this boundary, so their honest identity is `unknown-peer`.
- A successful GET whose acknowledgement fails still returns the decoded message and surfaces a duplicate-read warning in both human and JSON renderings.
- Malformed or misdirected claimed payloads retain the prior terminal-failure behavior; they never mint delivery evidence.

## Consistency instrument

`tests::rendered_pointer_advertises_a_verb_the_real_cli_exposes` calls the real `pij_daemon::pointer::render_pointer`, parses the action after `run:`, requires the command token `pij`, extracts the advertised verb, and compares it to `Cli::command().get_subcommands()`.

Mutation witnesses:

1. **CLI side:** added `#[command(name = "receive")]` to `Command::Inbox` without changing the pointer. The instrument ran one test and failed: `pointer advertises 'inbox', but Clap does not expose it`.
2. **Pointer side:** changed the rendered local action to `run: pij receive` without changing Clap. The instrument ran one test and failed: `pointer advertises 'receive', but Clap does not expose it`.
3. Both mutations were restored. The same instrument then ran one test and passed.

The first attempted CLI mutation command used `--exact` with the unqualified test name, matched zero tests, and returned green. It was rejected as vacuous, rerun without `--exact`, and observed failing. This is E-027/E-031 applied to the instrument itself; the harness difficulty is captured as `DL-001`.

## Behavioral proof

`shipped_cli_registers_sends_reads_acks_and_does_not_read_twice` executes `CARGO_BIN_EXE_pij-rs` against an authenticated router composed with the real SQLite registry, queue, and spine:

1. shipped CLI registers `pij-reader`;
2. shipped CLI sends `m-shipped-inbox` through the daemon;
3. shipped CLI runs `pij inbox` with `PIJ_SESSION_ID=pij-reader` and receives the exact body;
4. a second shipped CLI read is empty;
5. resending the same message id returns `Delivered { origin: ReaderRead }`;
6. the real spine contains `delivery.inbox-ack` with `authenticated_machine: local` and `evidence_grade: machine`.

Additional focused proof:

- `inbox_serialization_allows_one_claim_until_it_is_acknowledged`: claim one, a second claim returns none, acknowledge, then the next queued message becomes claimable.
- `an_expired_inbox_claim_retries_instead_of_losing_the_unacked_message`: only `delivery:*` expiry returns the same job to pending with incremented attempt; other kinds retain terminal expiry.
- `inbox_claims_without_evidence_then_ack_records_machine_graded_reader_read`: GET produces neither queue acknowledgement nor inbox-ack event; POST persists the machine-grade event and ledger result.
- spawn unit, HTTP integration, and shipped CLI tests assert `PIJ_SESSION_ID` contains the assigned seat id in the actual launch argv.
- auth classification tests assert `local`, `unknown-peer`, and refusal without exposing key material.

## Final gate

Command:

```text
PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=/tmp/pij-w6-u-inbox-target \
  cargo run --locked -p pij-testkit --bin pij-gate
```

Verdict: all six stages green.

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
```

Focused runs were also green: 19 real queue tests, 100 daemon tests before the final hardening pass, 24 CLI tests, four inbox-filtered daemon suites, the shipped-binary test, and all spawn identity tests.

Observed disk at finalization: `/dev/disk3s5`, 1.8 TiB total, 113 GiB available, 94% used.

`harness checks` was not run: COMMON §2 records that these linked worktrees have no Node tooling and directs coders to disclose rather than chase it. The Rust `pij-gate` is the ruled definition of done and passed.

## Composition recipe

```rust
use pij_daemon::http::{HttpConfig, router_with_config};

let router = router_with_config(
    services,
    HttpConfig {
        local_key,
        peer_keys,
        machine_alias,
    },
);
```

The router exposes authenticated `GET /v1/inbox?seat=<id>&wait=<bool>` and `POST /v1/inbox/ack`. No new task or loop starts; shutdown is unchanged.

```rust
use pij_harnesses::{SpawnPlanInput, build_spawn_plan};

let plan = build_spawn_plan(SpawnPlanInput {
    seat_id: seat_id.clone(), // the id actually allocated under the spawn lock
    harness,
    executable,
    model,
    resolved_provider,
    effort,
    accept_inbound,
})?;
let command = LaunchCommand {
    executable: plan.executable, // `env`
    args: plan.args,             // PIJ_SESSION_ID=<seat>, harness executable, harness args
};
```

CLI construction remains `DaemonClient::new(&state_dir, &addr)`. `DaemonClient::inbox(&seat, wait)` owns the GET/decode/POST sequence and returns one `Envelope<Vec<Msg>>`, which feeds both human and JSON rendering.

## Shared-merge and derived files

- Shared-merge files: none.
- `Cargo.lock`: unchanged.
- Architecture metadata fixtures: unchanged.
- Fixture manifest: unchanged.
- Prime-authorized frozen-surface clarification: the existing `DeliveryOrigin::ReaderRead` documentation now states the HTTP evidence grade; no enum shape or port signature changed.

## Packet defects found before and during build

1. The original direct wiring would acknowledge before Axum wrote response bytes, permanently losing a disconnected client's message while recording the strongest evidence word.
2. Machine bearer auth was being treated as seat identity; the append-only event now records only what the key can attest.
3. `pij inbox` had no identity source, and Rust spawn emitted no `PIJ_SESSION_ID`; either half alone left the pointer unusable.
4. The proposed configurable page limit was a knob that could not turn. Queue serialization already fixes the maximum at one; the dead config field was removed before ship and the structural property is tested.
5. The delivered-id ledger was the wrong home for long-lived auth evidence because its 1,024-row duplicate-suppression retention evicts old entries. The append-only spine owns the audit fact.
6. The first mutation command matched zero tests and returned green. The witness was corrected and the difficulty captured instead of accepting a vacuous receipt.

This was the fifth coder on plan 108 to stop at a line others would have wired. The ack gate found the strongest receipt being minted before observation, plus the missing identity path and dead configuration surface, before any of them became shipped behavior. Across the plan, that repeated stop-and-measure pattern is why the ack gate has produced more than 100 defects and refuted none.

## Assumptions and residuals

- Seat-level authorization remains backlog work, triggered the day two mutually untrusting seats share one machine key. Current HTTP `ReaderRead` evidence is machine-granular by design.
- Peer aliases are not retained beside keys in `AuthRing`; `unknown-peer` is therefore the only honest peer identifier at this boundary today.
- Claim-expiry retry applies only to `delivery:*`. Federation, pointer, and every other queue kind keep terminal expiry.
- A client that decoded a message and died before POST ack may receive it again. This is the named residual duplicate-read window.
- `env` is resolved through the same launch PATH already required to resolve harness executables; no shell joins or evaluates the argv.
