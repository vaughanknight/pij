# P3 coder packet — Enforced tree + adoption (build leg)
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground ENTIRELY from files)

## Who you are
- s054 coder seat. ALL work in worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` (branch `s054/pij-grown-up`); your cwd is the CANONICAL repo — write-forbidden; absolute paths / `git -C` everywhere.
- Report ONLY via `pij send pij-civilian-takin "<message>"`.

## Mission — EXECUTE VIA THE BUILDER FLOW (fleet doctrine, spine Seq 444)
Run the implement verb — this is the mandated execution vehicle, not a suggestion:

```
/builder 6 implement --plan "/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up/docs/plans/054-pij-grown-up/pij-grown-up-plan.md" --phase "Phase 3: Enforced tree + adoption"
```

It consumes the validated dossier `docs/plans/054-pij-grown-up/tasks/phase-3-enforced-tree/tasks.md` (T001–T007) and owns the execution log + progress discipline. Follow the verb's own instructions (execution.log.md, per-task progress, `harness observe` on friction as it bites). This packet adds the pij-specific contract AROUND it — where the verb's generic guidance and this packet conflict, THIS PACKET WINS.

## Packet contract (binds around the verb)
1. **SW-7 (cross-stream, HIGH severity if violated)**: s051 is concurrently rewriting identity/ownership. Your diff must NOT touch `core/discovery.ts`, `core/current-session.ts`, `core/close.ts` (parent DERIVATION changes live at the cli.ts spawn/adopt call sites only). Every test = behavior contract (outcomes, never internal call shapes) — the dossier §SW-7 is binding.
2. **Fence**: `.pi/extensions/pij/core/**` (minus the three SW-7 files) · `.pi/extensions/pij/adapters/**` · `.pi/extensions/pij/cli.ts` · tests · `docs/plans/054-pij-grown-up/tasks/phase-3-enforced-tree/**`. daemon.ts is NOT expected in P3 — touching it requires a pre-write checkpoint (SW-6 window with s055 still applies). NEW paths: checkpoint-notify. Forbidden: package/lock, `government/**`, the-flow files, `skills/**`, canonical repo, real `~/.pij`.
3. **Dossier rulings are pre-made** — the validation folded three findings (root-link event shape; FULL-registry pane matching; denorm anchor). Implement as ruled; genuine disproof → log with evidence + checkpoint.
4. **P1/P2 laws unchanged**: uncoupled V-05 append pattern for the link event (runtime-axis template); no-throw dispatch; own-property guards; temp PIJ_HOME + phantom-peer; types.ts zero-import; fakes append-only; cli.test.ts legacy block frozen; biome clean on touched files.
5. **Ultracode**: allowed, cap 15 (R5 grant). TDD red-first per task regardless of vehicle.

## Gates (before completion checkpoint)
`just typecheck` · fenced `npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters` · FULL `npx vitest run` (release-age-policy flake out of scope — isolated-verify if hit) · live-bin smoke in temp PIJ_HOME (spawn-parent truth + link event + unadopted projection).

## Commits + checkpoints
Commit per task/pair in the worktree; NO push/PR (orchestrator owns). Checkpoint per committed pair: `pij send pij-civilian-takin "P3 CHECKPOINT T00x-T00y · <shas> · <gates> · <notes>"`; completion: `"P3 BUILD COMPLETE · <n> commits <first..last> · T001-T007 status · gates · SW-7 proof (diff --name-only clean of the three files) · observations"`.
