# Workshop: pij CLI Shape

**Type**: CLI Flow
**Plan**: 014-pi-session-messaging
**Spec**: [pi-session-messaging-spec.md](../pi-session-messaging-spec.md)
**Created**: 2026-06-16
**Status**: Draft

**Value Thesis**: Lock the `pij` command surface — names, flags, output shapes, error
codes — so the architect plans against a fixed contract and the worker/parent agents
can be *taught the CLI in one paragraph* (the boot self-announce). Removes the biggest
ambiguity in the build: "what exactly does an agent type?"
**Target Proof Level**: Contract Ready
**Current Proof Level**: Preferred Direction → Contract Ready

**Selected Value Axes**:
- **Agent Readiness**: the whole point — an agent must use this with zero trial-and-error from a short prompt.
- **Operator Usability**: a human debugging two windows uses the same surface.
- **Implementation Readiness**: the architect/CLI phase builds straight from these signatures.
- **Knowability**: makes the fire-and-forget + observability protocol concrete.

**Related Documents**:
- [research-dossier.md](../research-dossier.md) · [minih-prior-art.md](../minih-prior-art.md)
- Sibling: [002-parent-worker-workflow.md](./002-parent-worker-workflow.md)

**Domain Context**:
- **Primary Domain**: pij-messaging (NEW)
- **Related Domains**: pi runtime (consumed), extension-authoring-harness (consumed)

---

## Purpose

Specify the entire `pij` command-line surface as a working reference: command table,
each command's arguments/flags/output (human + `--json`), the boot self-announce text,
and the error codes. After this, "what does an agent type and what comes back" is fixed.

## Fresh Entrant Outcome

A fresh agent or human reaches **Contract Ready**: from this doc alone they can
list peers, message one, send the `compact` command, follow another's event stream
incrementally, and read a peer's state/liveness — without guessing flag names.

They should be able to:
- Discover the other session in the same folder and learn its id.
- Send a text message and a remote command to a peer.
- Tail a peer's events since a seq, filtered by type.
- Resolve a peer's on-disk paths for a direct file read.

## Key Questions Addressed

- What are the verbs, and what's the minimal flag set per verb?
- How does an agent learn *its own* id and *the peer's* id?
- What does each command print (human + machine)?
- What's the exact boot self-announce an agent receives?
- What are the failure/exit codes?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | Architect + CLI phase build directly from these signatures. |
| Primary Value Axis | Agent Readiness | The CLI must be self-teaching from a one-paragraph prompt. |
| Supporting Value Axes | Operator Usability, Implementation Readiness, Knowability | Humans share the surface; phase work is unblocked; protocol becomes concrete. |
| Downstream Loop Improved | Implementation + Agent execution | No re-litigating command names mid-build; agents act without clarification. |

## Overview

`pij` is a single Node CLI (`bin: pij`) over the hexagonal core. Every command resolves
a **target session** by id (or `--here` for the current folder). All commands accept
`--json` for machine output. The CLI and the pi extension wire the *same* core; the CLI
is how agents (and humans) act, the extension is what receives/serves.

ID convention: short, human-typeable session id (e.g. `w3` / `a1` or a 6-char slug).
`pij whoami` prints the current session's id (read from the extension's registry
descriptor for this cwd).

## Command Summary

| Command | Purpose |
|---------|---------|
| `pij whoami` | Print this session's pij id (and data dir). |
| `pij list [--here]` | List discovered peer sessions (filter to current folder). |
| `pij send <id> "<text>"` | Fire a message to a peer (injected as input). |
| `pij send <id> --command <name>` | Fire a remote command (allow-list; first: `compact`). |
| `pij tail <id> [--since N] [--type T] [--lines N] [--follow]` | Read/follow a peer's event stream. |
| `pij state <id>` | Print a peer's state + liveness verdict. |
| `pij path <id> [--events\|--state\|--dir]` | Print on-disk paths for direct file reads. |

> Design note — **`send` is the one write verb**. Text vs command is a flag, not a new
> verb, so an agent learns "to talk to a peer, `pij send <id> …`" once.

---

## `pij whoami`

