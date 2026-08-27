# Thesis — jordan-spec (s393)

**Mode**: `fit` — target: the merged claude+copilot SQLite+sockets comms code on main `4a5cf85`; request: a standalone handoff spec for another Claude ("Jordan").
**Method**: `~/.agents/skills/thesis/SKILL.md` contract, applied by the seat (the skill is not Skill()-registered for Claude seats — DL-001 in s392 phase-1 report).
**Written**: 2026-08-28 by pij-dependent-ptarmigan, read-only, before any planning mutation.

1. Thesis: One self-contained technical document that lets a fresh agent own the SQLite-queue + socket/RPC/pointer comms path — architecture, wire frames, benchmarks, doctrine, every trap actually hit, and the open work — without needing any of the surrounding project context.
2. Now: The code is merged and live on main `4a5cf85` (PRs #1–#13); its knowledge is scattered across a 279-line review report, five sub-reports, seven adapters, the daemon loop, two how-docs, one plan folder, and PR bodies — and several of those still describe the PoC or a pre-fix state (inference: the `instanceof` gate, the fs-only pointer footnote).
3. Toward: `docs/specs/claude-copilot-sqlite-sockets-comms.md` on a PR, then the same text filed verbatim as a GitHub issue on `AI-Substrate/pij` after the o-prime's GO — Jordan reads the issue cold and can start on the outstanding list the same day.
4. Keep: Standalone and technical only — file:line anchors on merged main, no governance/orchestration/fleet/seat vocabulary; "huge is fine" but every claim must trace to source; the outstanding section must reflect the post-restart-#2 state (10b done; 13/15/16/17/18 open; Codex deferred).

My read: The work is curation with verification, not invention — the spec's value is that every mechanism, frame, number and gotcha is re-anchored to the merged tree rather than to the PoC branch or the review's pre-merge line numbers. "Right" feels like a document Jordan can grep against the repo and never find a stale pointer, with the traps section reading as field notes rather than a policy list. The main tension is scope discipline: the sources are soaked in governance framing, and the spec must strip all of it while keeping the technical residue intact.
