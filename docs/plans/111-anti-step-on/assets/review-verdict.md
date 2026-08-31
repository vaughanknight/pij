# Review verdict — plan 111 anti-step-on (ph-1113)

**Reviewer**: `pij-melodic-dragon` — model `github-copilot/claude-opus-4.7-1m` (cross-model from the coder gpt-5.6-sol and from PM Claude Opus 5).
**Diff under review**: `git diff origin/main...d977e4e5` (packet-referenced tip).
**Review tree HEAD**: `992a3798` (packet commit stacked on top of `d977e4e5`; no code deltas beyond `docs/plans/111-anti-step-on/packet-reviewer.md`).
**Method**: every verdict re-derived by EXECUTION — tests run, mutations applied. `flow-pair review` verb NEVER invoked. Every exit code read via BARE command (per F-1123 rule).

## Verdict

**APPROVE-WITH-FINDINGS.** All eight review-contract priorities pass. Every control in the impl-guide is enforced by a test that goes RED under a targeted mutation. Two receipt-labeling findings do not degrade any control — they OBSCURE INFORMATION about how strong the evidence is. Neither blocks merge.

## Baseline

- `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` at HEAD 992a3798, direct redirect (no pipe):
  ```
  BARE EXIT: 0
  pij-gate verdict
    toolchain PASS  rustc 1.98.0 == pin
    lock      PASS  Cargo.lock matches the manifests, and the tree
    fmt       PASS  cargo fmt
    clippy    PASS  cargo clippy
    test      PASS  cargo test
    arch      PASS  9 crates, 0 violations
  pij-gate: all stages green
  ```

## Ground-truth grounding for ac-1111 (reconstructed red-first)

The packet flags this as the reviewer's job to verify — the plan's "chronological red-first" run couldn't compile, so the witness was reconstructed on branch `s111/u-gate-proof`. Both halves checked:

1. **Tree-hash byte identity** (`C^{tree} == afba5b65^{tree}`):
   ```
   $ git rev-parse 59822844^{tree}   # C = final proof commit
   fd15a335487ee189ad3f8ef0f28f243cb487af0f
   $ git rev-parse afba5b65^{tree}   # the merged tree from feat commit
   fd15a335487ee189ad3f8ef0f28f243cb487af0f
   ```
   VERIFIED byte-identical.

2. **Assertion failure on the clock-only tree (A = `e9735b85`)**:
   ```
   $ ~/.cargo/bin/cargo test -p pij-harnesses --lib parked_draft_holds_at_most_the_idle_window_then_sends
   test interaction::tests::parked_draft_holds_at_most_the_idle_window_then_sends ... FAILED
   panicked at interaction.rs:160:9: assertion failed:
     block_on(gate.permits_injection("%108")).expect("parked draft expired")
   ```
   Genuine assertion failure. Not "cannot build".

3. **Green on expiry-added tree (B = `541c9085`)**:
   ```
   BARE EXIT: 0
   test result: ok. 1 passed; 0 failed
   ```

Reconstruction accepted. It is still weaker than a chronological witness (the coder wrote both the test and the sequence at the same time), but it is honestly named as such in the plan's own note and the shape is verifiable.

## Priorities (each: what I ran, what killed what)

### P1 — Can a parked draft still block forever anywhere? NO.

- Mutation **M1** (disable idle expiry — force `expire_vetoes_if_idle` to `stale = false`):
  ```
  BARE EXIT: 101
  test result: FAILED. 14 passed; 5 failed
  failures:
    initial_uncertainty_expires_to_tmux_mode_alone
    parked_draft_holds_at_most_the_idle_window_then_sends
    repeated_unknown_observations_do_not_refresh_interaction_age
    tap_latch_expires_after_the_idle_window
    unrecognized_veto_expires_to_the_tmux_mode_verdict
  ```
- One choke point (`InteractionGate::expire_vetoes_if_idle`) enforces the bound for every veto flavour (recognized-idle, tap-latched, uncertainty). No path around it inside the gate.
- Verdict: **CLEAR**.

### P2 — Can pij's own echo ever CLEAR a human's hold? NO.

- Mutation **M2** (loosen `collapsed_eq` to substring — the paste-of-similar-text attack from RISK 2):
  ```
  test interaction::tests::self_echo_match_is_exact_not_a_substring ... FAILED
  ```
- Mutation **M3** (clear tap_active/last_interaction on echo-match — flip the "preserve" semantics):
  ```
  test interaction::tests::self_echo_never_destroys_an_active_human_hold ... FAILED
  ```
