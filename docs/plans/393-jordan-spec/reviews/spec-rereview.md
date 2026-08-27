Verdict: FIX_REQUIRED

Scope: findings-only re-review of `docs/plans/393-jordan-spec/reviews/spec-review.md`. The targeted source anchors remain unchanged from `main@ed20a68`.

| finding | resolved y/n | evidence |
|---|---|---|
| D1-1 test name | y | §6.2 identifies the descriptive `describe` prefix, says the suffix is historical, and cites `EXT/core/daemon/loop.test.ts:1405-1513`; the handoff no longer carries the plan/phase identity. |
| D1-2 `L2` | y | §7.3 step 5 names `reports/pij-comms-review-2026-08-27.md` §11, describes the never-pulled-seat scenario, and gives the observed timestamps and durable-row result. |
| D1-3 bind terms | y | §9.1 defines `pre-bind`, degraded `bind-limbo`/`bind-failed`, and daemon-owned targets with `EXT/core/bind-health.ts:30-47` and `EXT/core/cli.ts:707-712`; Appendix A indexes the bind-health source. |
| D1-4 `+WPI` | y | §14 item 17 states the lease-extension idea directly and contains no unexplained tag. |
| D1-5 review/governance shorthand | y | §14 item 19 names `reports/pij-comms-review-2026-08-27.md` §10 and directly states the present CI gap without the prior governance-history claim. |
| D1-6 house practice / D3-2 canonical gates | y | §15 gives `just typecheck`, `just test [path]`, and `harness checks`, plus the mutation procedure, matching `justfile:74-86,166-175` and `AGENTS.md:158-169`. |
| D2-1 attempt/park semantics | n | The new ownership prose, §4.2, §7.3 step 5, G25, §14 item 21, and the glossary now correctly say only `claim()` increments `attempt`, so daemon pointer rows stay at 0 and never park. However, the §4 state diagram still shows only `queued --claim--> claimed --settle(injected)--> injected`; it omits the shipped daemon transition `queued --settle(injected)--> injected` (`EXT/daemon.ts:1174,1243`; `EXT/adapters/sqlite-queue.ts:385-403`). It therefore contradicts the immediately following “daemon never claims” explanation and does not yet resolve the original request to correct the state diagram. Add the direct daemon edge (and distinguish it from the consumer `claim → handler → ack` path). |
| D2-2 `openChannel` scope | y | §5 scopes `openChannel` to live channel selection and names the direct-construction migration exceptions at `EXT/adapters/channel-factory.ts:123` and `EXT/cli.ts:595,609`. |
| D2-3 remaining `instanceof` | y | G3 now says `EXT/daemon.ts:1628` selects the equivalent `resetClaimsOnStart()` receiver while `:1629` selects the label; it no longer describes both uses as label-only. |
| D2-4 `write.lock` citation | y | G10 and Appendix A cite `EXT/adapters/platform-write-lock.ts:3,44,123` for `write.lock` and retain `EXT/adapters/spine-store.ts:10,78` for `events.lock`. |
| D2-5 Claude ambiguity | y | §7.1 defines `confirmed` as write plus no matching negative drop report within 150 ms, identifies the post-write error race, and points to T1; §8 states the duplicate window and identical-repeat dedupe facts without treating `failed` as proof that nothing landed. |
| D2-6 Copilot ambiguity | y | §7.2 identifies timeout/drop after request write; §8 T2 explains the lost-response duplicate window, the 5 s wait, and that the JSON-RPC id is correlation rather than an idempotency key. |
| D2-7 fs qualification | y | §1 and §12 P1 scope pointer/no-body-typing guarantees to `sqlite`/`dual` and name `PIJ_QUEUE_BACKEND=fs` as the typed-body compatibility exception. |
| D3-1 transport windows | y | §8 now separately documents consumer windows W1/W2 and direct-transport windows T1/T2, including retry consequences and receiver dedupe behavior. |

Required correction: update the §4 state diagram so its edges represent both shipped entry paths instead of visually requiring a daemon pointer row to pass through `claim()`.
