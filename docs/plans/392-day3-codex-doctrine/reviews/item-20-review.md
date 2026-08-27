# Item 20 — cold review (CODE): transport T1/T2 dup window (OBS-04)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file
> was written, and no further pass on item 20 is open on my side.

**Reviewer**: `pij-wilful-morton` (cold, independent worktree)
**Candidate**: `a29a9fe5828a69d6b0495fd9c74479d65942b78b`
**Compared against**: `origin/main` = `7b25bece3f57ea456ea2e8731d06649649971547`
**Packet**: `reviews/item-20-review-packet.md` · **Dossier**: `../tasks/item-20-transport-dup-window/tasks.md`
**Date**: 2026-08-28

---

## VERDICT: ✅ APPROVE the code — ⚠️ but DO NOT merge this branch as-is

The OBS-04 fix is **correct, minimal, and mutation-proven**. All four mandated
Dim-0 mutations RED on disk with sha-verified restore→GREEN, and I went past the
packet to observe the duplicate itself numerically (it does not appear in the
shipped test's RED message).

**However, the packet's central structural claim is false**, and it is the one
claim that would have let a real regression through: `git diff main..a29a9fe`
over the 8 fence files is **NOT** the item-20 delta only. One file carries
main-side drift, and **a test that exists in `main` is absent from this
candidate**. That is not an item-20 regression — I proved the direction — but it
means this branch must not be merged by taking its content for that file. See
**FINDING-1**.

Approve the *change*. Fix the *merge unit* first.

---

## 1. Scaffolding, and the limits of this review (stated before findings)

**What I built.** Two throwaway detached worktrees, each with a `node_modules`
**symlink** to the main checkout (not a clean `npm ci`):

- `/tmp/pij-i20` @ `a29a9fe` — the candidate
- `/tmp/pij-i20-main` @ `7b25bec` — `origin/main`, for authoritative comparison

Both removed at teardown (§8). No branch was checked out; both used `--detach`,
so the pre-existing local branches were never touched.

**Pristine sha256 recorded before any mutation** (all 8 fence files):

| sha256 | file |
|---|---|
| `27cd3aeb8c08c6541fbc325689861c26cb6536a0e34ff5e9349cd1c519720f4b` | `adapters/claude-socket.ts` |
| `6f1f1f6bd4ff37e5a56734b3f1e6592721ae463f4cb32b1e582ce8a6d8343752` | `adapters/claude-socket.test.ts` |
| `f4fe4da5e681a61a64f95aab9ef9ea60741eb21ccd7f3e434e881fbf360d8631` | `adapters/copilot-rpc.ts` |
| `86711a4850738e72d5d4008b0a8aa96bda8241425e6facf4bceca93d4b927292` | `adapters/copilot-rpc.test.ts` |
| `26b2ee1124d47039486ee4d832d893b9a5f82227565bd72b50e4e0142fa9e7a7` | `adapters/daemon-tmux.ts` |
| `47c90e45a4305d2d4d0d49b07544e806e3337be7cdb8679eeb8ade9ca173cfc1` | `adapters/daemon-tmux.test.ts` |
| `dfb8378c6417c62a5d39fffb94585fbe6ab85b66e7f8e27edf36a7f00e2e486e` | `core/daemon/loop.ts` |
| `51271e63169d67f56f558bf6f0d6f707fd1f42d5834b9f2740b53dc0fa25fbd0` | `core/daemon/loop.test.ts` |

### What I did NOT examine — a gap you did not check must not look like a clean one

- **No live Claude peer and no live Copilot server.** Every transport result in
  this review comes from an in-process fake or an out-of-process node listener.
  **This is load-bearing for ADV-1** — the single most important open question
  in this change cannot be settled from the repo.
- **No live daemon, no tmux, no `just smoke`** (shared host).
- **Not run**: `harness checks`, `just self-check`, `pkg audit`,
  `snapshots-check`, local-path portability, repo-wide `biome`.
- **`node_modules` is a symlink**, so a dependency-resolution difference between
  this tree and a clean install would not be visible to me.
- **`MUT-DRAIN` blast radius was measured only within `loop.test.ts`** (91
  tests). `loop.ts` is imported widely; I did not re-run the whole suite under
  each mutation. I did run the full suite **unmutated** (§7).
- I did **not** review the ~104 non-fence files that differ between this stream
  branch and `main` (§3). My fence is the 8 files only.

---

## 2. FINDING-1 — the packet's fence claim is false (merge-blocking, not code-blocking)

**Packet claim** (verbatim): *"fence files reconciled to main 50a7cf09 at
23f71d5, so `git diff main..a29a9fe` for the 8 files is the item-20 delta ONLY"*.

**This is not true.** Measured:

| file | `main..a29a9fe` | fix commit alone | delta |
|---|---|---|---|
| `adapters/daemon-tmux.test.ts` | **80** changed lines | **58** | **+22** |
| other 7 fence files | identical | identical | — |
| **totals** | +261 / **−66** | +261 / **−44** | **−22** |

I diffed the two diffs. The difference is **37 lines, every one of them `<`**
(present in `main..cand`, absent from the fix commit) — i.e. purely content that
`main` has and this candidate does not. It is confined to **two hunks in one
file**:

1. An entire test — **`pointer early break reports the honest single Enter
   attempt`** (~20 lines) — present in `main`, **absent** from the candidate.
2. Two assertions deleted from a *surviving* test:
   `expect(output).toContain("ℹ️")` and
   `expect(output).toContain("after 3 Enter attempt(s)")`.

**Direction — proven, not assumed.** I traced both sources with `git log -S`:

| content | added by | in candidate ancestry? |
|---|---|---|
| `pointer early break reports the honest single Enter attempt` | `d5713a6` *fix(spawn): complete working-state remedy* | **NO** |
| `after 3 Enter attempt(s)` | `7db96d2` *feat(spawn): teach working-state remedy* | **NO** |

Both are `main`-only commits. So this is **branch-behind drift, NOT an item-20
regression** — the coder deleted nothing. The reconcile commit `23f71d5` shows
`loop.test.ts` and `loop.ts` **only**; it never covered `daemon-tmux.test.ts`,
which is why the claim over-reaches.

**Why it still matters.** The stream branch is 37 commits from a merge-base of
`10483d8e` (≠ `main`), and the full `main..a29a9fe` diff is **112 files, +6089 /
−3234** — including deletions of things `main` has (e.g.
`docs/specs/claude-copilot-sqlite-sockets-comms.md` −721,
`harness/scripts/pij-skill-check.test.ts` −83). If item 20 is merged by taking
this branch's content, `main` **loses a test it currently has**, silently.

**Remedy** — this is your own standing ruling (`0f1b2d0`: *"per-item
fresh-from-main is the merge unit"*): cherry-pick `a29a9fe` onto current `main`
as its own PR, exactly as item 18 (`df5b256`) was built. Item 18's shape —
merge-base **==** `main`, single commit — removed this entire hazard class
structurally; this branch reintroduces it.

---

## 3. Dim-0 mutation ledger — all mandated mutations RED on disk

Harness contract, enforced per mutation: **anchor must occur exactly once**
(refuses ambiguous edits), **old ≠ new** (refuses no-ops), sha256 recorded before
and after, then `git checkout --` restore with sha re-verified and
`git status --porcelain` asserted empty.

| # | mutation | file | mutated sha256 | RED at | scope |
|---|---|---|---|---|---|
| 1 | **MUT-T2-claude** | `claude-socket.ts` (line 152) | `26f5405d284a53c17b1e1c903b82f71054f2cd2f530bd239b677922d0ddc0ec4` | `claude-socket.test.ts:111:23` | **2** failed \| 5 passed |
| 2 | **MUT-T2-copilot** | `copilot-rpc.ts` (line 68) | `28dda62b69af295b35340fdecdc4a7e8bedcf99037a317222b0c670e228a347e` | `copilot-rpc.test.ts:139:23` | 1 failed \| 6 passed |
| 3 | **MUT-NAK** | `claude-socket.ts` (line 191) | `8d61c0bffc4fb64c63df5df2b8f5943b9a5c7ce899066f9a934af415b3aa4e47` | `claude-socket.test.ts:134:23` | 1 failed \| 6 passed |
| 4 | **MUT-DRAIN** | `loop.ts` (line 705) | `0a0ba1e87caa48a78745f8c974eaca8aeea8656eb1ca112f6a12fdfad5cbaef6` | `loop.test.ts:1361:17` | 1 failed \| 90 passed |
| 5 | **MUT-DRAIN + ENQUEUE** | `loop.ts` (705 + 709) | `118c5723b715a0e5428681a281da4ab1590c62a9b3bddb7576b374b89483bb6c` | `loop.test.ts:1361:17` | 1 failed \| 90 passed |
| P | **PROBE-FAKE-SILENT** | `claude-socket.test.ts` | `b03a569daac6d8e1784d0f968dba55e1ae1101d21470b1a0cc02df16a22eb11b` | `expected 'unverified' to be 'confirmed'` | 1 failed \| 6 passed |

**No RED line needs remapping.** Mutations 1–5 edit a *source* file while the
failure lands in an *untouched* test file, so 111 / 139 / 134 / 1361 are already
pristine numbering. Probe P edits a test file but is a same-length substitution
(`"confirm"` → `"silent"`); I verified the line count is unchanged.

Assertion messages are themselves informative:

- MUT-T2-claude/copilot: `expected 'failed' to be 'unverified'` — the T2 window.
- MUT-NAK: `expected 'unverified' to be 'failed'` — **the reverse direction**,
  which is the real proof that the explicit NAK is *not* clobbered by the
  `wrote` flag (Dim-1 §5.2).

---

## 4. MUT-DRAIN verified hardest — the duplicate OBSERVED, not inferred

The packet calls MUT-DRAIN *"THE OBS-04 PROOF … verify it hardest"*. The shipped
RED is **not sufficient on its own** to see the duplicate: vitest aborts the test
at the first failed assertion, which is `expect(first).toEqual([…])` at
**:1361**, so `expect(socketSends).toBe(1)` at **:1366** is *never reached*. The
RED message proves the consume-shape changed; it does not display a dup.

So I copied the suite to a scratch file (`i20probe.test.ts`, deleted at teardown
— **the repo test file was never modified**), hoisted the counters to the front,
and additionally **wrapped `ports.sendText` to count pane injections**. Result:

| tree state | socketSends | paneSends | retryDepth | secondDrain | meaning |
|---|---|---|---|---|---|
| **pristine** | 1 | 0 | 0 | 0 | **exactly once, by one transport** |
| **MUT-DRAIN** | 1 | **1** | 0 | 0 | **cross-transport dup** — bytes flushed to the socket **and** typed into the pane |
| **MUT-DRAIN + ENQUEUE** | **2** | 0 | **1** | — | **same-transport dup** — re-enqueued and re-sent |

**This is a better result than the packet expected.** Reverting the drain reveals
**two distinct duplicate mechanisms**, and the shipped test catches both:

- Drop `unverified` from the consume branch and it falls through to the **pane**
  path (`loop.ts:713` — *"`no-socket` (or any other outcome) → fall through"*),
  so the seat is messaged twice over two different transports. The test catches
  this via the missing `via: "socket"` key.
- Add `unverified` to the enqueue branch and it re-sends over the socket. The
  test catches this via `socketSends`.

The fix needs **both halves** (adapter returns `unverified`; drain consumes it),
and each half is independently pinned. The no-dup test is **non-vacuous**.

The paired test — *"retries a failed pre-write socket result exactly once from
the buffer"* (`socketSends === 2`) — is the other half of a **contrast pair**: it
pins that `failed` still retries. Together they fix the boundary from both sides,
so neither direction can be collapsed without a RED. This is the right shape and
worth saying out loud: a no-dup test alone could be satisfied by never sending
anything.

---

## 5. Dim-1 — semantic review

### 5.1 The `wrote` boundary flips exactly at the flush — **both directions confirmed**

`wrote = true` is set **inside** the `c.write(…, cb)` callback, *after* the `err`
check, on both transports. So:

| window | claude | copilot | outcome | pinned by |
|---|---|---|---|---|
| never connected / ENOENT | ✔ | ✔ | `failed` | *"reports failed (retryable) when the socket is absent"* / *"…when nothing listens on the port"* |
| connect timeout | `done({failed})` **hardcoded**, not `ambiguousFailure` | n/a | `failed` | (by construction) |
| `c.write` callback errors | `done({failed})` hardcoded | same | `failed` | (by construction) |
| socket **closes** after write, no status | ✔ | (5s timeout) | `unverified` | new `it.each` case `close` |
| ack window elapses after write | ✔ | ✔ | `unverified` | new `it.each` case `silent` / new copilot test |

Both directions are covered by tests, not just one. Note the boundary is
semantically right: Node's `write` callback fires when bytes are flushed **to the
kernel**, which is exactly the moment delivery becomes possible — so "might have
arrived" begins there.

Two `done({outcome:"failed"})` calls are deliberately **hardcoded** rather than
routed through `ambiguousFailure` (connect-timeout, write-callback error). Both
are pre-write by construction, so this is correct and clearer than relying on
`wrote` being false.

### 5.2 An explicit NAK stays `failed` even post-write — **confirmed by mutation**

`claude-socket.ts:191` calls `done({outcome:"failed", …})` **directly**, not
`ambiguousFailure`, so `wrote === true` cannot upgrade a `dropped` NAK to
`unverified`. MUT-NAK proves the test would catch a regression here
(`expected 'unverified' to be 'failed'`).

**The same principle is applied on the RPC side**, which the packet did not ask
about: `copilot-rpc.ts:102` — `if (msg.error) return done({outcome:"failed", …})`
— an explicit JSON-RPC refusal stays retry-safe. Consistent across both
transports. Good.

### 5.3 copilot: `wrote` only after a successful request write — confirmed, **plus a latent bug fixed**

The old code wrote the header and body as **two separate `c.write()` calls with
no callback**:

```ts
c.write(`Content-Length: ${body.length}\r\n\r\n`);
c.write(body);
```

A failure between them would leave a **header with no body** on the wire — a
half-frame that the server would block on. The new code concatenates into a
single `Buffer` and writes once with a callback. Byte-identical on the wire, but
now atomic at the call level and observable. This is a real robustness
improvement beyond the stated scope; the byte-exactness is still pinned by the
existing 3 KB prompt test.

### 5.4 The drain: `unverified` consumes, nothing else altered — **proven structurally**

`loop.ts` changed **four lines total, of which exactly one is behavioural**:

```
-	 *  caller falls back to `sendText`. `failed` = nothing landed (retry later).
+	 *  caller falls back to `sendText`. `unverified` = bytes flushed but no ack
+	 *  (consume to avoid a duplicate); `failed` = nothing landed (retry later).
-			if (outcome === "confirmed") {
+			if (outcome === "confirmed" || outcome === "unverified") {
```

That is the whole diff. So *"confirm no `failed`/`held`/`gone` case was altered"*
is not a judgement call — **there is no other changed line in the file**. The
`failed` → `enqueue` branch, the pointer path's `gone`/`held`/`failed` handling,
and the pane path are byte-identical to `main`.

`sendSocket` has **exactly one call site** (`loop.ts:704`) and **one
implementation** (`daemon-tmux.ts:281`), so widening the outcome union cannot
leak into an unhandled consumer.

### 5.5 The receipt chain — packet claim verified end-to-end (by reading)

The packet asserts *"Receipt: NO code change"*. I verified the whole chain rather
than the claim:

`drainTmuxInbox` pushes `{outcome:"unverified", via:"socket"}` → `daemon.ts:1219`
`channel.markRead(…)` + `:1230` `buffer.forget(…)` → `:1231-1232`
`emitSendReceipt(…)` → `:1456` `const state = outcome === "confirmed" ?
"delivered" : "unverified"` → `applyWaitReceipt` (`cli.ts:619-630`) removes the
target for **any** non-`queued` state → the sender's wait terminates.

The claim holds. Note `emitSendReceipt`'s existing comment already anticipated
this exact shape (*"the callers only reach here for `confirmed`/`unverified`"*) —
it was written for the pane path, and the socket path now legitimately joins it.
The message is also **marked read and forgotten**, which is the accepted
at-most-once-after-`unverified` trade-off, identical to the pane path. Correct
and consistent. See INFO-2 for the coverage nuance.

---

## 6. No-collateral proof — structural, not counted

Per E17/DL-012 I did not compare counts. My first attempt used a regex
declaration extractor and it **lied**: it reported `claude-socket.test.ts` as
having an *identical* 8-vs-8 declaration list, because it cannot see a multi-line
`it.each([…])("title")` — the exact form this change adds. **I discarded it.**

The authoritative method is vitest's own enumeration, `npx vitest list`, run in
both trees over the 4 touched test files and diffed with `comm`:

- `origin/main`: **140** tests · candidate: **146** tests
- **ADDED (7)** — all of them item-20's, none unexpected:
  - `claude-socket.test.ts` → `reports unverified after bytes flush but 'the socket closes'`
  - `claude-socket.test.ts` → `reports unverified after bytes flush but 'the acknowledgement window elapses'`
  - `copilot-rpc.test.ts` → `reports unverified when the request lands but its response is lost`
  - `daemon-tmux.test.ts` → `passes Claude unverified through without collapsing it to failed`
  - `daemon-tmux.test.ts` → `passes Copilot unverified through without collapsing it to failed`
  - `loop.test.ts` → `consumes an unverified socket write and never blindly sends it a second time`
  - `loop.test.ts` → `retries a failed pre-write socket result exactly once from the buffer`
- **REMOVED (1)** — `daemon-tmux.test.ts` → `pointer early break reports the
  honest single Enter attempt`. This is **FINDING-1**, and it is **not** an
  item-20 deletion (§2).

**Item 20 itself removes no test and weakens no test.**

---

## 7. Gates — reproduced first-hand

| gate | command | result |
|---|---|---|
| fence suites | `vitest run` × 4 files | **146 passed**, exit 0 |
| fence suites, post-restore | same | **146 passed** — final GREEN |
| **full suite** | `npx vitest run` | 235 files · **4608 passed \| 1 failed \| 19 skipped**, 174s |
| typecheck | `npx tsc --noEmit` | exit 0, **zero** output |
| lint | `npx biome check <8 fence files> --max-diagnostics=200` | exit 0 — *"Checked 8 files… No fixes applied"* |
| working tree | `git status --porcelain` | empty at every checkpoint |

**The one red, and the `gatesClean:false` claim.** The single failure is
`harness/scripts/release-age-policy.test.ts > restores the Windows caller
environment even when a governed command fails` → `Error: spawnSync pwsh ENOENT`.
That is **no PowerShell on this macOS host**, not a code fault.

I did not take that on trust: I ran the same file in the **`origin/main` tree**
and got the identical failure (`1 failed | 9 passed`). So it is **pre-existing,
host-dependent, and in `harness/scripts/` — outside the fence entirely**. The
packet's `gatesClean:false` characterisation is accurate, and **none of it
touches the 8 files**.

---

## 8. Teardown

- `/tmp/pij-i20` and `/tmp/pij-i20-main` — `git worktree remove --force`, verified gone.
- `i20probe.test.ts` scratch suite — deleted; `git status` empty afterwards.
- All 6 mutated files restored and re-verified **by sha256**, with an empty
  `git status --porcelain` asserted before each subsequent step.
- `/tmp/i20-*.py`, `/tmp/i20-*.txt`, `/tmp/i20-*.diff`, `/tmp/i20-cs-test.bak` — removed.
- No branch created; no commit; no push. The only repo artifact is **this file**.

---

## 9. Advisories (all NON-blocking for the code)

### ADV-1 — the happy-path `confirmed` now requires a positive ack, and that depends on an unverified external fact ⭑

**This is the finding I would most want a second opinion on.**

The change is larger than "T1/T2 conflation". It also flips the **default**:

| receiver behaviour after our bytes flush | pre-fix | post-fix |
|---|---|---|
| sends `peer_message_status` naming our `msg_id` | `confirmed` | `confirmed` |
| **says nothing** for `ackWaitMs` (150 ms) | **`confirmed`** (optimistic) | **`unverified`** |

Pre-fix, `setTimeout(() => done({outcome:"confirmed"}), ackWaitMs)` meant
*silence = success*. Post-fix, silence resolves through `ambiguousFailure` →
`unverified`, and `confirmed` is reachable **only** via the new
`st.orig_msg_id === msgId` branch.

**Proven, not argued** (probe P): reverting the test fake's default from
`"confirm"` to `"silent"` makes the *unchanged* happy-path test
(`delivers a 3 KB multi-line body byte-exact and reports confirmed`) fail with
`expected 'unverified' to be 'confirmed'`.

**This is specified, not smuggled** — dossier T002 says *"in `c.on("error")`/close
**and the no-status ack path**, return `wrote ? "unverified" : "failed"`"*, and
the dossier explicitly labels the old path *"(optimistic)"*. The coder
implemented what was asked. But:

- **`orig_msg_id` appears nowhere in the dossier.** The positive-ack branch is
  scope the coder **added**, and it is precisely what keeps `confirmed`
  reachable. Good instinct — but unreviewed against the spec that authorised the
  change.
- **Correctness now rests on an external fact I cannot verify here**: that a real
  Claude receiver emits `peer_message_status` carrying `orig_msg_id` on the
  **success** path, not only on drops. The repo's own prior art supports it
  (`reports/pij-comms-review-2026-08-27/d-prior-art.md:36` and
  `…-2026-08-27.md:108` — "ACK frame … `orig_msg_id`, `dropped_msg_ids`,
  `drop_reason`, `wereHeld`", sourced from the official docs plus `strings` of
  the 2.1.247 binary). That is good evidence. It is **not** an observation
  against a live peer, and I had none.

**Blast radius if the assumption is wrong** — I traced it, and it is bounded:
delivery still happens, the drain still consumes, no duplicate, no loss. What
breaks is **reporting**: every Claude socket send emits
`⚠️  claude SOCKET UNVERIFIED …` to the daemon's stderr, and every receipt reads
`unverified` instead of `delivered` (`daemon.ts:1456`). Noisy and
trust-eroding, not dangerous. Hence non-blocking.

**Recommended, and cheap**: one live `pij send` to a real Claude seat, confirming
the daemon log says `confirmed` and not `UNVERIFIED`. That single observation
closes this permanently. If it *does* say UNVERIFIED, the 150 ms `ackWaitMs` is
the next suspect before the protocol assumption is.

### ADV-2 — the fixture changed in the same commit in a way that preserves green across that flip

`listen(sockPath, mode = "confirm")` — the fake's **default** moved from silent
(old param `dropReason = ""`) to actively confirming. So the happy-path test's
green survives the semantic flip **because the fixture was taught to answer**,
not because production behaviour is unchanged. Its title and assertion are
byte-identical to `main`'s.

The new tests *do* pin both directions honestly, so this is not a hole in the
change — but it means **nothing in the suite would notice if the real receiver
went silent**. That is the same shape as the defect item 18's E6 ratchet exists
to close (a green gate certifying possibly-wrong text), one layer down: here a
green gate certifies possibly-wrong *protocol assumptions*. Worth a comment on
the fake naming the assumption and citing `d-prior-art.md:36`, so the next reader
knows the default is a claim about Claude, not a convenience.

### INFO-1 — packet line claims: 2 exact, 1 approximate, 1 wrong

The packet flagged its own lines as unverified; confirming the pattern:

| claim | actual | |
|---|---|---|
| `claude-socket.test.ts:111` | `:111:23` | ✅ exact |
| `claude-socket.test.ts:134` | `:134:23` | ✅ exact |
| `loop.test.ts:1361` | `:1361:17` | ✅ exact RED — though the *headline* no-dup assertion is `:1366`, never reached (§4) |
| `copilot-rpc.test.ts:137` | **blank line**; real RED is **`:139:23`** | ❌ wrong |

### INFO-2 — dossier T006 asked for a test; none was added

T006: *"test: an `unverified` socket delivery yields the sender a
delivered-unconfirmed receipt … (test only if no code change) … VERIFY + note"*.
No test file outside the 4 fence files changed, so no such test exists.

Defensible: the terminating mechanism **is** covered — `cli.test.ts:750` and
`:1698` both assert `applyWaitReceipt(…, {state:"unverified"})` drops the target
from `pending`. But the **composition** (socket `unverified` → `emitSendReceipt`
→ receipt → wait terminates) is pinned by no single test, and `emitSendReceipt`
has **no direct test at all** (it is private; zero matches in any `*.test.ts`). I
verified the composition **by reading** (§5.5), which is weaker than execution.
Non-blocking; worth one integration assertion later.

### INFO-3 — method note worth encoding: a declaration-list diff catches removed *tests*, not weakened *assertions*

The declaration-list diff correctly found the one missing test in §6 — and was
**structurally blind** to the two assertions deleted from a *surviving* test in
the same file (§2), which only the line diff revealed. A test can be gutted
without changing its name.

Two encodings for the ledger:

1. **Use `npx vitest list`, not a regex**, for declaration diffs — it is
   authoritative, expands `it.each` cases, and includes the full describe path. A
   hand-rolled regex silently under-counts exactly the constructs a change is
   most likely to add.
2. **Pair the name-list diff with a line diff** on the same files. Neither alone
   is a scope proof: the name list misses assertion deletions, and the line diff
   is too noisy to read as a list.

---

## 10. Bottom line

The OBS-04 fix is **right**. The `wrote` boundary is placed exactly at the flush,
in both directions, on both transports; explicit refusals (`dropped` NAK,
JSON-RPC `error`) correctly stay `failed` and retry-safe; the drain consumes
`unverified` in exactly one changed line, leaving every other outcome
byte-identical; and the no-dup test is non-vacuous against **both** duplicate
mechanisms — I observed the duplicate numerically rather than inferring it. It
also quietly fixes a latent partial-write bug on the RPC path. All four mandated
mutations RED on disk, sha-verified, restored, GREEN.

**Approve the change. Do not merge this branch.** Cherry-pick `a29a9fe` onto
current `main` as its own PR — the item-18 shape — because this stream branch is
behind `main` inside the fence and would take a test with it.

Then spend sixty seconds on **ADV-1**: send one live message to a real Claude
seat and check whether the log says `confirmed`. That is the only claim in this
change that the repo cannot answer for itself.

---

**Reviewed by**: `pij-wilful-morton` · **Candidate**: `a29a9fe5828a69d6b0495fd9c74479d65942b78b`
