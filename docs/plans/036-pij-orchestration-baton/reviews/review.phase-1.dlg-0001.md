# Phase 1 review — dlg-0001

**Verdict: FIX_REQUIRED**

## Findings

| Severity | Location | What | Evidence |
|---|---|---|---|
| HIGH | `.pi/extensions/pij/cli.ts:1404-1414`; `.pi/extensions/pij/core/orchestration/baton.ts:286-303` | A SHA-pinned request is granted without `--repin` whenever the baton has no repo or `git rev-parse HEAD` fails. `batonHead()` collapses both cases to `null`, and `planGrant()` only treats a pin as moved when `currentHead !== null`; the old pin is then copied into the lease. This bypasses AC-03's re-verification guard exactly when verification is unavailable. | Direct probe returned `pinnedGrantWithUnknownHead: { ok: true, ... lease.pin: "old-sha" }` for a pinned request with `currentHead: null`. No test covers this branch. |
| HIGH | `.pi/extensions/pij/core/orchestration/baton.ts:412-421,484-495,522-537,620-636` | Durable state changes happen before the mandatory machine-log append. If logging fails, define/request/grant/return/reclaim can return `E-STORE` after the action already happened. Grant can leave an authoritative lease with a queued request and no grant log/notice; return/reclaim can free the lease with no release log/notice. This violates AC-07 and house P9 persist-before-mutate. | Injected-failure probe: `grantResult={ok:false,code:"E-STORE"}` while `leaseAfterGrantError` remained populated; `returnResult={ok:false,code:"E-STORE"}` while `leaseAfterReturnError=null`. The fakes cannot inject store failures, so no test guards this ordering. |
| HIGH | `.pi/extensions/pij/core/daemon/baton-sweep.ts:24-31`; `.pi/extensions/pij/daemon.ts:282-297`; `.pi/extensions/pij/core/daemon/baton-sweep.test.ts:66-107` | A stalled holder does not reliably re-arm after recovery. The existing daemon persists `failureReason: "stalled"`; `classifyBatonHolder()` checks that sticky field before the current idle/working state, so an alive recovered descriptor still classifies as stalled. The recovery test uses a fresh descriptor with no `failureReason`, so it misses production behavior. A later stalled/dead transition can therefore be suppressed, violating AC-04's one alert per transition. | Direct probe with `state:"idle"`, alive PID, and `failureReason:"stalled"` returned `recoveredDescriptorHealth: "stalled"`. |
| HIGH | `.pi/extensions/pij/adapters/baton-store.test.ts:41-59`; `.pi/extensions/pij/core/orchestration/baton.test.ts:124-180,237-331,363-395`; `.pi/extensions/pij/core/daemon/baton-sweep.test.ts:65-169` | The committed suite does not fully exercise AC-01, AC-02, AC-05, AC-06, AC-07, or AC-09. Most notably, AC-01's test performs two sequential direct `claimLease()` calls and never proves concurrent request+grant or that the losing request remains queued; production notice wiring has no integration test; `show --json`, every-verb logging, and daemon-less production receipts have no committed load-bearing test. | See the per-AC table below. The two selected guards are mutation-resistant, but the uncovered branches include two observed correctness defects above. |
| MEDIUM | `docs/plans/036-pij-orchestration-baton/execution.log.md:3-12` | The execution log records task summaries and gates but not the rubric-required explicit changed-file list or non-obvious decision/trade-off record. | Rubric dimensions 7 and 10 require those learning artifacts. |

## Dimension 0 — mutation evidence

### Atomic no-replace lease publication

Mutation: `linkSync(tmpPath, path)` → `renameSync(tmpPath, path)` in `baton-store.ts`.

```text
→ mutated .pi/extensions/pij/adapters/baton-store.ts; running suite (expect RED)…
✓ suite went RED under mutation:
      Tests  1 failed | 4 passed (5)

× .pi/extensions/pij/adapters/baton-store.test.ts > FsBatonStore > publishes exactly one lease when two writers claim the same baton
  → expected [ Array(2) ] to have a length of 1 but got 2

→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
      Tests  5 passed (5)
✓ mutation smoke PASSED — the suite guards this behaviour.
```

Pre/post SHA-256:

```text
650c5ffb795c8dc0b309cef16e6262f27cc0e6366fe569b823286ff25a4a65f1  .pi/extensions/pij/adapters/baton-store.ts
```

### Stale-pin acknowledgement

Mutation: `if (pinMoved && input.repin !== true)` → `if (false)` in `baton.ts`.

