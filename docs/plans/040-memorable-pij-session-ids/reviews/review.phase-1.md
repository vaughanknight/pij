# Review - Plan 040 Phase 1

- **Reviewer**: `pij-16d2xlz`
- **Model**: `gpt-5.6-sol` (`xhigh`)
- **Input**: `review-input.patch`
- **SHA-256**: `5750000067f3f94e381f211972fb6cddd17bd067c85cf9c77d89adcbc3b956d5`
- **Initial verdict**: **FIX_REQUIRED**
- **Final verdict (round 2)**: **APPROVE**
- **Superseded verdict after live F004**: **FIX_REQUIRED**
- **Final verdict (round 3)**: **APPROVE**

## Summary

Round one found a critical allocation race, a missing true-concurrency test, and
an adopt-output contract error. The refreshed frozen patch closes those three.
The live F004 identity-theft finding then superseded round-two acceptance. The
round-three patch closes F004 by making validated `COPILOT_AGENT_SESSION_ID` the
only implicit Copilot identity, forbidding global fallback, and adding
harness-aware pending recovery. No finding remains.

## Findings

### F001 - RESOLVED CRITICAL - Same-native allocation can reuse an occupied legacy id or fail `E-NOREG`

**Dimension**: Contract, plan alignment, acceptance criteria, prompt follow  
**ACs**: AC-04, AC-05, AC-09  
**Location**:

- `.pi/extensions/pij/adapters/fs-registry.ts:310-337`
- `.pi/extensions/pij/adapters/fs-registry.ts:569-570`

`allocateIdentity()` publishes the by-pij and by-native identity records before
checking whether the candidate already has an incompatible legacy descriptor.
A second allocator for the same native tuple can observe that provisional
by-native record in the `E-AMBIG` branch and return its id without validating
that the live descriptor belongs to the requested tuple. The first allocator
then rolls the provisional paths back while the second allocator is reading
them.

An independent 16-process real-filesystem probe seeded attempt zero with an
unowned legacy descriptor:

```text
occupied=pij-related-mandrill
results=16 ok=15 uniqueIds=2
allocated=pij-related-mandrill,pij-related-marlin
legacy=pij-related-mandrill
failure=E-NOREG: durable identity record .../by-native/... disappeared
```

The occupied legacy id was returned as a successful allocation for the new
native tuple. A widened 20-process caller-path probe produced six returns of the
occupied id plus nine allocation/write failures, including disappearing
by-native/by-pij records:

```text
results=20 ok=11 firstIdReturns=6
failures=9
```

This violates the required outcome that same-native racers converge while an
occupied candidate remains untouched. It also makes atomicity dependent on
timing around unconditional rollback.

**Required fix**:

1. Do not publish a by-native tuple record for a candidate until an incompatible
   live descriptor has been ruled out under the claimed by-pij ownership.
2. Treat the by-native record as provisional until candidate validation is
   complete, or otherwise make rollback unable to remove records another
   allocator can observe as committed.
3. In the `E-AMBIG` race branch, validate the resolved live/snapshot descriptor
   against `(harness, harnessSessionId)` before returning it. Retry rather than
   returning an occupied legacy id.
4. Add actual multi-process tests for same-native allocation with attempt zero
   occupied by an unowned legacy descriptor.

### F002 - RESOLVED HIGH - The claimed concurrency test is sequential

**Dimension**: Test quality, acceptance criteria  
**AC**: AC-05  
**Location**: `.pi/extensions/pij/adapters/fs-registry.test.ts:253-265`

The test named:

```text
concurrent registry instances converge for one native tuple and diverge for different tuples
```

performs three synchronous calls one after another. It does not overlap any
filesystem claim or rollback operation. Therefore AC-05 has no load-bearing
race test, and the F001 interleaving is invisible to the suite.

**Required fix**: add a real concurrent boundary test using worker threads or
separate processes. Cover both:

1. same native tuple + same seed + free attempt zero -> one id, all callers
   succeed;
2. same native tuple + same seed + attempt zero occupied by an unowned legacy
   descriptor -> all callers converge on attempt one, the legacy descriptor is
   byte-preserved, and no provisional owner/tuple records disappear.

### F003 - RESOLVED HIGH - `adopt --id` reports a stored native binding as `null` and pending

**Dimension**: Contract, acceptance criteria  
**AC**: AC-16  
**Location**:

