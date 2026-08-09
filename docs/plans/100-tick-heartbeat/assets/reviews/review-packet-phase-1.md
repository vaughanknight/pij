# Review packet — s100 dlg-0002 (Phase 1: pij#180 Fix A)

**Reviewer**: `pij-glad-stingray` (gpt-5.6-terra, high) — deliberately a different model from the
coder (claude-opus-5), because a coder's tests and a coder's confidence share a mental model.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s100-tick-heartbeat` — absolute paths
for every file operation.

## Read first

1. `docs/plans/100-tick-heartbeat/tick-heartbeat-plan.md` — the contract, including the AC table
   and the four criterion kinds
2. `docs/plans/100-tick-heartbeat/assets/research-dossier.md` — the measurements
3. `docs/plans/100-tick-heartbeat/assets/execution.log.md` — the coder's recorded evidence
4. The diff: `git diff` plus the two new files under `.pi/extensions/pij/core/daemon/`

## What the change does

`daemon.ts:288-293` wrote `lastTickAt` to every daemon-owned descriptor every 600ms — **132
writes/tick** in production, each an `FsRegistry.publish()` of ~5 fsync-barriered atomic writes,
measured at 52.5% of a 27-34s tick. The change replaces that loop with **one** persist to a side
file, behind a new pure store injected per P3.

**Deliberately NOT in this phase**: the read overlay. `lastTickAt` is now absent from descriptors,
so receipt readers report stale until Phase 2 lands. That is expected — do not report it as a
defect, but **do** tell me if you think it is unsafe to land in that intermediate state.

## Search trap — this will silently mislead you

All source is under `.pi/`, a **hidden** directory. `rg` skips hidden paths **by default** and
will report "no matches" for code that exists. **Always pass `--hidden`.** Reading a file by
explicit path works fine, which makes the absence look corroborated. `grep -r` is unaffected.
**Never pipe an enumeration through `head`** — a truncated list ending exactly at the limit is
indistinguishable from a complete one. Count with `wc -l` first.

## Your verdict is the real one

The `flow-pair` CLI computes a verdict from finding severities; it never reads the diff. **Dim-0
(test quality) is mandatory** — the coder wrote its own tests, so green ≠ good. Return one of
`APPROVE` / `APPROVE_WITH_NOTES` / `FIX_REQUIRED`, and write it to
`docs/plans/100-tick-heartbeat/assets/reviews/phase-1-review.md`.

## Specific things to adjudicate

### 1. The one I found and deliberately did not fix — concurrent-daemon temp collision
`FsTickHeartbeatStore.write` uses a **fixed** temp filename:

```ts
const tmp = `${path}.tmp`;
writeFileSync(tmp, ...); renameSync(tmp, path);
```

The repo's own `writeTextAtomic` uses `${path}.tmp-${process.pid}-${randomUUID()}`
(`adapters/atomic-file.ts:106`) specifically to survive concurrent writers. **I do not know
whether that matters here** — a daemon lock normally enforces a single daemon, but restart
handover can overlap. Adjudicate it: is a fixed temp name a real defect, a theoretical one, or
correct-and-cheaper given the file is regenerated every 600ms? **Do not take my framing** — I may
be importing a concern from a durability-critical path into one that has no durability
requirement at all.

### 2. Absence of `fsync` — deliberate or an oversight?

> **ANNOTATION, added 2026-08-08 — the packet text below is left as dispatched.** My stated
> position ("regenerated 600ms later by definition") was **falsified by review**: there is no
> guarantee of a subsequent tick. The conclusion (no `fsync`) survives on a different argument —
> a missing stamp reads `unverified`. **This record is annotated rather than edited**, because a
> dispatched artifact is evidence of what was actually asked, and rewriting it would destroy the
> record while appearing to correct it.
The store does **not** fsync. My position is that this is the entire point: `lastTickAt` is
regenerated 600ms later by definition, so paying a physical barrier for it is the defect being
removed. Confirm the reasoning holds, or tell me what it breaks.

### 3. The steady-state fixture — the coder's own deviation, flagged not hidden
Its first pre-fix red measured **15** writes, not the predicted 5. Rather than adjust the
expectation, it instrumented and found 5 heartbeat + 5 `RuntimeAxisTracker.drive` + 5
`observeActivity`, which **converge** (15 → 10 → 5). It now ticks to steady state and counts the
third tick. **Is that fixture sound, or does it hide a real coupling?** A fixture that needs three
ticks to isolate its subject is either elegant or a smell, and I want your read rather than mine.

### 4. Dim-0 — verify the mutation evidence rather than trusting it
The coder reports M1 (heartbeat write → no-op) killing **five** tests, refuting my plan's "AC-01
only", and proving my AC-02 prediction *negatively* via `--expect AC-02` → *"5 test(s) failed, but
NONE matches --expect"*, exit 1.

**Re-run the mutants yourself.** The tool is `node ~/.pij/shared/mutate.mjs`, `--expect` is
**mandatory** — without it a flake is indistinguishable from a kill. The specs here are
subprocess-free by design so the fast in-memory transform reaches them; you need no write access.

### 5. The claim I most want attacked
The coder observed that **AC-07 survives M1**, because it is a *removal* criterion: it asserts the
field is gone, and the field stays gone whether the replacement works or is a no-op. If that is
right, are there **other** criteria in this phase that are structurally blind in the same way —
criteria that would stay green against a completely broken replacement?

### 6. Boundary compliance (mechanical, but three streams share this file)
`daemon.ts` is edited by two other live streams. Confirm the diff touches **only** the import
block, the constructor signature `:190-199`, and the tick loop `:286-293`; that **nothing is
reordered**; and that `:354` and `:639-648` are untouched. I count 3 hunks — verify.

## Out of scope — do not review or propose changes

`core/cli.ts`, `cli.ts`, `core/archive.ts`, `core/watchdog.ts`, `core/anomalies.ts`,
`adapters/fs-registry.ts` (Phase 2), `daemon.ts:354`, `daemon.ts:639-648`,
`docs/how/fleet/ledger.md`, and the three flow-state files (`.the-flow-state.json`,
`the-flow.json`, `the-flow.md`).

## Report back

Write the review file, then send me one line: `<VERDICT> — <path>`. Findings need
severity + `file:line` evidence you verified, not inferred. Prefer one verified critical over ten
speculative. If you cannot verify something, say so explicitly.
