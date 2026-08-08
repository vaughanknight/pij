# Phase 1 tasks — daemon creates its own `PIJ_HOME` before the lock write

Plan: [`../../../install-blocker-plan.md`](../../../install-blocker-plan.md) · Issue: pij#118

## The one thing that matters

**The test must fail without the fix.** This machine has a populated `~/.pij`, so the defect is
invisible here. A test that passes before *and* after is not a test. Task 2 exists to produce the
recorded pre-fix failure, and it is the highest-value artifact in this phase.

## Tasks

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Create `.pi/extensions/pij/daemon.bootstrap.test.ts`. Case A: call `runDaemon({ pijHome, tickMs: 60_000, deliveryMs: 60_000, log: () => {} })` against a path that does **not** exist (a never-created nested child of a `mkdtempSync` dir). Assert `existsSync(home) === false` **before** the call, and `daemon.lock` present after | Test compiles and runs | AC-01 |
| 2 | **Before applying the fix**, run the new test and capture the failure verbatim into `docs/plans/092-install-blocker/assets/execution.log.md` | Log contains the real `ENOENT … daemon.lock` output and the command that produced it | **AC-02** |
| 3 | Apply the fix in `.pi/extensions/pij/daemon.ts`: add `mkdirSync` to the `node:fs` import and `dirname` to the `node:path` import; insert `mkdirSync(dirname(lockPath), { recursive: true });` immediately before the acquire loop, with a comment naming the first-run condition | New test passes | AC-01 |
| 4 | Case B — **env-driven**: set `process.env.PIJ_HOME` to a non-existent path, call `runDaemon()` with **no** `pijHome` option, assert the lock appears; restore the env | Green | AC-04 |
| 5 | Case C — **empty `PIJ_HOME`**: with `PIJ_HOME=""` the lock is cwd-relative and still acquired (run inside a temp cwd; restore cwd and env) | Green | AC-07 |
| 6 | Case D — **existing populated home** still acquires normally | Green | AC-03 |
| 7 | Run the full existing daemon suite | No new failures (baseline: 99 passed, 4 skipped) | AC-03 |
| 8 | `just typecheck && just lint` | Clean | AC-06 |

## The fix — exact shape, and why not the issue's

Use:

```ts
mkdirSync(dirname(lockPath), { recursive: true });
```

**Not** `mkdirSync(pijHome, { recursive: true })` — which is what pij#118 proposes, and which ships
a regression:

| `PIJ_HOME` | today | `mkdirSync(pijHome)` | `mkdirSync(dirname(lockPath))` |
|---|---|---|---|
| `""` | `join("", "daemon.lock")` → `"daemon.lock"`, cwd-relative, **works** | `ENOENT` → daemon dies ❌ | `dirname` → `"."` → ok ✅ |
| fresh path | ENOENT (the bug) | creates ✅ | creates ✅ |
| existing home | works | idempotent ✅ | idempotent ✅ |

## Do NOT change

- The `wx` exclusive-acquire loop or its `EEXIST` semantics (live holder → refuse, dead holder →
  reclaim). Keep it **byte-identical** — the reviewer will check this.
- The `if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e` guard. It is correct. The fix
  removes the *cause* of the `ENOENT`; it must never swallow the *report* of one.
- The `pijHome` resolution line (`daemon.ts:1094`). Changing `??` to the canonical
  `resolvePijHome()` would make the daemon and `cli.ts:235` disagree about where the lock is.

## Test hermeticity — required, not optional

Around every case, delete and restore **both** `PIJ_HOME` and `PIJ_TELEGRAM_ENV`. An ambient
`PIJ_TELEGRAM_ENV` points the bridge at a real config (`telegram/index.ts:82-85`) and its disposer
does not call `bot.stop()` (`:243-247`) — a leaked long-poll would hang the suite.

Assign the disposer before the `try` so a throwing `runDaemon` still cleans up:

```ts
let stop: (() => void) | undefined;
try {
  stop = runDaemon({ ... });
  // assertions
} finally {
  stop?.();
  rmSync(parent, { recursive: true, force: true });
}
```

Use explicit `60_000` intervals — not a huge value, which `setInterval` clamps above 2^31-1.

## Ownership boundary — five other agents are editing this repo right now

**Allowed**: `.pi/extensions/pij/daemon.ts`, `.pi/extensions/pij/daemon.bootstrap.test.ts`,
`docs/plans/092-install-blocker/**`.

**Forbidden** — do not open to edit, do not "improve in passing":
`.pi/extensions/pij/cli.ts`, `core/message.ts`, `core/state.ts`, `core/watchdog.ts`,
`core/daemon/watchdog-manager.ts`, `core/anomalies.ts`, `core/orchestration/pa-capability.ts`,
`core/platform/types.ts`, `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.flow-pair/**`.

A change to any of those becomes a merge conflict for an agent that does not know you exist.

## Search trap

`rg` skips hidden paths and **all** the source is under `.pi/`. Always pass `--hidden`, or you will
get a confident false "not present".
