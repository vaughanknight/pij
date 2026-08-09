---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s082/chore-field-fixes"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-02T03:46:29.427Z"
agent: "pij-ripe-pike"
plan_id: "076-pij-chore-primitive"
schema_version: "1.2"
retro_id: "2026-08-02T03:46:29Z-pij-ripe-pike-585a81919635"
started_at: "2026-08-02T02:38:17Z"
ended_at: "2026-08-02T03:46:29Z"
summary: "Hardened pij chore against field failures found by primes and PAs: relayable sampled values, validated seat identity, rollback-safe state, flap and instrument-change semantics, shared-roster guidance, atomic updates, creator attribution, and CLI-driven regression proof."
entries:
  - id: DL-001
    kind: difficulty
    description: "CLI-linked canonical checkout can expose an uncommitted feature branch machine-wide; field fixes must run from an isolated worktree while the canonical checkout stays on main."
    target: tooling
    severity: blocking
    workaround: "Moved the exact uncommitted patch into the dedicated worktree, reversed only those changes in the canonical checkout, and verified canonical remained clean on main."
    suggested_encoding: "Add a deterministic guard that refuses CLI development from the globally linked canonical checkout when it is not on main."
    fp: "585a81919635"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-08-02T03:01:36.542Z"
  - id: INS-001
    kind: insight
    description: "Forward chore-state fields must remain additive and preserve legacy fingerprint field meanings so an older CLI can read state after rollback."
    target: project
    suggested_encoding: "Keep rollback-compatibility drive tests that write future fields and assert list/run/ack remain usable."
    fp: "15ec87a44417"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-02T03:01:40.514Z"
---

# Retro — plan 076 chore field fixes

The field rollout turned six initial defects into a broader compatibility and identity
hardening pass. The key lesson was to preserve old on-disk meanings while adding richer
metadata, so upgrading and rolling back cannot brick a seat's durable chore state.