```
$ pij whoami

pij session: w3
folder:      /Users/jordanknight/pi-hacking/pij
data dir:    ~/.pij/w3/
state:       working
```
```
$ pij whoami --json
{ "id": "w3", "folder": "/Users/jordanknight/pi-hacking/pij", "dataDir": "/Users/jordanknight/.pij/w3", "state": "working", "pid": 48213 }
```
**Why**: every reply needs the sender's own id; the worker prints it once and uses it
in its self-announce.

## `pij list`

```
$ pij list --here

┌──────┬───────────┬──────────┬─────────────────────────────────────┐
│ id   │ state     │ liveness │ folder                              │
├──────┼───────────┼──────────┼─────────────────────────────────────┤
│ a1 ★ │ idle      │ active   │ /Users/jordanknight/pi-hacking/pij  │
│ w3   │ working   │ active   │ /Users/jordanknight/pi-hacking/pij  │
└──────┴───────────┴──────────┴─────────────────────────────────────┘
★ = you (a1).  2 sessions in this folder.
```
- `--here` filters to peers whose `folder` matches the current cwd (the common case:
  a parent + worker in the same repo). Without it, lists all registered sessions.
- `--json` emits the descriptor array (`id, folder, dataDir, pid, state, liveness, lastEventAt`).

## `pij send`

**Text** (the everyday verb):
```
$ pij send w3 "Refactor store.ts to inject the clock via constructor, then run just test"
sent → w3  (queued: worker is busy, will steer after current turn)
receipt → queued     12:04:21Z
receipt → delivered  12:04:35Z   (+14s)
```
- **Delivery receipts**: the sender sees `delivered` immediately for an idle peer, or
  `queued` then `delivered` for a busy one (the `delivered` fires when the peer actually
  consumes the steered message — the next turn boundary). Receipts ride back as ordinary
  pij messages and also show in `pij tail`/`state`. (Proven in `scratch/receipt_test/`.)
The peer receives, injected as user input:
```
[pij from a1] Refactor store.ts to inject the clock via constructor, then run just test
```
- Idle peer → triggers a turn immediately. Busy peer → delivered via steer after the
  current turn (never mid-stream). The CLI prints which path was taken.
- `<id>` is the *peer's* id; the receiver sees `from a1`, so it replies with
  `pij send a1 "…"` — **zero lookup**.

**Command** (allow-listed):
```
$ pij send w3 --command compact
sent → w3  command=compact  (worker will compact at next safe point)
```
- Allow-list v1: `{ compact }`. Unknown name → `E-CMD` (see codes), nothing sent.
- Commands run via the pi API (`ctx.compact()`), not as text injection.

> **Why a flag, not `pij compact <id>`**: keeps the allow-list a *data* concern (one
> map), so adding a command later doesn't add a CLI verb or re-teach agents.

## `pij tail` — incremental observability

```
$ pij tail w3 --since 412 --type tool_call --lines 20

seq   ts            age    type        summary
413   12:04:22.1Z   1m58s  tool_call   edit  .pi/extensions/pij/store.ts
418   12:04:31.7Z   1m49s  tool_call   ctx_shell  just test
...
(next: --since 431 · newest event 1m49s ago)
```
- Each line is `{seq, type, timestamp, data}` — `timestamp` is ISO-8601, written at
  append. `age` is rendered (now − timestamp) so a reader spots a stall at a glance.
