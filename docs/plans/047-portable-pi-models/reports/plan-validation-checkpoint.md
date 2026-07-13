# Plan and validation checkpoint — s047

**State**: `WAITING_FOR_BUILD_CONFIG`
**Stream**: `pij-conservative-horse`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
**Branch / base**: `s047/portable-pi-models` @ `3b1a47beaed0455611e443ae8e2827cfb1aa460d`

## Claim

Builder research and unified planning are complete. The Simple/CS-3 plan is **READY** and cold validation is **VALIDATED**. No implementation, product/config edit, fleet spawn, global model sync, or main-checkout write has occurred.

## Locked human choices

- Models are repo-managed; auth and general skills remain out.
- Exclude the machine-specific `local` provider from the repo source.
- Testing: Lightweight.
- Mock policy: fixture and real temporary filesystem operations only.
- Documentation: operational sources; no README expansion.

## Artifacts and hashes

| Artifact | SHA-256 |
|----------|---------|
| `research-dossier.md` | `1f592f9a3b809a9379b41996c9dc5df7b89c4998272b5b3cab586f54cd1b261b` |
| `portable-pi-models-plan.md` | `b73901384ea9798f4dc912cb8636659426b4af086ec6bd0a06e1095a45988571` |
| `validations/portable-pi-models-plan-validation.md` | `9c3b1c9b9b6e25352600474a09504afdbf50d82a86f3cb9d6f8941fd92a2d157` |
| `the-flow.json` | `5a7d19c2bbaea617a128eeb7e0553c500519dbf2bd6b71ada8f92cc1851a758f` |
| `the-flow.md` | `987a8c47b0cdb2951426ec19b5ff22f9b3c96fc94d5b8328d094574a19cb0683` |

## Gates

- Worktree `harness boot`: typecheck ✅, tests ✅.
- Plan deterministic structure: 10 required sections, G1–G7 present, 8/8 ACs covered, 6 tasks, 2 registered domains.
- Task paths: all represented in the Domain Manifest.
- Flow render check: no drift.
- Flow position: `phase-1`, mode `Simple`, next `review-1`; implementation not started.
- Main porcelain-status SHA-256 remained `25a4b5b363e5c665afae85a8aac9f675d0753ac6ccf7a81b9acf32070b52916a` before and after planning.

## Plan result

One phase owns:

1. tests for managed-provider replacement, local/unknown preservation, malformed no-write, atomic/idempotent persistence, and source boundary;
2. `.pi/models.json` plus a tested `sync-models` helper with `--source`/`--target` seams;
3. `just sync-models` wiring into `install` and `update-pi`;
4. operational documentation updates;
5. canonical gates and boundary diff proof.

The central invariant is provider-boundary ownership: repo providers are exact replacements; every non-managed provider remains machine-local.

## Observations

- The existing bootstrap completeness claim omitted a functional input to both Pi and pij model discovery.
- A direct `cp` would satisfy fresh install but destroy the very local-provider boundary the human ruled out; deterministic provider-key merging is required.
- `pi-doctor` expansion remains explicitly outside this item.

## Open / next gate

- Build configuration requires explicit human confirmation before any fleet creation.
- Default profile from stream doctrine, not yet confirmed: coder `github-copilot/gpt-5.6-sol @ xhigh`; reviewer `github-copilot/gpt-5.6-sol @ xhigh`.
- No fleet has been spawned.
