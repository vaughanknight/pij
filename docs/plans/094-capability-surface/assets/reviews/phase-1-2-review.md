# s094 Phase 1-2 cross-model review

**Verdict: FIX_REQUIRED**

## Finding

### MEDIUM - the table-to-reality proof is not connected to the payload pin

**Claim challenged:** Task 2.11 requires the verb-surface scrape to name the
`cli.inbox.integration.test.ts` pin that depends on it, so a future deletion of
the scrape does not silently re-open the known table-shrink blind spot.

**Evidence:** The surface-scrape block at
`.pi/extensions/pij/core/orchestration/pa-capability.test.ts:52-100` explains
that it keeps the table total, but never names the payload pin. The payload-pin
comment at `.pi/extensions/pij/cli.inbox.integration.test.ts:213-232` says it
tracks `PA_VERB_CLASSIFICATION`; therefore a deleted table row moves both sides
of its equality check. The required reverse link is absent (a hidden-source
search for `cli.inbox` in `pa-capability.test.ts` has no matches).

**Required change:** Add the task 2.11 comment beside the real-verb scrape,
explicitly naming `cli.inbox.integration.test.ts` and stating that the scrape
is its independent table-to-reality proof.

## Independent Dim-0 mutation gate

| Target | Mutation | Expected assertion | Result | Mode |
|---|---|---|---|---|
| `pa-capability.ts` | `"chore update": ALLOW` -> `refuse("review mutation")` | `PERMITS the widened verb 'chore update'` | `mutate.mjs --expect` exit 0; named assertion failed, 33 neighbours passed | In-memory |
| `core/cli.ts` self-resign filter | retain only the PA watcher instead of removing it | `resigning from a stranger carrying an expired EXPLICIT deadline writes ONCE and changes ONLY the PA's row` | On-disk Vitest exit 1; whole-sidecar assertion failed at `core/cli.test.ts:8361` | On-disk subprocess |
| `core/cli.ts` no-op guard | write when watcher counts are equal | `resigning from a stranger it does NOT watch (an expired EXPLICIT deadline) writes NOTHING at all` | On-disk Vitest exit 1; write-count assertion failed at `core/cli.test.ts:8376` | On-disk subprocess |
| `core/cli.ts` non-PA projection | emit `conditional` rather than `allow` for non-PAs | `runs whoami through process.execPath and the tsx entrypoint without tmux` | On-disk Vitest exit 1; uniform-value assertion failed at `cli.inbox.integration.test.ts:236` | On-disk subprocess |

The in-memory row used `--expect`. The other three tests execute the CLI in a
subprocess, so the transform cannot reach them; each was mutated on disk with
the named test selected directly. Each showed a non-empty source diff before
execution, failed on the asserted expectation rather than compilation, and was
restored byte-identically afterward.

## Confirmations

- The third-party PA `unwatch` path returns at
`.pi/extensions/pij/core/cli.ts:2439-2456`, before the generic reconciliation
and persistence preamble at `:2458-2462`. It removes only the caller's watcher
row and writes nothing when no row was removed. The two independent isolation
mutations above prove both halves.
- `--for` is refused before target evaluation (`core/cli.ts:2361-2374`), so the
permitted `unwatch` path cannot act on another seat's behalf.
- The JSON payload is total for every role and carries `capabilitySchema: 2`
(`core/cli.ts:2629-2658`). The inbox integration pin remains a scalar
`toEqual` plus strict key-set equality (`cli.inbox.integration.test.ts:220-236`).
- AC-04b is correctly labelled MUTATION-ONLY: its pre-fix refusal cannot prove
the persistence claim. AC-04c through AC-07 are correctly preserved-property
guards; their value is their mutation reachability, not a pre-fix red.
- The Phase 2 guarded pre-fix assertions are labelled honestly: AC-10, AC-12,
and AC-13 prove field absence at the guard, while their deeper comparisons need
post-fix mutation evidence. AC-11's absence assertion is itself substantive.
- The residual defaulted-read hazard is documented but not claimed solved, and
a hidden-source code sweep found no product-code consumer of either removed
field; remaining TypeScript hits are comments and removal assertions.

## Review scope

Reviewed `0842380..HEAD`, read the plan, execution log, and research dossier in
full, inspected the PA boundary, watchdog handler, JSON projection, pin, and
their targeted tests. The four relevant capability specs pass after mutation
restoration.

## Remediation verification — `a995827`

**Final verdict: ACCEPT**

The comment immediately above the three scrapes now explicitly identifies
`cli.inbox.integration.test.ts`, explains why its generated payload/table pin is
blind to a deleted table row, calls these scrapes the sole independent
table-to-reality proof, and records the A5-equivalent/A4-red evidence and the
plain-language future-removal failure mode. This closes the finding. No mutation
is required for this comment-only remediation: its purpose is to preserve the
proof chain for a future maintainer considering removal of the scrapes, which is
not a behavioral property a test can meaningfully assert.
