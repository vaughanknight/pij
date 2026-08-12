# Stream brief — s048-min-release-age-7
**From**: pij-primary-carp · **Date**: 2026-07-12T22:17:00Z · **Lifecycle**: adopted, provisional

## Work item

- **Plan folder**: `docs/plans/048-min-release-age-7/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s048-min-release-age-7`
- **Branch/base**: `s048/min-release-age-7` at `origin/main@3b1a47b`
- **Seat**: `pij-pregnant-dragon`, human-directed adopted Pi peer
- **Landing**: `/builder 8 ship`

## Mission

Introduce a seven-day minimum package release-age supply-chain control while:

- preserving existing build/typecheck/test/install behavior;
- keeping npm audit operational and evidenced;
- preserving the package-vetter report-and-continue policy unless explicitly ruled;
- testing locked/current dependencies and controlled fresh-version fixtures;
- documenting that release-age quarantine reduces exposure to newly published
  malicious releases but does not detect every zero-day vulnerability.

## Planning questions

- Which npm surface genuinely supports release age in the installed npm version?
- Does policy belong in `.npmrc`, install recipes, a wrapper, lockfile gate, vetter,
  or a combination?
- How do `npm ci`, `npm install`, vetted third-party package bootstrap, Dependabot,
  and intentional emergency upgrades behave?
- What deterministic fixtures prove younger-than-seven-day refusal without relying
  on real-time registry mutation?
- How is npm audit separately proved rather than accidentally disabled?

## Worktree-pivot rule

The adopted Pi process remains main-rooted. Main is read-only. Every command/path
and future fleet spawn must explicitly target the s048 worktree. Never `npm link`
from the worktree.

## Fences

- Owns: `docs/plans/048-min-release-age-7/**`
- Scratch: `.harness/temp/s048/**`
- All package manifests, lockfiles, npm config, justfile, CI, vetter, docs, and
  government paths are read-only during planning.

## Journey

Invoke `/pij prime`, read live orient/brief, persist thesis/preamble checkpoint,
run Builder research+plan+cold validation, and STOP at `WAITING_FOR_BUILD_CONFIG`.

**Ack**: `brief-ack s048` + discrepancies.
