# s040 report - phase 1 checkpoint
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: implementation + review + live proof complete

**claim**: Plan 040 Phase 1 is complete. New pij identities are collision-safe
two-word primary ids; existing opaque identities remain stable. F001-F004 are resolved,
round-three review is **APPROVE**, T009 live proof passed after the reviewed daemon
restart, and all six harness sensors are green.

**artifacts[]**:
- `docs/plans/040-memorable-pij-session-ids/execution.log.md`
- `docs/plans/040-memorable-pij-session-ids/reviews/review.phase-1.md`
- `docs/plans/040-memorable-pij-session-ids/reviews/finding-adopt-new-session.md`
- `docs/plans/040-memorable-pij-session-ids/reports/t009-live-proof.md`
- `docs/plans/040-memorable-pij-session-ids/reports/fleet.md`
- `.harness/records/retro/2026-07-12/001-shared-observations-2026-07-12.md` (outside s040 commit fence; prime curation)

**shas[]**:
- product/plan commit: `18b7421`
- reviewed round-three patch:
  `5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`
- F004 mutation restore:
  `a833468e1a790c1d3ff132b6da1905839c10129d7a1fe88163c213fda352da0e`

**gates[]**:
- Review: APPROVE; F001-F004 resolved.
- Reviewer Dim-0: global Copilot fallback mutation RED (2 failures), byte-identical restore, GREEN.
- Reviewer delayed-directory proof: old descriptor bytes/tuple unchanged; fresh pending id bound through Copilot phonehome.
- Live reviewed daemon: PID `39754`; existing memorable delivery, fresh memorable spawn/self-id, and autonomous pending recovery PASS.
- `harness checks`: typecheck, lint, test, smoke, package audit, snapshots PASS.
- Package audit: no new findings; exact `unique-names-generator@4.7.1` pin.
- Owned fleet/probe peers dissolved.

**observations[]**:
- Mixed-version new-id descriptors require daemon restart before routing behavior is trustworthy.
- `send --wait` may time out before eventual delivery and nonce acknowledgment.
- Copilot `/new` proves global session-directory mtime, process argv, and in-use locks are unsafe identity signals; `COPILOT_AGENT_SESSION_ID` is canonical.
- Pending Copilot adoption recovers automatically through daemon init/watchdog phonehome after the reviewed restart.
- Flow-pair model/roster docs exceed the shipped CLI, Simple plans require a synthetic tasks-dir, and observe lacks allowed-path scoping.
- An intermittent Enter/input issue was reported but not reproduced; watch for a concrete transport trace.

**open[]**:
- O-1: ship reconciliation/PR behavior is governed by the o-prime portfolio; no push is authorized by this report.
- O-2: `pij-aa756x` remains quarantined pending Jordan's remediation decision.
- O-3: shared harness retro records remain outside the s040 fence for prime-level curation.
