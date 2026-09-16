# Plan154 — successful registration clears tombstones

**Source commit:** `6d90798697ce138a1ec1676eb13a356452e7af2c`.

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

The independent spawn-continuity witness also failed `Some(154) != None`. Missing/foreign-continuity claims incorrectly returned `Ok` with the retired row rewritten. The role-override witness hit a distinct existing failure: `E-RS-PARTIAL registration ... persisted but role assertion failed ... E-RS-ARG`, because the rewritten subject remained retired; this is not the four harnesses' tombstone-assertion RED.

A frozen baseline CLI was built before production changes; SHA256 `9c4b6d2253d6a58e3353c7f6bdc8d0fbadbf0aeef0ef5aa23376683e4d5c740a`.

## AC5 — approved isolated reboot interpretation

Prime approved cold private-tmux restart: the reaper's pane-presence check is a **one-directional safety brake** (removing it can only broaden retirement), not a retention policy. A literal surviving pane prevents sweep retirement. The proof must label `recreated pane incarnation, not original physical pane` and repeat the sequence with a different session in the recreated pane, proving that session continuity—not recycled pane address—authorizes the lift. The reaper brake remains unchanged.

## AC1–AC3 — shared registration GREEN

`green-registration.log`: exit0,9 passed (the eight new retired-address witnesses plus the preserved Copilot relabel refusal). `green-invariant.log`: exit0,1 test passed, exercising15 successful new/live/retired registrations across omp, pi, claude, codex and Copilot. All four requested harness witnesses observe live rows, new process/pane, preserved parent, authoritative role and Telegram binding, and `seat.resumed{prior_reason:"observed-dead"}`.

Continuity is checked after the existing read-only admission/native-HOLD guards and before writes. Empty/missing values cannot match each other; a pane is not a continuity witness. Spawn correlation and the complete observed process incarnation each independently authorize a lift. Existing native events, prebind selection and capability guards remain; ordinary tombstone lifting does not grant native delivery capability.

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

**Final GREEN** ([live-green.json](live-green.json), exit0): `pij-gravitas-shortfall`, saved session `01a0a8a5-a2ca-710e-bf59-3187fa60f12c`, recreated `%0`, PID94378→96746. Canonical `observed-dead` sweep preceded resume. Selected actual `pij state` data:

```json
{"id":"pij-gravitas-shortfall","liveness":"active","pid":96746,"procStart":20260916151703,"pane":"%0","tombstonedAt":null,"tombstoneReason":null,"session":"01a0a8a5-a2ca-710e-bf59-3187fa60f12c"}
```

`seat.resumed` at spine7 records old94378/new96746, old/new pane `%0`, and `prior_reason:"observed-dead"`. Real peer `pij-free-bovid` sent message `01a0a8a5-af8a-7192-a7e2-d402707dc72d`: the CLI correctly reported `queued`/`extension-stream`, then the actual resumed OMP emitted `message_end`, `customType:"pij"`, matching session and message id, containing `PIJ_154_DELIVERY_120ce81e-7d28-4da4-b12e-8559c7eb0c41`. The receipt retains that native event and terminal; queued alone is not claimed as delivery proof.

After another real death/sweep/recreated-pane sequence, fresh session `01a0a8a5-b38e-7497-8714-effa2b3741e0`, PID98824, claimed the same address and `%0`:

```json
{"ok":false,"command":"pij register","v":2,"meta":"seat pij-gravitas-shortfall is retired (observed-dead, 1789535826231); a different session may not take it","error":"refused"}
```

HTTP400; the complete stored descriptor, including seq13, remained unchanged. Both resume and foreign claims omitted `spawn_id` and had distinct actual process incarnations. Therefore the successful lift was authorized by the saved pi session, not the recycled pane or an alternate spawn/process continuity path. All five checks and every owned teardown passed.

Fixed daemon SHA256: `196f82eeab1cd3c3cfd8ae35e8a49816d874b0d51a8ca82905bb2ef0d4c4fee4`. No production OMP, daemon, seat or pane was modified.

**Fixture limitation, resolved:** the first run canonically tombstoned its actual OMP but queried live-only `/v1/seats`, then failed before resume. [live-fixture-gap.json](live-fixture-gap.json) retains that distinction; it is not behavioral RED. The driver now reads only its private registry with `SELECT * FROM seats WHERE id = ?`, read-only, never manufacturing lifecycle state.

