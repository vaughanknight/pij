# Phase 2 execution log — Ship prime designation end-to-end

**Delegation**: `dlg-0002` · **Worker**: `pij-befnoc` · **Date**: 2026-07-11  
**Outcome**: implementation complete; daemon restart and production-live proof deferred to the orchestrator by packet contract.  
**Expected-red at close**: none — green.

## Task outcomes

| Task | Outcome | Evidence |
|---|---|---|
| T001 | Added additive `SessionDescriptor.prime?: boolean`; added durability fixtures and RED daemon merge coverage for persisted false over stale true and persisted true over stale false/absence. | Initial focused run: 3 intended failures, 107 passes. Session and binding durability tests were green. |
| T002 | Split external merge ownership into append-only `reportedAt` and mutable latest-disk-authoritative `prime`. | The 3 T001 failures turned green; daemon-owned field clears and existing merge tests remained green. |
| T003 | Added RED coverage for `PrimeService`, orchestration grammar/dispatch/errors, exact-self targeting, list filtering/rendering, and real scratch-registry CLI behavior. | Product RED run: 2 suites failed to load because `prime.ts` did not yet exist, plus 5 behavioral failures for absent filter/parser/list/integration behavior; 69 tests passed. |
| T004 | Added pure `PrimeService`, prime parser/dispatch/rendering/error mapping, and production wiring with exact self resolution separate from baton actor fallback. | Prime/orchestration/baton focused suite green; explicit ids bypass self resolution, omitted ids surface `E-AMBIG`, unknown ids surface `E-NOID`. |
| T005 | Added `pij list --prime`, composition with `--here`, ordinary-list `P` visibility, and JSON `prime:boolean`. | Core CLI and discovery suites green; legacy absence and explicit false both project as `false`. |
| T006 | Added scratch `PIJ_HOME` real-CLI set/list/unset/error coverage and durable native-identity snapshot/reattachment proof. | Integration file: 18/18 tests green. No global registry was used. |
| T007 | Updated registry-first `/pij prime` triage, bootstrap self-designation, and handover incoming-set/outgoing-unset ordering. | `just pij-skill-check` green. Bootstrap is 95 lines against an advisory 90-line budget; disclosed baseline was already 91. |
| T008 | Updated operator and existing domain documentation; no new domain created. | `docs/how/pij.md` stale “no daemon” opening corrected; `docs/how/pij-prime.md` received an additive Registry designation section after ownership clarification. |
| T009 | Ran mutation proof, focused/full suites, flow-pair regression, skill gate, typecheck, lint, and full harness sensor inventory. | Mutation produced exactly 3 declared RED tests, restored byte-identically, then 37/37 green. `harness checks` passed all six sensors. |

## Decisions implemented

1. `prime` is optional and additive for migration safety; unset persists explicit `false`.
2. Mutable external fields and append-only external fields have separate daemon merge semantics.
3. Prime state lives on `SessionDescriptor`; there is no sidecar or uniqueness lock.
4. Omitted prime targets use exact env/pane/lone-local self resolution; baton actor fallback remains baton-only.
5. Set/unset are idempotent and return `{ id, prime, changed }`.
6. `--prime` is a `list` filter only and composes with `--here`; `sessions --prime` remains invalid.
7. Ordinary list rows use a compact `P` marker; JSON always emits a boolean.
8. Skill triage checks the current id against `pij list --prime --here --json` before government/human fallbacks.
9. Bootstrap persists the proved seat before government creation. Handover sets the incoming seat before writer mutation and unsets the outgoing live seat after its final relay.

## Expected-red windows

### Descriptor merge RED

Command:

```bash
npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts \
  .pi/extensions/pij/core/session.test.ts \
  .pi/extensions/pij/core/binding.test.ts --reporter=dot
```

Expected and observed RED set — exactly 3:

1. `lets the latest persisted prime=false beat a stale daemon prime=true snapshot`
2. `lets the latest persisted prime=true beat a stale daemon prime=false snapshot`
3. `lets the latest persisted prime=true beat a stale daemon prime=undefined snapshot`

Result: 3 failed, 107 passed. After T002: 110/110 passed.

### Prime service/list/CLI RED

Command targeted:

```bash
npx vitest run \
  .pi/extensions/pij/core/orchestration/prime.test.ts \
  .pi/extensions/pij/core/orchestration/cli.test.ts \
  .pi/extensions/pij/core/discovery.test.ts \
  .pi/extensions/pij/core/cli.test.ts \
  .pi/extensions/pij/cli.integration.test.ts --reporter=dot
```

Observed before implementation:

- `prime.test.ts` and orchestration CLI tests could not load the intentionally absent `prime.ts`.
- 5 behavioral assertions failed for absent `filterPrime`, list grammar/projection/filtering, and real orchestration prime dispatch.
- 69 tests passed.

After implementation and one test-helper alias correction, the focused prime units were 123/123 green and the real integration file was 18/18 green.

### Mutation proof RED

Temporary mutation: changed the mutable merge predicate from
`latest[field] !== undefined` to `latest[field] === undefined`.

Expected and observed: the same exact 3 descriptor merge tests above failed; the other 34 loop tests passed.

Restore proof:

```text
before sha256: a522bc1402f82847060a7b96e0465101a37798bcad6e4bc09c9ce749c2af55fc
after  sha256: a522bc1402f82847060a7b96e0465101a37798bcad6e4bc09c9ce749c2af55fc
```

Post-restore: 37/37 loop tests green.

