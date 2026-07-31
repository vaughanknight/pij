# s179 — plan-lite: merge 89 upstream commits without losing the local delivery fixes

**Worktree**: `~/GitHub/pij-worktrees/s179-upstream-merge` (local `main` tip `717ebe1`, 6 ahead / 89 behind `origin/main` @ `3e977b7`).
**Status**: **EXECUTED** — merged at `989f023`, ruling upheld by prime, gates and end-to-end proof recorded in §5.

---

## 1. The vocabulary ruling — **supersede local, adopt upstream verbatim**

The brief asked whether upstream's `held`/`failed` subsume local `injected-unverified`. Both sides were read. The answer is sharper than subsumption: **upstream's `unverified` IS local's `injected-unverified`, under a different name** — and local's `unverified` is the state upstream split into `failed`/`gone` and *documented as a bug*.

Evidence, from the two implementations:

| state | upstream (`origin/main:core/ports.ts:42`) | local (`HEAD:core/ports.ts:29`) |
|---|---|---|
| `confirmed` | typed AND submission positively observed | same |
| `unverified` | "the payload **WAS typed**, but submission could not be confirmed. Replaying could duplicate an already-accepted turn, so the caller consumes." | typed-but-unconfirmed is named **`injected-unverified`**; `unverified` means "the send **threw before anything was typed**" |
| `held` | composer had live human input, **nothing typed**, retry next tick | — (absent) |
| `failed` | threw before submission, nothing landed, caller must retry — **explicitly split from `unverified` in plan 071 D7 because "collapsing the two let the caller consume the ONLY durable copy of a message that was never typed"** | conflated into `unverified` |
| `gone` | pane does not exist → **permanent**; unbind the stale binding, leave message unconsumed | conflated into `unverified` |

So upstream's post-071 `unverified` carries exactly the semantics s127 wanted the new word for, and the *reason* s127 needed a new word — that `unverified` was already taken by the throw path — no longer holds upstream, because that path is now `failed`/`gone`.

**Ruling: adopt upstream's 5-word union unchanged. Retire the word `injected-unverified`; keep 100% of the behaviour s127 bought.**

Nothing is lost at the receipt seam. Upstream's send loop (`daemon.ts:523-545`) returns early on `gone` and requeues on `held`/`failed` **without emitting a receipt at all** — only `confirmed`/`unverified` reach `emitSendReceipt`. So the 3-word `ReceiptState` stays honest under the merge:
- `delivered` ⇔ submission positively verified (unchanged invariant: never for unsubmitted text),
- `unverified` ⇔ text is sitting in a composer, submission unconfirmed — precisely the swallowed-Enter wedge s127 exposed,
- "nothing landed" never produces a receipt; the message stays queued/unconsumed.

Union (keeping 6 words) was rejected: it adds a 4th receipt word that every downstream parser (`pij send --wait`, `pij tail`, the trex Jumbotron) must learn, to express information the 5-word union already carries.

**This is the one judgment call in the merge — prime can overrule it at GO.** If overruled, the fallback is Option B (union): keep `injected-unverified` in `SendOutcome`/`ReceiptState`/`RECEIPT_RE` alongside upstream's five, and leave upstream `unverified` unreachable from the injection path.

### What must survive from s127 — the load-bearing part is the loop body, not the type

Upstream **still has the swallowed-Enter lie**: `origin/main:adapters/daemon-tmux.ts:409` reads `if (!wake) return "confirmed";` — claude/codex fire one Enter and blindly report confirmed. s127's real fix was deleting that line, and the 89 upstream commits never touched it. Three behaviours to carry forward (git auto-merged `daemon-tmux.ts` with no conflict and, in the trial, kept all three — to be re-verified line-by-line, not trusted):

1. **Deletion of `if (!wake) return "confirmed";`** — submission verification runs for every harness, not just copilot. *(the whole point of s127)*
2. **Ghost-text tail break** — `if (!composerHasTextTail(lastPane, text) || composerIsEmpty(lastPane)) break;` vs upstream's `if (composerIsEmpty(lastPane)) break;`, so claude's dim `[2m` suggestion placeholder reads as "payload gone", not "still pending" (no Enter-hammering, no false unverified).
3. **Generalised stderr** — `⚠️ ${harness} …` rather than the copilot-only wording, since the path is now reachable by every harness. Word changes from `INJECTED-UNVERIFIED` to `UNVERIFIED` under the ruling.

Plus s127's independent rider, which upstream has no equivalent of (upstream's tick loop at `daemon.ts:1169` never touches the lock mtime):

4. **`touchDaemonHeartbeat(lockPath)`** after each non-throwing tick. Upstream split the loop into two timers (`tick` @600ms, `deliverPass` @`DELIVERY_PASS_MS`) — the heartbeat stays on the **tick** timer only, unchanged in intent.

---

## 2. Conflict inventory (measured, trial merge)

3 files, 6 hunks. Every one is mechanical once the ruling above is fixed.

| file | hunks | resolution |
|---|---|---|
| `core/ports.ts` | 1 | take upstream union + doc block verbatim |
| `core/daemon.ts` | 1 | import line — union both: `HarnessKind` (upstream) is needed; `ReceiptState` (local) is dropped with the word |
| `daemon.test.ts` | 4 | **both tests survive**: upstream's gone-unbinds-seat test, and local's honesty test rewritten to assert an `unverified` receipt (never `delivered`) for a typed-but-unconfirmed claude send |

