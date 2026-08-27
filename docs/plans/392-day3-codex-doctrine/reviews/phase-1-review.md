# Cold review — Phase 1 (3b) · flow-pair dlg-0001

**Verdict**: `FIX_REQUIRED` — **one** narrowly-scoped blocking item (finding 7). Everything else is approve-grade.

> **Revision note.** My first pass reported `APPROVE_WITH_NOTES` after the three packet-mandated
> mutations. The orchestrator then cleared a second mutation pass. That pass found that the **second
> half of the declared receipt fix — `daemonReceiptAuthoritative` — is guarded by no test at all**
> (mutation 6 STAYED GREEN), and that this diff *removed* the fixtures that would have caught it.
> That is a mandatory Dim-0 `FIX_REQUIRED` under the rubric. It also **falsifies a claim I made in my
> first pass** — see the correction under finding 7. Superseded verdict: `APPROVE_WITH_NOTES`.

> **TERMINAL REPORT — no pass is open.** Per the orchestrator's standing rule (2026-08-27), a review
> report is terminal: **no mutations are run after it is reported.** The Dim-0 pass for this review is
> **CLOSED at 8 mutations** (table below); nothing further is pending against the reviewed sha
> `3501f855`. The one revision above happened only because the orchestrator explicitly re-opened the
> pass *before* the rule existed, and it is the last such revision to this file. The fix for finding 7
> (**FX001**) will be re-reviewed as a **new** review against a **new** sha, in a **separate** verdict
> file — not by amending this one. Read this document as final for `3501f855`.

