---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T06:52:01.099Z"
agent: agent
plan_id: "035-o-prime-routing-skill"
schema_version: "1.2"
retro_id: "2026-07-11T06:52:01Z-agent-66d909c4f29b"
started_at: "2026-07-04T06:19:54.542Z"
ended_at: "2026-07-11T06:52:01.099Z"
summary: "Drained accumulated pij harness friction after the dlg-0002 cold review; all entries are retained for later harvest."
entries:
  - id: SUGG-001
    kind: improvement-suggestion
    description: "just flow-pair-install silently overwrote a diverged deployed skill copy without a diff, backup, or warning, destroying protocol invariants that existed only in the deployed store."
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-04T06:19:54.542Z"
  - id: DL-001
    kind: difficulty
    description: "Full harness checks failed in unrelated ralph-loop smoke while pij-only smoke passed; extension-level smoke isolation is needed for delegated phase validation."
    target: harness-checks
    severity: annoying
    suggested_encoding: "Add or document a per-extension full-gate recipe that runs only the touched extension smoke plus global static/unit gates."
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-06T09:34:01.677Z"
  - id: DL-002
    kind: difficulty
    description: "pij sessions --json boundModel lagged the actual bind signal, causing repeated futile polling after the peer had already announced ready."
    fp: "f5d42b8460ec"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-10T02:05:28.358Z"
  - id: DL-003
    kind: difficulty
    description: "A single pij peer message was pasted four or more times into a receiving Copilot pane in one delivery burst."
    fp: "a575bccaf1da"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-10T02:13:41.561Z"
  - id: DL-004
    kind: difficulty
    description: "pij watch with a literal file path reports success but creates an unusable directory watch and never notifies the caller."
    fp: "a899a356bfa6"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-10T02:22:20.521Z"
  - id: DL-005
    kind: difficulty
    description: "The duplicate-injection root cause was a zero-settle composer confirmation loop that blindly retyped during Copilot redraw lag."
    fp: "7f5865450c39"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-10T02:58:53.280Z"
  - id: DL-006
    kind: difficulty
    description: "A stale pre-restart descriptor made daemon ticks repeatedly throw on a missing tmux pane and delayed unrelated peer delivery."
    fp: "0a964006c0b2"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-10T03:36:32.444Z"
  - id: DL-007
    kind: difficulty
    description: "pij list --here reported 135 descriptors but only three live peers, with no pruning command for the registry corpses."
    target: pij-registry
    severity: degrading
    suggested_encoding: "Add an ownership-safe pij prune --dead command or automatic stale descriptor cleanup."
    fp: "d5890710e7b1"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T00:18:30.330Z"
  - id: DL-008
    kind: difficulty
    description: "A stale tmux descriptor with queued mail made send-keys throw, aborting every daemon tick and blocking unrelated live peer deliveries globally."
    target: tooling
    severity: blocking
    workaround: "Force-close stale descriptors one by one."
    suggested_encoding: "Catch per-target delivery failures and add a regression test proving another peer still receives in the same tick."
    fp: "b578d461a453"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T01:00:52.987Z"
  - id: DL-009
    kind: difficulty
    description: "The read-oriented harness checks gate mutated package-vetting timestamps, dirtying the worktree after validation."
    target: tooling
    severity: annoying
    workaround: "Restore only the audit-refreshed dates after the gate."
    suggested_encoding: "Make package audit byte-stable or require an explicit update verb for timestamp refreshes."
    fp: "3be78ad31916"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T01:08:16.519Z"
  - id: DL-010
    kind: difficulty
    description: "Mandatory review mutation probes required hand-rolled backup and trap scripts, increasing restoration risk after a shell short-circuit."
    severity: annoying
    suggested_encoding: "Add reusable mutation-test recipes that restore byte-identically and print structured RED-to-GREEN evidence."
    fp: "114eb420c6c5"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T06:29:35.564Z"
  - id: DL-011
    kind: difficulty
    description: "A direct tsx probe importing daemon.ts failed on minih package exports, so isolated daemon behavior could not run outside Vitest without extra setup."
    target: review-probes
    severity: annoying
    suggested_encoding: "Add a supported daemon scenario runner or document the Vitest-only module-resolution boundary."
    fp: "66d909c4f29b"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T06:48:15.920Z"
---

# Retro — review dlg-0002

The review found one false-death notification race despite a durable dissolved tombstone.
