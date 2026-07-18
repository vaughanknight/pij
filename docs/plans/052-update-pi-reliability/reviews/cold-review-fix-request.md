# s052 cold-review fix request

## Authority

Address only the three findings in `reviews/cold-review.md` on reconciled base `591f188f394ab17d8c34a800fd55f87c752d4005`. Re-prove the exact worktree/branch/base before editing.

No live proxy/npmjs, global state, real cache/`~/.pi`, protected file, stage, commit, push, fetch, rebase, `harness checks`, or `just self-check`. The orchestrator alone reruns full gates in a fresh disposable clone.

Allowed existing product paths remain those in `tasks/implementation.md`. One new focused hermetic test such as `harness/scripts/packages-bootstrap.test.ts` is allowed. No manifest, lock, settings, package YAML, CI, government, `.pi/extensions/pij/**`, `skills/flow-pair/**`, or unrelated path.

## F1 — close lock-host authority escape

A caller `NPM_CONFIG_REPLACE_REGISTRY_HOST=never` currently survives and can make lock-resolved `registry.npmjs.org` URLs bypass the governed registry.

Required correction:

1. Add a typed policy constant and committed setting for `replace-registry-host=always`.
2. Strip caller case variants and write the governed lowercase value in both fresh and root-lock environments.
3. Update Unix root-lock pre-dependency environment clearing/assignment, the fail-closed runner path, Windows set/clear/restore wrappers, docs, design contract, and source/executable tests consistently.
4. Expand real PowerShell restoration proof to the fifth variable while retaining real pwsh, forced-error propagation, finite 30s child < derived 35s named-test timeout, and no global timeout.
5. Extend the hermetic two-registry fixture so a lock containing an upstream-host tarball plus a caller `replace-registry-host=never` mutation is replayed under the governed proxy. It must request the fixture proxy, make zero fixture-upstream requests, and retain the sole age-null exception. Removing the governed replacement value must turn the test red.
6. Do not alter the real `package-lock.json`.

## F2 — Unix install failures must fail the updater

Preserve the policy distinction:

- vet findings: add/bootstrap/audit remain report-and-continue; `pkg vet` remains strict;
- prerequisite or `pi install` execution failure: attempt all entries, summarize honestly, and make `pkg bootstrap` exit non-zero after attempts.

Do not print a success-prefixed summary when failures occurred. Ensure `just update-pi` naturally stops before extension update/doctor on nonzero bootstrap.

Add a hermetic CLI-status test without any production path override or protected mutation. A preferred shape is a temporary copied `harness/scripts` + minimal temp `.pi` + existing dependency symlink + fake `pi` executable: one install fails, all entries are attempted, temp settings only may change, and the copied CLI exits nonzero. Also prove a warning/fail vet verdict is not converted into an install-status blocker beyond existing report semantics.

## F3 — exercise corrupt artifact

Add a separate corrupt-tarball operation using the existing local registry fixture. Require:

- nonzero npm status;
- proxy tarball request occurred;
- fixture upstream request count remains zero.

The suite must turn red if corrupt bytes are treated as success.

## Additional narrow hygiene

Change the two new scripts' `#!/usr/bin/env tsx`/direct-local execution boundary if necessary so no new `npx tsx` shebang can opportunistically install a runtime. Do not touch blocked runtime-packaging paths.

## Required validation

Run in the implementation worktree only:

1. focused policy/integration/bootstrap/vetter tests;
2. real PowerShell restoration five consecutive times;
3. `just release-age-probe` (local fixture only);
4. `just typecheck` and `just lint`;
5. offline local wrapper + `just pij --help`;
6. full `just test`.

Never run the full harness gate here. Update `reports/implementation-checkpoint.md` and `reviews/execution.log.md` with exact results, new non-vacuity proof, and revised inventory. Prove diff check, empty index, and protected status empty. Send pointer-only completion and idle for a fresh disposable gate and cold rereview.