- `.pi/extensions/pij/cli.ts:1232-1259`
- `.pi/extensions/pij/cli.ts:1306-1321`

When `--id` names an existing descriptor with a stored
`harnessSessionId`, but discovery and `--session-id` provide no current value,
the command correctly reattaches using `requestedDescriptor.harnessSessionId`.
Its output still uses the outer `harnessSessionId` variable, which remains
`undefined`.

Independent real-CLI probe:

```text
exit=0
stdout={"id":"pij-existing-opaque","paneId":"%7","harness":"claude",
        "harnessSessionId":null,"transcriptPath":null,"lifecycle":"bound"}

persisted={"harness":"claude","harnessSessionId":"stored-native",
           "lifecycle":"bound","prime":true,"paneId":"%7"}
```

The JSON result contradicts the persisted descriptor. The human branch likewise
prints the pending/phone-home message because it tests the same outer variable.

**Required fix**: render binding state from the final `descriptor`
(`descriptor.harnessSessionId` and `descriptor.lifecycle`), or establish one
effective native-session value and use it consistently. Add real-CLI coverage
for `adopt --id <existing>` without `--session-id` or discoverable artifacts.

## Ten-dimension rubric

| Dimension | Result | Evidence |
|---|---|---|
| 0 - Test quality | **FAIL** | Collision-guard mutation goes RED, but no actual concurrent test covers F001; AC-05 is not mutation-resistant at the race boundary. |
| 1 - Scope | PASS | Frozen patch changes 19 plan-manifest paths only. No government, flight-plan, PoC-only, or unrelated product path is present. |
| 2 - Contract | **FAIL** | F001 breaks atomic allocation/convergence; F003 returns a false public binding value. |
| 3 - Plan alignment | **FAIL** | The implementation does not meet the planned same-native race outcome when attempt zero is a legacy descriptor. |
| 4 - Acceptance criteria | **FAIL** | AC-05 is behaviorally false under the reproduced interleaving; AC-16 output is inconsistent on id-only reattachment. |
| 5 - Tests | N/A | CODE delegation; Dimension 0 is authoritative. |
| 6 - Domain currency | PASS | Both domain records and `docs/how/pij.md` cover the new primary-id and reservation contracts. |
| 7 - Progress log | PASS | `execution.log.md` records task outcomes, package evidence, mutation claims, gates, and harness friction. |
| 8 - Regression | PASS | Frozen-patch typecheck, path-scoped Biome, 235 identity-focused tests, and 148 flow-pair tests pass. Independent session boot also passed full typecheck/test. |
| 9 - Prompt follow | **FAIL** | Mandatory atomic claim/concurrent convergence requirement is not met; the packet explicitly required it. |
| 10 - Learning | PASS | The log records non-obvious package, reservation, crash-retention, and harness decisions. |

## Mandatory focus audit

| Focus | Result | Evidence |
|---|---|---|
| Primary id across Pi/spawn/agent/adopt/registry/fs/env/wire/telemetry/Telegram | PASS with F001/F003 blockers | All minting entry paths use the memorable allocator/reservation; generic string-based downstream surfaces accept multi-hyphen ids. |
| Existing opaque ids never migrate | PASS in ordinary paths; **unsafe under F001 race** | Legacy/exact lookup precedes allocation and prime-preserving fixtures pass. F001 can still return an occupied legacy id during a same-native race. |
| No candidate repeat before exhaustion | PASS | 426,710-entry set test and final-attempt check pass. |
| Atomic claim and retry | **FAIL** | F001 real multi-process repro. |
| Spawner death does not reclaim a child-held reservation | PASS | No PID-death reclaim path exists; known failures use owner-token release and crash reservations remain recoverable. |
| `adopt --id` reattachment-only | PASS for admission; **FAIL for output** | Unknown id is `E-NOID`; existing descriptor/reservation required. F003 reports the stored binding incorrectly. |
| s038/FX001/FX002/baton/broadcast/prime regressions | PASS | `prime` survives registry/reattach tests; targeted and flow-pair suites pass; no baton/broadcast product file is changed. |
| Package delta | PASS | Exactly `unique-names-generator: "4.7.1"` plus its npm lock entry; no transitive dependency or install script is recorded. |
| PoC-only surfaces absent | PASS | No `pij-name-poc` recipe, script, source, or test exists in the frozen patch/tree. |

