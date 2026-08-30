# Wave 5 — common contract (every coder packet cites this file)

Absolute path:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-5/COMMON.md`

You are a **coder** on plan 108 wave 5 — the pane sensor, the federated roster and
stream, and destination-side dedupe — reporting to PM
`pij-revolutionary-lungfish`.

**Written from scratch.** Five waves have shipped: the mold, the substrate, the
services, the surfaces, and the launcher/network. **282 tests pass on the composed
tree; all seven ports are real-capable.** Two subsystems ship deliberately INERT
and this wave is what turns one of them on.

## 0. Before any code: ack with a NUMBERED plan

Numbered plan, numbered defects, then STOP and wait for rulings.

Across four waves the ack gate has produced 90+ defects, **none refuted**. Wave 4
alone: a frozen-port collision that went to the prime and came back ratified; a
trait amendment landed without the field it existed to inspect; a routing
prefilter that would have made a correct transport into dead code; a requirement I
invented that nothing in the system could produce; and three separate coders
finding that the QUEUE, not the transport, held the remaining gaps.

**If your packet contradicts the code, the code wins and you tell me.** My packets
have been wrong in every wave, including rulings I had to withdraw after a coder
measured them.

## 1. The rules earlier waves paid for

1. **`BEGIN IMMEDIATE` for every write transaction** (`pij_store::begin_write`).
2. **Assert the PROPERTY, not the path**, and **a witness must ACTIVATE the
   mechanism it mutates** (E-027). Two mutation witnesses a wave-4 packet DEMANDED
   turned out unable to fire; the coder measured that and refused to tighten a
   threshold until one did. A broad distribution check defends the outcome and
   never exercises the code it claims to witness.
3. **EVERY LONG-LIVED LOOP SHIPS WITH A TRANSIENT-FAILURE LOOP TEST** (E-030,
   ruled a COMMON requirement by the prime for this wave). Not a test of the step
   — a test of the LOOP: force one error from a dependency, then assert the NEXT
   item is still processed. Wave 4's workers both died on their first transient
   error and every instrument stayed green, because the end-to-end test drove the
   step by hand and nothing ever ran the loop. **Name this test in your packet
   plan and in your report.**
4. **Never let a check mutate what it judges.** The gate now enforces this: the
   `lock` stage checks the lock against the TREE as well as the manifests,
   `clippy`/`test` carry `--locked`, and `UPDATE_GOLDENS` is removed from the test
   stage's environment. If your lock is dirty after regenerating it, COMMIT it.
5. **Absent is not empty; empty is not absent; a residue is not a state** (E-024).
6. **A fake is a CLAIM about the real adapter.** Wave 4 found four false ones in a
   single wave — a fake that dropped a retried body, accepted an unclaimed retry,
   ignored not-before, and deduped on the wrong key. If you touch a fake's
   behaviour, prove the claim against the real adapter too.
7. **A scripted edit must ASSERT its pattern matched** (E-026): a replacement that
   matches nothing returns success, and **removing nothing compiles**.
8. **Only running the shipped thing proves it against the world the user gets**
   (E-025).
9. **A defect class does not stop applying to the code that FIXES it** (E-029). A
   wave-4 schema fix scoped dedupe by kind while the producer wrote one kind for
   every peer, so the loss survived for exactly the rows the migration comment
   claimed to cover. When you close a finding, check the producer, not the fix.

## 2. The gate — your definition of done

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w5-<your-unit>-target
cd <your worktree>
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages: toolchain · lock · fmt · clippy · test · arch. All green or not done.

## 3. Fence

Yours: the paths your packet names. **Shared-merge**: root `Cargo.toml`, your
crate's manifest, `arch-allowlist.toml`, ONE `pub mod` line in a shared `lib.rs`,
`fixtures/MANIFEST.toml`. **Derived — regenerate, never hand-merge**: `Cargo.lock`
and the two arch metadata fixtures.

**FROZEN — stop-and-ask:** `crates/core/src/ports.rs` (seven traits; three
signatures were amended across waves 3-4 and every one went through the prime),
`model.rs` / `error.rs` (additive only, allocated per wave),
`crates/store/migrations/**` (schema is at **7**),
`crates/daemon/src/lib.rs` (you do not wire yourself in — see §4; ONE `pub mod`
line is a shared-merge line, not wiring), everything under
`docs/plans/108-rust-port/` except your report, and the canonical
`/Users/jordanknight/pi-hacking/pij/.pi/**` — a live daemon runs off it.

**A ratified port signature change carries its IMPLEMENTERS and CALLERS**,
including `crates/testkit/src/{fakes,contract}.rs`. That is mechanical conformance.
New BEHAVIOUR in a fake is still stop-and-ask, and anything a fake newly RECORDS
must be read by an assertion that would fail without it.

## 4. Ship the recipe, not the integration

End your unit with a `# Composition recipe` doc comment: the exact `use`, the
constructor, the config field, the call site, and — if you start anything — the
shutdown contract. The PM pastes it. A worker that outlives its daemon is a
process nobody can see and nothing can stop.

## 5. Receipts are FILES, before the message that cites them

`docs/plans/108-rust-port/assets/reports/done-<unit>.md`, committed and pushed
BEFORE your done message. Carry: observed toolchain, disk, gate output, mutation
transcripts, the loop test from §1.3, the composition recipe, shared-merge files,
and **assumptions**. Disclose reds you did not cause rather than suppressing them.

## 6. The event attach rule

`Some(cursor)` or `subscribe_live(filter)`. `subscribe(None, …)` replays the whole
spine. Every `None` call site carries a comment saying why unbounded is safe;
there are currently zero in production code.

## 7. What is inert, and what this wave changes

* **The pointer rung is inert**: nothing feeds `InteractionGate`, which denies on
  unknown. `u-tap` is the sensor that changes this. We did NOT invert the default
  to make the rung reachable — a gate with no sensor answering "go ahead" would
  discard Jordan's politeness ruling while appearing to honour it.
* **The socket transport is closed** until a seat carries
  `cross_session_inbound_accept: Some(true)`; `u-spawn` stamps it truthfully.
* **Federation ships remote-send only.** The roster and stream half is this wave's
  `u-federation-2`, and it needs three wire changes that wave 4 deliberately did
  not improvise.
* **Delivery is at-least-once** with the duplicate window NAMED. `u-dedupe` closes
  it destination-side.

## 8. Standing rulings you inherit

* **Socket is transport; tmux is politeness.** Seat-`Working` is the transport's
  judgement; a HUMAN typing still gates, and that is Jordan's to lift.
* **There is no typed-body rung.** A body that can use neither socket nor pointer
  stays queued and is retried. Never typed.
* **A claim may only supersede ITSELF** (same pid and proc_start).
* **Bind before any mutating boot step**, and every fallible step above the key
  publish.

## 9. Context pressure and questions

Say so before it costs you judgement; the PM would rather split a unit than read a
report by a seat that has forgotten its own first half. Questions to the PM,
never sideways, never to the prime. You are not blocked by asking.

## 10. Reference reading

1. `assets/wave-5/SHAPE.md` — why your unit exists.
2. `assets/wave-3/WIRE-CONTRACT.md` — the frozen interface.
3. `assets/reports/done-wave-{0,1,2,3,4}.md` — the assumptions bind you.
4. `assets/experiences.md` — E-001…E-030. **Read E-023 through E-030 before your
   first test.** Eight of the thirty are from the last two waves, and they name
   the mistakes this codebase actually makes.
