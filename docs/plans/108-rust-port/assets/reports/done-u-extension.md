# Done — u-extension

## Result

The in-process extension now selects the live daemon generation, speaks the authenticated pij-rs v1 HTTP wire, registers complete process/spawn evidence, consumes framed events without dropping unknown kinds, injects `message.pushed` turns, and sends correlated replies. The same source booted and completed a real round trip in plain Pi and OMP against one throwaway production-configured pij-rs daemon and SQLite store.

Rust mode creates no legacy TS registry/channel residue. Legacy mode remains the existing `FsRegistry`/`FsChannel` path.

## Wire behavior

Generation precedence is evidence-ordered:

1. Authenticated `/health` v1 response => Rust.
2. Answered unsupported version => `PIJ_WIRE_SKEW { found, supported }`.
3. Connection refusal plus positive TS file/daemon-lock evidence => legacy.
4. Connection refusal with no TS evidence => `PIJ_NO_DAEMON { addr, stateDir }`.

`PIJ_NO_DAEMON` and `PIJ_WIRE_SKEW` are extension-owned structured errors, not daemon `ErrorKind`: a daemon that never answered said nothing.

Rust registration sends `pid` and packed C-locale `proc_start` together, plus optional `spawn_id`, model/provider/effort, pane, parent and runtime harness. `/new` and `/fork` mint a new seat and send `supersedes`; reload retains the existing seat. OMP is detected from its actual Bun runtime rather than assuming `process.execPath` contains `omp`.

Every HTTP request carries the per-boot bearer key from `<state-dir>/daemon.key`. Address precedence is `PIJ_RS_ADDR` then `127.0.0.1:7461`; state-dir precedence is `PIJ_RS_STATE_DIR` then `$HOME/.pij-rs`.

## Matrix receipts

- [Plain Pi](./matrix-u-extension-pi.md): v1 detected; `pij-curious-gibbon`, harness `pi`, `(pid, proc_start)=(81308, 20260830105815)`; received `pi-matrix-1`; replied `PI_MATRIX_REPLY` as message `9dde04fb-adee-446c-9c69-35f30da07fe7`.
- [OMP](./matrix-u-extension-omp.md): same extension file; `pij-minimal-koala`, harness `omp`, `(pid, proc_start)=(40320, 20260830110231)`; received `omp-matrix-1`; replied `OMP_MATRIX_REPLY` as message `2fb039ba-9d93-4f11-baf1-b2756650ae7c`.
- Both used `127.0.0.1:17461` and `/tmp/pij-w3-extension-daemon/pij.sqlite`; neither touched the live daemon or canonical `.pi/**`.
- Restart on `127.0.0.1:17462` returned `{count:5, pi:true, omp:true}` from the same SQLite store.
- `/tmp/pij-w3-extension-{pi,omp}-home` remained absent: Rust mode manufactured no legacy residue.

## Contract corpus

Added and indexed under `crates/testkit/fixtures/wire/`:

- `health-v1.json`
- `health-future.json`
- `register-v1.json`
- `events-v1.ndjson` (Hello, unknown kind, pushed turn)

## Verification

Observed toolchain:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail /tmp: 216Gi
```

Focused TypeScript proof:

```text
5 files passed; 30 tests passed
```

Additional guards:

```text
liveness-cost.test.ts + registry-write-law.test.ts: 14 passed
just typecheck: PASS
changed-file biome check: PASS
```

Rust workspace gate, with `CARGO_TARGET_DIR=/tmp/pij-w3-extension-target` and `CARGO_INCREMENTAL=0`:

```text
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

The gate changed no Cargo/Rust file.

Full TS suite after the extension-owned guard fixes: 223 files and 4435 tests passed; two pre-existing environment-sensitive tests failed outside this unit's fence:

- `harness/scripts/npm-resolution-policy.integration.test.ts` (governed lock-host replay status 1).
- `skills/flow-pair/test/cli-learning.test.ts` (npm 11 emits the repository's unknown `min-release-age` warning on stderr).

Full `just lint` likewise reaches unrelated existing warnings; every changed TypeScript file passes targeted Biome.

`harness checks` was run after the matrix. Its local-path, typecheck, smoke and remaining sensors passed; it reported `checks-failed` for `lint`, `test`, and `windows-compat`. `test` is the same two failures above; `windows-compat` stops at the same repository-wide lint warnings. These surfaces are outside the widened unit fence and no result was suppressed.

## Mutation evidence

Mutation: changed envelope acceptance from `version !== 1` to `version > 2`, thereby accepting v2.

Expected failure:

```text
FAIL daemon-wire.test.ts > pij-rs envelope > refuses an unsupported envelope whole with structured versions
AssertionError: expected Error: future envelope was accepted to be an instance of PijWireSkewError
```

Restored the guard and reran:

```text
daemon-wire.test.ts: 5 passed
```

The failure is on the defended property: a future envelope was accepted, not on an incidental code path.

## Defects found upstream

All were reported before working around them; PM fixed the composed Rust branch:

1. `/v1/send` enqueued nested `QueuedSend` while the worker decoded `Msg`; it also bypassed routing/tombstones/transport and invented a queued receipt.
2. No production path published `message.pushed`.
3. HTTP helpers announced the new `ErrorKind` contract but still emitted `Envelope::err` without a discriminator.
4. Registration collision correctly blocked subagent aliases but also blocked legitimate same-process `/new` and `/fork`; `supersedes` now makes replacement explicit and tombstones the predecessor first.
5. The production `pij-rs daemon` still selected all-fake wave-0 defaults after real adapters existed; it now defaults to real SQLite/liveness/tmux/harness and inert-closed real transport, with `--offline` explicit.

Common shape: individually consistent halves wired to different worlds. The test fixture also initially replaced `Services` fields after `DeliveryService` had captured the old fakes; the composed fix constructs the service from the injected parts.

## Shared-merge files

- `crates/testkit/fixtures/MANIFEST.toml` — four fixture blocks.

No Cargo manifest, `Cargo.lock`, crate `lib.rs`, architecture allowlist, or generated metadata changed.

## Composition recipe

Not applicable: `.pi/extensions/pij/index.ts` is already the extension composition root. It detects the generation before constructing any legacy adapter and wires `RustRuntimeSession` only for an authenticated v1 daemon.

## Assumptions

- The v1 daemon owns admission and verifies extension claims; the extension never reimplements admission.
- An answered authenticated health envelope is stronger evidence than legacy file residue.
- `message.pushed` is the recipient-facing fact; `delivery.outcome` is the delivery audit fact. The client filters by its own seat and preserves every other/unknown frame in its local in-memory event log.
- The v1 Rust runtime keeps transient Pi activity/event projection in memory; authoritative seat registration, messages and fleet events live in pij-rs. It writes no legacy TS registry/channel state.
- Remote-control commands are not inferred from bodies. The frozen v1 `SendRequest` has no command field, so Rust-mode `pij_send { command }` refuses rather than silently sending text; the daemon's command producer remains later work.
- Event attach is live-only (`since` absent), matching the settled HTTP contract. No unbounded replay is performed.
