# Post-flight — 132-spawn-reports-bind

**Closed out**: 2026-09-02T09:20:00Z
**Archived to**: `docs/plans/archive/132-spawn-reports-bind/`
**Shipped**: not yet

## Completion

| Check | Result |
| --- | --- |
| Phases / tasks | Complete; task gate 3/3 |
| Acceptance criteria | AC1a, AC1b, AC2, AC3, AC4, AC5, AC6 checked |
| Latest review | Claude Opus R5: APPROVE — ship it |
| Deterministic gates | Workspace 613; clippy pass; harness checks 8/8 |
| Live proof | Real OMP healthy/mismatch, child exit 23, structured refusal details |
| Production-copy proof | 72 proven-dead pending rows → 0 in one socket-aware cadence |

## Open / deferred items

All are non-blocking findings carried by the final review.

| Kind | Item | Where | Note |
| --- | --- | --- | --- |
| Deferred | R004 | `crates/daemon/src/lib.rs` | Codex has no binder; default wait can time out. |
| Deferred | R005 | `crates/cli/src/main.rs` | Success path recomputes daemon spawn fields client-side. |
| Deferred | R007 | `crates/daemon/src/pointer/worker.rs` | Narrow revive-window loss remains under three proven conditions. |
| Deferred | R008 | `crates/daemon/src/http/mod.rs` | No-wait/revive spawn evidence files are not cleaned. |
| Deferred | N5 | `crates/daemon/src/http/mod.rs` | Wait loop relies on registration's model-observation invariant. |
| Friction | R010 | reviewer packet / Flowspace | Stale `--mode semantic` instruction and branch index misses. |

Harness observations remain in the shared buffer for the o-prime-owned drain.
Pipeline learnings were encoded in `.agents-skills-port/pij-team/EXPERIENCES.md`.
