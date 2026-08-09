# Phase 5 — `daemon.wiring.test.ts` · prove the composition-root seam is REACHED

**New file only**: `.pi/extensions/pij/daemon.wiring.test.ts`

**Do not edit** `daemon.test.ts` or `daemon-real-adapter.test.ts` — those are shared test files
(partition category 4) and another stream may hold regions in them. A **new file** closes the gap
without entering that category. Do not edit `daemon.ts` either; it is unchanged and staying that
way.

## Why this file exists

**Composition-root edits are untested by construction.** Unit tests inject their own dependencies
— that is what makes them unit tests — so the composition root is precisely the code they never
execute.

Verified here: every test that builds an `AnomalySweep` constructs it **directly** with its own
deps (`acceptance-sweep.test.ts:400`, `core/daemon/anomaly-sweep.test.ts`). **No test anywhere
constructs the real `Daemon` and asserts the sweep it builds receives a watchdog projection.**

So `daemon.ts:354` — our wiring — is simultaneously:

- the **only** one of our files that `main` has touched,
- the file **most** likely to be rewritten by siblings (three streams this wave), and
- the **one part of this change with zero fail-first proof**.

A sibling could restructure that constructor, drop the `watchdog:` key, and **every test would
stay green**, because every test injects its own deps and never exercises the real wiring.

That is this stream's own finding — *`inert-subscription` had never fired because nothing built
its input* — pointed at our own change: **present, correct, and never executed.**

## What to build

One test, constructing the **real** `Daemon` against a **temp `PIJ_HOME`**:

1. Create a temp dir. Write a registry descriptor for a node, and a **watchdog sidecar** on disk
   giving it a watcher whose descriptor is **observably gone** (terminal, or dissolved — reuse the
   incident shape).
2. Construct the real `Daemon` the way the production entry point does, and run `tick()`.
3. Assert an `inert-subscription` alert is produced/delivered.

Follow the existing conventions for temp-home daemon tests in `daemon.test.ts` /
`daemon-real-adapter.test.ts` — **read them, copy the setup idiom, do not invent a new one.**

**If the row cannot fire end-to-end** because `activityCredibility` is still unwired (it is —
`s095` owns it and it does not exist on this branch), then **assert the strongest thing that IS
true**: that the sweep the real `Daemon` constructs **receives a watchdog projection** — i.e. the
paused-trigger or fleet-disabled row reaches the alert path from a real `Daemon.tick()`. Those
rows do **not** need the credibility predicate, and they are equally proof that the seam is wired.

**State in a comment which one you asserted and why.** Do not fake reach we do not have — that is
the defect this whole stream is about.

## The criterion

| criterion | kind |
|---|---|
| a real `Daemon.tick()` produces a watchdog-derived `inert-subscription` alert | **BEHAVIOURAL** |

**Prove it fail-first**: `git stash` the `daemon.ts` change (that one file only), run the new test,
confirm **RED**, restore, confirm **GREEN**. That is the only way to show the test is pinning
*our wiring* rather than something incidental.

Then mutation-gate it:

```bash
node ~/.pij/shared/mutate.mjs --file /daemon.ts --find 'watchdog: () => {' \
  --replace 'watchdog: undefined as never, unusedWatchdog: () => {' \
  -- .pi/extensions/pij/daemon.wiring.test.ts
```

**Read the exit code carefully** — exit `1` means either the test cannot perceive the change **or
the mutant was unreachable**. Check reachability before concluding anything about the test.

## Gates

```bash
npx tsc --noEmit
npx vitest run .pi/extensions/pij/daemon.wiring.test.ts
npx vitest run .pi/extensions/pij/core/anomalies.test.ts .pi/extensions/pij/core/daemon/anomaly-sweep.test.ts
```

Report: the diff, the stash-based fail-first output, the mutation result, and which assertion you
chose if the end-to-end row was not reachable.
