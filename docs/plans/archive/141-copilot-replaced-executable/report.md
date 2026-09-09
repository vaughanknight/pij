# Plan 141 — coder evidence

Worktree: `141-copilot-replaced-executable`. Source baseline: `58cf6706ed641b650c33e117e47c6cc5cc33187b`.
Implementation commit: `efd95d2ff7ed7d9685b30a7f31658f9a3fe92efc`. This report is an untracked delivery receipt, intentionally outside the single source commit so it can cite that exact SHA; prime owns its preservation.

## Acceptance and scope

- AC1: Linux observation normalizes exactly one trailing ` (deleted)` marker before existing identity matchers. Rust's owned `String` is truncated in place; `NativeProcess.executable_replaced` and extension observation `replaced` retain the fact. macOS observations remain unchanged with `false`.
- AC2: Real Linux copied-shell/unlink test accepts `copilot` + argv0 `copilot`, rejects `copilot-evil` + argv0 `copilot`, and rejects `copilot` + argv0 `sh`. Each child reaches its readiness line before observation, is killed/reaped, and its private directory removed before assertions.
- AC3: Helper fixtures cover exact suffix, trailing whitespace, marker-only input, Windows backslash paths and `.exe`. Replaced host resolution survives raw/normalized marker variation but refuses changed ppid/proc_start and lookalike executable names. Linux extension subprocess smoke reaches registration and acknowledgement with `/opt/copilot (deleted)`.
- AC4: Terminal `extension-unavailable` advises no scheduled retry and `/restart` or relaunch. It remains visible after an earlier `registration-wait`; that transient notice retains retry advice. Rust refusals name observed basename and replacement status.
- **AC4a amendment, approved by pij-minor-unicorn:** the banner projects local authored diagnostics or the narrowly recognized daemon host-refusal fields, never raw `event.diagnostic`. HTTP response bodies retain the existing bounded/key-redacted error outside the native banner. Unknown remote metadata projects only the HTTP status; unknown OS/SDK errors project `native initialization failed`. The daemon key is also redacted from recognized basename metadata.
- AC5: Added `In-place CLI upgrade` to `docs/how/copilot-native-extension.md`. `docs/how/pij-rs-api.md` intentionally unchanged: it does not pin the changed refusal string.
- AC6: Linux Docker RED/GREEN and native Node contracts exercised below. CI's Ubuntu Rust job requires the prime's authorized push; not run by this coder. A real Linux Copilot `extensions_reload` is unavailable on this macOS machine; neither the SDK fixture nor a copied shell is claimed as that live-host receipt. Jordan's Linux closing receipt remains the prime's.

No argv/entrypoint, ancestry, exact-pane, process-start, incarnation or native-session matcher was weakened. No production daemon restart, push, PR, merge, global install or legacy TypeScript edit.

## RED before production fix

All commands run from the worktree. Docker mounts only this worktree; Cargo target is `/tmp/pij-target` inside the disposable container, never the host `target/`.

```sh
docker run --rm --platform linux/arm64 -v "$PWD":/w -w /w -e CARGO_TARGET_DIR=/tmp/pij-target rust:1.98.0 /usr/local/cargo/bin/cargo test -p pij-daemon replaced_executable -- --nocapture
```

Image digest: `sha256:620dbcd124499c59e2406d3741574b5c5838cf9eb9656f0c3a03948f79b02959`.
Only the regression existed during this run; the normalization fix and replacement field did not yet exist. The final field assertion was added after this behavioral RED so the pre-fix test could compile. Exit 101, verbatim excerpt:

```text
running 1 test
test registration::tests::replaced_executable_accepts_only_the_actual_copilot_host ... FAILED

failures:

failures:
    registration::tests::replaced_executable_accepts_only_the_actual_copilot_host

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 364 filtered out; finished in 0.00s


thread 'registration::tests::replaced_executable_accepts_only_the_actual_copilot_host' (6683) panicked at crates/daemon/src/registration.rs:1664:13:
assertion `left == right` failed: copilot, argv0=copilot
  left: false
 right: true
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
error: test failed, to rerun pass `-p pij-daemon --lib`
```

