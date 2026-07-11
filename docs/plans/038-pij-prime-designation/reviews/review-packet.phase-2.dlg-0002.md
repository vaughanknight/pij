# Review packet — Plan 038 Phase 2 / dlg-0002

**Reviewer role**: fresh final reviewer  
**Coder**: pij-befnoc (`gpt-5.6-sol`, xhigh)  
**Reviewer**: pij-z51c4f (`gpt-5.6-sol`, xhigh)  
**Run**: `2026-07-11T11-40-21Z-github.com-AI-Substr`  
**Delegation**: `dlg-0002`

## Mission

Review the complete Phase 2 implementation against:

- `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md` — Phase 2 and AC-01 through AC-09, AC-11, AC-12.
- `docs/plans/038-pij-prime-designation/tasks/phase-2-ship-prime-designation-end-to-end/tasks.md`.
- `docs/plans/038-pij-prime-designation/tasks/phase-2-ship-prime-designation-end-to-end/execution.log.md`.
- `docs/plans/038-pij-prime-designation/rulings.md`.
- `skills/flow-pair/references/review-rubrics.md` — all dimensions, with Dimension 0 mandatory.

This is a shared dirty tree. Review only the implementation files named in the Phase 2 task table and the Phase 2 execution log. Ignore unrelated diffs. Do not edit product files, stage, commit, restart the daemon, or perform production registry mutations.

## Contract checks

1. **Descriptor and durability**
   - `SessionDescriptor.prime?: boolean` is additive.
   - legacy absence behaves as false;
   - true and false survive reload/resume/reattach fixtures.
2. **Mutable daemon ownership**
   - latest persisted `prime:true|false` wins over stale daemon snapshots;
   - append-only `reportedAt` semantics and daemon-owned clears remain unchanged;
   - dissolved persisted truth remains authoritative.
3. **Orchestration primitive**
   - `pij orchestration prime set|unset [<id>] [--json]`;
   - same-value operation returns `changed:false` and avoids a write;
   - unknown explicit target is `E-NOID`;
   - omitted target uses exact self and surfaces `E-AMBIG`, never `"operator"`;
   - baton parsing/dispatch remains intact.
4. **List**
   - `--prime` is strict boolean grammar;
   - composes with `--here`;
   - human list has a stable prime marker;
   - JSON adds `prime:boolean` without reshaping existing fields.
5. **Real boundary**
   - scratch `PIJ_HOME` integration proves set/unset/list/errors without touching global registry.
6. **Skill/docs**
   - registry-first `/pij prime` probe retains roster/human/brief fallbacks;
   - bootstrap and handover persist designation in the ruled order;
   - skill changes are additive and `just pij-skill-check` remains green;
   - docs/domain updates match shipped behavior and do not claim ACL/election/uniqueness.
7. **Scope**
   - exact Phase 2 fence only;
   - no package/lockfile/government/flow files;
   - execution log names all changes and defers daemon restart/live proof to the orchestrator.

## Required pathscoped diff

Use the Phase 2 execution log's changed-file list to construct exact git pathspecs. Confirm it matches the plan Domain Manifest and the coder report. Do not use an unscoped `git diff`.

## Dimension 0 — mandatory empirical mutations

### Guard A: mutable daemon prime ownership

```bash
harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/daemon/loop.ts \
  's/if \(latest\[field\] !== undefined\) \{/if (false) {/' \
  'npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts'
```

Required:

- mutation matches only the mutable latest-authority guard;
- exactly the declared prime merge assertions go RED;
- restore is byte-identical;
- 37/37 loop tests return GREEN.

### Guard B: prime-only discovery filter

```bash
harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/discovery.ts \
  's/return descriptors\.filter\(\(d\) => d\.prime === true\);/return [...descriptors];/' \
  'npx vitest run .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/core/cli.test.ts'
```

Required:

- prime filter/list tests go RED under mutation;
- restore is byte-identical;
- focused discovery/list tests return GREEN.

### Guard C: exact self and idempotent write

Empirical mutation is preferred. If one clean mutation cannot isolate the behavior, name:

- the exact assertion proving an omitted target returns `E-AMBIG` and writes nothing;
- the exact assertion proving same-value set/unset returns `changed:false` and does not call `RegistryPort.write`;
- the real CLI integration assertion proving an explicit target works without resolvable self.

Reasoned evidence must cite test names and negative/state assertions, not truthiness.

## Reviewer-owned gates

Run at minimum:

```bash
npx vitest run \
  .pi/extensions/pij/core/daemon/loop.test.ts \
  .pi/extensions/pij/core/orchestration/prime.test.ts \
  .pi/extensions/pij/core/orchestration/cli.test.ts \
  .pi/extensions/pij/core/discovery.test.ts \
  .pi/extensions/pij/core/cli.test.ts \
  .pi/extensions/pij/cli.integration.test.ts \
  .pi/extensions/pij/core/session.test.ts \
  .pi/extensions/pij/core/binding.test.ts
just typecheck
just lint
just pij-skill-check
```

If Vitest version/package changes from s039 alter behavior, report it separately as an external runner shift; do not fix package manifests or absorb it into s038.

## Reviewer output

Write:

`docs/plans/038-pij-prime-designation/reviews/review.phase-2.dlg-0002.md`

Required:

- reviewer/model, reviewed paths, and exact diff boundary;
- verdict: `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`;
- findings by severity with file/line evidence;
- Dimension 0 commands and RED -> restore -> GREEN evidence;
- exact negative/state assertions for any reasoned mutation;
- gate outputs/counts and Vitest version observed;
- scope/fence verdict;
- explicit list of orchestrator-owned deferred live proofs;
- one concise summary.

Do not fix findings. Send the verdict path to `pij-118mbuv`.

## Forbidden

- `.the-flow-state.json`, any `the-flow.json`, any `the-flow.md`
- `.flow-pair/**`
- `government/**`, package manifests, lockfiles
- daemon restart, staging, commits, push, production designation, or baton operations
- all edits except the single verdict output file
