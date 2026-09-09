# Plan 142 — implementation evidence

Worktree: `/Users/jordanknight/pi-hacking/fs3-copilot-immediate-steer`  
Branch: `142-copilot-immediate-steer`  
Issue: https://github.com/AI-Substrate/pij/issues/398

## Scope and API evidence

The only production-code edit is `.copilot/extensions/pij/store.mjs:881`, changing native `send` mode from `enqueue` to `immediate`. The plan calls this `NativeBridge.deliver`; in this revision the actual call lives in its existing `enqueue` helper, reached by `deliver`. No other production line changed. No Rust changes, daemon rebuild/restart, production relinking, push, PR or merge.

`copilot --version`: `GitHub Copilot CLI 1.0.84-2.`

Authoritative active CLI extension typing chain:

- `/Users/jordanknight/.copilot/pkg/darwin-arm64/1.0.84-2/copilot-sdk/extension.d.ts:59`: `joinSession(...): Promise<CopilotSession>`.
- Same SDK `session.d.ts:139`: `send(options: MessageOptions): Promise<string>`.
- Same SDK `types.d.ts:2713-2717`: message delivery documentation and `mode?: "enqueue" | "immediate"`.

The npm-installed `@github/copilot` package also permits the value at `/Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/sdk/index.d.ts:5768`. Its `send` documentation at lines 3829-3834 states that immediate injects during the current turn. The active bundled extension declarations above additionally establish the native message-ID return contract.

## RED first

Changed the production mode before changing the three existing assertion sites (store fixture, draft-safety assertion, actual-extension-shell assertion). Ran from this worktree:

```sh
node --test --test-timeout=5000 --test-name-pattern='acceptance is persisted before|native delivery proceeds during recent human typing|actual extension shell delivers during recent human typing' .copilot/extensions/pij/store.test.mjs .copilot/extensions/pij/extension.test.mjs
```

Observed output, exit 1:

```text
✖ actual extension shell delivers during recent human typing without a typing hold (95.980583ms)
✖ acceptance is persisted before tuple-bound acknowledgement, not model completion (5001.454375ms)
✖ native delivery proceeds during recent human typing without submitting the human draft (1.636ms)
ℹ tests 3
ℹ pass 0
ℹ fail 2
ℹ cancelled 1

extension.test.mjs:445:11
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ 'immediate'
- 'enqueue'

store.test.mjs:914:1
'test timed out after 5000ms'

store.test.mjs:2969:10
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
0 !== 1
```

The default fake's mode assertion throws inside native `send`; the bridge intentionally converts that into ambiguous-send failure, so the acceptance test waits until its explicit deadline rather than displaying the inner assertion. The draft test fails before its wrapped fake records a send. These are two assertion failures and one cancelled timeout, not three directly surfaced assertion errors.

Also ran the new busy-turn regression against a temporary copy of `store.mjs` restored to `mode: "enqueue"`, leaving the working source untouched. It failed deterministically without a timeout:

```text
✖ busy native turn consumes immediate steering and journals its returned message ID (4.243458ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ undefined
- 'steering'
exit: 1
```

The temporary source/test copies were removed automatically.

## Scenario coverage and scoped GREEN

- Idle: existing `acceptance is persisted before tuple-bound acknowledgement, not model completion` exercises the default native fixture, retained returned ID, durable acceptance and consumed-not-complete grade.
- Busy: new `busy native turn consumes immediate steering and journals its returned message ID` starts with an unfinished human turn. The fake consumes immediate delivery with `delivery: "steering"`; the bridge retains the returned native ID, acknowledges consumption without completion, rejects unrelated human-turn completion and releases only on the owned terminal event.
- Follow-up: existing `actual extension shell acknowledges then waits for native completion before second delivery` proves the first correlated completion permits the next message/ACK. Existing `post-ack barrier cannot release a later send from earlier generation events` also remains green.