- Both failure modes have a witness that goes red. Echo can neither ACQUIRE a hold from itself nor DESTROY a prior human hold.
- Verdict: **CLEAR**.

### P3 — Is the fresh capture actually at the send boundary? YES.

- Mutation **M4** (`permits_injection_fresh` degrades to `permits_injection`, i.e. tick-derived):
  ```
  harnesses failed:
    fresh_boundary_recognized_blank_without_tap_permits
    fresh_boundary_replaces_a_stale_clear_composer_observation
    fresh_boundary_unrecognized_layout_defers
    unrecognized_veto_expires_to_the_tmux_mode_verdict
  daemon failed:
    delivery::tests::a_stale_clear_tick_cannot_authorize_an_injection_a_fresh_capture_vetoes
    pointer::worker::tests::command_claim_submits_the_bare_tag_as_a_slash_command_and_never_uses_socket
    pointer::worker::tests::pointer_announces_once_per_pass_and_zero_delay_keeps_body_reader_claimable
    pointer::worker::tests::socket_body_is_delivered_and_acked_without_pointer_or_retry
  ```
- The daemon integration `a_stale_clear_tick_cannot_authorize_an_injection_a_fresh_capture_vetoes` is the one that proves the WIRING, not just the gate — going red at the delivery layer under M4 is the wiring receipt.
- **F-1112 confirmed**: `permits_injection_fresh` (`interaction.rs:207-223`) calls `self.tmux.list_panes()` + `self.tmux.capture(...)` and NEVER calls `drain_pane_tap`. Tap half remains the observer tick's non-destructive state. The residual staleness window is bounded (F-1112, not eliminated).
- Verdict: **CLEAR**.

### P4 — Does `Unrecognized` DEFER rather than release? YES.

- Mutation **M5** (`ComposerRegion::Unrecognized => Ok(true)`):
  ```
  failed:
    fresh_boundary_unrecognized_layout_defers
    unrecognized_veto_expires_to_the_tmux_mode_verdict
  ```
- Both the "defers" test AND the "expires within idle bound" test go red — proving Unrecognized both DEFERS and does so BOUNDED. The 72b5dd61 over-hold cannot re-enter through unrecognizability (r7 retired in code, not just prose).
- Verdict: **CLEAR**.

### P5 — Was every witness seen RED before its green? MOSTLY — one over-claim.

- **ac-1111**: reconstructed, honestly labeled in the receipt. Independently verified above (tree-hash + M1 also kills it). CLEAR.
- **ac-1113**: Mutation B (self-echo substring) already proven at plan time; I re-ran as M2. Genuine.
- **ac-1114**: Mutation reverting the fresh call to `permits_injection` — I re-ran as M4 (M4 killed it plus 3 other harness tests plus 4 daemon tests). Genuine.
- **ac-1117** (finding, minor): the receipt claims
  > "GENUINE chronological red-first: unrecognized_veto_expires_to_the_tmux_mode_verdict observed failing on its assertion before implementation"

  Git history disagrees. Commit `4a0a0e93` ("fix(harnesses): bound every interaction veto") introduced BOTH the fix AND all five ac-1117 tests in a single 254-line diff. The test does not exist on the prior commit (`9b6dd0e5`) — I checked out that commit and the test filter found zero matches. So the git artifact cannot corroborate "chronological red-first"; the strongest evidence available is mutation-witnessed (M1 above), which is exactly the same strength as ac-1111. **Finding F-R1** (see below).
- **ac-1112**: `injection_requires_both_tmux_and_composer_gates_clear` was added at `ab7fe612` (Sep 26, 2025 harness launch) — it's a pre-existing regression pin, not new evidence. `typing_through_restart_is_not_rebaselined_away` was added at `afba5b65` (this plan's fix commit) alongside the fix, so also mutation-witnessed at best. Neither is dishonest — the ac-1112 receipt doesn't claim "red-first" — but it's worth noting one is prior-art.

### P6 — Is `PendingClear` still load-bearing? YES.

- Mutation **M6** (bypass PendingClear: `blank && tap_active` always goes to `set_unknown` instead of setting `PendingClear` knowledge):
  ```
  failed:
    redraw_blank_preserves_pending_clear_until_a_quiet_pass_corroborates_it
    tap_bytes_between_recognized_blanks_require_another_quiet_pass
  ```
