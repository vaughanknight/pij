VERDICT: FINDINGS (2)

## HIGH — a once-record proves the event survived, not that the project state survived

**Evidence:** `.pi/extensions/pij/core/platform/journal.ts:123-152`, `.pi/extensions/pij/adapters/spine-store.ts:107-137`, `.pi/extensions/pij/adapters/atomic-file.ts:60-67`, `.pi/extensions/pij/adapters/project-store.ts:45-60`

`resolveCommitted` accepts `hasOnce(opId)` after the persisted project fails the `state === next` check, replays the existing event, and clears the journal. That closes the cycle-3 no-once forge, but it conflates two crash images: “clear removal was lost after later state movement” and “the once-file survived while the earlier project publish did not.” They are both possible because project publication and once-file publication are separate directory entries and both use explicitly best-effort directory fsync. Atomic link/rename prevents torn files; it does not make the earlier project rename durable whenever the later spine link is durable.

A real-fs probe planted the exact latter image for both coupled verbs: journal the op, mark it committed, publish its once-event, but leave the set projection at A (and leave the create slug absent). `recoverPendingOps` returned `ok({replayed:1})`, cleared the only recovery record, and left an A→B `project-set` event over state A; the create variant left a `project-created Beta` event while `projects/beta` remained absent. The four-way corroboration matrix was: state=prev/no-once blocks; state=next/no-once replays; state=next/once replays existing; **state=prev/once also succeeds and clears**. The last branch permanently blesses the inconsistent state/event pair and lets later writes proceed.

**Smallest safe fix:** for a coupled op, an existing once-record must not override a persisted-state mismatch; block and retain the journal. If automatic moved-on recovery is required, add durable state-side operation identity/version evidence that distinguishes a genuine successor from projection loss. Keep once-only corroboration for drafts with no coupled state.

## MED — verb-side `clear()` failures are still swallowed, creating a silent next-write outage

**Evidence:** `.pi/extensions/pij/core/cli.ts:1533-1543`, `.pi/extensions/pij/core/cli.ts:1568-1575`, `.pi/extensions/pij/core/cli.ts:1633-1637`, `.pi/extensions/pij/core/cli.ts:1653-1655`, `.pi/extensions/pij/core/platform/ports.ts:77-84`

The new `Result<void>` is handled correctly inside recovery, but all four verb-side call sites discard it. The success-path ruling is not sound for a persistent filesystem failure: a probe used an otherwise-normal journal whose `clear` always returned `E-NOREG`. `project set` committed state and its once-event, returned exit 0 with no warning, and left the entry pending; the immediately following `spine append` returned exit 3 because recovery resolved the existing event but could not clear it. The entry remains adjudicable, so the cycle-3 audit-corruption trace is closed, but the successful command still silently plants a machine-wide write outage known at return time. The claim that reporting the cleanup fault would describe an outage that does not exist is therefore false for permission/I/O failures that persist.

**Smallest fix:** inspect every verb-side clear result. After a landed state+event, return an honest nonzero “write landed, journal cleanup failed; further writes are blocked” result naming the cleanup error. On abort paths, retain the primary error but include the failed cleanup/residual-journal diagnostic rather than discarding it.

## Cycle-3 re-attack and whole-of-P1 status

- H1's original marker-written/state-lost **without** a once-file is closed: recovery blocks without appending or clearing. The once-survived crash window above means H1 is not root-cause complete.
- H2 is root-cause closed: malformed/invalid op-shaped JSON makes `pending()` fail with a path-naming `E-NOREG`; the real-fs create probe mutates nothing and leaves the record for the operator.
- M3's recovery-side poison-pill trace is closed: a failed recovery clear blocks before successor mutation. The verb-side tolerance ruling is rejected for the persistent-failure trace above.
- M4 is root-cause closed: null-prototype canonical accumulators preserve top-level, `created`, and unknown-nested own `__proto__` keys.
- M5 is root-cause closed: fake nested and `fork()` same-home acquisitions match the fs lock's non-reentrant/machine-wide verdict, and both release after a throw.

Whole-of-P1 approval cannot be attested: 14 of the 16 prior findings are root-cause complete; review-003 H1 and M3 remain open in the two forms above.

Mandated gates: targeted platform/adapters/CLI suite 715 passed, 1 skipped; `just typecheck` passed.
