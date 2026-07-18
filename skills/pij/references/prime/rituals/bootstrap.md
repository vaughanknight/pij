# Bootstrap — stand up an o-prime

> **Store-native is the ruled default for new primes** — load
> [`store-native.md`](./store-native.md) first; it replaces §3's prose scaffold
> with platform-store verbs. The prose scaffold below remains authoritative for
> repos already governed in prose (until their prime self-migrates).

Use this only when the consuming repo has no `government/`. It is the day-zero
ritual; role operation belongs in the orient files and protocol. Preconditions:
a git repo, tmux, `pij`, the ambient `harness` CLI, one session for the
`o-prime` window (registered via `pij phonehome` or `pij adopt`), and a human
ready to name the work — the seat never invents portfolio items.

## 1. Seat and prove the o-prime

1. Load [`../orient-oprime.md`](../orient-oprime.md) into the seat by pointer.
2. If another layer governs this seat, run the recursive three-leg canary in
   [`kickoff.md`](./kickoff.md#canary).
3. Run the orient's boot audit: channel, dead descriptors, inherited government
   if any, and the human status channel.
4. Persist the proved seat: `pij orchestration prime set --json`, then
   confirm the id in `pij list --prime --here --json`. An ambiguous self is a
   seating failure, never permission to target `"operator"`.

## 2. Derive the per-repo contract

Inspect the repo; do not copy the worked example's answers.

| Question | How to derive it | SecondCrack worked example |
|---|---|---|
| Cheap gate | Fast deterministic check entrypoint | `harness checks --quick` |
| Full gate | Complete pre-ship suite | `harness checks` |
| Notify-only vs batons | Which isolated operations are grant-free; what breaks under concurrency or convergence (add a "free" probe) | worktree-local ops free; shared daemon, moving handoff, merge-main |
| Never-stage | Generated/local state missed by ignore rules | `.fs2/`, `.flow-pair/**`, scratch |
| Flow-state rule | Which files have CLI-only, single-writer mutation? | `the-flow.json` via `harness flow` |
| Worktree root/naming | Where isolated stream worktrees live; deterministic path pattern | sibling directory + `s<ord>-<slug>` |
| Base + landing | Approved base/SHA; branch push/PR/CI/merge surface | `main`; `/builder 8 ship` |
| Fleet defaults | Cheapest harness/model that clears the repo bar | copilot coder + cold reviewer |
| Human digest | Where short main-event notices land | self-identified pij/Telegram message |
| Ceremony tier | Cheapest safe add/commit/push worker | small ceremony peer |

## 3. Scaffold the government

Create `government/` in durable, committable repo space:

- Instantiate [`../templates/spine.md`](../templates/spine.md): thesis, stamp,
  writer id, roster, fence slots, allocation ledger, sequencing watch, rulings.
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

Record pre-existing workshops as prime-flow inputs at creation. Add successors
before predecessors (forward `next` references are rejected); node status is
concurrent truth, `nav.now` only the seat's attention.

## 4. Install the orient stack

- Levers 0/1 stay authoritative in this skill: point at
  [`../orient-oprime.md`](../orient-oprime.md) and
  [`../orient-global.md`](../orient-global.md); never fork them into the repo.
- Generate `government/orient-local.md` from
  [`../templates/orient-local.md`](../templates/orient-local.md): project
  one-liner, doctrine, harness commands, repo mechanics, mandatory reads,
  current portfolio. The run that omitted the real product pillar produced a
  technically neat, strategically wrong orient.
- Use [`../templates/stream-brief.md`](../templates/stream-brief.md) per item — specifics live there, not the levers.

## 5. Open intake and govern

1. Human-named items enter the prime-flow as `proposed` or `deciding`.
2. At `preparing`, reserve ordinal/folder/window/worktree/branch/base, derive
   the descriptive touch set and convergence risks, persist the row, then
   delegate to [`kickoff.md`](./kickoff.md). Kickoff is the sole construction owner.
3. Assignment stays provisional through `adopt → orient → preamble`; move the
   node to `in_flight` only after the preamble report lands.
4. In steady state: verify then relay, serialize batons, route cross-stream
   asks, sync rows before prose, graduate repeated observations into encodings.

## Recovery

| Event | Recovery |
|---|---|
| Seat death or machine restart | Fresh seat loads lever 0 + government; audit dead holders, stale roster rows, orphan descriptors, then record the new identity |
| Planned seat rotation (ruled) | Outgoing seat instantiates [`../templates/seat-handover.md`](../templates/seat-handover.md) BEFORE incoming contact; incoming runs its checklist — writer lines, spine-Seq check, descriptor purge-on-final-send |
| Sends queue but never deliver | Check daemon ticks and every dead descriptor; one stale corpse once wedged the whole fabric |
| Stream dies mid-work | Adopt a fresh orchestrator onto its plan folder; disk is the handover |
| Stream is dissolved | Follow kickoff teardown: close, verify after queue drain, strike row, tombstone ordinal, transplant insights |
| Descriptive fence gap appears in a verified worktree | Stream persists and tells the path; o-prime records touch-set/overlap metadata; work continues unless it crosses a hard ownership boundary or convergence point |
