# `activityCredibility()` — published contract (s095 → s097)

**Status**: PUBLISHED 2026-08-08 · scoped to s095 by prime ruling · **s097 codes against this now**
**Home**: `.pi/extensions/pij/core/state.ts` (pi-free, pure, table-tested — Patterns P2/P8)
**Implemented by**: s095 (`pij-fair-aphid`) · **Consumed by**: s097 (`core/anomalies.ts`), and any future board
**Merge order**: s095 lands before s097. **No edit-time serialisation** — code against this signature immediately.

---

## The question it answers, once

> *"May this seat's recorded activity be rendered as CURRENT?"*

It is a **suppressor, never a subject** (s097's framing). It never invents, rewrites, or clears
an activity — `state` and `lastEventAt` keep their full historical record. It only answers
whether a consumer may present that record as describing the seat **now**.

It exists so no consumer has to remember to check `terminal`. A rule that needs a broadcast to
stay true is worse than one that cannot collide.

---

## Signature

```ts
/** Why an activity reading is, or is not, credible as CURRENT.
 *
 *  DISCRIMINATED ON PURPOSE: a consumer that renders "superseded because the agent
 *  process is gone" differently from "superseded because the seat was dissolved"
 *  must never string-match prose. `reason` is for humans and may be reworded
 *  freely; `cause` is the contract and is byte-stable. */
export type ActivityCredibilityCause =
	/** A live probe corroborated the agent — the strongest evidence available. */
	| "observed-live"
	/** Nothing contradicts the recorded activity. */
	| "uncontradicted"
	/** The agent was observed absent (terminal record, or a live absent probe). */
	| "agent-absent"
	/** `lifecycle: "dissolved"` — the one unambiguous terminal state. */
	| "dissolved"
	/** pij asked for this teardown; the seat is gone by request, not by inference. */
	| "close-requested"
	/** The liveness observation itself was unavailable — we do not know. */
	| "probe-unavailable"
	/** No activity telemetry was ever recorded — no proof it was working, and
	 *  equally no proof it was not. NOT the same as "it was idle". */
	| "no-activity-recorded";

/** Three-valued by necessity. `unknown` is NON-SUPPRESSING: a consumer renders the
 *  activity WITH its age and an explicit uncertainty marker, and never silently
 *  drops it. Silently dropping is how a refusal to accuse without proof becomes a
 *  refusal to look (cf. anomalies.ts `if (lastEventMs === undefined) continue`). */
export type ActivityVerdict = "current" | "superseded" | "unknown";

export interface ActivityCredibility {
	readonly verdict: ActivityVerdict;
	readonly cause: ActivityCredibilityCause;
	/** Human-readable. NOT a contract — never parse this. */
	readonly reason: string;
	/** ISO-8601 timestamp of the evidence behind the verdict (e.g.
	 *  `terminal.observedAt`), so a consumer can render "superseded 6d ago"
	 *  without re-deriving it. Absent when no dated evidence applies. */
	readonly asOf?: string;
}

/** Structural input (Pattern P6) — deliberately NOT a `SessionDescriptor`, so any
 *  consumer can call it without importing descriptor plumbing, and so a caller may
 *  pass a fresher probe than the descriptor carries. */
export interface ActivityCredibilityInput {
	readonly state?: "working" | "idle";
	readonly lastEventAt?: string;
	readonly lifecycle?: SessionLifecycle;
	readonly terminal?: TerminalObservation;
	/** Optional fresh liveness probe. When present it OUTRANKS the stored
	 *  `terminal` record — a live observation beats a durable one. Omit it and the
	 *  verdict is derived from the descriptor alone, which is the common case for a
	 *  detector reading the registry. */
	readonly agentLiveness?: AgentLiveness; // "alive" | "absent" | "unknown"
}

export function activityCredibility(input: ActivityCredibilityInput): ActivityCredibility;
```

## Precedence (first match wins — this order is part of the contract)

| # | condition | verdict | cause |
|---|---|---|---|
| 1 | `lifecycle === "dissolved"` | `superseded` | `dissolved` |
| 2 | `agentLiveness === "alive"` | `current` | `observed-live` |
| 3 | `agentLiveness === "absent"` | `superseded` | `agent-absent` |
| 4 | `terminal.disposition === "unavailable"` | **`unknown`** | `probe-unavailable` |
| 5 | `terminal.disposition === "requested"` | `superseded` | `close-requested` |
| 6 | `terminal` present (any other disposition) | `superseded` | `agent-absent` |
| 7 | `agentLiveness === "unknown"` | **`unknown`** | `probe-unavailable` |
| 8 | no `state` **and** no `lastEventAt` | **`unknown`** | `no-activity-recorded` |
| 9 | otherwise | `current` | `uncontradicted` |

Rules 2/3 outrank 4–6 because a fresh observation beats a stored one. Rule 8 is the
`anomalies.ts:398` defect stated positively: *"no telemetry"* is reported as **unknown and
rendered**, never conflated with *"nothing to see"*.

`asOf` is `terminal.observedAt` for rules 4–6, and omitted otherwise.

## Why this is safe to ship only because of s095 Phase 2

**If `terminal` stays a latch, the predicate inherits the latch and confidently suppresses live
seats.** A credibility verdict built on an uncorroborated input is a more authoritative version
of the same lie — 15 seats carry a latched `terminal` today and **two of them are alive right
now**. Phase 2 (unlatch on contrary evidence) is not a sequencing preference; it is the thing
that makes this predicate safe to call at all.

That is also why the merge order is s095 → s097, while the *coding* order is parallel.

## Non-goals — what this predicate must NOT be used for

**`superseded` is a RENDERING verdict, not a teardown authority.** It answers "may I show this
activity as current?" and nothing else.

- **Never key an irreversible action on it** — no `close`, no pane kill, no descriptor dissolve,
  no eviction. A predicate that decides what a board *displays* must never decide what a
  supervisor *destroys*.
- **This is not hypothetical.** pij#171 is the live example: a stale binding (`paneId` re-leased
  by tmux after a server restart) nearly killed a live seat in another government, because a
  stored identifier was treated as a current identity. `terminal` is the same class of input,
  and while it remains a latch anywhere in the system, anything irreversible keyed on a verdict
  derived from it inherits that defect **with more authority, not less**.
- **`unknown` is non-suppressing and must stay that way.** Rendering an uncertain activity with
  its age and an explicit marker is the contract; silently dropping it converts a refusal to
  accuse without proof into a refusal to look.
- Teardown authority remains where it already lives: `lifecycle: "dissolved"`, an explicit
  `closeIntent`, and the owner's explicit instruction.

A contract that says what it must not be used for ages better than one that only says what it
does.

---

## Stability commitment

`ActivityCredibilityCause` values and the precedence table above are **byte-stable**; s095 will
not rename or reorder them without telling the prime. `reason` prose may change at any time and
must never be parsed.
