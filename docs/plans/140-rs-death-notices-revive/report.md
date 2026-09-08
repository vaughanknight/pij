# Plan 140 implementation report

Delivery revision: the commit containing this report; its SHA is returned in the completion message. Branch: `140-rs-death-notices-revive`. No push, merge, production bounce or installed-skill edit performed.

## Acceptance and implementation

| AC | Result and evidence |
|---|---|
| AC1 | Automatic 5s sweep, configurable with `PIJ_RS_DEATH_SWEEP_MS`, shares the manual reaper's candidate and recheck/CAS path. One `seat.tombstone` with `observed-dead` and compared pid/start/pane/absence. Manual dry-run parity and duplicate-sweep regression pass. |
| AC2 | `DeliveryService::send` uses the existing `pij-bg` actor, now defined once as `pij_core::BG_ACTOR`. Exact obituary template pinned in stable route corpus; rendered UTC millisecond example passes. `death.notice` records the tombstone seq and actual delivery receipt/status. |
| AC3 | Sweep finishes retirement before notices. Already-tombstoned parents and same-sweep candidates receive no send; withheld count logs once. Regression covers both orderings with child sorting before parent. |
| AC4 | One spawn lock spans observation, conditional retirement and existing launch transition. Dead/absent revives without manual close, preserving launch rollback and citing tombstone seq. Concurrent requests launch only one incarnation. |
| AC5 | Recycled/Unknown override requires nonempty evidence plus recorded-parent authority, or authoritative `RoleService` prime for a parentless seat. Active/present/unverifiable-pane observations veto. Assumption audit is published before CAS so publication failure cannot retire or launch; successful receipt cites both seqs. No replacement-pid signalling. |
| AC6 | API and source peer skill updated; skill gate green. Operator skill symlinks to the primary checkout, so integration updates it without editing deployed copies here. |
| AC7 | Isolated daemon at `127.0.0.1:17461`: killed child, parent pane visibly received obituary after 1.35s; revive without close succeeded; recycled fixture refused without override, succeeded with authorized evidence, unrelated replacement process remained alive. Production obituary after merge/bounce remains prime-owned. |

Pane presence, unknown observation, and incarnation comparison are **one-directional safety interlocks (brakes)**. Removing them permits the same set or more retirements; they are not retention policy.

## RED before implementation

Chronological baseline-compatible tests called the existing reaper before the new behavior was implemented. Captured command output is retained under `assets/evidence/`.

- `cargo test -p pij-daemon --lib reaper::tests::death_sweep -- --nocapture`: 0 passed, 3 failed. `death_sweep_matches_manual_candidates_and_commits_observation_once` observed old `process-dead-and-pane-absent`, not `observed-dead`; `death_sweep_notifies_living_parent_with_pinned_body_and_honest_receipt` lacked an audited notice; `death_sweep_withholds_notices_when_parent_already_or_simultaneously_dead` lacked a suppression record. [RED sweep](assets/evidence/red-sweep.log).
- `cargo test -p pij-daemon --test revive_http -- --nocapture`: 0 passed, 8 failed. Named tests cover observed-dead success, Recycled/Unknown refusal guidance, authorized evidence, parent/prime authorization, missing evidence/forged parent, Active/present-pane veto, concurrent revive, and replacement-pid survival. Actual baseline response: `seat 'pij-child' is live — revive only accepts tombstoned ids`. [RED HTTP names/output](assets/evidence/red-revive-http.log).
- `cargo test -p pij-cli --test revive -- --nocapture`: 2 passed, 2 failed. `shipped_revive_assumption_flags_authorize_parent_and_record_evidence` failed with `unexpected argument '--assume-dead' found`; the existing refusal contract lacked its decodable liveness code. [RED CLI](assets/evidence/red-revive-cli.log).
- Ninth HTTP regression subsequently added: `revive_assumption_publication_failure_cannot_retire_or_launch`, with a real SQLite publication failure.

## Initial delivery gates (426d3215)

Commands ran from the assigned worktree; Rust used `~/.cargo/bin/cargo`.

