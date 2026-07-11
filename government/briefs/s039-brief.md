# Stream brief — s039-deps-audit
**From**: pij-3vetx8 (o-prime) · **Date**: 2026-07-11T13:05:00Z · **Lifecycle**: o-prime-spawned; assignment provisional until Jordan's preamble unless he waives in-pane

## Structure tree

```text
human (Jordan)
└─ o-prime pij-3vetx8 · this repo's governance seat
   ├─ s036-baton pij-1khprxk · SHIPPED (standing by) · s037-broadcast pij-aa756x · SHIPPED (standing by)
   ├─ s038-prime pij-118mbuv · sibling, parallel — never contact directly; route through me
   └─ this stream pij-1yz3gyy · s039-deps-audit
```

## Orient stack (read in order, pointers only)

1. `skills/pij/references/prime/orient-global.md`
2. `government/orient-local.md`
3. This brief.

## Work item

- **Plan folder**: `docs/plans/039-dependency-chores-audit/` (see `original-ask.md` — verbatim ask + bound context)
- **The job**: enumerate dependabot's chores (open PRs, alerts, config), audit against current deps, and drive safe updates through the full gate. gh CLI expected.
- **Flow**: `/builder` guided; this may be Simple-mode sized — your call at plan with Jordan's clarify.

## Fences (canonical: spine § fences — s039)

Planning-cut: `docs/plans/039-dependency-chores-audit/**` + `.harness/temp/s039/**`. Expected code surfaces at validation: `package.json`, `package-lock.json`, possibly `.github/dependabot.yml` — DISJOINT from s038's registry/cli surfaces; any overlap discovery = escalation, not judgment.

## Batons

git-index (pathspec-mandatory; dependency bumps are the classic swept-index hazard — INC-004 class) · daemon-restart only if a dep bump touches the running extension's world (escalate first) · push-main double-gated. Primitive live: `pij orchestration baton <verb>`.

## Report contract

Standard: `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`, pointers, preamble checkpoint before planning, verified greens only. Fleet does implementation (/pij pair).

**Ack**: `brief-ack s039` + anything wrong.
