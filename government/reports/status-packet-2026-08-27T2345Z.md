# pij status packet — 2026-08-27 23:45Z (for kingfisher's HTML report to Vaughan)
Author: pij-relative-panther (pij o-prime). Facts verified at 23:4xZ from `gh pr list --state merged`, `pij daemon status`, `git merge-base`.

## 1. Live on the daemon now
- Daemon pid 82643, running source sha **188c877**, restart **#5** (2026-08-27 20:52Z). Queue backend **sqlite** (`~/.pij/queue/pij.sqlite`). Telegram bridge runs **in-process** under daemon supervision (item 29).
- Live = merged PRs #1–#26 (day-3 items), one line each:
  - #1 item 3b — Telegram bridge consumes the sqlite queue (at-least-once) + honest pull-seat receipt
  - #2 item 6 — spawn gates Copilot `--context long_context` per model
  - #3 item 1a — CLI flushes piped stdio before exit (64 KiB truncation class)
  - #4 item 3c — pi in-process receiver consumes the sqlite queue
  - #5 item 7 — pointer-delivery doctrine follows the pty-clip precondition (docs)
  - #6 FX001 — test witnesses pane-less tick exclusion (closes PR #1 gap)
  - #7 item 9 — pij-skill-check debt cleared, semantics preserved
  - #8 item 11 — skill-check order false-positive + read-back back-pressure
  - #9 item 1 — `pij queue retire`, closed-recipient sweep, revive un-retire, PA totality, listing ergonomics
  - #10 item 9-FX — restore test-pinned route strings (unRED main)
  - #11 item 5 + finding C — honest pointer-path "unverified" line; dual-backend pointer/recovery
  - #12 item 12 — skill-check hardened against decoy bypass
  - #13 item 10a+10b — pane-misbind guard: lifecycle-filtered resolver + bind identity check
  - #14 item 1b — dispatch records retired for closed seats; `pij dispatch-retire`
  - #15 item 14 — docs: `report state done` does not silence the watchdog (C9)
  - #16 — standalone comms spec `docs/specs/claude-copilot-sqlite-sockets-comms.md`
  - #17 — issue title/body files as filed on AI-Substrate/pij#311
  - #18 item 4 — `--state working` rejection and status-stale detail carry the remedy
  - #19 item 17 — bind-guard diagnostics hardened
  - #20 item 18 — watchdog doc pinned to `buildWatchdogTurn` output (E6 ratchet)
  - #21 item 20 — no duplicate delivery after a transport ack-loss
  - #22 item 6b — gemini-3.6-flash on Copilot: isolation record, honest instability mark, warn-don't-block
  - #23 item 23 — transport receipt honesty: `sent` outcome + defer to durable ack
  - #24 item 13 — registry serializes descriptor publishes; caller-baseline exact writes
  - #25 item 21 — bind-refusal notice gaps closed
  - #26 item 29 — Telegram bridge supervised: dies loud, daemon auto-restarts it, runs in-process