## AC3 native boundary and AC6 contract

A final contract check found that the pre-existing native foreign-session refusal omitted the retired row's reason/time. [red-native-retired-diagnostic.log](red-native-retired-diagnostic.log) exited101: actual `native Copilot registration refused: seat id belongs to a different native session`, expected `seat pij-retired-native is retired (observed-dead, 154); a different session may not take it`. The shared formatter now names that tombstone; [green-native-retired-diagnostic.log](green-native-retired-diagnostic.log) exited0. The test deliberately supplies the same process: native foreign-session refusal still wins over the general process-continuity branch. This changes retired diagnostic context, not native admission authority.

[Registration contract](../../how/pij-rs-api.md#registration-and-tombstone-continuity) defines the successful-row invariant and continuity ladder in one paragraph, replacing native-only tombstone wording. `native_prebind`, `registration_target` and `check_native_roster` were compared byte-for-byte with baseline and remain unchanged. Existing native HOLD, spawn-prebind, queue ownership and explicit revive behavior remain protected by the full Rust suite.

## Harness harvest

- DL-001: LSP returned empty references/definition for a known linked-worktree symbol; explicit callsite/source inspection supplied coverage. A worktree-indexing canary remains a follow-up, not an invented absence.
- DL-002: `just worktree-deps` repaired358 private links; boot typecheck passed but cold smoke exceeded90003ms at `file-watch-notify`. The complete canonical gate subsequently passed all11 smoke scenarios unchanged.
- DL-003: a live-only roster hid the exact tombstone under investigation. The permanent driver now uses an explicit read-only private-registry snapshot and proves delivery through the actual OMP receiver.
- Proof sources under `docs/plans` are excluded from the normal Biome/TypeScript inventory. The driver was formatted through Biome stdin and separately checked with strict NodeNext TypeScript; the initial ignored-path formatter invocation was not treated as validation.

The inherited harness now has executable all-harness tombstone invariants, independently discriminating CAS/PID-incarnation witnesses, and a replayable actual OMP death/resume/delivery/foreign-refusal scenario. Optional next improvement: share its explicitly retired-inclusive snapshot helper across lifecycle probes. No production-state repair, new reaper policy, installed-runtime modification or plan152/153 change was made.

## Final gates and disposition

All requested gates were rerun after the native diagnostic correction, with inherited PATH plus Cargo, `RUST_TEST_THREADS=1` and `VITEST_MAX_WORKERS=1`:

- [gate-rust.log](gate-rust.log): fmt check, Clippy `--workspace --all-targets -- -D warnings`, CLI build and workspace tests, exit0; **1130 passed,88 suites,8 ignored**.
- [gate-self-check.log](gate-self-check.log): `just self-check`, exit0; **241 Vitest files /5308 tests passed**, native JavaScript **227 passed /3 platform skips**, Windows **84 passed /2 skipped**, all **11 smoke scenarios** passed.
- [driver-typecheck.log](driver-typecheck.log): strict NodeNext TypeScript for the otherwise excluded permanent driver, exit0.
- [red-old-contract.log](red-old-contract.log) preserves the intermediate old tombstone-retention assertion failure; the final full Rust gate passes its corrected invariant without weakening native-capability refusals.

Closing snapshot proof: `briefing.md SHA matches snapshots (cdf5f5b25001...)`. Biome schema2.0.0 versus CLI2.4.14 is informational. Package audit remains report-only: `git:github.com/ghoseb/pi-askuserquestion` aggregate fail, score58,20 findings (4 fail /13 warn); operator decides keep or `npm run pkg disable git:github.com/ghoseb/pi-askuserquestion`. No dependency was changed or risk silently accepted. Packet commit `d64fa0e4` lacks `Pij-Prime`; it was not rewritten or assigned current-seat provenance.

AC1–AC6 and both recreated-pane riders are proven. The report retains distinct assertion REDs, one actual native baseline RED, one final actual native GREEN and the resolved fixture gap; redundant runs and the owned frozen baseline binary were removed from the delivered artifact set. DL-001–003 were harvested here and cleared.
