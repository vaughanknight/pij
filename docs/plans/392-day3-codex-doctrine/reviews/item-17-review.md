# Item 17 — cold review: bind-guard advisories (ADV-1/2/3/4)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, fix, or follow-up run has been
> executed on item 17 after this file was written. Everything below was produced before
> delivery. If a further pass is wanted, it needs a new dispatch.

**Reviewer**: `pij-wilful-morton` (cold — no part in authoring item 17)
**Candidate**: `269ef3e5142275522b9b30c4e2354e0b04de55c1` "fix(pij): harden bind guard diagnostics"
**Parent**: `cb0e632` · **Packet-stated base**: origin/main `ed20a68b`
**Packet**: `reviews/item-17-review-packet.md` · **Dossier**: `tasks/item-17-bind-guard-advisories/tasks.md`
**Date**: 2026-08-28

---

## VERDICT: ✅ APPROVE

All five mandatory Dim-0 mutations were run **by me, on disk, with sha256 verification of
every RED and every restore**. All five went RED. All five restored to the pristine sha and
returned GREEN. Two further mutations of my own (MUT-F, MUT-G) confirm the two assertions the
packet asked me to *confirm* rather than *mutate* are also non-vacuous.

The one behaviour change (ADV-2) is **provably bind-set preserving**: I enumerated all six
`resolveAgentLiveness` causes plus the no-probe case at runtime and the bind decision is
identical to the pre-change predicate in all seven.

Four advisories follow. **None blocks the merge.** All four are about the *tail* of what
remains silent or line-scoped — not about anything this commit made worse.

---

## 1. Scaffolding, method, and the limits of this pass — stated FIRST

**Scaffolding I created (all torn down; see §8):**

- `/tmp/pij-17` — my own detached worktree at `269ef3e`, with `node_modules` **symlinked from
  `~/GitHub/pij`**. So dependencies are the main checkout's resolved tree, **not a clean
  `npm ci`**. A dependency-resolution defect would not be visible to this pass.
- `/tmp/pij-17-base` — a second detached worktree at the parent `cb0e632`, used only to prove
  the pre-existing red is pre-existing (§7).
- `.pi/extensions/pij/core/daemon/zz-probe17.test.ts` and `zz-body17.test.ts` — throwaway
  probe suites built by appending to a **copy** of `loop.test.ts` (so the real fixtures are
  reused unmodified). Both deleted; tree verified clean by `git status --porcelain` after each.
- `/tmp/d0-17/` — pristine backups, mutation scripts, and captured run output.

**What I did NOT check — a gap you should weigh, not assume clean:**

- **`just smoke` was NOT run, deliberately.** `tmux 3.6a` is present and this host has **live
  pij sessions on it** (`pij-prime` 8 windows, `peri-prime`, `perimenocause`). Driving the
  smoke harness spawns real panes and agents on a shared machine; I judged the risk of
  disturbing live peers to outweigh the signal. **The bind guard is genuinely smoke-relevant**
  — it governs what binds at spawn — so this is a real gap, not a formality. What bounds it:
  §5 proves at runtime that the *set of what binds* is unchanged, so the only behaviour a
  smoke run could newly observe is **one extra message in the spawner's inbox**.
- **`harness checks` / `just self-check` were NOT run as composites.** I ran their constituent
  sensors individually instead (typecheck, lint, full vitest) — see §7. `pkg audit`,
  `snapshots-check`, and local-path portability were not run.
- **No live daemon.** Every refusal I observed came from `driveSession` called directly in
  vitest. I never watched a real `⛔` land in a real inbox.
- **The packet's stated base `ed20a68b` is 20+ commits behind the candidate.** I reviewed
  `269ef3e` against its **parent `cb0e632`**, which is the only commit that touches the fence.
  `git show --stat 269ef3e` = exactly 3 files, all in-fence, so the two framings agree on the
  code under review.

**Lineage.** `269ef3e` changes exactly three files and no others:

```
.pi/extensions/pij/core/daemon/index-state.test.ts | 127 ++++++++++++++++++---
.pi/extensions/pij/core/daemon/loop.test.ts        |  70 +++++++++++-
.pi/extensions/pij/core/daemon/loop.ts             |  43 ++++++-
3 files changed, 215 insertions(+), 25 deletions(-)
```

No schema change, no government edit, no new port — matching the dossier fence and confirming
the "Open" lead (`heldBoot` precedent, no new port needed) was followed.