**Reviewed sha**: `3501f8558276ade4e10e40a42e3ffd1d5e56816b` (HEAD) over `69f1c4524c39340ff63c26ba498fd489ca3faeec`, range `2953d7599b3b8a498295f9e07b766a4fff49edc9..3501f855`
**Reviewer**: `pij-pale-araminta` — GitHub Copilot CLI 1.0.81-14, claude-opus-5 @ xhigh. Cold: I did not see the coder's session.
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (verified `pwd` == `git rev-parse --show-toplevel`; never touched `~/GitHub/pij` except to READ the rubric).
**Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md`

---

## Scaffolding and limits of this review — read first

**Scaffolding I used.** The Dim-0 gate physically mutates tracked source. Across two passes I ran
`just flow-pair-mutate` (which backs up, mutates, asserts RED, `cp`-restores, asserts GREEN) seven
times, plus one manual mutation of my own with a `/tmp` backup and an explicit `cp` restore — **8
mutations total**. After every one I verified `git diff` shows the four mutated files
(`telegram/bridge.ts`, `adapters/queue-consumer.ts`, `core/cli.ts`, `telegram/index.ts`)
byte-identical to HEAD, **including on mutation 6's stay-green failure path**, where the script's
`trap` — not its success path — did the restore.

**A material environmental hazard, reported to the orchestrator at the time (not a defect in this diff).**
`pij-gunboat-diplomat` is `working`/`active` in **this same worktree** and was writing to it while I
reviewed. At my first `git status --porcelain` there were **zero** modified tracked files; by the end
there were two — `.pi/extensions/pij/index.test.ts` (+148/−2, mtime 19:27:36) and
`.pi/extensions/pij/index.ts` (+146/−61) — hand-authored Phase 2 (`AC-08`) SqliteQueue receiver work.
**Neither is in the reviewed range and neither is mine.** Consequence I cannot rule out: between 19:25
and 19:28 I held a whole-file backup/restore window over `telegram/bridge.ts`, `adapters/queue-consumer.ts`
and `core/cli.ts`. All three are now byte-identical to HEAD, and **I cannot distinguish "gunboat never
edited them" from "my restore silently clobbered an edit."** The orchestrator has been asked to have
gunboat re-check those three files.

> **Resolution (orchestrator, 2026-08-27).** Cleared. The coder's `dlg-0002` fence is **only**
> `index.ts` + `index.test.ts` — **disjoint** from the three files I held a restore window over, so no
> edit of the coder's could have been inside it. The coder has been told to stay off those three and
> to re-run before believing a red outside its fence. Logged as an incident. **The hazard was real but
> did not fire**; I am leaving the account above intact rather than deleting it, because the window
> existed and the next reviewer in a shared worktree should expect it.

**What this contaminates: nothing in my verdict.** None of the six suites I ran load `index.test.ts` or
`index.ts`, and `just typecheck` was GREEN *with* gunboat's in-flight edits present.

**What I did NOT check, stated plainly so it cannot be mistaken for a clean result:**

| Not examined | Why |
|---|---|
| `AC-07` live proof (bridge restart, row 290 → phone, row-149 retirement) | Out of scope by construction — it is the o-prime's baton and requires touching the live daemon/queue, which the packet forbids me. **Unverified, not clean.** |
| Repo-wide `just lint`, `just pij-skill-check`, `just smoke`, `harness checks` | Declared pre-existing red in the packet. I did **not** re-run them, so I did not independently confirm the pre-existing claim; I accepted the packet's list. The diff touches no `skills/` file, which I did confirm. |
| `harness/scripts/release-age-policy.test.ts` | Needs `pwsh`, absent on this Mac. Not run. |
| Full `npx vitest run .pi/extensions/pij/` (all 171 files) | Deliberately **not** run: `index.test.ts` was being rewritten under me by a concurrent writer, so a red there would have been unattributable. I ran the six suites the diff actually touches instead. |
| Behaviour under `PIJ_QUEUE_BACKEND=dual` at runtime | Reasoned from code only (see finding 6); no test exercises the forwarder on a `DualWriteChannel`. |

---

## Findings

| # | Severity | File:line | Claim | Evidence | Fix |
|---|----------|-----------|-------|----------|-----|
| 1 | **low** (Dim-0) | `.pi/extensions/pij/telegram/bridge.test.ts:1092,1120` | The test named *"forwards once and acks only after the Telegram send resolves"* does **not** guard the ordering its name asserts. | I mutated `queue-consumer.ts:40` `await deps.onMessage(row)` → `void deps.onMessage(row)`, which removes ack-after-handler ordering outright. Exactly 2 tests went RED — **and this was not one of them.** Cause: the assertion is `expect(ack?.at).toBeGreaterThanOrEqual(sendResolvedAt)`, but the fake `send` sets `now = 2_000` **synchronously**, before its first suspension point, so the clock has already advanced by the time the un-awaited ack runs. A `>=` against a clock the fake advances synchronously is not an ordering assertion. | Replace the timestamp compare with an explicit order log — push `"send"` in the fake and `"ack"` from a `now` that is only read by `claimUnread`, then assert `order === ["send","ack"]`. **Not `FIX_REQUIRED`:** the behaviour *is* guarded — see Dim-0 block, mutation 2 and the two tests that did go RED. |
| 2 | **low** (Dim-1) | `.pi/extensions/pij/adapters/channel-factory.test.ts` (+22) | Out of the dossier's declared fence. The Pre-Implementation table lists `channel-factory.ts` as `(optional)` under T005 but never lists **its test**, and the recorded scope ruling covers only the four `fs-registry.overlay.test.ts` pane fixtures. | `tasks.md` § Pre-Implementation Check + § Scope ruling in `execution.log.md`; `git diff --stat`. | Additive test-only coverage of an explicitly-allowed source change, and exactly what Dim-0 wants. Recommend the orchestrator record it the way the overlay widening was recorded, so the fence and the diff agree. |
| 3 | **info** (Dim-3) | `.pi/extensions/pij/telegram/bridge.ts:678-681` | A deviation from `tasks.md` that is **correct, and better than the dossier text** — flagging it so it is not later "fixed" back. | Dossier T004 literally specifies the fs branch as `channel.watch(TELEGRAM_PEER_ID, (dm) => void forwardOne(dm), deps.seen)`. That would have **dropped** the pre-existing send serialization and let chunk parts of one reply interleave with the next — an AC-05 regression. The coder kept a `chain = chain.then(...)` promise instead. | None. Keep as-is; consider amending the dossier so a future re-run doesn't follow the literal text. |
| 4 | **info** (fs parity, exact wording) | `.pi/extensions/pij/telegram/bridge.ts:562-565` vs `679-681` | fs is behaviourally unchanged but **not literally "byte-for-byte"**, as the packet phrased it. | The `skip receipt` early return used to execute **synchronously in the watch callback**, before anything was appended to the serialization chain. It now lives inside `forwardOne`, i.e. inside the chain. The interleaving of that one **log line** relative to in-flight forwards can therefore differ. No send, no watermark, no delivery consequence — `seen` is still passed only on the fs branch (`telegram/index.ts:223`). | None required. Worth knowing if anyone diffs bridge logs across the cutover. |
| 5 | **info / medium** (operational, not a diff defect) | `.pi/extensions/pij/adapters/queue-consumer.ts:47-53` | Retry liveness depends on a **running daemon**. The bridge's consumer leaves a rejected row `claimed` and never calls `recoverStaleClaims`/`resetClaimsOnStart` itself. | `queue-consumer.ts` catches, logs, `break`s. The only re-queue owners are `SqliteQueue.recoverStaleClaims` / `resetClaimsOnStart` (`sqlite-queue.ts:380,394`), both daemon-driven. If the bridge runs while the daemon is down, a failed text send stays `claimed` **indefinitely**. | **Fails safe** — undelivered but correctly *not* acked, so the "never lost-but-acked" invariant holds. It is documented (`docs/how/pij-telegram.md`: "the daemon lease sweep re-queues it"). **Action for AC-07:** the o-prime should confirm the daemon is up before the live proof, or the retry leg simply will not fire. |
| 6 | **info** | `.pi/extensions/pij/adapters/channel-factory.ts:102-106` + `docs/how/pij-telegram.md` | Under `PIJ_QUEUE_BACKEND=dual`, `sqliteOf` returns the sqlite half, so the bridge consumes **only** sqlite and the mirrored `msg-*.json` files for `pij-telegram` are never marked read. A later rollback to `fs` would replay them. | `sqliteOf(DualWriteChannel) → channel.sqlite`; `bridge.ts:659` takes the sqlite branch. | Consistent with the documented "fs files are left in place (rollback-safe)" design, but the how-doc's fs opt-out paragraph does not say it. One sentence in the doc would close it. |

**No finding at `critical`. Finding 7 below is the single `FIX_REQUIRED` item.**

### Finding 7 — **medium, BLOCKING** · `.pi/extensions/pij/core/cli.ts:691-696`

**Claim.** `daemonReceiptAuthoritative` — the second of the two sites the packet names as "the receipt
fix" — is **guarded by no test whatsoever**, and this diff *removed* the fixtures that would have
guarded it.

**Evidence (empirical, not reasoned).** Mutation 3 only reverted the `classifySendReceipt` site; the two
sites are **different expressions** (`effectiveDeliveryMode(descriptor) === "pull"` vs
`effectiveDeliveryMode(target) !== "pull"`), so that sed never touched this one. Reverting *this* site
on its own:

```
$ just flow-pair-mutate .pi/extensions/pij/core/cli.ts \
    's/effectiveDeliveryMode\(target\) !== "pull"/target.deliveryMode !== "pull"/' \
    'npx vitest run .pi/extensions/pij/core/cli.test.ts'
