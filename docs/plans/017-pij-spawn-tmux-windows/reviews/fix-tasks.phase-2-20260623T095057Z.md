# Fix Tasks: Phase 2 — Session wiring + tools + ready-ping

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make `harness checks --quick` green
- **Severity**: HIGH
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/test/ledger-records.test.ts`
  - or the deterministic gate/baseline artifact if this unrelated lint issue is intentionally accepted
- **Issue**: Required gate command `harness checks --quick` exits non-zero. The failing check is lint, currently reporting `lint/complexity/useLiteralKeys` at `skills/flow-pair/test/ledger-records.test.ts:175`. The reviewed Phase 2 files are Biome-clean, but the requested deterministic gate is red.
- **Fix**:
  1. Fix the lint finding or record an explicit accepted baseline if this repo intentionally tolerates that pre-existing flow-pair lint issue.
  2. Re-run `harness checks --quick` and capture green output.
- **Patch hint**:
  ```diff
  -	expect(rec["delegationId"]).toBe("dlg-0001");
  +	expect(rec.delegationId).toBe("dlg-0001");
  ```

### FT-002: Surface the non-owner close warning in `pij_close` result text
- **Severity**: HIGH
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/index.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.test.ts`
- **Issue**: AC-06 says `pij_close` on a peer this session did not spawn still works but the result text carries a warning. Current code captures an internal `warn-close-not-mine` event but `PijSession.close()` returns `Result<void>` and `pij_close` always prints `closed pij worker: <id>`.
- **Fix**:
  1. Change the core close return shape to carry warning data, e.g. `Result<{ warning?: string }>`.
  2. Set `warning` when `descriptor.spawnedBy !== this.self`; consider warning when `spawnedBy` is absent but `paneId` exists too.
  3. Include the warning in `pij_close` success text.
  4. Update tests to assert both the internal warn event and caller-visible warning text/API result.
- **Patch hint**:
  ```diff
  -	close(id: SessionId): Result<void> {
  +	close(id: SessionId): Result<{ warning?: string }> {
  ...
  -		if (descriptor.spawnedBy !== undefined && descriptor.spawnedBy !== this.self) {
  +		let warning: string | undefined;
  +		if (descriptor.spawnedBy !== this.self) {
  +			warning = `warning: session '${id}' was spawned by ${descriptor.spawnedBy ?? "unknown"}`;
  			this.capture("receipt", {
  				kind: "warn-close-not-mine",
  ...
  -		return ok(undefined);
  +		return ok({ warning });
  ```
  ```diff
  -				content: [{ type: "text", text: `closed pij worker: ${params.to}` }],
  +				content: [{ type: "text", text: res.value.warning ? `closed pij worker: ${params.to}\n${res.value.warning}` : `closed pij worker: ${params.to}` }],
  ```

## Medium / Low Fixes

### FT-003: Align §H2 with the pure spawn-builder contract
- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/spawn.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/spawn.test.ts`
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts`
- **Issue**: §H2 says `buildSpawnCommand()` should emit `PIJ_SPAWN_MODEL` when `model` is given. Current code augments the env in `PijSession.spawn()` instead.
- **Fix**: Move `PIJ_SPAWN_MODEL` emission into `buildSpawnCommand()` and add/adjust builder tests, or amend the phase task dossier to make the session-layer augmentation the explicit contract.

### FT-004: Update domain artifacts for Plan 017 spawn lifecycle
- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md`
  - `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md`
- **Issue**: Domain docs still describe `pij-messaging` as the old five-port/pre-spawn contract.
- **Fix**: Add spawn lifecycle concepts/contracts (`TmuxPort`, `core/spawn.ts`, descriptor `paneId`/`spawnedBy`, `E-NOTMUX`, ready ping, `pij_spawn`/`pij_close`) and update six-port wording/history. If intentionally deferred to Phase 3 docs, add a tracked task/evidence note.

### FT-005: Fix the `pij_close` prompt text while touching the tool surface
- **Severity**: LOW
- **File(s)**:
  - `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/index.ts`
- **Issue**: Prompt text says to pass "the session id returned by pij_spawn", but `pij_spawn` returns `spawnId` + `paneId`, not the child `SessionId`.
- **Fix**: Reword to: "Pass the child session id from its ready-ping (`[pij from <child-id>]`) or from `pij list`; do not pass the spawnId."

## Re-Review Checklist

- [ ] `harness checks --quick` exits 0.
- [ ] Phase-scoped Biome remains clean for the six reviewed Phase 2 files.
- [ ] `pij_close` non-owner path returns caller-visible warning text.
- [ ] Close tests cover caller-visible warning, missing descriptor, no paneId, and success removal.
- [ ] CF-01 task branch mutation still goes RED then GREEN.
- [ ] §H2/domain-doc drift either fixed or explicitly tracked.
