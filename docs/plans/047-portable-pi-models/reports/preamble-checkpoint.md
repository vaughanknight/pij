# Preamble checkpoint — s047 portable Pi models

**Status**: ORIENTED — planning authorized after this checkpoint
**Stream**: `pij-conservative-horse`
**Upstream**: `pij-primary-carp`

## Thesis

**Thesis** — Make pij’s deliberately curated, portable Pi model catalog reproducible from the repository so a fresh machine receives the same model-discovery and spawn behavior without copying private or host-specific state.

**Now** — The authoritative catalog exists only at `~/.pi/agent/models.json`, while `just install` and `just update-pi` synchronize other global Pi configuration but omit models entirely.

**Toward** — A versioned portable catalog containing the current Copilot overrides/custom entries, Sakana, and OpenRouter definitions is installed through the existing bootstrap/refresh seams and proven by deterministic checks.

**Keep** — Preserve strict separation: exclude `auth.json`, general skills, personal settings, runtime/history state, and the LAN-specific `local` provider; do not broaden `pi-doctor` without a ruling.

> **My read:** Right means a clone plus the canonical pij bootstrap reproduces the shared model catalog exactly while leaving secrets and machine-local endpoints entirely local. The change should extend the existing copy-and-verify pattern rather than introduce a second configuration framework.

## Orient proof

Read and accepted:

- `/Users/jordanknight/pi-hacking/pij/.pi/skills/pij/references/prime/orient-global.md`
- `/Users/jordanknight/pi-hacking/pij/government/orient-local.md` (live main government root)
- `/Users/jordanknight/pi-hacking/pij/government/briefs/s047-brief.md`
- `/Users/jordanknight/pi-hacking/pij/.pi/skills/pij/references/prime/orchestrator.md`
- `/Users/jordanknight/pi-hacking/pij/docs/how/pij.md`
- worktree `AGENTS.md` via inherited project context
- `docs/plans/047-portable-pi-models/original-ask.md`
- `~/.pi/agent/models.json`
- worktree `justfile`

The o-prime confirmed that the pre-existing untracked plan folder and `original-ask.md` were seeded intentionally.

## Worktree command discipline

- Adopted Pi process remains rooted at main; main is read-only.
- Every repository read and command has used an absolute worktree path or `git -C /Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`.
- All s047 writes are confined to `docs/plans/047-portable-pi-models/**` in the assigned worktree.
- `npm link` is forbidden from the worktree.
- No peers or fleets were spawned before this checkpoint.

## Base proof

- Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
- Branch: `s047/portable-pi-models`
- Worktree HEAD: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
- `origin/main`: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
- Base matches the brief exactly.

## Zero-main-write proof

Immediately before this checkpoint write:

- Main HEAD: `3c64977b69ce667fc4336e67135a2d52cf05af20`
- Main porcelain-status SHA-256: `25a4b5b363e5c665afae85a8aac9f675d0753ac6ccf7a81b9acf32070b52916a`
- This session made no write to the main checkout; pre-existing main changes remain owned by other work.

## Evidence hashes

- `original-ask.md`: `b566f71fc66131ea436e14dcfa7636c0f25b71481b0193cdb7a8c86f9ac7668b`
- source `~/.pi/agent/models.json`: `974b5a2a16e576b6d664e910fd83b6f6cfe4ca32abbe4aa5f0f231f606740c4e`
- worktree `justfile`: `843856c1e6072762c5d485e5a96a54856b9173ce71fbfa77ca5840cd0cc7676f`

## Report contract

- **claim**: Thesis, role, fences, base, and main-read-only discipline are established; Builder research may begin.
- **artifacts**: `docs/plans/047-portable-pi-models/original-ask.md`, `docs/plans/047-portable-pi-models/reports/preamble-checkpoint.md`
- **gates**: branch/base equality; explicit-path command audit; zero-main-write status fingerprint.
- **observations**: the current bootstrap claims fresh-machine completeness while omitting the model catalog; this is the target portability seam.
- **open**: exact catalog install/verification mechanism and tests remain Builder research questions; implementation is not authorized.
