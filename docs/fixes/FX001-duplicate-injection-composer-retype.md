# Fix FX001: Duplicate message injection — blind composer re-type on redraw lag

**Created**: 2026-07-10
**Status**: Complete — FX001-1..5 done; code review APPROVE after 1 fix cycle (`FX001-duplicate-injection-composer-retype.review.md`); live regression PASS; uncommitted
**Plan**: Standalone (regression introduced by plan 032 commit `5232bcf`)
**Source**: live repro + pane-sample forensics this session (harness observations DL-003, DL-005); first seen as 4× duplicated pastes in another session's peer (SecondCrack) and reproduced deterministically here on two fresh copilot gpt-5.6 peers
**Domain(s)**: pij-control-plane (adapters/daemon-tmux only)

---

## Problem

Every daemon-injected message into a copilot gpt-5.6 peer arrives as exactly **4
concatenated copies** submitted as one turn (boot onboarding text and ordinary
`pij send` alike). `DaemonTmux.sendText`'s type-confirm loop
(`.pi/extensions/pij/adapters/daemon-tmux.ts:202-208`, introduced in `5232bcf`)
capture-checks the composer **immediately** after `typeLiteral` with no settle
delay between attempts; copilot's composer redraws ~1–2 s behind a large
literal-key burst, so `composerHasTextTail` = false / `composerIsEmpty` = true
misreads a successful type as lost and **blind re-types without clearing** —
1 initial + `TYPE_CONFIRM_RETRIES = 3` = the deterministic 4 copies, then a
single Enter submits the blob.

Evidence (this session): 60 pane captures at 300 ms during a send — composer
empty for ~1.5 s, then all 4 copies at once, then one busy transition; daemon
log shows `route <id>: injected 1 message(s)` (drain path is innocent); two
independent peers each reported "4 copies seen" for every message.

## Proposed Fix

All in `adapters/daemon-tmux.ts` (+ its test file). Four pieces, ordered:

1. **Prove the composer-clear key first (spike).** Ctrl-U is the candidate but
   its effect on copilot's composer — especially with multiline/wrapped content —
   is an unproven load-bearing assumption (validate finding 4). Live-probe on a
   real copilot pane before anything depends on it; fall back to alternatives
   (Escape, `C-a C-k`, backspace burst) if C-u doesn't fully clear. The proven
   sequence becomes THE clear mechanism referenced by the tests and impl below.
2. **DI seam (behavior-neutral refactor).** `sendText` hardcodes
   `execFileRunner` and `sleepSync` (validate finding 1) — no test can script
   pane sequences today. Inject the key-runner and sleeper via `DaemonTmux`
   constructor options defaulting to the real ones; zero behavior change.
