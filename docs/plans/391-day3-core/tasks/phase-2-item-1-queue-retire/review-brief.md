# Cold review brief — Phase 2 (item 1, queue retire + sweep + listing) — dlg-0006
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon or `~/GitHub/pij`) · **Target**: branch `s391/item1-queue-retire` @ `6eee54b081e1650f740a760e4a8bde6f28c21758` on base `main@048a3e1`; freeze = `git rev-parse HEAD` must match, name it.
**Rubric**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory. **Plan**: § Phase 2, AC-03/04/05/05b/05c/06/15; rulings R-5 (a)+guards, PA REFUSE, `parked` open-but-stuck, dual via `sqliteOf`; dossier `tasks/phase-2-item-1-queue-retire/tasks.md`.

## Aim — what the gates cannot prove
1. **Terminality**: no mutator (`ack`, `claimUnread`, `markRead`, `settle`, `claim`, `recoverStaleClaims`, `resetClaimsOnStart`) can move a `retired` row; `TERMINAL` covers `acked|retired`; `parked` is retireable and NOT terminal.
2. **Sweep predicate** (`daemon.ts retireForClosedRecipients`): fires ONLY on `lifecycle==="dissolved" && closeIntent && terminal.disposition==="requested"`; enumerates recipients from the queue (not `registry.list()`, which hides dissolved seats); tick-scope; `sqliteOf` so dual works.
3. **Incident replay (AC-05c)**: after a complete close, ≥4 ticks with a recycled pane id → ZERO sends for the closed seat; the drain guard (`T009b`) refuses a `dissolved` descriptor even with the sweep absent — check both halves are independently proven.
4. **Revive un-retire (R-5 guards)**: ONLY reason `recipient-closed` requeues; `requeued` receipt carries revive evidence; end-to-end delivers each message EXACTLY once after revive (count sends); operator-retired rows stay retired.
5. **PA totality**: `paCapabilityVerb` maps `queue` subverbs; scrape reads a real `switch` in `cli.ts`; anti-vacuity floor ≥2; `queue retire` = `refuse`, `queue migrate` = `allow`; `pij queue` read view still `allow`.
6. **Listing ergonomics (AC-15)**: default latest 200 + `showing N of M` footer; `--all`; `--since`; `--tail`; `--json {rows,total,shown}`; `runQueue` still flushes (Phase 1a covers the class; check no `process.exit` regression matters). The one-line non-vacuity comment above the 812-row pipe test (Phase 1a review F-1).
7. **Scope**: `git diff --name-only main...HEAD` ⊆ packet allowed paths; no `SessionDescriptor` field; `core/revive.ts` untouched (un-retire lives in the `cli.ts` revive bin, both paths).
8. **Docs**: `docs/how/pij.md` queue section; `pij-messaging` domain source row + `Delivery state machine` concept.

## Dim-0 (do it, record evidence; restore byte-identical each time; final `git status --porcelain` = baseline of untracked orchestration docs only)
- Make `retire()` skip the receipt write → sqlite-queue test RED (receipt trail).
- Loosen the sweep predicate to bare `dissolved` → pane-gone negative test RED.
- Remove the `reason` filter in `unretire` → "operator-retired stays retired through revive" RED.
- Remove the drain guard (T009b) but keep the sweep → the guard-only test RED (proves the two halves are independent).
- Delete the `case "retire":` mapping in `paCapabilityVerb` → scrape test RED.

## Gates to re-run yourself
- `npx vitest run .pi/extensions/pij/` → 0 fail (use `pij bg`); `tsc --noEmit`; biome on changed files.

## Verdict → `docs/plans/391-day3-core/tasks/phase-2-item-1-queue-retire/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
