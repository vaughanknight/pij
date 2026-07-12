---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T11:42:16.091Z"
agent: "pij-eventual-scorpion"
plan_id: "044"
schema_version: "1.2"
retro_id: "2026-07-12T11:42:16Z-pij-eventual-scorpion-044"
started_at: "2026-07-12T10:04:00Z"
ended_at: "2026-07-12T11:42:16Z"
summary: "Plan 044 planning and four cold validation rounds exposed five worktree/harness difficulties; the highest-leverage fix is isolated Pi agent state for worktree smoke."
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot reported a typecheck failure but omitted the underlying TypeScript diagnostics, leaving only npm and just wrapper lines"
    target: harness-boot
    severity: degrading
    workaround: "Ran just typecheck directly to reveal TS2688, installed dependencies, then reran harness boot."
    suggested_encoding: "Include captured compiler diagnostics in boot-typecheck-failed output."
    fp: "bfeab2665595"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T10:04:30.440Z"
  - id: DL-002
    kind: difficulty
    description: "FlowSpace default graph was absent in the allocated s044 worktree, forcing exact skill/history research to standard search."
    target: research-discovery
    severity: annoying
    workaround: "Used git history, ripgrep, and direct file reads."
    suggested_encoding: "Add a worktree bootstrap step or diagnostic that links or builds the repository FlowSpace graph."
    fp: "918b42232406"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T10:26:41.463Z"
  - id: DL-003
    kind: difficulty
    description: "pij send rejects the conventional --help flag, so command-specific usage required source or documentation lookup."
    target: pij-cli-discoverability
    severity: annoying
    workaround: "Read the peer route and CLI source for the compact control-command syntax."
    suggested_encoding: "Support pij <verb> --help or print verb-specific usage on E-ARG."
    fp: "dc1ff6a1bcd4"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T10:38:44.461Z"
  - id: DL-004
    kind: difficulty
    description: "Full harness smoke blocked on an interactive Do not trust prompt and timed out six scenarios."
    target: smoke-harness-trust-preflight
    severity: degrading
    workaround: "Treated the known worktree trust-prompt failure as shared non-blocking harness debt for planning."
    suggested_encoding: "Detect and resolve or fail fast on trust prompts before waitIdle."
    fp: "b8bc4763fbd7"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T10:44:34.459Z"
  - id: DL-005
    kind: difficulty
    description: "After bypassing project trust, smoke exits because globally linked extensions duplicate worktree-local extensions and tool names conflict."
    target: worktree-smoke-isolation
    severity: degrading
    workaround: "Did not mutate global links; relied on non-smoke deterministic sensors and recorded the limitation."
    suggested_encoding: "Run Driver SDK smoke with an isolated Pi agent directory or deduplicate global/local extension realpaths."
    fp: "75492b1a9ad6"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T11:04:31.380Z"
---

# Retro — Plan 044 planning

The planning run reached a validated `WAITING_FOR_BUILD_CONFIG` checkpoint without implementation. Worktree smoke isolation is the highest-leverage follow-up because it combines the trust prompt and duplicate global/local extension failures into one deterministic environment boundary.
