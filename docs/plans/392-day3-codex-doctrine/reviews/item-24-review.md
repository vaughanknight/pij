# Item 24 — COLD review: bridge idempotent parts + spec §14

> **TERMINAL REPORT.** This pass is **CLOSED**. No mutations were run after this
> file was written; every mutated file was restored and sha-verified pristine
> before the report was produced. No further pass is open on my side.

**Reviewer**: `pij-wilful-morton` (cold)
**Candidate**: `a27ab584b7ae15f351e3c5099cb1b4014c598971`
**Reviewed as**: `5796d18ca919bded4f5f43492f9e55debdf6bf98` (cherry-pick onto fresh `origin/main`)
**Packet**: `reviews/item-24-review-packet.md`

---

## VERDICT: ✅ APPROVE

The headline defect is genuinely fixed and the fix is genuinely sensored. All
three mandated mutations went RED on the intended assertions and GREEN on
restore, sha-verified. Migration safety, per-part commit timing, retry bounding
and no-collateral all hold — each proven by execution, not by reading.

**Two advisories qualify the packet's residual claim and should be read before
this is treated as "the dup is closed":**

- **ADV-1 (medium, NEW failure mode)** — the idempotency key is **positional**
  (`part_index`), but the partition that produces those positions is recomputed
  **live** from `deps.senderContext()`, a registry+git read that degrades to
  `undefined` on any git timeout. When the partition changes between attempts,
  redelivery can **skip parts that no longer exist**, leaving the message tail
  **undelivered while the row is marked `acked`**. Reproduced live, twice.
- **ADV-2 (low-medium)** — the new one-shot text retry duplicates a bubble on
  the operator's phone whenever the transient error is an **ack-loss**
  (`ETIMEDOUT` / `socket` / `502-504`), i.e. Telegram accepted but the response
  was lost. Reproduced live.

Neither is a regression *against the live pain*: before this change the same
corners produced a **full-message** duplicate. I am not blocking on them, but
the packet's stated residual ("accept-then-crash-before-commit only") is
**narrower than what the code actually does**, and ADV-1 trades a *noisy*
failure for a *system-silent* one. That trade deserves an explicit decision.

---

## 1. Scaffolding, and the limits of this review (stated first)

**Scaffolding built (all torn down — see §8):**

| tree | at | purpose |
|---|---|---|
| `/tmp/pij-i24` | `origin/main` + cherry-pick of `a27ab58` = `5796d18` | candidate |
| `/tmp/pij-i24-main` | `origin/main` (`031ccce`) | baseline |

Both with `node_modules` symlinked to `~/GitHub/pij/node_modules`.
Mutations were driven by `/tmp/i24-mut.py`, which **aborts** unless the fence is
git-clean, **aborts** unless the anchor appears exactly once, and **aborts** on a
no-op edit — so a mutation cannot silently fail to apply and report a false GREEN.

**Pristine sha256 (recorded before any mutation, re-verified after each):**

```
421671777d0dce01204e65522bb003db1e3d40c3c8fb18d7f7e074bd0a383f5a  telegram/bridge.ts
d94a344fc15ce571cfd86a44f5a927fa706e0eb45f0e0b5794f3562db3ffa62d  telegram/bridge.test.ts
359fe6ffecc8a78b476410978675c6a5d4fb92c5c89a77776a61d1aacc371d1f  adapters/sqlite-queue.ts
97a83d011a5cb13412397a8adaf18c986966fa3d77a41b8feed6eb56b6a23c07  adapters/sqlite-queue.test.ts
8a4ee5b87766e6f231dd9116adee674228bd69db69dde9e22e69a4e387270a46  docs/specs/claude-copilot-sqlite-sockets-comms.md
```

**What I did NOT examine — do not read these as clean:**

1. **No live Telegram API call.** Every `send`/`sendMedia` was a fake. I never
   observed a real duplicate on a real phone, and I never observed a real
   Telegram timeout. ADV-2 is proven against the *code's* retry logic with a
   fake that models ack-loss; the *frequency* of ack-loss in production is
   unmeasured by me.
2. **No live daemon / no live bridge.** `startForwarder` was driven directly.
3. **The fs (non-sqlite) backend was not executed.** I read it and reasoned
   about it (§5.1); I did not run a forward through `FsChannel`.
4. **The media/attachment path was not mutated.** I reasoned about its effect on
   part indexing (INFO-2) but did not build an attachment probe.
