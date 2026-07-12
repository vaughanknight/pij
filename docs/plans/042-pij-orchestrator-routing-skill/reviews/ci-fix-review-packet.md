# CI fix review packet — exact s041 convergence

**Scope**: `.pi/extensions/pij/adapters/fs-registry.test.ts`
**Base**: `18a81918d1b002863c4920149e29bbda3277dd2f`
**Current diff SHA-256**: `bdea600881fb5b3a6f736497e6356ef723a48d68df32805a5383461427cc0af1`
**s041 diff SHA-256**: `bdea600881fb5b3a6f736497e6356ef723a48d68df32805a5383461427cc0af1`
**File SHA-256**: `244139bdd23cdd40bbf75ea785afb205828d45e67c60fa57583eca1b276c4451`

## Review contract

- Verify the current one-file diff is byte-identical to:
  `git diff 18a81918d1b002863c4920149e29bbda3277dd2f..s041/inbox-no-tmux -- .pi/extensions/pij/adapters/fs-registry.test.ts`
- Confirm the only semantic change is Vitest's options second argument with
  `timeout: 30_000` on the named multiprocess test.
- Re-run the test file and `git diff --check`.
- Ensure no other implementation file changed after review r2.
- Write `ci-fix-review.md` with `APPROVE` or `FIX_REQUIRED`.
- Read-only; no commit.
