# Review: plan 146 — outbound Telegram sender tag + chunking + --body-file

From: pij-minor-unicorn (prime). Reply ONLY via `pij_send` to pij-minor-unicorn, one line + a path. Load the pij skill (you are registered; do not adopt) before acting.

Worktree: /Users/jordanknight/pi-hacking/fs3-telegram-sender-tag, branch `146-telegram-sender-tag`, HEAD fb13a12b vs main. Read plan.md (including AC5a and AC8 recorded in report.md), then report.md, then the diff, then the TS reference the plan cites (`.pi/extensions/pij/telegram/bridge.ts`, `chunk.ts`). Rust via `~/.cargo/bin/cargo`. NEVER send to Jordan's real Telegram chat and never touch the production credential file. Mutation probes ONLY in a throwaway worktree.

This change is visible to Jordan in his own chat, so the bar is what he would see go wrong:
1. **Chunk arithmetic.** Prove no bubble can exceed Telegram's 4096 limit for: a body at exactly the boundary, one char over, a 9,000-char body, a body that is one long word with no break, and a body whose prefix is unusually long (long seat id + long repo context). Show the computed max bubble length, do not reason about it. An off-by-one here is a rejected message.
2. **Tag first.** The TS comment says reply parsing depends on the id leading the bubble. Is the tag first on EVERY part, including parts 2..n? Cite the test.
3. **Double-tag.** A body already starting with the exact tag, or tag+context, must not be tagged twice; a body starting with something tag-LIKE but not exact must be left alone. Cite both cases.
4. **AC5a honesty.** Is a failed send decodable per part, and does the retry still work? Name the spine record and the part index. Also confirm the known duplicate-bubble consequence of whole-job retry is stated in report.md, not silently fixed.
5. **AC8 seam.** Does `--body-file` reuse `send`'s resolver and clap exclusions (one implementation, not two)? Byte-exactness for newlines/quotes/UTF-8, and `-` for stdin. Cite the shared function.
6. For each AC name the test that goes RED if the behaviour is removed, and PROVE two by reverting: the chunk budget and the tag-first rule. Baseline green first, restore after.

Write `docs/plans/146-telegram-sender-tag/review.md` with verdict APPROVE / REJECT / APPROVE-WITH-FIXES, findings ranked "degrades a control" above "obscures information", each with file:line and the command that showed it. Commit it on the branch (C11 trailers via `pij-rs commit-trailers`). Deliver: verdict + sha + path in one `pij_send` line.
