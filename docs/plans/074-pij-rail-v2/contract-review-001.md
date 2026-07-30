# s074 — contract review 001: the pij half of the chainglass rail v2

**Reviewer**: `pij-unwilling-butterfly` (PM, s074) · **For**: `pij-wee-albatross` (o-prime, pij)
**Date**: 2026-07-29 · **Worktree**: `pij-worktrees/s074-pij-rail-v2` · **Base**: main @ `8a63c58`
**Contracts under review**: WS-001 (JC-1 status), WS-002 (JC-2 orchestrationRole), WS-003 (JC-3 question text),
all in `/Users/jordanknight/substrate/chainglass/docs/plans/090-pij-rail-v2/workshops/`.

**Instrument binding**: every line-pinned claim below was read this session with `view`/`grep -n`
in **this worktree at `8a63c58`**, not in the canonical checkout and not from the workshops'
own ledgers. Every measurement names the command that produced it. **Proved** and **inferred**
are flagged separately and never merged.

---

## Verdict summary

| Contract | Verdict | Blocking amendments | Non-blocking |
|---|---|---|---|
| **WS-001 · JC-1 status event** | **RATIFY WITH AMENDMENT** | A-1 (ownership row), A-2 (watchdog clock floor) | A-3 (verb name), A-4 (CG map growth) |
| **WS-002 · JC-2 orchestrationRole** | **RATIFY AS WRITTEN** | none | A-5 (prime audit symmetry) |
| **WS-003 · JC-3 question text** | **RATIFY WITH AMENDMENT** | A-1 (ownership row) | A-6 (denorm clearing policy) |

Nothing here disputes a decision the workshops made. Every amendment adds a guard the
workshops' own reasoning demands but does not carry. **WS-002 is the strongest of the three
and is the reason two of them need amending**: it names the `DESCRIPTOR_FIELD_OWNER` rule as
"incident-#1 class if omitted" and then applies it to exactly one of the three new descriptor
denorms this plan introduces.

---

## A-1 — BLOCKING · the ownership rows WS-001 and WS-003 do not ask for

**Proved.** `grep -c "registry-write\|DESCRIPTOR_FIELD_OWNER"` over the three workshops returns
**10 · 0 · 0**. WS-002 cites the ownership table ten times and calls the row mandatory. WS-001
and WS-003 each add a new CLI-stamped descriptor denorm and cite the table **zero times**.

The fields they add:

| Contract | New descriptor fields | Ownership row asked for? |
|---|---|---|
| WS-001 D-7 | `statusPrev`, `statusNext`, `statusAt`, `statusSeq` | **no** |
| WS-003 D2-a | `stateNote` | **no** |
| WS-002 D3-a | `orchestrationRole` | yes — correctly |

**Why this is blocking, in the law's own words.** `core/registry-write.ts:9-11` names incident
**#1** as, verbatim, *"the node-truth denorms (`currentAssignment`/`currentTask`/`semanticState`)
are CLI-stamped between the daemon's tick-start snapshot and its persist, so a daemon write
replayed them away."* `stateNote` and `statusPrev/Next/At/Seq` are the **same class of field,
stamped by the same function, at the same moment, on the same object**. The three fields named
in incident #1 all carry `"cli"` rows today (`core/registry-write.ts:83-85`); the two new
families would not.

The failure mode is silent by construction — `core/registry-write.ts:60-65` states it exactly:
omitting the declaration *"is SILENTLY LOSSY FOR YOUR OWN [fields]: any contested field you are
trying to SET is discarded whenever disk already holds a value for it, with no error and no log
line."*

**Amendment (required in both contracts before code):**

```ts
// core/registry-write.ts:73 — DESCRIPTOR_FIELD_OWNER
  semanticState: "cli",
  stateNote: "cli",      // ← JC-3
  statusPrev: "cli",     // ← JC-1
  statusNext: "cli",
  statusAt: "cli",
  statusSeq: "cli",
```

**Consequence if shipped without it** (inferred from E-12/E-13, not reproduced): a PM writes a
status, a daemon tick that snapshotted first persists after, the status denorm is gone, and the
PM-keyed nudge in item 5 reads a seat that has never reported — so it either nudges a PM who
just reported, or (with A-2 unfixed) never nudges at all. Neither symptom points at the cause.
The cheap proof albatross may want first is the one WS-002 already proposes: a unit test against
`applyWriteLaw` with and without the row.

