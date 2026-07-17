---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s054/pij-grown-up"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-16T13:50:27.593Z"
agent: agent
plan_id: 054-pij-grown-up
schema_version: "1.2"
retro_id: "2026-07-16T13:50:27Z-agent-054p1"
started_at: "2026-07-16T09:36:44.377Z"
ended_at: "2026-07-16T13:50:27Z"
summary: "P1 phase-end drain, plan 054 (3 difficulties; R8 overnight autonomy — safe default all-save, human asleep; routing deferred to a human-present harvest)"
entries:
  - id: DL-001
    kind: difficulty
    description: "s054 worktree handed over without npm ci; plain 'npm ci' fails on npm 11.10 (min-release-age=7 in .npmrc derives a 'before' date that collides) — sanctioned form is 'npm ci --min-release-age=null' per justfile:45; pre-spawn gate docs should name the exact command"
    target: doc
    severity: degrading
    workaround: "read justfile:45 to find the sanctioned flag"
    suggested_encoding: "name 'npm ci --min-release-age=null' verbatim in the worktree pre-spawn gate docs"
    fp: a4eb6ab9070d
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-16T09:36:44.377Z"
  - id: DL-002
    kind: difficulty
    description: "release-age-policy.test.ts pwsh probe flakes ETIMEDOUT under full-suite parallel load on a busy machine (passes isolated in 477ms) — candidate: raise spawnSync timeout or serialize the pwsh probe"
    target: tooling
    severity: annoying
    workaround: "re-ran isolated to confirm pass"
    suggested_encoding: "raise spawnSync timeout or serialize the pwsh probe in harness/scripts/release-age-policy.test.ts"
    fp: 00351ecf3acb
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-16T09:47:59.689Z"
  - id: DL-003
    kind: difficulty
    description: "Full-suite flake outside s054 fence: harness/scripts/release-age-policy.test.ts 'restores the Windows caller environment' times out (~15s) under parallel full-suite load, passes isolated — harness owner should bump timeout or serialize; hit during 054 P1 gate runs. RECURRENCE of DL-002 (second independent hit: coder gate run + orchestrator verification)"
    target: tooling
    severity: annoying
    workaround: "coder verified isolated pass; orchestrator gate run happened not to hit it"
    suggested_encoding: "same as DL-002 — timeout bump or serialization; recurrence makes this the priority entry"
    fp: f4bb72f83bf7
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-16T13:49:34.690Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 054 P1 platform store (phase-end drain)

Drained at the P1→review-1 seam under R8 overnight autonomy: safe default all-save, every entry `kept`, routing deferred to a human-present harvest.

**Highest-value cluster**: the release-age-policy pwsh-probe flake (DL-002 + DL-003) — two independent hits in one day (coder full-suite gate, orchestrator verification). Encoding: timeout bump or probe serialization in `harness/scripts/release-age-policy.test.ts`. Outside the s054 fence — belongs to the harness/scripts owner.

DL-001 is a docs fix: name `npm ci --min-release-age=null` verbatim wherever worktree pre-spawn setup is documented.