## Dimension 0 evidence

The required reviewer-owned mutation changed the collision retry guard:

```bash
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/adapters/fs-registry.ts \
  's/if \(claimed\.code !== "E-AMBIG"\) return claimed;/if (true) return claimed;/' \
  'npx vitest run .pi/extensions/pij/adapters/fs-registry.test.ts'
```

Result:

```text
RED under mutation: 2 failed tests
GREEN after restore
byte-identical restore:
65fc2ccd339e2323c32c50d3156f4f045e353266eb63b65afb4e4fc2aae216d8
```

This proves the ordinary retry branch is guarded. It does not rescue Dimension
0 because the suite's "concurrent" case is sequential and did not detect F001.

## Reviewer-owned gates and probes

All patch checks below were run by extracting `HEAD` to a clean temporary tree,
applying only the frozen patch, and symlinking the existing dependency tree. The
live worktree was intentionally ignored after the coordinator's INC-002 notice.

| Check | Result |
|---|---|
| Frozen patch SHA-256 | exact match |
| `git apply --check` in clean extracted tree | PASS |
| Biome on all changed code/config paths | PASS, 15 files |
| `just typecheck` in clean extracted tree | PASS |
| Eight identity-focused test files | PASS, 235/235 |
| `just flow-pair-test` | PASS, 148/148 |
| Collision retry mutation | RED (2 failures) -> byte-identical restore -> GREEN |
| Free-candidate multi-process stress | 16 same-native callers converged; 16 different-native callers received 16 ids |
| Occupied-legacy multi-process stress | **FAIL**, F001 reproduced |
| `adopt --id` without a discoverable/session-id native value | **FAIL**, F003 reproduced |

Whole-worktree `just lint` was not used as patch evidence because a concurrent,
out-of-patch formatting change in `cli.integration.test.ts` made that shared-tree
gate red. The frozen patch passes in isolation.

## Round-one required handback - completed in round 2

The following requirements produced `review-input-fixed.patch` and are closed by
the evidence below:

1. Fix F001 before any acceptance or live daemon restart. The new test must
   deterministically overlap claims rather than repeat the current sequential
   calls.
2. Fix F003 and add an id-only reattachment integration case that asserts both
   JSON and human output from the final descriptor.
3. Re-run the collision mutation, the new concurrency test repeatedly, the
   focused identity suite, flow-pair regressions, and the full harness gate from
   the frozen/fixed patch boundary.

## Round 2 - F001-F003 closure

- **Input**: `review-input-fixed.patch`
- **SHA-256**: `71d8482aaf1a558116646d463221066d0dc4f0f527b9cccfb719ddfffbd24c46`
- **Verdict**: **APPROVE**

### Finding dispositions

| Finding | Disposition | Evidence |
|---|---|---|
| F001 | RESOLVED | `allocateCandidate()` claims by-pij ownership, validates the live descriptor, and only then publishes the by-native tuple. A racer observes either the compatible committed tuple or an occupied candidate; it no longer consumes a provisional tuple that can be rolled back underneath it. `validateResolvedIdentity()` rejects incompatible descriptor tuples before reuse. |
| F002 | RESOLVED | Two synchronized real-process tests launch six `tsx` children behind a filesystem barrier. Four free-candidate rounds converge on attempt zero; four occupied-legacy rounds converge on attempt one, preserve the legacy bytes, and retain usable winner records. |
| F003 | RESOLVED | JSON and human output use `descriptor.harnessSessionId`. A real-CLI test covers `adopt --id <existing>` with no explicit or discoverable native artifact and asserts the stored native id, `bound`, and absence of the pending branch. |

### F001 implementation review

The refreshed owner-record sequence removes the round-one interleaving:

1. `allocateCandidate()` atomically claims the by-pij owner record.
2. It reads and classifies the live descriptor while that owner claim excludes
   other native tuples.
3. An incompatible descriptor returns `occupied` before any by-native tuple is
   published.
4. Only a compatible/free candidate reaches `claimIdentityRecord()` for the
   native tuple.
5. Same-native racers may share the owner record and converge on the same tuple;
   an owner-path disappearance is treated as an occupied/retry state rather than
   escaping as `E-NOREG`.
6. A tuple already committed to another id is validated against the exact
   `(harness, harnessSessionId)` descriptor before reuse.

