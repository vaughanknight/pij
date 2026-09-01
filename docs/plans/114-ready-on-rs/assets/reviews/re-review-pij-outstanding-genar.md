# Re-review: plan 114 findings F001-F005

**Reviewed remote-equivalent commit**: `fbeb2ec483b0a1e279e95f587eb71dda0718b656`
**Remote verification**: `origin/s114/ready-on-rs` = `fbeb2ec4`; left/right divergence `0 0`
**Prior verdict**: `093b6399` / **REJECT**
**Reviewer**: `pij-outstanding-genar` (cross-model)
**Date**: 2026-09-01

## A) Verdict

**APPROVE**

The five HIGH control findings from the prior review are closed on the repaired
composed tree. This approval is the re-merge condition for F001-F005 only; it
does not receipt the plan's remaining operator-gesture acceptance work.

## B) Summary

The original malformed-probe, unreadable-roster, tombstone, and paneless-adopt
failure modes now produce named refusals without legacy fallback or writes. The
fourth seam is fixed by refusing `--json` when rs cannot reproduce the legacy
schema, not by emitting a partial projection that an automation could read as
permission. I verified that behavior through an actual TypeScript CLI process
against a live isolated rs daemon. The removed tests were assertions of the old
defects and each has a stronger replacement proving the intended boundary.

## C) Checklist

- [x] F001: 200/non-JSON health response exits 4 with one named rs error and no
  stack trace or legacy fallback.
- [x] F002: unreadable roster remains distinct from a read-negative roster and
  refuses instead of following legacy.
- [x] F003: actual shim `state --json` against a live rs daemon writes no JSON
  and returns an explicit contract refusal.
- [x] F004: tombstoned asserted identity, phonehome, and report paths refuse;
  report persists no spine event.
- [x] F005: both the shim and rs independently refuse direct paneless adopt;
  caller-claimed process facts cannot override pane-derived evidence.
- [x] Deleted defect-assertion tests were replaced with directional tests.

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| — | — | — | — | No remaining HIGH/CRITICAL finding in F001-F005 re-review scope. | Approve re-merge condition. |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 closed.** The original direct repro of a 200 HTML/non-JSON body now
returns `rs-unreadable`, and the actual CLI exits 4 with:

```text
E-RS: whoami: rs at 127.0.0.1:17652 answered with something this CLI cannot read — not falling back to legacy
```

`probeRs` maps unclassifiable responses to a named outcome
(`.pi/extensions/pij/adapters/generation-router.ts:119-144`), and the entry
promise has a final catch (`.pi/extensions/pij/cli.ts:4750-4758`).

**F002 closed.** The rs lookup now returns the explicit `"unreadable"` state
instead of `false` (`adapters/generation-router.ts:474-503`), and
`decidePreCall` maps that state to `rs-roster-unreadable`
(`core/generation-routing.ts:696-713`). The original repro produced:

```text
unanswerable roster lookup=unreadable
unanswerable roster outcome=rs-roster-unreadable
```

**F003 closed.** Every route row now declares `jsonOutput`, and the current
nine rows all choose the safer `refuse` form when rs cannot preserve the legacy
machine contract (`core/generation-routing.ts:79-107,193-287`). The actual
shim, invoked as `pij state pij-review-seat --json` against a fresh registered
seat on a live rs daemon, emitted no stdout and exited 4 with a reason naming
the `role`/`orchestrationRole` conflict. The new refusal is deliberately
stricter than a partial projection: its missing legacy fields include the
capability gate, so absence would read permissively.

**F004 closed.** Identity now applies the same live-row rule to the asserted-id
path as to pane resolution (`crates/daemon/src/http/identity.rs:682-713`), and
the report handler refuses a tombstoned subject before any write
(`crates/daemon/src/http/mod.rs:1276-1295`). The three tombstone regressions
all pass, including the retained-live-process phonehome arm and the no-spine
write assertion.

**F005 closed.** rs refuses every paneless adopt regardless of a corroborable
caller pid/start pair (`crates/daemon/src/http/identity.rs:404-441`); the
TypeScript entry independently intercepts direct paneless `adopt`
(`.pi/extensions/pij/cli.ts:4616-4623`). A real shim invocation outside tmux
exited 2 before routing, and the rs tests demonstrate that the same form
refuses even when its claimed process is live. The remaining pane route binds
only the tmux-observed process, never the caller's claim.

