# Plan 146 — coder evidence

Seat: `pij-secret-sole`. Worktree/branch: `fs3-telegram-sender-tag` / `146-telegram-sender-tag`.

Source commit: **`fb13a12b2ec47e4a197199578e9e334a08ac236a`** (one commit; eight scoped source/test/doc files). C11 trailers were derived immediately before committing: seat `pij-secret-sole`, prime `pij-minor-unicorn` (`role=prime` tier), plan `146-telegram-sender-tag`.

Implementation and full Rust gate verified. Full `harness checks` completed with only the Vitest sensor failing; baseline Vitest passed. The prime authorized one restored-tree Vitest run, which also failed: `skills/flow-pair/test/cli-observe.test.ts:45` hit `ENOTEMPTY` in `afterEach` cleanup. **Not claiming an all-green harness gate.** Per the prime's ruling, this failure is recorded and no further iteration or unrelated repair is performed. No production daemon restart, Telegram send, credential read, push, PR or merge was performed.

This report is a requested, intentionally uncommitted handoff artifact so it can name the exact source commit without a self-referential SHA or a second commit. Operator documentation is committed at `docs/how/pij-telegram.md`.

## Acceptance and amendments

- AC1–2: every emitted text bubble starts with `[sender-seat] `, followed by `[folder-basename] ` when known. Registry lookup is injected through the daemon/sidecar composition. Missing seats, empty/root folders and oversized context fall back to the bare tag. No git/filesystem probe on send.
- AC3: ported TS boundary preference and numbering. The entire bubble fits 4000 UTF-16 units, including sender/context and `(i/n)`. UTF-8 boundaries/surrogate pairs remain intact. Tests cover ordered lossless 9,000-character output, newline preference and 11-part digit growth. First parts carry `(1/n)` too.
- AC4: strip only an exact leading complete prefix or sender tag, with the same separator boundary as TS. Different tags and lookalike suffixes remain body content.
- **AC5a supersedes AC5**, per prime's live amendment: original HTTP failures were retried, not marked done. Retry policy remains unchanged. Each failed send attempt records `telegram.outbound-delivery-failed` at its conversation seat with `conversation`, `from`, `msg_id`, one-based `attempt`, `part`, `parts`, `http_status` and token-free `reason`. Transport failures use null status. The returned adapter message is the same decodable JSON; a spine-write failure additionally names `persistence_error` instead of hiding it.
- AC6: RED first over loopback fake HTTP; test clients have explicit short timeouts. Added nine outbound regression tests; all existing sidecar tests pass.
- **AC7 relaxed by prime**: no production or isolated-daemon Telegram proof. `TelegramConfig::api_root` is injectable only in Rust, while `TelegramConfig::load` hardcodes the public root. Scratch credentials alone cannot route a daemon to a stub. This is a real proof gap, not claimed live coverage.
- **AC8 added by prime**: `pij-rs sidecar telegram --body-file <path|->` reuses `resolve_send_body`, including stdin, preserving byte-exact quotes, newlines, backslashes, shell metacharacters and Unicode. `--body` / `--body-file` conflict in clap. The shipped CLI test exercises both file and stdin through a private authenticated daemon HTTP router into the queued Telegram body; no Telegram worker is started.

## RED evidence

All commands ran from the worktree; Rust via `~/.cargo/bin/cargo`.

1. `cargo test -p pij-sidecars --lib outbound_tests -- --nocapture` — exit 101, **0 passed; 5 failed** before behavior changes:
   ```text
   tag_is_first_for_an_unknown_sender:
     left: ["hello"]
    right: ["[pij-sender] hello"]
   long_body_is_numbered_ordered_and_lossless_with_prefix_in_budget:
     9000 characters must be split
   rejected_send / ok_false / failed_later_part:
     durable failure event
   ```
2. After registry-constructor plumbing, `cargo test --locked -p pij-sidecars --lib context_and_exact_leading_tags -- --nocapture` — exit 101:
   ```text
   folder="/work/my-repo/", body="hello"
     left: ["hello"]
    right: ["[pij-sender] [my-repo] hello"]
   test result: FAILED. 0 passed; 1 failed
   ```
3. AC8 shipped CLI RED, `cargo test --locked -p pij-cli --test spawn shipped_cli_registers_sends_reads_acks_and_does_not_read_twice -- --nocapture` — exit 101:
   ```text
   error: unexpected argument '--body-file' found
   tip: a similar argument exists: '--body'
   Usage: pij-rs sidecar telegram --body <BODY>
   test result: FAILED. 0 passed; 1 failed
   ```

## GREEN evidence

- `cargo test --locked -p pij-sidecars`: **16 unit + 10 integration tests passed**, zero failed. This includes nine new outbound regressions, reply-binding behavior, inbound cursor persistence, wrong-chat egress refusal and no resend after binding-persistence failure.
- AC8 shipped CLI command above: **1 passed; 0 failed**, including byte-exact file and stdin body assertions.
- Actual `target/debug/pij-rs sidecar telegram --help` exposes:
  ```text
  --body-file <BODY_FILE>  Read the literal body from a path, or from stdin with `-`
  ```
