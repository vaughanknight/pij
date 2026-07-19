# HANDOFF (pre-compaction) — spine truncation + DEPLOY-PROVENANCE finding

**Author**: pij-civilian-takin (s057 orch). **Date**: 2026-07-19. Written just before a forced compaction.

## THE BIG FINDING — deploy provenance (report to dove; not yet reported)

`pij` (the CLI) runs the **CANONICAL checkout, NOT the s057 worktree**:
- `~/.npm-global/bin/pij` → `~/.npm-global/lib/node_modules/pij` → `/Users/jordanknight/pi-hacking/pij` (canonical, on **main @ 9b2ee56**).
- The bin (`harness/scripts/pij-cli.cjs`) resolves `cli.ts` relative to its own dir = canonical.
- Symlink re-created **19 Jul 15:32** (recent — likely a re-link drifted it to canonical).

**Consequence**: every CLI fix I landed in the worktree — `close` (becf7f9), `baton filed-as` (faf06c5), the spine drain, anomalies queries — is **NOT live for `pij` users**. Only the **daemon** (ps-verified from worktree) and the **pi in-process extension** dogfood the worktree. The CLI is the odd one out. This undercuts the CLI-dogfood premise and is why our "verified live" confidence for CLI verbs was misplaced (I only ever verified via worktree tests / ps, never the live `pij` command).

**Recommendation to dove**: re-link the `pij` bin → the s057 worktree (restore CLI/daemon parity), OR merge s057→main (updates canonical). Until then, the truncation (and all CLI fixes) won't reach `pij` users.

## The spine truncation — diagnosed

- `pij spine events --json | wc -c` = 65536 (truncated); file redirect = 1,110,867 (full). Classic pipe-exit race.
- **Root of the LIVE bug = deploy-provenance**: canonical cli.ts has a **bare `process.exit()`** (pre-5db11c1) → truncates. The **worktree already has 5db11c1's `stdout.write("", () => process.exit())`** fix, which **WORKS** (proven: empty-write handles the 1.1MB payload through a delayed reader, 1124078 ×3).
- So my worktree cli.ts change (`process.exitCode = res.exitCode` at ~line 3017) is a **HARDENING / refactor** to the canonical Node pattern — proven full, cleaner — **but NOT strictly a bug fix** (the empty-write already worked). No downside; strictly clearer.

## UNCOMMITTED worktree changes (survive compaction; decide + commit post-compaction)

1. `cli.ts` ~3017: `process.stdout.write("", () => process.exit(res.exitCode))` → `process.exitCode = res.exitCode;` (hardening). **KEEP or REVERT** — lean KEEP (clean canonical pattern, proven). Honest: empty-write also works.
2. `cli.integration.test.ts` ~1650: the drain test was **VACUOUS** (execFileSync drains eagerly → passed on worktree's working code while `pij` ran canonical's broken code). Strengthened to run through a **delayed reader** `( sleep 0.5; cat )` — now catches the **bare-exit** regression (fails at `full > 200_000`). Verified: bare-exit mutant FAILS, empty-write + my-fix PASS. Never red-flakes (my fix always drains fully to a consuming reader). **KEEP.**

## POST-COMPACTION TODO (spine)

1. Decide keep/revert cli.ts hardening (lean keep).
2. Run FULL suite (was green 2997 before these two edits; biome + tsc were clean on cli.ts).
3. Commit cli.ts (if kept) + the strengthened test.
4. **REPORT the deploy-provenance finding to dove** — the important one.

## PARKED: INS-004 caller-identity consolidation (gated on s051 merge)

Fully designed + dove-approved + hyena-locked. Design of record:
`docs/plans/057-.../reports/ins004-caller-identity-consolidation-design.md` (HEAD e02d5c0).
- Canonical resolver = **s051's `resolveCaller`** in core/discovery.ts, extended **additively** (do NOT fork a new resolver). dove D1: s051 lands first, s057 increment on top. hyena hands base SHA when its cumulative commit exists.
- Contract locked: `fallbackPolicy?: "folder-lone-local"|"none"` (default folder-lone-local; `none` disables only the cwd step); source `"pid-ancestry"`; `selfPid` + `parentPidOf: (pid)=>Result<number|null>` on `ResolveCallerInput`; internal `resolveByPidAncestry`; **pid runs only when pane ABSENT** (present-ambiguous stays E-AMBIG); `validateIdentityAuthority` adjudicates; NO IndexState hook; `paneConflictPolicy` default `fail`, optional additive, no opt-in.
- D2 harm-split tail (dove-endorsed as-is): **`none`/fail-loud** for close/parent-derivation/branch/agent-report/agent-spawn/compact-self/watch-unwatch; **`folder-lone-local`** only for selfId send + focus-save. Parent-derivation = `none` HARD INVARIANT (#20).
- ROUTE: 6 weak (cli.ts 999/1064/1266/1489/1522/2714) + 3 strong-dupe (2280 orchestrationSelf, core/cli.ts:1136 selfId, spawn.ts:596 deriveCallerParent as delegates + 2597 inline dupe). doNotRoute: 10 (--here view filters, pane-geometry, target lookups, native-ambient).
- Interim close fix already landed: **becf7f9**.
- STEP 0 = land the canonical resolver (pure, pid off) — GATED on s051 merge + hyena SHA. Nothing implements until then.
- Backups from mutation testing are in the session scratchpad (cli*.bak) — ignore; cli.ts is restored to my fix.

## Other parked
- inbox-poll-stalled detector LIVE in daemon (worktree), verified. Field/kind shared with hyena s051 (lastInboxScanAt / inbox-poll-stalled).
- Deferred low-priority: `filed as:` echo on grant/return/reclaim (bundle when next in orchestration/cli.ts).
- posture: dove = o-prime + governance/restarts; me = CLI/skill loop; collecting.