→ mutated .pi/extensions/pij/core/cli.ts; running suite (expect RED)…
✗ FAIL: tests STAYED GREEN under mutation — the suite does not guard this behaviour.
```

462/462 still passed with the fix reverted.

**It is not a no-op — it is observable on three surfaces.** `daemonReceiptAuthoritative` has four call
sites, and three of them compute tick status **independently of** the early `pull` return in
`classifySendReceipt`, so the guard cannot shadow them:

| site | surface | pane-less claude/copilot/codex descriptor |
|---|---|---|
| `cli.ts:2230` | inside `classifySendReceipt` | no change — the `pull` early return at `:2225` already fired |
| `cli.ts:2245` | `sendSuccess` receipt | **changed** — daemon tick fields now suppressed |
| `cli.ts:3344` | the plain `pij send` path | **changed** — same, and the comment right above it says this duplicate ternary is exactly how a previous fix got half-applied |
| `cli.ts:3630` | `pij state <id>` | **changed** when `lastTickAt` is undefined: `daemonTickStatus(undefined, now)` → `null` |

**Correction to my own first pass.** I previously wrote that the fixture widenings could not have masked
anything because *"no assertion was changed or deleted — only fixtures were widened, so a masked
regression would have required an assertion edit; there is none."* **That reasoning was wrong, and this
mutation is the counterexample.** Widening a fixture does not need an assertion edit to destroy
coverage — it moves the fixture *out of the cell under test*, and the assertion then passes vacuously.
Concretely, `cli.test.ts:1276, 1299, 1323, 1345` are the *"busy control-plane peers with a fresh tick wait
for the daemon's authoritative receipt"* family: they were **pane-less claude/copilot descriptors that
asserted tick status**, i.e. precisely the witnesses for this behaviour. Each gained `paneId:"%9"`. The
widenings are individually defensible (they do model daemon-owned seats), but their combined effect is
that the pane-less-control-plane cell went from covered to **uncovered**, in the same commit that changed
what that cell does.

**Fix (one test, ~15 lines).** In `cli.test.ts`, alongside the new AC-06 test, add a descriptor
`{ harness: "claude", lifecycle: "bound", paneId: undefined, deliveryMode: undefined, lastTickAt: <fresh> }`
and assert both halves:

- `receipt: "queued", reason: "pull-inbox"` (this is what makes it hit the *other* branch than the
  existing `harness:"pi"` case — `harness:"pi"` is excluded by the harness gate, so it can never
  exercise `daemonReceiptAuthoritative` at all); **and**
- a **negative** assertion that the daemon tick fields are **absent** from the JSON — that is the
  assertion that flips, and it is what mutation 6 needs in order to go RED.

Re-run mutation 6 and require RED. **This is the whole of the blocking ask.**

---

## Contract verification (the packet's specific asks)

Each answered from the code, independently re-derived — not from the coder's report.

- **Ack strictly after `forwardOne` resolves.** ✅ `queue-consumer.ts:40-45` — `claimUnread` is the statement *after* `await deps.onMessage(row)`, inside the same `try`. Proven by mutation 2.
- **No path acks a text row before its send resolved.** ✅ The only rows acked without a send are `kind:"receipt"`, which is the contract (AC-02) and is asserted by `expect(send).not.toHaveBeenCalled()` (`bridge.test.ts:1136`). A failing `claimUnread` is also caught and `break`s, so a failed ack cannot be mistaken for success (`queue-consumer.ts:46`).
- **A rejected send on bubble 2 of 2 leaves the row `claimed`, with no `released`/`acked` receipt.** ✅ `bridge.test.ts:1294` *"does not ack when a later text bubble is undelivered"* — a 5 000-char body chunks to 2 bubbles, `send` throws on `attempts === 2`, then it asserts `state === "claimed"` **and** the **negative/state** assertion `expect(receipts.some(r => r.state === "acked")).toBe(false)`. The `released` half is asserted at `bridge.test.ts:1249` and `queue-consumer.test.ts:154`: `expect(receipts.some(r => r.state === "released")).toBe(false)`.
- **`failed`/`acked`/`parked` rows never forwarded.** ✅ Three independent ways:
  1. **Structural** — `SqliteQueue.claim` selects `WHERE d.state = 'queued'` only (`sqlite-queue.ts:335-338`). Those states are unreachable by construction.
  2. `queue-consumer.test.ts:158` — pre-seeds `acked` + raw-`UPDATE`'d `failed` + swept-to-`parked` rows, then asserts `handled` **deep-equals exactly** `["queued-a","queued-b"]` and the final state map is `[[1,"acked"],[2,"failed"],[3,"parked"],[4,"acked"],[5,"acked"]]`. Deep-equality on an exact array is a bounded (negative) assertion, not a truthiness check.
  3. `bridge.test.ts:1153` — same shape end-to-end through the production forwarder: `sent` deep-equals exactly the two queued bodies, `failed` stays `failed`, and a **second** `startForwarder` on the same db sends nothing after 600 ms.
- **fs branch (`PIJ_QUEUE_BACKEND=fs`) unchanged.** ✅ 81 `bridge.test.ts` tests and the fs `startBridge` wiring test are green untouched; `index.test.ts` proves the opt-out selects `FsChannel` and the default selects `SqliteQueue`. Caveat 4 above is the only literal divergence.
- **No write-side change to `adapters/sqlite-queue.ts`.** ✅ The file is absent from the diff entirely.
- **`OpenChannelOptions.fsWatchOpts` is additive and the sqlite branch ignores it.** ✅ `openChannel(pijHome, env, options = {})` — third parameter, defaulted. The `sqlite` branch is `return new SqliteQueue(pijHome)` and never reads `options`; only the `fs` branch and the fs half of `dual` consume `options.fsWatchOpts` (`channel-factory.ts:134-146`). Guarded by `channel-factory.test.ts` with a `watchFactory` spy asserting `watchFactoryCalls === 1`.
- **The receipt fix is semantically right, not just green.** ✅ I verified the premise independently: `daemon/loop.ts:228-229` is `const paneId = descriptor.paneId; if (!paneId) return { kind: "waiting" };` — **the daemon cannot inject without a pane.** So `daemonReceiptAuthoritative` claiming authority over a pane-less seat was the bug, and `effectiveDeliveryMode` (pre-existing, plan 093 T002, already used by `pij inbox` and `targetRendersAttachments`) makes `classifySendReceipt` *consistent with* an established derivation rather than inventing a new one.
- **Scope of the fixture widening.** ✅ for *scope*, ⚠️ for *coverage*. `fs-registry.overlay.test.ts` changes are `paneId:"%1"` + the ruled comment at exactly lines **166, 181, 197, 550** — the approved four, nothing else. The ~12 `cli.test.ts` widenings are **in**-fence (T006 lists that file). No assertion was changed or deleted in either file. **But see finding 7: "no assertion was edited" does NOT establish "no coverage was lost."** Widening a fixture silently moves it out of the cell under test, and mutation 6 proves that is exactly what happened to the pane-less-control-plane cell.

---

## Dim-0 mutation evidence (MANDATORY gate)

**8 mutations run: 7 RED→GREEN, 1 STAYED GREEN.** Every mutation restored byte-identical (the script's
`trap` restores even on the stay-green failure path — re-verified: `git diff` on
`.pi/extensions/pij/{telegram,adapters}/`, `core/cli.ts` returns **0** files).

| # | Target | Behaviour | Result |
|---|---|---|---|
| 1 | `bridge.ts` `undeliveredText > 0` → `false` | lost-message guard (AC-04) | **RED (2)** ✓ |
| 2 | `queue-consumer.ts` skip `claimUnread` | ack-after-success | **RED (3)** ✓ |
| 3 | `cli.ts` `classifySendReceipt` pull check | AC-06 receipt | **RED (5)** ✓ |
| 4 | `queue-consumer.ts` `await` → `void` (mine) | ack *ordering* | **RED (2)** ✓ |
| 5 | `bridge.ts` `dm.kind === "receipt"` → `false` (mine) | receipts never forwarded (AC-02) | **RED (2)** ✓ |
| 6 | `cli.ts` `daemonReceiptAuthoritative` pull check (mine) | 2nd half of the receipt fix | **STAYED GREEN ✗ → finding 7** |
| 7 | `bridge.ts` `sqlite !== undefined` → `false` (mine) | sqlite branch selection | **RED (6)** ✓ |
| 8 | `telegram/index.ts` `sqliteOf(...) === undefined` → `false` (mine) | fs `seen` watermark still wired (AC-05) | **RED (1)** ✓ |

Mutations 1–3 are the packet's mandated set; 4–8 are mine, added because the mandated three leave the
ordering claim, AC-02, the branch selection, the fs watermark, and — decisively — the
`daemonReceiptAuthoritative` half of the receipt fix unproven.

**This pass is CLOSED.** No further mutation will be run against `3501f855` under this report. The
re-run that FX001 must satisfy — mutation 6, which must go **RED** — belongs to the *next* review, of
the *fix* sha, and its evidence goes in that review's file:

```bash
just flow-pair-mutate .pi/extensions/pij/core/cli.ts \
  's/effectiveDeliveryMode\(target\) !== "pull"/target.deliveryMode !== "pull"/' \
  'npx vitest run .pi/extensions/pij/core/cli.test.ts'