5. **The dossier** `tasks/item-24-telegram-bridge-dup/tasks.md` was not read.
6. **seq 3263 itself was not inspected.** I take "the dup on the operator's
   phone" from the packet; what I verified is that the *mechanism* described
   (redelivery re-sending already-sent chunks) exists on `main` and is removed here.
7. **Concurrency**: I did not test two forwarders racing on one message.

---

## 2. Branch shape — the drift hazard was live, and it touched the fence

The packet's "cherry-pick onto FRESH main (COORD-004)" was necessary, not
ceremonial:

```
origin/main                       = 031cccef34ac435372fcd4e5564c2e67c058fc56
git merge-base origin/main a27ab58 = 10483d8e22f923a3683de7bf285ea3b5ffa1b04a   ← NOT main
```

Main had advanced well past the candidate's base. Reviewing `origin/main..a27ab58`
two-dot would have shown ~80 unrelated files as phantom reversals.

**Main's drift overlaps one fence file**: `docs/specs/claude-copilot-sqlite-sockets-comms.md`
is modified both on main and by the candidate. The cherry-pick nonetheless applied
**clean** (no conflict) — the §14 insertion landed at a non-conflicting location.

**Fidelity proven by patch-id, not by `--stat`:**

```
a27ab58 : 3de850f729375b376f5bd747e13a1627e27d879c
5796d18 : 3de850f729375b376f5bd747e13a1627e27d879c   ← identical
```

Delta: 5 files, **+158 / −4**.

---

## 3. Dim-0 mutation ledger — 3/3 RED → restore → GREEN

**Baseline** (`bridge.test.ts` + `sqlite-queue.test.ts`): **102 passed | 1 skipped**, exit 0, 2.80 s.

**Line-claim accuracy: all three claimed lines are EXACT** (a change from earlier
packets in this stream, which had drifted line numbers):

| claim | line content at that line | exact? |
|---|---|---|
| `bridge.test.ts:1124` | `expect(logs.filter((line) => line.includes("forwarded"))).toEqual([` | ✅ |
| `bridge.test.ts:1159` | `expect(queue.summary({ to: TELEGRAM_PEER_ID })[0]?.state).toBe("acked");` | ✅ |
| `bridge.test.ts:1204` | `expect(sent.filter((text) => text.includes("(1/3)"))).toHaveLength(1);` | ✅ |

| mutation | edit | mutated sha256 | result | RED assertion |
|---|---|---|---|---|
| **MUT-IDEMPOTENT** | delete the `if (sentPartIndices.has(persistedIndex)) {…continue;}` skip block in `bridge.ts` | `6b1ccc641b3525ea0f20cff703f785012e5079f7cc9f98f414df988266e88b25` | **1 failed / 101 passed** | `bridge.test.ts:1204` — `expected [ …(2) ] to have a length of 1 but got 2` |
| **MUT-RETRY** | collapse the nested retry to a bare `await deps.send(bubble, replyTo);` | `35cd70849dd06f30174e0d1127c5901baf21f3a9284eeed517071ce9721e05bc` | **2 failed / 100 passed** | `acks after one transient retry…` — `expected 1 to be 2`; plus the redelivery test |
| **MUT-LOGID** | `forwarded ${dm.messageId} part …` → `forwarded part …` | `398b865a4a5f37f992295d350461f2fff2b6473d34ea881c0e80f338b4316215` | **1 failed / 101 passed** | `bridge.test.ts:1124` — `expected [ 'forwarded part 1/1' ] to deeply equal [ StringContaining{…} ]` |

After **every** mutation: restored sha = `421671777d0dce…` (**match**), `git diff
--name-only -- .pi/` **empty**, re-run **102 passed | 1 skipped exit 0**.

**MUT-IDEMPOTENT is the one that matters and it is not vacuous.** The failure
message is literally the seq-3263 symptom: with the skip removed, part `(1/3)`
is delivered **twice**. The test's `sent` array is cumulative across both passes,
so `toHaveLength(1)` is a true anti-duplication assertion, not a per-pass count.

---

## 4. What the change actually is

**`sqlite-queue.ts`** — additive side table inside the always-applied `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS telegram_sent_parts (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  part_index INTEGER NOT NULL CHECK(part_index >= 0),
  sent_at    INTEGER NOT NULL,
  PRIMARY KEY(message_id, part_index)
);
```

plus `telegramSentParts(messageId): ReadonlySet<number>` and
`markTelegramPartSent(messageId, partIndex)` (`INSERT OR IGNORE`, so re-marking
is a no-op).

