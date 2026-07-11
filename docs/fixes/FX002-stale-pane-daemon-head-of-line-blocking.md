# Fix FX002: Stale pane causes daemon-wide delivery head-of-line blocking

**Created**: 2026-07-11
**Status**: Complete — targeted + pij suite + live regression + full repository gate pass
**Plan**: Standalone live-incident fix
**Source**: SecondCrack peer-delivery incident (`pij-uec99o` → `pij-vsa9qj`) plus the candidate follow-up recorded in FX001
**Domain(s)**: pij-control-plane (`daemon.ts`, `adapters/daemon-tmux.ts`)

---

## Problem

A message addressed to a bound control-plane descriptor whose tmux pane no longer
exists makes `tmux send-keys` throw from `DaemonTmux.sendText`. The exception
escapes `Daemon.tick()`. The interval-level catch logs it, but the inbox file is
left in place, so every 600 ms tick retries the same stale target and aborts
before unrelated live peers are processed.

Observed impact:

- sends to healthy, correctly bound peers returned `queued: awaiting daemon
  delivery confirmation` but never arrived;
- the daemon stayed alive and `pij state` continued to report peers as active;
- renaming the live tmux windows happened near the failure but was unrelated —
  routing uses stable pane IDs, and the affected live target remained correctly
  bound to `%39`;
- daemon output repeated `can't find pane: %902` for the same old message;
- force-closing that descriptor exposed another stale pane (`%828`), proving the
  issue was daemon-wide head-of-line blocking rather than one bad binding.

Immediate operator recovery was `pij close <stale-id> --force`, but pruning stale
descriptors one by one is not an acceptable delivery invariant.

## Fix

Two defensive layers:

1. **Non-throwing tmux send boundary.** `DaemonTmux.sendText` catches pane
   disappearance/races and returns the existing `unverified` outcome. The daemon
   consumes the message and emits an honest unverified receipt instead of retrying
   the same impossible send forever.
2. **Per-session tick isolation.** Both pending-session drive and bound-session
   processing catch/log failures per descriptor. A future adapter or registry
   exception in one peer cannot prevent other peers from being processed in the
   same tick.

No protocol or type expansion was needed: `SendOutcome = confirmed | unverified`
already models the failed-confirmation case.

## Deterministic Proof

- Adapter regression: a tmux runner that throws `can't find pane` returns
  `unverified` instead of throwing.
- Daemon regression: a stale target's injected `sendText` failure is logged while
  a later live target is still injected and drained in the same tick.
- Existing unverified-receipt test proves the sender receives the honest outcome.
- Full pij extension suite exercises daemon, CLI, control-plane, and receipt paths.

## Acceptance

- [x] Missing-pane send does not escape `DaemonTmux.sendText`.
- [x] One descriptor failure cannot abort unrelated session processing.
- [x] Targeted tests were RED before implementation and green after it.
- [x] Full pij extension suite green: 70 files passed, 2 skipped; 1,034 tests passed, 6 skipped.
- [x] Live daemon restarted from the linked checkout and drained the stale backlog.
- [x] Live canary to `pij-uec99o` arrived and the peer replied `received`.
- [x] Full `harness checks` repository gate green (typecheck, lint, test, smoke, package audit, snapshots).

## Residual Follow-up

This fix restores delivery progress and honest receipts; it does not by itself
remove old descriptors or redefine liveness when a PID survives/reuses while its
pane is gone. Automatic stale-descriptor lifecycle cleanup remains a separate
control-plane concern. It can no longer globally wedge message delivery.