```text
→ mutated .pi/extensions/pij/core/orchestration/baton.ts; running suite (expect RED)…
✓ suite went RED under mutation:
      Tests  1 failed | 11 passed (12)

× .pi/extensions/pij/core/orchestration/baton.test.ts > baton lifecycle decisions > requires an explicit repin when the repo HEAD moved
  → expected { ok: true, value: { …(5) } } to match object { ok: false, code: 'E-PIN' }

→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
      Tests  12 passed (12)
✓ mutation smoke PASSED — the suite guards this behaviour.
```

Pre/post SHA-256:

```text
e536c525f92165c6060b6653305b75fe6ef76faa3935588c48fca7b6395e18db  .pi/extensions/pij/core/orchestration/baton.ts
```

The mutation script also performs a byte-for-byte backup comparison before its GREEN rerun. Repository-wide `git diff --stat` changed during review because other sessions updated forbidden plan/government/package surfaces; both mutated source hashes remained identical to the recorded baseline.

## Acceptance-criteria coverage

| AC | Specific proof | Assessment |
|---|---|---|
| AC-01 | `FsBatonStore > publishes exactly one lease when two writers claim the same baton`; `baton lifecycle decisions > refuses a second holder while a lease exists` | **PARTIAL.** The atomic no-replace guard is mutation-proven, but the test is sequential and does not exercise concurrent request+grant or assert the losing request remains queued. |
| AC-02 | `BatonService notices and receipts > pushes grants to the selected holder and renders the receipt state` | **PARTIAL.** Proves fake sink routing and rendered receipt state, not `CliBatonNoticeSink` over the real channel for delivered/queued/unverified. |
| AC-03 | `baton lifecycle decisions > requires an explicit repin when the repo HEAD moved`; `orchestration exit codes > maps ... conflicts` | **FAIL.** Known mismatches are mutation-proven, but an unavailable HEAD silently grants the pinned request. |
| AC-04 | `BatonService ... > pushes one alert per transition and leaves the lease held`; `evaluateBatonSweep > alerts once ... and re-arms`; `BatonSweep > pushes one alert ... and never releases` | **FAIL.** Initial alert/no-reclaim is proven, but the recovery fixture omits the production-sticky `failureReason`, so re-arming is broken. |
| AC-05 | `baton lifecycle decisions > grants any selected queued request and leaves the others queued`; parser test for `grant --to` | **PARTIAL.** Selection by id is proven; no test asserts that CLI queue rendering exposes purposes and never implies FIFO. |
| AC-06 | `baton lifecycle decisions > calculates blocked time from request to grant`; grant test asserts `blockedTimeMs` | **PARTIAL.** No committed test exercises `show --json` with `requestedAt`, `grantedAt`, and delta or recovers historical deltas from service-produced log entries. A manual real-CLI probe did show these fields. |
| AC-07 | `FsBatonStore > appends one NDJSON machine line per action`; request/return service tests inspect logs; product-code grep for `government/baton-book.md` | **FAIL.** Grep returned `none`, but the adapter test manually appends two entries rather than proving every verb logs, and injected log failure demonstrated actions can persist without a line. |
| AC-08 | Full `harness checks` during review | **PASS.** Typecheck, lint, test, smoke, package audit, and snapshots all passed. |
| AC-09 | `BatonService ... > returns successfully with an honest unverified receipt when delivery is unavailable`; manual isolated real-CLI lifecycle | **PARTIAL.** The real daemon-less define/request/grant/show/return lifecycle succeeded and every push reported `unverified`, but the committed test substitutes a fake sink and does not guard production receipt classification. |

## Mandatory conformance evidence

- **Additive-only:** `git diff --unified=0 -- .pi/extensions/pij/cli.ts .pi/extensions/pij/daemon.ts` showed no removed behavior; the only removed line was a blank line before the added daemon import. The orchestration intercept, usage, sink, and sweep wiring are additions. FX001/FX002 code was untouched.
- **Honor system:** no keeper/ACL/actor-authority check exists in the baton slice. The only business-rule refusals are the atomic `E-HELD` path and stale-pin `E-PIN`; argument, missing-entity, and store failures remain ordinary operational errors. Product-code grep found no `government/baton-book.md` reference.
- **Atomicity truth:** `FsBatonStore.claimLease()` uses a fully written and fsynced `wx` temp followed by atomic no-replace `linkSync`, matching `FsRegistry.publishNoReplace()` (`fs-registry.ts:327-350`). Definition JSON is not consulted to decide the claim winner.
- **Alert never auto-reclaims:** neither `BatonSweep.tick()` nor `BatonService.observeHolder()` calls `releaseLease`; the tests assert the lease remains present. The recovery defect above still requires correction.
- **Receipt honesty:** `CliBatonNoticeSink` returns `unverified` for failed delivery, absent/dead targets, and stale daemon heartbeat. An isolated daemon-less lifecycle produced `receipt.state:"unverified"` for request, grant, and return.

