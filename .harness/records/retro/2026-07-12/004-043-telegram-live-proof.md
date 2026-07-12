---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s043/telegram-last-speaker-routing"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T09:11:56.894Z"
agent: "pij-rigid-minnow"
plan_id: "043-telegram-last-speaker-routing"
schema_version: "1.2"
retro_id: "2026-07-12T09:11:54Z-pij-rigid-minnow-live-proof"
started_at: "2026-07-12T09:07:47Z"
ended_at: "2026-07-12T09:13:00Z"
summary: "Two live Telegram phone rounds proved strict fallback follows the latest successful speaker as it changes seats."
entries:
  - id: WIN-001
    kind: win
    description: "Jordan's bare Telegram reply routed to the o-prime that had just spoken, not the previously addressed agent."
    target: "runtime-inspectability"
    fp: "9b3e7d1a5c20"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T09:11:19Z"
  - id: WIN-002
    kind: win
    description: "After pij-rigid-minnow spoke next, Jordan's second bare Telegram reply routed to pij-rigid-minnow instead of the prior o-prime speaker."
    target: "runtime-inspectability"
    fp: "1fd8c6a43e90"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T09:12:30Z"
---

# Retro — Plan 043 live proof

Bridge evidence:

1. `forwarded pij-3vetx8 → chat` → `last speaker pij-3vetx8` → `route pij-3vetx8: injected 1 message(s)`.
2. `forwarded pij-rigid-minnow → chat` → `last speaker pij-rigid-minnow` → `route pij-rigid-minnow: injected 1 message(s)`.
