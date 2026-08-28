# Cold review — Phase 5, item 13 (descriptor lost-update race) — dlg-0013

**Reviewer**: `pij-powerful-whale` — cold cross-model (claude-opus-5 via GitHub Copilot CLI), no prior contact with this branch.
**Frozen at**: `553b57513f219be9c148de87cea55d588f8b5c18` on `s391/item13-status-lost-update`.
**Base**: `35272aed404f3c3a3ae264b94004d0d0eb115dcb` — re-derived here as `git merge-base origin/main HEAD`, not taken from the brief.
**Verdict**: **APPROVE-WITH-FINDINGS** · highest = **medium** (F-1) · nothing here is a merge stopper *on my reading*; see the explicit hand-back in §R4 about AC-19's wording, which is a spec call and not mine to make.

---

## R0 — Scaffolding, and the limits of this pass

Stated first, deliberately, so that nothing below reads as broader than it is.

**Scaffolding I had to build.**

- The full-gate invocation I ran first was **a false green** and I nearly banked it. I ran `npx vitest run --root .pi/extensions/pij`, which relocates the root out from under the config's `include` globs; it printed `No test files found, exiting with code 0`. Exit 0, no tests. I re-ran with the dossier's own form (`npx vitest run .pi/extensions/pij/`) and that is the only gate figure quoted in this document. Recording it because an `exit 0` from a test runner is the single most dangerous thing a reviewer can accept without reading the body.
- All seven mutations were applied by `python3` heredoc with an `assert s.count(old) == 1` guard, so a mutation that failed to match could not silently no-op into a fake GREEN.
- Behavioural probes were run with `npx tsx` from `/tmp/pw13/` importing the repo by absolute path. They touch only `mkdtemp` homes. **The live daemon and this machine's `~/.pij` were never written to.**

**What I could NOT check — none of this is cleared, it is unexamined or only partly examined.**

1. **No live-daemon proof.** Forbidden by the addendum (§3) and not required by it. Everything below is adapter/registry/port level plus fakes.
2. **No real multi-process race.** Every interleaving I exercised is a *seam* inside one process. The lock's cross-process correctness rests on `linkSync` returning `EEXIST` atomically, which I read but did not prove with two competing OS processes.
3. **`just smoke` and `harness checks` were not run.** The dossier claims `harness checks --quick` passes apart from unrelated pre-existing baselines; **I did not verify that claim.**
4. **Biome was scoped to the 8 changed TypeScript files, not repo-wide.** The execution log states `just lint` is red only in unrelated pre-existing files. **I did not verify that either** — if the o-prime needs it, it is one repo-wide run away.
5. **The originating incident evidence is hearsay to me.** Spine `25304 → 25305 → 25306` and the stuck `statusAt/statusSeq` at `25199` come from the o-prime's 16:35Z note. I reproduced the *mechanism* (§R2.1); I did not confirm those spine rows exist.
6. **Windows is untested.** The 2 skipped files / 15 skipped tests are the pre-existing `windows-compat` skips under Jordan's 2026-07-30 ruling; the diff adds no skip and removes none.
7. **F-1's window width is unmeasured.** I prove the code path is *reachable* (§R3, F-1) with sequential calls. I did **not** measure how often it is hit in production, and I say so again where it matters.

---

## R1 — Freeze, scope, and anti-vacuity

```
HEAD                 553b57513f219be9c148de87cea55d588f8b5c18
branch               s391/item13-status-lost-update
git merge-base       35272aed404f3c3a3ae264b94004d0d0eb115dcb   (matches the brief)
tracked tree         clean, before and after every mutation
untracked            34 paths, identical before and after
commits in range     553b575  fix(registry): serialize descriptor publishes   (one commit)
```

**Anti-vacuity.** Over the whole `35272ae..553b575` diff:

- removed `it(`/`test(`/`describe(` declarations: **zero**;
- added `.skip` / `.only` / `.todo`: **zero**;
- added `it(` / `it.each(` declarations: **8**, which expand to **9** tests (`it.each` carries `pi` and `omp`).

Arithmetic closes: the gate reports 4030 total, so base was 4021. No surviving test lost an assertion — the diff is purely additive in every `*.test.ts` file (verified by reading the diff in full, not by counting).

---

## R2 — The six hard checks

### R2.1 — Check (1): does T001 genuinely REPRODUCE on base, in BOTH directions?

**Yes. Confirmed by execution, and this is the strongest result in the pass.**

The honest form of "revert the fix, keep the tests" is subtle here, because the `beforeWrite` seam *is* part of the commit. I reverted `publish()` to the base body **while keeping the `hooks` plumbing and the `beforeWrite?.()` call**, so the tests could still interleave — otherwise the revert would fail for want of a seam rather than for want of a fix.

**MUT-1** — `publish()` restored to base semantics (`const proposed = exact ? descriptor : applyWriteLaw(descriptor, sampled, writer)`, unlocked, no fresh read), seam retained.

Fast-set baseline was **83 passed | 1 skipped (84)**. Under MUT-1: **4 failed | 79 passed | 1 skipped**.

**RED 1 — the card is lost**, `fs-registry.test.ts:208`:

```
- Expected                                 + Received
-   "statusAt":       "…16:00:01.000Z"     +   "statusAt":       "…16:00:00.000Z"
-   "statusNext":     "new next"           +   "statusNext":     "old next"
-   "statusPrev":     "after"              +   "statusPrev":     "before"
-   "statusSeq":      11                   +   "statusSeq":      10
-   "statusWrittenBy": "pij-reporter"       (absent — dropped entirely)
    "systemState":    "working"            (the daemon's own value survives)
```

