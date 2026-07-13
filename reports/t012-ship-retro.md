# T012 / ship retrospective — real pij trees

**Session window**: 2026-07-13 06:50–21:40 +10:00
**Plan**: `046-pij-real-trees`
**Primary outcome**: durable tree core → persistence → old-prime → production CLI →
skill/docs → deterministic smoke and scratch topology proof.

## Timings and flow

| Segment | Outcome |
|---|---|
| 06:50–07:52 | adopted human pane, prime orientation, research, unified plan, cold validation, backpressure survey |
| 07:53–09:10 | T001-T004 tree/repository core, review fix loop, draft PR #13, hosted green |
| 12:27–13:06 | T005-T006A persistence, mutation-gap fix loop, hosted green |
| 13:12–13:41 | T007-T008 old-prime transitions, hosted green |
| 15:44–18:23 | T009-T010 production tree/link/adopt CLI, rebase over merged streams, hosted checkpoint |
| 18:35–20:47 | T011 skill/docs/domain sensor-first tranche, review correction |
| 20:51–21:40 | T012 scratch topology + smoke hermeticity, two failed approaches, full green |

## Structured observations

### DL-001 — duplicate global + local registration / poor provenance

- **What happened**: `pi --approve` loaded `~/.pi/agent/extensions/*` and project
  `.pi/extensions/*` simultaneously. Identical tools conflicted and Pi exited status 1;
  Driver only reported a vanished pane.
- **Failed approach**: treat the trust prompt as the sole smoke blocker.
- **Workaround**: capture a remain-on-exit pane to reveal extension collision errors.
- **Permanent encoding**: smoke defaults to `--no-extensions` plus explicit sorted project
  extension entries.

### INS-001 — hidden cross-extension smoke contract

- **What happened**: loading only each scenario-adjacent extension made the `todo` smoke fail,
  because it intentionally calls `/sql` from `session-sql`.
- **Failed approach**: scenario-local isolation.
- **Workaround**: enumerate all top-level local extension indexes once.
- **Permanent encoding**: complete inventory resolver + test covering sorted exhaustive loading.

### DL-002 — ambient discovery non-hermeticity

- **What happened**: smoke behavior depended on machine-global extension symlinks.
- **Workaround**: disable ambient discovery.
- **Permanent encoding**: explicit project-local inventory makes smoke deterministic across
  machines and preserves cross-extension composition.

### INS-002 — trust and isolation are separate controls

- `--approve` answers project trust.
- `--no-extensions` controls ambient discovery.
- Explicit `--extension` controls the tested payload.
- **Encoding**: resolver tests assert all three dimensions independently.

### DL-003 — package-audit timestamp churn

- **What happened**: every quick/full gate refreshed five `.pi/packages.yaml#vetted.date`
  fields despite report-only audit semantics.
- **Workaround**: prove date-only, restore byte-identical owner-side, never ask workers to
  touch package state.
- **Permanent encoding candidate**: make report-only audit avoid writeback unless findings
  or an explicit refresh flag require it.

### WIN-001 — scratch hash / parent-only proof

- Isolated `PIJ_HOME` copied exact live descriptors.
- Before/after comparison proved the structural link changed only `parentId`.
- `spawnedBy` ownership and all unrelated metadata survived.
- **Reusable proof shape**: descriptor hashes + structural comparison + exact command/output.

### GFT-001 — scratch-first versus post-merge-live split

- Stage A proved reviewed code with zero real-registry mutation.
- Stage B is intentionally deferred until merge/canonical deployment.
- This split preserved safety without weakening Jordan's requirement for a real live tree.

### MW-001 — exact command / extension-inventory diagnostics

- **Magic wand**: Driver boot failures should report the launched argv, pane-dead status, and
  last captured output automatically instead of collapsing to `capture-pane can't find pane`.
- This would have made duplicate extension provenance visible on the first failed smoke.

## Additional friction and wins

- The host Skill tool could not pass router arguments; direct module execution produced the
  real backpressure artifact without fake completion.
- Flow-pair route documentation described model/roster features absent in the installed CLI;
  plan-owned fleet roster remained durable truth.
- Fire-and-forget compaction eliminated repeated 30–90 second waits and kept every review/fix
  loop moving.
- Cold mutation reviews caught three green-suite proof gaps: deep recursive overflow, orphan
  subtree annotation, and failure-path metadata durability.

## Highest-leverage permanent encoding

**Make smoke boot provenance fail-loud**: when the child exits before readiness, retain the
pane and return executable + argv + exit status + final pane output. This single diagnostic
would collapse the longest T012 investigation from multiple probes to one deterministic error.

## Post-flight disposition

- Keep observe buffers intact until the formal post-coding/post-flight drain.
- T012 smoke hermeticity is encoded in code/tests.
- Package audit no-write and Driver fail-loud provenance remain follow-up harness candidates.
- Stage B must record canonical daemon/tree/link evidence before s046 teardown.
