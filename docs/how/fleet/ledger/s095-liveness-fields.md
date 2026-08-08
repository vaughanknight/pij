# Stream s095 — liveness-fields (`pij-fair-aphid`)

> Appended as one contiguous block rather than into the three sections above, deliberately: six
> PMs appending to the end of the same three sections is the one shape that *does* conflict, and
> the brief's "different line ranges merge cleanly" only holds if each stream owns a range.
> **That is itself F-403.**

## Difficulties

### F-400 · `/builder 1b plan` is dd-native, but no `builder/plan` schema exists anywhere
The plan stage instructs `harness plan new` + `harness dd set`. On `harness 0.13.0` the command
exits `degraded` and renders nothing: schema `builder/plan` resolves from none of the three
discovery roots (`<gitroot>/.dd`, `.harness/.dd`, `~/.dd` — all absent; `harness dd schema list`
returns `"schemas": []`). **Cost**: one scaffold + teardown cycle, then a fallback to the repo's
markdown plan convention, which every existing plan in `docs/plans/` uses anyway. **Status**:
worked around. **Fix**: either ship the schema with the skill, or have the skill detect an
unresolvable schema and fall back to markdown *without* writing a degraded folder first.

### F-401 · pij#142 remedy 2 (`agentPid`) has never been implemented
`grep -rn "agentPid" --include=*.ts .pi/extensions/pij` → **0 matches**. The issue proposes
projecting `agentPid` alongside `pid`; nothing does. **Cost**: none directly — but the issue
reads as though a remedy exists.

### F-402 · pij#142 remedy 1 (`close --force` liveness guard) has no call site
`core/close.ts` gates solely on ownership (`E-OWN`, `close.ts:73`); it never consults liveness.
This is the remedy the issue's own comment ranks **first**, because it is the one that would
have saved the destroyed pane. **Cost**: the destructive path is still open today.
**Archetype**: *a remedy with no call site is an untested claim sitting in an issue.* Third
instance in this wave (cf. the prime's comment on pij#118, where the issue's proposed fix would
have regressed another).

### F-403 · The ledger's own append protocol conflicts under a real fleet
The brief says append-only merges cleanly "at different line ranges", but it also assigns
everyone the same three sections. Six streams appending to the end of `## Difficulties` is a
guaranteed conflict. **Cost**: had to invent a per-stream block convention mid-run.
**Fix**: give each stream a pre-created `### Stream sNNN` heading, or make the ledger a
directory of per-stream files concatenated at render.

> **AMENDED 2026-08-08, in place — the row was half right and the weaker half is the instructive
> part.** This row offered two remedies. **The second (per-stream files) was adopted fleet-wide**
> after s097 hit *three consecutive rebases* conflicting only on this file, never on code — its
> branch was never broken, it was repeatedly unmergeable because of a document no stream's work
> depends on. **The first (a pre-created heading per stream) does not survive contact**: separate
> headings in one file still put every stream in one file, so concurrent appends still contend and
> the last stream to merge still pays N rebases.
>
> I hit this conflict **twice myself** and still proposed the weaker remedy first, because I wrote
> the row having experienced exactly one conflict. That is the generalisable defect, and s097 and
> the prime each committed their own version of it within the hour:
>
> **A remedy that removes the symptom at N=1 and reintroduces it at N>1 has not been tested at the
> cardinality it will meet.**
>
> Kept rather than rewritten: a row that was wrong is more useful with its correction attached
> than silently replaced.

### F-404 · The issue's own proposed fix would have introduced the inverse defect
pij#142 proposes `pgrep -P <pid>`. Measured across 23 live seats: the agent is **at** the
registry pid for 16 and one level below for 7 (split by spawn path, not harness). A `pgrep -P`
probe would return "no agent" for the majority. **Cost**: would have shipped a false-dead on 16
seats — the destructive direction. **Lesson**: an issue's remedy deserves the same measurement
as its diagnosis.

