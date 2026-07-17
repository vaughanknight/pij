---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s054/pij-grown-up"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-17T03:03:30.352Z"
agent: agent
plan_id: 054-pij-grown-up
schema_version: "1.2"
retro_id: "2026-07-17T03:03:30Z-agent-054p2"
started_at: "2026-07-17T01:59:25.085Z"
ended_at: "2026-07-17T03:04:00Z"
summary: "P2 (node truth) phase-end drain, plan 054 (1 difficulty; R8 autonomy — safe default all-save, routing deferred to a human-present harvest)"
entries:
  - id: DL-001
    kind: difficulty
    description: "release-age-policy.test.ts pwsh ETIMEDOUT flake (7th hit) now fails 'harness boot' verdicts at phase seams — boot composes just test, so a known load-dependent flake outside the s054 fence turns HEALTHY into UNHEALTHY and every gate consumer must re-derive 'it's just the flake' by hand; isolated rerun passes 6/6 every time"
    target: tooling
    severity: degrading
    workaround: "isolated rerun of the file to confirm flake, then proceed with qualified verdict"
    suggested_encoding: "harness owner: raise spawnSync timeout or serialize the pwsh probe; consider a boot flake-quarantine list naming known flaky files so boot reports them as 'known-flaky' instead of red"
    fp: 5d3d48bc5553
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-17T01:59:25.085Z"
---

# Retro — 054 P2 node truth (phase-end drain)

Drained at the P2-build-complete → review-1 seam under R8 autonomy: safe default all-save, entry `kept`, routing deferred to a human-present harvest.

**The one entry is a RECURRENCE escalation**: the release-age-policy pwsh flake (see 2026-07-16 record DL-002/DL-003, same fp family) has now graduated from "full-suite noise" to **polluting `harness boot` verdicts at phase seams** — every boot consumer must hand-re-derive "it's just the flake". Encoding candidates: (a) timeout bump / probe serialization in `harness/scripts/release-age-policy.test.ts` (harness owner, outside s054 fence); (b) a boot flake-quarantine list so known-flaky files report `known-flaky` instead of flipping the verdict red.
