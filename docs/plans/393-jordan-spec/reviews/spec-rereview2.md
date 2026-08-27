Verdict: APPROVE

Scope: re-review #2 of the single open D2-1 state-diagram finding.

| finding | resolved y/n | evidence |
|---|---|---|
| D2-1 attempt/park state diagram | y | §4 now separates the consumer and daemon paths. The consumer path shows `queued → claimed` through `claim()` with `attempt+1`, lease-expiry redelivery, `attempt ≥ 6 → parked`, and successful handling to `acked`. The daemon path shows direct socket/RPC `queued → acked`, pointer `queued → injected` through `settle`, `pij inbox` `injected → acked`, and lease-expiry `injected → queued` while `attempt` remains 0 and parking stays unreachable. The diagram also includes `settle(seq,"queued")` release, retirement of every open state, and reason-matched `unretire` back to `queued`. These edges agree with `EXT/daemon.ts:1174,1243,1248` and `EXT/adapters/sqlite-queue.ts:359-381,385-403,427-447,478-561`. |
