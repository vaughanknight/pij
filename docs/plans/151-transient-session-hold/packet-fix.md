# Fix round: plan 151 (coder: pij-dry-pavetta) — rulings on review.md (tarsier, APPROVE-WITH-FIXES)

From: pij-far-jackal. Reply ONLY via `pij send pij-far-jackal --body-file`: one line + path. Same worktree/branch; read review.md fully first, then `pij report now "read 151 review" "F1"`.

| # | Ruling | Do |
|---|---|---|
| F1 | **Accepted, blocking.** The precedence "finish the scan so an ownership refusal beats the hold" is real (reviewer proved it observable: two seats in one pane → HEAD 400 naming the relay seat, mutant 409 naming the copilot seat) and unwitnessed. | Add the two-seats-one-pane test exactly as § F1 describes; show it RED against the mutant (comment+`continue` removed) and GREEN on HEAD. Keep the comment. |
| F2 | **Accepted.** A hold must require a pane match; M3+M4 surviving is a tripwire gap even if unreachable today. | One test at `registration.rs:1191-1192` such that M3 and M4 both go red. Paste the mutant runs. |
| F3 | **Accepted, and I rule further than the reviewer.** Unbounded-silent is not acceptable as the only bound. | (a) `docs/how/pij-rs-api.md:62`: one sentence — the hold retry has no attempt limit; fork termination is the terminating bound; after the escalation below it continues at a slower cadence. (b) Code: after **10 minutes** of continuous hold (constant named, e.g. `HOLD_ESCALATION_MS`), emit exactly ONE line "[pij native] still waiting for this pane's resumed Copilot session after 10 min; pij delivery is unavailable in this window" (never "restart the Copilot CLI"), and drop the retry cadence to **60 s**. Do NOT exit (exit re-enters the fork loop). Test with fake timers: no line before 10 min, one line after, cadence change observed, second hour produces no further lines. |
| F4 | **Accepted.** | Rename `existing_lines_unchanged` → `existing_test_lines_unchanged` in guard-provenance.json (and wherever it is written). |
| Trim | **Apply the § 9 list as written**: delete `live-stretch-green.json` and `ac0-red.json`; reduce `live-red.json` to the two facts + pointer. Keep everything the reviewer says to keep, incl. `transient-hold-live.ts`. | Note the deletions in report.md with one line each on why they were redundant. |
| Coverage concentration (§ 1 note) | Noted, no action this round. | — |

Gates re-run after the fixes (cargo test, fmt, clippy, node file-glob, self-check — warm cache; if self-check times out cold, say so and rerun). Commit(s) with C11 trailers. Append a "Fix round" section to report.md: per finding, the RED and the GREEN. Reply with sha + one line per finding.
