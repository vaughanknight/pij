# u-cli done report — plan 108 wave 3

**Seat**: `pij-modest-mandrill` · **PM**: `pij-revolutionary-lungfish` · 2026-08-30

## Delivered

Implementation commit: `32cc2bdc` (`feat(cli): add daemon client verb surface`).

- Exact ruled verb inventory: `daemon`, `ping`, `register`, `send`, `list`, `tail`.
- One authenticated `DaemonClient` consuming the PM-owned v1 wire contract.
- `Registration`, `SendRequest`, and incremental `{machine,cursor,event}` frame decoding.
- Every bounded verb renders human and JSON output from one `Envelope`; `tail` renders each frame incrementally from one `EventFrame`, per the PM-granted exception.
- Exact envelope-version refusal before payload typing. Both future and older unrecognised versions become `ErrorKind::Skew`.
- Exit table: success `0`, refused `2`, not-found `3`, auth `4`, skew/adapter `1`.
- Federation address grammar: `@@` escapes a literal seat `@`; the first unescaped `@` separates the machine; empty seat/machine and `@` in a machine alias refuse. Unqualified always means local.
- Computed register/send/list envelopes byte-goldened through `pij_testkit::golden`; editorial help is shape-tested.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 210 GiB
CARGO_TARGET_DIR=/tmp/pij-w3-cli-target
CARGO_INCREMENTAL=0
```

## Gate

Canonical final invocation:

```text
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

The u-cli slice contributes 15 passing tests: nine library/address/client tests, three clap tests, and three computed-envelope goldens.

## Behavioral smoke

A throwaway daemon was launched at `127.0.0.1:17641` with an isolated state directory. The actual binary exposed exactly the six ruled verbs. Both ping faces succeeded from the same daemon envelope:

```text
pij ping: ok — {"build":"pij-rs 0.1.0","offline":true,"status":"healthy"}
{"ok":true,"command":"pij ping","v":1,"data":{"build":"pij-rs 0.1.0","offline":true,"status":"healthy"}}
```

The throwaway daemon and state directory were removed after the smoke.

## Mutation evidence

### Address escaping

Mutation: changed the escape lookahead from `@` to `#`.

```text
cargo test --locked -p pij-cli \
  address::tests::address_parse_table_covers_degenerate_and_escaped_cases -- --exact

FAILED
seat@@id: machine aliases cannot contain '@' — escape '@' only inside the seat as '@@'
```

Restored the `@` lookahead; the full library suite returned 9 passed.

### Envelope-version refusal

Mutation: disabled the exact-version guard (`if false && untyped.v != ENVELOPE_VERSION`).

```text
cargo test --locked -p pij-cli \
  client::tests::every_unrecognised_version_is_skew_not_only_future_versions -- --exact

FAILED
assertion failed: !envelope.ok
```

Restored the guard; the full library suite returned 9 passed. The separate future-version test uses a deliberately wrong payload shape, proving refusal occurs before typed payload decoding.

## Composition recipe

```rust
use pij_cli::DaemonClient;

let client = DaemonClient::new(&state_dir, &addr)?;
```

The client reads `<state-dir>/daemon.key`. No `crates/daemon/src/lib.rs` or `AdapterChoice::Real` arm changes are required. At composition, u-daemon-http supplies the already-ruled `/health`, `/v1/register`, `/v1/send`, `/v1/seats`, and `/v1/events` routes.

## Shared-merge and derived files

Shared-merge files touched:

- `Cargo.toml` — enable reqwest response streaming.
- `crates/cli/Cargo.toml` — dev-only `pij-testkit` edge for goldens.
- `crates/testkit/arch-allowlist.toml` — reviewed `pij-testkit@dev` edge.
- `crates/testkit/fixtures/MANIFEST.toml` — three computed golden records.

Derived files regenerated, never hand-merged:

- `Cargo.lock`
- `crates/testkit/fixtures/arch/clean-metadata.json`
- `crates/testkit/fixtures/arch/drifted-metadata.json`

## Assumptions

1. u-daemon-http implements the PM-owned `WIRE-CONTRACT.md` shapes verbatim at composition. This unit does not locally guess or duplicate server policy.
2. A non-local `Destination` parses and serializes now, but the wave-3 daemon refuses it with a named u-federation/wave-4 action; local delivery-kind collision is therefore impossible.
3. `tail` is the ruled incremental exception to `fn -> Envelope`: each frame remains the single value for both output faces; setup/skew failures remain envelopes.
4. `models` is not a wave-3 u-cli verb. The PM reassigned the `pij models --json` parity golden to u-models after resolving the D1/D5 contradiction. u-cli goldens only payloads its own routes compute.
5. `msg_id` is caller-supplied because the wire contract requires it and assigns no generation policy to the CLI.
6. The CLI talks to its local daemon and sends `seat@machine` as a `Destination`; peer key routing remains daemon-owned.
7. The existing hello-depth daemon does not yet implement register/send/list/live-tail, so this worktree could smoke only help and ping before wave composition. Client transport, auth header, query cursor, Hello handling, and unknown-kind forwarding are exercised against a throwaway HTTP endpoint in the u-cli tests.

## Harness observation

`pij_testkit::golden::assert_golden` creates only the golden root, not a requested nested namespace. First `UPDATE_GOLDENS=1` failed until `fixtures/golden/cli/` was pre-created. Captured as harness observation `DL-001`; the encodable fix is for `assert_golden` to create `path.parent()`.
