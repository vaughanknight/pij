# pij-rs architecture — the mold, and why it has this shape

Wave 0 of the Rust port (plan 108). This document is the map a later unit reads
before adding to the workspace: what each boundary is for, which decisions are
frozen, and which of them are frozen *because something already went wrong*.

Fence note: this doc lives in the plan's assets because the packet fence for
plan 108 stops at `docs/plans/108-rust-port/**`. Promoting it to
`docs/rules-idioms-architecture/` is a named follow-up the prime owns (Q3).

## The shape

```
                     ┌───────────────────────────────┐
   composition       │  cli  (pij-rs binary)         │
   roots             │  daemon (HTTP, workers)       │
                     └───────────────┬───────────────┘
                                     │ Arc<dyn Port>
   adapters      ┌──────────┬────────┴────────┬─────────────┐
                 │  store   │  tmux           │ harnesses   │ transport
                 │ (sqlx)   │ (tmux IO)       │ (per-CLI)   │ (UDS…)
                 └────┬─────┴────────┬────────┴──────┬──────┘
                      │              │               │
                      └──────────────┼───────────────┘
                                     ▼
                     ┌───────────────────────────────┐
   functional core   │  core: types · config · errors│
   (no IO, no tokio) │  SEVEN ports · pure logic     │
                     └───────────────────────────────┘

   testkit: fakes for every port · contract suites · fixture corpus ·
            FreshStore · pij-arch-check · pij-gate
```

Direction is enforced mechanically, not socially:
`cargo run -p pij-testkit --bin pij-arch-check` walks the real dependency graph
and judges it against `crates/testkit/arch-allowlist.toml`, where **every crate
entry carries a required `why`**. An allow-list without rationales decays into a
list of whatever happened to get added.

## The seven ports, and the eighth

`Registry`, `Spine`, `Queue`, `Transport`, `TmuxPort`, `HarnessPort`,
`LivenessPort` (workshop 001 R3 as amended by R3-AMEND-1).

**An eighth port is stop-and-ask.** Ports are the seams the whole fan-out is
parallel across; a seam that moves mid-wave un-freezes every unit behind it. The
seventh was admitted precisely that way — a PM stop-and-ask, ruled by the prime,
recorded in the workshop — and that is the only route to an eighth.

All ports are `async` (R3-AMEND-2). Not a preference: sqlx has no synchronous API,
so a sync `Registry` would force `block_on` inside the store adapter and deadlock
on a tokio worker. `async_trait` is a proc macro, not a runtime — core still has
no tokio, and the arch gate proves it rather than trusting the claim.

## The rules a later unit inherits

**Absent is not empty.** `get` returning `None` means the seat does not exist,
which is a different fact from a seat that exists with empty fields. TS's
`E-NOREG` collapsed the two and `revive` could not tell a repairable seat from an
unrecoverable one; `PijError` keeps them as separate variants for good.

**A pid is not an identity.** Liveness is keyed on `(pid, proc_start)`. The third
verdict, `Recycled`, exists because reporting it as `Active` addresses a
stranger's process and reporting it as `Dead` hides the reuse.

**Queued is an honest answer, not a hedge.** A message the transport cannot
deliver yet is durably queued and says so. TS reported success for pre-bind
messages that then vanished.

**One handler, one cheap statement; everything else is a job.** The queue was
built before its first consumer (R4). Dedupe is a partial unique index over
*live* rows — so a key frees on ack rather than being poisoned for ever — and
serialization is per `serial_key`.

**Deliberate silence is not a stall.** Watchdog eligibility consults the seat's
*declared* state, and thresholds are configured. Both halves are TS defect #9.

**An error names its own fix.** Every refusal in this workspace states the next
action. A diagnostic an agent cannot act on costs a round trip to disbelieve.

**One decision, one implementation.** Admission (is this observed thing a seat?)
is a single function with a shared case table, and a gate-enforced test asserts
that discovery and registration answer every case identically. Two implementations
of one decision is how subagents became seats.

## What proves it, tier by tier

| tier | example | what only this tier can catch |
|---|---|---|
| pure unit, zero doubles | `core/tests/core_unit_exemplar.rs` | logic errors, in the crate that performs no IO |
| port contract over a fake | `testkit/tests/contract_over_fakes.rs` | a promise the seam makes that an implementation breaks |
| store integration, real SQLite | `store/tests/store_integration.rs` | migrations, WAL, sequence numbers, skew refusal |
| end-to-end over a socket | `daemon/tests/first_light.rs` | boot order, auth over the whole router, second-bind refusal |
| byte-golden | `testkit/tests/models_golden.rs` | parity drift, which no hand-written assertion holds as the surface grows |

