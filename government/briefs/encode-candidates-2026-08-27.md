# Encode candidates — 2026-08-27 (o-prime pij-relative-panther; graduation path: pane lesson → local orient → skill payload)

Each row: friction observed today (with the seat that hit it), the surface it should be encoded in, and the current status. None of these is a day-3 code item; they are payload/tooling fixes for the next prime to pick up or for Jordan's roster.

| # | Friction (evidence) | Encode where | Status |
|---|---|---|---|
| E1 | `/thesis` lives only at `~/.agents/skills/thesis`, not under `~/.claude/skills`, so a Claude seat cannot `Skill()`-invoke it; both streams applied the on-disk SKILL.md contract verbatim (s391 O-1, s392 obs-01) | link/register thesis into the Claude skill roster; stream-brief template note | open |
| E2 | `harness boot` red on macOS because `release-age-policy.test.ts` probes `pwsh` (s391/s392 boot logs) | skip the pwsh probe when `pwsh` is absent (test-side), or document as known-red in orient-local | orient-local done; test fix open |
| E3 | `pij canary` on a Claude-pinned seat aborts at `E-CANARY-CONTEXT` (no catalog context window) BEFORE dispatching the nonce, exit 0, no PASS line — leg (a) silently unproven (spine 23930/23932; canaries/s391.md, s392.md) | canary: dispatch the nonce regardless; report context tier as NOT-VALIDATABLE, non-zero exit or explicit line | open |
| E4 | `pij canary --wait` timed out ~2 s before a Copilot seat's ack landed (s392 obs-08) | longer default wait / documented `--wait` | open |
| E5 | `pij state --json` carries no `statusAt` while `pij list --json` does — lossy-surface trap (recipe step 12 class) | add the card fields to `state --json`, or document the surface | open |
| E6 | Skill-text PRs: the skill gate is necessary, not sufficient — a budget trim inverted a rule and deleted a truth under a green gate (item 9), and left main red on string-pinning vitest (PR #7) | ruled: cold SEMANTIC review + `cli.integration.test.ts` + `acceptance-sweep.test.ts` on every skills/pij PR (spine 25166/25403); orient-local done | encode into the pair/ship route text |
| E7 | Every `pij send` body from a double-quoted or unquoted-heredoc shell string with backticks executes commands (three o-prime incidents today, one pasted 1,500 lines) | skill text: "quoted heredoc + `--body-file`, always"; consider `pij send` refusing bodies that contain unescaped backticks | orient-local done; CLI guard open |
| E8 | Temp worktrees: remove only by exact own-scratchpad prefix (spine 25548) | orient-local done | done |
| E9 | Daemon stop strands spine locks (item 15) — interim: post-restart lock check | orient-local done; code item 15 (s391) | in flight |
| E10 | C9 reads as if `done` mutes the watchdog; code mutes only blocked/question/hold/waiting (item 14, s392) | skill text C9 | in flight |
| E11 | A prime with 20-min PA polling cannot observe WHEN a condition cleared — report resolution-between-sweeps as an upper bound with both read times (PA contract) | pa-standup-recipe / report contract | open (add as contract rule 10) |