```

### Mutation 1 — lost-message guard (AC-04) · **RED → GREEN ✓**

```
$ just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/undeliveredText > 0/false/' \
    'npx vitest run .pi/extensions/pij/telegram/bridge.test.ts'
→ suite: npx vitest run .pi/extensions/pij/telegram/bridge.test.ts
→ mutated .pi/extensions/pij/telegram/bridge.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

Neutering `bridge.ts:666` so the handler never throws `ForwardIncomplete` takes **2** tests RED. The
guard is real.

### Mutation 2 — ack-after-success (skip `claimUnread` after the handler) · **RED → GREEN ✓**

```
$ just flow-pair-mutate .pi/extensions/pij/adapters/queue-consumer.ts \
    's/await deps\.onMessage\(row\);/await deps.onMessage(row); continue;/' \
    'npx vitest run .pi/extensions/pij/adapters/queue-consumer.test.ts'
→ mutated .pi/extensions/pij/adapters/queue-consumer.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

`continue` skips the `claimUnread` ack while leaving the loop well-formed (no crash, no infinite loop —
each `claim` consumes a distinct row). **3** tests RED.

### Mutation 3 — pull-inbox receipt classifier (AC-06) · **RED → GREEN ✓**

```
$ just flow-pair-mutate .pi/extensions/pij/core/cli.ts \
    's/effectiveDeliveryMode\(descriptor\) === "pull"/descriptor.deliveryMode === "pull"/' \
    'npx vitest run .pi/extensions/pij/core/cli.test.ts'
