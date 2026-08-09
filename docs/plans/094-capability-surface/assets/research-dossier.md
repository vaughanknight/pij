# Research Dossier: PA capability surface — widen the gate (#102) and make the payload unreadable-when-stale (#153)

**Generated**: 2026-08-08T04:20:00Z
**Query**: "stream capability-surface: pij#102 widen the PA gate, pij#153 exhaustive verbs map"
**Effort**: Standard (lead only — every question resolved by direct read; no independent uncertainty justified a worker)
**Evidence**: 12 current sources · 5 historical sources

## The Ask

A **PA** (Prime Assistant) is a cheap, fast seat that runs a prime's maintenance chores, and it
is read-only *by construction* — a capability table refuses it verbs rather than a prompt asking
it nicely. Two complaints have been ruled on. **#102**: the table refuses a PA several duties its
own standup recipe assigns it, so the seat closest to an observation is the one that must route
it through someone else — Jordan ruled **widen**, and replaced the gate's governing test
(*authority*) with a new one (*harm*). **#153**: the capability payload `pij whoami --json` emits
is honest and complete, and was still read wrongly in the permissive direction — the ask is a
single exhaustive three-valued verb map so that no belief is formable from an absence.

This dossier establishes what the code actually does today at both seams, which of the two
issues' citations still hold, and what the widening costs — so the plan can be written against
measured behaviour rather than the issue titles.

## Answer

1. **One table drives both seams.** `PA_VERB_CLASSIFICATION` (63 entries) is consulted by core
   `dispatch()` and by the bin's raw-argv early branch through the same `paRefusal` predicate.
   **Reclassifying `spine-append` and the three `chore` mutators is a table-only edit** — it
   needs no change in either seam and no change in the bin.
2. **`watchdog unwatch` is already self-resignation by construction.** The effective watcher is
   `cmd.forSeat ?? self`, and `--for` is refused outright for a PA *before* the target check. So
   a PA running `unwatch <anyone>` can only ever remove **its own** subscription. The target
   restriction currently blocking it buys nothing and costs the PA the ability to resign.
3. **`watchdog list` is a pure read** and is the "see what it carries" surface the ruling asks
   for — it renders every seat's watcher roster, which is where a PA finds its own id. It
   branches *before* any target id is resolved, so it must be permitted by relaxing the **action**
   check, not the target check.
4. **The two widened write verbs already satisfy the harm test in their own implementations** —
   `spine-append` is attributed and append-only under the write lock; `chore remove` is
   persist-before-mutate and leaves a durable `removals` record carrying a reason and a
   timestamp. Neither can produce an unattributed or unrecoverable outcome.
5. **The payload has exactly one producer and no product-code consumers.** Four files mention
   `refusedVerbs`/`conditionalVerbs`: the producer and three test files. This is what makes a
   *breaking* reshape viable, and a breaking reshape is what #153's amendment actually asks for.
6. **The prime's own seat cannot prove any of this.** The conditional bucket is computed only
   when `role === "pa"`, so every acceptance test must construct a `pa`-role descriptor; a
   live check must run on a real PA seat.
7. **A stale-consumer trap survives if the old fields are kept.** `'watchdog' in refusedVerbs`
   returns a confident falsehood whether or not a new map sits beside it. Only removing the
   fields makes the stale probe fail loudly — see R-02, the one decision this dossier cannot make.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | The classification table is the single input to both seams: core `dispatch()` calls `paGate`, and the bin calls `paBinRefusal(paCapabilityVerb(top, argv[3]))` — both resolve through `paRefusal`. | `core/cli.ts:3496` (dispatch), `cli.ts:4108` + `cli.ts:548-561` (bin seam) | Widening `spine-append` and `chore add/update/remove` is a **table-only** change. **No bin edit is required for #102** — the boundary the prime flagged is not crossed. | High |