macOS `~/.cargo/bin/cargo test -p pij-daemon native_host_refusal_names_observed_basename_and_replacement -- --nocapture` also failed before the diagnostic fix (exit 101):

```text
running 1 test
thread 'registration::tests::native_host_refusal_names_observed_basename_and_replacement' (1276439323) panicked at crates/daemon/src/registration.rs:1678:9:
native Copilot registration refused: claimed pid is not an actual Copilot host executable
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
test registration::tests::native_host_refusal_names_observed_basename_and_replacement ... FAILED
```

The initial native helper/identity/reporter selection ran RED (7 failures, exit 1): helper cases failed because the new helper did not exist; terminal advice still promised retries; a terminal event following registration-wait was suppressed (`1 !== 2`). The safe host-refusal projection test separately ran RED (exit 1).

Linux `node:24.13.0` subprocess RED, before the fix:

```sh
docker run --rm --platform linux/arm64 -v "$PWD":/w -w /w node:24.13.0 node --test --test-name-pattern='Linux replaced host' .copilot/extensions/pij/extension.test.mjs
```

```text
✖ Linux replaced host reaches native registration and message acknowledgement (5025.2899ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5071.835441
```

This failure was the bounded wait for acknowledgement: the pre-fix host matcher refused the suffixed executable. Node image digest: `sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206`.

## GREEN — Linux

```sh
docker run --rm --platform linux/arm64 -v "$PWD":/w -w /w -e CARGO_TARGET_DIR=/tmp/pij-target rust:1.98.0 /usr/local/cargo/bin/cargo test -p pij-daemon
```

Exit 0. Selected verdict lines, verbatim:

```text
test registration::tests::kernel_executable_normalization_strips_only_the_exact_trailing_marker ... ok
test registration::tests::native_host_refusal_names_observed_basename_and_replacement ... ok
test registration::tests::replaced_executable_accepts_only_the_actual_copilot_host ... ok
test result: ok. 367 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 13.33s
```

Full daemon package included all integration targets, not only the new regression. Final tail:

