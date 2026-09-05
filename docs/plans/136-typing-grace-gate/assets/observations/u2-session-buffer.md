- id: CONF-001
  kind: confusion
  description: "Plan 136 u2 packet i7 says honest receipts already work and forbids changing delivery/mod.rs, but i8/d2 demand pre-fix RED for that same regression guard. Asked PM in acknowledgement be628ea444377096-0000000000000042 to approve green-baseline plus test-only negative control. Candidate packet check: distinguish new-behavior RED-first proof from an existing-behavior regression guard."
  fp: d05e75253890
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:50:37.366Z"
- id: CONF-002
  kind: confusion
  description: "Plan136 u2 scout accidentally used mounted fs2 MCP instead of instructed flowspace3 CLI, yielding 30s timeout and unrelated TS hits. Main ran actual flowspace3 search 'delivery queue claim lease expires unacknowledged message retry' --path 'crates/**' --source code --limit 3; correct worktree Rust expiry witness ranked first (0.6373). CLI and mounted MCP are different indexes; encode CLI-only routing in research task template."
  fp: bb69215f2a42
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:57:32.669Z"
- id: DL-001
  kind: difficulty
  description: "Plan136 u2 frozen fence omits queue authority and typed StateCard. Real queue expires delivery claims after 300s and one running serial key blocks later commands; held events alone cannot satisfy no-redelivery plus bypass. PM scope expansion requested with queue.rs:220-258 and worker.rs:102-119 evidence. Fence should include affected contract callers rather than only handler source."
  fp: 8dcdae55b3d2
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-04T23:58:06.050Z"
- id: CONF-003
  kind: confusion
  description: "Plan136 contract b7fe533a requires release to clear an already-PENDING row via Queue::retry(ZERO), but retry SQL accepts RUNNING only. It also claims existing peek honors not_before; queue.rs:315-319 selects oldest live row with no not_before predicate. Evidence sent to PM; request explicit method/contract fence correction, not a new held state. Contract examples need executable authority-backed probes before freeze."
  fp: 9dc3b7c7caae
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:05:56.694Z"
- id: DL-002
  kind: difficulty
  description: "u2 full harness checks failed all8 sensors because fresh Rust worktree had no TS gate dependencies (tsx/biome/vitest). Scoped Rust readiness does not establish the full gate runtime. Installing npm only in assigned worktree using packet's temporary min-release-age removal; restoring config/lock afterward. Improvement candidate: team scaffold probes/installs every sensor runtime before fanout."
  fp: b095a0d0d740
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:34:33.072Z"
- id: DL-003
  kind: difficulty
  description: "harness commit b1d22042 verified refs/notes/ai attribution but conversation ingest still reported unresolvable identity even with PIJ_SESSION_ID=pij-immense-hawk. This rs seat resolves via pij whoami; likely generation-aware registry lookup needed in collector hook. No conversation sync or toolchain repair attempted; warning relayed to PM."
  fp: 7f43bc58fa27
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-05T00:51:53.418Z"
