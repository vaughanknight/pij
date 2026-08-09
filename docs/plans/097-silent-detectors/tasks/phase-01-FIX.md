# FIX packet — s097 Phase 0+1, review verdict FIX_REQUIRED

Cross-model review by `pij-dizzy-giraffe` (gpt-5.6-terra). Its DIM-0 mutation was **sound and
better than ours** (in-memory Vite transform, no working-tree write) and it **confirmed** the
headline criterion discriminates the new member rather than the shared `kind`. Also confirmed
sound: the `gone > 0` boundary, the two-element evidence, the placement outside the trigger
guards, module purity, and the `daemon.ts` diff confinement. **Do not revisit those.**

Fix the following, in this order.

---

## F-1 (CRITICAL — promoted from the reviewer's "Medium") · The fix does not catch its own motivating case

**Verified end-to-end against live data.** `#154`'s motivating incident is
`pij-continuing-ermine` running 42h with its sole watcher `pij-respectable-starfish` gone.

Under the shipped code that subscription produces **no row**:

- `FsRegistry.list()` **omits dissolved descriptors** — `adapters/fs-registry.ts:148`:
  `if (descriptor && descriptor.lifecycle !== "dissolved") out.push(descriptor)`.
- Confirmed: `pij-respectable-starfish` is **not** in `list()`; it lives at
  `~/.pij/archive/pij-respectable-starfish.json` with `lifecycle: "dissolved"`.
- So it never resolves in `byNode` → bucket **`unknown`** → `gone.length === 0` → **no row**.

**This is the stream's own theme reproduced inside the stream's own fix.** Two individually
correct rules compose into silence: *"`list()` omits dissolved"* (correct — a dissolved seat is
not live) and *"`unknown` is never counted as gone"* (correct, and mandated by this spec to
prevent fatality-from-nothing). Neither is wrong; together they mean **the most clearly-dead
watcher there is — one pij deliberately dissolved — is the one case the detector cannot see.**

Note the fix *does* work for the **current** shape: ermine's watcher today is
`pij-unwilling-butterfly`, which is terminal-but-not-dissolved, resolves in `list()`, and would
correctly fire. The gap is specifically **dissolved** watchers.

### Required

The detector must distinguish **"absent because retired"** from **"absent because it never
existed"**. Those are different facts and currently collapse to `unknown`.

- Keep `anomalies.ts` **pure** — no store read, no probe. Take the knowledge as an **input**,
  exactly as `watchdog` and `activityCredibility` are taken.
- Add an optional input (e.g. `retiredNodes?: ReadonlySet<string>`, or a
  `resolveRetired?: (id) => {lifecycle, terminal} | undefined` lookup — your call, argue it).
  A watcher id in that set classifies as **gone** via the credibility predicate (rule 1,
  `lifecycle: "dissolved"` → `superseded`/`dissolved`), **not** as unknown.
- **Absent input ⇒ today's behaviour**, byte-for-byte.
- Build it at the two I/O edges. `FsRegistry.read()` already finds archived descriptors by direct
  path (`adapters/fs-registry.ts:152-...`, O(1) keyed lookup, never globbed) — so **resolve only
  the watcher ids you actually have**, never enumerate the archive.
- **An unresolvable id must still be `unknown`.** Do not weaken that; it is the guard against
  reporting a typo as a death.

**Test (BEHAVIOURAL)**: a subscription whose sole watcher is a **dissolved** seat **fires**,
reproducing the ermine/starfish case by name in the fixture. Run it against the current tree
first and watch it fail.

## F-2 (HIGH) · The sweep now false-alerts on `compact` pauses

Phase 0 turned on the paused-trigger row in the daemon **for the first time**, which activated a
latent problem: `pausedBy: "compact"` is **system-initiated** (`core/watchdog.ts:125-130`) and
cleared automatically on the next working transition (`:115-116`). The 600ms sweep can observe
that transient window, call it a unilateral withdrawal from supervision, and prescribe a manual
`pij watchdog resume`.

**Fix**: exclude `pausedBy === "compact"` from the paused-trigger row, or require the pause to
have outlived its bounded duration before emitting. Prefer the exclusion unless you can show a
compact pause can persist.

**Test**: `pausedBy: "compact"` does not emit; `pausedBy: "self"` still does (regression guard).

## F-3 (HIGH) · Fleet-disabled row is routed to an arbitrary seat

`anomalies.ts:434` attributes the fleet-wide-disabled row to `watched[0]`, whose identity follows
**filesystem enumeration order**. The sweep routes each anomaly to that node's effective parent —
so if `watched[0]` happens to be a prime or parentless root, **a fleet-wide outage is dropped and
then latched**, never to alert again.

Harmless while the row only appeared in a human-run CLI query; **Phase 0 made it a daemon alert**,
so it is now a real nondeterministic drop.

**Fix**: this one is **your judgement call, and you may defer it.** If a deterministic
fleet-level recipient is not cleanly available from the inputs the detector already has, **do not
invent one** — instead leave the behaviour unchanged, add a comment at `:434` stating the
nondeterminism and that Phase 0 activated it, and **tell me**; I will file it as its own issue
rather than let this PR grow a routing redesign. Say which you chose and why.

## F-4 (PM-owned, no code) · The PR must not claim `#154` is repaired

`daemon.ts` deliberately does not pass `activityCredibility` (it does not exist on this branch —
`s095` owns it), so the dead-recipient row **cannot fire in production yet**. That is known,
pinned by criterion 2b, and accepted by the prime.

**I am removing `Closes #154` from the PR body** — the reviewer is right that a PR whose row
cannot fire must not auto-close the issue it is named for. No action needed from you; recorded
here so the decision is not lost.

---

## Gates — all of them

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s097-silent-detectors
just typecheck && just lint
npx vitest run .pi/extensions/pij/core/anomalies.test.ts .pi/extensions/pij/core/daemon/anomaly-sweep.test.ts
```

Keep every existing test green. Label new criteria BEHAVIOURAL / PRESERVED-PROPERTY / NEW-API,
run behavioural ones pre-fix, and mutation-gate F-1.

## Report back

diff · pre-fix failure output for F-1 · mutation evidence · your F-3 decision and reasoning.
