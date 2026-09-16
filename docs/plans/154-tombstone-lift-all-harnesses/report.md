# Plan154 — successful registration clears tombstones

**Initial source commit:** `6d90798697ce138a1ec1676eb13a356452e7af2c`; review fixes are recorded below.

**Review-fix source commit:** `14697256e4a9190114962233004d33e4bef3f1b9`.

Baseline: `d64fa0e4e329b339cc8404efabdcab670ca606b2` (packet on main1fd636c4). Worktree `fs3-tombstone-lift`; production daemon untouched. Prime owns plan reconciliation, push, PR and merge.

## AC1–AC3 — baseline RED, captured before production changes

Commands run from this worktree with inherited PATH plus Cargo and `RUST_TEST_THREADS=1`:

```text
cargo test -p pij-daemon --lib successful_registration_never_returns_a_tombstone -- --nocapture
EXIT:101; 0 passed /1 failed
Omp/retired: successful registration returned SeatDescriptor { ... tombstoned_at: Some(154), tombstone_reason: Some("observed-dead"), ... }

cargo test -p pij-daemon --lib retired_ -- --nocapture
EXIT:101; 1 passed /8 failed
retired_claude_session_resumes_with_bindings: Claude retained its tombstone; Some(154) != None
retired_codex_session_resumes_with_bindings: Codex retained its tombstone; Some(154) != None
retired_omp_session_resumes_with_bindings: Omp retained its tombstone; Some(154) != None
retired_pi_session_resumes_with_bindings: Pi retained its tombstone; Some(154) != None
retired_registration_refuses_foreign_session_without_writing: HTTP200 != HTTP400
```

The foreign response was an actual decoded HTTP envelope (`v:2`, `command:"pij register"`, `ok:true`, `binding:"rebound"`), already rewritten to session `foreign-omp-session`, process155/start2, folder `/abs/other-tree` and parent `pij-new-parent`, while still tombstoned at154. Unit sensor identities are injected, not actual OMP hosts. [red-invariant.log](red-invariant.log) and [red-registration.log](red-registration.log) retain bounded command/exit output.
`red-invariant.log` stops at its first failing case (`Omp/retired`); `red-registration.log` supplies the remaining per-harness REDs rather than implying that the first panic exercised the entire matrix.

The independent spawn-continuity witness also failed `Some(154) != None`. Missing/foreign-continuity claims incorrectly returned `Ok` with the retired row rewritten. The role-override witness hit a distinct existing failure: `E-RS-PARTIAL registration ... persisted but role assertion failed ... E-RS-ARG`, because the rewritten subject remained retired; this is not the four harnesses' tombstone-assertion RED.

A frozen baseline CLI was built before production changes; SHA256 `9c4b6d2253d6a58e3353c7f6bdc8d0fbadbf0aeef0ef5aa23376683e4d5c740a`.

## AC5 — approved isolated reboot interpretation

Prime approved cold private-tmux restart: the reaper's pane-presence check is a **one-directional safety brake** (removing it can only broaden retirement), not a retention policy. A literal surviving pane prevents sweep retirement. The proof must label `recreated pane incarnation, not original physical pane` and repeat the sequence with a different session in the recreated pane, proving that session continuity—not recycled pane address—authorizes the lift. The reaper brake remains unchanged.

## AC1–AC3 — shared registration GREEN

`green-registration.log`: exit0,9 passed (the eight new retired-address witnesses plus the preserved Copilot relabel refusal). `green-invariant.log`: exit0,1 test passed, exercising15 successful new/live/retired registrations across omp, pi, claude, codex and Copilot. All four requested harness witnesses observe live rows, new process/pane, preserved parent, authoritative role and Telegram binding, and `seat.resumed{prior_reason:"observed-dead"}`.

Continuity is checked after the existing read-only admission/native-HOLD guards and before writes; the review fix additionally refuses a retired harness mismatch before harness-specific ownership checks. Empty/missing values cannot match each other; a pane is not a continuity witness. Within the same harness, spawn correlation and the complete observed process incarnation each independently authorize a lift. Existing prebind selection and capability guards remain; ordinary tombstone lifting does not grant native delivery capability. Native and ordinary resumes now each emit exactly one event.

The complete daemon run exposed one intentionally changed prior assertion: `ordinary_registration_never_inherits_native_capability` expected its matching retired registration to keep `Some(1)`. It now requires `None` while preserving its capability/refusal/binding assertions; no guard was weakened.

