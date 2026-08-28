# Cold review 01 — Phase 6, item 15 (shared lock reclaim + dispatch spine notes) — dlg-0019

**Reviewer**: `pij-powerful-whale` (cold cross-model, claude-opus-5 via copilot) · **Reviewed**: `38eb4ed19302a52f4418968b61bad6e211486299` on `s391/item15-spine-lock-reclaim` · **Base**: `e46eec8a1b042d8bdf2b2e7479ac3801b1890ca0` (re-derived here as `git merge-base origin/main HEAD`, not taken from the brief) · **Range reviewed as one change**: `b9a9e43` (wip) + `38eb4ed` (fix).

## Verdict

**APPROVE-WITH-FINDINGS** — highest severity **medium**. Nothing here blocks merge.

The mechanism is right and it is genuinely defended where it matters most: **the "never steal a live lock" invariant is sensored in all three layers, by real code paths, not fakes.** Two independent mutations of the real evidence source (`processIsAlive` always-dead; `processStartedAtMs` always-newer) each turned `write.lock`, `events.lock` *and* the descriptor lock RED — including the 4-process concurrent-append test. The reclaim rule genuinely exists once. AC-20b's notes are pinned at all three call sites plus the count wording. The carried T004b fix works: a steal-any-lock mutation now RED's the contention sensor that was blind last round.

The findings are all about **what the sensors can see**, not about what the code does. Three separate mutations that remove real, shipped behaviour leave the entire 172-file suite green.

---

## RX0 — Scaffolding, and the limits of this pass (stated before any finding)

**My own scaffolding produced a false GREEN, and I am recording it because it nearly cost a finding.** My first attempt at MUT-2 was a shell chain of the form `cp … && cmp … && git diff --exit-code --quiet && echo RESTORED && python3 <<'EOF' … EOF`. `review-brief.md` is a **tracked file with an uncommitted modification** in this worktree (the orchestrator stamps the SHA into it at dispatch), so `git diff --exit-code --quiet` returned 1, the `&&` chain short-circuited, **the mutation never applied**, and the `npx vitest` on the next line ran against a pristine tree and reported GREEN. I caught it only because neither of my two `echo` markers appeared in the output. Every subsequent mutation therefore went through a harness (`/tmp/pw15/mut2.sh`) that (a) aborts loudly if the Python anchor assertion fails, (b) **aborts before running if `git diff --name-only -- .pi/` is empty**, (c) prints the mutated file list, and (d) always restores from pristine byte-copies. Read every GREEN below as "green under a harness that proves the mutation was on disk".

**What I did NOT examine, and you should not read as clean:**

1. `just lint` repo-wide and `harness checks --quick` — I ran `biome` on the 16 changed `.ts` files only. The execution log's claim that `just lint` is red only in unrelated pre-existing files is **unverified by me**.
2. Anything Windows/`pwsh`. My wider gate surfaced `spawnSync pwsh ENOENT` in `harness/scripts/release-age-policy.test.ts`; `pwsh` is not installed on this machine (`command -v pwsh` → nothing). Pre-existing and outside the reviewed scope.
3. The reclaim-loop spin risk (F-8) is **reasoned, not reproduced** — I attempted it twice and failed both times. See F-8 for exactly how it failed.
4. Real multi-machine or reboot PID reuse. My PID-reuse evidence probe (RX2-C/E) uses this process and one spawned child; it does not exercise an actual kernel pid recycle.
5. The `b9a9e43` wip commit was reviewed only as part of the squashed range diff, not as a separate step.
6. Concurrency between the three lock layers when nested (the platform lock nests outside `events.lock`) under a reclaim — I reasoned about it, I did not build a three-layer contention harness.
7. `core/cli.test.ts` — it is named in T004's Path column but is **not in the diff**; I baselined it (467 tests) and left it alone.
8. Anything about whether `ps lstart` parsing is correct on Linux/GNU column order. Probe A only proves it works on **this** macOS host.

**Base derivation, and a trap in the dispatch's own wording.** The dispatch says "review the RANGE `origin/main..HEAD`". `origin/main` is now `90ba189`, which is **four commits ahead of the stated base `e46eec8a`** (it has since absorbed PR #25, the item-21 bind-guard tail, and two `government/briefs` commits). A two-dot `git diff origin/main..HEAD` is a tree-vs-tree diff, so it reports those four commits' work as *reversals* and inflates the change to 26 files including `core/daemon/loop.ts`, `core/daemon/index-state.test.ts` and two `government/` briefs — none of which this change touches. **Every number in this review is against `e46eec8a..HEAD` (21 files, +815/−100), which is the merge-base diff and the honest scope.**

---

## RX1 — Freeze, scope, anti-vacuity

| Check | Result |
|---|---|
| HEAD | `38eb4ed19302a52f4418968b61bad6e211486299` ✓, unmoved at end of pass |
| Branch | `s391/item15-spine-lock-reclaim` ✓ |
| Base | `git merge-base origin/main HEAD` = `e46eec8a` ✓ (re-derived) |
| Tracked tree at start | one modification: `review-brief.md` (the dispatch stamp). `.pi/` clean. |
| Scope | `comm -23 changed allowed` → **empty**. 21 changed paths ⊆ the dossier's Path(s) ∪ Pre-Implementation Check ∪ `docs/how/pij.md` ∪ the dossier files. |
| Off-limits paths | `core/types.ts`, `core/revive.ts`, `skills/**`, `government/**` — **zero** entries in `e46eec8a..HEAD`. |

**Fence files, byte-identical at all three points** (base blob = HEAD blob = worktree blob), not merely "absent from this commit":

| File | blob |
|---|---|
| `core/types.ts` | `207b019` |
| `core/revive.ts` | `27de6fa` |
| `core/registry-write.ts` | `71440cc` |
| `core/ports.ts` | `5a4a505` |
| `core/platform/dispatch.ts` | `d35d053` |
| `adapters/process-snapshot.ts` | `8f93551` |
| `core/liveness-cost.test.ts` | `3b70bf4` |

`process-snapshot.ts` and `liveness-cost.test.ts` are on that list deliberately: the coder's log says the first implementation used a per-PID `ps` and **masked** two `liveness-cost` failures behind a `tail`. Neither file moved, so the guard that caught it is the *unmodified* one.

**Anti-vacuity — measured with `npx vitest list`, not a regex** (a regex cannot represent the added `it.each([...])`). I extracted `e46eec8a` with `git archive` into a scratch tree, symlinked `node_modules`, and listed both:

- base declarations: **4034** · head declarations: **4047**
- removed: **1** — `spine-store.test.ts > … > a manually removed wedged lock unblocks the next writer (the ONLY recovery path — review 002 G1)`. It is a **rename**, and its replacement (`a manually removed unattributable lock unblocks the next writer`) is in the added list. Not a deletion.
- added: **14**
- `4034 + 14 − 1 = 4047` ✓ closes exactly. `.skip`/`.only`/`.todo` added: **0**.

**Assertions deleted from surviving tests** (a name diff is blind to these, so I diffed the lines too): exactly three `expect(` lines removed, each with a direct replacement in the same test — the hoisted `elapsedMs` (T004b), the `withPlatformWriteLock(() => 0)` that only existed to force the spine dir into existence (now `mkdirSync`), and the bare `"live-holder-token\n"` string (now `` `${process.pid}:live-holder-token\n` ``). **No assertion was silently dropped.**

Production-vs-test balance: `lock-reclaim.ts` +135 (new), `spine-store.ts` +83/−? , `daemon.ts` +59, `platform-write-lock.ts` +47, `fs-registry.ts` +43/−? , `core/cli.ts` +47, `journal.ts` +10, `cli.ts` +24 — against +79 (`lock-reclaim.test.ts`) +58 +57 +39 +34 +29 +20 +16 of tests. Not a docs-heavy commit.

