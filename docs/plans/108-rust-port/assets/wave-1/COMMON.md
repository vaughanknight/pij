# Wave 1 — common contract (every coder packet cites this file)

Absolute path:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-1/COMMON.md`

You are a **coder** on plan 108 wave 1, reporting to PM `pij-revolutionary-lungfish`.
Your unit packet sits beside this file and names your scope. Read both, then ack.

## 0. Before any code: ack with a NUMBERED plan

Send the PM a numbered plan (`pij send pij-revolutionary-lungfish "…"`): the steps
you will take in order, the tests that will prove each, and **every defect or dead
premise you found in your packet**. The PM rules your ack by number. Defects
surface at the ack, before the diff exists — that is the cheapest place they can
be found, and wave 0 proved it (seven findings at the ack, all real).

Do not start coding until the ack is ruled.

## 1. The five rules wave 0 paid for

These are not style notes. Each cost a debugging session or a review round.

1. **`BEGIN IMMEDIATE` for every write transaction.** sqlx's default is
   `BEGIN DEFERRED`, which takes a read lock and upgrades on first write. Two
   deferred writers upgrading at once **deadlock**, and SQLite returns
   `SQLITE_BUSY` *immediately without invoking the busy handler* — so
   `busy_timeout` is inert for exactly the case people set it for. Use
   `pij_store::migrate::begin_write`, which already does this.
2. **Assert the PROPERTY, not the path.** Three review rounds in wave 0 were all
   this: a regression that exercised the code without exercising the thing that
   could break. A two-boot test passed because the second boot died before the
   line under test; a `Clone` removal shipped with a test that still passed when
   `Clone` came back. **Before you call a test done, break the code it defends and
   watch it fail for the intended reason.** Put that transcript in your report.
3. **Enumerate the surface.** A test that covers "the cases I thought of" reads as
   coverage and is not. Where a rule must hold for every operation of a trait,
   enumerate every operation (see
   `crates/daemon/tests/review_regressions.rs::every_public_store_operation_rejects_a_stale_schema`).
4. **Never let a check mutate what it judges.** A gate that repairs the tree
   reports green on something nobody else can compile. `cargo run --locked …`,
   and `git status --short` must be empty after your gate run.
5. **Ruling-landing check.** When a ruling changes a contract, grep for the
   *belief* it overturned, not just the file that recorded it. Wave 0 shipped a
   type asserting the pre-ruling belief hours after the ruling landed.

## 2. The gate — your definition of done

```bash
export PATH="$HOME/.cargo/bin:$PATH"          # rustup's cargo, never Homebrew's
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w1-<your-unit>-target
cd <your worktree>
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages: toolchain · lock · fmt · clippy · test · arch. **All green, or the
unit is not done.** The gate runs every stage even after one fails, so one
invocation surfaces every problem.

If you add a dependency, it costs **one reviewed line** in
`crates/testkit/arch-allowlist.toml` with a rationale — that is the mechanism
working, not friction to route around. `@dev` suffix for test-only edges.

## 3. Fence — what every coder may and may not touch

Yours: the paths your unit packet names, and nothing else.

**Shared-merge files** — one line each, name them in your report so the PM can
sequence the merge (this list is R6e/DL-007):

| file | your one line |
|---|---|
| `Cargo.toml` (root) | a `[workspace.dependencies]` version, if you add a dep |
| `crates/<yours>/Cargo.toml` | your dependency lines |
| `crates/testkit/arch-allowlist.toml` | your reviewed row(s) |
| `crates/<shared>/src/lib.rs` | one `pub mod` line for a new module |

### Derived artifacts — regenerate, NEVER hand-merge

Three files are generated from the tree rather than authored, and four parallel
worktrees each produce a version that is true only for that branch:

* `Cargo.lock`
* `crates/testkit/fixtures/arch/clean-metadata.json`
* `crates/testkit/fixtures/arch/drifted-metadata.json`

