# Item 23 review — transport receipt honesty (COLD, CODE)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or repo write
> was performed after this file was written. If a further pass is wanted it
> must be a NEW dispatch.

**Reviewer**: `pij-wilful-morton` (cold) · **Date**: 2026-08-28
**PR**: #23 · **Branch**: `s392-pr23` · **Candidate**: `e73efc1e015ce330112415f57f88fa045fdb0da0`
**Base**: `origin/main` = `af566de5bf3917d00684ea75fb069641c62cd497`
**Packet**: `reviews/item-23-review-packet.md`

---

## VERDICT

**APPROVE ruling #1 (the `sent` transport taxonomy) and E21.
BLOCK on ruling #2 (the `emitSendReceipt` defer) — FINDING-1.**

The transport half is the best-built change I have reviewed in this stream:
the taxonomy is exhaustive, every boundary is pinned, and all four mandated
mutations RED exactly where the packet claimed.

The receipt half does **the opposite of what the item is named for**.
`emitSendReceipt` can no longer emit `unverified` **at all** — every receipt
now reads `delivered`, including for a pane send whose submission was never
confirmed. I proved this three independent ways (§4). The plan-127 honesty
invariant was not weakened, it was **inverted**, and the test that guarded it
still carries its own epitaph as the message body:
`"the GO message that must not be lied about"`.

**The coder implemented ruling #2 faithfully.** The fault is in the ruling's
premise: it assumes `markRead` is a *reader* acknowledgement. At both call
sites it is the **daemon's own delivery-side write**, unchanged from main.
This needs an o-prime ruling, not a coder fix.

---

## §1 Scaffolding, and the limits of this review (stated before findings)

**Scaffolding built** (all torn down — §8):

| what | where |
|---|---|
| candidate worktree | `/tmp/pij-i23`, `git worktree add --detach e73efc1` |
| main worktree (for authoritative comparison) | `/tmp/pij-i23-main`, detached at `af566de` |
| `node_modules` | symlink → `~/GitHub/pij/node_modules` in both |
| mutation harness | `/tmp/i23-mut.py` — refuses a non-unique anchor, refuses a no-op substitution |
| E21 end-to-end probe | `i23-e21-probe.ts`, written into and deleted from the candidate tree |

**Pristine sha256 — all 13 fence code files, candidate tree:**

```
fa3bda803535579d200c8252a193e0cd591758505a84ed3ddbf53fc510a591db  core/ports.ts
f72a13ae4c64702b936c33f458e2b955c9216953d2cafbce67f88ef328130b87  adapters/claude-socket.ts
284982385e5a68dd8334170fc9ba99ee000c8b2031a7b797776eeb63c8703993  adapters/claude-socket.test.ts
7fbfe950b5b718dd07e5729845c31c5632fb27a2da3302b3463ba135d5a1f567  adapters/copilot-rpc.ts
f7e6ae5e4a7e4b4877f1848bf986dfcfedb810786bf3fcc33b513798f2488edb  adapters/copilot-rpc.test.ts
9c7172888d0a582edf7a8e3584de3a252f01516f64f497f2b0e0293d23fb3aaa  adapters/daemon-tmux.ts
9d41f5a0ef1434ecf530d86957073ae4fc49d65edf8e1a40650617538e5343b4  adapters/daemon-tmux.test.ts
9d6968669e9023dff847ad3117b6b56f861d1a0b43f176091adb2896253f42ff  core/daemon/loop.ts
f075b072453805e7290f08299262c5acb603d74f5a053aaaf6a0aabda65f2f38  core/daemon/loop.test.ts
9283761a4d1c1116b6ff65bd123bc821ce6cffe91790f33bb64a75e5c215416d  daemon.ts
af54c49035c8dded7da30e57f4152362ae021edc4b6675fc7910dab3d30186d4  daemon.test.ts
c76937513624ad452d5b672e7aa3298466589ba3224bf94dc7b842648a867248  core/cli.ts
a99d94d4b2b070898e5df98e649ee7bd2a03643de5e2b205498bd8eb0dd3de26  core/cli.test.ts
```

### What I could NOT check — do not read these as clean

1. **ADV-1 carried from item 20 is now MOOT but was never closed by measurement
   on the success path.** The ack-measurement report (§ Dim-1.4) measures the
   *absence* of a positive ack. I have no live Claude peer in this review, so I
   still cannot independently confirm what a real receiver emits. I re-ran no
   live probe; I am accepting the coder's measurement as *reported*.
