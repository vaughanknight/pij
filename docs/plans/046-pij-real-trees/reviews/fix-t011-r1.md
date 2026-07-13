# Fix packet — s046 T011 R1

**Review**: `reviews/review-t011.md`
**Delegation**: `dlg-0005`
**Verdict**: `FIX_REQUIRED`

## Allowed paths

- `harness/scripts/pij-skill-check.sh`
- `skills/pij/references/prime/rituals/kickoff.md`
- `docs/how/pij.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t011/execution.log.md`

## Forbidden

- Every other path, especially product, domain, other skill files, package, smoke,
  government, flow-state, and `.flow-pair/**`.

## H1 — executable adopted-stream order

Make the sequence internally executable:

1. Complete canary legs (a) round-trip and (b) identity for an adopted stream.
2. Persist and verify `pij link <adopted-id> --parent <o-prime-id>`.
3. Deliver the brief pointer as leg (c) input reliability and close the canary record.

For spawned streams, verify the automatically persisted parent edge through `pij tree`.

The adoption variant must record:

- structural parent is linked;
- `spawnedBy`/close ownership is absent or unknown.

It must not say the adopted stream has no parent.

Extend the sensor so identity proof precedes link and link precedes the leg-(c)
brief-pointer marker. Re-run the link-order mutation and prove RED.

## M1 — environment snapshot semantics

Correct `docs/how/pij.md`:

- `PIJ_PARENT_ID` is a spawn/adopt/export-time environment snapshot used by the
  current process and future children.
- `pij link` changes registry `parentId`; observe current truth with `pij tree`.
- Linking cannot retroactively mutate a running process environment.
- Explicit-root export emits no parent assignment. If evaluating into a shell that
  may already carry a stale value, run `unset PIJ_PARENT_ID` first.

Do not invent new product behavior.

## Preserve

- All seven original T011 sensors.
- PR17 completion-first/C7 checks.
- PR18 local-path and hierarchy link.
- Exact scope and all prior docs/domain changes.

## Proof

- sensor-order mutation RED→restore→GREEN
- `just pij-skill-check`
- `just test harness/scripts/local-path-check.test.ts`
- `just test .pi/extensions/pij/cli.integration.test.ts`
- `just lint`
- `just typecheck`

Update execution evidence and report:

```json
{
  "delegationId": "dlg-0005-fix-r1",
  "outcome": "COMPLETE | PARTIAL | BLOCKED",
  "summary": "what changed",
  "filesChanged": ["..."],
  "testsRun": 0,
  "testsPassed": 0,
  "gatesClean": true,
  "notes": "RED/GREEN sensor evidence"
}
```
