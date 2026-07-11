# Phase 1 tasks — pij orchestration baton (mirror of the plan's inline table)
**Source of truth**: `../../pij-orchestration-baton-plan.md` § Implementation (Simple mode — this file materializes the inline table for the delegation engine; on drift, the plan wins).

**Store layout** (machine-wide, `PIJ_HOME/orchestration/`): `batons/<name>.json` (definition: resource, probe?, repo?, createdBy + queue of `{id, requester, purpose, pin?, declaredEvidence?, requestedAt}` + lease metadata) · `batons/<name>.lease` (atomic `wx` no-replace file = the single-holder truth: `{leaseId, holder, purpose, pin?, grantedBy, requestedAt, grantedAt}`) · `log.ndjson` (append-only machine lines).

**Posture (ruling #7)**: honor system — any peer may grant/reclaim; firm guides never hard-block. Only single-holder atomicity and `E-PIN`-without-`--repin` exit non-zero.

**Verbs**: `pij orchestration baton define|list|show|request|grant|return|reclaim` (+ `--json` everywhere; `orchestration` intercepted in the bin like `agent`).

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Domain setup: domain.md, registry row, domain-map node/edges | pij-orchestration | `docs/domains/pij-orchestration/domain.md`, `docs/domains/registry.md`, `docs/domains/domain-map.md` | registry + map reference the new domain; boundaries match the plan's § New Domain Sketches | |
| [x] | T002 | Core tests: lease lifecycle decisions — request→queue, grant (free/held/pin-mismatch/repin), return, reclaim, blocked-time calc, alert-once-per-transition input shaping | pij-orchestration | `.pi/extensions/pij/core/orchestration/baton.test.ts` | failing suite covers AC-01/03/04/05/06 decision logic | tests first (TDD) |
| [x] | T003 | Core impl: pure module — tagged-union results, injected clock, local ports (`BatonStorePort`, notice sink) | pij-orchestration | `.pi/extensions/pij/core/orchestration/baton.ts` | T002 green; no `@earendil-works/*` imports (P2) | mirrors `core/daemon/lock.ts` shape |
| [x] | T004 | Store adapter tests: `wx` lease create/race (two writers → one wins), JSON tmp+rename swap, ndjson append, corrupt-file tolerance | pij-orchestration | `.pi/extensions/pij/adapters/baton-store.test.ts` | failing suite proves AC-01 atomicity + AC-07 log lines on real fs (tmpdir) | |
| [x] | T005 | Store adapter impl | pij-orchestration | `.pi/extensions/pij/adapters/baton-store.ts` | T004 green | claim pattern per `fs-registry.ts` `publishNoReplace` (~:329-350) |
| [x] | T006 | Verb-family parse tests: full arg grammar, `--json`, E-ARG arity/flag cases, exit codes | pij-orchestration | `.pi/extensions/pij/core/orchestration/cli.test.ts` | failing suite enumerates every verb's grammar | |
| [x] | T007 | Parse + dispatch impl + bin intercept + USAGE block row | pij-orchestration / pij-control-plane | `.pi/extensions/pij/core/orchestration/cli.ts`, `.pi/extensions/pij/cli.ts` | T006 green; `pij orchestration baton --help` prints family usage | intercept mirrors `agent` (cli.ts:1812); cli.ts edits ADDITIVE-ONLY |
| [x] | T008 | Notice tests: grant/request/return/alert pushes via fake delivery; receipt state surfaced in command output; daemon-down → `unverified`, never fake success | pij-orchestration | `.pi/extensions/pij/core/orchestration/baton.test.ts` (extend), `.pi/extensions/pij/adapters/fakes.ts` | failing suite covers AC-02/AC-09 | fakes.ts additive |
| [x] | T009 | Notice impl: wire delivery/receipts through the existing channel | pij-orchestration / pij-messaging | `.pi/extensions/pij/core/orchestration/baton.ts`, `.pi/extensions/pij/adapters/baton-store.ts` (log), channel wiring in `.pi/extensions/pij/cli.ts` | T008 green | reuse `core/receipts.ts` vocabulary; no new transport |
| [x] | T010 | Sweep tests: holder pid/session dead or stalled → exactly one alert decision per transition; healthy/unknown → no-op | pij-orchestration | `.pi/extensions/pij/core/daemon/baton-sweep.test.ts` | failing suite covers AC-04 | pure, injected liveness |
| [x] | T011 | Sweep impl + daemon wiring — CODE + TESTS ONLY; do NOT restart the daemon (orchestrator owns the baton-gated live-verify window) | pij-orchestration / pij-control-plane | `.pi/extensions/pij/core/daemon/baton-sweep.ts`, `.pi/extensions/pij/daemon.ts` | T010 green; daemon.ts edit ADDITIVE-ONLY | live verify is NOT this task |
| [x] | T012 | Docs: how-doc + verb row | pij-orchestration | `docs/how/pij-orchestration-baton.md`, `docs/how/pij.md` | verbs, store layout, honor-system posture, book interplay documented | |
| [x] | T013 | Gate sweep: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check` + `harness checks --quick` | (all) | all green incl. FX001/FX002 + 035 regressions | AC-08 | |

**Excluded from this delegation**: T014 (ritual update — ship-time, orchestrator-owned, fence-gated). Daemon restarts. Any commit (`git commit` is orchestrator-owned under the git-index baton — leave the tree dirty).
