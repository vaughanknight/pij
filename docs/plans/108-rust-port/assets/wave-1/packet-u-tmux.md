# Coder packet — u-tmux (wave 1)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w1-tmux` · branch `s108/w1-tmux`
**Common contract (read first)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-1/COMMON.md`
**PM**: `pij-revolutionary-lungfish` · **Tier**: contract test over the fake + a
real adapter proven without touching the live fleet

## Mission

Every tmux syscall in this workspace, in one crate. `crates/tmux` is empty; fill
it with the real `TmuxPort` adapter so that no later unit ever shells out to tmux
again — that single-home property is the entire reason the port exists.

## Scope — the only paths you write

* `crates/tmux/**` — the adapter, its modules, its tests, its `Cargo.toml`.
* `crates/testkit/arch-allowlist.toml` — your reviewed row(s).

## What to build

`TmuxPort` is **frozen** (`crates/core/src/ports.rs`) — six methods:
`list_panes`, `send_keys`, `capture`, `kill`, `new_window`, `user_typing`.
Implement all six.

1. **Parsing is the risk, so parsing gets the fixtures.** `tmux list-panes -F …`
   output is your wire format. Capture real output into
   `crates/testkit/fixtures/tmux/` (index it in `MANIFEST.toml` with sha256 and
   the ANSWER), and test the parser against those bytes rather than against a
   string you wrote from memory. **Include at least one hostile case**: a pane
   title containing your field separator. Titles are user-controlled — wave 0
   named panes with `·` in them.
2. **The typing gate is a safety interlock, not a policy.** `user_typing` exists so
   an injection never lands mid-keystroke and corrupts a human's input. Removing
   it makes the system do *more*, never something different — say which one it is
   in your report, in those terms.
3. **Never tap the live fleet.** Standing rule. Your real-adapter tests create
   their own detached tmux session with an entropy-derived name, do their work
   there, and kill it — or they are skipped with a stated reason when no tmux is
   available. A test that lists the operator's panes is a test that can kill one.
4. **`kill` is destructive**: it must refuse a pane id it did not resolve from
   `list_panes` in the same call chain, or carry an equally explicit guard. Say
   which you chose and why.

## Done bar

* Gate six stages green.
* The **shared contract suite** runs against your real adapter and against
  `FakeTmux` — add `tmux_contract` to `pij_testkit::contract` if it is missing
  (that file is yours to extend for this seam; the *fakes* are frozen, the
  contracts are not).
* Fixture-backed parser tests, hostile separator case included, fixtures indexed.
* Mutation evidence on the field-splitting logic: break the separator handling,
  watch the named test fail, restore. Transcript in the report.
* Composition recipe (COMMON §4) replacing `not_yet("tmux", "u-tmux, wave 1")`.

## Watch for

* Absent vs empty: a pane with no title is not a pane that is missing.
* `capture` takes a line count — prove the boundary (0 lines, more lines than the
  pane has) rather than the happy path only.
* tmux may not exist on the machine. A missing binary is an `Adapter` error that
  names the fix, never a panic.
