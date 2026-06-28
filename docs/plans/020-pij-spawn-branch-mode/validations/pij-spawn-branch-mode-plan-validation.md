# Validation — pij-spawn-branch-mode-plan

**Verdict**: ✅ VALIDATED — no material issues.
**Target**: `docs/plans/020-pij-spawn-branch-mode/pij-spawn-branch-mode-plan.md` (Simple, CS-3, Status: READY)
**Validated**: 2026-06-28 · adaptive (lead deterministic proof + 1 independent critic)

## Proof (fresh, read against source)
- **Finding 01 confirmed** — `core/daemon/loop.ts:188` gates deterministic bind on `descriptor.harness === "copilot" && descriptor.plannedHarnessSessionId`; the plan's widening (T012) to "`plannedHarnessSessionId` present → deterministic" is correct and necessary.
- Helpers the plan leans on exist as described: `resolveSelf` + `filterByFolder` (`core/discovery.ts:77,52`), `selectTransport` (`core/harness/types.ts:20` — correct home for `supportsBranching`), `randomUUID`/`FsRegistry` already imported in `cli.ts`.
- `SessionDescriptor` (`core/types.ts`) has `harnessSessionId`, `plannedHarnessSessionId`, `transcriptsAtSpawn`; `branchedFrom` is genuinely new (additive).
- All three target test files exist (`core/harness/types.test.ts`, `core/spawn.test.ts`, `core/daemon/loop.test.ts`).
- Gates honest: no `constitution.md`/`architecture.md`/`docs/adr/` (G2/G3/G4 N/A correctly); `pij-control-plane` is in `docs/domains/registry.md` (G7 PASS).
- Structure: AC-01..AC-07 all mapped in the Acceptance Coverage Map; T001–T015 consistent; Domain Manifest covers every touched file.

## Critic (1, independent — Primary Critic)
Owned question: *does the fork bind + identify correctly end-to-end, and is the gating complete?* Verified against source:
- Init-injection into a fork is safe — `PIJ_SESSION_ID` env is set to the **child's** pre-allocated id (`core/spawn.ts:218`) and `resolveSelf` prioritises the env value, so `pij phonehome` from the fork resolves to the child id, not the inherited caller context.
- `spawnedBy`-gated parent-notify is **pre-existing** (no spawn sets it today) — not a branch regression.
- Widened bind condition is safe — non-branch claude/pi never carry `plannedHarnessSessionId` (only the gated `planBranch` path sets it for claude; copilot unchanged).
- Self-resolution has multi-layer fallbacks (PIJ_SESSION_ID → lone-local → `$TMUX_PANE`), ambiguity fails loud.
- `planBranch` matrix covers all four rejects; a `pending` caller has no `harnessSessionId` → caught by the "not bound" check.
→ **no_material_findings**

## Thesis
Purpose met — the plan delivers opt-in branch-from-self with a deterministic bind that reuses the proven copilot template, fully gated, non-branch paths untouched. Target proof level (Implementation-ready plan) = actual proof.

## Consumers
Single consumer: the implement stage of this same flow (Simple → one phase). Branch-from-peer / copilot / pi are explicitly OOS and the `planBranch`/`supportsBranching` seams leave room — no forward-compat lockout.