That is the reported incident in miniature: the daemon replays its pre-CLI snapshot of every `cli`-owned status field, `statusSeq` sticks at the old value, and `statusWrittenBy` vanishes — while the daemon's own `systemState` lands fine.

**RED 2 — the daemon's system state is lost**, `fs-registry.test.ts:252`:

```
-   "systemState": "working"     +   "systemState": "idle"
    statusPrev/Next/At/Seq       (all four correct — the card survives)
```

Both RED lines match the execution log's claimed `:208` and `:252` exactly. The reproduction is real, it is an interleaving seam and not an argument, and it is symmetric.

Two further mutations show the fix is **two independent mechanisms**, each separately pinned — this matters, because a single test covering both would have let half the fix rot:

| Mutation | What it removes | Result |
|---|---|---|
| **MUT-2** | the three-way merge only (`exact ? descriptor : …`), lock kept | **RED 1/84** — only `:252`, the exact-write direction |
| **MUT-3** | the fresh in-lock read only (law merges against `sampled`), lock + merge kept | **RED 1/84** — only `:208`, the daemon direction |

Neither survives. Neither is redundant.

### R2.2 — Check (2): the crashed holder. Does this lock wedge writers the way item 15's spine lock does?

**No — and it is strictly stronger than the spine lock. There is one residual sub-case, recorded as F-2.**

Reasoned *and* executed.

**The reclaim exists and is load-bearing.** **MUT-4** replaced `isProcessAlive` with `() => true`. The dead-PID reclaim test went RED with the wedge signature itself, after 5.6 s wall:

```
Error: descriptor write lock …/stale-descriptor-lock.json.lock held for over 5000ms
```

So a crashed holder is reclaimed, and if it were not, the failure is a **bounded 5 s throw, not an unbounded hang**.

**The throw is contained — it does not take the daemon down.** `RuntimeAxisTracker.tick()` wraps each `drive(descriptor)` in `try/catch` and logs `runtime-axis <id>: error <detail>` (`core/daemon/runtime-axis.ts:73-80`), retrying next tick. The CLI card path wraps its write in `try/catch` → `E-NOREG` (`core/cli.ts:4096-4098`). Worst case is one descriptor stalling one tick and one visible CLI error, not a dead control plane.

**Compared against item 15's spine lock, this is an improvement, not a new hazard.** `adapters/spine-store.ts:224` says of itself: *"A crashed writer's lock therefore wedges writers until manual removal"*, and its exhaustion message reads *"locks are never stolen; if its writer is dead, remove the file manually"*. The spine lock has **no reclaim at all** and wedges the whole spine. The new lock (a) reclaims dead PIDs, and (b) is scoped to a single `<id>.json.lock`. The brief's worry — "a NEW lock layer must not add a new wedge class without the same reclaim" — is answered: it added *more* reclaim than the layer it was told to mirror.

**No re-entrancy deadlock.** Only `write()` (`:494`) and `writeExact()` (`:500`) call `publish()`, and nothing inside the critical section re-enters either. `claimDescriptorIdentity` uses the separate `publishNoReplace` path. Checked, clean.

**No content-less lock.** `publishNoReplace` (`:1657`) writes and `fsync`s a temp, then hard-links it into place, so the "holder is mid-write, wait rather than steal" branch is a real transient and not a permanent hole. The execution log's claim on this point is accurate.

**Lock naming avoids a known trap.** `<id>.json.lock` does not end in `.json`, so it is invisible to every `readdirSync(pijHome)` + `.json` enumerator — `FsRegistry.list()` `:389`, `listTerminal()` `:410`, `sweepArchivable()` `:1152`, `cli.ts:951`. That is precisely the "F-01 phantom peer" trap `watchdog-store.ts:111-114` warns about. The two enumerators that do *not* filter (`daemon.ts:1610`, `cli.ts:600`) only probe `<name>/inbox` and are unaffected. Checked, clean.

Residual: **F-2** (PID reuse) and **F-3** (the budget is untestable). Both below.

### R2.3 — Check (3): `DESCRIPTOR_FIELD_OWNER` / `SessionDescriptor` / `core/cli.ts` unchanged

**Confirmed, byte-for-byte, at three points each** (base blob = HEAD blob = worktree blob):

| File | blob |
|---|---|
| `core/registry-write.ts` (holds `DESCRIPTOR_FIELD_OWNER`) | `71440ccc3799485f631d5891e796ec76fbec31cc` |
| `core/types.ts` (holds `SessionDescriptor`) | `207b019ab46b407b396f5641b36413917a7926ab` |
| `core/cli.ts` (the card path) | `0154cc4e91534c64773d9475aa181c3b9d2ff556` |

No field ownership changed, no schema changed, and the fix genuinely lives in the write seam rather than in the callers.

`core/registry-write.test.ts` gained one test, and it is not vacuous: **MUT-7** made `persistDaemonWrite` return the computed descriptor instead of re-reading → **RED 1/19**, exactly `returns registry truth after the adapter restores CLI-owned card fields`. `FakeRegistry.write` genuinely applies `applyWriteLaw` (`fakes.ts:193`), so the test exercises the law rather than a stub.

### R2.4 — Check (4): do `writeExact` callers still CLEAR owned fields?

**Yes for the clearing itself — confirmed by execution on unmutated source.**

There are four production `writeExact` call sites: `core/cli.ts:4095` (card), `core/session.ts:256` (boot replaces a prior incarnation), and `cli.ts:2450` / `cli.ts:2575` (revive marks `revivePendingAt`).

Probe against a real `FsRegistry` over a tmp home: seed `semanticState: "reviewing"`, `stateNote: "half done"`, `currentAssignment: "dlg-1"`, then `writeExact` a descriptor omitting all three:

