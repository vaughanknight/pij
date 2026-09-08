# list --here — delivery report

Branch: `fix/list-here`. The containing commit is the delivery; the final peer message supplies its SHA.

## Result

`pij-rs list --here` and shim `pij list --here` now select seats whose recorded `folder` equals the caller's canonical cwd. Bare/true/false boolean forms work; a path-valued native flag returns a decodable `E-RS-ARG` refusal. Unfiltered list behavior is retained.

- Native argv reaches POST `/v1/seats` with caller cwd. The previously inline anomalies boolean/path rules are extracted into shared `decisions::here_from_flag` and `decisions::here_path`; anomalies and seats both use them.
- GET and POST `/v1/seats?here=<absolute-path>` share the roster projection. Absolute available paths are canonicalised; unavailable absolute paths retain their literal spelling. Relative scopes and missing caller cwd refuse rather than selecting daemon cwd. Existing filters intersect `here`; role joins, tombstone exclusion, and federation availability remain intact.
- Shim list forwards the boolean scope as an encoded `here` GET query. Sessions still rejects `--here`; unsupported role/prime/archive flags remain refused. Native list has no other filters.
- CLI help, API/unsupported status, active pij skill guidance, and its gate are updated. Removed the obsolete CLI help-text-pinning test rather than pinning the replacement wording.

## RED → GREEN proof

All three regressions were run before source implementation:

| Surface | RED receipt | GREEN receipt |
|---|---|---|
| HTTP canonical folder filtering | Returned `pij-elsewhere` and `pij-here`, expected only `pij-here` | `cargo test -p pij-daemon --test shim_http list_here`: 2 passed |
| HTTP invalid scopes | Returned HTTP 200, expected 400 | Same run proves GET and POST v2 `E-RS-ARG` refusals |
| Native CLI | Clap rejected `--here`; stdout was not a decodable envelope | `cargo test -p pij-cli --test list_here`: 1 passed |
| Shim | `list --here` returned `rs-error` | Focused generation-router regression: 1 passed |

HTTP coverage also includes POST query scoping, canonical `nested/..`, missing caller cwd, and intersection with a contradictory folder filter. Native coverage retains the unfiltered roster and rejects both inline and positional path values.

## Actual runtime and parity golden

Ran the built native executable and the real Node shim against one private real-adapter daemon at `127.0.0.1:62902`, with isolated HOME/config/state/SQLite and two registered seats backed by observed owned process incarnations. Production daemon was not used for this proof.

`crates/testkit/fixtures/golden/api/governance-client-parity.json#list_here_capture` retains the original stdout, exit codes, hashes, captured cwd, and binary SHA:

- `list --here --json`: only `pij-smoke-here`; native/shim stdout byte-equal.
- `list --here=true --json`: same scoped result; byte-equal.
- `list --here=false --json`: both seeded seats; byte-equal.
- `list --json`: both seeded seats; byte-equal.
- Native inline/positional path values: exit 2, `E-RS-ARG`.
- HTTP `here=relative` and `here=true`: HTTP 400, `E-RS-ARG`.

Updated fixture MANIFEST sha256, byte count, provenance and answer deliberately. The private daemon was stopped and scratch state removed. Both native and shim help surfaces were launched and inspected.

## Gates and known baseline failures

All commands ran from this worktree, using `~/.cargo/bin/cargo` for Rust.

| Command | Observed result |
|---|---|
| `cargo test --workspace` | Full invocation reaches known pre-existing native-host admission race; see exact test below. An earlier full run passed the daemon suite and reached corpus validation while the parity manifest update was still in flight. |
| `cargo test -p pij-daemon --lib native_sqlite_http_dead_legacy_and_uncorrelated_prebind_owners_are_not_taken_over -- --nocapture` | 1 passed, 0 failed, 351 filtered out |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 |
| `cargo fmt --all -- --check` | Exit 0 |
| `npm test` | Initial run exposed two obsolete list-here refusal cases; those cases were removed. Subsequent canonical checks reached the unrelated repeated native-host inbox registration failure below. |
| `harness checks --quick` | Local paths, typecheck, lint, native Copilot, Windows compatibility, package audit, snapshots and attribution passed; test sensor hit the known inbox admission race. Heavy smoke intentionally not run by this quick gate. |
| `just pij-skill-check` | Exit 0; active routing/help doctrine consistent |
| Baseline `harness boot` | Dependencies initially absent; `just worktree-deps` repaired worktree-local links. Typecheck passed. Existing smoke hit file-watch-notify failure and the 90-second image-see deadline. |

Native full-suite race, unchanged by this patch:

```text
http::native_tests::native_sqlite_http_dead_legacy_and_uncorrelated_prebind_owners_are_not_taken_over
left: native Copilot registration refused: process observation failed or timed out: Ok(None)
right: expected owner/pre-bind refusal
351 passed; 1 failed
```

The same Rust test passes alone. The TypeScript test sensor failed in `cli.inbox.integration.test.ts`, parameterized `ambient registration binds the host idempotently and finite wait returns v2 JSON`, at the second registration (`register` line 535, caller line 714): expected exit 0, received 4. No admission policy, production process, or unrelated test was weakened to hide these failures.

Prime ruling, received during validation: these native-host admission and boot-smoke races are known pre-existing findings in `docs/plans/archive/misc/prime-ledger-2026-09.md`; stop chasing them, record the isolated pass and commit/deliver. This report does not claim a green default full workspace or full smoke gate.

## Harness improvement and closeout

Encoded the reported injected-command mismatch as HTTP, native CLI and shim regression coverage, plus measured cross-client parity. The useful next harness improvement is a deterministic native-host admission fixture that survives full-suite load; the existing prime ledger owns that work, not this patch.

Friction captured with `harness observe`: isolated dependency bootstrap, baseline smoke timeout, and full-suite admission races. `harness observe --list --json` and `harness retro insights --json` were run; governance retros/PRD remain prime-owned. No new government documents or generated flight-plan state were written. Prime owns PRD reconciliation with the delivered SHA.

The in-flight second `harness checks --quick` rerun was cancelled on the prime's stop-chasing instruction; it is not counted as a completed gate.

No push, PR, merge, production bounce, or production mutation was performed. Only this worktree's source/tests/docs and the requested report are delivery scope.
