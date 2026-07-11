---
name: pij
description: Route pij platform jobs — spawn & talk to tmux colleagues (claude/copilot/codex/pi peers), run flow-pair coder+reviewer delegation fleets, delegate single tasks, run pij agent packs (flowspace-search etc.), run an installed skill in a peer (/validate-v2, /thesis…) with the result pushed back, manage the pij daemon and tmux/registry hygiene. Use when the user says "spawn a peer/colleague/worker", "flow-pair", "delegate this", "run an agent", "have a peer run /X", "pij daemon", or any pij orchestration ask.
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
| `pair` | run a phase with a coder + cross-model reviewer fleet, wrapping the-flow | `references/routes/pair.md` |
| `delegate` | hand ONE bounded task to ONE peer — no review cycle | `references/routes/delegate.md` |
| `agent` | run a packaged agent pack — fire-and-forget or resident | `references/routes/agent.md` |
| `skill` | run an installed skill (`/validate-v2`, `/thesis`…) in a peer, output pushed back | `references/routes/skill.md` |
| `peer` | spawn & talk to an ad-hoc colleague in any harness | `references/routes/peer.md` |
| `ops` | daemon health, registry & tmux hygiene | `references/routes/ops.md` |
| `prime` | govern many agents in one repo: one o-prime seat, stream orchestrators below, government as single-writer files | `references/routes/prime.md` |
| `watch` | subscribe a non-pi peer to file-change notices — `pij watch`/`pij unwatch` (self-serve) | *(shipped, plan 033 — CLI verbs; see `docs/how/pij-peer-watch.md`; no route module)* |

Module missing at its path → say so and stop. Never improvise a route from memory.

## CLI-verb coverage (every `pij` verb has a home)

| CLI verb | lives in |
|---|---|
| `spawn` `send` `tail` `close` `adopt` `whoami` `list` `state` | peer route |
| `agent` (`list/run/spawn/show/new/check/eject`) | agent route |
| `daemon` `phonehome` `path` `telegram` | ops route |
| `compact-self` `models` | § Shared conventions (00-routing.md) |
| `watch` `unwatch` | peer file-watch (shipped plan 033 — `docs/how/pij-peer-watch.md`) |

`prime` is a skill route, not a CLI verb; its rituals compose the existing peer,
messaging, close, state, and flow surfaces.

## Global invariants (every route)

1. **Never write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md` — the-flow guided mode is their sole writer.
2. **Pointer delivery**: persist packets/large bodies to disk first; `pij send` carries a short path pointer, never a full body.
3. **Forbidden paths in every packet**: enumerate at minimum the three files above, plus any ledger dirs the route names.
4. **Persist before mutate**: roster/ledger records are written before the state they describe changes.
5. **No polling — the daemon pushes**: ready/done/stalled/dead arrive as injected turns; never sit in a `pij state` wait loop.
6. **Ownership-aware teardown**: close only what you spawned; `--force` only on the owner's explicit ask.
7. **Token-lean output**: cite conventions instead of restating them; say only what's needed.

## Aliases (read-time — never a second implementation)

| typed / intent | resolves to |
|---|---|
| `/flow-pair start\|dispatch\|observe\|review\|fix\|accept\|ledger\|learn …` | `/pij pair …` (same args) |
| "spawn a worker / colleague / peer" | `/pij peer` |
| "run flowspace search" / "ask an agent" | `/pij agent` |
| "have a peer run /X on …" / "run a skill in a peer" | `/pij skill` |
| "stand up an o-prime" / "govern this repo" | `/pij prime` |

## References

- [`references/00-routing.md`](./references/00-routing.md) — detection signals, precedence, and § Shared conventions (C1 harness modes · C2 canary-verify · C3 compact discipline · C4 model discovery · C5 placement & split-cap · C6 daemon restart rule · C7 push-not-poll).
- `references/routes/<route>.md` — one contract-bound module per registry row.
