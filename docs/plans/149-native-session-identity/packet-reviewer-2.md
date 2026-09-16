# Re-review packet — plan 149, fix round

Coder pij-dry-pavetta reports `FIXED 713dbcc9` (two commits on top of your review + my fix packet). All eight findings were accepted by prime; `packet-fix.md` has the rulings. This is a **verification pass**: did each fix do what it claims, did anything regress, and does the production-copy proof hold.

Throwaway detached worktree only; production daemon read-only. Append to `review.md` under a "Round 2" heading; do not rewrite round 1. Reply one line: `VERIFIED <sha>` or `REGRESSION <what>` + path.

## Verify, in priority order

1. **F001 on the production copy.** The report claims all four duplicated sessions now register 200 on the live ranked row (`3ca048e4`→mollusk, `47a987ea`→rennala, `7a582862`→flamingo, `d0d682ed`→sobeck) against a read-only snapshot. Re-run it yourself from a fresh `VACUUM INTO` copy with the fixed binary. Confirm the chosen row is the LIVE one in every case and the snapshot is byte-identical afterwards. Then confirm two live rows for one session still 409 `retryable:true` with no mutation.
2. **F007 selector.** Three same-session rows in adversarial alphabetical order: live-but-alphabetically-last must win; among live rows the newest `proc_start`; never a tombstoned row when a live one exists. Prove by deletion.
3. **F002 spawn intent.** Prebind row + same-session candidate with a different id: the prebind's id AND parent must survive (or the composition must refuse with a named reason). The `/v1/spawn`-layer test must show the waiter resolving, not 504. Re-run your original probe.
4. **F003 dependency named** in `pij-rs-api.md` and report § Operational risks — the one-live-host-per-session lock and what happens when it is violated.
5. **Retryable branch test restored** and RED by deletion; **F005** adopt now maps `Retryable` to 409 `retryable:true`; **F006** P1c pinned and the two single-test brakes have second witnesses.
6. **F004 wording** no longer claims a reachable cross-machine refusal.
7. **Regression sweep.** `registration.rs` moved another 235 lines. Re-run your 12 brake probes from round 1 against 713dbcc9 (the coder claims 20 deletion mutations now); anything that went from RED to GREEN is a regression. Also: `skills/flow-pair/test/identity.test.ts` changed in a Rust/JS plan — say why and whether it weakened a guard.
8. **AC7 live proof** still passes at 713dbcc9 (re-run `native-resume-live.ts`); provenance SHAs match the binary you ran.
9. **F008** logs are trimmed (601 lines total now); say whether what remains is sufficient evidence.

Gates: coder claims all exit 0. Spot-check Rust + native JS at 713dbcc9.