This preserves the unowned legacy descriptor and removes the provisional tuple
that caused the original occupied-id return.

### Reviewer-owned race stress

The original failing shape was rerun against the refreshed patch with a 4 MB
legacy descriptor to widen the collision window. Each round released 20
processes simultaneously against the same native tuple:

```text
round=1 results=20 ok=20 unique=1 reusedOccupied=false failures=0
round=2 results=20 ok=20 unique=1 reusedOccupied=false failures=0
round=3 results=20 ok=20 unique=1 reusedOccupied=false failures=0
```

All 60 callers converged on the next candidate. No caller returned the occupied
legacy id or `E-NOREG`.

### Round-two Dimension 0 mutation

The reviewer mutated the fixed descriptor-compatibility guard:

```bash
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/adapters/fs-registry.ts \
  's/if \(!exact && !legacy\) \{/if (false) {/' \
  './node_modules/.bin/vitest run .pi/extensions/pij/adapters/fs-registry.test.ts'
```

Result:

```text
RED under mutation: 1 failed test
GREEN after restore
byte-identical restore:
ee63ec230e8d527c6bbd0b2f8da3ff3e67229544abc5b280d417129371b96b9c
```

The synchronized occupied-legacy race test is therefore load-bearing against
the fixed guard.

### Round-two gates

All checks used a clean extracted `HEAD` with only the refreshed frozen patch
applied.

| Check | Result |
|---|---|
| Frozen patch SHA-256 | exact match |
| `git apply --check` | PASS |
| Biome on all changed code/config paths | PASS, 15 files |
| `just typecheck` | PASS |
| Registry + real CLI integration | PASS, 58/58 |
| Synchronized registry races | PASS, eight rounds / six children per round |
| `just flow-pair-test` | PASS, 148/148 |
| Reviewer F001 mutation | RED -> byte-identical restore -> GREEN |
| Reviewer widened race stress | PASS, 60/60 callers across three rounds |

The refreshed CLI integration baseline retains the committed prime timeout and
the broadcast preflight regression while adding the F003 boundary case.

### Final rubric

| Dimension | Final result |
|---|---|
| 0 - Test quality | PASS |
| 1 - Scope | PASS |
| 2 - Contract | PASS |
| 3 - Plan alignment | PASS |
| 4 - Acceptance criteria | PASS |
| 5 - Tests | N/A - governed by Dimension 0 |
| 6 - Domain currency | PASS |
| 7 - Progress log | PASS |
| 8 - Regression | PASS |
| 9 - Prompt follow | PASS |
| 10 - Learning | PASS |

**Round-two disposition**: **APPROVE**. The refreshed frozen patch closes
F001-F003 without introducing a static-review finding.

## Live finding F004 - acceptance superseded

**Current disposition**: **FIX_REQUIRED**  
**Detailed assessment**:
`docs/plans/040-memorable-pij-session-ids/reviews/finding-adopt-new-session.md`

The live `/new` proof invalidates final acceptance. `copilotSessionStateScan()`
chooses the newest UUID in the machine-global session-state directory with no
current-pane/session correlation. `resolveAdoptSessionIdForHarness()` promotes
that guess to an authoritative native id, after which durable identity reuse
reattaches the old pij id to the fresh pane.

Independent severity is **CRITICAL** because the old primary identity's live
attachment is rewritten to an unrelated agent, allowing messages, commands, and
telemetry/history joins for the old peer to target the new session.

The reviewer process confirms that Copilot exposes a canonical
`COPILOT_AGENT_SESSION_ID`, while pij contains no reader for it and `phonehome`
remains Claude-only. The fix must prove that this signal tracks `/new` before
using it; global newest-by-mtime must be removed as an authoritative fallback.
Without a deterministic current-session signal, Copilot adopt must remain
pending or fail actionably rather than reuse any visible durable tuple.

## Round 3 - F001-F004 final acceptance

- **Input**: `review-input-round3.patch`
- **SHA-256**: `5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`
- **Verdict**: **APPROVE**

### Finding dispositions

| Finding | Final disposition | Round-three evidence |
|---|---|---|
| F001 | RESOLVED | The synchronized free and occupied-legacy allocation races remain unchanged and pass. Candidate descriptor validation still precedes native tuple publication. |
| F002 | RESOLVED | Six-process barrier tests run four rounds for each race state and remain load-bearing. |
| F003 | RESOLVED | Final-descriptor JSON/human adopt output coverage remains present in the 29-test real CLI suite. |
| F004 | RESOLVED | Copilot adoption uses only a validated current env UUID, never global newest/argv/inuse state; no-signal adoption stays pending and Copilot phonehome binds through the harness-specific env. |

