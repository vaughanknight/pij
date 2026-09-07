# rs control commands — delivery receipt

Commit: `22b345be9f4c819739a9f36ac4c340960b20b978` on `rs-control-commands`.

`fix(pij): execute remote control commands on Rust seats`

Co-author: `GPT-6 Astra (OMP) <noreply@openai.com>`.

## Delivered

- Native `/v1/send`, `pij-rs send --command`, `pij-rs compact-self`, legacy `pij send --command` / `pij compact-self`, and native extension tool route controls through shared daemon admission.
- Rust owns the command allowlist; TS consumes the parity-tested JSON fixture. Nonempty bodies, invalid commands, remote-machine controls without local caller proof, Copilot controls, and paneless targets refuse explicitly.
- `new` / `reload` authorize only the daemon-derived seat or target's recorded parent. Per prime ruling, recorded parent is the current rs governing relationship; no role/global-prime inference or new prime field.
- OMP/Pi execute in-process and acknowledge actual callback/lifecycle outcomes. Unarmed `new` / `reload` refuse rather than execute unexpectedly later. Pi retains one `session_start` handler; OMP reload completion uses its native `session_switch(resume)` event.
- Claude controls use owned-input PTY submission, retaining the draft gate, held hash, release event, and transport-qualified receipt.
- Expired command claims do not automatically replay after ambiguous acknowledgements. This is a one-directional replay brake: bodies retain their recovery policy. Terminal control refusals are persisted before queue acknowledgement and replayed for duplicate message ids under the delivery-order lock.
- Updated `docs/how/pij.md` and `skills/pij/references/routes/peer.md`, including runtime-specific reload semantics and retry boundaries.

## Gates

Evidence directory: `.harness/temp/rs-control-evidence/`.

| Check | Observed result | Receipt |
|---|---|---|
| `harness checks` | **PASS**, all 9 sensors, no skips: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit, snapshots | `harness-checks-final.json` |
| `cargo test --workspace -- --test-threads=4` | **772 passed**, 66 suites; 8 ignored, 93 filtered as reported by runner | `rust-workspace.txt` |
| `cargo clippy --workspace --all-targets -- -D warnings` | **PASS** | `rust-clippy.txt` |
| `cargo fmt --all -- --check` | **PASS**, no output | final command receipt |
| Focused index/runtime/router suite after lifecycle integration | **109 passed** | `typescript-lifecycle.txt` |
| Isolated `just smoke` | **11 smoke scenarios passed** | `smoke-clean.txt` |
| Independent review of authorization/lifecycle/replay | Final **no_material_findings**; three original findings fixed and rechecked | reviewer ControlReview |

Rust commands used `/Users/jordanknight/.cargo/bin/cargo`; TS used worktree-local per-package links to main's existing dependencies. No install or main dependency mutation.

An initial full Rust run under concurrent full TS load hit one real-process fixture observation failure (`native_sqlite_http_new_session_supersedes_seat_without_stranding_new_work`, `Ok(None)`). The complete workspace passed with four test threads; no test was removed or narrowed. The first full harness gate exposed a duplicate Pi lifecycle handler, fixed before the final green gate. Its smoke failure also exposed the proof environment's forced-rs setting with no gate daemon; removing that test-environment override restored the existing legacy smoke contract.

## RED receipts

All listed failures were observed before their corresponding production fix; raw outputs are retained.

- `red-http.txt`: `control_native_send_preserves_command_and_derived_sender`; `control_native_refuses_unsupported_targets_and_invalid_shapes_without_enqueueing`; `control_destructive_ownership_requires_pane_proof_not_asserted_actor`; `control_recorded_parent_can_send_destructive_commands`; `control_shim_send_and_compact_self_use_the_command_path`.
- `red-cli.txt`: `shipped_control_send_and_compact_self_forward_caller_and_empty_body`; `shipped_control_invalid_command_and_body_are_decodable_refusals`.
- `red-worker-service.txt`: `command_claim_cannot_be_acked_without_execution_outcome`; `command_draft_hold_carries_hash_then_releases_with_pty_receipt`.
- `red-extension.txt`: claimed compact/new/reload execution-outcome cases; awaiting runtime completion; unarmed new/reload refusals; runtime-error acknowledgement; native command caller proof; send/compact-self shim routing and decodable refusal. Initial total: 11 failures. The send-routing and refusal mocks were subsequently corrected to the real preflight/envelope contract, not used as proof of production failures.
- `red-refusal-replay.txt`: `refused_control_id_replays_refusal_without_executing_again`.
- `red-lease-brake.txt`: `control_claim_lease_expiry_never_replays_an_unacknowledged_command`; companion ordinary-body/null-command/malformed-payload recovery test remained green.

