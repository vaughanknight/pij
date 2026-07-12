---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T04:45:34.765Z"
agent: "agent"
plan_id: "041-pij-inbox-no-tmux"
schema_version: "1.2"
retro_id: "2026-07-12T04:45:34Z-agent-14f157"
started_at: "2026-07-12T01:13:29.792Z"
ended_at: "2026-07-12T04:45:34.765Z"
summary: "Phase 1 delivered durable inbox primitives and a Windows-compatible proof lane through a coder/reviewer fleet; nine observations were kept, led by a destructive flow-pair learning-ID collision."
entries:
  - id: DL-001
    kind: difficulty
    description: "pij path <control-plane-id> --events printed an events.ndjson path that does not exist, so the proposed runtime proof of /thesis invocation cannot rely on the pij event stream for Copilot orchestrators"
    target: "pij orchestrator thesis proof"
    severity: degrading
    suggested_encoding: "Make pij path --events report unconfigured/nonexistent honestly for control-plane peers or capture their tool-call stream"
    fp: "5ad19f111219"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T01:13:29.792Z"
  - id: DL-002
    kind: difficulty
    description: "Dogfooding /pij pair exposed route/engine drift: pair.md advertises coder/reviewer model overrides and a run.json roster, but flow-pair start/schema persist neither; dispatch also requires --tasks-dir although Simple Builder plans have inline tasks"
    target: "pij pair route and flow-pair engine"
    severity: degrading
    suggested_encoding: "Align pair route with implemented CLI or add model/roster and Simple-plan inline-task support without hand-editing the ledger"
    fp: "199dfb16a689"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:47:33.074Z"
  - id: CONF-001
    kind: confusion
    description: "flow-pair pair route documents coder/reviewer model flags and roster persistence, but the current CLI start surface accepts neither"
    target: "skills/flow-pair"
    severity: degrading
    workaround: "pin models when spawning peers and record the ids in the stream checkpoint"
    suggested_encoding: "add model/roster flags to flow-pair start or align the route docs"
    fp: "709101831626"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:50:29.436Z"
  - id: COORD-001
    kind: coordination
    description: "Phase 1 flow-pair coder dispatched: run 2026-07-12T03-50-01Z-github.com-AI-Substr, dlg-0001, pij-few-cicada, Copilot GPT-5.6 Sol xhigh"
    severity: annoying
    fp: "5fa5d95d3768"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:52:41.304Z"
  - id: DL-003
    kind: difficulty
    description: "No reusable process.execPath plus npm_execpath subprocess runner exists in harness/scripts for cross-platform staged checks."
    target: "harness/scripts"
    severity: annoying
    suggested_encoding: "Extract a shared portable npm-stage runner if a second compatibility command needs the same mechanics."
    fp: "5f02d6d47e7e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:57:16.969Z"
  - id: INS-001
    kind: insight
    description: "Biome ignores .harness extension sources, so targeted formatting/type proof for checks extension must come from live harness loading rather than the repo lint include."
    target: ".harness/extensions/checks"
    severity: annoying
    suggested_encoding: "Add a dedicated harness-extension typecheck/format sensor if this surface grows."
    fp: "fb92b74e3a71"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:58:17.960Z"
  - id: DL-004
    kind: difficulty
    description: "The report-only pkg audit sensor rewrites vetted.date fields in .pi/packages.yaml, creating out-of-scope working-tree drift during completion checks."
    target: "harness/scripts/packages.ts"
    severity: degrading
    workaround: "Restore only the audit-authored date changes after the gate."
    suggested_encoding: "Make pkg audit read-only or write refreshed provenance to transient evidence unless explicitly requested."
    fp: "1bc570814638"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:00:41.847Z"
  - id: INS-002
    kind: insight
    description: "During Plan 042 implementation, /pij pair route docs promised explicit model overrides and run.json roster persistence that flow-pair CLI/schema do not implement; used explicit provided peer spawn plus plan roster without hand-editing .flow-pair"
    target: "pij pair contract"
    severity: annoying
    suggested_encoding: "Align route contract and engine or formalize the provided-peer roster path"
    fp: "b47e7efcebc7"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:01:04.262Z"
  - id: DL-005
    kind: difficulty
    description: "flow-pair learn allocated learn-0001 from the run-local ledger and overwrote an existing global prompt-lab candidate with the same id"
    target: "skills/flow-pair/lib/learning.ts"
    severity: degrading
    workaround: "restored the candidate byte-for-byte and treated the new run-local learning record as invalid"
    suggested_encoding: "allocate candidate ids by scanning the global cluster candidate directory and refuse no-replace collisions"
    fp: "14f1571fad95"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:13:59.377Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Plan 041 Phase 1

Highest leverage: fix `flow-pair learn` candidate allocation before another run
silently overwrites durable prompt-learning history.
