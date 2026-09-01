# Follow-up cross-model review — s123

**Review target**: `cd0223eff506c6da9fe049a7bde24af012f3299f` and `a810eafeaa60329b9443a5a7ad5ad07eb15df828`  
**Prior review**: `assets/reviews/review.s123-cross-model.md`  
**Verdict**: **APPROVE — F001 and F002 are closed.**

## F001 — session-replacement misdelivery: closed

**Verified directly from source and tests.**

- The event callback snapshots both `seat` and `client` before queuing consumption (`.pi/extensions/pij/adapters/rust-runtime.ts:105-120`).
- `consumePushed()` rejects a stale seat before the claim, after the awaited claim, and before acknowledgement (`:186-245`). It acknowledges only through the captured client and original seat.
- The new delayed-claim regression test replaces A with B before resolving A's claim and asserts one `daemon_event_claim_stale`, zero injected A body, and zero acknowledgements (`rust-runtime.test.ts:270-307`).
- I mutation-tested the essential **post-await** guard in a detached throwaway worktree: removing only that guard made this exact test fail (`expected true to be false`) because A's body was injected. The throwaway worktree was then removed.
- Current focused test: `just test .pi/extensions/pij/adapters/rust-runtime.test.ts` — 5/5 passing.

## F002 — pinned skew proof: closed

**Verified as supplied live-runtime evidence; I did not rerun the two OMP scenarios.**

`assets/live-delivery-transcripts.md:130-184` identifies pinned commits and isolated endpoints for both arms:

1. **New extension `cd0223ef` / old daemon `a93f8f23`**: one unique injected body, one terminal acknowledged row, and exactly one `message.pushed`, `delivery.outcome`, and `delivery.inbox-ack` event.
2. **Old extension `a93f8f23` / new daemon `cd0223ef`**: the first visible injected body leaves the row pending and unacknowledged; explicit daemon-inbox recovery visibly returns the same body; final state has exactly one acknowledgement. This is the ruled loud unsupported-direction failure: body retained, duplicate visible, no double ack.

The cited commits exist on the reviewed branch. The transcript is sufficient to close the original evidence finding; it is documentary runtime evidence, not a reviewer-reproduced execution.

## Current validation

```bash
just test .pi/extensions/pij/adapters/rust-runtime.test.ts  # 5/5 passed
harness checks                                              # passed: local-paths, typecheck, lint, test, windows-compat, smoke, pkg-audit, snapshots
```

An earlier `harness checks` invocation reported an opaque test-stage failure while direct `just test` immediately passed; a clean rerun passed. This was recorded as harness observation `CONF-002`.
