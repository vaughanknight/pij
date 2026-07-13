# Cold Plan Revalidation R8 Request

**Artifact**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch/docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md`
**Frozen sha256**: `435783c5baa68d83b858afc4f0ea3866cef7926f5250862c50830784fc3b3dd5`
**Prior validated revision**: v1.6 · `validation/compact-before-redispatch-plan-validation-r7.md`
**Post-PR9 base**: `1336291a5a2285d37487cf83bda86b7438ba93c4`
**Validator**: `/validate-v2`
**Mode**: cold, read-only

Validate post-PR9 material-drift handling:

- PR #9 added external pull delivery, where `pij inbox --wait` is required and is not a state poll.
- R5 still forbids compact `--wait` and all compact receipt/latency gates.
- Plan v1.7 scopes structural checks to compact commands/sections and mutation-proves that `pij inbox --wait` remains green.
- Root/C1/C7 and `pij-skill/domain.md` PR #9 contracts must remain intact while C3/pair gain completion-first fire-and-forget.
- Domain Manifest remains exactly five non-plan implementation files.
- Rebase/reread checklist evidence and implementation preconditions must match merged base `1336291a`.

Product and skill files are read-only. Write the verdict under this plan's `validation/` directory and report its path plus the exact artifact sha judged.
