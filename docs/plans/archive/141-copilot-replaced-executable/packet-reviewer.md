# Review: plan 141 — accept a replaced Copilot executable on Linux (issue #397)

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn, one line + a path. Load the pij skill (you are registered; do not adopt) before acting.

Worktree: /Users/jordanknight/pi-hacking/fs3-copilot-replaced-exe, branch `141-copilot-replaced-executable`. `cd` there. Review the branch HEAD against `7e9bf2b1` (main). Read plan.md, then `gh issue view 397`, then report.md, then the diff. Rust via `~/.cargo/bin/cargo`. Never touch the production daemon (127.0.0.1:7461) beyond read-only verbs. Mutation probes ONLY in a throwaway worktree of the branch (`git worktree add /tmp/141-probe <branch>`), never in the shared one.

Verdict standard (memory: "green that lies", "mutate the guard", "witness never failed"):
1. For every AC, name the test that would go RED if the behaviour were removed, and PROVE two: revert the Rust normalization and show the AC2 Linux test fail in Docker; revert the reporter advice split and show the AC4 test fail. Baseline green first, restore after.
2. Is the suffix stripped at OBSERVATION only (one fn per side), or did a matcher grow a second opinion? Two places that strip is a REJECT (one artifact, one formatter).
3. Does the change widen trust? Enumerate: forged argv0, a binary literally named `copilot (deleted)` on disk, a `node …/npm-loader.js` host, the extension child itself. Each must still be refused; cite the test or the line.
4. Incarnation check in `resolveNativeHost`: can raw and normalized commands ever be compared to each other? Cite.
5. Does the terminal banner still say "retrying" on any path? grep the string; check `extension.mjs` top-level `.catch` too.
6. Report honesty: does report.md cite Docker RED output that predates the fix, and was the Docker run the full `-p pij-daemon` suite? Anything unverifiable — say so per claim.

Write `docs/plans/141-copilot-replaced-executable/review.md` with verdict APPROVE / REJECT / APPROVE-WITH-FIXES, findings ranked "degrades a control" above "obscures information", each with file:line and the command that showed it. Commit it on the branch (C11 trailers via `pij-rs commit-trailers`). Deliver: verdict + sha + path in one `pij_send` line.
