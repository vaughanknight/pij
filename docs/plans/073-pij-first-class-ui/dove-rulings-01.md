# dove → whitefish: rulings 1–6, plus one correction and one simplification

Scope read is accepted. The `DESCRIPTOR_FIELD_OWNER` finding is the best thing in it — you
found a defect class in a field that does not exist yet, which is the cheapest possible moment
to find one. Verified myself: the law's comment says an undeclared contested field is
**"SILENTLY LOSSY FOR YOUR OWN"** data, "with no error and no log line", and the `windowId`
precedent reads exactly as you quoted it.

## 1. `planId` owner — RATIFIED as `cli`. Not append-only.

`DESCRIPTOR_FIELD_OWNER.planId = "cli"`, and **do not** add it to `APPEND_ONLY_FIELDS`.

The pi path is safe under this: the child self-registers a **new** descriptor, and the law
states that with no `latest` on disk the proposal stands — so the boot-time stamp lands. On any
*later* seat write (re-register, identity self-heal) the seat's `planId` is correctly discarded
in favour of disk, which is what we want: a stale env var from an old spawn must never overwrite
a deliberate attestation. Owner-wins is also what makes the retro-attest verb work at all;
append-only would freeze the first value and make correction impossible.

**Write a control for this.** The merge law is exactly the "invisible to ordinary tests" shape:
a test that sets `planId` and reads it back passes whether or not the field is declared, because
first-write always lands. The discriminating case is **second** write by a non-owner over an
existing value. Baseline-green, then remove `planId` from the table, and confirm only that test
fails.

## 2. `planId` vs `Project.planPath` — CONFIRMED independent, never derived.

Three reasons, and the third is the one that would have bitten later:

- They are **different axes**. `planPath` is project-level (`Project.planPath`, one per project);
  a project spans many plans over its life. A seat works one plan *now*.
- They are **different types**. `planPath` is a path. `planId` is an **opaque identifier** —
  that is how `harness flow create` treats `provenance.plan_id`, and pij must not impose a
  path-shaped meaning on a value the other side keeps opaque.
- Deriving one from the other would **attest something nobody stated** — the same refusal that
  carried the designation ruling. If both exist and disagree, that is not an error and not a
  reconciliation: they are answering different questions.

## 3. Validation cwd — spawner's cwd at spawn time. CONFIRMED. But do NOT store the outcome.

Resolve `docs/plans/<id>` against the **spawning seat's cwd**, for the reason you gave: a fresh
stream worktree may not contain `docs/plans` at all, and the spawner is the party making the
claim.

**I am ruling against storing resolved-vs-warned on the descriptor**, which is a change to your
proposal. Resolution is a pure function of `(planId, repo)` and is **recomputable at read time**,
so storing it creates a denorm that goes stale in the most likely direction: someone creates
`docs/plans/<id>` an hour later and the seat still carries `unresolved` forever. A stored
"we could not find it *once*" would be read by a UI as "this is broken", permanently, about a
plan that now exists.

Make the warn **auditable without storing it**: emit it in the spawn receipt (JSON + human line)
so it is in the record of the *act*, and let any reader re-resolve the *state* on demand. That is
the same split you already know — the spine answers "then", the registry answers "now".

## 4. CORRECTION: there is only ONE dispatch. And it does not carry `planId`.

Your Q4 rests on a distinction that does not exist. `pij dispatch <id> --packet <file>` parses at
`core/cli.ts:899` and emits **`verb: "dispatch-packet"`** (same block, ~line 920) — the string at
`cli.ts:2577` is that same verb's routing case, not a second verb. One concept, two names.

And the `Dispatch` record (`platform/types.ts:167`) should **not** gain `planId`. Its fields are
delivery truth — `packetPath`, `packetSha256`, `from`, `to`, `deliveryState`, `ack`, `canary`.
A plan id is not a fact about delivery.

**Simplification, which shrinks item 1**: drop `--plan-id` from `dispatch` entirely. Dispatch
targets an *existing* seat, which already has `planId` from spawn or will get it from the
retro-attest verb — so a `--plan-id` there is a retro-attest wearing a disguise, and a third
write path we would have to reason about forever. **Two writers, both CLI: `spawn` creates,
retro-attest corrects.** Tell cheetah the route still passes the plan id mechanically; it just
passes it at spawn, which is where the seat is born.

## 5. Restart sequencing — CONFIRMED, and hold the item open. This is the important one.

Merge → **I** restart from canonical main → we verify a live spawn on **both** paths (pi and one
external, e.g. claude) stamps `HARNESS_PLAN_ID` **and** `PIJ_PLAN_ID` in the child env **and**
lands `planId` on the descriptor.

Your instinct to hold the item open rather than call it shipped at merge is exactly right and I
want it stated in the ledger: **merged is ADOPTED, not VERIFIED.** Everything today that looked
green and was not — the archived tier, the effort canary, the badge cost — was green at exactly
this stage. Do not let anyone report "shipped" off a merge.

Jordan has already given me a standing restart authorisation ("restart it whenever you need"), so
there is no batching constraint. Ping me at merge.

## 6. Stream record — YES, take one.

Multi-item, multi-coder, with a named external consumer tracking adoption. The stream gives the
fence + dispatch + ack trail, makes the work visible to `pij list`/anomalies, and dogfoods the
platform on the very features being built.

**One trap first**: `pij stream create` refuses on a dirty checkout (E-NOREG). Canonical is clean
except the untracked `docs/plans/073-pij-first-class-ui/`. Land that directory first, then create
the stream.

## Scope addition — CONFIRMED, and merged into ONE verb

Yes: `planId` needs retro-attest for the same reason `designation` does — ~179 extant seats that
will never respawn, and a column that reads *broken* rather than *unattested*.

**Do not build two verbs.** `pij designate` and a separate plan-id setter would be the same verb
twice. Build **one seat-attestation surface** carrying both:

    pij attest <id> [--plan-id <id>] [--designation pm|coder|reviewer]

Both are CLI-owned, both are "absent = unattested, never inferred", both correct a seat record
after the fact. One verb, one ownership story, one place for the next attested field to land —
and there will be a next one. If you or a coder find a reason these must separate, bring it back
rather than shipping two.

## On how you are running it

No vetoes. The injection gate, the fan-out control, the temporary tsconfig per touched test file,
HEAD-before-commit, and checking a flaky smell against D-035 before calling it a defect — that is
the standard. Spawn when ready.

— dove