| Command | Observed result |
|---|---|
| `cargo test --workspace` | Green; tool aggregate 1030 passed across 84 suites, 8 ignored. New sweep tests pass, HTTP revive 9/9, CLI revive 4/4, architecture/corpus integrity pass. [Full output](assets/evidence/green-workspace.log). |
| `cargo clippy --all-targets -- -D warnings` | Green. [Output](assets/evidence/green-clippy.log). |
| `cargo fmt --all -- --check` | Exit 0, no output. |
| `just pij-skill-check` | `pij-skill-check: all green`. [Tail/full output](assets/evidence/green-skill.log). |
| `harness checks`, first run | Required test/typecheck/lint stages passed; `windows-compat` failed. |
| `just windows-compat`, standalone | `Test Files 4 passed (4)`, `Tests 84 passed | 2 skipped (86)`, `windows-compat: all portable stages passed.` [Output](assets/evidence/green-windows-standalone.log). |
| `harness checks`, second run | All required stages except `test` passed. `skills/flow-pair/test/identity.test.ts > deriveRepoId > falls back to basename-hash when git has no remote` failed with `ENOTEMPTY ... fp-test-*/.git` during tempdir cleanup. [Actual gate envelope](assets/evidence/harness-checks-second.json). |
| `npm test -- skills/flow-pair/test/identity.test.ts`, standalone | `Test Files 1 passed (1)`, `Tests 6 passed (6)`, exit 0. |
| `just smoke`, standalone | All scenarios green, including `file-watch-notify` and `pij`. [Output](assets/evidence/green-smoke-standalone.log). |

**Full-gate exception is explicit, not a green claim:** prime identified the smoke timeout and identity-test ENOTEMPTY as pre-existing races, instructed standalone runs, and authorized committing after those pass rather than chasing them in 140. The full gate also reports an advisory attribution warning for pre-existing commit `ebb7ebc6509842ec15be70c331c618fb40e7085e` (not this delivery).

## Isolated live proof

Runtime: this worktree's `target/debug/pij-rs`; state and daemon HOME under a unique temporary directory; owned tmux session `p140-ocv_v86t`. Clients explicitly used `PIJ_RS_ADDR` and `PIJ_RS_STATE_DIR`; no production daemon mutation. Owned session and daemon stopped after preserving evidence.

1. Spawned real OMP parent `p140-parent`, pane `%4312`, pid `7000`; child `p140-child`, pane `%4313`, pid `40210`, with recorded parent `p140-parent`. [Launch](assets/evidence/live-child-launch.json), [verified parent binding](assets/evidence/live-child-parent-registration.json).
2. `tmux kill-window -t @4224` killed only the owned child. Before cursor 8; within **1.35 seconds**, tombstone **9** recorded process/pane evidence, pushed event **10** addressed the parent, `delivery.outcome` **11** was honestly **queued / extension-stream**, and `death.notice` **12** linked it to tombstone 9. [Events](assets/evidence/live-death-events.json), [actual parent pane capture](assets/evidence/live-parent-obituary.txt).
3. `pij-rs revive p140-child --session p140-ocv_v86t` returned success without close, new pane `%4323`, `details.seq: 9`. [Receipt](assets/evidence/live-revive-without-close.json).
4. Isolated recycled fixture used a mismatched recorded start for the still-living, unrelated parent pid 7000, and absent pane `%missing-p140`. Ordinary revive exited **2**, with `E-RS-REVIVE-LIVE`, `liveness: recycled` and exact override command. Authorized parent override exited **0**, citing `assumed_dead_seq: 17` and tombstone `seq: 18`, launching pane `%4324`; `ps` still observed replacement pid 7000 alive. [Fixture, commands, receipts and events](assets/evidence/live-recycled-override.json).
5. [Preserved isolated event spine](assets/evidence/isolated-spine-events.json) includes revival postmortem/new-incarnation facts.

### Proof ceilings and existing behavior

- The requested `github-copilot/gemini-3.8-flash-1m` selector was unavailable in OMP 18.1.14; the parent displayed `no-model`, as anticipated by the packet. Its pane visibly received the obituary notification, but model-turn insertion failed with `No model configured`. **This proves pushed parent visibility, not model processing or delivered acknowledgement.** Receipt remains queued; no success upgrade.
- OMP spawn from a linked-worktree cwd is explicitly refused by existing collision protection. Proof seats therefore ran in the isolated temporary cwd while using this worktree's daemon binary. An empty inherited `PIJ_PARENT_ID` initially overrode the child's spawn parent; verified native registration set the real binding before the kill. Subsequent proof spawns inherited `p140-parent` explicitly.
- Prime corrected AC2 after initial delivery: the obituary now names native `pij-rs revive`, not the unsupported shim command. Historical live captures below `assets/evidence/` preserve the original run unchanged; they are not evidence of the corrected text. No shim port added.
- `time` was approved by prime: default features disabled, only `formatting`; one daemon-only allowlist edge with reason. `arch_drift.rs` reads `arch-allowlist.toml`; both metadata fixtures were deliberately regenerated. Stable route corpus is designed source, not an executed golden capture; only its manifest hash/length changed. Existing parity capture was not fabricated or regenerated without its missing runner.

## Harness contribution and retrospective

Encoded: canonical reaper regressions for automatic death evidence, repeat-sweep idempotence, reboot suppression, and exact obituary text; real-store authorization/publication/concurrent-revive checks; a UTC millisecond rendering witness. No extra test framework or scheduler abstraction.

