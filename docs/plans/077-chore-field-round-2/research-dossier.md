# Research dossier — `pij chore` field round 2

**Basis**: the s082 fleet rollout of `pij chore` (PR #74, then PR #75). Nine primes and six PAs
were asked to adopt it; six seats used it for real. Every finding below was **measured in the
field by a seat that was trying to do its job**, then re-verified against source by the
orchestrator. Nothing here is speculative.

**Scope of this dossier**: the four defects that survived PR #75, split by blast radius into
**PR A** (literals and paths — this round) and **PR B** (acked history — a separate round,
because it changes durable state shape).

---

## ⚠ How to read the corroboration counts in this document

**Do not take "N seats independently confirmed this" at face value.** This dossier consolidates
reports from six PAs and nine primes, and cross-seat agreement is its most persuasive-looking
evidence — but tonight demonstrated that agreement is **counterfeit whenever the seats share an
upstream reader**.

The retracted F-4 headline (below) is the worked example: two seats, two **independently
authored** probes, repeated agreement across a seat boundary, ~4h apart — and all of it a single
observation reported twice, because both probes read `pij anomalies`, which read one stale
`semanticState`. The diversity was in **output formatting**, not in the observation path.

> **Two probes that converge on a shared upstream source are one instrument wearing two hats.**
> Diversity has to exist where the reading is **taken**, not where it is **formatted**.

Most of what the fleet measured tonight went through `pij anomalies`, `pij node show`, or
`pij chore run`. **For a great deal of it, N seats agreeing is N = 1.**

**The test to apply to any claim here**: not *"did they write different probes"* but *"where do
their paths converge, and what is the first shared thing upstream of both?"* Everything at or
above that join is un-corroborated no matter how many seats agree — and **the more seats agree,
the more convincing the shared error becomes.**

Findings that do **not** depend on corroboration, and are therefore the strongest things in this
document: the ones re-verified directly against source (F-1b’s `process.cwd()` wiring, F-3's
`JSON.stringify`, F-4's `pending` gate in `reduce.ts:126`).

---

## The primitive's premise, restated — every finding is a violation of it

> The tool computes the delta, so a cheap seat can only **classify and relay** output it could
> not have invented.

Two corollaries the field has now stress-tested:

1. A seat must be able to **relay** a delta (F-2, fixed in #75).
2. A **shared** roster must mean the same thing to a second reader (F-1, open — this round).

---

## PR A — literals and paths

### F-1 · Repo scope is inert: a shared roster resolves for nobody but its author · **P1**

`pij chore add --scope repo` writes `.pij/chores.json` **into the working tree** — correct, that
is the design; repo scope is meant to be committed and shared. It is not committable.

**Two independent breaks, and a fix author needs both instances.** They were found by different
seats, and each seat's roster exhibits **only one** of them — so anyone reproducing from a single
roster will wrongly conclude the other is not real.

| # | Instance | Held by | Mechanism |
|---|---|---|---|
| F-1a | **Verbatim absolute path** | `pij-superior-mastodon` | roster stores `/Users/jordanknight/games/voxel-flying-game/scripts/chore-probes/branch-heads.sh` — pinned to one checkout, resolves to nothing in a fresh clone |
| F-1b | **cwd is not repoRoot** | `pij-wee-albatross` | roster stores `python3 harness/scripts/pij-repo-probe.py main-head` — relative, but the probe runs in `process.cwd()`, so it resolves **only** when invoked from the repo root |

> **Attribution corrected.** This row originally named `pij-concerned-thrush` (the orchestrator).
> The committed roster in this repo is **albatross's**, not mine — I assumed authorship of an
> artifact I found in a shared checkout and repeated it as first-hand. The **defect pairing is
> unchanged**; only the holder was wrong.
>
> Two things made the error easy, and both are worth more than the correction. **The roster
> cannot tell you who wrote it**: `creatorSeatId` is `None` for both chores, so attribution is
> unrecoverable from the artifact — there was nothing to check myself against. And **every seat
> commits as the same git author**, so `git log` cannot break the tie either. In a shared
> checkout, "whose is this?" currently has **no** authoritative answer.

**Source of F-1b** — `cli.ts` `runChoreVerb`:

```ts
const cwd = process.cwd();
const worktreeRoot = currentWorktreeRoot(cwd);
...
cwd,                                                    // ← the probe runs HERE
...(worktreeRoot ? { repoRoot: worktreeRoot } : {}),    // ← only decides where the FILE lives
```

The repo root is computed, used to **place the roster**, and then discarded when **running the
probe**. `chore-probe.ts:119 run(command, cwd, timeoutMs)` spawns `sh -c` in whatever directory
the seat happened to be standing in.

**Net**: repo scope gives you a file that **must be committed to do its job and must not be
committed to be correct**. Mastodon gitignored its roster and degraded to seat scope.

**Class** (mastodon's framing, and it is the useful one): *a literal committed where a reference
belongs* — the same class as the DEPLOY_HOST defect, failing **silently** because nothing
re-executes it until a reader believes it.

**Fix direction** (not a mandate — the coder should reason about it):
- Run repo-scope probes with `cwd = repoRoot`, not `process.cwd()`.
- Store probe paths as **repo-relative references**, and reject or normalise an absolute path
  that lies inside the repo at `add` time.
- Decide explicitly what happens to a genuinely machine-external absolute path (a tool outside
  the repo is legitimate) — probably allowed for seat/fleet scope, refused for repo scope, with
  an error that says why.

**Verification bar**: the fix is proven when a roster authored in one worktree runs correctly
from a **different** worktree of the same repo, and from a **subdirectory**. Two paired
instances above are the test corpus.

---

### F-3 · `writeJsonAtomic` minifies, so every repo-scope write re-reddens the repo · **P2, recurring**

```ts
// .pi/extensions/pij/adapters/atomic-file.ts:124
export function writeJsonAtomic(path: string, value: unknown): void {
	writeTextAtomic(path, JSON.stringify(value));   // minified, no trailing newline
}
```

Biome formats `**/*.json`. A repo-scope roster lands **inside the repo**, so `biome check`
rejects it. Main was red for seven commits (`9fb486c` → `db63971`) on exactly one error:

```
.pij/chores.json format ━━━━━━━━━━
  × Formatter would have printed the following content:
Found 1 error.
```

**The state of this defect is the interesting part.** It was "fixed" by a seat **hand-reformatting
the artifact** (`db63971 fix(chores): format the committed repo roster — my commit was reddening
main`). The writer is untouched. **The gate is green and the trap is fully armed** — the next
`chore add --scope repo` re-minifies and reddens main again. This is a
[[green-that-lies]] instance: the symptom was repaired one layer below where it is generated.

**Blast radius warning — this is why F-3 is not a one-line tidy-up.** `writeJsonAtomic` is the
writer for **all** pij durable state (spine, registry, focus, chore state), not just chore
rosters. Changing its output format changes every state file pij writes. Options the coder must
weigh, not assume:
- format **all** pij JSON (consistent, but rewrites every state file on next write), versus
- format **only** rosters that land in a repo (narrow, but two writers to keep in step), versus
- lint-ignore `.pij/` (robust, but leaves an unreadable file in git — and a **shared** roster is
  meant to be read and reviewed in a PR, which argues against it).

Orchestrator's lean: the roster is the only pij state that is **meant for human review in a
diff**, so favour formatting it, and keep the general writer's contract explicit either way.

---

## PR B — acked history (**separate PR, do not bundle**)

### F-4 · The flap detector fires only for holders who **fail** to ack · **P1, schema-forward**

```ts
// core/chores/reduce.ts:126
if (instrumented.pending) {
  if (instrumented.baseline === nextFingerprint) → status: "flapped"
}
```

The flap branch is **gated on `pending` being non-empty**. `ack` clears `pending` and advances
`baseline`. So after a **correct** relay-then-ack, the return trip finds no `pending`, falls
through to the ordinary path, and renders as a **normal forward change**.

**~~Field evidence — a byte-identical round trip across a seat boundary~~ — RETRACTED.**
This dossier originally led with a fingerprint round trip
(`60d7b0cf271a → f214ff0b8990 → 60d7b0cf271a`, measured by mastodon, apparently corroborated by
albatross) and called it *the strongest instance available*. **It was not a world event.**

Albatross found the cause on its own seat: `semanticState` was stuck at `waiting` from a park it
had cleared **five hours earlier**, while `systemState` oscillated with its actual work. `idle`
vs `waiting` agrees → the anomaly row closes; `working` vs `waiting` disagrees → it opens. Every
"flap" was one seat starting or finishing a burst of work — **one permanent stale field crossed
with a bursty duty cycle.** The chore primitive reported faithfully; the instrument beneath it
was stale. (Separately: `pij report clear` reported success and changed nothing — see the
unclearable-declaration defect, which is a distinct platform bug.)

**The design defect below is unaffected**, because it never rested on that evidence: it is a code
fact in `reduce.ts:126`, verified independently by two seats via different routes — mastodon
reached it by reading `ackPending` destructuring `pending` out, having gone looking because
`FLAPPED` shipping seemed inconsistent with albatross withdrawing its ask.

**A finding that can only stand on one dramatic instance is not yet a finding.** The headline
died; F-4 did not.

**Consequence — an instrument whose reliability is inversely proportional to the care of its
user.** It fails silently in exactly the population that deserves it least.

**This demotes a signature we were relying on.** `old == new` (identical endpoints) is **not a
flap detector**; it is a *failure-to-ack detector that happens to correlate with flaps*.

**Albatross withdrew its own `FLAPPED` rendering ask on these grounds**, and the withdrawal
reasoning is the design constraint:

> **A baseline stores a POINT; a flap is a property of a PATH.** A round trip is not merely
> undetected — it is **unrepresentable** in the state the tool keeps.

Rule 1 therefore needs narrowing in the brief: it protects a **delta** from being dropped; it
**cannot** protect the **shape of a sequence**. The current wording — *"nothing is lost by
forgetting; things are only lost by acking something you did not relay"* — is too strong.
Acking something you **did** relay, correctly and in order, also loses information: that the
world returned to where it started.

**Fix direction**: compare the new fingerprint against a bounded ring of **acked history** on
`ChoreState`, not against the current baseline. That upgrades the state from a point to a path —
the only representation in which a flap exists at all.

**Why this is its own PR — an open decision for the operator, not the coder:**
`ChoreState` currently carries `baseline` + `pending` only. Adding a history ring is
**schema-forward**, and schema-forward chore state has already bricked seats once during the
s082 rollout: a newer build wrote `baselineValue` + a 4-key `pending`, and the older build
rejected the file **wholesale** (`E-NOREG ... malformed`). The compatibility contract —
reject-wholesale versus ignore-unknown-fields — must be decided **before** this is built, and it
must be revertible on its own without taking the #75 rendering fix with it.

---

## Closed in PR #75 — recorded so it is not re-reported

### F-2 · Rule 1 was unfollowable on a shared roster · **fixed**

Rule 1 presumes the holder **can** relay. For an unclassifiable delta on a chore it does not own,
a seat cannot say whether the world moved or the instrument was swapped — so `ack` is the only
way to clear it, and the rule degrades toward the two outcomes it was written to prevent: acking
something unrelayed, or carrying a permanent delta forever.

`core/chores/report.ts` on `s082/chore-field-fixes` now renders `CHANGED-VALUE`,
`CHANGED-PROBE` and `FLAPPED` as distinct records. This is **not merely a diagnosis aid — it is
what makes rule 1 followable on shared rosters.** Also in #75: seat resolution via `resolveSelf`
(was `PIJ_SESSION_ID`-only), registry validation of the resolved id, and probe values carried in
the delta instead of bare digests.

---

## What the primitive got right — the counter-evidence, and it is real

Recorded because a defect list read alone would misrepresent the rollout.

Mastodon's `anomaly-rows` chore turned a bare fleet count moving **5 → 6** into the row identity
in one hop — *axis-disagreement on `pij-wee-albatross`* — with **zero manual investigation**.
First real board change in hours. That is precisely the transcription work the primitive was
built to abolish, working as advertised.

Caveat the same seat volunteered: it had to **hand-relay** the finding, because #79 leaves primes
structurally unreachable by their own alarms. The detector worked; the delivery leg is still
human.

---

## Two method notes worth more than any single finding

**1 · Independent rediscovery is doing real work in this fleet — it is not redundancy.**
Twice in one night a defect was found by two seats independently, and **both times the second
finder's framing was the load-bearing one** (roadrunner/thrush on nested state damage;
mastodon/albatross on the flap inversion). The first finder had the instance; the second had the
class.

**2 · Rigour follows the claim you want** (mastodon's self-correction, recorded on main as
`government/doctrine/rigour-follows-the-claim-you-want.md`). Mastodon verified the minification
leg rigorously — tracked via `git ls-files`, single line, last byte `0x7d`, no trailing newline —
and took the absolute-path leg **on the orchestrator's word**, because that leg was an inherited
premise rather than its own new claim. Its own words:

> *I was rigorous exactly where rigour supported my new claim, and trusting where I had inherited
> the premise.*

The correction **improved** the evidence base: the fleet now holds **one clean instance of each
defect rather than two of one** (F-1a and F-1b above). Attach the right artifact to the right
defect.

---

## Non-goals for this round

- **PA self-registration** (`E-OWN` on `chore add` at seat scope) — a live design question with
  the operator, not decided.
- **A scheduler.** The primitive has none, by explicit Non-Goal in plan 076. Four of six PAs
  stopped running chores because nothing folds `chore run` into a PA charter. **This is an
  adoption finding for the operator, not work for this round** — but it is the reason the
  primitive's measured value is lower than its demonstrated value.
- Parameterised probes, templated output, semantic-state gating — all requested by the field,
  none decided.
