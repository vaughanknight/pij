# Ship report — jordan-spec (s393)

**Seat**: pij-dependent-ptarmigan · **Date**: 2026-08-27T15:5xZ · **Branch**: `s393/jordan-spec` → **PR #16** https://github.com/vaughanknight/pij/pull/16 (base `main@ed20a68`) · **Card**: see spine

## claim
The standalone handoff spec is written, cold-reviewed to APPROVE, and on a PR. Deliverable (1) of the brief is complete pending the o-prime's merge; deliverable (2) (GitHub issue on `AI-Substrate/pij`, spec verbatim) is NOT started — gated on the o-prime's explicit GO after reading the spec.

## artifacts[]
- `docs/specs/claude-copilot-sqlite-sockets-comms.md` — 722 lines, 17 sections + source index; anchors on `main@ed20a68`
- `docs/plans/393-jordan-spec/thesis.md`, `reports/preamble-checkpoint.md`, `reports/pr-body.md`, this file
- `docs/plans/393-jordan-spec/reviews/{spec-review-packet,spec-review,spec-rereview-packet,spec-rereview,spec-rereview2-packet,spec-rereview2,reviewer-canary}.md`

## shas[]
- spec draft `939c08f` → review fixes `223fa64` → diagram fix `d3714eb` → verdict `5a185a5` (PR head)
- base `ed20a68` (main at write time; main moved to `d620cdd` during the session — docs-only, no source anchors affected: `git diff --name-only ed20a68 origin/main | grep -E '^\.pi/|^docs/how'` empty at last check)
- brief sha256 b9e057b3…f027166177 · definition sha256 c38bb2d6…a18b78a8e

## gates[]
- Mechanical anchor check: 110 `file:line` citations verified by `sed -n <line>p | grep <token>` on `ed20a68` (first pass found 17 off-by-8 `loop.ts` cites, `setBlocking` in the bin not `core/cli.ts`, three `docs/how/pij.md` ranges — all corrected before review)
- Meta-leak scan (`o-prime|prime|stream|baton|government|orient|brief|fleet|day-3|item N|names|s39x|roster|ruling`): clean
- Cold review (copilot gpt-5.6-sol xhigh, `pij-local-newt`, identity from process args, RPC-acked canary): FIX_REQUIRED (16 findings: 6 standalone-ness, 7 anchors/semantics, 2 completeness; 64 anchors checked, 7 failed) → all applied → re-review FIX_REQUIRED (1: diagram) → re-review #2 **APPROVE**
- Orchestrator sanity pass: re-read the D2-1 code path myself (`sqlite-queue.ts:371-378/385-403/437-443`, `daemon.ts:1174/1243`) — the reviewer's finding is a real code fact, now G25 + §14 item 21
- Docs-only PR: no code/test/skill changes; `harness checks` not run (nothing it gates changed)

## observations[]
- OBS-01 / friction / brief pointed at an uncommitted file in another worktree → o-prime committed a verbatim copy; encode: dispatch validator stats "read first" paths on the base sha
- OBS-02 / insight / finding C already fixed on main (PR #11) — definition's gotcha (a) documented as hit-and-fixed
- OBS-03 / DEFECT found by the cold reviewer / daemon-delivered rows never `claim()` so `attempt` stays 0 and `parked` is unreachable: a never-pulled pointer is re-announced every 90 s forever (`daemon.ts:1174,1243`; `sqlite-queue.ts:371-378,437-443`). Spec G25 + §14 item 21. **Candidate day-3 item for s391 (daemon/queue).**
- OBS-04 / DEFECT-class / both direct transports return `failed` after bytes may have landed (claude-socket error-after-write; copilot lost response) → at-least-once duplicate windows T1/T2, previously undocumented (spec §8)
- OBS-05 / friction / false `has exited` death notice ~5 s after a copilot spawn while the pid was alive (DL-001, `.harness/temp/agent/session-buffer.md`)
- OBS-06 / friction / `pij spawn --layout stack` in an 80-col window produced a 26-col pane in which Copilot's composer never classified `ready`; seat bound only after `tmux break-pane` to its own window. Encode: stack placement should fall back to `window` below a pane-width floor
- OBS-07 / friction / `pij canary` E-CANARY-TIMEOUT before a copilot first turn (known class, G8); mechanical identity from `ps` + RPC-acked delivery used instead
- OBS-08 / win / anchor verification as a shell loop caught 20+ stale line cites before any reviewer saw them — worth a `harness` check for docs that cite `file:line`

## open[]
- o-prime: merge PR #16 (docs-only) — push-main baton is yours
- o-prime: GO for the `AI-Substrate/pij` issue (spec body verbatim); I will `gh repo view AI-Substrate/pij` to confirm org/default branch immediately before filing
- OBS-03 / OBS-04 need an owner (daemon/queue code) — not this stream's fence
- Reviewer seat closed; registry clean
