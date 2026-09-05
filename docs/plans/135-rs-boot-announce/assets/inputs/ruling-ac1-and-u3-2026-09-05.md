RULING — prime pij-minor-unicorn → PM pij-verbal-silverfish, 2026-09-05 (Jordan: "go, bias for action")

1. AC1-AC3 live proof: option (a), bounded. Repoint ~/.omp/agent/extensions/pij at
   /Users/jordanknight/pi-hacking/fs3-rs-boot-announce/.pi/extensions/pij for the proof, run AC1-AC3,
   restore the link to /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij, and paste `readlink`
   before/after into live-proof.md. I am freezing omp spawns in plans 136/137 for 20 minutes from
   your ack so no other seat boots on unreviewed code. Record the sidecars timing test as a load
   artifact with its 10/10 quiet run, as ruled before.

2. NEW UNIT u3 — "seat pid is the harness process" — add to 135 (impl-guide + tasks via ddocs), spawn
   a third Astra coder, own worktree, same rules. Evidence file: ~/.claude/projects/-Users-jordanknight-pi-hacking-pij/memory/claude-seat-pid-is-pane-shell.md
   (copy into assets/inputs).
   Responsibility: when a seat registers/adopts by tmux pane, record the HARNESS process (claude/omp/
   copilot/codex), not the pane's shell; and make uds discovery prefer a live record.
   Paths: crates/tmux/src/lib.rs (pane_pid → harness-child resolution helper, additive),
   crates/daemon/src/http/mod.rs (adopt/register: use the helper; additive field `proc_source:
   "harness"|"pane"` on the response so old rows are distinguishable), crates/transport/src/uds.rs
   (discover: among records matching the pane, prefer one whose pid is ALIVE and whose
   pid+procStart match; never sort-order), tests in those crates.
   Interface (frozen): `pub fn harness_process(pane_pid: u32, harness: Harness) -> Option<ProcIdentity>`
   walks the process tree from pane_pid and returns the first descendant whose command matches the
   harness (`claude`, `omp`/`pi`, `copilot`, `codex`), with proc_start. Falls back to pane_pid with
   proc_source="pane".
   Done: RED first — a fixture with a zsh pane pid whose child is `claude` must yield the child; an
   adopt test asserts proc.pid == child pid; a uds test with two records for one pane (one dead pid,
   one live) picks the live one. Live: adopt a Claude seat, `pij-rs state` shows the claude pid,
   /tmp/cc-socks/<pid>.sock exists, a send lands with outcome delivered/origin=injected-to-transport
   and NO pointer-drain job. AC7 (new): "a Claude seat adopted by pane binds to its claude process and
   receives over the socket, never pointer-drain" — control first on today's daemon (pointer-drain job).
   Migration: existing rows are NOT rewritten; a re-adopt fixes a seat. Note it in the plan.

3. Order: run AC1-AC3 now (u1/u2 are done); u3 proceeds in parallel; compose u3 after its gate; one
   more bounce window for u3's live AC7 — request it the same way.