2. **I did not verify the ack-measurement report's provenance.** It states pid
   19208 and a 1000 ms window. That process is not observable from here. The
   report is a claim about an experiment I did not witness (§ Dim-1.4).
3. **Blast radius of MUT-DEFER measured across the full suite, but the
   *production* consequence of FINDING-1 is reasoned, not executed.** I proved
   the receipt string is always `delivered`; I did **not** stand up a live
   swallowed-Enter wedge to watch a real sender be misinformed.
4. **`markRead`'s three daemon call sites** (`:691`, `:1199`, `:1260`) — I read
   all three and mutated none. Only `:691` and `:1260` feed `emitSendReceipt`.
5. **`pij queue` under `PIJ_QUEUE_BACKEND=fs`** — I confirmed the guard exists
   and that sqlite is the default; I did **not** execute the fs path.
6. **The E21 control is not a proof of the old hint's failure mode.** My
   `pij tail` control exited 2 on `E-NOID` (a registry precondition), not on the
   filter. I state this plainly in Dim-1.3 rather than letting it read as a
   demonstration.

---

## §2 Structural: the fence claim is TRUE (contrast with item 20)

Item 20's packet made the same "fence = delta only" claim and it was false. I
tested this one the same way and it **holds**.

| check | result |
|---|---|
| `merge-base(origin/main, s392-pr23)` | `af566de5` = **origin/main exactly** |
| commits ahead | **1** (`e73efc1`) |
| `diff main..e73efc1` vs `git show e73efc1` | **byte-identical** (`diff` empty) |
| cherry-pick fidelity `5a986e3` → `e73efc1` | **identical `git patch-id`** = `162ca5edc10725a5cc0076e2c97754a92d9d6114` |
| stat | 14 files, **+141 / −54** |

Because the merge-base *is* main and there is exactly one commit, the
branch-behind drift hazard that blocked item 20 is **structurally impossible**
here. The `5a986e3` → `e73efc1` cherry-pick is provably byte-faithful, not
merely similar. This is the item-18 shape and it is the right one.

---

## §3 Dim-0 mutation ledger — all sha-verified RED → restore → GREEN

Every mutation below was applied to disk, run, sha-recorded, restored via
`git checkout --`, and the restored sha compared to the pristine sha (harness
aborts on mismatch). `git status --porcelain` was empty between every step.

| # | mutation | file:line (pristine) | mutated sha256 | RED at | scope |
|---|---|---|---|---|---|
| 1 | **MUT-SENT-claude** | `claude-socket.ts:152` | `c15538e75a7386bb9445a7319134413611a5eb23b91edac0a2bc984e355f1791` | `claude-socket.test.ts:114:23` (×2, both `it.each` cases) | 2 failed \| 5 passed |
| 2 | **MUT-SENT-copilot** | `copilot-rpc.ts:68` | `f9bbf954d47c3364df1e6326866c2d2c3589a7b20c896d08eef52e6a1eccccdf` | `copilot-rpc.test.ts:139:23` | 1 failed \| 6 passed |
| 3 | **MUT-NAK** | `claude-socket.ts:191` | `a0384186a3f130a4c1ca773e6f8c93ff0fe4c2e01ddfd2605d2d85610b8fda99` | `claude-socket.test.ts:137:23` | 1 failed \| 6 passed |
| 4 | **MUT-DEFER** (headline) | `daemon.ts:1498` | `3da5533b05483defa9512d34be7baa26c5c57f2bbc145ed097aa7baeb04248d0` | `daemon.test.ts:416:37`, **`444:18`**, `515:18` | 3 failed \| 64 passed \| 2 skipped |
| 5 | **MUT-CONST** *(mine)* | `daemon.ts:1498` | `b866221e1ff87d626000facb3749ee1cb524dc29e2f67be64782b7f51c8d505b` | **NO RED — full suite green** | 4645 passed \| 1 failed (pre-existing) |
| 6 | **MUT-HALFDEFER** *(mine)* | `daemon.ts:1497` | `2301654f91cfbe2e41bf24ae547448bf05f3fc97d3ca9494de8d1389cb7ef2dc` | **NO RED** | 67 passed \| 2 skipped |

### Packet line-claim accuracy: 4 / 4 EXACT

The packet warned its lines were coder-claimed and unverified. I checked each
against the file. **All four are exact** — a clear improvement on item 20,
where `copilot-rpc.test.ts:137` was a blank line.

