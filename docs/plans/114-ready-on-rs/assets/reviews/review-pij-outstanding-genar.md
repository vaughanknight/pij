# Code Review: plan 114 /pij ready on rs

**Plan**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json`
**Spec**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.md`
**Phase**: Composed waves 1-2
**Date**: 2026-09-01
**Reviewer**: `pij-outstanding-genar` (cross-model)
**Testing approach**: Hybrid

## A) Verdict

**REJECT**

Five reachable paths still degrade control: two can silently serve an rs seat
from legacy or accept a dead seat, one turns a failed probe into an uncaught
exception, one has opened a paneless registration path that binds to a
short-lived shim process, and the fourth TS/Rust seam silently changes
machine-readable control data.

**Key failure areas**

- **Identity routing**: an unanswerable rs roster is converted into a verified
  negative and silently follows a possibly-rs seat to legacy.
- **Lifecycle identity**: tombstoned descriptors remain valid identities and
  reporting subjects when resolution arrives by asserted id.
- **Compatibility seam**: `--json` bypasses every row renderer and emits raw rs
  payloads instead of the documented TS contract.
- **Admission**: routing intercepts a paneless `adopt` before legacy validation,
  binding a persistent seat to the ephemeral Node CLI process.

## B) Summary

The composition correctly closed the three prior literal seams: caller-context
keys share a fixture, report leaves use the actual `/v1/report` endpoint, and
production wiring now supplies the follow-the-seat dependencies. The `tail`
deny list, ordinary rs-error handling, per-leaf report routing, and human
renderers are also sound. However, the new raw-JSON bypass is a fourth
cross-generation seam: its TS and Rust tests each pass while a caller receives
a different control schema. The remaining findings are independently reachable
without changing source and prevent the ready gesture from being safely
mergeable.

## C) Checklist

**Testing approach: Hybrid**

