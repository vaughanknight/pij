# Fleet ledger

Difficulties, wins and suggestions from running parallel fleets. The suggestions section is the
working spec for a future `pij fleet` verb.

## Per-stream ledgers

**Concurrent streams do not share this file.** Each stream writes
`ledger/s0NN-<slug>.md` — a single-writer file that cannot collide — and adds **one** pointer
row to the index below.

| stream | slug | ledger | rows relocated? |
|---|---|---|---|
| `s092` | install-blocker | [`ledger/s092-install-blocker.md`](./ledger/s092-install-blocker.md) | **moved** |
| `s093` | send-path | [`ledger/s093-send-path.md`](./ledger/s093-send-path.md) | **moved** |
| `s094` | capability-surface | [`ledger/s094-capability-surface.md`](./ledger/s094-capability-surface.md) | **moved** |
| `s095` | liveness-fields | [`ledger/s095-liveness-fields.md`](./ledger/s095-liveness-fields.md) | **moved** |
| `s096` | watchdog-verdicts | [`ledger/s096-watchdog-verdicts.md`](./ledger/s096-watchdog-verdicts.md) | **moved** |
| `s097` | silent-detectors | [`ledger/s097-silent-detectors.md`](./ledger/s097-silent-detectors.md) | **moved** |
| `s098` | daemon-perf | [`ledger/s098-daemon-perf.md`](./ledger/s098-daemon-perf.md) | **moved** |
| `s099` | send-tool-xor | `ledger/s099-send-tool-xor.md` | *pending* |
| `s100` | tick-heartbeat | [`ledger/s100-tick-heartbeat.md`](./ledger/s100-tick-heartbeat.md) | **moved** |

> **The last column tracks the LEDGER MIGRATION ONLY — whether this stream's rows have been
> relocated out of `ledger.md`.** It says nothing about whether the stream's own work is
> finished. A stream still in flight can and should carry `moved`, because its ledger file and
> its cell land together.

**This table enumerates EVERY stream in the wave, not only the migrated ones.** That is
deliberate, and it is the same fix pij#153 shipped for a different surface:

> **A list of what happened cannot report what has not happened yet. Only an enumeration of the
> whole space can.**

A list of *what has moved* makes absence ambiguous — *"this stream has not migrated"* and *"there
is no such stream"* are the same observable — so **partial completion is indistinguishable from
completion**. That ambiguity bit two audiences at once for one cause: a **reader** inferring the
convention from precedent, and a **probe** trying to detect that the migration had landed.

With every ordinal present and carrying `moved | pending`, **no belief is formable from an
absence**: any probe indexes **one key** and gets a definite answer, and *"has the migration
landed?"* becomes *"are there any pending rows?"* — which is downstream of the **whole** migration
by construction, rather than by hunting for an artifact with an exclusive producer.

**When you move your block, flip your own row to `moved` and link it.** That edit is one cell, at
your own ordinal's line.

## How to add to this ledger

1. **Write your rows in `ledger/s0NN-<slug>.md`.** You are its only writer.
2. **Add one index row above, INSERTED AT YOUR ORDINAL'S NUMERIC POSITION.** Read the table, find
   where `s0NN` belongs between the existing numbers, and insert there — `s099` before `s100`,
   always, regardless of who moves first.
3. **Your ledger file and your index row land together, on `main`, in the same PR.** Never split
   them across trees: an index row whose target lives on another branch **points at nothing from
   `main`**.
4. **Do not move another stream's block, and do not edit this section.** Both are shared surfaces
   — six seats each encoding the convention collide exactly as six seats appending do. Send the
   o-prime the text instead.

> **Amend a falsified row in place, keeping the wrong version with its correction attached.** A
> row that was wrong is more useful than one silently replaced — five rows in this ledger were
> falsified by their own authors within hours of being written.

### The two silent ways to get the index wrong

