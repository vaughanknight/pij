---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s073/pij-first-class-ui"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-26T10:49:11.560Z"
agent: "pij-sacred-pony"
plan_id: "073-pij-first-class-ui"
schema_version: "1.2"
retro_id: "2026-07-26T10:49:11Z-pij-sacred-pony-6dab2bb2c671"
started_at: "2026-07-26T09:57:00.218Z"
ended_at: "2026-07-26T10:49:11.560Z"
summary: "Implemented and mutation-proved plan linkage while surfacing two deterministic harness proof gaps."
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot hid the underlying TypeScript diagnostic and only reported the just recipe failure"
    target: harness-itself
    severity: degrading
    workaround: "Reran just typecheck directly to expose the compiler diagnostic."
    suggested_encoding: "Include compiler diagnostics in harness boot failure output."
    fp: "6dab2bb2c671"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-26T09:57:00.218Z"
  - id: DL-002
    kind: difficulty
    description: "The full just lint gate is red on synced main because two pre-existing s066 review probe files are unformatted; all item-1 touched files pass Biome"
    target: just-lint
    severity: degrading
    workaround: "Ran Biome on touched files and reported the unrelated baseline failures separately."
    suggested_encoding: "Keep committed review artifacts outside lint scope or format them before merge."
    fp: "8d4bd25b99f6"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-26T10:42:50.730Z"
---

# Retro — plan 073 item 1

<!-- Optional human narrative. The structured `entries` above are the durable signal. -->
