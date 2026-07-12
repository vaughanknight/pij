# s042 report — requirements spine checkpoint

**From**: pij-vital-tiglon · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: research in progress

## claim

The CLI-owned Builder flight plan is active and the pre-interview requirements spine is written. It defines the governing cold-agent acceptance test, role routing, automatic `/thesis`, human preamble, Builder flow, cold validation, wait-for-build-config gate, delegated coder/reviewer fleet, and tmux placement contract.

## artifacts[]

- `docs/plans/042-pij-orchestrator-routing-skill/spine.md`
- `docs/plans/042-pij-orchestrator-routing-skill/the-flow.json`
- `docs/plans/042-pij-orchestrator-routing-skill/the-flow.md`

## shas[]

- `spine.md` — `a026ced9a09c3da9b329193dd1a55b1919b5e5920bb1e628354e26248d95e133`
- `the-flow.json` — `b9fe8ad86672d741fe60199549f7e883b404345432e13c89b0419acecf8b7b39`
- `the-flow.md` — `10d887f266503e11dfd105865431f1a8027b460072f52de28e78e85d18e9fa2a`

## gates[]

- `harness flow --help` — required create/nav/orient/render surface present; harness `0.11.0`.
- `harness flow render --check` — no generated-flow drift before the checkpoint note; subsequent `set-node` regenerated the sibling markdown atomically.
- Trailing-whitespace scan on `spine.md` — clean.

## observations[]

- The new route needs a structural negative assertion: a briefed orchestrator must not settle into "awaiting a work packet" or direct implementation posture.
- Current `pair.md` describes a deliberately cross-model reviewer, while the repo-local fleet default names Copilot `gpt-5.6-sol` for both roles; the interview should establish whether same-model separate-session review is the intended default.

## open[]

- Interview `pij-uec99o` and have it interview its workers, then vendor the material verbatim with SHA-256 provenance.
- Resolve the exact module home and whether placement/default-profile enforcement belongs solely in skill text or also needs a CLI/check affordance.