```
CHECK4 after clearing writeExact:
  {"semanticState":"(absent)","stateNote":"(absent)","currentAssignment":"(absent)","systemState":"idle"}
```

All three cleared. The mechanism is sound in both of its branches: a field present in `sampled` but absent from `proposed` trips `sampledHas !== proposedHas` and is deleted; and every `cli`-owned field is applied exactly regardless, so it is deleted even when the caller and disk agreed. `terminal` (owner `close`, not `cli`) still clears via the first branch, which is what `core/session.ts:256`'s tombstone-stripping boot write depends on.

**But this same check is where F-1 came from.** Clearing works; *rebasing* does not fully, and §R3 F-1 has the executed counter-example.

**Checked and found CLEAN — `FakeRegistry.writeExact` fidelity.** I expected a finding here and did not get one, so I am recording the negative result rather than leaving it looking unexamined. `fakes.ts:195` is still `this.map.set(descriptor.id, descriptor)` — pure last-write-wins — while the port contract now says "exact for caller changes and CLI-owned denorm fields, rebased onto the latest descriptor". That *looks* like the "fake more permissive than the real adapter" failure the same file warns about twice (`:178-181`, `:191-193`). It is not: with no concurrent writer, the adapter's `sampled` and `latest` are the same record, and `mergeExactDescriptor` provably reduces to `proposed`. I confirmed that by probe — real and fake both dropped a non-owned `rpcPort` omitted from a partial exact write. A single-threaded fake cannot express the case where they differ, so the fake remains faithful to everything it is capable of representing. No finding.

### R2.5 — Check (5): carried T004 and T005

**T004 — the pi/omp revive branches.** Dim-0 baseline for the selector taken first on pristine source: `-t "when attaching a revived"` → **2 passed | 107 skipped**. **MUT-6** replaced the `--attach` pi/omp branch's `requeueClosedRecipientMail(...)` call (`cli.ts:2451`) with `0` → **both cases RED**, 107 skipped untouched. The branch is genuinely reachable and genuinely asserted, which is the whole point of the carry (Phase 2b G-4/F-5 flagged it as unreachable by any test).

**T005 — `listTerminal()` and the sweep.** Two mutations, because the first was too blunt to be evidence:

- **MUT-5a** — `listTerminal()` stops reading the archive tier → **RED 1**, `lists terminal descriptors from both the hot and archive tiers`. The archive tier is load-bearing.
- **MUT-5b** — sweep uses `list()` instead of `listTerminal()` → RED 6/19. Too crude to isolate anything (`list()` filters dissolved, so every closed-recipient test falls over). **Reported as a poor mutation, not as evidence.**
- **MUT-5c** — `retireForClosedRecipients()` restored to the *exact base* `readdirSync(this.pijHome)` implementation → **RED exactly 1/19**, and it is the new fake-backed test, `discovers closed recipients through RegistryPort instead of the FsRegistry layout`. That is the precise Dim-0: the new test pins *the port rather than the disk layout*, and it pins nothing else. Matches the execution log's `daemon.delivery.test.ts:337`.

`FakeRegistry.listTerminal()` filters `dissolved || failed`, which is exactly `isTerminalRecord` (`core/archive.ts:50-52`). Fake and adapter agree.

### R2.6 — Check (6): scope and gates

**Diff ⊆ allowed paths — confirmed, empty remainder.** 11 files changed; `comm -23 changed allowed` is empty. The one allowed-but-untouched path is `core/cli.test.ts`, correctly so: T003 required it only if T002 chose the read-back-and-reapply-once variant, and T002 chose the lock, leaving `core/cli.ts` unchanged.

I could not read the packet itself (no `dlg-0013` packet under `~/.pij/pij-associated-louse/`), so "allowed" is reconstructed from the dossier's task `Path(s)` column, its Pre-Implementation Check, and addendum §5/§8. On that reconstruction the only path needing a word is `adapters/fakes.ts` — see **F-5**.

**Gates, all run by me at `553b575` with the tree pristine:**

| Gate | Result |
|---|---|
| full vitest (`pij bg`, job `bg-mtbv3if0-04rucn`, 174.35 s) | **171 files passed, 2 skipped · 4015 tests passed, 15 skipped, 0 failed** |
| `npx tsc --noEmit -p .` | **exit 0** |
| `npx biome check --max-diagnostics=200` on all 8 changed `.ts` files | **clean**, "Checked 8 files in 64ms" |
| focused 4-file suite, pre-mutation | 191 passed, 2 skipped |
| focused 4-file suite, post-restoration | **191 passed, 2 skipped — identical** |

The gate figure matches the execution log's claim (4,015 / 15 / 0) exactly.

**Mutation restoration, verified three independent ways plus a fourth:**

1. `cmp` against pristine copies — OK for all four mutated files;
2. `git hash-object` == `git rev-parse HEAD:<path>` — `bfcbf477…` / `72aeaad…` / `68a03c8…` / `71440cc…`, all MATCH;
3. `git diff --exit-code` over the whole tree — clean; untracked count 34, unchanged;
4. the focused suite returns the byte-identical baseline figure.

---

## R3 — Findings

### F-1 — medium — the exact-write direction is **narrowed, not closed**, and the docs claim closure

`docs/how/pij.md` (added by this commit) states:

> This closes both lost-update directions: a daemon `systemState` write cannot erase a newly reported card, and a card write cannot replay stale daemon state.

