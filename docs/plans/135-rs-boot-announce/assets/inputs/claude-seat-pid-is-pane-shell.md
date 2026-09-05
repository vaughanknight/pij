---
name: claude-seat-pid-is-pane-shell
description: "rs adopt records a Claude seat's proc.pid as tmux pane_pid (the SHELL), not the claude process; uds discover keys on that pid, misses, and falls to a pane-suffix scan over ~/.claude/sessions that can pick a stale record — so deliveries to Claude seats go stale-socket or tmux pointer-drain. 18 of 19 live Claude seats affected (2026-09-05)."
metadata:
  type: project
---

**"Seats are coming in via tmux, not the direct socket" (Jordan 2026-09-05) — mechanism, verified.**

- `pij adopt "$TMUX_PANE"` → rs binds "by process identity (pid N)" where N comes from tmux
  `#{pane_pid}` (`crates/tmux/src/lib.rs:693-727`) — that is the pane's **shell** (`-zsh`), not the
  `claude` process (its child). Mine: pane pid 64616, claude pid 49862.
- `crates/transport/src/uds.rs discover()`: tries `~/.claude/sessions/<proc.pid>.json` (miss —
  Claude writes `<claude-pid>.json`), then scans ALL session records sorted by name for
  `record.tmux.ends_with(".<pane>")` and takes the FIRST — which can be a stale record for a dead
  session that once held the same (recycled) pane id → "bounced on stale socket" (egret's report).
- When that fails the delivery drops to the `pointer-drain` worker: a pointer typed into the pane
  via tmux send-keys — the "old way" Jordan saw. Jobs to my seat: 11 pointer-drain / 5 self-claimed.
- Spine rows for these deliveries read `queued reason=extension-stream transport=claude-uds` —
  a wrong label for a Claude recipient (extension-stream is the omp/pi rung) — so the audit trail
  says "socket" while the pane says "tmux". [[report-is-not-evidence]].
- Blast radius: `for live claude seats: /tmp/cc-socks/<proc.pid>.sock exists?` → **18 MISS, 1 OK**.

**Fix shape**: adopt/register must record the harness process (walk pane_pid's children for
`claude`, or read `~/.claude/sessions/*.json` whose `tmux` == pane and take the LIVE one, keyed by
pid+procStart per [[recycled-identifiers]]); discover must prefer a live record over sort order.
Related: [[derive-your-pane-from-pane-pid]], [[claude-uds-messaging-socket]], [[legacy-daemon-stopped]] (a stray legacy daemon from plan 134's worktree was ALSO typing via tmux until killed 2026-09-05).

**Addendum 2026-09-05 10:30 — the bigger cause for MY seat was a hijack, not the pid.** My row had
flipped to `harness=omp, pid=4763`: the `omp -p …` Astra probes I ran IN MY OWN PANE booted the pij
extension, whose `chooseIdentity` `samePane` branch returned the row already holding `%2304` (mine)
regardless of harness, and `register` upserted omp over it. From then on the daemon routed to me as
an omp seat (`queued/extension-stream`), i.e. pointer-drain into the pane. `pij adopt "$TMUX_PANE"
--harness claude` restored the row and the very next message arrived via `uds:` socket. Rule in 135
u3: samePane reuse only when harness matches. Probe: `pij-rs state <me> --json` → harness+pid must be
YOUR process; never run a one-shot omp/pi in a pane that holds a seat. [[seat-asserted-not-derived]].
