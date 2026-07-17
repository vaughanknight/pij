# Workshop 001 — data model: store, location, lookup, DAG
**Date**: 2026-07-16 · **Participants**: Jordan (ruler), pij-civilian-takin (s054) · **Status**: IN PROGRESS
**Prep/evidence**: `000-data-model-prep.md`, `research-dossier.md`

## Decisions

### WS-1 · Graph shape — ENFORCED TREE (decided)
**Selected**: single `parentId` per node; forest rooted at primes; non-prime without a parent is `unadopted` (a visible state driving adoption, never a boot blocker). Re-parenting mutates the one edge and records a spine **event** (history lives in events, not extra edges). `spawnedBy` retained as immutable provenance metadata, distinct from the governing parent.
**Rejected**: multi-parent DAG — no live dual-parent case; edge lists, DAG layout, and split task-authority all priced in for nothing. Relaxing tree→DAG later is additive; the reverse is a migration.
**Verbatim**: "yeah enforced tree is good"

### WS-2 · Project location — MACHINE-WIDE (decided)
**Selected**: projects live machine-wide at `~/.pij/projects/<slug>.json` (option B): instant cross-repo UI listing, projects can exist before any plan/repo, node↔project joins in one store. Record carries `{repo?: gitCommonDir, planPath?, primeId?, …}` as plain fields.
**Explicitly deferred**: repo-versioned anchor/mirror (option C) — revisit "if we feel data is lost"; design keeps the door open (nothing else may write project records, so a later repo anchor is purely additive).
**Verbatim**: "B, we can go C ish later if we feel data is lost"

### WS-3 · Governance spine — REPLACE, MACHINE-WIDE (decided)
**Selected**: JSON spine is the single source of truth, living machine-wide under `~/.pij` (with projects); human-readable markdown becomes a *generated render* (prime-flow pattern — nothing governance-bearing is ever hand-written in prose again). Existing repo `government/spine.md` freezes as an archive. Every event carries addressing fields (`peer`, `stream`/`project`, `repo`, `refs[]`) so per-peer filtering is a query, not a read-everything.
**Storage shape (ruled)**: ONE unified machine-wide store — a single global spine, all governance data kept together under `~/.pij`, events tagged by project/repo/peer (no per-project shard files).
**Verbatim**: "yeah replace, machine-wide." · "keep it all goether machine wdie"

### WS-4 · Read path — CLI NOW, UI READS FILES DIRECTLY LATER (decided)
**Selected**: the `pij` CLI (all verbs `--json`) is the query surface for agents/humans/scripts now — `pij project list/show`, `pij spine events --peer/--project`, `pij node show`, extending the existing `tree/list/state` JSON verbs. The future UI will read the `~/.pij` files **directly** (no daemon API planned).
**Binding implication**: the on-disk formats are therefore a PUBLIC, schema-versioned contract, not private internals — every record carries a `schema_version`; derived values a UI needs (liveness, effectiveParent/tree problems, context gauges) must be either materialized into the stored records by pij or specified precisely enough to re-derive (plan decides per field, favouring materialization so the UI stays dumb).
**Rejected**: daemon-served HTTP/socket API — not wanted.
**Verbatim**: "CLI. later UI will go direct."

### WS-5 · Write authority — OPEN ACTORS, ENFORCED CHANNEL (decided)
**Selected**: no per-actor ACLs ("it's not jail") — any actor (worker, orchestrator, prime, human) may set tasks, semantic states, project fields, spine events. The determinism invariant moves to the **channel**: every write goes through pij (CLI verbs / pi tools) — never a hand-edited file. pij stamps each write with actor attribution + timestamp as a spine/node event, so "who changed what" is always answerable after the fact (audit over permission).
**Retained mechanical exception (by nature, not ACL)**: `system_state`/liveness/pid/pane/model/context gauges are *computed* by pij's own probes — they have no meaningful external writer.
**Rejected**: per-field single-writer ACL table (prep D5) — replaced by attribution.
**Verbatim**: "anyone can write. its not jail. just use pij to do it"

### WS-6 · State model + authority posture — FLEET-AMENDED VOCABULARY, FREE-BUT-LOGGED (decided)
**Survey**: all three old primes replied (`reports/state-vocab-survey.md` + vendored replies) — two-axis split unanimously validated; unanimous #1 danger: self-claimed `done` (three independent false-done incidents).
**Selected — system runtime axis (pij-computed)**: `starting · working · idle · stalled · stopped · dead · unknown` — honest `unknown` over guessing (covers the copilot context/telemetry gaps too); lifecycle (`pending·bound·dissolved`) and adoption (`adopted·unadopted`) are separate projections, not runtime states.
**Selected — semantic axis (agent-set via pij)**: `blocked · question · hold · waiting · ready · failed · cancelled · done`, each with structured refs beside a free-text `stateNote`: `blockedOn[]`, question `target` (human|prime|peer-id), hold `issuer`+release condition, `waitingOn`+TTL, `ready` for-what (review/commit/pr/merge), evidence pointers, `verifiedBy` on done.
**Authority posture (Jordan ruling)**: ANYONE may write ANY of it through pij — no ACLs, no rejected transitions, agents stay free inside a guiding deterministic framework. Every write is an append-only attributed event (actor, timestamp, prev→next, refs). Safety is DERIVED, not enforced: unverified-done, foreign hold-clear, and axis-disagreement (semantic=working + system=idle > Nh — 1ca01u5's 44h lost-dispatch incident) are first-class queryable anomalies/alarms for primes and the UI. Guidance, never jail.
**Adopted design gems**: axis-disagreement alarm as a first-class query (1ca01u5); per-assignment semantic-state scoping considered at plan time (grotesque-mite — a seat can be done on A, waiting on B); death never implies done; stalled/dead alert, never auto-reclaim; event ack-and-purge so replayed notices can't resurrect state (1ca01u5's 24h replay incident).
**Verbatim**: "what about we allow anyone but log who did it... the reaon i am hesitatnt is i wan tto keep exploring the limits of pij and i want it to be pretty free what agents can do in a guiding determintic framework but not brea em"

## Status: COMPLETE — six decisions locked (WS-1…WS-6)
These decisions are authoritative for the plan pass. Open items deliberately deferred: repo-anchor mirror for projects (WS-2, "C-ish later"); per-assignment state scoping (design detail, plan decides); prime-flow.json E309 migration path (plan decides under WS-3's replace ruling).