The second clause does not hold. `mergeExactDescriptor`'s baseline is `sampled` — the adapter's *own* read taken at `publish()` entry (`fs-registry.ts:553`) — not the caller's read. The caller's actual baseline is its earlier `registry.read()` at `core/cli.ts:4060`, whose comment says "the re-read IS the merge". Any writer landing **between those two reads** is seen by the adapter as the caller having deliberately changed the field, and the caller's stale value is replayed.

Executed on **pristine, unmutated source**, with plain sequential calls and no seam:

```
1. seed                                        disk.systemState = idle
2. CLI re-read; it holds                            systemState = idle
3. daemon lands BEFORE writeExact is called    disk.systemState = working
4. CLI card writeExact                         disk.systemState = idle   statusNext = new card
   => daemon write LOST (residual window)
```

The card survives (`statusNext = "new card"`); the daemon's axis does not. This is direction 2 of the very incident, at a smaller width.

**Why it cannot simply be tightened.** Acquiring the lock *before* sampling would make `sampled === latest` and collapse `mergeExactDescriptor` back to plain last-write-wins — strictly worse. Sampling outside the lock is therefore correct and deliberate. The gap is inherent to `writeExact(descriptor)` carrying no caller baseline; closing it needs a version/CAS token from `read()`, or an explicit "fields I am changing" argument.

**How wide is it, honestly.** Between `core/cli.ts:4060` and the adapter's sample lies only object construction — microseconds of pure CPU, no I/O. The pre-fix window was another process's entire read-merge-write. So this is roughly three orders of magnitude narrower, and I did **not** measure it. My probe proves the path is reachable, nothing more.

**Smallest honest remedy**: change "closes" to "narrows" in `docs/how/pij.md` and in the `RegistryPort.writeExact` doc comment (`core/ports.ts:78-82`), and name the residual window. **Full remedy**: a caller-supplied baseline. I would take the doc fix now and file the CAS work.

I am calling this **medium** because a shipped document asserts a guarantee the code does not provide, and a future reader will build on the stronger claim. Its runtime risk on its own is low.

### F-2 — low — PID reuse defeats the reclaim, and the error names no remedy

`isProcessAlive` is the only liveness signal. A crashed holder whose PID has since been recycled by any live process is never reclaimed. Executed on pristine source, using `pid: 1` (always alive, `EPERM` → treated as alive) as a stand-in for a recycled PID:

```
THREW after 5006ms: descriptor write lock …/pid-reuse-victim.json.lock held for over 5000ms
descriptor written? false
lock still present?  true
```

Every subsequent write to that descriptor pays 5 s and then throws, forever, until someone removes the file by hand. Two things make this **low** rather than higher: it needs a crash *inside* a very short critical section **and** a PID recycle before the next write to that same id; and the blast radius is one descriptor, with the daemon logging and retrying rather than dying.

The cheap part of the fix is the message. `spine-store.ts:270` tells the operator exactly what to do — *"locks are never stolen; if its writer is dead, remove the file manually"*. The descriptor lock's message names only the path. Adding the same sentence costs nothing and converts a mystery into a two-second fix.

A mtime/age fallback would also work, but note it is **a policy, not a brake**: removing it would make the code *more* conservative (never steal), so adding it genuinely trades a wedge for a possible double-writer, and needs to be argued on its merits rather than waved through as a safety net.

### F-3 — low — the lock budget is not injectable, so the contention path is untested

`DESCRIPTOR_LOCK_BUDGET_MS = 5_000` is a module-level `const` with no constructor option. This repo already has the idiom that solves it: `FsSpineStore` and `FsPlatformWriteLock` both take `{ lockBudgetMs }`, and `platform-write-lock.test.ts:52,68` exercises the exhaustion path at `lockBudgetMs: 60`. No test covers the descriptor lock's contention, retry, or budget-exhaustion path — and no test can, cheaply, because any such test costs 5 s of real time. (My MUT-4 run took 5.6 s to demonstrate exactly one of them.)

Threading the existing option through `FsRegistryHooks` or a sibling options bag would make F-2's behaviour, the retry loop, and the "holder is mid-write" transient all testable in milliseconds.

### F-4 — low — descriptor serialization is partial; only `publish()` takes the lock

`withDescriptorWriteLock` is used at exactly one site (`:562`). Four other places write or remove the same `pathFor(id)` with no lock: `revive()` `:754`, `archive()`'s `rmSync` `:1067` and `:1137`, and `unarchive()`'s `writeAtomic` `:1257`. A `sweepArchivable()` running against a concurrent `publish()` can still interleave — archive removes the hot file while a locked publish recreates it, or vice versa.

This is a **pre-existing** race that the commit does not widen, and it is explicitly outside the incident's scope. I raise it only because the lock's arrival plus the new doc section ("Every `FsRegistry.publish()` serializes one descriptor…") will reasonably be read as "descriptor writes are now serialized", which is true only of `write`/`writeExact`. One sentence naming the boundary would prevent the wrong inference.

### F-5 — info — `adapters/fakes.ts` is changed but is not in any task's `Path(s)`

`fakes.ts` appears in the dossier's Pre-Implementation Check (as the possible home for the T001 interleaving hook) but in no task's `Path(s)` column. The change is nonetheless **mandatory**: `listTerminal()` was added as a required member of `RegistryPort`, so `FakeRegistry` cannot compile without it, and T005 explicitly says "TEST with the fake registry". In substance it is in scope. Flagged only because I could not read the packet itself and am therefore judging against a reconstruction — if the packet's path list is literal and omits `fakes.ts`, someone with the packet should confirm.

---

## R4 — Verdict

**APPROVE-WITH-FINDINGS.** Highest severity **medium** (F-1). Nothing below blocks merge on my reading.

What the commit gets right, and it is a lot:

