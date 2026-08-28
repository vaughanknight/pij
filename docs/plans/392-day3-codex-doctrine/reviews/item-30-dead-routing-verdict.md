# Item 30 — dead-routing / prime-resolution — COLD REVIEW VERDICT

**TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or tree change was run
after this file was written. Reviewer: `pij-wilful-morton` (cold). Date: 2026-08-28.

**Candidate**: `c0a879877704aef6baf93bc5961d937dfdd53426`
**Base**: `7117164` (= `origin/main` at review time, re-derived; `git merge-base origin/main c0a8798` = `7117164`)

---

## VERDICT: ✅ **CONDITIONAL APPROVE**

The routing logic is **correct on every behaviour I probed**. Precedence, the
no-fall-through-to-prime rule, the pre-delivery recheck, the watcher-roster
resolution and the "none → guidance" terminus all behave as specified, and I
verified each by execution rather than by re-reading the report.

One condition, one strong recommendation:

- **C1 (condition — user-facing, live human channel)**: the new `GUIDANCE` string tells
  the operator to run **`pij watch pij-telegram`**. That is the *file-watch* command.
  The roster routing actually reads is written by **`pij watchdog watch`**. The only
  recovery instruction for the only "your message went nowhere" state is wrong, and it
  is pinned by two tests. One-string fix.
- **C2 (strong recommendation — test gap on the headline invariant)**: the media
  pre-download recheck (`bridge.ts:468`) has **no covering test**. I mutated it alone and
  measured the harm: the file **downloads** and a notice is **queued to a dead seat**,
  with **no reply to the operator at all**. That is "dead → gone, NEVER queued" failing
  silently. A ready-made discriminating probe is in §7.2.

Neither is a defect in shipped behaviour. C1 is wrong *text*; C2 is a missing *sensor*
over correct code.

---

## 1. Scaffolding (stated before findings)

Three throwaway detached worktrees off the canonical checkout, `node_modules` symlinked:

| tree | commit | role |
|---|---|---|
| `/tmp/pij-i30-cand` | `c0a8798` | candidate |
| `/tmp/pij-i30-main` | `7117164` | pre-fix control (= base) |
| `/tmp/pij-i30-impl` | `8733724` | impl-only (built, unused in the end) |

The candidate's real parent chain is `c0a8798 → 8733724 → 7117164`, and `7117164` **is**
current `origin/main`. So no cherry-pick was needed to isolate the delta:
`git diff 7117164..c0a8798` **is** the item-30 change and nothing else.

Harness `/tmp/i30-mut.py` + drivers, enforcing my standing invariants: pristine-sha
precondition, empty-porcelain precondition, anchor-uniqueness, no-op refusal, printed
mutated sha, restore-and-verify. Every mutation below restored **sha-identical** with an
empty porcelain.

### 1.1 What I did NOT examine

State plainly, so an unexamined item does not read as a clean one:

- **No live proof.** Nothing was exercised against the real Telegram channel or a real
  prime. Every "dead seat", "newly dead" and "watching prime" is a fake `isAlive` /
  injected roster. C1's consequence for Vaughan is inferred from the CLI's own behaviour
  (§7.1), not observed on the phone.
- **`pij watchdog watch pij-telegram` was never run to completion.** It refused in my
  sandbox (`E-NOID: no session 'pij-telegram' in registry`) because I did not stand up a
  registry. I proved the *store* identity by reading both adapters and by mutating the
  sidecar path (S11), not by writing a roster through the real CLI end-to-end.
- **No concurrency / race testing.** The TOCTOU window is argued from source ordering plus
  a fresh-read proof (§5.2), not from a forced interleaving.
- **Telegram API failure modes untested** (`ctx.reply` throwing, network loss). Pre-existing.
- **The 2 `.skip`ped telegram tests** were not investigated.
- **Perf/scale of the new double registry scan** (§8, A4) is an observation from reading
  `FsRegistry.list`, not a measurement.

### 1.2 Defects in my own scaffolding (disclosed)

My first run of the 8 split mutants reported **"ALL SILENT"** — completely wrong. My
result parser matched on `Tests ` / `×` against raw vitest output, and **ANSI escape
codes** meant nothing ever matched, so "no failures parsed" was rendered as "silent". The
tell was that the counts column was empty on *every* row, including runs I already knew
were RED. I added ANSI stripping, an `__EXIT__ <code>` marker, and an **abort if no vitest
summary is parsed at all**, then re-ran everything. All results in this report are from the
fixed harness. Had I trusted the first run I would have filed six false findings.

