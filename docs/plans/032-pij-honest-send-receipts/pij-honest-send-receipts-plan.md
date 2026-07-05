# pij Honest Send Receipts — fix pij#3 (copilot send-wedge + dishonest `delivered`)
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-05
**Status**: READY
**Spec source**: unified (this file)

ℹ️ Incorporates the design seed `scratch/pij-3-send-wedge-bug.md` (a code-grounded planning seed, not a formal research-dossier). Consider the explore verb only if the confirm-oracle design needs deeper spike work (see § Workshop Opportunities).

## Business Specification

### Summary
`pij send` to an idle **control-plane copilot peer** returns `receipt → delivered` while the message frequently never lands — the tmux keystrokes are dropped (total-loss) or the Enter is swallowed (wedged-composer). The receipt is a **false positive**: it is computed from the peer's *state at send-time* (`core/cli.ts:548`), decoupled from the async daemon injection, which returns `void` and cannot report success. This plan makes the receipt **honest**: a send either positively confirms the peer took the turn (reusing the `BUSY_RE` readiness oracle just fixed for pij#4) → `delivered`, or surfaces as `unverified` (retriable) — never a silent lie. It also hardens the injection itself (re-type on total-loss, positive submit-confirm) so fewer sends need the retriable path.

### Goals
- `pij send` **never** reports `delivered` for a message that did not provably reach the peer; an unconfirmed injection is `unverified` (retriable), not a false success.
- The daemon's tmux injection **positively confirms** the peer took the turn (a `BUSY_RE` idle→busy transition) instead of inferring success from an empty composer.
- **Total-loss** keystroke drops (empty composer) are detected and **re-typed before submit**, not silently lost.
- `pij send --wait` and the printed receipt **expose the honest outcome** so orchestrators/fleets can retry deterministically instead of trusting a lie.
- The confirm oracle is the **same** `BUSY_RE` signal that gates bind promotion — one trust anchor, not a second version-sensitive marker.

