# Workshop: Receipt / parse-ack vocabulary

**Type**: API Contract
**Plan**: 061-team-scaffold
**Spec**: (pre-plan workshop — business source = `original-ask.md` + `research-dossier.md`)
**Created**: 2026-07-20T10:25:00Z
**Status**: Final (2026-07-21) — ack-key amendment explained to and endorsed by Jordan; decisions stand

**Value Thesis**: turns "I sent it" from memory into artifact (the coalface #1 ask, survey §5) without breaking the shipped delivery-receipt surface.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready (provisional)

**Selected Value Axes**:
- **Safety to Change**: `ReceiptState` (`queued|delivered|unverified`) has shipped consumers (`send --wait`, F-04) — additive-only extension
- **Proof Quality**: receipt proves *parse + identity*, not just delivery — "judge the artifact that can distinguish the states you care about" (survey §8)
- **Agent Readiness**: one flag (`--packet`) and one receipt artifact; no new protocol for senders to learn

**Related Documents**: `001-team-manifest-and-verb-vocabulary.md` (the `pij dispatch` verb) · `../research-dossier.md` F-04, H-05

---

## Purpose

Decide how a parse-ack rides the existing receipt machinery so `pij dispatch` can prove a brief arrived, was read, and who/what read it.

## Key Questions Addressed

- Extend `ReceiptState` or add a receipt kind?
- What does the ack carry, and who emits it?
- How does a non-cooperating (non-pij-aware) peer degrade?

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A: extend `ReceiptState` with `parsed` | 4th value in the shipped enum | one surface | every consumer switching on 3 values breaks silently — the exact "true-but-narrow" class | Rejected |
| **B: new receipt kind `brief-ack`** — separate receipt event alongside `send-delivered-receipt` at the `inbox.ts` consume seam; delivery states untouched | additive event, additive schema (036 F-08 posture) | shipped surface untouched; ack carries structured payload; degrades cleanly (delivery receipt still arrives without ack) | second receipt type to document | **Selected (provisional)** |
| C: ack as plain message convention (prose "brief-ack" reply) | status quo (kickoff ritual leg c) | zero code | unverifiable, unqueryable — the gap being fixed | Rejected (stays as the *human-judgment* layer on top) |

## The `brief-ack` contract

```typescript
// Emitted by the RECEIVING seat (its harness turn), routed like send-delivered-receipt (inbox.ts:213-235 seam)
interface BriefAckReceipt {
  schema_version: 1;
  kind: "brief-ack";
  messageId: string;         // the dispatch send
  packetId: string;          // from the packet header
  packetSha256: string;      // receiver recomputes from the FILE at the pointer — proves it read the right bytes
  declaredRuntime: {         // self-report, graded per survey (pin vs stated vs rendered)
    model: string | "default";
    effort: string | "default";
    source: "self-report";
  };
  seat: string;              // receiver pij id
  ts: string;
}
```

- **Emission**: dispatch packets carry a standard header block (packetId + sha + "reply with brief-ack"); a pij-aware seat's ack is one CLI call: `pij ack <dispatchId> --packet-sha <sha>` (new small verb, platform parser) — the CLI computes/verifies and emits the receipt. **[AMENDED at build — FINAL, endorsed by Jordan 2026-07-21]**: ack keys on the preallocated **dispatch id**, not the transport `messageId` — the messageId is allocated only at deliver-time (after the immutable body is written), so a header naming it cannot be runnable. The transport messageId is recorded on the dispatch record when the send returns; the receipt still carries the actual `messageId` (resolved from the record at ack time). Discovered as a real interface constraint during P2 T006 (coder question 2, execution.log Discoveries).
- **`pij dispatch --wait`** resolves on `brief-ack` (not on delivery); timeout leaves the dispatch record `state: delivered-unacked` — a **distinguishable** state, never conflated with acked (the shutdownType lesson, survey §8).
- **Degradation**: non-cooperating peer → delivery receipt only, record stays `delivered-unacked`; the parent applies judgment (today's status quo, now visible as data).
- **Store**: dispatch records land in `~/.pij/dispatches/<id>.json` (subdir law) with the packet sha + receipt refs; spine event kind `dispatch` (W-01 D4).
- Leg (c) "ack in own words" remains human judgment ON TOP of the mechanical ack — the mechanical receipt never substitutes for comprehension (survey: never automate leg c).

## Attention Reduction

| Future Loop | Before | After |
|---|---|---|
| Did the brief land? | tail transcripts / re-send "in case" (stoat's systematic double-send) | `pij dispatch --wait` or query the dispatch record |
| Model provenance at dispatch | hand-rolled 3-way grading in prose packets | `declaredRuntime` field on every ack, graded vs registry pin by `pij canary` |
| Cross-family independence check | orchestrator eyeballs footers | compare ack `declaredRuntime` across coder/reviewer mechanically |

## Open Questions

### Q1: does the receiving harness auto-ack, or does the seat's agent run `pij ack` as an instructed first action?
**RESOLVED (provisional)**: instructed first action in v1 (packet header says so) — auto-ack by the harness would prove delivery-again, not that the agent's turn engaged the packet. Revisit if ack compliance is poor.

### Q2: receipt retention/GC
**OPEN — small**: dispatches dir growth; likely rides existing standing-hold/reap rules (age-gated). Plan-decidable.

## Validation / Acceptance

- Existing `send --wait` behavior byte-unchanged (regression test)
- A dispatch to a cooperating seat yields delivery receipt + brief-ack with matching sha; to a non-cooperating seat yields `delivered-unacked` — three states, three distinguishable reads
- Wrong-file ack (sha mismatch) → named error, receipt refused (no silent success)