### 1.3 Pristine shas (candidate)

```
bridge.ts       0f7b4b6e1f51d583cb41b69e6e77208daf6e770dd58df8353364851635b2a164
bridge.test.ts  4338993940763fbb6cd8399c4d51caf4493de2cbf9c3e1e43ce4a33034b467c9
index.test.ts   32b5f2f3eb35af1f7cd50d6bcbf78e9a76f303f7f67b0fe159222d70c49e7772
index.ts        34c699d645b72db39963580b2c801bb3c92e484700b5e596cf252bee508423f6
```

---

## 2. Gates

| gate | result |
|---|---|
| telegram fence baseline | **228 passed \| 2 skipped** — matches the packet to the digit |
| `tsc --noEmit` | exit 0 |
| `biome check` (telegram) | clean, 18 files |
| full repo suite | **1 failed \| 4777 passed \| 19 skipped** |

The single full-suite failure is `release-age-policy.test.ts > restores the Windows caller
environment…` → `spawnSync pwsh ENOENT`. I re-ran that file **on the base tree** and it
fails identically → **environmental (no PowerShell on this host), not collateral.**

---

## 3. Supplied mechanical oracles (E37) — all RED, all restored

Run through my harness; each applied, verified non-vacuous, run, reverted, sha-verified.

| oracle | packet claim | observed | mutated sha (bridge.ts) |
|---|---|---|---|
| `MUT-PRIME-RESOLUTION-LASTSPEAKER` | RED 3, incl. `index.test.ts:411` | **RED 3** — `bridge.test.ts:515`, `bridge.test.ts:679`, `index.test.ts:411` | `9759b768…09d51e` |
| `MUT-ALIVE-CHECK` | RED 6 | **RED 6** — `141`, `287`, `592`, `609`, `715`, `2136` | `826328e8…ef2242` |
| `MUT-DEAD-NEVER-QUEUED` | RED 1 (`bridge.test.ts:609`) | **RED 1** — `bridge.test.ts:609` | `97bc4f1d…6e9f4c` |

### 3.1 Line-claim accuracy — 100%

I check these because prior packets in this stream carried wrong lines. This one is exact:

- `bridge.test.ts:515` ✓ (assertion inside the `:477` watching-prime test)
- `index.test.ts:411` ✓ · the unnamed "one more" = `bridge.test.ts:679` ✓
- `bridge.test.ts:609` ✓ (`expect(isAlive).toHaveBeenCalledTimes(2)`)
- the cited newly-dead race test at **`bridge.test.ts:596`** ✓ (exact declaration line)

**Second packet in a row with every line claim correct.**

---

## 4. Splitting the composite oracle — where the two gaps are

`MUT-ALIVE-CHECK` mutates `liveSessionById` itself, so **one patch disables five call
sites at once**. A composite RED cannot tell you which sites are sensored. I mutated each
determinant separately (12 mutants, each restored sha-identical):

| # | site | `bridge.ts` | verdict | reddened |
|---|---|---|---|---|
| S1 | reply-tag aliveness | `:218` | ✅ RED | 1 |
| S2 | explicit-address aliveness | `:236` | ✅ RED | 2 |
| S3 | pre-**delivery** recheck (deliver/prime) | `:395` | ✅ RED | 1 |
| **S4** | pre-**selection** recheck (address) | **`:409`** | 🔴 **SILENT** (228 = exact baseline) | 0 |
| **S5** | media pre-**download** recheck | **`:468`** | 🔴 **SILENT** (228 = exact baseline) | 0 |
| S6 | `effectivePrime` aliveness | `:177` | ✅ RED | 1 |
| S7 | `effectivePrime` prime-flag | `:177` | ✅ RED | 1 |
| S8 | `effectivePrime` recency sort | `:175` | ✅ RED | 1 |
| S9 | `persistedBridgeWatchers` → `[]` | `:183` | ✅ RED | 2 |
| S10 | leading-`@` strip | `:234` | ✅ RED | 1 |
| S11 | watcher sidecar dir (`dirname`) | `:186` | ✅ RED | 2 |
| S13 | absent-session treated as live | `:156` | ✅ RED | 18 |

S6/S7 mutate the two *independent* determinants of `effectivePrime` separately (a single
combined mutant would not have proved both), and S8 kills the ordering. S13 answers a
worry raised by the declaration diff — the old *absent*-session reply tests were rewritten
to *registered-but-dead*; S13 shows the absent case is still very heavily sensored (18).

