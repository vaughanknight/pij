# Fix review packet — Plan 038 Phase 2 / dlg-0003

**Original verdict**: `reviews/review.phase-2.dlg-0002.md` — FIX_REQUIRED  
**Finding to verify**:

- HIGH: valued boolean forms such as `pij list --prime=false` must return `E-ARG`.
- MEDIUM: top-level help must advertise `[--prime]`.

## Exact fix scope

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- Phase 2 `execution.log.md` evidence only

## Required verification

1. Confirm parser rejects `--prime=false`, `--prime=true`, `--here=false`, and `--json=true`.
2. Confirm optional-valued non-boolean forms (notably `--wait=5000`) retain their prior behavior.
3. Confirm the real CLI test returns exit 64 / `E-ARG` and emits no unfiltered session JSON.
4. Confirm top-level help contains `pij list [--here] [--prime] [--json]`.
5. Run the focused core/CLI test command and pathscoped diff check.
6. Re-run or inspect the relevant negative/state assertions; no truthiness-only approval.
7. Record the exact transient attribution separately:
   - one run during s039 install had 19 subprocess tests exit 1 with empty output;
   - identical quiescent rerun on Vitest 4.1.10 passed;
   - no product workaround was added.

## Output

Append a `## Fix verification — dlg-0003` section to:

`docs/plans/038-pij-prime-designation/reviews/review.phase-2.dlg-0002.md`

Set the final verdict to `APPROVE`, `APPROVE_WITH_NOTES`, or keep `FIX_REQUIRED`. Do not edit product files. Send the verdict path to `pij-118mbuv`.
