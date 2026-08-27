# Rulings — s392-day3-codex-doctrine

Recorded the moment they landed (orient-global iron rule: rulings land on disk immediately).

## 2026-08-27T08:2xZ — o-prime pij-relative-panther, preamble verification (both checkpoint shas matched)

1. **Rows 149/290**: 149 was ALREADY delivered to Vaughan via the old bridge's fs path pre-cutover (kingfisher confirmed; Vaughan replied) → RETIRE with receipt `delivered-via-fs-pre-cutover`, never re-forward. 290 (o-prime's 07:59Z test) → forward ONCE. General rule = forward-once applies to rows never delivered anywhere.
2. **Watermark**: ACCEPTED — the delivery state machine IS the watermark; never replay acked/failed; forward every `queued` row on boot. `--skip-backlog` is a follow-up → open[].
3. **Consumer placement**: ACCEPTED — generic poll-consumer at `adapters/queue-consumer.ts` (+test). obs-03 OWNER = this stream: new item **3c** "pi in-process receiver adopts the queue consumer", right after 3b. **Fence WIDENED** to `.pi/extensions/pij/index.ts` (+test); no overlap with s391. obs-04 (`daemonReceiptAuthoritative`) fix alongside 3b — accepted.
4. Codex `codex login`: ask Vaughan in-pane; item 1 does not wait.
5. **BUILD CONFIG PRE-CONFIRMED**: default profile — copilot `gpt-5.6-sol` xhigh coder + cross-model cold reviewer, canary effort mechanically. Do NOT stop at WAITING_FOR_BUILD_CONFIG unless the plan deviates; pipeline straight into 3b.
6. Live proof: hand the o-prime the tested commit sha + exact proof command; the o-prime restarts the bridge and runs the proof.
- obs-01/obs-02 carried upward as encode candidates; keep in observations[].

## Item order after rulings
1. 3b — telegram forwarder on the sqlite queue (+ receipt fix, + retire 149 handover) — PR 1
2. 3c — pi in-process receiver adopts `queue-consumer` — PR 2
3. 2 — codex app-server `--remote` wired into delivery — PR 3
4. 7 — pointer-delivery doctrine relaxation — PR 4

## 2026-08-27T08:3xZ — Vaughan (human, in-pane): "ignore codex for now as im remote"

- **Item 2 / Phase 3 (Codex app-server `--remote`) is DEFERRED** — no `codex login` possible remotely; do not spend the fleet on it now. PD-01 → DEFERRED (not open).
- Consequence: Phase 4 (doctrine relaxation) no longer depends on Phase 3; its routing-invariant test covers claude-socket + copilot-rpcPort vs pointer (codex stays on the pointer path today, stated as such in the docs). Plan amendment to be applied after the current cold validation returns (single re-freeze).
- Item order now: 3b → 3c → 7. Codex resumes only on a new ruling.

## 2026-08-27T08:5xZ — o-prime pij-relative-panther, checkpoint-plan-validated verification

- CHECKPOINT VERIFIED (sha match; three cold verdict files; coder canary from process args).
- open[1] ACCEPTED: v1.3.0 = v1.2.0 + one anchor token; no 4th cold pass — proportionate; deviation stated on disk satisfies the contract. Phase 1 (3b) proceeds.
- Handover shape required for the bridge restart: tested commit sha on this branch + exact proof command + the row-149 retire command (receipt reason `delivered-via-fs-pre-cutover`); o-prime restarts from `pij-prime:telegram` and runs the proof against a real send.
- obs-06/07/08 carried upward.

## Fence updates (worktree-local, notify-only)
- 2026-08-27T09:0xZ — Phase 1 / dlg-0001: `+ .pi/extensions/pij/adapters/fs-registry.overlay.test.ts` (paneId-only on daemon-owned fixtures AC-05/05b/09 + one more). Cause: the ruled `effectiveDeliveryMode` fix (finding 02) makes pane-less claude/copilot fixtures pull seats; the tests assert the daemon-tick receipt path, so the fixtures must carry a pane. Verified by the orchestrator (3 failing tests reproduced). No production-code scope change.

## 2026-08-27T09:24Z — o-prime pij-relative-panther: bridge restarted on 3501f85 (worktree CLI, pid 95084, window pij-prime:telegram); AC-07 PASS (sensor side); "Proceed to 3c"; re-restart on main after PR merge (tell them). Spine 24375/24376.
- Orchestrator verification (read-only sqlite, 09:25Z): seq 149 `failed` + receipt `retired`/`delivered-via-fs-pre-cutover` 09:23:38; seq 290 claimed 09:23:39 (consumer-95084) → acked 09:23:40 reader=pij-telegram; probe seq 653 queued 09:23:57 → claimed → acked 09:23:58; pij-telegram: acked 3 / failed 121. Phone confirmation from Vaughan: PENDING (oracle).

## 2026-08-27T09:3xZ — o-prime standing instruction (board discipline)
- Every worker I dispatch that declares done raises `unverified-done` until a DIFFERENT registered seat verifies: after the cold verdict, `pij report verify <worker>` (I qualify); if the verdict fails, leave it open and say so. Applies to pij-gunboat-diplomat (spine 24351) and every later worker.

