# Review brief — Plan 042 implementation

**Status**: prepared; dispatch only after coder completion
**Role**: cold, read-only reviewer
**Required profile**: separate Copilot `gpt-5.6-sol`, `xhigh`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s042-orchestrator-routing-skill`
**Plan**: `../pij-orchestrator-routing-skill-plan.md`
**Live amendments**: `../implementation-amendments.md`
**Delegation**: `dlg-0001`

## Independence contract

- Form findings from the actual diff and substrate before reading any orchestrator
  conclusion.
- The orchestrator may supply immutable composition and deterministic evidence,
  but does not pre-form review findings.
- Read-only throughout. Do not repair files.
- If the diff or environment changes after review starts, stop and request a
  frozen re-brief.

## Exact review lane

The review packet will add the final base/head SHAs and changed-file list. The
allowed implementation manifest is:

- `skills/pij/references/prime/orchestrator.md`
- `skills/pij/references/routes/prime.md`
- `skills/pij/references/prime/rituals/kickoff.md`
- `skills/pij/references/prime/templates/stream-brief.md`
- `skills/pij/references/prime/templates/spine.md`
- `skills/pij/references/prime/templates/orient-local.md`
- `skills/pij/references/prime/rituals/bootstrap.md`
- `skills/pij/references/prime/orient-oprime.md`
- `skills/pij/references/prime/protocol.md`
- `skills/pij/references/prime/rituals/batons.md`
- `skills/pij/references/prime/rituals/incidents.md`
- `harness/scripts/pij-skill-check.sh`
- `docs/how/pij-prime.md`
- `docs/domains/pij-skill/domain.md`

Any other changed path is a scope finding.

## Aimed review focus

1. **Role landing**: one `prime` registry row remains; stream triage lands on
   `prime/orchestrator.md` before orient.
2. **Real thesis contract**: ordered orient → `/thesis` host invocation →
   preamble → Builder; no prose claims runtime proof where telemetry is absent.
3. **Role boundary**: orchestrator never implements and never forms reviewer
   findings first.
4. **Peer profile/topology**: exact separate `gpt-5.6-sol` / `xhigh` default,
   verbatim read-back, worker/reviewer splits in the orchestrator window, never
   the prime window.
5. **Worktree doctrine**: construction is worktree/branch first; timing and
   external-resource batons survive; shared-tree staging/index ceremony is
   fallback only.
6. **Landing**: `/builder 8 ship` owns branch push, PR, watched CI, and confirmed
   merge; no direct-trunk default remains.
7. **Lifecycle completeness**: bootstrap → allocate/record worktree → spawn from
   worktree cwd → resume → PR merge/abandon cleanup.
8. **Progressive disclosure**: `orchestrator.md` ≤120 lines and cites existing
   Builder/pair/baton/report contracts instead of duplicating them.
9. **Fallback preservation**: INC-004/pathspec/commit-slot rules still exist for
   shared-trunk fallback.
10. **Pair honesty**: no claim that `flow-pair` persists model overrides/roster
    or supports Simple tasks when the current engine does not.
11. **Worker liveness**: silence is outage-first; bounded cadence, one status
    request, poke-before-redispatch, and no short-interval polling.
12. **Known-noise triage**: out-of-allowlist changes always stop the worker;
    timestamp-only `.pi/packages.yaml` `vetted.date` churn is restored and
    recorded, never treated as permission for package-content changes.

## Mandatory proof

- Run `just pij-skill-check`.
- Confirm the worker's captured initial RED was specific to the missing new
  contract, followed by GREEN.
- Mutation-prove at least:
  - remove the stream-module pointer;
  - move `/thesis` after Builder;
  - add a second top-level route row;
  - remove worktree or `/builder 8 ship`;
  - route peers into the prime window;
  - change the default peer profile;
  - remove outage-first poke-before-redispatch recovery;
  - remove vet-date known-noise classification.
- Each mutation must go RED, restore byte-identical, then return GREEN.
- Run `just typecheck` and `just lint`.
- Review documentation cross-links and all relative pointers.

## Verdict contract

Write `review-r1.md` in this directory with:

`verdict · frozen base/head SHAs · changed files · findings by severity ·
mutation evidence · gates · retrospective`.

Any CRITICAL/HIGH finding, out-of-scope path, missing mutation proof, or mutable
review lane means `FIX_REQUIRED`.
