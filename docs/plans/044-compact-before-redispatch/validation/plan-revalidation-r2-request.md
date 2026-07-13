# Cold Plan Revalidation R2 Request

**Artifact**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch/docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md`
**Frozen sha256**: `b50403afb601d303d7d46487cc476de7dce07ad70664dbac0a0db1721b153b64`
**Prior verdict**: `validation/compact-before-redispatch-plan-validation.md`
**Validator**: `/validate-v2`
**Mode**: cold, read-only

This revision includes the prior three finding fixes plus the authoritative one-shot exception:

- C3 completion compaction applies to reusable/live peer context.
- `pij agent spawn --once` auto-dissolves on report; an immediate compact may return expected `E-DEAD`.
- `validation/one-shot-compact-evidence.md` records the actual first-action attempt before the prior verdict artifact was read.
- Cold compact-order acceptance uses resident/reusable peers and keeps the one-shot case as separate boundary evidence.

Revalidate this exact hash. Product and skill files are read-only. Write a new verdict under this plan's `validation/` directory and report its path plus the exact artifact sha judged.
