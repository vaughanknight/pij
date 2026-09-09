# Plan 144 — every pi/omp seat reports which pij extension build it runs

Owner: pij-minor-unicorn (prime). Ruling: Jordan 2026-09-09 — "do we have a good way to tell which build of extension a given instance of omp is running" → no; "focus on getting a coder on the next enhancement".

## Problem (verified 2026-09-09)
The extension loads from disk at process start and never changes until restart; the repo moves on. Registration (`/v1/register`, seat descriptor columns: id harness pane pid proc_start folder state … harness_session native_extension_delivery) carries no build identity; omp's log does not record the extension path. Today's only tell is `proc_start` vs `git log -1 -- .pi/extensions/pij`, which needs the operator to know the trick and is wrong for worktree-loaded extensions.

## Acceptance
- AC1 Build id computed once at extension load, in the pi/omp extension (`.pi/extensions/pij/`): resolve the extension directory's REAL path (it is often reached through a symlink), then `git -C <realdir> rev-parse --short=10 HEAD` combined with whether `git status --porcelain -- <realdir>` is non-empty → `<sha10>` or `<sha10>+dirty`. If the real path is not inside a git work tree, fall back to `hash:<first 12 hex of sha256 over the sorted (path, bytes) of index.ts + adapters/*.ts + core/*.ts>`. Never shell out on every tick; compute once, cache, cite the source path too (`extension_path`).
- AC2 Wire: the extension sends `extension_build` and `extension_path` on register/adopt/re-register (every place it sends the descriptor — grep all of them, one helper). The daemon stores both (new migration, nullable), returns them in `/v1/whoami`, `/v1/seats` (list) and `/v1/state`; the shim's `pij whoami --json` / `pij list --json` include them unchanged. Null means "registered by a pre-144 extension" — document that as the answer, no retro-attest.
- AC3 Surface: `pij whoami` human output prints `extension: <build> (<path>)`; the omp/pi footer segment the extension already owns (`rs·<id>`) gains ` · ext <sha10>` (dirty marker kept). `pij list` human table gets a `build` column only if it stays under the current width; otherwise JSON only — say which.
- AC4 Tests, RED first: (a) extension unit tests for the three build forms (clean sha, dirty, hash fallback) with a temp git repo, plus symlink resolution; (b) daemon round-trip test register→whoami→list carrying both fields, and the null case; (c) goldens under crates/testkit/fixtures updated deliberately (`one artifact, one formatter`). Name tests after the claim.
- AC5 Live proof on an ISOLATED daemon: omp started from THIS worktree cwd → `pij whoami --json` shows `extension_build` equal to `git -C <worktree> rev-parse --short=10 HEAD` (dirty suffix expected if the tree is dirty at that moment — say so) and `extension_path` under the worktree. Then a control: a seat on the production daemon (read-only query only) shows `null`. Cite both outputs.
- AC6 Docs: docs/how/pij-rs-api.md seat descriptor section lists both fields and the null meaning; one line in the pij skill peer route where `whoami` is described.

## Non-goals
Claude/Copilot/Codex build identity (different extension mechanisms; Copilot native can follow the same field later). Auto-restart or warnings on stale builds (a later plan can use this field). Legacy TS daemon.