**`bridge.ts`** — inside `sendText`, a per-message monotonic `nextTextPartIndex`
is assigned to **every** bubble (skipped ones included, which is what keeps the
positions aligned), an already-sent index is skipped, and a successful send is
committed immediately. `const sqlite = sqliteOf(channel)` is hoisted to the top
of `startForwarder` so `forwardOne` can read it — behaviour-neutral (it was
already initialised before any call).

---

## 5. Dim-1 — the six semantic checks

### 5.1 Additive schema / legacy-safe / fs untouched — **CONFIRMED by execution**

I did not take the "additive" claim on faith. **Probe P-MIGRATE** built a
database using **`origin/main`'s own `SqliteQueue`** (which has no such table),
closed it, then reopened the same home with the candidate:

```
legacy tables            : cursors,deliveries,messages,receipts
legacy has sent_parts?   : false          ← genuinely a pre-change DB
candidate open error     : (none)
after-open has sent_parts: true           ← created by CREATE TABLE IF NOT EXISTS
telegramSentParts(legacy): []             ← legacy rows ⇒ old send-all behaviour
legacy row forwarded     : 3 bubbles
state                    : acked
parts persisted          : [0,1,2]
```

The DDL is re-executed on **every** construct (`sqlite-queue.ts:193
this.db.exec(SCHEMA)`), so the migration happens on next open with no migration
step. ✅

**fs backend**: `sqliteOf(channel)` returns `undefined`, so
`sqlite?.telegramSentParts(…) ?? []` is empty and `sqlite?.markTelegramPartSent`
is a no-op — the idempotency is sqlite-only, as claimed. ✅
Two caveats worth stating precisely: the **retry** and the **new log lines**
*do* apply to the fs path (they are outside the `sqlite?.` guards), so "fs
untouched" is true of idempotency only, not of the whole diff. And I did not
*execute* the fs path (§1 limit 3).

**FK enforcement is ON** (`sqlite-queue.ts:191 PRAGMA foreign_keys=ON`) — I
confirmed by probe that `markTelegramPartSent("no-such-message-id", 0)` throws
`FOREIGN KEY constraint failed`. See INFO-1 for why this is currently safe.

### 5.2 `markTelegramPartSent` timing — **CONFIRMED per-part, residual is broader than stated**

The commit is inside the per-bubble loop, immediately after the awaited send
resolves and before the next bubble is attempted — not batched. Proven live: in
P-DRIFT pass 1, with part 3 of 3 failing, the table already held `[0,1]` while
the message was still `claimed`.

The packet states the residual is exactly "accept-then-crash-before-commit". I
found **three** windows, not one:

1. **accept → crash before commit** (the stated one).
2. **accept → transient error response → one-shot retry** ⇒ duplicate. **ADV-2**,
   reproduced.
3. **accept → `markTelegramPartSent` itself throws**. The commit sits *inside*
   the outer `try`, so a DB error is caught by `catch (e)` and counted as
   `undeliveredText += 1` — the part is on the phone but recorded as failed, so
   redelivery re-sends it. Same class as (1), but triggered by the DB rather
   than by a crash.

### 5.3 Redelivery correctness — **holds for a stable partition; breaks under drift (ADV-1)**

For a stable partition the shipped test proves the property end-to-end, and I
re-derived it: pass 1 sends `(1/3)`, fails `(2/3)` twice, sends `(3/3)`;
redelivery sends **only** `(2/3)`; each of the three appears exactly once; and
`replyTo` is cleared on a skip exactly as on a send, so a partial resend still
threads correctly (only the first bubble ever quotes). ✅

**The failure is when the partition itself moves.** `part_index` is positional,
but the partition is recomputed on every attempt from

```ts
const prefix = boundedSenderPrefix(dm.from, deps.senderContext?.(dm.from));
const budget = TELEGRAM_TEXT_LIMIT - prefix.length - 1;   // chunk boundaries
```

and in production `senderContext` is
`resolveRepositoryContext(sender.folder, rt.git)` (`telegram/index.ts:233`) —
**two `git` subprocess calls under a timeout, wrapped in a `try/catch` that
returns `undefined` on any failure** (`index.ts:43-61`). So the prefix flips
between `[pij-osn81b] [pij/s392/day3-codex-doctrine]` (43 chars) and
`[pij-osn81b]` (12 chars) with **no state change at all** — one slow git call is
enough. It also changes if the session leaves the registry, or if the branch is
renamed/switched.

