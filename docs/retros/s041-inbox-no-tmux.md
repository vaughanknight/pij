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

## Phase 3 — Push-path convergence and guidance

- **Window**: 2026-07-12T10:40Z–21:09Z
- **Outcome**: APPROVE after one cold-review fix cycle and live T012 proof.
- **Delivered**: tmux/pi durable read markers, immutable retained envelopes,
  event-before-marker receipt handling, exact push/pull guidance, and refreshed
  operator/domain contracts.
- **Proof**: 1,850 tests; independent marker and guidance mutations; typecheck,
  lint, skill, Windows, and quick harness gates green; genuine no-tmux
  Copilot Terra/medium round-trip with one envelope, one marker, atomic receipt
  event, and terminal sender wait.

### Difficulties

1. Focused pre-review tests missed a stale reverse-dependency assertion; the full
   suite caught it during cold review.
2. Bare `pij` is intentionally npm-linked to main, so pre-merge worktree live
   proof needs `just pij` or an isolated PATH shim rather than repointing the
   machine-wide link.
3. The full harness inventory still stops at Pi's folder-trust prompt; R-004
   keeps this shared smoke debt non-blocking and outside s041 scope.

### Magic wand

Make the pre-review gate run the full repository test suite automatically before
dispatching a cold reviewer, so changed daemon contracts cannot leave a reverse
dependency red until review.
