# Item 17 — ADV-A fold: focused re-confirm

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this
> file was written; the tree was restored to pristine and all scaffolding torn
> down before delivery. No further pass is open on this side.

**Reviewer**: `pij-wilful-morton` (cold, adversarial)
**Candidate**: `3495476eb921fceb2d42f6545826607e4a718396` (`s392-pr17`, PR #19)
**Prior candidate**: `269ef3e` — APPROVE (`reviews/item-17-review.md`) — **stands**
**Packet**: `reviews/item-17-adva-reconfirm-packet.md`
**Date**: 2026-08-28

---

## VERDICT: ✅ APPROVE — merge #19

The fold is exactly the one line I recommended, it is **proven load-bearing in
production** (not merely in the unit test), the mandatory mutation is
sha-verified RED→restore→GREEN on disk, there is **zero collateral**, and both
claimed gates reproduce. The unconditional placement is not merely acceptable —
it is **required**; §4 shows the gated alternative would have failed in the one
scenario that makes ADV-A reachable.

One **new, non-blocking** advisory (**ADV-A2**, §7) — a sibling defect in the
same never-reset class that this fold makes slightly more visible. It does not
block the merge and it is not a regression in the safety direction.

---

## 1. Scaffolding, lineage, and the limits of this pass

Stated first so nothing unexamined can read as clean.

**Scaffolding built** (all torn down, §8):
- Throwaway worktree `/tmp/pij-adva`, detached at `3495476`.
- `node_modules` **symlinked** from `~/GitHub/pij` — deps are the main
  checkout's resolved tree, **not a clean `npm ci`**. A dependency-resolution
  fault would not be visible to this pass.
- A line-based mutation harness (`/tmp/adva-mut.py`) that asserts anchor
  uniqueness and refuses a no-op mutation.
- Two runtime probes appended to a **copy** of `loop.test.ts`
  (`zz-advaprobe.test.ts`) so the real fixtures/helpers are reused. Deleted.

**Pristine sha256 at `3495476`** (re-verified after every mutation):

| file | sha256 |
|---|---|
| `core/daemon/loop.ts` | `e2cae2d7c404d0a3f4c0d933428c95f76fa71a5865fd78c2e853f8b464df87fa` |
| `core/daemon/loop.test.ts` | `64f0557fbf9b3fdd31a2bb268ca5f0202a87d55d1f1a5b69df6d82ae0fd2c0ce` |
| `core/daemon/index-state.test.ts` | `e56cb85466462a0bcff08dbdf581d3044037b5d528cb817814ada9c33789f8bc` |

`index-state.test.ts` is **byte-identical to the pristine sha recorded in my
item-17 review** — independent corroboration of "unchanged", not reliant on the
diff.

**Baseline GREEN** (2 fence files): exit 0, **104 passed** — 103 at `269ef3e`
**+1**, the new ADV-A test. The count itself is evidence exactly one test landed.

### What this pass did NOT examine

- **The item-17 Dim-0 five (MUT-A..E) were NOT re-run.** The packet scoped this
  to the hunk. What licenses that: I verified independently (§3) that the fence
  files at `3495476` are byte-identical to `269ef3e` **plus** the two ADV-A
  hunks, so the prior mutation evidence transfers intact. Had the rebase drifted
  those files, this licence would not hold — and main **did** touch the fence
  files in the rebase window (`56819f1`, item 10a+10b), so this was checked, not
  assumed.
- **No live daemon, no `just smoke`.** tmux is live on this shared host and
  driving smoke spawns real panes. The revive reachability chain in §5 is proven
  by exhaustive code enumeration plus a **loop-level** probe; it is **not** an
  end-to-end revive. The probe calls `driveSession` directly and therefore does
  **not** exercise `index.pending()`, the registry lifecycle write, or a real
  `pij revive`. I am confident in the chain, but the last mile is reasoned, not
  executed.
- Not run: `harness checks` / `just self-check` composites, `pkg audit`,
  `snapshots-check`, local-path portability, the full repo test suite,
  repo-wide biome. (The full-suite state at this base was characterised in my
  item-17 review §6: one pre-existing failure, `release-age-policy.test.ts`,
  root cause `spawnSync pwsh ENOENT`, out of fence.)

---

## 2. MUT-ADV-A — the mandatory mutation (on disk)

**Mutation**: delete `drive.bindRefusalCauses = undefined;` — `loop.ts` **line
433** (verified unique in file; a no-op mutation would have aborted).

| | value |
|---|---|
| pristine `loop.ts` | `e2cae2d7c404d0a3f4c0d933428c95f76fa71a5865fd78c2e853f8b464df87fa` |
| **mutated `loop.ts`** | `95e07ccf0707d0d548a2b90b331eba0a2ba785ce3cf7879456f0c555181f47b2` |
| **RED** | exit 1 — `loop.test.ts:509:35` |
| assertion | `AssertionError: expected Set{ 'foreign-session-id' } to be undefined` |
| RED scope | **1 failed \| 88 passed (89)** — no collateral failures |
| restored sha | `e2cae2d7…df87fa` ✓ identical to pristine |
| `git status --porcelain` | **empty** |
| **GREEN** | exit 0 — **104 passed (104)**, 2 files |

**The RED line needs no remapping**: the mutation edited `loop.ts` while the
failure is in `loop.test.ts`, which was never touched — so `509` is a pristine
line number. Verified on disk:

```
509:		expect(drive.bindRefusalCauses).toBeUndefined();
```

That is the ADV-A assertion exactly. The packet's claim (RED 1 failed / GREEN 1
passed) **reproduces**.

