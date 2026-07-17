# Workshop prep — data model: store, location, lookup, DAG
**Status**: PREP ONLY — no decisions taken; options + evidence for the human-led workshop. Findings cite `research-dossier.md` (F-nn/H-nn).

## Inputs gathered since the dossier

### Context-telemetry spike (read-only, per harness)

| Harness | context-current source | Verified | Notes |
|---|---|---|---|
| pi | in-process (pij is a pi extension; session manager APIs) | design-known | richest + push-capable |
| claude | transcript JSONL `message.usage` — `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of newest assistant msg | ✅ probed live | transcript path derivable from `harnessSessionId` |
| codex | rollout JSONL `total_token_usage.total_tokens` (periodic events) | ✅ probed live | `transcriptPath` already on descriptor |
| copilot | events.jsonl shows only compaction `tokensRemoved` so far | ⚠️ partial | needs deeper event-kind inventory; schema must admit `unknown` |
| context-max | join `boundModel` → `.pi/models.json` `contextWindow` (13 models covered) | ✅ | F-10 |

### State-vocabulary survey (documentary — frequency in live spine + briefs)

hold 75 · frozen 57 · quarantined 44 · blocked 36 · dissolved 33 · waiting 32 · escalated 24 · **question 21** · stalled 17 · dead 16 · handoff 10 · retired 9 · paused 8.
Clusters cleanly into: **system_state** (pij-owned mechanical: working/idle/stalled/dead/dissolved/binding) vs **orchestrator state** (blocked · question · hold · waiting · quarantined) vs **governance-level** words that likely belong on projects/streams, not nodes (frozen · escalated · retired · handoff). Live fleet polling (vs this documentary pass) routes via the o-prime if wanted.

## Decision matrices (recommended default first)

### D1 — Store technology
| Option | For | Against |
|---|---|---|
| **A. Schema'd JSON, one file per record, atomic writes, single CLI writer (extend the proven registry pattern)** | matches F-01/H-02; zero new deps; git-diffable where versioned | joins/filters done in code; many-file scans |
| B. SQLite | real queries for UI | H-02 precedent against; single-file lock coordination across daemon+CLIs; not git-diffable |
| C. harness-flow overlays for everything | CLI writer + schema exist (F-08) | flow semantics (nav/spine) don't fit registry-shaped data; harness CLI becomes runtime dep of pij |

### D2 — Location per entity
| Entity | Candidate home | Rationale |
|---|---|---|
| node/runtime (descriptors, system_state, metadata, tmux) | `~/.pij` machine-wide (status quo) | peers span repos/worktrees; F-01 |
| **project** | repo-versioned `government/projects/<slug>.json` (single writer: prime via CLI) with a machine-wide index `~/.pij/projects/` mirror **or** pointer | projects reference plans (repo artifacts) but must be listable machine-wide for the UI; the bridge is `gitCommonDir` (F-02) |
| governance spine (events, decisions) | repo-versioned JSON `government/spine.json` (+ rendered .md), CLI-written (H-06: E309 taught hand-cranked JSON rots) | peer-filterable via `refs[]`/`peer` fields on events |
| node current-task | on the descriptor (additive field) with writer authority | it's runtime state; dies with the node unless projected into project task lists |
| project task lists | in the project record (prime/orchestrator-updated) | survives nodes; the ask says primes keep it, orchestrators update |

### D3 — Lookup / availability (the UI-shaped query surface)
| Option | For | Against |
|---|---|---|
| **A. `pij` CLI verbs, all `--json` (extend `pij tree/list/state` with `pij project list/show`, `pij spine events --peer <id>`), backed by direct file reads** | one authority (core code) computes projections (liveness, forest); UI shells out or reuses core lib | not a long-lived API |
| B. daemon HTTP/socket API | live push, one reader | new attack/ops surface; daemon restart baton pain (C6) |
| C. UI reads files directly | zero new code | duplicates projection logic (liveness, effectiveParent) outside core — drift |
| Availability notes | events.ndjson per node already exists for tailing; `watch` verbs exist for change notice | |

### D4 — DAG mechanics
| Question | Options (recommended first) |
|---|---|
| Shape | **Enforced forest (single `parentId`), primes as roots** — "proper DAG" satisfied trivially; multi-parent only if Jordan confirms a real case (spawner≠adopter is a *re-parent event*, not a second edge) |
| Parent invariant | non-prime without parent = `unadopted` (visible state driving adoption), never hard-blocked at boot (human spawns must stay legal) |
| Edge mutations | `pij link`/`adopt --parent` (exists, F-03) + re-parent audit trail (event, not extra edge) |
| Cycle/orphan handling | keep 046 projection flags; add enforcement at link-time only (cycle rejection exists) |
| History | edges-over-time live in the spine/events, not in the graph shape |
| Dependency | trustworthy parentage gated on s051 (H-03) |

### D5 — Writer authority (the determinism spine)
| Field cluster | Single writer |
|---|---|
| system_state, liveness, lifecycle, pid/pane/window, boundModel/effort, context* | pij daemon/core only |
| currentTask, orchestrator state (blocked/question/hold/waiting/quarantined) | owning orchestrator (verified identity, s051 authority) via new CLI verb + skill route |
| project records, spine events | prime (single government writer) via CLI |
| adoption/link edges | parent-to-be or prime; caller-verified (issue #20 fix) |

## Sharpest questions for Jordan

1. DAG vs enforced tree: any real case where a node needs two simultaneous parents?
2. Projects: repo-versioned (git history, per-repo) or machine-wide (~/.pij, cross-repo UI listing) — or repo-versioned + machine index?
3. Does the JSON spine replace `spine.md` outright (rendered .md becomes generated) or run beside it during migration?
4. Is `harness flow` acceptable as a runtime dependency of pij governance, or should pij own its writer CLI?
5. Orchestrator state vocabulary: adopt the surveyed five (blocked/question/hold/waiting/quarantined) or trim/extend?
6. copilot context-current may be unknowable — is `unknown` acceptable in the UI contract?