**Probe P-DRIFT-REAL** (realistic 43-char context, real branch name, 8120-char body):

```
PASS 1  context="pij/s392/day3-codex-doctrine" (prefix 43)
  bubbles sent : 2  (1/3) (2/3)      ← (3/3) failed
  persisted    : [0,1]
  state        : claimed
PASS 2  context=undefined (git hiccup; prefix 12)
  bubbles sent : 0                   ← 2-part partition; both indices skipped
  persisted    : [0,1]
  state        : acked                ← message marked fully delivered
  RESULT       : TAIL NEVER DELIVERED, ROW ACKED
```

Quantified on a 7000-char body (prefix 915 vs 12 ⇒ 3 parts vs 2 parts): the
partition carries `3174 + 3174 + 652 = 7000` body characters; parts 0 and 1 were
delivered, so **652 characters were never sent** and the row is `acked`.

The **opposite** direction (context *appears* on redelivery) is mild — probe
P-GROW, same 8120-char body: pass 1 sends `(1/2)`, pass 2 sends `(2/3) (3/3)`,
full coverage but **31 characters duplicated**.

**Honest mitigation, which lowers the severity**: the chunk marker is part of
the bubble text, so on the losing path the operator's last bubble reads
`(2/3)` and `(3/3)` simply never arrives — a **human-visible** gap. The loss is
silent to the *system* (acked, never retried, no error log), not to the reader.

**Blast radius is bounded**: `chunk()` returns `[text]` with **no marker** when
`text.length <= budget`, so a single-part message — the overwhelming majority of
pij traffic — cannot drift. Exposure starts at roughly **4 KB**.

### 5.4 Retry bound — **CONFIRMED bounded, no infinite loop**

The in-attempt retry is exactly one extra send: the inner `catch` re-sends once,
and if that throws it propagates to the outer `catch`, which counts the part
undelivered. Across attempts the bound is the lease sweep:
`recoverStaleClaims({ maxAttempts })` defaults to **6** and moves the row to
**`parked`** — not `queued` — once `attempt >= 6` (`sqlite-queue.ts:456-476`).

Worst case for a permanently-failing part: 6 redeliveries × 2 sends = **12
attempts on that part, then parked**. And because of this change, the parts that
*did* succeed are **not** re-sent on any of those 6 passes — which is precisely
the win. ✅

### 5.5 §14 accuracy — **CONFIRMED against the cited evidence**

Checked clause-by-clause against `reports/item-23-ack-measurement.md`:

| §14 clause | source | verdict |
|---|---|---|
| "pid-bound 1000 ms probe" | target `pid 19208`, socket `/tmp/cc-socks/19208.sock`, **Ack window: 1000 ms** | ✅ |
| "no positive `orig_msg_id` acknowledgement from a real Claude receiver" | "no positive `peer_message_status` carrying the frame's `orig_msg_id` arrived within 1000 ms" | ✅ |
| "transport ceiling is `sent` followed by durable reader evidence" | "The delivery ceiling for this measured path is therefore `sent` followed by the durable reader acknowledgement" | ✅ |
| "`confirmed` remains reachable only when a runtime emits a positive application acknowledgement" | "it does not prove that no Claude version or runtime condition can emit one" | ✅ — the hedge is **preserved**, not flattened into "Claude never acks" |
| taxonomy `sent`/`confirmed`/`failed`/`unverified` | matches the taxonomy landed by item 23 | ✅ |
| "`acked (reader=…)` is currently daemon-origin injection, not proof that the recipient read it" | matches the open durable-ack concern | ✅ — honest, does not claim it fixed |

**Meta-free**: no seat ids, no session names, no "item N" phrasing in the
paragraph. It cites a plan-relative report path, which is the **established
convention of this very section** (neighbouring entries cite
`deferred-codex-phase.md` and `reports/pij-comms-review-2026-08-27/…`), so I do
not count that as a violation. ✅

### 5.6 No collateral — **CONFIRMED structurally, both ways**

Declaration list via `npx vitest list .pi/extensions/pij/` in **both** trees, sorted + `comm`:

```
main      = 4046 declarations
candidate = 4049 declarations
REMOVED (in main, not in candidate):   (none)
ADDED:  sqlite-queue.test.ts  > persists Telegram sent-part indices idempotently across queue reopen
        bridge.test.ts        > acks after one transient retry and delivers exactly one Telegram bubble
        bridge.test.ts        > redelivery sends only text parts not already persisted as successful
```