---

## RX2 — The six hard checks

### (1) One reclaim rule, used by all three acquirers; live original holder never stolen; PID reuse reclaimed; dead pid reclaimed with a note

**The rule exists once.** `adapters/lock-reclaim.ts` is the only implementation. The private `isProcessAlive` was **deleted** from `fs-registry.ts` (`:114-122` on base) rather than left as a second copy — I checked, there is no third copy anywhere. All three acquirers call it on EEXIST before waiting:

- `platform-write-lock.ts:99` — `reclaimIfDead(this.lockFile, "write.lock", this.options)`
- `spine-store.ts:274` — `reclaimIfDead(this.lockFile, "events.lock", this.options)`
- `fs-registry.ts:246` — `reclaimIfDead(lockPath, "descriptor.lock", this.options)`

**Baseline B1** (8 suites: `lock-reclaim`, `platform-write-lock`, `spine-store`, `fs-registry`, `daemon`, `daemon.delivery`, `journal`, `liveness-cost`) = **229 passed | 3 skipped**, 8.2 s.

**MUT-1 — the real liveness probe always reports DEAD** (`processIsAlive` → `return false`; injected tests unaffected, so this is purely the production path):

```
FAIL fs-registry.test.ts        > fails bounded lock exhaustion with the manual-removal remedy and no age policy
FAIL fs-registry.test.ts        > waits for a contending live holder to release, then publishes
FAIL platform-write-lock.test.ts> a held lock times out E-NOREG …; the operation NEVER runs
FAIL spine-store.test.ts        > multi-process atomicity: 4 concurrent writers x 25 appends allocate seqs exactly 1..100
FAIL spine-store.test.ts        > a held (fresh) events.lock makes append err E-NOREG after the acquisition budget
→ 5 failed | 224 passed
```

**RED in all three layers.** The `spine-store` multi-process case is the strongest of these: four real OS processes, and stealing a live lock corrupts the seq allocation.

**MUT-2 — the real start-time reader claims every live pid started AFTER the lock** (`return Number.MAX_SAFE_INTEGER`), i.e. steal every live lock *via the new pid-reuse branch*:

```
FAIL fs-registry.test.ts        > fails bounded lock exhaustion …
FAIL fs-registry.test.ts        > waits for a contending live holder …   AssertionError: expected 3 to be >= 20
FAIL platform-write-lock.test.ts> a held lock times out E-NOREG …        expected { ok: true, value: 'never' } to match { ok: false, code: 'E-NOREG' }
FAIL spine-store.test.ts        > multi-process atomicity: 4 concurrent writers …
FAIL spine-store.test.ts        > a held (fresh) events.lock makes append err …
→ 5 failed | 224 passed
```

**RED in all three layers again.** The new branch cannot be made to steal a live original holder without a sensor firing. Note the second line — that is T004b's hoisted assertion doing its job.

**The "test's own pid" case is exercised by the REAL path, not a fake.** Three tests plant `pid: process.pid` with **no injection at all** — `fs-registry.test.ts:337` (exhaustion), `:362` (contention), and `platform-write-lock.test.ts:93` (held lock, real holder instance). Those are the ones MUT-1/MUT-2 killed.

I want to be precise about one thing the diff makes easy to misread: the two tests *titled* "an AGED lock is never stolen" (`platform-write-lock.test.ts:109`, `spine-store.test.ts:494`) now **inject both `isAlive` and `processStartedAtMs`**. They pin the *decision rule*, and they still plant `${process.pid}`, but they would survive any change to the real evidence source. The real-path coverage comes from the three uninjected tests above, not from these two.

**Dead pid → reclaimed with a note naming layer + pid**: pinned per layer — `platform-write-lock.test.ts:52` asserts the `onReclaim` receipt `{layer:"write.lock", pid, reason:"dead-pid"}`; `spine-store.test.ts:154` asserts a durable **spine note** with `refs:["lock:events.lock","pid:<pid>"]`, `prev:"dead-pid"` and the message text; `fs-registry.test.ts:324` asserts the descriptor lock is reclaimed and removed. See **F-4** for what happens to the descriptor note in production.

**PID reuse → reclaimed**: pinned per layer (`platform-write-lock.test.ts:70`, `spine-store.test.ts:174`, `fs-registry.test.ts:389`, plus the unit case in `lock-reclaim.test.ts:50`) — and confirmed on the **real** path by probe RX2-C below.

### (2) Daemon SIGTERM/SIGINT releases owned tokens only, never a successor's

**Token discipline: proven.** MUT-6 (drop the token comparison in `releaseOwnedLock`, so release deletes whatever is at the path) → **RED ×2**: `lock-reclaim.test.ts > graceful release removes only the still-owned token` and `platform-write-lock.test.ts > token-checked release: a lock REPLACED during the operation is not deleted`. A successor's lock cannot be deleted without a sensor firing.

**The handler's own contract: proven.** MUT-5 (delete `(options.releaseHeldLocks ?? releaseHeldLocks)()` from `installDaemonShutdownHandlers`) → **RED**: `expected [ 'stop', 'exit:0' ] to deeply equal [ 'stop', 'release-locks', 'exit:0' ]`.

**The daemon's actual signal path: NOT proven — see F-2.**

### (3) AC-20b — notes at all three call sites, and the "0 open (N already retired)" wording

Selectors baselined first (Dim-0): each `-t` matched **exactly 1 test, 1 passed | 109 skipped**, so none of the runs below is vacuous.

| Mutation | Result |
|---|---|
| **MUT-7** daemon close-sweep note removed (`daemon.ts:866-880`) | **RED** — `daemon.delivery.test.ts > retires open dispatches on close …`: `expected undefined to match object { kind: 'dispatch-retired', …(5) }` |
| **MUT-10** revive requeue note removed (`cli.ts:2232-2243`) | **RED** — `cli.integration.test.ts > revives a dissolved Claude session …`: `expected undefined to match object { kind: 'dispatch-requeued', …(5) }` |
| **MUT-11** operator verb reverted to a bare `dispatchStore.write` (no note, no coupled commit) | **RED** — `cli.integration.test.ts > retires by id or recipient …`: `expected undefined to match object { kind: 'dispatch-retired', …(5) }` |
| **MUT-12** `0 open (N already retired)` reverted to the old `0/0` string | **RED** — `expected 'retired 0/0 dispatch(es) — reason: st…' to contain '0 open (1 already retired)'` |
| **MUT-8** `isDispatchJournalKind` narrowed back to `kind === SPINE_KIND_DISPATCH` | **RED ×2** — `journal.test.ts`: `recovery blocked: journaled op op-transition (dispatch-retired) carries an unadjudicable intent` (and the `dispatch-requeued` twin) |

All three call sites and the wording are genuinely pinned. `alreadyRetired` is computed from `records`, which is already selector-scoped (by id, or by `record.to === cmd.to` at `core/cli.ts:4676-4682`), so the count cannot leak in dispatches the selector did not match. See **F-5**/**F-6**/**F-7** for three secondary observations about *how* the three sites differ.

### (4) Carried T004b and T004c

**T004b — CLOSED, and I re-ran the exact probe that found it blind.** `fs-registry.test.ts:383` now reads `const elapsedMs = Date.now() - startedAt;` **before** `await released`, and asserts on `elapsedMs`. **MUT-9** (descriptor lock steals *any* lock) → **RED**: `expected 2 to be greater than or equal to 20`. That is the same 2 ms I measured on the mutant last round, now caught. Last round the identical mutation left this test GREEN.

