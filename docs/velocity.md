# Velocity log

Wall-clock per phase. **Goal: each successive extension is faster than the
last.** If it isn't, the harness has a leak.

Compounding is judged against the v1 build wall-clock baseline captured
below — **not** against any fixed minute target. Earlier "<6 min", "<30
min" thresholds were unmeasured intuition (see spec § Clarifications
session 2026-05-09b); they have been replaced with measurement-anchored
hypotheses.

| Phase | Date | Duration | Output | Notes |
|-------|------|----------|--------|-------|
| 0 — fs2 multi-graph wiring | 2026-05-09 | ~5 min | `pi-mono` graph queryable from pij | one-time |
| 1 — research (8 parallel agents + synthesis) | 2026-05-09 | ~60 min | dossier + 8 findings + 2 external | one-time |
| 2 — workshops 001+002 | 2026-05-09 | ~30 min | distribution + dev-loop refs | |
| 3 — workshop 003 (T1 → T2) | 2026-05-09 | ~50 min | `scratch` design + P1–P10 | |
| 4 — workshop 004 (harness charter) | 2026-05-09 | ~50 min | full harness scaffolds + 1244-line design doc | |
| 4b — spec + plan + clarify + validate (002-pij-harness) | 2026-05-09 | ~90 min | clarified spec, lean plan, flight plan, validation record | meta — harness-of-the-harness |
| 5 — build the harness (Phase 1–6 of 002-pij-harness) | 2026-05-09 | ~25 min wall-clock (single agent session, with code-review-companion in parallel) | working `npm run new`, smoke, ledgers, CI | **v1 baseline measured** — full self-check ~6 s post-build; full Phase 1→6 elapsed (Phase 0 baseline → v0.1.0 tag) is the comparator for AC-15 |
| 6 — extension #2 (`scratch`) | 2026-05-10 | T0 = `2026-05-10T01:25:47Z` (sha `a9df8f5`); T1 = user-confirmed working post `/reload` (manual dogfood, exact T1 not stamped — order of minutes from T0 to first agent commit `bda8e92`, plus user-side dogfood latency) | working `/scratch` (commands + tools + status + persistence); 21/21 store tests passed; retired from the repo on 2026-05-14 | **First real-extension data point.** No ratio claimed (per spec clarify Q3 / harness AC-15 decoupled to ext #3). D-005 remains evidence-pending; D-018 + D-019 surfaced and were mitigated in the scratch build. |
| 7 — extension #3 (`session-sql`) | 2026-05-15 | T0 = `2026-05-15T05:24:22Z`; T1 = `2026-05-15T05:30:56Z` (`npm run self-check` + manual resume proof complete) | `session-sql` implementation: domain docs, Node `>=24`, SQLite store, `sql` tool, `/sql` command, docs, smoke, retro capture; 44/44 tests passed + 2 skipped; smoke passed | D-022 (`node:sqlite` + Vitest shim), D-023 (template drift), and D-024 (Driver idle detection with status lines) surfaced and were encoded during implementation. |
| 8 — extension #4 (`ralph-loop`) | 2026-05-15 | T0 = `2026-05-15T06:56:02Z` (Phase 0 T005 `npm run new -- ralph-loop`); T1 = `2026-05-15T07:45:57Z` (Phase 1.D AC-05 smoke green); Δ = **~49m 55s** | full ralph-loop v1 build: agentic-loops domain doc (registry/map/domain.md), compactAndAssert Driver SDK helper (AC-12 gift a) + 17 tests, FakeIterationRunner cross-domain helper, RalphLoopStore (~700L) + 65 tests covering 8 StopReason kinds + parser + spinning detector + pre/post evaluator + replay determinism + 3 F005 regression cases, SdkIterationRunner + 8 leak-detection tests (R2), /ralph command surface + 2 tools + P10 session_start + status pill, 3-task fixture + compact-survival smoke that runs green end-to-end. 90/90 unit tests + smoke pass. | Compounding hypothesis vs ext #3 — **does not apply directly** (different scope tier). ralph-loop is 7.5× slower wall-clock vs session-sql but is also: (a) first inhabitant of a NEW domain (`agentic-loops` formalised in Phase 0); (b) 28 task slots vs ~10; (c) two AC-12 harness gifts shipped (compactAndAssert helper + `agent-harness.md` codification); (d) 5 inline companion findings addressed (F001 HIGH stop-source drift, F002+F003 MED, F004 HIGH stale JSON gate in compactAndAssert, F005 HIGH plan-exhaustion misclassification); (e) AC-05 smoke red-then-green debug cycle. For the compounding metric to be meaningful, the comparison sibling needs to be a same-tier extension (8–10 tasks, no domain-creation, single harness gift). Update D-021 / spec AC-13 accordingly. |
| 9 — extension #5 (`todo`) | 2026-05-15 | T0 = `2026-05-15T06:54:23Z` (`npm run new -- todo`); T1 = `2026-05-15T07:37:57Z` (`npm run self-check` green); Δ ≈ 44 min | SQL-backed todo extension: `TodoSqlStore`, `/todo`, `todo` tool, overlay/status, docs, domain records, and smoke (`npm run smoke -- todo` green). | Built under Plan 010 with companion-mode review run `2026-05-15T16-51-44-687Z-9e83`. D-027 and D-028 surfaced; D-028 encoded locally in smoke. Final self-check also required formatting/fixing in-flight ralph-loop smoke so all local smoke scenarios passed. |
| 10 — todo follow-up (`todo-strip`) | 2026-05-16 | T0 = `2026-05-15T23:46:04Z` (companion briefing); T1 = `2026-05-16T00:12:05Z` (`just self-check` green); Δ ≈ 26 min | Below-editor `todo-strip`: compact 4-row recent-activity widget, `TodoSqlStore.widgetSnapshot`, `session-sql:changed` refresh, docs/domains, smoke anchor, and 45 focused tests. | Companion run `2026-05-16T09-45-41-687Z-4b0a`; findings F001/F002 fixed inline. D-029 logged for read-only SQL event over-emission. |
| 11 — Minih Workbench Phase 1 (`minih-workbench`) | 2026-05-16 | T0 = `2026-05-16T03:47:09Z` (companion boot); T1 = `2026-05-16T04:29:11Z` (`just self-check` green); Δ ≈ 42 min | Phase 1 read-only Minih foundation: new `agent-workbench` domain, generated extension, store/persistence contracts, dependency decision, deterministic fixtures, artifact adapter, `/minih status --json`, 3 read-only tools, store/adapter tests, and smoke. | Companion run `2026-05-16T13-47-09-160Z-fc71`; inline findings fixed through F012. D-031 encoded generator-template lint cleanup. |
| 12 — Minih Workbench Phase 2 (`minih-workbench`) | 2026-05-16 | T0 = `2026-05-16T06:32:48Z` (companion boot); T1 = `2026-05-16T07:22:19Z` (`just self-check` green after companion fixes); Δ ≈ 50 min | Phase 2 read-only native viewer: keybinding contracts, pure list/modal state helpers, native run-list and full modal components, read-only feed lifecycle, `/minih` list/view/report wiring, store/feed/UI tests, and modal smoke. | Companion run `2026-05-16T16-32-48-636Z-fb2e`; findings F001–F006 fixed inline. No new package dependency. |
| 13 — Minih Workbench Phase 3 (`minih-workbench`) | 2026-05-17 | T0 = `2026-05-17T04:55:31Z` (companion boot); T1 = `2026-05-17T05:31:29Z` (`just self-check` green); Δ ≈ 36 min | Phase 3 interaction/push hardening: capability contracts, session-backed audit/cursors, adapter send/stop wrappers, `/minih send`, modal composer, `/minih stop`, pushed context, per-event dedupe, safety/tool-ordering tests, fake-writer smoke, and docs. | Companion run `2026-05-17T14-55-31-573Z-53a4`; findings F001–F011 fixed/reconciled inline. No new package dependency. |

