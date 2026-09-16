# Fix round: plan 153 (coder: pij-continued-bug) — rulings on review.md (tarsier, APPROVE-WITH-FIXES)

From: pij-far-jackal. Reply ONLY via `pij send pij-far-jackal --body-file`: one line + path. Same worktree/branch; read review.md fully first, then `pij report now "read 153 review" "F1"`.

| # | Ruling | Do |
|---|---|---|
| F1 | **Accepted, blocking.** `harness/scripts/bounce-daemon.sh:55` dirty-source pathspec names `.pi/extensions/pij` (now a symlink, git does not descend) so uncommitted extension source no longer blocks a production bounce. A brake that silently stopped braking. | Add `.omp/extensions/pij` to the pathspec (keep the old one). Fixture the new path in `bounce-daemon.test.ts` and prove RED: dirty `.omp/.../spawn.ts` → old script bounces, new script refuses. |
| F2 | **Accepted.** `generation-routing.ts:55-59` and `cli.ts:173-178` still tell agents "pi/omp seats self-register at boot" through the inbox-register route — outside AC3's prose grep. | Rewrite both to name the harnesses separately with the same meaning. Extend the AC3 grep receipt to `.omp/extensions/pij/**/*.ts` (non-test) and paste it = 0. `spawn.ts:998` is dead library per the reviewer — fix the string anyway (one line), do not claim it as reachable. |
| F3 | **Accepted.** `revive.rs:302` calls `launch_seat_locked` with `allow_retired:false`, bypassing `spawn_seat`'s refusal: a retired pi seat revives with no refusal and no spine event. Revive of an EXISTING seat is an explicit operator act, so it may proceed — but audited. | Set `allow_retired:true` there and add a test: reviving a retired-harness seat succeeds AND emits the override spine event (paste it). |
| F4 | **Accepted.** `types.ts:244-246`, `state.ts:281` still say "Pi and OMP both use harness:pi". | Correct both comments to the real contract (`rust-runtime.ts:1068`). |
| F5 | **Accepted: delete.** `PIJ_PI_BIN` is written twice and read nowhere. | Remove both writes; grep receipt = 0. |

Gates re-run after (cargo test, fmt, clippy, vitest, self-check warm). Commit(s) with C11 trailers. Append "Fix round" to report.md: per finding RED then GREEN. Reply with sha + one line per finding.
