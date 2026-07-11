# T029 Review — restart-stable pij identity

**Reviewer**: `pij-1qiec0g` · Copilot CLI · GPT-5.6 Sol xhigh
**Method**: read-only pij peer; filesystem-tool canary passed before review
**Scope**: Plan 019 T029 paths only; concurrent FX002 daemon/adapter work explicitly excluded
**Verdict**: ✅ **APPROVE — no material findings**

## Acceptance reviewed

- Authoritative external `--session-id`; heuristic discovery is initial-adopt fallback only.
- Exact `(harness,harnessSessionId)` identity with durable restart recovery.
- Two-way collision isolation, rollback-safe claims, and no partial final files.
- Runtime re-attachment preserves durable metadata while replacing stale presence.
- Pi exact native id + role restoration across resume; `/new` and `/fork` remain new peers.
- Codex exact/readable rollout linkage.

## Findings reconciliation

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| 1 | HIGH | Distinct native tuples could claim the same pij-id. | **Addressed** — atomic reverse `pij-id → tuple` ownership; concrete legacy FNV collision regression. |
| 2 | HIGH | Pi restart retained stale pane/lifecycle/failure. | **Addressed** — non-reload boot replaces pane/state and clears lifecycle/failure. |
| 3 | MEDIUM | Descriptor removal lost role/creator/history metadata. | **Addressed** — durable identity snapshots hydrate removed live descriptors. |
| 4 | MEDIUM | Missing `--session-id` consumed the next flag. | **Addressed** — option-looking/empty values reject with `E-ARG`; RED→GREEN regression. |
| 5 | HIGH | Regular daemon spawn binding did not claim durable identity. | **Addressed** — first bound-descriptor `write`/`claim` ensures identity before publication. |
| 6 | MEDIUM | Hydrated Pi role was not restored to runtime/announce/BootResult. | **Addressed** — descriptor role is now runtime authority and re-export source. |
| 7 | MEDIUM | Explicit Codex adoption could lose transcript linkage. | **Addressed** — exact rollout resolution or clear `E-NOID`. |
| 8 | MEDIUM | Incompatible descriptor `EEXIST` left provisional identity claims. | **Addressed** — newly-created owner/tuple paths roll back on incompatible/failed publication. |
| 9 | MEDIUM | Failed Codex validation persisted identity first. | **Addressed** — validation precedes descriptor-owned identity claim; live proof left zero files. |
| 10 | MEDIUM | Existing but unreadable Codex paths were accepted. | **Addressed** — stored/discovered path must be a readable regular file. |
| 11 | HIGH | Pending/no-native adopt could overwrite an occupied `--id`. | **Addressed** — atomic pending descriptor claim; occupied ids return actionable `E-AMBIG`. |
| 12 | MEDIUM | `wx` directly on final descriptor could leave partial files. | **Addressed** — unique temp `open(wx)` → full write → `fsync` → close → atomic hard-link no-replace → cleanup. |

## Final proof

- Reviewer packet-scope suite: **231/231 green**.
- `just typecheck`: clean.
- Full `harness checks`: typecheck, lint, test, smoke, package audit, snapshots — **all green**.
- Live temp proofs:
  - descriptor delete → exact re-adopt recovered the same pij-id and metadata;
  - occupied pending adopt exited 2 and preserved the existing descriptor;
  - missing authoritative Codex rollout exited 2 with zero persisted files;
  - conflicting tuple claim rejected.

The reviewer was compacted immediately after the final verdict.
