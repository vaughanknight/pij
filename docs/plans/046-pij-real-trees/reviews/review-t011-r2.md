# T011 R2 focused re-review

## Verdict

**APPROVE**

H1 and M1 are fully repaired. The adopted-stream ritual is executable, the
sensor enforces identity-before-link-before-leg-(c), the required mutation
produces targeted RED, and `PIJ_PARENT_ID` is now documented as environment
snapshot state rather than live registry state. No coder scope expansion or
PR15/17/18 regression was found.

## H1 - adopted-stream kickoff

`skills/pij/references/prime/rituals/kickoff.md:25-32` now orders the work as:

1. verify the automatically persisted structural link for spawned streams;
2. complete adopted canary legs (a) round-trip and (b) identity;
3. run `pij link <id> --parent <o-prime-id> --json` and verify the subtree;
4. deliver the brief pointer as leg (c), require `brief-ack`, and close the
   canary record.

The adoption variant at `kickoff.md:47-52` records the linked structural parent
while separately recording absent or unknown `spawnedBy`/close ownership. It no
longer claims that an adopted stream has no parent.

The sensor at `harness/scripts/pij-skill-check.sh:271-278` checks spawned-link
placement and requires the adopted identity marker, link command, and leg-(c)
brief marker in that order.

## Focused mutation proof

The skill was copied to an isolated `/tmp` fixture. Moving the adopted link
block after the leg-(c) brief heading made `just pij-skill-check` exit 1 with:

```text
real-tree kickoff: adopted identity before link before brief —
'**Deliver the brief by pointer as canary leg (c).**' is out of order
```

The fixture was restored from the reviewed file. Both copies then had SHA-256
`3ca83cb855a989c169d4a40a3e57d743fb2cc27f8ac9d76045d850e0344c3f81`,
and the restored fixture returned green. The repository file was never mutated.

## M1 - environment snapshot semantics

`docs/how/pij.md:52-59` now states that:

- `PIJ_PARENT_ID` is a spawn/adopt/export-time environment snapshot used by the
  current process and inherited by future children;
- `pij link` changes registry descriptor `parentId`, with current structural
  truth observed through `pij tree`;
- linking cannot mutate a running process environment retroactively;
- explicit-root export emits no parent assignment, so a possibly stale shell
  must run `unset PIJ_PARENT_ID` before evaluating the export.

This matches shipped behavior: `core/cli.ts:926-934` writes only the descriptor,
while `core/session-join.ts:68-80` emits parent environment state only when the
descriptor resolves one. The explicit-root test at
`core/session-join.test.ts:144-156` requires only `PIJ_SESSION_ID`.

## Scope

Comparing immutable `diff-0008.patch` with `diff-0009.patch` shows that the R1
implementation changed only the three tracked repair paths:

- `harness/scripts/pij-skill-check.sh`
- `skills/pij/references/prime/rituals/kickoff.md`
- `docs/how/pij.md`

The fourth allowed path,
`docs/plans/046-pij-real-trees/tasks/tranche-t011/execution.log.md`, contains the
appended R1 evidence at lines 102-136. It is an untracked task artifact and is
therefore not embedded by the immutable Git diff capture. The changed
`fleet-roster.md` section and added review/fix packets are orchestration/review
evidence, not coder R1 implementation scope. All other T011 product, skill,
operator, and domain patch sections are byte-identical between the two
immutable diffs.

Current immutable patch SHA-256:
`2236b504b3803eff37b6b26f86bc902b2df7267dc059be3e4fd2d75e4d0cb75b`.

## Preservation

- All original T011 guards are green. The six guards outside the focused
  kickoff order are unchanged from the previously mutation-proven sensor.
- PR17 completion-first compact, fire-and-forget/no-`--wait`, pair ordering,
  C7 inbox waiting, and no-state-poll checks remain green.
- PR18 local-path tests pass 4/4; portability and the unchanged prime hierarchy
  documentation remain green.
- PR15 model catalog/documentation paths are absent from the R1 delta.
- CLI integration passes 37/37, including real repository/worktree
  tree/link/adopt/spawn composition.

## Commands

| Command | Result |
|---|---|
| `harness boot` | Ready; typecheck and full test stages passed |
| `just pij-skill-check` | Passed |
| Link-after-brief mutation | Targeted RED; byte-identical restore; GREEN |
| `just test harness/scripts/local-path-check.test.ts` | 4/4 passed |
| `just test .pi/extensions/pij/cli.integration.test.ts` | 37/37 passed |
| `just lint` | Passed with ten existing warnings |
| `just typecheck` | Passed |
| `git diff --check` | Passed |

## Remaining uncertainty

Full tmux smoke/live and daemon-restart evidence remains T012-owned. This
focused documentation/sensor repair adds no product behavior requiring a wider
runtime proof.