**Branch drift during the pass.** The branch advanced from `269ef3e` to `cc5f545` while I
worked. `git diff 269ef3e cc5f545 -- <the 3 fence files>` is **empty** — the new commit is
docs-only (item 20 ruling). **This verdict applies unchanged to the current branch head.**

**Pristine sha256 (the baseline every restore was checked against):**

| file | sha256 |
|---|---|
| `core/daemon/loop.ts` | `cf84dd1815f495670d5f18a32fe46c6161aa70485f74bdfd0dfe18dc2df408ad` |
| `core/daemon/index-state.test.ts` | `e56cb85466462a0bcff08dbdf581d3044037b5d528cb817814ada9c33789f8bc` |
| `core/daemon/loop.test.ts` | `9e98bcc6ea2fd9547075dd566e4df4d9d7c924189511f2927536baadbd6683f7` |

**Baseline (candidate, unmutated):** `npx vitest run` on both fence test files →
**exit 0, 103 passed** (index-state 15, loop 88), 236 ms.

---

## 2. Dim-0 — the five mandatory mutations (ALL FIVE ON DISK, sha-verified)

Every mutation was applied by a line-based script that **asserts its anchor is unique** and
**refuses to proceed on a no-op**, so no mutation silently failed to land. After each RED the
file was restored from a byte-pristine backup and re-verified by sha **and** by
`git status --porcelain` returning empty.

| # | What was mutated | mutated-file sha256 (on disk at RED) | RED at | Actual assertion message |
|---|---|---|---|---|
| **MUT-A** | `loop.ts` — deleted the `notify()` emission inside `reportBindRefusal` (lines 535-540) | `18eeca14d5b9ac69fe0103641962bce4d045916da2f155c804823e5ac5d38d75` | `loop.test.ts:421:20` **and** `loop.test.ts:484:5` | `expected [] to have a length of 1 but got +0` · `expected false to be true` |
| **MUT-B** | `loop.ts` — deleted the dedupe guard `if (surfaced.has(cause)) return;` (line 533) | `414262dd7d80bcc7a6597f90a14ff1b1bbebdbfced4e73d5f884755c5370f5f5` | `loop.test.ts:421:20` | `expected [ {…}, {…} ] to have a length of 1 but got 2` |
| **MUT-C** | `loop.ts:394` — `malformedCopilotId` clause → constant `false` | `01b1edeb47c13b8b7541f20bbf7402fedd6eeb305b9a89765e17c117f1d4a301` | `loop.test.ts:480:20` | **`expected 'bound' to be 'waiting'`** |
| **MUT-D** | `index-state.test.ts:72` — separator-normalised compare → slash-only `file.endsWith("/core/discovery.ts")` | `4996931184d7a710d429eda08454dc9932d7bff194c39284ad5d47d27aad1844` | `index-state.test.ts:207:5` | `expected [ Array(1) ] to deeply equal []` |
| **MUT-E** | `index-state.test.ts:53` — detector reduced to operand order #1 (dropped the reversed + destructured regexes) | `e4cbb7fef5149640e19c92b9e9cec9eb187253c11293bc9b442d4af26a0dc05f` | mutated `:224:22` = **pristine `:226`** | `expected [] to have a length of 1 but got +0` (**2** tests: reversed operands *and* destructured pane id) |

**Restore ledger** — each restore verified before the next mutation:

| after | restored sha256 | `git status` | re-run |
|---|---|---|---|
| MUT-A | `cf84dd18…f408ad` ✅ matches pristine | empty | exit 0, 88 passed |
| MUT-B | `cf84dd18…f408ad` ✅ | empty | exit 0, 88 passed |
| MUT-C | `cf84dd18…f408ad` ✅ | empty | exit 0, 88 passed |
| MUT-D | `e56cb854…89f8bc` ✅ | empty | exit 0, 15 passed |
| MUT-E | `e56cb854…89f8bc` ✅ | empty | **exit 0, 103 passed (both files)** |

### Three things the packet's claimed lines got wrong — corrected here

1. **MUT-A/MUT-B RED is line 421, not 427.** Line 427 is inside the `it.each` *data literal*
   (`cause: "probe-unavailable"`). The assertion that actually fails is
   `expect(refusals).toHaveLength(1)` at **421**.
2. **MUT-C RED is line 480, not 486.** 486 is a blank line between tests. The failing
   assertion is `expect(out.kind).toBe("waiting")` at **480**.
