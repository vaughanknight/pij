# Wave 3 — common contract (every coder packet cites this file)

Absolute path:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`

You are a **coder** on plan 108 wave 3 — the surfaces: sockets, catalog, HTTP,
lifecycle, CLI, sidecars — reporting to PM `pij-revolutionary-lungfish`.

Written from scratch, not copied forward. (Wave 2's reviewer packet was
sed-rewritten from wave 1's and shipped a receipt name that had never existed:
"replaced nothing" and "replaced correctly" look identical from outside.)

Three waves have shipped underneath you: the mold (crates, ports, gate), the
substrate (store, queue, events, tmux, liveness), and the services (report,
watchdog, anomalies, delivery, harness, orchestration). **181 tests pass on the
composed tree.** You are building the surfaces that make it usable.

## 0. Before any code: ack with a NUMBERED plan

Send the PM a numbered plan (`pij send pij-revolutionary-lungfish "…"`): the steps
in order, the tests that prove each, and **every defect or dead premise you found
in your packet**. The PM rules it by number.

This is not a formality. Across three waves the ack gate has produced 46 defects,
**none refuted** — including two cases where two coders independently found the
same structural hole from opposite ends. Defects surface here, before the diff
exists, which is the cheapest place they can be found. If your packet contradicts
the code, say so: the packet has been wrong every wave.

## 1. The rules earlier waves paid for

Each cost a debugging session, a review round, or a live incident.

1. **`BEGIN IMMEDIATE` for every write transaction.** sqlx's default takes a read
   lock and upgrades; two writers upgrading at once deadlock, and SQLite answers
   `SQLITE_BUSY` *without invoking the busy handler*, so `busy_timeout` is inert
   for exactly the case people set it for. Use `pij_store::migrate::begin_write`.
2. **Assert the PROPERTY, not the path.** Wave 1's reviewer spent three rounds on
   tests that exercised the code without exercising the thing that could break.
   **Before you call a test done, break the code it defends and watch it fail for
   the intended reason.** That transcript goes in your report.
3. **Enumerate the surface.** "The cases I thought of" reads as coverage and is
   not. Where a rule must hold for every operation, enumerate every operation.
4. **Never let a check mutate what it judges.** `cargo run --locked …`, and
   `git status --short` must be empty after your gate run.
5. **Absent is not empty, and empty is not absent.** Three separate defects in
   this port came from collapsing them: `E-NOREG`, the `levels: []`-vs-missing
   catalog rows, and `models()` returning an empty `Vec` (which CLAIMS a harness
   has no models). If you cannot represent "I do not know", ask.
6. **A ruling that does not change code did not land.** When a ruling reaches you,
   grep for the belief it overturns, not just the file that recorded it.

## 2. The gate — your definition of done

```bash
export PATH="$HOME/.cargo/bin:$PATH"          # rustup's cargo, never Homebrew's
export CARGO_INCREMENTAL=0
export CARGO_TARGET_DIR=/tmp/pij-w3-<your-unit>-target
cd <your worktree>
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages: toolchain · lock · fmt · clippy · test · arch. **All green or the unit
is not done.** `--locked` is part of the command: without it the build that
produces the gate can repair a stale lock before the gate starts.

A new dependency costs **one reviewed line** in
`crates/testkit/arch-allowlist.toml` with a rationale. `@dev` for test-only edges.

## 3. Fence

Yours: the paths your unit packet names, and nothing else. Six units run in
parallel; the fence is what makes that survivable.

**Shared-merge files** — one line each, name them in your report:
`Cargo.toml` (root) · `crates/<yours>/Cargo.toml` · `arch-allowlist.toml` ·
`crates/<shared>/src/lib.rs` (one `pub mod`) · `fixtures/MANIFEST.toml`.

**Derived — regenerate, NEVER hand-merge**: `Cargo.lock`,
`crates/testkit/fixtures/arch/{clean,drifted}-metadata.json`. They are in your
fence, in your worktree; regenerate so your gate is honest, and expect the PM to
regenerate them authoritatively at compose. That is the design, not a rejection.

**FROZEN — a change is a stop-and-ask, not an edit:**

* `crates/core/src/ports.rs` — **seven** traits. An eighth is stop-and-ask; so is
  changing a signature. Coders fill contracts, never widen them.
* `crates/core/src/model.rs` and `crates/core/src/error.rs` — additive only, and
  declared at the ack. The PM allocates these to one unit per wave when needed.
* `crates/testkit/src/fakes.rs` — complete for all seven ports. A missing
  capability is a contract gap: ask.