→ mutated .pi/extensions/pij/core/cli.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

Reverting to the old `descriptor.deliveryMode === "pull"` takes **5** tests RED — so the fixture
widenings did **not** neuter the suite; the new behaviour is genuinely load-bearing.

### Mutation 4 (mine, beyond the packet) — the *ordering* claim · **RED, with a caveat**

The three mandated mutations prove the ack *happens* and *is conditional*. None of them isolates
"the ack happens **after** the send **resolves**", so I added one. Manual (backup `/tmp/qc.bak`, restore
+ `git diff` verified byte-identical):

```
$ sed -E -i '' 's/await deps\.onMessage\(row\);/void deps.onMessage(row);/' \
    .pi/extensions/pij/adapters/queue-consumer.ts
$ npx vitest run .pi/extensions/pij/telegram/bridge.test.ts ; echo "exit=$?"
exit=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  bridge.test.ts > startForwarder over SqliteQueue (sqlite default) > leaves failed text claimed and redelivers it after lease recovery
 FAIL  bridge.test.ts > startForwarder over SqliteQueue (sqlite default) > does not ack when a later text bubble is undelivered
```

**RED ⇒ the ordering is guarded.** The caveat is finding 1: the test whose *name* claims the ordering
("forwards once and acks only after the Telegram send resolves") **stayed green**. The two tests that
actually hold the line are the two named above. Restore verified: `git diff` shows `queue-consumer.ts`
identical to HEAD and `await deps.onMessage(row);` back at line 40.