**T004c — the fix landed, but its sensor is text, not behaviour. See F-1.**

### (5) Tests never touch this machine's `~/.pij/spine` or the live daemon

**Structural**: across all seven changed test files, `homedir()` occurrences = **0**; every one builds its home with `mkdtempSync(join(tmpdir(), …))`. `journal.test.ts` is pure in-memory (`TestSpineLog`/`TestDispatchStore`). No changed test resolves a default `pijHome`.

**Executional, and I want to name its limit.** I snapshotted `~/.pij/spine/` before and after running the five adapter/daemon suites. The directory **did** change — `events.ndjson` grew 1,513 bytes and two `event-once-*.json` appeared. **On a machine with a live fleet this diff cannot by itself exonerate anything**, so I attributed the writes rather than assuming: the two new files are `actor=pij-vocal-kingfisher kind=state-set` and `actor=pij-relative-panther kind=task-set`, and the `events.ndjson` tail is `daemon`/`status` traffic from live seats. Neither `~/.pij/spine/write.lock` nor `events.lock` existed before or after. So: no test-shaped actor, no leftover lock, and the concurrent writes are the live fleet — but the load-bearing evidence here is the structural check, not the directory diff.

### (6) The cost of the liveness/start-time reads, and whether the cache can go stale across a PID reuse

The coder replaced a per-PID `ps` with a cached whole-table `NodeProcessSnapshot` after it masked two `liveness-cost.test.ts` failures. I probed the shipped module directly with `tsx` — **no mutation, real code path, real `ps`**:

```
A. capture ok=true rows=1429 withStartedAtMs=1429 captureMs=64
A. this process (pid 69792) startedAtMs=1787863232000 (2026-08-27T20:40:32.000Z)
B. live original holder (lock mtime = now)      → NOT STOLEN ✓
C. pid-reuse shape (lock predates our start)    → RECLAIMED ✓ reason=pid-reused
D. 200 consecutive decisions on a live lock     → 5ms total (cache is warm)
E1. new pid 69916, cache still warm (<5s)       → NOT reclaimed (MISSED — stale cache)
E2. same pid after the 5s cache TTL expires     → RECLAIMED reason=pid-reused
```

**Cost: no per-acquire `ps`.** 200 consecutive reclaim decisions against a live-held lock cost **5 ms total** (~0.025 ms each) because they all hit the cache. One whole-table capture costs **64 ms** and happens at most once per 5 s, process-wide, shared by all three layers. The descriptor lock retries every 5 ms for up to 5 s — ~1000 iterations — and pays for at most one or two captures across the whole wait. The `liveness-cost.test.ts` property (fork once per sweep, never per row) holds in substance, not just in the guard's letter. Nothing here is per-descriptor.

**Staleness: the cache CAN go stale, and E1 is a real missed reclaim — but it is one-directional, and that is the point.** Applying this repo's own policy-vs-brake test: *what does removing the start-time read do?* It makes the code reclaim **strictly fewer** locks (dead-pid only). The read can only ever *permit* a reclaim, never require one. And staleness can only move the cached `startedAt` **earlier** than truth — a cache entry for pid *P* is *P*'s true start at capture time; if *P* has since been recycled the entry is the **older** process's start, never a newer one; if *P* was born after the capture there is no entry at all and `undefined` preserves the lock. So `startedAt <= lockedAtMs` gets *more* likely as the cache ages, never less. **A stale cache is a brake left on too long, not a policy deciding wrongly — it cannot manufacture a wrongful steal.** E1/E2 is that stated empirically: a genuinely new pid was missed while the cache was warm, and reclaimed correctly once the TTL expired. F-9 records the one operational consequence.

---

## RX3 — Findings

### F-1 (medium) — T004c's only sensor is a text count; the behaviour it protects can be deleted with the full suite green

`cli.integration.test.ts:1939` is the entire guard for T004c:

```ts
it("passes each pi/omp revive marker read as the exact-write baseline", () => {
  const source = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");
  expect(source.match(/registry\.writeExact\(\{ \.\.\.current, revivePendingAt \}, \{ baseline: current \}\);/g))
    .toHaveLength(2);
});
```

It asserts that a literal appears **exactly twice anywhere in `cli.ts`**. It says nothing about where, or whether either occurrence executes.

**MUT-13** removed the baseline from the real `--attach` revive site (`cli.ts:2466`) and parked an identical copy of the literal inside an unreachable local function, keeping the occurrence count at exactly 2:

```ts
registry.writeExact({ ...current, revivePendingAt });          // ← behaviour: baseline GONE
const deadPin = (): void => {
  registry.writeExact({ ...current, revivePendingAt }, { baseline: current });   // ← text: still counted
};
void deadPin;
```

Result: **`Test Files 172 passed | 2 skipped (174)` — the FULL extension suite, zero failures.** The pi/omp revive marker write silently reverts to a lost-update, and nothing anywhere notices.

Why this one matters more than an ordinary weak test: T004c exists **specifically** to close FX-2 from the Phase 5 re-review, whose entire content was "the lost-update shape survives at these two callers." The fix is correct. The guard against it regressing is a string search. The dossier asked for "TEST via the T004 revive cases (mutate → stale replay RED)"; what shipped is a source pin, and the execution log is candid about it ("failed the dedicated source pin at `cli.integration.test.ts:1948`").

**Not blocking**: the production code is right today, and the two revive integration tests do exercise those paths — they just do not distinguish a baselined write from a bare one. **Remedy**: one behavioural assertion — interleave a foreign field write between the `read` and the `writeExact` in the revive integration test and assert it survives, exactly the shape of `fs-registry.test.ts:262`.

### F-2 (medium) — the daemon's real SIGTERM path is unsensored; only the extracted helper is

`daemon.test.ts:2044` is the whole of T002, and it injects the thing under test:

```ts
installDaemonShutdownHandlers(() => calls.push("stop"), {
  onSignal: (signal, handler) => handlers.set(signal, handler),
  releaseHeldLocks: () => calls.push("release-locks"),   // ← the real one never runs
  exit: (code) => calls.push(`exit:${code}`),
});
```

**MUT-4** reverted the run-if-main block at `daemon.ts:1735` to the *pre-fix* shutdown — `stop?.(); process.exit(0)`, no lock release, the exact code AC-20 exists to remove — while leaving `installDaemonShutdownHandlers` exported and its test untouched. Result: **`Test Files 172 passed | 2 skipped (174)`, full suite green.**

So AC-20's "graceful stop leaves no lock" is proven for a helper, and the one line that makes the daemon use it is unguarded. This is the same shape `core/liveness-cost.test.ts` warns about at length in its own s095 and s101 blocks — *"a check that survives the thing it was watching, by watching where it no longer is, is worse than no check"* — and it recurred in the same commit that the guard's history is written into.

I acknowledge the run-if-main block (`if (import.meta.url === \`file://${process.argv[1]}\`)`) is genuinely awkward to test. **Remedy**: the cheap version is the same trick `liveness-cost.test.ts` already uses — a source assertion that `daemon.ts` contains `installDaemonShutdownHandlers(stop)` and **not** a bare `process.on("SIGTERM"` — which is weak but strictly better than nothing; the honest version is a child-process test that SIGTERMs a real daemon in a tmp home and asserts no lock file remains.

Positive control that this is a *sensor* gap and not a *code* gap: MUT-5 (breaking the helper itself) is RED, and `lock-reclaim.test.ts:73` proves the real `releaseHeldLocks` releases only still-owned tokens. Both halves work; the seam between them is untested.

### F-3 (low) — the production PID-reuse evidence source has no coverage at all

