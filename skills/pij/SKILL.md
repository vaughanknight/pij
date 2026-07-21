---
name: pij
description: Route pij platform jobs — adopt a seat and wait (/pij ready), spawn & talk to tmux colleagues (claude/copilot/codex/pi peers), run flow-pair coder+reviewer delegation fleets, delegate single tasks, run pij agent packs (flowspace-search etc.), run an installed skill in a peer (/validate-v2, /thesis…) with the result pushed back, manage the pij daemon and tmux/registry hygiene. Use when the user says "pij ready", "adopt and wait", "spawn a peer/colleague/worker", "flow-pair", "delegate this", "run an agent", "have a peer run /X", "pij daemon", or any pij orchestration ask.
---

# /pij — the pij platform router

> **`/pij` (this skill) ≠ `pij` (the CLI binary).** The CLI on `$PATH` is the machine surface — verbs like `pij spawn`, `pij send`. This skill routes **jobs** to protocol modules that *use* that CLI; it never replaces it. When a route says run `pij <verb>`, that means the CLI, printed in a fenced block.

**Grammar**: `/pij [<route>] [args]` — no route = guided (detect, offer ONE route); with a route = direct (load ONLY that module).

## Two load paths

- **Guided** — `/pij`: read [`references/00-routing.md`](./references/00-routing.md) (signals + precedence), derive where you are from deterministic probes, offer exactly one route. A route hint that contradicts the signals is redirected, never blindly run.
- **Direct** — `/pij <route> [args]`: load `references/routes/<route>.md` and follow it. No engine, no detection.

**Progressive disclosure is the contract**: load exactly one route module per step; a module may lazily pull `00-routing.md` § Shared conventions when it cites one. Never read all modules up front.

## Registry

| route | job — "I want to…" | module |
|---|---|---|
| `ready` | adopt/register this seat, report ready, then wait without starting work | `references/routes/ready.md` |
| `pair` | run a phase with a coder + cross-model reviewer fleet, wrapping the-flow | `references/routes/pair.md` |
| `delegate` | hand ONE bounded task to ONE peer — no review cycle | `references/routes/delegate.md` |
| `agent` | run a packaged agent pack — fire-and-forget or resident | `references/routes/agent.md` |
| `skill` | run an installed skill (`/validate-v2`, `/thesis`…) in a peer, output pushed back | `references/routes/skill.md` |
| `peer` | spawn & talk to an ad-hoc colleague in any harness | `references/routes/peer.md` |
| `ops` | daemon health, registry & tmux hygiene | `references/routes/ops.md` |
| `node` | work durable project/stream/dispatch truth, node states, adoption repair, and anomaly queries | `references/routes/node.md` |
| `prime` | govern many agents in one repo: one o-prime seat, stream orchestrators below, government as single-writer files | `references/routes/prime.md` |
| `watch` | subscribe a non-pi peer to file-change notices — `pij watch`/`pij unwatch` (self-serve) | *(shipped, plan 033 — CLI verbs; see `docs/how/pij-peer-watch.md`; no route module)* |

Module missing at its path → say so and stop. Never improvise a route from memory.

## CLI-verb coverage (every `pij` verb has a home)

| CLI verb | lives in |
|---|---|
| `spawn` `send` `tail` `close` `adopt` `whoami` `list` `state` `inbox` `tree` `link` | peer route |
| `agent` (`list/run/spawn/show/new/check/eject/report`) | agent route |
| `daemon` `phonehome` `path` `telegram` | ops route |
| `compact-self` `models` | § Shared conventions (00-routing.md) |
| `watch` `unwatch` | peer file-watch (shipped plan 033 — `docs/how/pij-peer-watch.md`) |
| `watchdog` (`status/pause/resume/exempt/reset/interval/watch/unwatch/list/disable-all/enable-all`) | peer supervision — etiquette + intent in § Shared conventions C8 (00-routing.md); deep reference `docs/how/pij-watchdog.md` |
| `focus` (`save/list/launch`) `sessions` | peer route (focus = immutable native-session checkpoints; launch forks pending-canary — canary-verify applies. sessions = telemetry join table) |
| `orchestration` (`baton`/`prime`) | prime route + orchestration CLI (`pij orchestration …`) |
| `project` `stream` `fence` `dispatch` `ack` `canary` `spine` `task` (`set`) `state` (`set/verify`) `node` (`show`) `anomalies` | node route (platform governance + team-scaffold records) |

`/pij prime` selects the skill route; `pij orchestration prime` invokes its CLI
primitive. `baton` is the other orchestration subcommand.

## Global invariants (every route)

1. **Never write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md` — the-flow guided mode is their sole writer.
2. **Pointer delivery**: persist packets/large bodies to disk first; `pij send` carries a short path pointer, never a full body.
3. **Forbidden paths in every packet**: enumerate at minimum the three files above, plus any ledger dirs the route names.
4. **Persist before mutate**: roster/ledger records are written before the state they describe changes.
5. **Delivery-owned waiting**: tmux/pi peers receive pushed turns; non-tmux external peers block on `pij inbox --wait`. Never sit in a `pij state` wait loop.
6. **Completion interrupt**: when a reusable/live coder completes or a reviewer returns a verdict, compact that peer as the first tool action, then continue immediately. § C3 owns the lifecycle boundary and command contract.
7. **Ownership-aware teardown**: close only what you spawned; `--force` only on the owner's explicit ask.
8. **Token-lean output**: cite conventions instead of restating them; say only what's needed.
9. **Non-blocking questions**: never `ask_user_question` or any modal question UI — ask inline through the active delivery channel, persist the pending decision, block only dependent work.
10. **Questions stay with their context owner**: whoever needs the answer asks the human directly; parents receive a pointer and never proxy. Doctrine for 9–10: `references/prime/protocol.md` § Human rulings.
11. **Isolation removes edit-time serialization, not convergence-time serialization**: work confined to a verified stream worktree/branch is notify-only under a recorded descriptive fence; synchronize at converging histories or shared mutable resources. Trigger matrix: `references/prime/rituals/batons.md`.

## Aliases (read-time — never a second implementation)

| typed / intent | resolves to |
|---|---|
| "adopt your window and wait" / "report ready; prime will contact shortly" | `/pij ready` |
| `/flow-pair start\|dispatch\|observe\|review\|fix\|accept\|ledger\|learn …` | `/pij pair …` (same args) |
| "spawn a worker / colleague / peer" | `/pij peer` |
| "run flowspace search" / "ask an agent" | `/pij agent` |
| "have a peer run /X on …" / "run a skill in a peer" | `/pij skill` |
| "stand up an o-prime" / "govern this repo" | `/pij prime` |

## References

- [`references/00-routing.md`](./references/00-routing.md) — detection signals, precedence, and § Shared conventions (C1 harness/delivery modes · C2 canary-verify · C3 compact discipline · C4 model discovery · C5 placement & split-cap · C6 daemon restart rule · C7 push-vs-pull waiting).
- `references/routes/<route>.md` — one contract-bound module per registry row.
