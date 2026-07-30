# Phase 6 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr  
**Agent**: pij-panicky-caribou  
**Delegation**: dlg-0001  
**Fix round**: fix-0001

---

## T001 — Working-path regression lock

**Status**: ✅ complete

- Added the live-seat lock before production changes.
- Proved adopt persists the new pane and bound native session, `whoami` resolves the
  seat, and `phonehome` reports `(bound)`.
- Pinned the existing honest pending path: `(pane %72, pending)` and never `bound`.

## T002 — Dissolved-adopt RED

**Status**: ✅ complete

- Added the dissolved-seat honesty test before the production fix.
- Captured the intended RED on current code: exit 0 reported
  `(pane %74, bound)`, while a fresh registry read remained
  `lifecycle: "dissolved"` on pane `%73`.
- Kept the test as the successful revive-path regression proof.

## T003 — Route dissolved adopt through revive

**Status**: ✅ complete

- Preserved the tombstone guard in `adapters/fs-registry.ts`.
- Skipped merging writes for the dissolved path and used the existing
  `RegistryPort.revive()` result-bearing write path.
- Removed prior-incarnation runtime and terminal fields before the exact revive write.

## T004 — Persisted-state output guard

**Status**: ✅ complete

- Re-read the descriptor after the write and derive pane, lifecycle, harness, and
  binding output only from that persisted descriptor.
- Fix round `fix-0001` extracted `verifyPersistedAdoptDescriptor` with three explicit
  rejection reasons: `missing`, `dissolved`, and `pane-mismatch`.
- Added a direct soft assertion for each reason inside the existing T002, preserving
  the repository's exact test count. Mutation proof replaced all three conditions
  with `false`; the one targeted test reported all three assertion failures.

## T005 — Dissolved whoami remediation

**Status**: ✅ complete

- Changed dissolved ambient identity guidance to the working command:
  `pij revive <id> --attach "$TMUX_PANE"`.
- Confirmed the remediation is reachable because `revive` dispatches before ambient
  self resolution.

## T006 — Non-goals and field lifetime

**Status**: ✅ complete

- Recorded that Phase 6 does not clear #37 or #36(b), release leech's symlink or
  roadrunner's hardlinks, or transfer the o-prime notification obligation.
- Fix round `fix-0001` documented the deliberate strip-list default: future fields are
  durable unless explicitly classified as prior-incarnation runtime. Phase 1 status
  fields and `orchestrationRole` survive; `stateNote` clears only on assignment or
  explicit state clear.

## T007 — Difficulty ledger

**Status**: ✅ complete

- Added D-046 for the `write(): void` versus `revive(): Result<void>` asymmetry.
- Added D-047 for the permanent-baseline-red blind spot and preserved the `%74`
  requested versus `%73` persisted mismatch as direct evidence of request-derived
  output.

## T008 — Gates and baseline repair

**Status**: ✅ complete

- Original round ran all required gates and isolated the independent routing-doc
  expectation drift.
- Fix round `fix-0001` updated the stale prerequisite-cell expectation to include
  `${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}` without changing the skill document.
- The first full run then reached a second assertion in the same test that checked
  the same routing sentence without the suffix. Updated that expectation only; the
  peer-route expectation remained unchanged because its source sentence is unchanged.
- Final full suite matched the required count exactly: 3,637 passed, 0 failed,
  19 skipped.
- `harness checks` passed all eight sensors: local paths, typecheck, lint, test,
  Windows compatibility, smoke, package audit, and snapshots.

## Fix-round mutation transcript

Mutation applied in `.pi/extensions/pij/cli.ts`:

```ts
if (false) return { ok: false, reason: "missing" };
if (false) return { ok: false, reason: "dissolved" };
if (false) return { ok: false, reason: "pane-mismatch" };
```

Targeted RED:

```text
Test Files  1 failed (1)
Tests  1 failed | 77 skipped (78)
```

That one T002 failure reported three soft-assertion diffs: expected `missing`,
`dissolved`, and `pane-mismatch`, but each received `{ ok: true, descriptor: ... }`.

Restored GREEN:

```text
Test Files  1 passed (1)
Tests  1 passed | 77 skipped (78)
```

## Final gates

| Gate | Result |
|------|--------|
| `just typecheck` | ✅ exit 0 |
| `just lint` | ✅ exit 0; 9 pre-existing warnings and the Biome schema-version info remain |
| `just test` | ✅ 198 files passed, 4 skipped; 3,637 tests passed, 19 skipped |
| `harness checks` | ✅ all 8 sensors passed; none skipped |
