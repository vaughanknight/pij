# Ported from flowspace3 — 2026-08-28, by pij-dominant-vicuna (pij o-prime)

Source: /Users/jordanknight/substrate/flowspace/flowspace3 (o-prime pij-instant-lynx).
Jordan's ruling 2026-08-28: lynx's fleet method + governance shapes are authoritative
for pij; local docs/how/fleet doctrine may be outmoded.

## What is here and what to do with it (lynx's own verdicts, 2026-08-28)

| artifact | verdict | note |
|---|---|---|
| settings.dd.json/.md | PORT | shape: role->model defaults, o-prime single-writer, seats never self-select; RE-MINT model rows for pij before use |
| how-we-work.md | PORT-WITH-EDITS | keep skeleton (rulings-durable, roster-as-ownership-authority, PR-era workflow, §9b canary/ack lifecycle); body is fs3 history — rewrite |
| worker-roster.md | PORT | pattern only: ownership authority lives here, never in git identity; start empty |
| rulings/ briefs/ canaries/ handovers/ reviews/ | PORT convention, LOCAL contents | one dated file per ruling; w-<slug>.md briefs + backlog.md tiered queue |
| orient-local.md | NOT PORTED | fs3-local; write pij's own |

## Companion pieces (elsewhere in this worktree)

- `.harness/extensions/team/` — `harness team new <slug>` / `team tidy <slug>`:
  ordinal-safe worktree+branch+plan scaffolder (scans clone + all worktrees + all
  branch heads for ordinals) and its teardown. From fs3; wire into pij's harness.
- `.agents-skills-port/pij-team/` — the full pij-team skill (SKILL.md, TENETS,
  EXPERIENCES, dd templates). Install target: .agents/skills/pij-team with symlink
  .claude/skills/pij-team -> .agents/skills/pij-team (both harness types, one copy).
- `.dd/schemas/pij-team/{packet,impl-guide,settings}/schema.json` — ddocs schemas;
  settings.dd.json is invalid without the settings schema. ddocs resolves schemas
  from CWD: build from repo root (fs3 CONF-009).

## Integration TODO (before this merges as live governance)

1. Re-mint settings.dd.json model rows for pij (source: `pij models`, never hardcode).
2. Rewrite how-we-work.md body for pij; keep section skeleton.
3. Decide final install paths (.agents-skills-port -> .agents/skills; government-port -> .harness/government) — staged under -port names to avoid colliding with live government in canonical.
4. Wire the team extension into pij's harness extension loading.
5. ddocs CLI availability in this repo — verify or vendor.
