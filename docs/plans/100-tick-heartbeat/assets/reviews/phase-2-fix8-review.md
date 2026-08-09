# Phase 2 fix8 re-review - cc4265fb

**Verdict: REQUEST_CHANGES**

The post-merge `harnessSessionId` equality conjunct fixes the hot-legacy
re-adoption P1. It preserves the necessary `undefined -> undefined` legacy
update and correctly rejects a known-native-id replacement before it reaches
the predicate.

## P1 - the source still states two falsified guaranteed-repair arguments

The requested correction is not complete. `FsRegistry.publish()` still says
that terminal-to-terminal writes are daemon-latched transitions, therefore the
daemon is running and will re-stamp within one 600 ms tick
(`adapters/fs-registry.ts`, the `THE PREDICATE IS DELIBERATELY BLIND...`
comment). That is the exact premise falsified last round by
`executeAgentReport()`'s stopped-daemon failed-to-failed write. The overlay
test comment was corrected, but the production-source comment was not.

The newly disclosed pending-to-bound case repeats the same error. Both the
source and the criterion claim its drop “genuinely does self-heal” because the
daemon made the write, hence a tick is “by construction <=600ms away”
(`adapters/fs-registry.ts`, `KNOWN OVER-DROP`; and
`fs-registry.overlay.test.ts`, `P1i DISCLOSED OVER-DROP`). In reality:

1. `Daemon.tick()` writes the heartbeat at its beginning, before it drives and
   binds pending sessions (`daemon.ts`).
2. The bind removes that just-written map entry.
3. `runDaemon()` only schedules a later `setInterval`; it does not make a
   further tick durable or inevitable. A daemon stop/crash after this tick
   leaves the same-incarnation bound seat unverified until a daemon later runs.

This is a conservative over-drop, so the behavior can remain an accepted
price. But it is not a guaranteed <=600ms repair. Remove both source claims,
rename the criterion to a conditional later-heartbeat assertion, and state the
actual price just as the terminal-to-terminal case now does. The direct
instruction to leave no repair claim anywhere is presently false.

## Confirmed

- `sameLiveIncarnation` is evaluated after `applyWriteLaw`, so it compares the
  persisted descriptor rather than a raw proposal. `harnessSessionId` is
  currently uncontested; the stated future-owner rationale is therefore sound.
- The legacy keep-negative is real: a hot no-lifecycle/no-native-id descriptor
  updated to the same shape compares `undefined === undefined` and retains its
  stamp.
- A known `sid X -> sid Y` cannot reach the conjunct. The by-pij owner record
  in `claimDescriptorIdentity()` rejects the second native tuple; the boundary
  criterion verifies both descriptor and heartbeat remain unchanged.
- `buildRevivedDescriptor()` retains `harnessSessionId` in its `...durable`
  spread and copies it separately to `plannedHarnessSessionId`; it does not
  demote the original. Revive remains safe because its own transition drop
  runs.

## Independent mutation evidence

Every run used mandatory `--expect` against the subprocess-free overlay spec.

| Reviewer mutation | Required criterion | Result |
| --- | --- | --- |
| Replace the session-id equality with `true` | `P1i: re-adopting a hot LEGACY descriptor to a new native session drops the stamp` | Killed; the legacy re-adoption and disclosed spawn-bind criteria failed. |
| Require the prior session id to be defined before equality | `P1i KEEP: a legacy -> legacy state update keeps its stamp` | Killed; the legacy keep-negative failed (with three independent existing keep criteria). |

The focused overlay suite passes: 44 tests.
