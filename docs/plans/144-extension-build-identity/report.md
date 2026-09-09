# Plan 144 — coder delivery

**Commit:** `7e4d10bccc7b310881c7a4ce2f9dab18478aebb3`  
**Branch:** `144-extension-build-identity`  
**Source basis:** `a654d9afb8fa5950166245f1b076f9529ab450a3`  
**Verdict:** implementation, live proof and required gates passed. No push, PR, merge, production restart or unrelated fixture changes.

The single commit contains source, API/skill documentation and all evidence below. This report is a post-commit receipt naming that exact SHA; it is intentionally outside the commit it identifies.

C11 trailers were obtained from `pij-rs commit-trailers` and included:

```text
Pij-Seat: pij-damaged-hekarro
Pij-Prime: pij-minor-unicorn
Pij-Plan: 144-extension-build-identity
```

## Acceptance

| AC | Delivered and proven |
|---|---|
| AC1 | `adapters/extension-build.ts` resolves the real source path, computes scoped Git HEAD/dirty identity or the sorted, length-framed SHA-256 fallback. `index.ts` captures it once at module load. Temp-Git tests cover clean, staged/unstaged/untracked dirt, unrelated dirt, symlinks and deterministic/content/path-sensitive fallback. |
| AC2 | Required build/path input reaches the existing `registrationFor` helper and its retained re-registration descriptor. Optional Rust register/adopt fields persist through migration `0019`; whoami, seats and StateCard return explicit snake-case string/null fields. Omitting metadata on refresh clears stale values. SQLite HTTP roundtrip and live shim reads pass. |
| AC3 | Both shim/native human whoami print `extension: <build> (<path>)`. OMP native name/fallback status and Pi status include the build, retaining `+dirty`. **List remains JSON-only for build identity**: no new width-expanding human column. Real OMP footer and both human whoami commands were exercised. |
| AC4 | RED preceded implementation; focused TypeScript tests, SQLite register→whoami→list→state/legacy-refresh test, deliberately regenerated CLI goldens, updated current governance seat.put fixture and fixture manifest all pass. Historical capture fixtures were not rewritten. |
| AC5 | Real OMP 18.1.14 loaded the extension explicitly from this worktree, against a private real-adapter daemon, key/store/home and tmux socket. Build matched the worktree HEAD at load plus expected dirty suffix. Production control was read-only. Prime accepted the absent-versus-null distinction below. |
| AC6 | `docs/how/pij-rs-api.md` and `skills/pij/references/routes/peer.md` document both fields, load-time caching, older-daemon omission, pre-144/unreported null, scoped dirt, standalone hashing and JSON-only roster build identity. |

## RED receipts

Commands ran from the worktree before implementing their corresponding behavior:

```text
vitest run .pi/extensions/pij/adapters/extension-build.test.ts
exit 1: Cannot find module './extension-build.js'

cargo test -p pij-daemon extension_identity_survives_sqlite_registration_readbacks_and_legacy_refresh_clears_it
exit 101: left None; right Some(String("0123456789+dirty"))

vitest run .pi/extensions/pij/core/session-name.test.ts
exit 1:
Expected: "rs·pij-exceptional-planarian · ext 0123456789+dirty"
Received: "rs·pij-exceptional-planarian"
```

Full outputs: [build RED](evidence/red-build-identity.txt), [daemon RED](evidence/red-daemon-roundtrip.txt), [footer RED](evidence/red-footer.txt).

## GREEN gates

All Rust commands used `~/.cargo/bin/cargo`. Final full harness execution had no concurrent cargo/vitest command of this coder.

| Command | Observed result | Receipt |
|---|---|---|
| Focused Vitest: build identity, session-name, rust-runtime, index | 4 files; 123 tests passed | [output](evidence/typescript-focused.txt) |
| `RUST_TEST_THREADS=1 cargo test --workspace` | Exit 0; full workspace including corpus and real-tmux contracts passed. Existing opt-in live Claude tests/doc examples remain ignored. | [full output](evidence/cargo-workspace.txt), [exit](evidence/cargo-workspace.exit) |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0; `Finished dev profile ... in 10.67s` | [output](evidence/clippy.txt) |
| `cargo fmt --all -- --check` | Exit 0, no output | [output](evidence/fmt.txt), [exit](evidence/fmt.exit) |
| `just test` → `npm run test` | Exit 0; **241 files passed / 4 skipped; 5285 tests passed / 22 skipped** | [full output](evidence/npm-test.txt), [exit](evidence/npm-test.exit) |
| `harness checks` | **Exit 0 at 2026-09-09T04:15:32.781Z**; all nine required sensors pass, none skipped | [complete envelope](evidence/harness-checks.json) |

Final sensor verdicts: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit and snapshots **pass**. Attribution sensor is advisory **warn**, exit 0: the pre-existing planning commit `a654d9afb8fa5950166245f1b076f9529ab450a3` lacks a derivable Pij-Prime. Its history was not rewritten; the new implementation commit carries all three derived trailers.