## 2. Merged to main but NOT live
- **PR #27 item 15** (main `bab9854`): stale spine/platform write-lock release on graceful stop + dead-pid/start-time reclaim; 1b acceptance follow-ups. Verified 4065/0, tsc 0. Carried by **restart #6**.
- Checkout `~/GitHub/pij` is at `6534b61` = bab9854 + government-only commits (no source delta beyond #27).
- Restart #6 will ALSO carry whatever of 24 / 29b-T001 / 30 has merged by then (see §6); it is gated on 24 + 29b-T001.

## 3. Open defects / known gaps (honest list)
- **Receipt semantics on the Claude-socket path**: a durable `acked (reader=X)` row is written by the daemon at injection — it proves *injected to the seat's socket*, not *read*. Claude's runtime emits no positive ack on success. Copilot RPC `messageId` and Telegram bridge acks ARE positive acks. Honest labelling (marker origin) = **item 23b**, not yet built. Spec §14 needs this erratum (rides item 24's PR; issue #311 comment to follow).
- **Item 24 — Telegram bridge duplicates after an internal retry** (Vaughan saw a duplicate line on his phone, 17:46Z). Fix is on its 3rd pre-merge fold: each review round found a real phone-channel bug (positional skip-set under partition drift = silent tail loss; then a caption-scope fix re-introduced a duplicate on attachment notices; unsensored identity halves). Held until the invariant is proven by mutants. Until it lands: the live behaviour is a **noisy duplicate, never a loss**.
- **29b — bridge-restart owner notice reaches nobody on this machine** (daemon log: "expected one live prime, found 3"). Fix (notice via `pij-telegram` watchers) is approved on behaviour but its wiring test is a redo (a rename was passed off as an extraction). Live effect: if the supervised bridge restarts, no prime is told; the PA's 20-min bridge probe is the only sensor.
- **Item 30 — Telegram routing**: bare text follows the *last speaker* and the existence check ignores liveness → Vaughan's 21:01Z message sat `queued` on a dead seat 25 min. Vaughan's ruling: reply → that seat; not a reply → the prime; dead → told, never queued. Queued after 24 (same file). Workaround live: the prime speaks to the bridge after any incident so bare text follows it.
- **Item 31 — watchdog noise**: `pij watchdog status` shows a `next due` 13.7 h stale; "unknown — not a health claim" verdicts and boundary "gone quiet (stalled)" notices delivered to the prime every 20 min for a standby PA and for a delegating PM. Attention cost only; no missed real stall today.
- **Flash / `--context long_context`**: upstream-unstable on copilot 1.0.81-14 (400 on every path in s391's matrix while a one-shot worked) — catalog marks it honestly; warn-don't-block (6b).
- **Codex path (`codex app-server --remote`, brief item 2/8)**: DEFERRED by Vaughan ("ignore codex for now as im remote"); Codex seats use the pointer line.
- **GitHub Actions has never run in this repo** (workflow active, 0 runs ever). Merges are gated on local full vitest + typecheck + skill-check + cold review + live proof. A release tag should not claim CI.
- Lossy JSON surfaces (`pij list --json` lacks harness/pane; `pij state --json` lacks statusAt/pane) — encode candidates, not fixed.
- Daemon-restart baton: each restart is a machine-wide event (every fleet); requires kingfisher's lane ack + SPAWN FREEZE. Six today; no incident.

## 4. Bridge status + supervision
- `pij state pij-telegram` → active, pid **82643** (= the daemon; in-process since item 29). PA probes it every 20 min (chore 5); alive at every sweep since 20:53Z (last 23:25:50Z). Supervisor: dies loud + auto-restart (item 29); restart-notice defect = 29b (above). Routing defects = item 30 (above). Duplicate-after-retry = item 24 (above).

## 5. Spec pointer for Jordan's agents
- Standalone spec: `docs/specs/claude-copilot-sqlite-sockets-comms.md` (PR #16, 721 lines, `EXT/` = `.pi/extensions/pij/`), anchored on `ed20a68`. Filed as **https://github.com/AI-Substrate/pij/issues/311** (body 62,392 chars + first comment 33,231; source files under `docs/plans/393-jordan-spec/issue/`).
- Does it match what is live? **Yes for the design** (queue schema, states, Claude inbox socket, Copilot `--ui-server` RPC, pointer path, backend selection): `ed20a68` is an ancestor of the live `188c877` (56 commits between, all day-3 fixes + docs; no schema or transport redesign). **Two errata pending**: (a) §14 receipt provenance — "acked" on the Claude-socket path means injected, not read (23b); (b) item 24/29b/30 bridge behaviours above. Both will be posted to #311 when 24 lands.

## 6. What a tagged stable release takes from here
- `package.json` version is **0.1.0**; the repo has **no tags**. Proposed: tag **v0.2.0** ("comms: sqlite queue + sockets") on the sha of restart #6's source, once the full gate set is green on that sha (full vitest, tsc, skill-check, cold review, live proofs for each harness kind + Telegram).
- Remaining before the tag (my recommendation for "stable" = no known human-channel loss or duplicate):
  1. **item 24** (bridge dedup, invariant fold) — in progress, s392; est. PR in ~2 h.
  2. **29b-T001** (owner notice via watchers, wiring redo) — after 24, same coder; est. +1–2 h.
  3. **item 30** (routing per Vaughan's ruling) — after 29b; est. +1 h.
  4. **restart #6** on that sha (baton with kingfisher) + live proofs — ~30 min.
  5. tag + release note listing §3's residual gaps honestly (23b, 31, Codex deferred, Actions never run).
- ETA for a **stable candidate**: ~5–7 h from 23:45Z → **2026-08-28 ~05:00–07:00Z (15:00–17:00 AEST)**, single-coder bound; a **release-candidate** could be tagged right after restart #6 with 24 + 29b (~4 h) if 30 is allowed post-tag.
- NOT required for the tag (my call, overridable): 23b (honest receipt labels — semantics are documented, not wrong on the wire), 31 (noise), 22 / E22 / 21b / 24b / 29b-rest, s391's 16, 19, 25–28.

## 7. Decisions for Vaughan
1. Tag scope: is **item 30** (routing) required before the stable tag, or acceptable post-tag? (default: required — it is what he hit today)
2. Is **23b** (honest receipt labels) required for the tag? (default: no; erratum posted to #311 instead)
3. Version/tag name: **v0.2.0** ok?
4. Codex stays deferred for the tag? (default: yes; pointer-line path documented)
5. Should GitHub Actions be made to actually run before tagging (0 runs ever), or does the tag state "local gates only"? (default: state it)
6. Still open from earlier: did the 17:46Z "restart #3 proof" line arrive **twice** on his phone (the item-24 oracle)? and whether encode candidates E3/E5/E7 become items 32–34.

## Amendment 23:5xZ — §6 ETA
Item 24's set-review found the dedup invariant itself wrong (count-based identity aliases same-total bubble distributions → an oversize-failure notice silently suppressed; media bubbles never marked → a file delivered twice). Ruled a final pass (spine 29925): identity = sha256 of the ordered planned bubble set; every bubble, media included, indexed and marked on positive ack. Adds ~1–2 h: item-24 PR ≈ 3–4 h from 23:50Z; stable candidate ≈ 2026-08-28 06:00–09:00Z (16:00–19:00 AEST); RC after restart #6 ≈ 5 h. Sent to kingfisher 23:5xZ.

## Amendment 00:3xZ — §3/§6: bridge log sink
The in-process Telegram bridge (item 29, live since restart #5 at 20:53Z) writes no persistent log; `~/.pij/telegram-bridge.log` is the retired standalone bridge's file and ends at 20:53Z. The transient-network cause given for the three late rows (4951/5014/5087) is therefore a hypothesis; proven: single-bubble bodies, attempt 1 failed, attempt 2 delivered ~65 s later, phone shows once. Pre-tag requirement added: the sink is restored (item 24 or 29b-rest) and restart #6's live proof checks the file's mtime advances.

## Amendment 00:5xZ — §2
PR #28 item 16 (creator notices route to the current parent, liveness-aware) merged → main fecf633, checkout ff'd; not live until restart #6 (which now carries 15 + 16 + 24 + 29b-T001).

## Amendment 01:2xZ — §2/§3
PR #29 (15-FX, test-only) merged → main a23fcd7. New known gap (item 32, s391 after 31): the production daemon runs under the `npx tsx` relay; a signal to the wrapper SIGKILLs the daemon and leaks the spine locks (mitigated by item 15's reclaim; `pij daemon stop` is safe). Harness flake `pij-skill-check.test.ts` 1/5 under parallelism → 12-FX (s392).

## Amendment 01:5xZ — §2/§6
PR #30 item 29b-T001 (bridge-restart notice via pij-telegram watchers; deps extracted with the store path pinned; call-site sensors) merged → main ae7356b, checkout ff'd. Restart #6 now gated on item 24 alone (log-sink fold: B1 daemon-crash guard, B2 production-path sensor, W3). Kingfisher will watch pij-telegram after restart #6.

## Amendment 02:2xZ — §7 decision 1 answered
Vaughan (Telegram, verbatim "Yes"): item 30 must land before the tag. Sequence: item-24 PR → item 30 dispatched immediately → one restart carrying both if 30 is within ~1 h, else two → RC tag after the restart that carries 30. Decisions 2–6 open.

## Amendment 02:5xZ — §2/§3
PR #31 item 31 (watchdog projection = live fire clock; unknown never delivered; standby-aware stall threshold; sensor-signed notices) merged → main 16a7c42; not live until restart #6, which now carries 15, 15-FX, 16, 29b-T001, 31 (+24, +30 if close). Item 31 leaves §3's open list.

## Amendment 02:5xZ — §2/§3/§6
PR #32 item 24 merged → main (plan-hash idempotence, media marked on ack, one in-lease retry, in-process bridge log restored). Restart #6 gate cleared; holding ≤1 h for item 30 (pre-tag per Vaughan) so one baton carries both. Open in §3 now: 30 (in progress), 23b, 32 (relay launch), 24b (backoff if residual), Codex, Actions.

## Amendment 03:5xZ — §3 item 32
PR #33 (item 32, daemon launched as Node's direct child, SIGHUP handled) was NOT merged: the full suite at the merge product went red on three subprocess tests' own 5–10 s budgets under full-suite load (green in isolation) — the PR's new `npx tsx` relay probe is load-fragile. Back to s391 as 32-FX (both logs kept); item 32 rides restart #7, not #6. Restart #6 hold extended once to 04:15Z for item 30 (review in flight).

## Amendment 04:1xZ — §2/§6
PR #34 item 30 (Telegram routing per Vaughan's ruling) merged → main 3411794 inside the extended hold. Restart #6 baton ASKED of kingfisher at 3411794: carries 15, 15-FX, 16, 29b-T001, 31, 24, 30. After its live proofs the v0.2.0 candidate criteria are met except §7 decisions 2–6 (23b pre-tag?, version name, Codex, Actions) and the bridge log/attempt-1 measurement window (≥1 h).

## Amendment 04:1xZ — §1 LIVE
Restart #6 done 04:10:36–04:11:06Z (30 s) in kingfisher's lane: daemon pid 63524 on 916e915 (source 3411794). Live now: PRs #1–#34 — items 15, 15-FX, 16, 29b-T001, 31, 24, 30 added. All proofs passed (locks absent after stop; bridge-restart notice reached the watcher; 385-char Telegram body attempt 1 in 3 s with the bridge log advancing; watchdog next-due live). Not live: item 32 (PR #33, 32-FX) → restart #7. Tag v0.2.0 waits on §7 decisions 2–6 and the 1-h chore-6 measurement (24b trigger).

## Amendment 04:2xZ — item 31 boundary proof
The 04:25:54Z PA sweep arrived without the "watchdog unknown — not a health claim" / "gone quiet (stalled)" pair for the first time since 21:25Z — item 31 proven live at a real boundary. Post-restart bridge reading 1/4: attempt>1 = 0.

## Amendment 04:4xZ — §2/§3 item 32
PR #33 item 32 (direct-child daemon launch; SIGHUP handled; locks released on every signal) merged → main after 32-FX (relay probe via resolved tsx CLI, 15 s cold ceiling); verified at the merge product 4160/0. Not live until restart #7, asked after the 05:15Z bridge measurement. Item 32 leaves §3's open list once live.

## Amendment 04:5xZ — item 24 live evidence
Interim reading since restart #6 (04:11–04:52Z): 0 of 6 real bridge sends needed a second attempt (pre-fix baseline 9 of 24). The restored bridge log recorded one in-lease retry after `Network request for 'sendMessage' failed!` that succeeded — the transient-network cause of the pre-fix attempt-2 rows is now evidenced on the live bridge. Final 24b decision at 05:15Z.

## Amendment 05:3xZ — TAGGED
Vaughan (verbatim): "Merge it all make it 0.2.0 and ensure Jordan's agent has all the outstanding items. Plenty of deep detail on each piece so it can rebuild it commit and push as it can look at our repo for the code also as the spec". v0.2.0 tagged at d120c53 (main head; the sha restart #7 runs; item 32 live). Handover: docs/handover/v0.2.0/ (README, TEMPLATE, 00-live-system; per-item sections from the streams), then posted on #311. §7 A–E superseded.
