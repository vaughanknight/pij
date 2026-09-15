# Fix packet — plan 149, round 2

Reviewer pij-sunny-tarsier: **APPROVE-WITH-FIXES** at `6be799ec`. Read `review.md` in full first. Prime's rulings below; all eight findings are accepted, F001–F003 and the Retryable test are blocking, the rest ship in the same round because they are cheap and the reviewer already did the analysis.

## F001 (HIGH) — tombstoned rows are history, not competing addresses
Exclude `tombstoned_at.is_some()` rows from the ambiguity count in `registration.rs` AND the client mirror in `store.mjs`; the two layers state the same rule. Rewrite `native_session_ambiguity_returns_typed_retry_without_mutation` so it pins the CONTRACT: one live row + N tombstoned rows for the session ⇒ **200, resumed on the live row**; two live rows ⇒ 409 retryable, no mutation. Prove RED on the current tree for the first case (it 409s today). Then run the fixed daemon against a READ-ONLY copy of the production store (`cp ~/.pij-rs/pij.sqlite* /tmp/…`, isolated daemon) and paste the registration outcome for all four duplicated sessions the reviewer listed — the plan's own defect population must register.

## F007 (with F001) — selector must not be alphabetical
`registration_target` picks the first `ORDER BY id` match. Rule: prefer the live row; among several, the most recent `proc_start`; never a tombstoned row when a live one exists; alphabetical only as a last deterministic tiebreak. Test with three same-session rows in adversarial alphabetical order.

## F002 (MEDIUM) — the spawner's intent wins over a saved session
A verified spawn prebind (same pane + spawn id + `proc == null`) carries the spawner's chosen id AND parent. It must NOT be displaced by a same-session candidate; if both exist, the prebind is the identity and the saved row is superseded/retired by the daemon with an event — or the composition is refused with a named reason. Either way `pij spawn`'s waiter must not 504 on a tombstoned id while the seat runs elsewhere: add a `/v1/spawn`-layer test that spawns, resumes, and asserts the waiter resolves. State the parent-flip you found in `report.md`.

## F003 (MEDIUM) — name the dependency
The same-session claim displaces a live incumbent with no liveness probe, relying on Copilot allowing one live host per session (`inuse.<pid>.lock`). Name that dependency, and what happens if it is violated, in `docs/how/pij-rs-api.md` (registration section) and `report.md` § Operational risks. If you can cheaply keep a liveness probe as a tiebreak when the incumbent's pid is alive, do it and pin it; otherwise document only.

## Retryable branch — restore its test
The observed-owner-drift `Retryable` branch lost its test in the rewrite. Restore it; RED by deletion.

## F004 (LOW) — say the truth about cross-machine
`registry.rs:339` nulls `machine` on every write, so the cross-machine refusal is unreachable today. Keep the guard and its test; change the doc/report wording from "refuses" to "would refuse if a machine were ever recorded; rows are local at rest". No over-claim.

## F005 (LOW) — adopt keeps the discriminator
`identity.rs:606-609` collapses `Retryable` into a plain 400 on adopt. Map it to the same 409 `retryable:true` shape; one test.

## F006 (LOW) — pin P1c; second witness for the two single-test brakes
Per the reviewer's table. Each new test RED by deletion.

## F008 (LOW) — trim the logs
No prior plan committed raw gate logs. Keep `report.md`, `review.md`, the packets, `native-resume-live.ts`, `artifact-provenance.json`, and the two live receipts; trim every `gate-*.log` / `red-*.log` / `green-*.log` to its last 60 lines with a header naming the full command and exit code. Evidence is the tail plus the command, not 1,600 lines.

## Gates and reporting
Full: `cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `node --test .copilot/extensions/pij/*.test.mjs`, `just self-check`, bare Biome with `$?`. Every new/changed test: RED output pasted from the pre-fix tree or by deletion, labelled which. Update `report.md` (correct anything F001–F004 showed was over-claimed; say what was claimed and what was true). Reply one line: `FIXED <sha> <report path>` plus anything refused and why.