**The composite oracle's 6 REDs come from S1/S2/S3 — the resolution-time checks. Neither
of the two *pre-delivery* rechecks it appears to cover is actually covered.**

---

## 5. Independent verification of the review asks

Everything below is measured output, not restated numbers.

### 5.1 Ask 1/3/4/7 — routing semantics (`routeMessage`, direct probe)

Sessions: `alpha`(101), `bravo`(102), `charlie`(103, prime), `delta`(104, prime).

| probe | input | result |
|---|---|---|
| P1 **precedence, all three plausible at once** | reply-tag `alpha`, text `"bravo hello"`, watcher `charlie` | `deliver → pij-alpha`, body **`"bravo hello"`** (leading word kept as prose) |
| P2 explicit > prime | `"bravo hello"`, watcher `charlie` | `deliver → pij-bravo`, body `"hello"` |
| P3 bare → prime, WHOLE text | `"hello   world"` | `prime → pij-charlie`, body `"hello   world"` (internal spacing preserved) |
| P4 **dead reply target must not fall through** | reply-tag `alpha` dead, live watching prime present | `gone: pij-alpha` — **not** the prime |
| P5 **dead explicit target must not fall through** | `"alpha hi"`, alpha dead | `gone: pij-alpha` — **not** the prime |
| P6 live prime **not watching** | no watchers | `guidance` (not a guess) |
| P7 watcher absent from registry | watcher `pij-ghost` | `guidance` |
| P8/P9 newest wins regardless of roster order | delta newer, listed last / first | `prime → pij-delta` both ways |
| P13 unmatched leading token | `"zzz not a session"` | `prime`, body `"zzz not a session"` (nothing dropped) |
| P14 unmatched `@` token | `"@zzz hello"` | `prime`, body `"@zzz hello"` (the `@` is preserved) |

P4/P5 are the important ones: **a dead explicit/reply target is reported, never quietly
re-aimed at whoever happens to be prime.** That is the misroute this item exists to prevent.

`goneNotice` names the seat, confirmed verbatim from a live probe:
`"pij-target isn't live any more — /list to see who's around."`

### 5.2 Ask 2 — is the recheck a *real* pre-delivery recheck?

Yes, and I checked the part that could have made it hollow. The recheck calls
`deps.listSessions()` **again**; in production that is `rt.registry.list()` →
`FsRegistry.list()` (`fs-registry.ts:382`), which does a fresh `readdirSync` + per-file
read on **every** call with **no memoisation**, and `isAlive` is the real `isProcessAlive`
probe. So the second check reads genuinely current state, not the snapshot routing used.

Observed on the shipped TOCTOU test and on my own probes: `isAlive` is called **twice**
per inbound text (resolution, then recheck) and drops to **1** the moment a recheck is removed
— a clean, direct sensor for "the second look happened".

Honest scoping: the window is **narrowed to the two statements between the recheck and
`deps.deliver(...)`**, not *closed*. It cannot be closed — a seat can die after any check.
The claim I can support is "smallest achievable window, on a fresh read".

### 5.3 Ask 3 — what "watching" actually means

`persistedBridgeWatchers` reads `new FsWatchdogStore(dirname(bridge.dataDir)).read("pij-telegram").watchers`
→ **`~/.pij/pij-telegram/watchdog.json`**, the roster written by `pij watchdog watch`.
Confirmed as load-bearing by S9 (roster → `[]` reds 2) and S11 (wrong directory reds 2), so
the production sidecar path is genuinely pinned end-to-end, not just unit-mocked.

"Newest" = descending `addedAt`, and it dominates roster order (P8/P9). "Watching" is
strictly the roster — mere liveness is not enough (P6), and a roster entry that is not a
live prime is skipped (S6/S7, P7). "None" → `guidance`, never a guess.

### 5.4 Ask 5 — is last-speaker fully retired?

From routing, **yes**. No production path consumes it: the only `routeMessage` inputs are
`sessions`, `quoted`, `watchers`, `isAlive`. Repo-wide (`--hidden`), the surviving
references are `bridge.ts:117/119` (the interface field, documented as the oracle seam) and
`index.ts:181/193/231` (the map that still records speech).

The retirement is **positively** proved, not just asserted: `index.test.ts:411` first makes
`pij-agent-a` speak successfully (so the real last-speaker map at `index.ts:231` *is*
populated through the production path), then asserts the bare message lands on the watching
prime and `expect(receivedA).toEqual([])`. `MUT-PRIME-RESOLUTION-LASTSPEAKER` reds it.
So the rewritten case is genuinely sensored, and the residual map is live-but-inert (§8 A3).

