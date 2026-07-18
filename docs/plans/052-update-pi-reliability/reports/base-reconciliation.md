# s052 base reconciliation — Seq 321

## Product hold

Prime issued an immediate pre-code hold because the first implementation packet pinned stale base `af7dcc84d78e9138b2b30ecce4097ea27c35417b` and incorrectly allowed an in-place `harness checks` followed by protected-file restoration.

The coder stopped before editing. Its touch report was `none`: only read/search/status/runtime probes and session-local SQL todo state had occurred. No product, protected, index, repository, installed-Pi, npm cache/config, `~/.pi`, test, stage, commit, or push mutation occurred.

## Base proof

The stream worktree was fast-forwarded only:

```text
git merge --ff-only origin/main
old HEAD:   af7dcc84d78e9138b2b30ecce4097ea27c35417b
new HEAD:   591f188f394ab17d8c34a800fd55f87c752d4005
origin/main:591f188f394ab17d8c34a800fd55f87c752d4005
merge-base:591f188f394ab17d8c34a800fd55f87c752d4005
```

Post-FF status contained only:

- untracked s052 plan/evidence under `docs/plans/052-update-pi-reliability/`;
- an operational untracked `node_modules` symlink to the already-installed main-checkout dependencies.

The symlink is excluded from every product/change inventory and prevents any bootstrap npm resolution during this stream.

## Readiness and seam reconciliation

`harness boot` passed at reconciled base `591f188f394ab17d8c34a800fd55f87c752d4005`: typecheck and full unit-test readiness stages were green.

The orchestrator then reread in full from the reconciled base:

- `justfile`
- `install-windows.ps1`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/release-age-probe.ts`
- `harness/scripts/packages.ts`
- `harness/scripts/vetters/npm-audit.ts`
- `harness/scripts/vetters/lockfile-lint.ts`
- `docs/how/update-pi.md`
- `docs/how/build.md`
- the live updated owner brief

The intervening main changes were focus-agent/prompt/sensor work on disjoint paths. The s052 updater/policy seams above retain the pre-reconciliation behavior assumed by the design contract; no semantic packet rewrite beyond base and validation safety was needed.

## Corrected validation contract

The implementation packet and cold-review packet now pin `591f188f394ab17d8c34a800fd55f87c752d4005`.

The coder may run focused tests, repeated real-PowerShell proof, typecheck, lint, offline local-runtime proof, and full `just test` in the implementation worktree.

The coder must **not** run `harness checks` or `just self-check` there, and nobody may mutate then restore a protected file. Canonical full validation will instead:

1. create a disposable isolated clone/check-out at exact base `591f188f394ab17d8c34a800fd55f87c752d4005`;
2. apply/copy the exact tracked and new-file implementation diff;
3. attach already-installed dependencies without npm resolution;
4. prove the disposable inventory matches the implementation inventory;
5. run `harness checks` only in the disposable copy;
6. retain command/sensor/protected-drift evidence;
7. destroy the disposable copy.

Any package-audit timestamp write therefore remains confined to the disposable validation copy. The implementation worktree's `.pi/packages.yaml` is never mutated/restored.

No live proxy call, npmjs call, global mutation, stage, commit, or shared landing is authorized by this reconciliation.
