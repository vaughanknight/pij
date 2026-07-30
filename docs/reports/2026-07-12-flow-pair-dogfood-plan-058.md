# Field report: pij pair drove a full two-phase feature build — and the system works

**Date:** 2026-07-12
**Run:** `2026-07-12T08-09-15Z-github.com-AI-Substr` (in `AI-Substrate/harness-engineering`, `.flow-pair/runs/…`)
**Orchestrator:** Claude (Fable 5) via `/pij pair`, wrapping the-flow (SDD plan 058)
**Fleet:** coder `pij-zygomorphic-bird` + reviewer `pij-evil-meerkat` — both Copilot CLI, `gpt-5.6-sol`, `xhigh` (user explicitly chose same-model pair over the default cross-model reviewer)
**Workload:** plan 058 "harness retro insights" — a new deterministic CLI verb (`harness retro insights`: tolerant YAML frontmatter reader + clustering/ranking engine + act, ~1,140 LOC of new source + tests) and an eng-harness-flow skill-surface rewrite consuming it.

## Verdict

**The system works.** Two full dispatch → build → review → verify → fix → re-review → accept cycles ran end-to-end on real, non-trivial work. Both review passes returned FIX_REQUIRED with **real, independently-verified defects** — three in Phase 1 code (two HIGH), two in Phase 2 docs (one HIGH) — all fixed by the coder against evidence-pinned fix packets and re-verified before acceptance. Final state: **2311/2311 tests green**, all plan acceptance criteria proven against the live corpus, changeset ready to ship.

The headline proof point: in Phase 2, **the orchestrator's own spot-check missed the HIGH finding and the reviewer caught it** (a retained doc template that demanded values the verb doesn't emit — teaching future agents to fabricate numbers, the exact failure mode the feature exists to prevent). The cross-check is not ceremony; it caught what a single capable agent missed.

## What the pair caught (all verified, all fixed)

### Phase 1 — CLI engine (review packet `dlg-0002-review-packet.md`)

| # | Sev | Defect | Reviewer's proof |
|---|-----|--------|------------------|
| F1 | HIGH | Lifecycle fields (`status`/`first_seen_at`/`resolved_by`) were flattened from *any* nested YAML namespace, so `system.producer.status: encoded` shadowed `system.compound.status: open` — corrupting headline totals, cluster membership, stale flags, and `members[].status` | Built a schema-valid multi-namespace probe record; assertion expecting `open` went RED |
| F2 | HIGH | The ranking comparator collapsed the two-tier proof-gap contract (AC-05: `target > keyword > none` before age) to one boolean, so an older keyword cluster outranked a newer primary-target cluster | Constructed equal-n/equal-severity clusters; actual order `["keyword","target"]` vs required `["target","keyword"]` |
| F3 | MED | Valid inline YAML comments after quoted scalars (`schema_version: "1.2" # current`) were misparsed, silently dropping valid records as malformed | Probe record returned zero parsed records |

The reviewer also ran a **Dimension-0 mutation test** (flipped `b.n - a.n` at `insights.ts:356` → named test went RED → restored, SHA-256 verified identical) proving the authored tests bite, while still failing Dim-0 overall because the three negative cases above were untested. That's exactly the right shape: mutation-proven *and* gap-found.

### Phase 2 — skill surface (review packet `dlg-0003-review-packet.md`)

| # | Sev | Defect | Reviewer's proof |
|---|-----|--------|------------------|
| F1 | HIGH | The retained harvest narration template demanded values the verb does not emit ("across 5 sessions", "re-paid every session", "Recently encoded (last 7 days): 6 entries") — violating the AC-09 restate-never-compute contract | Fresh live shape probe of `harness retro insights --json`; diffed template fields against emitted keys |
| F2 | MED | The durable task context documented a nonexistent envelope shape (`data.totals` etc. instead of `data.sections.totals`) | Compared against the live/source contract |

## The orchestration discipline held (trust-but-verify, both directions)

- **Coder's "done" → verified honest.** The orchestrator re-ran suites and probed the live envelope independently before routing to review, both phases.
- **Reviewer's "broken" → verified correct, five for five.** Every finding was independently reproduced by the orchestrator before a fix packet was cut — including an independent orchestrator-run mutation on the F2 fix test confirming it bites.
- **Scope containment worked.** The Phase 1 coder hit an out-of-scope wall (registering the new command broke two command-list test assertions) and **raised it as a blocker instead of drifting**; the orchestrator verified the claim in source and granted a narrow, explicit scope extension. Phase 2's packet hard-forbade CLI paths and the coder stayed inside them.
- **Protocol invariants observed:** pointer delivery (packets on disk, `pij send` carried paths), forbidden paths enumerated in every packet (`the-flow.*`, `.flow-pair/`, `.harness/records/`), persist-before-mutate (roster written before spawn-dependent state; roster survives teardown with canary evidence recorded), ownership-aware teardown (both spawned peers closed by their owner at the end), push-not-poll throughout.

## Post-hoc independent audit (this report's own re-verification, 2026-07-12)

Run fresh, after fleet teardown, by the orchestrator:

