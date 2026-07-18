# s052 research reconciliation — Seq 281/282/284/286/288/300

## Scope

Work only in the verified s052 worktree. Read/research only except:

- revise `docs/plans/052-update-pi-reliability/research/coder-findings.md`;
- write `docs/plans/052-update-pi-reliability/reports/design-contract.md`.

No product edits, manifests, locks, settings, package YAML, installed Pi, real npm cache, `~/.pi`, stage, commit, push, fetch, or rebase.

## Binding rulings received after initial research

1. `https://packagefeedproxy.microsoft.io/npm/` is authoritative for **every npm pull/read/resolution/download/install/check**.
2. No direct npmjs read, resolution, fallback, or live diagnostic comparison. Sole exception: authenticated publish **write** to npmjs.
3. Proxy inconsistency fails closed.
4. Client `min-release-age=7` remains independently mandatory; only frozen root lock replay may clear age.
5. Upstream divergence may be modeled only in hermetic fixtures.
6. Preserve `prefer-online=true` so stale client metadata revalidates against proxy authority.

The initial live public-npm comparison occurred before these rulings. Preserve it only as clearly dated historical/pre-ruling evidence; remove it from proposed production diagnostics, validation commands, and future live work. Do not contact npmjs again.

## Additional required analysis

### A. `pij orchestration` / `tsx` runtime seam

Repeated bare `pij orchestration baton ...` calls silently invoked npm to install missing `tsx@4.23.0`. Trace the runtime/bin path and separate current code from stale machine linkage.

Observed read-only trace:

- `command -v pij` → `/Users/jordanknight/.npm-global/bin/pij`
- symlink → `../lib/node_modules/pij/.pi/extensions/pij/cli.ts`
- resolved source shebang → `#!/usr/bin/env -S NODE_NO_WARNINGS=1 npx tsx`
- current `package.json#bin.pij` instead points to `harness/scripts/pij-cli.cjs`
- current wrapper uses `require.resolve("tsx/cli")` and direct Node spawn (fail-closed if missing)
- current `just pij` still calls `npx tsx .pi/extensions/pij/cli.ts`
- current `package.json` and lock already declare/lock `tsx@4.23.0`

Establish whether the root issue is a stale global `npm link`, remaining `npx` entry points, packaging, or more than one. Recommend the smallest fail-closed/pinned-runtime correction. **If any correction requires `package.json`, `package-lock.json`, bin packaging, or `.pi/extensions/pij/**`, identify it as a separate boundary and do not implement it.** Prefer an in-fence `justfile`/doctor correction only if it materially closes the observed seam.

### B. PowerShell load flake

Cross-stream evidence reports the real PowerShell policy test intermittently reaches its 15s child timeout during full gates. Since s052 must broaden that policy wrapper/test, determine whether the s052 deterministic fixture can isolate startup load or whether a narrowly larger child/named-test bound is warranted. Preserve real PowerShell execution, assertions, finite child bound, and child-bound < named-test-bound. Do not broaden scope merely to chase timing.

### C. standalone APPEND_SYSTEM sync

Assess the adjacent request for a lightweight standalone APPEND_SYSTEM sync recipe. Composite `just install` is too side-effectful. Decide whether extracting a shared config-sync recipe is naturally required by s052 updater seam or should be a separate follow-up. Do not add it automatically.

## Required design contract

`design-contract.md` must freeze:

- exact behavior matrix for stale client cache, proxy truth change, proxy inconsistency, exact frozen artifact absence, and hermetic upstream divergence;
- exact policy keys and override stripping/restoration;
- exact command/seam coverage including root lock replay, global npm, Pi nested npm, Windows, npm-view/npx/checks, and direct local pinned tools;
- deterministic fake-registry fixture and non-vacuity requirements;
- diagnostics that use proxy-only live truth and fixture-only upstream divergence;
- exact in-fence file touch set and any separately blocked boundary;
- treatment of the PowerShell load flake and APPEND_SYSTEM recipe;
- implementation acceptance commands and protected-path checks.

Then send a pointer-only completion message and idle. No implementation until a separate persisted packet.
