# Phase 3 Contaminated Identity Repair - Cold Re-Review

## Verdict

**FIX_REQUIRED**

The ambient no-`PIJ_SESSION_ID` path now rejects and repairs the blind-test
descriptor correctly, and the named production regression is mutation-sensitive.
Two required identity/history cases remain incomplete.

## Findings

### F-001 - Explicit `PIJ_SESSION_ID` still bypasses external mode validation

**Severity: CRITICAL**

`.pi/extensions/pij/core/cli.ts:490-498` returns a non-empty
`PIJ_SESSION_ID` before calling the mode-aware ambient resolver.
`.pi/extensions/pij/core/discovery.ts:99-106` then accepts that value without
inspecting the descriptor's `paneId` or `deliveryMode`.

Therefore a no-tmux external process with the exact ambient native identity and
a stale exported `PIJ_SESSION_ID` can still run `pij whoami` successfully
against a paned/non-pull descriptor. This is the same contaminated-identity
bypass through a second precedence branch.

The new production regression does not cover it because
`.pi/extensions/pij/cli.integration.test.ts:303-309` explicitly sets
`PIJ_SESSION_ID: ""`.

**Required fix:** when an ambient Claude/Copilot/Codex identity is detectable,
an explicit pij id must still be joined to that exact native identity and
validated against the current delivery owner before `whoami` accepts it.
No-tmux must require paneless `deliveryMode:"pull"`; tmux must require the exact
current pane. Preserve explicit-id compatibility where no ambient native
identity exists. Add the contaminated regression with `PIJ_SESSION_ID` set to
the stale descriptor id.

### F-002 - Repair deletes append-only report history

**Severity: HIGH**

`.pi/extensions/pij/core/current-session.ts:151-162` removes `reportedAt`, and
the pure/integration tests require that deletion at
`.pi/extensions/pij/core/current-session.test.ts:144-145` and
`.pi/extensions/pij/cli.integration.test.ts:405-406`.

That field is not merely a pane attachment. `SessionDescriptor.reportedAt` is
the timestamp of a valid durable agent report
(`.pi/extensions/pij/core/types.ts:142-145`), and the control-plane contract
explicitly classifies it as append-only external state
(`docs/domains/pij-control-plane/domain.md:52`).

Clearing `agentOnce` is sufficient to disable the once-close latch:
`planOnceClose` requires `agentOnce && reportedAt`
(`.pi/extensions/pij/core/agent-peer.ts:112-121`). `reportedAt` can and should
remain as history without dissolving the repaired pull peer.

**Required fix:** clear `agentOnce` as stale once-close runtime, but preserve
`reportedAt`; invert both preservation assertions.

## Field Adjudication

| Field | Classification | Current repair |
|---|---|---|
| `reportedAt` | Durable append-only report history | Incorrectly removed |
| `lastEventAt` | Durable activity history; safe with repaired `state:"idle"` | Correctly preserved |
| `spawnedBy` | Durable ownership and agent-report target | Correctly preserved |
| `boundModel` / `effort` | Session provenance and observability | Correctly preserved |
| `branchedFrom` | Fork provenance | Correctly preserved |
| `agentPack` / `agentPackDir` | Pack identity and report-schema location | Correctly preserved |
| `agentOnce` | Pane once-close runtime after external repair | Correctly removed |
| `paneId`, `lastTickAt`, `failureReason`, `plannedHarnessSessionId`, `initInjectedAt`, `transcriptsAtSpawn` | Stale push/spawn runtime | Correctly removed |

## Verified Proof

- Focused current-session plus CLI integration suites: 49 passed.
- Named regression baseline/restores: 1 passed, 35 skipped.
- Mutation 1 bypassed external mode validation: RED because contaminated
  `whoami` returned 0 instead of 2.
- Mutation 2 omitted `deliveryMode:"pull"` from repair: RED on the persisted
  descriptor assertion.
- Both restores returned GREEN and restored
  `.pi/extensions/pij/core/current-session.ts` byte-identically to SHA-256
  `16939544a7999f9143e5c829d7eb09114a4f011a8beda1203bb0dd1ba3a6137e`.
- Full test suite: 1,876 passed, 10 skipped.
- `just pij-skill-check`, `just typecheck`, `just lint`, and
  `harness checks --quick` passed. Lint retained the existing 10 warnings and
  schema notice; smoke was skipped by `--quick`.
- `git diff --check` passed. Package-audit timestamp-only drift was restored;
  product scope remains the seven packet-allowed files.

## Disposition of Prior Findings

- Prior F-001 (ambient stale descriptor accepted): fixed for the empty
  `PIJ_SESSION_ID` path, but explicit-id precedence leaves a second bypass.
- Prior F-002 (registration preserves pane attachment): fixed.
- Prior F-003 (vocabulary-only regression): fixed by the production regression
  and independent validation/repair mutations.
