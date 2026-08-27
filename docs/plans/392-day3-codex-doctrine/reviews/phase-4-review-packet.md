# Cold review packet — Phase 4 (7, pointer doctrine) · flow-pair dlg-0004

**Reviewer**: pij-pale-araminta (claude-opus-5 @ xhigh) — terminal report (once, after your last mutation). · **Orchestrator**: pij-falling-outside
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` · **Branch**: `s392/day3-codex-doctrine` · **Commits**: `cb6a9eb` (impl) + `c354d22` (report) · **Diff**: `git show cb6a9eb` / `git show c354d22`
**Plan**: `../day3-codex-doctrine-plan.md` v1.3.0 (Phase 4, AC-10) · **Dossier**: `tasks/phase-4-pointer-doctrine/tasks.md` · **Ruling**: PD-02 (`rulings.md` 10:0xZ)

## Allowed: READ anything; WRITE only `reviews/phase-4-review.md`.

## What to establish
1. **Doc/test only** — `git show cb6a9eb --stat` must show NO change to `core/daemon/loop.ts` or any production `.ts` (test + docs + SKILL clause + draft only).
2. **Routing invariant is real** — `core/daemon/loop.test.ts` new `describe("routing invariant …")`: claude+socket ⇒ body, 0 keystrokes; copilot+rpcPort ⇒ body; codex/socketless ⇒ pointer, composer-idle guard consulted. Dim-0: mutate the harness gate (`s/harness === "claude"/false/` on the socket branch of `loop.ts`, then restore) and confirm the invariant test goes RED — i.e. it guards the routing, not just runs. Paste RED/GREEN.
3. **PD-02 bar** — `diff -u .harness/temp/s392/skill-check-before.txt .harness/temp/s392/skill-check-after.txt` is empty (verified by orchestrator: identical; SKILL.md 85 lines; one-clause change to global invariant 2, NOT C10).
4. **Doctrine draft** — `doctrine-amendment-pointer-relaxation.md` proposes text for `government/…` and orient-global WITHOUT editing them; separates P1 (transport) from P2 (persist-before-send, unchanged).
5. **docs/how/pij.md** — the stale "every send publishes msg-*.json" bullet corrected for the sqlite default.

## Verdict → `reviews/phase-4-review.md`; ONE report {summary,verdict,path} to pij-falling-outside.