- **T001 is a genuine reproduction, not an argument.** Reverting the fix while keeping the seam turns both directions RED with the incident's exact field-level signature. That is the hardest thing the brief asked for and it is fully satisfied.
- **The fix is two mechanisms and both are independently pinned** (MUT-2 and MUT-3 each RED exactly one direction). Neither can rot silently.
- **It lives in the write seam, not the callers** — `DESCRIPTOR_FIELD_OWNER`, `SessionDescriptor` and `core/cli.ts` are byte-identical to base.
- **The lock is strictly stronger than the layer it was told to mirror.** Item 15's spine lock wedges the whole spine until a human intervenes; this one reclaims dead PIDs, is scoped to one descriptor, and fails bounded and caught.
- **The lock file name dodges the `.json` phantom-peer trap** that `watchdog-store.ts` documents.
- Every carried item is non-vacuously pinned; scope is exactly the allowed set; all gates green; all seven mutations restored byte-identical.

**One thing I am explicitly handing back rather than deciding.** AC-19 reads "an interleaved write in either direction **never** drops the other side's fields". F-1 is an executed counter-example to that sentence as literally worded — at a far narrower width than the incident, but real. Whether "never" is the literal contract or a description of the incident class is a **spec reading, not a code fact**, and it belongs to the o-prime. If it is literal, F-1 is a blocker and should be treated as one; if it is not, the doc wording in `docs/how/pij.md` and `core/ports.ts` should still be corrected from "closes" to "narrows", because that sentence will outlive this review.

---

### TERMINAL REPORT

This pass is **CLOSED**. No mutation, probe, or repo write follows this document. The only file I wrote in this repository is this one; every mutated source file was restored byte-identical and verified four ways (§R2.6). Evidence is retained at `/tmp/pw13/` and `~/.pij/pij-powerful-whale/bg-mtbv3if0-04rucn.log` should any claim need re-deriving.

**No pass is left open.**

553b57513f219be9c148de87cea55d588f8b5c18

---
---

# Re-review FX-01

**Reviewer**: `pij-powerful-whale` (fresh cold seat, same seat as the first pass) · **Frozen at**: `8d67b7a1bfdbeb852458172eae6d10924a5ce1bd` · **Branch**: `s391/item13-status-lost-update` · **Base**: `35272aed404f3c3a3ae264b94004d0d0eb115dcb` · **Reviewed first pass**: `553b575` (above; unmodified) · **Packet**: `fix-01.md`

**Verdict: APPROVE-WITH-FINDINGS. Highest severity: low.** All five prior findings (F-1 medium, F-2, F-3, F-4 low, F-5 info) are **closed**. Two new low findings, neither blocking.

> The prior pass above is untouched. This section is additive and is scoped to the `553b575..8d67b7a` delta only; it does not re-open, re-verify or supersede anything in the first pass.

---

## RX0 — Scaffolding and limits, stated before any finding

**Scaffolding I used, so you can discount it.**

- Every mutation was applied by a `python3` heredoc containing `assert s.count(old) == 1`. A mutation that fails to match aborts loudly rather than silently no-op'ing into a fake GREEN.
- Pristine byte-copies of all five mutation targets were taken **before** the first mutation into `/tmp/pw13fx/` and used for restoration (`cmp`), not `git checkout`.
- The full-suite gate was kicked via `pij bg` **before any mutation**, against a clean tracked tree.
- One test file (`fs-registry.test.ts`) was itself temporarily mutated — a measurement hoist, described in full at FX-1. It is restored and verified byte-identical.
- Two independent `tsx` probes (`/tmp/pw13fx/probe-f1.mts`, `probe-clear.mts`) exercise the **pristine, unmutated** adapter and fake through their public surface with plain sequential calls. No test seam, no interleaving hook.

**The limit of each reproduction.**

- My F-1 probe reproduces the counter-example **sequentially**, which is the strongest available form (it needs no scheduler luck) but it therefore says nothing about real-world frequency. I did not measure the residual window for baseline-less callers and do not claim a width.
- The contention finding (FX-1) is proven by mutation + a hoisted measurement, both of which I show below in a two-cell table. I did **not** stress the test under machine load, so I make no claim about flakiness.

**What I did NOT examine — a gate I did not look at must not read like a gate I found clean.**

1. `just lint` repo-wide and `harness checks --quick`. The execution log's claim that these are red only in unrelated pre-existing files is **unverified by me**. I ran Biome only on the six changed TypeScript files.
2. The `execution.log.md` diff for narrative accuracy beyond the gate figures I independently reproduced.
3. `core/session.ts:256`'s boot/replace path behaviourally — I read it and reasoned about it, but ran no probe against it.
4. Whether the contention test is robust to node-spawn latency on a loaded machine. I reasoned the margin (≈85 ms observed against a 1 000 ms budget) is generous; I did not measure it under load.
5. Anything in the first pass. Its mutations, probes and conclusions are **not** re-derived here.
6. The fake's new merge under sequences other than the single counter-example my probe drives.
7. Any Windows/`pwsh` path.

---

## RX1 — Freeze, scope, anti-vacuity

| Claim | Method | Result |
|---|---|---|
| HEAD is the frozen commit | `git rev-parse HEAD` | `8d67b7a1bfdbeb852458172eae6d10924a5ce1bd` ✓ |
| Branch | `git rev-parse --abbrev-ref HEAD` | `s391/item13-status-lost-update` ✓ |
| Base **re-derived**, not taken from the brief | `git merge-base origin/main HEAD` | `35272aed404f…` ✓ |
| Tracked tree clean at start and at end | `git status --porcelain` | clean; untracked 36 → 37 (this file already existed; only its bytes grew) |
| One commit on top of the reviewed pass | `git log 553b575..8d67b7a` | `8d67b7a fix(registry): use caller baseline for exact writes` ✓ |
| Diff ⊆ `fix-01.md` allowed paths | `comm -23 changed allowed` | **empty remainder** ✓ (8 changed, 8 allowed) |

