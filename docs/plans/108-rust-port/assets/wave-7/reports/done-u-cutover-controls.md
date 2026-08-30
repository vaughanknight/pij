# Done — u-cutover-controls

## Result

Plan 108 req-0019 is implemented on branch `s108/w7-cutover`.

- The in-process Pi/OMP extension selects pij-rs by default and never falls back when the selected Rust daemon is unavailable.
- `PIJ_DAEMON_GENERATION=legacy` is the explicit per-seat forceback. It bypasses a reachable pij-rs daemon.
- Rust client, Rust daemon, and extension endpoint/state controls resolve explicit CLI, then environment, then default as applicable.
- Every present-but-empty or malformed environment value fails loudly with the variable name and quoted value.
- The extension now decodes `/v1/seats` as the existing `FederatedRoster { seats, unavailable }` contract. This closes reviewer R7-1, where `seats.find` received the roster object and registration was unreachable.

Initial implementation commit: `acb1399a` (`feat(rust): add daemon cutover controls`). Round-1 fixes for Bun refusal recognition, recovery guidance, and whitespace state-dir parity land with this final receipt update.

Composed sidecars head `e17e7488` was merged as true ancestry before the final gate.

## Control table

| Surface | CLI | Environment | Default | Resolution / malformed rule |
|---|---|---|---|---|
| Extension generation | — | `PIJ_DAEMON_GENERATION=rs|legacy` | `rs` | Explicit env wins. Values are case-sensitive and exact. Empty, whitespace-padded, or unknown values name `PIJ_DAEMON_GENERATION` and the quoted value. `rs` never falls back. |
| Extension Rust endpoint | — | `PIJ_RS_ADDR` | `127.0.0.1:7461` | Env then default. Requires `host:port`, port 1..65535. Empty/malformed names `PIJ_RS_ADDR` and value. |
| Rust client endpoint | `--addr` | `PIJ_RS_ADDR` | `127.0.0.1:7461` | CLI > env > default. Clap fields are `Option<T>`, so an explicit flag equal to the default still wins. Empty/malformed names the selected flag/variable and value. |
| Rust daemon bind | `daemon --bind` | `PIJ_RS_BIND` | `127.0.0.1:7461` | CLI > env > default. Requires `IP:port`, port 1..65535. Empty/malformed names the selected flag/variable and value. |
| Extension state/key directory | — | `PIJ_RS_STATE_DIR` | `$HOME/.pij-rs` | Env then default. Empty or whitespace-only values are named errors, never cwd-relative key paths. |
| Rust client/daemon state directory | `--state-dir` | `PIJ_RS_STATE_DIR` | `$HOME/.pij-rs` (temp fallback only when `HOME` is absent) | CLI > env > default. Empty or whitespace-only values name `PIJ_RS_STATE_DIR` and preserve the quoted value. |

No new dependency and no daemon composition line are required for this unit. Bind resolution stays in the existing `pij-rs` CLI composition root before `run_daemon`; the PM-owned daemon wiring files need no cutover edit.

## Both-hosts matrix

Every leg used the same worktree extension source. Registration evidence came from the authority, not the host exit code or model reply.

| Host | Generation | Seat | Authority observation | Push/reply |
|---|---|---|---|---|
| plain Pi | rs | `pij-little-rascal` | authenticated Rust row, `harness=pi`, `(pid,proc_start)=(70226,20260831084727)` | `pi-rs-matrix` received; `PI_RS_REPLY` persisted with `in_reply_to=pi-rs-matrix` |
| OMP | rs | `pij-rapid-wren` | authenticated Rust row, `harness=omp`, `(pid,proc_start)=(2088,20260831085350)` | `omp-rs-clean` received; `OMP_RS_REPLY` persisted with `in_reply_to=omp-rs-clean` |
| plain Pi | legacy | `pij-little-rascal` | `/tmp/.../legacy-shared/pij-little-rascal.json` exists while simultaneously-live Rust authority reports `seats:[]` | `PI_LEGACY_REPLY` delivered through the TS file wire |
| OMP | legacy | `pij-rapid-wren` | `/tmp/.../legacy-shared/pij-rapid-wren.json` exists while simultaneously-live Rust authority reports `seats:[]` | `OMP_LEGACY_REPLY` delivered through the TS file wire |

Committed transcripts:

- [plain Pi / rs](./transcript-u-cutover-pi-rs.md)
- [OMP / rs](./transcript-u-cutover-omp-rs.md)
- [plain Pi / legacy](./transcript-u-cutover-pi-legacy.md)
- [OMP / legacy](./transcript-u-cutover-omp-legacy.md)

All daemons used fresh `/tmp/pij-w7-cutover-final.srxRKd/**` stores and ports 17682, 17683, or 17685. The production daemon, production store, and canonical checkout `.pi/**` were not touched.

## Negative selected-Rust case

This case was exercised in both hosts. The transcript below is the decisive OMP/Bun leg after FIX-1, with no listener on `127.0.0.1:17684`:

