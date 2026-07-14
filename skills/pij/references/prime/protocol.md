# o-prime protocol

A governed way to run many agents in one repository. One **o-prime seat** owns
coordination-as-substrate; stream orchestrators own one plan each and their
fleets do the work. The government is files, so replacing the seat is a read
from disk, not a handover conversation.

## Roles

| Role | Cardinality | Owns | Never does |
|---|---|---|---|
| Human | one or more | Names work, gives rulings, final authority | Delegates final authority to protocol |
| o-prime | one seat per government | Portfolio, allocation, fences, batons, roster, rulings, verification, digest | Stream implementation or a stream's plan mutations |
| Stream orchestrator | one per in-flight work item | One plan end-to-end and its worker fleet | Crosses hard ownership boundaries or uses shared/converging state without synchronization |
| Fleet worker | many, bounded | One packet inside a stream's narrowed allowlist | Governs siblings or expands scope |
| Optional overseer | zero or one | Audits the o-prime and receives numbered reports when explicitly installed | Becomes a required structural layer |

The government is not a role — the disk substrate all read, one seat writes.

## Hierarchy and escalation

```text
human
└─ [optional audit layer]
   └─ o-prime
      ├─ stream ─ fleet workers
      └─ stream ─ fleet workers
```

Escalate governance, coordination, and blocked-work state exactly one hop:
fleet → stream → o-prime → human, inserting the optional audit layer only when
it actually exists. Streams never negotiate sideways; cross-stream needs go
through the o-prime. Escalation never transfers a context-local question — its
owner asks the human directly (§ Human rulings). A human may enter any pane.

## Government files

The o-prime is the single writer of:

- `government/spine.md` — thesis, roster, fences, watch, allocations, rulings;
- `government/baton-book.md` — current leases, queue, append-only grant log;
- `government/prime-flow.json` — portfolio state;
- briefs, canary records, local orient, and encode candidates.

Anyone may read. Row state changes before prose and every mutation uses a UTC
stamp. History is struck or tombstoned, never erased. A hard restart once killed
every pane and lost no government state; that is the design test. Shapes:
[`templates/spine.md`](./templates/spine.md),
[`templates/baton-book.md`](./templates/baton-book.md).

## Portfolio and lifecycle

Prime-flow items move through `proposed → deciding → preparing → in_flight →
done | folded | dropped`, plus `blocked`. Node status is concurrent truth;
`nav.now` is only the o-prime's attention pointer.

Every orchestrator moves through `adopt → orient → preamble → work`: adoption
takes governance and proves the channel; orientation enters through `/pij prime`
and loads the orient stack plus `/thesis`; the human preamble confirms the
provisional assignment; work starts after the preamble report, and validated
plans stop at `WAITING_FOR_BUILD_CONFIG` until the human confirms the fleet.
Kickoff and teardown: [`rituals/kickoff.md`](./rituals/kickoff.md).

## Construction, fences, batons, and landing

The worktree-primary construction path gives each stream one recorded branch and
working tree based on an approved SHA. Create and verify it before spawn; run peer
spawn from that cwd so descriptor and pane inherit it.

A fence is descriptive ownership plus expected merge-risk metadata — a sensor
that informs, never a gate that blocks. Work confined to the verified
worktree/branch — reads, edits, hermetic tests/builds, commits, sole-owner
branch pushes — is notify-only.
A newly discovered worktree-local path is a **tell**: persist and report it;
separate-branch overlap is notify-now, reconcile-at-convergence. Hard ownership
rules remain hard: notification never permits writing the o-prime's government,
another stream's worktree, or CLI-only flow state.

Isolation removes edit-time serialization, not convergence-time serialization.
Synchronize before histories or mutable state converge: same branch or shared
checkout/index; merge, rebase, or landing to a shared target; consuming a moving
branch; or any shared mutable resource concurrent use can corrupt. Batons are
interlocks — one holder, real hazards only. Trigger matrix, edge cases, and
lifecycle: [`rituals/batons.md`](./rituals/batons.md).