## Gate evidence

| Gate | Result |
|---|---|
| Complete phase-focused suite | 251/251 passed across 9 test files |
| Full `just test` | 1732 passed, 10 skipped, 1742 total; 123 files passed, 4 skipped |
| `just flow-pair-test` | 148/148 passed across 16 files |
| `just typecheck` | passed |
| `just lint` | passed; repository warnings remained non-blocking |
| `just pij-skill-check` | passed; bootstrap advisory 95/90, baseline 91 |
| `harness checks` | passed: typecheck, lint, test, smoke, pkg-audit, snapshots |
| `git diff --check` on the phase fence | passed |

All recorded test runs used `vitest/2.1.9`, Darwin arm64, Node `v24.7.0`. After the gates, stream s039 modified `package.json` and `package-lock.json` for a planned Vitest `4.1.10` upgrade while the installed runner still reported `2.1.9`. No runner-behavior shift was observed or absorbed into this phase. Post-upgrade attribution/rerun belongs to s039 and the orchestrator.

## Changed paths

### Product and tests

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/core/orchestration/prime.ts`
- `.pi/extensions/pij/core/orchestration/prime.test.ts`
- `.pi/extensions/pij/core/orchestration/cli.ts`
- `.pi/extensions/pij/core/orchestration/cli.test.ts`
- `.pi/extensions/pij/core/discovery.ts`
- `.pi/extensions/pij/core/discovery.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`

### Skill payload

- `skills/pij/references/routes/prime.md`
- `skills/pij/references/prime/rituals/bootstrap.md`
- `skills/pij/references/prime/templates/seat-handover.md`

### Operator and domain docs

- `docs/how/pij.md`
- `docs/how/pij-prime.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-orchestration/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/domains/pij-skill/domain.md`
- `docs/domains/registry.md`
- `docs/domains/domain-map.md`

### Execution record

- `docs/plans/038-pij-prime-designation/tasks/phase-2-ship-prime-designation-end-to-end/execution.log.md`

## Review fix — dlg-0003

**Review finding**: valued boolean forms such as `pij list --prime=false`
were accepted as string-valued flags and silently behaved as if the filter were
disabled. Top-level help also omitted `--prime` from the list syntax.

**Expected-red window**: exactly 5 tests, all observed on Vitest 4.1.10:

1. core parse rejects `list --prime=false`;
2. core parse rejects `list --prime=true`;
3. core parse rejects `list --here=false`;
4. core parse rejects `list --json=true`;
5. real CLI rejects `list --prime=false --json` instead of returning unfiltered rows.

RED result: 5 failed, 54 passed across the two focused files.

**Fix**:

- `parseArgs` now rejects `--<boolean>=<value>` before lexing, using the existing
  boolean flag registry. Optional-valued non-boolean forms such as `--wait=5000`
  retain their existing parser path.
- Top-level help now advertises
  `pij list [--here] [--prime] [--json]`.
- Real CLI coverage asserts the help row and verifies valued `--prime` returns
  exit 64 with `E-ARG` and no session JSON.

GREEN result:

- focused core + real CLI: 60/60 passed on Vitest 4.1.10;
- `just typecheck`: passed;
- `just lint`: passed with the repository baseline 9 warnings and 1 info;
- `just flow-pair-test`: 148/148 passed;
- expected-red at close: none — green.

**Vitest attribution**: the first post-fix integration rerun occurred while
s039's dependency install was repopulating `node_modules/.bin`; all 19 CLI
subprocess tests exited 1 with empty output. After the tree was quiescent
(`tsx@4.23.0`, `vitest@4.1.10`, no install process), the identical focused
command passed 59/59. No product workaround or dependency-file change was made
for the transient install window.

## Deferred orchestrator-owned proof

The worker did not restart the machine-wide daemon, mutate the production registry, stage, commit, or edit government/flow-state files.

## Orchestrator verification

### Final review and fix

- Final reviewer `pij-z51c4f` (`gpt-5.6-sol`, xhigh) returned `FIX_REQUIRED` for valued boolean forms and missing top-level help.
- Narrow `dlg-0003` added five RED-first tests, generic boolean-value rejection, real CLI exit-64 coverage, and the help row.
- Reviewer appended `APPROVE`; orchestrator reran the 60-test parser/CLI suite, reproduced exit `64` with `E-ARG` and no JSON, and matched the exact help text.

### Production-live proof

- Acquired daemon-restart lease `lease-1f1b9563-3cfe-43fe-a087-2365689e388e`.
- Restarted the shared daemon onto current source.
- Original `pij-118mbuv` descriptor state: no `prime` property.
- `pij orchestration prime set --json` returned `{id:"pij-118mbuv",prime:true,changed:true}`.
- `pij list --prime --here --json` returned the current session with `prime:true`.
- `pij orchestration prime unset --json` returned `prime:false`; after a 2-second daemon tick the prime-only list excluded the session.
- Cleanup restored the descriptor to no `prime` property through `FsRegistry`, verified exact.
- First cleanup eval used a `.js` source import and failed before mutation; retry with the `.ts` adapter path succeeded. No residue remained.
- Daemon baton returned with evidence; `just typecheck` was green at return.

### Post-migration done gate

`harness checks` on the quiescent Vitest 4.1.10/Biome tree passed all six sensors:

- typecheck
- lint
- test
- smoke
- package audit
- snapshots

Expected-red at close: none — green. Staging, commit, and push remain orchestrator-owned.