3. **MUT-D RED is line 207, not 204.** 204 is `relative: win32.relative,` inside the argument
   object; the assertion is `).toEqual([]);` at **207**.
   **MUT-E** reports `224` because the mutation *removes two lines from the file it fails in* —
   mutated `224` maps to pristine `226`. I verified both lines are byte-identical
   (`expect(violations).toHaveLength(1);`).

These are reporting inaccuracies in the packet, not defects. Every mutation is genuinely
pinned; the pins just sit on different lines than claimed.

### MUT-C deserves emphasis — this one is a safety property, not a diagnostic

MUT-C's failure is **`expected 'bound' to be 'waiting'`**. Without the copilot clause the
daemon does not merely *fail to log* — **it binds the seat to a malformed, non-UUID planned
id.** The M5 gap (item-10b review §5: deleting this clause passed all 3989 tests) is now
closed by a test that fails in the *dangerous* direction. This is the single most valuable
line of the commit.

---

## 3. Dim-0 extras — my own, because "confirm it is quiet" is not a mutation

The packet's Dim-1 items 1 and 4 ask me to *confirm* behaviour. A passing assertion confirms
nothing unless it can fail, so I mutated against both.

| # | What I mutated | mutated sha256 | RED at | Result |
|---|---|---|---|---|
| **MUT-F** | `loop.ts:397` — widened the notify ternary to `identity?.cause !== undefined && identity.cause !== "session-id-match"` (i.e. notify on **any** non-match cause, transient included) | `56616aede2fa77886e3efba5ed502e22d5ef65ecaa3bed837661f3d484d0bbba` | `loop.test.ts:459:27` — **both** `it.each` cases | `expected [ { messageId: 'fake-1' } ] to deeply equal []` |
| **MUT-G** | `index-state.test.ts:45-47` — `stripComments` body → `return source;` | `69ac427e91c321c169dfb8f441942ee1c91d14136ab6136ad6be58ea92b4ccb1` | mutated `:243:5` = **pristine `:245`** | `expected [ …(2) ] to deeply equal []` |

**MUT-F is the important one.** It proves `expect(delivery.outbox).toEqual([])` is
load-bearing: if a transient cause ever starts notifying, **both** transient cases go RED.
The retry-not-refuse invariant is genuinely guarded, not merely asserted.

**MUT-G note worth recording:** under MUT-G only the *synthetic* comments test failed — the
real repo-wide sweep stayed green, i.e. **no comment currently in the tree contains a
`.paneId ===` shape.** So `stripComments` is exercised solely by the synthetic fixture today.
That is the correct design (the fixture exists precisely so the behaviour is pinned before a
real comment triggers it), but it means the real sweep contributes no evidence here.

Both files restored to pristine sha, `git status` empty, full re-run exit 0 / 103 passed.

---

## 4. Semantic preservation — the bind set is provably unchanged

The refactor replaced one boolean with a two-stage classify. Read as algebra:

- **before**: bind ⟺ `¬malformed ∧ cause = "session-id-match"`
- **after**: bind ⟺ `refusalCause = undefined ∧ cause = "session-id-match"`,
  where `refusalCause = undefined ⟺ ¬malformed ∧ cause ≠ "foreign-session-id"`
  — and `cause = "session-id-match"` already implies `cause ≠ "foreign-session-id"`, so the
  second conjunct is absorbed. **Identical.**

I did not stop at the algebra. I enumerated **every** cause `resolveAgentLiveness` can return
(`state.ts:427/459/477/483/503/515/529`) plus the case where the probe port is absent, drove
each through `driveSession` in a throwaway probe suite, and asserted both the bind decision
and the notify count:

| forced cause | outcome | refusal notices |
|---|---|---|
| `session-id-match` | **bound** | 0 |
| `foreign-session-id` | waiting | **1** |
| `probe-unavailable` | waiting | 0 |
| `identity-indeterminate` | waiting | 0 |
| `no-harness-process` | waiting | 0 |
| `harness-process-present` | waiting | 0 |
| no probe port (`undefined`) | waiting | 0 |

All 7 passed. **Exactly one cause binds; exactly one cause notifies.** The packet's claim
"the set of what BINDS is unchanged — only observability changed" is confirmed at runtime,
not by reading.