3. **Settle-poll semantics (exact, so implementations can't diverge —
   validate finding 3).** The poll REPLACES the immediate post-type check
   INSIDE each type attempt: after every `typeLiteral`, poll the composer up to
   **8 × 250 ms**; tail seen → proceed to submit; foreign text (non-empty,
   no tail) → break as today (never clear someone else's text); still empty
   after the full window → **clear (proven sequence) then re-type**. Attempt
   contract (one, explicit): the old `TYPE_CONFIRM_RETRIES = 3` (3 retries AFTER
   the initial type = 4 total) is **renamed and redefined** as
   `TYPE_CONFIRM_ATTEMPTS = 3` = **3 total `typeLiteral` calls including the
   first** (i.e. at most 2 re-types, each preceded by a clear). Worst-case added
   synchronous block: 3 attempts × 2 s = **+6 s per outer attempt** (~+18 s
   across `SUBMIT_RETRIES=3`)
   — pathological-pane-only (today's failure mode exits the poll at ~1.5 s);
   the daemon tick is already synchronous through `sendText`, and making
   delivery async is out of scope (noted as follow-up).
4. **Clear-before-retype in BOTH loops**: the proven clear sequence runs
   immediately before every re-type — inner (type-loss) and each outer
   `SUBMIT_RETRIES` attempt after the first — so retries are idempotent
   regardless of capture timing.

No change to the drain path, receipts, routing, or non-copilot harnesses
(`wake` = false path returns after one type + Enter as today).

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| pij-control-plane | internal | `adapters/daemon-tmux.ts`: DI seam (runner + sleeper), settle-poll, clear-before-retype; `adapters/daemon-tmux.test.ts`: scripted-capture coverage |

Contract-neutral: `sendText(paneId, text, harness?, pid?) → SendOutcome` signature
and the confirmed/unverified receipt semantics (plan 032) are unchanged.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | **Spike (live, throwaway):** spawn a copilot peer, type text into its composer via tmux (incl. a MULTILINE/wrapped payload), then probe clear candidates (`C-u`; fallbacks `Escape`, `C-a C-k`, backspace burst) and capture-verify the composer is empty after each. Record the proven sequence + evidence in the execution log | pij-control-plane | — (log only) | One clear sequence proven on a live copilot pane for single-line AND multiline content; verdict in `FX001-….log.md` | Proven: `send-keys -N <text-character-count> BSpace`; `C-u` clears only one logical line |
| [x] | FX001-2 | **DI seam, behavior-neutral:** `DaemonTmux` constructor accepts optional `{ runner, sleep }` (defaults `execFileRunner` / `sleepSync`); `sendText` + helpers use them; no logic change | pij-control-plane | `.pi/extensions/pij/adapters/daemon-tmux.ts` | Existing full suite green with zero test edits; `sendText` testable with a scripted runner | Full unchanged suite: 1,580 passed, 10 skipped |
| [x] | FX001-3 | **Tests-first, phase-specific scripts (non-vacuous):** (a) *redraw-lag*: scripted captures return empty composer for several inner polls → typed tail present → then preSubmit capture + busy/fresh-transcript confirmation; assert EXACTLY one `typeLiteral` argv total and outcome `confirmed`; (b) *genuine type-loss*: composer empty across the full poll window → assert the proven clear argv appears IMMEDIATELY before the 2nd type argv (exact ordering); (d) *attempt cap*: composer NEVER shows the text through all polls → assert EXACTLY `TYPE_CONFIRM_ATTEMPTS` (=3) `typeLiteral` argvs per outer attempt, every one after the first preceded by a clear argv; (c) *outer-retry*: tail visible after every type (inner confirm passes) but submission never confirms → assert clear argv immediately before each outer re-type and no accumulation of types without an intervening clear; mutation check: deleting the settle-poll, the clear call, or raising the attempt cap turns (a)/(b)/(c)/(d) RED respectively | pij-control-plane | `.pi/extensions/pij/adapters/daemon-tmux.test.ts` | All four failed for the intended reason before implementation and pass after it | Mutation-proven individually for poll, inner clear, attempt cap, and outer clear |
| [x] | FX001-4 | **Implement** the settle-poll (8 × 250 ms constants named/exported beside the SUBMIT_* family) per the exact semantics in Proposed Fix §3 — including the constant rename `TYPE_CONFIRM_RETRIES` → `TYPE_CONFIRM_ATTEMPTS = 3` (total types incl. the first) — + clear-before-retype in both loops (§4) using the FX001-1 proven sequence; document the worst-case synchronous block in the constants' doc comment | pij-control-plane | `.pi/extensions/pij/adapters/daemon-tmux.ts` | FX001-3 green (incl. the exact attempt-cap assertion); full `npm test` + typecheck + lint green; `wake`=false path byte-identical | 1,585 tests passed; typecheck and lint passed; foreign-text and non-Copilot branches preserved |
| [x] | FX001-5 | **Live regression (coordinated — daemon restart disrupts peers):** notify live orchestrators, restart daemon, spawn a copilot gpt-5.6 peer, run the RT protocol ("reply with N copies seen") → **"1 copy seen"** for both the boot onboarding text and an ordinary send; confirm a claude-harness peer send still lands once | pij-control-plane | — | Both live checks pass on the restarted daemon | PASS 2026-07-10: gpt-5.6-terra peer reported "1 copy" for RT3 (emoji payload — UTF-16 clear path live-exercised) AND for the boot text; claude peer received each reply exactly once |

## Workshops Consumed

None (root cause fully pinned by live forensics — see Source).

## Acceptance

- [x] FX001-1 log entry proves the clear sequence on a live copilot composer (single-line + multiline).
- [ ] A copilot gpt-5.6 peer reports exactly **1 copy** of every injected message (boot + ordinary send) on the fixed daemon.
- [x] Unit: redraw-lag script → exactly one `typeLiteral`; every re-type argv immediately preceded by the clear argv (both loops); mutation-deleting the poll or the clear turns tests red.
- [x] Full suite, typecheck, lint green; `wake`=false (non-copilot) path behaviorally unchanged.

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-07-10 | FX001-1 | Live spike | Copilot `C-u` clears only the current logical line; `Escape` leaves prior lines intact. | Use `send-keys -N <text-character-count> BSpace`, proven by capture-pane on single-line and three-line payloads. |
| 2026-07-10 | FX001-2 | Testability | `sendText`'s tmux and sleep effects can be injected without changing its public method contract. | Added constructor defaults for the real runner/sleeper; the unchanged full suite passed 1,580 tests. |
| 2026-07-10 | FX001-3 | Regression proof | The old loop produced 3 types under redraw lag, 12 types across capped loss, and no clear before inner or outer re-types. | Added four phase-scripted argv/capture tests and mutation-proved every load-bearing guard. |
| 2026-07-10 | FX001-4 | Implementation | A composer capture is not reliable immediately after a literal burst; absence is only actionable after the full settle window. | Poll 8 × 250 ms per type attempt, cap at 3 total types, and backspace-clear immediately before every re-type. |
| 2026-07-10 | FX001-4 review | Unicode correctness | Copilot's input reducer deletes one UTF-16 code unit per backspace, so code-point counting under-clears framed text containing astral characters. | Count with `text.length`; added a framed emoji loss-path test asserting 22 backspaces rather than 21. |
| 2026-07-10 | FX001-5 | Live regression | gpt-5.6-terra victim reported exactly 1 copy of the boot onboarding AND of an ordinary emoji-bearing send on the fixed daemon (was deterministically 4 before); claude peer received each reply once. | FX001 verified end-to-end; fix ready to commit. |
| 2026-07-10 | FX001-5 | gotcha | The regression run was initially blocked by an unrelated daemon defect: a dead session's stale descriptor (gone tmux pane) with a queued death notice makes EVERY tick error out ("can't find pane") BEFORE draining other inboxes — total delivery stall until `pij close <id> --force` reaps the descriptor. | Logged as harness observation DL-006 (dead-pane branch should reap, not retry forever); candidate FX002. |
