# PROPOSAL — pij as OSC 7337 Delegation Ledger Producer B

**Status**: local branch `feat/osc-7337-producer`, **NEVER pushed**. A proposal to
the pij repo's owner — not a merge. The live daemon runs off `~/GitHub/pij`
(main); this was authored in an isolated worktree and touches neither.

## What

A small, pure, sink-injected emitter (`osc-7337-producer.ts`) that mirrors pij's
**own** writes onto the owning pane's tty as OSC 7337 `agent.*` payloads:

- any semantic-state write → `agent.state <word>` (the WS-6 semantic eight,
  imported verbatim from pij's own `SEMANTIC_STATES` — one source, no synonym)
- entering `question`/`blocked` → `interrupt raised` (`interrupt_kind: question`)
- leaving `question`/`blocked` → `interrupt cleared` (paired id `intr-<node>`)
- `done` (+refs) → `claim` with evidence mapped from the state's refs
- node liveness → `agent.state working|idle`

It emits **only** what pij knows. It never sees a session's tool/turn/usage
internals, so it emits none of them (the contract's honesty rule).

## Why

trex-streams plan **s080-delegation-ledger** lands one public event contract
(`shared-assets/protocol/delegation-ledger.md`) with **two genuinely independent
producers**, so the schema is a *protocol*, not a private dialect. pij is
Producer B. Acceptance is the repo owner's call and is NOT required for the
trex-side wave to exit — the contract counts producers *built + conformant*, and
one conformance fixture proves both speak the same wire.

## How it's proven (no trex dependency in pij's own tests)

- **`osc-7337-producer.test.ts`** — vitest, FAKE tty sink (ADR-0004): asserts the
  full § Producer B mapping + clamps + tmux framing. In-branch; runs in pij CI.
- **`conformance.ts`** — vitest-free (bare `tsx`): the same mapping asserted with
  `node:assert`, plus a byte generator. Ran green here:
  `PIJ_OSC_CONFORMANCE PASS — 7 mapping checks`.
- **Cross-repo (AC-03)** — the emitter's captured bytes decoded through trex's
  SHIPPED scanner→parser→ledger chain (`Trex --decode-file-selftest`) →
  `interrupt raised (question)`, `interrupt cleared`, `claim (evidence)`,
  `declared=idle`. No pij-specific parsing anywhere in trex.

## How to wire it (the single choke point)

pij persists a semantic transition as a spine `state-set` event (the word rides
in structured refs `state:<word>`; evidence rides in `sha:/branch:/selftest:/file:`
refs) and updates node liveness. At that **one** write path:

```ts
import { emitStateWrite, emitLiveness, paneTtySink } from "./producers/osc-7337-producer.js";

// paneTty from the tmux adapter (#{pane_tty}); tmux:true when the pane is under tmux.
const sink = paneTtySink((bytes) => appendToTty(paneTty, bytes));
emitStateWrite({ nodeId, word, prevWord, note: stateNote, refs }, sink, { tmux });
// on a liveness edge:
emitLiveness({ nodeId, liveness }, sink, { tmux });
```

Fire-and-forget, best-effort (declare-only law): a failed write must never block
a state write. Nothing here reads session internals or changes pij behaviour —
it is a pure mirror of writes pij already makes.

## Review checklist

1. `node <tsx> conformance.ts` → `PIJ_OSC_CONFORMANCE PASS`.
2. `node <tsx> conformance.ts /tmp/pij.bin` then, in a trex checkout,
   `Trex --decode-file-selftest /tmp/pij.bin` → the 3 agent.events + declared state.
3. Confirm the emitter imports pij's own `SEMANTIC_STATES` (L5 — no minted words).
4. Confirm it emits no tool/turn/usage (honesty rule).

## Constraints (non-negotiable)

- Branch is **local only** — never pushed; acceptance is the owner's decision.
- Do not restart the daemon; do not touch the `~/GitHub/pij` main working tree.
