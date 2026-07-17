VERDICT: FINDINGS (7)

## HIGH — sequence allocation is not multi-writer safe

**Evidence:** `.pi/extensions/pij/core/cli.ts:1430-1435`, `.pi/extensions/pij/core/cli.ts:1487-1491`, `.pi/extensions/pij/core/cli.ts:1509-1511`, `.pi/extensions/pij/core/platform/ports.ts:30-38`, `.pi/extensions/pij/core/platform/spine.ts:66-69`

Every current writer allocates with `lastSeq() + 1` outside the append operation. Two CLI processes can therefore reserve the same sequence. If writer A appends seq 41, a follower reads it and advances to `--since 41`, then writer B appends its independently reserved seq 41, B's event is permanently excluded by the exclusive cursor. `appendOnce` does not repair this for distinct operation keys because it also accepts an already-stamped event.

**Smallest fix:** move sequence allocation into a cross-process atomic `SpineLogPort` append/reservation operation; callers must not stamp from `lastSeq()`. Add a two-process test where the second same-seq append lands after a consumer advances its cursor.

## HIGH — project mutation can commit without its required spine event

**Evidence:** `.pi/extensions/pij/core/cli.ts:1439-1448`, `.pi/extensions/pij/core/cli.ts:1496-1499`, `.pi/extensions/pij/adapters/spine-store.ts:48-54`

`project create` and `project set` mutate the project store first, then call a throwing `void` append. An append failure such as a full/unwritable spine leaves the new project bytes committed without attribution and escapes `dispatch` as an exception rather than a `CliResult`. This breaks AC-03 and the persist-before-mutate/event-source consistency rule.

**Smallest fix:** make the coupled write a recoverable event-first operation with a durable operation id/journal, then apply the project projection and replay incomplete operations. Add spine-failure injection tests proving no successful project state becomes unaudited.

## HIGH — project events omit the required before/after change

**Evidence:** `.pi/extensions/pij/core/platform/project.ts:66-75`, `.pi/extensions/pij/core/platform/project.ts:93-102`

Both project events omit `prev`/`next`; `project-set` records only the kind and project ref. After changing a prime from A to B and later to C, the append-only history cannot establish either prior value or even whether `primeId` versus `planPath` changed. That defeats AC-03's `prev→next` requirement and WS-5's promise that the audit answers who changed what.

**Smallest fix:** populate the existing `prev`/`next` fields with canonical before/after values (or introduce a structured delta if strings are insufficient), including `next` on create, and pin them in pure and CLI coupling tests.

## MED — the purity sensor permits filesystem and process dependencies

**Evidence:** `.pi/extensions/pij/core/platform/boundary.test.ts:11-12`, `.pi/extensions/pij/core/platform/boundary.test.ts:23-30`, `.pi/extensions/pij/core/platform/boundary.test.ts:81-87`

The sensor explicitly allows Node built-ins and only rejects transport/adapters/pi specifiers. A future production module can import `node:fs` or `node:process` and the test still passes, so it does not enforce the stated pure-core/no-fs/no-process boundary.

**Smallest fix:** scan production modules separately from tests, reject fs/process built-ins there, and add a source check for global `process` usage. Keep the boundary test's own test-only fs imports outside that production rule.

## MED — the fake/store contract diverges on a type-valid poisoned assignment

**Evidence:** `.pi/extensions/pij/core/platform/assignment.ts:87-90`, `.pi/extensions/pij/adapters/fakes.ts:534-552`, `.pi/extensions/pij/adapters/assignment-store.ts:33-50`, `.pi/extensions/pij/adapters/assignment-store.ts:75-83`

`appendStateRef` accepts any `number`, including `NaN`. The fake JSON-round-trips this to `null` and returns the malformed assignment, while the fs adapter writes the same bytes but subsequently rejects them through `isAssignment` and returns `null`. Downstream Phase-2 tests can therefore pass against the mandated fake while production silently loses the record on read.

**Smallest fix:** validate records consistently at both write boundaries (returning `E-ARG`) and guard fake read results exactly like fs reads. Add the non-finite assignment-state case to the shared contract suite.

## MED — public type guards accept prototype-inherited records

**Evidence:** `.pi/extensions/pij/core/platform/types.ts:91-103`, `.pi/extensions/pij/core/platform/types.ts:137-188`

`isRecord` accepts any non-array object and every field check follows inherited properties. Consequently `Object.create(validProject)` has no own record fields but passes `isProject`; the same construction works for assignments and spine events. These exported guards are false-positive trust boundaries for non-JSON callers despite claiming to reject malformed/foreign records.

**Smallest fix:** require own properties for every required field and reject inherited optional fields; add `Object.create(validRecord)` and accessor/prototype cases for all three guards.

## MED — fallible core constructors still throw on type-valid clocks

**Evidence:** `.pi/extensions/pij/core/platform/spine.ts:29-35`, `.pi/extensions/pij/core/platform/project.ts:48-64`, `.pi/extensions/pij/core/platform/assignment.ts:29-40`, `.pi/extensions/pij/core/platform/assignment.ts:74-83`

`buildSpineEvent` claims every input yields a valid event, and the project/assignment verbs return `Result`, but all call `toISOString()` without validating `nowMs`. `NaN` or an out-of-TimeClip finite number throws `RangeError`, bypassing the tagged-union error contract and, through CLI dispatch, the normal error envelope.

**Smallest fix:** centralize checked ISO timestamp construction and return `E-ARG` for invalid clocks; make every fallible constructor propagate that `Result`, with NaN and out-of-range tests.