## Rubric dimensions

| Dimension | Result |
|---|---|
| 0 Test quality | **FAIL overall:** two guards pass mutation, but load-bearing AC branches remain untested. |
| 1 Scope | PASS for the packet's implementation files; concurrent unrelated plan/government/package changes were excluded. |
| 2 Contract | FAIL: pinned grants bypass acknowledgement when HEAD cannot be read. |
| 3 Plan alignment | FAIL: AC-07/P9 action-log ordering is unsafe. |
| 4 Acceptance criteria | FAIL: AC-03, AC-04, and AC-07 are behaviorally broken; several others are only partial. |
| 5 Docs/config tests | PASS: docs are internally consistent with the intended surface, subject to the defects above. |
| 6 Domain currency | PASS: domain doc, registry, map, and how-doc were updated. |
| 7 Progress log | NOTE: gates/tasks present; changed-file list and decision rationale missing. |
| 8 Regression | PASS: full harness signal inventory green. |
| 9 Prompt follow | FAIL: mandatory full AC proof is incomplete. Additive-only and forbidden-file constraints pass. |
| 10 Learning | NOTE: non-obvious implementation decisions/trade-offs are not recorded in the execution log. |

## Round 2

**Verdict: FIX_REQUIRED**

### Finding verification

| Finding | Verdict | Evidence |
|---|---|---|
| F1 — pinned request with unavailable HEAD | **FIXED** | `planGrant()` now returns `E-PIN` when a pinned request has `currentHead === null` unless `repin` is explicit (`baton.ts:289-303`). The acknowledgement preserves the original pin and records `repinAck: true` in the lease, result, and log (`baton.ts:304-344`). `requires explicit acknowledgement when a pinned request HEAD is unavailable` asserts both branches (`baton.test.ts:449-498`). The required guard mutation went RED and restored GREEN byte-identically. |
| F2 — action/log ordering | **FIXED** | Machine-log append precedes durable mutation for define (`baton.ts:424-435`), request (`:491-501`), grant (`:529-545`), return/reclaim (`:636-645`), and alert (`:594-612`). Injected-failure tests prove no definition, queue, or lease mutation after append failure for the five action verbs (`baton.test.ts:500-580`). A direct alert probe returned `E-STORE` with the definition unchanged and zero log entries. Later state-write failure tests explicitly preserve the accepted reconstructible intent line (`baton.test.ts:582-661`). |
| F3 — sticky stalled recovery | **FIXED** | `classifyBatonHolder()` derives health from current liveness/state and no longer consults `failureReason` (`baton-sweep.ts:18-30`). The recovery regression uses an alive idle production-shaped descriptor with `failureReason:"stalled"`, records healthy, then proves a later working/stalled transition alerts again (`baton-sweep.test.ts:65-112`). |
| F4 — five named acceptance-test gaps | **NOT-FIXED** | Three additions are load-bearing: `show --json` timing (`baton.test.ts:251-271`), purpose-bearing non-FIFO rendering (`:273-304`), and production `CliBatonNoticeSink` classification (`orchestration-notice.integration.test.ts:52-127`). The grant interleaving proves one claim wins and the other pre-existing request remains queued (`baton.test.ts:346-389`), but it preloads both requests and still does not exercise AC-01's required concurrent `request`+immediate-grant attempts. More decisively, the test named `logs define, request, grant, return, and reclaim through the service` covers only five verbs (`baton.test.ts:664-726`), while AC-07 says **every verb**. Mutating the `list`, `show`, and `alert` log verbs to `define` left all 27 baton tests GREEN, proving those log contracts remain unguarded. AC-06's historical delta in the grant log is also not asserted. |
| F5 — execution log | **FIXED** | `execution.log.md:16-42` now lists created/modified files, and `:43-51` records the atomicity, queue, unverifiable-pin, log-first residue, holder-health, receipt, and probe trade-offs. |

### Mutation evidence

#### Unverifiable pin guard — required RED → GREEN

Mutation:

```text
if (pinUnverifiable && input.repin !== true)
→ if (false)
```

Result:

```text
before=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
Tests  1 failed | 26 skipped (27)
Tests  1 passed | 26 skipped (27)
after=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
```

