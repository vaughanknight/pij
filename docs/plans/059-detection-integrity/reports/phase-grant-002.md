# Phase grant 002 — watchdog exemption re-arm

**Granted by**: `pij-reasonable-dove` · **Date**: 2026-07-20

## Granted

Implement Plan 059 Phase 2 in the isolated worktree, RED-first:

- durable watchdog exemption expiry/re-arm;
- injected-clock reconciliation;
- text and JSON visibility of expiry/effective state;
- operator/domain documentation;
- persist normalized expiry state before the scheduler can treat the watchdog as active;
- exact self/compact pause non-regression.

No daemon restart now; daemon activation is batched with later stream convergence.

## Required sharp proof

- exemption immediately before, exactly at, and immediately after expiry, value-pinned;
- expiry survives adapter/process restart without extension or reset;
- expired exemption is persisted cleared before any due fire/effective active transition;
- self pause remains explicit-resume only;
- compact pause remains working-transition only;
- reset remains the immediate explicit un-exempt path;
- legacy sidecars degrade honestly and never silently extend safety-off.

## Review posture

One canary-first Terra coder after fd relief. No reviewer spawn. Lead proof plus review-unavailable declaration; Dove performs a deeper compensating pass but is not fully independent and records accept-bias.

## Pending convergence gate

Before batched P2+P3 daemon-facing merge, if fd headroom and Sakana quota recover, obtain one genuine cross-provider independent review of the combined daemon delta. This is a merge-time gate, not a per-phase blocker; unavailable must remain explicit.
