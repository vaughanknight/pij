# Bootstrap — stand up an o-prime

Use this only when the consuming repo has no `government/`. It is the day-zero
ritual; role operation belongs in the orient files and protocol.

## Preconditions

- A git repo, tmux, `pij`, and the ambient `harness` CLI.
- One session for the `o-prime` window, registered with `pij phonehome` or
  `pij adopt`.
- A human ready to name the work. The seat never invents portfolio items.

## 1. Seat and prove the o-prime

1. Load [`../orient-oprime.md`](../orient-oprime.md) into the seat by pointer.
2. If another layer governs this seat, run the recursive three-leg canary in
   [`kickoff.md`](./kickoff.md#canary).
3. Run the orient's boot audit: channel, dead descriptors, inherited government
   if any, and the human status channel.

## 2. Derive the per-repo contract

Inspect the repo; do not copy the worked example's answers.

| Question | How to derive it | SecondCrack worked example |
|---|---|---|
| Cheap gate | Fast deterministic check entrypoint | `harness checks --quick` |
| Full gate | Complete pre-ship suite | `harness checks` |
| Batons | What breaks under two concurrent users? Add a probe for "free" | dotnet, Godot window, push-main |
| Never-stage | Generated/local state missed by ignore rules | `.fs2/`, `.flow-pair/**`, scratch |
| Flow-state rule | Which files have CLI-only, single-writer mutation? | `the-flow.json` via `harness flow` |
| Fleet defaults | Cheapest harness/model that clears the repo bar | copilot coder + cold reviewer |
| Human digest | Where short main-event notices land | self-identified pij/Telegram message |
| Ceremony tier | Cheapest safe add/commit/push worker | small ceremony peer |

## 3. Scaffold the government

Create `government/` in durable, committable repo space:

- Instantiate [`../templates/spine.md`](../templates/spine.md): human thesis,
  `date -u` stamp, writer id, empty roster, per-stream fence slots, allocation
  ledger seeded by scanning existing ordinals, sequencing watch, rulings.
- Instantiate [`../templates/baton-book.md`](../templates/baton-book.md): one
  row per derived baton, all free, append-only grant log.
- Always create `briefs/` and `canaries/`; create `reports/` only when an actual
  layer above the o-prime expects numbered reports.
- Create the outer portfolio:
```bash
harness flow create prime-flow --slug <project>-portfolio \
  --schema <skill-root>/references/prime/prime-flow.schema.json \
  --path government/prime-flow.json --agent o-prime --bare
```

Record any pre-existing workshops as prime-flow inputs when creating the flow.
Add successors before predecessors: forward `next` references are rejected.
Node status is concurrent truth; `nav.now` is only the seat's attention.

## 4. Install the orient stack

- Levers 0/1 stay authoritative in this skill; point at
  [`../orient-oprime.md`](../orient-oprime.md) and
  [`../orient-global.md`](../orient-global.md), never fork them into the repo.
- Generate `government/orient-local.md` from
  [`../templates/orient-local.md`](../templates/orient-local.md). Derive the
  project one-liner, doctrine, harness commands, repo mechanics, mandatory
  non-auto-loaded reads, and current portfolio. The run that omitted the real
  product pillar produced a technically neat, strategically wrong orient.
- Use [`../templates/stream-brief.md`](../templates/stream-brief.md) per item;
  specifics live there, not in the levers.

## 5. Open intake and govern

1. Human-named items enter the prime-flow as `proposed` or `deciding`.
2. At `preparing`, reserve ordinal/folder/window, derive fences from actions,
   record overlap decisions, then run [`kickoff.md`](./kickoff.md).
3. Assignment stays provisional through `adopt → orient → preamble`; move the
   node to `in_flight` only after the preamble report lands.
4. In steady state: verify then relay, serialize batons, route cross-stream
   asks, sync roster rows before prose, and graduate repeated observations into
   checks, defaults, or protocol tunes.

## Recovery

| Event | Recovery |
|---|---|
| Seat death or machine restart | Fresh seat loads lever 0 + government; audit dead holders, stale roster rows, orphan descriptors, then record the new identity |
| Planned seat rotation (ruled) | Outgoing seat instantiates [`../templates/seat-handover.md`](../templates/seat-handover.md) BEFORE incoming contact; incoming runs its checklist — writer lines, spine-Seq check, descriptor purge-on-final-send |
| Sends queue but never deliver | Check daemon ticks and every dead descriptor; one stale corpse once wedged the whole fabric |
| Stream dies mid-work | Adopt a fresh orchestrator onto its plan folder; disk is the handover |
| Stream is dissolved | Follow kickoff teardown: close, verify after queue drain, strike row, tombstone ordinal, transplant insights |
| Fence gap appears | Stop; independently verify the needed path, record a constrained grant, notify every affected stream |