## Incident 2026-08-27T09:3xZ — shared-worktree mutation hazard (reported by reviewer pij-pale-araminta)
- Cause: orchestrator dispatched Phase 2 (dlg-0002) into the same worktree while the Phase 1 cold review's Dim-0 mutation gate (backup→mutate→restore of bridge.ts / queue-consumer.ts / core/cli.ts) was running.
- Exposure: Phase 2 fence = index.ts + index.test.ts only → disjoint; the three mutated files are byte-identical to HEAD (verified); index.test.ts (+148/−2) is the coder's Phase 2 work, expected.
- Actions: reviewer told to continue and finish mutations in one pass; coder told the three files are hot and to re-run before believing an out-of-fence red; ledgered DL-005 (encode: mutate in a throwaway worktree of the reviewed sha, or serialize).
- Rule going forward for this stream: no next-phase dispatch while a mutation review is open in the same tree, unless fences are disjoint AND both peers are told.

## 2026-08-27T09:4xZ — o-prime: PR #1 (3b) MERGED → origin/main 27077052693dffc51b20dea86a88e91333bf4892
- Proceed on 3c from the new main; o-prime re-restarts the bridge on main after kingfisher's ack.
- CI is NOT a gate today (repo has zero Actions runs ever); PRs merge on local gates + cold review + `pij report verify`. Vaughan being asked to look at Actions.
- Stream action: rebase `s392/day3-codex-doctrine` onto origin/main once the coder's Phase 2 commit lands (no rebase under an active worker in the shared tree — incident rule).

## Incident 2026-08-27T09:5xZ — post-merge verdict change on Phase 1 (reviewer pij-pale-araminta)
- Reviewer continued a second mutation pass AFTER its APPROVE_WITH_NOTES report; PR #1 was merged on that first verdict. Second pass: mutation 6 (revert `daemonReceiptAuthoritative` to raw `deliveryMode`) STAYED GREEN → verdict changed to FIX_REQUIRED (test-coverage hole only; runtime code correct).
- Orchestrator verification: re-ran mutation 6 (`s/effectiveDeliveryMode\(target\) !== "pull"/target.deliveryMode !== "pull"/` on cli.ts, ERE-escaped) → 462/462 stayed green. Confirmed the +paneId:"%9" widenings at cli.test.ts:1276/1299/1323 moved the pane-less tick witnesses out of the cell under test (coverage removed without an assertion edit).
- Disposition: fix dossier FX001 (one cli.test.ts case: pane-less bound claude, fresh tick → receipt queued/pull-inbox AND daemon tick fields ABSENT; mutation 6 must go RED) → dispatched to the coder after dlg-0002; ships as its own small PR on main.
- Lessons (encode): (1) a reviewer's report must be TERMINAL — no further mutation after reporting; the orchestrator packet must say "report once, after the last mutation"; (2) fixture widening can destroy coverage with zero assertion edits — the reviewer's Dim-1/Dim-0 pass must treat every widened fixture as a removed witness until a same-cell test is shown; (3) each site named in a contract line needs its own mandated mutation (=== vs !== sites are different expressions).

## 2026-08-27T09:5xZ — o-prime: PR #2 (s391 item 6) MERGED → origin/main 5445c85c; rebase before my next PR (overlap: core/cli.ts, core/spawn.ts)
- Deferred until Phase 2 review + FX001 both report (no rebase under active workers in the shared tree). Then: commit reviewer's phase-1-review.md revision (pathspec) → rebase → re-run touched suites → PR #3 (Phase 2) + PR for FX001.
- Reviewer pij-pale-araminta: terminal-report rule adopted; phase-1-review.md closed at 8 mutations; FX001 re-review will be a NEW file against the fix sha; daemon-up precondition for the retry leg (pid 91876 is up).

## 2026-08-27T10:0xZ — o-prime RULING on PD-02 (DL-003 skill-check debt)
- Phase 4 = option (b): land docs + test + doctrine draft + the ONE SKILL.md clause; attach `just pij-skill-check` output diffed before/after to the PR; bar = ZERO new findings (budgets/strings identical except the added clause; if the clause tips a budget, trim within the same file to stay flat).
- NEW ITEM 9 "pay the pij-skill-check debt": mine, after 3c and 7; fence widened to `skills/pij/**` for that item only; its own PR; cold-reviewed (live-skill content never rides along).
- Rebase onto origin/main 5445c85c before the next PR (dry-run `git merge-tree`: clean).