- Two tests kill the mutation — the redraw-race guard PM demanded in O3 is genuinely enforced, not decoration.
- Verdict: **CLEAR**.

### P7 — Exactly ONE parser on the tree? YES.

```
$ grep -rn "fn composer_region\|fn rendered_composer\|fn strip_prompt\|fn clip_payload\
|fn clip_multiline\|fn is_plain_rule\|fn is_copilot_footer" --include="*.rs"
crates/harnesses/src/composer.rs:10:pub fn composer_region(...) -> ComposerRegion {
crates/harnesses/src/composer.rs:15:fn rendered_composer(...) -> Option<String> {
crates/harnesses/src/composer.rs:122:fn clip_multiline(...)
crates/harnesses/src/composer.rs:140:fn clip_payload(...)
crates/harnesses/src/composer.rs:158:fn strip_prompt(line: &str) -> String {
crates/harnesses/src/composer.rs:165:fn is_plain_rule(line: &str) -> bool {
crates/harnesses/src/composer.rs:176:fn is_copilot_footer(line: &str) -> bool {
```
- One definition of every private helper; zero left behind in `crates/daemon/`.
- Both consumers import from `pij_harnesses`:
  - `crates/daemon/src/pane_observer.rs:11: use pij_harnesses::{ComposerRegion, InteractionGate, composer_region};`
  - `crates/harnesses/src/interaction.rs:8:   use crate::composer::{ComposerRegion, composer_region};`
- No second parser was minted next to the extraction. r5 retired in code.
- Verdict: **CLEAR**.

### P8 — Universal bound (ac-1117): can any veto path outlive its observation without a fresh one? NO.

- M1 (above) already killed FIVE tests spanning every veto class (recognized-idle, tap-latched, uncertainty-from-unknown, initial-uncertainty, parked-draft, plus the fresh-path unrecognized-decay).
- **Future-proofing**: any new veto path that goes through `permits_with_additional_veto` inherits the bound automatically — the check
  ```
  if state.expire_vetoes_if_idle(now, self.idle_window) {
      return Ok(true);
  }
  Ok(!additional_veto && !state.veto_active())
  ```
  runs `expire_vetoes_if_idle` FIRST, so an expired veto returns permits regardless of `additional_veto`. A new veto that BYPASSES this method would escape — but that would require adding a second decision path outside `InteractionGate`, at which point the reviewer of THAT change owes the same bound proof.
- One residual concern (not blocking): a new veto source that adds a *fourth* state field (beyond `tap_active`, `composer_active`, `uncertainty_since`) MUST teach `expire_vetoes_if_idle` about it. There is no compile-time guarantee — a new field is easy to add without wiring it into the expiry sweep. The right defense is a review checklist item, not code; noting for future review discipline.
- Verdict: **CLEAR**.

## The four "least-sure" items from the packet

- **ac-1111 witness is reconstructed, not chronological.** Tree-hash equality VERIFIED byte-identical; A-tree fails on assertion (not compile); B-tree green. Reconstruction accepted; already labeled honestly in the receipt.
- **Fresh path is fresh in its COMPOSER half only.** VERIFIED in code — `drain_pane_tap` never appears in `permits_injection_fresh`; three tests assert its absence in the fake's call log. Residual window is bounded (F-1112 accurate).
- **`interaction_idle_ms` default 60_000.** Acceptable — the universal bound (ac-1117) ensures Unrecognized also decays within the same window. 60s IS long enough to be user-hostile if a whole harness class is unrecognizable (F-1117), but the amendment retires the WORST case (unbounded); a per-harness split is an OQ, not a block. Reviewer concurs with PM.
- **PM's 12 daemon test changes are honest.** Mutation **M8** swapped `fixture_unarranged(...)` for `fixture(...)` on the two tests that rely on absent evidence:
  ```
  failed:
    pointer::worker::tests::unknown_or_human_typing_gate_releases_body_without_delivery
    pointer::worker::tests::failed_command_uses_durable_attempt_backoff
  ```
  Silently arranging composers WOULD delete the gate-has-no-evidence coverage — the tests fail because "clear-arranged" now permits the operation the test asserts is vetoed. `fixture_unarranged` is load-bearing, not cosmetic.
- **tmux fake non-permissive default.** VERIFIED via M8: `FakeTmux::new()` without a scripted capture yields `[]` for `list_panes`, so `permits_injection_fresh` takes the "listed.into_iter().find(...)` returns None" branch and vetoes with `additional_veto=true`. The fake cannot manufacture a false permit.