- **Appending at EOF.** Every stream lands on the same line range and collides identically. This
  is the mistake the split exists to prevent, reintroduced one layer down.
- **"Where my block was".** That position coincides with sorted position **only for the first
  entry**, because with one entry every order is sorted. The second stream to do it lands after
  the first, *believes it followed the rule*, and re-creates the collision.

Both are instances of the wave's most repeated finding: **a remedy that removes the symptom at
N=1 and reintroduces it at N>1 has not been tested at the cardinality it will meet.** Four seats
made that error in one afternoon, at four different layers, including inside the fix for the
first three.

The index is seeded with six entries **on purpose**: a single seed entry teaches nothing, because
at N=1 the artifact cannot distinguish a rule from a coincidence — and a seat reading the file
infers the convention from precedent, which is the cheaper path and therefore the one taken.
**Two entries teach the rule; six make it unmistakable.**

The rows below are wave-general — they belong to no single stream.


## Difficulties

### F-001 · Spawning into a worktree kills `pi` peers, silently and pre-registration
`pij spawn --harness pi` from a linked worktree dies at boot in ~3s. Machine-global extension
links (`~/.pi/agent/extensions/*` → the MAIN checkout) collide with the worktree's own
project-local extensions; identical tool names from two paths is fatal. **A peer that dies
before registering is reported by nothing.**
*Evidence*: observation DL-003, s055. *Workaround*: spawn from main, `cd` in, absolute paths.
*Status*: open — real fixes would be pi conflict precedence, worktree-aware `link-global`, or
`pij spawn` handling it.

### F-002 · `pij link --role` silently overwrites an existing role stamp
Re-parenting a stamped seat with `--role` changes its capability gate underneath it. Omitting
the flag preserves the stamp. Nothing warns.
*Evidence*: hit during the 2026-08-05 succession while re-parenting a PA.

### F-003 · The whole fleet dies with the tmux server, and nothing notices
An overnight tmux server death took three seats (a PA and two PMs). Their descriptors kept
`lifecycle: bound` with a stale `terminal` record; the prime survived only because it was a
different pane. Recovery is manual re-adoption plus a full re-spawn.
*Evidence*: 2026-08-07T23:14Z, `pid-missing` on three seats simultaneously.
*Related*: pij#155 (`terminal` is a latch), pij#161 (a dead seat was then certified healthy).

### F-004 · Watcher subscriptions decay and nothing re-points them
A handover re-parents children but re-points **neither watcher subscriptions nor spawn
lineage**, and both are invisible to `pij list`. A prime ran 42h unsupervised with a dissolved
sole watcher; hand-repaired, then the same condition **re-formed within ~20h** via a different
cause.
*Evidence*: pij#154. *Measured*: repair half-life ≈ 1 day. Fleet-wide, 2 of 32 subscriptions
were unambiguously unable to receive.