- [x] Core routing and caller-context tests are present and targeted suites pass.
- [x] Critical report and state paths have HTTP coverage.
- [x] `tail` is denied before route lookup, including forced-rs.
- [x] Route-table rows are data-driven; no per-verb dispatch branch was found.
- [ ] Error and unknown-roster branches preserve identity safety.
- [ ] `--json` retains, or explicitly refuses, the legacy control contract.
- [ ] Tombstoned and paneless registration paths refuse rather than confirm a
  false live identity.

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts:108-130`, `cli.ts:4623-4628,4732-4737` | error handling | An invalid/wire-skew rs probe is rethrown into an unobserved promise, crashing routed commands. | Convert every probe fault to a named no-fallback route outcome and catch the entry promise. |
| F002 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts:437-466`, `.pi/extensions/pij/core/generation-routing.ts:583-626` | identity routing | An unreadable rs roster becomes `false`, allowing a silent legacy follow without knowing where the seat lives. | Carry a tri-state lookup and follow only after a positively read rs-negative roster. |
| F003 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/core/generation-routing.ts:692-698`, `crates/daemon/src/http/types.rs:343-344`, `.pi/extensions/pij/core/cli.ts:2767-2777,3646-3668` | TS/Rust response seam | Routed `--json` calls emit raw rs payloads, dropping legacy control fields such as `orchestrationRole` and `verbs`. | Require a per-row JSON projection or an explicit named refusal; add end-to-end shape parity tests. |
| F004 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/identity.rs:638-672`, `crates/daemon/src/http/mod.rs:1269-1288`, `crates/daemon/src/registration.rs:170-182` | lifecycle identity | Asserted tombstoned ids pass identity and report existence checks, so `phonehome` can confirm a dead seat and reports can succeed on it. | Treat tombstoned rows as non-live for identity and report writes, with a decodable refusal. |
| F005 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/cli.ts:4617-4628`, `.pi/extensions/pij/core/spawn.ts:993-1040`, `crates/daemon/src/http/identity.rs:374-412` | admission | The shim routes a paneless `pij adopt --harness …` that legacy rejects, and rs binds it to the short-lived shim pid. | Refuse direct paneless `adopt`; do not accept the HTTP shim process as seat evidence. |

## E) Detailed Findings

### E.1) Implementation Quality

#### F001 - Unclassifiable rs probes crash the routed CLI

`probeRs` recognizes only no-daemon and auth refusals, then rethrows every other
detector failure (`generation-router.ts:119-130`). A non-pij response, malformed
envelope, or `PijWireSkewError` therefore rejects `routeVerb`. The only
entrypoint invokes `void bootThroughGenerationRouting()` without a catch
(`cli.ts:4732-4737`), so `pij whoami`, `phonehome`, `adopt`, report, state, and
the generation diagnostic terminate as an unhandled rejection rather than
producing a controlled outcome.

This was reproduced with a 200 response carrying a non-JSON body:

```text
routeVerb rejected: daemon returned invalid JSON: SyntaxError: Unexpected token '<'
```

This is not a not-implemented fallback case. Preserve the plan's no-masking
rule by representing it as `rs-error` (or an equally explicit, justified
outcome), then ensure the CLI writes the named error and exit code.

#### F002 - A failed roster read is treated as proof that rs lacks the seat

`rsSeatLookup` catches every transport/decode/refusal failure and produces an
`undefined` sentinel, but immediately converts it to `false`
(`generation-router.ts:457-465`). `decidePreCall` treats `seatInRs === false`
plus a legacy row as proof to return `legacy-seat-followed`
(`generation-routing.ts:614-626`). The result silently re-homes a seat that
could be resident in both stores whenever `/v1/seats` cannot be read.

The branch was reproduced directly:

```text
unanswerable roster reports present=false
```

Change the dependency/result type to `boolean | undefined`, return `undefined`
for every failed roster attempt, and add a test that an rs seat plus a
temporarily unreadable roster never selects legacy.

#### F003 - Fourth seam: raw rs `--json` is not the TS control contract

The non-JSON path now has row-owned renderers, but `renderRsAnswer` takes an
early raw `JSON.stringify(payload)` branch for every `--json` invocation
(`generation-routing.ts:692-698`). Thus the TS shim does not project or verify
the response schema at all.

For example, legacy `whoami --json` always emits `orchestrationRole` and the
total `verbs` map (`core/cli.ts:2767-2777`); rs `whoami` supplies a
`SeatDescriptor`. Likewise, rs `StateCard` names its field `role`, while its
own source says the TS surface is `orchestrationRole`
(`http/types.rs:343-344`); legacy `state --json` supplies the latter
unconditionally (`core/cli.ts:3646-3668`). The same raw bypass can omit
`dataDir`, `capabilitySchema`, and `verbs` from `whoami`.

This is the requested fourth instance: a response value crosses by literal
schema, with neither side testing the other side's full shape. The current
test only asserts that arbitrary `{a:1}` becomes JSON
(`adapters/generation-seam.test.ts:312-317`), and later explicitly asserts that
JSON wins for every row (`:721-726`). A capability consumer can consequently
read missing data as an allowed/ungated state, the exact permissive absence
failure the legacy fields were designed to prevent.

Each row must provide a compatibility JSON projection that preserves the
legacy contract, or reject `--json` by name when rs cannot honor that contract.
Pin the exact object keys and control values through the real shim and daemon,
not independent per-runtime fixtures.

#### F004 - Tombstoned seats remain accepted identities and reporting subjects

The pane resolver deliberately selects only `tombstoned_at.is_none()` rows
(`identity.rs:638-646`), but the asserted-id arm passes any result of
`registry.get` as `Resolved::Seat` (`:670-672`). Supersession tombstones a
predecessor while retaining its process identity (`registration.rs:170-182`).
A paneless/stale-environment `phonehome` can therefore re-observe that retained
process and return `bound: true` for an unaddressable seat.

The report handler repeats the same existence-only check
(`http/mod.rs:1269-1288`), so it writes cards and success receipts for a
tombstoned row. This is a control failure: identity and reporting say success
while delivery refuses the dead recipient. Filter tombstones in both paths
(with a decodable error naming the tombstone reason), and pin the case with
identity, phonehome, and report write tests.

#### F005 - The routed `adopt` opens an unsafe paneless form

Legacy grammar requires a `%N` positional pane for `adopt`
(`core/spawn.ts:993-1040`). Routing runs before that legacy parse
(`cli.ts:4617-4628`), forwards the generic caller block, and rs accepts a
paneless `adopt` whenever it receives `caller.pid` and `caller.procStart`
(`identity.rs:374-412`). The shim supplies exactly the Node CLI process facts,
not the long-lived peer's process facts. The daemon corroborates that transient
process successfully, persists it, and it exits at command completion; a
subsequent `phonehome` is unbound or recycled.

This bypasses the current paneless-legacy boundary and creates a successful
registration with invalid binding evidence. Direct paneless `adopt` must refuse
unless a future dedicated, durable process-evidence protocol is introduced.

### E.2) Domain Compliance

**N/A - domains are off.** No `docs/domains/` registry or map applies to this
plan. The composed files stayed within the route, lifecycle, report/readback,
and approved `TmuxPort` fence.

### E.3) Anti-Reinvention

No finding. `detectDaemonGeneration`, `observedProcessStart`, `ReportService`,
and the shared caller-context fixture are reused rather than duplicated.

### E.4) Testing & Evidence

**Coverage confidence: 55%**

The targeted suites are green but prove the ordinary paths, not the five
branches above. In particular, the existing JSON tests intentionally pin the
unsafe raw pass-through, and no identity test exercises a tombstoned asserted
id or a routed direct paneless adopt.

| AC | Confidence | Evidence |
|----|------------|----------|
| ac-1141 | 35% | Daemon/CLI adoption tests exist; unsafe paneless routing and incomplete live gesture prevent acceptance. |
| ac-1142 | 45% | Report/state round trip tests pass, but tombstoned reporting is falsely successful. |
| ac-1143 | 35% | Error/no-daemon and ordinary follow tests pass; unknown roster re-homes and malformed probe crashes. |
| ac-1144 | 75% | Report argument parity and named refusals are well tested. |
| ac-1145 | 95% | `tail` deny precedence is non-vacuously tested, including force-rs. |
| ac-1146 | 90% | Diff contains no `skills/` or `.claude/` changes. |
| ac-1147 | 85% | Shim has no id generator; rs mints normal adopt ids. |
| ac-1148 | 45% | Normal phonehome works, but tombstoned and transient-process paths can produce false identity results. |

### E.5) Doctrine Compliance

No separate doctrine finding. The plan remains intentionally incomplete:
`harness plan validate --complete` reports all eight ACs and three phases
unchecked, as expected before their receipts are recorded after a repaired
review. The completion gate also retains the packet's known pre-existing npm
resolution failure; neither is counted as a new implementation finding.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| ac-1141 | Fresh ready gesture lands in rs | Adoption/persistence tests; F001, F004, and F005 block safe completion. | 35% |
| ac-1142 | whoami/report/state use rs | Targeted report/state tests pass; F004 permits a dead subject. | 45% |
| ac-1143 | Inspectable per-verb fallback without error masking | Error classification and deny tests pass; F001/F002 disprove complete control. | 35% |
| ac-1144 | Report shapes preserve caller intent | 23 report HTTP tests plus TS-source review. | 75% |
| ac-1145 | `tail` stays denied | Injected-row/forced-rs tests. | 95% |
| ac-1146 | No skill artifact change | Computed diff: zero changed files under `skills/` or `.claude/`. | 90% |
| ac-1147 | rs is the only minter | `adopt` rejects asserted id; table has no name generator. | 85% |
| ac-1148 | rs phonehome confirms rs identity | Normal path tests pass; F004/F005 leave false confirmation paths. | 45% |

**Overall coverage confidence: 55%**

## G) Commands Executed

```bash
git diff --no-ext-diff --stat origin/main...HEAD
git diff --no-ext-diff origin/main...HEAD > docs/plans/114-ready-on-rs/assets/reviews/_computed.diff
harness plan validate "/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json" --complete
./node_modules/.bin/vitest run .pi/extensions/pij/adapters/generation-router.test.ts .pi/extensions/pij/adapters/generation-seam.test.ts .pi/extensions/pij/core/generation-routing.test.ts
CARGO_TARGET_DIR=target-review ~/.cargo/bin/cargo test -p pij-daemon --test caller_context_wire --test report_http
CARGO_TARGET_DIR=target-review ~/.cargo/bin/cargo test -p pij-daemon --lib identity_tests
CARGO_TARGET_DIR=target-review ~/.cargo/bin/cargo test -p pij-cli --test spawn
harness checks
```

## H) Handover Brief

**Review result**: **REJECT**

**Plan**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json`
**Spec**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.md`
**Phase**: Composed waves 1-2
**Tasks dossier**: Plan packets and receipts under `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/`
**Execution log**: Not present
**Review file**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/reviews/review-pij-outstanding-genar.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|----------------------|--------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts` | F001, F002 | routing | Preserve explicit probe/roster uncertainty. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/core/generation-routing.ts` | F003 | routing | Add JSON compatibility projection/refusal. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/identity.rs` | F004, F005 | identity | Reject tombstoned and unsafe paneless identities. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/mod.rs` | F004 | report | Reject tombstoned reporting subjects. |

### Required Fixes

See `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/reviews/fix-tasks-pij-outstanding-genar.md`.

### Domain Artifacts to Update

None.

### Handback

Fixes return through the implement verb for this plan, then this review must
run again. Do not receipt or close an affected AC until each named branch is
exercised through the production shim.
