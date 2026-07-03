# Validation — phase-3-agent-pack-as-peer-pij-agent-spawn/tasks.md

- **Validated**: 2026-07-03 (first validation of this dossier)
- **Target**: `docs/plans/029-pij-agents-minih/tasks/phase-3-agent-pack-as-peer-pij-agent-spawn/tasks.md`
- **Contract sources**: plan v1.1.0 § Phase 3 + AC-14..18; `workshops/003-agent-pack-as-peer.md` (authoritative); control-plane seam map (3 parallel read-only scouts, file:line-grounded)
- **Verdict**: **VALIDATED WITH FIXES** — 3 MEDIUM findings, all repaired in-target and re-checked
- **Checks**: every plan task 3.1–3.8 maps to a T-row; AC-14..18 each have covering tasks with effect-level Done-Whens; TDD ordering (T001–T005 red-first before wiring T006–T008); critic spot-checked the load-bearing file:line seam claims against source (buildControlSpawnCommand env :290-302, tmux `-e` :100-102, FsChannel.deliver :43-55, resolveSelf :77, planClose :57-76, parseSpawnArgs :459 — all accurate); `~/.pij/<id>/` data-dir vs `<id>.json` descriptor layout confirmed non-colliding (types.ts:52, fs-registry.ts:15-28)
- **Thesis / proof**: Implementation Ready — an implementor gets exact seams (no invented file/symbol claims survived), workshop conformance is checkable per task, and the two field-proven lessons (DL-001 literal-command packets, fix-0001 effect-tests-per-flag) are structurally applied

## Findings (one independent critic; lead-verified against source)

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | Frontmatter `lifecycle: once` path had no covering effect test and T006 didn't bind `agentOnce` to `lifecycleFor()`'s output — `agentOnce: !!cmd.once` would pass every listed test yet break half of AC-16 | T005/T006/T008 rows pre-repair; AC-16 wording | fixed — T006 now mandates `agentOnce := lifecycleFor(cmd, meta) === "once"` + Done-When asserts frontmatter-once-no-flag → `agentOnce: true` |
| MEDIUM | T009 live gate omitted the self-identity precondition: `spawnedBy` is stamped from the *caller's* `resolveSelf` (cli.ts:483-484,599); a bare test process → undefined spawner → report round-trip cannot complete | runSpawn source; T007's no-spawner error path | fixed — T009 precondition added (driver sets `PIJ_SESSION_ID`/adopts); T006 notes the spawnedBy stamping |
| MEDIUM (high confidence) | SendBuffer mis-attribution: the pre-bind packet is NOT buffer/flushed — `drainInbox` runs only for bound+owned sessions (daemon.ts:99-110), so the spawn-time inbox message persists and is injected on the first post-bind drain; SendBuffer covers only the send-outruns-bind edge within a drain | router.ts:38-44, loop.ts:388-389, daemon.ts:99-110 | fixed — seam map, T006, and workshop 003 D2 reworded to the inbox-persist mechanism (outcome identical; mechanism now accurate) |

## Re-check

Repaired rows re-read for internal consistency: T005's `lifecycleFor` is now consumed by name in T006; T009's precondition references the same cli.ts lines the critic proved; no remaining SendBuffer delivery claims in dossier or workshop.
