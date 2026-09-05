# Scoped TypeScript proof prerequisite

`just test .pi/extensions/pij/core/generation-routing.test.ts .pi/extensions/pij/cli.integration.test.ts` exited127 before loading tests: `sh: vitest: command not found`.

Read-only follow-up: assigned worktree node_modules exists but no runnable vitest; `/Users/jordanknight/pi-hacking/pij/node_modules/.bin/vitest` is absent too. The frozen plan already records npm git-dependency/min-release-age installation failure and permits existing dependency reuse, not installation or shared-state repair. No dependencies, manifest, lockfile, global tools or daemon changed by this coder.

Need a complete existing dependency directory/test runner supplied by PM or permission for an isolated dependency recovery. Rust scoped tests are running independently. This is unexecuted JS proof, not a test failure in product behavior.

## Updated prerequisite state

PM/prime restored the exact-lockfile dependency tree; the initial missing-vitest blocker is resolved. Broader scoped run reached 152 passes/1 skip, but existing archived-seat test failed at an esbuild subprocess import: `/Users/jordanknight/pi-hacking/pij/node_modules/node_modules/esbuild/index.js` from `tsx/dist/loader.mjs`. Reported to PM with raw output `artifact://38`. No dependency repair performed here. Changed Copilot-control and existing non-Copilot command contracts are rerun separately; broader suite remains honestly red pending PM adjudication.

## Exact focused failures and child construction

Raw `artifact://45`: 11 passed, 2 failed, 97 filtered. The failures are:

1. `pij two-peer integration (real coordinators + real CLI over sandbox PIJ_HOME) > refuses Copilot reload before either generation can deliver it`: child exit1 instead of expected2; `@opentelemetry/resources/index.js` resolution from `minih/dist/telemetry/init.js`.
2. `pij two-peer integration (real coordinators + real CLI over sandbox PIJ_HOME) > refuses ambient Copilot and unknown compact-self panes without typing or follow-up`: child exit1 instead of expected2; `@opentelemetry/api/index.js` resolution from `minih/dist/runner/runner.js`.

Construction is the existing `pij()` fixture in `.pi/extensions/pij/cli.integration.test.ts:45-110,145-153`:

- Executable: `/Users/jordanknight/pi-hacking/fs3-copilot-native-daemon/node_modules/.bin/tsx` (through unchanged worktree node_modules symlink).
- First argv element: `/Users/jordanknight/pi-hacking/fs3-copilot-native-daemon/.pi/extensions/pij/cli.ts`.
- Reload test loops generations `legacy`, `rs`, each with `["send","pij-copilot-control","--command","reload"]` then `["send","pij-copilot-control","/reload"]`. Failure occurred before a reload refusal line; no per-iteration trace was recorded, so exact failed loop iteration is not asserted.
- Ambient test first calls `["compact-self","follow-up must not run"]`, overriding `TMUX_PANE=%9137` and `COPILOT_AGENT_SESSION_ID=native-control-session`; second calls `["compact-self","--pane","%9138"]` with `PIJ_RS_STATE_DIR=<sandbox PIJ_HOME>/absent-native-control-state`. Assertion fails on first child's expected exit2.
- Child cwd is `realpathSync(mkdtempSync(join(tmpdir(),"pij-folder-")))`, NOT repo cwd. Existing afterAll removes it; its exact random suffix was not logged.
- Child env starts `...process.env`, then `PIJ_HOME=<mkdtemp pij-smoke->`, `PIJ_DAEMON_GENERATION=legacy`, `PATH=<mkdtemp pij-bin->:$PATH`, `TMUX_PANE=%1`, empty Claude/Copilot/Codex native session vars, `FAKE_TMUX_CWD=<child cwd>`, `FAKE_TMUX_PID=<Vitest process.pid>`, `FAKE_TMUX_LOG=<sandbox PIJ_HOME>/tmux.log`; test overrides merge LAST. Timeout10000ms, encodingutf8.
- Fake BIN contains only test-owned tmux and omp scripts. The tmux script logs and prints synthetic pane identities; it does NOT execute its launch arguments or start the legacy daemon.

Read-only follow-up: canonical OTel resources2.7.1 and api1.9.1 package manifests exist and both declare `build/src/index.js`; api also declares exports. Agent launch env reports NODE_OPTIONS/NODE_PATH/TSX_TSCONFIG_PATH/TSX_DISABLE_CACHE unset; the test helper does not override them. Root tsconfig has NodeNext and no paths/baseUrl mapping. No evidence yet establishes global package absence or a control-guard source bug; preserve the subprocess/symlink-resolution finding rather than repair dependencies or weaken assertions.

## Resolution of changed-control cases

After prime reported the Node/tsx runtime repair, the exact two failed control cases were rerun with `VITEST_MAX_THREADS=4 CARGO_BUILD_JOBS=4`: both passed (raw `artifact://50`, 108 other cases filtered). No test assertion, fixture, dependency, or source change was needed for these failures. The previous broader archived-seat subprocess failure is retained as historical evidence; the full project gate remains PM-owned.

## Broader scope resolution

PM/prime authorized broader retry after the exact cases passed. `VITEST_MAX_THREADS=4 CARGO_BUILD_JOBS=4 just test .pi/extensions/pij/core/generation-routing.test.ts .pi/extensions/pij/cli.integration.test.ts --no-cache --maxWorkers=4` exited0. Durable complete output: `daemon-js-broad-after.log` (original `artifact://69`). No dependency or assertion changes by this coder. The scoped JS blocker is closed; full project `harness checks` still belongs to PM after composition.
