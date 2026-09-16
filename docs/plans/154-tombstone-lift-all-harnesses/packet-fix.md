# Fix round: plan 154 (coder: pij-dry-pavetta) — rulings on review.md (alligator, APPROVE-WITH-FIXES)

From: pij-far-jackal. Reply ONLY via `pij send pij-far-jackal --body-file`: one line + path. Same worktree/branch; read review.md fully first (probes are runnable under reviewer-probes/), then `pij report now "read 154 review" "F001"`.

| # | Ruling | Do |
|---|---|---|
| F001 | **Accepted.** `paneless_target` (:1022) filters retired rows out, so a returning headless seat mints a new id or is refused as "a subagent of <id>" — a relationship that does not exist. Latent today (0 paneless live) but it makes the contract false on one path. | Mirror the native branch of `registration_target`: retired rows sort last, never excluded; continuity ladder applies; foreign → the same AC3 refusal. Tests for both shapes the reviewer proved (new-id mint; false "subagent" refusal) on claude, codex and copilot paneless, RED first. |
| F002 | **Accepted — gate all three rungs.** The packet said `harness AND (session OR spawn OR proc)`; the code is `(harness AND session) OR spawn OR proc`, and a lift rewrites `descriptor.harness`. Plan 153 just made harness identity explicit; a lift must never flip it. | Require same harness on every rung; a claim whose harness differs from the retired row is refused with the AC3 envelope plus `harness mismatch: row <h1>, claim <h2>`. Remove the harness rewrite on lift. Tests: the reviewer's two probes (pi claim on the proc rung, claude claim on the spawn rung against an omp row) become refusals, RED first. Doc paragraph updated to the gated ladder. |
| F003 | **Accepted.** The `missing-process` case in `retired_registration_does_not_treat_absence_or_foreign_harness_as_continuity` is refused by admission, not the ladder. | Assert the exact refusal message in every case of that loop; show the loop goes red with the continuity block deleted. |
| AC4 wording | **Report is honest; plan over-promised.** | Amend plan.md AC4 by excision to what was delivered: "the pre-existing `tombstone_if_unchanged` CAS is pinned by an interleaving test; the sweep cannot re-tombstone a re-registered incarnation" — grep the old sentence to 0. |
| Minor 1 | Accepted. | `gate-rust.log`: re-run as check-only (no `cargo fmt --all &&` before `--check`). |
| Minor 2 | Accepted: one event per transition. | Native retired resume emits `seat.native-resumed` only; every other harness emits `seat.resumed`. Test pins exactly one event. |
| Minor 3 | Accepted. | One sentence in report.md pointing from `red-invariant.log` (first case) to `red-registration.log` (the rest). |
| Cold self-check flake (DL-002, now seen on three checkouts) | Out of scope here; prime is ticketing it. | — |

Gates re-run after (cargo test, fmt --check, clippy, self-check warm). Commit(s) with C11 trailers. Append "Fix round" to report.md: per finding RED then GREEN. Reply with sha + one line per finding.
