---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T00:35:21.131Z"
agent: agent
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-12T00:35:21Z-agent-a58d1a35"
started_at: "2026-07-12T00:14:59.904Z"
ended_at: "2026-07-12T00:35:21.131Z"
summary: "Preserved delayed-delivery and input-transport observations from Plan 040 plus one stranded orchestrator-routing signal from the shared agent bucket."
entries:
  - id: DL-001
    kind: difficulty
    description: "Bash security blocked a harmless pij send message because backticks in quoted text were treated as command substitution"
    target: tooling
    severity: annoying
    suggested_encoding: "Detect literal messaging arguments separately from executable shell syntax or document a safe no-backtick pattern"
    fp: "5671e7c36680"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T00:14:59.904Z"
  - id: INS-001
    kind: insight
    description: "A pij send --wait to a live memorable-id peer timed out, but the peer later received the message and replied with the expected nonce. Receipt timeout can look like delivery failure under latency."
    target: runtime-inspectability
    severity: annoying
    workaround: "Wait for the daemon-pushed peer acknowledgment before declaring delivery failed."
    suggested_encoding: "Differentiate receipt-timeout from eventual-delivery in output and expose late receipt/ack timing."
    fp: "a58d1a356563"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T00:25:41.361Z"
  - id: INS-002
    kind: insight
    description: "Jordan observed an intermittent Enter/input submission bug around memorable-id peer messaging; not reproduced in this stream yet."
    target: runtime-inspectability
    severity: annoying
    suggested_encoding: "Keep watch for a reproducible pane/input transport case and capture the exact pane state and send path when it recurs."
    fp: "b26a34e3bf69"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T00:25:42.560Z"
  - id: DL-002
    kind: difficulty
    description: "At boot I misclassified the s042 orchestrator role as a work-packet peer and announced I was awaiting a packet, despite the spawn task already naming the orchestrator boot path"
    target: "skills/pij orchestrator routing"
    severity: degrading
    suggested_encoding: "Route briefed orchestrators immediately into a dedicated orchestrator skill with mechanical role acknowledgment and preamble gate"
    fp: "76d7c262be3d"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T00:26:26.495Z"
---

# Retro — shared observations