### F004 implementation review

`resolveCopilotCurrentSession()` now has a fail-closed contract:

1. Missing `COPILOT_AGENT_SESSION_ID` returns `missing-env`.
2. A non-UUID value returns `invalid-env`.
3. A UUID without a matching session-state directory returns `missing-state`.
4. A matching current UUID is normalized and returned regardless of other
   sessions' mtimes.
5. No branch sorts or chooses a global directory.

`runAdopt()` promotes only the successful current-session result. Otherwise it
allocates a fresh pending memorable id and surfaces the resolver message as
`bindingIssue`; an explicit `--session-id` still overrides implicit resolution.

`resolvePhonehomeSessionId()` is harness-specific: Copilot reads only
`COPILOT_AGENT_SESSION_ID`, Claude reads only `CLAUDE_CODE_SESSION_ID`, and
malformed Copilot UUIDs do not bind.

### Round-three Dimension 0 mutation

The reviewer reintroduced the forbidden global fallback:

```bash
bash harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/harness/copilot.ts \
  's/const raw = envSessionId\?\.trim\(\);/const raw = envSessionId?.trim() || listState(copilotStateRoot(home))[0]?.name;/' \
  './node_modules/.bin/vitest run .pi/extensions/pij/core/harness/copilot.test.ts .pi/extensions/pij/cli.integration.test.ts'
```

Result:

```text
RED under mutation: 2 failed tests
GREEN after restore
byte-identical restore:
a833468e1a790c1d3ff132b6da1905839c10129d7a1fe88163c213fda352da0e
```

The env-only/no-global-fallback behavior is load-bearing.

### Reviewer-owned delayed-directory boundary proof

The reviewer reproduced the live timing shape against the frozen patch:

1. Seeded old tuple `old-native -> pij-old-copilot-reviewer` and its descriptor.
2. Exposed only the old global session-state directory.
3. Set a different valid current `COPILOT_AGENT_SESSION_ID`, while its directory
   was still absent.
4. Adopt returned a new memorable **pending** id with a `missing-state` issue.
5. The old descriptor checksum and durable tuple remained unchanged.
6. After the current directory appeared, Copilot phonehome bound the pending id.

Observed result:

```json
{
  "pendingId": "pij-peaceful-tapir",
  "oldTuple": "pij-old-copilot-reviewer",
  "currentTuple": "pij-peaceful-tapir",
  "oldBytesPreserved": true
}
```

This directly proves the old descriptor, pane data, bytes, and durable tuple are
not reused while the current `/new` state directory appears late.

### Round-three gates

All checks ran in a clean extracted `HEAD` with only the frozen round-three patch
applied.

| Check | Result |
|---|---|
| Frozen patch SHA-256 | exact match |
| `git apply --check` | PASS |
| Biome on all changed code/config paths | PASS with one unrelated existing `core/cli.ts:577` warning |
| `just typecheck` | PASS |
| F001 registry + F004 Copilot/binding/core CLI/real CLI suites | PASS, 148/148 |
| F001 synchronized allocation races | PASS, eight rounds / six child processes per round |
| `just flow-pair-test` | PASS, 148/148 |
| F004 global-fallback mutation | RED (2 failures) -> byte-identical restore -> GREEN |
| Delayed current-directory tuple/byte proof | PASS |

The formatted prime timeout, broadcast preflight regression, F001-F003 fixes,
exact dependency pin, and PoC-surface absence remain intact.

### Final rubric

| Dimension | Final result |
|---|---|
| 0 - Test quality | PASS |
| 1 - Scope | PASS |
| 2 - Contract | PASS |
| 3 - Plan alignment | PASS |
| 4 - Acceptance criteria | PASS |
| 5 - Tests | N/A - governed by Dimension 0 |
| 6 - Domain currency | PASS |
| 7 - Progress log | PASS |
| 8 - Regression | PASS |
| 9 - Prompt follow | PASS |
| 10 - Learning | PASS |

**Final disposition**: **APPROVE**. F001-F004 are closed and the live Copilot
`/new` identity-theft interleaving is protected without a new finding.
