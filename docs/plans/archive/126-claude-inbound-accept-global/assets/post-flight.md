# Post-flight — 126-claude-inbound-accept-global

**Closed out**: 2026-09-02
**Archived to**: `docs/plans/archive/126-claude-inbound-accept-global/`
**Shipped**: not yet

## Completion

| Check | Result |
|---|---|
| Phase / task | `tk-1261` checked; plan validation complete with 0 open and 0 orphan claims |
| Acceptance criteria | AC1–AC4 checked with receipts in `plan.dd.json` |
| Latest review | r3 Claude Opus: **APPROVE**; all r1/r2 material findings resolved |
| Rust proof | `cargo test --workspace`: 533 passed; clippy clean |
| Engineering harness | `harness checks`: all 8 sensors passed |
| Live proof | real no-settings Claude transcript + isolated spine in `assets/live-claude-no-settings.md` |

## Open / deferred items

Non-blocking residuals from `assets/reviews/r3-cross-model.dd.md`:

| Kind | Item | Disposition |
|---|---|---|
| Concurrency | A Claude write between pij's read and atomic rename can still be lost | Prime decision deferred |
| Durability | Parent directory is not fsynced after rename | Next boot self-heals; prime decision deferred |
| Metadata | Atomic replacement preserves mode but not extended attributes/ACLs | Non-blocking |
| Temp hygiene | A stale temp with a recycled pid can cause one spurious error | Self-healing |
| Report semantics | `EnsureReport.after` remains the required target on error paths | Non-blocking; doctor uses `ClaudeInboundState` |
| Caller-specific home | Registration never accepts a caller-asserted write path; adopt warns read-only when its own `CLAUDE_CONFIG_DIR` lacks accept | Deferred by prime ruling |

Nine captured harness/pipeline observations remain in the agent buffer. Per the PM packet, they were listed but not cleared; drain ownership remains with o-prime. Highest-leverage substrate defects: PM return IDs can be absent from the registry, reviewer packet severities conflict with the review schema, and plan templates can omit schema-required AC/task accountability fields.
