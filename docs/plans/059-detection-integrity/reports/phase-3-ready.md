# Phase 3 ready — request-aware death observability

- **Status**: WHOLE and lead-accepted; awaiting Dove compensating keystone pass.
- **Candidate content hash**: `6cc07dcfc3546182afd3d1e52bf19c04b248775f550344446c41a6955533a560`.
- **Runtime**: no daemon restart, live teardown/no-show probe, tmux mutation, commit, or merge.

## Outcome

- Durable spawn expectations, stamped before every Pi/control/agent/focus peer launch, with a named five-minute registration deadline and post-launch pane/session correlation.
- Durable close intent before standalone, in-process, and once-mode teardown; successful teardown records requested terminal evidence before dissolve.
- One cross-harness reconciler for registered Pi/Claude/Copilot/Codex PID absence and descriptor-free expectation no-show.
- Evidence distinguishes `pid-missing`, `pane-missing`, `expectation-expired`, and `observation-unavailable`.
- `unrequested-by-pij` means only observed/expired absence without close intent; it never asserts cause.
- First daemon sweep renders historical boot reconciliation; later sweeps render live observation; observation/last-seen times persist.
- Spawn-id correlation prevents descriptor/expectation double alerts; persisted terminal/latch suppresses ordinary tick/restart duplicates.
- Pi replacement shutdown reasons dissolve without false terminal evidence; quit remains for daemon observation.
- State/list projections expose complete terminal evidence.

## Proof

- RED: 7 failed / 388 passed in the final hardening matrix.
- Focused GREEN: 395/395.
- Landed detector regressions: daemon-push/anomalies/channel 61/61.
- Lead mutations RED→restore GREEN: expiry evidence relabel; spawn-id correlation removal; historical flag inversion; requested terminal removal.
- Lead full suite: 3,078 passed / 1 unchanged channel cleanup-hook timeout / 11 skipped. Exact case passed immediately on candidate and clean `fb1bfbd` (`reports/channel-cleanup-flake-{candidate,clean-base}.log`).
- Final `harness checks --quick`: all seven runnable sensors PASS; smoke intentionally held.
- Typecheck, lint, `git diff --check`: PASS.

## Declared review point

The notice latch is persisted before channel delivery, choosing ordinary/restart **at-most-once** behavior. This prevents duplicates but can lose a notice if delivery fails after the latch write. Terminal evidence remains durable and visible. Dove must explicitly accept or require a delivery-state refinement; no stronger exactly-once claim is made.

## Held convergence gates

- genuine cross-provider independent review of combined P2+P3 if fd/quota recover;
- C6 daemon restart baton and live canaries (task 3.7);
- commit/merge.
