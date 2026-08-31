# Done — u-ts-witness

## Result

The ten `.pi/extensions/pij/index.test.ts` failures were test-generation leakage, not ten authorized assertion changes. Commit `acb1399a` deliberately changed the unset `PIJ_DAEMON_GENERATION` default to `rs`; the suite then attached to the machine's live Rust daemon instead of the legacy file runtime it directly inspects. Commit `c048ebc2` explains the resulting Rust status rendering and in-memory/daemon-owned state.

The existing legacy assertions now select the ruled `PIJ_DAEMON_GENERATION=legacy` forceback explicitly. Their expected values are unchanged. Default-Rust coverage remains visible: deterministic Pi and OMP wiring tests select a fake Rust generation, while `daemon-http.test.ts` proves that an unset generation defaults to `rs`.

No unruled product behavior was blessed. No finding required a product-code change.

## Ten-failure trace

| # | Failing assertion | Old behavior | Newly observed behavior | Authority | Disposition |
|---:|---|---|---|---|---|
| 1 | Status-bar value matched a bare `pij-*` slug. | Legacy Pi published `self` directly. | Rust Pi published `pij-* · rs-v1`. | `acb1399a` made Rust the default; `c048ebc2` added the Rust generation suffix, recorded in `matrix-u-extension-pi.md`. | Edited the generation fixture, not the assertion; added a separate deterministic Rust suffix witness. |
| 2 | The first id in the reload/new lifecycle test matched a bare `pij-*` slug. | Legacy lifecycle returned the bare file-registry id. | The selected Rust branch returned the status-rendered `pij-* · rs-v1` value. | `acb1399a` default-Rust cutover; `c048ebc2` Rust status rendering. | Edited the generation fixture; lifecycle assertions unchanged. |
| 3 | After replacement shutdown, `FsRegistry.read(id)` matched `{ lifecycle: "dissolved" }`. | Legacy shutdown mutated the TypeScript descriptor. | The Rust branch wrote no `FsRegistry` row, so the legacy read returned `null`. | `c048ebc2`; `done-u-extension.md` rules Rust mode to create no legacy registry/channel residue. Replacement is daemon-owned through ruled `Registration.supersedes` in `WIRE-CONTRACT.md`. | Edited the generation fixture; legacy shutdown contract unchanged. |
| 4 | The TypeScript registry row contained `parentId` and `gitCommonDir`. | Legacy registration persisted both in `FsRegistry`. | Rust registration went to the daemon; the legacy registry read returned `null`. | `acb1399a` selected Rust; `c048ebc2` moved Rust registration to the authenticated daemon and forbids legacy residue. | Edited the generation fixture; structural legacy assertion unchanged. |
| 5 | The TypeScript registry row carried `PIJ_PLAN_ID`. | Legacy registration persisted `planId` in `FsRegistry`. | Rust mode produced no TypeScript row, so that legacy read returned `undefined`. | `acb1399a` selected Rust; `c048ebc2`/`done-u-extension.md` make the daemon authoritative and the legacy registry absent in Rust mode. | Edited the generation fixture; no Rust plan-id behavior was inferred or blessed. |
| 6 | A managed modal call was captured in `FsEventLog`. | Legacy capture persisted `tool_call` to the TypeScript event log; the block assertions also passed. | The block still fired, but Rust capture stayed in the runtime's in-memory projection, so the separately opened legacy `FsEventLog` read `[]`. | `c048ebc2`; `done-u-extension.md` explicitly makes Rust Pi activity/event projection transient in memory and daemon/fleet state authoritative. | Edited the generation fixture; block and capture assertions unchanged. |
| 7 | An unmanaged Pi modal call returned `undefined`. | A fresh legacy descriptor had no parent/spawner/prime evidence, so invariant 9 did not block. | The live Rust daemon reused this process's already managed seat descriptor; `readSelf()` therefore supplied management evidence and the guard blocked. | `acb1399a` authorized default Rust selection; `c048ebc2` authorized same-process Rust identity reuse and guard lookup through `rustRuntime.readSelf()`. | Edited the generation fixture; the unmanaged predicate assertion remains unchanged and isolated from live daemon state. |
| 8 | The no-native-session fallback id matched a bare `pij-*` slug. | Legacy fallback allocated and rendered a bare memorable id. | Rust status rendering appended ` · rs-v1`. | `acb1399a` plus the `c048ebc2` status-display commit. | Edited the generation fixture; fallback assertion unchanged. |
| 9 | A queued legacy inbox message was injected before its read marker, then marked and not replayed. | `FsChannel.watch` consumed the TypeScript inbox and wrote its marker after injection. | Rust mode did not construct the legacy channel watcher, so no callback or marker occurred. | `c048ebc2`; `done-u-extension.md` rules Rust mode to create/use no legacy registry/channel residue and to consume daemon `message.pushed` events instead. | Edited the generation fixture; legacy delivery-order assertions unchanged. |
| 10 | A legacy receipt was marked and recorded without injection or replay. | The TypeScript channel consumed the receipt, wrote its marker, and persisted receipt history. | Rust mode ignored the legacy inbox file; marker and legacy event were absent. | `c048ebc2`; the ruled Rust transport is daemon events/HTTP, not the legacy file channel. | Edited the generation fixture; receipt assertions unchanged. |

