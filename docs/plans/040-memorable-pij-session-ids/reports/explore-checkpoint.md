# s040 report - explore checkpoint
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: explore -> planning

**claim**: Research-only explore pass completed inside the granted fence. The dossier recommends preserving immutable machine `pijId` values and adding a persisted, collision-owned memorable alias.

**artifacts[]**:
- `docs/plans/040-memorable-pij-session-ids/original-ask.md`
- `docs/plans/040-memorable-pij-session-ids/research-dossier.md`
- `docs/plans/040-memorable-pij-session-ids/the-flow.json`
- `docs/plans/040-memorable-pij-session-ids/the-flow.md`

**shas[]**:
- `original-ask.md` - `86d3ca389debc932b89135d4f8eeeb9feacbecbaffa30e5e7c8ded45dd6ef842`
- `research-dossier.md` - `c438c6051179874d2c5a16aff729a54e77a3d7eb8622b4fb231c96d32546894a`

**gates[]**:
- o-prime canary PASS: GPT-5.6 Sol footer-probed; unpinned effort reported honestly.
- `harness boot` PASS: typecheck + full vitest readiness proof.
- Dossier contract PASS: required `Answer`, `Evidence`, and `Planning Handoff` sections present.
- Fence PASS: no product/dependency edits after the research-only brief; the pre-brief PoC remains unstaged and attributed to this stream.

**observations[]**:
- OBS-1: `pijId` is a storage, environment, wire, telemetry, and ownership key, not merely display text.
- OBS-2: the two-word PoC has 426,710 combinations; collision ownership is mandatory.
- OBS-3: deriving an alias from the stable machine id avoids harness-specific and post-bind rename paths.

**open[]**:
- O-1: `displayName` versus `alias` terminology.
- O-2: two words plus deterministic collision suffix versus a larger three-word space.
- O-3: exact-pinned package versus vendored curated corpus.
- O-4: whether telemetry JSON carries the optional alias.
- O-5: lazy alias allocation policy for existing durable descriptors.
