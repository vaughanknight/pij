# PM ack — plan 108 wave 0 (the mold)

**Seat**: pij-revolutionary-lungfish (PM) · **Branch**: s108/rust-port ·
**Worktree**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port ·
**Date**: 2026-08-28 · **Rule this by number.**

Read in packet i1 order: plan.dd.json (8 ACs) → services.dd.json (18 units, waves 0–4,
R-rulings cited) → workshops/001-architecture.md (R1–R6) → TENETS.md (1–13) →
s001-mining-notes.md (7 traps + revive anatomy). Fan-out: **none** — I concur with w3,
solo-PM; reviewer only, after composition.

## A. Unit sequence (build order; each ends at the gate + a report card)

| # | unit | delivers | ACs |
|---|---|---|---|
| U1 | toolchain + workspace skeleton (FIRST commit, R6a) | `rust-toolchain.toml` (exact version + rustfmt,clippy), root `Cargo.toml` (`[workspace]`, resolver 3, edition 2024, 8 members: core store tmux harnesses transport daemon cli testkit), `[workspace.dependencies]` path table = the ratified R2 graph, `.gitignore` (`/target`, `pocs/*/out/`) | ac-0001 |
| U2 | gate + arch allowlist, negative-tested (R2, tenet 7) | `crates/testkit/arch-allowlist.toml` (one row per edge, **per-row rationale**) + `pij-arch-check` bin + `pij-gate` bin = toolchain-assert → `fmt --check` → `clippy -D warnings` → `cargo test --workspace` → arch-check. Negative proof transcript → `assets/reports/drift-negative.md` | ac-0002 ac-0003 ac-0007 · d2 |
| U3 | core domain + the port freeze | `crates/core/src/{model,config,error,ports}.rs`: SeatId, SeatDescriptor, Harness, SystemState/SemanticState, `Envelope<T>{ok,command,v,data,meta}`, PijError; liveness identity = **(pid, proc_start)** never pid alone; `ports.rs` declares the frozen traits + the "a seventh port is stop-and-ask" comment (R3). No tokio/no IO — enforced by U2, not by intent. **Exemplar tier 1**: core unit test, zero doubles (serde round-trip + state-transition table) | ac-0002 ac-0006 |
| U4 | testkit fakes + fixture corpus, BEFORE features (R6b, DL-004) | Fake{Registry,Spine,Queue,Transport,Tmux,Harness}, deterministic; `crates/testkit/fixtures/**` + `MANIFEST.toml` — **named, addressable, known-answer** fixtures captured from REAL `pij` CLI invocations and daemon wire traffic, **malformed cases included**; loader API so every later packet cites a fixture by path. **Exemplar tier 2**: port-contract test over a fake | ac-0006 |
| U5 | store skeleton + boot self-migration (R1) | sqlx/SQLite, `migrations/0001` (WAL + user_version), `sqlx::migrate!` at daemon boot (no second command), fast schema check per db-touching command, `E-STORE-SCHEMA-STALE` naming the fix, skew rule both directions (forward-migrate / refuse, never limp); minimal Registry+Spine for hello depth; FreshStore-per-test (entropy-named, destroyed). **Exemplar tier 3**: store integration test | ac-0004 ac-0006 |
| U6 | queue primitive (R4, lynx #3 — before any consumer) | enqueue (upsert-dedupe via partial-unique over live jobs) / claim (per-entity serial key, one-at-a-time) / ack; contention test with set-equality; **mutation-check on the dedupe** | ac-0004 |
| U7 | shared wire + shared admission (R6d, R6f) | `crates/core/src/wire.rs` (envelope encode/decode, NDJSON framing, **Unknown variant** forward-compat) owned by this stream so no later unit re-derives it; one discovery/admission component with a **shared case table two consumers must answer identically**, agreement gate-enforced | ac-0006 |
| U8 | hello-depth daemon+cli, ONE binary two roots | per-boot bearer key written **0600 before bind**; `/health` + `/v1/events` (NDJSON, Hello line + Unknown); config selects adapters, **fake is the default** (offline-first); `pij-rs ping` round-trips CLI→daemon over localhost HTTP. First-light transcript → `assets/reports/first-light.md` | ac-0005 · d3 |
| U9 | CLI golden exemplar / parity tripwire | **shape depends on Q4** — mechanism + captured TS fixture, or one real parity verb | ac-0006 |
| U10 | pocs/ spike lane (R6c) | `pocs/<name>/` template: bare `[workspace]`, `.gitignore`, `out/`, root-manifest `exclude`, the ONE SENTENCE that spikes sit outside harness checks (evidence = captured output, never a green gate), and the required step "print an eyeballable table" | — |
| U11 | docs, fences, receipts, close | architecture doc + quick-start (**location depends on Q3**), fences doc naming the shared-merge files (root `Cargo.toml`, crate `Cargo.toml`s, `arch-allowlist.toml` — R6e/DL-007), `experiences.md`, `ddocs set` ac-0001..ac-0008 with receipts, push origin s108/rust-port, **no PR** | ac-0001 ac-0008 · d1 d5 |

Then: compose → spawn reviewer (github-copilot/gpt-5.6-sol high, read-only, into window
**s108-pm**) → fix or refute with evidence → report head SHA + gate output + observed
rustc/cargo + Avail disk to prime.

## B. The gate (i5, ac-0007 — one command, run at every unit edge)

`CARGO_INCREMENTAL=0 cargo run -p pij-testkit --bin pij-gate` — stages:
**toolchain-assert → `cargo fmt --check` → `cargo clippy --workspace --all-targets -D warnings`
→ `cargo test --workspace` → `pij-arch-check`.** Mirrors fs3
(`cargo run -p fs3-testkit --bin fs3-arch-check`), lives inside the fence.
Wiring it into `just`/`harness checks` is OUT of fence → prime-ruled follow-up.

## C. Defects / assumptions found — ruling asked (Q1–Q7)

**Q1 — TOOLCHAIN IS ALREADY SPLIT ON THIS MACHINE, and R6a's mechanism is inert here.**
Measured in this worktree:

```
$ cargo --version   → cargo 1.95.0 (f2d3ce0bd 2026-03-21) (Homebrew)
$ rustc --version   → rustc 1.95.0 (59807616e 2026-04-14) (Homebrew)
$ cargo fmt --version    → rustfmt 1.9.0-stable (88d9e12ae1 2026-08-18)
$ cargo clippy --version → clippy 0.1.98 (88d9e12ae1 2026-08-18)
$ ~/.cargo/bin/rustup toolchain list → stable (active, default), nightly-2026-08-08, 1.85.0
$ ~/.cargo/bin/cargo --version → cargo 1.98.0 (797e8a9bc 2026-08-05)   # rustc 1.98.0
```

`/opt/homebrew/bin` precedes `~/.cargo/bin`, so `cargo`/`rustc` are Homebrew **1.95.0**
while `cargo fmt`/`cargo clippy` already resolve to **1.98.0** components — this seat is
compiling and linting on different toolchains *before line one of code*. And
`rust-toolchain.toml` is a **rustup** mechanism: a Homebrew `cargo` ignores it silently.
Writing the pin as specified would produce exactly tenet-10's hazard (green and wrong,
no edit-time signal) while *looking* like the fix.
**Proposal**: (a) pin an EXACT version (`channel = "1.98.0"`, components rustfmt+clippy) —
`stable` is not reproducible; (b) all pij-rs work runs with `~/.cargo/bin` first on PATH;
(c) **U2's first gate stage asserts `rustc --version` equals the pin and fails loudly** —
enforcement, not a file nobody honours (tenet 7). Alternative if you prefer the Homebrew
rust: pin 1.95.0, same assert; the assert is what makes either choice safe.

