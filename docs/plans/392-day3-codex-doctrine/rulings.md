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
