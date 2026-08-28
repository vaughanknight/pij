# Cold-read verdict — packet A+B (34, 31b, 19 · 25, 26, 27, 28)

**Reviewer**: `pij-only-oramen` (copilot / Claude Opus 5), cold.
**Batch A**: `s391/handover-v0.2.0-a` @ `464ce95` — 34, 31b, 19.
**Batch B**: `s391/handover-v0.2.0-c` @ `4f08d42` — 25, 26, 27, 28.
**Code read at**: `d120c53`. `origin/main` was `b564ae2` when I read it; kept logs confirmed under `docs/plans/391-day3-core/kept-logs/` (PR #40).

## Scaffolding and the limit of this pass (stated before findings)

- `git show` into a scratch dir outside the repo. No worktree, no fetch, **no tracked file touched but this one**.
- Live reads, all read-only: `sqlite3 -readonly ~/.pij/queue/pij.sqlite`, one `python3 json.load` of `~/.pij/pij-gravitas-shortfall/watchdog.json`, `pij spine events --since`, and three `pij tail` invocations against an idle third-party seat. **I wrote nothing to `~/.pij` and never touched the daemon.**
- **I ran no tests.** Every `MUT-…` and every "must go RED" claim in all seven sections is **unverified by me**. I did not run `harness checks`, `just typecheck`, `just pij-skill-check`, or `npx vitest`. No build tool was executed in this pass at all.
- `4f08d42` also carries the batch-C re-read fixes; those are **outside this packet** and I did not re-review them here.

**Severity key**: `major` = a rebuilder would build the wrong thing or be blocked · `low` = imprecision · `info` = noted.

## Verdict summary

| § | Rebuildable by a stranger, without asking? | Blocking gap |
|---|---|---|
| 34 | **NO** | F-34-1 — the seat-side-writer correction is appended, not integrated; §1's opening bullets and §2's ruled invariant still carry the refuted daemon-side cause |
| 31b | **YES** | none. Every pointer exact; §7's one question is a rendering detail with a stated default |
| 19 | **NO** (by design, stated) | §2/§7 leave `N` genuinely undecided. Only defect: **F-19-1** (low), §4 presumes the answer |
| 25 | **NO** | F-25-1 — `pij state --json` anchored at `:~2905-2960`, which is `list --json` |
| 26 | **YES** | none blocking. **F-26-1/F-26-2** (low) — one symbol name that does not exist, one wrong doc file |
| 27 | **NO** | F-27-1 — the premise is false at the tag: `--type` **does** filter, end-to-end. Live-proved |
| 28 | **YES** | none. Every anchor exact; the cleanest section in the batch |

---

# Batch A

## § 34 — queue hygiene — **NO**

### The orchestrator's correction is **VERIFIED** (packet's extra check)

All three seat-side writers exist and **none consults the registry**:

| cited | at `d120c53` | registry check? |
|---|---|---|
| `core/session.ts:~697-703` | `:696` `private emitReceipt(r)` → `:698-703` `this.ports.delivery.deliver({ from: this.self, to: r.to, …, kind: "receipt" })` | **none** |
| `cli.ts:~1285-1292` | `:1285-1290` `channel.deliver({ from: self, to: action.to, body: receiptBody(action.messageId, "delivered"), kind: "receipt" })` | **none** |
| `core/cli.ts:~4858` | `:4854-4859` `deps.delivery.deliver({ from: self.value, to: current.from, body: briefAckBody(…), kind: "receipt" })` | **none** |

And `daemon.ts:1669-1690` is exactly as described — `emitSendReceipt` with `if (!this.registry.read(sender)) return;` at **`:1675`**, matching both MUT refs.

**Live proof re-run, read-only.** The three `from_id`s the correction cites are exact:

```
6841 | pij-gravitas-shortfall | queued        ← new since the section was written
6831 | pij-static-giraffe     | queued   ✅
6705 | pij-ordinary-raccoon   | queued   ✅
6493 | pij-gravitas-shortfall | queued   ✅
```

Ordinary seats, not the daemon. **The correction holds.**

The historical numbers also check out exactly:

| §1 claim | live now |
|---|---|
| 39 termite rows retired at seq 160-6251 | `pij-glorious-termite\|retired\|39\|160\|6251` ✅ **exact** |
| 17 older termite rows `failed` at seq 122-138 | `pij-glorious-termite\|failed\|17\|122\|138` ✅ **exact** |
| 80 queued to `pij-watchdog`, oldest seq 166 | `pij-watchdog\|queued\|82\|166\|6841` — oldest ✅ exact; count/newest have advanced (the leak is live) |

### F-34-1 (major) — the correction is appended, not integrated; §1 and §2 still teach the refuted cause

The correction sits as the **last** bullet of §1. Everything above it still asserts the diagnosis it overturns:

- §1 bullet 1: "119 queued rows: **78 daemon-authored receipts** addressed to pseudo-seat `pij-watchdog`…"
- §1 bullet 2: "The pseudo-seat leak **came from sending delivery receipts back to `message.from`**… Item 31 already inserted `if (!this.registry.read(sender)) return`…"
- §2 ruling 1: "**A daemon-authored row** is enqueued to its destination only when that destination has a registry record…"

Per the correction, the rows are **not** daemon-authored, so §2's ruled invariant does not cover the actual leak at all. §3's table row is correct and says so plainly ("Do NOT patch each writer. Put `canEnqueueTo(to)` in the shared `MessageChannel.deliver` / `sqlite-queue.ts enqueue` path"), and `MUT-RECEIPT-SEAT-WRITERS` is correctly scoped — but a stranger reading §1 → §2 in order builds the daemon-side guard, **which already shipped at `:1675`**, and never reaches the seam. Two of the section's own layers disagree with the third.

Fix: mark bullets 1–2 as the superseded reading (the `rulings.md:148-149` wording, which is the origin — row 148 says "78 **daemon-written** receipts", row 149 blames `daemon.ts:~1690`), and rewrite §2's first ruling to be writer-agnostic: *any* row of `kind: "receipt"` is enqueued only to a destination with a registry record.

### F-34-2 (low) — the sidecar evidence is not inline (packet's explicit extra check)

The packet requires the live-row evidence for **both** `pij-watchdog` queue rows **and** `~/.pij/pij-gravitas-shortfall/watchdog.json` to carry numbers inline. The queue half does. The sidecar half does not: §1 says only "the same dead seat remains in `pij-gravitas-shortfall`'s watcher sidecar beside live watcher `pij-vocal-kingfisher`" — **the file path never appears in the section**, and no timestamps or capture modes are given; it defers to `packet-addendum.md:14`.

I read the live sidecar. The claim is **true**, and here is what should be inline:

```
~/.pij/pij-gravitas-shortfall/watchdog.json
  pij-glorious-termite  addedAt 2026-08-22T04:11:18.853Z  capture=always    ← dissolved
  pij-vocal-kingfisher  addedAt 2026-08-28T04:16:25.490Z  capture=anomaly   ← live
```

`packet-addendum.md:14` does resolve on `main` and carries the path plus both names, so this is imprecision, not a dead end.

### F-34-3 (low) — moving numbers without an as-of stamp

§1's row-count bullet says "at handover time"; the correction bullet is stamped "~06:5xZ". They report different newest seqs (6705 vs 6831) for the same population, so a reader sees an apparent contradiction where there is only drift. Live is now 82 rows / newest 6841. Stamp the first figure the way the second one is.

### F-34-4 (info) — the third writer is a different animal

`core/cli.ts:4854` sends `briefAckBody(current.ack)` to `current.from` — the dispatch **brief-ack**, which §3 labels correctly as "CLI ack path". §1 folds it into "the source of the `pij-watchdog` rows"; only the first two writers plausibly produce watchdog receipts. Harmless once §3 is read, but it overstates the third writer's role in the specific leak.

### Verified exact in § 34

Every `§3` table anchor: `fs-registry.ts:402` `listTerminal()` · `channel-factory.ts:104` `sqliteOf` doc / `:150` end of `openChannel` · `sqlite-queue.ts:540` `/** Retire matching open deliveries` / `:683` `/** Read-only snapshot for pij queue` · `cli.ts:812` `function runQueue(` / `:897` · `watchdog-manager.ts:258` `reconcile(sessions…)` / `:681` `notifyWatchers(`. `daemon.ts:1000-1013` is `retireForClosedRecipients` with the **four-condition** closed-only predicate at `:1003-1009`, exactly as §1 and `MUT-QUEUE-CLOSED-ONLY` describe. `daemon.test.ts:2612-2631` is `it("drops a delivery receipt addressed back to an unregistered sensor id")` and it does use `new FsChannel(home)` with only `pij-daemon` — §1's "covers only `pij-daemon` through `FsChannel`, not both sensor ids through the production SQLite path" is **precisely right**. `rulings.md:148-151` and `packet-addendum.md:10-14` resolve verbatim.

## § 31b — subtree-aware stall — **YES**

Every pointer resolves, several to the exact line:

- `daemon.ts:920-925` → the comment block ending `this.pushWholeLifeTransition(current);` at `:925` ✅
- `daemon.ts:1199-1214` → the legacy detector: `:1202` `ageMs`, `:1203` `isWorking`, `:1204` `staleAfterMsFor`, `:1205` `const stalled = isWorking && staleAge`, `:1209` persists `failureReason: "stalled"`, `:1213` delivers the notice ✅ — §1's one-sentence description is line-accurate
- `:1202-1206` (MUT-SUBTREE-BYPASS) and `:1205-1214` (MUT-SUPPRESSION-LOG-LATCH) both land on the right hunks ✅
- `watchdog-manager.ts:367-374` → `staleAfterMsFor(id)` returning `Math.max(STALE_AFTER_MS, effectiveWatchdog(sidecar).intervalMs)` ✅ — "at least 60 seconds and respects longer configured intervals" is exact
- `core/binding.ts:296-317` → `:296` **is** `export function noticeRecipient`, `:297` **is** `descriptor.parentId ?? descriptor.spawnedBy ?? null`, and `recipientCandidate`'s liveness vocabulary is `:311-317` ✅ — both halves of the claim are inside the cited range
- `daemon.test.ts:1979` = `it("waits for a 20-minute seat interval before reporting legacy stalled")` ✅; `:2055` = the `it.each([` routing block ✅
- `rulings.md:155-156` carry the incident verbatim (`pij-falling-outside` while its coder worked) and the plan row naming `daemon.ts:~1206`; `:157-158` justify the "after item 34" ordering clause the same citation is attached to ✅

§2 correctly classifies the change as **a one-directional safety interlock** and states the test for it ("removing it produces the same notices or more, never a different positive action") — which is right: the clause can only suppress. §7's open question (multi-child log rendering) is a genuine rendering detail with a stated default, not a blocker.

## § 19 — pointer park — **NO** (blocked on a stated decision, by design)

The evidence and anchors are excellent; the item cannot be finished without answering §7's `N`, which the section says plainly.

Verified exact: `core/daemon/loop.ts:55` = `export const POINTER_LEASE_MS = 90_000;` ✅ · `sqlite-queue.ts:423-470` — `claim()` at `:425`, `settle()` at `:451`, and `settle`'s receipt at **`:469`** passes `row.attempt` **unchanged**, which is precisely §3's "preserves the prior attempt" ✅ · `:491-510` = `recoverStaleClaims`, with `const max = opts.maxAttempts ?? 6` at `:494`, `const parked = r.attempt >= max` at `:503`, and the generic `"lease-expired"` detail at `:509` ✅ — all three of §1/§2/§3's claims about the park path land on the line ·  `daemon.ts:1437-1444` contains **verbatim** the string MUT-POINTER-BYPASS-TRANSITION quotes: `sq.settle(seq, "injected", { leaseMs: POINTER_LEASE_MS })` at `:1442` ✅ · `daemon.delivery.test.ts:550` = `describe("dual-backend pointer delivery")` ✅ · `sqlite-queue.test.ts:230` = `it("parks a message after maxAttempts")` ✅.

**Spine seqs 26887 and 27574 resolve, and I checked the bodies rather than the refs.** Both are `task-set` events by `pij-relative-panther` on `node:pij-associated-louse`, and both assignment records contain the literal string **"19 (pointer rows never park)"** in their task text. "Recorded … in the s391 work order" is the exactly right description of what those rows are.

### F-19-1 (low) — §4 presumes the answer §7 leaves open

§2: "The unresolved design choice is whether N reuses the body-path default of six or gets a pointer-specific constant." §7 offers both. But §4's acceptance case is named `parks an unread pointer after **POINTER_MAX_ANNOUNCES**`, which presumes the new-constant branch. Say that the test name follows the decision, or name it neutrally.

---

# Batch B

## § 25 — busy-but-wedged stall — **NO**

### F-25-1 (major) — the `pij state` renderer anchor points at `pij list --json`

§3: "`.pi/extensions/pij/core/cli.ts` — `pij state` renderer (`:~2905-2960` json, text nearby): add `queued: N`."

At `d120c53`, `:2905-2960` is inside `case "list": {` (`:2861`) — it is the **`list --json`** literal (`:2900-2963`). The `state --json` literal is **`:3694-3747`**, inside `case "state": {` (`:3676`).

This is the same misattribution I proved in packet C against E5 — and it was corrected in E5 on **this very branch** (`4f08d42`), while section 25 still carries it. §4 requires `pij state <id>` and its `--json` to expose `queued: 2`; a rebuilder editing `:2905-2960` adds the field to `pij list --json` instead, and §4's `cli.integration.test.ts` assertion fails with no explanation in the section.

### F-25-2 (low) — wrong file for the `paused (compact)` string

§3: "`watchdog-scheduler-projection.ts` renders 'paused (compact)'." That file contains neither `paused` nor `compact`. The string is produced by `describeWatchdogState` in **`core/watchdog.ts:517`**, pinned at `core/watchdog.test.ts:483`.

### F-25-3 (low) — `DL-008` is not in `rulings.md`

§1 cites "DL-008 in `rulings.md`" and §6 repeats "DL-008/DL-015/DL-016". `docs/plans/391-day3-core/rulings.md` contains DL-001, 010, 013, 014, 015, 016, 017, 018, 019, 020 — **no DL-008**. The evidence is real and verbatim elsewhere: `391-day3-core-plan.md:541` — *"pij-mobile-reptile 2026-08-28 ~10:40–12:00Z (DL-008): >80 min on one turn, `Queued (4)`, daemon `working`, watchdog `paused (compact)`"* — and `tasks/phase-9-item-25-wedged-stall/tasks.md`. Repoint the citation. (DL-010, DL-015, DL-016 and DL-019 all **do** resolve in `rulings.md`, and `fleet.md` carries `pij-mobile-reptile` in 7 places.)

### Verified exact in § 25

`core/state.ts:112` = `export function systemStateOf(inputs: SystemStateInputs): SystemState {` ✅ · `runtime-axis.ts:94` = `persistDaemonWrite(this.deps.registry, { …, systemState: verdict })` ✅ · `pane-signals.ts:3` = `BUSY_WINDOW_MS = 1_000`, `:4` = `BUSY_BYTE_THRESHOLD = 256` ✅ both exact · `watchdog-manager.ts:~467` — `:466` `applyWorkingTransition(sidecar ?? {})`, `:467` `sidecar?.pausedBy === "compact"` ✅ · `daemon.ts:~1184` inside `pushWholeLifeTransition` ✅ · `composerLength` present in `pane-signals.ts:27-28`, and the section honestly marks it "re-grep". The AC-23b framing ("growth is liveness", so `N` counts only STATIC-buffer minutes) is a real inversion caught before build, and §6's note pinning the Copilot composer string to a named CLI version is exactly the right instinct.

## § 26 — pane move is not death — **YES** (two low findings)

### F-26-1 (low) — `diffPaneSets` does not exist

Cited three times (§1 "(`PaneSetDiff` `:16`, `diffPaneSets`)", §3 "`diffPaneSets` (`:~45-54`)", §6's E34 rule "not only `diffPaneSets`"). The symbol has **zero hits in the whole extension**. The real function is **`diffPaneListings`**, `pane-signals.ts:46-56`. The cited **range is correct** (`:45` is its doc comment), so a reader who follows the line number lands on it; only a reader who greps the name is stuck. Rename in all three places.

### F-26-2 (low) — `DL-009` is not in `rulings.md`

Same class as F-25-3. Content is verbatim at `391-day3-core-plan.md:559` — *"pij-powerful-whale 2026-08-28 12:07Z (DL-009): 'has exited; terminal absence … unrequested-by-pij' during `tmux join-pane`, bound seconds later"* — and in `tasks/phase-10-item-26-pane-move-not-death/tasks.md` and `fleet.md`.

### Verified exact in § 26

`pane-signals.ts:16` = `export interface PaneSetDiff {` ✅ · `:709` = `reconcile(listings: readonly PaneListing[]): PaneSetDiff {` ✅ · `death-reconciler.ts:214` = `export function reconcileDeaths(input: DeathReconcileInput)` ✅ · `:139` = `function noticeText(` ✅ · `daemon.ts:~470` — the call `if (outcome === "gone") this.unbindGonePane(paneId);` is at `:469` ✅, and §3 honestly says the definition needs a grep (it is `:318`) · `refreshPaneSignals` `~:1597` — definition at `:1596` ✅. MUT-26d (drop the start-time check → PID-reuse case RED) is a genuinely good mutant: it targets the exact failure mode item 15's helper exists to prevent.

## § 27 — `pij tail --type` — **NO** (the premise is false at the tag)

### F-27-1 (major) — `--type` is implemented end-to-end; the section says it is "accepted and ignored"

§1: *"the tail handler never reads `type` (grep `\.type` in the tail execution path: no consumer)."* Falsified by the executor's second statement. The full chain at `d120c53`:

```
core/cli.ts:1306          type: typeof flags.type === "string" ? flags.type : undefined   (parse)
core/cli.ts:3653          .read({ since: cmd.since, type: cmd.type, last: cmd.lines })    (executor — the consumer)
adapters/event-log.ts:65  read(query) { return filterEvents(this.readAll(), query); }
core/events.ts:27-30      if (query.type !== undefined) out = out.filter((e) => e.type === type);
```

**Live read-only proof** (seat `pij-evolutionary-centipede`, whose log holds 4 events, all `type: "message"`):

```
$ pij tail <id> --lines 3                 → 3 rows rendered (type column: message)
$ pij tail <id> --type receipt --lines 3  → (no events)        ← the filter EXCLUDES
```

If `--type` were parsed-and-dropped, the second command would have printed the same three `message` rows. It printed none.

Consequences: §3's prescribed change ("the tail executor … add the filter there, before rendering, for both text and `--json`") would **duplicate an existing filter**; MUT-27a ("drop the filter call") and MUT-27b ("filter on `kind !== type`") describe mutating code the section asserts does not exist — and would in fact land in `core/events.ts:29`, a file §3 never names.

### F-27-2 (info) — one clause of AC-25 is genuinely unbuilt; rescope the item to it

```
$ pij tail <id> --type bogus --lines 3   → (no events)   exit 0
```

No `E-ARG`, no valid-kinds list. AC-25's *"an unknown `--type` is `E-ARG` naming the valid kinds"* is real and open, as is §2's "enumerate from the renderer, not from memory". A second candidate worth surveying before rescoping: the filter matches `e.type` exactly, while §2 describes the kinds "the tail renderer already distinguishes" — if those differ, `--type receipt` may not match what a user sees in the `type` column. That would be the item's real defect, and it is a different one from the section's premise.

### Verified exact in § 27

`core/cli.ts:1296` = the usage string naming `--type T` ✅ · `:1301` = `if (flags.type === true) return err("E-ARG", "--type takes an event type");` ✅ — "rejects a bare `--type`" exact · `:1306` ✅ · parse range `:1290-1310` contains `case "tail": {` at `:1293` ✅ · executor `case "tail"` at `:3648` ✅.

## § 28 — dead relay must queue — **YES** (cleanest in the batch)

Every anchor is exact, and §1's reasoning is the strongest in either batch: it finds the **precedent already in the code** rather than arguing from principle.

```
core/cli.ts:2232   function preflightSendTargets(          ← §3's ":2232-2260"
core/cli.ts:2245-2246   targetLiveness === "dissolved" ||
                        (targetLiveness === "dead" && descriptor.deliveryMode !== "pull")
core/cli.ts:2249   return err("E-DEAD", `session ${id} is ${why}`);
```

§1's claim — *"a `dead` target with `deliveryMode === "pull"` is allowed through (`:2245-2248`); the relay branch is the same shape with `descriptor.relay === true`"* — is exactly what the condition says. Also exact: `core/types.ts:239` = `readonly relay?: boolean;` · `core/cli.ts:1928` = `const relay = d.relay === true;` · `:2288` = `return { receipt: "delivered" };` · `:2397` = `if (result.receipt === "delivered") return "delivered: peer was idle";` · `:4619` = the `deliveryState` ternary.

The status line honestly flags the item as "Partly overtaken" by item 29 while explaining why the refusal path still loses the message in the remaining window — and §6's third bullet reasons correctly that a client-side sqlite queue write succeeds even when the daemon is down, which is why queuing is the right answer. §7 is legitimately empty.

---

## Cross-checks

**E-rules (packet check 2).** Every `§6` E-rule cited across all seven sections — E22, E29, E34, E35, E40, E42, E43, E45, E47 — resolves in `docs/handover/v0.2.0/README.md`. Every encode row cited (E19, E20, E21, E25) exists in `government/briefs/encode-candidates-2026-08-27.md`, and §27/§28 label those as encode rows rather than README rules. **Clean.** (Contrast batch C, where E3 cited a non-existent README "E26".)

**Frame docs `00-live-system.md` / `01-shipped-map.md` (check 5).** No contradictions.
- 28's "the bridge runs in-process under the daemon and is auto-restarted (item 29, PR #26)" matches `00-live-system.md` word for word.
- 26's "reuse item 15's pid + start-time liveness helper" matches the frame's item 15 / lock line.
- 34's freeze-then-restart live procedure matches the frame's restart procedure.
- 34's only internal conflict is with **itself** (F-34-1), not with the frame — though note the frame's ancestor `rulings.md:148-149` is where the "daemon-written" reading originates, so correcting §1 should not silently contradict a ruling row without saying it is superseded.

**Machine-local paths (check 3).** None found in any of the seven sections. 34's live queries are written as reproducible read-only SQL against `~/.pij/queue/pij.sqlite` with the exact statement inline; 19 and 31b point at kept artefacts and spine seqs; 25/26 point at `fleet.md` and plan rows. This is a clear improvement on batch C.

---

## What I did NOT adequately examine

1. **Every mutant, in all seven sections** — MUT-QUEUE-* (7), MUT-SUBTREE-*/MUT-CHILD-* (6), MUT-POINTER-* (5), MUT-25a–d, MUT-26a–d, MUT-27a–c, MUT-28a–c. I ran no tests at all in this pass.
2. **The gates** — no `vitest`, `typecheck`, `pij-skill-check`, or `harness checks`. Where a section says "the existing tests pin X", I confirmed the test **exists and its title matches**; I did not run it or read its body except for `daemon.test.ts:2612-2631`.
3. **34's terminal-classifier design** — I verified the current closed-only predicate exactly, but did not evaluate whether the proposed four reason classes (`recipient-closed/dissolved/failed/dead`) are exhaustive against real descriptor states.
4. **31b's `daemon.test.ts:2055-2089`** — I confirmed `:2055` is an `it.each([` block but did not read its cases, so "drives the real daemon stall notice and parent/spawner routing" is unverified beyond the anchor.
5. **19's `POINTER_LEASE_MS` arithmetic** — "six announcements span nine minutes" follows from 90 s × 6, but I did not check whether a real long turn exceeds it; that is exactly §7's open question and it needs Vaughan, not me.
6. **25's pane-signal design** — I verified the anchors but not that `paneGrowthMs`/`composerQueued` can actually be sourced from the existing pane tap, nor the `Queued (N) ctrl+q to manage` parse against a real wedged Copilot pane.
7. **27's residual** — I proved the filter works and that `--type bogus` exits 0, but did **not** enumerate the renderer's displayed kinds against `e.type` values, so I cannot say whether `--type` matches what users see. My live sample had exactly one event type (`message`).
8. **26's re-attach mechanism** — `tmux list-panes -a -F '#{pane_id} #{window_id} #{pane_pid}'` and the pid-chain adoption were not exercised.

---

## Recommendation

Ranked by cost to fix:

1. **§27** — needs a re-survey before it is dispatched; the item as written would produce a duplicate filter. The real remainder (unknown-`--type` → `E-ARG`, plus the kinds enumeration) is a genuinely smaller item than the section describes.
2. **§34** — integrate the correction into §1's opening bullets and §2's first ruling; add the sidecar numbers inline. §3 is already right, which is why this is an editing fix, not a re-survey.
3. **§25** — repoint the `state --json` anchor to `:3694-3747` (the fix E5 already took on the same branch), plus two low citation fixes.
4. **§26** — rename `diffPaneSets` → `diffPaneListings` in three places; repoint DL-009.
5. **§19** — one clause so §4's test name does not pre-answer §7.
6. **§31b, §28** — nothing. Both are ready as written.

**This pass is CLOSED.** Terminal: no mutation run after writing it, no pass open on my side.

---

# Re-read

**Scope**: fixes only. A `464ce95..72a612f`, B `4f08d42..b0f0b6c`. Code re-read at `d120c53`; live probes at 2026-08-28 06:16Z.

**PR #43 carries exactly what I reviewed.** All seven files on `s391/handover-v0.2.0-sections-ab` @ `d70f27d` are **byte-identical blobs** to the fix commits (`git rev-parse` on each of the 14 paths). PR #43 is OPEN on that branch. This verdict applies to the PR head without re-reading it.

Same scaffolding as the first pass: `git show` only, no worktree, **no tracked file touched but this one**, and **no tests run**. Where a fix claimed a finding closed, I re-ran my original probe.

## Fix verdict

| § | Fixes correct? | New / residual |
|---|---|---|
| 34 | **YES** on F-34-2 and F-34-3; **MOSTLY** on F-34-1 | **RR-34-1** (low) — §1 bullet 2 still teaches the refuted framing · **RR-34-2** (low) — the as-of stamp is ~40 min ahead of the reading |
| 19 | **YES** — F-19-1 closed, better than asked | none |
| 25 | **YES** — F-25-1/2/3 all closed | none |
| 26 | **YES** — F-26-1/2 closed | none |
| 27 | **YES** on the premise — F-27-1 fully closed, F-27-2 correctly promoted to the item | **RR-27-1 (major)** — the rescope's kinds list rests on an "event `type` union" that does not exist · **RR-27-2** (low) — `DL-023` is cited but unwritten |

---

## § 34 — fixes **YES** on two of three; one residual

**F-34-2 CLOSED, exactly.** The sidecar evidence is now inline with the path and every value, and it matches what I read from the live file byte for byte:

```
~/.pij/pij-gravitas-shortfall/watchdog.json
  pij-glorious-termite   addedAt 2026-08-22T04:11:18.853Z   capture: always
  pij-vocal-kingfisher   addedAt 2026-08-28T04:16:25.490Z   capture: anomaly
```

**F-34-1 mostly closed — the two important halves are fixed.**

- §1 bullet 1 now leads with the correction: "78 receipts addressed to pseudo-seat `pij-watchdog` — **written by the READING seats, not the daemon** (see the correction at the end of this section…)" ✅
- §2's first invariant is now writer-agnostic and names all four writers with the exact ranges I verified: "Any `kind: "receipt"` row — whichever writer produces it (`core/session.ts:696-703`, `cli.ts:1285-1290`, `core/cli.ts:4854-4859`, or the daemon's already-guarded `emitSendReceipt` at `daemon.ts:1675`) — is enqueued only when its destination has a registry record … **enforced ONCE in the shared enqueue seam**" ✅ — this is the ruling the item needed, and §2 now agrees with §3.

### RR-34-1 (low) — §1 bullet 2 is unchanged and still points at the daemon guard

My finding named bullets 1 **and** 2. Bullet 2 survives verbatim:

> "The pseudo-seat leak came from sending delivery receipts back to `message.from` even when that sender had no registry row; Item 31 already inserted `if (!this.registry.read(sender)) return`, but its test covers only `pij-daemon` through `FsChannel`…"

The first clause is still true generically (no writer checks the registry), but the second frames the remaining work as a **test gap in the daemon guard** — the refuted framing, one line after bullet 1 says the daemon is not the writer. Downgraded from major to **low**, because the reader now meets the correction first and §2 is unambiguous; it should still be reworded so the section does not argue with itself in consecutive bullets.

### RR-34-2 (low) — the as-of stamp is ahead of the reading it stamps

The new text reads "82 rows at seq 166–6841 **as of 2026-08-28 ~06:5xZ**". Those are my numbers, measured at ~06:0xZ. `~06:5xZ` is the *correction episode's* stamp, and it is **~40 minutes in the future** of the current clock:

```
now UTC                     2026-08-28T06:16Z
live re-measure at 06:16Z   83 rows | seq 166–6975 | newest created 2026-08-28 06:16:10Z
```

The count moved 82 → 83 and the max seq 6841 → 6975 in ~11 minutes, so the section is right that it grows with every nudge read — which is exactly why the stamp must be the *measurement* time, not the episode's. (Honest note: the `~06:5xZ` stamp was already in `464ce95` and **I did not flag it in pass 1**; the fix inherited it and attached it to a new figure.)

**F-34-3 CLOSED** in substance — the figure now carries a range, a stamp and the "growing with every nudge read" caveat, which is what was missing.

**F-34-4** (info, the brief-ack writer) not addressed; still info.

## § 19 — fixes **YES**

F-19-1 closed and better than I asked: the case is now `parks an unread pointer after the ruled announcement budget`, with the reason inline — "(the constant's name — `POINTER_MAX_ANNOUNCES` vs the shared `maxAttempts` — is § 7's open question; the test name must not presume it)". The item stays a **NO** on rebuildability for the reason it always did: `N` needs Vaughan. That is stated, and legitimate.

## § 25 — fixes **YES**, all three

- **F-25-1 CLOSED, with a guard against recurrence**: "`pij state` renderer: `case "state"` `:3676`, `--json` literal `:3694-3747`, text renderer beside it: add `queued: N` (**NOT `:2900-2963`, which is `list --json`**)." Both anchors match my extraction exactly, and the negative anchor uses the true literal bounds (`:2900-2963`, not the original `:2905-2960`).
- **F-25-2 CLOSED**: "the `paused (compact)` status string is rendered in `core/watchdog.ts:517` (not the scheduler projection)" ✅ exact.
- **F-25-3 CLOSED** in both places: §1 and §6 now read "DL-008 recorded in `docs/plans/391-day3-core/391-day3-core-plan.md:541`, not in rulings.md", and §6 separates DL-015/DL-016 as `rulings.md` — which is right, both resolve there.

## § 26 — fixes **YES**, both

- **F-26-1 CLOSED** in all three places (§1, §3, §6's E34 rule): `diffPaneListings`. §3's new range `:46-54` lands on the declaration and body (the function is `:46-56`; only the closing brace falls outside, and no content is lost by the cut).
- **F-26-2 CLOSED**: DL-009 repointed to `391-day3-core-plan.md:559` in §1 and §6.

## § 27 — the rescope is **right**, and it introduces one major

**F-27-1 fully closed, and handled well.** The title, §1 and §3 now state the corrected premise with the chain and my live proof, and §1 explicitly labels the plan's Phase 11 premise as FALSE at the tag rather than quietly dropping it. §3 now says "executor `:3650-3656` … and `core/events.ts:27-30` are the existing filter — **do not duplicate it**". **F-27-2 correctly promoted** to be the item, and MUT-27c is now a regression guard on the existing filter. §6's new self-referential lesson ("verify a premise by running it before writing acceptance for it") is the right encode.

### RR-27-1 (major) — the kinds list is anchored to a union that does not exist

§2: "Valid kinds = the `type` values the event log records (`core/events.ts` — **the event `type` union**; enumerate from the type definition, not from memory)."
§4 MUT-27b: "a test that asserts the message names **EVERY member of the event-type union** RED."

At `d120c53` there is no such union, and `core/events.ts` does not define the field at all:

```
core/types.ts:515  export interface PijEvent {
core/types.ts:516      readonly seq: number;
core/types.ts:517      readonly timestamp: string;
core/types.ts:518      readonly type: string;      ← free string, not a union
core/types.ts:519      readonly data?: unknown;
```

So the instruction "enumerate from the type definition" cannot be followed, MUT-27b has nothing to be complete against, and — the part that actually matters — **validating `--type` against a closed set requires first deciding what that set is**, which is a design decision the rescope does not flag. On an open `string` field, rejecting an unknown kind risks refusing a legitimate type some producer emits.

It is fixable and small, because the set **is** derivable from the emit sites. At `d120c53` there are exactly four:

```
index.ts:432   session?.capture("tool_call",  event)
index.ts:435   session?.capture("tool_result", event)
index.ts:436   session?.capture("message",     event)
core/session.ts:472,546,562,570,574,585,648,697   this.capture("receipt", …)   ← 8 sites
```

Across every live seat log on this machine only `message` actually appears (890 events; `receipt`/`tool_call`/`tool_result` come from paths these seats do not exercise) — so a survey based on live data alone would have produced a one-element list. Suggested rewording: enumerate from the `capture(...)` emit sites above, name the four, and make MUT-27b "add a fifth emit site without updating the list → RED", which is a real completeness sensor against an open field.

### RR-27-2 (low) — `DL-023` is cited but does not exist

§6 attributes the new lesson to "(DL-023)". There is no `DL-023` anywhere in `docs/plans/391-day3-core/` — `rulings.md` runs DL-001, 010, 013, 014, 015, 016, 017, 018, 019, 020. Either write the row or drop the id; a handover that cites an unwritten ruling sends a stranger looking for a record that is not there. (This is the same class as the DL-008/DL-009 findings this very commit fixed.)

---

## Limits of this re-read

**No tests run in either pass.** Every mutant across all seven sections remains unverified by me — including the three replaced MUT-27a/b/c and the regression pins. I did not run `vitest`, `typecheck`, `pij-skill-check`, or `harness checks`; no build tool was executed in this pass at all.

New claims I did **not** check: 34's terminal-classifier design and `REVIVE_PENDING_MAX_MS`; 25's pane-signal feasibility; 26's re-attach mechanism; 19's `N × 90 s` adequacy; and whether `core/events.ts:29`'s exact `e.type` match agrees with the `type` column the tail renderer prints — I sized the emit sites but did not compare them to `renderEventLine`'s output.

## Recommendation

**RR-27-1 is the only one worth another turn** — it is a design gap the rescope inherited from a premise correction, and it decides whether the item is buildable. RR-34-1, RR-34-2 and RR-27-2 are one-line edits. §19, §25, §26 and §28 are ready.

**This re-read is CLOSED.** Terminal: no mutation run after writing it, no pass open on my side.
