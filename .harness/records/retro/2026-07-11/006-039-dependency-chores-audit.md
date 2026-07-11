---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T12:31:49.948Z"
agent: copilot
plan_id: "039-dependency-chores-audit"
schema_version: "1.2"
retro_id: "2026-07-11T12:31:49Z-copilot-530625"
started_at: "2026-07-11T11:57:10.918Z"
ended_at: "2026-07-11T12:31:49.948Z"
summary: "Plan 039 reduced npm audit from 34 findings with one critical to 26 minih-root findings with zero criticals, while the shared-tree government exposed several reusable orchestration and proof improvements."
entries:
  - id: COORD-001
    kind: coordination
    description: "Government requires git-index and daemon-restart through the live baton primitive, but the machine baton store defines only the plan-036 scratch baton, so governed commit/restart requests fail E-NOBATON"
    target: project-sensor
    severity: blocking
    workaround: "Escalate to o-prime for baton definition or a book-based window"
    suggested_encoding: "Bootstrap canonical government batons into the primitive when government is created or reconciled"
    fp: "241d6889ff1c"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T11:57:10.918Z"
  - id: WIN-001
    kind: win
    description: "Plan-039 validation disproved the initial disjoint root model: ws remained reachable through minih/ink after the Pi bump, and tsx kept an esbuild advisory after Vitest 4. A scratch lock probe found the deterministic extra updates (tsx 4.23/esbuild 0.28.1 and ws 8.21) needed for the honest 34→26 target."
    fp: "fb88a7589183"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T11:58:04.057Z"
  - id: DL-001
    kind: difficulty
    description: "Plan-039 pre-build boot was blocked by seven active s038 prime-designation test failures outside the granted dependency fence; the full gate cannot distinguish sibling in-flight reds without an o-prime ruling."
    fp: "d41f71d3ecc3"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:07:28.570Z"
  - id: COORD-002
    kind: coordination
    description: "Phase 2 TDD reds transiently blocked sibling s039 pre-build boot; shared-tree yields need an exact expected-red disclosure so concurrent streams can distinguish intentional RED from regression"
    target: project-sensor
    severity: degrading
    workaround: "Relay exact expected-red test names/count at every yield while the sibling package window is open"
    suggested_encoding: "Add a shared-tree expected-red declaration field to stream packets/checkpoint reports or harness boot output"
    fp: "0fbc69e4a0b4"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:09:04.523Z"
  - id: DL-002
    kind: difficulty
    description: "The /pij pair contract requires persisting coder/reviewer roster entries before use, but the current flow-pair CLI exposes no roster mutation command and run.json contains no roster field. Ownership falls back to pij creator metadata and plan reports."
    fp: "281a50406cdb"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:09:25.604Z"
  - id: COORD-003
    kind: coordination
    description: "A Phase 2 fenced documentation file changed from another writer while the coder was patching it, requiring path freeze and o-prime sequencing in the shared worktree"
    target: project-sensor
    severity: degrading
    workaround: "Freeze the path, continue disjoint tasks, inspect the incoming diff, and await the single-writer ruling"
    suggested_encoding: "Add owner/stream attribution to file-watch notices or a shared write-intent sensor for granted fence paths"
    fp: "9e1dc7b0f059"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:10:11.558Z"
  - id: INS-001
    kind: insight
    description: "The apparent docs/how/pij-prime.md fence collision was a same-coder write reported as external; ownership attribution, not concurrent editing, was the actual observability gap"
    target: project-sensor
    suggested_encoding: "Include writer/session attribution in file-change notices or worker coordination reports"
    fp: "eb31d4cdd335"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:10:45.002Z"
  - id: CONF-001
    kind: confusion
    description: "Copilot coder process args and pij boundModel correctly reported claude-sonnet-4-6/xhigh, but the live pane footer still displayed GPT-5.6 Sol after a successful inference. Process/registry evidence is more reliable than the footer for this harness state."
    fp: "a50ae6066f9f"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:11:32.222Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Fence-diff classification copied a NEW label for docs/how/pij-prime.md without probing git/path existence; the file had been tracked since Plan 035"
    target: project-sensor
    severity: annoying
    workaround: "Probe test -e and git log before labeling each requested fence path create versus modify"
    suggested_encoding: "Add existence-probing to plan Domain Manifest/fence-diff validation and the o-prime grant ritual"
    fp: "eebbd0b85184"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:11:53.502Z"
  - id: DL-003
    kind: difficulty
    description: "flow-pair observe dlg-0002 failed because it scans the entire shared dirty worktree and rejects an unrelated forbidden government flow file, even though the delegation changed only allowed Plan-039 surfaces. Diff capture needs an allowed-path or baseline-SHA mode for concurrent streams."
    fp: "ed940a55a52f"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:15:41.893Z"
  - id: GFT-001
    kind: gift
    description: "Pre-review harness boot is red because live adapter tests still use the Vitest 3 test(name, fn, options) signature after Vitest 4 upgrade."
    target: ".pi/extensions/pij/core/agents/adapters/adapters.live.test.ts"
    severity: degrading
    suggested_encoding: "Add a test or lint guard that rejects the removed third-argument Vitest signature."
    fp: "4f229839cea1"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:18:09.871Z"
  - id: DL-004
    kind: difficulty
    description: "npm dependency replacement briefly removed minih from node_modules and severed the live pij control plane, causing a peer send retry. Package mutations can interrupt the orchestration substrate they are using; atomic install sequencing and retry-aware notices would reduce this recursive failure mode."
    fp: "5bd13a17df7e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:26:25.420Z"
  - id: SUGG-002
    kind: improvement-suggestion
    description: "Git-index baton return succeeded but omitted commit evidence; future returns should pass --evidence with the governed SHAs so release notice and proof travel together."
    fp: "c8d8fef9e6ac"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:30:37.113Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Plan 039 dependency chores audit

The highest-leverage improvement is a concurrent-stream aware proof layer: expected-red declarations plus allowed-path/baseline-SHA diff capture would remove most of the inference and o-prime adjudication this window required.
