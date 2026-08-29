# Coder packet — u-daemon-lifecycle (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high --layout window`
— OMP harness, never the copilot CLI harness, and **its own tmux window, never a
split pane**.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-lifecycle` · branch `s108/w3-lifecycle`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Boot, tick, stop, restart — and the machine's identity now that there can be more
than one machine. Wave 0 proved the single-instance guard falls out of the port
bind; you build the rest around it.

## Scope

* `crates/daemon/src/lifecycle.rs` — new.
* `crates/daemon/src/lib.rs` — **only** the `pub mod lifecycle;` line, nothing else.
* your tests, allow-list rows, derived files.
* The **supervise/upgrade design note** is a deliverable even where the
  implementation phases: `docs/plans/108-rust-port/assets/daemon-lifecycle.md`.

## What to build

1. **The tick loop**: what runs on a schedule, at what interval, and how it stops.
   Intervals are CONFIGURED, never const — "a default is a number nobody chose"
   has bitten this project twice already.
2. **Single-instance guard, day one, for free**: the OS already refuses the second
   bind, so the daemon's job is to say so in words an operator can act on rather
   than to invent a lock file that can go stale. Wave 0's test asserts the
   message; keep it.
3. **Graceful restart/upgrade** — better than fs3's tmux-pane admission, which
   they admit is weak. What must drain, what may be dropped, what a client sees
   during it. **Write the design note even for the parts you do not implement**;
   an undesigned upgrade path is how a daemon becomes unupgradeable.
4. **The C6 affordance**: the TS daemon runs off source with no hot-reload, so a
   code edit silently does nothing until a restart. Make the Rust one report its
   own build identity, so "did my change take effect?" is answerable.

### Federation (req-0017) — your half

5. **Machine alias in config, defaulting to hostname.** This is the name other
   machines address this daemon by. Absent config means hostname; an explicitly
   configured alias wins; and the alias belongs in the boot banner and `/health`.
6. **An unqualified seat name always means local.** That invariant is enforced
   above you, but your identity is what makes it decidable — say in your ack how a
   daemon knows its own alias is not ambiguous with a peer's.

## Done bar

* Gate green; boot/shutdown integration test; two-daemon refusal test (exists —
  keep it green and extend it if your guard changes).
* Alias-defaulting test: no config → hostname; config → the configured value.
* The design note exists and names what is NOT implemented.
* **Mutation evidence** on the single-instance guard and on the alias default.
* Report committed and pushed before the done message.