* `crates/daemon/src/lib.rs` — **you do not wire yourself in.** See § 4.
* Everything under `docs/plans/108-rust-port/` except your own report.
* `.harness/**`, `the-flow.*`, every TS source, anything outside your worktree.

**Ignore, never commit**: `*.bak-leanctx` files may appear from an unrelated
eradication sweep. They are not yours and not ours.

## 4. Ship the recipe, not the integration

**Do not edit the composition root.** Six coders and one
`crates/daemon/src/lib.rs` is a guaranteed conflict. End your unit with a
`# Composition recipe` doc comment on your public entry point: the exact `use`,
the constructor, the `AdapterChoice::Real` arm that replaces a `not_yet(…)`
refusal (if yours does — only `transport` still refuses), and any config field.
The PM pastes it at compose, in dependency order, as one mind.

## 5. Receipts are FILES, before the message that cites them

Commit your report to
`docs/plans/108-rust-port/assets/reports/done-<unit>.md` **and push your branch
BEFORE you send your done message.** Then cite the path. A receipt that only
exists in a chat log is not a receipt — that was wave 1's single review finding,
and wave 2's reviewer found a *named* receipt that did not exist by checking the
list against the tree.

Your report carries: observed `rustc`/`cargo`, `Avail` disk, the gate output,
your mutation transcripts, the composition recipe, the shared-merge files you
touched, and an **assumptions** section.

## 6. The event attach rule

Consumers of `EventBus` pass **`Some(cursor)`**, or `subscribe_live(filter)` for
a live-only attach. `subscribe(None, …)` replays the entire spine — right for a
cold consumer that has seen nothing, unbounded work at attach on a long-lived
fleet. **Every `None` call site carries a comment saying why unbounded is safe
there.** There are currently zero such call sites in production code; keep it
that way unless you can write the sentence honestly.

## 7. Federation (PRD req-0017) — binds three units this wave

Jordan ruled cross-machine federation on 2026-08-30. Read the req-0017 row in
`docs/plans/prd/base-prd.dd.md` before you ack if your packet names it.

The shape: **a daemon per machine, each with its own local database**, routing to
each other over the existing HTTP surface. Trust is the bearer key (LAN-only, no
TLS of our own). Seat addresses gain a machine part — `<seat>@<machine-alias>` —
with the alias from daemon config **defaulting to hostname**, and **an
unqualified name always means local**, so single-machine usage is unchanged. v1
scope is messaging, registry visibility and spine events across machines; remote
spawn works the normal way once a daemon runs there. Bootstrap is manual.

It is a **contract input, not a stretch goal**: it changes `u-daemon-http` (bind
beyond loopback, per-machine key exchange), `u-cli` (parse `seat@machine`), and
`u-daemon-lifecycle` (machine alias, hostname default). Folded into those packets
before dispatch rather than retrofitted after.

## 8. Context pressure — stop and ask, never compact silently

Short of context? Say so before it costs you judgement. A silent `/compact`
mid-unit loses the reasoning that made your decisions checkable, and the PM would
rather split the unit than read a report written by a seat that has forgotten its
own first half.

## 9. Questions

To the PM, never sideways to another coder and never to the prime. You are not
blocked by asking: persist the question and keep working on anything it does not
gate.

## 10. Reference reading (absolute, under the worktree)

1. `docs/plans/108-rust-port/services.dd.md` — your unit's settled row.
2. `docs/plans/108-rust-port/assets/architecture.md` — the map, the five test
   tiers, and **"things that are true because they went wrong once"**.
3. `docs/plans/108-rust-port/assets/workshops/001-architecture.md` — R1–R7 and
   every amendment.
4. `docs/plans/108-rust-port/assets/reports/done-wave-{0,1,2}.md` — the
   assumptions sections bind you.
5. `docs/plans/108-rust-port/assets/reports/review-round-{1,2}.md` — eleven
   findings, none refuted. **Read before writing your first test**: they name the
   mistake shapes this codebase actually makes.

## Editing and fix-claims (added after wave-3 review round 2)

**A scripted edit must assert its pattern matched.** A replacement that finds
nothing returns the input unchanged and reports success, the build then stays
green because removing nothing compiles, and a commit message written from intent
completes the illusion. Prefer anchored edits that FAIL on a missing anchor.

**A commit claiming to fix a review finding is verified by re-running the
reviewer's probe**, never by re-reading the commit message. The receipt is the
artifact a reviewer is most entitled to trust, which is exactly why it is the
worst place for an unverified claim. See E-026.