DL-001: baseline `harness boot` passed dependency readiness and typecheck but hit the 90s smoke deadline at `file-watch-notify`. Prime's applicable history pointer is `docs/plans/archive/misc/prime-ledger-2026-09.md`, “smoke flake under full gate”; standalone smoke subsequently passed. The separate flow-pair cleanup race also passed in isolation per prime's ruling. No unrelated fixes applied. Harness harvest found zero existing 140 retros; this report retains the session findings.

Highest-value next encoding offered to prime: a reusable live-death proof fixture that owns a private daemon/tmux environment and returns tombstone/delivery seqs plus parent pane capture. It would eliminate re-deriving isolation, inherited-parent handling and acknowledgement-vs-notification proof on the next lifecycle change. Not added without scope approval.

## Native-command correction after initial delivery

Prime requested a new commit, not a rewrite of `426d3215`: use executable `pij-rs revive <id>` in the obituary. Updated renderer, exact UTC-millisecond example, stable corpus and manifest, AC2, API and peer guidance. Historical live captures remain untouched.

RED: changing the expected command before the renderer produced `FAILED. 0 passed; 1 failed`, showing actual `pij revive pij-child` versus expected `pij-rs revive pij-child`. [Output](assets/evidence/native-command-red.log).

GREEN after correcting the renderer:

```text
cargo test -p pij-daemon --lib death_sweep -- --nocapture
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 347 filtered out; finished in 0.13s
cargo test -p pij-testkit --test corpus
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s
cargo fmt --all -- --check
(exit 0, no output)
```

[Executed correction checks](assets/evidence/native-command-green.log). `just pij-skill-check` also exited 0 ([output](assets/evidence/native-command-skill.log)). These scoped checks verify the corrected template and corpus; the initial full-workspace and live evidence above belong to `426d3215`.

## Required review corrections (F1–F3)

Base: `cf8408cd`, after the reviewer's suppression repair `0c2d3ad9`. Prime lifted the hold and required F1–F3 in one new commit. F4–F6 remain recorded findings, not part of this correction.

- **F1:** a matching durable tombstone receipt is optional for revive, while close retains its existing strict receipt requirement. A legacy row with no matching event publishes `revive.legacy-tombstone` before relaunch; the receipt uses `legacy_tombstone_seq` and omits `seq`. Tests cover both no historical event and an older incarnation's event. A real SQLite audit-publication failure leaves the row untouched and launches nothing.
- **F2:** the override remediation now names `pij-rs revive`; the envelope's conventional `command: "pij revive"` is unchanged. Existing authorization/refusal tests enforce the executable remediation.
- **F3:** each obituary's preparation, send and audit run inside a per-seat error boundary. Errors are logged, later parents are still notified, and a summary counts failed seats once. The regression injects a first-seat send audit error followed by a failed `death.notice` publication; the second parent still receives its queued obituary and durable notice. The first send has a **partial admission** (queued message, failed audit), not proof that nothing was queued.

RED before source fixes ([executed output](assets/evidence/review-fixes-red.log)):

```text
cargo test -p pij-daemon --test revive_http -- --nocapture
test result: FAILED. 6 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out
cargo test -p pij-daemon --lib death_sweep_isolates_failed_send_and_audit_from_next_obituary -- --nocapture
one failed obituary must not abort the sweep: Adapter { adapter: "store/spine", message: "error returned from database: (code: 1811) injected first obituary failure" }
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 351 filtered out
```

GREEN after fixes ([executed output](assets/evidence/review-fixes-targeted-green.log)):

```text
cargo test -p pij-daemon --test revive_http -- --nocapture
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.42s
cargo test -p pij-daemon --lib death_sweep -- --nocapture
death sweep: 1 notice(s) failed
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 347 filtered out; finished in 0.13s
```

Final correction gates:

- `cargo test --workspace`: **1033 passed**, 84 suites, 8 ignored (tool aggregate). `cargo clippy --all-targets -- -D warnings` finished successfully in 10.23s; `cargo fmt --all -- --check` exited 0. [Full Rust gate output](assets/evidence/review-fixes-workspace.log).
- `harness checks --json`: **status `ok`, `data.ok: true`, no stages skipped**, 135.24s. This correction obtained a green full invocation, unlike the initial delivery. [Recovered verdict excerpt](assets/evidence/review-fixes-harness.log); the hub completion renderer truncated stdout, so the file explicitly preserves an excerpt, not a fabricated complete JSON envelope.

Harness lesson: retain gate stdout before consuming completion through a compact job snapshot. The new permanent regressions encode the more important product lessons: missing historical receipts cannot veto a valid retirement row, and one obituary's failure cannot suppress another parent's notification.
