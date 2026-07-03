---
schema_version: "1.0"
retro_id: "2026-07-03T06:26:12.998825+00:00-agent-030p1"
agent: agent
plan_id: 030-pij-router-skill
started_at: "2026-07-03T05:41:21.250Z"
ended_at: "2026-07-03T06:26:12.998825+00:00"
summary: "retro --drain phase-end save (5 entries: 3 pij product bugs, 1 placement suggestion, 1 dogfood win)"
entries:
  - id: DL-001
    kind: difficulty
    description: "npx skills installs COPIES into ~/.agents/skills (SKILL.md is a real file, readlink fails) despite justfile comment claiming symlink default \u2014 same copy-mode that let flow-pair's store fork 331v299 ahead of the repo; every skill edit needs a re-install and nothing proves store==repo"
    target: project-sensor
    severity: degrading
    suggested_encoding: "a 'just skill-drift' check (diff -rq skills/<s> ~/.agents/skills/<s>) wired into pij-skill-check or harness checks"
    first_seen_at: "2026-07-03T05:41:21.250Z"
    system: { compound: { status: open } }
  - id: SUGG-001
    kind: improvement-suggestion
    description: "spawn placement follows the tmux client's ATTACHED session, not the caller's window \u2014 dogfood peer landed in the user's harness-engineering session ('random window'), died when that window was closed, and had to be respawned + tmux join-pane'd manually; user has now asked for right/below/window/headless control twice"
    target: tooling
    severity: null
    suggested_encoding: "pij spawn --layout right|below|window|headless (plan 029 P4 / SUGG-002); interim: join-pane after spawn"
    first_seen_at: "2026-07-03T05:50:44.801Z"
    system: { compound: { status: open } }
  - id: DL-002
    kind: difficulty
    description: "pij spawn --task silently never delivered to claude-harness peers (2/2 dogfood runs: 0 task-text hits in both transcripts, only boot turns) \u2014 PIJ_SPAWN_TASK path appears pi-only; daemon-bound harnesses need post-bind injection. Silent loss = orchestrator thinks the peer is working"
    target: project-sensor
    severity: degrading
    suggested_encoding: "daemon injects PIJ_SPAWN_TASK after bind for daemon-bound harnesses + loud daemon-log line when a task is pending/delivered; regression test on the spawn --task path"
    first_seen_at: "2026-07-03T05:54:03.982Z"
    system: { compound: { status: open } }
  - id: WIN-001
    kind: win
    description: "dogfood pass: sonnet-5 claude peer given only 'you have a skill called pij' completed whoami\u2192list\u2192greet\u2192verdict via the peer route unprompted; verdict: routing clear via CLI-verb coverage table; one doc defect (Job line implied spawn required) found and fixed same-session"
    target: null
    severity: null
    suggested_encoding: ""
    first_seen_at: "2026-07-03T05:55:25.799Z"
    system: { compound: { status: open } }
  - id: DL-003
    kind: difficulty
    description: "cross-repo agent spawn (cd ~/substrate/minih && pij agent spawn) silently failed to stamp spawnedBy \u2014 resolveSelf from a cwd different to the caller's registered folder returns nothing, no warning at spawn, then the peer's report dies with E-NOREPORTTARGET and once-mode never auto-closes (correct guard, wrong upstream). Peer did all the work; answer stranded in-pane"
    target: project-sensor
    severity: degrading
    suggested_encoding: "spawn-time fail-fast: warn/error when self unresolvable at agent spawn (report target required for --once); or resolve self by pane id alone, not folder"
    first_seen_at: "2026-07-03T06:02:32.706Z"
    system: { compound: { status: open } }
system:
  compound:
    bubble_action: "all-save"
---
