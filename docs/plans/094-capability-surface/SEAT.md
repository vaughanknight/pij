# Stream s094 — `capability-surface` — seat record

Recorded so this stream is revivable: a merged PR without the seat that holds the
reasoning behind it is an answer with no way back to the argument.

| | |
|---|---|
| **Seat id** | `pij-shaggy-lark` |
| **Harness** | copilot (`claude-opus-5`, effort high) |
| **Role** | PM, stream `capability-surface`, wave `w1-hardening` |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `/Users/jordanknight/pi-hacking/pij-worktrees/s094-capability-surface` |
| **Branch** | `s094/capability-surface` |
| **PR** | [#199](https://github.com/AI-Substrate/pij/pull/199), merged 2026-08-08T06:34:58Z as `752fd2c` |
| **Charter** | `~/.pij/pij-continuing-ermine/briefs/00-fleet-onboarding.md` + the stream charter relayed inline |
| **Issues** | [#102](https://github.com/AI-Substrate/pij/issues/102) (widen the PA gate), [#153](https://github.com/AI-Substrate/pij/issues/153) (exhaustive verbs map) — both closed, verified individually |
| **Ledger block** | `F-300`–`F-310`, `W-300`–`W-301`, `S-300`–`S-302` in `docs/how/fleet/ledger/s094-capability-surface.md` |
| **Fleet peers** | coder `pij-innocent-veppers` (copilot `claude-opus-5`) · reviewer `pij-temporary-aphid` (copilot `gpt-5.6-terra`) |

## Corrections this stream made to its own record — read these first

**Three claims in this stream's artifacts were stated and later falsified by measurement.** They
are listed here rather than only in the findings because someone arriving cold at a merged PR
reads the seat record first, and a framing known to be wrong will otherwise be re-derived.

1. **`watchdog status` was in the widening and is not.** It was added on the argument that
   refusing a single-seat read while permitting the all-seat read that contains it is incoherent.
   Independent validation measured that `status` is **not a pure read at that seam** — it falls
   through to the same preamble that reconciles and persists the target's sidecar. Dropped.
2. **Adversarial mutation A4 was an *unreachable mutant*, not a demonstrated vacuity.** The
   execution log's first version said the opposite, and this seat relayed that reading upward
   before withdrawing it. Post-fix the self-resign path skips reconciliation **by construction** —
   that *is* the fix — so neutering `reconcileWatchdogExemption` is unreachable from those four
   cases, their staying green is correct, and **a red there would have meant the fix had failed.**
   The four isolation cases are sound and were never weakened.
3. **`AC-04b` is `MUTATION-ONLY`, not `BEHAVIOURAL`.** Pre-fix, a PA's third-party `unwatch` is
   *refused and never executes*, so the claim has no pre-fix form at all — which is exactly why
   its pre-fix red could only ever fire on `exitCode === 0`. Its proof is mutation 13, never a red.

## What this stream shipped

**#102 — the gate's governing test changed, not just its flags.** The PA capability boundary was
built on an **authority** model (refuse verbs that bear authority). Jordan ruled it replaced with a
**harm** model on two axes: *recording vs deciding* (a PA may observe, classify, count, diff, cite
and **record** — it may not **conclude**, verify, attest or rule) and *reversible vs terminal*.
Widened: `spine-append`, `chore add|update|remove`, `watchdog list`, `watchdog unwatch`
(self-resignation). Held: `close`, `spawn`, `task-close`, `attest`, `state-verify`, `orchestration`.

**#153 — the capability payload can no longer be read correctly-but-stalely.** `refusedVerbs` and
`conditionalVerbs` are **removed** — not deprecated — and replaced by a total three-valued `verbs`
map plus `capabilitySchema: 2`. Keeping them as derived views would have been an *additive* change,
which is the precise thing #153 identifies as silent to a stale consumer.

## The hypothesis this stream disproved

> **"Widening a verb is safe once the verb's classification and its target rule are both correct."**

False, and it nearly shipped. `pij watchdog <action> <target>` runs a **shared preamble** before
reaching its own branch: `core/cli.ts` reads the **target's** sidecar, reconciles it, and
**persists** the result. On an expired exemption that resolves through `withoutPause`
(`watchdog.ts:88-103`), that preamble **un-pauses the watchdog of the target seat**. So permitting a
PA `watchdog unwatch <stranger>` — a grant that is correct on both harm axes, since a PA can only
ever remove its own watcher row — would have introduced a **supervision-policy change for a third
party**, through code with nothing to do with watchers.

> **A capability gate that reasons about VERBS cannot see side effects that live in SHARED CODE
> PATHS.** `PA_VERB_CLASSIFICATION` answers *may this role run this verb* and has zero visibility
> into what a verb's handler does before reaching its own logic. **Every widening needs the code
> path audited, not just the verb classified — and nothing in the gate's structure prompts that.**

The fix returns before that preamble, removes only the caller's row, and writes nothing when that
row is absent. Recorded on #102 so the ruling record carries the constraint.

## Findings that outlived the stream

- **A pre-fix RED on a multi-assertion test only proves the FIRST assertion that fired.** `expect()`
  throws, so everything after it never ran. Measured: four criteria went red pre-fix on
  `exitCode === 0` and said nothing about the fixture they existed to exercise. Adopted fleet-wide;
  the label taxonomy and the *one criterion, one claim, one observable* rule descend from it.
- **`close` proves the gate FIRES; it cannot prove the gate is consulted PER SUBVERB.** Only a
  mutation distinguishes those. The strongest available form carried the mutant's **own invented
  refusal string** out through the real bin in a subprocess — a string nobody could have hard-coded,
  travelling the full path, which no fixture can fake.
- **A mitigation guarding the wrong field is indistinguishable from a mitigation** (`F-300`). Three
  instances on one stream: wrong field, wrong branch, wrong mutation. The fleet's other shapes ask
  *can this test fail?*; this asks *can it fail for the reason I think it can?*
- **`mutate.mjs` reported a PASS for the wrong red** on subprocess specs, an unrelated flake
  supplying the evidence. Fixed upstream; the follow-on correction (invalidation is **per-test**,
  not per-file) spared five streams an unnecessary re-run.

## Revival notes

- The plan (`docs/plans/094-capability-surface/capability-surface-plan.md`) carries mandatory gates
  a successor must honour: the **pre-fix RED gate**, the **post-rebase re-proof gate**, and the
  close-out contract. The re-proof gate is not ceremony — it fired twice for real on this stream,
  once when `main` changed the **inside** of `paBinRefusal` without touching a line this stream owned.
- **The exhaustiveness pin is blind to the table *shrinking*** (the payload is generated from the
  table, so both sides move together). The only table→reality proof is the scrape in
  `pa-capability.test.ts`, and a comment there names the pin that depends on it. **Do not delete
  those scrapes as redundant.**
- The `#153` residual is unfixable by payload shape and is stated rather than solved: a consumer
  doing `get('refusedVerbs', [])` now reads `[]` as *"nothing is refused"* — silent and permissive.