The named unavailable-HEAD test is load-bearing, and the source was restored byte-identically.

#### Every-verb logging — uncovered mutation

Mutation:

```text
verb: "list" | "show" | "alert"
→ verb: "define"
```

Result:

```text
FAIL: tests STAYED GREEN under mutation
Tests  27 passed (27)
before=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
after=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
```

The source was restored byte-identically. This is direct evidence that the AC-07 test upgrade is incomplete.

### Updated acceptance-criteria coverage

| AC | Round 2 proof | Assessment |
|---|---|---|
| AC-01 | Atomic no-replace store test; deterministic two-grant interleaving with one winner and the losing pre-existing request retained | **PARTIAL.** Winner/loser lease behavior is now proven, but the fixture preloads both requests rather than exercising the specified concurrent `request`+immediate-grant attempts. |
| AC-02 | Fake-sink grant routing/output plus real-CLI production sink classification for delivered, queued, and unverified | **PASS.** Grant targeting/output and the production receipt-state classifier are both exercised. |
| AC-03 | Moved-HEAD and unavailable-HEAD branches; explicit repin/ack records; unavailable-HEAD guard mutation RED→GREEN | **PASS.** |
| AC-04 | Production-shaped sticky-failure recovery/re-arm test; alert remains non-reclaiming | **PASS.** |
| AC-05 | Grant by arbitrary request id plus purpose-bearing queue rendering with no FIFO/position language | **PASS.** |
| AC-06 | `show --json` asserts `requestedAt`, `grantedAt`, and `blockedTimeMs` | **PARTIAL.** Current lease timing is proven; historical delta recovery from the machine log is not load-bearing in the committed suite. |
| AC-07 | Log-first implementation and failure tests for define/request/grant/return/reclaim; no product reference to the baton book | **PARTIAL.** `list`/`show`/`alert` log identity is mutation-vacuous, so “every verb appends one line” is not fully proven. |
| AC-08 | Focused 5-file suite: 66/66; full pij suite: 75 passed, 2 skipped / 1153 passed, 6 skipped; focused Biome: 10 files clean; `just pij-skill-check`: green | **PASS under the o-prime's stated fence ruling.** Full `harness checks` passed test, smoke, package audit, and snapshots; typecheck/lint failures were in concurrent Plan 037 broadcast surfaces, not the baton slice. |
| AC-09 | Round 1 real daemon-less lifecycle plus Round 2 real-CLI production receipt-classification integration | **PASS.** Store mutation and honest delivered/queued/unverified degradation are exercised without a daemon. |

### Round 2 conclusion

F1, F2, F3, and F5 are fixed. F4 remains a HIGH acceptance-proof defect: AC-01 still lacks its specified concurrent request→grant scenario, AC-06 does not guard historical log deltas, and AC-07's every-verb claim is directly disproven by a mutation that leaves the suite green. Approval remains blocked until those committed tests become load-bearing.

### Round 3

**Verdict: APPROVE**

The three remaining F4 acceptance-proof residues are closed:

| Residue | Verification |
|---|---|
| AC-01 concurrent request→immediate-grant contention | **FIXED.** `keeps the losing request queued when concurrent contenders request and immediately grant` uses two real `BatonService` instances. Contender A requests, then its first `claimLease` interleaves contender B's own request followed immediately by grant. B wins the atomic claim, A receives `E-HELD`, exactly one lease exists, and A's losing request remains queued (`baton.test.ts:346-390`). No request state is preloaded. |
| AC-07 exact logging identity for every appending verb | **FIXED.** `logs every appending verb with its exact identity through the service` invokes define, list, show, request, grant, return, reclaim, and alert through `BatonService`, asserting the exact emitted verb for each (`baton.test.ts:665-748`). Independently mutating production `list` to `define` made the named test RED with `expected [ 'define' ] to deeply equal [ 'list' ]` (`1 failed, 27 skipped`). |
| AC-06 historical blocked-time recovery | **FIXED.** `replays request and grant log timestamps to recover the lease blocked time` creates both entries through service request/grant calls, selects them by the service-produced request id, computes `grant.timestamp - request.timestamp`, and compares that replayed delta with both the grant result and persisted lease timing (`baton.test.ts:750-796`). |

Mutation restoration was byte-identical:

```text
before=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
after=d7ade751d242a9a951e6012584522b999df2a2732a8a4dfb59ea36cfd40dbf12
```

The three Round 3 residue tests pass together (`3 passed, 25 skipped`). All earlier findings remain settled; no closed finding was re-opened.
