# Phase 1 modal guard — execution log

## RED

Command:

```sh
npx vitest run .pi/extensions/pij/core/invariant-guard.test.ts .pi/extensions/pij/index.test.ts
```

Result: failed as expected (exit 1). The new pure suite could not resolve `./invariant-guard.js`; the managed-peer wiring assertion received `undefined`; the generic wiring assertion used `.resolves` on a synchronous `undefined` result. Existing six index tests passed.

## GREEN

```sh
npx vitest run .pi/extensions/pij/core/invariant-guard.test.ts .pi/extensions/pij/index.test.ts
# 2 files passed, 10 tests passed

just typecheck
# tsc --noEmit passed
```

## Independent lead verification

- Re-ran the focused command: 2 files / 10 tests passed.
- Re-ran `just typecheck`: passed.
- Targeted Biome initially found formatting/import-order errors in the new test; `biome check --write` corrected that file only, then the four-file check passed and focused tests stayed 10/10 green.
- Re-ran `git diff --check`: passed.
- Mutation: inverted the managed-Pi harness predicate; `invariant-guard.test.ts` exited 1 (RED), then the source was restored and the focused pure suite passed 2/2 (GREEN).
