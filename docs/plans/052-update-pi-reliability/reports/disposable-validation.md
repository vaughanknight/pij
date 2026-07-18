# s052 disposable full-gate validation

**Final post-fix accepted run:** 2026-07-15T04:12:16.596Z
**Base:** `591f188f394ab17d8c34a800fd55f87c752d4005`
**Gate:** `harness checks` — **PASS 8/8**

Raw accepted artifacts:

- `disposable-harness-checks.json`
- `disposable-validation-inventory.json`

## Accepted isolation envelope

The orchestrator created a local no-hardlink clone, detached it at the exact base, applied the tracked binary diff, copied every untracked implementation/evidence file except the operational `node_modules` symlink, and compared byte hashes/modes for all 30 post-fix inventory entries. Dependencies were attached from the existing main-checkout `node_modules` without npm resolution.

The accepted run used:

- disposable `HOME`/`USERPROFILE`;
- disposable npm cache, prefix, logs, user config, and global config;
- explicit Microsoft proxy, `replace-registry-host=always`, `prefer-online=true`, and client age `7`;
- disposable `PIJ_HOME`, TMPDIR, and XDG roots;
- `TMUX` and `TMUX_PANE` removed;
- a short, dedicated `TMUX_TMPDIR`, so the new tmux server and every smoke pane inherited the disposable environment;
- only nonsecret Pi state: repository-owned config, nonsecret global preferences, and copied already-installed package roots/manifests. No `auth.json` or credential state was copied.

The dedicated tmux server was killed and its short socket root removed after the gate.

## Result

All eight sensors passed with no skips:

| Sensor | Result |
|---|---|
| local paths | pass |
| typecheck | pass |
| lint | pass |
| test | pass |
| Windows compatibility | pass |
| smoke | pass |
| package audit | pass |
| snapshots | pass |

The accepted temp npm logs contained 21 files and **zero `registry.npmjs.org` hits**. No real Pi session path contained final accepted validation-root token `pij-s052-validation-iehxs4jr`; its one Pi session file was confined to disposable state. Proxy/network policy therefore remained authoritative for the accepted gate.

The package-audit sensor changed `.pi/packages.yaml` only in the disposable clone. The implementation worktree's protected-path status remained empty throughout; nothing was restored there.

## Real-state proof

Before/after hashes and metadata were byte-identical for:

- real `~/.npmrc`;
- real Pi `settings.json`, `APPEND_SYSTEM.md`, `mcp.json`, and `models.json`;
- all six real installed Pi package roots;
- the globally installed Pi package tree and CLI;
- Pi command path/realpath and global npm prefix identity.

Whole-tree `~/.npm` and `~/.pi/agent` metadata digests changed during the accepted run because other active streams/sessions were writing concurrently. Attribution checks found:

- **zero** real Pi session paths containing final accepted token `pij-s052-validation-iehxs4jr`;
- all 21 accepted-run npm logs under the disposable npm log root;
- recent real npm logs attributed to `s051-pij-identity-integrity` or the main checkout, with no accepted validation token;
- no change to installed Pi or any real package root.

Thus the accepted gate made no attributable write to real Home/Pi/npm state; concurrently volatile trees are reported rather than falsely claimed byte-static.

## Failed isolation attempts (retained honestly)

### Attempt 1 — rejected

Seven sensors passed; smoke timed out while package installation was still running. Although the harness process had temporary HOME/npm values, smoke reused the pre-existing tmux server, whose server environment retained real HOME. This created a real Pi session directory containing validation token `pij-s052-validation-k_uajea4` and used real npm state. Critical configs and installed Pi stayed unchanged, but this attempt violated the isolation contract. It was reported immediately; **no cleanup or rollback was attempted**.

### Attempt 2 — rejected

Seven sensors passed; smoke could not start because nesting the isolated tmux socket beneath the long validation path exceeded macOS's Unix-domain socket path limit. Real critical state remained unchanged. The fix was a short dedicated `/tmp/t52-*` tmux root.

### Attempt 3 — corroborating pass

The corrected short isolated tmux envelope passed 8/8. Its snapshot helper still called `npm prefix -g`, which itself could create real npm logging, so it was not selected as the final proof despite green sensors.

### Attempt 4 — accepted pre-fix proof

Removed all npm calls from the real-state snapshot helper, retained the short dedicated tmux server and disposable package state, and passed 8/8 against the initial implementation. Cold review subsequently required three narrow fixes, so its raw gate/inventory artifacts were superseded rather than used as final ship evidence.

### Attempt 5 — final post-fix acceptance

Applied the exact revised 30-entry implementation/evidence inventory, including `replace-registry-host=always`, bootstrap exit-status proof, and corrupt-tarball coverage. The same corrected isolation envelope passed all eight sensors with no skips. This is the final accepted evidence above.

## Disposable cleanup

The raw post-fix evidence was copied into the s052 report directory. All five disposable validation roots and dedicated short tmux roots were then removed. None was a product worktree or shared checkout. The first rejected run's real Pi session residue was deliberately **not** cleaned up or rolled back; it remains disclosed for human disposition. No implementation-worktree protected file was mutated or restored.