Earlier gate attempts are preserved rather than hidden:

- Baseline boot needed `just worktree-deps`; its worktree-only links repaired missing Vitest without altering main's node_modules. Baseline smoke then exceeded the boot wrapper's 90-second deadline.
- Parallel Rust runs hit native process-observation/tmux recovery timing failures; targeted serial controls passed, then the entire workspace passed with `RUST_TEST_THREADS=1`. No production timeout/brake was weakened.
- [Initial full harness](evidence/harness-checks-initial.json): all required sensors except smoke passed; smoke's pane belonged to a different tmux namespace. Aligning the check's `TMUX` with its private daemon fixed smoke.
- [Retry](evidence/harness-checks-retry.json): smoke passed; one unrelated ambient-host registration test failed.
- [Quiescent attempt](evidence/harness-checks-quiescent.json): smoke passed; one unrelated flow-pair temp-directory cleanup failed with `ENOTEMPTY`.
- Prime ruled out unrelated fixture edits and authorized one final full rerun, then a pre-144 comparison only if still red. The final full rerun passed; **no stash or baseline replay was needed**.

## Live proof and the accepted control distinction

Private listener: `127.0.0.1:53684`; private tmux socket, daemon state/key and HOME were all under a unique temporary directory. The daemon used **real adapters**, not `--offline` (which selects FakeLiveness). OMP launched with `--no-extensions -e <this-worktree>/.pi/extensions/pij/index.ts` and this worktree as cwd.

At extension load, `git rev-parse --short=10 HEAD` was `a654d9afb8`. Source edits existed under the extension directory, so `a654d9afb8+dirty` was expected. Live seat `pij-cloudy-carl` reported:

```text
extension_build: a654d9afb8+dirty
extension_path: /Users/jordanknight/pi-hacking/fs3-extension-build/.pi/extensions/pij
footer: rs·pij-cloudy-carl · ext a654d9afb8+dirty
```

Raw outputs copied into the plan **before commit**: [whoami](evidence/omp-whoami.json), [list](evidence/omp-list.json), [state](evidence/omp-state.json), [OMP terminal](evidence/omp-footer.txt), [shim human output](evidence/shim-whoami.txt), [native human output](evidence/native-whoami.txt).

**Production pre-144 daemon: keys are absent, not null.** Raw read-only `pij whoami --json` control, verbatim:

```json
{"ok":true,"command":"pij whoami","v":2,"data":{"id":"pij-damaged-hekarro","harness":"omp","session":"01a0844a-8a84-7792-a737-29d64b82e3a0","pane":"%4509","proc":{"pid":17811,"proc_start":20260909135110},"folder":"/Users/jordanknight/pi-hacking/pij","state":"idle","semantic_state":null,"role":null,"parent":"pij-minor-unicorn","relay":false,"cross_session_inbound_accept":false,"native_extension_delivery":false,"spawn_id":"s-57be5d1524ea016b5c0e78b7368adad2","model":"github-copilot/gpt-6-astra","effort":"high"}}
```

[Original production JSON](evidence/production-control.json).

**New daemon, old descriptor shape: explicit nulls.** An owned inert `sleep` pane was adopted without either extension field; it is a descriptor compatibility control, not a claimed live extension. Its whoami response was:

```json
{"ok":true,"command":"pij whoami","v":2,"data":{"id":"pij-modest-magpie","harness":"omp","session":null,"extension_build":null,"extension_path":null,"pane":"%3","proc":{"pid":12993,"proc_start":20260909140217},"folder":"/Users/jordanknight/pi-hacking/fs3-extension-build","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"native_extension_delivery":false}}
```

[Original legacy-shape JSON](evidence/legacy-null-control.json). Prime explicitly accepted raw omission on the pre-144 production daemon plus explicit null on the new daemon. No existing seat was retro-attested.

## Retrospective and cleanup

- Build provenance is now an observable harness field instead of an operator inference from process age and today's checkout. The accompanying scoped-dirt, symlink, hash-framing and SQLite roundtrip proofs encode that contract.
- Fixture lesson: isolation and `--offline` are different. Real registration requires real liveness; daemon, CLI and smoke must share the private tmux namespace, and child routing variables must reach the child rather than only its tmux client.
- No edits touched plan 143's Rust-runtime delivery paths; changes in that shared file are the build type/input and registration descriptor fields.
- The private daemon and tmux server were stopped after proof. The latter retired the owned OMP/control processes. No production daemon was restarted.
- Recommended harness improvement to offer next: a single private **real-daemon + tmux** launcher that emits the environment for smoke/CLI consumers, preventing the namespace and fake-adapter setup errors encountered here. Observations were captured with `harness observe`; no unrelated fixture changes were folded into 144.
