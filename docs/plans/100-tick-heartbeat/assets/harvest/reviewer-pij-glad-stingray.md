# Harvest — `pij-glad-stingray` (reviewer, copilot · gpt-5.6-terra · high)

Verbatim answer to *"what did you consider and discard?"*, asked before close-out.
Twelve review rounds on s100 Phase 2.

---

## 1. Marker protocol / concurrent-prune theory (already-merged at the time)

- Initially accepted the marker-file design as plausible, then found its shared-map version had a
  real non-commuting prune race. That led to the per-prune marker version, **tested rather than
  trusted on the structural claim**.
- Discarded the claim that timestamped marker suppression was safe merely because `tickAt` was
  sampled before `registry.list()`. The adverse interleaving: tick snapshots an old incarnation at
  T0; dissolve + marker write at T1; tick publishes old snapshot with `tickAt=T0`. More importantly,
  **NTP/backward clock movement falsified the one-machine-one-clock premise** — not a patchable
  confidence issue, it made safety depend on an unstated clock property.
- **Considered reporting the fixed temporary filename as a durability/concurrency defect and did
  not**, because after following its actual role no durability requirement could be established.
  *"This is the exact case where I decided the parent's framing could be importing a requirement
  absent from the path."*

## 2. Concurrency testing: what was NOT accepted as proof

- Nearly accepted that sequential execution of two prunes was a deterministic substitute for a
  damaging concurrent interleaving. Retained only the narrower result: once `forget` stopped
  mutating shared state, independently named marker writes commute. **Did not report a generic
  "concurrency test adequate" conclusion**, which would have rested on a structural argument rather
  than an observed scheduling proof.
- Checked the `rmdir` simplification after the coder removed an emptiness guard, and **did not
  escalate**: `rmdirSync`/POSIX rejects a non-empty directory atomically, so a preceding emptiness
  check would add **TOCTOU risk rather than safety**.

## 3. Lifecycle / incarnation alternatives measured dead or rejected

- Entertained pid-style incarnation identity. **Measured dead**: sendkeys seats retain `pane_pid`
  across kill/relaunch. Did not propose reviving it under a new spelling.
- Briefly accepted *"revive is the only terminal→live funnel"*. **False**: `publish()` can write an
  archived failed descriptor live, because the tombstone guard rejects `dissolved` only.
- Considered treating all lifecycle-absent legacy records as terminal to simplify the predicate.
  **Dropped**: ordinary legacy state updates are not new incarnations; that would erase valid
  same-incarnation stamp retention.
- Examined whether terminal→terminal over-drop should be a P1. The repair premise was falsified by
  `executeAgentReport`'s failed→failed write with no daemon running. **Did not make it a blocker**
  once the code explicitly priced the residual.

## 4. Scrub / read coverage candidates not overstated

- Rejected the early thought that scrubbing only durable writes would suffice — `read()` could
  return stale stamps through both hot-dissolved and archive-fallback exits (became P1e).
- **Did not manufacture an isolated criterion** for `unarchive`'s deleted-marker site: the public
  surface exercises it only as part of the composite lifecycle route, and *"describing that
  composite coverage honestly was stronger than pretending it proved each private line
  independently."*
- Considered whether failed-seat behaviour was a pre-existing bug. **Did not request an unrelated
  semantic change**: pre-change tombstone behaviour had the same dissolved-only boundary.

## 5. Mutation work that was NOT evidence

- Disregarded a broken mutant whose inserted `rmdirSync` had no import — its `ReferenceError` was
  caught by the mutant's own `catch`, so the runner's equivalent/unreachable result said nothing
  about the hypothesis.
- Did not accept *"M31 survived"* as equivalent: the remaining distinction was a **pre-lifecycle
  archived descriptor**, where `isTerminalRecord` is false.
- Did not report mutation results as proof where a removal mutant could only show the old behaviour
  was needed, not that the replacement was correct — **AC-07 was structurally blind exactly that
  way**.
- **Documentation-only rounds got no mutation reruns.** Discarded the idea that unchanged kill sets
  proved the wording correct: *"they demonstrate behavioural non-change, not claim truth."* Verified
  the claims directly at `daemon.ts:1186-1192` and `core/receipts.ts:26-39` instead.

## 6. The largest discarded belief: "a future heartbeat repairs this"

- At first accepted *"the next ~600ms tick rebuilds the stamp"* when reviewing the no-fsync
  rationale. Wrong: `runDaemon()` registers `setInterval`; it schedules callbacks but guarantees
  none, bounds no delay, and recovers nothing after a stop/crash.
- Particularly misleading where the daemon both wrote a tick and then spawn-bound a seat later in
  the **same** tick — the bind deletes the entry created moments earlier. **Discarded any
  "co-location means repair" inference: same writer and potential repairer is not a guaranteed
  repairer.**

## 7. Documentation-audit approaches discarded

- Discarded **filename enumeration from memory** after it missed the dossier.
- Then discarded the belief that a **derived scope made a literal grep audit complete** — a
  hand-written `600ms` missed `600 ms`. **Scope completeness and pattern completeness are
  independent.**
- Discarded **"age predicts truth"** — useful only as a search-order heuristic.
- **Stopped treating authorship as the boundary for correction.** The durable boundary is
  **artifact role**: correct a live rationale; annotate a dispatched historical record; preserve a
  chronological record that contains its own later falsification.
- Did not report candidate wording merely for containing "next tick"/"600 ms"/"rebuild" — read it
  against the semantic predicate **does it assert a tick WILL run?**

## 8. Out-of-scope / deliberately unmodified

- Did not alter scheduler behaviour, add a durability barrier, or propose `fsync`.
- Did not make `read`/`list` exclude failed seats — parity with dissolved-only was intentional.
- Did not rewrite dispatch records' original false sentences; preservation plus adjacent correction
  was more truthful and more useful to a later auditor.
- Noticed that **formal review success had been poor evidence of the rationale's truth** — several
  correct code validations still let the repair assertion survive. Treated as a process finding.

## 9. What was chosen NOT to be a separate finding

- No surviving path justified re-opening the deleted marker protocol; **continuing to search
  marker-specific races after deletion would have been theatre.**
- No deployment evidence required cross-machine clocks after marker deletion, so **the `ASSUMES`
  warning was not retained just because it had once mattered**.
- After the final semantic/artifact-role sweep, no remaining active unconditional repair claim.

## Harness gift

A review-audit template requiring: **(a)** scope derived mechanically, **(b)** literal searches
treated **only as candidate generators**, **(c)** a stated semantic predicate read against every
candidate, **(d)** artifact-role classification before editing. Recorded at
`.harness/records/retro/2026-08-08/008.md` — *"the one improvement I would encode over adding more
prose warnings."*