| claimed | actual | |
|---|---|---|
| MUT-SENT `claude-socket.test.ts:114` | `expect(out.outcome).toBe("sent");` | ✅ |
| MUT-SENT `copilot-rpc.test.ts:139` | `expect(out.outcome).toBe("sent");` | ✅ |
| MUT-NAK `claude-socket.test.ts:137` | `expect(out.outcome).toBe("failed");` | ✅ |
| MUT-DEFER `daemon.test.ts:444` | `expect(bodies).toContain(receiptBody(…, "delivered"));` | ✅ |

**No RED line needed remapping.** Mutations 1–4 edit a *source* file while the
failures land in *untouched* test files, so pristine numbering applies directly.

**MUT-DEFER is stronger than the packet claimed.** It REDs on **three** tests,
not one — the two inverted tests (`416`, `515`) plus the new one (`444`). The
deference is load-bearing for the entire receipt surface.

---

## §4 FINDING-1 (BLOCKING) — `emitSendReceipt` is now unconditionally `delivered`

### The claim

After this commit, **no input can make `emitSendReceipt` produce `unverified`.**
Every receipt reads `delivered`.

### Proof 1 — by construction (exhaustive, static)

```ts
// daemon.ts:1497-1498
const durablyAcked = marked.kind === "marked" || marked.kind === "already-read";
const state = durablyAcked || outcome === "confirmed" ? "delivered" : "unverified";
```

```ts
// core/types.ts:572 — the COMPLETE union
export type InboxMark =
  | { readonly kind: "marked"; readonly marker: InboxReadMarker }
  | { readonly kind: "already-read"; readonly messageId: string };
```

`durablyAcked` tests for **both** variants of a two-variant union, so it is
`true` for any well-typed `InboxMark`.

There are exactly **two** call sites repo-wide (`grep -rn --include=*.ts
"emitSendReceipt" .pi/`, run with hidden paths per the `.pi/` search trap):

| call site | guard immediately before |
|---|---|
| `daemon.ts:697` | `:691` `markRead(...)` → `:696` `if (!marked.ok) throw` |
| `daemon.ts:1273` | `:1260` `markRead(...)` → `:1265` `if (!marked.ok) throw` |

Both **throw** unless the mark succeeded. So `marked` is always a successful
`InboxMark` ⇒ `durablyAcked` is always `true` ⇒ `state` is always `"delivered"`.
The `|| outcome === "confirmed"` disjunct and the entire `: "unverified"` arm
are **dead code**, and the comment describing "a non-acked caller" describes a
branch that cannot be reached.

### Proof 2 — by mutation (empirical, whole-repo)

I replaced the expression with a literal:

```ts
const state = "delivered";
```

**The entire repository suite passed**: `1 failed | 4645 passed | 19 skipped`
across 235 files — and the pristine run produced the **identical** numbers
(§7). The one failure is the pre-existing `pwsh ENOENT`, proven identical on
main. Not one test in the repo distinguishes the real expression from a
hardcoded `"delivered"`.

MUT-HALFDEFER (dropping the `already-read` disjunct) also produced **no RED**,
confirming that disjunct is untested as well.

### Proof 3 — the shipped tests say so themselves

All three receipt tests now assert `delivered`, and two of them additionally
assert `not.toContain(... "unverified")`.

### Why this is a regression, not a rename

The deference is **circular**. "The durable reader acknowledgement" is written
**by the daemon, at delivery time, in the same tick** — not by the reader.
Confirmed against main: the `markRead` calls at `daemon.ts:685`/`:1248` (main)
→ `:691`/`:1260` (candidate) are **unchanged pre-existing code**, with the same
guard and the same `throw`. This commit changed only the receipt mapping.

`markRead` genuinely does have reader-originated callers — `core/inbox.ts:339`,
`cli.ts:764`, `index.ts:413`. **Those are not the ones feeding the receipt.**
The daemon marks the row read as an integral step of its own send, then reads
its own marker back as independent evidence that the recipient received it.

The clearest demonstration is the commit's own test, `daemon.test.ts:487`:

```ts
it("lets a durable reader ack outrank an unverified Claude pane submission", async () => {
  // ...
  const ports = fakePorts({ sendOutcome: "unverified" });
  await new Daemon(home, ports, registry, new FsChannel(home)).tick();
  // ...
  expect(bodies).toContain(`[pij receipt ${…}] delivered`);
  expect(bodies).not.toContain(`[pij receipt ${…}] unverified`);
});
```

