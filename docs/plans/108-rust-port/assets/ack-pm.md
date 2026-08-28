# PM ack — plan 108 phase 1, execution plan for t-001..t-010

**Seat**: pij-revolutionary-lungfish (PM) · **Branch**: s108/rust-port ·
**Worktree**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port · 2026-08-28

Superseded my own unit numbering: the prime's task table
(`assets/tasks/phase-1/tasks.dd.json`, t-001..t-010) is the plan. I execute in order,
gate green before the next starts, states via `ddocs set` only. Deviations below are
**items for you to rule (D1–D8), not edits I make**. Fan-out: none — concur solo-PM.

## A. How I execute each task

**t-001** — `rust-toolchain.toml` + root `Cargo.toml` (`[workspace]`, resolver 3,
edition 2024, `exclude = ["pocs"]`) + `.gitignore` (`/target`, `pocs/*/out/`). First
commit, nothing else in it. *Blocked on D1.*
**t-002** — 8 member crates, empty-but-compiling: core, store, tmux, harnesses,
transport, daemon, cli, testkit; `[workspace.dependencies]` path table = the R2 graph;
`cli` + `daemon` are the two composition roots of ONE binary `pij-rs`.
Receipt: `cargo build --workspace` green + observed rustc/cargo. → ac-0001, ac-0002.
**t-003** — `crates/testkit/arch-allowlist.toml`, one row per permitted edge with
**per-row rationale**; graph walk as a `#[test]` in testkit (so `cargo test --workspace`
carries it) plus a `pij-arch-check` bin wrapper for the t-010 gate command. Negative
proof: add `tokio` to core → red → revert; transcript verbatim to
`assets/reports/drift-negative.md`. → ac-0003.
**t-004** — `crates/core/src/ports.rs`: the frozen traits + the "a seventh port is
stop-and-ask" comment; testkit ships a deterministic, **scriptable** fake per port
(script the sequence, assert the calls); config selects adapters with **fake as the
default** (offline-first); port-contract exemplar test runs one suite against the fake.
*Trait count blocked on D2.* → ac-0006.
**t-005** — sqlx/SQLite; `migrations/0001` sets WAL + user_version; `sqlx::migrate!`
embedded, daemon self-migrates at boot (no second command); every db-touching command
does the fast schema check; stale → refuse loudly, `E-STORE-SCHEMA-STALE` names the fix;
skew rule both directions (newer binary+older schema → migrate forward; older
binary+newer schema → refuse, never limp); `FreshStore` per test, entropy-named,
destroyed after; store integration exemplar. Receipt for the R1 half of ac-0004 is
workshop 001 R1 itself (ruling recorded before dispatch — already true). → ac-0006.
**t-006** — enqueue (upsert-dedupe, partial-unique over live pending/running jobs, N
rapid submits collapse to one row) / claim (per-entity serial key, one-at-a-time) / ack;
contention test with parallel claimers asserting **set-equality**; mutation-check the
dedupe (*method blocked on D5*). Built before any consumer — lynx #3. → ac-0004 (R4).
**t-007** — `pij-rs` one binary: daemon root serves `/health` + `/v1/events` NDJSON
(Hello line first, **Unknown variant** forward-compat); per-boot bearer key generated and
written **0600 before bind**; auth middleware over the whole router; `pij-rs ping`
round-trips CLI→daemon over localhost HTTP and reports healthy; 401 path asserts a
`next_action`. First-light transcript → `assets/reports/first-light.md`. → ac-0005.
**t-008** — fixture corpus under `crates/testkit/fixtures/**` with a `MANIFEST.toml`
(named, addressable, known answers), captured from REAL `pij` CLI invocations + daemon
wire traffic, **malformed cases included**; core unit exemplar with zero doubles (serde
round-trip + state-transition table); one CLI golden vs the TS binary (*subject blocked on
D4*). → ac-0006.
**t-009** — `pocs/<name>/` template (bare `[workspace]`, `.gitignore`, `out/`, excluded
from the root manifest), README sentence: spikes sit outside harness checks, evidence is
captured output not a green gate, and every spike must print an eyeballable table;
`wire.rs` stub (*sequencing item D3*); discovery/admission as ONE component with a shared
case table two consumers must answer identically, agreement gate-enforced.
**t-010** — one command: `CARGO_INCREMENTAL=0 cargo run -p pij-testkit --bin pij-gate`
→ toolchain-assert → `cargo fmt --check` → `cargo clippy --workspace --all-targets
-D warnings` → `cargo test --workspace` → arch-check, all green (mirrors fs3's
`fs3-arch-check` bin; lives inside the fence — wiring it into `just`/`harness checks` is
outside the fence, so it is a follow-up you rule). Quick-start + architecture doc
(*location blocked on D6*); fences doc naming the shared-merge files: root `Cargo.toml`,
each crate `Cargo.toml`, `arch-allowlist.toml` (R6e/DL-007). → ac-0007, ac-0008.

Then compose → reviewer (github-copilot/gpt-5.6-sol, high, read-only) spawned into window
**s108-pm** → findings fixed or refuted with evidence → push origin s108/rust-port, **no
PR** → report head SHA, gate output, observed rustc/cargo, Avail disk.

## B. Items for you to rule (D1–D8)

**D1 — BLOCKING t-001. The task's own mechanism is inert on this machine, and the seat is
already split across two toolchains.** Measured here:

