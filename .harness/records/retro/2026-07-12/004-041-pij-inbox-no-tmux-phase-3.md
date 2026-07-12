---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s041/inbox-no-tmux"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T21:10:08.791Z"
agent: "copilot-cli"
plan_id: "041-pij-inbox-no-tmux"
schema_version: "1.2"
retro_id: "2026-07-12T21:10:08Z-copilot-cli-680fcd0fc2dd"
started_at: "2026-07-12T11:33:59.011Z"
ended_at: "2026-07-12T21:10:08.791Z"
summary: "Phase 3 converged push consumers on durable markers, fixed three cold-review findings, and completed the reviewed-daemon no-tmux live proof."
entries:
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Phase 3 pre-review gates ran focused tests but not full just test, so a changed daemon contract left core/daemon/watch.test.ts red until reviewer boot/checks."
    target: "phase review gate"
    suggested_encoding: "Require full just test before cold-review dispatch, or mechanically include reverse-dependency tests for changed daemon consumers."
    fp: "680fcd0fc2dd"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T11:33:59.011Z"
  - id: DL-001
    kind: difficulty
    description: "Full Phase 3 gate exposed legacy daemon whole-life tests using a delivery-only fake; inbox draining throws before independent liveness notifications run."
    target: ".pi/extensions/pij/daemon.ts"
    severity: degrading
    workaround: "Run owned-session liveness/provider processing before the inbox drain so target-local delivery errors remain isolated."
    suggested_encoding: "Add a dedicated daemon channel fake that composes DeliveryPort and InboxPort in future test-harness work."
    fp: "918204864a45"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T11:46:51.547Z"
  - id: DL-002
    kind: difficulty
    description: "harness checks --quick rewrites vetted package timestamps, requiring byte-identical restoration before scope proof."
    target: "pkg-audit sensor"
    severity: annoying
    workaround: "Restore only timestamp lines from the pre-gate diff."
    suggested_encoding: "Make report-only pkg audit avoid manifest writes during harness checks."
    fp: "e972c4394d8e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T12:00:45.989Z"
---

# Retro — Plan 041 Phase 3

Highest leverage: require the full repository test gate before cold-review dispatch.
That would have exposed the stale reverse-dependency assertion before spending a
review cycle on it.
