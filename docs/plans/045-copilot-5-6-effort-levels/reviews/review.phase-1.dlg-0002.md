# S045 Phase 1 cold review - dlg-0002

Verdict: APPROVE_WITH_NOTES

No S045 product or documentation defect was found. The implementation is narrow, consumer-transparent, and mutation-resistant. The note is that the full phase gate remains blocked by smoke behavior outside the granted fence.

## Findings

| Severity | File:line | Claim | Evidence | Smallest fix |
|---|---|---|---|---|
| info | `.pi/extensions/pi-peacock/smoke.ts:15` | The full-gate smoke blocker is outside S045. | The regex requires `~/pi-hacking/pij (main)`, while this run is in `pij-worktrees/s045-copilot-5-6-effort-levels` on `s045/copilot-5-6-effort-levels`. The file has no diff from base `347b6dd732110bc76b3d421e61a401cc228149d6` and was last changed by commit `411d9aad1e9acbf6bb77208e5d26cec382ee9a6a` on 2026-06-28. | Make the peacock smoke cwd/branch assertion worktree-safe in a separate change; do not change S045. |
| info | `harness/driver/index.ts:190-231` | The reviewer peer could not independently reproduce the coder's targeted-smoke pass. | Full and targeted reviewer smoke runs lost their temporary tmux pane before a structured assertion report (`can't find pane`). This occurred for both `pij` and `pi-peacock`, so it does not identify an S045 model-registry defect. | Re-run smoke from a clean operator shell or harden the driver diagnostics separately; keep the S045 phase gate blocked until smoke is green. |

## Dimension 0 - independent mutation proof

Baseline and every restored copy of `.pi/extensions/pij/core/models/registry.ts` had SHA-256:

`949e28fedec88d79e0060b122965c4072019e36930597f18d23eee76ebbbe770`

The target was:

`npx vitest run registry.test.ts validate.test.ts spawn.test.ts cli-models.test.ts`

Baseline: 4 files passed, 195/195 tests passed.

| Mutation | RED evidence | Restore evidence | GREEN evidence |
|---|---|---|---|
| Changed the provider/id branch in `piModelLevels()` from `if (provider === "github-copilot" && isCopilotGpt56(id))` to `if (false)`. | 4 files failed; 25 failed, 170 passed. Failures included supported-level warnings and Copilot CLI rows reverting to source maps. | SHA returned to `949e28...770`. | 4 files passed; 195/195 passed. |
| Removed only `provider === "github-copilot" &&` from the parse guard. | `registry.test.ts` failed; 1 failed, 29 passed. The same-id Sakana row received the curated six levels instead of preserving `["high"]`. | SHA returned to `949e28...770`. | `registry.test.ts`: 30/30 passed. |
| Added `"minimal"` to `COPILOT_GPT56_LEVELS`. | 4 files failed; 9 failed, 186 passed. Failures covered warning behavior, raw/clone/snapshot levels, and Copilot/Pi advertisement. | SHA returned to `949e28...770`. | 4 files passed; 195/195 passed. |

Final `git diff --check` was clean.

## Acceptance coverage

| AC | Verdict | Evidence |
|---|---|---|
| AC-01 | PASS | `registry.ts:64-75`; `cli-models.test.ts:148-170` proves all three ids, both existing provider projections, exact order, and no `minimal`. Live Copilot JSON also showed two corrected projections per id. |
| AC-02 | PASS | `validate.test.ts:112-128` covers 3 ids x 6 supported levels and rejects `minimal` with the exact list. |
| AC-03 | PASS | `spawn.test.ts:746-769` proves each supported level is warning-free and `minimal` keeps the existing `spawn continues` warning shape. |
| AC-04 | PASS | `registry.test.ts:135-186,243-256` covers raw model rows, a `modelOverrides` row, seed clones, fallback aliases, and `verified:false`. |
| AC-05 | PASS | `registry.test.ts:144-153` preserves unrelated Copilot and same-id Sakana rows. Codex production paths are untouched and existing Codex level tests remain green. |
| AC-06 | PASS | `cli-models.test.ts:148-160` pins six rows and raw-before-clone order. `spawn.test.ts:765-769` pins warn-don't-block continuation. No validator, CLI, or spawn production branch changed. |
| AC-07 | BEHAVIOR PASS / GATE BLOCKED | All three independent mutations went RED and restored byte-identically. `harness checks` remains red only at smoke; all other sensors pass. |
| AC-08 | PASS | `cli-models.test.ts:172-183`, `validate.test.ts:112-128`, and `spawn.test.ts:155-164` cover Pi-filter advertisement, shared bare-id validation, and unchanged provider-prefixed `:<level>` translation. Live Pi JSON showed two corrected projections per id. |

## Scope and fence

- `git diff --name-only 347b6dd732110bc76b3d421e61a401cc228149d6` contains exactly the six granted product/docs files.
- `docs/domains/pij-control-plane/domain.md` is untouched.
- No package, flow-state, government, daemon, staging, or commit change remains from the review.
- The execution log is the only worker-authored plan artifact; this file is the reviewer artifact required by the packet.
- The implementation preserves duplicate row cardinality/order, unrelated models, Codex levels, warning continuation, bare-id validation, and Pi suffix translation.

## Gate and blocker classification

Independent checks:

- S045 target tests: 195/195 passed.
- Flow-pair regression suite: 148/148 passed.
- Live Copilot and Pi JSON: raw plus clone rows for all three ids, each with `none,low,medium,high,xhigh,max`.
- `harness checks`: typecheck PASS, lint PASS, test PASS, smoke FAIL, package audit PASS, snapshots PASS.

The smoke failure is an external gate blocker, not an S045 defect. The peacock assertion is statically incompatible with any worktree path/branch and predates this branch. The reviewer environment additionally exposed an earlier pane-lifetime diagnostic failure, so the exact coder smoke transcript was not reproduced. Keep the phase gate blocked until smoke is green, but no S045 fix cycle is required.

During `harness checks`, package audit refreshed vetting timestamps in `.pi/packages.yaml`; the reviewer restored those generated changes before finalizing, leaving no package diff.