## 2026-08-27T10:2xZ — o-prime: NEW ITEM 10 (after 3c, before 7) — pending-recovery / pane resolution must never bind an unregistered pane
- Incident: a dissolved copilot seat's queued preamble was typed into an unrelated, unregistered copilot pane of the same harness ~10 min after close (`~/GitHub/pij/government/incidents/2026-08-27-cross-government-pane-misbind.md`). Half 1 (retire on close) = s391. **Mine = half 2**: the resolution path (`core/daemon/loop.ts` ~343 "planned id the instant the pane is interactive", `core/daemon/index-state.ts resolvePane`, pending-recovery from plan 040): copilot binding requires the seat's deterministic `--session-id` (claude/codex their native session evidence); an unregistered pane is never a delivery target; a dissolved seat is never re-bound without `pij revive`. Test: fake registry with a dissolved pane-less seat + a fresh unregistered same-harness pane → zero deliveries. Fence widened: `core/daemon/index-state.ts` (+test). Overlap with s391 on loop.ts (their item 5): land after s391.
- Sequencing note: Phase 4 (item 7) was dispatched as dlg-0004 at 10:1xZ, before this ruling; it is small and disjoint — proposed to let it finish while item 10 is surveyed/planned (o-prime may bounce).
- 10:2xZ o-prime: NO BOUNCE — Phase 4 completes as dispatched; item 10 planned in parallel; landing order 3c → 7 → 10 (after s391 loop.ts item 5) confirmed.

## 2026-08-27T11:xxZ — o-prime: PR #3 (s391 item 1a) MERGED → origin/main 048a3e12 (cli.ts touched); rebase before my next PR
- DEFERRED: reviewer pij-pale-araminta is running flow-pair-mutate in this tree (Phase 2 + Phase 4 re-reviews). No rebase under an active mutator (clobber hazard, incident rule). Rebase onto 048a3e12 AFTER both re-reviews report and the reviewer is idle, THEN open the PRs.

