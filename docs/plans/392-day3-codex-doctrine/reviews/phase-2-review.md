# Cold review — Phase 2 (3c) · flow-pair dlg-0002

**Verdict**: `FIX_REQUIRED` — **two** blocking items, both Dim-0 (missing witnesses, not wrong code). The implementation itself I believe is correct; that is precisely the distinction the mutation gate exists to enforce.

> **TERMINAL REPORT — no pass is open.** Every mutation I intend to run has been run. The Dim-0 pass
> is **CLOSED at 9 mutations** (6 RED→GREEN, 3 STAYED GREEN). Nothing is pending against `236dec9`.
> The fixes below will be re-reviewed as a **new** review against a **new** sha, in a **separate**
> verdict file — this one is final for `236dec9`.

**Reviewed shas**: `35f9aff` (impl: `index.ts` +84/−28, `index.test.ts` +150) · `236dec9` (report/evidence) over base `95de006057bb4de2f6981b4051b754101cd5d4f4`
**Diff reviewed**: `git diff 95de006..236dec9 -- .pi/extensions/pij/index.ts .pi/extensions/pij/index.test.ts` (+ the three dossier/report docs in the same range)
**Reviewer**: `pij-pale-araminta` — GitHub Copilot CLI 1.0.81-14, claude-opus-5 @ xhigh. Cold: I did not see the coder's session.
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (verified `pwd` == `git rev-parse --show-toplevel`; never touched `~/GitHub/pij` except to READ the rubric).
**Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md`

---

## Scaffolding and limits of this review — read first

**Scaffolding I used.** The Dim-0 gate physically mutates tracked source. I ran `just flow-pair-mutate`
(backs up → mutates → asserts RED → `cp`-restores → asserts GREEN) for all 9 mutations, then re-ran 6
of them **manually** — same `sed`, own `/tmp` backup, explicit restore — purely to capture the failing
test **names**, because the script's GREEN re-run overwrites `/tmp/fp-mutate.log` and destroys them.
**Every mutation targeted exactly one file, `.pi/extensions/pij/index.ts`.** After the last run,
`git status --porcelain -- .pi/extensions/pij/index.ts` returns empty — byte-identical to HEAD,
including on the three stay-green failure paths where the script's `trap`, not its success path, did
the restore.

**No mutation reported by count alone.** Every RED below names the tests that failed.

**A third writer in this tree — observed, and materially different from the Phase 1 incident.**
At 19:48:36, mid-mutation-run, `.pi/extensions/pij/core/daemon/loop.test.ts` gained +106 lines: a new
`describe("routing invariant — body on socket/RPC, pointer only where a pty can clip (plan 392 Phase 4)")`.
That is neither mine nor the FX001 coder's declared fence (`core/cli.test.ts`) — a **third** agent is
working Phase 4 in this same worktree. **Unlike Phase 1, this carries no clobber risk from me**:
`flow-pair-mutate` backs up and restores *only the file passed to it*, and I passed `index.ts` and
nothing else on all 9 runs, so `loop.test.ts` was never inside a restore window of mine. It also
cannot contaminate my results — it is not in the suite I ran. **Reported as an observation, not a
hazard**, and folded into my single terminal report rather than escalated mid-review.

**What I did NOT check, stated plainly so it cannot be mistaken for a clean result:**

| Not examined | Why |
|---|---|
| `core/cli.test.ts` and `core/daemon/loop.test.ts` suites | Both are being written **right now** by other agents (FX001 and Phase 4). A red there would be unattributable, and a green would be a snapshot of someone's half-finished edit. **Not run. Not clean — unexamined.** |
| Full `npx vitest run .pi/extensions/pij/` (171 files) | Same reason: it loads both of the above. I ran the 6 suites this diff actually reaches instead. The coder reports 3923 pass / 15 skip on the full suite at its own commit; **I did not reproduce that.** |
| Repo-wide `just lint`, `just pij-skill-check`, `just smoke`, `harness checks` | Declared pre-existing red by the dossier and the coder report. I did **not** re-run them, so I have not independently confirmed the pre-existing claim; I accepted it. The diff touches no `skills/` file, which I did confirm. |
| Live behaviour (a real pi seat booting onto the consumer) | Forbidden by the packet (no live restart). Everything below is source + test evidence only. |
| `PIJ_QUEUE_BACKEND=dual` through `index.ts` | No test covers it. `sqliteOf(DualWriteChannel)` returns the sqlite half, so the receiver takes the sqlite branch and the mirrored fs files for a pi seat are never marked read — same rollback-replay caveat I raised as Phase 1 finding 6. Reasoned from code, **not executed**. |

---

## Findings

| # | Severity | File:line | Claim | Evidence | Fix |
|---|----------|-----------|-------|----------|-----|
| **1** | **medium, BLOCKING** | `.pi/extensions/pij/index.ts:372-374` | **A failed injection that is silently swallowed would ack the row anyway — permanent message loss — and no test notices.** | Mutation **M2b**: wrapped the handler body in `try { … } catch {}`. **Suite STAYED GREEN, 14/14.** No test in `index.test.ts` ever drives `onInbound`/`sendUserMessage` to throw. | Add the rejecting-fake test the dossier itself prescribed (Prior Phase Context **E**: *"production closure driven by a rejecting fake … mirror that shape for `index.test.ts`"*). See F1 below. |
| **2** | **medium, BLOCKING** | `.pi/extensions/pij/index.ts:366` | **`disposeWatch?.()` on the sqlite reload path is guarded by nothing.** The test whose name ends *"and reload does not replay"* passes because the row is already **acked**, not because the old consumer was disposed. | Mutation **M8**: deleted the `disposeWatch?.();` line from the sqlite branch. **Suite STAYED GREEN, 14/14.** Dossier T001(d) names this as a done-when: *"reload … **disposes the consumer** and re-opens one without re-injecting"*. | Assert consumer count across reload — `vi.getTimerCount()` in the existing fake-timer test. See F2 below. |
| 3 | **low** (Dim-0) | `.pi/extensions/pij/index.test.ts:408` | The test named *"…**acks after injection**…"* does **not** guard that ordering. | Mutation **M2** (defer `onInbound` to a macrotask so the ack lands first) went RED in **exactly one** test — *"records and acks a sqlite receipt…"* — and **not** in the one named for the ordering. Worse, the witness that did fire is a **race**: `waitFor` happens to observe `acked` before the deferred `setTimeout(0)` runs. It is real (RED is RED) but timing-incidental and will rot. | **The strong pattern already exists 60 lines above, in the fs test**: `markerStateDuringInbound.push(existsSync(marker))` sampled *from inside* `sendUserMessage`, asserted `[false]`. Mirror it: sample `queue.summary({to:id})[0]?.state` inside the fake and assert it is not yet `"acked"`. That converts an incidental red into a constructive one. |
| 4 | **low** (Dim-0) | `.pi/extensions/pij/index.ts:133` | `sqliteOf(delivery)?.close()` in the `pij_send` `finally` — **named in the packet's own contract line** ("`pij_send` tool deps via `openChannel`, *closing the sqlite handle*") and in the coder's own Discoveries table — is guarded by nothing. | Mutation **M6**: deleted the call. **Suite STAYED GREEN, 14/14.** | **Deliberately NOT promoted to blocking** — see "Why `FIX_REQUIRED`" for my reasoning, which the orchestrator may overrule. The consequence class is bounded resource growth, not data loss, and unlike findings 1 and 2 I could not identify a cheap deterministic witness: `SqliteQueue` exposes no `db.open`, so proving a close needs a new test seam. |
| 5 | **info** (Dim-7) | `tasks.md` header · `execution.log.md` header | Both still cite implementation commit `621c846d9faa…`, which the rebase destroyed. I verified it is **not an ancestor of HEAD** (`git merge-base --is-ancestor` → false). | The coder report JSON handles this correctly with `commitsPreRebase` / `commitsPostRebase`; only the two markdown headers are stale. | One-line edit each to `35f9aff`. No behavioural impact. |
| 6 | **info** | `.pi/extensions/pij/index.ts:382` | The sqlite branch `return`s before `mkdirSync(inbox)`, so a pi seat running sqlite never gets a `<dataDir>/inbox` directory. | Read from the diff. | Harmless as far as I traced — `FsChannel.deliver` creates the directory on demand, so an `PIJ_QUEUE_BACKEND=fs` rollback still works. **I did not exhaustively check every reader of that path**, so this is an observation, not a cleared item. |

**No finding at `high` or `critical`. Findings 1 and 2 are the `FIX_REQUIRED` items.**

### F1 (blocking) — no witness that a failed injection leaves the row unacked

**Claim.** The whole point of Phase 1's consumer is *ack-only-on-success*. `index.ts`'s handler is the
seam that decides whether a failure ever reaches the consumer, and that seam is untested.

**Why the code is right.** `onMessage: async (dm) => { receiver.onInbound(dm, dm.messageId); }` — I
verified `PijSession.onInbound` is **synchronous** (`core/session.ts:542`, returns `InboundResult`,
not a promise), so an exception propagates out of the async arrow as a rejection,
`queue-consumer.ts:46` catches it, logs, `break`s, and the row stays `claimed` for the daemon's lease
sweep. Correct by construction.

**Why that is not enough.** Delete the propagation — one `try/catch` — and the row is acked though
nothing was injected: **the message is gone, and the queue says it was delivered.** That is the exact
invariant this plan exists to establish, and the suite does not notice. Under the rubric
(*"a suite that stays green under mutation does not guard the behaviour and must be treated as
`FIX_REQUIRED`"*) this is mandatory, and I am not going to argue past it because I personally read the
code as correct — the reviewer reading it as correct is what the gate exists to distrust.

**It is not a novel demand.** The dossier's own Prior Phase Context **E** told the coder to mirror the
rejecting-fake shape from `telegram/bridge.test.ts`'s sqlite describe. That instruction was not
carried out; `makeFakePi()` is called with no argument in all three new tests.

**Fix.** One test:

```ts
it("leaves the row claimed when injection throws", async () => {
  process.env.PIJ_QUEUE_BACKEND = "sqlite";
  // …deliver one row…
  const { pi, handlers } = makeFakePi(() => { throw new Error("pi refused"); });
  // …session_start, wait for a poll…
  expect(queue.summary({ to: id })[0]?.state).toBe("claimed");   // NOT "acked"
});
```

**Acceptance**: mutation **M2b** must go RED.

```
just flow-pair-mutate .pi/extensions/pij/index.ts \
  's/onMessage: async \(dm\) => \{/onMessage: async (dm) => { try { receiver.onInbound(dm, dm.messageId); } catch {} if (dm !== undefined) return;/' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
