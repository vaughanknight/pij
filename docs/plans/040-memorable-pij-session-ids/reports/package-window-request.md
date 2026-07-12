# s040 package-manifest window request
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Task**: T005

## Request

Grant s040 the explicit `package.json` + `package-lock.json` write window for T005.

## Preconditions proved

- s039 is closed and its dependency rewrite is landed.
- Both files are byte-clean in the current s040 worktree.
- The removed PoC source/script/recipe remain absent.
- Plan 040 is READY and VALIDATED WITH FIXES.
- The coder packet will exact-pin `unique-names-generator@4.7.1`; no other dependency change is allowed.
- Commits remain git-index-baton and pathspec gated.