### F-405 · Every peer-supplied claim in this wave needed re-verification
Three inherited claims, three outcomes: the butterfly descriptor ✅ reproduced; the #155
population ✅ reproduced *and found grown 4 → 15*; "the registry pid is the pane's shell"
⚠️ **partially refuted**. Separately, a claim I relayed to the prime ("s096's eligibility guard
reads `terminal`") was **false** — `terminal` appears zero times in `eligible()`
(`watchdog-manager.ts:190-207`) — and it originated as s096's *proposal*, which the prime
relayed as current fact and I repeated. **Cost**: one retraction, and a cross-stream
coordination briefly built on a wrong seam. **Fix**: label relayed statements as PROPOSED vs
MEASURED at the point of relay; the distinction does not survive two hops otherwise.

## Wins

### W-400 · Independent plan validation found four blockers in one subagent run
A single `rubber-duck` pass over the plan + the real code found: (1) the fix would have been
**fully unit-tested and completely inert**, because the probe is injected from a call site the
plan never touched (`daemon.ts:639-648`); (2) a **notice storm** — every already-dead descriptor
rewritten and re-notified on every 600ms tick; (3) **~500 `ps` spawns per tick** from the naive
per-descriptor probe shape; (4) **two acceptance criteria that already passed on unfixed code**.
**Cost**: one subagent run. **Value**: any one of the four would have been a bad PR; (3) would
have been a production incident. *Adopted fleet-wide by the prime mid-run.*

### W-401 · Writing the plan against the running system, not the issue text
Every number came from a command on the live registry. That is what surfaced the false-alive
direction (`pij-weak-gurgeh` holds pid 952, recycled to `IntuneMdmDaemon` at the reboot, so
`isAlive` is `true` forever) — a failure mode **neither issue claims**, and the mirror image of
the one they do.

### W-402 · Publishing a contract before implementing it
`activityCredibility()` was specified, written to disk, and relayed to the consuming stream
**before** a line of it existed, so s097 codes against it while s095 builds it and only the
merges are ordered. Isolation removed edit-time serialisation without removing convergence
discipline.

### W-403 · The prime refusing a fix that would have worked
The obvious way to clear the visible symptom — have `reconcileDeaths` write an honest `state` —
was **ruled out as a silencer**: the row would have stopped firing while the detector that
renders a dead seat as working stayed broken, merely starved of input. Worth recording that the
ruling cost the stream its most visible deliverable and was still right.

## Suggestions

### S-400 · `pij fleet ledger add --stream <s> --kind F|W|S` — per-stream ranges, no conflicts
Direct fix for F-403. Allocates the id, writes into the stream's own range or file, renders the
concatenation.

### S-401 · A `--prove-fails-first` test-runner mode
The fleet's bar is "your test must fail without the fix", and this stream proved that a plan can
satisfy that bar *sincerely and wrongly*. **I wish there were** a verb that, for each named test,
stashes the diff, runs it, and asserts it **fails as a failure rather than an error** — then
reports any test that stayed green as a defect. It is mechanical, it is the difference between a
claim and evidence, and every stream in this wave needed it.

### S-402 · Corroboration as a first-class primitive: `pij verify <id>`
pij stores OS-issued identifiers (`pid`, `paneId`) and later treats them as identities. Both
failure modes in this wave are that one defect: a recycled **pid** makes a dead seat immortal
(F-404/§3), and a re-leased **paneId** nearly killed a live seat in another government
(pij#171). **I wish there were** one verb answering *"does this identifier still denote the
thing we recorded?"* — for pid, pane, and session id — that every destructive path must consult.
Two governments hit the same root on two axes within a day.

### S-403 · Record the ISSUING EPOCH alongside every leased identifier
The cheaper half of S-402: store the boot id with a pid and the tmux server pid with a paneId.
A lease from a dead epoch is then detectable without any probe at all, and both failures above
become impossible rather than merely detectable.

### F-406 · A parse failure that degrades to "not found" is a fleet-wide kill switch
Found in s095's own implementation, before merge, by the coder. The first `ps` row parser knew
only GNU `lstart` ordering (`Sat Aug  8`); macOS renders `Sat  8 Aug`. Every row therefore fell
to the unreadable branch, and an unreadable row has an empty command line — which is not a
harness process. **The identity ladder would have returned `absent` for every seat on the
machine, and one tick would have stamped the entire fleet terminal.**
**Evidence**: `adapters/process-snapshot.ts` `PS_ROW` now accepts both field orders; three
distinct `ok: false` paths exist where an empty table would otherwise have been returned.
**Cost**: none — caught pre-merge — but the blast radius was every seat in every government on
the box. **Status**: fixed, guarded both directions, verified at source by the PM.
**The archetype, which is the part worth keeping**: the portability bug is ordinary. The defect
is that **the unreadable case and the absent case shared an output**, so an instrument that can
read nothing reports that nothing is there, with full confidence, about everything at once.
*Unreadable must be NOT-PROBEABLE, never ABSENT* — the same distinction `pij chore` already
implements and the same one `mutate.mjs` reached independently with exit 3.

### F-407 · A whole-file grep cannot tell "wired" from "present somewhere in the file"
s095's AC-18 was written to prove the new probe is reachable from its production call site — the
tested-but-unreached defect. Re-discharging it on the rebased tree, the coder orphaned the
capture so it still existed in `daemon.ts` but no longer fed `reconcileDeaths`.
**AC-18b, which greps the whole file, STAYED GREEN. AC-18a, which slices the call site, went
red.** So the suite contained a criterion that would have survived a rebase that broke the very
wiring it existed to protect, and reported success.
**Cost**: none — caught by applying s099's rebase rule rather than trusting the pre-merge proof.
**Archetype**: still-present and still-load-bearing are different claims. A whole-file grep is
**an assertion over a set and is not evidence about a member** — s099's fat-assertion rule where
the set is a file rather than an object.

### W-404 · Relocating code to keep a guard green does not satisfy the guard, it escapes it
`core/liveness-cost.test.ts` exists to assert that "if someone swaps the ProcessPort for
ps/tmux, liveness silently becomes N forks per listing" — s095's headline risk, written by
someone else months earlier. The fork was correctly and knowingly placed in a NEW file so
`process.ts` stayed syscall-only. **That left the guard watching six files that no longer
contain the thing it guards: still present, still green, no longer load-bearing.**
Caught by the prime's corrected subprocess census surfacing the file for an unrelated reason.
Guard extended to cover where the fork actually lives, and mutation-verified.
