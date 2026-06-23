# Fix Tasks: Phase 1 — Pure spawn core + TmuxPort + tmux adapter

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make Phase 1 files Biome-clean
- **Severity**: HIGH
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/ports.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts`
- **Issue**: Phase-scoped Biome check fails on changed files: unused `Role` import in `ports.ts`, extra blank line / constructor formatting in `fakes.ts`.
- **Fix**:
  1. Remove `Role` from the import list in `core/ports.ts`.
  2. Apply Biome formatting to `adapters/fakes.ts` (or make the exact formatter changes Biome printed).
  3. Re-run:
     ```bash
     NO_COLOR=1 npx biome check .pi/extensions/pij/core/spawn.ts .pi/extensions/pij/core/spawn.test.ts .pi/extensions/pij/core/ports.ts .pi/extensions/pij/adapters/tmux.ts .pi/extensions/pij/adapters/fakes.ts
     ```
- **Patch hint**:
  ```diff
  --- a/.pi/extensions/pij/core/ports.ts
  +++ b/.pi/extensions/pij/core/ports.ts
  @@
  -	Result,
  -	Role,
  +	Result,
  	SessionDescriptor,
  ```

## Medium / Low Fixes

### FT-002: Update pij-messaging domain docs for the new contract
- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md`
  - `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md`
- **Issue**: Domain docs still say `Five ports` / `5 ports` and omit `core/spawn.ts`, `TmuxPort`, `TmuxAdapter`, and `FakeTmux`.
- **Fix**: Update source locations, concepts/contracts, map label, and history for Plan 017 Phase 1, or explicitly move this docs update to a tracked Phase 3 task if batching docs is intentional.

### FT-003: Restore the-flow evidence trail
- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/tasks.md`
  - `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/execution.log.md`
- **Issue**: T101–T105 rows remain unchecked and `execution.log.md` is missing.
- **Fix**: Run/update the flow progress/evidence step so reviewers and downstream phases can see which tasks landed and with what validation.

### FT-004: Consider making FakeTmux able to model not-in-tmux
- **Severity**: LOW
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts`
- **Issue**: `FakeTmux.currentSession()` always returns a string. Phase 2 needs an `E-NOTMUX` path, so a nullable fake session name would make the intended test easy.
- **Fix**: Consider `sessionName: string | null = "fake-session"` and return it directly.

## Re-Review Checklist

- [ ] FT-001 fixed and phase-scoped Biome check exits 0.
- [ ] `just typecheck` exits 0.
- [ ] `just test` exits 0.
- [ ] Spawn suite mutation probes still go RED then GREEN.
- [ ] Domain/evidence updates either completed or explicitly tracked in the plan.
