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
| Stream orchestrator | one per in-flight work item | One plan end-to-end and its worker fleet | Writes outside fences or bypasses batons |
| Fleet worker | many, bounded | One packet inside a stream's narrowed allowlist | Governs siblings or expands scope |
| Optional overseer | zero or one | Audits the o-prime and receives numbered reports when explicitly installed | Becomes a required structural layer |

The government is not a role. It is the disk substrate every role reads and one
seat writes.

## Hierarchy and escalation

```text
human
└─ [optional audit layer]
   └─ o-prime
      ├─ stream
      │  └─ fleet workers
      └─ stream
         └─ fleet workers
```

Escalate exactly one hop. Fleet → stream → o-prime → human, inserting the
optional audit layer only when it actually exists. Streams do not negotiate
sideways; cross-stream needs go through the o-prime. A human may enter any pane.

## Government files

The o-prime is the single writer of:

- `government/spine.md` — thesis, roster, fences, sequencing watch, allocations,
  rulings;
- `government/baton-book.md` — current leases, queue, append-only grant log;
- `government/prime-flow.json` — portfolio state;
- briefs, canary records, local orient, and encode candidates.

Anyone may read. Row state changes before prose and every mutation uses a UTC
stamp. History is struck or tombstoned, never erased. A hard restart once killed
every pane and lost no government state; that is the design test.

Use [`templates/spine.md`](./templates/spine.md) and
[`templates/baton-book.md`](./templates/baton-book.md) for shapes.

## Portfolio and lifecycle

Prime-flow items move through `proposed → deciding → preparing → in_flight →
done | folded | dropped`, plus `blocked`. Node status is concurrent truth;
`nav.now` is only the o-prime's attention pointer.

Every orchestrator moves through `adopt → orient → preamble → work`:

- adoption takes governance and proves the channel;
- orientation enters through `/pij prime`, loads the orchestrator module, global
  orient, repo-local orient, item brief, and invokes `/thesis`;
- the human preamble confirms the provisional assignment;
- work starts after the preamble report; validated plans stop at
  `WAITING_FOR_BUILD_CONFIG` until the human confirms the fleet.

Kickoff and teardown live in [`rituals/kickoff.md`](./rituals/kickoff.md).

## Construction, fences, batons, and landing

The worktree-primary construction path gives each stream one recorded branch and working
tree based on an approved SHA. Create and verify it before spawn; run peer spawn
from that cwd so descriptor and pane inherit it. Worktrees isolate trees/indexes,
not dependency claims, runtime interference, or merge collisions.

Fences still partition files. Derive them from planned actions, verify paths on
disk, name scratch explicitly, and escalate any new path. Batons serialize
timing/runtime, external resources, merge coordination, and the ruled
shared-tree fallback; the full lifecycle is in
[`rituals/batons.md`](./rituals/batons.md).

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
relaying. A claimed verification is itself a claim. Freeze and hash any target
that may mutate during review. See [`rituals/reports.md`](./rituals/reports.md).

With no layer above the o-prime, government files are the evidence record and
the human receives short main-event digests only. Numbered reports exist only
for a real optional audit layer.

## Seat identity

A pij id names a **seat**, not whichever persona currently speaks in its pane.
Role-address sends when contexts can differ; replies declare the speaking role.
No agent message is consent, and a relayed ruling binds nothing until the owning
layer or human confirms it.

An orchestrator seat never runs a long blocking subagent in its own session.
Spawn peers for long work. One seat went deaf for hours because its go-signals
landed inside a research context that correctly refused them.

## Human rulings

Humans outrank every channel. Record their words immediately in durable,
committable government or plan files, preferably verbatim. Never leave rulings
only in chat or scratch. If a direct human go may collide with sibling work,
notify the o-prime before execution unless the human explicitly says
now-regardless.

## Canary and cold readers

Every spawn or adoption is canaried before brief, recursively. The record is
written at pass time. Mechanical identity beats self-report; the exact ritual
and labeled history live in [`rituals/kickoff.md`](./rituals/kickoff.md) and
[`exemplars/canary-record.md`](./exemplars/canary-record.md).

Schedule fresh-reader audits at adoption and checkpoints. Cold readers found
stale government and false completion claims that warm authors read past.

## Portability and orient levers

- Lever 0: [`orient-oprime.md`](./orient-oprime.md), portable and authoritative.
- Lever 1: [`orient-global.md`](./orient-global.md), portable and authoritative.
- Lever 2: generated fresh in the consuming repo from
  [`templates/orient-local.md`](./templates/orient-local.md).
- Item specifics: one brief from [`templates/stream-brief.md`](./templates/stream-brief.md).

Repo-local configuration derives cheap/full gates, batons plus free probes,
never-stage paths, flow-writer rules, fleet defaults, human digest channel, and
ceremony tier. Nothing repo-specific enters the portable levers or this file.

## Window naming

| Layer | Window |
|---|---|
| o-prime | `o-prime` |
| stream | `s<ordinal>-<short-slug>` |
| fleet | panes inside the owning stream's window |

Window names aid humans; pij identity remains the registry id and pane binding.

## The second objective

Every layer completes the work and improves the environment it ran through.
Capture repeatable friction when it bites, carry observations upward, and
graduate lessons from local orient → portable orient/protocol → deterministic
tooling. Encode, do not merely document.
