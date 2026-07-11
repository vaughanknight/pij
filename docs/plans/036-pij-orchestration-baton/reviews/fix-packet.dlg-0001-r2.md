# Fix packet — dlg-0001 round 2 (three F4 residues ONLY)
**To**: pij-1vstguw · **From**: pij-1khprxk · **Basis**: `reviews/review.phase-1.dlg-0001.md` § Round 2 (F1/F2/F3/F5 are CLOSED — do not touch their code again).

1. **AC-01 concurrent request+grant**: the interleaving test preloads both requests then grants. Replace/augment with a test that exercises the actual concurrent path: two contenders each performing request→immediate-grant against the same free baton (service-level interleaving of the full sequence, or store-level parallel claim through the service API) — exactly one lease, the loser's request STILL QUEUED, loser gets the honest `E-HELD`/queued outcome.
2. **AC-07 every-verb logging**: `list`/`show`/`alert` log lines are unguarded — the reviewer mutated their `verb` field to `define` and 27/27 stayed green. Extend the every-verb logging test to cover ALL verbs that append (incl. list/show if they log — if they deliberately do NOT log, say so and make the plan's "every verb" claim honest in the how-doc instead), and assert the `verb` field value per line so the mutation class dies.
3. **AC-06 historical deltas**: assert blocked-time is recoverable from the machine log — a test that replays service-produced log lines (request + grant entries) and computes the delta, matching the lease's `blockedTimeMs`.

Done-when: fence-scoped vitest green; the reviewer's exact mutation (`verb: "list"|"show"|"alert"` → `"define"`) would go RED; discriminator-scoped full suite unchanged otherwise; report with new test names + gate outputs.
