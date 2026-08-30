# Wave 4 — common contract (every coder packet cites this file)

Absolute path:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-4/COMMON.md`

You are a **coder** on plan 108 wave 4 — spawn, the socket opening, federation,
the pointer rung, and `daemon bounce` — reporting to PM
`pij-revolutionary-lungfish`.

**Written from scratch.** Wave 2's reviewer packet was sed-rewritten from wave 1's
and shipped a receipt name that had never existed: *"replaced nothing" and
"replaced correctly" look identical from outside.* That is also this wave's
opening lesson (§ 1.7) — it arrived a third time in review round 2 and is now a
rule rather than an anecdote.

Four waves are underneath you: the mold, the substrate, the services, and the
surfaces. **233 tests pass on the composed tree; all seven ports are
real-capable.** You are turning on the things wave 3 deliberately left closed.

## 0. Before any code: ack with a NUMBERED plan

Send the PM a numbered plan (`pij send pij-revolutionary-lungfish "…"`): steps in
order, the tests that prove each, and **every defect or dead premise in your
packet**. Then STOP and wait for rulings.

Across four waves the ack gate has produced 60+ defects, **none refuted**. Wave 3
alone: a packet that fenced two units as one; a wire example that would 422
against its own type; a trait signature landed without the field it existed to
inspect; a read route that would have had to lie about a cursor or write to the
spine; and a routing prefilter that would have made a correct socket transport
into dead code. All found before a line was written.

**If your packet contradicts the code, the code wins and you tell me.** The packet
has been wrong in every wave, including this PM's own corrections to his own
rulings — three times in one ack cycle in wave 3.

## 1. The rules earlier waves paid for

1. **`BEGIN IMMEDIATE` for every write transaction** (`pij_store::begin_write`).
   sqlx's default takes a read lock and upgrades; two upgrading writers deadlock,
   and SQLite answers `SQLITE_BUSY` *without invoking the busy handler*, so
   `busy_timeout` is inert for exactly the case people set it for.
2. **Assert the PROPERTY, not the path.** Break the code a test defends and watch
   it fail *for the intended reason*. That transcript goes in your report. Wave 3
   shipped a test whose aggregate assertion could not fail on the per-port defect
   it was written for — "the test exists" and "the test can fail" are different
   claims.
3. **Enumerate the surface.** "The cases I thought of" reads as coverage and is
   not.
4. **Never let a check mutate what it judges.** `cargo run --locked …`; `git
   status --short` empty after the gate. Wave 3's review found a stale `Cargo.lock`
   at the committed head because every gate run silently repaired it first — *a
   gate that fixes its own input is a formatter that reports PASS.*
5. **Absent is not empty, and empty is not absent.** And a **residue is not a
   state**: files record that something once ran here, not that it is running
   here (E-024).
6. **A ruling that does not change code did not land.** Grep for the belief it
   overturns, not the file that recorded it.
7. **A scripted edit must ASSERT its pattern matched**, and a commit claiming to
   fix a review finding is verified by **re-running the reviewer's probe**, never
   by re-reading the message. A replacement that matches nothing returns success,
   the build stays green because **removing nothing compiles**, and a message
   written from intent completes the illusion (E-026). Prefer anchored edits that
   fail on a missing anchor.
8. **Only running the shipped thing proves it against the world the user gets**
   (E-025). A unit test proves a part against the world the test builds. Wave 3's
   binary booted every adapter fake through three waves of green suites, because
   the default was true in the wave that wrote it and nothing re-asked.

## 2. The gate — your definition of done

```bash
export PATH="$HOME/.cargo/bin:$PATH"          # rustup's cargo, never Homebrew's
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w4-<your-unit>-target
cd <your worktree>
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages: toolchain · lock · fmt · clippy · test · arch. **All green or the unit
is not done.** `--locked` is part of the command, for rule 1.4's reason.

A new dependency costs **one reviewed line** in
`crates/testkit/arch-allowlist.toml` with a rationale. `@dev` for test-only edges.

## 3. Fence

Yours: the paths your unit packet names, and nothing else.

**Shared-merge files** — one line each, name them in your report:
`Cargo.toml` (root) · `crates/<yours>/Cargo.toml` · `arch-allowlist.toml` ·
`crates/<shared>/src/lib.rs` (one `pub mod`) · `fixtures/MANIFEST.toml`.

**Derived — regenerate, NEVER hand-merge**: `Cargo.lock`,
`crates/testkit/fixtures/arch/{clean,drifted}-metadata.json`.

**FROZEN — a change is a stop-and-ask, not an edit:**

* `crates/core/src/ports.rs` — **seven** traits. An eighth is stop-and-ask, and so
  is a signature change. Wave 3 amended one signature (`can_deliver` taking the
  message) and it went through the prime.
