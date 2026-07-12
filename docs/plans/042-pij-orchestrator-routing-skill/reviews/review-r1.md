# Review r1 — Plan 042 / dlg-0001

## Verdict

**FIX_REQUIRED**

No CRITICAL findings. Two HIGH findings violate the frozen plan/runtime
contract.

## Frozen target

- Base HEAD: `18a81918d1b002863c4920149e29bbda3277dd2f`
- Reviewed worktree HEAD: `18a81918d1b002863c4920149e29bbda3277dd2f`
  (implementation is uncommitted)
- Review packet SHA-256:
  `217e168e7b64b53ddd9ecd1e1c5a00ffc88eb53bfd248343d5c8a50c2af6fe0a`
- Tracked implementation diff SHA-256:
  `c2e568f4fa8cbb38126df305c86d0497cbddb877ce7b10ff745302a26db9dd70`
- New module SHA-256:
  `c6948a106991f71d752de22e9f2afe38b7f6d328e9addef80c8534e25d6487b5`

The tracked diff and module hashes remained unchanged throughout review and
after every isolated mutation.

## Changed implementation files

1. `skills/pij/references/prime/orchestrator.md` (new)
2. `skills/pij/references/routes/prime.md`
3. `skills/pij/references/prime/rituals/kickoff.md`
4. `skills/pij/references/prime/templates/stream-brief.md`
5. `skills/pij/references/prime/templates/spine.md`
6. `skills/pij/references/prime/templates/orient-local.md`
7. `skills/pij/references/prime/rituals/bootstrap.md`
8. `skills/pij/references/prime/orient-oprime.md`
9. `skills/pij/references/prime/protocol.md`
10. `skills/pij/references/prime/rituals/batons.md`
11. `skills/pij/references/prime/rituals/incidents.md`
12. `harness/scripts/pij-skill-check.sh`
13. `docs/how/pij-prime.md`
14. `docs/domains/pij-skill/domain.md`

The implementation diff contains no product code, dependency manifest,
flow-state, government, or flow-pair engine changes. The untracked Plan 042 and
retro artifacts are orchestrator-owned evidence, not worker implementation.

## Findings by severity

### HIGH-01 — Confirmed peer profile is not passed to `/pij pair`

`orchestrator.md:28-31` records and confirms the required same-model
`gpt-5.6-sol @ xhigh` coder and reviewer, but the delegation step at
`orchestrator.md:20` only says to use `/pij pair`. It never passes the recorded
values through `--coder-model` and `--reviewer-model`.

This is load-bearing because `routes/pair.md:87-93` defaults to
`claude-sonnet-4.6:xhigh` for the coder and `gpt-5.5:xhigh` for the reviewer.
The required override inputs exist at `routes/pair.md:145`, and the authoritative
ruling explicitly requires both overrides at `rulings.md:102-111`.

As written, an orchestrator can read back the correct profile, receive human
confirmation, then silently launch the wrong pair defaults. Add an explicit
handoff that passes both recorded model/effort selections on the pair run
without claiming that flow-pair persists them. Extend the structural sensor to
guard that handoff.

### HIGH-02 — Bootstrap and kickoff both construct the same worktree

`rituals/bootstrap.md:79-83` reserves and creates the worktree, then directs the
reader to run `kickoff.md`. The kickoff's ordered procedure independently
allocates the same stream at `kickoff.md:9-17` and runs `git worktree add` again
at `kickoff.md:18-23`.

There is no skip, partial-entry, or "already constructed" branch. A bootstrapper
following both canonical pages will attempt to reserve and create the first
stream twice, normally failing on the existing branch/path before spawn. Make
one ritual the construction owner: either bootstrap derives/persists inputs and
then delegates construction to kickoff, or kickoff defines an explicit
already-constructed entry path.

### INFO-01 — Worker pointer mutation changed only the link label

The worker's original pointer mutator used a first-only substitution, changing
the Markdown label while leaving the actual `orchestrator.md` link target
intact. Its expected regex was also broad enough to match a positive route line.

The independent reviewer reran the case with a global replacement of both label
and target. The sensor then produced the intended route-target RED, restored
byte-identically, and returned GREEN. No implementation fix is required for
this review-proof issue.

## Mutation evidence

Every case ran against a temporary copied `PIJ_SKILL_ROOT`, went RED for the
intended assertion, was restored byte-identically, and returned GREEN:

| Mutation | Intended RED |
|---|---|
| Replace the stream module link target | expected stream row pointer; module-first bypass |
| Move `/thesis` after Builder | ordered journey out of order |
| Add a second top-level `orchestrator` row | forbidden second route row |
| Remove `/builder 8 ship` | missing landing marker |
| Route peers into the o-prime window | missing anti-prime-window contract |
| Change the default peer profile | missing exact default coder/reviewer profile |
| Remove outage-first/poke-before-redispatch wording | missing recovery contract |
| Remove timestamp-only `vetted.date` classification | missing known-noise contract |

Final target proof:

```text
tracked diff  c2e568f4fa8cbb38126df305c86d0497cbddb877ce7b10ff745302a26db9dd70
new module    c6948a106991f71d752de22e9f2afe38b7f6d328e9addef80c8534e25d6487b5
```

The worker's captured initial RED was specific to the new contract: existing
registry, sibling-blindness, budgets, CLI coverage, prior payload, evidence, and
portability checks stayed green while the missing module, stream pointer,
ordered role contract, and new lifecycle markers failed.

## Cold evidence

- Checkpoint SHA-256 matched:
  `28f473dc74bf355d8879050ede9bb3e65bb8b5d364423059868b628a38c8eb70`.
- Trace SHA-256 matched:
  `906aebf33a6e89f031c5a3542d4d08a055c24fc143950561c374613496e9bc8d`.
- The trace's first tool call invoked the host `skills_run` mechanism for
  `pij prime`; it then loaded the selected route, orchestrator, global orient,
  local orient, and brief.
- It invoked `skills_run` for `thesis`, resolved the initial ambiguous query,
  loaded the thesis skill, and applied its output contract.
- The only write/edit tool calls targeted the allowed preamble checkpoint.
  Before/after status differed only by that report.
- The report states the role, exact profile, and
  `WAITING_FOR_BUILD_CONFIG`, with no implementation.

The cold run predates amendments A-001/A-002. A direct byte comparison shows
the final module differs only by the inserted silence-recovery and vet-noise
blocks; both blocks were independently mutation-proven above.

## Gates

| Gate | Result |
|---|---|
| `just pij-skill-check` | PASS |
| `just typecheck` | PASS |
| `just lint` | PASS, exit 0; existing warnings only |
| `just flow-pair-test` | PASS, 148/148 |
| Changed-document relative links | PASS, 59 checked |
| `git diff --check` | PASS |
| Forbidden implementation path scan | PASS |

## Retrospective

The structural sensor is strong against missing markers and targeted deletions,
but it cannot detect whether adjacent procedures compose into an executable
lifecycle or whether confirmed configuration reaches the consuming command.
The highest-leverage follow-up is to encode those two seams: explicit pair
override propagation and single-owner worktree construction.
