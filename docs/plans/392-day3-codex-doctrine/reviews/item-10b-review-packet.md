# Cold review packet — item 10b (pane-misbind bind guard + shared resolver) · CORE DAEMON, high-stakes · terminal-once
**Commit**: `c49806e` · **Diff**: `git show c49806e` (12 code files, 507+/80-) · **Base**: main + item-10a · **Rubric**: flow-pair review-rubrics.md (Dim-0 MANDATORY) · **C10**
**Fence**: core daemon delivery/binding. **Allowed**: READ anything; WRITE only `reviews/item-10b-review.md`. Own throwaway worktree + node_modules symlink to run vitest.

## Contract
The resolution/bind half of the pane-misbind incident: ONE `resolveLivePane` (lifecycle-filtered, E-AMBIG on >1) across every pane→id site; a source SWEEP rejecting new ad-hoc `.paneId ===` resolvers; a loop.ts bind guard (refuse `dissolved`; require the pane to run THIS seat's session-id — copilot `isCopilotSessionId`, `identity.cause === "session-id-match"`); an incident replay.

## Dim-0 — the load-bearing question (orchestrator did partial, YOU complete it)
- **Resolver**: mutate `isPaneDeliveryTarget` → true → index-state "terminal descriptor cannot overwrite the fresh seat that reused its pane" goes RED (orchestrator confirmed 2 RED). Non-vacuous.
- **Bind guard**: mutate `identity?.cause !== "session-id-match"` → false → loop.test "planned binding refuses a pane whose harness process names another session" goes RED (orchestrator confirmed). Non-vacuous.
- **⚠ INCIDENT REPLAY (daemon.test.ts) — CHECK NON-VACUITY**: orchestrator mutated BOTH guards and the incident replay stayed GREEN. The seat is pane-less + dissolved, so pre-existing `pending()`/`bound`-only filters may already exclude it, making the replay pass trivially regardless of the 10b guards. Determine: does the replay actually EXERCISE a 10b guard (mutate the specific thing it should depend on and confirm RED), or is it belt-and-suspenders? If vacuous, that's a finding (strengthen it to drive the reused-pane resolution path the incident's CLASS is about, or assert on the guard directly).
- **SWEEP**: the report says it found 9 ad-hoc sites (3 beyond the packet's 6). Confirm the sweep FAILS if a new unfiltered `.paneId ===` is added (mutate: add one) and that its allowlist (shared resolver + pending/ready occupant check) isn't so broad it lets a real bypass through.
- **E-AMBIG**: `resolvePane` now returns `Result` — enumerate every caller and confirm each handles `E-AMBIG`/error (a caller that treats `!ok` as "no match" could mis-route on ambiguity).

## Gates first-hand
`npx vitest run .pi/extensions/pij/` (3974/15 skip); `just typecheck`. Out-of-fence lint/smoke reds pre-existing.

## Verdict → `reviews/item-10b-review.md`; report {summary,verdict,path}. Terminal-once.
