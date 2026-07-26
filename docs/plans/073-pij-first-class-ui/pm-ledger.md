# PM ledger — stream s073, plan 073

PM: pij-exclusive-whitefish · o-prime: pij-reasonable-dove · consumer: pij-cheap-cheetah (chainglass)

## Stream

| | |
|---|---|
| project | `p073-pij-first-class-ui` (planPath `docs/plans/073-pij-first-class-ui/`) |
| allocation | `alloc-s073-pij-first-class-ui`, ordinal 73, all three steps ok |
| worktree / branch | `pij-worktrees/s073-pij-first-class-ui` / `s073/pij-first-class-ui` |
| base | `c4b6fb5` |
| fence | `fence-alloc-s073-pij-first-class-ui`, notify-only; `cli.ts` + `types.ts` declared shared |

## Roster

| seat | id | model | canary |
|---|---|---|---|
| coder | `pij-sacred-pony` | copilot `gpt-5.6-sol` xhigh | **PASS** — model matched via pane-footer, `pane:%2757 pid:57095 native:1e544d20…` |
| reviewer | not yet spawned | cold seat, session-level independence (Jordan, ruled ×4) | acquired at first review, never a phase early |

Assignment `asg-ugliest-coral` on the coder.

## Findings — the tooling substrate

### F1. flow-pair is **not exposed to claude seats**; it is **not** missing (corrected)

My first report said "not installed on this machine". **That was wrong and would have sent a
fixer to install something already present.** Verified:

- `~/.copilot/skills/flow-pair` → `~/pi-hacking/pij/skills/flow-pair` — **exists** (copilot only)
- `~/.claude/skills/flow-pair` and `~/.agents/skills/flow-pair` — **do not exist**
- `~/.claude-alt/skills` is a symlink to `~/.claude/skills`, so a claude seat checking its own
  skills dir correctly finds nothing
- CLI is on PATH: `~/.npm-global/bin/flow-pair`, `readlink -f` →
  `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/lib/cli.ts` — i.e. it resolves into the
  **canonical checkout**, consistent with the documented source-provenance invariant

**Accurate statement**: *the flow-pair skill is exposed to copilot seats only; the CLI is on PATH
and resolves into the canonical checkout.* The gap is an exposure gap, not an install gap.

### F2. Why we still hand-orchestrate the review — and the precise defect shape

Not a degraded fallback. The `flow-pair` CLI's `review` verb is an artifact-contract gate that
**never reads the diff**, so any verdict it emits is not a code review.

**Correction to the reported shape, which I verified in `skills/flow-pair/lib/review.ts`:** the
CLI does **not** fabricate `APPROVE` out of nothing. There *is* a zero-findings guard
(`review.ts:219`) that refuses outright: *"a verdict cannot be minted from zero reviewer input."*
The route doc's description is the accurate one on that point.

The real hole is **narrower and easier to walk into**: `determineVerdict` (`review.ts:140-148`)
returns `FIX_REQUIRED` for critical/high, `APPROVE_WITH_NOTES` for medium, and a bare
**`APPROVE` for anything else — including a findings list that is entirely `low`**. The guard
only covers the *empty* list. So a reviewer who files three low-severity nits gets a
**CLI-computed `APPROVE` that no reviewer ever uttered**, on a diff nothing read. The file's own
comments (`review.ts:217-218`) name this hazard — "a real reviewer's FIX_REQUIRED was shadowed by
a default APPROVE".

Conclusion is unchanged: **the verdict is the reviewer peer's judgment, hand-recorded.** We accept
the ledger and prompt-learning loss.

### F3. Control integrity — no self-review, ever

If the reviewer cannot be brought to `bound` after one heal attempt, this stream **HALTS** with a
named error surfaced to a human. It does **not** fall through to the orchestrator reviewing the
coder's work. The orchestrator sanity pass is a spot-check *on top of* an independent verdict,
never a substitute for one — with no reviewer peer there is **no verdict**.

Dove reports this same degradation is an open control-integrity bug in flow-pair's lazy-spawn
reviewer path. Hold the line under time pressure.

## Standing rulings carried into this stream

- **Merged is ADOPTED, not VERIFIED.** No item is reported shipped off a merge. Everything that
  fooled this fleet on 2026-07-26 was green at exactly the merge stage.
- `planId` owner `cli`, **not** append-only. Discriminating control = a **second** write by a
  non-owner over an existing value; set-then-read proves nothing.
- `planId` independent of `Project.planPath`, opaque, never derived; disagreement is not an error.
- Resolution outcome is **emitted in the spawn receipt, never stored** on the descriptor.
- `--plan-id` dropped from `dispatch`. Two writers: `spawn` creates, `attest` corrects.
- One verb: `pij attest`. `--designation` lands with item 2 as a pure addition (Jordan sequences).