`sendText` returns `unverified` — the plan-127 swallowed-Enter wedge, where
text sits in a composer that was never submitted. **There is no reader in this
test.** No `pij inbox`, nothing on the target side; a single `tick()` runs. The
test's own comment says "until the target durably marks the queue row read",
but the target marks nothing — the daemon does, one line after `sendText`
returned `unverified`.

And the message body it uses is, verbatim:

```
"the GO message that must not be lied about"
```

### What main did, and what was deleted

Main (`daemon.ts`, `emitSendReceipt`):

```ts
// Honest mapping: ONLY a positively observed submission earns `delivered`.
// Text that was typed but never confirmed submitted (the swallowed-Enter
// wedge, plan 127) reports `unverified` — never `delivered`.
const state = outcome === "confirmed" ? "delivered" : "unverified";
```

That comment and that invariant are both gone, along with the test named
`"NEVER reports delivered for a claude send whose submission was unconfirmed"`.

### Severity — bounded, but aimed squarely at the item's own goal

To be fair about blast radius: **delivery and duplicate behaviour are
unchanged.** The `sent` transport work is sound and nothing is re-sent or lost
*because of* this. The regression is confined to **what the sender is told**.

But that is precisely this item's subject. The item is called *transport
receipt honesty*, and the receipt is now strictly **less** honest than main:
it previously discriminated two states and now emits one constant. In the
swallowed-Enter wedge the sender loses their only signal that the message may
be stranded — the case plan 127 was created for.

### Recommended remedy (for o-prime, not the coder)

The ruling is satisfiable without the circularity, if a *reader-originated*
signal is what gets deferred to. Options:

1. **Distinguish the marker's origin.** Have the daemon's delivery-side
   `markRead` record `source: "daemon-inject"` and the reader-side paths
   (`inbox.ts:339`, `cli.ts:764`, `index.ts:413`) record `source: "reader"`,
   and defer only to the latter. This makes "durable reader acknowledgement"
   true to its name.
2. **Keep transport honesty for the pane path.** `confirmed → delivered`,
   `sent → sent`, `unverified → unverified`, and let a genuine later reader ack
   *upgrade* the receipt.
3. **If the ruling is intentional as-is**, then delete the dead `: "unverified"`
   arm and the misleading comment, rename the receipt to something that means
   "left the queue", and record explicitly that plan 127's invariant is retired.
   Do not leave code that appears to discriminate but cannot.

Whichever is chosen, a test must pin a **non-acked** send producing a
non-`delivered` receipt — otherwise MUT-CONST stays green forever.

---

## §5 Dim-1 semantic checks

### 5.1 Taxonomy — exhaustive and correct ✅

Every terminal `done()` enumerated in both transports.

**`claude-socket.ts`** — 5 terminals:

| line | condition | outcome | correct? |
|---|---|---|---|
| 155 | connect timeout | `failed` | ✅ pre-write by construction |
| 170 | write callback `err` | `failed` | ✅ pre-write |
| 152 | `ambiguousFailure` | `wrote ? "sent" : "failed"` | ✅ the flush boundary |
| 191 | NAK `dropped_msg_ids` includes us | `failed` | ✅ explicit refusal ⇒ retry-safe |
| 193 | `st.orig_msg_id === msgId` | `confirmed` | ✅ |

**`copilot-rpc.ts`** — 9 terminals (`:68, :71, :74, :81, :91, :98, :102, :104,
:106`); `:148–:177` belong to `getForeground` and are not send outcomes. Same
shape: `:81` write-cb error → `failed` (pre-write); `:102` `msg.error` →
`failed` (explicit refusal — the RPC analogue of a NAK, correctly *not* routed
through `ambiguousFailure`); `:104` `messageId` → `confirmed`; all genuinely
ambiguous paths → `ambiguousFailure`.

**No path mis-buckets.** The critical asymmetry is right in both transports: an
*explicit refusal* stays `failed` even post-write (safe to retry, the receiver
rejected it), while *silence* post-write becomes `sent` (unsafe to retry). This
is the correct distinction and MUT-NAK pins it.

`sent` never re-enqueues: `loop.ts:705` consumes `confirmed | sent |
unverified`; only `failed` reaches the enqueue branch at `:709`.

`unverified` from `sendSocket` is now unreachable in production (DaemonTmux
returns only `confirmed | sent | failed`) but is retained in the accepted set —
correct defensive breadth for the port contract, and `loop.test.ts` now pins
both via `it.each(["sent","unverified"])`.

### 5.2 Defer correctness — **FAILS**, see §4 ❌

