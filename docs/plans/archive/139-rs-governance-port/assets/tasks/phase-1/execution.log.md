# Plan 139 — phase 1 execution

## Contract checkpoint

- PM: `pij-lonely-ikrie`; prime: `pij-minor-unicorn`.
- Worktree: `/Users/jordanknight/pi-hacking/fs3-rs-governance-port`, branch `139-rs-governance-port`.
- u0 commit: `d964233d4cbf45400a6b2fc5f873de48909e7e38`.
- Canonical contracts: `../../contracts/governance-routes.json` and `../../contracts/governance-events.json`; 22 method/path pairs, 44 request/response cases, 30 event cases.
- Structural proof: `../../contracts/contract-validation.json`. This proves fixture consistency, not implementation acceptance.
- Baseline RED: `../../contracts/baseline-fanout-red.json`. Two hello-confirmed subscribers (one live-only, one since=6) missed adopt `seat.put` seq7 and `report.now` seq8; both received `message.pushed` seq9 and `delivery.outcome` seq10. SQLite confirmed seq7 at=0 and empty payload. Cursor burn reproduced.
- Full baseline `harness checks --json`: PASS all nine sensors, none skipped, at `2026-09-07T00:26:57.613Z` (258.53s). Earlier `harness boot` had missing node types, then a file-watch-notify smoke failure; the complete gate was green. No inferred root cause for the transient smoke failure.
- `just lint`: exit0; Biome schema-version informational notice only. `ddocs validate` plan/guide/packet: zero errors/warnings.

## Prime-ruled seams

1. PM supplies locally proved SHA and rescued buffers. Prime opens PR, merges, rebuilds, bounces, and closes production/chainglass AC2/AC3/AC7/AC9. PM never writes main or touches production daemon.
2. Reap: (confirmed dead process OR proc_start mismatch) AND recorded pane absent. Paneless seats use process test alone. Unknown evidence vetoes deletion; never signal the replacement process. Owner close only tombstones, separately.
3. Migration ownership: u3=0014, u4=0015, u5=0016 only if needed. No other unit touches migrations.
4. Caller identity comes from daemon resolution of CallerContext; body actor cannot confer authority. Role/close/answer accept self or recorded parent. Verification is by parent, tied to a done seq.
5. Isolation is port + state-dir + HOME + Claude/XDG homes + private tmux socket for daemon AND fixture clients. A separate guarded-start follow-up owns any explicit PIJ_TMUX_SOCKET refusal.
6. u6 also owns `adapters/generation-router.ts` and its tests: preserve full v2 envelope, never unwrap/re-wrap; native/shim JSON byte parity and shared filter parser required.
7. u3 includes spine append/events/render. Literal user kind is open; append goes through EventBus; render is an rs-only textual projection, never a legacy file write.
8. Anomaly status-stale preserves legacy 30min threshold, parked suppression, and exact detail text; 10min stderr nudge is a separate surface. This prime-approved amendment and corrected sample values are committed at `d5eabf34c5b58b1d17060aee78e7e0b357744b5b`.

## Wave 1 roster and boundary

| Unit | Peer | Worktree suffix | Status |
| --- | --- | --- | --- |
| u1 spine | pij-electoral-orlandine | -u1 | canary verified, numbered ack accepted, implementing |
| u2 role | pij-written-lansra | -u2 | canary verified, numbered ack accepted, implementing |
| u3 governance | pij-general-miriam | -u3 | canary verified, full numbered ack accepted, implementing |

All worktrees branch from u0 commit. Packets are `packet-coder-u1/u2/u3.dd.json` in each plan folder. All peers use OMP `github-copilot/gpt-6-astra-1m`, effort high; each canary quoted real whoami and footer. See `../../wave1-peers.json` for spawn receipts. Earlier u1/u3 acknowledgements were misrouted into PM scout contexts; resend/relay restored them.

Concurrent wave rule: coders write source and regression tests but run no builds/tests/formatters/linters and do not commit. They report READY_TO_VALIDATE, then hold; PM runs proof after the edit barrier and composes. A ready checkpoint is not DONE. Parent owns `daemon/http/mod.rs`, `daemon/lib.rs`, `cli/main.rs`, common exports/migration registration. Each coder supplies exact snap-in recipe and composition assumptions.

## Shared Rust role seam

