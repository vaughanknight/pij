# validate-v2 delta verdict - NEEDS ATTENTION

**Verdict**: **NEEDS ATTENTION** - plan v1.4.1, sha256 `89deeb77031d25e19dd5a2236ef1a88b5a53c588912999e85cdd404876602b4b`, closes the prior F2, F4, and F5 findings and closes F3's duplicate-order/offline resolver defect, but Phase 1 still has one high-confidence production-composition gap: its tests can all pass while either CLI spawn path keeps emitting `--context long_context` for `gemini-3.6-flash`.

## Validation contract

- **Purpose / outcome**: delta-check the repairs to prior verdict F2-F5 and prove Phase 1 is safe to dispatch first.
- **Promise**: the plan must pin the previously missed runtime seams and give the Phase 1 implementer a test-first path that proves the final Copilot argv at every production entry point.
- **Proof target**: Implementation plus Integration readiness.
- **Proof required**: exact plan AC/task coverage, current source call-site resolution on baseline `2953d75`, and executable tests at the composition boundary where registry capability becomes spawn argv.
- **Upstream**: `reports/validate-v2-plan-01.md`, whose F2-F5 findings define this delta.
- **Consumers**: `pij spawn`, `pij agent spawn`, the production `Daemon` wrapper, sqlite/dual queue retirement, and parked deliveries.
- **Constraints**: read-only source review; no live daemon; R-5's lifecycle premise was not re-proved.

## Revision proof

- Exact target: plan v1.4.1, sha256 `89deeb77031d25e19dd5a2236ef1a88b5a53c588912999e85cdd404876602b4b`.
- Source baseline requested by the packet: `2953d7599b3b8a498295f9e07b766a4fff49edc9`.
- The worktree currently points at `d2dbab02720496bb0a19f7ad1ba09d2c932e87c3`; `git diff 2953d75..d2dbab0` contains no `.pi/extensions/pij/**/*.ts` changes, so the inspected production seams are byte-identical to the requested baseline.
- Targeted baseline proof: 325 tests passed, 1 skipped across `core/spawn.test.ts`, `core/models/registry.test.ts`, `core/models/validate.test.ts`, and `cli.integration.test.ts`.

## Prior-finding disposition

| Prior finding | Delta disposition | Pinning evidence in v1.4.1 |
|---|---|---|
| F2 - production `Daemon` wrapper drops `opts` | **CLOSED** | AC-08b; test task 3.2b; implementation task 3.3; `daemon.ts` and `daemon.test.ts` are both in the Domain Manifest. The real-`Daemon` composition test records the fifth argument, so a silently assignable four-argument wrapper cannot pass. |
| F3 - deny-set capability lands on the losing duplicate registry entry | **CORE DEFECT CLOSED; PRODUCTION PROOF OPEN** | AC-02 and tasks 1.2/1.3 pin raw `github-copilot` first, remapped `copilot` second, offline snapshot, empty registry, resolver-level deny-set lookup, and post-merge annotation of both providers. The remaining composition defect is below. |
| F4 - dual backend is not pinned to `sqliteOf` | **CLOSED** | AC-04/AC-05 and tasks 2.7/2.8 explicitly use `sqliteOf(channel)` for dual, cover CLI and daemon paths, and define the advisory fs read-marker mirror. The cited seam exists at `adapters/channel-factory.ts:99-103`. |
| F5 - `parked` has no retirement semantics | **CLOSED** | AC-03/AC-05 classify `parked` as open-but-stuck, non-terminal, operator-retireable, and sweep-retireable; tasks 2.1, 2.3, 2.5, and 2.8 pin state transitions and distinct summary counts. |

R-5 is now recorded as ruled `(a)`, G1 is `PASS`, and the plan is `READY`; this delta did not re-prove the underlying close/revive lifecycle facts.

## Finding

### HIGH - Phase 1's production wiring is neither fully specified nor composition-tested

**Location**: AC-02 and task 1.5; `.pi/extensions/pij/cli.ts:2354,2606,3939-3995,4080,4162`; `.pi/extensions/pij/cli.integration.test.ts:144,1799-1816`.

The peer-spawn site is straightforward: `runSpawn` loads `known` at `cli.ts:2354` and calls `buildControlSpawnCommand` at `:2606` in the same scope. The agent-spawn site is not. Its builder call at `:3995` lives inside `spawnAgentPane(plan, cwd)`, whose parameters carry no registry or resolved capability. The "already-loaded" models are in `runAgentSpawn` at `:4080`, which calls `spawnAgentPane` at `:4162`; they are not reachable at `:3995`. Task 1.5 therefore cannot be implemented exactly as written without an unlisted signature/plumbing change or a second impure `loadModels()` call.

The test plan also stops below the production boundary. Task 1.1 proves the builder, and task 1.2 proves the resolver, but task 1.5's success criterion is only "unit on resolver + grep both sites". AC-02's coverage row names only `registry.test.ts` and `validate.test.ts`. Those tests remain green if either CLI site forgets to pass `longContext:false`, which is the same composition-defect class that AC-08b correctly addresses for the `Daemon` wrapper.

**Impact**: Phase 1 can ship green while `pij agent spawn --model gemini-3.6-flash`, or both public spawn paths, still emit the rejected flag. That leaves G-A partially or wholly false.

**Smallest fix**:

1. Rewrite task 1.5 to resolve the tri-state in `runAgentSpawn`, add `longContext?: boolean` to the `spawnAgentPane` plan parameter, pass it at `:4162`, and forward it to the builder at `:3995`.
2. Add a RED composition-test task using the existing fake-tmux integration harness: for both `pij spawn` and `pij agent spawn`, assert `gemini-3.6-flash` final tmux argv omits `long_context`, while `gpt-5.6-sol` retains it.
3. Add `cli.integration.test.ts` to AC-02's verification row and replace "grep both sites" with the executable composition test.

No other Copilot production builder site is missing: `core/focus.ts:256-257` rejects Copilot before its `buildControlSpawnCommand` call, and the revive builder does not emit `--context`.

## Thesis and consumers

**Thesis**: partial. The delta repairs the four named core contracts, but Phase 1 is not yet implementation-ready as the first dispatch because the public composition boundary remains unpinned.

**Consumers**:

- production `Daemon` pointer delivery -> **satisfied** by AC-08b composition proof;
- sqlite/dual retirement and parked classification -> **satisfied** by AC-03/04/05 and their tasks;
- merged/offline model capability resolution -> **satisfied** at the registry/resolver layer;
- `pij spawn` / `pij agent spawn` final argv -> **not satisfied** until task 1.5 includes explicit plumbing and executable composition tests.