---

## A-2 — BLOCKING · the PM-keyed nudge, keyed on `statusAt`, never fires for a PM who has never reported

**Proved, at `core/watchdog.ts:134-146`:**

```ts
export function isFireDue(cfg, lastFireAt, lastEventAt, nowMs): boolean {
	if (!cfg.enabled || cfg.pausedBy !== undefined) return false;
	const anchors = [lastFireAt, lastEventAt].filter(
		(value): value is number => value !== null && Number.isFinite(value),
	);
	if (anchors.length === 0) return false;      // ← the trap
	return nowMs - Math.max(...anchors) >= cfg.intervalMs;
}
```

Item 5 / WS-001 V2-AC-13 rules the clock becomes `statusAt`. `statusAt` is **absent until the
seat's first status**. A newly designated PM has `lastFireAt === null` and, under a literal
reading of the ruling, no `statusAt` — **`anchors.length === 0`, the function returns `false`,
and the seat is never nudged.** The exact population the feature exists to chase (a PM who has
not told anyone anything) is the population it goes silent on. Absence read as ineligibility.

This is the same defect *shape* as the two already on this seat's record: `#68` — the stall
notice for root seats is never constructed (`binding.ts:282-334`), and A.4 — the semantic axis
is invisible to both detector paths. In all three, a missing input silently becomes "nothing to
report" instead of "report this".

**Amendment:** the nudge clock must carry a floor anchor that is never null:

```
anchor = max(lastFireAt, statusAt, <never-null floor>)
```

**pij already has the pattern, one file over** — `core/archive.ts:36-44`, `archiveAgeAnchorMs`,
whose docstring reads *"`startedAt` is the floor (always present) so a descriptor that died
before it ever did anything still ages out"*, and which returns `null` **only** when nothing
parses, precisely so the caller can refuse to act on a record it does not understand. Item 5
should reuse that shape rather than mint a second answer to the same question.

**Second-order note (non-blocking, flagged so item 5 sizes it deliberately).** `isFireDue`'s
current second anchor is `lastEventAt`, and its docstring says *"Activity re-anchors the
schedule"*. Keying on `statusAt` **removes activity re-anchoring for PMs**: a PM working hard
and reporting nothing will now be nudged, which is the intent — but it is a behavioural change
to the scheduler, not only a targeting change, and it should be named as one in the plan.

**Third (evidence for the same item, proved).** `evaluateResponse`'s input type
(`core/watchdog.ts:160-166`: `cfg`, `consecutiveSilentFires`, `eventAdvanced`,
`eventAdvanceWasWatchdog`, `pane`) carries **no semantic-state field**. This corroborates A.4
from the inherited handover and is live on this seat: a SUSPECT was raised on me to albatross
while I was declared `waiting`, twice-refreshed. Item 5 either takes the semantic axis into the
suspect path or explicitly scopes it out; leaving it unstated ships a PM-keyed nudge on top of a
detector that still cannot see a declared idle.

---

## A-3 — NON-BLOCKING · the verb name: three status nouns, and a worse near-collision

WS-001 E-25/E-26 found `pij status` free at top level and one collision (`pij watchdog status`).
**Both hold. There are two more.**

**Proved:**