- Final `RUST_TEST_THREADS=1 cargo run --locked -p pij-testkit --bin pij-gate` — exit 0:
  ```text
  pij-gate verdict
    toolchain PASS  rustc 1.98.0 == pin
    lock      PASS  Cargo.lock matches the manifests, and the tree
    fmt       PASS  cargo fmt
    clippy    PASS  cargo clippy
    test      PASS  cargo test
    arch      PASS  9 crates, 0 violations
  pij-gate: all stages green
  ```

## Harness completion evidence

The single nonconcurrent `harness checks` rerun completed in 118.40s, exit 1:
```text
checks-failed: 1 check(s) failed: test.
```
Local-paths, typecheck, lint, copilot-native and windows-compat passed. Smoke no
longer failed; Vitest was the only failing sensor. The tool truncated the
single-line JSON receipt before the per-test diagnostics, so no specific test
failure name is claimed from that run.

Per the prime's baseline rule, saved the owned diff using private `git stash create`
object `2dcd883643d94e314fb5922ea5e2261cfed235c7`, moved the two new files aside,
restored tracked source to HEAD, and ran `just test` exactly once with no Cargo.
Result: exit 0, **241 test files passed / 4 skipped; 5306 tests passed / 22 skipped**.
Restored the exact stash object and both new files immediately; the shared stash
stack was never changed. This proves the baseline, not a restored-146 Vitest pass.

### Authorized restored-146 run — final sensor result

Prime authorized `just test` once more on restored 146, with no concurrent Cargo,
and explicitly ruled to append the result and stop on red. Executed against
`fb13a12b2ec47e4a197199578e9e334a08ac236a`; exit 1, wall time 30.44s.
Full output is retained in session artifact `artifact://47`.

```text
FAIL skills/flow-pair/test/cli-observe.test.ts
  > flow-pair observe — CLI subprocess (T006)
  > success: stdout = exactly 'diffId: diff-NNNN' (one line, exit 0)
Error: ENOTEMPTY, Directory not empty:
/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/observe-cli-9vRSye
  skills/flow-pair/test/cli-observe.test.ts:45:3
  44| afterEach(() => {
  45|   rmSync(tmpRoot, { recursive: true, force: true });
    |   ^
  46| });

Test Files  1 failed | 240 passed | 4 skipped (245)
     Tests  1 failed | 5305 passed | 22 skipped (5328)
  Duration  29.93s
```

The observed failure is temporary-directory cleanup, not a Telegram assertion.
Its underlying cause was not investigated or attributed beyond that evidence.
No source changes or further test runs followed.

## Earlier gate failures, not erased

- Initial boot reported missing worktree dependencies. `just worktree-deps` created 358 worktree-local links and reported READY; main's dependencies were not mutated.
- Pre-edit `harness boot`: worktree-deps/typecheck passed; `file-watch-notify` smoke failed and the aggregate smoke exceeded its 90,003 ms deadline. Prime identified known load contention and authorized exactly one full nonconcurrent rerun; no smoke code is changed here.
- First Rust gate: toolchain/lock/fmt/clippy/arch passed; two native Copilot HTTP tests failed with process observation `Ok(None)`. Prime diagnosed the fixtures' hidden `sleep 60` deadline under concurrent Docker build load and is fixing that outside 146. `native_tests.rs` is untouched. Final serial full Rust gate passes.
- An intermediate post-AC8 gate caught my parser test using `expect_err` on non-Debug `Cli`. Changed only the test to `.err().expect(...)`; final full gate passes.

## Known consequence and proof ceiling

Whole-job retry can duplicate earlier successful bubbles after a later-part rejection. This is explicitly retained under AC5a; `(1/n)` makes repeats recognizable but is not idempotency. Per-part progress/idempotency belongs to a separate plan. Reply binding remains updated only after the whole outbound send succeeds.

No Telegram API/production bridge send was exercised. Fake HTTP proves emitted payloads, ordering and failures; the private daemon HTTP CLI test proves body ingestion. Production Telegram presentation and daemon-to-stub composition remain unproven here and production proof belongs to the prime.

## Retrospective / harness handoff

Encoded improvement: permanent outbound HTTP regressions now fail on anonymous bubbles, oversized/lossy chunks and invisible failed attempts; actual CLI file/stdin proof catches body loading regressions. Operator documentation now separates Rust behavior from legacy TS behavior.

Highest-leverage next improvement: make the Telegram API root injectable from the same explicit scratch configuration boundary as the credential path, then add an isolated-daemon-to-stub smoke scenario. Prime requested this finding be retained, not implemented in 146. It would close the current real-daemon proof gap without production credentials.

Other captured friction: Rust LSP references returned empty for known callsites, so explicit scoped callsite searches plus full compilation supplied coverage; boot and native fixture deadline failures above. Captured as DL-001 through DL-003 in the worktree harness buffer. PM may harvest this report into the canonical retrospective/governance ledger; no PM-owned plan/flow/government state was edited.
