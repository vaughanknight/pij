---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s123/one-message-one-delivery"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-09-01T10:07:04.268Z"
agent: pij-obedient-marmot
plan_id: 123-one-message-one-delivery
schema_version: "1.2"
retro_id: "2026-09-01T10:07:19Z-pij-obedient-marmot-6275"
started_at: "2026-09-01T08:29:42.037Z"
ended_at: "2026-09-01T10:07:19Z"
summary: "Delivered and live-proved one-message-one-delivery; the run exposed two opaque harness diagnostics, an OMP spawn syntax mismatch, a cross-runtime proof gap that changed the design, and one cleanup race."
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot reports only npm run typecheck, hiding the TS2688 diagnostic that direct just typecheck reveals"
    target: harness-itself
    severity: degrading
    workaround: "ran just typecheck directly to recover the compiler diagnostic"
    suggested_encoding: "include captured child diagnostics in the harness boot error envelope"
    fp: "6275d6b8cfb3"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T08:29:42.037Z"
  - id: CONF-001
    kind: confusion
    description: "pij models advertises runtime omp but pij spawn rejects --harness omp; live OMP witness needs an alternate supported launch path"
    target: skill
    workaround: "used --harness pi --bin omp after reading the live CLI help"
    suggested_encoding: "make the pij peer skill show OMP as --harness pi --bin omp wherever OMP spawning is described"
    fp: "3ecd120f7109"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T08:32:36.823Z"
  - id: DL-002
    kind: difficulty
    description: "live OMP found queued job_id remained pending because inbox ack accepts only running claims; green Rust and Vitest suites did not exercise real queue state"
    target: project-sensor
    severity: blocking
    workaround: "ran an isolated real daemon, OMP pane, and SQLite queue inspection before accepting the design"
    suggested_encoding: "add a paved cross-runtime smoke that asserts event then claim then inject then terminal ack in a real OMP pane"
    fp: "1e96735e626e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T08:54:00.246Z"
  - id: DL-003
    kind: difficulty
    description: "harness boot exceeded 120 seconds during read-only s123 review; no concise readiness verdict"
    target: harness-itself
    severity: annoying
    workaround: "used the later harness checks result as the readiness receipt"
    suggested_encoding: "report running stage and preserved partial output when harness boot exceeds its caller timeout"
    fp: "41891db27062"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T09:21:38.860Z"
  - id: DL-004
    kind: difficulty
    description: "just self-check local-path-check test failed only during temp cleanup with ENOTEMPTY after assertions passed; concurrent skew worktrees were active, so completion gates must run after proof cleanup"
    target: tooling
    severity: annoying
    workaround: "removed temporary proof worktrees and reran just self-check in isolation"
    suggested_encoding: "make local-path-check temp cleanup retry transient ENOTEMPTY or ensure its child process is fully reaped"
    fp: "1443cd72751c"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T09:47:52.838Z"
  - id: CONF-002
    kind: confusion
    description: "harness checks reported a Vitest failure without the failing test; immediately rerunning just test passed, leaving the sensor failure unexplained"
    target: harness-itself
    workaround: "ran just test directly and then reran harness checks cleanly"
    suggested_encoding: "include the failing test name and a durable raw-output pointer in every harness checks stage failure"
    fp: "77b706d163c6"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-01T09:57:29.980Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — s123 one-message-one-delivery

Highest leverage: encode the isolated real OMP event → claim → inject → ack witness as a paved smoke. That is the only check that caught the load-bearing pending-versus-running claim mistake while both language suites were green.
