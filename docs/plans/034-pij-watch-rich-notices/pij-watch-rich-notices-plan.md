# pij Rich File-Watch Notices

**Mode**: Simple
**Plan Version**: 1.1.0
**Created**: 2026-07-09
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md`.

## Business Specification

### Research Context
Plan 033 shipped peer file-watch: non-pi peers `pij watch <glob>`, the daemon runs a debounced `FolderWatcher` per subscription and delivers coalesced `[file-watch] <file> <verb>` notices into the peer's pane. Research (dossier F-01…F-11) established: created/modified/deleted is **already** classified by snapshot-reconcile; the watcher snapshots `{mtimeMs, size}` only (**no content**); nothing reads file bytes or diffs; the notice callback (`watch.ts:119-122`) already receives the structured `Change[]` + subscription + peer id but ignores them; the finding-10 receipt guard must survive; and pointer-delivery has an edge — `attachments` is consumed only by the telegram bridge, not the tmux-inject path a watch peer uses (F-10).

### Summary
Enrich the peer-watch notice so a peer learns not just *that* a file changed but *where* (changed-line ranges) and optionally *what* (the diff). Add a per-subscription **mode**: the default `notify` mode appends changed-line ranges to the existing notice; an opt-in `diff` mode includes the actual unified diff (delivered as an on-disk **pointer** when large). Diffs are computed against a **self-snapshot content baseline** (the content we last notified about) — never `git diff` vs HEAD, which is cumulative. Also honor `.gitignore` when a watched path is inside a git repo, so watches stop spamming ignored files.

### Goals
- A peer sees the **changed-line ranges** for a `modified` file in the default notice.
- An opt-in **diff mode** delivers the actual diff, with large diffs degrading to a disk pointer (token-frugal).
- Diffs/ranges are **incremental** — each notice reflects only the delta since the last notice (self-snapshot baseline).
- Watches inside a git repo **respect `.gitignore`** (additive to the static ignore list).
- 033's delivery spine, coalescing, and the finding-10 guard are preserved unchanged.

### Non-Goals
- Not changing the standalone `file-watch-notify` behavior for **pi** sessions (the core may gain *optional* content/diff capability the daemon opts into; the default notice path for pi is untouched).
- Not a general git-diff service — scoped to watch-notice enrichment.
- Not `git diff` vs HEAD / index semantics (explicitly rejected — cumulative).
- No content snapshot of files that exceed the size cap or are binary (they degrade to a plain notice).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `file-watch-notify` | existing | **modify** | Add optional per-path content baseline + a diff/line-range computation to the pi-free core; extend `Change` + notice tokens. |
| `pij-control-plane` | existing | **modify** | Per-subscription `mode`; enrich the `PeerWatchManager` notice callback (render ranges / diff / pointer); `.gitignore` into `compileWatch`; `pij watch` flags; thread `mode` through the 5 dedup/validator sites. |

No NEW domains.

### Testing Strategy
- **Approach**: Hybrid — TDD for pure logic (diff/line-range computation, empty-delta suppression, `mode` dedup-key, size-cap/binary skip, `.gitignore` matching); lightweight validation for the daemon wiring/delivery.
- **Rationale**: the diff/range logic is pure and lives in the pi-free core — exactly what unit tests protect; delivery is integration-shaped and cheaper to validate end-to-end.
- **Focus areas**: reconciler diff output, empty-delta suppression, baseline advance-once-per-wake, size/binary guards, mode dedup-key isolation, gitignore matching, large-diff pointer threshold.
- **Excluded**: re-testing 033's already-covered subscribe/deliver/receipt-guard paths (assert they still pass).
- **Mock usage**: Avoid — real temp dirs + real files via `nodeWatchDeps` (matches existing `file-watch-notify` tests).

### Documentation Strategy
- **Location**: `docs/how/pij-peer-watch.md` — update with the `notify`/`diff` modes, the `pij watch --diff` flag, `.gitignore` behavior, and the large-diff pointer.
- **Rationale**: keep the single peer-watch guide authoritative; the modes/flags are user-facing surface a peer must discover.

### Complexity
- **Score**: CS-3 (medium) — *plan built in Simple mode per user selection; the single phase carries dependency-ordered task groups.*
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=1 (sum 7)
- **Confidence**: 0.75
- **Assumptions**: self-snapshot baseline is acceptable (first post-restart edit has no pre-restart baseline); a small diff dependency (or equivalent) is acceptable.
- **Dependencies**: builds on 033 (shipped); `picomatch` already a direct dep.
- **Risks**: see Risks & Assumptions.
- **Phases**: 1 (Simple).

### Acceptance Criteria
1. **AC-01** — A `modified` file under a default (`notify`-mode) watch produces a notice naming the file, the verb, and the **changed-line range(s)**, e.g. `[file-watch] src/x.ts modified (lines 12–14, 40)`.
2. **AC-02** — A watch created with the diff flag delivers the **unified diff** of the change; the notice for a non-diff watch does **not** include a diff body.
3. **AC-03** — A `modified` event where content is byte-identical (mtime-only touch, F-03) produces **no** notice in diff mode and **no** line-range in notify mode (empty-delta suppressed), while the plain-verb behavior is preserved.
4. **AC-04** — Successive edits to the same file each report only the **delta since the previous notice** (self-snapshot baseline advances), not a cumulative diff.
5. **AC-05** — A diff over the threshold (>60 lines or >4 KiB) is delivered as a short **path pointer** in `body` (`~/.pij/<id>/watch-diffs/<path>.diff`, overwritten in place), not inline and **not** via `attachments`; a diff within the threshold is inline (WS-001).
6. **AC-06** — A file over the content size cap, or a binary file, degrades to a **plain notice** (verb only, no ranges/diff) and never blocks or errors.
7. **AC-07** — Inside a git repo, a change to a `.gitignore`-ignored path produces **no** notice; outside a git repo, behavior is unchanged (static `DEFAULT_IGNORE` only).
8. **AC-08** — Two subscriptions on the same glob differing only by `mode` **coexist** (distinct dedup keys) — the diff-mode sub does not overwrite the notify-mode sub.
9. **AC-09** — The finding-10 guard holds: no `~/.pij/pij-watch/` phantom dir is created; the watch-notice injection path is unaffected.
10. **AC-10** — `harness checks` (typecheck, lint, test, smoke, pkg-audit, snapshots) is green.
11. **AC-11** — Per-verb rendering is defined: a `created` file renders (notify) a `1–N` range or (diff) the whole file as additions subject to the size-cap/pointer rule (else a plain notice); a `deleted` file renders a plain notice with no diff. No verb reaching the enriched callback is left unspecified.

### Risks & Assumptions

| Risk / Assumption | Impact | Mitigation |
|---|---|---|
| Content-snapshot memory growth (F-01, `store.ts:217,223` Map copied each apply) | Watching a large tree holds much content in memory | Store **under-cap** content on the snapshot's `FileMeta` (the existing Map — no separate cache/eviction layer); over-cap/binary → no content. Memory bounded by (watched-file-count × per-file cap) |
| Reading large/binary files to diff (no existing guard, F-01) | CPU/memory footgun | Size cap + binary sniff **before** reading content; over-cap/binary → plain notice (AC-06) |
| Post-restart baseline gap (F-01, `prime` seeds metadata only) | First edit after daemon restart has no pre-restart baseline | Accepted + documented: first post-restart `modified` = plain notice or diffs vs current disk |
| Empty-delta on mtime-only touch (F-03) | Noise notices | Suppress zero-delta modifieds (AC-03) |
| Coalesced burst double-counting baseline (F-11) | Wrong delta | Advance baseline **exactly once per emit/wake** |
| `mode` field missed at a dedup/validator site (F-06) | Silent sub collision | Thread through all 5 sites in lockstep; AC-08 test proves isolation |

### Open Questions
None blocking. The design-shaped choices below are recorded as **Workshop Opportunities** with recommended defaults baked into the plan; workshopping is optional refinement, not a gate.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|---|---|---|---|
| Diff/notify mode CLI surface | CLI Flow | User-facing flag ergonomics; default naming | `pij watch --diff <glob>` vs `--mode diff`? Is default `notify` (verb + ranges) the right default, or should bare watches stay verb-only and ranges be opt-in too? |
| Large-diff pointer delivery | Integration Pattern | F-10 — the sharp edge | **✅ RESOLVED — `workshops/001`**: inline path string in `body` (not `attachments`); threshold ≤60 lines & ≤4 KiB; `~/.pij/<id>/watch-diffs/<path>.diff` overwritten in place (bounded). |
| `.gitignore` honoring approach | Integration Pattern | Correctness vs cost | **✅ RESOLVED — `workshops/002`**: batched `git check-ignore --stdin`, applied in the daemon `PeerWatchManager` (not the pi-free core); repo root cached at sub start; silent degrade outside a repo. |
| Diff implementation library | Spike/POC | No diff lib in deps today | Add `diff` (jsdiff — `structuredPatch` for ranges + `createPatch` for the body) vs shell `git diff --no-index`? (Recommended: jsdiff — pure, in-memory, no subprocess/temp files.) |

### Clarifications

#### Session 2026-07-09
- **Workflow Mode** → Simple (user selection; CS assessed at 3).
- **Testing Strategy** → Hybrid (TDD for core logic, lightweight for wiring).
- **Mock Usage** → Avoid — real temp-dir fixtures.
- **Documentation Strategy** → `docs/how/pij-peer-watch.md` update.
- **Diff baseline** (design steer, pre-plan) → self-snapshot content, **not** git-vs-HEAD.
- **Workshops folded (plan v1.1.0)** → `workshops/001` (pointer delivery: inline path in `body`, 60-line/4-KiB threshold, `watch-diffs/<path>.diff` overwrite-in-place) + `workshops/002` (`.gitignore`: batched `git check-ignore`, daemon-side, core stays git-free) are authoritative and folded into T009/T011, Key Finding 07, and the Domain Manifest.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Diff/notify mode CLI surface · Diff library (Spike → T001). **Resolved via workshops**: Large-diff pointer delivery (WS-001) · `.gitignore` approach (WS-002) — folded into T009/T011 below.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings (F-01…F-11) |
| workshops/*.md | y | WS-001 (pointer delivery), WS-002 (.gitignore) — **authoritative**, folded into T009/T011 |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical `[NEEDS CLARIFICATION]` markers; open choices carry baked defaults + workshop rows |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No accepted ADRs bearing on this |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Hybrid — test tasks precede impl for the pure-logic groups; measurable ACs |
| G7 | Domain Completeness | PASS | Both domains existing + in registry; Domain Manifest covers every referenced file |

### Summary
Add an optional content baseline + diff/line-range computation to the pi-free `file-watch-notify` core, then enrich the pij daemon's peer-watch notice callback to render changed-line ranges (default `notify` mode) or a unified diff (opt-in `diff` mode, pointer-delivered when large), threading a per-subscription `mode` field through the CLI, types, sidecar validator, and both dedup-key functions. Honor `.gitignore` inside a git repo. Preserve 033's delivery spine, coalescing, and the finding-10 receipt guard.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `.pi/extensions/file-watch-notify/store.ts` | file-watch-notify | internal | Content baseline on the snapshot; diff/line-range in the reconciler; extend `Change` + notice tokens |
| `.pi/extensions/file-watch-notify/watcher.ts` | file-watch-notify | internal | Capture content (capped/binary-skipped) at prime + each scan |
| `.pi/extensions/file-watch-notify/store.test.ts` | file-watch-notify | internal | Unit tests: diff, ranges, empty-delta, caps |
| `.pi/extensions/file-watch-notify/watcher.test.ts` | file-watch-notify | internal | Real-fixture tests: content capture, binary/large skip |
| `.pi/extensions/pij/core/types.ts` | pij-control-plane | contract | `WatchSubscription.mode` field |
| `.pi/extensions/pij/core/watch-subscription.ts` | pij-control-plane | internal | `mode` in `addWatch` literal + `keyOf`; enrich `formatWatchNotice` |
| `.pi/extensions/pij/core/daemon/watch.ts` | pij-control-plane | internal | Enrichment callback (ranges/diff/pointer + `watch-diffs/` pointer files); `mode` in `watchKey`; `.gitignore` filter (`git check-ignore`) — daemon-side, pi-free core untouched (WS-002) |
| `.pi/extensions/pij/adapters/watch-store.ts` | pij-control-plane | internal | `isWatchSubscription` validates optional `mode` |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | Parse `--diff`/`--mode` in `runWatch`; usage strings |
| `.pi/extensions/pij/core/daemon/watch.test.ts` | pij-control-plane | internal | Mode isolation (AC-08), finding-10 still holds (AC-09), pointer threshold |
| `docs/how/pij-peer-watch.md` | pij-control-plane | doc | Document modes, flag, gitignore, pointer |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | No content baseline exists — snapshot is `{mtimeMs,size}` only (F-01) | Add optional content capture (capped/binary-skipped) to the watcher snapshot + a bounded cache |
| 02 | Critical | The notice callback already gets `Change[]` + `sub` + `id` but ignores them; deliver is `channel.deliver({from:"pij-watch",…})` (F-04, F-05) | Compute ranges/diff and branch on `sub.mode` **here**; extend `Change` with the delta |
| 03 | High | `modified` fires on mtime-only touches (F-03) | Suppress empty textual deltas (AC-03) |
| 04 | High | `mode` must thread through 5 sites or subs collide on the dedup key (F-06) | Update `WatchSubscription`, `addWatch`, `keyOf`, `watchKey`, `isWatchSubscription` in lockstep (AC-08) |
| 05 | High | Pointer field `attachments` is consumed only by telegram, not tmux-inject (F-10) | Large-diff pointer = inline **path string** in `body`; peer reads the file (workshop: alternative = extend inject) |
| 06 | High | Finding-10 receipt guard + its test protect against a phantom `pij-watch` dir (F-09) | Keep `from:"pij-watch"` unregistered; assert the guard test still passes (AC-09) |
| 07 | Medium | No `.gitignore` awareness; ignore is static picomatch per-basename (F-08) | Filter `Change[]` via batched `git check-ignore` in the daemon `PeerWatchManager` — **not** the pi-free core (WS-002); repo root cached at sub start; degrade silently outside a repo (AC-07) |
| 08 | Medium | Debounce coalesces a burst into ≤1 Change/file/wake (F-11) | Advance the content baseline exactly once per emit (AC-04) |

### Implementation

**Objective**: Deliver changed-line ranges (default) and an opt-in pointer-aware diff mode for pij peer-watch notices, computed from a self-snapshot baseline, honoring `.gitignore`, without disturbing 033's spine.
**Testing Approach**: Hybrid — for each pure-logic group the test task precedes/accompanies impl; wiring tasks carry a validation step; `harness checks` gates the end.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | **Spike/decision (throwaway):** confirm jsdiff `structuredPatch`(ranges)+`createPatch`(body) on two in-memory strings vs shell `git diff --no-index`; record go/no-go + chosen lib | file-watch-notify | scratch | A one-line verdict + constraints recorded in the execution log; no shipping code | Key Finding — resolves the "Diff library" workshop row; default recommendation jsdiff |
| [ ] | T002 | Tests-first: reconciler diff + changed-line-range extraction from old/new content, incl. **empty-delta → no change** | file-watch-notify | `store.test.ts` | Failing tests specify ranges + empty-delta suppression | TDD (AC-01, AC-03) |
| [ ] | T003 | Add optional content baseline **on the snapshot** — under-cap content stored on `FileMeta` (over-cap/binary → no content), reconciler diffs prev-vs-next from its held `this.snapshot`; a diff/range computation; extend `Change` with `lineRanges`/`diff`; new `formatNotice` tokens | file-watch-notify | `store.ts` | T002 green; `Change` carries the delta; over-cap `FileMeta` carries no content; tokens render | Per finding 01, 02; single baseline structure (no side cache) |
| [ ] | T004 | Tests-first: content capture is **size-capped + binary-skipped**; over-cap/binary → no content (plain notice) | file-watch-notify | `watcher.test.ts` | Failing tests specify cap + binary skip with real fixtures | TDD (AC-06) |
| [ ] | T005 | **Tests-first + impl:** capture under-cap content onto the snapshot's `FileMeta` at `prime()` + each scan; advance the baseline **exactly once per coalesced wake**; test asserts successive edits report delta-only and the baseline advances once/wake (F-11) | file-watch-notify | `watcher.ts`, `store.ts`, `store.test.ts` | Advance-once test green; T004 green; memory bounded | TDD; per finding 01, 08 (AC-04, AC-06) |
| [ ] | T006 | Add `mode?: "notify" \| "diff"` to `WatchSubscription`; set in `addWatch` literal; include in `keyOf`, `watchKey`, and `isWatchSubscription` | pij-control-plane | `core/types.ts`, `core/watch-subscription.ts`, `core/daemon/watch.ts`, `adapters/watch-store.ts` | All 5 sites updated; validator accepts optional mode | Per finding 04 (AC-08) |
| [ ] | T007 | Tests-first: two subs on one glob differing only by mode coexist (distinct keys); notify vs diff rendering | pij-control-plane | `core/daemon/watch.test.ts` | Failing tests specify mode isolation + rendering | TDD (AC-08, AC-02) |
| [ ] | T008 | Enrich the `PeerWatchManager` notice callback: consume `Change[]`, render per `sub.mode` + per verb — `modified`: ranges (notify) / unified diff (diff), suppress empty deltas; `created`: notify → range `1–N` / diff → whole file as additions (subject to T009 size-cap/pointer, else plain notice); `deleted`: plain notice, no diff | pij-control-plane | `core/daemon/watch.ts`, `core/watch-subscription.ts` | T007 green; per-verb rendering matches AC-01/02/03/11 | Per finding 02, 03 (AC-01, AC-02, AC-03, AC-11) |
| [ ] | T009 | **Tests-first + impl:** large-diff **pointer delivery** (WS-001) — inline the diff in `body` iff ≤60 lines & ≤4 KiB, else write it to `~/.pij/<id>/watch-diffs/<path→__>.diff` (**overwritten in place**, ≤1 file/changed path) and end the notice with `— diff: <path>`; **never** `attachments` (F-10); remove `watch-diffs/` on last unwatch/teardown; test asserts over/under threshold → pointer vs inline + overwrite-in-place | pij-control-plane | `core/daemon/watch.ts`, `core/daemon/watch.test.ts` | Threshold test green; over → path pointer, under → inline; dir bounded to ≤1 file/path | TDD; per finding 05, WS-001 (AC-05) |
| [ ] | T010 | `pij watch --diff` (and/or `--mode diff`) flag: parse in `runWatch`, thread into `addWatch`; update usage strings; `notify` default | pij-control-plane | `cli.ts` | `pij watch --diff <glob>` creates a diff-mode sub; help updated | Workshop: exact flag surface |
| [ ] | T011 | Tests-first + impl: `.gitignore` honoring (WS-002) — at sub start cache the repo root (`git rev-parse --show-toplevel`); per wake filter `Change[]` through **batched `git check-ignore --stdin`** in the **daemon `PeerWatchManager`** (NOT the pi-free core); silent degrade outside a repo | pij-control-plane | `core/daemon/watch.ts`, `core/daemon/watch.test.ts` | Ignored paths produce no notice in-repo; unchanged + no error outside; core has no git import | Per finding 07, WS-002 (AC-07) |
| [ ] | T012 | Assert finding-10 guard intact (no phantom `pij-watch` dir; injection path unaffected) | pij-control-plane | `core/daemon/watch.test.ts` | Guard test green; no phantom dir | Per finding 06 (AC-09) |
| [ ] | T013 | Update `docs/how/pij-peer-watch.md`: modes, `--diff`, `.gitignore`, pointer, post-restart baseline caveat | pij-control-plane | `docs/how/pij-peer-watch.md` | Guide documents all new surface | Docs strategy |
| [ ] | T014 | Restart daemon (no hot-reload) + `harness checks` full gate | pij-control-plane | — | `harness checks` green; live smoke of a notify + a diff watch | AC-10 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T002, T003, T008 | reconciler range tests + live notify notice |
| AC-02 | T007, T008, T010 | mode rendering tests + diff-mode watch |
| AC-03 | T002, T008 | empty-delta suppression test |
| AC-04 | T005 | baseline advance-once test |
| AC-05 | T009 | pointer-threshold test |
| AC-06 | T004, T005 | cap + binary skip fixtures |
| AC-07 | T011 | gitignore in-repo/out-of-repo tests |
| AC-08 | T006, T007 | mode dedup-key isolation test |
| AC-09 | T012 | finding-10 guard test |
| AC-10 | T014 | `harness checks` |
| AC-11 | T007, T008 | per-verb rendering tests (created/deleted) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory growth from content cache | Medium | Medium | Size cap + binary skip + bounded cache (T004/T005) |
| `mode` missed at a dedup site → silent collision | Medium | High | Lockstep 5-site update + AC-08 test (T006/T007) |
| `.gitignore` semantics (negation/nesting) mishandled | Medium | Medium | Prefer `git check-ignore` accuracy or a tested parse; workshop the approach (T011) |
| Large diff floods a pane | Low | High | Pointer delivery above threshold (T009) |
| Breaking 033's receipt guard | Low | High | Explicit guard assertion (T012) |

## Subtasks Registry

| ID | Created | Summary | Parent | Dossier | Status |
|----|---------|---------|--------|---------|--------|
| 001 | 2026-07-10 | Collate window (per-sub `debounceMs`, 750 ms peer default) + diff mode pointer-delivers every computed diff over tmux (plain notices retained for deleted/no-diff) | T006 / T009 | [tasks/phase-1-implementation/001-subtask-watch-collate-window-and-diff-pointer.md](tasks/phase-1-implementation/001-subtask-watch-collate-window-and-diff-pointer.md) | Complete (reviewed APPROVE, uncommitted) |