### Non-Goals
- **NOT** fixing the pij-4s10mb "control-plane peer spawn self-awareness" gap (a spawned peer not knowing its own id / spawner / reply-form). That is a distinct issue (self-awareness at spawn, not delivery reliability) and is routed separately.
- **NOT** re-architecting copilot's focus/submit model or eliminating focus-OUT at the source.
- **NOT** changing **pi-mode** (in-process) delivery — pi injects reliably and already confirms via `turn_start`→`deliveredAt`. The receipt-honesty work targets the **tmux control-plane send path** (the focus-OUT-affected transport).
- **NOT** guaranteeing 100% injection success — the promise is an *honest, retriable* receipt, not a perfect keystroke transport.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-messaging` | existing | **modify** | Extend `ReceiptState` (+`unverified`) and the `MessageReceipt` lifecycle; make the send-handler receipt (`core/cli.ts`) honest for control-plane peers. |
| `pij-control-plane` | existing | **modify** | Positive confirm oracle (`BUSY_RE` transition) + `SendOutcome` return on `sendText`; confirm-typed re-type; daemon drain→receipt-update wiring. |

Both domains exist in `docs/domains/registry.md`. No new domain.

### Testing Strategy
- **Approach**: **Hybrid**. Pure logic (the confirm oracle, the receipt state machine, the outcome plumbing over the in-memory fake `DaemonPorts`) gets **unit tests with real captured copilot footers** (the `core/readiness.test.ts` fixture pattern). The actual tmux `send-keys` injection cannot be unit-tested (no live pane in CI) → **manual/live verification** against a real copilot peer + a fake-port unit test for the outcome threading.
- **Rationale**: the load-bearing logic is deterministic and fixture-testable; only the raw keystroke transport needs a human/live check.
- **Focus areas**: confirm-oracle confirmed↔unverified classification; receipt state transitions; `SendOutcome` threading through port→fake→loop.
- **Excluded**: real tmux injection latency/behaviour (live-verify only, documented in the execution log).
- **Mock usage**: **Avoid mocks** — real captured fixtures + the existing in-memory fake ports (the domain uses fake adapters, not mock libraries).

### Documentation Strategy
- **Location**: **No new documentation** — internal transport-reliability fix. The `docs/how/pij.md` receipt line gets a one-line touch only if `ReceiptState` gains a user-visible `unverified` in `--json` output (fold into the relevant task, not a doc phase). Memory (`copilot-bg-send-wedge.md`) + the pij#3 issue comment are updated at closeout, outside the plan doc.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=2 (≈8 files: types, cli, message, ports, loop, daemon, daemon-tmux, readiness + tests — `message.ts`/`daemon.ts` added post-validation), I=2 (daemon↔core↔cli receipt plumbing across a port boundary + 3 send sites), D=1 (a small receipt state machine), N=1 (confirm oracle is new but reuses BUSY_RE), F=1 (bounded per-send latency), T=2 (tmux injection resists unit test; needs live verify)
- **Confidence**: 0.75
- **Assumptions**: BUSY_RE (post-pij#4) reliably marks a live copilot turn; the daemon drain site (`loop.ts:424`) is the single injection point; `--wait` is the primary honest-receipt consumer.
- **Dependencies**: pij#4 BUSY_RE fix already deployed (commit `8001548`, daemon restarted).
- **Risks**: false-confirm if the pane was already busy from a prior turn (mitigated by a pre-inject busy sample / transition check); a confirm window too long for a synchronous `sendText` (mitigated by a bounded window + the async-watch alternative flagged below).
- **Phases**: 1 (Simple — inline tasks; task order encodes the injection→receipt dependency).

### Acceptance Criteria
- **AC-01**: A send to an idle copilot peer whose keystrokes are dropped (total-loss, empty composer) triggers a **re-type + submit**; if still unconfirmed after N retries the receipt is **`unverified`**, not `delivered`.
- **AC-02**: A send to an idle copilot peer that goes `◎ Working` within the confirm window yields receipt **`delivered`** (positively confirmed the peer took the turn).
- **AC-03**: `sendText` returns a **`SendOutcome`** (`confirmed` | `unverified`); the daemon threads it into a receipt event at the drain site.
- **AC-04**: `ReceiptState` includes **`unverified`** (additive — `queued`/`delivered` retained); existing receipt readers (`pij tail --type receipt`, `--json`) still parse.
- **AC-05**: `pij send --wait` **surfaces `unverified`** on confirm-timeout so a caller can retry.
- **AC-06**: The confirm oracle uses the **same `BUSY_RE`** readiness signal (single trust anchor) and does **not** false-confirm when the pane was already busy before the send.
- **AC-07**: Unit tests prove the confirm oracle (confirmed vs unverified) and the receipt transitions with **real captured copilot footers**, and are **non-vacuous** (a mutation to a key assertion flips RED→GREEN, Dim-0).
- **AC-08**: Added per-send latency is **bounded** (documented worst-case), not unbounded polling. pi-mode delivery behaviour is unchanged.

### Risks & Assumptions
- **False-confirm on already-busy pane** → sample busy-state *before* injecting; require an idle→busy **transition** (or a fresh transcript event), not absolute-busy.
- **Synchronous confirm blocks the daemon tick** → the current verify-retry already `sleepSync`s (~1.35s worst-case); keep the window bounded. If it must exceed that, the async post-send watch in the daemon loop is the fallback (flagged, not built).
- **Resolved (cross-model validation)**: `sendText` has **three** call sites, not one — `loop.ts:362` (watchdog), `loop.ts:424` (drain), `daemon.ts:125` (buffer flush). T004 handles all three (finding 09). Receipt emission belongs at the `daemon.ts` layer, not the port-less drain fn (finding 07).

### Open Questions
- **Receipt model**: add `unverified` only (plan's position — minimal, additive, `delivered`=confirmed) **vs** add a distinct `confirmed` too. → deferred to the reviewer; plan builds the minimal `unverified`.
- **Confirm location**: synchronous in `sendText` (plan's position) **vs** async watch in the daemon loop. → plan builds synchronous+bounded; async flagged if the window is too long.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Confirm oracle: transition vs absolute busy, window sizing | Spike/POC | The idle→busy transition timing against a real copilot pane is unmeasured; a wrong window either false-confirms or spuriously marks `unverified` | What window reliably catches a real turn without a prior-turn false-confirm? Is a synchronous block acceptable, or is an async watch required? |

_(Feasibility unknown is measurable with a throwaway capture-loop against one live copilot peer; verdict feeds the confirm-window constant. The reviewer/user may decline — the plan ships a bounded default and a live-verify task.)_

### Clarifications
#### Session 2026-07-05
- **Mode**: Simple (user passed `--simple`; single phase, inline tasks).
- **Testing / Mock / Docs** (Round 1, defaulted from repo convention with user momentum "do the plan then validate", overridable): Hybrid testing (unit + live-verify), avoid mocks (fake ports + real fixtures), no new docs. Flagged here so the copilot validator / user can veto.
- **Scope decisions** baked from the seed: minimal `unverified` receipt state; synchronous bounded confirm in `sendText`; reuse `BUSY_RE`. Both scope forks recorded in § Open Questions for the reviewer.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: **Confirm oracle window sizing (Spike/POC)** — declined-by-default; a live-verify task carries it if not workshopped.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | — (design seed `scratch/pij-3-send-wedge-bug.md` used instead) |
| workshops/*.md | n | none |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical `[NEEDS CLARIFICATION]` markers; Round 1 defaulted from repo convention (recorded, overridable). |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | PASS | Respects the hexagonal core/ports/adapters split; `sendText` change stays behind `DaemonPorts`; core imports no tmux. |
| G4 | ADR Compliance | N/A | No `docs/adr/*.md` constraining this path. |
| G5 | Structure | PASS | All required sections present and populated. |
| G6 | Testing Alignment | PASS | Hybrid: unit tasks (confirm oracle, receipt transitions) + a live-verify task; ACs measurable. |
| G7 | Domain Completeness | PASS | Both domains exist in the registry; Domain Manifest covers every file; no NEW domain. |

### Summary
Make `pij send` truthful over the tmux control-plane transport. The daemon's `sendText` gains a **positive** confirm oracle (a `BUSY_RE` idle→busy transition) and a `SendOutcome` return; the drain site threads that outcome into a **receipt event**, so `delivered` means "the peer provably took the turn" and everything else is `unverified` (retriable). Injection is hardened first — a confirm-typed re-type kills the total-loss variant — so fewer sends fall to the retriable path. Expected outcome: no more false `delivered`; fleets retry `unverified` deterministically.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/readiness.ts` | pij-control-plane | internal | `BUSY_RE` reused as the confirm oracle; add a busy-transition helper. |
| `.pi/extensions/pij/adapters/daemon-tmux.ts` | pij-control-plane | internal | Confirm-typed re-type, positive submit-confirm, `SendOutcome` return. |
| `.pi/extensions/pij/core/ports.ts` | pij-control-plane | contract | `DaemonPorts.sendText` signature `void` → `SendOutcome`. |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | `drainTmuxInbox` returns per-message `SendOutcome`s; port decl update. |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | `drainInbox` maps outcome→state and emits the honest receipt via `this.channel` (finding 07); buffer-flush call site (finding 09). |
| `.pi/extensions/pij/core/message.ts` | pij-messaging | contract | Widen `RECEIPT_RE` to accept `unverified` so `parseReceiptBody`/`--wait` surface it (finding 08). |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | `ReceiptState` gains `unverified`; `MessageReceipt` semantics. |
| `.pi/extensions/pij/core/cli.ts` | pij-messaging | internal | Honest send-handler receipt for control-plane peers; `--wait` surfaces `unverified`. |
| `.pi/extensions/pij/**/*.test.ts` | pij-control-plane / pij-messaging | internal | Confirm-oracle + receipt-transition unit tests with real fixtures. |

_(The in-memory fake `DaemonPorts` adapter — wherever the fakes live under `.pi/extensions/pij/` — updates with the port signature; located during T004.)_

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Receipt is decoupled from injection: `cli.ts:548` computes `delivered` from peer STATE at send-time; the async daemon injection (`loop.ts` drain → `sendText`, which returns `void`) can't report outcome — a total loss is indistinguishable from success. | Give `sendText` a `SendOutcome`; emit a receipt-update from the drain site (T003/T004/T006). |
| 02 | Critical | `composerPending` is a NEGATIVE check — empty composer → "not pending" → assumed submitted; cannot tell total-loss from success. | Replace reliance on it with a POSITIVE "pane went busy" oracle + a confirm-typed positive check before Enter (T002/T003). |
| 03 | High | Total-loss is a genuine keystroke loss (pij-4s10mb, opus-4.8 peer): focus-IN+Enter alone does nothing on an empty composer — needs a full re-type. | Confirm-typed leg: after `typeLiteral`, assert the tail is present; re-type up to N before Enter (T002). |
| 04 | High | `BUSY_RE` (readiness.ts:61, just fixed for pij#4) is the same signal that gates bind promotion — reusing it keeps ONE trust anchor, but risks false-confirm if the pane was already busy. | Sample busy-state BEFORE inject; require an idle→busy transition or a fresh transcript event (T001). |
| 05 | Medium | The receipt already has a two-stage lifecycle (`queued`→`delivered`, `deliveredAt` on `turn_start`, types.ts:187) — extend it rather than invent a parallel mechanism. | Model `unverified` as a terminal alongside `delivered`; drive the flip from the daemon's post-inject observation (T005/T006). |
| 06 | Medium | The change crosses a port boundary (`DaemonPorts.sendText`, ports.ts:52) — the real adapter, the loop port decl, AND the in-memory fake all change together or the build breaks. | Update port + real + fake + loop decl in one cohesive task (T004). |
| 07 | High | **Receipt emission can't live at the drain site.** `drainTmuxInbox` (`core/daemon/loop.ts:406`) receives only `DaemonPorts`+`SendBuffer` and returns consumed message ids — it has **no `DeliveryPort`/`EventLogPort`**, so it cannot emit a `kind:"receipt"` back to the sender. The receipt capability lives one layer up in `daemon.ts` (`drainInbox` holds `this.channel` + each message's `from`/`messageId`). The house pattern is `channel.deliver({ body: receiptBody(id,state) })` — the control-plane analog of pi-mode's `PijSession.emitReceipt` (`core/session.ts:157`). | Rewrite T006: `drainTmuxInbox` returns **per-message `SendOutcome`s**; `daemon.ts drainInbox` maps outcome→state and emits the receipt via `this.channel`. (Validator F1) |
| 08 | High | **`RECEIPT_RE` silently drops `unverified`.** `core/message.ts:38` = `/^\[pij receipt ([^\]]+)\] (queued\|delivered)$/`. `receiptBody` is type-driven (emits any `ReceiptState`), but the **parser** rejects an `unverified` body → `parseReceiptBody` returns null → `pij send --wait` ignores it and **times out** instead of surfacing `unverified`. Plan omitted `core/message.ts`. | Add `core/message.ts` to the Manifest + T005/T008: widen `RECEIPT_RE` to `(queued\|delivered\|unverified)` and prove a round-trip. (Validator F2; breaks AC-05 if missed) |
| 09 | Medium | **Three `sendText` call sites, not one** (`rg` verified): `loop.ts:362` (watchdog phonehome resend), `loop.ts:424` (inbox drain), `daemon.ts:125` (buffer flush — a control-plane peer-message path, currently `sendText(paneId, flushedText(m))` with **no harness/pid**). A `void→SendOutcome` change touches all three. | Revise T004 to inventory all sites: deliberately ignore the outcome for init/watchdog; route the buffer-flush send through the same outcome+receipt path (with harness/pid) **or** document why it is excluded. (Validator F3) |
| 10 | Medium | **Confirm oracle can miss a short turn.** An idle→busy transition check with no bounded sampling cadence + no transcript-event fallback lets a fast `ready→busy→ready` turn complete *between* samples → falsely `unverified`, contradicting AC-02. | Make a bounded polling cadence + a fresh-transcript-event fallback part of T001/T003 Done-When; live-verify the smallest realistic copilot turn duration against the window (T009). (Validator F4) |

### Implementation

**Objective**: Make control-plane `pij send` receipts honest (confirmed `delivered` vs retriable `unverified`) via a positive `BUSY_RE` confirm oracle + hardened injection, plumbed from `sendText` to the receipt event.
**Testing Approach**: Hybrid — unit tests (real captured footers + fake ports) for the oracle, the state machine, and the outcome threading; live-verify the raw tmux injection against one real copilot peer.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Reuse `BUSY_RE` as the confirm oracle: add a `paneWentBusy(preSample, postSample)` transition helper (idle→busy), so confirmation needs a *transition*, not absolute-busy | pij-control-plane | `core/readiness.ts`, `adapters/daemon-tmux.ts` | `BUSY_RE` is reused (not re-declared); the helper returns true only on an idle→busy transition (or a fresh busy sample after a known-idle pre-sample) | Per finding 04; AC-06 |
| [ ] | T002 | Confirm-typed leg: after `typeLiteral`, capture the pane and assert the text tail is in the composer; if empty (total-loss), re-type up to N before pressing Enter | pij-control-plane | `adapters/daemon-tmux.ts` | An emptied composer triggers a re-type; a present tail proceeds to Enter | Per finding 03; AC-01 |
| [ ] | T003 | Confirm-submitted leg: after Enter, sample for a busy transition on a **bounded polling cadence** within the window, **with a fresh-transcript-event fallback** so a short `ready→busy→ready` turn is still confirmed; on no-confirm retry the type+enter; after retries exhausted resolve `unverified` | pij-control-plane | `adapters/daemon-tmux.ts` | Empty-because-submitted (busy OR a new transcript event) → confirmed; empty-because-lost (never busy, no event) → `unverified` after N; cadence + worst-case latency documented | Per findings 02, 10; AC-02, AC-08 |
| [ ] | T004 | Give `sendText` a `SendOutcome` (`confirmed`\|`unverified`) return; update `DaemonPorts.sendText` (ports.ts), the real tmux adapter, the port decl, the in-memory fake, AND **all three call sites**: `loop.ts:362` (watchdog — ignore outcome), `loop.ts:424` (drain — use it), `daemon.ts:125` (buffer flush — route through the outcome+receipt path with harness/pid, or document exclusion) | pij-control-plane | `core/ports.ts`, `adapters/daemon-tmux.ts`, `core/daemon/loop.ts`, `daemon.ts`, fake adapter | Type-checks across port+real+fake+all callers; drain + buffer-flush receive the outcome; watchdog/init deliberately ignore it | Per findings 06, 09; AC-03 |
| [ ] | T005 | Extend `ReceiptState` with `unverified` (additive) AND widen `RECEIPT_RE` in `core/message.ts` to `(queued\|delivered\|unverified)` so `parseReceiptBody` round-trips it; document semantics on `MessageReceipt` | pij-messaging | `core/types.ts`, `core/message.ts` | `ReceiptState = "queued"\|"delivered"\|"unverified"`; `receiptBody`→`parseReceiptBody` round-trips `unverified`; existing readers unaffected | Per findings 05, 08; AC-04 |
| [ ] | T006 | Honest-receipt emission at the RIGHT layer: `drainTmuxInbox` (`loop.ts:406`) returns **per-message `SendOutcome`s** (not just consumed ids); `daemon.ts drainInbox` maps outcome→state and emits the receipt via `this.channel.deliver({ from: peer, to: sender, body: receiptBody(messageId, state) })` (confirmed→`delivered`, unverified→`unverified`), following the `PijSession.emitReceipt` pattern (`core/session.ts:157`) | pij-control-plane / pij-messaging | `core/daemon/loop.ts`, `daemon.ts`, `core/message.ts` | The drained inbox message yields a `kind:receipt` event on the sender's stream matching the real injection outcome; the drain fn stays port-minimal (returns outcomes, does not deliver) | Per findings 01, 07; AC-03 |
| [ ] | T007 | Honest send-handler receipt: for a **control-plane** peer stop emitting a bare optimistic `delivered` at `cli.ts:548` — the daemon's post-inject receipt (T006) is authoritative; `--wait` resolves on it and can return `unverified`; **pi-mode idle→delivered unchanged** | pij-messaging | `core/cli.ts` | An idle copilot send no longer prints a standalone `delivered` before injection; `--wait` can resolve `unverified`; pi-mode path untouched | Per finding 01; AC-05 |
| [ ] | T008 | Unit tests: confirm oracle (confirmed vs unverified, incl. the short-turn transcript fallback) with real captured copilot footers; `receiptBody`↔`parseReceiptBody` round-trip for all three states (incl. `unverified`); `daemon.ts` receipt emission over the fake channel (outcome→`delivered`/`unverified`) | pij-control-plane / pij-messaging | `core/readiness.test.ts`, `core/message.test.ts`, new `*.test.ts` | Tests cover the oracle, the parser round-trip, AND the daemon receipt-emission mapping with real fixtures + fake channel | Per findings 04/05/07/08/10; AC-07 |
| [ ] | T009 | Live-verify + Dim-0 mutation + full gate: send to a real idle copilot peer (both variants), confirm honest receipt; **measure the smallest realistic copilot turn duration and confirm the T003 window/cadence catches it**; mutate a key assertion RED→GREEN; `harness checks` green all sensors; **restart the daemon** to deploy | (cross) | test files, running daemon | Live copilot send shows honest `delivered`/`unverified`; smallest-turn measured vs window; mutation proves non-vacuous tests; `harness checks` passes; daemon restarted on the fix | Per finding 10; AC-07; daemon has no hot-reload |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T002, T003 | re-type on empty composer; `unverified` after N retries |
| AC-02 | T003 | busy transition OR transcript-event fallback within window/cadence → `delivered` |
| AC-03 | T004, T006 | `SendOutcome` return + `daemon.ts` receipt emission (right layer) |
| AC-04 | T005 | additive `ReceiptState` + widened `RECEIPT_RE`; round-trip parse (T008) |
| AC-05 | T005, T007 | `RECEIPT_RE` accepts `unverified` so `--wait` surfaces it (not a timeout) |
| AC-06 | T001 | transition helper; no already-busy false-confirm |
| AC-07 | T008, T009 | real-fixture unit tests + Dim-0 mutation |
| AC-08 | T003, T009 | bounded window; documented worst-case latency; pi-mode unchanged |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| False-confirm when the pane was already busy from a prior turn | Medium | High (a lost send reads as `delivered` again) | Pre-inject busy sample + require an idle→busy transition (T001, AC-06) |
| Confirm window too long for a synchronous `sendText` (blocks the daemon tick) | Medium | Medium | Bounded window (reuse the existing ~1.35s budget); async-watch fallback flagged in § Open Questions |
| Short turn missed by coarse sampling → spurious `unverified` (finding 10) | Medium | Medium | Bounded polling cadence + fresh-transcript-event fallback (T003); live-verify smallest realistic turn (T009) |
| Port signature change breaks the fake adapter / one of the 3 `sendText` callers (finding 09) | Medium | Medium | T004 updates port+real+fake+**all three call sites** (loop.ts:362/424, daemon.ts:125) together |
| Receipt emission attempted at the port-less drain fn (finding 07) | — | High | T006 moves emission to `daemon.ts drainInbox` (holds `this.channel`); `drainTmuxInbox` only returns outcomes |
| `unverified` silently dropped by `RECEIPT_RE`/`--wait` (finding 08 — a confirmed existing-reader break) | High | High | Widen `RECEIPT_RE` + `parseReceiptBody` round-trip test (T005/T008) |