**Anti-vacuity.** `git diff 553b575 8d67b7a -- '*.test.ts'` removes **zero** test declarations, adds **zero** `.skip` / `.only` / `.todo`, and adds **5** `it(` declarations. The suite total moves 4 030 → 4 035 and passing 4 015 → 4 020. `4 030 + 5 = 4 035` — the arithmetic closes exactly, so no test was quietly traded away to buy a green.

**Production-vs-test balance.** `fs-registry.ts` is +23/−15, `cli.ts` +4/−3, `ports.ts` +13/−5, `fakes.ts` +51/−3 — the behavioural change is genuinely small; the bulk (+126) is test.

---

## RX2 — The scoped checks

### (1) F-1 closed — confirmed by independent probe *and* by mutation

**(1a) My own counter-example, re-run on pristine source.** This is the same sequence I wrote in the first pass — a seeded descriptor, a caller read, an interleaved daemon `write`, then the caller's `writeExact` — driven through the public surface with **no seam and no interleaving hook**, now additionally supplying the baseline:

```
REAL  with baseline : {"systemState":"working","statusNext":"new card","statusSeq":31}
FAKE  with baseline : {"systemState":"working","statusNext":"new card","statusSeq":31}
REAL  no  baseline  : {"systemState":"idle","statusNext":"new card","statusSeq":31}
FAKE  no  baseline  : {"systemState":"idle","statusNext":"new card","statusSeq":31}
AGREE(with baseline): YES
AGREE(no baseline)  : YES
F-1 CLOSED(with baseline): YES
```

The daemon's `systemState:"working"` **survives** while the card's three fields land. Both directions hold simultaneously. **F-1 is closed at the incident site.**

**(1b) Fix reverted, test kept → RED.** Minimal, precise revert of the mechanism only — `mergeExactDescriptor(descriptor, callerBaseline ?? sampled, latest)` → `mergeExactDescriptor(descriptor, sampled, latest)`, leaving the new test, the plumbing and the signature intact so the RED is attributable to the fix and nothing else:

```
FAIL  fs-registry.test.ts > FsRegistry > preserves a daemon write that lands after the caller read but before writeExact
  {
    "statusAt": "2026-08-27T16:00:01.000Z",
    "statusNext": "new card",
    "statusSeq": 31,
-   "systemState": "working",
+   "systemState": "idle",
  }
 ❯ .pi/extensions/pij/adapters/fs-registry.test.ts:286:34
 Tests  1 failed | 48 passed | 1 skipped (50)
```

RED **exactly one** test out of 50, with the incident's exact field-level signature. The test genuinely reproduces the defect rather than asserting the fix.

> *Provenance note, not a finding:* `fix-01.md` and `execution.log.md` both cite `fs-registry.test.ts:285`; vitest reports the failing assertion at **`:286:34`** (line 285 is blank). A reader following the citation lands one line short.

**(1c) The card path passes `latest` as baseline.** Read-confirmed at `core/cli.ts:4060` (`const latest = deps.registry.read(nodeId)`) → `:4062` (`let nextDescriptor = latest`) → `:4096` (`writeExact(nextDescriptor, { baseline: latest })`). `latest` is provably *the same object* the proposal was constructed from, which is the only reading under which a caller baseline means anything. Pinned non-vacuously: dropping the argument REDs **exactly 1 of 467** in `core/cli.test.ts`:

```
FAIL  cli.test.ts > … > passes the reporting descriptor read to writeExact as its caller baseline
AssertionError: expected undefined to deeply equal { role: undefined, …(10) }
 ❯ .pi/extensions/pij/core/cli.test.ts:5094:28
```

**(1d) `FakeRegistry` mirrors the contract.** This was the specific trap I named in the first pass — `fakes.ts:178-193` warns twice against a fake more permissive than the adapter. My probe drives **both implementations through the identical sequence** and they agree in **both** modes (see the four lines at 1a): `AGREE(with baseline): YES`, `AGREE(no baseline): YES`. That is a stronger statement than the repo's own test, which pins only the with-baseline case in the fake. The mirror is pinned: reverting `FakeRegistry.writeExact` to last-write-wins REDs exactly 1 of 50 at `:310` with the same `working → idle` signature.

Worth recording: the fake became **more conservative** (merging where it previously replaced), and the full 4 020-test suite is green, so no existing test depended on the old permissive behaviour.

**(1e) Baseline-less callers keep the narrowed behaviour, and the docs say so.** Confirmed by execution — the `no baseline` rows above return `systemState:"idle"` on **both** real and fake, i.e. narrowed, not fixed. The doc now says exactly that, and says it precisely:

> "The card path supplies its own read as that baseline, which closes this incident class in both directions. Callers that omit a baseline fall back to the adapter's sample; their protection is narrowed to the publish call's read/write window rather than the earlier object-construction window."

That is an honest sentence: it names the residual instead of hiding it. `core/ports.ts:85-90` carries the matching wording. Contrast the sentence it replaced — *"This closes both lost-update directions"* — which was the thing I objected to.

**(1f) A regression I went looking for and did not find.** Moving the merge base from the adapter's sample to the caller's read is exactly the kind of change that quietly breaks the *other* property `writeExact` exists for — original check (4), "callers can still CLEAR owned fields". Probed on pristine source:

