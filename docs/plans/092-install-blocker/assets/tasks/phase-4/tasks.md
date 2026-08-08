# Phase 4 tasks — make the *reporting decision* testable, not the helper it delegates to

Plan: [`../../../install-blocker-plan.md`](../../../install-blocker-plan.md) · Issue: pij#118 (defect 2)

## Why this phase exists

Phase 2 added five tests. All five target the **new pure** `daemonStartOutcome()`. **Zero** touch
`ensureDaemonRunning()`:

```bash
rg -n --hidden 'ensureDaemonRunning' --glob '*.test.ts' .pi/    # → nothing
```

So the suite proves a helper that the untested code *happens to call*. **Delete the poll loop,
restore the old unconditional success line, and every test stays green** — on the phase whose entire
subject is not reporting success you have not verified.

That is a check that agrees with reality without being able to disagree (the pij#142 shape). It was
not caught by caring about it; it was caught by running `rg` and looking. Writing the criterion did
not make it true.

**The property below is the actual deliverable of pij#118 defect 2. The `mkdir` is the smaller
half.**

> **An unverified outcome never renders as a success note.**

## Files

**Allowed**: `.pi/extensions/pij/core/daemon/lifecycle.ts`,
`.pi/extensions/pij/core/daemon/lifecycle.test.ts`, `.pi/extensions/pij/cli.ts`
(**`ensureDaemonRunning()` and its constants only**), `docs/plans/092-install-blocker/**`.

**Forbidden**: everything else. `core/message.ts`, `core/state.ts`, `core/watchdog.ts`,
`core/daemon/watchdog-manager.ts`, `core/anomalies.ts`, `core/orchestration/pa-capability.ts`,
`core/platform/types.ts`, `core/cli.ts`, `.flow-pair/**`, `the-flow.json`, `the-flow.md`.

**Also do not touch** `daemon.ts` — two other streams have declared regions in it
(`:354`, `:639-648`) and it is the composition root. Nothing in this phase needs it.

## The design

Follow the repo's own **P3 — inject side effects via constructor / parameter**, and **P8 — tests
target the logic, not the wiring**. `cli.ts` keeps only the wiring.

Move the whole *decide-and-report* step into `core/daemon/lifecycle.ts` as a pure-ish function whose
side effects are injected:

```ts
export interface DaemonStartProbe {
  /** Re-read the lock + liveness. Called until verified or the budget is spent. */
  readonly status: () => DaemonStatus;
  /** Block for ms. Injected so a test does not spend real time. */
  readonly sleep: (ms: number) => void;
  /** The pane's recent output, for the failure note. May throw; the caller handles it. */
  readonly capturePane: () => string;
  readonly budgetMs?: number;
  readonly pollMs?: number;
}

/** Poll for PROOF that a just-launched daemon is up, and render the operator note
 *  for what was actually established. */
export function reportDaemonStart(
  ctx: { readonly windowName: string; readonly paneId: string },
  probe: DaemonStartProbe,
): string;
```

`ensureDaemonRunning()` then becomes wiring only:

```ts
return reportDaemonStart(
  { windowName: DAEMON_WINDOW_NAME, paneId: res.value.paneId },
  {
    status: readDaemonStatus,
    sleep: sleepSync,
    capturePane: () => capturePane(res.value.paneId, { scrollback: 30 }, execFileRunner),
  },
);
```

Keep `DAEMON_VERIFY_BUDGET_MS = 2500` / `DAEMON_VERIFY_POLL_MS = 50` as the defaults (they are
**measured** — 584/572/576ms cold starts — do not change them), but let the probe override both so
tests run instantly.

## Tasks

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Add `reportDaemonStart()` + `DaemonStartProbe` to `core/daemon/lifecycle.ts`, moving the poll loop and **both** note strings out of `cli.ts` | No I/O of its own; every effect injected | AC-08 |
| 2 | Reduce `ensureDaemonRunning()` to wiring — no loop, no note text, no `sleepSync` call of its own | The diff removes from `cli.ts` exactly what moved | AC-08 |
| 3 | **The property test**: for every non-`running` status sequence, the rendered note must NOT read as success — assert it lacks the success marker and contains the "may still be coming up" hedge | Green | AC-08 |
| 4 | Verified path: a status that goes `absent → absent → running` returns a success note carrying **the verified pid**, and does so **after exactly 2 sleeps** (proves the loop polls rather than returning early or spinning) | Green | AC-08 |
| 5 | Budget exhaustion: a status that never reaches `running` sleeps exactly `budgetMs / pollMs` times and returns the unverified note | Green — pins the bound | AC-08 |
| 6 | Failure note carries the pane tail; and when `capturePane` **throws**, the note still renders (degraded, naming the failure) rather than propagating | Green | AC-09 |
| 7 | A `stale` lock renders as unverified, never verified | Green | AC-08 |
| 8 | **Mutation-prove all of it**: replace the body of `reportDaemonStart` with an unconditional success note (the pre-fix behaviour), run the targeted tests, confirm **RED**, restore, confirm green. Paste both outputs into the execution log | The pre-fix behaviour is now genuinely unshippable | **AC-08** |
| 9 | Full targeted suites + `just typecheck && just lint` | Clean | AC-06 |

## The bar for this phase specifically

Task 8 is the point of the phase. **If simulating the old buggy behaviour does not turn a test red,
this phase has failed** — regardless of how many tests are green.

Do not settle for "the new function is tested". Ask the mutation question: *what could I break that
the suite would not notice?*

## Do NOT change

- `daemonStartOutcome()` — keep it; `reportDaemonStart` should use it, so the classification stays
  in one place.
- `needsAutoStart`, `daemonStatus`, `planStop`.
- The not-in-tmux branch (pij#170), the `newWindow` failure branch, the double-start guard.
- The measured budget constants.

## Search trap

`rg` skips hidden paths; all source is under `.pi/`. Always pass `--hidden`. Never pipe an
enumeration through `head`.
