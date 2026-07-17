---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s054/pij-grown-up"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-17T05:55:00.000Z"
agent: agent
plan_id: 054-pij-grown-up
schema_version: "1.2"
retro_id: "2026-07-17T05:55:00Z-agent-054p4"
started_at: "2026-07-17T05:50:00.000Z"
ended_at: "2026-07-17T05:56:00Z"
summary: "P4 (final phase) drain, plan 054 (1 difficulty, harness-itself class; R8 autonomy — all-save, upstream-issue offer deferred to human-present harvest)"
entries:
  - id: DL-001
    kind: difficulty
    description: "harness checks pkg-audit stage WRITES as a side effect — re-stamped .pi/packages.yaml vetting dates during P4's fenced acceptance run; the coder had to detect the out-of-fence mutation and revert it to keep the worktree clean. An audit stage that mutates repo files is a fence hazard for every fenced agent running the ship gate"
    target: harness-itself
    severity: degrading
    workaround: "git status after checks; revert the re-stamp before committing"
    suggested_encoding: "make pkg-audit read-only by default (--write opt-in), or have checks declare mutating stages up front"
    fp: 7c2f91aa04e8
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-17T05:50:00.000Z"
---

# Retro — 054 P4 governance contract (final-phase drain)

Drained at the P4-build-complete → review seam under R8 autonomy: all-save, `kept`.

**Class note**: `harness-itself` in a consumer repo — the encoding is an UPSTREAM issue on AI-Substrate/harness-engineering (pkg-audit read-only default / declared mutating stages), which needs the human-present harvest to authorize. Offer deferred, not dropped.
