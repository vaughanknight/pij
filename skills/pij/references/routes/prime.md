# prime — govern many agents in one repository

> Route module — sibling-blind except the worker redirect row required by the
> role boundary. Load one pointer below, then stop.

**Job**: govern many agents in one repo: one o-prime seat, stream orchestrators
below it, platform-store facts, and single-writer government documents.

## Role triage

Use the first matching deterministic probe. Do not choose by persona or intent.
Resolve the current id with `pij whoami --json` and compare registry `id` fields mechanically.
`pij list --prime --here --json` is current-prime-only; widen as described below before concluding absence.
`oldPrime` is history, never an active-seat signal; audit retired seats with `pij tree --global --all --json`.

**An empty `--here` result is NOT evidence that no prime exists.** Widen to
unscoped `pij list --prime --json` before concluding absence — a repo's prime is
routinely recorded against a different folder (worktree, symlinked path). A live
o-prime was missed exactly this way on 2026-07-27, and the seat that missed it
went on to designate itself prime over the top.

| Probe | Role | Load exactly this next |
|---|---|---|
| My current id appears in `pij list --prime --here --json` | o-prime | [`../prime/orient-oprime.md`](../prime/orient-oprime.md), then stop |
| Fallback: `<government-root>/spine.md` names my pij id as o-prime in an unmigrated prose government, or the human explicitly seats me | o-prime | [`../prime/orient-oprime.md`](../prime/orient-oprime.md), then stop |
| The spine roster names my pij id as a stream, or I hold an adoption brief | stream | [`../prime/orchestrator.md`](../prime/orchestrator.md), then stop |
| **No prime for this repo after BOTH the scoped and the unscoped probe**, and `pij project list` names no project here | bootstrapper | [`../prime/rituals/bootstrap.md`](../prime/rituals/bootstrap.md), then stop |
| I am a fleet worker with a bounded packet | worker | Stop here; use `/pij pair` for a fleet or `/pij peer` for one colleague. |

Bootstrapper is LAST: require a silent store. A local `.harness/government/`
directory is NOT a signal in either direction. [Store-native](../prime/rituals/store-native.md)
is the default; documents live separately. Resolve `<government-root>` through
[Governance branch — the rules](../prime/rituals/bootstrap.md#governance-branch--the-rules),
never from a main/stream directory listing.

If probes conflict, registry designation is the seat signal; reconcile stale
government rows with `pij whoami`, `pij state <id>`, and the human ruling.

## Ritual index

| Need | Load exactly this |
|---|---|
| Stand up the seat and government | [`../prime/rituals/bootstrap.md`](../prime/rituals/bootstrap.md) |
| **Stand up your PA** (bootstrap deliverable — Jordan, 2026-08-01) | [`../prime/rituals/bootstrap.md`](../prime/rituals/bootstrap.md) §5 → `<government-root>/briefs/pa-standup-recipe.md`, resolved for **pij's repo**, not the consuming repo |
| Record governance in the platform store (ruled default; lazy self-migration) | [`../prime/rituals/store-native.md`](../prime/rituals/store-native.md) |
| Spawn, adopt, canary, brief, or tear down a stream | [`../prime/rituals/kickoff.md`](../prime/rituals/kickoff.md) |
| Request, grant, return, reclaim, or audit a baton | [`../prime/rituals/batons.md`](../prime/rituals/batons.md) |
| File, verify, relay, or digest a report | [`../prime/rituals/reports.md`](../prime/rituals/reports.md) |
| Something just went wrong across seats — record, repair, rule, encode | [`../prime/rituals/incidents.md`](../prime/rituals/incidents.md) |

## Prime invariants

- Government files have one writer; see [`../prime/protocol.md#government-files`](../prime/protocol.md#government-files).
- At each commit boundary, apply `00-routing.md` § C11 (Commit attribution).
- Worktree-local activity is notification-only; synchronization begins at shared
  mutable resources or converging histories; see
  [`../prime/protocol.md#construction-fences-batons-and-landing`](../prime/protocol.md#construction-fences-batons-and-landing).
- An orchestrator seat never runs long blocking subagents in its own session;
  role-address sends; see [`../prime/protocol.md#seat-identity`](../prime/protocol.md#seat-identity).
- Human rulings land in durable government or plan files immediately; questions
  never block (modal UIs forbidden; the context owner asks); see
  [`../prime/protocol.md#human-rulings-and-non-blocking-questions`](../prime/protocol.md#human-rulings-and-non-blocking-questions).

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