**Q2 — SEVENTH PORT, stop-and-ask as R3 instructs.** R3 freezes six (Registry, Spine,
Queue, Transport, TmuxPort, HarnessPort). `u-liveness` in services.dd.json declares
`trait LivenessPort{proc_start(pid)}`. U3 writes `ports.rs`, so it must declare 6 or 7 today.
`proc_start` is real IO, so it cannot live in core as a free function without breaking
"core has no IO". **Proposal**: admit LivenessPort as the seventh, recorded as an amendment
under R3 in workshop 001. Alternative: fold it into `HarnessPort` (worse — it is
process-level, not harness-level, and u-liveness would then depend on u-harness).

**Q3 — ac-0008 CONTRADICTS THE PACKET FENCE.** ac-0008 wants "README quick-start +
architecture doc"; services.dd.json names `docs/rules-idioms-architecture/`. Both are
OUTSIDE the fence (`crates/** pocs/** rust-toolchain.toml Cargo.toml Cargo.lock .gitignore
docs/plans/108-rust-port/**`), and the root `README.md` belongs to the TS product.
**Proposal**: architecture doc → `docs/plans/108-rust-port/assets/architecture.md`;
quick-start → `crates/README.md`; promotion to `docs/rules-idioms-architecture/` and any
root-README mention = a prime-ruled follow-up outside this fence. Receipt for ac-0008 cites
those two paths.

