# Review — Plan 038 Phase 2 / dlg-0002

**Reviewer**: `pij-z51c4f`  
**Model**: `gpt-5.6-sol` (`xhigh`)  
**Coder**: `pij-befnoc`  
**Verdict**: `APPROVE`

## Summary

The descriptor, daemon merge, orchestration primitive, list projection, durability,
skill, and documentation changes are aligned and mutation-backed. The initial
strict-boolean and help findings were resolved and independently verified in
dlg-0003.

## Original findings — resolved by dlg-0003

### RESOLVED HIGH — `--prime=<value>` silently disabled the filter instead of failing

**Evidence**:

- `.pi/extensions/pij/core/cli.ts:194-203` accepts `--k=value` for every flag,
  including known booleans.
- `.pi/extensions/pij/core/cli.ts:215` registers `prime` as a boolean, but
  `.pi/extensions/pij/core/cli.ts:256-270` only checks `flags.prime === true`;
  a string value therefore becomes `prime:false`.
- `.pi/extensions/pij/core/cli.test.ts:125-133` checks unknown placement but has
  no malformed boolean-value case for `--prime`.
- Real scratch-boundary probe:

  ```text
  PIJ_HOME=<tmp> npx tsx .pi/extensions/pij/cli.ts list --prime=false
  exit=0
  no pij sessions
  ```

The required behavior is strict boolean grammar. A typo or generated invocation
such as `--prime=false` currently succeeds and returns the unfiltered session
set, which can cause registry-first prime discovery to consume non-prime rows.
Reject valued boolean forms with `E-ARG` and add parser plus real-CLI coverage.

### RESOLVED MEDIUM — top-level help did not advertise `--prime`

`.pi/extensions/pij/cli.ts:167` still prints:

```text
pij list [--here] [--json]
```

The parser and operator docs expose `--prime`, but `pij --help` does not. Update
the complete bin-level usage surface to include `[--prime]`.

## Dimension 0 — mutation resistance

### Guard A — mutable daemon prime ownership

Command:

```bash
harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/daemon/loop.ts \
  's/if \(latest\[field\] !== undefined\) \{/if (false) {/' \
  'npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts'
```

Mutation produced exactly three RED assertions:

1. `lets the latest persisted prime=false beat a stale daemon prime=true snapshot`
2. `lets the latest persisted prime=true beat a stale daemon prime=false snapshot`
3. `lets the latest persisted prime=true beat a stale daemon prime=undefined snapshot`

Restore was byte-identical:

```text
before=a522bc1402f82847060a7b96e0465101a37798bcad6e4bc09c9ce749c2af55fc
after =a522bc1402f82847060a7b96e0465101a37798bcad6e4bc09c9ce749c2af55fc
```

Post-restore: `37/37` loop tests GREEN.

### Guard B — prime-only discovery filter

Command:

```bash
harness/scripts/flow-pair-mutate.sh \
  .pi/extensions/pij/core/discovery.ts \
  's/return descriptors\.filter\(\(d\) => d\.prime === true\);/return [...descriptors];/' \
  'npx vitest run .pi/extensions/pij/core/discovery.test.ts .pi/extensions/pij/core/cli.test.ts'
```

Mutation produced exactly two RED tests:

1. `keeps only explicit prime=true descriptors and composes with folder filtering`
2. `list --prime composes with --here and ordinary output marks prime rows`

Restore was byte-identical:

```text
before=17322f3d392b359539709b9dbae4ac8db52f1ab2b85a14d7bce8b4fcf56ddc08
after =17322f3d392b359539709b9dbae4ac8db52f1ab2b85a14d7bce8b4fcf56ddc08
```

Post-restore: `56/56` discovery/list tests GREEN.

### Guard C — exact self and idempotent writes

Reasoned evidence is sufficient because the three claims cross dispatch,
service-write counting, and the real subprocess boundary:

- Omitted-target ambiguity: `.pi/extensions/pij/core/orchestration/cli.test.ts:285-293`
  asserts exit `2`, `E-AMBIG`, and that every descriptor remains
  `prime === undefined`.
- Same-value no-write: `.pi/extensions/pij/core/orchestration/prime.test.ts:59-70`
  covers both set/true and unset/false, asserts `changed:false`, and asserts
  `CountingRegistry.writes === 0`.
- Explicit target without resolvable self:
  `.pi/extensions/pij/cli.integration.test.ts:100-118` clears
  `PIJ_SESSION_ID` while the scratch registry contains three local sessions,
  successfully designates `pij-B`, and observes it in the prime-only list.

## Reviewer-owned gates

Observed runner: `vitest/4.1.10`, Darwin arm64, Node `v24.7.0`.

| Gate | Result |
|---|---|
| Required focused Vitest command | `223/223` passed across 8 files |
| Loop post-mutation confirmation | `37/37` passed |
| Discovery/list post-mutation confirmation | `56/56` passed |
| `just typecheck` | passed |
| `just pij-skill-check` | passed; bootstrap remains advisory `95/90` |
| Phase-path `npx biome check` | no errors across 15 code/test files; one pre-existing warning at `core/cli.ts:570` |
| Exact-fence `git diff --check` | passed |
| Dlg-0002 strict boolean probe | exposed original bug: `--prime=false` exited `0` |

### External runner/tool shift