- `--since N` returns only events with `seq > N` (the parent's incremental follow).
- `--type T` filters (`tool_call`/`tool_result`/`message`/`usage`/…).
- `--lines N` = present-minus-N (last N events) when `--since` is omitted.
- `--follow` streams as new events append (poll, like minih's tail).
- `--json` emits raw event objects (`{seq, type, timestamp, data}`).
- The trailer prints the highest seq so the next call's `--since` is copy-paste.

## `pij state`

```
$ pij state w3
w3: working · active   (last event 2s ago, pid 48213 alive)
```
- State = the working/static signal (`idle|in-progress|paused|reviewing|complete|error`).
- Liveness verdict = `active | stale | dead` (pid probe + lastEventAt window).
- **`last event Ns ago`** is derived from the newest event's `timestamp` — a worker that
  is `working` but whose newest event is minutes old reads as a stall.
- `--json`: `{ id, state, liveness, lastEventAt, pid, ageMs }`.

## `pij path` — direct deep-dive

```
$ pij path w3 --events
/Users/jordanknight/.pij/w3/events.ndjson
```
- No flag → prints the data dir. `--events`/`--state`/`--dir` print specific paths.
- Lets the parent read `events.ndjson` directly with file tools for a tactical
  deep-read beyond `tail`'s summaries.

---

## Boot self-announce (the one-paragraph teach)

On `session_start` the extension injects this into its **own** session so the agent
knows it's a pij participant and how to act (also mirrored in AGENTS.md):

```
[pij] You are pij session "w3" (folder: …/pij). A peer pi session can message you;
incoming text arrives as "[pij from <id>] …". To reply or instruct a peer:
  pij list --here          # see peers + their ids/state
  pij send <id> "<text>"   # message a peer (they see "from w3")
  pij send <id> --command compact
  pij tail <id> --since N   # follow a peer's work
  pij state <id>            # is the peer working / alive?
Always reply to the id shown in "from <id>". You are the WORKER: do the work, keep
going, and let the parent review via your event stream.   (role injected per session)
```
- Role line (`WORKER` / `PARENT`) is parameterised — see workshop 002.

## Error / Exit Codes

| Code | Exit | Message | Cause |
|------|------|---------|-------|
| `E-NOID` | 2 | `no session "<id>" in registry` | unknown/typo id, or peer not running pij |
| `E-SELF` | 2 | `cannot send to yourself (<id>)` | target == whoami |
| `E-CMD` | 2 | `unknown command "<name>" (allowed: compact)` | command not in allow-list |
| `E-DEAD` | 1 | `session <id> is dead (pid gone)` | send/command to a non-live peer |
| `E-NOREG` | 3 | `no pij registry — is the extension loaded?` | `~/.pij/` missing / extension not active |
| `E-ARG` | 64 | `usage: pij <cmd> …` | bad invocation |

`send`/`--command` to a `stale` (but alive) peer **succeeds with a warning** (it'll be
seen when the peer next reads input); only `dead` blocks.

## Quick Reference

```bash
pij whoami                       # my id
pij list --here                  # peers in this repo
pij send w3 "do X then just test"
pij send w3 --command compact
pij tail w3 --since 412 --type tool_call
pij state w3
pij path w3 --events             # direct read target
```

---

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| One `send` verb (text/command via flag) | `pij send <id> "…"` / `--command` | One verb to teach; allow-list stays data | `--command` slightly less discoverable | **Selected** |
| Separate verbs per action (`pij msg`, `pij compact`) | verb-per-action | Discoverable | Re-teach agents per command; verb sprawl | Rejected |
| seq-based `tail --since` | monotonic cursor | Copy-paste incremental follow; survives rotation | We must own seq (minih doesn't) | **Selected** |
| byte-offset tail (minih parity) | offset cursor | Zero new state | Brittle across rewrites; not agent-friendly | Rejected |
| id = short slug + `whoami` | `w3`, printed on boot | Human-typeable; self-identifying replies | Collisions need handling | **Selected** |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Command table + per-cmd output | this doc | CLI contract | Ready |
| Boot self-announce text | this doc | Agent Readiness AC #2 | Ready |
| Error code table | this doc | failure-mode handling | Ready |
| `--json` shapes | this doc | machine/agent parsing | Draft (finalize field names in architect) |

## Validation / Acceptance

Reaches Contract Ready when:
- Every spec acceptance criterion (1–11) maps to a command/output above. ✅ (1→list, 2→announce, 3/4→send, 5→from-id, 6→--command, 7/8→tail, 9→state, 10→liveness, 11→path)
- An agent given only the boot self-announce can complete a send + a tail without further docs.
- `--json` field names are stable enough for the architect to type the core models.

## Open Questions

- **Q: id format** — short auto slug (`w3`) vs user-set alias? **OPEN** (lean: auto slug + optional `--as` later).
- **Q: `--follow` cadence** — poll interval default? **OPEN** (architect; ~200ms per minih).
- **Q: `send` to stale peer** — warn-and-send vs block? **RESOLVED**: warn-and-send; only `dead` blocks.
