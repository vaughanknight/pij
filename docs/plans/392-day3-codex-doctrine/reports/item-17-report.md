# Item 17 report — bind-guard advisories (one PR)

**Candidate**: `269ef3e5142275522b9b30c4e2354e0b04de55c1` · **Base**: origin/main `ed20a68b`
**Verdict**: APPROVE (`../reviews/item-17-review.md`, reviewer `pij-wilful-morton`, cold) — none blocking.
**Files**: `.pi/extensions/pij/core/daemon/loop.ts` (+43), `loop.test.ts` (+70), `index-state.test.ts` (+127). No schema change.
**Gates**: daemon 460/460 (re-run by orchestrator); typecheck `tsc --noEmit` EXIT 0 (GREEN — the coder-report's "red" was wrong); biome on the 3 fence files clean; biome repo-wide diagnostic list IDENTICAL at candidate vs parent (none in fence). `gatesClean:false` in the coder card = pre-existing/environmental only: `harness/scripts/release-age-policy.test.ts` fails "spawnSync pwsh ENOENT" (pwsh absent on host) IDENTICALLY at parent — outside the fence.

## What landed (order ADV-2 → ADV-4 → ADV-3 → ADV-1)
- **ADV-2** (only behaviour change): `driveSession` splits refusal causes — `foreign-session-id` + `malformed-planned-copilot-id` → `reportBindRefusal` (one-shot per `(seat×cause)` via `drive.bindRefusalCauses: Set<string>`, notifies `descriptor.spawnedBy`); transient `probe-unavailable`/`identity-indeterminate`/other → QUIET `waiting` (retry). The BIND SET is provably unchanged (reviewer enumerated all 6 `resolveAgentLiveness` causes + no-probe: exactly one binds `session-id-match`, exactly one notifies `foreign-session-id`).
- **ADV-4**: sweep allowlist separator-normalized (win32-safe).
- **ADV-3**: sweep catches reversed operands + destructuring, skips comments, line-anchored allowlist.
- **ADV-1**: copilot `!isCopilotSessionId(planned)` clause pinned — **MUT-C proved deleting it BINDS a malformed non-UUID id** (not merely stops logging). M5 was closed in the dangerous direction.

## Mutation evidence (all run ON DISK by the cold reviewer, sha-verified RED→restore→GREEN; final re-run exit 0 / 103 passed)
| MUT | mutated-file sha256 (at RED) | actual RED line | assertion |
|-----|------------------------------|-----------------|-----------|
| A (refusal emission) | 18eeca14…d38d75 | loop.test.ts:421 & :484 | length 1 got 0 / false→true |
| B (dedupe) | 414262dd…70f5f5 | loop.test.ts:421 | length 1 got 2 |
| C (copilot clause) | 01b1edeb…1d4a301 | loop.test.ts:480 | 'bound' → 'waiting' (binds malformed id!) |
| D (win32 endsWith) | 49969311…7aad1844 | index-state.test.ts:207 | [Array(1)] deeply equal [] |
| E (single operand order) | e4cbb7fe…a0dc05f | index-state.test.ts (pristine 226) | length 1 got 0 (2 tests) |
| F (reviewer extra: widen notify) | 56616aed…4d0bbba | loop.test.ts:459 both cases | transient-quiet genuinely pinned |
| G (reviewer extra: neuter stripComments) | 69ac427e…b4ccb1 | (pristine 245) | comments-ignored non-vacuous |

NOTE (orchestrator process miss, ledgered): the review packet relayed the coder's CLAIMED lines (427/486/204) unverified; the real assertion lines are 421/480/207. Pins were real; line numbers were wrong. Fix carried into the ledger — a packet either verifies claimed lines against the file or omits them.

## Advisories (none blocking — see review for full text)
- **ADV-A (low)**: `bindRefusalCauses` is never cleared, incl. on successful bind. Reviewer's un-anticipated direction (ii): a lingering previous agent in the pane subtree satisfies a liveness rung while the new agent starts → the spawner gets a refusal notice for a seat that binds next tick, never retracted. One-line fold: clear the cause in the successful-bind branch next to `drive.settled = true`.
- **ADV-B (low)**: notify covers 1 of 3 permanently-non-binding causes; `no-harness-process` + `harness-process-present` still refuse forever silently, and the planned path has NO timeout (never reaches the bind-timeout fail). "Never silent" is ~1/3 delivered.
- **ADV-C (low)**: sweep still line-scoped — multi-line arrows, aliased destructures (`const {paneId: pid} = d`), line-scoped `undefined` exclusion still bypass. Narrowed, not closed.
- **INFO**: the tightened allowlist is a string-pin on code in the SAFE direction (drift → loud false positive, never silent pass). Not the E6 class (that's item 18).

## Recommendation
Ship item 17 as-is (APPROVE, none blocking; MUT-C — the dangerous case — closed). ADV-A/B/C are the same "advisory tail" that item 17 itself was for item 10b → propose as a follow-up item (provisional item 21), o-prime to rule fold-vs-defer. ADV-A is a one-line safe fold if the o-prime wants it in this PR.

## Limits not cleared by the review (weigh, do not assume clean)
`just smoke` NOT run (deliberate — tmux live on shared host with pij-prime/peri-prime); harness-checks composites not run (sensors run individually); no live daemon (all refusals from `driveSession` called directly in vitest); node_modules symlinked, not clean `npm ci`. Branch moved 269ef3e→cc5f545 during the pass (my item-20 ruling commit) — fence diff EMPTY, verdict applies to head.