```
WITH baseline -> semanticState: undefined   stateNote: undefined   assignment: "new-assignment"
CLEAR STILL WORKS: YES
INTERLEAVED clear -> systemState: "working"  semanticState: undefined  stateNote: undefined
BOTH HOLD: YES
```

Clearing survives, **including with a daemon write interleaved** — the daemon's field is preserved and the CLI-owned fields are still cleared in the same operation. Recorded as a negative so it does not look unexamined.

### (2) F-2 — remedy named, no age policy anywhere

The exhaustion error now reads `… held for over ${lockBudgetMs}ms — locks are never stolen; if its writer is dead, remove the file manually: ${lockPath}` — the same remedy sentence `spine-store.ts:270` gives, which was my suggestion. Both halves are pinned with teeth:

| mutation | result |
|---|---|
| strip the remedy sentence | **RED** `:344` — `expected 'descriptor write lock /var/…' to contain 'locks are never stolen; if its writer…'` |
| append `(the lock is older than the budget)` | **RED** `:347` — `expected … not to match /\b(age\|mtime\|older)\b/i` |

**No age/mtime policy exists.** `grep -i "mtime\|statSync\|birthtime\|age"` over `fs-registry.ts` returns, in the lock path, only the comment *"The retry budget is a brake: it can only stop this writer from waiting longer. Lock age is deliberately not a reclaim policy."* The two live `statSync` calls are at `:1775`/`:1786` in `directoryBytes`/`fileBytes` (archive sizing) — nowhere near the lock. This is the right call under the repo's POLICY-vs-BRAKE doctrine, and the code now says so in the code rather than only in a review.

### (3) F-3 — injectable budget and retry, both paths timed

`FsRegistryHooks` became `FsRegistryOptions` with `lockBudgetMs?` / `lockRetryMs?`, matching the `FsSpineStore` / `FsPlatformWriteLock` idiom I cited. The injection genuinely takes effect — this is the cleanest single number in the re-review:

| | wall time of the exhaustion case |
|---|---|
| injected `{ lockBudgetMs: 60, lockRetryMs: 5 }` | **66 ms** |
| injection ignored (`lockBudgetMs = DESCRIPTOR_LOCK_BUDGET_MS`) | **5 008 ms** → **RED** `:343`, `expected 5005 to be less than 1000` |

Exhaustion is therefore pinned at ~60 ms and the whole class is now cheap to test. The contention case is a different story — see **FX-1**.

### (4) F-4 — docs are now precise

The doc no longer says *"Every `FsRegistry.publish()` serializes one descriptor"*. It says the `write()`/`writeExact()` paths do, and adds *"Pre-existing `revive()`, `archive()`, and `unarchive()` writes do not take this lock."* Verified against the code: `withDescriptorWriteLock` is defined at `:234` and called at **exactly one** site, `:570` inside `publish()`. `revive()` `:754`, `archive()`'s `rmSync` `:1067`/`:1137` and `unarchive()`'s `writeAtomic` `:1257` remain unlocked, exactly as the sentence now admits. The doc also correctly notes a recycled PID falls through to the bounded wait rather than being reclaimed.

### (5) Fence files and gates

| File | base `35272ae` | reviewed `553b575` | head `8d67b7a` |
|---|---|---|---|
| `core/registry-write.ts` (`DESCRIPTOR_FIELD_OWNER`) | `71440cc…` | `71440cc…` | `71440cc…` ✓ |
| `core/types.ts` (`SessionDescriptor`) | `207b019…` | `207b019…` | `207b019…` ✓ |
| `adapters/spine-store.ts` (spine lock) | `afb7517…` | `afb7517…` | `afb7517…` ✓ |
| `adapters/platform-write-lock.ts` | `79d89e4…` | `79d89e4…` | `79d89e4…` ✓ |

Byte-identical from base through head — not merely "unchanged in this commit".

| Gate | Command | Result |
|---|---|---|
| Full extension suite | `npx vitest run .pi/extensions/pij/` via `pij bg` (job `bg-mtbwgz6b-zkn6rh`) | **171 files passed, 2 skipped; 4 020 passed, 15 skipped, 0 failed**; 188.50 s |
| Typecheck | `npx tsc --noEmit -p .` | **exit 0**, no output |
| Biome (6 changed TS files) | `npx biome check --max-diagnostics=200 …` | **exit 0**, "Checked 6 files… No fixes applied." |
| Focused, post-restore | `fs-registry.test.ts` + `core/cli.test.ts` | **516 passed, 1 skipped** = 49 + 467, identical to the pre-mutation baselines |

The full-suite figures reproduce the execution log's claim (4 020 / 15 / 0) exactly.

**Restoration, verified four ways.** (i) `cmp` against pristine byte-copies for all five mutated files, including the test file; (ii) `git diff --exit-code` clean; (iii) HEAD unmoved at `8d67b7a`; (iv) `git hash-object` of each file equal to `git rev-parse 8d67b7a:<file>` — all five MATCH.

---

## RX3 — New findings

### FX-1 — low — the contention test does not pin what its name claims

`fs-registry.test.ts:352`, *"waits for a contending live holder to release, then publishes"*, is the only test covering the wait-then-succeed path. It **passes under a mutation that deletes the liveness guard entirely** — `if (heldRaw !== null && heldPid !== null && !isProcessAlive(heldPid))` → `if (heldRaw !== null && heldPid !== null)`, i.e. steal *any* lock, never wait. The test cannot tell a writer that waited from a writer that stole.

The cause is one line of ordering. `startedAt` is taken before `write()`, but the elapsed time is measured **after** `await released`, so the measurement includes the releaser child process's whole lifetime rather than the writer's block:

