# Phase 1 - Execution Log (dlg-0001)

**Run**: 2026-07-11T11-40-21Z-github.com-AI-Substr

**Delegation**: dlg-0001

**Coder**: pij-1ys6f6h (`claude-opus-4.7-1m-internal`, xhigh)

**Phase**: Repair orchestration CLI coverage sensor

## T001 - Strengthen the coverage sensor

Changed `harness/scripts/pij-skill-check.sh` to extract only data rows under
`## CLI-verb coverage`, then require `orchestration`, `baton`, and `prime` in
addition to the existing required CLI families.

### RED evidence before editing SKILL.md

Command:

```text
just pij-skill-check
```

Result: exit 1. Decisive output (verbatim):

```text
bash harness/scripts/pij-skill-check.sh
✓ registry: exactly one active 'prime' row → references/routes/prime.md
✓ sibling-blindness scanned
✓ budget: skills/pij/SKILL.md (70/150)
✗ verb coverage: 'orchestration' unmapped in CLI-verb coverage table
✗ verb coverage: 'baton' unmapped in CLI-verb coverage table
✗ verb coverage: 'prime' unmapped in CLI-verb coverage table
✓ CLI-verb coverage scanned
✓ dup-prose: conventions single-owner
✓ prime pointer-integrity scanned
✓ prime evidence: pij-prime-war-stories.md
✓ prime portability: transitional source path severed
❌ pij-skill-check failed
error: Recipe `pij-skill-check` failed on line 168 with exit code 1
```

The post-coverage duplicate-prose, payload/pointer, evidence, and portability
sections still executed after the accumulated coverage failures.

## T002 - Add orchestration coverage

Added this table row to `skills/pij/SKILL.md`:

```text
| `orchestration` (`baton`/`prime`) | prime route + orchestration CLI (`pij orchestration …`) |
```

The following note now distinguishes `/pij prime` (skill-route selection) from
`pij orchestration prime` (the related CLI primitive), and identifies `baton`
as the other orchestration subcommand.

### GREEN evidence after editing SKILL.md

Command:

```text
just pij-skill-check
```

Result: exit 0. Decisive output (verbatim):

```text
bash harness/scripts/pij-skill-check.sh
✓ registry: exactly one active 'prime' row → references/routes/prime.md
✓ sibling-blindness scanned
✓ budget: skills/pij/SKILL.md (71/150)
✓ CLI-verb coverage scanned
✓ dup-prose: conventions single-owner
✓ prime pointer-integrity scanned
✓ prime evidence: pij-prime-war-stories.md
✓ prime portability: transitional source path severed
✅ pij-skill-check: all green
```

## T003 - Focused checks

| Check | Command | Result |
|---|---|---|
| Structural skill gate | `just pij-skill-check` | exit 0 |
| Flow-pair regression | `just flow-pair-test` | 16 files, 148/148 tests passed |
| Type safety | `just typecheck` | exit 0 |
| Lint | `just lint` | exit 0; 9 pre-existing warnings, no errors |
| Full done gate | `harness checks` | typecheck, lint, test, smoke, package audit, and snapshots all passed |
| Focused whitespace | `git diff --check -- harness/scripts/pij-skill-check.sh skills/pij/SKILL.md` | exit 0, no output |
| SKILL line budget | `wc -l < skills/pij/SKILL.md` | 71/150 |
| Active `prime` registry rows | section-scoped `grep -c '^| \`prime\` |'` | exactly 1 |

Tracked implementation diff:

```text
harness/scripts/pij-skill-check.sh
skills/pij/SKILL.md
```

The phase task folder was already untracked when work began. This delegation
added only this execution log there and modified only the two ruled
implementation files.
