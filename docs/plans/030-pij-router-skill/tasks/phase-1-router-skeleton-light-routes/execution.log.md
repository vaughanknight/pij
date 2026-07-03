# Execution Log — Phase 1: Router skeleton + light routes

**Started**: 2026-07-03 · **Implementor**: orchestrator (direct) · **Plan**: pij-router-skill-plan.md v1.0.0

## T001 — SKILL.md dispatch ✅
`skills/pij/SKILL.md` — 63/150 lines. Registry (5 routes + watch-future; pair/delegate marked *lands Phase 2*), grammar, two load paths, 7 global invariants, alias table (`/flow-pair …` → `/pij pair …`), skill≠CLI disambiguation as the first blockquote, CLI-verb coverage table (all 15 verbs incl. `models`).

## T002 — 00-routing.md ✅
63/250 lines. Signals A–E with validator-corrected probes (run.json `status=="open"` + roster from same file; `nav show --path`; daemon status; whoami), precedence A>B>C>D/E, hint-validation. § Shared conventions C1–C7 (C1 absorbs harness-modes content compressed ~164→~20 lines; C2 canary; C3 compact-early/compact-self; C4 models; C5 split-cap; C6 daemon restart; C7 push-not-poll).

## T003/T004/T005 — routes peer/agent/ops ✅
69, 54, 58 lines (≤150 each). Sibling-blind (checked mechanically). peer.md carries the AC-07 smoke sequence + failure-mode table. agent.md inlines the plan-029-finding-09 permissions rule verbatim scope (run-mode presets vs always-full-perms spawn). ops.md documents the manual corpse sweep (no `pij prune` yet) + zsh word-split gotcha + phonehome binding repair.

## T006 — pij-skill-check ✅
`harness/scripts/pij-skill-check.sh` + `just pij-skill-check`. Five checks incl. the two validator-mandated clauses: parity exempts pending-marked rows (and flags early arrivals), dup-prose scope = `skills/pij/**` in Phase 1. **Green run: exit 0, all 15 checks ✓.**

## T007 — pij-skill domain ✅
`docs/domains/pij-skill/domain.md` + registry row + domain-map: PS node, 5 edges (FP/PCP/PIJ/AR + dotted TF), 2 health rows, history row.

## T008 — install + link ✅
`just pij-skill-link` (`.pi/skills/pij` symlink ✓) + `just pij-skill-install` (`npx skills … -s pij`). Store: `~/.agents/skills/pij` created; claude bridge `~/.claude/skills/pij → ../../.agents/skills/pij` ✓; skill appeared live in the implementing claude session's own registry (discovery proven). Eve/PromptScript agents rejected global install — expected, non-blocking.

## T009 — validation run ✅
`just pij-skill-check` exit 0 · `just flow-pair-test` 148/148 passed (AC-06: engine untouched).

## Live dogfood (user-directed, beyond T009) ✅ PASS
Three attempts; the third completed end-to-end:
- `pij-fkxzue` / `pij-1p5rzjk`: **`pij spawn --task` silently never delivered** to claude-harness peers (0 task-text hits in both transcripts — only boot turns). Real product bug, captured as observe DL-002. #1 also exposed placement friction (pane landed in the user's *attached* session, harness-engineering; died when that window closed) — observe SUGG-001.
- `pij-f7g58j` (claude-sonnet-5, task via `pij send` post-bind): given only "you have a skill called pij", it completed **whoami → list → greet pij-z4bt25 → usability verdict** via the peer route unprompted. Verdict verbatim: routing clear — "registry table's CLI-verb coverage column pointed straight to peer.md… no ambiguity"; one defect — peer.md's Job line implied spawning was required for whoami/list/send. **Fixed same-session** (Job line now covers existing-peer conversing), `pij-skill-check` re-green, store redeployed + `diff -q` sync-verified. Win captured (WIN-001).

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-07-03 | T008 | gotcha | `npx skills` store entry `~/.agents/skills/pij` is a REAL DIRECTORY, not a symlink to the repo — same copy-mode that let flow-pair's store fork ahead of the repo (plan finding 01). Deploys must re-run install; store can drift. `Noteworthy` | re-run `just pij-skill-install` after every skill edit; drift check = `diff -rq skills/pij ~/.agents/skills/pij` | finding 01, AC-09 analog |
| 2026-07-03 | T008 | insight | spawn printed `unknown model 'claude-sonnet-5'` warning (alias table stale, no Claude 5 family) but proceeded — exactly the § C2/C4 canary posture the skill documents | none needed; SUGG-003 covers the alias refresh | 00-routing.md C4 |
