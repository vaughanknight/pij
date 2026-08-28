# Item-24 PR — build and gate evidence

Base: origin/main f9e9b1f  ·  PR branch: s392/item-24-pr  ·  head: 9af79ae1374440072c5e09881b994ff7ff8ee110
Worktree: fresh-from-main (E35); node_modules symlinked (lock IDENTICAL). Raw run logs: scratchpad item24-pr (repo ignores *.log; tallies are the kept evidence).

## Cherry-pick chain (9 item-24 code commits onto fresh main) — ALL CLEAN, no conflicts
  9af79ae fix(telegram): close durable log advisories
  d1179ba fix(telegram): harden durable bridge logging
  f89d35b fix(telegram): persist in-process bridge logs
  34519b9 test(telegram): pin transient send recovery
  5584a05 fix(telegram): hash complete bubble plans
  7131fe8 fix(telegram): unify idempotent text partitions
  45881e3 test(pij): harden telegram partition drift guards
  810df11 fix(pij): guard telegram part skips by partition
  dac3499 fix(pij): make telegram chunk forwarding idempotent

The anticipated daemon.ts/daemon.test.ts 29b-overlap conflicts did NOT materialise; typecheck confirms the merge is semantically sound on the 29b-bearing base.

## Contents
- bubblesHash transient-send-recovery (a27ab58..d42fc5b): retry mitigates a brief attempt-1 failure, single-bubble, logged, idempotent.
- log-sink 65560901: in-process bridge writes telegram-bridge.log (makes the human-channel diagnostic real).
- hardening 66d0acd: B1 crash-guard (baseLog-first + try/catch + report-once) + B2 production-path sensor (T-LOG1-SUP) + W3 capture tail.
- C1/C2/C3 close-out 1408076: B2 fully closed (supervisor own-log sensored), once-per-outage latch, discriminating W3 oracle.

## Gates
- typecheck: tsc --noEmit -> 0 errors
- biome: 7 changed .ts files -> clean
- GREEN RUN 1: Test Files 172 passed | 2 skipped; Tests 4140 passed | 15 skipped, 0 failed
- GREEN RUN 2: Test Files 172 passed | 2 skipped; Tests 4140 passed | 15 skipped, 0 failed

## Cold reviews + mutant gates (all RUN authoritatively by orchestrator)
- log-sink: CONDITIONAL->APPROVE (reviews/item-24-log-sink-verdict.md); hardening APPROVE (reviews/item-24-log-sink-hardening-verdict.md); C1/C2/C3 stream verdict (reviews/item-24-log-sink-c1c2c3-verdict.md).
- Mutants (final): MUT-LOGSINK, MUT-TEE-UNGUARDED, MUT-REPORT-ONCE, MUT-LATCH-NO-CLEAR, MUT-SUP-DEPS-ONLY, MUT-SUP-OWNLOG-ONLY, MUT-CAPTURE-EMPTY-TAIL — all RED->GREEN; C3 discrimination (candidate RED / pre-fix 65560901 GREEN) confirmed.

## A3 sequencing (now satisfied)
T-LOG1's 'part N/M' assertion needed item-24 bridge.ts b1f0e0a — present in THIS PR. This is the fold's stated destination.