## Isolated live proof

Private daemon: `127.0.0.1:17641`, state `/tmp/pij-control-proof.oYCfgW/state`, private tmux socket name `pij-control-proof-oYCfgW`. Isolated homes, Claude configuration, scratch workspaces, and explicitly loaded worktree extensions. Real OMP and Claude performed model turns; real Copilot registered its native extension.

Lossless observed events: `rs-control-evidence/spine-receipts.json`.

| Scenario | Observed result | Spine / file |
|---|---|---|
| Remote OMP compact, `pij-payable-dara` | Visible **soft-compacted 43K→42K**; `extension-stream`, `reader-read`, `control_outcome.executed` | seq **8**, `omp-remote-cli.json`, `omp-remote-pane.txt` |
| Claude empty composer, `pij-cultural-angelfish` | `/compact` typed and executed by native UI; receipt says `pty` / `injected-to-transport`, not model completion | seq **12**, `claude-empty-cli.json` |
| Claude unsent draft | `UNSENT_CONTROL_DRAFT` remained untouched; hash **b14de95623d3**; after explicit clear, release then PTY delivery | first hold **19**, release **59**, outcome **60**; `claude-held-pane.txt`, `claude-draft-cli.json` |
| Real native Copilot, `pij-scrawny-tapir`, native PID 74306 | Exit **2**, `E-RS-CONTROL-UNSUPPORTED: use Copilot's native user controls`; queue empty before/after; no fallback | `copilot-proof.json` |
| Legacy `pij compact-self` invoked through the actual OMP session shell | Visible **soft-compacted 61K→20K**; `control_outcome.executed` | seq **77**, message `f5d832ad229ba943-0000000000000002`; `omp-self-pane.txt` |
| Claude with sufficient conversation history | Native UI entered **Compacting conversation** after PTY delivery | release **109**, outcome **110**, `claude-final-pane.txt` |

### Native limitations observed, not hidden

- Claude's initial command executions reported **Not enough messages to compact**. After more real turns, native compaction ran but the provider refused the summary with `Sonnet 5 can't help with this`, details `[bio]`, request `req_011CeoGAfS7eHbEsr6Tf4jPH`. The synthetic context contained observatory/sample records. **Claude command execution is proven; successful provider-side Claude compaction is not claimed.**
- Repeated OMP compaction without enough new context correctly returned `Already compacted` / `Nothing to compact`; these produced refused outcomes (seq 17/57). A distinct long context then proved successful self-compaction (seq 77).
- Under simultaneous full-suite load, one existing one-second tmux staging deadline expired and recovery left the owned `/compact` draft. The next attempts held that draft rather than overwriting it. Clearing the owned draft recovered the queued command. No gate was weakened.
- Armed `new` / `reload` have behavioral/lifecycle tests, not a separate live model exercise; the packet's live scenarios were compact-focused. Existing opt-in/ignored Rust tests remain unrun as reported above.

## Closeout

No push, PR, merge, live-daemon bounce, installed binary update, global-link change, or main-checkout mutation. The private proof daemon and proof tmux server were stopped; the Copilot proof owner stopped its own pane. Evidence remains under the worktree report directory and private scratch directory.

Harness observations are retained in `rs-control-evidence/harness-observations.json`. Encoded improvements are the shared wire fixture and the command outcome/draft/replay regressions. Optional next harness improvement: one reusable isolated-control smoke command that provisions authenticated clients, sufficient conversation history, and pane/spine capture without repeating the onboarding steps.