### E.2) Domain Compliance

**N/A - domains are off.**

### E.3) Anti-Reinvention

No finding. The repair extends the existing route outcomes, table metadata, and
identity derivation boundary rather than adding a parallel path.

### E.4) Testing & Evidence

**Coverage confidence: 95% for F001-F005**

| Finding | Independent evidence |
|---------|----------------------|
| F001 | Original 200/non-JSON repro through `routeVerb` and the actual CLI entrypoint. |
| F002 | Original unreadable roster repro plus distinct-outcome regression. |
| F003 | Actual TypeScript shim process against a live rs daemon and registered rs seat. |
| F004 | `cargo test -p pij-daemon --lib tombstone` (four tests, all passed). |
| F005 | `cargo test -p pij-daemon --lib adopt_` (eight tests, all passed) plus actual direct shim refusal. |

The deleted assertions are soundly replaced:

| Removed assertion | Replacement and reason |
|-------------------|------------------------|
| `--json gets JSON`; `--json still wins...` | Refusal/project row tests and an all-route no-raw-schema assertion. The former tests pinned F003. |
| `a_paneless_seat_with_a_corroborated_process_registers` | A corroborable caller claim now refuses, while a separate pane-path test proves the claim is ignored rather than merely unreachable. |
| No named removal for F001/F002/F004 | New regressions directly cover each prior failure path. |

### E.5) Doctrine Compliance

No finding in re-review scope. `harness checks` passed typecheck, lint,
Windows compatibility, smoke, package audit, and snapshots. Its two remaining
failures are the pre-existing npm-resolution integration test and checked-in
skill absolute paths, neither touched by the repair diff.

## F) Coverage Map

| AC | Description | Re-review evidence | Confidence |
|----|-------------|--------------------|------------|
| ac-1141 | Safe routing of the ready gesture | F001/F004/F005 repaired; live full gesture receipt remains separate. | 85% |
| ac-1142 | rs identity/report/readback | Tombstone refusal and live `state --json` contract behavior verified. | 90% |
| ac-1143 | No masking or re-home | Original F001/F002 repros now have named no-fallback outcomes. | 95% |
| ac-1144 | Shape parity/refusal | Report rows reject unsupported machine shape instead of silently differing. | 90% |
| ac-1145 | Transcript `tail` remains denied | Unchanged and previously verified. | 95% |
| ac-1146 | No skill artifact edit | Unchanged by the repair diff. | 95% |
| ac-1147 | Single rs minter | Unchanged by the repair diff. | 95% |
| ac-1148 | rs phonehome identity | Tombstoned asserted-id confirmation now refuses. | 95% |

## G) Commands Executed

```bash
git fetch origin s114/ready-on-rs
git ls-remote origin refs/heads/s114/ready-on-rs
git rev-list --left-right --count HEAD...origin/s114/ready-on-rs
./node_modules/.bin/tsx -e '<F001 200/non-JSON and F002 unreadable-roster repros>'
CARGO_TARGET_DIR=target-review ~/.cargo/bin/cargo test -p pij-daemon --lib tombstone
CARGO_TARGET_DIR=target-review ~/.cargo/bin/cargo test -p pij-daemon --lib adopt_
<isolated pij-rs daemon + registered seat> ./node_modules/.bin/tsx .pi/extensions/pij/cli.ts state pij-review-seat --json
TMUX_PANE= ./node_modules/.bin/tsx .pi/extensions/pij/cli.ts adopt --harness claude
harness checks
```

## H) Handover Brief

**Review result**: **APPROVE**

**Plan**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/plan.dd.json`
**Re-review diff**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/reviews/re-review-pij-outstanding-genar.diff`
**Review file**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/docs/plans/114-ready-on-rs/assets/reviews/re-review-pij-outstanding-genar.md`

### Files Reviewed

| File (absolute path) | Status | Action Needed |
|----------------------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts` | F001/F002 closed | None. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/core/generation-routing.ts` | F002/F003/F005 closed | None. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/cli.ts` | F001/F005 closed | None. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/identity.rs` | F004/F005 closed | None. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/mod.rs` | F004 closed | None. |

### Required Fixes

None for F001-F005.

### Handback

The review correction is approved. Do not treat this as the live
operator-gesture receipt or as closure of plan ACs that have not yet been
receipted.