Additional RED: replacing exact process-incarnation equality with PID-only matching made a foreign session claiming PID777/start126 take the retired PID777/start125 row. The test failed on unexpected `Ok` with a cleared tombstone ([red-process-incarnation-mutant.log](red-process-incarnation-mutant.log)); the exact tuple comparison was restored.

## AC4 — stale sweep cannot retire a registration

The production reaper already had transactional whole-descriptor CAS; this is a new discriminating witness, not a newly discovered missing interlock. The test suspends the sweep's second old-process observation, completes real `RegistrationService` mutation against SQLite, then releases stale death evidence. Liveness is explicitly injected; the registry, registration, CAS and sweep are real.

Mutation RED ([red-sweep-cas-mutant.log](red-sweep-cas-mutant.log)):

```text
.tombstone_if_unchanged(expected, reason) → .tombstone(&expected.id, reason)
cargo test -p pij-daemon --lib death_sweep_preserves_registration_during_old_process_observation -- --nocapture
EXIT:101; 0 passed /1 failed
the stale death observation must not retire the newly registered incarnation
left: Some(1789534482888)
right: None
```

Restored original source byte-for-byte; [green-sweep.log](green-sweep.log) exited0,1 passed. The newly registered descriptor remains unchanged, the sweep reports `incarnation-changed`, and no tombstone or obituary is emitted. Neither the canonical CAS nor the pane-presence brake changed.

## AC5 — actual OMP RED then GREEN

Driver: [tombstone-lift-live.ts](tombstone-lift-live.ts), actual installed OMP18.1.22, real extension, real daemon/SQLite/tmux, deterministic loopback model provider, private HOME/state/socket. Both final receipts record replayable `node --import tsx ... --pij-bin <binary> --omp-bin <omp> --receipt <new-path> --allow-recreated-pane-address` invocations and identical driver SHA. The observer only records extension events; it does not alter claims or inject messages.

**Final baseline RED** ([live-red.json](live-red.json), exit1): seat `pij-interim-tanith`, saved session `01a0a89d-2e73-7386-94ef-e36dd5c56787`, recreated pane `%0`, PID99334→2128. Resume returned HTTP200 but retained the tombstone and emitted no `seat.resumed`. Actual peer send returned:

```json
{"ok":false,"command":"pij send","v":2,"meta":"pij-interim-tanith: seat is tombstoned (observed-dead) — the message was not queued because a tombstoned seat will never receive it","error":"refused"}
```

Fresh session `01a0a89d-3e53-7033-90a8-38ef69fdff27` in recreated `%0`, PID4281, wrongly returned HTTP200 and rewrote the retired row. All five behavioral checks failed; all owned cleanup succeeded.

**Final review-fix GREEN** ([live-green.json](live-green.json), exit0): `pij-adorable-canidae`, saved session `01a0a8cf-f924-77d0-9e64-56b096ca2be4`, recreated `%0`, PID86044→88966. Canonical `observed-dead` sweep preceded resume. Selected actual `pij state` data:

```json
{"id":"pij-adorable-canidae","liveness":"active","pid":88966,"procStart":20260916160318,"pane":"%0","tombstonedAt":null,"tombstoneReason":null,"session":"01a0a8cf-f924-77d0-9e64-56b096ca2be4"}
```

`seat.resumed` at spine7 records old86044/new88966, old/new pane `%0`, and `prior_reason:"observed-dead"`. Real peer `pij-established-finch` sent message `01a0a8d0-0707-74f3-9cb1-a515b6c8c4de`: the CLI correctly reported `queued`/`extension-stream`, then the actual resumed OMP emitted `message_end`, `customType:"pij"`, matching session and message id, containing `PIJ_154_DELIVERY_eaf5273b-02a3-4c96-bb10-523833fe155c`. The receipt retains that native event and terminal; queued alone is not claimed as delivery proof.

After another real death/sweep/recreated-pane sequence, fresh session `01a0a8d0-0afe-7164-8bf5-cee5013a6809`, PID91331, claimed the same address and `%0`:

```json
{"ok":false,"command":"pij register","v":2,"meta":"seat pij-adorable-canidae is retired (observed-dead, 1789538601082); a different session may not take it","error":"refused"}
```

HTTP400; the complete stored descriptor, including seq13, remained unchanged. Both resume and foreign claims omitted `spawn_id` and had distinct actual process incarnations. Therefore the successful lift was authorized by the saved pi session, not the recycled pane or an alternate spawn/process continuity path. All five checks and every owned teardown passed.