```text
test result: ok. 18 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.68s

   Doc-tests pij_daemon

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Existing opt-in `native_runtime_cold_resume` was ignored by its declared test attribute. Existing timezone-separation property printed its local==UTC capability skip; agreement still ran.

```sh
docker run --rm --platform linux/arm64 -v "$PWD":/w -w /w node:24.13.0 node --test .copilot/extensions/pij/extension.test.mjs .copilot/extensions/pij/identity.test.mjs .copilot/extensions/pij/store.test.mjs
```

Exit 0, including the three Linux-only subprocess cases:

```text
✔ Linux replaced host reaches native registration and message acknowledgement (74.030566ms)
ℹ tests 171
ℹ suites 0
ℹ pass 171
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8223.825045
```

One additional terminal-bootstrap integration regression was subsequently added. Its Linux run (`--test-name-pattern='terminal bootstrap refusal' .copilot/extensions/pij/extension.test.mjs`) passed:

```text
✔ terminal bootstrap refusal names safe failure and restart without exposing remote text (105.188845ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 150.817344
```

## GREEN — native extension on macOS

`just copilot-native-test` is the repository's Node test entrypoint. Root `npm test` runs Vitest, not these `.mjs` contracts; the root suite is covered by `harness checks` separately.

Final native run, exit 0:

```text
ℹ tests 172
ℹ suites 0
ℹ pass 169
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
ℹ todo 0
ℹ duration_ms 7709.650958
```

The three skips are precisely the Linux-only executable-observation subprocess tests, exercised in Docker above.

## GREEN — macOS Rust workspace

```sh
~/.cargo/bin/cargo test --workspace
~/.cargo/bin/cargo clippy --all-targets -- -D warnings
~/.cargo/bin/cargo fmt --all -- --check
```

Executed in that order with `&&`; composite exit 0. Workspace: 1,057 passed across 85 suite summaries, 8 declared ignored tests. Selected regression lines:

```text
test registration::tests::kernel_executable_normalization_strips_only_the_exact_trailing_marker ... ok
test registration::tests::native_host_refusal_names_observed_basename_and_replacement ... ok
```

Clippy tail, verbatim:

```text
    Checking pij-store v0.1.0 (/Users/jordanknight/pi-hacking/fs3-copilot-replaced-exe/crates/store)
    Checking pij-daemon v0.1.0 (/Users/jordanknight/pi-hacking/fs3-copilot-replaced-exe/crates/daemon)
    Checking pij-cli v0.1.0 (/Users/jordanknight/pi-hacking/fs3-copilot-replaced-exe/crates/cli)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 25.97s
```

`cargo fmt --all -- --check` produced no output and exited 0. `just skill-check` is not defined in this checkout, so the guide's conditional gate is not applicable.

## Root npm/Vitest gate

`just test` executes `npm run test` → `vitest run`. Full-suite exit 0, verbatim tail:

```text
 Test Files  240 passed | 4 skipped (244)
      Tests  5272 passed | 22 skipped (5294)
   Start at  10:17:14
   Duration  29.19s (transform 11.57s, setup 0ms, import 25.26s, tests 281.37s, environment 11ms)
```

Earlier full inventories failed the existing `cli.inbox.integration.test.ts` with `pij inbox` exit 4. Its immediate scoped run passed 17/17, then the full suite above passed without product-source changes after concurrent Rust work ended. Contention is an inference, not an established root cause; `DL-002` retains the failure-versus-isolated-pass distinction. An interim inventory also saw native-test and windows-compat failures; later inventory passed both, all static checks and smoke, leaving only the transient full-suite failure before the run above.

Prime ruling: identify this as the ledgered **2026-09-07 load-contention flake** and commit after the single full no-concurrent-Cargo rerun is green. That rerun is the 5,272-pass result above. No stash, baseline rerun, or out-of-scope legacy fix was needed.

The final full inventory was already running when that ruling arrived. It finished with `test`, `copilot-native`, local-paths, typecheck, lint, smoke, package audit and snapshots passing; `windows-compat` alone re-encountered **the same** inbox integration exit-4 failure. No further rerun or legacy-code fix was performed. The source commit follows the prime's explicit green-full-Vitest ruling; the aggregate harness inventory is **not represented as green**.

Final inventory (`harness checks | jq .`) at `2026-09-09T00:19:59.200Z`, verbatim excerpts:

```text
  "status": "error",
  "error": {
    "code": "checks-failed",
    "message": "1 check(s) failed: windows-compat.",
```

Failing sensor's retained tail:

```text
  {
-   "code": 0,
+   "code": 4,
    "stderr": "",
  }

 ❯ success .pi/extensions/pij/cli.inbox.integration.test.ts:101:57
 ❯ expectClaims .pi/extensions/pij/cli.inbox.integration.test.ts:558:20
 ❯ .pi/extensions/pij/cli.inbox.integration.test.ts:682:3
```

The `jq` formatting process exits 0 independently of the harness failure; the authoritative gate result is the JSON `status:error`, not the pipeline exit. Attribution was advisory `warn` for the pre-existing plan commit `58cf6706ed641b650c33e117e47c6cc5cc33187b` lacking derivable `Pij-Prime`; no historical identity was invented or rewritten.

## Harness observations and proof ceiling

`rustc 1.98.0 (88d9e12ae 2026-08-18)` matches `rust-toolchain.toml`. Native JS was formatted with repository Biome, Rust with `cargo fmt`.

`just worktree-deps` created 358 local links and proved `.bin/vitest`, `.bin/tsc`, and `@types/node` readiness without modifying main's dependencies. Subsequent pre-fix `harness boot` passed readiness/typecheck but timed out after 90 seconds in smoke after `file-watch-notify` failed. Observation `DL-001` records this. `GFT-001` records the encoded unlink/subprocess regressions and the remaining live-Linux proof ceiling.

A new assertion was initially attached to the wrong existing scenario: cold-resume registration is owned by the bridge and truthfully emits `receive-held`, not outer-bootstrap `extension-unavailable`. It was moved to a distinct bootstrap-refusal test; lifecycle code was not changed to satisfy the wrong assertion.

Highest-leverage remaining improvement offered to prime: encode the pinned Docker command plus container-local Cargo target as a `just` recipe so macOS coders cannot accidentally present macOS-only gates as Linux `/proc` proof. The shipped regression tests already improve deterministic backpressure; live `extensions_reload` remains a distinct acceptance grade.
