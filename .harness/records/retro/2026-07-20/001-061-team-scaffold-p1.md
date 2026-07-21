---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s061/team-scaffold"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-20T11:34:40.138Z"
agent: agent
plan_id: 061-team-scaffold
schema_version: "1.2"
retro_id: "2026-07-20T11:34:40Z-agent-p1drain"
started_at: "2026-07-20T10:44:23.847Z"
ended_at: "2026-07-20T11:34:40Z"
summary: "retro --drain P1 phase-end save (6 entries, orchestrator bucket) — s061 team-scaffold P1 build with live fleet; three entries are design data for P2/P3"
entries:
  - id: DL-001
    kind: difficulty
    description: "Spawned copilot peer (pij-shy-justine) answered in its own terminal instead of pij-send-ing back — pij spawn does not inject a reply-contract instruction (how to respond, to whom, via which verb) into the peer's boot turn; every orchestrator hand-compensates in packets (survey-documented). Live occurrence at s061 fleet spawn, observed by Jordan."
    fp: "0e8339877842"
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T10:44:23.847Z"
  - id: INS-001
    kind: insight
    description: "REFINEMENT of DL-001: the spawn boot turn DOES carry the reply instruction ('reply to your spawner with pij send ...') — the peer acknowledged in-transcript without executing the send. Instruction-as-prose is insufficient; compliance must be mechanical (mandatory first-action ack + receipt verification = exactly the W-002 brief-ack/pij-ack design, extended to the spawn boot turn). Design datum for P2."
    fp: "740721376e7e"
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T10:44:46.347Z"
  - id: DL-002
    kind: difficulty
    description: "Phase-edge boot raced the just-dispatched coder's TDD edits in the shared worktree (red tests are CORRECT mid-TDD, so a phase-edge boot after dispatch is unreadable). Ordering law for the scaffold skill layer: pre-flight boot completes BEFORE packet delivery; coder's own packet boot covers its side."
    fp: "941508617e23"
    disposition: plan
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T10:48:18.027Z"
  - id: DL-003
    kind: difficulty
    description: "Pre-flight harness boot hit unrelated daemon/channel test timeouts while typecheck passed"
    target: project
    severity: degrading
    workaround: "Run targeted phase tests during TDD and retry the full required gate at completion"
    suggested_encoding: "Quarantine or stabilize timing-sensitive daemon/channel tests"
    fp: "14e5f3b1e739"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T10:48:26.524Z"
  - id: DL-004
    kind: difficulty
    description: "dlg-0001 allowlist missed a production caller: recoverPendingOps signature widening reaches core/daemon/runtime-axis.ts + daemon.ts, but the packet allowlist (derived from the plan's Domain Manifest) enumerated only the CLI surface. Coder caught it and asked; ruled as addendum-1 (grant, mechanical threading). Lesson: when a task widens a shared signature, the allowlist should be derived from a grep of production call sites, not the manifest alone."
    target: tooling
    severity: degrading
    workaround: "Mid-phase scope ruling via two narrow addenda"
    suggested_encoding: "Task-packet validator tracing changed-function call sites into the generated allowlist"
    fp: "16a6bc545725"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T10:59:09.106Z"
  - id: CONF-001
    kind: confusion
    description: "T15 contention-flake family expanded in practice: daemon-push.test.ts joined the class (two 5s timeouts under full-suite load, green isolated 10.7s, failing set shifts run-to-run). Family is documented by signature not by file list — the triage brief names bridge/channel; gate rulings keep re-deriving membership per incident. A pinned 'known-flake manifest' (file+test+signature) would make gate reports mechanical."
    target: project
    suggested_encoding: "Machine-readable known-flake manifest keyed by test name + contention-only signature"
    fp: "3da42ec6f057"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T11:19:56.590Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 061-team-scaffold P1 (orchestrator bucket)

P1 (Records + stream/fence verbs) phase-end drain. DL-001/INS-001/DL-002 are
live design data already routed into P2 tasking (mechanical spawn-boot ack;
boot-before-dispatch ordering law) — disposition `plan`. DL-004 + CONF-001 pair
with coder-bucket record 002 (same frictions observed independently from both
seats — strong recurrence signal).
