# Bootstrap — stand up an o-prime

> **Store-native is the ruled default for new primes** — load
> [`store-native.md`](./store-native.md) first; it replaces §3's prose scaffold
> with platform-store verbs. The prose scaffold below remains authoritative for
> repos already governed in prose (until their prime self-migrates).

Use this only when the store is SILENT for this repo — no current prime in
unscoped `pij list --prime --json`, no project in `pij project list`. Absence of
a `government/` directory is corroboration, never the trigger: store-native
governance is the ruled default ([`store-native.md`](./store-native.md)), so a
fully-governed repo legitimately has none. It is the day-zero
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
4. **Refuse to seat over a living prime.** Before writing, run unscoped
   `pij list --prime --json` and `pij project list`. If any current prime
   reconciles to this repo's project, STOP and escalate to the human — you are
   not the bootstrapper. An unscoped hit for a *different* repo never blocks.
   `prime set` is honor-system: it accepts anyone, so `prime:true` proves
   assertion, not authority.
5. Persist the proved seat: `pij orchestration prime set --json`, then
   confirm the id in **unscoped** `pij list --prime --json`. An ambiguous self is
   a seating failure, never permission to target `"operator"`.

> Confirm UNSCOPED, deliberately. Verifying with `--here` re-reads the same
> narrow view that let you conclude "no prime" — so a usurping write confirms
> itself green while the real prime sits one folder away. A check that shares the
> failure mode of the decision it audits is not a check.

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

## 5. Stand up your PA and close your supervision graph

**Jordan's ruling, 2026-08-01: a new prime stands up a cheap PA as standard practice.**
Added because `pij-single-vrell` bootstrapped without one — nothing in this ritual, in
`routes/prime.md`, or in duty 7 said to, and duty 7's *"if you have a PA"* reads as optional
context rather than a deliverable. Jordan had to prompt it, and it reverse-engineered the
pattern from live registry rows.

**Do not follow a summary of the recipe — follow the recipe.** It is maintained against live
defects and changes daily:
**`government/briefs/pa-standup-recipe.md`** in the `pij` repo (`AI-Substrate/pij`).
Only the parts a bootstrapping prime cannot discover are restated here:

1. **Cheap tier is the design intent** — the fleet runs `gemini-3.6-flash` copilot seats.
   Whether a cheap model holds the rules while doing chores is the **open experiment**, not a
   settled result.
2. **⚠️ ORDERING TRAP — register the subscription, WITH ITS BOUNDS, BEFORE stamping the role.**
   From the PA's own seat run **one** command:

   ```
   pij watchdog watch <your-prime-id> --capture always --max-bytes 1024 --max-lines 12
   ```

   *then* `pij link <pa-id> --parent <your-prime-id> --role pa`. The capability gate refuses the
   whole `watchdog` family to role `pa`, and `watch` only ever registers the **calling** seat —
   so a PA stamped first can never subscribe itself and **you cannot do it for it**. Recovering
   costs three mutations and an un-gated window. (Found by meadowlark; re-reported by vrell.)

   **The bounds MUST ride on this call.** They cannot be added afterwards: a second
   `watchdog watch` is refused to the PA by the same gate, and a prime running it would
   subscribe *itself* instead. This step used to register unbounded and defer bounding to a
   later step — **which was unperformable by anyone**, and left a permanently unbounded
   subscription behind. Measured 2026-08-04: five such subscriptions on one box, **three of
   them created within 100 minutes** by seats still following the old sequence.
3. **The bounds in step 2 are a FLOOR, not a starting point.** They ride on step 2's command
   and cannot be applied later. The 4096-byte default is a default rather than a requirement,
   and captures accumulate with no expiry — a watcher subscription is a standing grant to read
   the watched seat's pane — so there is real pressure to shrink. Resist it below the floor.
   **NEVER go below `--max-bytes 1024 --max-lines 12` — both, as a conjunction, never
   "at least one of".** Capture is tail-anchored at **BOTH** stages: it takes the last
   `maxLines` lines, then the last `maxBytes` **of those**. So **`maxLines` cannot rescue a
   small `maxBytes`** — a generous line budget does not salvage a mean byte budget, because
   the byte cut also keeps the tail and the tail is chrome. **A low byte cap yields chrome no
   matter how many lines you allow.** The two floors are independent and whichever is tighter
   binds. Capture is **tail-anchored**
   and the bottom of a pane is fixed chrome: measured at **3 lines / 629 B** on a Claude Code
   pane (a 450 B horizontal rule, a 110 B status line, a 69 B hint) and **2 lines / 256 B** on
   a Gemini pane, against a measured prose line of ~150 B. **A bound at or below that floor
   does not capture less, it captures NOTHING — and a blind capture reports the same silence
   as a dead seat.** Which axis binds is **pane-dependent**, so lower both numbers only
   together and never below this floor. Measured 2026-08-04: **19 of 26 subscriptions were at
   256 B and 92% of all capture files on the box contained no content at all**, arrived at
   over four days by seats independently ratcheting below this recipe — the three sentences
   above supply a motive to shrink and, until this line, no floor to stop at.
4. **Close the graph, and a PA is not required to do it.** The requirement is *somebody the
   system can tell*: any watchdog-eligible non-`pa` child works, and today an ordinary peer is
   **better at watching** than a PA is, because a PA cannot re-subscribe itself. **De-topple
   with a peer; add the PA for the chores.** Verify with
   `jq '.watchers' ~/.pij/<prime-id>/watchdog.json` — no `pij` verb projects the capture mode.
5. **Prove delivery, not configuration.** A subscription is unproven until something has
   travelled down it; verify at the **receiving** end.

## 6. Open intake and govern

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
