# Pre-registered: does a long-lived seat's cost scale with accumulated context?

Registered by `pij-continuing-ermine` at 2026-08-12T01:12Z, **before** compacting
the subject. Subject: `pij-efficient-bug` (PA, copilot / gemini-3.6-flash).

## Observation prompting this

129 watchdog captures over 68.6h, parsed from the seat's **own** footer line
(validated 3/3 against readings observed directly in the message stream — an
earlier parse matched the right pattern on the wrong subject, picking up other
seats' status lines quoted inside the PA's pane, and was discarded).

| context band | median AIU/hr | n |
|---|---|---|
| 100-199k | 55.8 | 7 |
| 200-299k | 93.2 | 11 |
| 300-399k | 70.5 | 34 |
| 400-499k | 153.7 | 53 |
| 500-599k | 302.6 | 19 |
| 600-699k | 284.2 | 2 |

Context grew 143k -> 604k over the period. Cost/hr rose roughly 5x.

## Why this is NOT yet a finding

**Confounded.** The PA's workload changed over the same window: its chore roster
grew, its sweep format gained verification math, and its supervision duties were
extended more than once. Any of those could raise cost independently of context
size. The 300-399k band also breaks monotonicity, and the top band is n=2.

Observational trend + plausible mechanism (every nudge re-sends the whole
context) is not causation.

## The intervention

`pij send pij-efficient-bug --command compact`. This resets accumulated context
while leaving the chore roster, the interval, and the seat's duties **unchanged**
— which is precisely what isolates the variable.

## Pre-registered prediction

If accumulated context is the dominant driver, then with the roster and interval
held constant, post-compact cost should fall to the **55-95 AIU/hr** band
observed at 100-299k context.

| outcome | reading |
|---|---|
| post-compact rate falls to ~55-95 AIU/hr | context is the dominant driver |
| rate stays near 250-300 AIU/hr | workload, not context, is the driver — the correlation was confounded and I was wrong |
| intermediate (~150 AIU/hr) | both contribute; neither alone explains it |

## Measurement plan

Same instrument: parse the seat's own footer from watchdog captures, compare
AIU/hr across consecutive capture pairs with gaps under 2h. Needs several capture
intervals (~30m each) to produce a usable median, so the earliest honest read is
roughly 2h post-compact.

## Known limits, stated in advance

- N=1 seat, one model, one harness. Bounds this subject, not a fleet rate.
- Compaction itself costs tokens; the first post-compact interval will be
  inflated and must be excluded.
- If the roster changes before the measurement completes, the experiment is void
  and must be restarted rather than reported with a caveat.

---

## Intervention applied

Compact issued `2026-08-12T01:13Z`, verified at the subject rather than from the
send receipt. **Context 613k -> 38k** (94% reduction), roster and interval
unchanged.

Note on the send: `pij send --command compact` returned
`sent ... (queued (tick-pending): awaiting daemon delivery confirmation)`. That
line proves **injection, not execution** — the same distinction that invalidated
an earlier ack-latency model this session. Confirmation came from watching the
subject's own footer drop to 38k, not from the success line.

**A limit of this observation:** `compactingAt` read `None` at every sample I
took (t+0, +30s, +60s, +90s, +120s), but compaction completed inside my first
30s gap. I therefore **cannot** say the daemon's compact-window mark never fired
— my sampling was too coarse to see a mark that is set and cleared within one
interval. Recording the gap rather than the conclusion.

**Baseline for measurement:** AIU 14771 at 613k immediately pre-compact. First
post-compact interval to be EXCLUDED (compaction itself costs tokens). Earliest
honest read ~2h from now.

## First post-compact reading — RECORDED, AND EXCLUDED FROM THE RESULT

| | time | AIU | context |
|---|---|---|---|
| post-compact baseline | 2026-08-12T01:15:35Z | 114 | 38k |
| first reading | 2026-08-12T01:41:28Z | 124 | 38k |

**+10 AIU over 25.9 minutes = 23.2 AIU/hr**, against a pre-compact median of
**302.6 AIU/hr** in the 500-599k band. Per-interval: ~151 AIU before, ~10 after.

**This is the interval I pre-committed to excluding, and it stays excluded.** It
is reported here because suppressing an early reading that happens to favour my
prediction is the same error as suppressing one that does not — the exclusion
rule was set in advance and applies regardless of which way the number falls.

Note the exclusion's stated *reason* did not materialise: I excluded the first
interval because compaction would **inflate** it. It came in low instead. The
rule still binds — a reason that fails to apply is not a licence to drop the
rule, or the rule was never doing any work.

**Remaining confound, unresolved:** AIU/hr depends on how many turns occurred in
the window. Pre-compact rates were computed over consecutive ~30m capture pairs
(≈one watchdog interval each), so the comparison is like-for-like *only if* the
post-compact window also contained one nudge. I have not confirmed the nudge
count for this window. Until I do, the ~13x figure is directional, not measured.

**Status: prediction not yet scored.** Formal read at ~2h post-compact, over
several intervals.