```

### F2 (blocking) — no witness that reload disposes the previous consumer

**Claim.** `disposeWatch?.()` at `index.ts:366` can be deleted with no test consequence.

**Why the assertion that looks like it covers this does not.** The test is named *"consumes sqlite
messages once, acks after injection, stamps scans, **and reload does not replay**"*, and its reload leg
asserts the injection count is still 1. But the row was **acked** on the first poll, and
`SqliteQueue.claim` selects `WHERE d.state = 'queued'` only (`sqlite-queue.ts:336-338`) — so an acked
row is unclaimable **by construction**, by a second consumer or a hundredth. The assertion passes
whether or not anything was disposed. **This is the Phase 1 lesson in its purest form: a reassuring
test name over a cell that is dark.**

**What actually breaks without it.** On every `/reload`: the previous `startQueueConsumer` keeps its
500 ms interval alive, and its `sqlite` handle is never closed — one leaked handle and one orphan
poller per reload, unbounded. `/reload` is not an edge case in this repo; it is the documented inner
loop (`AGENTS.md` § Workflow: *"iterate: `pi` from pij root + `/reload`"*). The orphan poller holds a
closure over the **previous** `PijSession`, which continues to `persist()` descriptor state under the
same id.

**What it is *not*, so the fix is not over-scoped**: it is **not** a duplicate-delivery bug. I checked
`claim` — it is a single transaction over `state='queued'`, so two live consumers cannot both take the
same row.

**Fix.** In the existing fake-timer test, bracket the reload:

```ts
const before = vi.getTimerCount();
await handlers.get("session_start")?.({ type: "session_start", reason: "reload" }, ctx);
expect(vi.getTimerCount()).toBe(before);   // old consumer disposed, one new one opened
```

*Caveat I owe you*: `startQueueConsumer` calls `timer.unref()`. I did **not** verify how vitest's
fake-timer implementation counts unref'd timers — if `getTimerCount()` ignores them, use a test seam
instead (e.g. have the test observe that the pre-reload `SqliteQueue` handle is closed). Please treat
the mechanism as a suggestion and the **acceptance criterion** as the requirement.

**Acceptance**: mutation **M8** must go RED.

```
just flow-pair-mutate .pi/extensions/pij/index.ts \
  's/disposeWatch\?\.\(\); \/\/ reload: drop the prior consumer before opening a new one//' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
