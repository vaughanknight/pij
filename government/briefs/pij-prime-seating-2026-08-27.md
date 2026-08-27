# Brief — o-prime seat for the pij repository (from Vaughan via pij-vocal-kingfisher, 2026-08-27 ~07:30Z)

Vaughan's words: "kick off a pij-prime for working on pij, and get that discussion and work out of this [the perimenocause o-prime]; set it up in a tmux session called pij-prime, that way it can have its own fleet using the pij platform and I can have pij discussion there."

## Who you are
- The o-prime for `~/GitHub/pij` (github.com/vaughanknight/pij), living in tmux session `pij-prime`. Vaughan attaches there and talks to you directly; pij discussion moves to you.
- First action: `/pij prime` in `~/GitHub/pij`. The repo already carries a government (`government/` with handover/, prime-flow, briefs, PA standup recipe) — follow the route's probes; expect the orient/handover path, not bootstrap. Stand up your PA per the ruled recipe.
- Government is single-writer (you). Never write `.the-flow-state.json`, `the-flow.json`, `the-flow.md`.

## What just happened to pij (read these first)
- `~/GitHub/pij/reports/pij-comms-review-2026-08-27.md` §1–14 and `reports/pij-comms-review-2026-08-27/` (sub-seat findings, `benchmarks.md`): the comms review, PoC and merge.
- `~/GitHub/perimenocause/government/briefs/pij-comms-review.md` Amendments 1–4: Vaughan's rulings verbatim (day-2 GO with benchmarks; merge + SQLite default).
- Live state: pij main `2953d75` (merge `f14915b`); the live fleet daemon runs from `~/GitHub/pij` on it, pid 91876, `queue backend: sqlite` (`~/.pij/queue/pij.sqlite`); fs→sqlite migration done, 138 stale rows retired by direct state update (no retire verb exists). Claude seats get the inbox socket; newly spawned Copilot seats get `--ui-server` RPC; already-running Copilot seats use the pointer line + `pij inbox`. The Telegram bridge (pid 68840) still runs the pre-merge code.
- The seat that built it, `pij-primitive-toucan` (Claude Fable 5, held, in the perimenocause fleet), holds the deepest context. Adopt it into your fleet as a stream or harvest and close it — your call; tell pij-vocal-kingfisher which so its tree is updated.

## Day-3 list (not yet ruled — put to Vaughan in your own words)
1. `pij queue retire <filter> --reason` verb (stale rows had to be retired by SQL).
2. Codex path: fix the local Codex install and live-prove item 8 (`codex app-server` + `--remote`); until then Codex seats use the pointer line.
3. Restart the Telegram bridge on the merged code at a quiet moment; confirm it reads the SQLite inbox correctly and does not replay anything.
4. Report vocabulary: `pij report now --state working` is rejected (valid: blocked|question|hold|waiting|ready|failed|cancelled|done) while the PA's staleness rule expects it — reconcile.
5. Daemon UNVERIFIED warnings on the pointer path (typed pointer "never confirmed submission" while the seat did act) — make the confirmation honest or drop the warning.
6. Whatever Vaughan raises with you.

## One hard rule across primes
The live daemon serves EVERY fleet on this machine, including the perimenocause fleet governed by `pij-vocal-kingfisher` (o-prime, Claude Fable 5, pane %35). Before you restart, stop, or change the live daemon or the live checkout `~/GitHub/pij`, send `pij-vocal-kingfisher` a one-line notice and wait for its ack (it lands evidence through lanes and will pick a quiet moment). Never touch the perimenocause repo, its worktrees, or its seats.

## Reporting
- Card at both edges of work (`pij report now`), at your own altitude.
- Vaughan is on Telegram via `pij send pij-telegram "…"` (short, phone-sized) and in your tmux session directly.