## 2026-08-27T10:3xZ — o-prime: MERGED #4 #5 #6 → origin/main ee560fe8 (order 3c → 7 → FX001). #5 gate diff verified empty. Item 10 may start (rebase first). o-prime folds the government doctrine half + orient-global iron-rule-2 as its own gated commit.
- Day-3 assigned list COMPLETE: 3b (PR#1), 3c (#4), 7 (#5), FX001 (#6) all merged; item 2 (codex) deferred by Vaughan.
- Hazard ledgered (COORD-002): I built PR branches by switching branches in the live shared worktree while the reviewer ran mutations — near-false-GREEN. Fix: separate worktree for PR assembly, or all-peers-idle gate.

## 2026-08-27T11:xxZ — Vaughan (in-pane + Telegram): Jordan handoff-spec deliverable
- After item 10b: merge everything + push. Then, when claude+copilot on sqlite+sockets is judged READY: create a Fable seat, write a detailed STANDALONE spec (no other project info; lots of detail + gotchas + outstanding) for Jordan (another Claude), and create an ISSUE on the ai-substrate pij repo (confirm exact org/repo) for Jordan to pick up. Full requirements + draft outline: `jordan-spec-deliverable.md`.

## 2026-08-27T11:xxZ — o-prime ACK fold + 10b requirements + jordan-spec governance
- 10a stays on-branch with F2/F3/F4 FX, lands WITH 10b after s391 item 5 (Vaughan's ruling, spine).
- 10b req 1: six ad-hoc resolvers = a CLASS → ONE shared lifecycle-filtered resolver + a grep-sweep test guarding against a 7th unfiltered site.
- 10b req 2: incident replay must reproduce the ACTUAL route (pane-less dissolved seat + fresh unregistered same-harness pane → zero deliveries, zero binds).
- **jordan-spec** = its own project under the o-prime, queued AFTER the day-3 list; do NOT start before 9/10 land. I tell the o-prime when I'd spawn the Fable seat; the o-prime briefs it (not an ad-hoc spawn by me).

## 2026-08-27T11:xxZ — o-prime: item 9 FX proceed + NEW ITEM 11 + semantic-review doctrine
- **Semantic review is MANDATORY for every skill-text PR** (item 9 is the proof of why — a green gate certified 3 real losses). Now doctrine.
- **NEW ITEM 11 (mine)**: fix the `pij-skill-check` order-check false-positive (head -1 match). Fence widened to `harness/scripts/` (the skill-check script + its test). Lands AFTER item 9, BEFORE 10b.
  - Req 1: the check matches the FIRST occurrence IN DOCUMENT ORDER of each required marker, not the first line matching any of them.
  - Req 2: pin with a fixture reproducing the reorder it forced today.
  - Req 3: the doc reorder it forced (item-9 F5 edit in orchestrator.md) must be REVERTED in the same PR IF the reorder harmed reading order — my call, state it.
- Item order now: 9 → **11** → (s391 item5) → 10b → merge-all+push → jordan-spec.

## 2026-08-27T11:xxZ — o-prime: PR #7 (item 9) MERGED → origin/main bc71a4b8. Rebase item-11/10b onto it.
- DEFERRED: coder is mid item-11 in THIS worktree; no rebase under an active peer (COORD-002). After item 11 reports: rebase integration onto bc71a4b8 (item-9 commits bfbb08d/346c19f/0aabb1c drop as already-applied), then build item 11's PR in a SEPARATE worktree.
- Item 9 SHIPPED (PR #7). Day-3 shipped now: 3b/3c/7/FX001/9 + doctrine.

## 2026-08-27T11:xxZ — o-prime: PR #8 (item 11) MERGED → main 91337335 (o-prime reproduced RED-on-old/GREEN-on-new itself). 10b next (after s391 item 5), item 12 after.
- Day-3 SHIPPED: 3b/3c/7/FX001/9/11 + doctrine. Only 10a(folded)+10b + item 12 remain, all gated on s391 item 5.

## 2026-08-27T12:xxZ — o-prime URGENT: main RED from item 9 (cross-file string pins)
- My item-9 trims moved strings that EXTERNAL tests pin as requirements (plans 041/074): `cli.integration.test.ts` "pull vs push" (peer.md must contain the external-pull-ban clauses + tmux-adopt + E-NOID + External-pull-identity section) and `acceptance-sweep.test.ts` "074 P9" (orchestrator.md must contain "Start-of-work report"/"Stop-of-work report" + the two exact `pij report now '...'` commands; kickoff.md the `--role pm` link). Neither pij-skill-check nor the semantic review covers these cross-file pins.
- FIX = item 9-FX, FIRST (before item 12): restore the pinned text in the ROUTE within budget (the tests encode requirements — the route a reader loads must SAY it), not repoint the tests, unless a test pins genuinely-wrong wording (then say so).
- **NEW GATE for every skill-text PR** (ruling, spine): `just pij-skill-check` + `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` + cold semantic review.

## 2026-08-27T12:xxZ — o-prime: NEW ITEM 14 (skill text, after 12; new gate = pij-skill-check + string-pinning vitest + semantic review)
- C9 in `00-routing.md` implies `pij report state done` silences the watchdog; code (`core/watchdog.ts:332 mutesWatchdogNudge`) mutes ONLY blocked|question|hold|waiting — done/ready never mute. Amend C9 (budget-flat): "done is a claim for a verifier and does not mute; a seat standing by with no open work parks with hold/waiting; reach for interval, never pause." Mirror one line in orient-oprime duty 7 if budget allows.

## 2026-08-27T12:xxZ — o-prime: MERGED PR #10 (9-FX + R5) → main 9912bf86 (main un-RED). item 12 (R2/R3/R4 + R6 + NIT-1) review+PR next; 10b after s391 item 5.

## 2026-08-27T12:xxZ — o-prime: PR #11 (s391 item 5 + finding C) MERGED → main f4ba6ec0. 10b UNBLOCKED (rebase onto f4ba6ec0, loop.ts moved; 10a lands with it). SPAWN FREEZE coming for a coordinated daemon restart (first since cutover) — do NOT spawn during the broadcast freeze window.
- finding C (daemon instanceof→sqliteOf under dual) landed with PR #11 — re-verify whether 10b's shared-resolver scope still needs the 6 ad-hoc sites or if finding C touched any.

## 2026-08-27T12:xxZ — SPAWN FREEZE (LIFTED, daemon pid 57236, f4ba6ec0, sqlite, verified) (machine-wide, o-prime)
- Daemon restarts (first since sqlite cutover; live f4ba6ec0, full suite green). Do NOT pij spawn/revive/agent spawn until "FREEZE LIFTED". Sends are safe (queue in SQLite, drain after restart — the durability my item 3b established). No new spawn needed here (coder+reviewer live; 10b reuses the coder). The coder's item-12 report may be briefly delayed by the restart — do NOT misread a queued/delayed delivery as a stall; it drains post-restart.

## 2026-08-27T12:xxZ — o-prime RULING ADV-2: FOLD the R3 section-scope fix into item 12 before merge (the item closes the decoy-bypass class; a whole-file require_marker IS that class). Coder FX + re-confirm (gate + 9/9 + decoy RED-on-old) → PR. NOTE: item numbers are GLOBAL across both streams — 15 (spine locks) + 16 (notice routing) are s391's; ask the o-prime for any new number.

## 2026-08-27T13:xxZ — o-prime: MERGED PR #12 (item 12) → main be31e66c. 10a+10b is the last code item before 14. Spawn safe (freeze lifted).
- 10b in flight (dlg-0015) on base 10483d8+item-10a; item 12's files (harness/scripts) are disjoint from 10b's (core daemon), so 10b is unaffected. Rebase onto be31e66c at 10b PR time (not under the active coder). Day-3 SHIPPED: 3b/3c/7/FX001/9/11/9-FX/12 + doctrine.

## 2026-08-28 — o-prime RULING: LAND 10b now (incident fixed, ADV-2 fails safe). ITEM 17 = the 4 advisories as ONE follow-up PR after 14, order: ADV-2 (bind refusal must LOG + distinguish indeterminate-probe [retry w/ backoff] from foreign [refuse] — "never silent") → ADV-4 (win32 allowlist endsWith→join) → ADV-3 (sweep bypass shapes) → ADV-1 (isCopilotSessionId coverage). Order: 10a+10b PR → 14 → 17 → merge+push → jordan-spec handover ping.

## 2026-08-28 — o-prime: MERGED PR #13 (10a+10b, incident half 2) → main 42b7268f. Incident FULLY FIXED on main (both halves). Live daemon ff BATCHED with s391 1b → ONE restart (kingfisher window) makes both daemon halves live. s392: item 14 (rebase onto 42b7268f) → 17.
- Day-3 code SHIPPED: 3b/3c/7/FX001/9/11/9-FX/12/10a/10b + doctrine. Only item 14 (doc) + item 17 (advisories) remain before the Jordan-spec handover.

## 2026-08-28 — o-prime RULING item 14: FOLD ADV-4 before the PR (a wording item must not land with a known wording error). ITEM 18 = ADV-1/2 (ratchet: pin routing text vs buildWatchdogTurn OUTPUT minus header prefix — stale doc RED, clean GREEN; this is the E6 class = a green gate certifying wrong text) + ADV-3 (docs/how/pij-watchdog.md same stale quote + missing mute set). Order: 14 PR (with ADV-4) → 17 → 18. [ADV-4 = my dossier error; o-prime also fixing its upstream WorkIQ 'park with hold' instruction.]

## 2026-08-28 — o-prime: MERGED PR #14 (s391 item 1b) → main 64f0815d. Restart #2 baton → kingfisher (ff+restart in its next lane). item 14 offered a spot in the restart lane if ready.
- item 14 is SKILL-TEXT (00-routing.md, symlink-deployed on merge) — does NOT need the daemon restart. Re-confirm still in flight; item 14 rides the ff after, no need to hold the lane.

## 2026-08-28 — SPAWN FREEZE #2 ACTIVE (restart #2 — makes the daemon-side incident fix live). No pij spawn/revive/agent spawn until FREEZE LIFTED. Sends queue+drain. Coder+reviewer already live (no spawn needed for 17/18). PR git-ops (push/gh) are NOT spawns — item-14 PR can still be built if the re-confirm lands. Reviewer's re-confirm may be restart-delayed — not a stall.

## 2026-08-28 — o-prime RULING: NEW ITEM 20 (transports; after 18). Order 17 → 18 → 20.
Source: the s393 spec seat's cold review, OBS-04. **Defect**: the Claude inbox-socket and Copilot `--ui-server` RPC sends can return `"failed"` AFTER the bytes have already landed, opening duplicate-delivery windows T1/T2 (a `failed` return triggers a retry → the peer receives the message twice). **Fix**: distinguish **pre-write failure** (nothing landed → safe to retry) from **post-write ack failure** (bytes landed, ack lost → treat as *delivered-unconfirmed*, resolve via a SINGLE verify/receipt path, never a blind re-send). Pin BOTH windows (T1 = fail-before-write, T2 = fail-after-write) with fakes. Related: FX001 witness gap (`core/cli.ts classifySendReceipt`/`daemonReceiptAuthoritative` via `effectiveDeliveryMode`) and the item-3b at-least-once ForwardIncomplete pattern (ack only after send). Touch set (provisional, confirm at dossier time): `core/daemon/loop.ts` (sendSocket/RPC outcome handling), the `DaemonPorts.sendSocket` contract (`no-socket`/`failed`/SendOutcome), + fakes/tests. Full dossier: `tasks/item-20-transport-dup-window/tasks.md` (TBD after item 18).

## 2026-08-28 — Item 17 APPROVE (PR #19) + provisional item 21 (advisory tail, o-prime to rule)
Item 17 cold review APPROVE (pij-wilful-morton), all 5 Dim-0 mutations sha-verified on disk + 2 reviewer extras; PR #19 OPEN. Non-blocking advisory tail (same pattern as item 17 was for item 10b) → **provisional item 21**, o-prime rules fold-vs-defer:
- ADV-A (low): `drive.bindRefusalCauses` never cleared on successful bind → un-anticipated dir (ii): a lingering pane-subtree agent trips a liveness rung while the new agent starts, spawner gets a refusal notice for a seat that binds next tick, never retracted. One-line fold: clear the cause in the successful-bind branch beside `drive.settled = true`.
- ADV-B (low): notify covers 1 of 3 permanently-non-binding causes; `no-harness-process` + `harness-process-present` still refuse forever silently, and the planned path has NO timeout (never reaches bind-timeout fail :503-518). "Never silent" ~1/3 delivered.
- ADV-C (low): sweep still line-scoped — multi-line arrows, aliased destructures (`const {paneId: pid}=d`), line-scoped `undefined` exclusion bypass. Narrowed, not closed.

## 2026-08-28 — o-prime rulings (item 17 close-out)
- ADV-A: **FOLDED into PR #19** (one-line clear on successful bind), coder-FX-equivalent done by orchestrator (coder busy on 18), reviewer re-confirm of the hunk only → then o-prime merges #19. Rebased onto current main.
- **Item 21 = ADV-B/C ONLY** (advisory tail), scheduled AFTER item 20. (ADV-A no longer part of 21.)
- Teardown of s393-jordan-spec: **CONFIRMED INTENDED** — o-prime ran `pij stream close alloc-s393-jordan-spec` after jordan-spec COMPLETED (issue #311 filed on ai-substrate, seat verified+closed). WIP preserved, nothing force-removed. Reviewer's flag was correct diligence.
- Order 17→18→20 holds; item 21 (ADV-B/C) after 20.

## 2026-08-28 — Item 17 ADV-A re-confirm: APPROVE 3495476 (merge #19); new ADV-A2 → item 21
Reviewer pij-wilful-morton re-confirmed the ADV-A hunk ON DISK: MUT-ADV-A RED at loop.test.ts:509 (toBeUndefined) → restore GREEN, no collateral (3 proofs incl. rebase-drift nil though main touched all 3 fence files via 56819f1). Confirmed the fold is LOAD-BEARING (not inert): DriveState survives bind (drives deleted only daemon.ts:175/:613, neither on bind); revive.ts:704 → pending + plannedHarnessSessionId set → re-enters planned-bind → without the clear reportBindRefusal SWALLOWS the revived seat's genuine refusal (3-tick probe: outbox 1→2→3 pristine vs 1→2→2 mutated). Unconditional placement REQUIRED (gating on !drive.settled would no-op in exactly the ADV-A scenario). Gates reproduced on disk: daemon 461/461, tsc 0, fence 104.
- **ADV-A2 (non-blocking) → ITEM 21** (with ADV-B/C, after 20): `drive.settled` is in the same never-reset class; buildBoundNotice gated on !drive.settled, so a re-bind emits nothing → after refuse→bind→refuse→re-bind the spawner's last word is a stale REFUSAL for a now-bound seat (old ADV-A(ii) "never retracted"). Safe direction (loud-and-stale, no daemon logic branches on these notices), not a regression. Symmetric one-line fix: reset `settled` where a refusal is reported. Close the pair (ADV-A2 + ADV-B/C) in item 21.
## 2026-08-28 — o-prime: MERGED PR #19 (item 17 + ADV-A) → main ef8e2621. Order 18→20→21 (ADV-A2+B+C). Restart #3 after 18/19/20 (or sooner if a lane opens + queue quiet, o-prime signals). s391 6b rebases at its PR.

## 2026-08-28 — o-prime rulings (branch model + commit hygiene, standing)
- **Merge unit = per-item fresh-from-main PR.** The stream branch (s392/day3-codex-doctrine) is a WORKING branch only and is NEVER merged wholesale; at teardown `pij stream close` preserves it as WIP. (Confirms my base-drift heads-up — each item's fresh-from-main PR is correct.)
- **Pathspec-mandatory commits (`git commit -- <paths>`) — STANDING rule from INC-004.** No `git commit -a`/`-am` in ANY shared tree, ever. Rationale: "cosmetic" is only known after the fact (my COORD-003 swept a coder's WIP). This is now a hard rule for the rest of the stream.
- #20 (item 18): o-prime pre-verifying at head; merges on the cold verdict.

## 2026-08-28 — Item 18 APPROVE df5b256 (merge #20); new advisories → ITEM 22 (ratchet hardening)
Cold review APPROVE, all 3 Dim-0 mutations sha-verified on disk (MUT-E6 @cli.integration:367, MUT-MUTE @:369 pinned to mutesWatchdogNudge not a literal, MUT-CLAUSES @:365 catches emitter drift). No collateral — merge-base(main,df5b256)==447526e exactly, declaration list identical 100/100 (the reviewer's structural proof, retiring my bogus it(-count). Non-blocking, both ironic E6-residuals in the E6-fixing PR → **ITEM 22** (watchdog-ratchet hardening, after 20/21):
- **ADV-1** (item-18 own): the ratchet pins "text present SOMEWHERE in pij-watchdog.md", NOT "the example block is correct" — reviewer PROVED it (garbage example + clauses restated as prose elsewhere → still GREEN). Residual gap = POSITION not CONTENT. Fix: scope the assertion to the fenced ```text block.
- **ADV-2** (item-18 own): INFO-7's `state.ts:142` is a NEW UNPINNED code citation (its only repo-wide occurrence is the doc line itself) — a line inserted above BADGE_SEVERITY silently mis-cites with no red = the E6 class one indirection over. Fix: cite the SYMBOL/enum, or assert `state.ts:142` matches /^\s*"waiting",/ in the ratchet test.
- **INFO-7 precision** (verified by me): `:142` is `waiting`(dependent on something external); `blocked` is `:137`(cannot proceed, no external wording). "blocked/waiting per state.ts:142" over-claims by half → ":137,142", and :142 lives in the BADGE_SEVERITY display array (a gloss, not a definition). Still strictly better than the flat-wrong "per node doctrine". Fix precisely in item 22 (with ADV-2, since the right fix pins the citation).
- Also (process): retire `grep -c 'it('` as a test-count sensor in favour of the vitest declaration-list diff (COORD/DL ledger — see harness observe).

## 2026-08-28 — Item 20 APPROVE a29a9fe (code); PR #21 built fresh-from-main (FINDING-1 fixed)
Cold review APPROVE the code (OBS-04 fix correct, minimal). 4 mandated Dim-0 + 1 extra sha-verified RED→restore→GREEN on disk; reviewer OBSERVED both dup mechanisms MUT-DRAIN reveals (cross-transport socket+pane; same-transport re-enqueue) — each fix half independently pinned. Receipt "no code change" verified end-to-end. Latent copilot-rpc bug fixed as a bonus (header+body now atomic).
- **FINDING-1 (merge-blocking, fixed)**: my packet's "8 files = item-20 delta only" was FALSE — reconcile 23f71d5 missed daemon-tmux.test.ts (branch-behind by a main-only test + 2 assertions, added by d5713a6/7db96d2). REMEDY applied: PR #21 = cherry-pick a29a9fe onto fresh main (147 = 140 main + 7 item-20; the dropped test PRESERVED). Ledgered: always cherry-pick fresh-from-main, never whole-file checkout from the drifted branch.
- **Method (E17 refinement, ledgered)**: declaration-list diff catches removed tests but is BLIND to weakened assertions — pair name-list (vitest list) with a LINE diff.
- **ADV-1 → item 23 + restart-#3 LIVE CHECK**: the fix flips the claude-socket default (silence→unverified); `confirmed` now reached only via a NEW `orig_msg_id` positive-ack branch the coder added (beyond the dossier). Rests on a protocol assumption (real receiver emits peer_message_status w/ orig_msg_id on SUCCESS, not only drops) — prior art supports (d-prior-art.md:36) but unobserved. Blast radius if wrong = REPORTING only (every send warns + receipt reads unverified; NO dup, NO loss). CHEAP CLOSE at restart #3: first live claude socket send — receipt `confirmed` shuts it; `unverified` → suspect the 150ms ackWaitMs. I OWN this check post-restart.
- **ADV-2 → item 23**: the fake was taught to actively confirm, so happy-path green certifies a protocol assumption (E6 one layer down) — add a fake comment citing the prior-art source.
## 2026-08-28 — o-prime: MERGED PR #21 (item 20) → main 488c758f (last daemon half). Restart #3 queued in kingfisher's land lane, PRECEDED BY SPAWN FREEZE (do not spawn during freeze). Order 21→22→23; ADV-1 live check right after restart. s391 6b rides a later ff. Post-restart: check both spine locks (write.lock/events.lock — remove if pid dead, orient-local:49), re-canary fleet.

## 2026-08-28 — ADV-1 LIVE CHECK RESULT: UNVERIFIED (not closed) → item 23 escalates
Restart #3 live checkout 488c758 (pid 76371, item-20 code LIVE). Read seq 3260's transport receipt (o-prime's designated test, o-prime → pij-associated-louse):
- **seq 3260 = `unverified`** (receipt 1787852758168-000001-79032, queue seq 3268). Per the o-prime's criterion → suspect ackWaitMs 150ms.
- **NOT a fluke — systemic for the socket path**: post-restart (seq≥3255) split = 26 delivered / 21 unverified (~45% unverified); the pane-less claude SOCKET seat pij-associated-louse is **5/5 unverified post-restart** (its 97 pre-restart "delivered" were the old path). No dup, no loss (item-20 consume holds) — impact is REPORTING ONLY, but ~45% of receipts misread.
- **Diagnosis for item 23**: the socket seat reading 100% unverified points at the PROTOCOL ASSUMPTION (real claude receiver may NOT emit peer_message_status w/ orig_msg_id on SUCCESS, only on drops — ADV-1's exact worry) MORE than a 150ms timing race. Item 23 must determine which: (a) raise/await ackWaitMs and re-measure, or (b) if the receiver genuinely never positively-acks a success, treat a flushed socket write as `confirmed` (drop the orig_msg_id-success expectation; keep `dropped` NAK → failed). Item 23 rises in importance (live, ~45% receipts) — o-prime may reprioritize.
- ackWaitMs constant: daemon-tmux.ts:273 `socketAckWaitMs ?? 150`; claude-socket.ts:136 `ackWaitMs ?? 150`.

## 2026-08-28 — NEW ITEM 24 (Telegram bridge dup; mine, after 23)
Restart-3 Telegram proof seq 3263 (msg 1787852759374-000001-79589) produced a DUPLICATE on Vaughan's phone. bridge log 99-102: attempt-1 sendMessage network error → the internal retry DID deliver the part, but the consumer still counted it undelivered → `ForwardIncomplete: 1 part undelivered` (no ack) → lease expired 60s → attempt-2 forwarded → acked. So at-least-once (item-3b) became at-least-TWICE via a false-undelivered. This is the bridge's TELEGRAM-API path (the spec's "durable retry on Telegram API failure" outstanding item), NOT the daemon transports item 20 fixed. Fix shape: (a) part-level delivered accounting survives an internal retry (a part that eventually sent is not "undelivered"); (b) a redelivered claim skips parts already marked sent (idempotent parts); (c) LOG the message id on every "forwarded" line (today none → the log can't prove one vs two forwards). Test: fake Telegram client fails once then succeeds → exactly ONE bubble, row acked. Evidence: ~/.pij/telegram-bridge.log:99-102; receipts for seq 3263. Order: after 23.

## 2026-08-28 — o-prime RESEQUENCE + ADV-1 CORRECTION + item-23 ruling. Order now: 23 → 21 → 22 → 24.
CORRECTION to my ADV-1 read: the durable receipts table since 3255 has ZERO 'unverified' (95 acked, 12 injected; seq 3260 = acked reader=pij-associated-louse). What I measured (26 delivered/21 unverified) is the SENDER-SIDE TRANSPORT receipt from item-20's default flip — durable DELIVERY is intact; only the transport receipt is pessimistic. Impact confirmed = reporting-only, and narrower than I framed (durable evidence fine).
**Item 23 ruling (b)+(a)-as-measurement — item 23 goes FIRST:**
1. A flushed socket write to claude is **`sent`** (NOT `unverified`); a NAK/drop stays `failed`; `confirmed` ONLY on a positive ack. (`sent` = new/reframed outcome: on the wire, no negative signal, not positively acked — less pessimistic than `unverified`.)
2. The sender-side receipt DEFERS to the durable reader-ack when one exists: **acked in the queue ⇒ report `delivered`**, whatever the transport said.
3. MEASURE ackWaitMs once at **1000ms** to settle whether the receiver EVER positively acks on success — record the answer in the spec's outstanding list either way.
Test: fake claude receiver that never acks success → `sent`; one that NAKs → `failed`; durable ack present → receipt reads `delivered`.

## 2026-08-28 — E22 (flaky-file hunt, mine): candidate files named, exact test truncated
o-prime asked me to name the flaky file from vitest bg logs (its own run: 1 failed→rerun green). From ~/.pij/pij-associated-louse/bg-*.log (ANSI-stripped): transient failures seen in `acceptance-sweep.test.ts` (14 tests|1 failed, 831ms) and `cli.integration.test.ts` (98 tests|1 failed, **152966ms**). `release-age-policy.test.ts` is the KNOWN pwsh-ENOENT env failure (deterministic, exclude). The logs are TRUNCATED before the failed test NAME (same truncation the o-prime hit) — I can name files, not the test. PRIME SUSPECT: `cli.integration.test.ts` — 152s runtime, real CLI subprocesses, timing/subprocess-sensitive under concurrent fleet load → classic timeout flake. E22 fix shape: quarantine/harden the slow subprocess tests (raise per-test timeout, or serialize/isolate the subprocess-heavy `it`s), and capture the FULL vitest output (the truncation is itself a defect — a flaky report you can't name is unactionable). Order: with the tail (low priority; 23→21→22→24 first).

## 2026-08-28 — E22 ATTRIBUTION CORRECTION (o-prime, rule 8) + my evidence-binding miss
CORRECTION: the cli.integration.test.ts + acceptance-sweep.test.ts "1 failed" rows I found in s391's bg logs are the TWO PRE-9-FX skill-string failures from the Phase-2 rebase log (s391: "the ONLY failures ever recorded") — FIXED by PR #10, green since. They are NOT the flake. I mis-bound OLD, already-fixed failures to the o-prime's RECENT b060fad flake without checking their provenance/timestamp → my "cli.integration is the prime suspect [for the flake]" was WRONG. E22's actual flake remains UNIDENTIFIED (single occurrence at b060fad, rerun green; may never recur).
**Corrected E22 scope**: (a) capture FULL vitest output on every run (via `pij bg`) so a future flake IS nameable; (b) harden the 152s subprocess-heavy cli.integration.test.ts (per-test timeout / serialize the subprocess-heavy its) as ROBUSTNESS — stated as such, NOT labeled "known flaky" (no evidence it flakes). Order: tail, after item 24.
**My evidence-binding miss (pattern, ledgered)**: DL-011 (relayed coder's unverified line numbers), DL-012 (grep count as evidence), and now this (attributed old fixed failures to a recent flake). Same failure mode: drawing a conclusion from evidence without verifying it supports the SPECIFIC claim (here: not checking the failures were contemporaneous with b060fad). Rule going forward: before citing a log/number/line as evidence FOR a claim, verify its provenance binds to that exact claim (timestamp/commit/run), not merely that it's superficially related.

## 2026-08-28 — o-prime RULING: SPLIT #23 confirmed + ITEM 23b design + ruling-2 premise correction
(1) SPLIT #23 = my plan exactly: ship `sent` taxonomy + E21, emitSendReceipt reverted to main's honest mapping (sent → unverified). DONE — force-pushed split (head b9ed67b); 2 green full runs launching (bg-mtbw5yzr-cjf2ae), then o-prime merges.
(2) **ITEM 23b = honest receipt redone**, design (a)+(b): record marker ORIGIN (daemon-inject vs reader); the receipt defers ONLY to a reader-ORIGIN ack; a later REAL reader ack UPGRADES the receipt; a test that pins a NON-delivered receipt (the constant-fold mutant MUST die — else the dead-arm regression recurs); for Copilot RPC the server messageId IS a real positive ack → may map to `confirmed`.
(3) **o-prime's ruling #2 was wrong in premise** — it named "the durable reader-ack" without checking WHO WRITES it (the daemon does, at delivery: daemon.ts markRead). Correction recorded against the o-prime in the spine (rule 2: state your instrument). **CONSEQUENCE for the day's evidence**: every "acked (reader=X)" cited for CLAUDE-SOCKET sends is DAEMON-origin ("injected"), NOT reader-"read". My own ADV-1 "durable delivery intact/acked" read inherits this nuance — bytes flushed to socket, but "reader=X" ≠ reader processed. 23b must make origin VISIBLE in `pij queue`/receipts so nobody (o-prime or me) reads it as reader confirmation again. **Copilot RPC + Telegram bridge acks were REAL positive acks and stand.**