## Honesty notes: confirmed or refuted

- **ac-1115 byte-equality tests as PIN.** CONFIRMED. Both fixture expectations are `Recognized(String::new())` or `Unrecognized` — the "byte-equal" phrasing is trivially satisfied for empty content. Mutation **M7** (uppercase `strip_prompt`) killed 3 composer tests (`cursor_clips_suggestion_text_to_the_right`, `markdown_table_borders_are_not_composer_rules`, `copilot_footer_is_excluded_from_composer_text`) but NOT the ac-1115 pin — because uppercasing an empty string is still empty. The plan's own note already says "green from birth by design; only `garbage_layout_is_unrecognized` and `live_copilot_v1_box_is_recognized_without_prompt_marker` are red-first". The receipt phrase "byte-equal" is stronger than the pin actually is — Finding F-R2.
- **harness checks TWO red sensors on main.** CONFIRMED on the review branch: `harness checks --quick` reports `local-paths` and `test` as `fail`, all others `pass` or `skipped`. The diff touches **zero** TypeScript files (see § Scope below), so the failures cannot be introduced here. F-1124/1125 conclusion stands.

## Scope of the diff (checked, not assumed)

```
crates/daemon/src/pane_observer.rs                 | 172 +------
crates/daemon/src/pointer/worker.rs                |  58 ++-
crates/harnesses/src/composer.rs                   | 307 ++++++++++++
crates/harnesses/src/interaction.rs                | 535 +++++++++++++++++++--
crates/harnesses/src/lib.rs                        |   2 +
crates/harnesses/tests/fixtures/*.txt              | 138 +++++
crates/testkit/src/fakes.rs                        |  58 ++-
docs/plans/111-anti-step-on/**                     | (docs + plan/impl-guide/packets)
```
No TypeScript. No Cargo.toml/lock edits. No other crate touched.

## Findings — ranked "degrades a control" first, then "obscures information"

**No control-degrading findings.** Every priority safety mechanism is enforced by a test that goes red under a targeted mutation.

### F-R1 (obscures information) — ac-1117 receipt over-claims "chronological red-first"

The receipt says: "GENUINE chronological red-first: unrecognized_veto_expires_to_the_tmux_mode_verdict observed failing on its assertion before implementation."

Git history: commit `4a0a0e93` introduced BOTH the fix AND all five ac-1117 tests in one 254-line diff. On the prior commit `9b6dd0e5`, the test filter matched zero tests. There is no post-commit artifact that would let a reviewer *chronologically* re-execute a red-first sequence — only a mutation-witnessed one. That is the same strength as ac-1111, which the plan explicitly labels weaker than a chronological witness ("a reconstruction can be shaped to fail, so it is weaker than a chronological witness").

Recommendation: RE-LABEL the ac-1117 receipt to match ac-1111's honesty note — "mutation-witnessed red-first, via M1 disabling the universal bound; no chronological witness because the fix and every ac-1117 test landed in one commit." The test coverage itself is fine; only the claim about the witness ordering is over-strong. Not blocking.

### F-R2 (obscures information) — ac-1115 "byte-equal" phrasing stronger than the pin

The receipt says: "characterisation tests over live-recorded captures prove the extracted parser byte-equal to the pre-move rendered_composer on every fixture".

The pin's expected values are `Recognized(String::new())` and `Unrecognized`. "Byte-equal" is trivially satisfied when the expected text is empty — a parser that returned uppercase of an empty region is still equal to an empty region. Mutation M7 (uppercase `strip_prompt`) confirmed: it kills 3 other composer tests but not the ac-1115 pin.

The receipt itself already qualifies this ("Labeled honestly: pin + one witness, not a greenfield build") — so it's not deception, but the phrase "byte-equal to the pre-move rendered_composer" is stronger than what the two fixtures actually assert. Recommendation: drop "byte-equal" or add a fixture whose expected value is a non-empty content string so the pin CAN detect a rendering perturbation.

### Not-a-finding, worth noting for future review discipline

A NEW field added to `ComposerState` in the future would not automatically be swept by `expire_vetoes_if_idle`. No compile-time guarantee. Consider adding a rustdoc invariant on `ComposerState` naming the sweep as a required update site for new fields. Not needed for this merge.

## What I did NOT do (per packet)

- Did not merge.
- Did not push.
- Did not open the PR.

## Reply

`APPROVE-WITH-FINDINGS` — 2 findings, both "obscures information", none "degrades a control".