**The `Set` is safe.** `DriveState` lives only in `daemon.ts:151`'s in-memory
`Map<string, DriveState>`; it is never serialised (the only `JSON.stringify` in `daemon.ts`
is `:1292`, over descriptors). A `Set` would have degraded to `{}` across a JSON round-trip
and then thrown on `.has()` — that hazard does not exist here.

**Exact emitted bodies** (captured from a real `driveSession` call, not inferred):

```
to=pij-boss :: ⛔ pij-w planned bind refused (foreign-session-id): every harness process under pid 100 belongs to another seat (22222222-2222-4222-8222-222222222222)
to=pij-boss :: ⛔ pij-w planned bind refused (malformed-planned-copilot-id): planned id 'not-a-uuid' is not a UUID
```

Both name the seat, the cause, **and an actionable detail** (which foreign seat; which bad
value). This is a good diagnostic — a recipient can act on it without reading code.

---

## 5. Dim-1 — the packet's five semantic questions, answered

**1. Is the QUIET path genuinely quiet?** ✅ **Yes, and the assertion bites.** Both
`probe-unavailable` and `identity-indeterminate` produce `waiting` with `outbox === []`
(`loop.test.ts:441-460`), and MUT-F (§3) proves that a widened notify set turns **both** RED.
The retry-not-refuse invariant is pinned.

**2. Does `reportBindRefusal` no-op when `!descriptor.spawnedBy`?** ✅ **Yes — and better than
required.** I probed a foreign-id seat with `spawnedBy: undefined`: returns `waiting`, outbox
empty, no throw, **and `drive.bindRefusalCauses` is still `undefined`**. The `if
(!descriptor.spawnedBy) return;` sits *before* the set is allocated, so a spawner-less seat
leaves no residue on drive state at all. No orphan notify, no crash.

**3. Is the dedupe key cause or seat?** ✅ **It is (seat × cause), exactly as the dossier T002
specified** — the `Set` is keyed by cause and lives on the per-seat `DriveState`, which
`daemon.ts:546` fetches by `d.id`. I proved both halves at runtime:

- *Precedence*: a seat that is **both** malformed and foreign surfaces **only**
  `malformed-planned-copilot-id` — `bindRefusalCauses` is exactly
  `["malformed-planned-copilot-id"]`. Root cause first; correct.
- *Both-once*: driving one `DriveState` through malformed → foreign → repeat → repeat yields
  `bindRefusalCauses = ["foreign-session-id", "malformed-planned-copilot-id"]` and an outbox
  of **exactly 2**. So it is **not** log-once-ever-per-seat; each cause gets its own shot.

