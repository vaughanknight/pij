# Coder packet — u-revive-verb (parallel to unit 1)

**Read first**: `SHAPE.md` including **Amendments 1, 2 and 3**, then
`reports/findings-log.md`, then `../108-rust-port/assets/REVIEWER.md`.

## Scope

Ship **`pij-rs revive`** as an explicit verb: CLI subcommand + daemon route. Jordan
ruled the public surface is a **verb**, not an overloaded spawn — the wider mandate is
**verb parity with TS pij before the name switch**.

The respawn-over-tombstone path being built in unit 1 becomes the **internal
transition** this verb drives. That work is not wasted; it is the mechanism, and this
is the surface.

**Live-id refusal is UNCHANGED.** Only a **tombstoned** id revives. Do not relax the
live-id refusal to make the tombstoned case convenient — that is the over-correction
failure this plan checks for at ruling time and at review time.

## Fence — you are NOT alone on this plan

- **You own**: `crates/cli` (the verb) and the daemon **route** for it.
- **`pij-busy-macaw` owns**: spawn-time stamping in the harness/spawn path.
- **Composer owns**: `Cargo.lock`, arch fixtures, workspace manifests. Declare what you
  need in the receipt; do not commit them.

You are on your **own branch** `s109/u-revive-verb` in your **own worktree**
`/Users/jordanknight/pi-hacking/pij-worktrees/s109-revive-verb`. This is deliberate: a
predecessor plan put two coders on one working tree and then on one branch, and a
reviewer demonstrated in a throwaway repo that **B's routine `git checkout -- .` reverts
A's landed commit and stages it as ordinary authorship.** A revert that looks like
normal work in the log is the worst available failure shape. The composer merges.

## What "revive" must mean

A **transition**, observed on the descriptor — never a code path that ran:

1. tombstoned id → revive → the seat is live again with a **FRESH** `rpc_port`
   allocated Rust-side (`127.0.0.1:0`), the old value **replaced**;
2. and **nothing re-stamps the old value on a later pass**;
3. **live id → REFUSED**, with the refusal naming what it refused and why.

A mutation that only clears on a sweep must **fail**. Asserting merely that a new port
is stamped passes on a build that leaves the old value reachable.

## Rules that already cost this plan something

- **The stamp records INTENT**, not possession: *"we launched with `--ui-server` on N"*,
  never *"a listener exists"*. Name it that way. Possession is verified at **read time**
  by unit 2 — do not ship a `can_deliver`-adjacent helper that reads `rpc_port` without
  consulting proc, or the rule dies in the seam between units.
- **The registry contract cannot see an upsert defect** (F0-8): its updates write the
  same value over the same value, so a missing `excluded.<col>` is byte-identical and
  **green**. Any witness of yours that touches persistence writes the row **twice with
  different values** against a **real `SqliteRegistry`** — a fake stores a map and
  cannot express the defect at all.
- **Falsifiers pre-registered in a file before code**, each **demonstrated capable of
  failing**. A regression test green from birth is a claim, not a witness.
- **Every falsifier names the path it executes on**, reachable through the **shipped**
  verb — not a helper called by hand.
- Unfiltered test runs redirected to a file, exit code from the cargo invocation itself.
  A reviewer here read a `SIGPIPE` 101 from `| head` as a test failure: **a red that did
  not exist**, with the filter having dropped the lines that would have said so.
- **NEVER block on an interactive modal.** Ask **inline via `pij send`** to the PM,
  invariant 9. A modal in an unwatched pane is a process stopped with nothing anywhere
  saying so; it cost this plan ten silent minutes today.

Receipt is a file, committed and pushed **before** your done message.
