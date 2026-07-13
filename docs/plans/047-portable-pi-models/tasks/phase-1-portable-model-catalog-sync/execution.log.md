# Phase 1 - Execution Log

**Delegations**: `dlg-0001`, `dlg-0001-fix-1`

**Coder**: `pij-pleased-cardinal`

**Phase**: Portable model catalog synchronization

## Task outcomes

### T001 - Add fixture-first contract proof

Complete. The initial targeted run failed because `sync-models.ts` did not
exist. The final suite has 8 tests covering the exact portable source boundary,
whole-object managed-provider replacement, preservation of unmanaged providers,
stale-entry removal, missing target/parent creation, malformed-input no-write,
byte-stable reruns, temporary-file cleanup, and a mutation-resistant
same-directory temporary-write-to-target-rename guard.

The tests use fixtures and real temporary filesystem paths. They do not mock
filesystem operations or read/write the real home target.

### T002 - Add the portable catalog and synchronizer

Complete. `.pi/models.json` contains exactly `github-copilot`, `sakana`, and
`openrouter`. It excludes the `local` provider, LAN endpoint, and resolved
credentials. The Sakana API key value is a command reference; the synchronizer
does not read `auth.json`.

`harness/scripts/sync-models.ts` validates both registries before mutation,
replaces each managed provider object wholesale, and preserves every unmanaged
provider plus other target top-level fields. Successful changes are written to
a randomly named temporary file in the target directory and atomically renamed
onto the target. Identical output skips the write.

### T003 - Wire the canonical setup paths

Complete. `just sync-models` forwards explicit `--source` and `--target`
arguments. Both `just install` and `just update-pi` invoke the default recipe.
A temporary-target invocation created the missing target, preserved unmanaged
providers, replaced managed providers, and produced identical bytes on rerun.

### T004 - Update scoped operational documentation

Complete. `AGENTS.md`, `RUNBOOK.md`, `docs/how/build.md`, and
`docs/how/update-pi.md` identify `.pi/models.json` as the portable source,
describe unmanaged-provider preservation, and keep auth, general skills, and
machine-local providers outside repository ownership.

### T005 - Preserve the held discovery document

Held for the orchestrator. `docs/how/pij-models-discovery.md` is untouched.

### T006 - Prove the implementation and inspect boundaries

Complete for owned and fix-packet proof. The portable provider payload matched
the corresponding three provider objects in the current global catalog. The
owned diff contains no local endpoint, resolved credential, auth, or skills
change.

The full completion gate's typecheck, lint, full-test, package-audit, and
snapshot sensors passed. Smoke stopped at Pi's worktree trust selector,
`Do not trust (this session only)`. The orchestrator classified that as shared,
out-of-scope worktree debt and explicitly prohibited further smoke work or a
full-gate rerun.

## Owned implementation files

1. `.pi/models.json`
2. `harness/scripts/sync-models.ts`
3. `harness/scripts/sync-models.test.ts`
4. `justfile`
5. `AGENTS.md`
6. `RUNBOOK.md`
7. `docs/how/build.md`
8. `docs/how/update-pi.md`

This execution log is the packet-authorized phase artifact and is not counted
as an owned implementation file.

## Proof

| Proof | Result |
|---|---|
| Initial fixture run before implementation | RED: helper module absent |
| Original targeted suite after implementation | PASS, 7/7 |
| Review-fix targeted suite | PASS, 8/8 |
| Direct-overwrite mutation | RED, 1 failed and 7 passed; atomic-rename guard failed |
| Production restore | SHA-256 restored to `03378e22820b672c5b98dae2aecec8d1cbb6333bb0af442678af9fb338513f87` |
| Targeted suite after restore | PASS, 8/8 |
| `just flow-pair-test` | PASS, 148/148 |
| `just typecheck` | PASS, exit 0 |
| `just lint` | PASS, exit 0; 10 pre-existing warnings and 1 schema-version info |
| `git diff --check` | PASS, exit 0 |
| Portable/global structured comparison | PASS after excluding only global `providers.local` |
| Full `harness checks` | typecheck, lint, full tests, package audit, and snapshots PASS; smoke externally blocked by the trust selector |

Per the fix packet, no full smoke or `harness checks` rerun was performed during
the review fix.

## Scope and side effects

- `docs/how/pij-models-discovery.md` remained untouched.
- `.pi/packages.yaml` has no final diff.
- No real-home model target was written.
- `npm link` and `pi-doctor` were not run.
- Auth files and general skills were neither read nor changed.
- No daemon restart, remote action, push, or main-checkout change occurred.