At dlg-0002, the shared tree had begun resolving Vitest `4.1.10` and Biome
`2.4.14`, unlike the worker's recorded Vitest `2.1.9` gates.

- `harness boot` / full `just test` was red because three unrelated
  live-test suites still use the Vitest 3 `test(name, fn, options)` signature
  removed in Vitest 4.
- `just lint` was red on three unrelated live-test formatting changes
  introduced by the new formatter behavior.
- The Phase 2 focused tests, typecheck, skill gate, and path-scoped Biome check
  remain green apart from the noted pre-existing warning.

This is an s039 runner migration issue, not absorbed into the s038 finding set.

## Acceptance and contract verdict

- Descriptor migration, explicit false persistence, latest-disk mutable merge,
  idempotent service writes, exact-self errors, list filtering/projection,
  scratch-registry integration, durability, skill ordering, and docs are
  implemented with load-bearing evidence.
- The review packet's strict `--prime` boolean grammar contract is now met.
- The remaining full-suite, daemon-restart, live-registry, and `harness checks`
  proof belongs to the orchestrator's declared completion window.

## Scope and exact diff boundary

The execution log's 27 changed paths match the Phase 2 task table and Domain
Manifest: 24 tracked diffs plus 3 untracked additions. No package, lockfile,
government, or flow-state path is inside the reviewed fence.

```text
.pi/extensions/pij/core/types.ts
.pi/extensions/pij/core/daemon/loop.ts
.pi/extensions/pij/core/daemon/loop.test.ts
.pi/extensions/pij/core/orchestration/prime.ts
.pi/extensions/pij/core/orchestration/prime.test.ts
.pi/extensions/pij/core/orchestration/cli.ts
.pi/extensions/pij/core/orchestration/cli.test.ts
.pi/extensions/pij/core/discovery.ts
.pi/extensions/pij/core/discovery.test.ts
.pi/extensions/pij/core/cli.ts
.pi/extensions/pij/core/cli.test.ts
.pi/extensions/pij/cli.ts
.pi/extensions/pij/cli.integration.test.ts
.pi/extensions/pij/core/session.test.ts
.pi/extensions/pij/core/binding.test.ts
skills/pij/references/routes/prime.md
skills/pij/references/prime/rituals/bootstrap.md
skills/pij/references/prime/templates/seat-handover.md
docs/how/pij.md
docs/how/pij-prime.md
docs/domains/pij-messaging/domain.md
docs/domains/pij-orchestration/domain.md
docs/domains/pij-control-plane/domain.md
docs/domains/pij-skill/domain.md
docs/domains/registry.md
docs/domains/domain-map.md
docs/plans/038-pij-prime-designation/tasks/phase-2-ship-prime-designation-end-to-end/execution.log.md
```

## Orchestrator-owned deferred live proofs

1. Acquire the daemon-restart baton and restart the machine-wide daemon.
2. Run production-live `prime set/list/unset` against the restarted source.
3. Restore or remove any production descriptor designation used by that proof.
4. Re-run full test, lint, and `harness checks` after the s039 Vitest/Biome
   migration is internally green.
5. Perform final path-scoped staging, commit, and completion-claim verification.

## Fix verification — dlg-0003

**Final verdict**: `APPROVE`

The fix stayed within the declared product/test fence plus the Phase 2 execution
log. Both original findings are resolved.

### Parser and compatibility probes

Direct `parseArgs` probes on Vitest/Node's current dependency state produced:

```text
list --prime=false → E-ARG: --prime does not take a value
list --prime=true  → E-ARG: --prime does not take a value
list --here=false  → E-ARG: --here does not take a value
list --json=true   → E-ARG: --json does not take a value
send ... --wait=5000 → ok, wait=true, waitMs=5000
```

`.pi/extensions/pij/core/cli.ts:256-263` now rejects only valued flags whose
keys are in the existing boolean registry before normal lexing. Optional-valued
non-boolean flags retain the prior path.

### Real boundary and negative evidence

Scratch `PIJ_HOME` command:

```text
pij list --prime=false --json
exit=64
E-ARG: --prime does not take a value
```

No session JSON was emitted. The integration assertion at
`.pi/extensions/pij/cli.integration.test.ts:173-179` checks exit `64`, `E-ARG`,
the exact boolean-value diagnostic, and absence of the known `pij-A` row.

Top-level help now contains:

```text
pij list [--here] [--prime] [--json]
```

### Fix gates

| Gate | Result |
|---|---|
| Core parser + real CLI focused tests | `60/60` passed across 2 files |
| Direct four-boolean parser probe | all four returned `E-ARG` |
| Direct `--wait=5000` compatibility probe | parsed with `waitMs:5000` |
| Scratch real CLI valued-prime probe | exit `64`, `E-ARG`, no JSON |
| Top-level help probe | exact list syntax present |
| Fix-fence `git diff --check` | passed |
| `just typecheck` | passed |
| `just lint` | passed with baseline 9 warnings and 1 info |

### Transient attribution

One worker run occurred while s039 was repopulating `node_modules/.bin`; all 19
CLI subprocess tests exited `1` with empty output. The identical quiescent rerun
on `tsx@4.23.0` and Vitest `4.1.10` passed `59/59`, and the final expanded
focused run passed `60/60`. No product workaround or dependency-file change was
added for that install window.