Auto-merged but delivery-critical, so re-read by hand before gating: `adapters/daemon-tmux.ts`, `core/types.ts`, `core/message.ts`, `core/daemon/loop.ts`, `adapters/daemon-tmux.test.ts`, `core/message.test.ts`. `types.ts` and `message.ts` auto-merged to the **local** 4-word `ReceiptState` / regex — those revert to upstream's 3-word form under the ruling, and `injectedUnverifiedAt` is dropped.

Local-only stacks (s113 telegram media, `producers/` OSC-7337, docs) did not conflict; they ride along and are covered by the suite.

---

## 3. Exec steps

1. `git merge origin/main`; resolve the 6 hunks per §2.
2. Hand-audit the six auto-merged delivery files; re-assert the four s127 behaviours by grep + read.
3. Sweep every `injected-unverified` occurrence out of code, tests and docs (`docs/plans/127-*/PLAN.md` gets a superseded-by-s179 note rather than a rewrite — it is a historical record).
4. Gate: `npm run typecheck`, `npm run lint`, `npm test` — all green, full output cited.
5. **End-to-end delivery proof** (the claim that matters): spawn a throwaway claude seat *from this worktree's build*, send it a message, confirm (a) arrival in the peer's turn, (b) the receipt word is honest — `delivered` only on a genuinely submitted message. Second leg: force the wedge (or fake the outcome at the port) and confirm the receipt reads `unverified`, never `delivered`.
6. Write §4 note; report gate-green + HEAD SHA to prime.

**Not doing** (brief §5, restated): no `npm link`, no touching `~/GitHub/pij`, no daemon restart, no merge to local `main`, no screencapture. The live daemon serving the trex fleet is untouched by every step above. The e2e seat in step 5 is spawned and closed inside this stream.

---

## 4. `now/next` for the trex Jumbotron (consumer note — first read, confirm at exec)

`pij report now "<did>" "<next>" [--state <word>] [--note <text>]` (`cli.ts:284`) writes four fields onto the seat's registry descriptor (`core/types.ts:339-346`), externally-owned so the daemon never clobbers them (`core/registry-write.ts:88`):

- `statusPrev: string` — the `<did>` argument ("previous projected status word")
- `statusNext: string` — the `<next>` argument
- `statusAt: string` — ISO-8601 of the transition (**this is the staleness clock**)
- `statusSeq: number` — monotonic spine sequence of the transition

Jumbotron reads them from `pij node show <id> --json` (`core/cli.ts:4866`); the human-rendered line is `core/cli.ts:4907`: `report: <prev> → <next> (<at>, spine <seq>)`. Optional companions on the same descriptor: `semanticState` and `stateNote {text, state, at}` (from `--state`/`--note`).

Staleness: `core/status-nudge.ts` treats a card as stale at **`STATUS_NUDGE_AFTER_MS = 10min`** measured from `statusAt ?? startedAt`; `statusAt === undefined` means *never reported*. A Jumbotron should use the same threshold and the same "never reported" distinction rather than inventing one. The trex side is a separate stream.

Confirmed live at exec: upstream's own suite carries `report now round-trips state-set → status and projects the durable denorm` ✓. Independently, `pij report now` does **not** exist on the currently installed CLI (it prints usage) — the Jumbotron's now/next card arrives only with this merge.

---

## 5. Results

**Merge**: `989f023`, 89 commits, 3 conflicted files / 6 hunks resolved per §1–2.

**Carry-forwards, verified by `git diff origin/main -- adapters/daemon-tmux.ts`** (the whole diff vs upstream is these changes and nothing else — the file auto-merged silently, which is exactly why it was audited rather than trusted):

1. `if (!wake) return "confirmed";` — **deleted**, so submission verification runs for every harness.
2. Ghost-text tail break — `!composerHasTextTail(lastPane, text) || composerIsEmpty(lastPane)`, kept.
3. Warning generalised to `${harness} UNVERIFIED`, kept.
4. `touchDaemonHeartbeat(lockPath)` on the **tick** timer (upstream split tick/delivery in two), kept.

**Gates**
- `npm run typecheck` — clean, no output.
- `npm test` — **3834 passed**, 19 skipped, **1 failed**: `spawnSync pwsh ENOENT` in `harness/scripts/release-age-policy.test.ts`, a Windows-compat test on a host with no PowerShell. That file is byte-identical to `origin/main`; not a merge regression.
- `npm run lint` — **not green repo-wide**: 12 errors across 9 files. Every erroring file is byte-identical to its pre-merge parent (6 to `origin/main`, 3 to local `717ebe1`), so the merge introduced none of them. The 8 files this merge touched pass `biome check` clean.

**End-to-end delivery proof** — real tmux, real `DaemonTmux`, real `Daemon.tick()`, against a **temp pij home and a throwaway tmux session**; the live `~/.pij` and the running daemon were never read or written (harness: `scratchpad/e2e-s179.mts`).

- **Leg 1 — real claude seat.** Message injected into a live `claude` pane; the seat received it *and acted on it*, replying `⏺ ARRIVED`. Receipt: `[pij receipt …-000001-77764] delivered`.
- **Leg 2 — forced wedge (the one that matters).** A pane that echoes typed text but can never produce a submission signal. The payload was visibly typed, three Enter attempts were made, no confirmation followed; stderr logged `⚠️ claude UNVERIFIED: … typed the payload but never confirmed submission across 3 Enter attempts`. Receipt: `[pij receipt …-000002-77764] unverified` — **never `delivered`**.

Both legs ran in the same tick sequence from one sender, so the two receipt words were produced side by side by the same code path. Teardown removed the tmux session and the temp home; `pij list` still shows the same 6 live sessions.