- `pij watchdog status` — `core/cli.ts:1019`
- `pij daemon status` — `cli.ts:1071` (control-plane; not in WS-001's ledger)
- `pij state <id>` — *"liveness + working/idle"*, per `pij state --help` run this session

The third is the real hazard, and it is not a collision but an **inversion**: `pij state <id>`
**reads** another seat's status; `pij status "<did>" "<next>"` would **write** your own. Two
verbs, near-identical names, opposite directions, adjacent in every help listing.

**Recommendation: `pij now`.** It is free, it matches the rail's own NOW/NEXT vocabulary, and it
cannot be confused with a read. **CG is indifferent** (WS-001 OQ-4) — the contract is the spine
event, not the verb — so this costs nothing but Jordan's taste. Recorded as a recommendation,
not an amendment; `pij status` is workable if the help text distinguishes them.

---

## A-4 — NON-BLOCKING · CG's cold-start `statuses` map grows without bound and without eviction

Follows from combining two rulings the workshops made separately.

**Proved, by measurement on `~/.pij` this session:**

| Measure | Command | Value |
|---|---|---|
| Spine size | `ls -la ~/.pij/spine/events.ndjson` | **5,087,199 bytes** |
| Spine lines | `wc -l` | **22,664** |
| `"kind":"status"` occurrences | `grep -c` | **0** (WS-001 E-05 re-confirmed) |
| Distinct `peer` values ever on the spine | `grep -o '"peer":"[^"]*"' \| sort -u \| wc -l` | **1,429** |
| Hot descriptors | `ls ~/.pij/*.json \| wc -l` | **237** |
| Archived descriptors | `ls ~/.pij/archive/ \| wc -l` | **4,037** |

WS-001 R-9 makes cold start free by replaying from `since = 0`; WS-001 § *Where the emission
happens* rules that **status collection runs outside the `!known` fleet-map guard**, because a
status needs no row. Correct in isolation. Together, and with OQ-2 answered "never rotated"
(below), CG's `statuses` map accumulates one entry per peer that ever wrote a status, **forever**,
including seats long since archived out of `pij list`.

The population gap is already 1,429 spine peers against 237 hot descriptors — a **6:1** ratio
today, and the hot tier is bounded (terminal + 48h, `core/archive.ts:23,33`) while the spine is
not. This is a CG-side sizing note, not a pij defect: recommend the poller either evicts
statuses for peers absent from the fleet snapshot, or bounds the map. Raised because the rail
renders nothing for them, so the cost is invisible until it is a memory profile.

---

## A-5 — NON-BLOCKING · prime designation still leaves no audit trail (WS-002 D3-f / Q-11)

**Proved.** `core/orchestration/prime.ts:28-37` — `PrimeService.update` reads, compares, and
`if (changed) this.registry.write({ ...descriptor, prime, oldPrime }, "cli")`. Nothing else.
`core/orchestration/cli.ts:1-24` dispatches `prime set|retire|unset` with no spine append.

Answer at Q-11 below. Recorded here because it is a pij-side consistency debt this plan creates
rather than inherits, and it should be a named line in the plan, not a discovery later.

---

## A-6 — NON-BLOCKING · `denormDescriptor` will hold two field families with opposite lifetimes

**Proved**, `core/cli.ts:2775-2803`. The stale-clearing mechanism is a destructure of a single
named field at **`core/cli.ts:2789`** — `const { semanticState: _stale, ...rest } = latest;` —
exactly as WS-003 HAZARD-1 states. Confirmed verbatim; WS-003's line pin is correct.

The part HAZARD-1 does not say: after this plan the same function carries **two clearing
policies at once**.

| Field family | On assignment swap / `state clear` | Mechanism |
|---|---|---|
| `semanticState`, `stateNote` (JC-3) | **must clear** | named in the destructure |
| `statusPrev/Next/At/Seq` (JC-1) | **must survive** | falls through in `...rest` |

Today that works by accident of omission: anything not named in the destructure survives. A
status must survive a task swap — a PM's last report does not stop being true because the
assignment pointer moved, and if it cleared, A-2's floor problem recurs on every `task set`.

**Amendment (documentation-grade, but in code):** state the per-field policy at the destructure,
so the next editor adding a denorm has to choose rather than inherit. `writeExact` is already
justified in place by a five-line comment (`core/cli.ts:2790-2793`); this is one more sentence
in the same comment, and it is the difference between a rule someone must remember and a rule
the code states.

---

## The nine open questions — answered

### OQ-2 (WS-001, pij) — is `spine/events.ndjson` ever rotated or tier-migrated?

**No. PROVED, and this is the strongest answer in this document.**

- `adapters/spine-store.ts:3-20` — *"ONE unified machine-wide log at `<pijHome>/spine/events.ndjson`"*,
  `appendOnce` *"keeping events.ndjson strictly byte-append-only."*
- The only destructive calls in that adapter are the lock file and a temp path
  (`adapters/spine-store.ts:182,211,254`) — never the log.
- `grep -rn "events\.ndjson" --include=*.ts` (non-test): **no writer, mover or truncator of the
  spine log anywhere in the extension.** Every other hit is the *per-session*
  `~/.pij/<id>/events.ndjson`, a different file.
- Tier migration is real but does not touch the spine: `adapters/fs-registry.ts:584-606`
  `renameSync(hotDir, archivedDir)` moves `~/.pij/<id>/`, and the policy
  (`core/archive.ts:23,33`) only moves records that are **terminal AND ≥48h idle**.

**Retention policy, stated for the record**: the pij spine log is append-only and permanent. It
has no rotation, no archival, no compaction and no retention horizon.
**⇒ OQ-1 (CG) resolves to "no"** — `since = 0` replay is complete history for all time; CG never
needs the descriptor denorm as a backfill. The denorm stays *known-but-unconsumed*.

**The cost this buys, named rather than hidden** (measured above, and my own observation, not a
workshop's): permanence means unbounded growth. 5.09 MB / 22,664 lines today; every fast-loop
cold start re-reads all of it, and A-4's map is keyed off it. Not a blocker at this size, not
this plan's problem to solve, but the first plan that proposes rotation now has two consumers to
tell.

### OQ-4 (WS-001, pij, cosmetic) — verb name

**Recommend `pij now`.** Reasoning and the two collisions WS-001 did not have in A-3 above.
Jordan's call; not blocking, CG indifferent.

### OQ-7 (WS-001, pij) — may a non-PM write a status?

**Yes — allow the write, nudge only PMs. And this is not a taste call; it is forced.**

WS-002 D5-a rules **no migration**: absence is the designed state, and the census (E-33: 232 of
235 seats undesignated) is the expected day-one picture. A role-gated `status` would therefore
refuse **every seat on the machine on the day it ships**, including real PMs, until someone runs
`orchestration role set` — a verb that does not exist yet either. The gate would make the verb
inert exactly when the plan needs PMs dogfooding it.

Adopting WS-001's proposal as written, with one addition: **the refusal that matters is D-20's
`E-NOID` on an unresolvable self**, not a role check. A status attributed to a guessed seat is
the unrecoverable error; a status written by a worker is a no-op the rail already renders as
`not-a-pm`.

### Q-11 (WS-002, pij) — should `prime set/retire/unset` also append a spine event?

**Yes — but as a separate, named line item, not folded into JC-2.**

Proved at A-5: `PrimeService` appends nothing today. After JC-2, `role-set` is on the spine and
prime changes are not — and since `projectOrchestrationRole` makes `prime === true` **outrank**
the stored role (WS-002 D1-c), the spine would carry a full history of the *losing* input and
none of the winning one. "Who made this seat a PM, when" would be answerable; "who made it the
prime" would not.

Sizing note: `PrimeService` is a pure service over `RegistryPort` with no spine dependency, and
`RoleService` is specified to be shaped exactly like it. Whoever builds `RoleService` will have
solved this problem; doing `prime` in the same pass is cheap. Doing it *inside* JC-2 is not,
because CG consumes neither event and it would couple a ratified cross-repo contract to a
pij-local consistency fix. **Ships in either order; recommend the same pass.**

### Q-12 (WS-002, pij) — initial-role argument on spawn?

**Not in this plan. Defer.**

Wanted for ergonomics, required by no AC (WS-002's own words), and the one-call moment that
actually matters is adoption, not spawn: at spawn the parent frequently does not yet know whether
the seat is a PM or a worker — that is decided when work is allocated. `link --role` (D2-c) and
`orchestration role set` (D2-b) cover every case. If it is added later, WS-002's constraint
stands unchanged and non-negotiable: **write through `RoleService`, never straight to the
descriptor**, or the write law is bypassed at the one site most likely to race the daemon.

### Q-13 (WS-002, pij, cosmetic) — does the human `P`/`O` column grow `M`/`w`?

**Yes for `M`; no for `w`.**

**Proved**, `core/cli.ts:2118`: the column is a one-character ternary
(`d.prime === true ? "P" : d.oldPrime === true ? "O" : " "`) under a one-character header, so
adding a branch costs one expression and no width.

`M` (PM) earns its place: it is the field the rail is built on and the human `list` is where a
prime will look before designating. `w` does not: `worker` is the overwhelmingly common
designation, so rendering it fills the column with noise and — worse — makes the **blank**
ambiguous between "worker" and "undesignated", which is precisely the distinction WS-002 D4
spends its length preserving. Blank must keep meaning **undesignated**.

Recommended column: `P` · `O` · `M` · blank.

### Adopt `--role` (WS-002 D2-c review note) — does the control-plane `pij adopt` grow `--role`?

**No. Recommend against, on this seat's own evidence.**

`pij adopt` is pane **self**-registration — a seat declaring its own pane — and it is the verb
that carries the open `#35` defect: on a dissolved seat it prints `(pane %N, bound)` and writes
zero bytes. Hanging a governance designation on a verb whose write path is currently a
**silent no-op for an entire class of caller** would produce seats that report themselves
designated and are not.

The deeper objection is doctrinal, and it survives even after #35 is fixed: `adopt` is
**self-declaration**, `link --role` is **designation by the governor**. A `--role` on `adopt`
would let any seat name itself a PM, and PM-ness decides who the watchdog nudges and whose text
the rail pins. The honour system tolerates that (`core/orchestration/cli.ts:22`); the canonical
prime → PM → team shape should not encourage it.

**Exception worth noting for the record**: `adopt --parent` already accepts a *self-declared*
parent, and my own seat used it. That is the right precedent for parentage — someone must record
it and only the seat is present — and the wrong one for role, because parentage is checked by the
governor later and role is not checked by anyone.

### OPEN-1 (WS-003, pij) — does closing an assignment clear the `stateNote` denorm?

**The transition does not exist. PROVED:**

```
grep -rn "closeAssignment" --include=*.ts .   →   core/platform/assignment.ts:84   (definition only)
```

`closeAssignment` has **no caller anywhere in the extension outside its own tests**. No shipped
verb closes an assignment. `denormDescriptor` has exactly three call sites
(`core/cli.ts:3800`, `:3897`, `:3997` — `task set`, `state set`, `state clear`), none of them a
close.

So: **no producer change is needed, and there is nothing to specify.** CG's supersede guard is
correct as designed and will never be exercised by this path.

**Forward obligation, which is the part worth recording**: whoever ships an assignment-close verb
inherits the clearing question for `semanticState`, `stateNote` **and** — per A-6 — the explicit
decision that `statusPrev/Next/At/Seq` must survive it. That belongs as a comment at
`core/platform/assignment.ts:84`, next to the function that will grow the caller, not in a plan
document nobody will be reading by then.

### OPEN-4 (WS-003, pij) — is `--note` allowed on `hold`?

**No. Adopt WS-003's proposal, and I would go further: `blocked` and `question` only, enforced by
an explicit two-word check.**

`SEMANTIC_STATES` is proved at `core/types.ts:99-109` to be eight words:
`blocked · question · hold · waiting · ready · failed · cancelled · done`. Permitting `--note` on
`hold` opens the argument for `waiting` and `ready` next, and at that point the note is a
per-seat status field — reintroducing the per-worker periodic status that is excluded by ruling
(§B7), through a side door, without the 280-char discipline or the spine event that JC-1 gives
the real one.

The guard belongs beside the existing vocabulary check at `core/cli.ts:1336-1337`, which is
already the fail-loud template:

```ts
if (!isSemanticState(state))
    return err("E-ARG", `invalid semantic state '${state}' (${SEMANTIC_STATES.join("|")})`);
```

WS-003's D9 line pins are correct against this checkout: the allowlist to extend is
`core/cli.ts:699` — `"state set": new Set(["assignment", "refs", "actor", "json"])` — and
`--note` must **not** join `BOOLEAN_FLAGS`, exactly as `--refs` does not (`core/cli.ts:697-699`
comment says so in place).

**Self-observed evidence for the same item** (this seat, this session): I tried
`pij state set pij-unwilling-butterfly working` and got
`E-ARG: invalid semantic state 'working' (blocked|question|hold|waiting|ready|failed|cancelled|done)`.
**There is no word for "actively working".** Being at work is expressible only as the *absence*
of a declared state — so item 1's `--state` flag has nothing to pass when a PM starts a task, and
the honest move is `pij state clear`. This is not an argument for adding a word; it is an argument
that JC-1's `--state` is optional for a reason, and the skill-route automation (item 6) must not
teach PMs to invent one.

---

## Contract-level verdicts

### WS-001 · JC-1 — **RATIFY WITH AMENDMENT**

Ratified as written on D-1…D-20, including the two places it goes beyond a standing ruling
(the precise definition of "atomic", and the fast-loop read superseding the plan's
`spine events --peer` sketch). Both are correctly argued and both are improvements.

Amendments: **A-1** (ownership rows for `statusPrev/Next/At/Seq` — blocking) and **A-2** (the
nudge clock needs a never-null floor — blocking, and it is item 5's problem as much as JC-1's).
Recommendations: **A-3** (`pij now`), **A-4** (CG map growth).

One correction to its evidence ledger: **E-26 is incomplete** — there is a third `status` noun,
`pij daemon status` at `cli.ts:1071`, in the control-plane parser WS-001 did not read. Same class
as the E-32 correction WS-002 already carries. Not a defect in the contract; a note for the
ledger, since both repos will cite these ledgers later.

### WS-002 · JC-2 — **RATIFY AS WRITTEN**

No amendments. Store-partial/project-total (D1-c) is the correct resolution of the prime-duplication
hinge, the mandatory `DESCRIPTOR_FIELD_OWNER` row is right and is the reason A-1 exists, and the
day-one expectation (6 primes, 232 role-unknown, zero PMs, zero nudges) is stated so it cannot be
misread as a bug. The plan-text amendment it flags (`pij-rail-v2-plan.md:53`) is accepted.

Open items answered above: Q-11 yes-but-separate, Q-12 defer, Q-13 `M` yes / `w` no,
`adopt --role` no.

The one thing I would add to its record, not to its contract: its `hasRoleConflict` /
`role-conflict` anomaly is the only place in these three contracts where a **disagreement between
two writers is surfaced rather than resolved silently**. That posture is what A-1 is asking the
other two contracts to inherit.

### WS-003 · JC-3 — **RATIFY WITH AMENDMENT**

Ratified on D1…D9. Its central finding — that the daemon-detected path is not degraded but
**absent**, with no persisted tag anywhere CG can read — is confirmed by its own line pins and by
the shape of the code around them. Tiering it D0/D1/D2 is the right call, and **D1 is the whole of
item 7**: without a persisted `interstitial` tag the rail renders nothing for a wedged seat, and
`docs/difficulties.md` on this repo already carries the human cost of exactly that class.

Amendments: **A-1** (ownership row for `stateNote` — blocking), **A-6** (state the per-field
clearing policy at `core/cli.ts:2789` — non-blocking but same edit).

HAZARD-1's line pin is **verbatim correct** against this checkout, which is worth saying plainly:
it is the single most dangerous line in this plan, and the workshop found it before anyone wrote
code.

**OPEN-2 / OPEN-3 are Jordan's, not mine, and I am not answering them here**: the boot-prompt copy
(`"stuck on a startup prompt (<tag>) — open the pane"` — I support it; all three tags are boot
prompts and detection is `lifecycle === "pending"`-only, so the current copy is factually wrong)
and whether `QUESTION_AGED_MS` collapses into JC-1's `STATUS_STALE_MS`. Both are wording/taste
calls with a human owner, and per the question-ownership rule they go to him directly rather than
through me.

---

## What I need to proceed

1. **Your verification of this analysis**, then the ratification verdict to chainglass from your
   seat — neither side codes first. I have written no code and touched nothing outside this file.
2. **A ruling on A-1's scope**: I recommend the ownership rows land as a **single prerequisite
   change** ahead of items 1 and 3, rather than twice inside them. It is one edit to one table
   and it is the shared failure mode.
3. **Jordan's calls**: OQ-4 verb name (`pij status` vs `pij now`), OPEN-2 copy, OPEN-3 constant.
   Routed to you for relay per the cross-repo rule; happy to ask him inline if he is in-pane.

## Sequencing consequence for the plan (not for the contracts)

The brief already gates **item 4 (sweep-adopt)** on **#35**. This review adds one more ordering
fact and one non-ordering fact:

- **A-1 is a prerequisite for items 1 and 3**, both of which are otherwise "small".
- **Item 4 remains independent of JC-2** — WS-002 D7-a is right: sweep-adopt keys on
  `prime === true` (`core/discovery.ts:105-107`, `core/tree.ts:25-26`), not on the new field, and
  D7-c's explicit non-change (`isUnadopted` keeps keying on `prime`) is what keeps designating a
  seat `"pm"` from silently removing it from the adoption sweep. Ships in either order, as
  claimed.

---

## Evidence ledger — this review only

Read-only, in `pij-worktrees/s074-pij-rail-v2` at `8a63c58`, 2026-07-29. Paths under
`.pi/extensions/pij/` unless noted. No writes outside this file; no git operations.

| # | Claim | Evidence | Grade |
|---|---|---|---|
| R-01 | Incident #1 is verbatim the CLI-stamped node-truth denorms replayed away by a daemon write | `core/registry-write.ts:9-11` | proved |
| R-02 | Omitting an ownership row is silently lossy **for your own field**, no error, no log line | `core/registry-write.ts:59-65` | proved |
| R-03 | `DESCRIPTOR_FIELD_OWNER` carries `currentAssignment`/`currentTask`/`planId`/`semanticState` as `"cli"` | `core/registry-write.ts:73,81-85` | proved |
| R-04 | WS-001 and WS-003 never cite the ownership table; WS-002 cites it 10× | `grep -c` over the three workshops | proved |
| R-05 | The stale-clearing destructure names exactly one field | `core/cli.ts:2789` | proved |
| R-06 | `denormDescriptor` has exactly three call sites: `task set`, `state set`, `state clear` | `core/cli.ts:3800,3897,3997` | proved |
| R-07 | `isFireDue` returns `false` when every anchor is null | `core/watchdog.ts:134-146` | proved |
| R-08 | Default watchdog interval is 20 minutes | `core/watchdog.ts:6` | proved |
| R-09 | `evaluateResponse` inputs carry no semantic-state field | `core/watchdog.ts:160-166` | proved |
| R-10 | pij already uses an always-present floor anchor for an age question | `core/archive.ts:36-44` (docstring `:39`) | proved |
| R-11 | The spine log is byte-append-only; no rotation, compaction or truncation exists | `adapters/spine-store.ts:3-20`; repo-wide `grep -rn "events\.ndjson"` non-test | proved |
| R-12 | Tier migration moves `~/.pij/<id>/`, never `~/.pij/spine/` | `adapters/fs-registry.ts:584-606` | proved |
| R-13 | Archiving requires terminal **and** ≥48h idle; every "can't prove it" branch answers hot | `core/archive.ts:16,23,33` | proved |
| R-14 | Live spine: 5,087,199 bytes, 22,664 lines, **0** `"kind":"status"`, **1,429** distinct peers | `ls -la`/`wc -l`/`grep -c`/`grep -o \| sort -u \| wc -l` on `~/.pij/spine/events.ndjson` | measured |
| R-15 | Registry tiers: **237** hot descriptors, **4,037** archived | `ls ~/.pij/*.json \| wc -l`; `ls ~/.pij/archive/ \| wc -l` | measured |
| R-16 | `closeAssignment` is defined and called nowhere outside tests | `grep -rn "closeAssignment" --include=*.ts .` | proved |
| R-17 | `PrimeService.update` writes the descriptor and appends no spine event | `core/orchestration/prime.ts:28-37`, esp. `:35` | proved |
| R-18 | `pij orchestration` dispatches `prime set\|retire\|unset` with no audit append | `core/orchestration/cli.ts:1-24` | proved |
| R-19 | `SEMANTIC_STATES` is the closed 8-word vocabulary; there is no "working" | `core/types.ts:99-109`; live `pij state set … working` → `E-ARG` | proved |
| R-20 | `state set` allowlist is `assignment, refs, actor, json`; `--refs` is valued, not boolean | `core/cli.ts:697-699` | proved |
| R-21 | The vocabulary guard is the fail-loud template `--note` should follow | `core/cli.ts:1336-1337` | proved |
| R-22 | `status` is free as a top-level verb in **both** parsers | `cli.ts:3805-3900` branch list; `core/cli.ts:666-705` | proved |
| R-23 | A third status noun exists: `pij daemon status` | `cli.ts:1071` | proved |
| R-24 | `pij state <id>` already reads "liveness + working/idle" | `pij state --help`, run this session | proved |
| R-25 | The human designation column is a 1-char ternary under a 1-char header | `core/cli.ts:2118` | proved |
| R-26 | `pij list --json` rows are a hand-built literal; the denorm is a pure field read | `core/cli.ts:2061-2103`, comment `:2085-2091` | proved |
| R-27 | A SUSPECT was raised on this seat while it was declared `waiting` | reported by `pij-wee-albatross` (its watcher), this session | reported, not self-measured |

**Explicitly not verified**: no pij command that writes was run; no test was executed; the
daemon-replay consequence in A-1 is **inferred** from R-01/R-02 (a documented five-incident list),
not reproduced. The cheap proof, if wanted, is WS-002's own suggestion — a unit test against
`applyWriteLaw` with and without the row.

**Boot gate at base**, per the brief and not re-run by me: typecheck green, suite **3633/3634**,
one pre-existing red also red on canonical main —
`cli.integration.test.ts > … top-level help and skill guidance distinguish pull from push delivery`.
Named here so it is never silently inherited.
