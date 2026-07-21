# Ship report — s061 team-scaffold (plan 061)

**Date**: 2026-07-20 · **Branch**: `s061/team-scaffold` (base `main` @ 8627aa0) · **Prepared by**: pij-ancient-rhinoceros
**Commits**: 4597473 (P1) · e2618b6 (chore) · fef9e2b (P2) · b6d3434 (chore) · cb6d81a (P3) — +~7,900 lines net across 3 phases

## Gates at ship

| Sensor | Result |
|---|---|
| local-paths / typecheck / lint / windows-compat / smoke (11 cases incl. new team-scaffold walkthrough) / pkg-audit / snapshots | PASS (7/8) |
| test (full suite under load) | RED in tracked T15 contention family ONLY (channel afterEach + telegram index); all four T15 suites isolated 105/105 at ship |
| `just pij-skill-check` | PASS |
| Review chain | P1 APPROVE_WITH_NOTES · P2 FIX_REQUIRED→fixed→APPROVE · P3 FIX_REQUIRED→fixed→APPROVE (cross-model gpt-5.6-terra, mandatory Dim-0 every round) |

## Deferred & Noteworthy (whole-plan; nothing blocks, human ships with eyes open)

1. **Contract decisions — RESOLVED 2026-07-21** (Jordan reviewed the shipped result, no changes):
   - Spine event-kind names `allocation` / `fence` / `dispatch` — **final**; naming was never a reserved gate, the shipped names stand.
   - W-002 ack-key `pij ack <dispatchId>` — **final**; keys on the preallocated dispatch id because the transport messageId doesn't exist at header-write time (explained to + endorsed by Jordan).
2. **T15 flaky class — QUARANTINED 2026-07-21** (Jordan ruling: skip flaky): the five contention-flakes (daemon-push/channel/telegram/cli.integration; green isolated, fail under full-suite load) are now `it.skip` with dated annotations. Deeper fix (de-contend the suites) tracked separately.
3. **W-002 Q2 (small, open)**: dispatches/ dir retention/GC — rides existing reap rules for now.
4. **T008 note**: dispatch packet header recorded as reusable primitive for a future spawn-boot ack plan (INS-001 evidence); no spawn code changed here.
5. TODO/FIXME scan of shipped diff: none.

## Review-find highlights (why the review stage stays)

- rev-0002: `--wait` regression test asserted a pre-wait substring — vacuous proof, strengthened to terminal-line assertion.
- rev-0003: TOCTOU — canary writer sha unbound across the dispatch handoff; now `E-CANARY-PACKET` at the commitment point.
Both found via the mandatory Dim-0 mutation gate, neither by diff-reading (WIN-001).

## Resume note

PR-open + CI watch follow Jordan's confirms. On merge: squash per worktree-era doctrine; stream close via `pij stream close` (dogfood!) after merge.