The tradeoff the dossier flagged ("a seat that transitions foreign→match should arguably be
allowed to log again") **is** present — the set is never cleared. See **ADV-A**.

**4. Does the tightened allowlist still pass the real resolvers, and ignore comments?**
✅ **Yes.** The real repo sweep is green, and I checked the pinned strings against the actual
source: `discovery.ts:128` is byte-identical to `SHARED_RESOLVER_LINE`, and
`current-session.ts:82-83` are byte-identical to `PENDING_OCCUPANT_LINE` +
`PENDING_OCCUPANT_LIFECYCLE_LINE`. No false positive on the legitimate shared resolver.
Comment-only shapes are ignored, and MUT-G proves that assertion is non-vacuous.

**5. `gatesClean:false` — does any of it touch the three changed files?** ✅ **No.** See §7 —
this is the one claim I checked hardest, because it is the one the packet said would be
blocking if false.

---

## 6. `gatesClean:false` verified — pre-existing, environmental, and outside the fence

| sensor | candidate | at parent `cb0e632` | touches the 3 files? |
|---|---|---|---|
| `npx tsc --noEmit` | **exit 0, 0 errors** | — | n/a — **typecheck is fully GREEN**, not red |
| `biome check` on the 3 fence files | **clean**, 0 diagnostics | — | **no** |
| `biome check .` (repo-wide, `--max-diagnostics=200`) | exit 1, **11 files** | exit 1, **11 files** — **byte-identical file list** | **no** |
| `npx vitest run` (full suite) | exit 1 — **1 file failed / 230 passed / 4 skipped (235)** | same file fails | **no** |

**The single failing test file is `harness/scripts/release-age-policy.test.ts`**, test
*"restores the Windows caller environment even when a governed command fails"*. Root cause:

```
Error: spawnSync pwsh ENOENT
 ❯ probePowerShellEnvironmentRestoration harness/scripts/release-age-policy.test.ts:196:17
```

`which pwsh` → **absent on this host**. It is a missing-binary environmental failure, it fails
**identically at the parent commit which does not contain the item-17 changes**, and it lives
in `harness/scripts/` — nowhere near `core/daemon/`. This is the "windows-compat" red and it
is confirmed pre-existing.

**A methodological note on the lint comparison, because it nearly produced a false alarm.** My
first `biome check .` runs appeared to flag *different* file sets at base and candidate. That
was an artifact of biome's **default 20-diagnostic cap** truncating the list at different
points. Re-run with `--max-diagnostics=200`, both trees flag the **same 11 files**. Since
`269ef3e` changes only 3 files and none of the 11 is among them, the lint red is
definitionally untouched by this change. **The capped run was the misleading one** — worth
remembering the next time a gate's output is compared across two trees.

---

## 7. Findings — four advisories, none blocking

### ADV-A (low) — `bindRefusalCauses` is never cleared, in either direction

The set is written once per cause and never reset, including on the successful-bind path
(`loop.ts:421-430` sets `drive.settled` but touches nothing else). Two consequences:

1. **The dossier-anticipated one**: a seat that goes foreign → resolves legitimately → goes
   foreign *again* will **never** report the second occurrence. The dossier explicitly
   accepted this ("acceptable to keep it simple … and note the tradeoff"). It is accepted,
   but I could not find it noted anywhere on disk (see ADV-D).
2. **The one the dossier did not anticipate — a spurious notice that is never retracted**:
   the guard runs only after init injection and a first `ready` (`loop.ts:325`, `:355`), but
   `foreign-session-id` (rung 4, `state.ts:529`) fires when **all** harness processes in the
   pane's subtree are foreign. A lingering previous agent that has not yet exited while the
   new one is still starting satisfies exactly that. The next tick resolves to
   `session-id-match` and the seat binds normally — but the spawner has already received
   `⛔ … planned bind refused (foreign-session-id)` and gets **no** follow-up. An operator
   reading the inbox sees a refusal for a seat that is, in fact, bound.

**Suggested fix — one line**, in the successful-bind branch alongside `drive.settled = true`:
`drive.bindRefusalCauses?.delete("foreign-session-id")` (or clear the set). That closes both
directions at once: a real second occurrence becomes reportable, and a transient false
positive self-corrects on the next genuine refusal.

### ADV-B (low) — the notify set covers 1 of 3 permanently-non-binding causes

ADV-2's thesis is `daemon.ts:566`'s *"Never silent: say it once when it starts."* Of the six
liveness causes, **three** never bind:

| cause | liveness | notified? | can it resolve on its own? |
|---|---|---|---|
| `foreign-session-id` | absent | ✅ **yes** | rarely |
| `no-harness-process` | **absent** | ❌ silent | only if the agent later appears |
| `harness-process-present` | *alive* | ❌ silent | only if the id later appears on argv |

`harness-process-present` (rung 3, `state.ts:503`) is the interesting one: liveness is
**`alive`** — a harness process really is running — but no session id is parseable from its
command line, so the guard's `cause !== "session-id-match"` refuses forever, silently.

And **the planned-id path has no timeout to bound that silence.** I checked: every branch of
the `if (descriptor.plannedHarnessSessionId)` block returns (`loop.ts:382, 408, 411, 418,
430`), so it never reaches the `bind-timeout` `fail(...)` at `:503-518` — that belongs to the
transcript-discovery path. `daemon.ts` has no pending-age sweep either. A planned seat stuck
on either silent cause waits **unbounded and unlogged**.

**This is not a regression** — before this commit *all six* causes were silent, so the change
strictly shrinks the silent set from 6 to 4 and cannot have made anything worse. But the
"never silent" goal is roughly one-third delivered, and the remaining two causes are the ones
with no timeout behind them. Worth a follow-up item, not a change request here.

### ADV-C (low) — the sweep detector is still line-scoped; narrowed, not closed

ADV-3 genuinely widens coverage (MUT-E proves reversed operands *and* destructuring are now
caught, and `\.paneId\s*===` also catches the un-spaced `x.paneId===p` that the old
`includes(".paneId ===")` missed). Residual bypasses remain, all inherent to line-based
matching:

- a **multi-line** arrow — `descriptors.find(({ paneId }) =>` on one line, `paneId === target`
  on the next — matches none of the three regexes;
- an **aliased** destructure — `const { paneId: pid } = descriptor; … pid === target`;
- the `undefined` exclusion is **line-scoped** and now slightly *wider* than before
  (`undefined === x` also disarms), so a genuine violation sharing a line with any `undefined`
  comparison is invisible. Both old and new code have this hole.

Recording so the sweep is not later read as exhaustive. An AST-based check would close it; a
line sweep never will.

### ADV-D (process, low) — the T006 report artifact is a JSON, is untracked, and omits the tradeoff note

**Corrected after first writing — my original wording was wrong and is retracted.** I first
recorded that no item-17 report existed at all, on the strength of `git ls-files | grep
item-17` (only the dossier) and a listing of `reports/` **inside my detached worktree**, which
by construction shows only committed files. Both checks were sound and both missed the same
thing: `docs/plans/392-day3-codex-doctrine/reports/item-17-coder-report.json` exists in the
s392 worktree as an **untracked** file (written 01:23:13, one minute after the candidate
commit). *A detached worktree cannot see the untracked files of the worktree you were pointed
at* — worth remembering, since building an independent tree is otherwise the right move.

What actually stands, having read it:

- The mutation evidence **is** recorded — the JSON's `notes` carries all five MUT-A…E claims.
  It is also **the origin of the three wrong line numbers** in §2: the JSON says
  `loop.test.ts:427`, `:427`, `:486`, `index-state.test.ts:204`, `:220`, which the packet then
  relayed verbatim. So the corrections in §2 apply to the coder's own record, not merely to
  the packet.
- Dossier T006 named `reports/item-17-report.md`; only the `.json` exists. Both
  `item-9-coder-report.json` and `item-14-coder-report.json` sit **alongside** a companion
  `.md`, so the `.md` is the missing half of an established pair, not an invented requirement.
- The JSON is **untracked**, so none of this evidence is on the branch.
- The `notes` field does **not** record the dedupe-lifetime tradeoff the dossier's "Open"
  section explicitly asked to be noted. That part of my original finding is unchanged, and it
  is the part that matters — see ADV-A.

Its independent claims check out against my own run: `gatesClean: false` with "none mention
the changed files" is exactly what §6 proves, and the daemon-directory figure (460/460) is
consistent with the 103 I measured across the two fence files.


### INFO — the tightened allowlist is a string pin, but the *safe* kind

The allowlist moved from a ±4-line context window to **exact trimmed-line equality** against
`SHARED_RESOLVER_LINE` / `PENDING_OCCUPANT_LINE`. That is a string pin on code, so it is
E6-adjacent — but it points the **opposite** way to the E6 hazard (item 18). If the pinned
source is reformatted or renamed, the sweep **fails loudly as a false positive**; it cannot
silently start passing. Drift produces noise, not blindness. That is the correct direction for
an allowlist and I raise it only so it is not mistaken for the E6 class later.

---

## 8. Teardown

- `/tmp/pij-17` and `/tmp/pij-17-base` removed via `git worktree remove --force`.
- Both probe suites (`zz-probe17.test.ts`, `zz-body17.test.ts`) deleted; tree verified clean.
- All seven mutations restored to pristine sha256, each verified by hash **and** by an empty
  `git status --porcelain` before the next step.
- Nothing in `~/GitHub/pij` or any pre-existing worktree was modified by this review other
  than the creation of this file. Main checkout `git status --porcelain` is empty.
- **One discrepancy I am flagging rather than glossing.** At the start of teardown five
  worktrees existed besides mine; afterwards `s393-jordan-spec` is gone from both
  `git worktree list` and disk. **It was not me**: my only two removals named `/tmp/pij-17`
  and `/tmp/pij-17-base` as explicit absolute paths, and I never referenced the s393 path at
  any point. Concurrent activity is corroborated — during the same window the main checkout
  moved `0e7adee → 73f4a90` and `s391-day3-core` moved `2a3942c → d5713a6`, neither by me.
  Recording it so the timeline is not later reconstructed against this pass.

---

## 9. Bottom line

**APPROVE.** The five mandatory mutations are on disk, sha-verified, and all five RED→GREEN.
The behaviour change is bind-set preserving under runtime enumeration of every liveness cause.
The quiet path is quiet and provably guarded. The `gatesClean:false` red is pre-existing,
environmental (`pwsh` absent), identical at the parent, and touches none of the three changed
files. ADV-A is the one I would most like to see folded — one line — but it is a diagnostic
refinement on top of a change that is already strictly better than what it replaces.
