# Wave 6 — common contract (every coder packet cites this file)

Absolute path:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-6/COMMON.md`

You are a **coder** on plan 108 wave 6 — the LAST build wave — reporting to PM
`pij-revolutionary-lungfish`.

Five waves are underneath you. **308 tests pass on the composed tree**; all seven
ports are real-capable; six port amendments have been ratified and consumed. This
wave finishes three things and then the port goes to full-system first light.

## 0. Before any code: ack with a NUMBERED plan

Numbered plan, numbered defects, then STOP and wait for rulings.

The ack gate has produced 100+ defects across five waves and **none has been
refuted**. My packets have been wrong in every wave, including rulings I had to
withdraw after a coder measured them, and including — last wave — a pointer whose
exact bytes I ruled, telling operators to run a command that does not exist.

**If your packet contradicts the code, the code wins and you tell me.**

## 1. The rules earlier waves paid for

1. **`BEGIN IMMEDIATE` for every write transaction** (`pij_store::begin_write`).
2. **A witness must ACTIVATE the mechanism it mutates** (E-027), and **the
   mutation is the test's own test** (E-031). Two of the PM's own regression tests
   passed their own mutations before witnessing anything. Run it.
3. **Every long-lived loop ships with a transient-failure LOOP test** that drives
   the SHIPPED wrapper, not a reconstruction (E-030). Name it in your plan and
   report.
4. **Never let a check mutate what it judges.** The gate enforces this now: the
   `lock` stage checks the lock against the TREE, `clippy`/`test` carry `--locked`,
   `UPDATE_GOLDENS` is stripped from the test environment. Regenerated the lock?
   COMMIT it.
5. **Absent is not empty; empty is not absent; a residue is not a state** (E-024).
6. **A fake is a CLAIM about the real adapter** — five false ones found so far.
7. **A scripted edit must ASSERT its pattern matched** (E-026): a replacement that
   matches nothing returns success, and **removing nothing compiles**.
8. **Only running the shipped thing proves it against the world the user gets**
   (E-025).
9. **A defect class does not stop applying to the code that FIXES it** (E-029),
   and **every fix names the path it EXECUTES on** (E-031).
10. **TWO ASSERTED FACTS WITH NO INSTRUMENT BETWEEN THEM ARE NOT CHECKED.** New,
    and this wave produced it: the pointer's bytes were asserted as a string, the
    CLI's verbs were asserted as a list, and nothing compared them — so we shipped
    an instruction naming a verb that does not exist. **When two artefacts must
    agree, the agreement itself needs a test.**

## 2. The gate — your definition of done

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w6-<your-unit>-target
cd <your worktree>
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages, all green. `harness checks` cannot run in these worktrees (no node
tooling) and has not since wave 0 — disclose it, do not chase it.

## 3. Fence

Yours: the paths your packet names. **Shared-merge**: root `Cargo.toml`, your
crate's manifest, `arch-allowlist.toml`, ONE `pub mod` line in a shared `lib.rs`,
`fixtures/MANIFEST.toml`. A **constructor callsite following a signature you own**
is mechanical conformance — keep it, name it. **Derived**: `Cargo.lock` and the
two arch metadata fixtures; regenerate, never hand-merge.

**FROZEN — stop-and-ask:** `crates/core/src/ports.rs` (seven traits; six
signatures amended across three waves, every one through the prime), `model.rs` /
`error.rs` (additive only), `crates/store/migrations/**` (schema is at **8**),
`crates/daemon/src/lib.rs` beyond your recipe and any one `pub mod` line,
everything under `docs/plans/108-rust-port/` except your report, and the canonical
`/Users/jordanknight/pi-hacking/pij/.pi/**` — a live daemon runs off it.

## 4. Ship the recipe, not the integration

End with a `# Composition recipe` doc comment: the exact `use`, constructor,
config field, call site, and — if you start anything — the shutdown contract.

## 5. Receipts are FILES, before the message that cites them

`docs/plans/108-rust-port/assets/reports/done-<unit>.md`, committed and pushed
BEFORE your done message. Carry: observed toolchain, disk, gate output, mutation
transcripts, the loop test where you have a loop, the composition recipe,
shared-merge files, and **assumptions**. Disclose reds you did not cause.

## 6. Standing rulings you inherit

* **Socket is transport; tmux is politeness.** A HUMAN typing still gates, and
  that is Jordan's to lift.
* **There is no typed-body rung.** A body that can use neither socket nor pointer
  stays queued and is retried. Never typed.
* **Unknown blocks.** The gate denies when it cannot see, and we do not invert a
  default to make a rung reachable.
* **Nothing branches on prose.** `meta` is for humans; a caller decides on a kind,
  a field, or a type.
* **Bind before any mutating boot step**; every fallible step above the key publish.

## 7. Reference reading

1. `assets/wave-6/SHAPE.md` — why your unit exists.
2. `assets/wave-3/WIRE-CONTRACT.md` — the frozen interface.
3. `assets/reports/done-wave-{0,1,2,3,4,5}.md` — the assumptions bind you.
4. `assets/experiences.md` — E-001…E-031. **Read E-023 through E-031 first.**
