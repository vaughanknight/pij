---
schema_version: "1.2"
retro_id: "2026-07-17T02:28:16.148997+00:00-pij-intimate-mandrill-s055p1"
agent: pij-intimate-mandrill
plan_id: 055-pij-watchdog
started_at: "2026-07-17T00:10:59.893Z"
ended_at: "2026-07-17T02:28:16.148997+00:00"
summary: "retro --drain P1 phase end (6 entries; 5 fixed-now per Jordan in-pane rulings, 1 kept)"
entries:
  - id: DL-001
    kind: "difficulty"
    description: "Governance doc \u00a7 Observe/Evidence paths names ~/.pij/<id>/events.ndjson but the live layout is event-once-*.json files + inbox/ \u2014 the declared evidence path is stale, which matters doubly for s055 (watchdog planning) since it misstates where session ground truth lives"
    severity: "annoying"
    first_seen_at: "2026-07-17T00:10:59.893Z"
    fp: "c641425c8ff7"
    disposition: fixed-now
    resolved_by: ".harness/engineering-harness.md evidence-path line corrected (commit pending)"
  - id: DL-002
    kind: "difficulty"
    description: "Flaky test: release-age-policy.test.ts 'restores the Windows caller environment even when a governed command fails' fails with spawnSync pwsh ETIMEDOUT under full-suite parallel load but passes in isolation (4.4s pwsh spawn vs default timeout). Broke harness boot mid-flow. Jordan doctrine is fix-or-remove flaky tests; surface belongs to s048 release-age, outside s055 fence"
    severity: "degrading"
    first_seen_at: "2026-07-17T01:02:10.495Z"
    fp: "3bc31bd985f5"
    disposition: fixed-now
    resolved_by: "POWERSHELL_PROBE_TIMEOUT_MS 15s\u219260s in release-age-policy.test.ts; proven green"
  - id: DL-003
    kind: "difficulty"
    description: "pi worktree spawns are DOA machine-wide: ~/.pi/agent/extensions/* symlinks (link-global) point at the MAIN checkout's .pi/extensions, so a pi peer booted in ANY worktree hits fatal tool-name conflicts (todo/sql/skills_*/ralph_*) between global links and the worktree's project-local extensions and exits status 1 in ~3s, silent to pij (no registration, no daemon record). Killed 3 fleet spawn attempts tonight; Jordan had to hand-spawn the coder. Candidate fixes: pi conflict precedence (project wins over global), link-global worktree awareness, or pij spawn passing -ne + explicit -e for worktree pi peers"
    severity: "blocking"
    first_seen_at: "2026-07-17T01:30:53.207Z"
    fp: "d241f99ab382"
    disposition: fixed-now
    resolved_by: "AGENTS.md \u00a7 Spawning pi peers in worktrees documents trap + proven workaround; real precedence fix deferred upstream-of-stream"
  - id: INS-001
    kind: "insight"
    description: "Canary lesson proving the s055 capture design: a pi peer's MODEL SELF-REPORT is unreliable (ladybug claimed openai/gpt-5.4) while the tmux pane footer is deterministic ground truth ((github-copilot) gpt-5.6-sol \u2022 xhigh, pij id in status line). Fleet canary \u00a7 C2 should read the footer via capture-pane, never ask the model. Validates watchdog pane-capture as the truth channel"
    first_seen_at: "2026-07-17T01:33:49.402Z"
    fp: "634a347d1839"
    disposition: kept
  - id: DL-004
    kind: "difficulty"
    description: "just flow-pair-mutate false-greens: harness/scripts/flow-pair-mutate.sh:20 hard-codes skills/flow-pair/test/ as the suite, so mutating ANY other file reports tests STAYED GREEN \u2014 a reviewer following the packet-mandated command gets vacuous mutation evidence. Reviewer worked around via the underlying script with an explicit vitest target. Fix: accept a suite arg or derive it from the mutated file's sibling test"
    severity: "degrading"
    first_seen_at: "2026-07-17T01:48:43.255Z"
    fp: "8309b797c60b"
    disposition: fixed-now
    resolved_by: "justfile flow-pair-mutate takes optional test_cmd passthrough; review-code learn-0002 banked"
  - id: DL-005
    kind: "difficulty"
    description: "harness checks / pkg-audit MUTATES .pi/packages.yaml (rewrote four vetted.date timestamps mid-run) \u2014 a quality-gate sensor with write side effects. Any worker running the mandated end-of-work gate dirties a governed file outside its packet scope; coder correctly caught + asked. Sensors must be read-only or the audit's date-stamping should be opt-in (--write)"
    severity: "degrading"
    first_seen_at: "2026-07-17T01:57:44.607Z"
    fp: "cbbec4fedcbe"
    disposition: fixed-now
    resolved_by: "pkg audit write-back gated behind --write; proven report-only"
system:
  compound:
    bubble_action: "drain-with-rulings"
---

Jordan ruled in-pane: fix DL-001/002/004/005 now, document DL-003 in AGENTS.md;
fixes tracked as flight-plan excursion drain-fixes-p1 and proven green.