The packet asked me to "probe both branches (marked vs not-marked)".
**The not-marked branch does not exist.** This is the named danger, realized.

### 5.3 E21 honesty — the new hint WORKS (proven end-to-end) ✅

I did not reason about this; I ran it. I wrote a receipt through the real
channel API and read it back through the real CLI:

```
$ pij queue --to pij-sender
seq   state        att from→to                     bytes  kind · trail
1     Q queued     0   pij-target→pij-sender        35     receipt · queued
```

JSON confirms `"kind":"receipt"`. The hint at `core/cli.ts:3448` emits
`pij queue --to ${self}` where `self` is the sender, and receipts are delivered
`to: sender` — so the pointer is semantically right and **verified working
verbatim**. `--to` is a real parsed flag (`cli.ts:569`, filter applied at
`:842-844`). Default backend is sqlite (`channel-factory.ts:38-39`), so this
works out of the box; under the explicit `PIJ_QUEUE_BACKEND=fs` escape hatch
`pij queue` degrades to a clear message (`cli.ts:838`) — which does still point
at the old `pij tail … --type receipt` string, a cosmetic out-of-fence residual
(INFO-2).

### 5.4 The `tail --type` residual — the packet's framing is WRONG (correction)

The packet calls it "the `tail --type` filter bug" and the new test title says
"the **ignored** tail type filter". **The filter is not ignored.** I traced it
end to end:

| layer | finding |
|---|---|
| parse | `core/cli.ts:1301`, `:1307` — `--type` validated and captured |
| forward | `core/cli.ts:3653` — `.read({ since, type: cmd.type, last })` |
| port | `core/types.ts:527` — `EventQuery.type` exists |
| impl | `FsEventLog.read` → `filterEvents` → **`out.filter((e) => e.type === type)`** — the filter is implemented and applied |

The real reason `pij tail <self> --type receipt` shows nothing after a `pij
send` is a **data-source mismatch, not a broken filter**: `emitSendReceipt`
writes a *message* (`channel.deliver({kind:"receipt"})`), never a `PijEvent`.
`receipt`-typed events do exist but are appended only when a session *reads its
inbox* (`core/inbox.ts:323`, `source: "inbox"`).

So E21's repoint is **correct and well-motivated** — it moves the user from a
log that is empty at that moment to the durable queue that already holds the
row. The reasoning attached to it is simply mis-stated. Out of fence; flagging
per instruction, not failing the PR (INFO-1).

*(Honest limit: my `pij tail` control exited 2 on `E-NOID` — a registry
precondition — so it demonstrates nothing about the filter. The conclusion
above rests on the source trace, not on that run.)*

### 5.5 Probe validity — honestly caveated ✅

`reports/item-23-ack-measurement.md` states the conclusion as **measured, not
proven**, in its own words: *"This single bounded probe shows no positive
success ack was observed; it does not prove that no Claude version or runtime
condition can emit one."* It records target, socket, msg id, window (1000 ms),
and result (`sent`). It correctly notes the shipped `socketAckWaitMs` stays
150 ms, so the measured window was **6.7× more generous** than production —
strengthening the conclusion rather than overselling it.

This is the right epistemic shape and it closes my item-20 **ADV-1** as far as
the *no-ack* direction goes. Limit stated in §1: I did not witness the
experiment and cannot verify pid 19208 from here.

---

## §6 No collateral — structural (E17/INS-001)

Per E17 I used `npx vitest list` (never a regex — it expands `it.each`, which a
regex cannot) in **both** trees, and paired it with a **line diff**, because a
declaration list is blind to assertions deleted from a surviving test.

`main` **679** declarations → candidate **682** (+3). Full `comm` diff: 8
removed / 11 added, which decompose with nothing left over:

| kind | count | detail |
|---|---|---|
| pure rename (`unverified`→`sent`) | 5 | 2 claude-socket (`it.each`), 1 copilot-rpc, 2 daemon-tmux |
| rename **+ widened** | 1 | `loop.test.ts` single test → `it.each(["sent","unverified"])` — **coverage gained** |
| genuinely new | 3 | cli E21 test; loop `unverified` case; daemon `sent`+durable-ack test |
| **semantic inversion** | **2** | the two daemon.test.ts receipt tests — §4 |

**No test was lost.** The only assertion changes are the 2 inversions, which
are FINDING-1's substance rather than accidental collateral.

**Line diff of the 4 non-`daemon.test.ts` test files: no assertion weakened.**
All changes are `unverified`→`sent` string swaps. `loop.test.ts` was
*strengthened*, and `expect(socketSends).toBe(1)` — the OBS-04 no-dup guard I
verified in item 20 — is retained intact.

