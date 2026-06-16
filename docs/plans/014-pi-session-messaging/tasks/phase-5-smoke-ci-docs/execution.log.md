# Phase 5 — Execution Log (Smoke + CI + docs)

> Plan: `docs/plans/014-pi-session-messaging/pi-session-messaging-plan.md`
> Dossier: `tasks/phase-5-smoke-ci-docs/tasks.md` (VALIDATED WITH FIXES, `a2828bb`)
> Mode: **Full + `--companion`** (`code-review-companion`)
> Companion run: `2026-06-16T07-35-17-071Z-e04a` (booted with `MINIH_PROJECT_ROOT` set — MH-001 mitigation)

---

## T000 — Harness pre-flight (`--event pre-implement`)

Router present at `~/.agents/skills/eng-harness-flow/SKILL.md`, but the repo is
**unadopted** (no `.harness/engineering-harness.md` governance doc) — identical
`degraded` posture to Phases 1–4. Per the dossier T000 ("document once, proceed")
and the prior-phase precedent: seam outcome = **standard testing** (vitest + `just`
gates + the Driver smoke). Best-effort, non-blocking. Not re-warned per phase.

---

## T001 — Resolve D-A (two-session smoke design) + `PIJ_HOME` override

**Grounding**: the Driver `Step` union (`harness/driver/session.ts:28`) is TUI-only
— `type`/`press`/`paste`/`wait`/`sleep`/`capture`. A Scenario cannot shell out to
`pij` and assert stdout; it can only scrape the pi pane. And both `index.ts:26` +
`cli.ts:19` hardcoded `pijHome = ~/.pij` (no sandbox → any smoke would pollute the
real home).

**Decision (D-A)** — a literal "two real pi windows + assert via TUI" smoke is both
non-deterministic (real-pi timing) and impossible to assert through (TUI-only
steps). Instead:
1. **`PIJ_HOME` override** (this task) — `process.env.PIJ_HOME ?? join(homedir(),
   ".pij")` in both `index.ts` + `cli.ts`. Additive, default unchanged. Enables a
   sandboxed home for any test/smoke; no behaviour change in normal use.
2. **CLI integration test** (T002) — prove the two-peer act/observe protocol
   (`list --here` / `send` → inbox / `tail --since` / `state` / receipt) against
   the **real built `cli.ts`** in a tmp `PIJ_HOME` seeded with fixture peers.
   Deterministic, runs in `just test` → **CI** — which also relaxes **D-B**: most
   of AC-1..11 + AC-13 become CI-provable, not just local.
3. **Driver `/pij` smoke stays** as the in-pi boot/announce proof (local-only,
   tmux+pi).

**Evidence**: `npx tsc --noEmit` clean; `PIJ_HOME=$(mktemp -d) just pij list` →
"no pij sessions"; bare `just pij list` → real home (3 sessions, ★ = self). Commit
captures `index.ts` + `cli.ts`.
