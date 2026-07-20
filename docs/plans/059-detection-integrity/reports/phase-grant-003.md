# Phase grant 003 — requested-vs-unrequested death observability

**Granted by**: `pij-reasonable-dove` · **Date**: 2026-07-20

## Granted now

Implement Plan 059 Phase 3 in the isolated worktree, RED-first:

- persist durable close intent before every pij-owned teardown;
- classify observed descriptor absence as requested vs `unrequested-by-pij` from evidence only;
- detect daemon-bound death, registered Pi death, and descriptor-free pre-registration no-show;
- persist every launch expectation before launch and consume/correlate it on registration/bind;
- timestamp terminal disposition and last-seen evidence;
- render live vs boot-reconciled historical notices and suppress duplicates across ticks/restart;
- represent unavailable observations as `unavailable(reason)` rather than inventing cause.

`unrequested-by-pij` means absence of a persisted pij close intent; it is never a crash/cause/human-intent claim.

## Held

- no daemon restart or live destructive canary now;
- activation task 3.7 is convergence/merge-time only under a C6 baton;
- before combined P2+P3 lands on main, attempt one genuine cross-provider independent review if fd/quota recover; unavailable remains explicit.

## Proof standard

Extra-sharp value-pinned tests for persist-before-teardown, requested/unrequested/unavailable matrices, per-harness/no-descriptor cases, live-vs-historical wording, once-only delivery across restart, expectation cleanup/correlation, replacement non-terminality, and landed detector regressions. Lead reversible mutations are required. Dove provides an accept-biased compensating pass; this is not independent review.