A name diff alone is blind to assertions deleted from a *surviving* test, so it
is paired with a line diff:

```
git diff --numstat 5796d18^ 5796d18
17  0  adapters/sqlite-queue.test.ts     ← zero deletions
29  0  adapters/sqlite-queue.ts
86  0  telegram/bridge.test.ts           ← zero deletions
24  4  telegram/bridge.ts
 2  0  docs/specs/claude-copilot-sqlite-sockets-comms.md

deleted lines in *.test.ts : none
deleted `expect(`          : 0
```

The only 4 deleted lines anywhere are in `bridge.ts` (the `const sqlite` hoist,
the old `for (const bubble of bubbles)`, the old bare `await deps.send(…)`, and
the old `forwarded ${dm.from}` log line) — all superseded in place. **Nothing
removed, nothing weakened.** ✅

---

## 6. Gates (all reproduced first-hand in the candidate tree)

| gate | result |
|---|---|
| fence (`bridge.test.ts` + `sqlite-queue.test.ts`) | **102 passed / 1 skipped**, exit 0 |
| `npx tsc --noEmit` | exit **0** |
| `npx biome check --max-diagnostics=200` (4 fence files) | exit **0**, "Checked 4 files… No fixes applied" |
| full suite (`.pi/extensions/pij/` + `harness/`) | **4218 passed / 1 failed / 19 skipped** across 200 files, 197 s |

**`gatesClean:false` is genuinely pre-existing and out of fence.** The single
failure is `harness/scripts/release-age-policy.test.ts:196` →
`Error: spawnSync pwsh ENOENT`. Proven unrelated:

- same file run in the **`origin/main` worktree**: **1 failed | 9 passed** — identical;
- `which pwsh` → **absent** on this machine (environmental, not a code defect);
- `grep -c "pwsh\|release-age"` across all four fence files → **0, 0, 0, 0**.

---

## 7. Findings

### ADV-1 (medium) — positional idempotency key over a *live* partition ⇒ silent tail loss + false `acked`

**New failure mode introduced by this change.** Detailed in §5.3 and reproduced
live twice (P-DRIFT, P-DRIFT-REAL). The stored key is `(message_id, part_index)`,
but nothing about the *partition* is stored, and the partition depends on
`senderContext()` — which degrades to `undefined` on any git timeout.

Suggested fix, cheap and fully backward-compatible: persist the partition's
identity alongside the parts — the simplest sufficient value is the **part
count** (or the prefix length, or a hash of the prefix). On redelivery, if the
recomputed partition does not match the persisted one, **ignore the skip set and
send all parts** — i.e. fall back to today's `main` behaviour (a duplicate)
rather than risk a silent loss. That preserves the seq-3263 fix for the ~100% of
cases where the partition is stable, and degrades to *noisy* rather than *silent*
in the corner. A second, independent hardening: only ack when
`sentPartIndices` ⊇ every index the current partition produced.

### ADV-2 (low-medium) — the one-shot retry duplicates on ack-loss

`isTransientSendError` matches
`network|fetch failed|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timed out|429|Too Many Requests|50[234]|…`.
Some of those are unambiguous rejections and safe to retry (`429`,
`ECONNREFUSED`). Others — `ETIMEDOUT`, `socket`, `fetch failed`, `502/503/504` —
are **ambiguous**: Telegram may have accepted and delivered the bubble while the
response was lost. Probe **P-ACKLOSS** (fake that records the bubble as
delivered, *then* throws `ETIMEDOUT`):

```
attempts: 2 | bubbles ON PHONE: 2 | state: acked | persisted: [0]
duplicate on operator phone: true
```

The shipped test `acks after one transient retry and delivers exactly one
Telegram bubble` cannot see this, because its fake throws *before* recording the
send — it models a send that failed **before** landing. Both models are
legitimate; only one is tested. Consider narrowing the text retry to the
unambiguous rejections (`429`, `ECONNREFUSED`, `EAI_AGAIN`), or add a test that
pins the ack-loss shape so the trade is explicit.

Net position: still better than `main`, where the same event re-sent **every**
part of the message.

### ADV-3 (low) — `markTelegramPartSent` failure is misreported as a send failure

§5.2 item 3. The commit is inside the outer `try`, so a DB error makes a
successfully-delivered part count as undelivered. Moving the commit outside the
`try` (or catching DB errors separately and logging them distinctly) would keep
the two failure classes distinguishable in the log.

### ADV-4 (low) — the logged `part N/M` is *not* the persisted index

`log(\`forwarded ${dm.messageId} part ${index + 1}/${bubbles.length}\`)` uses
`index`, which is local to the current `sendText` call, while the persisted key
is `persistedIndex`, which is global to the message. `sendText` is called from
**four** sites in `forwardOne` (body, oversize notice, over-long caption,
no-media-sender fallback), so for any message with attachments the log says
`part 1/1` while the row stored is `part_index 3`. Since the whole point of
MUT-LOGID is diagnosability of exactly this table, logging `persistedIndex`
would make the log joinable to `telegram_sent_parts`.

---

## 8. INFO

- **INFO-1 — the FK is enforced but currently unreachable as a fault.**
  `PRAGMA foreign_keys=ON` and `message_id REFERENCES messages(id)`, so a
  `messageId` absent from `messages` throws. It cannot happen today: the sqlite
  consumer sources `messageId` as `row.id` from `messages`
  (`sqlite-queue.ts:165`), and there is **no `DELETE FROM` anywhere in
  `sqlite-queue.ts`** (grep: zero hits), so rows are never pruned out from under
  a claim. Worth remembering if pruning is ever added: a failing FK insert would
  be caught as a send failure and redeliver forever (ADV-3 path).
- **INFO-2 — attachment-dependent index drift.** The same positional-key concern
  as ADV-1 applies to attachments: whether an attachment contributes a text part
  depends on `sizeOf(att.path)` and on the caption length. If an attachment file
  is deleted or resized between attempts, `sizeOf` throws, the oversize-notice
  `sendText` never runs, and every subsequent index shifts. Not probed (§1
  limit 4) — flagged as the same class as ADV-1, and the ADV-1 fix (persist the
  partition identity) closes it too.
- **INFO-3 — `ON DELETE CASCADE` is good hygiene** and will keep
  `telegram_sent_parts` from leaking if message pruning is added later. The
  table otherwise grows unboundedly, one row per delivered chunk, forever.
- **INFO-4 — §14 placement.** The new paragraph sits between the section's
  introductory sentence ("Ordered roughly by how much the comms path depends on
  it. Each item names the symptom, the fix shape, and where to start.") and
  numbered item 1. It is a taxonomy/provenance statement rather than a ranked
  work item, so it reads slightly out of order; moving it above that sentence,
  or giving it its own sub-heading, would preserve the list's framing. Purely
  editorial.
- **INFO-5 — the `const sqlite` hoist is behaviour-neutral.** `sqliteOf(channel)`
  was already evaluated before any `forwardOne` call, so moving it above
  `forwardOne` changes nothing at runtime; it only removes the closure-order
  subtlety. No test distinguishes it, correctly.
- **INFO-6 — line claims were accurate.** All three claimed line numbers matched
  the file exactly, unlike several earlier packets in this stream.

---

## 9. Teardown

- Both worktrees removed (`git worktree remove --force`); `git worktree list`
  back to the 4 legitimate entries. Both were `--detach`; **no branch was
  checked out, nothing committed, nothing pushed.**
- All 6 scratch probe files (`i24-migrate.mts`, `i24-drift.mts`,
  `i24-drift-quant.mts`, `i24-drift-parts.mts`, `i24-drift-real.mts`,
  `i24-grow.mts`) deleted from the tree and `git status --porcelain` verified
  **empty** before the collateral and gate runs.
- `/tmp/i24-mut.py`, `/tmp/i24-cand.txt`, `/tmp/i24-main.txt` removed.
- Fence files sha-verified pristine after every mutation and at teardown.

---

## 10. Bottom line

**APPROVE.** The seq-3263 duplicate is really fixed, and MUT-IDEMPOTENT shows the
fix is really guarded — deleting the skip makes `(1/3)` arrive twice. The schema
is genuinely additive and I proved it by opening a real `origin/main`-authored
database with the new code. Commit timing is per-part, the retry is bounded at
one-plus-six-then-parked, §14 is faithful to its cited measurement including its
hedge, and nothing was removed or weakened anywhere in the suite.

What I would not want lost in the approval: **this change makes the idempotency
key positional while leaving the partition that defines those positions
recomputed live from a git call that can fail.** That is fine today for the ~100%
of messages under 4 KB, and it is still better than `main` for everything else —
but in the corner it converts a duplicate into a **silently acked truncation**,
and I reproduced that twice with a realistic branch name. ADV-1's fallback
(persist the part count; on mismatch, send all) is small and keeps the failure
noisy. I would take it before this is called closed.
