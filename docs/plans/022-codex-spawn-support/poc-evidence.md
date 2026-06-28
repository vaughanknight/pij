# POC evidence — codex in tmux (pop · control · details out)

**Run**: 2026-06-28 · **codex-cli**: 0.142.3 · **driver**: raw tmux + codex (feature not built yet — manually simulating the daemon)

Goal (user ask): prove codex *pops in tmux*, *can be controlled*, and *details can be read out* — de-risking the plan against the real CLI before implementing.

## What was done (mirrors the daemon's spawn→bind→drive→tail)

1. **Snapshot** `~/.codex/sessions/**/rollout-*.jsonl` (88 files) — the discovery `before` set.
2. **Pop**: `tmux split-window -h -d -c <cwd> "codex --dangerously-bypass-approvals-and-sandbox"` → pane `%29`.
3. **Ready** (R-1): pane reached a clean ready state in ~3s — `permissions: YOLO mode`, `›` composer, footer `gpt-5.5 medium · ~/pi-hacking/pij`.
4. **Control** (sendkeys transport): `tmux send-keys` a prompt + `Enter` → codex replied `• CODEX_POC_OK_42` exactly as instructed.
5. **Discovery** (bind): new rollout appeared after the turn — `~/.codex/sessions/2026/06/28/rollout-2026-06-28T15-33-30-019f0cb7-f65c-76f1-bb38-c96269590118.jsonl`.
6. **Details out** (tail design): parsed the rollout → `[user] Reply with exactly…` / `[assistant] CODEX_POC_OK_42`.
7. **Clean up**: killed pane `%29`.

## Results — every plan assumption confirmed

| Plan claim | POC result |
|---|---|
| `--dangerously-bypass-approvals-and-sandbox` runs codex unattended (AC-01) | ✅ "permissions: YOLO mode"; no approval prompt blocked the turn |
| codex reaches a recognizable ready state (R-1) | ✅ ~3s to `›` composer + footer |
| sendkeys controls codex (AC-03) | ✅ replied with the exact instructed text |
| bind via transcript discovery, id = trailing UUID (AC-02) | ✅ new rollout's filename UUID `019f0cb7-…0118` == `session_meta.id` |
| cwd-confirm via `session_meta.cwd` (R-2) | ✅ `cwd = /Users/jordanknight/pi-hacking/pij` |
| rollout parses into `[role] text` for tail (AC-04) | ✅ user + assistant turns summarized |

## New finding folded into the plan (Key Finding 07)

**Codex writes its rollout lazily — on the first turn, not at boot.** Discovery returned *no* new file until codex completed its first turn. Implication: the daemon binds codex **after** the init-inject triggers that turn (slightly later than claude, which writes at session start). The existing poll-until-`found` loop + init-inject-anchored watchdog (`loop.ts:180`) already accommodate this; no extra code, just the correct expectation.

## Confirmed convenience

The rollout **filename's trailing UUID is identical to `session_meta.id`**, so the session id can be extracted from the path cheaply (no file read); reading `session_meta` (line 1) is needed only for the cwd-confirm tiebreak.