```ts
const startedAt = Date.now();
new FsRegistry(home, undefined, { lockBudgetMs: 1_000, lockRetryMs: 5 }).write(descriptor(id));
await released;                                   // ← child lifetime folded into the measurement
expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
```

Proven as a two-cell table. I hoisted the measurement to immediately after `write()` returns and logged it; nothing else changed:

| test form | pristine source | steal-any-lock mutation |
|---|---|---|
| **as committed** (measure after `await released`) | GREEN | **GREEN** ← blind |
| **hoisted** (measure before `await released`) | GREEN — `writer blocked for 85ms` | **RED** — `writer blocked for 2ms`, `expected 2 to be greater than or equal to 20` |

Two things follow, and they point opposite ways. The **mechanism is correct** — on pristine source the writer really does block 85 ms and then publish, which is the behaviour F-3 asked for. But the **sensor is blind**: if someone later removes or inverts the liveness guard, this test will not notice. The exhaustion test does catch that particular mutation, so the guard is not wholly unsensored; the specific claim "waits, then succeeds" is what is unpinned.

Fix is one line — hoist the measurement into a `const` before `await released` and assert on that. Low severity because no shipped behaviour is wrong; it is a gate that would not ring.

### FX-2 — low — two callers keep the identical read-then-`writeExact` shape without a baseline

The mechanism is now available everywhere, but only the card path uses it. Three `writeExact` callers remain baseline-less:

| Site | Shape | Assessment |
|---|---|---|
| `cli.ts:2450` (revive `--attach`) | `const current = registry.read(id)` … `writeExact({ ...current, revivePendingAt })` | **Same shape as F-1.** Only `revivePendingAt` is intended; everything else is a replay of `current`. A writer landing between the read and the adapter's sample is replayed stale. |
| `cli.ts:2575` (revive spawn) | identical | as above |
| `session.ts:256` (boot) | `writeExact(descriptor)` | Defensible: boot deliberately **replaces** the prior incarnation and must clear `terminal`/`closeIntent`. Exactness is the point here. |

The two revive sites are the ones worth naming, and the remedy is one argument each (`{ baseline: current }`). I am **not** calling this a regression: it is pre-existing, the packet explicitly scoped FX-01.1 to the card path, and the new documentation is honest that baseline-less callers get only the narrowed guarantee. But F-1 was a shape, not a location, and after this commit the shape survives at two sites where the fix is now trivially applicable. Worth a follow-up item rather than a change here — those are also the exact lines T004 covers, so touching them mid-stream would entangle two items.

Note the exposure differs from the card path: `revivePendingAt` is not in `DESCRIPTOR_FIELD_OWNER`, and these paths run against a record that is dissolved or reviving, so concurrent daemon writes are less likely than on a live seat. That lowers the probability; it does not change the shape.

---

## RX4 — Status of the prior findings

| # | First pass | Status now | Evidence |
|---|---|---|---|
| F-1 | medium — exact merge based on the adapter's sample, not the caller's read | **CLOSED** | probe RX2(1a): daemon's `working` survives; revert → RED `:286` |
| F-2 | low — PID reuse defeats reclaim; error names no remedy | **CLOSED** | remedy sentence pinned (RED `:344`); no age policy, pinned (RED `:347`) |
| F-3 | low — lock budget not injectable, contention untested | **CLOSED** *(with FX-1)* | 66 ms vs 5 008 ms; exhaustion pinned. Contention covered but blind — FX-1 |
| F-4 | low — docs imply all descriptor writes serialize | **CLOSED** | doc names `write`/`writeExact` only; `withDescriptorWriteLock` called at exactly one site |
| F-5 | info — `fakes.ts` outside the dossier path list | **CLOSED** | `fix-01.md` explicitly authorises it; execution log records why |

---

## RX5 — Verdict

**APPROVE-WITH-FINDINGS. Highest severity: low. Nothing blocks merge on my reading.**

The thing I most wanted to see, I saw: **my own counter-example, re-run unchanged against the fixed code, now comes out right** — and it comes out right on the *real* adapter and the *fake* alike, in a probe that uses no test seam. The medium finding is genuinely closed rather than argued away, and closed at the level of the mechanism rather than papered over at the call site.

Three things this fix does that I want on the record:

- **It chose the honest doc sentence.** "Closes this incident class… callers that omit a baseline are narrowed to the publish call's window" is a harder sentence to write than "closes both directions", and it is the one that will still be true in six months. That was F-4's real point and it landed.
- **It refused the easy reclaim.** An mtime fallback would have made F-2 disappear and would have converted a brake into a policy. The code now carries a comment saying exactly that, in the repo's own vocabulary, which is worth more than the review that prompted it.
- **The optional-parameter shape is the right seam.** `writeExact(d, opts?)` keeps every existing caller compiling and behaving as before, so the blast radius is the card path only — which is why 4 020 tests stayed green through a change to the merge base of every exact write.

The two new findings are both about **coverage, not correctness**: a gate that would not ring (FX-1) and a shape that survives at two out-of-scope sites (FX-2). Neither warrants holding the commit.

---

### TERMINAL REPORT — FX-01

This re-review pass is **CLOSED**. No mutation, probe, or repo write follows this document. The only file I wrote in this repository is this one, and I appended to it without altering a byte of the first pass. Every mutated source file — including the one test file I hoisted a measurement in — was restored byte-identical and verified four ways (§RX2.5). Evidence is retained at `/tmp/pw13fx/` and `~/.pij/pij-powerful-whale/bg-mtbwgz6b-zkn6rh.log`.

**No pass is left open.**

8d67b7a1bfdbeb852458172eae6d10924a5ce1bd
