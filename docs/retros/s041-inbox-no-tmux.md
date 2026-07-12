# s041 — Inbox without tmux

## Phase 2 — Inbox CLI and ambient registration

- **Window**: 2026-07-12T06:19Z–08:50Z
- **Outcome**: APPROVE after ownership and inbox cold-review loops.
- **Delivered**: pull delivery ownership, ambient Claude/Copilot/Codex
  registration, `pij inbox`, finite/indefinite waits, race-safe receipts, and
  atomic per-envelope receipt-event publication.
- **Proof**: 203 targeted tests; real two-process hard-link race in the Windows
  lane; typecheck, lint, and quick harness inventory green.

### Difficulties

1. Fresh-worktree smoke cannot deterministically pass Pi's folder-trust prompt.
2. Pi-peacock smoke assumes the main checkout path/branch.
3. Happy-path gates missed malformed-batch data loss, uncorrelated receipt loss,
   invalid ambient fallback, and stale-consumer duplicate publication; cold
   review supplied the adversarial cases now encoded as permanent regressions.

### Magic wand

One deterministic adversarial messaging gate that always runs malformed-batch,
unrelated-receipt, invalid-identity, and dual-consumer publication probes before
a messaging phase can be considered review-ready.
