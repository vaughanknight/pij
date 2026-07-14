---
record_kind: "retro"
harness_version: "0.8.0"
branch: "feat/windows-installer"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T23:15:12.119Z"
agent: "copilot-cli"
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-12T23:15:12Z-copilot-cli-163fe3"
started_at: "2026-07-12T06:45:03.662Z"
ended_at: "2026-07-12T23:15:12.119Z"
summary: "Built and validated the native Windows bootstrap, encoding the blocking lean-ctx onboarding hang while retaining two broader Windows harness gaps for follow-up."
entries:
  - id: DL-001
    kind: difficulty
    description: "Windows boot requires Git for Windows bin on PATH because just cannot otherwise find sh."
    target: tooling
    severity: degrading
    workaround: "Prepend the Git bin directory to PATH for just and harness boot."
    suggested_encoding: "Teach the Windows harness bootstrap to configure a usable just shell."
    fp: "2e95524ca7a5"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:45:03.662Z"
  - id: DL-002
    kind: difficulty
    description: "The skill recipes use Unix ln semantics and the @ai-substrate package scope; on this Windows machine ln made copies and harness is installed as @myob-lab."
    target: tooling
    severity: degrading
    workaround: "Use native junctions for pij and source harness skills from the active @myob-lab global package."
    suggested_encoding: "Make justfile skill installation Windows-aware and resolve the active harness package scope."
    fp: "4e3fa16cb6ad"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:45:06.001Z"
  - id: DL-003
    kind: difficulty
    description: "lean-ctx-bin postinstall auto-onboard started a foreground daemon and left npm install waiting indefinitely on Windows."
    target: tooling
    severity: blocking
    workaround: "Interrupt the hung npm install, suppress LEAN_CTX_NO_ONBOARD, and resume the installer at stage 5."
    suggested_encoding: "Windows installer sets LEAN_CTX_NO_ONBOARD=1 and supports -StartAt for interrupted runs."
    fp: "163fe3ca4222"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-12T22:22:52.366Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Windows installer

The installer PR encodes the foreground onboarding fix and resumable Windows
bootstrap. The remaining shell-discovery and skill-install gaps stay explicit
for the broader Windows update rather than being hidden by this focused change.
