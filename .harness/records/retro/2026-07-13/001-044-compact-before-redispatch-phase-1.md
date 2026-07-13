---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s044/compact-before-redispatch"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-13T03:32:44.119Z"
agent: agent
plan_id: "044-compact-before-redispatch"
schema_version: "1.2"
retro_id: "2026-07-13T03:32:44Z-agent-fa52a41122f2"
started_at: "2026-07-12T22:41:14.133Z"
ended_at: "2026-07-13T03:33:00.000Z"
summary: "Phase 1 restored completion-first fire-and-forget compact behavior, added structural and cold runtime proof, and exposed three harness frictions plus one canary-design insight."
entries:
  - id: DL-001
    kind: difficulty
    description: "Full harness smoke stalled on Pi's trust prompt instead of reaching idle"
    target: "harness smoke"
    severity: degrading
    workaround: "Inspect trust handling and rerun smoke"
    suggested_encoding: "Make smoke launch bypass or deterministically answer the trust prompt"
    fp: "fa52a41122f2"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T22:41:14.133Z"
  - id: DL-002
    kind: difficulty
    description: "After bypassing the trust prompt, pi-peacock smoke still hardcodes the main checkout and branch, so worktree validation cannot reach a green full gate"
    target: "pi-peacock smoke"
    severity: degrading
    workaround: "Treat the other eight smoke scenarios as targeted evidence and report the worktree-specific blocker"
    suggested_encoding: "Make pi-peacock smoke derive cwd and branch from the active worktree"
    fp: "7c87e8066719"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T22:56:27.946Z"
  - id: DL-003
    kind: difficulty
    description: "Broad plan grep included forbidden the-flow.md despite an allowed plan subtree; future packet searches need explicit exclude globs"
    target: "flow-pair worker scope safety"
    severity: degrading
    workaround: "Use explicit file paths or exclude the forbidden flow basenames for all remaining plan reads"
    suggested_encoding: "Add a scoped-search helper or packet lint that excludes forbidden basenames"
    fp: "0ccb64b8dbac"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T00:38:57.155Z"
  - id: INS-001
    kind: insight
    description: "Cold reviewer canary event named the /pij pair route and re-triggered skill loading before compact; event prompts must rely on the already-loaded route without trigger wording"
    target: "cold completion-order canary"
    severity: annoying
    workaround: "Retry with a fresh orchestrator and a neutral terminal-verdict event"
    suggested_encoding: "Canary fixture should assert and avoid route-trigger text in the measured event"
    fp: "b66103735722"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T00:54:06.857Z"
---

# Retro — 044 compact-before-redispatch Phase 1

Completion-first compact now has deterministic structural coverage and bounded cold runtime evidence. The remaining observations are harness-level improvements outside the five-file implementation scope.
