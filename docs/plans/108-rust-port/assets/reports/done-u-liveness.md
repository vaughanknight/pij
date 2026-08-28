# u-liveness done report — plan 108 wave 1

**Coder**: `pij-grotesque-fish` · **PM**: `pij-revolutionary-lungfish` · 2026-08-29

## Result

`ProcLiveness` implements the frozen `LivenessPort` with an exact-pid
`ps -o lstart= -p <pid>` lookup on macOS and Linux. It sets `LC_ALL=C`, parses
the stable start row as `YYYYMMDDhhmmss`, distinguishes absence from inspection
failure, and never scans or signals a process.

The exact-pid constraint is a **one-directional safety interlock (a brake), not
policy**: removing it would make the adapter inspect more processes. It would
not select a different process-liveness policy.

`alive` now documents the full decision table. Both timestamp mismatch
directions return `Recycled`: observed-newer is ordinary pid reuse;
observed-older is the boot-reset case. Permission/inspection failure remains an
adapter error and can never become `Dead`.

## Composition recipe

Replace daemon's `not_yet("liveness", "u-liveness, wave 1")` arm with:

```rust
use pij_harnesses::proc::ProcLiveness;

let liveness: Arc<dyn LivenessPort> = match config.adapters.liveness {
    AdapterChoice::Fake => Arc::new(FakeLiveness::new()),
    AdapterChoice::Real => Arc::new(ProcLiveness::new()),
};
```

No config field is required. The same recipe is on `ProcLiveness`'s public doc
comment.

## Proof

Environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/dev/disk3s5  1.8Ti  1.7Ti  140Gi  93%  /System/Volumes/Data
CARGO_TARGET_DIR=/tmp/pij-w1-liveness-target
CARGO_INCREMENTAL=0
```

Canonical gate:

```text
$ cargo run --locked -p pij-testkit --bin pij-gate
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

The liveness decision table has five passing rows: active, dead, recycled,
boot-reset-as-mismatch, and permission-denied-as-error. Adapter tests add five
fixture/parser cases and two real-process cases. The real proof reads only the
test process's pid twice and confirms a stable start identity; `u32::MAX` is
reported absent. No live pij seat process was touched.

Mandatory recycled-branch mutation:

```text
mutation: Some(observed) => Recycled { ... }  ->  Some(_) => Active
$ cargo test --locked -p pij-core --test liveness_table \
    later_start_at_the_same_pid_is_recycled -- --exact
FAILED
  left: Active
 right: Recycled { observed_start: 2000, recorded_start: 1000 }
restore original arm
$ cargo test --locked -p pij-core --test liveness_table \
    later_start_at_the_same_pid_is_recycled -- --exact
ok: 1 pass, 0 fail
```

## Shared and derived files

Shared-merge files touched:

- `Cargo.lock`
- `crates/harnesses/Cargo.toml`
- `crates/harnesses/src/lib.rs`
- `crates/testkit/arch-allowlist.toml`

Derived files regenerated locally after PM rulings D5/D6; the PM will regenerate
them authoritatively from the composed tree rather than hand-merging:

- `crates/testkit/fixtures/arch/clean-metadata.json`
- `crates/testkit/fixtures/arch/drifted-metadata.json`

## Assumptions

1. macOS BSD `ps` and Linux procps support `ps -o lstart= -p <pid>` and the
   C-locale `Www Mmm DD HH:MM:SS YYYY` shape captured by the two unit-local
   fixtures.
2. Whole-second start identity matches the existing TS instrument. Callers only
   compare the packed value; they do not interpret it as an epoch.
3. Empty exact-pid output means absence. A permission or parsing diagnostic is
   `PijError::Adapter`, never absence and never `Dead`.
4. `model::Liveness::Recycled` stays a three-verdict model. The authoritative
   two-direction explanation lives on `alive`; the PM owns the model cross-link
   at composition, avoiding a wave collision in `model.rs`.
5. `Cargo.lock` and arch metadata fixtures are derived per PM rulings D5/D6 and
   may be overwritten by deterministic regeneration at composition.
6. The ambient `harness` CLI was unavailable (`command not found`); the packet's
   Rust `pij-gate` is the executed definition of done.

## Packet defects surfaced before or during implementation

- D1: boot-reset row versus frozen three-variant model — ruled `Recycled`.
- D2: permission denial already expressible by the frozen `Result<Option<u64>>`
  signature — ruled adapter error.
- D3: unit-local parser fixture fence omitted — granted under
  `crates/harnesses/tests/fixtures/`.
- D4: stale `Option<Instant>` prose versus ratified `u64` seam — code authoritative.
- D5: `Cargo.lock` omitted from dependency-change fence — granted as a local
  derived artifact.
- D6: arch metadata fixtures omitted although `StaleRule` requires regeneration
  after graph changes — granted as local derived artifacts and encoded in
  `COMMON.md` by the PM.