Two of these ship as **shared contract suites** (`pij_testkit::contract`) rather
than per-implementation tests: the SQLite `Registry` and `Queue` run the identical
functions the fakes run. That caught two real defects in wave 0.

## Things that are true because they went wrong once

Each of these is a comment in the code, and each cost a debugging session:

* **WAL cannot be set in a migration.** `PRAGMA journal_mode` is a no-op inside
  the transaction sqlx wraps every migration in, so the obvious placement looks
  right and silently leaves a rollback journal. It is set on the connection, and a
  test reads it back off disk.
* **`BEGIN IMMEDIATE`, never the default deferred transaction.** Two deferred
  writers upgrading a read lock deadlock, and SQLite returns `SQLITE_BUSY`
  *without invoking the busy handler* — so `busy_timeout` is inert for exactly the
  case people set it for.
* **`user_version` is a cache, not the truth.** sqlx's `_sqlx_migrations` ledger is
  authoritative; boot reconciles the cheap check to it, because a second boot
  leaves the pragma behind and every command then refuses a healthy store.
* **Temp names need a counter, not just a clock.** Two tests starting inside one
  macOS clock tick got the same directory, and one deleted the other's key.
  `pij_testkit::fresh_dir` carries the counter.
* **`toml::from_str`, not `value.parse()`.** In toml 0.9 the `FromStr` impl parses
  a *value*, so a whole document fails at line 1 column 1 with "unexpected
  content" — which reads like the file is corrupt.
* **`cargo metadata --locked --no-deps` cannot detect a stale lock.** Without
  resolving the graph there is nothing to disagree with, so it returns 0 against a
  lock missing a dependency — and the first version of the gate's lock stage used
  exactly that flag, passing the incident it was written to catch.
* **A `Drop` guard must not be `Clone`.** Two owners of one staging path meant
  dropping a copy deleted the original attempt's key, and `publish` then failed
  with "No such file or directory".
* **`env!("CARGO_MANIFEST_DIR")` bakes the COMPILE directory.** A gate binary
  built inside a temporary export judged that tree from any working directory.
* **The TS wire is not the v1 wire.** TS emits `{seq,timestamp,type,data}`; v1 is
  `{v,at,kind,seat,payload}`. Ruled R7: v1 keeps its own shape, and the TS→v1
  mapping lives in exactly two readers. The corpus carries both families.

## Forward compatibility, and its deliberate asymmetry

* An **envelope** from a newer version is **refused whole**, before its payload is
  typed. It is a contract this build must satisfy.
* An **event** of an unknown kind is **kept and forwarded** as
  `WireEvent::Unknown`. It is a fact that happened whether or not this build knows
  the word for it, and dropping it loses the newest information in the stream.

`Event` carries `v` and `at` from its first commit so the reusable event stream
(PRD req-0015, `u-events`) lands on it without a version bump.

## Shared-merge files — name these in every fence (R6e / DL-007)

These are the files two units will both want to touch. Each takes a one-line edit,
so they merge cleanly *if the fence names them* and turn into conflicts if it does
not:

| file | the one-line edit |
|---|---|
| `Cargo.toml` (root) | a member, or a version in `[workspace.dependencies]` |
| `crates/<name>/Cargo.toml` | a dependency line |
| `crates/testkit/arch-allowlist.toml` | the reviewed row for that dependency |
| `crates/testkit/src/lib.rs` | one `pub mod` for a new fake or helper |
| `crates/core/src/lib.rs` | one `pub mod` for a new core module |
| `crates/testkit/fixtures/MANIFEST.toml` | one `[[fixture]]` block |
| `crates/store/migrations/` | a NEW file — never an edit to an existing one |

Everything else should be crate-disjoint. If two units need the same file for
anything more than one line, the split is wrong — redesign it before dispatch.

## The spike lane

`pocs/` is excluded from the workspace twice (root manifest `exclude`, plus each
spike's own bare `[workspace]`). **A spike's evidence is its captured output, never
a green gate**, and every spike must print an eyeballable table — the error you
are about to make is the one an aggregate hides.
