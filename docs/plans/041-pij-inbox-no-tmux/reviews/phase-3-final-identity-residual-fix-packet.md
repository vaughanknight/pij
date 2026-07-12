# Final Identity Residual Fix

## Scope

Existing Seq 113 files plus:

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`

## Required Fixes

1. Explicit `PIJ_SESSION_ID`:
   - if no ambient native identity exists, preserve direct explicit-id
     compatibility;
   - if ambient identity is detectable, run mode-aware ambient validation even
     when `PIJ_SESSION_ID` is set;
   - propagate validation failures;
   - require the validated ambient id to equal the explicit id;
   - mismatches fail `E-AMBIG`; exact validated matches succeed.
2. Repair history:
   - preserve append-only `reportedAt`;
   - continue clearing stale `agentOnce`, pane, failure, tick, init, planned-id,
     and spawn-transcript runtime.
3. Extend the contaminated production regression with explicit
   `PIJ_SESSION_ID`: reject before repair, repair same id, then explicit whoami
   succeeds.

## Mutation Proof

- bypass explicit-id ambient validation → RED;
- delete `reportedAt` during repair → RED;
- restore each byte-identically → GREEN.

## Gates

Focused tests, full `just test`, skill check, typecheck, lint,
`harness checks --quick`, scope/package audit, and `git diff --check`.

## Forbidden

No other paths, daemon restart, deployment, manual test, commit, push, merge, or
quarantined identity use.

On completion, compact is fire-and-forget: send immediately without `--wait` and
continue the handoff (Spine Seq 128).
