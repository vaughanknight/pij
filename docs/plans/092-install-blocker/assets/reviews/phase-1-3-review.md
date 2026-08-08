# Cross-model review — Plan 092 phases 1–3

**Verdict: FIX_REQUIRED**

## Findings

| Severity | Finding | Evidence | Suggested fix |
|---|---|---|---|
| high | Phase 2's user-facing verification branch is untested. The new `lifecycle.test.ts` covers only the pure `daemonStartOutcome()` helper; it cannot prove that `ensureDaemonRunning()` polls, returns the verified success note with the proven pid, returns the unverified note rather than the old success note, or includes the captured pane tail. This misses the explicit AC-08/AC-09 test contract. | `.pi/extensions/pij/cli.ts:1170-1201` contains the new polling, outcome-to-note mapping, and `capturePane` branch. `rg -n --hidden 'ensureDaemonRunning\|DAEMON_VERIFY\|verified up\|could NOT verify\|pij-daemon' .pi/extensions/pij --glob '*.test.ts'` returned no test exercising those symbols or messages. The required `daemonStartOutcome` tests are only in `.pi/extensions/pij/core/daemon/lifecycle.test.ts:42-72`. | Extract the post-launch polling/rendering decision behind an injectable, deterministic seam (or add a controlled CLI integration seam), then test both a status sequence reaching `running` and one that never does. Assert the verified PID in the success note; assert the unverified wording says it may still be coming up, has no success glyph/text, and includes the `capturePane` tail. Mutation-test that behavioral seam, not only `daemonStartOutcome()`. |

## Review notes

- Phase 1 correctly creates `dirname(lockPath)` before the untouched exclusive-acquire loop. The current empty-`PIJ_HOME` case no longer calls `process.chdir()`, so it cannot leak the process cwd to another Vitest worker.
- Phase 2's poll exits immediately on a live lock (`cli.ts:1178-1183`), and `sleepSync` is `Atomics.wait` (`cli.ts:537-539`), not a CPU busy loop. The failure wording accurately says the daemon *may* still be coming up (`cli.ts:1200`).
- Phase 3 retains all injection seams: `opts.pijHome ?? resolvePijHome()` in `daemon.ts:1094`, `deps.pijHome ?? resolvePijHome()` in `core/daemon/watch.ts:67`, and the `FsFocusStore` constructor default in `adapters/focus-store.ts:53`. The required duplicate enumeration returned `0`.
- The non-test resolver sweep found no remaining production derivation outside the canonical resolver; `core/chores/test-home.ts` intentionally requires an explicitly supplied temporary `PIJ_HOME`.
- Changed files are within the packet's allowed production/documentation scope, plus the explicitly shared `docs/how/fleet/ledger.md`.

## Dim-0 mutation evidence

All temporary mutations were restored. `npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts` was green after each applicable restoration (14 tests).

| Phase | Broken guard | Command | RED observed | Restoration |
|---|---|---|---|---|
| 1 | Replaced `mkdirSync(dirname(lockPath), { recursive: true })` with a no-op comment in `daemon.ts` | `npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts` | 6 failures; cases A/B fail with `ENOENT: no such file or directory, open '.../fresh/.pij/daemon.lock'` at `daemon.ts:1133`. | Restored the exact `mkdirSync(...)` line; 14/14 green. |
| 2 | Changed the `running` branch of `daemonStartOutcome()` to return `{ kind: "unverified" }` | `npx vitest run .pi/extensions/pij/core/daemon/lifecycle.test.ts` | 2 failures: `running → verified, carrying the pid that was proven alive` and `ignores the owned window — only liveness verifies a start`; received `{ kind: 'unverified' }` instead of `{ kind: 'verified', pid: ... }`. | Restored `{ kind: "verified", pid: status.pid }`; 14/14 green. |
| 3 | Reintroduced `process.env.PIJ_HOME ?? ""` in the `FsFocusStore` constructor default | `npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts` | 4 failures: the source sweep found 1 inline resolver, and unset/empty agreement expected the temporary `~/.pij` but received `"."`. | Restored `resolvePijHome()`; 14/14 green and `rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ \| wc -l` returned `0`. |

## Validation context

`npx vitest run daemon lifecycle cli` completed with 32 passing files / 1 failing file (1,120 passed, 5 skipped). The two failures are in the pre-existing `cli.integration.test.ts` caller-truth spawn tests, both exiting 143 from the tmux-backed `spawnedDescriptor()` helper; they do not exercise the reviewed Phase 1–3 paths. `just typecheck` passed. `just lint` exited 0 with the repository's existing 9 warnings and the existing Biome schema-version informational diagnostic; none names a reviewed file.

---

## Re-review — commit `4d3731a`

**Verdict: APPROVE_WITH_NOTES**

The prior high-severity Phase 2 finding is resolved. `reportDaemonStart()` now owns the injected
status/sleep/pane-capture decision (`core/daemon/lifecycle.ts:103-127`); `cli.ts` only wires the
real collaborators. The new tests cover verified and never-verified status sequences, early exit,
the bounded failure budget, pane output, and capture failure. All changed production paths across
Phases 1–3 were re-reviewed.

| Severity | Finding | Evidence | Suggested fix |
|---|---|---|---|
| low | The committed execution log has trailing whitespace. | `git diff --check main...HEAD` reports `docs/plans/092-install-blocker/assets/execution.log.md:333: trailing whitespace`. | Remove the trailing space when touching the execution-log artifact. This is non-functional and does not block approval. |

### Dim-0 re-review evidence

All three production mutations were applied to the final tree, produced RED, then were restored.
The focused suite was green after restoration: `npx vitest run
.pi/extensions/pij/core/daemon/lifecycle.test.ts .pi/extensions/pij/daemon.bootstrap.test.ts` →
40/40 passed. `just typecheck` passed; `just lint` exited 0 with the repository's existing nine
warnings and one schema-version informational diagnostic. The resolver enumeration remains zero.

| Phase | Mutation | RED evidence |
|---|---|---|
| 1 | Removed `mkdirSync(dirname(lockPath), { recursive: true })` from `runDaemon()`. | `daemon.bootstrap.test.ts`: 6 failures, including fresh injected/env homes failing with `ENOENT ... daemon.lock` at `daemon.ts:1133`. |
| 2 | Replaced `reportDaemonStart()` with the original unconditional success note. | `lifecycle.test.ts`: **11 failures**. Four never-running sequences rendered a success mark; polling, verified PID, budget, stale-lock, pane-tail, and capture-failure assertions also failed. The original 14 lifecycle tests stayed green. |
| 3 | Reintroduced `process.env.PIJ_HOME ?? ""` as the `FsFocusStore` default. | `daemon.bootstrap.test.ts`: 4 failures. The static sweep found one inline resolver, and unset/empty resolution received `"."` instead of the temp `~/.pij`. |

### Rendering-test caveat

The orchestrator's judgement is correct: `omits the pane block entirely when the pane is empty`
survives the unconditional-success mutant because that mutant also has no pane block. It is an
independent formatting contract, not evidence for the Phase 2 safety property, and it was not
counted as such. The 11 failing behavioral assertions establish the relevant regression proof.
