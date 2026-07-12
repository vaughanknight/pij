---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T06:40:48.440Z"
agent: "pij-vital-tiglon"
plan_id: "042-pij-orchestrator-routing-skill"
schema_version: "1.2"
retro_id: "2026-07-12T06:40:48Z-pij-vital-tiglon-e63221c2d4b0"
started_at: "2026-07-12T06:39:29.497Z"
ended_at: "2026-07-12T06:40:48.440Z"
summary: "Machine deployment exposed that the project-local skill-link recipe did not replace an existing symlink-to-directory, leaving Pi pointed at the soon-to-be-removed worktree despite a success message."
entries:
  - id: GFT-001
    kind: gift
    description: "just pij-skill-link uses ln -sf, which followed an existing symlink-to-directory instead of replacing it; the recipe falsely printed the new target while readlink remained on the old worktree"
    target: "justfile pij-skill-link"
    severity: degrading
    workaround: "Repointed with ln -sfn, verified readlink and module presence, then removed the accidental nested skills/pij/pij symlink before worktree cleanup."
    suggested_encoding: "Change ln -sf to ln -sfn and add a readlink assertion so cleanup cannot break the project-local skill"
    fp: "e63221c2d4b0"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:39:29.497Z"
---

# Retro — Plan 042 machine deployment closeout

This main-tree record should ride the o-prime's next governance/metadata commit.
The safe recipe change is `ln -sfn` plus a post-link `readlink` assertion.