**Non-vacuity of the test's first half**: tick 1 asserts
`drive.bindRefusalCauses?.has("foreign-session-id")).toBe(true)`. The optional
chain yields `undefined` (not `true`) if the set were never allocated, so the
refusal leg is a real assertion, not a tautology.

---

## 3. No collateral — three independent proofs

**(a) Scoped diff** — `git diff 269ef3e 3495476 -- .pi/extensions/pij/core/daemon/`:

```
 loop.test.ts | 25 +++++++++++++++++++++++++
 loop.ts      |  4 ++++
 2 files changed, 29 insertions(+)
```

**29 insertions, zero deletions.** `index-state.test.ts` does not appear. The
previously-approved ADV-1/2/3/4 code is byte-unchanged.

**(b) Arithmetic corroboration** — `git show --stat 3495476` (vs its new parent
`b475a35`) = the same 3 files, **+244 / −25**. Item 17 alone was **+215 / −25**;
`215 + 29 = 244` and the deletion count is **unchanged at 25**. A rebase that had
silently absorbed anything would not balance.

**(c) Rebase-drift check** — this was the real hazard, and it was not
hypothetical. The rebase moved the base from `cb0e632` → `b475a35`, and main
**did** touch all three fence files in that window (`56819f1`, "pane-misbind
guard — day-3 item 10a+10b"). Proof the drift is nonetheless nil: the scoped
diff in (a) is the *whole* delta from the approved candidate, and
`index-state.test.ts`'s sha in §1 matches my item-17 record byte-for-byte.

**(d) Head still current** — `origin/s392-pr17` = `3495476` at review time, and
`git diff 3495476 origin/s392-pr17 -- <fence>` is **empty**. This verdict applies
to the branch head.

---

## 4. Packet Q3 — is the unconditional clear correct?

> "the clear is unconditional on the copilot bind return (not gated by
> `!drive.settled`), so a re-settle also clears — confirm that's correct."

**Confirmed correct — and stronger than that: unconditional is *required*.**

`drive.settled` is written at `loop.ts:426`, `:471`, `:588` and **never reset**
(exhaustive grep over `loop.ts` + `daemon.ts`). So had the clear been placed
*inside* the `if (!drive.settled && descriptor.spawnedBy)` block at `:425`, then
on the **second** bind of a re-driven seat `settled` is already `true`, the block
is skipped, and **the clear would never run — in precisely the scenario that
makes ADV-A reachable** (§5). The gated placement would have produced a test
that passes and a fix that does nothing.

