- id: DL-001
  kind: difficulty
  description: "Plan139 u1: LSP references for SqliteRegistry::new and EventBus::new returned no references despite explicit daemon/lib.rs callers; absolute worktree lookup is not proof of full workspace indexing. Use exact identifier inventory to avoid dropped constructors. Peer tail CLI also resolves legacy registry; explicit tmux target required for actual Rust seat footer."
  fp: a40031f2d6d8
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T00:45:18.001Z"
- id: WIN-001
  kind: win
  description: "Plan139 u1 adds a source guard forbidding direct spine_events INSERT outside store/spine.rs and fixture-backed dual-subscriber HTTP adopt/report/message control. Atomic registry future is first polled under EventBus ordering lock; a focused regression pins that lazy lock boundary. Validation intentionally deferred to PM concurrent-wave gate; do not treat authored tests as passed."
  fp: b5de4506a30d
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T00:53:11.023Z"
- id: DL-002
  kind: difficulty
  description: "Plan139 u1 PM caught publication cancellation hole: EventBus caller owns publication mutex and SQLx commit await. Pinned sqlx-sqlite0.8.6 worker explicitly ignores rollback after COMMIT processed but receiver acknowledgement cancelled (worker.rs268-272). Caller cancellation can strand durable event and release ordering lock. Authored SQL-backed paused-commit witness; no validator run during wave. Proposed smallest fix: owned admitted publication task retains lock through commit+broadcast."
  fp: 030a3db977ac
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:05:32.929Z"
- id: WIN-002
  kind: win
  description: "Plan139 u1 cancellation fix authored: one generic publish_committed<T,F> path acquires owned mutex then transfers lazy static commit+broadcast into an owned task. RegistryPublisher and ordinary publish delegate; flush drains admitted tasks after producer shutdown. Added deterministic SQL-backed registry/ordinary cancellation, pre-admission no-write, generic concrete result/refusal, and flush witnesses. No validations run during edit wave; PM owns proof."
  fp: aa639437ccf3
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:10:47.069Z"
- id: WIN-003
  kind: win
  description: "Plan139 u1 added standalone shipped all-real boot regression: private foreground tmux server/socket, explicit child-only env_clear with private HOME/Claude/XDG/state/port and identical TMUX on daemon/clients; bounded startup plus real CLI ping, adopt, tail and report. Prior boot fixtures only isolated HOME/state and could discover shared tmux. New test does not run any mock boot or touch process-global environment. Authored only; PM owns execution."
  fp: e1d603f85614
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T02:26:05.523Z"
- id: DL-003
  kind: difficulty
  description: "PM executed governance_boot safely: private tmux new-session -P/-F converted TAB separators to underscores, producing one socket_pid_pane field before daemon boot. PM is changing format and split to pipe separator, already proven by u0 isolation recipe. Owned cleanup ran. u1 source remains paused; do not re-run or overwrite PM fix."
  fp: 19cd20e06dae
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T02:42:22.176Z"
- id: DL-004
  kind: difficulty
  description: "PM runtime proof: governance_boot passed actual private daemon boot, ping, adopt, live report, list, and graceful tail/daemon/tmux-server shutdown. Final assertion failed because tmux retained its socket pathname after server exit. PM will unlink only recorded private socket after reaping owned server, retaining path for panic cleanup. Strict Clippy also found redundant epoch_ms closure; PM replaces with function item. Not an overall green claim; u1 source remains paused."
  fp: ece7d633035d
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T02:54:15.353Z"
- id: WIN-004
  kind: win
  description: "PM reports canonical full Rust gate GREEN, including publication, cancellation, rollback and shipped private all-real boot through clean owned teardown. Composed test uses pipe delimiter and explicitly unlinks recorded private socket only after reaping owned server. Engineering harness gate still running; do not treat Rust gate as final task acceptance. u1 remains waiting with source paused and buffer preserved."
  fp: 551831248fa3
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T02:59:18.900Z"
- id: WIN-005
  kind: win
  description: "Plan139 u1 added Registry::tombstone_if_unchanged as a one-directional safety brake, not a liveness/retention policy: compare whole raw descriptor under same ordered SQL transaction before tombstone+event, refuse E-RS-INCARNATION-CHANGED for changed/missing. Focused tests cover reused PID/start, role/parent/machine differences, no-event failures, rollback and a deterministic external change before publication admission. Source only; PM composes GovernanceRefused variant and runs validators."
  fp: 3a97d6345ef9
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T03:44:03.166Z"