**Item-20 ADV-2 was actioned.** The claude-socket fixture now carries the
comment I recommended, citing `d-prior-art.md:36` and naming the `confirm` mode
as *"a protocol assumption, not measured ground truth"*. Good follow-through.

---

## §7 Gates — reproduced first-hand

| gate | result |
|---|---|
| 6 fence test files (baseline) | **682 passed \| 2 skipped**, exit 0 |
| `npx tsc --noEmit` | **exit 0**, no output |
| `npx biome check --max-diagnostics=200` (13 changed files) | **exit 0** — "Checked 13 files… No fixes applied" |
| full suite (pristine) | **4645 passed \| 1 failed \| 19 skipped** (235 files, 180 s) |
| full suite (under MUT-CONST) | **identical numbers** — see §4 Proof 2 |

`--max-diagnostics=200` used deliberately: biome's default 20-diagnostic cap
truncates and fakes cross-tree differences.

**The single red is pre-existing and out of fence** — proven, not asserted:
`harness/scripts/release-age-policy.test.ts` → `"restores the Windows caller"`
→ `Error: spawnSync pwsh ENOENT` (no PowerShell on macOS). I ran the same file
in the `origin/main` worktree and got the **identical** failure
(`1 failed | 9 passed` both sides), and
`git diff --name-only origin/main..e73efc1 | grep -c release-age-policy` = **0**.
So `gatesClean:false` does not touch the changed files.

---

## §8 Teardown

- `/tmp/pij-i23`, `/tmp/pij-i23-main` → `git worktree remove --force`, verified
  gone, `git worktree list` clean.
- `/tmp/i23-mut.py`, `/tmp/i23-a.diff`, `/tmp/i23-b.diff`,
  `/tmp/i23-main-list.txt`, `/tmp/i23-cand-list.txt` → removed.
- `i23-e21-probe.ts` (written into the candidate tree) → deleted;
  `git status --porcelain` empty afterwards.
- All 3 mutated files restored and **sha-verified** against pristine.
- No branch checked out (both worktrees `--detach`). No commit. No push.
- This review file is the only repo write.

---

## §9 Advisories

**ADV-1 (blocking — o-prime ruling needed).** §4. `emitSendReceipt` cannot emit
`unverified`; the deference is circular because the marker is the daemon's own
delivery-side write. Remedy options in §4.

**ADV-2 (should fix with ADV-1).** If ruling #2 stands as-is, the dead
`: "unverified"` arm and the comment describing an unreachable "non-acked
caller" must go — code that appears to discriminate but cannot is worse than
code that plainly does one thing.

**ADV-3 (test-quality).** MUT-CONST passing the whole suite means there is **no
sensor** on the receipt-state decision. Whatever ruling lands, add a test that
pins a non-`delivered` receipt, or this expression can be silently replaced by
a constant forever.

**INFO-1.** The new cli test title and the E21 rationale describe an "ignored
tail type filter". The filter works (§5.4); the mismatch is that receipts are
messages, not event-log events. Retitle for accuracy — a test name is a claim.

**INFO-2.** `cli.ts:838`'s fs-backend fallback still recommends
`pij tail <id> --type receipt`. Cosmetic, out of fence, worth sweeping when
ADV-1 is settled.

**INFO-3 (praise, and worth encoding).** This packet's four claimed mutation
lines were **4/4 exact**, and the branch was built fresh-from-main as a
patch-id-identical cherry-pick. Both are direct responses to defects I raised
on items 17/18/20. The per-item fresh-from-main merge unit (`0f1b2d0`) is
working — it made §2 a three-command check instead of the multi-hour drift
investigation item 20 required.

---

## §10 Bottom line

The transport half of item 23 is **correct, exhaustive, and well-pinned** — the
`sent` taxonomy draws the pre-write/post-write and silence/refusal boundaries
in the right places in both transports, all four mandated mutations RED exactly
as claimed, no test was lost, coverage was widened, and every gate is green
with the sole red proven pre-existing on main. E21's repoint is verified
working end-to-end.

The receipt half **inverts the invariant the item exists to protect**. I would
not merge this as one unit. Split it: ship the `sent` taxonomy and E21 now, and
send ruling #2 back to o-prime with §4 — because the coder built exactly what
was ruled, and it is the ruling's premise about `markRead` that does not hold.

**e73efc1e015ce330112415f57f88fa045fdb0da0**
