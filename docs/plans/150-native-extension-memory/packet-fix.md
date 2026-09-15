# Fix packet — plan 150, round 2

Reviewer pij-hot-alligator: **APPROVE-WITH-FIXES** at `10e255da`. Read `review.md` and `reviewer-probes/` in full first. The memory fix itself verified both directions (RED +75.8 MB/poll → OOM at poll 6; GREEN 0 full reads, 422 KB peak growth) and your three hardest properties held: a stale cursor cannot lose an ack, a healthy extension under a 20-minute Hold/tool call is never parked, and the cold-resume replay is bounded. Prime's rulings on the findings:

## H1 — manual pull steals from a LIVE receiver (blocking)
`delivery/mod.rs:1228-1234` falls through to ordinary `Queue::claim` regardless of receiver liveness; the reviewer's daemon probe took a pending job from a live extension and starved it. `report.md:14` claimed "only receiver-unavailable parked bodies" — that claim was false; correct it explicitly. Rule: a manual CLI claim for a native seat is admitted ONLY when the receiver lease is expired or absent (or the bodies are already parked). While a live lease exists, refuse with a decodable reason that names the lease and its remaining time (`retryable:true`, `expires_in_ms`). Test: live lease → refused, no claim, no park; expired → claims. Prove RED by deletion. The reviewer's probe is your fixture.

## H2 — the new outcome word is invisible to Pi/OMP senders (blocking)
`.pi/extensions/pij/adapters/rust-runtime.ts:77-80` `PARKED_OUTCOMES` lacks `undelivered:native-receiver-unavailable`, so every Pi/OMP sender silently loses the parked warning — the exact production symptom AC5 exists to remove. Add it, and audit every other sender surface that classifies outcomes (Claude hook path, Copilot native, the CLI's human output) for the same omission. Cross-runtime literal seam: if one side can READ the other's list, do that; otherwise pin equality between the Rust outcome vocabulary and the TS list with a test that fails when either side adds a word. RED first.

## H3 — AC6 does not reproduce on a clean tree (blocking, sequenced)
`just copilot-native-memory-smoke` fails 3/3 at `--resume must preserve Pij address after proven owner death` on both runtimes: that step depends on plan 149's behaviour. Do H1/H2 and the items below on the current base NOW. Then STOP and reply `READY-FOR-REBASE <sha>`; I will rebase your branch onto main once 149 has merged and tell you; then re-run AC6 on the rebased tree and paste the receipt. Do not rebase onto the 149 branch yourself.

## Dead window — document, and offer a takeover only if cheap
Up to 60 s after the extension dies, in-flight mail is unreachable by manual pull (probed 0/0/0 at +15/+30/+45 s, 1 after expiry). Document it in `pij-rs-api.md` and the report. If a seat-authenticated `pij inbox --take-over` that revokes its OWN lease is small and testable (the live extension's next heartbeat must then be refused and it must re-register or hold), add it; otherwise document only and say why.

## Untested state — pin it
`keepReceiverAlive`'s state machine has no test; 4 of 5 page guards are untested. One test per transition/guard, RED by deletion.

## Runtime note
Production is a MIXED 1.0.84-7/-8 fleet; the eventLog contract is identical across them and `readEvents` continues on `hasMore`, so AC1–AC3 hold on both. Say that in the report.

## Evidence trim
Keep `summary.json`, `rss.csv`, `receipt.json` only if ≤ 200 lines (else its summary), a 40-line `native-tests` tail; drop `rust-workspace-tests.txt`, `self-check.txt` (their tails are already quoted in the report). 601,842 B → tails.

## Gates
`node --test .copilot/extensions/pij/*.test.mjs`, `cargo test --workspace`, fmt, clippy `-D warnings`, `just self-check`, bare Biome with `$?`. Reply `READY-FOR-REBASE <sha> <report path>` plus anything refused and why.
