---
record_kind: "retro"
harness_version: "0.12.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-13T12:00:56.841Z"
agent: "pij-primary-carp"
plan_id: "046-pij-real-trees"
schema_version: "1.2"
retro_id: "2026-07-13T12:01:30Z-pij-primary-carp-1a3cd219"
started_at: "2026-07-13T11:38:13.932Z"
ended_at: "2026-07-13T12:01:30.000Z"
summary: "Prime closeout for Plan 046: smoke hermeticity was encoded after two failed isolation approaches, scratch-first/live-second deployment proved ownership-safe tree mutation, and a separate verified daemon lifecycle/re-key defect was retained for hardening."
entries:
  - id: DL-001
    kind: difficulty
    description: "Full smoke initially exited because Pi discovered globally symlinked extensions and the same project-local extensions, registering tools twice; the aggregate failure did not identify the two discovery roots, so a single-scenario reproduction was needed."
    target: "smoke-launcher"
    severity: blocking
    workaround: "Run Pi with --approve --no-extensions and explicitly load the project-local extension inventory once."
    suggested_encoding: "Add a deterministic smoke command resolver and a diagnostic that prints extension provenance or detects duplicate project/global registrations before tmux launch."
    fp: "1a3cd219c78d"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-13T11:38:13.932Z"
        resolved_by: "7d0ae9de4637d1df0cc82e25cd03fb216bbcbb29"
  - id: INS-001
    kind: insight
    description: "Scenario-local-only isolation looked hermetic but changed the established smoke contract: todo smoke intentionally invokes /sql supplied by session-sql, so smoke scenarios depend on the complete project extension environment rather than only their adjacent extension."
    target: "smoke-contract"
    severity: degrading
    workaround: "Load every top-level .pi/extensions/*/index.ts in deterministic sorted order while excluding globals."
    suggested_encoding: "Declare or mechanically test the smoke extension-set contract so future isolation changes cannot silently remove cross-extension dependencies."
    fp: "96effa57cc39"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-13T11:38:15.854Z"
        resolved_by: "7d0ae9de4637d1df0cc82e25cd03fb216bbcbb29"
  - id: DL-002
    kind: difficulty
    description: "The smoke runner previously relied on ambient Pi discovery, making results depend on machine-global extension links and causing clone-to-clone drift."
    target: "environment-hermeticity"
    severity: blocking
    workaround: "Disable discovery and construct the extension arguments from PIJ_ROOT at runtime with safe quoting and stable ordering."
    suggested_encoding: "Keep the resolved local extension inventory observable in smoke output and unit-test ordering, quoting, completeness, and absence of hardcoded machine paths."
    fp: "db5c828d322b"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-13T11:38:17.794Z"
        resolved_by: "7d0ae9de4637d1df0cc82e25cd03fb216bbcbb29"
  - id: INS-002
    kind: insight
    description: "The first trust fix, pi --approve, solved the interactive project-trust prompt but was insufficient because it left ambient global extension discovery enabled; the two concerns need separate controls."
    target: "smoke-preflight"
    severity: degrading
    workaround: "Combine --approve for trust with --no-extensions for isolation, then explicitly add intended local extensions."
    suggested_encoding: "Add a resolver test that independently mutation-kills removal of --approve and removal of --no-extensions."
    fp: "af15ee85122f"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-13T11:38:19.609Z"
        resolved_by: "7d0ae9de4637d1df0cc82e25cd03fb216bbcbb29"
  - id: DL-003
    kind: difficulty
    description: "Full harness checks refreshed report-only vetted.date fields in .pi/packages.yaml, creating unrelated working-tree churn that the stream owner had to verify and restore byte-identically before completion."
    target: "package-audit"
    severity: annoying
    workaround: "Verify the delta is audit-date-only and restore the manifest from HEAD outside the coder allowlist."
    suggested_encoding: "Make report-only package audit non-mutating during checks, or write refreshed audit metadata to a temp/report artifact unless an explicit update command is requested."
    fp: "38c03bdd892f"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T11:38:21.364Z"
  - id: WIN-001
    kind: win
    description: "The scratch topology proof used reviewed-worktree CLI code against copied live descriptors, produced before/after hashes, and proved link changed only parentId while spawnedBy and unrelated metadata stayed unchanged."
    target: "topology-proof"
    severity: annoying
    workaround: "N/A"
    suggested_encoding: "Retain this scratch-first pattern as a reusable fixture/command for registry-mutating features before canonical deployment."
    fp: "3eee4a2a12b3"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T11:38:23.127Z"
  - id: GFT-001
    kind: gift
    description: "The Stage A scratch versus Stage B post-merge split prevented debugging from mutating the real registry or restarting the canonical daemon while product code was still unmerged."
    target: "deployment-safety"
    severity: annoying
    workaround: "Exercise reviewed worktree code in isolated PIJ_HOME first; reserve live links and daemon restart for canonical merged code under baton."
    suggested_encoding: "Template this two-stage acceptance pattern for future control-plane features that change durable registry state."
    fp: "c72c1790c09e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T11:38:24.891Z"
  - id: MW-001
    kind: magic-wand
    description: "A single smoke failure consumed multiple diagnosis loops because the runner reported scenario failure but not the exact effective Pi command and loaded extension set."
    target: "smoke-observability"
    severity: degrading
    workaround: "Manually reproduce one scenario and inspect Pi help plus extension inventory."
    suggested_encoding: "On failure, print the exact shell-safe command, cwd, scenario path, and sorted extension inventory, with secrets redacted."
    fp: "cbdd3b8f572e"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T11:38:26.651Z"
  - id: DL-004
    kind: difficulty
    description: "Verified daemon lifecycle defect: a descriptor can transition from terminal dead back to stalled/pane-alive, swept dead descriptors reappear because births are not tombstoned at source, and re-key can leave old and new descriptors active on one pid so closing the ghost kills the live seat."
    target: "pij-daemon-state-machine"
    severity: blocking
    workaround: "Clear the ghost daemon-side and avoid closing either shared-PID descriptor from the client."
    suggested_encoding: "Enforce dead as terminal; make re-key atomically tombstone/retire the old descriptor; add PID uniqueness and graveyard-regrowth mutation tests at the descriptor writer, not another sweep."
    fp: "83562717aa70"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T11:56:27.155Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 046 pij real trees prime closeout

The highest-leverage remaining improvement is **fail-loud smoke boot provenance**:
when Pi exits before readiness, report the exact executable/argv, cwd, extension inventory,
exit status, and final pane output. That would have collapsed the longest diagnosis from
multiple manual probes to one deterministic error.

The separate daemon lifecycle/re-key defect remains open and blocking because it can make a
client-side ghost close kill a live seat sharing the same pid.
