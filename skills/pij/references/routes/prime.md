# prime — govern many agents in one repository

> Route module — sibling-blind except the worker redirect row required by the
> role boundary. Load one pointer below, then stop.

**Job**: govern many agents in one repo: one o-prime seat, stream orchestrators
below it, and government as single-writer files.

## Role triage

Use the first matching deterministic probe. Do not choose by persona or intent.

| Probe | Role | Load exactly this next |
|---|---|---|
| No `government/` directory exists in the consuming repo | bootstrapper | [`../prime/rituals/bootstrap.md`](../prime/rituals/bootstrap.md), then stop |
| `government/spine.md` names my pij id as the o-prime seat, or the human explicitly seats me | o-prime | [`../prime/orient-oprime.md`](../prime/orient-oprime.md), then stop |
| The spine roster names my pij id as a stream, or I hold an adoption brief | stream | [`../prime/orient-global.md`](../prime/orient-global.md), then read the consuming repo's generated `government/orient-local.md`; stop |
| I am a fleet worker with a bounded packet | worker | Stop here; use `/pij pair` for a fleet or `/pij peer` for one colleague. |

If probes conflict, trust the government row only after reconciling it with
`pij whoami` and `pij state <id>`; identity is mechanical, not self-described.

## Ritual index

| Need | Load exactly this |
|---|---|
| Stand up the seat and government | [`../prime/rituals/bootstrap.md`](../prime/rituals/bootstrap.md) |
| Spawn, adopt, canary, brief, or tear down a stream | [`../prime/rituals/kickoff.md`](../prime/rituals/kickoff.md) |
| Request, grant, return, reclaim, or audit a baton | [`../prime/rituals/batons.md`](../prime/rituals/batons.md) |
| File, verify, relay, or digest a report | [`../prime/rituals/reports.md`](../prime/rituals/reports.md) |
| Something just went wrong across seats — record, repair, rule, encode | [`../prime/rituals/incidents.md`](../prime/rituals/incidents.md) |

## Prime invariants

- Government files have one writer; see [`../prime/protocol.md#government-files`](../prime/protocol.md#government-files).
- An orchestrator seat never runs long blocking subagents in its own session;
  role-address sends; see [`../prime/protocol.md#seat-identity`](../prime/protocol.md#seat-identity).
- Human rulings land in durable government or plan files immediately; see
  [`../prime/protocol.md#human-rulings`](../prime/protocol.md#human-rulings).

## Preconditions

- Use `00-routing.md` § C1 for harness mode/adoption and § C2 for canary proof.
- A git repo, tmux, the ambient `harness` CLI, and pij daemon must be available.
  `pij spawn` starts the daemon; an adopted seat confirms itself with
  `pij phonehome`.
- The human names work. The o-prime never invents portfolio items.

## Failure modes

| Signal | Move |
|---|---|
| `E-NOID` / `E-AMBIG` while seating | Run `pij whoami`, `pij list --here`, and `pij phonehome`; reconcile dead descriptors before briefing anyone |
| Sends queue without delivery | Check daemon health and stale registry rows; follow [`../prime/rituals/bootstrap.md#recovery`](../prime/rituals/bootstrap.md#recovery) |
| Roster, baton book, or live peers disagree | Stop allocation; run the restart audit in [`../prime/rituals/bootstrap.md#recovery`](../prime/rituals/bootstrap.md#recovery) |
| A step needs doctrine not present here | Load one ritual or [`../prime/protocol.md`](../prime/protocol.md), never the whole payload |