* `crates/core/src/model.rs`, `error.rs` — additive only, declared at the ack,
  allocated by the PM to one unit per wave.
* `crates/testkit/src/fakes.rs` — a missing capability is a contract gap: ask.
* `crates/daemon/src/lib.rs` — **you do not wire yourself in.** See § 4.
* `crates/store/migrations/**` — schema is at **5**. A migration is stop-and-ask.
* Everything under `docs/plans/108-rust-port/` except your own report.
* `.harness/**`, every TS source outside your packet, anything outside your
  worktree. Never touch the canonical `/Users/jordanknight/pi-hacking/pij/.pi/**`
  — a live daemon runs off it.

**Ignore, never commit**: `*.bak-leanctx` files from an unrelated sweep.

## 4. Ship the recipe, not the integration

**Do not edit the composition root.** End your unit with a `# Composition recipe`
doc comment on your public entry point: the exact `use`, the constructor, the
config field, and the call site. The PM pastes it at compose, in dependency order,
as one mind.

`not_yet(…)` **no longer exists** — every port is real-capable. If your recipe
says "replace the refusal", it is describing a tree that is gone.

## 5. Receipts are FILES, before the message that cites them

Commit your report to
`docs/plans/108-rust-port/assets/reports/done-<unit>.md` **and push your branch
BEFORE you send your done message.** A receipt that exists only in a chat log is
not a receipt.

Your report carries: observed `rustc`/`cargo`, `Avail` disk, gate output, mutation
transcripts, the composition recipe, shared-merge files touched, and an
**assumptions** section. Disclose reds you did not cause rather than suppressing
them — a report that hides a red teaches the next reader to distrust the greens.

## 6. The event attach rule

Consumers pass **`Some(cursor)`**, or `subscribe_live(filter)`. `subscribe(None,
…)` replays the entire spine — unbounded work at attach on a long-lived fleet.
Every `None` call site carries a comment saying why unbounded is safe there. There
are currently zero in production code.

## 7. What wave 3 left CLOSED on purpose, and why it stays honest

* **The socket transport is inert.** `UdsTransport` refuses any seat whose
  descriptor lacks `cross_session_inbound_accept: Some(true)`, and nothing stamps
  it yet. Measured, not assumed: an authenticated daemon-origin frame to an
  un-opted seat is **held behind a five-minute dialog, never reaches the model,
  and returns zero bytes** — so the inherited 150 ms silence timer was measuring
  nothing and reporting success (E-023).
* **The daemon can NEVER truthfully attest a permission mode.** Claude derives
  attestation from the sender's verified pid being a Claude session, never from a
  wire field — anti-permission-laundering by design, corroborated independently
  from both sides. The recipient-side spawn setting is the only honest open we
  control.
* **Federation is refused, not half-built**: `/v1/send` accepts only
  `Destination { machine: None }`.
* **There is no typed-body rung.** If a body can use neither the socket nor a
  pointer, the row stays queued and is retried. Never typed.
* **The human-typing politeness gate STANDS** (Jordan, 2026-08-27). Seat-`Working`
  became the transport's judgement; a human at the keyboard did not. *Socket is
  transport, tmux is politeness* — Jordan's to lift, not ours.

## 8. Boot invariant

**Bind or reserve the port BEFORE any mutating boot step**, and keep every
fallible step above the key publish. Wave 3 violated both: `build_services` ran
before the bind, and opening the store runs migrations, so a losing daemon
migrated the schema and only then discovered it had lost the race — *the loser
mutated the winner's world*, one-way, and no test of either daemon alone would see
it.

## 9. Context pressure — stop and ask, never compact silently

Say so before it costs you judgement. The PM would rather split the unit than read
a report written by a seat that has forgotten its own first half.

## 10. Questions

To the PM, never sideways to another coder and never to the prime. You are not
blocked by asking: persist the question and keep working on anything it does not
gate.

## 11. Reference reading (absolute, under the worktree)

1. `assets/wave-4/SHAPE.md` — why your unit exists and what it must not absorb.
2. `assets/wave-3/WIRE-CONTRACT.md` — the frozen interface, including
   `supersedes`, generation detection, and the durable `in_reply_to`.
3. `docs/plans/108-rust-port/services.dd.md` — your unit's settled row.
4. `assets/architecture.md` — the map, five test tiers, and "things that are true
   because they went wrong once".
5. `assets/reports/done-wave-{0,1,2,3}.md` — the assumptions sections bind you.
6. `assets/experiences.md` — E-001…E-026. **Read E-023 through E-026 before your
   first test**; they name the mistake shapes this codebase actually makes, and
   four of them were found in the last wave alone.