| 14 — Plan 041 Phase 2 (`pij inbox`) | 2026-07-12 | T0 = `2026-07-12T06:19Z`; T1 = `2026-07-12T08:50Z`; Δ ≈ 2h 31m | Pull ownership, ambient registration, grouped inbox CLI, waits/receipts, and atomic per-envelope receipt events; 203 targeted tests plus Windows two-process race. | Long wall-clock reflects two deliberate review gates and four real correctness defects found after green happy-path gates; D-034 encodes the adversarial proof gained. |
| 15 — Plan 041 Phase 3 (`pij inbox`) | 2026-07-12 | T0 = `2026-07-12T10:40Z`; T1 = `2026-07-12T21:09Z`; Δ ≈ 10h 29m | Durable tmux/pi push consumption, retained envelopes, post-outcome markers, push/pull guidance, cold review, and genuine no-tmux Terra/medium live proof; 1,850 tests. | Wall-clock includes the overnight live-proof pause, model-effort ruling, formal daemon baton, and one three-finding review/fix cycle; active implementation/review time was a minority of the window. |
| 16 — Plan 076 (`pij chore`) | 2026-08-02 | T0 = `2026-08-02T01:16:32Z`; T1 = `2026-08-02T01:46:52Z`; Δ ≈ 30m 20s | Five-verb chore CLI, union scope rosters, per-seat pending fingerprints, ack-only baselines, docs/domain records, 51 focused tests, and full harness inventory. | One transient smoke pane-loss retry plus a two-finding correctness review/fix cycle are included. |