**They are in your fence, in your own worktree.** Regenerate them locally so your
own gate is honest — a green gate on a stale fixture is exactly the shape wave 0
kept finding. Expect the PM to regenerate them authoritatively at compose time,
overwriting yours; that is not your delta being rejected, it is a derived file
being derived once, by one mind, from the merged tree.

Never resolve a conflict in them by hand. The regeneration commands are in
`crates/testkit/tests/arch_drift.rs`'s module doc.

**FROZEN for wave 1 — a change here is a stop-and-ask, not an edit:**

* `crates/core/src/ports.rs` — the seven traits. An eighth port is stop-and-ask;
  so is changing a signature. Coders fill contracts, never widen them.
* `crates/testkit/src/fakes.rs` — the fakes are complete for all seven ports. If
  your unit needs a capability a fake lacks, that is a contract gap: ask.
* `crates/daemon/src/lib.rs` — **you do not wire your adapter in.** See §4.
* `crates/core/src/model.rs` — additive fields only, and say so in your ack.
* Anything under `docs/plans/108-rust-port/` except your own report.
* `the-flow.json`, `the-flow.md`, `.the-flow-state.json`, `.harness/**`, every TS
  source, and anything outside your worktree.

## 4. Ship the recipe, not the integration (tenet 4)

**Do not edit the composition root.** Wave 1 has four coders and one
`crates/daemon/src/lib.rs`; if you all wire yourselves in, you all conflict.

Instead, end your unit with a doc comment on your public entry point titled
`# Composition recipe`, containing the exact code the PM will paste: the `use`,
the constructor call, the `AdapterChoice::Real` match arm that replaces the
current `not_yet(...)` refusal, and any config field you need. The PM does the
wiring at compose time, in dependency order, as one mind.

**The wave-0 `not_yet` refusals are wave-1 deletions** — your recipe says which
one you replace.

## 5. Evidence discipline

* **Absolute paths everywhere** — in reports, in test fixtures, in packets. A
  relative path resolves against whatever tree the reader is standing in.
* **Cite the command and its output.** Your measurement outranks the packet and
  the PM's diagnosis. If a receipt disagrees with what you observe, relay the
  contradiction verbatim rather than reconciling it.
* **The corpus is addressable** — cite fixtures by path
  (`crates/testkit/fixtures/…`, indexed in `MANIFEST.toml` with a sha256 and the
  ANSWER a correct implementation must produce). Do not invent test data where a
  captured fixture exists; if you capture new fixtures, index them.
* **Report at both edges of your unit**: `pij report now "<did>" "<next>"` when you
  start and when you finish.
* **Done report** carries: observed `rustc`/`cargo` versions, `Avail` disk, the
  gate output, your mutation transcripts, your composition recipe, the
  shared-merge files you touched, and an **assumptions** section.

## 6. Context pressure — stop and ask, never compact silently

If you are running short of context, **say so to the PM before it costs you
judgement**. A silent `/compact` mid-unit loses the reasoning that made your
decisions checkable, and the PM would rather split the unit than read a report
written by a seat that has forgotten its own first half.

## 7. Questions

Product and contract questions go to the PM (`pij-revolutionary-lungfish`), never
sideways to another coder and never to the prime. Interface changes are ruled by
the PM or escalated by the PM. You are not blocked by asking — persist the
question, keep working on anything it does not gate.

## 8. Reference reading (in this order, all absolute under the worktree)

1. `docs/plans/108-rust-port/services.dd.md` — your unit's settled row.
2. `docs/plans/108-rust-port/assets/architecture.md` — the map, the five test
   tiers, and **"things that are true because they went wrong once"**.
3. `docs/plans/108-rust-port/assets/workshops/001-architecture.md` — R1–R6 and the
   amendments (R3-AMEND-1 seven ports, R3-AMEND-2 async, R6a-AMEND-1 exact pin,
   R7 wire shape).
4. `docs/plans/108-rust-port/assets/reports/done-wave-0.md` — §Assumptions binds
   you; the four `Real`-adapter refusals are wave-1 deletions.
5. `docs/plans/108-rust-port/assets/reports/review-round-{1,2}.md` — eleven
   findings, none refuted. Read these before writing your first test.
