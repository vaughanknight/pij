# Stream brief — s047-portable-pi-models
**From**: pij-primary-carp · **Date**: 2026-07-12T22:00:00Z · **Lifecycle**: adopted, provisional

## Structure tree

```text
human (Jordan)
└─ o-prime pij-primary-carp
   ├─ s041 inbox · identity guard / next ship
   ├─ s045 effort advertisement · building
   ├─ s046 real trees · disjoint tranche building
   └─ this stream pij-conservative-horse · adopted Pi research peer
```

## Work item

- **Plan folder**: `docs/plans/047-portable-pi-models/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
- **Branch**: `s047/portable-pi-models`
- **Base**: `origin/main` at `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
- **Landing**: `/builder 8 ship`
- **Human source**: direct survey/rulings in `pij-conservative-horse`

## Mission and boundaries

Research and plan repo-managed Pi model portability:

- version a portable source derived from `~/.pi/agent/models.json`;
- include curated Copilot overrides/custom entries, Sakana, and OpenRouter;
- explicitly exclude the machine-specific `local` provider;
- install/sync it through the repo bootstrap;
- preserve secrets separation.

Out of scope unless separately ruled:

- `auth.json`;
- general skills and shared skill-lock state;
- sessions/history/trust/cache/runtime files;
- personal non-package settings defaults;
- broad `pi-doctor` expansion.

## Worktree-pivot rule

The adopted Pi process remains main-rooted. Main is read-only. Every repository
command/path and any future fleet spawn explicitly targets the s047 worktree.
Never run `npm link` from this worktree.

## Fences

- Owns: `docs/plans/047-portable-pi-models/**`
- Scratch: `.harness/temp/s047/**`
- Product/config/install/docs/government: read-only during planning
- Derive an exact manifest and sequence any justfile/install/pi-doctor overlap.

## Journey

Invoke `/pij prime`, read live local orient and this brief, persist thesis/preamble
checkpoint, run `/builder` research+plan+cold validation, then STOP at
`WAITING_FOR_BUILD_CONFIG`.

**Ack**: `brief-ack s047` + discrepancies.