### 5.5 Ask 6 — E40

There is no `uncoveredTouchedProductionLines` tooling in the repo, so this is only
checkable by coverage. **The claim needs qualifying:**

- **Execution coverage — plausibly empty.** `:409` and `:468` are both *executed* by
  existing tests (they run and take the false branch).
- **Mutation coverage — not empty.** `:409` and `:468` each have **zero** covering tests
  (S4, S5 both silent at the exact baseline).

A line that runs but whose removal changes nothing has no covering test in the sense this
item cares about. I'd report E40 as "2 touched production lines uncovered".

### 5.6 Ask 7 — no collateral, no silent loss

**Structural (`vitest list`, not counts).** 223 → 228. 19 removed / 24 added. I mapped
every removal: 17 are same-case renames (`last speaker` → `watching prime`), 1
(`returns gone when the recorded last speaker is absent…`) dies with the retired concept,
and 1 — `shares successful outbound speech with numeric inbound chat ids and isolates other
chats` — has **no counterpart** (§8, A2). The 7 genuinely-new cases are the dead/TOCTOU/`@`/tie/roster ones.

**Line-level (declaration diffs are blind to assertions deleted from a *surviving* test).**
I extracted each test body by name and compared the 76 + 29 same-name intersections:
9 bodies changed, **every one with an identical `expect(` count** (they changed only because
`routeMessage`'s signature did). `index.test.ts` 125 → 119 expects, fully accounted for by
the one removed test. The deleted `settleWhile` helper had exactly one caller — that test.
**No surviving test lost an assertion.**

**Silent-loss sweep of the handlers.** Text: `deliver`/`prime` → delivered or gone-reply;
`address` → selected or gone-reply; `guidance` → replied; `gone` → replied. Media: `gone`,
no-target, over-cap, vanished-before-download and download-failure **all** reply — the
`vanished` branch newly gained `await ctx.reply(goneNotice(...))` in this diff. One silent
branch remains (`downloadMedia === undefined` → "dropping", no reply) but it is
**pre-existing and unreachable in production** — `index.ts:198` always wires the downloader.

---

## 6. Findings

### 6.1 — C1 · **MAJOR / condition** · the guidance names the wrong command

`bridge.ts:63`

```
"Address a live session, e.g. `osn hello`, or have the prime run `pij watch pij-telegram`; /list shows who's around."
```

Routing resolves primes from **`~/.pij/pij-telegram/watchdog.json` → `watchers[]`**
(`FsWatchdogStore`, `watchdog-store.ts:72`), which is written by **`pij watchdog watch`**.

`pij watch` is a **different command against a different store**. I ran the real CLI in a
sandboxed `PIJ_HOME` rather than inferring it:

```
$ pij watch --help
pij watch — subscribe this non-pi peer to file changes
USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>

$ pij watch pij-telegram
E-NOID: no such session 'pij-wilful-morton'      ← resolves the CALLER; "pij-telegram" is a GLOB

$ pij watchdog watch pij-telegram
E-NOID: no session 'pij-telegram' in registry    ← resolves the TARGET; this is the roster command
```

`pij watch` writes `FsWatchStore` → `~/.pij/<caller>/watches.json` (`watches[]`, a
`{dir, patterns, …}` shape). It can never add anyone to `pij-telegram`'s watchdog roster.

**Consequence on the live human channel.** `guidance` is emitted in exactly one situation:
Vaughan's message reached the bridge and was delivered to **nobody**. It is the sole
recovery instruction, and following it does not work — the prime registers a file-glob
literally named `pij-telegram`, the roster stays empty, the next message returns the same
guidance. A silent-loss bug and a wrong-recovery-instruction bug cost the operator the same
hour at 2am.

**It is cemented by tests.** The wrong string is asserted at `bridge.test.ts:577` and
`index.test.ts:446`, so it will survive refactors.

**Fix**: `pij watch pij-telegram` → `pij watchdog watch pij-telegram` in `bridge.ts:63`
plus the two assertions. If some other mechanism is intended to populate the roster, then
the *comment* at `bridge.ts:119`/the packet's ask 3 (both of which also say "`pij watch`")
should say which — but the code unambiguously reads the watchdog roster.

### 6.2 — C2 · **MAJOR (test gap)** · media pre-download recheck is unsensored

`bridge.ts:468`. S5 replaces `liveSessionById(target.to, …, isAlive)` with
`sessionById(target.to, …)` — dropping only the aliveness half of the *media* recheck.
**Suite stays at 228 passed | 2 skipped, the exact baseline.**

The existing media test (`an explicitly addressed dead media target replies gone and
downloads NOTHING`) uses a *statically* dead pid, so it is caught upstream by S2 at
resolution time and never reaches `:468`. `MUT-ALIVE-CHECK` reds it for the same reason.
**Nothing tests this line.**

Measured harm — newly-dead target (`isAlive` true once, then false), same technique as the
shipped text-path TOCTOU test:

| tree | isAlive calls | download | deliver | reply to operator |
|---|---|---|---|---|
| pristine | 2 | 0 | 0 | `"pij-target isn't live any more…"` |
| **S5 mutated** | 1 | **1** | **1** | **`[]` — none** |

The mutated `deliver` payload is a real attachment notice queued to the dead seat:
`{"from":"pij-telegram","to":"pij-target","body":"[telegram media] saved to …/pij-target/attachments/photo_u-big.jpg …"}`.

So the failure is: the file is fetched, written into a dead seat's attachments dir, a
message is **queued to a corpse**, and **the operator is told nothing at all**. That is
precisely the invariant this item is named after, on the one path that has no sensor.

**Ready-made discriminating probe** (RED under S5 only, GREEN pristine and under S4 —
I verified that discrimination):

```ts
it("rechecks liveness before DOWNLOAD so newly dead media is never queued", async () => {
	const download = vi.fn(async (_ctx: unknown, _dest: string) => {});
	const target = desc({ id: "pij-target", pid: 2222 });
	const isAlive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
	const { bot, deliver, replies } = makeBridge([target], [ALLOWED], undefined, download, isAlive);
	await bot.handleUpdate(mediaUpdate({ kind: "photo", fromId: ALLOWED, caption: "target look" }));
	expect(isAlive).toHaveBeenCalledTimes(2);
	expect(download).not.toHaveBeenCalled();
	expect(deliver).not.toHaveBeenCalled();
	expect(replies().at(-1)).toContain("pij-target");
});
```

### 6.3 — C3 · **MODERATE (test gap)** · address-path pre-selection recheck is unsensored

`bridge.ts:409`. S4 short-circuits the `address` recheck. **Suite stays at exact baseline.**

Measured harm — bare address `"target"` of a newly-dead seat:

| tree | isAlive calls | reply |
|---|---|---|
| pristine | 2 | `"pij-target isn't live any more — /list to see who's around."` |
| **S4 mutated** | 1 | **`"Now addressing pij-target. Send a message and I'll relay it."`** |

Nothing is queued (no delivery on this path), so it does not break "never queued" — but the
bot makes a **false liveness claim** about a seat that just died and sets `selectedTarget`
to it, so `/tail` then points at a corpse. Lower severity than C2, same root cause. Probe:

```ts
it("rechecks liveness before SELECTION so a newly dead seat is not reported addressable", async () => {
	const target = desc({ id: "pij-target", pid: 2222 });
	const isAlive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
	const { bot, replies } = makeBridge([target], [ALLOWED], undefined, undefined, isAlive);
	await bot.handleUpdate(textUpdate({ fromId: ALLOWED, text: "target" }));
	expect(isAlive).toHaveBeenCalledTimes(2);
	expect(replies().at(-1)).not.toContain("Now addressing");
	expect(replies().at(-1)).toContain("pij-target");
});
```

### 6.4 — C4 · **packet/report correction, no code action**

1. `MUT-ALIVE-CHECK` is a **five-site composite**. Its 6 REDs all come from the
   resolution-time sites; it gives no evidence about `:409` or `:468`. A single RED from a
   patch that mutates a shared helper should not be read as coverage of its call sites.
2. The E40 claim holds only in the execution-coverage sense (§5.5).
3. `MUT-PRIME-RESOLUTION-LASTSPEAKER` is a **partial** reintroduction — it injects the last
   speaker as a synthetic watcher, so it still has to pass `effectivePrime`'s
   `prime === true && isAlive` filter. The historical behaviour routed to the last speaker
   regardless of prime status or liveness. It is a perfectly good differential for "the
   roster decides, not the speaker" (and it does RED 3), but it is not a faithful revert,
   so it does not by itself prove the *old* heuristic is unreachable. §5.4 covers that gap.

---

## 7. Advisories (no action required for this PR)

- **A1 · exact `addedAt` tie is roster-order-dependent.** `[...watchers].sort((a,b) =>
  b.addedAt.localeCompare(a.addedAt))` returns 0 on equal timestamps and `Array.sort` is
  stable, so the winner is whichever entry the sidecar happens to list first. Measured both
  directions: `[charlie, delta]` → **charlie**; `[delta, charlie]` → **delta**. Narrow
  (needs two same-millisecond registrations) and not a loss — either way it is a live
  watching prime — but "tie → most recent" is not what happens; "tie → file order" is.
  I also checked the `localeCompare` choice for ICU divergence on ISO strings and found
  none: mixed precision (`…00.5Z` vs `…00.000Z`) orders chronologically, and
  `localeCompare` agreed with codepoint comparison (+1) on the same pair.
- **A2 · per-chat isolation for routing is retired by design.** The removed
  `…numeric inbound chat ids and isolates other chats` test has no successor because the
  prime is global: any allowlisted user in any chat now reaches the same prime. Access
  control is still `allowedUserIds`, so this is not a security change — but it is a real
  behaviour change and the last test that pinned cross-chat behaviour is gone. Worth one
  sentence in the PR body.
- **A3 · `index.ts:181/193/231` is live-but-inert production state.** The last-speaker map
  is still written on every successful outbound forward and handed to `BridgeDeps`, but no
  production consumer reads it. It is honestly documented at `bridge.ts:117` as the oracle
  seam, and it *is* still exercised (§5.4), so this is deliberate — but it is a loaded gun
  for a future contributor who sees a populated map and uses it. Consider deleting it once
  `MUT-PRIME-RESOLUTION-LASTSPEAKER` has served its purpose.
- **A4 · two full registry scans + one sidecar read per inbound message.** `listSessions()`
  is called once for routing and again for the recheck, and each is an uncached
  `readdirSync` + per-file read; `persistedBridgeWatchers` adds a `watchdog.json` read.
  Correct and cheap at human message rates — noting it only so the cost is a known choice.
- **A5 · the leading-`@` strip (`bridge.ts:234`) is an undocumented behaviour change.** It
  is tested (S10 reds it) and safe on the miss path (P14 keeps the whole text), but it is
  not mentioned in the packet's "what changed". A message beginning `@name` that happens to
  match a session now routes there instead of to the prime.
- **A6 · pre-existing silent branch**, `downloadMedia === undefined` → logs "dropping",
  no reply. Unreachable in production (`index.ts:198`). Not touched by this diff.

---

## 8. Credit

- Baseline, all three oracle counts, and **every claimed line number** were exactly right —
  `515` / `411` / `679`, `609`, and the `:596` race-test citation. Second packet running.
- The TOCTOU test's `isAlive` **call-count** assertion (`toHaveBeenCalledTimes(2)`) is a
  better sensor than an outcome assertion: it fails the moment the second look disappears,
  regardless of whether the outcome happens to coincide. It is what made S3 red cleanly and
  what made S4/S5's silence unambiguous.
- `expect(receivedA).toEqual([])` in `index.test.ts` proves the retirement **positively** —
  through the real `startBridge` path, with the last-speaker map genuinely populated —
  rather than by asserting the absence of a code path.
- Dead reply/explicit targets correctly refuse to fall through to a prime (P4/P5). Getting
  that wrong would have been the worst possible bug here: silently re-aiming the operator's
  message at someone they did not address.

---

## 9. Teardown

All scaffolding removed: 3 worktrees pruned, `/tmp` harness + sandbox home deleted, all four
fence files sha-verified pristine, `git status --porcelain` empty in the candidate and base
trees. No commit, branch, or push was made by me. The only file I wrote to the repository is
this verdict.

---

## 10. Bottom line

The routing rewrite does what it says: precedence is right, dead targets are reported and
never re-aimed or queued, the recheck is a genuine fresh read, the roster is the real
persisted sidecar, and the last-speaker heuristic is gone from every production path and
positively proved gone. Static gates clean, no collateral anywhere in 4777 tests, and the
packet's own claims verified to the line.

**Ship it after fixing one string** (`pij watch` → `pij watchdog watch`, C1) — the one place
this change speaks directly to Vaughan is the one place it gives him an instruction that
cannot work. And **add the media recheck test** (C2): the headline invariant of this item
currently has no sensor on the media path, and its failure mode is the silent one.

**Candidate reviewed:**

c0a879877704aef6baf93bc5961d937dfdd53426