```text
Host: /Users/jordanknight/.npm-global/bin/omp (Bun runtime)
PIJ_DAEMON_GENERATION=rs
PIJ_RS_ADDR=127.0.0.1:17684
Error: pij: No pij daemon answered at 127.0.0.1:17684. Start pij-rs there or set PIJ_RS_ADDR;
set PIJ_DAEMON_GENERATION=legacy to use the legacy TS daemon for this seat.
The state directory came from PIJ_RS_STATE_DIR, then HOME/.pij-rs (/tmp/pij-w7-cutover-fix-negative).
daemon error
```

The same named refusal was observed in plain Pi/Node. The throwaway legacy homes remained absent. Both runtimes failed loudly; neither fell back nor manufactured legacy residue.

## Focused proof

```text
npx vitest run daemon-http.test.ts rust-runtime.test.ts
2 files passed; 8 tests passed

npx vitest run daemon-http.test.ts daemon-wire.test.ts  # round 2
2 files passed; 13 tests passed

cargo test --locked -p pij-cli
31 passed (6 suites)

cargo test --locked -p pij-cli malformed_environment_values_name_the_variable_and_value
1 passed

just typecheck
PASS

npx biome check <changed TS files>
No fixes applied
```

Mutation witnesses, each using `harness/scripts/flow-pair-mutate.sh` (which asserts the edit matched, restores, and reruns):

1. Disabled the explicit `legacy` branch: `daemon-http.test.ts` went red (`1 failed, 6 passed`), then green (`7 passed`) after restore.
2. Returned the whole `FederatedRoster` instead of `.seats`: `rust-runtime.test.ts` went red (`1 failed`), then green (`1 passed`) after restore.
3. Replaced explicit CLI address selection with the default: the precedence test went red, then green after restore.
4. Removed Bun's direct `ConnectionRefused` discriminator: the dual-runtime refusal suite went red (`1 failed, 7 passed`), then green (`8 passed`) after restore.
5. Removed trimming from Rust state-dir validation: the whitespace-value test went red, then green after restore.

## Gate

Final gate ran after merging composed head `e17e7488`. `CARGO_TARGET_DIR` was unset, so Cargo used this worktree's own freshly rebuilt `target/`; no cross-worktree artifact cache participated.

```text
CARGO_INCREMENTAL=0
unset CARGO_TARGET_DIR
cargo run --locked -p pij-testkit --bin pij-gate

pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests, and the tree
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  9 crates, 0 violations

pij-gate: all stages green
```

Full persisted output: [gate-u-cutover-controls.txt](./gate-u-cutover-controls.txt).

Observed environment:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/tmp available: 166 GiB
```

## Disclosed reds and harness finding

- Initial `harness boot` was red before this change because the original worktree had no root `node_modules/@types/node`. Per PM ruling, it was not repaired or counted as the Rust proof surface. Focused TS checks used a temporary read-only symlink to the canonical checkout's existing `node_modules`; it is ignored and uncommitted.
- Repo-wide `just lint` remains red on pre-existing warnings outside this fence. The four changed TS files pass Biome directly.
- The first isolated `pij-gate` attempt used the now-withdrawn shared `CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/.s108-target`. It reused another worktree's in-flight `pij-testkit` binary and falsely reported a stale `pij-sidecars` allowlist entry that did not exist in this branch. Final proof uses only this worktree's `target/`; this is captured as harness observation `DL-001`.
  The operational lesson: a claim about a commit is valid only when the measured tree and artifacts belong to that commit. A live working tree can make an old commit look fixed; a shared build directory can make a clean tree look broken. Inspect both before accepting either a green or red verdict.

## Fence and shared paths

Unit-authored paths:

- `.pi/extensions/pij/adapters/{daemon-http.ts,daemon-http.test.ts,rust-runtime.test.ts}`
- `.pi/extensions/pij/index.ts`
- `crates/cli/src/{lib.rs,main.rs}`
- this report, four transcript files, and the gate receipt under `assets/wave-7/reports/`

Unit-authored changes touched none of the PM-owned shared paths: `Cargo.toml`, `Cargo.lock`, `crates/daemon/Cargo.toml`, `crates/daemon/src/lib.rs`, or `crates/testkit/arch-allowlist.toml`. Those paths appear only through the separately-authored composed-head merge.

## Assumptions

1. req-0019 and the PM ruling supersede `WIRE-CONTRACT.md`'s old automatic connection-refused-plus-residue legacy fallback. Legacy is explicit only.
2. Generation tokens are exact and case-sensitive: `rs` and `legacy` only.
3. `PIJ_RS_ADDR` permits DNS hostnames for clients/extensions; daemon bind remains an actual socket address (`IP:port`).
4. Existing legacy descriptors record `harness:"pi"` for both Pi and OMP and distinguish OMP with `runtimeBin:"omp"`; this unit preserves that legacy format.
5. A host may swallow an extension failure and still answer normally. Therefore no matrix leg counts without the authority row/file included in its transcript.