Placing it after the block, before `return { kind: "bound" }`, is the right
call. Two further checks:

- **Idempotent.** PROBE2 drove a second bind and `drive.bindRefusalCauses` was
  `undefined` again — repeated clears cost nothing.
- **No cross-seat leakage.** `DriveState` is per-descriptor
  (`daemon.ts:547` keys `drives` by `d.id`), so the clear can only ever touch
  its own seat.
- **Copilot/planned path only** — correct, and I verified it is the *sole*
  writer: `reportBindRefusal` (`loop.ts:535-536`) is the only site that ever
  assigns `bindRefusalCauses`, and it is reached only from the planned-bind
  branch. Claude/codex bind never sets it, so a clear there would be dead code.
- **No notify-storm risk.** `applyBinding` (`binding.ts:28`) sets
  `lifecycle: "bound"` and `pending()` (`index-state.ts:114`) filters
  `lifecycle === "pending"`, so a bound seat leaves the drive loop. The
  refuse→bind→refuse cycle therefore cannot repeat per-tick; it is gated by an
  explicit revive. Notification rate stays bounded by human action.

---

## 5. Is the fold load-bearing in production, or only in the unit test?

This is the question the packet did not ask, and it is the one that decides
whether the fold is worth merging. I nearly reported the wrong answer.

**The concern.** A bound seat leaves `pending()`, so `driveSession` is not
called again for it. If nothing can re-drive a bound seat, the cleared field is
never read again and the fold would be inert.

**It is not inert.** The chain, by enumeration:

1. `this.drives` is deleted at **exactly two** sites — `daemon.ts:175`
   (`unbindGonePane`) and `daemon.ts:613` (`planOnceClose`). **Neither fires on a
   successful bind.** The `DriveState` survives the bind, in-memory, for the life
   of the daemon process.
2. A bound descriptor **can** return to `lifecycle: "pending"`:
   `revive.ts:704` and `fs-registry.ts:1179` (release).
3. The **revive** path additionally sets
   `plannedHarnessSessionId: existing.harnessSessionId` (`revive.ts:705`), so the
   revived seat **re-enters the planned-bind branch**. (Release does *not* —
   it scrubs `plannedHarnessSessionId`, so release alone cannot re-enter. Revive
   is the concrete case.)
4. `daemon.ts:547` fetches `this.drives.get(d.id) ?? {}` — the **same
   `DriveState` object**, still carrying the stale `Set{"foreign-session-id"}`.
5. `reportBindRefusal` (`loop.ts:527-541`) returns early on
   `surfaced.has(cause)` → **the revived seat's genuine refusal is swallowed and
   the spawner is never told.**

**Proven at runtime, both directions.** A 3-tick probe (refuse → bind →
refuse), which models step 4's DriveState reuse at the loop level:

| | pristine `3495476` | clear deleted (= `269ef3e`) |
|---|---|---|
| t1 / t2 / t3 | `waiting` / `bound` / `waiting` | same |
| outbox after t1 → t2 → t3 | 1 → 2 → **3** | 1 → 2 → **2** |
| second refusal reported | **true** | **false** |
| probe exit | 0 | 1 — `expected 2 to be greater than 2` |

The emitted bodies confirm real messages, not counters:

```
⛔ pij-w planned bind refused (foreign-session-id): every harness process under pid 100 belongs to another seat (2222…)
✅ pij-w is ready (bound to copilot session 1111…)
⛔ pij-w planned bind refused (foreign-session-id): every harness process under pid 100 belongs to another seat (2222…)
```

Without the fold the third message does not exist. **The fold converts a silent
production failure into a delivered notice.** That is worth merging.

**Bound honestly**: the window is one daemon process lifetime (a daemon restart
empties `drives` and the staleness evaporates), and reaching it requires a
revive. Rare — but silent, which is the failure mode this whole item exists to
remove.

