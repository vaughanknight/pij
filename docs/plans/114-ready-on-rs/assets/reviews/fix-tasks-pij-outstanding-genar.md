# Fix Tasks: plan 114 cross-model review

Apply in order. Re-run the plan-114 review after all five tasks.

## Critical / High Fixes

### FT-001: Preserve unexpected rs probe faults as controlled outcomes

- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts`, `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/cli.ts`
- **Issue**: Unexpected detector exceptions escape the detached entry promise.
- **Fix**: Add an explicit probe-error outcome carrying the reason, map it to
  `rs-error` without fallback, and guard the top-level promise as a final safety
  boundary.
- **Patch hint**:
  ```diff
  - throw error;
  + return { kind: "probe-error", location, detail: errorMessage(error) };
  ```
- **Proof**: A non-envelope health response, a wire-skew response, and a
  non-auth daemon refusal each produce one named `E-RS` result, no stack trace,
  and never invoke legacy.

### FT-002: Keep an unavailable rs roster unknown

- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/adapters/generation-router.ts`, `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/core/generation-routing.ts`
- **Issue**: Failed roster lookup becomes `false`, authorizing legacy follow.
- **Fix**: Change `seatInRs` to return `boolean | undefined`; retain
  `undefined` across failed reads and require a real `false` before
  `legacy-seat-followed`.
- **Patch hint**:
  ```diff
  - return resolved === undefined ? false : resolved.has(id);
  + return resolved?.has(id);
  ```
- **Proof**: With the same id resident in both stores and `/v1/seats` unreadable,
  the shim returns a named rs error or other explicit uncertainty, never legacy.

### FT-003: Make the JSON response contract row-owned

- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/.pi/extensions/pij/core/generation-routing.ts`, relevant rs response types/handlers, seam tests
- **Issue**: `--json` emits unchecked rs-native payloads.
- **Fix**: Require every route row to carry a JSON compatibility projection, or
  a named refusal when rs cannot supply the legacy schema. Do not stringify raw
  payloads at the generic dispatch layer.
- **Patch hint**:
  ```diff
  - if (argv.includes("--json")) return { kind: "json", text: JSON.stringify(payload) };
  + if (argv.includes("--json")) return row?.toJson
  +   ? { kind: "json", text: JSON.stringify(row.toJson(payload)) }
  +   : { kind: "no-renderer", message: "... no JSON compatibility projection ..." };
  ```
- **Proof**: Production-shim tests compare `whoami --json` and `state --json`
  output against required legacy fields, including `orchestrationRole` and the
  total `verbs` map; shapes rs cannot fulfill fail by name.

### FT-004: Exclude tombstoned rows from live identity and report writes

- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/identity.rs`, `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/mod.rs`, identity/report tests
- **Issue**: An asserted tombstoned seat receives identity confirmation and can
  accept a successful report.
- **Fix**: Return an envelope refusal with tombstone reason for identity
  resolution and report writes when `tombstoned_at` is set.
- **Patch hint**:
  ```diff
  - Ok(Some(seat)) => Resolved::Seat(seat, ResolvedBy::AssertedId),
  + Ok(Some(seat)) if seat.tombstoned_at.is_none() =>
  +     Resolved::Seat(seat, ResolvedBy::AssertedId),
  + Ok(Some(seat)) => Resolved::Refusal(refused(command, tombstone_reason(&seat))),
  ```
- **Proof**: Supersede a process-sharing predecessor, then prove asserted-id
  whoami/phonehome/report all refuse and no card/spine event is written.

### FT-005: Reject direct paneless adopt at the rs boundary

- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/pi-hacking/pij-worktrees/s114-ready-on-rs/crates/daemon/src/http/identity.rs`, identity/seam tests
- **Issue**: The routing shim bypasses legacy's required-pane parser and supplies
  its own ephemeral pid as apparently valid evidence.
- **Fix**: Reject `adopt` with no pane unless and until a dedicated paneless
  admission protocol provides durable seat-process evidence. Preserve the
  existing legacy route for paneless registration.
- **Patch hint**:
  ```diff
  - } else {
  + } else if !args.paneless {
  +     return refused(ADOPT, "adopt requires a live tmux pane; paneless seats remain legacy");
  + } else {
  ```
- **Proof**: Routed `pij adopt --harness claude` outside tmux refuses and leaves
  no row; the real pane form still persists a row whose later phonehome is bound.

## Medium / Low Fixes

None.

## Re-Review Checklist

- [ ] All high fixes applied.
- [ ] Each new regression test crosses the production TS shim to an rs handler.
- [ ] The response-schema test does not construct two independent schema copies.
- [ ] Re-run this review and achieve zero HIGH/CRITICAL findings.