**Q4 — ac-0006's "CLI golden diffed against the TS binary" has no wave-0 subject.** The
Rust CLI at hello depth has only `ping`/`health`; the TS `pij` has no `ping`, so there is no
command both produce. **Proposal (recommended)**: U9 ships the golden **mechanism** +
captured TS output as a corpus fixture (`pij models --json` and `pij whoami`, computed
payloads only — editorial content gets shape assertions per u-cli), proving the differ
works; the real parity tripwire lands with `u-cli` in wave 3. Receipt says exactly that.
Alternative: implement one real parity verb now (scope increase, and it front-runs a wave-3
unit's contract).

**Q5 — mutation-check tooling (i5) is not installed.** No `cargo-mutants`/`nextest` in
`~/.cargo/bin` or Homebrew. **Proposal**: manual mutation evidence per fix-test — flip the
predicate / revert the fix, capture the test going red, restore, transcript in the unit
report. In wave 0 only two tests qualify (drift-gate negative, queue dedupe). No new
dependency without your ruling.

**Q6 — refs r5/r6 resolve only outside this worktree.** Both point into
`/Users/jordanknight/substrate/flowspace/flowspace3/…` (they DO exist and are read-only
prior art). pij-team SKILL.md § Templates requires inputs to be **vendored into
`assets/inputs/` sha-pinned** so they resolve where the seat lives — the reviewer I spawn
will hit this. **Proposal**: U1 vendors `fs3-architecture.md`, `PACKET.md` §1–§4, and the
fs3 `arch-allowlist.toml` into `docs/plans/108-rust-port/assets/inputs/` with a
`SOURCES.md` carrying each sha256 + origin path. Read-only, never written back.

**Q7 — `assets/tasks/phase-1/tasks.dd.json` is EMPTY** though `plan.dd.json#phases`
references it (`tasks: assets/tasks/phase-1/tasks.dd.json#tasks`). It is inside the fence and
is not engine-owned (unlike `the-flow.json`, which I will not touch). **Proposal**: after you
rule this ack, I populate it with U1–U11 via `ddocs set` so plan navigation matches reality.

## D. Standing constraints I am holding to

CARGO_INCREMENTAL=0 · absolute paths in every artifact · no writes outside the fence · TS
sources/`.pi/`/`.harness/`/`.agents-skills-port/`/flowspace3 read-only · never touch
`the-flow.json`/`the-flow.md`/`.the-flow-state.json` · push only to origin s108/rust-port,
**no PR without your fresh go** · report card at both edges of every unit · questions to you,
never sideways · flowspace3 search before grep, misses logged as friction to
`assets/experiences.md`.

**Blocking**: Q1 (U1 cannot land its first commit without it) and Q2 (U3 writes ports.rs).
Q3–Q7 block only their own units; I will start U1 on your Q1 ruling alone.