### Mutations 5, 7, 8 (mine) — AC-02, branch selection, fs watermark · all **RED → GREEN ✓**

```
$ just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/dm\.kind === "receipt"/false/' \
    'npx vitest run .pi/extensions/pij/telegram/bridge.test.ts'
✓ suite went RED under mutation:  ⎯⎯⎯ Failed Tests 2 ⎯⎯⎯
✓ GREEN after restore:  ✓ mutation smoke PASSED — the suite guards this behaviour.

$ just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/sqlite !== undefined/false/' \
    'npx vitest run .pi/extensions/pij/telegram/bridge.test.ts'
✓ suite went RED under mutation:  ⎯⎯⎯ Failed Tests 6 ⎯⎯⎯
✓ GREEN after restore:  ✓ mutation smoke PASSED — the suite guards this behaviour.

$ just flow-pair-mutate .pi/extensions/pij/telegram/index.ts \
    's/sqliteOf\(rt\.channel\) === undefined/false/' \
    'npx vitest run .pi/extensions/pij/telegram/index.test.ts'
✓ suite went RED under mutation:  ⎯⎯⎯ Failed Tests 1 ⎯⎯⎯
✓ GREEN after restore:  ✓ mutation smoke PASSED — the suite guards this behaviour.
```

Mutation 8 is the one that turns the packet's fs-parity question from an assertion into evidence: strip
the `seen` boot watermark from the fs branch and a test does go RED, so the fs opt-out's watermark is
genuinely still wired.