```

---

## Contract verification (the packet's specific asks)

| Contract line | Verdict | How I verified it (independently of the coder's report) |
|---|---|---|
| sqlite receiver = `startQueueConsumer` | **HOLDS, guarded** | `index.ts:364-382`. M4 (force the branch off) → **11 of 14 RED**. |
| ack ONLY after `receiver.onInbound` returned | **HOLDS in code; PARTIALLY guarded** | `onInbound` is sync (`session.ts:542`), so the async arrow cannot resolve early — correct by construction. But the *ordering* is guarded only incidentally (finding 3) and the *failure* path not at all (**F1**). |
| `onScan → noteInboxScan`; plan-057 detector keeps firing | **HOLDS, guarded** | `index.ts:375`. M3 (drop the wiring) → RED in the heartbeat test. `noteInboxScan` (`session.ts:662`) still gates on a live descriptor and the 2500 ms cadence; the consumer starts post-boot, so the first stamp lands. |
| receipts recorded, never injected | **HOLDS, guarded** | Not the branch's job — `onInbound` itself short-circuits `msg.kind === "receipt"` into `capture("receipt")` and returns `receipt-recorded` (`session.ts:547-554`). Proven end-to-end for sqlite by the new test; M1 turns it RED. |
| fs branch (`PIJ_QUEUE_BACKEND=fs`) unchanged | **HOLDS, guarded from both directions** | The block at `index.ts:387-427` is the prior code verbatim. **M4** (sqlite branch dead) leaves *exactly* the two fs-pinned tests passing — they really are on the fs path. **M7** (fs `markRead` neutered) turns *exactly* those two RED and no sqlite test. The pin is real and the fs witness is live. |
| `pij_send` deps via `openChannel` | **HOLDS, guarded** | `index.ts:107`. M5 (revert to `new FsChannel`) → RED. `openChannel` defaults `env` to `process.env` (`channel-factory.ts:131`), so the tool honours `PIJ_QUEUE_BACKEND` identically to the receiver — I checked, because a divergent default there would have split the send and receive backends. |
| …closing the sqlite handle | **HOLDS in code; NOT guarded** | `index.ts:133` in a `finally`. `dispatch` is synchronous, so closing there is safe. M6 → **STAYED GREEN** (finding 4). |
| no `sqlite-queue.ts` write-side change | **HOLDS** | Not in the diff. |
| no `SessionDescriptor` change | **HOLDS** | Not in the diff. |

---

## Dim-0 mutation evidence (MANDATORY gate)

**9 mutations run: 6 RED→GREEN, 3 STAYED GREEN.** All on `.pi/extensions/pij/index.ts`; suite
`npx vitest run .pi/extensions/pij/index.test.ts`; baseline **14/14 GREEN**.

| # | Mutation | Behaviour targeted | Result |
|---|---|---|---|
| M1 | handler returns before `receiver.onInbound` | injection happens at all (packet #1) | **RED (2)** ✓ |
| M2 | `onInbound` deferred to a macrotask ⇒ ack first | ack *ordering* (packet #2) | **RED (1)** ✓ *(incidental — finding 3)* |
| **M2b** | **`try { onInbound } catch {}`** | **failed injection must NOT ack** | **STAYED GREEN ✗ → F1** |
| M3 | `onScan:` wiring deleted | plan-057 heartbeat (packet #3) | **RED (1)** ✓ |
| M4 | `sqliteOf(channel)` → `undefined` | sqlite branch selection (packet #4) | **RED (11)** ✓ |
| M5 | `pij_send` back to `new FsChannel` | tool routes through `openChannel` | **RED (1)** ✓ |
| **M6** | **`sqliteOf(delivery)?.close()` deleted** | **tool closes its sqlite handle** | **STAYED GREEN ✗ → finding 4** |
| M7 | fs `channel.markRead(...)` neutered | fs branch still witnessed (packet #4b) | **RED (2)** ✓ |
| **M8** | **sqlite `disposeWatch?.()` deleted** | **reload disposes the prior consumer** | **STAYED GREEN ✗ → F2** |

M1–M4 are the packet's mandated set. M5–M8 and M2b are mine, added on the packet's own instruction
that *"every site named in a contract line gets its own mutation"* — which is what surfaced all three
stay-greens, since **none of the mandated four touch them**.

### The RED mutations, by failing test name

```
M1  s/onMessage: async \(dm\) => \{/onMessage: async (dm) => { if (dm !== undefined) return;/
    ⎯⎯ Failed Tests 2 ⎯⎯
    FAIL  consumes sqlite messages once, acks after injection, stamps scans, and reload does not replay
    FAIL  records and acks a sqlite receipt without injecting or replaying it

M2  …=> { setTimeout(() => receiver.onInbound(dm, dm.messageId), 0); if (dm !== undefined) return;
    ⎯⎯ Failed Tests 1 ⎯⎯
    FAIL  records and acks a sqlite receipt without injecting or replaying it
          ← NOT the test named "acks after injection". See finding 3.

M3  s/onScan: \(atMs\) => receiver\.noteInboxScan\(atMs\),//
    ⎯⎯ Failed Tests 1 ⎯⎯
    FAIL  consumes sqlite messages once, acks after injection, stamps scans, and reload does not replay

M4  s/const sqlite = sqliteOf\(channel\);/const sqlite = undefined;/
    ⎯⎯ Failed Tests 11 ⎯⎯   (every sqlite test + every test that boots a session)
    survivors: "publishes the pij id to the status bar on session_start" (pre-existing try/catch
               around session_start, documented in the test), plus BOTH fs-pinned tests —
               which is the positive proof that the fs pin works.

M5  s/const delivery = openChannel\(pijHome\);/const delivery = new FsChannel(pijHome);/
    ⎯⎯ Failed Tests 1 ⎯⎯
    FAIL  routes pij_send through the selected sqlite channel

M7  s/const marked = channel\.markRead\(self, dm\.messageId, \{/const marked = { ok: true } as never; void ({/
    ⎯⎯ Failed Tests 2 ⎯⎯
    FAIL  marks a retained unread message only after onInbound injects it, then reload skips it
    FAIL  records and marks receipt history without injecting or replaying it
          ← exactly the two fs-pinned tests, and no sqlite test. The fs branch is genuinely covered.
```

### The three that stayed green

```
M2b …=> { try { receiver.onInbound(dm, dm.messageId); } catch {} if (dm !== undefined) return;
    ✗ FAIL: tests STAYED GREEN under mutation — the suite does not guard this behaviour.
M6  s/sqliteOf\(delivery\)\?\.close\(\);//
    ✗ FAIL: tests STAYED GREEN under mutation — the suite does not guard this behaviour.
M8  s/disposeWatch\?\.\(\); \/\/ reload: drop the prior consumer before opening a new one//
    ✗ FAIL: tests STAYED GREEN under mutation — the suite does not guard this behaviour.
```

All three restored byte-identically via the script's `trap` (verified after each).

### Weak-test red-flag sweep (rubric Dim-0 list)

- **Test name over-claims what it asserts** — **found twice**, both in the same new test: *"acks after
  injection"* (finding 3) and *"reload does not replay"* (F2). Both legs pass for reasons other than the
  ones their names give.
- **Assertion on a value the fake controls** — the ordering leg compares state *after the fact* rather
  than *during* injection. The fs test 60 lines above does it the right way and was not mirrored.
- **Fixture widened / witness removed** — **not found here.** The two `PIJ_QUEUE_BACKEND = "fs"` lines
  added to existing tests are **pins, not widenings**: before this commit the receiver was
  unconditionally `FsChannel`, so those tests were already exercising fs. The pin *preserves* their
  cell against the new sqlite default. I did not take that on trust — M4 and M7 confirm it from both
  directions.
- **Vacuous negative assertions** — checked the three `toBe(false)` / `some(...)` negatives in the new
  tests; each is paired with a positive on the same run (event-log length, ack state), so none can
  pass by the message simply never arriving.
- **No test asserts an error path** — **found**: F1.

---

## Gates I re-ran myself

| Gate | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS**, exit 0 — and notably green *with* the Phase 4 agent's in-flight `loop.test.ts` edit present. |
| `npx vitest run .pi/extensions/pij/index.test.ts` | **PASS 14/14** (baseline, and again after each of 9 mutations). |
| 6 suites this change reaches — `index`, `queue-consumer`, `channel-factory`, `sqlite-queue`, `channel`, `core/session` | **PASS — 105 passed, 1 skipped.** |
| Fence check (`git diff --stat` vs the dossier) | **PASS** — code changes confined to `index.ts` + `index.test.ts`, exactly the fence ruling 3 widened to. No stray untracked artifacts from any mutation run. |

---

## Dimension roll-up

| Dim | Verdict | Note |
|---|---|---|
| 0 · Tests guard behaviour | **FAIL** | 6 of 9 RED. Three contract-named sites stay green; two of them (F1, F2) have real failure modes. |
| 1 · Fence | **PASS** | `index.ts` + `index.test.ts` only, matching ruling 3. |
| 2 · Contract | **PASS** | Every line in the packet's contract holds *in code*; three lack witnesses (Dim-0's problem, not Dim-2's). |
| 3 · Dossier fidelity | **PARTIAL** | T001(d) ("reload disposes the consumer") and Prior-Context E ("mirror the rejecting-fake shape") were specified and not delivered — which is precisely what F2 and F1 are. |
| 4 · Types/lint | **PASS** | `tsc --noEmit` clean. No `any` introduced; the `CapturedTool` interface in the test is properly typed rather than cast. |
| 5 · Docs/config | **PASS** | No doc change needed; the backend semantics were documented in Phase 1. |
| 6 · Domain-currency | **PASS** | The sqlite branch reuses Phase 1's consumer wholesale rather than re-implementing a poll loop, and leaves the fs block verbatim. |
| 7 · Progress log | **PASS (with finding 5)** | `execution.log.md` has RED→GREEN per task, a gate table separating in-fence PASS from out-of-fence known-red, and a Discoveries table. Two stale pre-rebase shas in headers. The coder report is honestly marked `PARTIAL`. |
| 8 · Regression | **PASS** | 105/105 on the reachable suites; typecheck clean. Out-of-fence reds accepted as pre-existing, **not re-run** (stated above). |
| 9 · Prompt-follow | **PASS** | No `sqlite-queue.ts` write-side change, no live restart, pathspec commit. |
| 10 · Learning | **PASS** | The Discoveries table captures the handle-leak realisation and the fs-pin reasoning — both are the non-obvious parts. |

---

## Why `FIX_REQUIRED`, and where I used judgement

**Both blocking items are missing tests, not bugs.** I read the implementation as correct on every
line, and I want that on the record so the fix stays small: two tests, no source change.

**Why they are blocking anyway.** Because in flow-pair the worker writes both the implementation and
its tests, so a green suite is not an independent quality signal — and here that is not hypothetical.
The two behaviours are *exactly* the ones the dossier told the coder to test (T001(d), Prior-Context E)
and *exactly* the ones nobody tested. F1's failure mode is the plan's central invariant inverted: a
message acked but never delivered. F2's is the documented inner development loop leaking a handle and
an orphan poller on every `/reload`.

**And because this is the second time in this plan.** Phase 1's blocking finding was the same shape —
a contract-named site the mandated mutations structurally could not reach. The packet told me to apply
that lesson; applying it is what produced M2b, M6 and M8, **none of which the mandated four would have
found**. If the mandated set is ever trimmed back to "the obvious three", this class of defect goes
straight through.

**Where I used judgement, so you can overrule it.** A strict reading of Dim-0 — *any* stay-green is
`FIX_REQUIRED` — would make **finding 4 (M6, the unclosed `pij_send` handle) blocking too**, since it
is named in your contract line. I did not promote it, for two stated reasons: the consequence class is
bounded resource growth rather than data loss, and I could not identify a cheap deterministic witness
(`SqliteQueue` exposes no `db.open`, so proving a close requires a new test seam — a bigger change than
the fix it guards). **That is a judgement call, not a rule**, and the honest position is that F1/F2 vs
finding 4 differ in consequence and testability, not in kind. Promote it if you disagree.

**Findings 3, 5 and 6 need no action before merge**: 3 is a real weak test whose fix is folded into F1's
sibling (mirror the fs `markerStateDuringInbound` pattern), 5 is a two-line sha correction in two
headers, 6 is an observation I explicitly did not close out.

**On merge**, this is an `APPROVE_WITH_NOTES` the moment M2b and M8 go RED. Both acceptance commands
are pasted above verbatim; I will re-run them myself, because a coder-reported RED is not independent
evidence — which is the entire reason these two findings exist.

---

*Reviewed by `pij-pale-araminta` · 2026-08-27T19:55+10:00 · wire discipline C10.*
*Terminal — Dim-0 pass closed at 9 mutations; no pass open against `236dec9`.*