```
$ cargo --version   → cargo 1.95.0 (f2d3ce0bd 2026-03-21) (Homebrew)
$ rustc --version   → rustc 1.95.0 (59807616e 2026-04-14) (Homebrew)
$ cargo fmt --version    → rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18)
$ cargo clippy --version → clippy 0.1.98 (88d9e12ae1 2026-08-18)
$ ~/.cargo/bin/cargo --version → cargo 1.98.0 (797e8a9bc 2026-08-05)  # rustc 1.98.0
$ ~/.cargo/bin/rustup toolchain list → stable (active, default), nightly-2026-08-08, 1.85.0
```

`/opt/homebrew/bin` precedes `~/.cargo/bin`, so **compiler 1.95.0 + linter/formatter
1.98.0 right now**. `rust-toolchain.toml` is a rustup mechanism: a Homebrew `cargo`
ignores it **silently**, so t-001 as written ships a file that looks like tenet 10's fix
while leaving its exact hazard (green and wrong, no edit-time signal) in place. Also
`stable` is a moving target — not reproducible across seats or weeks.
**Proposal**: `channel = "1.98.0"` (exact) + `components = ["rustfmt","clippy"]`;
`~/.cargo/bin` first on PATH for all pij-rs work; and the gate's **first stage asserts
`rustc --version` == the pin, failing loudly** — enforcement over a file nobody honours
(tenet 7). Pinning 1.95.0 instead is equally acceptable; the assert is the part that
makes either choice safe.

**D2 — BLOCKING t-004; stop-and-ask exactly as R3 instructs.** t-004 says "the six frozen
traits". `u-liveness` (services.dd.json) declares a seventh: `trait
LivenessPort{proc_start(pid)}`. `proc_start` is real IO, so it cannot be a core free
function without breaking "core has no IO", and folding it into `HarnessPort` is worse
(process-level, not harness-level; would force u-liveness to depend on u-harness).
**Proposal**: admit LivenessPort as the seventh, amended under R3 in workshop 001, and
`ports.rs` ships seven.

**D3 — ordering: t-009's `wire.rs` lands after t-007 builds the wire.** t-007 must
serialize `Envelope{ok,command,v,data,meta}` and frame NDJSON with the Unknown variant —
that IS wire.rs's content (R6d exists so exactly one stream owns it and nobody
re-derives it). As sequenced I write it inside daemon at t-007 and extract at t-009.
**Proposal**: author `crates/core/src/wire.rs` during t-007 and have t-009 confirm +
document it; task order otherwise unchanged.

**D4 — t-008's CLI golden has no wave-0 subject.** `pij-rs` at hello depth has only
`ping`/`health`; the TS `pij` has neither, so no command both binaries produce.
**Proposal (recommended)**: the exemplar ships the golden **mechanism** + captured TS
output as corpus fixtures (`pij models --json`, computed payloads only — editorial
content gets shape assertions), proving the differ works; the real parity tripwire lands
with `u-cli` in wave 3, and the ac-0006 receipt says exactly that. Alternative:
implement one real parity verb now — scope increase, and it front-runs a wave-3 unit's
contract.

**D5 — t-006's mutation-check has no installed tool.** No `cargo-mutants` (or
`nextest`) in `~/.cargo/bin` or Homebrew. **Proposal**: manual mutation evidence — flip
the dedupe predicate, capture the test going red, restore, transcript in the task
report. No new dependency without your ruling.

**D6 — t-010 vs the packet fence.** "README quick-start + architecture doc" — the root
`README.md` belongs to the TS product and `docs/rules-idioms-architecture/` (named in
services.dd.json) is outside the fence
(`crates/** pocs/** rust-toolchain.toml Cargo.toml Cargo.lock .gitignore
docs/plans/108-rust-port/**`). **Proposal**: quick-start → `crates/README.md`;
architecture doc → `docs/plans/108-rust-port/assets/architecture.md`; promotion to
`docs/rules-idioms-architecture/` and any root-README edit = a follow-up you rule.

**D7 — R6b sequencing.** R6b/DL-004 say the fixture corpus lands **before** the units
that consume it; t-008 places it after t-005/6/7, so the store, queue and daemon tests
get written against ad-hoc data and then a corpus arrives. **Proposal**: capture the
corpus alongside the fakes in t-004 (they are the same "testkit-first" deliverable) and
leave t-008 to the exemplars + golden. Your call — I follow the table as written if you
prefer.

**D8 — refs r5/r6 resolve only outside this worktree**
(`/Users/jordanknight/substrate/flowspace/flowspace3/…`; they do exist, read-only).
pij-team SKILL.md requires such inputs vendored into `assets/inputs/` sha-pinned so they
resolve where the seat lives — the reviewer I spawn will hit this.
**Proposal**: vendor `fs3-architecture.md`, `PACKET.md` §1–§4 and fs3's
`arch-allowlist.toml` into `docs/plans/108-rust-port/assets/inputs/` with `SOURCES.md`
carrying sha256 + origin path. (My earlier Q7 on the empty task table is **withdrawn** —
you authored it.)

## C. Standing constraints

CARGO_INCREMENTAL=0 · absolute paths · nothing written outside the fence · TS sources,
`.pi/`, `.harness/`, `.agents-skills-port/`, flowspace3 read-only · never touch
`the-flow.json`/`the-flow.md`/`.the-flow-state.json` · task/AC states via `ddocs set`,
never hand-editing `.dd.md` · push only to origin s108/rust-port, no PR without your
fresh go · report card at both edges of every task · questions to you, never sideways ·
flowspace3 search before grep, misses logged to `assets/experiences.md`.

**I start t-001 on D1 alone**; D2 by t-004, the rest by their own task.