- **Full suite:** 183 files, **2311/2311 pass** (including 25 plan-058 tests with the negative cases from all three Phase 1 findings).
- **Determinism (AC-03):** two live runs byte-equivalent after stripping `generated_at`/timestamp — PASS.
- **Read-only (AC-07):** SHA-256 over the entire retro corpus identical before/after a live run (`17661cee…`) — PASS.
- **Provenance (AC-01):** `members.length === n` for all 10 emitted clusters — PASS.
- **Internal consistency:** status counts and kind counts each sum exactly to 182 entries — PASS.
- **Epistemics contract:** every emitted row carries `n` + `caveat`; `makeRow` throws on violation (enforced in code, not convention) — PASS.
- **Fix verification in source:** lifecycle fields now bind only at `system.compound` depth (legacy top-level as explicit fallback); `proofGapRank` ranks `target=2 > keyword=1 > none=0` before age; comment stripping is quote-aware.
- **Skill contract:** `rg 'compound-value' skills/` → zero matches (AC-11); routing diff `8 insertions, 0 deletions` with route-never-redirect on non-empty buffer (AC-10); every value in the reconciled harvest template maps to an emitted field (AC-09).
- **Live output on the real corpus:** 33 records · 182 entries · 21 plans · 9 agents · open:encoded **133:23** · top cluster `[difficulty/(none)] 12 open` — the compounding-value dashboard the feature was built to produce, computed in sub-second, zero LLM tokens.

## Friction observed (honest ledger — this is what a dogfood is for)

1. **`--phase` dispatch requires a byte-exact heading** (including backticks) and errors with "section not found" *without listing available sections*. Cost one retry; captured as a harness observation in the host repo.
2. **Delegation/run ledger lifecycle doesn't advance:** `dlg-0001`/`dlg-0002` statuses remained `"pending"` through completion and `run.json` stayed `"open"` after teardown; `events.jsonl` recorded only the first dispatch's events (later dispatches, reviews, and fix packets exist on disk but emitted no events); `worker-reports/`, `learnings/`, `fix-packets/`, `diffs/` stayed empty while their content landed under `prompts/`/`reviews/`. The artifacts are all there — the *ledger metadata* around them is stale. Reconstruction for this report was still easy, but a `flow-pair status` over these files would currently lie.
3. **A duplicate delegation record** (`dlg-0001` and `dlg-0002` carry the identical Phase 1 taskRef; the first was superseded seconds later, presumably a packet-creation retry) — harmless, but it's noise a status view would need to dedupe.
4. **Fix ceremony is heavier than dispatch** — each FIX_REQUIRED needed a hand-authored fix packet with re-stated allowed/forbidden paths. It worked well (evidence-pinned packets produced exact fixes, zero drift), but it's the least-automated seam in the loop.

None of these blocked the run or compromised the result; items 2–3 are the concrete follow-up candidates for pij/flow-pair itself.

## Bottom line

A same-model coder/reviewer pair, orchestrated through `/pij pair` over the-flow, shipped a two-phase feature with **five real defects caught and fixed before merge** — two of which (status corruption, fabricated-numbers template) would have silently undermined the very trust guarantees the feature exists to provide. The orchestrator independently verified every claim in both directions and the final artifact passes every acceptance criterion against live data. The review layer caught a defect the orchestrator missed. That is the system working as designed.

---
*Evidence trail (host repo `AI-Substrate/harness-engineering`): `.flow-pair/runs/2026-07-12T08-09-15Z-github.com-AI-Substr/{roster.json, run.json, events.jsonl, delegations/, prompts/dlg-000{2,3}{,-fix}.md, reviews/}` · `scratch/plan-058-phase-{1,2}-review-pij-evil-meerkat.md` · `docs/plans/058-harness-retro-insights/` (plan v1.1.0, tasks, execution logs).*

## Addendum (same day): blind cross-model conformance test — PASS

After the pair run, a second experiment via `/pij skill`: a **fresh copilot peer** (`pij-industrial-tuna`, `gpt-5.6-sol`, requested effort `high` — note: unsupported tier for this model, copilot clamped it; pij warned at spawn) was given **only** the invocation "invoke your eng-harness-flow skill with `at=insights`, follow it exactly" — zero session context, no envelope shape, no expected numbers. It ran in the same repo using only the deployed skill.

Result, verified mechanically against a fresh envelope:

- **Every number, timestamp, rank, flag, and path in its narration maps to an emitted field. Zero fabrications.** All 10 clusters exact (order, n, records, agents, severity, proof-gap signal incl. the `keyword`/`target` tier, `repeatedly_deferred`, first-seen to the millisecond); all 52 stale rows present (52 emitted / 52 narrated); source diagnostics (35 scanned / 33 parsed / 15 malformed-skipped) exact; disposition mix reproduced *including the verb's folded low-n aggregate* ("other: 3, 2 folded rows below n=5") rather than recomputing the raw counts.
- **Routing conformance live:** with 6 pending buffer entries it printed the drain advisory and proceeded — route, never redirect (AC-10 observed in the wild, not just in the doc).
- **The deterministic/LLM split held blind:** its one judgment call (naming `difficulty/tooling` as the highest-leverage encoding candidate, route `command`) cited only emitted values (10 records, 5 agents, degrading, proof gap) as grounds.

Operational catch worth recording: before the test, the deployed skill store was **stale** — the pair's fix-round template edits had never been redeployed after T105. The orchestrator caught the drift by diffing repo vs `~/.agents/skills` and redeployed (`just install-skills-global`) before spawning; the blind test would otherwise have exercised the pre-fix skill. (This is the known deploy-lag class the repo's `check:doctrine-parity` warns about — the dogfood confirms the warning is earning its keep.)

Two independent implementations of "narrate the harvest" — the pair's orchestrator and a blind cross-vendor peer — produced numerically identical reports from the same deterministic verb. That is the epistemics contract working end to end.
