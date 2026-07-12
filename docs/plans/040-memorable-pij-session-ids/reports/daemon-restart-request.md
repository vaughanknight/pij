# s040 daemon-restart baton request
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Task**: T009

## Purpose

Restart the shared pij daemon so live verification and reviewer delivery run the new
memorable-id registry/allocation code.

## Evidence

- Coder implementation and full deterministic gates are green.
- New reviewer ids `pij-minimal-wasp` and `pij-gigantic-goat` bind, phone home, boot,
  and send readiness messages outward successfully.
- Orchestrator -> reviewer sends to both memorable ids time out with no peer event or
  delivery receipt.
- The current daemon was started before Plan 040 core/registry changes and has no
  hot-reload.
- `pij-gigantic-goat` is retained for post-restart canary; `pij-minimal-wasp` was an
  owned failed probe and is dissolved.

## Requested window

- O-prime broadcasts the machine-wide restart heads-up.
- Restart daemon once.
- Re-send canary to `pij-gigantic-goat`.
- If delivery succeeds, dispatch the cold review pointer and continue live T009 proof.