Fixed daemon SHA256: `0af81dc829b35bd881dd11aa13e80fb4deccd9e1692cf570894af5dd188be34a`. This supersedes the pre-review GREEN receipt. No production OMP, daemon, seat or pane was modified.

**Fixture limitation, resolved:** the first run canonically tombstoned its actual OMP but queried live-only `/v1/seats`, then failed before resume. [live-fixture-gap.json](live-fixture-gap.json) retains that distinction; it is not behavioral RED. The driver now reads only its private registry with `SELECT * FROM seats WHERE id = ?`, read-only, never manufacturing lifecycle state.

## AC3 native boundary and AC6 contract

A final contract check found that the pre-existing native foreign-session refusal omitted the retired row's reason/time. [red-native-retired-diagnostic.log](red-native-retired-diagnostic.log) exited101: actual `native Copilot registration refused: seat id belongs to a different native session`, expected `seat pij-retired-native is retired (observed-dead, 154); a different session may not take it`. The shared formatter now names that tombstone; [green-native-retired-diagnostic.log](green-native-retired-diagnostic.log) exited0. The test deliberately supplies the same process: native foreign-session refusal still wins over the general process-continuity branch. This changes retired diagnostic context, not native admission authority.

[Registration contract](../../how/pij-rs-api.md#registration-and-tombstone-continuity) defines the successful-row invariant and continuity ladder in one paragraph, replacing native-only tombstone wording. After the review fixes, `native_prebind`, `registration_target`, `same_native_owner` and `check_native_roster` were compared byte-for-byte with baseline and remain unchanged. Existing native HOLD, spawn-prebind, queue ownership and explicit revive behavior remain protected by the full Rust suite.

## Harness harvest

- DL-001: LSP returned empty references/definition for a known linked-worktree symbol; explicit callsite/source inspection supplied coverage. A worktree-indexing canary remains a follow-up, not an invented absence.
- DL-002: `just worktree-deps` repaired358 private links; boot typecheck passed but cold smoke exceeded90003ms at `file-watch-notify`. The complete canonical gate subsequently passed all11 smoke scenarios unchanged.
- DL-003: a live-only roster hid the exact tombstone under investigation. The permanent driver now uses an explicit read-only private-registry snapshot and proves delivery through the actual OMP receiver.
- Proof sources under `docs/plans` are excluded from the normal Biome/TypeScript inventory. The driver was formatted through Biome stdin and separately checked with strict NodeNext TypeScript; the initial ignored-path formatter invocation was not treated as validation.

The inherited harness now has executable all-harness tombstone invariants, independently discriminating CAS/PID-incarnation witnesses, and a replayable actual OMP death/resume/delivery/foreign-refusal scenario. Optional next improvement: share its explicitly retired-inclusive snapshot helper across lifecycle probes. No production-state repair, new reaper policy, installed-runtime modification or plan152/153 change was made.

## Final gates and disposition

All requested gates were rerun after the review fixes, with inherited PATH plus Cargo, `RUST_TEST_THREADS=1` and `VITEST_MAX_WORKERS=1`; the warm `just self-check` exited0:

- [gate-rust.log](gate-rust.log): check-only `cargo fmt --all --check`, Clippy `--workspace --all-targets -- -D warnings`, CLI build and workspace tests, exit0; **1140 passed,88 suites,8 ignored**, including419 daemon tests.
- [gate-self-check.log](gate-self-check.log): `just self-check`, exit0; **241 Vitest files /5308 tests passed**, native JavaScript **227 passed /3 platform skips**, Windows **84 passed /2 skipped**, all **11 smoke scenarios** passed.
- [driver-typecheck.log](driver-typecheck.log): strict NodeNext TypeScript for the otherwise excluded permanent driver, exit0.
- [red-old-contract.log](red-old-contract.log) preserves the intermediate old tombstone-retention assertion failure; the final full Rust gate passes its corrected invariant without weakening native-capability refusals.

Closing snapshot proof: `briefing.md SHA matches snapshots (cdf5f5b25001...)`. Biome schema2.0.0 versus CLI2.4.14 is informational. Package audit remains report-only: `git:github.com/ghoseb/pi-askuserquestion` aggregate fail, score58,20 findings (4 fail /13 warn); operator decides keep or `npm run pkg disable git:github.com/ghoseb/pi-askuserquestion`. No dependency was changed or risk silently accepted. Inherited packet/review commits `d64fa0e4`, `6b908fd6` and `86ed585c` lack `Pij-Prime`, with unresolved `Pij-Seat` applicability; they were not rewritten or assigned current-seat provenance.

AC1–AC6 and both recreated-pane riders are proven. The report retains distinct assertion REDs, one actual native baseline RED, one final actual native GREEN and the resolved fixture gap; redundant runs and the owned frozen baseline binary were removed from the delivered artifact set. DL-001–003 were harvested here and cleared.

## Fix round

Authority: [packet-fix.md](packet-fix.md), rulings on [review.md](review.md). The review probes remain reviewer-owned and unchanged.

- **F001 — retired paneless selection.** [fix-red-paneless.log](fix-red-paneless.log), exit101: all six independent Claude/Codex/Copilot dead-host/same-host witnesses failed. Dead-host claims minted another id; same-host claims falsely reported `a subagent of <id>`. The foreign-session witness also returned that false relationship instead of the AC3 diagnostic. [fix-green-paneless.log](fix-green-paneless.log), exit0: all seven passed after selecting live rows first, then retired rows by newest incarnation/id, retaining live ownership/pull-shape guards. Historical rows no longer create process aliases against the selected paneless address. The old refusal matrix's retired-own-session row was removed because it pinned the defect; all other refusal shapes remain.
- **F002 — harness gates every rung.** [fix-red-harness.log](fix-red-harness.log), exit101: actual HTTP pi/process and claude/spawn claims against an omp row returned200 and changed the harness. [fix-green-harness.log](fix-green-harness.log), exit0: both now return400 with the complete v2 AC3 envelope plus `harness mismatch: row omp, claim pi|claude`; complete descriptor and spine stay unchanged. The pre-existing foreign-session HTTP witness also passes. A lift no longer assigns `descriptor.harness`; plan and API wording use the harness-gated ladder.
- **F003 — exact refusal and honest missing-process witness.** [fix-red-refusal-guard.log](fix-red-refusal-guard.log), exit101: the exact-message assertion exposed `missing-process` failing admission with `no bind evidence`, not continuity. The case now removes only the recorded process while retaining a bound observed claimant; all six cases assert their exact refusal. [fix-red-continuity-deleted.log](fix-red-continuity-deleted.log), exit101: removing the continuity block makes the loop fail on unexpected successful foreign-session registration. Restored block: [fix-green-refusal-guard.log](fix-green-refusal-guard.log), exit0.
- **AC4 wording.** Removed the over-promised sentence and replaced it with the pre-existing `tombstone_if_unchanged` CAS contract actually pinned by the interleaving test. Exact old-phrase search returned zero matches in `plan.md`; no reaper production code changed. This is a documentation correction, not a new behavioral RED.
- **Minor2 — one event per transition.** [fix-red-native-event.log](fix-red-native-event.log), exit101: the native witness observed `["seat.resumed","seat.native-resumed"]`, expected only `["seat.native-resumed"]`. [fix-green-native-event.log](fix-green-native-event.log), exit0: native resume publishes only its existing native event, now also carrying `prior_reason`. Ordinary and paneless paths assert exactly one `seat.resumed`.
- **Minor3 — RED coverage pointer.** The AC1–AC3 section now explicitly points from the invariant's first panic to the separate per-harness REDs. No behavioral change or claimed test RED.
- **Minor1 — independent format gate.** Replaced the prior gate receipt with a fresh command beginning `cargo fmt --all --check` (no formatting write in the chain). Exit0; the complete Rust gate passed1140 tests. Formatting was an earlier development action, not a step that repairs its own gate.

Additional final proof: `retired_paneless_selection_prefers_live_then_newest_then_id` passes in the full Rust gate, including a retired duplicate with the returning host's PID; it proves live precedence, newest retired incarnation, deterministic id tie-break and unchanged non-selected history. The six paneless resume witnesses use injected OS observations, not actual Claude/Codex/Copilot hosts. The refreshed real OMP receipt above exercises the final binary and all five death/resume/delivery/foreign-refusal checks.

Fix-round harvest: the linked-worktree LSP empty-reference gap recurred and was captured as DL-001; explicit source/callsite coverage supplied the boundary, and a worktree-indexing canary remains the encodable improvement. The cold `file-watch-notify` timing issue is out of scope by prime ruling and was not changed. New deterministic proof now covers selection before continuity, harness identity on both alternative rungs, exact refusal ownership, and one event per transition.

All fix rulings are complete; the fix-round observation buffer was harvested above and cleared (one entry). No push, PR, merge, production-state repair or installed-runtime change was performed.
