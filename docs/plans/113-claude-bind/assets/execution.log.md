# Plan 113 execution log

## Red-first receipts

- Live isolated daemon, no hand registration: spawned `pij-xenophobe` in pane `%2051` with `proc: null`; `demo-113-red` returned `{"outcome":"queued"}`.
- Unit regression added before the transport fix: `pij-transport discovery_is_pid_then_pane_suffix_then_absent` failed on the new `proc: null` assertion, then passed after `UdsTransport::discover` made pid lookup optional and retained pane fallback.
- Scope of the transport green: bound-but-proc-degraded lookup required by req-0002. Core `Queue(PreBind)` remains the honest route for an actually unbound seat, per the o-prime ruling in `ruling-fence-and-drain.md`.
- Circularity red, observed live: trusted pane `%2053` published `~/.claude/sessions/71349.json` with session id `cec19295-5db0-4287-a74f-cf57a0f4015d`, but no matching `~/.claude/projects/*/<sessionId>.jsonl` existed before a first user turn; after the binder tick the descriptor was still `proc: null` and the queued message had not drained. A JSONL-gated binder cannot bootstrap that first turn.
- Recycled-start mutation red: with the start-time comparison disabled, `live_recycled_pid_with_a_different_start_time_cannot_bind` failed `left: 1, right: 0` because the stale record bound; restoring the comparison returned the test to green.

## Binder implementation

- Added an owned daemon tick worker that scans primary `~/.claude/sessions/*.json` for a unique exact `(cwd, tmux pane)` match to a spawned, live, unbound Claude descriptor.
- Session-record discovery replaced the initially attempted transcript gate after the live rig proved the bootstrap circularity: Claude 2.1.251 publishes its session record before the first user turn, while the cwd-scoped JSONL does not exist until that turn. The trust-modal brake remains intact because the modal publishes no session record.
- The session record's UTC `procStart` is normalized against the host offset and compared to the exact-pid `LivenessPort` start identity before registration. A live recycled pid with a mismatched start cannot bind.
- Binder writes use the same extracted registration service as `POST /v1/register`, retaining admission, collision, process-liveness, and incarnation rules.
- Re-registration now preserves `rpc_port_intent` for the same live process and the matching first spawn bind, while a different process without the launch correlator still clears the prior listener intent. Existing consent stamps remain intact.
- Primary-home parity is explicit. `~/.claude-alt` exists but is not inferred as the spawn home; the code comment names this known second home.

## Deterministic proofs

- `claude_bind::tests::session_record_and_exact_pane_bind_before_a_transcript_exists`
- `claude_bind::tests::wrong_pane_record_cannot_bind_the_seat`
- `claude_bind::tests::live_recycled_pid_with_a_different_start_time_cannot_bind`
- `proc::tests::utc_record_matches_the_same_local_start_and_rejects_recycled_pid_time`
- `uds::tests::authentication_is_required_and_bound_to_record_identity` with `target.proc = None`, proving pane resolution still refuses duplicate, mismatched-process, mismatched-domain, and corrupt peer keys.
- `http::tests::re_registration_preserves_live_resource_and_consent_stamps`
- `shipped_revive_derives_identity_and_launches_one_prebind_incarnation`
- `shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent`

## Live acceptance receipts

Isolated daemon: `PIJ_RS_BIND=127.0.0.1:17620`, `PIJ_RS_ADDR=127.0.0.1:17620`, `PIJ_RS_STATE_DIR=/tmp/pij113-demo`.

1. Spawned `pij-s113-acceptance` in pane `%2055`; response carried `proc: null`, `cross_session_inbound_accept: true`.
2. Sent `demo-113-acceptance` immediately, once; response was `Queued`.
3. Binder filled `proc: { pid: 60779, proc_start: 20260831200756 }` without `/v1/register`.
4. The queued row drained with no re-send. Recipient transcript `2d36c47c-5f94-4d13-a264-544098aadaa9.jsonl` contained the sentinel as exactly one real `type=user` turn, with record counts `queue-operation: 1`, `user: 1`, `assistant: 1`.
5. A distinct post-bind send, `demo-113-direct`, returned `{"outcome":"delivered","origin":"injected-to-transport"}`. Its sentinel also appeared as exactly one real `type=user` turn with the same three record types.

## Harness finding

- This fresh linked worktree had no `node_modules/.bin`, so the first `harness checks` reported absent local gates primarily as exit 127. `just _root-lock-npm-ci` was the successful install path: it unsets `npm_config_min_release_age` and `npm_config_before`, then runs the locked proxy-backed `npm ci`; the successful run added 564 packages in 53 seconds.
- Independent receipt posted to [pij#331](https://github.com/AI-Substrate/pij/issues/331#issuecomment-5476975826). A later reinstall retry hit a package-feed network timeout; this is separate from the min-release-age/`--before` policy failure.
- UDS coordination: pij-fatal-woodpecker confirmed [PR #330](https://github.com/AI-Substrate/pij/pull/330) is open/mergeable and has no hunks in `discover`, `seat.proc`, or pane-suffix lookup. Its same-file changes are downstream and disjoint. Plan 110 lands first; plan 113 rebases onto `origin/main` before merge, never forks the fix.

## Gates

- `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate`: all stages green — toolchain, lock, fmt, clippy, test, architecture.
- `harness checks`: 6/8 sensors passed (`typecheck`, `lint`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`). Two pre-existing main failures remained: `local-paths` names 13 unchanged `skills/pij/**` governance paths outside this fence; `test` fails only `npm-resolution-policy.integration.test.ts`, the clean-main npm 11.5.1 TLS fixture defect tracked by [pij#314](https://github.com/AI-Substrate/pij/issues/314).