---

## 6. Gates (reproduced on disk, not taken from the packet)

| gate | claimed | observed |
|---|---|---|
| daemon suite | 461/461 | **exit 0 — 19 files, 461 passed (461)** ✓ |
| `tsc --noEmit` | EXIT 0 | **exit 0, zero output lines** ✓ |
| biome (2 changed files) | — | **exit 0**, "Checked 2 files. No fixes applied." |
| fence suites | — | exit 0, 104 passed (baseline + the new test) |

---

## 7. Findings

### ADV-A2 (new) — `settled` is in the same never-reset class, so the re-bind that *resolves* a post-bind refusal is silent — non-blocking

The fold fixes `bindRefusalCauses`. Its sibling `drive.settled` has the
identical defect (never reset, §4) with the opposite symptom, and the fold makes
it observable.

PROBE2 drove refuse → bind → refuse → **re-bind** and recorded:

```
afterFirstBind: 2   afterSecondRefusal: 3   afterSecondBind: 3
reBindAnnounced: false   settled: true   t4: "bound"
```

The re-bind emits nothing, because `buildBoundNotice` is gated on
`!drive.settled` at `loop.ts:425`. So for a revived seat the spawner's message
sequence ends:

```
⛔ refused → ✅ ready → ⛔ refused → (silence, but the seat is BOUND)
```

**The spawner's last word is a refusal for a seat that is actually bound.** This
is exactly the ADV-A(ii) direction from my item-17 review ("never retracted"),
which this fold does not close — and, being honest about the trade: before the
fold that third `⛔` did not exist, so the sequence ended on `✅` and was
accidentally consistent.

**Why this still is not a regression, and does not block**: the pre-fold
behaviour achieved consistency by *swallowing a real refusal* — silent-and-wrong.
Post-fold is loud-and-stale, which is the safe direction, and no daemon logic
branches on these notices. The symmetric fix is one line in the same place —
reset `settled` (or announce a re-bind) wherever a refusal is reported — and
belongs in a follow-up item, not in this hunk.

### Carried forward, unchanged by this fold (from `reviews/item-17-review.md`)

- **ADV-B** — `no-harness-process` and `harness-process-present` refuse forever,
  silently, and the planned path has no bind-timeout. Untouched here.
- **ADV-C** — the pane-resolution sweep is still line-scoped (multi-line arrows,
  aliased destructures bypass). Untouched here.
- **ADV-D** (narrowed after my own retraction) — the `reports/item-17-report.md`
  half of the report pair, and recording the dedupe-lifetime tradeoff. Note the
  fold's comment at `loop.ts:433-435` **does** now record that tradeoff in code
  ("dedupe is per seat×cause for the life of the DriveState"), which is the
  better home for it.

---

## 8. Teardown

- `/tmp/pij-adva` — `git worktree remove --force` + `node_modules` symlink gone.
- `zz-advaprobe.test.ts` — deleted; `git status --porcelain` **empty** afterwards.
- `loop.ts` restored to pristine sha `e2cae2d7…df87fa`, verified by hash **and**
  empty `git status`.
- `/tmp/adva-*.py`, `/tmp/adva-*.txt`, `/tmp/adva-probe*.ts` — removed.
- The only artifact left by this pass is **this file**. Untracked; I was not
  asked to commit it.

---

## 9. Bottom line

**APPROVE `3495476` — merge PR #19.**

The one-line fold is the fix I recommended, placed the only way that actually
works, pinned by a non-vacuous test that I broke and restored on disk, with no
collateral to the previously-approved item-17 code and both gates reproduced
first-hand. It converts a silent swallowed refusal into a delivered one.

**ADV-A2 is the follow-up**, not a blocker: `settled` shares the never-reset
defect, so a revived seat that re-binds after a refusal leaves its spawner
holding a stale `⛔`. Loud-and-stale beats silent-and-wrong, so this fold is
still strictly the right direction — but the pair should be closed together.
