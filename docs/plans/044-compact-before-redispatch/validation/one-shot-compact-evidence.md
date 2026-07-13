# One-Shot Completion Compact Evidence

**Peer**: `pij-dramatic-lungfish`
**Harness**: Copilot `gpt-5.6-sol` xhigh
**Lifecycle**: spawned with `pij agent spawn --once`
**Report target sha256**: `e3d682e77d4d7a2241cf5847178159f6fd948b74e865a1e6d31ef26f453941b6`

## Event

1. The validator report arrived from `pij-dramatic-lungfish`.
2. Before reading the report artifact, the orchestrator ran:

   ```text
   pij send pij-dramatic-lungfish --command compact
   ```

3. The command returned:

   ```text
   E-DEAD: session pij-dramatic-lungfish is dissolved (closed)
   ```

## Interpretation

`--once` auto-closes the peer when its report lands, so no reusable context remains by the time the completion interrupt fires. C3 completion-first compaction applies to reusable/live peers; `E-DEAD` after one-shot auto-dissolve is expected lifecycle evidence, not a failure or redispatch blocker.

## Branch payload verification

The s044 branch C3 contract now names the one-shot `--once` boundary and expected `E-DEAD`
explicitly. The copied-root mutation case `c3-one-shot-boundary` turns the structural gate
RED when that marker is removed, while the original lifecycle event above remains the
bounded runtime evidence.