### Mutation 6 — `daemonReceiptAuthoritative` · **STAYED GREEN ✗**

Full evidence, call-site analysis and the required fix are in **finding 7** above. This is the blocking
item.

### Weak-test red-flag sweep (rubric Dim-0 list)

| Red flag | Present? |
|---|---|
| asserts only `ok === true` / truthiness | **No** — `toEqual` on exact arrays and exact state maps throughout. |
| never exercises the failure branch | **No** — rejecting `send`, rejecting `sendMedia`, pre-seeded `failed`/`parked`, dispose-then-deliver. |
| no negative or state assertions | **No** — `some(r => r.state === "released") === false`, `some(... "acked") === false`, `expect(send).not.toHaveBeenCalled()`, `expect(handled).toEqual([])`. |
| failure path is pure fake-fs, no real counterpart | **No** — every sqlite test drives a **real** `SqliteQueue` on a real `mkdtempSync` temp home, including a raw `DatabaseSync` `UPDATE` to forge the `failed` state. |
| lenient `OR` regexes doing load-bearing work | **No** — no regex assertions in the new tests. |
| test count rose but all new tests are happy-path | **No** — 5 of the 6 new bridge-sqlite tests and 3 of the 5 consumer tests are failure/negative paths. |
| asserted value not independently re-derived | **Mostly no** — I re-derived the receipt-state sequences from `SqliteQueue.ack`/`claim`/`settle`/`recoverStaleClaims`, and the pane premise from `daemon/loop.ts:229`. The one exception is finding 1. |

---

## Gates I re-ran myself

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS**, exit 0 — and notably still green *with* the concurrent writer's in-flight `index.ts`/`index.test.ts` edits in the tree. |
| The six suites the diff touches | `npx vitest run bridge.test.ts telegram/index.test.ts queue-consumer.test.ts channel-factory.test.ts fs-registry.overlay.test.ts core/cli.test.ts` | **PASS** — `Test Files 6 passed (6)`, `Tests 618 passed \| 2 skipped (620)`, 6.53s. The 2 skips are the pre-existing quarantined flaky (`derives stable main/non-main repository prefixes…`, Jordan ruling 2026-07-21) and one in `bridge.test.ts`. |
| Mutation gate | `just flow-pair-mutate` ×7 + 1 manual | **7 RED→GREEN, 1 STAYED GREEN** (mutation 6 → finding 7, blocking). |
| Tree integrity after mutations | `git diff` on the three mutated files | **Byte-identical to HEAD.** |
| Working-tree cleanliness | `git status --porcelain` | Two modified tracked files, **both from a concurrent writer, neither in the reviewed range** — see the scaffolding section. |

Not re-run, per the packet's known-pre-existing-red list and the limits table above: repo-wide
`just lint`, `just pij-skill-check`, `just smoke`, `harness checks`, `release-age-policy.test.ts`.

---

## Dimension roll-up

