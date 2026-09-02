# Post-flight — 129-statusline-generation-badge

**Closed out**: 2026-09-02T03:55:44Z
**Archived to**: `docs/plans/archive/129-statusline-generation-badge/`
**Shipped**: not yet — PR opens after archive

## Completion

| Check | Result |
|---|---|
| Phases / tasks | 1 phase; 5/5 tasks checked with receipts |
| Acceptance criteria | AC1–AC5 checked; `harness plan validate --complete` reports 0 open, 0 contradictions |
| Latest review | Claude Opus r2 `APPROVE`; f1–f4 fixed and independently re-derived |
| Deterministic gate | 7/8 `harness checks` sensors pass; aggregate test sensor contains the two prime-ruled main baselines, and every other observed failure passed focused rerun |

## Open / deferred items

No open plan item.

| Kind | Item | Where | Note |
|---|---|---|---|
| Prime note | Statusline backup silently skips command forms it cannot resolve | `review-r2-cross-model.dd.md#n1` | Deferred to prime; prior script remains in place, and supported tilde/absolute forms are backed up |
| Test note | rs-arm turn-start reassertion lacks its own content assertion | `review-r2-cross-model.dd.md#n3` | Non-blocking; shared generation field and legacy reassertion assertion cover realistic mutations |
| Baseline | npm resolution replay status 1; worktree cleanup `ENOTEMPTY` | `assets/live-statusline.md#AC5` | Prime-ruled pre-existing main failures; neither test modified |
| Harness observations | 13 pending buffer entries | `.harness/temp/agent/session-buffer.md` | Listed, never cleared; drain is o-prime-owned |

## Incident receipt

The pre-merge operator-home install was reversed by prime. The model-loss root and its real-shape regression are recorded in `assets/live-statusline.md#incident-and-regression`. After the ruling, all proof stayed under `/tmp`; no further writes were made to `~/.claude`, `~/.claude-alt`, or `~/.pij-rs`.