## Hypothesis (measurement-anchored)

After the harness ships (end of phase 5 above), **extension #2's
wall-clock from `npm run new -- <name>` to a successful `/<name>`
command registering in pi is materially shorter than v1's equivalent
path** (the same chain measured during phase 5).

- **Provisional target**: extension #2 ≤ 50% of the v1 equivalent path.
- **Falsifiable**: if extension #2 is not faster than v1's baseline
  (whatever that turns out to be), file a `D-NNN` explaining where the
  time went and **encode the fix** before extension #3.
- **Specific minute target**: TBD — set when the v1 baseline is known.

## Measurement protocol

For extension #2 (and any future velocity test):

- **Start**: timestamp when `npm run new -- <name>` is invoked.
- **End**: timestamp when the user (or the smoke runner) confirms
  `/<name>` registers in pi (a real toast, not just the command being
  typed).
- **What's included**: scaffold + any code edits + `npm run typecheck`
  clean + `npm test` green + `/<name>` registers in pi.
- **What's excluded**: time the implementor spent reading docs (that's a
  separate measurement of "onboarding cost", logged elsewhere).
- **Where it lands**: a new row in this table with the actual numbers
  and any difficulties encountered.

## Compounding evidence (filled retroactively)

| Comparison | v1 baseline | extension #2 (scratch) | Δ | Verdict |
|------------|-------------|------------------------|---|---------|
| `npm run new` → command-registered | demo: ~3 minutes (manual transcription from workshop 004 + name validation + smoke verification, with companion review per phase) | not measured discretely (mixed agent-authoring + user-verification path); see row 6 | n/a | **deferred to ext #3** per spec clarify Q3 |
| `npm run self-check` (full pipeline) | ~6 s (post-build, demo present) | TBD (re-measure post-scratch) | TBD | TBD |
| `npm install` (cold cache) | ~23 s | unchanged (no peerDep additions) | ~0 | OK |

**AC-15 status**: ratio decision **deferred to extension #3 retrospective**
(per spec 003-scratch clarify Q3). Scratch produced the first real-extension
data point; ratios need ≥2. Ext #3 will normalize the entry shape and
compute the comparison cleanly.

**Workshop 003 vs reality drift surfaced during scratch build**:
- D-018: `notify` level enum (`"success"` rejected; mapped to `"info"`)
- D-019: `list({limit:0})` latent bug (`slice(-0)` returns full array)

Both were mitigated surgically during the scratch build; scratch was later
retired from the repo, so workshop 003 / 004 backfill should propagate the
patterns if they repeat.
