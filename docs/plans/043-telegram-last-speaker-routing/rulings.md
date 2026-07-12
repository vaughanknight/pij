# Rulings — Plan 043

## R1 — Planning authorization and routing precedence

**Source**: o-prime `pij-3vetx8` · **Date**: 2026-07-12

> o-prime: preamble checkpoint VERIFIED — precedence reading exactly right (reply-to > name/partial match > last-speaker fallback), fence discipline correct, foreign-changes posture correct. PLANNING AUTHORIZED via /builder in your folder. Your hard stop after plan validation stands; clarifies come to me and I relay to Jordan on his phone. Note for your dossier: s040 recently shipped memorable-id changes into telegram/match.test.ts — your base 18a8191 includes them; the partial-name matcher now matches against adjective-animal ids too, which raises the collision odds your fallback fixes.

**Binding decisions**:

- Routing precedence is reply-to, then explicit full/partial name match, then last-speaker fallback.
- Planning is authorized only inside the granted planning fence.
- Stop at `WAITING_FOR_BUILD_CONFIG` immediately after plan validation.
- Clarifications route through the o-prime to Jordan on Telegram.
- Research must account for s040 memorable-id matching on base `18a8191`.

## R2 — Copilot outage handling for any worker fleet

**Source**: Jordan via o-prime `pij-3vetx8` · **Date**: 2026-07-12

> Copilot API is having intermittent outages — workers may STOP RANDOMLY mid-packet after exhausted retries, and a stopped LLM cannot report itself. Standing doctrine effective now: (1) treat worker silence as outage-class FIRST, never misconduct-first; (2) run a liveness cadence on your workers (s042 15-min pattern); (3) a poke (any new message) restarts a stalled-but-alive seat — use it before redispatch; (4) redispatch only if pokes fail.

**Binding decisions**:

- Any later s043 worker fleet must use the outage-first liveness and poke-before-redispatch protocol.
- Planning remains lead-owned and currently has no workers to monitor.

## R3 — Captionless media uses last-speaker fallback

**Source**: Jordan · **Date**: 2026-07-12

> Yes—use last speaker for text and captionless media.

**Binding decision**:

- The fallback applies uniformly to bare text and inbound photo/GIF/file messages whose caption does not explicitly name a session.

## R4 — Builder planning defaults

**Source**: Jordan · **Date**: 2026-07-12

> Use those defaults.

**Binding decisions**:

- Mode: Simple.
- Testing: Hybrid — TDD for routing/forwarder logic plus lightweight production wiring coverage.
- Mock usage: targeted mocks at the Telegram API boundary.
- Documentation: Hybrid — update `README.md` and `docs/how/pij-telegram.md`.

## R5 — Threaded agent replies count as speech

**Source**: Jordan · **Date**: 2026-07-12

> last spoke includes if the agent replies to a message that i sent too (reply chaing style)

**Binding decision**:

- Any successfully forwarded agent bubble counts as speech whether it is unthreaded or sent with Telegram `reply_parameters` quoting Jordan's earlier message.

## R6 — Explicitly addressing a silent agent does not replace last speaker

**Source**: Jordan · **Date**: 2026-07-12

> Prior speaker A—strict last-spoke rule.

**Binding decision**:

- If Jordan explicitly addresses agent B but B has not spoken yet, the next bare message still routes to prior speaker A.
- Agent B becomes the fallback only after one of B's bubbles is successfully forwarded to Telegram.

## R7 — Implementation fleet profile

**Source**: Jordan · **Date**: 2026-07-12

> ye use the copilot 5.6sol coder and reviweer.

**Binding decisions**:

- Coder: separate Copilot peer, model `gpt-5.6-sol`, effort `xhigh`.
- Reviewer: separate Copilot peer, model `gpt-5.6-sol`, effort `xhigh`.
- Reviewer independence comes from a cold separate session even though Jordan selected the same model family.
