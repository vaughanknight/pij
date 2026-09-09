# Impl guide — 141

Read plan.md first. RED tests before code for every AC; name each test after the claim. Capture the RED output of the AC2 test on the pre-fix tree (Docker) BEFORE writing the fix — it goes in report.md verbatim.

## Where
- Rust observation: `crates/daemon/src/registration.rs` `read_native_process` (Linux cfg, ~:1141) is the ONLY place the kernel link is read. Add `normalize_kernel_exe` next to it (cross-platform, unit-tested on every OS with string fixtures: `"/a/copilot (deleted)"` → `("/a/copilot", true)`, `"/a/copilot"` → unchanged, `"/a/copilot (deleted) "`/`"(deleted)"` alone → unchanged). `NativeProcess` gets `executable_replaced: bool`; the darwin `parse_native_process` sets false. `is_copilot_host` (:1113) does not change.
- Rust refusal text: registration.rs:384 — include basename + `replaced` in the `native_refusal(...)` message. Check whether the string is pinned anywhere (`grep -rn "is not a Copilot host\|not the actual native host" crates docs`) before changing it; regenerate goldens deliberately if so.
- Linux-only Rust test: beside `real_shell_process_is_not_an_actual_copilot_host` (:1570). Same wait-for-`ready` discipline. Tempdir via `tempfile` if already a dev-dep, else `std::env::temp_dir()` + pid-unique name; always kill the child and remove the dir.
- Extension: `store.mjs` — export `normalizeExecutable(command)`; `extension.mjs:36` wraps the Linux readlink with it and sets `replaced`. `resolveNativeHost` regex unchanged. `createNativeReporter` — split the advice by `event.kind`; the terminal kind is `extension-unavailable`, the loop kind is `registration-wait`. Existing reporter tests live in `store.test.mjs` (grep `createNativeReporter`); extend, do not fork.
- Docs: `docs/how/copilot-native-extension.md` (see #375's section for tone).

## Gates
`~/.cargo/bin/cargo test --workspace`, `clippy --all-targets -- -D warnings`, `fmt --check`, `npm test`, `just skill-check` if present, and the Docker Linux run of `-p pij-daemon` (all tests, not only the new one — the darwin/linux cfg split has bitten before). Report tails, not summaries.

## Docker recipe
`docker info` works on this host (linux aarch64). Use the image matching `rust-toolchain.toml`; mount the WORKTREE only; set `CARGO_TARGET_DIR=/w/target-linux` (git-ignored — verify with `git check-ignore -v target-linux` and add to `.git/info/exclude` if not). First build is slow (minutes); run it in the background (`pij bg create`) rather than blocking your turn.

## Deliverable
One commit on branch `141-copilot-replaced-executable` with C11 trailers (`pij-rs commit-trailers`), report at `docs/plans/141-copilot-replaced-executable/report.md`: sha, RED test names + their red output (Docker), gate tails (macOS + Docker + npm), anything not run and why. No push, PR, merge or bounce — prime does those.