| F-02 | 63 verbs are classified. Full key list captured; `chore` carries six per-subverb keys plus the family key. | `core/orchestration/pa-capability.ts:74-184` (counted by script) | Sets the exact size of the exhaustive map and of any pin asserting it. | High |
| F-03 | The effective watcher for `watch`/`unwatch` is `cmd.forSeat ?? self.value`; with no `--for` the caller can only add or remove **itself** from a target's roster. | `core/cli.ts:2427` | Dropping the target restriction **for `unwatch` only** cannot let a PA change another seat's supervision — self-resignation is enforced by the data path, not by the gate. | High |
| F-04 | `--for` is refused outright for a PA — *including when it names itself* — and the check runs **before** `paTargetDecision`. | `core/cli.ts:2307-2317` | The escape route the target check was guarding is already closed by a separate, earlier check. Widening `unwatch` does not reopen it. **This check must not be touched.** | High |
| F-05 | `watchdog list` is a read over `registry.list()` + sidecars, returning each seat's `watchers` roster; it returns **before** the `cmd.id` requirement. | `core/cli.ts:2356-2372`, `2374-2375` | This is the "see what it carries" surface. It must be permitted by widening the **action** allow-set; a target-side change would never reach it. | High |
| F-06 | `spine-append` resolves an actor (`resolveActor`), stamps `actor` + `actorProvenance` on the event, appends under `withPlatformWriteLock`, and returns the stamped `seq`. | `core/cli.ts:4782-4814` | A PA's entry is attributable and distinguishable at read time — the exact property the ruling relies on. No new attribution work is needed. | High |
| F-07 | `chore remove` writes a `removals` record (`scope`, `name`, `reason`, `removedAt`) to the roster **before** deleting the chore, then writes again. `--reason` is required by the parser. | `core/chores/cli-verbs.ts:989-1030` | Removal is recorded and re-addable → reversible under the harm test. Persist-before-mutate (P9) already holds. | High |
| F-08 | Chore scopes are `seat` \| `repo` \| `fleet`, and definitions **union** across scopes. | `core/chores/types.ts:1` | A PA may add a `fleet`-scoped chore, which adds a duty to every seat. Ruled in scope, but the plan should name it explicitly rather than let it arrive unannounced. | High |
| F-09 | The whoami payload is built in exactly one place; `conditions` is computed **only** when `role === "pa"`, so a non-PA seat always emits an empty conditional bucket. | `core/cli.ts:2529-2562` | Every acceptance test needs a `pa`-role descriptor. A prime's own `whoami` is not evidence — matches the charter's warning. | High |
| F-10 | Only four files reference the payload fields: the producer plus `core/cli.test.ts` (15), `cli.integration.test.ts` (5), `cli.inbox.integration.test.ts` (2). No product code consumes it. | `rg -n --hidden 'refusedVerbs\|conditionalVerbs' --glob '*.ts' -c` | A breaking reshape is contained to tests. This is the fact that makes R-02 answerable at all. | High |
| F-11 | `cli.inbox.integration.test.ts:207` pins the payload with `toEqual`, with a comment stating the strictness is deliberate "so a future addition to this surface has to be noticed here". The same file carries the send-delivery test at `:219-250`. | `.pi/extensions/pij/cli.inbox.integration.test.ts:193-217`, `:219-250` | **Shared file with stream s093** — prime has ruled: additive one-line edit permitted, `toEqual` must not be downgraded, and the new map should be pinned with equal strictness. | High |
| F-12 | That test file already imports from `./core/` (`./core/types.js`), and the exhaustive-key property of the table is independently proven by scraping both real verb sources. | `cli.inbox.integration.test.ts:20`; `core/orchestration/pa-capability.test.ts:15-47` | An **exhaustiveness** pin (payload keys ≡ table keys) is cheap and is not circular: table-vs-reality is proven by an independent scrape, payload-vs-table by the pin. Answers the prime's "is that a bigger change than it sounds" — it is not. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The `toEqual` pin caught plan 084's additive `conditionalVerbs` key weeks after being written; the fence was widened for one line and the pin was explicitly **not** weakened. | `docs/plans/084-pa-gate-repair/execution.log.md:243-258` (WIN-005) | **Direct** | Follow the precedent exactly: add, never downgrade. Re-litigating is settled. |
| H-02 | "the TRAP-1 mutation is repeatable; any future PA capability change should be validated with it." | `docs/plans/084-pa-gate-repair/execution.log.md:265-266` (WIN-003) | **Direct** | Mutation-proof every widened and every still-refused verb. This is an explicit instruction from the predecessor stream to this one. |
| H-03 | A first mutation was too broad and would have passed a **vacuous** test; it had to be narrowed to the exact branch before it proved anything. | `docs/plans/084-pa-gate-repair/execution.log.md:327-331`, `:401` (WIN-007) | **Direct** | Each mutation must flip exactly one classification, and the neighbouring assertion must stay green. |
| H-04 | The two seams resolve the caller differently, undocumented; a bin-shaped test that sets only `PIJ_SESSION_ID` silently exercises one seam. | `docs/plans/084-pa-gate-repair/execution.log.md:262-264` (DL-007) | **Direct** | Widening must be proven at **both** seams, or half the gate is untested. |
| H-05 | #134 *added* `conditionalVerbs` and left `refusedVerbs` intact and still correct; a probe written 2026-08-01 (`[v for v in rv if 'watchdog' in v]`) kept parsing and kept returning a confident falsehood. | `pij#153` amendment comment | **Direct** | The defect is additive-silence, not readability. Drives R-02. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| **R-01 · A 63-key `toEqual` object is unreadable and will rot** | F-02, F-11 | Pinning the map by literal would add ~63 lines to a bin integration test and invite the next author to downgrade it to `toMatchObject` — silencing the alarm this stream exists to protect. | Pin **exhaustiveness** instead: assert `Object.keys(verbs).sort()` equals the table's key set (imported), plus literal `toEqual` on the scalar fields. Cheap per F-12; sound because table-vs-reality is proven independently. |
| **R-02 · Keeping the old fields preserves the exact trap #153 reports** | H-05, F-10 | `'watchdog' in refusedVerbs` is *still* a confident falsehood if the field survives beside a new map; only removal is loud. #153's **body** says keep them as derived views, its **amendment** and the charter's DONE criterion say the payload must be incapable of a stale-correct read. | **Question outstanding to the prime.** Recommendation: remove both fields from `--json` (blast radius is 3 test files, F-10). Human text surface is unaffected either way. |
| **R-03 · A PA may add a `fleet`-scoped chore, creating a duty for every seat** | F-08 | Within the ruling as written, but it is the widest consequence of `chore add` and should be a stated decision rather than a discovered one. | Name it in the plan's spec section; no code change proposed. Escalate only if the prime wants scope narrowed. |
| **R-04 · `watchdog unwatch` writes the target's sidecar even when the PA holds no subscription** | `core/cli.ts:2404-2412`, `:2452` | An exemption reconcile and a rewrite land on a stranger's sidecar file. Content-neutral for the watcher roster, but it is a write to a file the PA does not own. | Verify with a test that a no-op `unwatch` leaves `watchers` byte-identical. Not a blocker. |
| **R-05 · The prime's seat cannot demonstrate the fix** | F-09 | A live proof run on the wrong seat would look like success and prove nothing — the failure mode this whole stream is about. | Acceptance tests construct `pa` descriptors; live verification requested from the prime against `pij-missing-anaconda`. |