Every PID-reuse test in the change injects `processStartedAtMs`. **MUT-3** made the real one return `undefined` for every pid — which disables the pid-reuse branch entirely in production, degrading item 15 back to dead-pid-only, i.e. re-opening the exact wedge class the 15:45Z ruling named ("reclaim checks pid + process start time, never pid alone"). Result: **`Test Files 172 passed | 2 skipped (174)`, full suite green.**

**This is a sensor gap, not a live defect** — probe RX2-C shows the real path works on this host today (`RECLAIMED ✓ reason=pid-reused` using real `ps` evidence for a real live pid). But the whole ruling now rests on `NodeProcessSnapshot` yielding `startedAtMs`, and nothing measures that. A regression in the `lstart` regex (which the file itself documents as having already failed once on macOS column order), a platform where `Date.parse` returns `NaN` for the local `lstart` format, or a `ps` that overflows the buffer, would all silently return "unavailable evidence" — and unavailable evidence *preserves the lock*, so the failure is silent by design.

Note the asymmetry, because it is the reassuring half: the **dangerous** direction is well sensored (MUT-2 → RED ×5). Only the **beneficial** direction is blind.

**Remedy**: one test that plants a lock carrying `process.pid` with an mtime set an hour in the past and asserts, with **no injection**, that it is reclaimed with `reason: "pid-reused"`. That is probe C, and it takes four lines.

### F-4 (low) — descriptor-lock reclaims are completely silent in production

`onReclaim` is wired at both production `FsPlatformWriteLock` sites (`daemon.ts:455` → `this.log`, `cli.ts:1040` → a stderr warning), and `FsSpineLog` writes its own durable spine note regardless. But **not one of the ~30 production `new FsRegistry(...)` construction sites passes `onReclaim`** (`cli.ts` ×22, `daemon.ts` ×2, `index.ts` ×2, `telegram/index.ts` ×1, …). The option exists and is asserted in `fs-registry.test.ts:404` — by the test, and only by the test.

So a descriptor-lock reclaim in production — including the **new** ability to delete a *live* process's lock on pid-reuse evidence — leaves no log line, no stderr warning and no spine event. AC-20's note requirement names the two spine layers, so this is arguably outside its letter; but the retrofit brought the descriptor lock under the same rule, and `docs/how/pij.md:289-295` describes all three layers in one breath before naming only two note channels. An operator debugging a vanished descriptor lock has nothing to find.

### F-5 (low) — the three AC-20b sites have three different durability guarantees

Only the operator verb is crash-coupled:

| Site | Mechanism |
|---|---|
| `core/cli.ts:4712` (operator `dispatch-retire`) | `coupledRecordCommit` — journal-first, plus an optimistic re-read guard that refuses if the record changed under it |
| `daemon.ts:866` (close sweep) | `dispatchStore.write(...)` **then** `new FsSpineLog(...).append(...)` — two independent writes |
| `cli.ts:2232` (revive requeue) | `store.write(...)` **then** `spineLog.append(...)` — two independent writes |

A crash between the two writes at the latter two sites leaves the dispatch retired/requeued with **no note** — the audit trail AC-20b exists to create is exactly what is lost, and the journal-recovery widening in `journal.ts` cannot help, because those sites never enter the journal. Both also `throw` if the append fails *after* the record is already written, which aborts the sweep mid-loop with the store already mutated.

I am reporting this as a **finding, not a blocker**: AC-20b asks for a note at all call sites and gets one on every non-crash path, and losing a *note* is not losing the *record*. But the asymmetry is undocumented, and the operator path demonstrates the coder knows the coupled form.

Minor, same site: `daemon.ts:866` constructs `new FsSpineLog(this.pijHome)` **inside the per-dispatch loop**, so each retired dispatch pays a fresh constructor (which does a `mkdirSync`). Hoisting it out of the loop is free.

### F-6 (info) — the `dispatch-requeued` journal arm has no production producer

`journal.ts:67` widened adjudication to `dispatch-retired` **and** `dispatch-requeued`. Grep of non-test sources: `kind: "dispatch-retired"` is produced at `daemon.ts:870` and `core/cli.ts:4700`; `kind: "dispatch-requeued"` **only** at `cli.ts:2237`, which does a plain `spineLog.append` and never journals an intent. So the `dispatch-requeued` half of `isDispatchJournalKind` is unreachable in production; its only exercise is the `journal.test.ts` case that seeds the op directly. Harmless future-proofing — but a reader of `journal.ts` would reasonably infer a coupled requeue path exists.

### F-7 (info) — `prior-state:` means two different things depending on the site

The two retire sites record the true state immediately prior to the transition (`prior-state:${previous.state}`). The requeue site records `previous.retirement?.priorState ?? next.value.state` (`cli.ts:2234`) — the state the dispatch held **before it was retired**, i.e. the state it is being restored *to*, not the state it is transitioning *from* (which is always `"retired"`). The choice is defensible (`"retired"` would be uninformative) and the test pins it (`prior-state:undelivered` for a record whose `state` is `"retired"`), but the same ref key now carries opposite semantics across kinds, and nothing says so. `reason:` at that site also silently degrades to `unknown` when `retirement` is absent.

### F-8 (info) — the reclaim branch `continue`s without consulting the deadline. Reasoned; I could NOT reproduce it

In all three acquirers the reclaim branch is `if (reclaimed !== null) { …; continue; }`, which skips **both** the `Date.now() >= deadline` check and the retry sleep at the bottom of the loop (`platform-write-lock.ts:100-103`, `spine-store.ts:275-278`, `fs-registry.ts:247-250`). If a reclaimable lock were re-supplied continuously — a crash-looping holder under a supervisor — acquisition would spin hot past its budget rather than failing with E-NOREG, and in `spine-store` the `reclaims[]` array would grow unbounded, every entry eventually appended to the spine.

**I tried twice to reproduce this and failed both times, and the second failure is informative.** Attempt 1 used a `setInterval` replanter in the same process — useless, because `withPlatformWriteLock` is fully synchronous and starves the event loop. Attempt 2 used a real child process busy-looping on `existsSync`+`writeFileSync`; the parent acquired in **1 ms after 1 reclaim**, because the window between `rmSync` and `openSync("wx")` is sub-millisecond while a crash-loop restart is tens of milliseconds. I therefore believe this is **theoretical**: the contender wins the race essentially always. I am recording it because the budget genuinely is not enforced on that path and someone may later find an input shape I did not.

### F-9 (info) — PID-reuse reclaim can lag the `events.lock` budget by the cache TTL