### F-005 · A brief does not fit in any message surface
`pij report now` truncates at 280 chars, state notes at 200 (pij#123, undocumented until you
hit them), and a quoted `pij send` body **executes shell substitutions** with caller
privileges (pij#128). So the only safe brief transport is a file plus a pointer.
*Status*: the pointer-delivery invariant exists precisely because of this.

### F-006 · PR review cannot gate anything
Every seat pushes as the same GitHub identity, so `gh pr review --request-changes` is refused
(*"Can not request changes on your own pull request"*). All cross-seat review is comments,
which do not block a merge, and `reviewDecision` reads *unreviewed* for reviewed work.
*Evidence*: pij#150. *Impact on fleets*: a reviewer seat's verdict has no enforcement.

### F-007 · Sequential merges burned one full CI run each
Merging five PRs one by one started five full runs (3 matrix jobs each) against trees that
existed for ~10 seconds. There was **no `concurrency` block in any workflow**; four runs were
cancelled by hand.
*Status*: **FIXED** — pij#157 added per-ref supersession. Kept here as the archetype: a fleet
multiplies anything the merge path does per-PR.

### F-008 · `gh pr checks` reports superseded results
After a re-run it shows the last run associated with the branch, not the current head. A PA
reported two PRs RED for three consecutive sweeps while both were green.
*Fix*: always `gh pr view <n> --json statusCheckRollup`.

### F-009 · A GitHub token can expire mid-fleet, silently
`gh` began returning `HTTP 401` after a crash; every PR/issue verb failed until re-auth. A
fleet whose convergence path is `gh` stops entirely and the failure looks like unrelated tool
noise.

### F-010 · A worktree reap destroys the seat's session buffer
Reaping after merge destroyed a PM's only copy of 20 retro observations; a custody snapshot
taken for other reasons was the sole survivor.
*Rule*: capture before reap, always.


## Wins

### W-001 · File-ownership partitioning
Cutting six streams by **file** rather than by issue eliminated the convergence conflicts that
an issue-shaped partition would have created — most visibly by giving `core/anomalies.ts`
entirely to one seat rather than splitting six issues that all want it.
*See*: [`partitioning.md`](./partitioning.md).

### W-002 · A ruling converts to a PR in ~20 minutes
A PM given a bounded ruling plus a three-part scope produced a green, mutation-proofed PR
(pij#149) in about 20 minutes, unattended.
*Condition*: the scope was bounded and the file ownership was unambiguous.

### W-003 · Cross-government reconciliation outperforms either fleet's detectors
Three governments reconciling **independent instruments** over one day caught more real
defects than any detector did. Two probes reading different fields disagreed, and the
disagreement was the finding.
*Doctrine*: `government/doctrine/a-coupled-instrument-cannot-report-its-subject.md` —
independence must be of **path**, not of clock.

### W-004 · `pij bg` for anything slow
Backgrounding a CI wait returns the result as an injected turn instead of blocking a shell.
Directly applicable to a fleet: watching N PRs is N background jobs, not N blocked seats.

### W-005 · Questions relayed through the prime, one at a time
One sentence of context and one sentence of ask, never batched, kept a six-way fleet's
human-facing surface to a single serialised queue.
*Requirement*: the prime marks its own state so the board shows an outstanding ask.


## Suggestions — the future `pij fleet` feature

### S-001 · `pij fleet plan --from-issues <n...>`
Read each issue's cited `file:line`, build the file → issues map, and **propose** a partition
with every collision named. This is the highest-value automation on the list: the partition is
the whole design, and today it is done by hand and by judgement.

### S-002 · A declared file-ownership registry, checked at convergence
Each stream declares the files it owns. A pre-merge check fails loudly when a branch touched a
file it does not own — catching a boundary violation at PR time rather than at conflict time.

### S-003 · `pij fleet spawn` — one verb for the whole standing-up
Project, streams, spawn-from-main, link **without** clobbering the role, role stamp, task set,
brief pointer. Every one of those is a step someone gets wrong once (F-001, F-002).

### S-004 · Auto re-point watcher subscriptions on death or handover
The direct fix for F-004: when a watcher dies, re-point its subscriptions to its parent, or
refuse the teardown until they are re-homed. Detection is the floor; not creating the orphan
is better.

### S-005 · A convergence queue
An explicit merge train that knows the partition: merges disjoint streams freely, sequences
any pair sharing a file, and re-verifies with `statusCheckRollup`.

### S-006 · A fleet board rendered from probes, not self-reports
Per stream: seat, semantic state + age, HEAD sha, dirty count, own-commits?, CI verdict,
PR state, last question + age. **Corroboration columns are the point** — the board should show
what the tree and the API say, not what the seat claims.
*Credit*: this is I-20 of the external `s241` delivery review (`pij-ripe-platypus`, Vaughan's
fleet), which reached it independently from a different direction.

### S-007 · Capture-before-reap as a lifecycle step
`stream close` should snapshot the seat's buffer before the worktree goes (F-010).
