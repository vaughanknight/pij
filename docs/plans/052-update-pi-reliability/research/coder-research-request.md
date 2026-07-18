# s052 coder research request — stale/unpublished npm metadata

## Authority and containment

Work only in `/Users/jordanknight/pi-hacking/pij-worktrees/s052-update-pi-reliability` on `s052/update-pi-reliability` at base `af7dcc84d78e9138b2b30ecce4097ea27c35417b`.

This phase is read/research only except for one output file:

- `docs/plans/052-update-pi-reliability/research/coder-findings.md`

Do not edit product code, tests, manifests, locks, settings, package YAML, global config, real `~/.pi`, installed Pi, pi-mono, or the real npm cache. Do not stage, commit, push, rebase, or fetch.

`node_modules` is an operational symlink to the main checkout and is excluded from the eventual change inventory.

## Human security ruling

- Standard npm resolution must use `https://packagefeedproxy.microsoft.io/npm/`.
- Client `min-release-age=7` remains mandatory; server-side age enforcement is not proven.
- Online metadata revalidation remains required.
- The frozen root-lock replay exception remains the only age-disabled path.

## Banked/observed incident evidence

- Previously vanished targets: `pi-lean-ctx@^3.9.8`, `@tintinweb/pi-subagents@^0.14.0`, and Pi `0.80.7`; current upstream truth was lower.
- In this clean worktree, `npm ci --min-release-age=null` failed through the Microsoft proxy on vanished `@earendil-works/pi-tui@0.80.6`.
- Retrying as `NPM_CONFIG_PREFER_ONLINE=true npm ci --min-release-age=null` still failed through that proxy on vanished `@earendil-works/pi-coding-agent@0.80.6`.
- Do not mutate or delete cache to investigate this.

## Questions to answer

1. Trace every relevant resolution seam for `just install`, `just update-pi`, official global Pi install, package bootstrap/add, prerequisite npm installs, `pi update --extensions`, Windows bootstrap/update, and applicable `npm`/`npm view`/`npx` calls.
2. Confirm npm's exact `prefer-online` behavior and env/config key spelling, plus registry env/config spelling. Explain what it does and does not guarantee.
3. Using only temporary cache/config/HOME directories, compare current package metadata and tarball reachability through the required Microsoft proxy versus public npm for the incident packages. Record commands, UTC time, versions/dist-tags, cache headers if available, and whether proxy metadata itself appears stale.
4. Design a deterministic, hermetic stale-metadata/unpublished-version test. It must not touch the real cache, global Pi/npm state, or `~/.pi`; prefer a local fake registry or injected subprocess fixture over assertions that merely inspect source strings.
5. Recommend the smallest shared policy seam that always supplies all three fresh-resolution controls:
   - registry = Microsoft proxy
   - prefer-online = true
   - min-release-age = 7
   while preserving only `npm ci --min-release-age=null` for frozen root lock replay.
6. Determine whether `.npmrc` should also declare the proxy and whether explicit subprocess env propagation is still required for Pi/npm child resolution.
7. Identify exact expected file touch set and tests, including Windows restoration behavior and report-and-continue non-regression.

## Required sources

Read in full before concluding:

- owner brief at `/Users/jordanknight/pi-hacking/pij/government/briefs/s052-update-pi-reliability.md`
- `.npmrc`
- `justfile`
- `install-windows.ps1`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/packages.ts`
- `docs/how/update-pi.md`
- `docs/how/build.md`
- relevant s048 evidence under `docs/plans/048-min-release-age-7/`

## Output contract

Write a concise but evidence-rich `coder-findings.md` containing:

- root-cause/proxy/cache conclusion with confidence and caveats;
- seam matrix (command → registry/online/age behavior);
- recommended design and rejected alternatives;
- hermetic reproduction/test design with non-vacuity mutations;
- exact file touch set;
- unresolved product decisions (only if genuine).

Then send the orchestrator a pointer-only completion message. Remain idle afterward; do not start implementation until a separate persisted coder packet arrives.