## Planning Handoff

- **Preserve**:
  - The `--for` outright refusal and its position *before* the target check (F-04) — it is the reason widening `unwatch` is safe.
  - `attest` / `state-verify` refusals — the ruling calls this the most important refusal in the gate.
  - `paRefusal`'s signature and its fail-**open** on unknown verbs / unresolvable callers; `pa-target.ts`'s fail-**closed** on targets. The opposite polarities are deliberate.
  - `toEqual` strictness at `cli.inbox.integration.test.ts:207` (H-01).
  - The `conditional` arm — an exhaustive map replaces the *lists*, not the three-valued classification.
- **Change carefully**:
  - `paWatchdogRefusal` — the action check must stay ahead of target resolution or `list` will never be reached (F-05); splitting the allow-set per action is the surgical edit.
  - The whoami payload — one producer, but a `toEqual` pin and two other test files assert its shape (F-10, F-11).
  - Anything in the bin (`cli.ts`): **not required** by current evidence (F-01) and off-limits without asking.
- **Likely files/symbols**:
  - `core/orchestration/pa-capability.ts` — `PA_VERB_CLASSIFICATION` rows for `spine-append`, `chore add|update|remove`; `PA_WATCHDOG_CONDITION` text; a per-action condition for `watchdog`.
  - `core/cli.ts` — `paWatchdogRefusal` (~`:2291-2330`), whoami payload (~`:2529-2578`).
  - `core/orchestration/pa-capability.test.ts`, `core/cli.test.ts`, `cli.integration.test.ts` — acceptance + mutation proofs at both seams.
  - `.pi/extensions/pij/cli.inbox.integration.test.ts:207` — one-line additive edit, prime-approved.
  - `docs/how/pij-watchdog.md:87-93` — states the old two-bucket story; will become false.
  - `docs/how/fleet/ledger.md` — F-300 / W-300 / S-300 block.
- **Decisions still required**:
  1. **R-02** — remove the two list fields, or keep them as derived views. *(asked; recommendation on record)*
  2. Whether `watch` (as distinct from `unwatch`) stays target-restricted. **Proposed: yes, unchanged** — the ruling widened only resignation and visibility, and a PA binding itself to a stranger is a new subscription rather than the release of one.
  3. Whether the human text surface should render the map or keep the current `refused:` / `conditional:` lines. **Proposed: keep the text surface behaviour-equivalent** — the machine payload is what #153 is about.