| Dim | Verdict | Note |
|---|---|---|
| 0 · Test quality | **FAIL** | 7 of 8 mutations RED→GREEN, but mutation 6 stayed green: the `daemonReceiptAuthoritative` half of the receipt fix is unguarded (finding 7). Rubric: unproven test quality on a load-bearing behavioural claim is a mandatory `FIX_REQUIRED`. Finding 1 (weak ordering test) is a secondary note. |
| 1 · Scope | **PASS with note** | Overlay widening is exactly the 4 approved lines, `paneId` only. `channel-factory.test.ts` is the one file outside the declared fence (finding 2, additive test-only). Coverage lost by widening is tracked under Dim-0, not here — the widenings themselves are in-scope. |
| 2 · Contract | **PASS** | `startForwarder(FsChannel→MessageChannel)` and `BridgeRuntime.channel` are widenings; `openChannel`'s third arg is optional+defaulted; `runtimeFor` newly exported for test. No descriptor/schema change. |
| 3 · Plan-alignment | **PASS** | T001–T008 all delivered. One deliberate, correct deviation from the dossier's literal fs snippet (finding 3). |
| 4 · Acceptance criteria | **PASS** | AC-01…AC-06 each exercised with a load-bearing assertion (mapped above). AC-07 is the o-prime's live baton — **not verified by me**. |
| 5 · Tests (doc/config) | **PASS** | `docs/how/pij-telegram.md` § "Queue backend & restart semantics" is accurate to the code and every command in it is copy-paste valid. |
| 6 · Domain-currency | **PASS** | The new at-least-once contract, the **W1/W2 duplicate windows**, the state-as-watermark rule and the `PIJ_QUEUE_BACKEND=fs` opt-out are all documented. Naming the duplicate windows rather than claiming exactly-once is the honest call. |
| 7 · Progress log | **PASS** | `execution.log.md` has per-task RED→GREEN, an 11-row gate table separating in-fence PASS from out-of-fence known-red, and the scope ruling. |
| 8 · Regression | **PASS** | 618/618 green on every touched suite; typecheck clean. Pre-existing reds not attributable to this diff and not re-run (stated). |
| 9 · Prompt-follow | **PASS** | Did not touch `sqlite-queue.ts` write-side, did not restart the live daemon/bridge, did not write the live queue, pathspec-committed. |
| 10 · Learning | **PASS** | The W1/W2 windows, the "delivery state is the only watermark" framing, and the media-failure-counts-as-handled trade-off are all captured. |

---

## Why `FIX_REQUIRED`, and why only just

**The blocking item is one missing test, not a bug.** I believe the `daemonReceiptAuthoritative` change
is *correct* — it rests on the same `daemon/loop.ts:229` argument that makes the `classifySendReceipt`
half correct. What is missing is any evidence, and under this rubric that distinction is the whole
point: *"in flow-pair the worker writes both the implementation and its tests, so a green suite is not an
independent quality signal."* Mutation 6 reverts a behaviour that changes three user-visible surfaces
and 462/462 tests keep passing. That is the exact condition the rubric declares a mandatory
`FIX_REQUIRED`, and I am not going to argue my way around it on the grounds that I personally read the
code as right — the reviewer reading it as right is what the mutation gate exists to distrust.

**Two things make it more than a formality.** First, the unguarded site is *named in the packet's own
contract line* ("Receipt fix: `classifySendReceipt` **+ `daemonReceiptAuthoritative`** on
`effectiveDeliveryMode`") — it is half of the stated deliverable, not an incidental line. Second, the
coverage was not merely absent, it was **removed by this same diff**: the four `cli.test.ts` fixtures that
previously exercised pane-less control-plane seats each gained a `paneId`. A future reader diffing this
commit would see coverage go up (+83 lines in `cli.test.ts`) while the cell that actually changed went
dark.

**Everything else is approve-grade, and I want that on the record so the fix stays small.** The
at-least-once contract holds by construction *and* by test; the never-lost-but-acked invariant is proven
from two directions; fs parity survives a watermark mutation; the receipt classification a user actually
sees is guarded by 5 RED tests; typecheck and all 618 tests in the touched suites are green. Add the one
test in finding 7 (**FX001**), re-run mutation 6, see RED — and the *next* review, of the fix sha, is an
`APPROVE_WITH_NOTES` carrying findings 1–6 as notes. That verdict will be issued as a **new file**; this
one stays as the final word on `3501f855`.

**Findings 2–6 are not blocking** and need no action before merge: 2 is a fence-recording tidy-up, 3 and
4 are recorded so a later reader does not "correct" correct code back, 5 is an operational precondition
for *your* AC-07 live proof (**confirm the daemon is running, or the retry leg cannot fire**), and 6 is a
one-sentence doc gap.

---

*Reviewed by `pij-pale-araminta` · 2026-08-27T19:30+10:00 · wire discipline C10.*
*Terminal as of 2026-08-27T19:45+10:00 — Dim-0 pass closed at 8 mutations; no pass open against `3501f855`.*
