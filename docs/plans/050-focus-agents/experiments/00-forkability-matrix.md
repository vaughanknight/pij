# s050 focus-agents — 4-harness forkability matrix (Phase 1 deliverable)
**Stream**: s050 · **Seat**: pij-bored-pelican · **Date**: 2026-07-14 · **Status**: research COMPLETE → STOP for human direction
Per-harness detail: `pi-findings.md` · `claude-findings.md` · `copilot-findings.md` · `codex-findings.md` (this dir).
Every verdict independently containment-verified (ownership #19/#20 correlation, main non-gov tracked hash exact-unchanged, real-store inventory where relevant).

## Verdict: ALL FOUR FORKABLE — but via four different mechanisms

| Harness | Verdict | Fork mechanism | Snapshot immutable | Cold recall | Provenance | Secrets in session | Worktree boot |
|---|---|---|---|---|---|---|---|
| **pi** | ✅ FORKABLE (native) | `pi --fork <path\|id>` → new UUID | ✅ (SHA held ×2) | ✅ verbatim | `parentSession` back-pointer | **clean** (cwd/id/version only) | ❌ **impossible (#21)** |
| **claude** | ✅ FORKABLE | `claude --resume <id> --fork-session --session-id <new>` | ✅ (2b0ae703 ×2) | ✅ verbatim | ❌ none (rewrites sessionIds) | `gitBranch` embedded | ✅ OK |
| **copilot** | ✅ FORKABLE (degraded) | `cp -R` session dir + rewrite `events.jsonl` sessionId + patch `workspace.yaml` + `--resume` | ✅ (101060e6 ×2) | ✅ verbatim | ❌ (skip rewrite → mis-attribution) | system prompt + AGENTS.md + paths | ✅ OK |
| **codex** | ✅ FORKABLE (degraded) | copy rollout (filename UUID) + `codex exec resume <id>` → new continuation id | ✅ | ✅ verbatim | ❌ continuation id not pinned; self-containment unproven | (see codex-findings) | ✅ OK |

## Cross-harness invariants (the load-bearing product signals)

1. **FORK, never resume-in-place.** On ALL four, a bare resume/`--session` MUTATES the source. `focus launch` must always fork/copy first, never resume the golden session directly. This is the single most important product rule.
2. **Snapshot immutability holds everywhere** — a copied/forked session leaves the donor byte-identical (verified by SHA across ≥2 forks on pi/claude/copilot). Good: `focus save` can store one immutable blob and stamp many launches.
3. **Verbatim cold recall works on all four** — the core premise (relaunch an agent at its golden context) is real and universal.
4. **No universal fork primitive → `focus` needs a per-harness adapter**, not one code path. Storage shape, id-rewrite needs, provenance, and secret handling all differ.
5. **Provenance is DIY on 3 of 4** — only pi records a `parentSession` back-pointer. claude/copilot/codex lose the link on fork, so `focus` must track lineage externally (a manifest).
6. **Secret boundary varies** — pi is clean; claude embeds `gitBranch`; copilot embeds the full system prompt + AGENTS.md + workspace paths; codex TBD. `focus save` needs a per-harness redaction/awareness step (not one-size).
7. **Worktree boot is a pi-only blocker (#21)** — pi extension-doubling makes worktree boot impossible; claude/copilot/codex boot fine. `focus launch` for pi must boot from a clean checkout (or fix doubling); the others are location-flexible.
8. **Research-worker own-session-leak (copilot, codex)** — a real-store worker leaves its OWN bound session in `~/.copilot`/`~/.codex`. Probes MUST use a scratch HOME (proven: 0 probe leak on codex with mandatory `CODEX_HOME`). For the product this means `focus save` reads a session; `focus launch`'s isolation model must be explicit per harness.

## Lifecycle prereqs banked (from the detour, all product-relevant)
- Fresh worktree needs `npm ci` + a trust-folder accept before pi runs (issues surfaced pre-experiment).
- pi worktree boot blocked by local `.pi/extensions` × global `~/.pi/agent/extensions` symlink doubling (#21).
- copilot/codex isolation requires a relocated HOME (`COPILOT_HOME` / `CODEX_HOME`).

## Containment ledger (every experiment)
- pi: main diff attributed 100% to prime government writes; worker clean. claude: non-gov hash exact-unchanged, zero residue. copilot: exact-unchanged; first-plant deviation remediated; only residue = worker own session. codex: exact-unchanged; real store +1 rollout = worker own session only, 0 probe leak.

## Recommendation for human (NO planning done — awaiting direction)
All four harnesses can back a `focus` feature. The design question the human should rule on next:
one `focus save/list/launch` surface with **four pluggable harness adapters** (fork mechanism +
provenance manifest + redaction + boot-location rule each), starting with **pi** (native, cleanest)
and **claude** (well-understood), then the degraded **copilot/codex** recipes.
