---
record_kind: "retro"
harness_version: "0.8.0"
branch: "feat/windows-installer"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-13T01:21:59.819Z"
agent: "copilot-cli"
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-13T01:21:59Z-copilot-cli-eeb283"
started_at: "2026-07-13T00:43:52.548Z"
ended_at: "2026-07-13T01:21:59.819Z"
summary: "A production Windows registry replace failure was reproduced, fixed through a shared atomic writer, and converted into deterministic Windows CI backpressure."
entries:
  - id: DL-001
    kind: difficulty
    description: "A live Windows Pi session hit EPERM replacing its registry descriptor; existing checks had no real locked-target atomic rename probe."
    target: project-sensor
    severity: blocking
    workaround: "Add bounded Windows rename retries and reproduce the lock with a child PowerShell FileStream."
    suggested_encoding: "Include fs-registry locked-target regression in the windows:check sensor."
    fp: "eeb2838b9a88"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-13T00:43:52.548Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Windows atomic persistence

Issue #16 and PR #14 carry the coordination record. The resulting sensor uses
a real Windows file lock that denies delete sharing, so this failure mode is
now proven rather than inferred.
