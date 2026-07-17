# P2 review 001 — cold cross-model review (cycle 1)

VERDICT: APPROVE

**Reviewer**: pij-immense-antelope (cold, cross-model — reviewed P1 verdicts 001–006) ·
**Date**: 2026-07-17 · **Range**: `7f15f9f..47dea9b` (9 commits) ·
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`

Phase 2 (Node truth) is sound and ships. Every §P2 AC is met honestly, the widened
recovery adjudication is proven forge-free and false-block-free on the **real** fs
adapters (not just the coder's fakes), `daemon.ts` is strictly additive (SW-6 clean),
the P1 J1/K1 contract holds green, and all nine coder rulings (a–i) are **sound**.
No CRITICAL/HIGH/MED code defect. Three non-blocking observations are recorded below
(one MED enforcement-gap, two LOW), each with the smallest fix — none blocks APPROVE.

Findings survive my own disprove attempt; the recovery adjudication was re-attacked with
four independent real-fs crash-window probes (§Probes).

---

## Gates (run this cycle)

- `just typecheck` → **clean** (tsc --noEmit exit 0).
- Fenced `npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters` →
  **1906 passed / 7 skipped**, 0 failed (matches the coder's 1905/7 ±1; green).
- `.pi/extensions/pij/daemon-push.test.ts` (the T012 full-suite defect surface, outside
  the fenced run) → **21/21 green** — the lazy FsSpineLog construction fix holds.
- Baseline flake `harness/scripts/release-age-policy.test.ts` — out of scope, not exercised.

## Fence + SW-6 (dimension 6)

- `git diff --name-only 7f15f9f..47dea9b`: all 41 paths ∈ `{.pi/extensions/pij/**,
  docs/plans/054-pij-grown-up/tasks/phase-2-node-truth/**}` — **in-fence**, matches the
  coder-packet allowed-writes.
- **`daemon.ts` is ADDITIVE ONLY** — the full diff has **zero `-` lines**: imports inserted
  into the existing sorted block, four new fields, three new tick() insertions
  (windowId backfill, lazy runtime-axis construct+tick, anomaly sweep). No move,
  reformat, or refactor of any existing line. SW-6 satisfied — **no HIGH finding**.
- New paths all checkpoint-notified (T012 fence audit): `core/types.test.ts`,
  `adapters/tmux.test.ts`, `core/context/{gauge,gauge.test}.ts`,
  `adapters/context-reader{,.test}.ts`, `core/daemon/{runtime-axis,anomaly-sweep}{,.test}.ts`,
  `core/anomalies{,.test}.ts`.

## Plan conformance (dimension 1)

| AC | Verdict | Evidence |
|----|---------|----------|
| **AC-04** starting/stopped/unknown honest, never inferred idle/dead | ✅ | `state.ts:85` `systemStateOf` precedence dead→stopped→starting(hold)→unknown(no pid)→stalled/working→idle→unknown; `spawn.ts:366` stamps `systemState:"starting"` at birth; unknown carries `reason:missing-pid-probe`/`missing-telemetry` refs (`runtime-axis.ts:140`). No heuristic branch. |
| **AC-05** task set → assignment; state set --assignment; implicit general; worst-first badge | ✅ | `cli.ts` task-set (1974), state-set (2072) w/ `materializeGeneralIfMissing`; `badgeOf` over open assignments (`state.ts:155`); WS-6 vocab enforced (`isSemanticState` gate, cli.ts:~800). |
| **AC-06** unverified done renders unverified; verify flips | ✅ | `chainStateOf` verified iff a later state-verified exists (`anomalies.ts:88`); node show renders `(UNVERIFIED)` (cli.ts:2341); `state verify` requires chain-latest done else E-ARG (cli.ts:2204). |
| **AC-07** axis-disagreement + unverified-done + foreign-hold-clear; once-per-transition alert, act never | ✅ | `detectAnomalies` (anomalies.ts:111); 44h shape = open + semantic-active + system idle > threshold; `AnomalySweep` evidence-keyed latch, deliver to effectiveParent, `act never` (anomaly-sweep.ts). |
| **AC-09** node show full card + gauges + windowId proof | ✅ | node-show card (cli.ts:2293) both axes/badge/assignments/pane+window/model/contextMax(join)/contextCurrent; `parsePaneAndWindow` (tmux.ts:44); FakeTmux `windowOf` is the `select-window -t` proof (fakes.ts). |
| **AC-11** legacy descriptor round-trips; suite green | ✅ | all 7 descriptor fields optional (`types.ts:240`); fs-registry pass-through pins; legacy `pij state <id>` regression intact (cli.test.ts:3137). |

## Correctness of the new machinery (dimension 2)

- **Widened recovery adjudication** (`journal.ts`) — the crux. `recoverPendingOps` now takes
  the assignment store (port-first, T005). Assignment INTENT ops adjudicate exactly like
  project intents keyed on `assignment:<id>` + `canonicalAssignmentJson`
  (`resolveAssignmentIntent`, journal.ts:180): record===next ⇒ replay; absent+creation-shaped
  (no prev) ⇒ discard; absent+prev-present ⇒ block (store divergence); ===prev ⇒ discard; else
  block. Assignment COMMITTED ops are COUPLED — `resolveCommitted` (journal.ts:263) replays
  **only** when store canonical===next, else BLOCKS refusing to forge (the J1 extension). The
  once-record path can no longer bless an assignment event whose record publish never survived.
  **Independently corroborated on real adapters — §Probes A/B/D.**
- **`states[]` exclusion is safe** (ruling a). `state-set`/`state-verify` never mutate a
  canonical field (they only append a log-derived seq to `states[]`, cli.ts:2136/2251), so
  prev===next for state ops — a *vacuous* discriminator. Soundness rests instead on the keyed
  `appendOnce` + idempotent `states[]` reconcile in `replayAssignment` (journal.ts:210):
  replay-to-existing carries the ORIGINAL seq, so no crash cut can duplicate or lose a chain
  entry. Proven idempotent — §Probe C. There is nothing to forge because the record's *authored*
  fields don't change on a state transition; the spine event is the truth.
- **RuntimeAxisTracker** (`runtime-axis.ts`) — mechanical truth written first (line 87, never
  gated on the spine); V-05 append is UNCOUPLED under lock+recovery gate; the **latch flips
  only after a successful append** (line 93) — append/lock/recovery failure skips honestly, logs
  once per outage (`skipLogged`), retries next tick → no lost V-05 event, no spam. Restart latch
  re-seeds from `descriptor.systemState` (line 84) → no phantom re-append; a transition missed
  while down still appends. Verdicts are honest-`unknown` with provenance.
- **AnomalySweep** (`anomaly-sweep.ts`) — evidence-keyed once-per-transition latch
  (`latchKeyOf` = kind:assignment:evidence-seqs); repeat ticks → 0 alerts, fresh evidence
  re-alerts; parentless root latches without delivery (no stale replay on later link); alert-only.
- **Context readers** — honest-unknown throughout (`context-reader.ts`): every miss returns
  `{value:"unknown", provenance}`; copilot always unknown; no estimate anywhere. Pure parsers in
  `core/context/gauge.ts` (fs/process-free), impure file-choice in `adapters/`.
- **windowId parse degradation** — `parsePaneAndWindow` (tmux.ts:44): pane id load-bearing
  (null still fails the spawn), malformed window id degrades to paneId-only; daemon backfill
  (`loop.ts:202`, self-latching, `@\d+` validated) retries. Addressability never fails a spawn.

## Coder rulings a–i (dimension 3) — all SOUND

- **(a) `canonicalAssignmentJson` excludes `states[]`** — **SOUND**. `states[]` entries are seqs
  minted only inside SpineLogPort at append, so including them makes prev/next uncomputable
  before the append AND diverges the record from `next` on the in-window index update. Exclusion
  is load-bearing for corroboration; the semantic transition rides `state:<word>` structured refs.
  The deviation from the packet's "prev/next semantic values" phrasing is correctly resolved
  toward adjudication soundness. Probes A–D confirm no forge / no false-block / idempotent reconcile.
- **(b) codex gauge reads `last_token_usage`, not `total_token_usage`** — **SOUND**.
  `total_token_usage` is cumulative (the live 72M-against-258k evidence) → a gauge from it would
  exceed the window and lie. `last_token_usage.input+output` of the newest non-zero line is the
  honest current occupancy (gauge.ts:78; zero tails skipped as post-compaction echoes).
- **(c) pi gauge reads the node's `events.ndjson` while T008 keeps it OUT of the public contract**
  — **SOUND**. Reading a file as an *internal data source* ≠ *exposing its schema* as a public
  contract; the public contract is the `ContextGauge` output. An in-process PiRuntimePort cannot
  serve the cross-process `pij node show` (dead API). Source-internal vs contract-exposed is sound.
- **(d) `SPINE_KIND_SYSTEM_STATE = "system-state"`** — **SOUND**. Consistent with the other kind
  constants, clear, lowercase-hyphenated. Caveat (already flagged by the coder): it's a new
  cross-stream contract string s055 consumes by exact name — the promised P2-complete seam re-sync
  with dove must confirm the byte-exact value.
- **(e) T008 residual: daemon crash between descriptor write and event append drops one telemetry
  event** — **SOUND**. The descriptor is the axis TRUTH (persisted first, merge-law safe); V-05
  events are telemetry, not coupled writes; the restart latch seeds from disk. Anomaly *detection*
  reads `descriptor.systemState`+`lastEventAt`, not the spine event, so a dropped event leaves
  detection intact — only an audit-trail evidence ref can be sparse. Honest, bounded, documented.
- **(f) no `VALUED_FLAG_OVERRIDES` rows needed** — **SOUND**. `--project/--assignment/--refs` are
  absent from `BOOLEAN_FLAGS`, so the lexer values them by default; the valence trap only bites
  globally-boolean flags. Verified in parse (cli.ts:~455 ALLOWED_FLAGS + the bare-flag E-ARG
  guards). Correctly logged as the check the dossier asked for.
- **(g) windowId added to `MUTABLE_EXTERNALLY_OWNED_FIELDS` (4th field)** — **SOUND**. Stamped by
  spawn/adopt externally to the daemon's tick snapshot (same Finding-04 clobber shape); the
  daemon's own backfill only writes it where absent and via writeMerged, so merge-law and backfill
  never fight (loop.ts:151/202).
- **(h) T011 tombstone residual DOCUMENTED, not capped** — **SOUND**, and matches my own cycle-6
  P1 verdict verbatim: compaction-as-sketched is a no-op where dir-fsync works (the sweep already
  empties the sweepable set every `pending()` pass), and any Windows cap (age/count) discards
  evidence without a durability proof → reopens K1's forge/false-block, which the packet forbids.
  Documented residual is the only sound branch. `op-journal.ts` change is **comment-only** (J1/K1
  logic untouched — verified; pins green).
- **(i) daemon FsSpineLog constructor made lazy/fault-honest** — **SOUND**. FsSpineLog eagerly
  mkdirs; a synthetic-home fixture can't create it. Lazy construction on first tick with
  try/catch → passes disable for the run with ONE honest log line, legacy daemon behavior
  untouched, confined to the coder's own additive block (no s055 surface). daemon-push 21/21 green.

## House conventions + regression (dimension 4)

- `types.ts` **zero-import law** intact (guards duplicate own-property helpers privately;
  `Object.hasOwn` used, types.ts:113). Own-property guards on `isContextGauge`.
- `MUTABLE_EXTERNALLY_OWNED_FIELDS` gains the three denorms + windowId; `systemState` deliberately
  **OUT** (daemon-owned, WS-5) — correct.
- **No-throw dispatch** preserved (Results everywhere; try/catch backstops in dispatch + daemon
  passes only). **temp PIJ_HOME** law honored (new suites mkdtemp).
- `fakes.ts` append-only (FakeTmux windowId join + `windowOf`); `cli.test.ts` legacy `state <id>`
  block frozen (only change = one import merged into `{ Assignment, SpineEventDraft }`).
- **P1 J1/K1 pins green** (fenced suite + §Probes); `op-journal.ts` comment-only.

## Test quality (dimension 5)

Pins prove the claims: `journal.test.ts:711+` carries the full assignment fault matrix
(intent replay/discard, missing-record block, unadjudicable block, committed canonical===next
replay, **the J1 forge — committed task-set with lost record publish blocks even with a
once-record**, idempotent states[] reconcile); latch pins in `runtime-axis.test.ts` /
`anomaly-sweep.test.ts`; the 44h shape and AC-11 round-trip are pinned. I re-derived the
highest-value cases on real adapters (§Probes) rather than trusting the fakes — they hold.

## Phase 3 exposure (dimension 7)

`effectiveParent = parentId ?? spawnedBy` is reused consistently (tree.ts) for anomaly delivery
and node-show `parent`; `spawnedBy` is preserved as immutable provenance distinct from the
governing `parentId` (node-show surfaces both, cli.ts:2297–2298). Adequately guarded for the
tree/adoption phase; no parent-capture hazard introduced here.

## Probes (independent real-fs corroboration of the widened recovery)

Standalone `tsx` against the real `FsAssignmentStore`/`FsSpineLog`/`FsOpJournal` in temp homes
(script removed after running):

- **A — committed `task-set`, record publish LOST, event never on spine** → `recoverPendingOps`
  **BLOCKED (E-NOREG)**, spine stayed EMPTY. The J1 forge is dead for assignment ops on real fs.
- **B — committed `task-set`, record===next, event not yet appended** → **REPLAYED**, exactly one
  `task-set` on the spine. No false-block of a faithful committed op.
- **C — `state-set` intent (prev===next), record present, crash before append** → **REPLAYED**,
  the stamped seq reconciled into `states[]`; a second recovery pass did **not** duplicate it
  (idempotent). Confirms the states[]-exclusion design.
- **D — committed `state-set` materializing general, general record write LOST** → **BLOCKED
  (E-NOREG)**, spine EMPTY. No forge of a state event over an assignment that never landed.

## Non-blocking observations (do NOT block APPROVE)

1. **MED (enforcement gap, not a code defect)** — `core/context/gauge.ts` is currently pure, but
   the purity sensor `core/platform/boundary.test.ts` scans **only `core/platform/**`**, so the
   dossier-stated invariant "core/context keeps pure logic + port types only" (tasks.md §Domain
   constraints) is **unenforced**. A future edit adding `node:fs`/`process` to `gauge.ts` would
   pass CI. *Smallest fix*: extend the boundary sensor's scan roots (or add a sibling `describe`)
   to also cover `core/context/**` with the same forbidden-family + global-`process` check.
   Recommend folding into P2 cleanup or P3.
2. **LOW (self-healing race)** — `denormDescriptor` (cli.ts:1673) uses a raw
   `registry.read`→`registry.write` (the established binding/planLink pattern, cli.ts:1578/1312),
   not `writeMerged`. A daemon `systemState` write landing in the microsecond read→write window
   could be reverted to a stale value. It self-heals on the next daemon tick (verdict recomputed,
   writeMerged re-applies) with **no** spurious V-05 event (latch already advanced), so the effect
   is a transient wrong badge at most. Consistent with the pre-existing CLI write pattern; note only.
3. **LOW (trivial)** — `codexContextFromRollout` (gauge.ts:78) returns `{used, contextWindow?}`
   but the adapter consumes only `.used` (context-reader.ts:60); the rollout-reported
   `model_context_window` is dead output (contextMax comes from the models.json join per AC-09).
   Drop the field or wire it as a fallback max. Cosmetic.

---

**Whole-of-P2 attestation**: AC-04/05/06/07/09/11 met; recovery corroboration proven forge-free
and false-block-free on real adapters; daemon.ts additive (SW-6 clean); J1/K1/legacy green; nine
rulings sound. **APPROVE.**