Approved work lands through `/builder 8 ship`: confirm-gated branch push, PR open,
watched CI, then optional typed-confirm merge. Remove the worktree only after PR
merge or explicit abandonment. In shared-tree fallback, scratch/staging,
pathspec commits, staged-set checks, and commit slots remain mandatory.

## Reports and verification

Report files keep this shape:

| Field | Meaning |
|---|---|
| `claim` | exact outcome claimed |
| `artifacts[]` | durable evidence paths |
| `shas[]` | commit/content hashes |
| `gates[]` | command, verdict, output path |
| `observations[]` | portable lessons and suggested encodings |
| `open[]` | unresolved decisions, risks, skips |

The receiver verifies one load-bearing artifact or cheap gate before acting or
relaying — a claimed verification is itself a claim; freeze and hash any target
that may mutate during review ([`rituals/reports.md`](./rituals/reports.md)).
With no layer above the o-prime, government files are the evidence record, the
human receives short main-event digests, and numbered reports exist only for a
real optional audit layer.

## Seat identity

A pij id names a **seat**, not whichever persona currently speaks in its pane.
Role-address sends when contexts can differ; replies declare the speaking role.
No agent message is consent; a relayed ruling binds nothing until the owning
layer or human confirms it. An orchestrator seat never runs a long blocking
subagent in its own session — spawn peers; one seat went deaf for hours when
its go-signals landed in a research context that refused them.

Windows: o-prime `o-prime` · stream `s<ordinal>-<short-slug>` · fleet panes
inside the stream's window. Names aid humans; identity remains the registry id
and pane binding.

## Human rulings and non-blocking questions

Humans outrank every channel. Record their words immediately, preferably
verbatim, in durable committable government or plan files — never only in chat
or scratch. If a direct human go may collide with sibling work, notify the
o-prime before execution unless the human says now-regardless.

Human attention is the scarcest shared resource in the system; the prime is
its scheduler, and orchestration must remain live while the human is absent or
remote. No seat or peer ever uses `ask_user_question` or any modal question UI
— a modal wait serializes the human: an outage. Ask inline, persist a pending
decision (spine § Pending decisions), block only dependent work, batch related
questions, digest at the human's cadence, continue the rest.

Question ownership follows working context: the agent that will use the
answer asks the human directly (Builder asks its own planning questions);
its parent receives a pointer but never paraphrases, pre-answers, or asks on
its behalf. The o-prime asks only portfolio/government questions it owns. If
the owner lacks a direct human channel, its parent forwards the persisted
question verbatim by pointer and routes the answer back.

## Canary and cold readers

Every spawn or adoption is canaried before brief, recursively, with the record
written at pass time; mechanical identity beats self-report. Ritual and labeled
history: [`rituals/kickoff.md`](./rituals/kickoff.md),
[`exemplars/canary-record.md`](./exemplars/canary-record.md). Schedule
fresh-reader audits at adoption and checkpoints — cold readers found stale
government and false completion claims that warm authors read past.

## Portability and orient levers

Levers 0 [`orient-oprime.md`](./orient-oprime.md) and 1
[`orient-global.md`](./orient-global.md) are portable and authoritative; lever 2
is generated fresh in the consuming repo from
[`templates/orient-local.md`](./templates/orient-local.md); item specifics live
in one brief from [`templates/stream-brief.md`](./templates/stream-brief.md).

Repo-local configuration derives cheap/full gates, batons plus free probes,
never-stage paths, flow-writer rules, fleet defaults, human digest channel, and
ceremony tier. Nothing repo-specific enters the portable levers or this file.

## The second objective

Every layer completes the work and improves the environment it ran through:
capture friction when it bites, carry observations upward, graduate lessons
local orient → portable orient/protocol → tooling. Encode, don't document.