- u2 owns `http::role::RoleService`, one instance shared by direct role, registration/adoption, and u3 orchestration role leaves.
- `RoleService::new(registry: Arc<dyn Registry>, store: SqliteOrchestration, event_bus: Arc<EventBus>)`.
- `with_clock(Arc<dyn Fn() -> Result<u64> + Send + Sync>)` for deterministic, fallible clock fixtures (final u2 signature).
- `assert_role(&self, actor: &SeatId, target: &SeatId, role: Option<String>) -> Result<RoleReceipt, RoleError>`.
- Receipt: `seat`, `role`, `assigned_by`, `assigned_at`, `seq`; role writer owns `role-set` publication.
- `RoleError::into_response(self, command: &str)` preserves calling command in envelope.
- `read_role(&self, seat: &SeatId) -> Result<Option<String>>`; `join_roles(&self, seats: &mut [SeatDescriptor]) -> Result<()>` uses one role query, not N+1.
- u3 owns new store methods in `orchestration.rs`: `seat_role(&self, &SeatId) -> Result<Option<RoleAssignment>>`, `clear_role(&self, &SeatId) -> Result<()>`, `list_roles(&self) -> Result<Vec<RoleAssignment>>` ordered by seat. Existing `assign_role` reused. A scout incorrectly claimed seat_role already existed; u3 source evidence corrected it.
- Omitted role preserves assignment; role setter null unsets. Registration/adoption reject null if omission cannot be distinguished. Each explicit accepted assertion emits one role-set; omitted or rejected assertions emit none.

## Shared Rust publication seam

- u1 makes EventBus implement the existing Spine port; Services.spine points at that bus, so ReportService API remains unchanged.
- Narrow store-internal transaction-publication callback approved; no eighth core port. Registry put/tombstone commits seat+event atomically, with the sole SQL INSERT helper in store/spine.rs.
- `publish_committed<T,F>` owns a static mutation future after admission and holds an owned common lock through commit+broadcast. Caller cancellation cannot strand a committed row; ordinary publish and registry callbacks share this path. Shutdown joins every producer/follower, then flushes before propagating join errors.
- Prime approved explicit coherent fake persistence: event and atomic governance history share one in-memory SqliteSpine; host adapters stay fake. Real Registry + Fake Spine refuses before store open. Real-spine mode shares its real pool; a mixed real queue may use its own configured pool.
- PM `governance_composition.rs` currently proves wave-one role/unset/read joins and coherent memory/invalid-backend behavior. The authored u4/u5 decision-answer/verify/close witness is staged at `../../contracts/governance-wave2-composition.rs` for inclusion when those units are composed; it is not ignored or waived.

## Observations

- Main dependency tree was cloned privately with APFS `cp -Rc`; no main dependency writes/install. Main binary path alone did not satisfy worktree TypeScript resolution.
- The first isolated daemon still observed shared tmux before socket isolation was added. It preserved foreign taps; an exact marker scan found zero taps owned by this run on shared server. Fully isolated daemon and private tmux server were then stopped cleanly after proof.
- OMP routed several prime messages into internal scout contexts. Prime consolidated resend and scout relays restored rulings. Recorded DL-003; never assume silent parent context contains the ruling.
- LSP indexed main even for an absolute worktree request: references returned empty, workspace/symbol returned a main URI. Treat empty references as unproven and scope-check.
- Host exposes skill instructions but no Skill/slash invocation tool; actual `eng-harness-flow --hook ...` executable attempts exit127. Flow chore receipts explicitly record unavailable; separate manual boot/checks receipts are not fabricated router results.
- Friction remains in `.harness/temp/agent/session-buffer.md`; never drain/clear before prime-owned harvest. Rescue buffers before any worktree removal.

## Composition checkpoint

- All three source patches applied to PM tree: u1 amended SHA256 `6954968c55c6930304cbed163097a5e1386d44bfab64b08140c3685fb8d43f4f`; u2 `de5e1fc10af27eacec3113c77a1b9c9ff36809a37a02e81b34d1a851969b7e45`; u3 `cc5c3115f07b1b4252b417445a89d70cbc0eb00559f3a38fa900cef59b2e74ea`.
- Source-ready receipts preserved as `assets/receipt-u1.json`, `receipt-u2.json`, `receipt-u3.json` (not acceptance receipts). All non-owned composition assumptions were explicitly requested and answered before wiring.
- Actual pre-fix Rust1.98 witnesses: u1 live2 vs durable4; u2 eight HTTP failures; u3 two absent routes; OMP two parser/readiness failures with four existing controls passing. `../../red-proof.json` records commands and raw output pointers.
- PM added generic OMP catalog identity resolution without public ModelRow changes. Real18.1.11 capture at historical spine14828 literally says no-model; tests preserve absence/refusal rather than inventing Astra.
- Approved dependencies: exact globset0.4.20, daemon sha2, store serde, daemon async-trait promotion, Tokio process feature. Lock resolution added only five globset-family packages. Validation uses `~/.cargo/bin/cargo`1.98; PATH Homebrew1.95 is not authoritative.
- First all-target checks exposed integration-only errors (missing ordinal export, Tokio feature, two pool clones, import cleanup); fixed before behavioral checks. Focused GREEN runs now in progress; no green result asserted here.
- u1 separately authors a one-file private all-real daemon boot regression; main owns coherent all-fake replay and invalid-pairing proofs. All runtime tests must keep key/home/tmux/port ownership private.