## Environmental fixes

- `skills/flow-pair/test/cli-learning.test.ts`: strips only measured `npm warn ` lines, then asserts the remaining success-path stderr payload is empty. The original “nothing of ours on stderr” contract survives while known npm configuration noise is ignored. Exit status, exact stdout payload, candidate creation, and cross-cluster absence remain asserted.
- `harness/test-utils.ts` now owns one `removeTemporaryTree` call site with Node's native recursive-removal contract (`maxRetries: 3`, `retryDelay: 100`). All five ruled teardown sites use it: three in `observe.test.ts`, plus `.pi/extensions/pij/adapters/git-repository.test.ts` and `.pi/extensions/pij/core/chores/drive.test.ts`. The PM explicitly extended the fence to the latter two and rejected a repo-wide sweep of the other unretried sites.
- Centralizing the options makes our decision—not five repeated literals—the tested surface and prevents the next teardown from copying a different retry shape.

## Review round 1

- Reviewer report `review-ts-witness-round-1.md` at review commit `3caaf5d8` refused T1: deleting the exact-empty assertion also deleted all success-path stderr payload checking. The ruled strip-known-benign-lines then assert-empty allowlist closes T1 without reintroducing environmental-noise coupling.
- T2 was raised for a ruling rather than as a blocker. PM `pij-revolutionary-lungfish` ruled both currently-red teardown sites in scope and identified the original enumeration gap as PM-owned contamination, not coder fence drift.
- T1 negative-arm mutation: appended `warning: candidate index rebuilt`—containing neither `ERR!` nor `Error:`—to the captured success-path stderr, ran the entire `cli-learning.test.ts` file unfiltered, and observed exactly **1 failed / 2 passed** at the strip-then-empty assertion with the injected text printed as the received value. The mutation was restored before further verification.
- T2 injection tests use a contract fake for Node's configured removal interface. A transient `ENOTEMPTY` twice recovers on attempt 3, proving our call supplies a sufficient `maxRetries`; persistent `ENOTEMPTY` exhausts 4 attempts and is still thrown, proving the helper does not swallow. This proves **our configured contract**, not Node's internal retry implementation.
- T2 is a one-directional safety interlock: removing the retry can only make teardown fail sooner and never removes more. The persistent arm distinguishes this brake from `catch {}` swallowing. Residual: if Node changes `rmSync` retry semantics, the contract fake still passes; no workspace instrument spans that standard-library boundary.

## Verification

- Controlled pre-edit probe: `PIJ_DAEMON_GENERATION=legacy npx vitest run .pi/extensions/pij/index.test.ts` — **11/11 passed**, proving the ten reds came from generation selection rather than assertion drift.
- Initial dual-generation focused run: `index.test.ts`, `daemon-http.test.ts`, `rust-runtime.test.ts`, `cli-learning.test.ts`, and `observe.test.ts` — **5 files, 42 tests passed**.
- Final review-fix run, unfiltered and redirected with the invocation's own exit code: `index.test.ts`, `cli-learning.test.ts`, `observe.test.ts`, `git-repository.test.ts`, `core/chores/drive.test.ts`, and `harness/test-utils.test.ts` — **6 files, 74 tests passed**.
- `just typecheck` — **passed**. Changed-file Biome check — **passed**.
- Final full `harness checks` was invoked unfiltered with its own exit code. Local paths, typecheck, smoke, package audit, and snapshots passed; every T1/T2 file passed in the full test stage. The branch-level gate remained red only on separate release-lineage work already owned elsewhere: repository-wide generated-fixture lint drift (also failing windows-compat) and `npm-resolution-policy.integration.test.ts`.

## Files

- `.pi/extensions/pij/index.test.ts`
- `skills/flow-pair/test/cli-learning.test.ts`
- `skills/flow-pair/test/observe.test.ts`
- `.pi/extensions/pij/adapters/git-repository.test.ts`
- `.pi/extensions/pij/core/chores/drive.test.ts`
- `harness/test-utils.ts`
- `harness/test-utils.test.ts`
- `docs/plans/109-copilot-rpc/assets/reports/done-u-ts-witness.md`