The new test uses the existing injected native session. The shell tests launch the actual extension module in owned subprocesses with fake SDK/process seams, real local HTTP and disk. These are deterministic transport contracts, not a fresh live Copilot/model trial and not proof that every upstream queue race is fixed.

```text
just copilot-native-test
ℹ tests 163
ℹ pass 161
ℹ fail 0
ℹ cancelled 0
ℹ skipped 2
ℹ duration_ms 7457.784291
```

The two skips are Linux-only host-identity scenarios on Darwin. `just copilot-native-test` is the repository's node:test entry point; there is no extension-local package.json, and root `npm test` invokes Vitest instead.

```text
just pij-skill-check
pij-skill-check: all green
```

There is no `just skill-check`; the existing recipe is `just pij-skill-check`.

```text
just lint
Checked 538 files in 341ms. No fixes applied.
Found 1 info.
```

Lint exit 0. Informational pre-existing schema-version notice: configured Biome schema 2.0.0, CLI 2.4.14. Initial lint found one formatting issue in the new test; scoped Biome autofix resolved it.

After formatting, the focused command covering idle, busy, follow-up, draft preservation and the actual-shell mode assertion passed all five tests (0 failures/skips, 288.42675ms).

## Documentation

`docs/how/copilot-native-extension.md` now documents immediate steering/idle behavior, unchanged receipt/barrier contracts, recipient extension reload or fresh CLI activation, no daemon rebuild/restart, and no conversion/replay of already-accepted queued entries. It explicitly limits the claim to a delivery-semantics change.

## Harness observations

Initial `harness boot` reported missing worktree dependencies. `just worktree-deps` created 358 worktree-local links using the supported recipe; main's node_modules was not modified. Subsequent boot passed dependency readiness and typecheck but timed out in smoke after 90002ms, with `file-watch-notify` already red. Full `harness checks` was then launched for the complete per-sensor verdict.

Captured `DL-001` via `harness observe` in `.harness/temp/agent/session-buffer.md`. Encoded improvement: the new bounded busy-steering regression catches reverting the mode without relying on the shared fixture's swallowed assertion/ACK timeout. Further improvement candidate for the owner: expose fixture send failures directly to awaiting tests rather than forcing them to time out. No unrelated harness changes were made.

## Final gate and delivery

Commit: `8eadd23311a0c52e50bd05f937631a1bd30b8e04`  \
Subject: `fix(copilot): steer native peer messages immediately`

One commit, four scoped source/test/documentation files. The evidence report is
intentionally outside that commit so it can identify the final commit SHA.
The commit carries the freshly derived C11 trailers:

```text
Pij-Seat: pij-due-zoltan
Pij-Prime: pij-minor-unicorn
Pij-Plan: 142-copilot-immediate-steer
```

Full gate, from the worktree with
`VITEST_MAX_WORKERS=4 VITEST_MAX_THREADS=4 CARGO_BUILD_JOBS=4`:

```sh
harness checks
```

Exit 0; wall time 135.53 seconds. Observed envelope fields:

```json
{
  "command": "checks",
  "status": "ok",
  "timestamp": "2026-09-09T00:23:35.990Z",
  "data": {
    "ok": true,
    "ran": [
      "local-paths", "typecheck", "lint", "test", "copilot-native",
      "windows-compat", "smoke", "pkg-audit", "snapshots", "pij-commit-trailers"
    ],
    "skipped": []
  }
}
```

This is an excerpt of the actual envelope, not a second invocation. The complete
required inventory passed, including root Vitest and smoke; the earlier boot-smoke
timeout did not recur in the final gate. Attribution is advisory in this inventory.

AC1–AC5 are satisfied by the cited API declarations, RED/GREEN runs, reused and new
scenario coverage, activation documentation and final full gate. Production activation
and a fresh real-model trial remain outside this coder packet; no production daemon
restart or live recipient mutation was performed.
