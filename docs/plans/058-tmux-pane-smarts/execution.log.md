# Implementation execution log

## T001 — pane stream fixtures

- Added reduced, escaped raw-stream captures for busy, idle, typing, and Enter across claude, copilot, codex, and pi.
- The fixture shapes preserve the live-probed control sequences from the research dossier: OSC 0 churn, full-frame repaint churn, OSC 133/8 traffic, and final caret reports.
- `/tmp` captures were no longer present, so the committed fixtures are compact reproductions of the recorded byte patterns rather than copies of the original transient files.

## T002 — busy-density classifier

- Added `BusyDensityTracker`: a rolling one-second byte window marks busy after sustained stream churn and keeps the signal stable until 1.5 seconds of silence.
- Fixture tests cover all four harness stream dialects and the busy-to-idle hysteresis edge.

## T003 — caret typing tracker

- Added `CaretTypingTracker`: parses TUI cursor reports, learns the composer base caret, tracks non-empty composer length, emits Enter on a reset to base, and releases after 60 seconds without a key.
- Fixture tests cover ordered key progression and Enter release for claude, copilot, codex, and pi.

## T004 — pane connect diff core

- Added pure `diffPaneListings` and the in-memory `PaneSignalMonitor`; dead or absent panes retire, while newly listed live pane ids surface as additions.
- Extended `DaemonTmux` with an all-server `list-panes -a` query plus attach/drain/detach methods for one `pipe-pane -O` stream tap per pane.

## T005 — send-buffer typing hold

- Extended the existing `SendBuffer` rather than creating a parallel gate.
- Per-pane signals are readable through `paneSignal`; only `userTyping` holds a flush. A busy pane with an empty composer flushes immediately.
- Held messages remain FIFO and message-id deduplication prevents repeated daemon ticks from duplicating retained unread envelopes.

## T006 — daemon tap and delivery wiring

- The daemon now reconciles all tmux panes once per tick, attaches one output tap for new panes, drains bytes through `PaneSignalMonitor`, updates the existing `SendBuffer`, and detaches retired/dead panes.
- Held envelopes remain unread on disk. On Enter or 60-second idle release, the buffer flushes FIFO, then writes read markers and receipts.
- Added daemon integration tests for typing hold, Enter release, idle release, busy-with-empty-composer immediate delivery, and pane retirement.
- Added and ran an isolated live tmux smoke covering hold, two-message FIFO release, and killed-pane retirement.

## T007 — documentation

- Added `docs/how/pij-pane-signals.md`.
- Additively updated the `pij-control-plane` source, concept, contract, ownership, and history tables.

## Phase complete

- T001-T007 implemented.
- Acceptance coverage is backed by fixture parser tests, daemon integration tests, adapter tests, and the isolated tmux smoke.
- Noteworthy: original transient `/tmp` captures were unavailable; committed fixtures are reduced escaped reproductions of the live-recorded control-sequence shapes documented in the research dossier.

## End-gate evidence

- `npm run typecheck`: PASS.
- `npm run lint`: PASS (repository-existing warnings remain non-failing).
- Targeted pane-signal/router/adapter/daemon tests: PASS, 83 tests.
- `npx tsx harness/scripts/pane-signals-smoke.ts`: PASS.
- `npm test`: FAIL after two runs because unrelated `index.test.ts` and Telegram tests exceeded their existing 5-second timeout; the latest run passed 2,908 tests and failed 6 timeout-only tests.
- `harness checks`: all sensors passed except the same full-suite timeout failures (`test`).