`PROCESS_SNAPSHOT_CACHE_MS = 5_000` (`lock-reclaim.ts:21`) exceeds the `events.lock` acquisition budget of 2000 ms. Probe E1 shows a genuinely new pid is invisible to the decision while the cache is warm. So a reclaimable PID-reuse wedge can still produce `E-NOREG … held for over 2000ms` for up to ~5 s before the next capture makes it reclaimable. Strictly better than the pre-fix refuse-forever, fails in the safe direction (F-6's directional argument above), and self-heals on the next attempt. Recording it so the wedge is not mistaken for a regression if it is observed once.

---

## RX4 — Mutation ledger

Baselines: **B1** = 8 adapter/daemon suites, 229 passed | 3 skipped, 8.2 s. **B2** = `cli.integration.test.ts` + `core/cli.test.ts`, 2 files passed, 168 s. **B3** (Dim-0 `-t` selectors) = 1 passed | 109 skipped each. Every mutation applied by a Python script asserting `count(anchor) == 1` (a missed anchor aborts loudly instead of no-op'ing into a fake GREEN), and every one restored from a pristine byte-copy taken before the campaign.

| # | Target | Mutation | Result |
|---|---|---|---|
| MUT-1 | `lock-reclaim.ts` `processIsAlive` | always DEAD | **RED ×5** — all three layers |
| MUT-2 | `lock-reclaim.ts` `processStartedAtMs` | always newer than the lock | **RED ×5** — all three layers |
| MUT-3 | `lock-reclaim.ts` `processStartedAtMs` | always `undefined` | **GREEN (full suite)** → F-3 |
| MUT-4 | `daemon.ts` run-if-main | revert to pre-fix shutdown | **GREEN (full suite)** → F-2 |
| MUT-5 | `daemon.ts` shutdown helper | drop the release call | **RED** — `daemon.test.ts:2044` |
| MUT-6 | `lock-reclaim.ts` `releaseOwnedLock` | drop the token check | **RED ×2** |
| MUT-7 | `daemon.ts:866` | remove the sweep note | **RED** — `daemon.delivery.test.ts` |
| MUT-8 | `journal.ts:67` | narrow back to `dispatch` only | **RED ×2** — `journal.test.ts` |
| MUT-9 | `fs-registry.ts:246` | steal ANY lock | **RED ×2** — incl. `expected 2 to be >= 20` (**T004b closed**) |
| MUT-10 | `cli.ts:2232` | remove the requeue note | **RED** — `cli.integration.test.ts` |
| MUT-11 | `core/cli.ts:4696` | bare store write, no coupled commit | **RED** — `cli.integration.test.ts` |
| MUT-12 | `core/cli.ts:4718` | revert the `0 open (N)` wording | **RED** — `cli.integration.test.ts` |
| MUT-13 | `cli.ts:2466` | drop the baseline, keep the literal count at 2 | **GREEN (full suite)** → F-1 |

Ten RED, three survivors. All three survivors were re-run against the **full 172-file suite**, not a subset, so "green" means green everywhere.

**Restoration, verified four ways**: `cmp` against pristine byte-copies after every single mutation (the harness aborts if any differ); `git diff --name-only -- .pi/ docs/how/` empty at the end; `git hash-object <f>` == `git rev-parse 38eb4ed:<f>` for all six mutated production files; HEAD unmoved at `38eb4ed`.

---

## RX5 — Gates

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/` (dossier form, via `pij bg`) | **172 files passed \| 2 skipped; 4047 passed \| 15 skipped; 0 failed**; 180.69 s — matches the execution log's claim exactly |
| Wider run (`.pi/extensions/pij/ harness/ skills/`) | 212 passed / **1 failed** / 4 skipped — the single failure is `harness/scripts/release-age-policy.test.ts:196 spawnSync pwsh ENOENT`, i.e. `pwsh` is not installed on this host. Pre-existing, environmental, outside the reviewed scope. |
| `npx tsc --noEmit -p .` | exit **0** |
| `npx biome check --max-diagnostics=200 <16 changed .ts>` | exit **0**, "Checked 16 files in 100ms" |
| `just lint` / `harness checks --quick` | **not run by me** — see RX0 |

---

## RX6 — Prior-round carries

| Item | Status |
|---|---|
| **T004b** (Phase 5 FX-1, contention sensor blind) | **CLOSED** — measurement hoisted to before `await released`; MUT-9 RED at `expected 2 to be >= 20` |
| **T004c** (Phase 5 FX-2, revive sites lack a baseline) | **Code fixed; guard is a text count** — see **F-1** |
| `core/session.ts` left exact by design | Confirmed unchanged; the execution log says so explicitly |

---

## Summary

| ID | Sev | Subject |
|---|---|---|
| F-1 | medium | T004c guarded by a source-text count; MUT-13 removed the behaviour with the full suite green |
| F-2 | medium | Daemon's real SIGTERM path unsensored; MUT-4 reverted AC-20's shutdown with the full suite green |
| F-3 | low | Production PID-reuse evidence source has no coverage; MUT-3 green (sensor gap, not a live defect) |
| F-4 | low | Descriptor-lock reclaims are silent in production — no `FsRegistry` site passes `onReclaim` |
| F-5 | low | Only the operator retire is journal-coupled; sweep and revive can tear record-vs-note |
| F-6 | info | `dispatch-requeued` journal arm has no production producer |
| F-7 | info | `prior-state:` carries opposite semantics at the requeue site |
| F-8 | info | Reclaim branch skips the deadline check — reasoned, **not reproduced** (two attempts) |
| F-9 | info | PID-reuse reclaim can lag the 2 s `events.lock` budget by the 5 s cache TTL; fails safe |

**Highest: medium. Verdict: APPROVE-WITH-FINDINGS.**

---

## TERMINAL REPORT

This pass is **CLOSED**. Every mutation was restored byte-identical and verified four ways; the tracked tree is clean apart from the `review-brief.md` modification that predated me; HEAD is unmoved at `38eb4ed`. No further mutation, probe or repo write follows this report. F-1's and F-2's remedies are code changes and exceed this reviewer seat's read-only fence — they need a coder seat.

Evidence retained: `/tmp/pw15/` (pristine byte-copies, the 13 mutation scripts, `mut2.sh`, `probe-evidence.mts`, `probe-spin2.mts`, base/head `vitest list` output) and `~/.pij/pij-powerful-whale/bg-mtbyq4k5-wvhdo8.log` (the authoritative gate).

38eb4ed19302a52f4418968b61bad6e211486299

---

## Re-review FX-01

**Reviewer**: `pij-powerful-whale` (same cold reviewer as review-01) · **reviewId**: `review-01-fx01`
**Frozen SHA**: `49893fb072b73120a6df907a3a59cef7792cdfc7` · **parent**: `38eb4ed` (the commit reviewed above) · branch `s391/item15-spine-lock-reclaim`
**Scope**: `git diff 38eb4ed..49893fb` — 17 files, +375/−63. Nothing above this line was rewritten.
**Fix packet**: `fix-01.md` (FX-01.1…FX-01.7, from F-1, F-2, F-3, F-4, F-5, F-8 and the F-6/F-7/F-9 doc notes).

**VERDICT: APPROVE-WITH-FINDINGS · highest = low · no open major/high → not FIX_REQUIRED.**

Both mediums (F-1, F-2) are **closed**, each proven by the reviewer's own named mutation going RED. All six fix items land. Seven new findings, all **low/info**, none blocking.

---

## RX0 — Scaffolding first, and the limits of this pass

Stated before any finding, so a gate I did not examine and a gate I found clean do not look the same.

**Scaffolding I built** (none of it in the repo; the repo was read-only except this file):
- `/tmp/pw15fx/mut.sh` — the mutation harness. Each mutation script declares its targets as `# TOUCHES:` lines; the harness takes pristine byte-copies once, **aborts before running vitest if `git diff --name-only -- .pi/` is empty** (the false-GREEN guard I needed after my own round-1 incident), prints the mutated file list, restores from the byte-copies, then verifies with `cmp` + a scoped `git diff`. It never runs a destructive git verb.
- `/tmp/pw15fxbase/` — `git archive 38eb4ed | tar -x`, `node_modules` symlinked, used only for the `vitest list` declaration diff.
- `/tmp/pw15fx/probe/hook-radius.mts` — a `tsx` probe on **pristine, unmutated** source.

**Limits — things I did NOT verify:**
1. `just lint` repo-wide and `harness checks --quick`. I ran `biome check` on the 15 changed `.ts` files (exit 0) and `tsc --noEmit -p .` (exit 0). The coder's claim that `just lint` is red only in unrelated pre-existing files is **not independently confirmed by me**.
2. `docs/plans/391-day3-core/kept-logs/vitest-phase6-fx01.log.txt` — I did not read the coder's log. I ran my own full gate and matched its numbers exactly.
3. Anything Windows/`pwsh`. `pwsh` is absent on this host; a run including `harness/` still fails `release-age-policy.test.ts:196` with `spawnSync pwsh ENOENT` (pre-existing, unrelated to FX-01, present in my round-1 baseline too).
4. A **real kernel PID recycle**. Every PID-reuse proof uses either an injected start time or the *shape* (a lock whose mtime predates the live holder's start).
5. `b9a9e43` / `38eb4ed` as separate steps — out of scope this round.
6. Multi-process contention *combined with* a reclaim across all three layers simultaneously.
7. Whether `ps lstart` parsing is correct on Linux/GNU column order.
8. The three unwired `FsRegistry` sites (G-6) — I located them statically; I did not drive a reclaim through them.

**Base trap, restated because it still applies.** The dispatch's stated base `e46eec8a` is a genuine `git merge-base origin/main HEAD`, but `origin/main` has now advanced to `031ccce` — **five** commits ahead. Two-dot `origin/main..HEAD` would again show other commits' work as phantom reversals. Every number here is from `38eb4ed..49893fb`, the explicitly requested range.

**Re-dispatch guard applied**: `fix-01.md` mtime 06:50:30 > `review-01.md` mtime 06:47:48, and `grep -n "Re-review"` on `review-01.md` returned nothing. Genuine new work, not a re-dispatch of delivered work.

---

## RX1 — Freeze, scope, anti-vacuity, fences

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `49893fb072b73120a6df907a3a59cef7792cdfc7` ✓ |
| `git rev-parse HEAD^` | `38eb4ed…` = the commit reviewed above ✓ |
| branch | `s391/item15-spine-lock-reclaim` ✓ |
| tracked tree at start | clean **except** `review-brief.md` (the orchestrator stamps the SHA at dispatch; predates me) |
| `tsc --noEmit -p .` | **exit 0** |
| `biome check` (15 changed `.ts`) | **exit 0** — "Checked 15 files… No fixes applied" |
| full vitest (`npx vitest run .pi/extensions/pij/`, dossier form, via `pij bg`) | **172 files passed / 2 skipped · 4053 passed / 15 skipped / 0 failed** · 183.32 s · log `~/.pij/pij-powerful-whale/bg-mtc0ydz0-bniqjr.log` — **matches the coder's claim exactly** |

**Anti-vacuity — `npx vitest list` on both trees, over the 8 changed test files.** Base `38eb4ed` = 328 declarations, head `49893fb` = 334. **3 removed, 9 added, 328 + 9 − 3 = 334 — closes exactly.**

Removed:
- `cli.integration.test.ts > passes each pi/omp revive marker read as the exact-write baseline` — the F-1 source pin, deliberately deleted. Its replacement is **not** a new declaration; it is behavioural assertions folded into four *existing* revive tests. So a declaration diff alone would have shown this as a net test loss. **M1 proves the replacement has teeth** (below).
- `journal.test.ts` `it.each(["dispatch-retired","dispatch-requeued"])` → one `dispatch-retired` test (flag 2).

**Assertion-level check** (a declaration diff is blind to assertions deleted from a surviving test): the removed-line diff over all changed `*.test.ts` yields exactly two assertion lines, both from the two rewrites above, each with a direct replacement (`expect(log.events[0]?.kind).toBe("dispatch-retired")`). **No assertion was silently dropped from a surviving test.**

**Fences — byte-identical at three points each** (blob at `38eb4ed` = blob at `49893fb` = worktree blob):

`core/types.ts` · `core/revive.ts` · `core/registry-write.ts` (holds `DESCRIPTOR_FIELD_OWNER`) · `core/ports.ts` · `core/platform/dispatch.ts` · `adapters/process-snapshot.ts` · `core/liveness-cost.test.ts` · **`core/cli.ts`** — all **IDENTICAL**. The `core/cli.ts` fence matters twice over: it is the *only* module that journals (all 8 `coupledRecordCommit` sites), which is what makes the flag-2 answer airtight.

---

## RX2 — Each finding, with my own mutation

Dim-0 honoured: every selector was baselined on pristine source **before** any mutation.
Baselines — **B1** adapters ×4 = 89 passed | 1 skipped (3.6 s); **B2** daemon ×2 = 89 passed | 2 skipped (12.7 s); **B3** `cli.integration.test.ts -t "revival asynchronously…|when attaching a revived|warns when the CLI registry factory reclaims"` = 5 passed | 105 skipped (3.5 s).

### F-1 (medium) — CLOSED. The source-count pin is gone and the replacement has real teeth.

FX-01.1 deleted the regex/`toHaveLength(2)` pin and replaced it with behaviour: the four revive cases now seed `systemState: "idle"`, set `PIJ_TEST_REVIVE_FOREIGN_WRITE=<id>` so a foreign daemon-attributed write lands **between the revive read and its `writeExact`**, and assert `systemState === "working"` survives.

**M1** — `cli.ts`: drop `, { baseline: current }` from both revive `writeExact` calls (anchor asserted at exactly 2 occurrences). This is **verbatim the round-1 MUT-13 that survived**.

```
FAIL … > requeues close-retired mail when attaching a revived omp session
- "systemState": "working",
+ "systemState": "idle",
  ❯ .pi/extensions/pij/cli.integration.test.ts:1969:41
Tests  4 failed | 1 passed | 105 skipped (110)
```

**RED ×4** (pi/omp × spawn/attach), the failure signature being the lost update itself. Critically, the round-1 dodge — parking an identical literal in unreachable code to keep a text count at 2 — **is now structurally impossible**, because nothing counts text any more.

### F-2 (medium) — CLOSED. The real daemon signal path is now sensored.

FX-01.2 spawns a real `tsx daemon.ts` child in a `mkdtempSync` home, waits for a `PIJ_TEST_LOCKS_HELD` stdout marker, asserts both locks exist, `SIGTERM`s, and asserts `{code: 0, signal: null}` plus both locks gone.

**M2** — `daemon.ts` run-if-main only: replace `installDaemonShutdownHandlers(stop);` with the pre-fix inline `process.once("SIG…", () => { stop?.(); process.exit(0); })` pair. **This is verbatim the round-1 MUT-4 that survived.** The extracted helper is left untouched on purpose, so the mutation isolates the *real* path.

```
FAIL … > the real daemon SIGTERM path releases write.lock and events.lock in a temp home
expected true to be false   ❯ daemon.test.ts:2126:34   (existsSync(writeLock))
Tests  1 failed | 2 passed | 68 skipped
```

**RED — and the helper test stayed GREEN**, which is the proof that the child test, not the helper test, is the sensor. The exact pattern `core/liveness-cost.test.ts` warns about is closed.

### F-3 (low) — CLOSED. The production evidence source is covered.

**M3** — `lock-reclaim.ts`: `processStartedAtMs` returns `undefined` unconditionally (round-1 MUT-3, which survived the whole 172-file suite).

```
- Expected: { "pid": 34207, "reason": "pid-reused" }
+ Received: null
  ❯ .pi/extensions/pij/adapters/lock-reclaim.test.ts:73:50
```

**RED at exactly the orchestrator-named line.** The new test is genuinely uninjected — it plants `${process.pid}` with an mtime one hour old and relies on the real cached `NodeProcessSnapshot`.

### F-8 (info) — CLOSED in all three acquirers, with one sensor per layer.

Each acquirer now checks the deadline on the successful-reclaim branch before `continue`. Three separate mutations, each removing exactly one layer's new block:

| Mutation | Layer | Result |
|---|---|---|
| **M4a** | `fs-registry.ts` descriptor.lock | **RED** — `fs-registry.test.ts > does not let a successful descriptor reclaim bypass an exhausted deadline` |
| **M4b** | `platform-write-lock.ts` write.lock | **RED** — `platform-write-lock.test.ts > does not let a successful reclaim bypass an exhausted deadline` |
| **M4c** | `spine-store.ts` events.lock | **RED** — `spine-store.test.ts > … an exhausted events.lock deadline` |

Each mutation reddened **only its own layer** (1 failed | 88 passed each time) — three independent sensors, not one shared one.

### F-4 (low) — CLOSED at the two seams the packet named; **narrowed**, not universal (see G-6).

One factory each, as the packet demanded (not 27 edits): `createRegistry()` in `cli.ts` (22 call sites converted) and `createDaemonRegistry()` in `daemon.ts` (2 sites). `grep "new FsRegistry("` over non-test code now returns only the two factory bodies plus three untouched sites.

| Mutation | Result |
|---|---|
| **M5** — drop `onReclaim` from `createDaemonRegistry` | **RED** — `daemon.test.ts > logs a descriptor-lock reclaim through the production daemon registry factory` |
| **M6** — drop `onReclaim` from `createRegistry` | **RED** — `cli.integration.test.ts > warns when the CLI registry factory reclaims a dead descriptor lock` (this one drives the **real bin** via `spawnSync` and asserts on child **stderr**) |

### F-5 (low) — CLOSED on the daemon side; the hoist is real; the symmetric CLI change is unsensored (G-4).

**M7** — restore `if (!noted.ok) throw new Error(...)` in the sweep → **RED**, `daemon.delivery.test.ts > continues retiring dispatches when a best-effort sweep spine note fails`.

The hoist is genuine and the coder's "lazy once per actual sweep" claim is true: `retireForClosedRecipients` returns early at `if (closedRecipients.size === 0) return;` (daemon.ts:851) **before** `const spineLog = this.dispatchSpineLog ?? new FsSpineLog(this.pijHome);` (daemon.ts:857), which itself sits outside the `for (const to of closedRecipients)` loop. One construction per sweep-with-work, never per dispatch.

### F-6 / F-7 / F-9 (info) — addressed.

`docs/how/pij.md` now states the durability asymmetry (operator verb journal-coupled; sweep/revive best-effort) and spells out the divergent `prior-state:` semantics per kind — which was exactly F-7. `lock-reclaim.ts` carries a comment on the ≤5 s cache lag and that it fails conservative — exactly F-9. F-6 was resolved by removing the arm (flag 2, below).

---

## RX3 — The four orchestrator flags

### Flag 1 — `holdSignalTestLocks()`: acceptable seam, **but there are two hooks, not one, and this one's payload is destructive.**

**Precedent exists and pre-dates this change.** `grep "PIJ_TEST_"` over non-test code finds `PIJ_TEST_NO_FSYNC` (`adapters/atomic-file.ts:33`) and `PIJ_TEST_P3_TRACE` (`cli.ts:278`, "Test-only ordered trace seam"). The fix packet also explicitly authorised it: *"if a test-only hook is needed, keep it minimal."* On convention, this is in-house style, not a novelty.

**But this hook differs in kind from both precedents, and I measured it rather than guessing.** Probe on pristine source (`/tmp/pw15fx/probe/hook-radius.mts`), reproducing exactly what `holdSignalTestLocks` does — both locks planted with the *current live* pid at mtime = now:

```
planted both locks with our own live pid 74410
A. reclaimIfDead on our own live self-held lock -> NULL (not reclaimable)
B. FsSpineLog.append -> {"ok":false,"code":"E-NOREG","message":"spine lock …/events.lock held for over 2000ms …"} after 2001ms
B. spine events on disk: 0
B. locks still present: write=true events=true
```

So if `PIJ_TEST_HOLD_LOCKS_ON_START=1` ever reached a real daemon, that daemon would be **permanently unable to write its own spine** for its whole life — every append stalling a full 2 000 ms and returning `E-NOREG` — and the reclaim rule *correctly* refuses to rescue it (the daemon started **before** the lock, so it is neither a dead pid nor a reused one). `PIJ_TEST_NO_FSYNC` weakens durability; `PIJ_TEST_P3_TRACE` only observes. This one bricks the spine.

**And the orchestrator flagged only one of the two hooks.** `cli.ts:270` adds `interleaveReviveMarkerForTest`, gated on `PIJ_TEST_REVIVE_FOREIGN_WRITE === current.id`, which performs a **real `registry.write({...latest, systemState: "working"}, "daemon")`** — a state mutation impersonating the daemon writer — and `throw`s if the descriptor vanished.

**My judgment: acceptable, not blocking.** Both are exact-match gated, both follow existing repo precedent, and F-2's whole point was that the *real* path had to be exercised — a mock would have re-created the gap. Recorded as **G-1/G-2 (low)** with one concrete hardening: neither hook checks that `PIJ_HOME` is a scratch directory, and `holdSignalTestLocks` would happily plant self-wedging locks in a real `~/.pij`. A cheap guard (refuse unless the home is under `tmpdir()`) would keep the sensor and remove the blast radius.

### Flag 2 — no replay regression. Proven, not assumed.

Three independent legs:

1. **Reachability.** `isDispatchJournalKind` is called only at `journal.ts:204` and `:374`, both inside recovery adjudication of an op **already in the op journal**. Ops enter the journal only via `coupledRecordCommit`, and all 8 of its call sites live in `core/cli.ts` — **a fence file, byte-identical to base**. The only `dispatch-requeued` producer is `cli.ts:2252`, which appends **straight to the spine log**, best-effort, and never journals. No producer can put that kind into a journal.
2. **History.** `git grep dispatch-requeued e46eec8a` → **absent at base**. The kind was born in `38eb4ed`, on this unmerged branch, and never journalled even then. No on-disk journal anywhere can carry it.
3. **Fail-closed fallback.** Even in the impossible case, an unrecognised kind falls through to `blocked(op, "carries an unadjudicable intent…")` (journal.ts:213) — recovery *blocks*, it cannot forge or mis-replay.

`cli.ts:2252` does still emit the kind, and it still reaches the spine and remains readable there. Confirmed: **the drop is safe.**

### Flag 3 — no scope creep beyond the finding fixes.

15 of the 17 files are inside fix-01's named paths, once FX-01.6's literal *"their tests"* is honoured (that clause covers `platform-write-lock.test.ts`, `spine-store.test.ts`, `fs-registry.test.ts`). `execution.log.md` is ordinary bookkeeping.

The genuine excursion is **`journal.{ts,test.ts}`** — not named in any FX row. It is nonetheless squarely inside FX-01.7's granted latitude: *"requeued journal arm has no producer (say so or produce it from the revive site … **your call, record it**)"*. The coder took a third option — delete it — which is a faithful answer to F-6, is fail-closed, and **is** recorded in `execution.log.md`. Recorded as **G-5 (info)**, not creep.

Decisive negative evidence: the eight fence files are byte-identical, `core/cli.ts` is untouched, `DESCRIPTOR_FIELD_OWNER` and `SessionDescriptor` are unchanged, and no file outside the 17 moved.

### Flag 4 — yes, the operator can see the loss; but not in the spine, and one loss is silent.

| Path | On note failure | Operator sees it? |
|---|---|---|
| daemon close sweep (`daemon.ts:889`) | `this.log("retire <id>: dispatch retired but spine note failed (…)")` | **Yes** — `this.log` is the injected `log`, which in `runDaemon` defaults to `process.stdout.write` → the daemon log. Asserted by the M7 test, which matches both the prefix and the injected cause. |
| CLI revive requeue (`cli.ts:2258`) | `process.stderr.write("warning: dispatch <id> was requeued but its spine note failed (…)")` | **Yes** — directly on the operator's terminal. But **untested** (G-4). |

Two caveats. First, the *record* is durable in both cases (write precedes note), so the loss is a missing audit line, never a lost retirement — and `docs/how/pij.md` now says so. Second, the loss is invisible **in the spine itself**, which is the audit surface: nothing marks the gap. Separately, **G-3** below is a reclaim receipt lost with *no* log at all.

---

## RX4 — New findings from this pass

| # | Sev | Finding |
|---|---|---|
| **G-1** | low | `holdSignalTestLocks` (daemon.ts:1753) is production-resident and, if `PIJ_TEST_HOLD_LOCKS_ON_START=1` is ever set, permanently wedges the daemon's own spine writes (probed: `E-NOREG` after a 2 000 ms stall, unreclaimable by design). No guard that `PIJ_HOME` is a scratch dir. |
| **G-2** | low | A **second, unflagged** production test hook: `interleaveReviveMarkerForTest` (cli.ts:269) performs a real daemon-attributed `registry.write` of `systemState: "working"` when `PIJ_TEST_REVIVE_FOREIGN_WRITE` matches a descriptor id, and `throw`s if the descriptor is gone. Same missing scratch-home guard. |
| **G-3** | low | **The F-8 fix opens a receipt hole in the layer that owns receipts.** On the new `events.lock` bail, `reclaimIfDead` has *already* `rmSync`'d the lock, but `spine-store.ts:277` returns `err("E-NOREG")` **before** the critical section, so the accumulated `reclaims` are discarded and `appendReclaimNote` never runs. All 6 production `new FsSpineLog(...)` sites pass no `onReclaim`, so nothing logs it either: the lock is silently reclaimed with **no spine note and no warning**. The new test *pins the loss* rather than flagging it — `expect(new FsSpineLog(home).read()).toEqual([])`. Before FX-01.6 the loop would `continue`, acquire, and append the note. Narrow (needs an exhausted budget at the exact moment of a reclaim) and fails safe, but it contradicts item 15's own AC — "reclaimed with a spine/receipt note naming layer + pid". |
| **G-4** | info | The CLI revive-requeue non-fatal change (`cli.ts:2255-2259`) has **no test** — `grep "was requeued but its spine note failed"` finds only the production line. Its daemon twin is sensored (M7). This throw→warning change was also beyond FX-01.5's named files. |
| **G-5** | info | `journal.{ts,test.ts}` is a file-scope excursion beyond fix-01's named paths; semantically inside FX-01.7's "your call, record it", and duly recorded. Flagging the *shape*, not objecting. |
| **G-6** | info | F-4 is **narrowed, not universal**: three production `FsRegistry` constructions remain unwired — `index.ts:110`, `index.ts:261`, `telegram/index.ts:313`. Descriptor-lock reclaims from the pi extension and the Telegram bridge stay silent. The packet named only the daemon and CLI-bin seams, so this is faithful to the packet, not a defect against it. |
| **G-7** | info | `fs-registry.ts:249-252` now prints, **immediately after reclaiming and deleting that very file**, "locks are never stolen; if its writer is dead, remove the file manually: `<path>`". The message is literally false on this path and points the operator at a file that no longer exists. The same 3-line throw is now duplicated a few lines apart. |

---

## RX5 — Mutation ledger

All 8 restored byte-identical. Every run passed through the harness's false-GREEN guard, which **aborts before vitest** if the mutation produced no change under `.pi/`.

| # | Target | Mutation | Expected | Result |
|---|---|---|---|---|
| M1 | `cli.ts` ×2 revive sites | drop `{ baseline: current }` (= round-1 MUT-13) | RED | **RED ×4** @ `cli.integration.test.ts:1969` |
| M2 | `daemon.ts` run-if-main | pre-fix inline signal handlers (= round-1 MUT-4) | RED | **RED** @ `daemon.test.ts:2126`, helper test still green |
| M3 | `lock-reclaim.ts` | `processStartedAtMs` → `undefined` (= round-1 MUT-3) | RED | **RED** @ `lock-reclaim.test.ts:73` |
| M4a | `fs-registry.ts` | remove reclaim-branch deadline | RED | **RED**, descriptor.lock only |
| M4b | `platform-write-lock.ts` | remove reclaim-branch deadline | RED | **RED**, write.lock only |
| M4c | `spine-store.ts` | remove reclaim-branch deadline | RED | **RED**, events.lock only |
| M5 | `daemon.ts` | `createDaemonRegistry` drops `onReclaim` | RED | **RED** |
| M6 | `cli.ts` | `createRegistry` drops `onReclaim` | RED | **RED** (through the real bin, on stderr) |
| M7 | `daemon.ts` | sweep note failure fatal again | RED | **RED** |

**All 9 mutations RED. Zero survivors** — against three survivors in round 1 (MUT-3, MUT-4, MUT-13), each of which is now covered by M3, M2 and M1 respectively.

Restoration verified four ways: the harness's `cmp` against pristine byte-copies; a scoped `git diff --name-only -- .pi/` (empty); a blob-level sweep confirming every one of the 17 changed files hashes to its `49893fb` blob; and `git status --porcelain`, clean apart from the pre-existing `review-brief.md`.

**Safety:** no commits, no `npm link`, the live daemon untouched (`pij daemon status` → still `running (pid 82643)` at the end), and `~/.pij/spine/` holds no lock files before or after. All tests use `mkdtempSync` homes.

---

## RX6 — Summary

| Round-1 finding | Sev | Status after FX-01 |
|---|---|---|
| F-1 T004c guarded by a text count | medium | **CLOSED** — behavioural; M1 RED ×4 |
| F-2 real daemon signal path unsensored | medium | **CLOSED** — real child + SIGTERM; M2 RED |
| F-3 production `processStartedAtMs` uncovered | low | **CLOSED** — uninjected test; M3 RED |
| F-4 descriptor reclaims silent in production | low | **CLOSED** at both named seams; M5/M6 RED · narrowed (G-6) |
| F-5 sweep/revive note sites fatal mid-loop | low | **CLOSED** daemon-side (M7 RED) + hoist verified · CLI twin unsensored (G-4) |
| F-6 `dispatch-requeued` journal arm unreachable | info | **CLOSED** — arm removed; no replay regression (flag 2, three legs) |
| F-7 divergent `prior-state:` semantics | info | **CLOSED** — spelled out in `docs/how/pij.md` |
| F-8 reclaim branch skips the deadline | info | **CLOSED** in all three layers; M4a/b/c RED · opens G-3 |
| F-9 5 s cache can lag the 2 s budget | info | **CLOSED** — documented as conservative and self-healing |

New: **G-1, G-2, G-3** (low) · **G-4, G-5, G-6, G-7** (info).

**Highest: low. No open major/high. VERDICT: APPROVE-WITH-FINDINGS.**

---

## TERMINAL REPORT — Re-review FX-01

This pass is **CLOSED**. All 9 mutations were restored byte-identical and verified four ways; HEAD is unmoved at `49893fb`; `git diff -- .pi/` is empty; the tracked tree is clean apart from the `review-brief.md` modification that predated me. **No mutation, probe, or repo write follows this report.** Every G-finding remedy is a code change and exceeds this reviewer seat's read-only fence — they need a coder seat.

Evidence retained: `/tmp/pw15fx/` (harness `mut.sh`, mutation scripts `m1`–`m7`, pristine byte-copies, `probe/hook-radius.mts`, base/head `vitest list` output), `/tmp/pw15fxbase/` (the `38eb4ed` tree), and `~/.pij/pij-powerful-whale/bg-mtc0ydz0-bniqjr.log` (the authoritative gate).

49893fb072b73120a6df907a3a59cef7792cdfc7
