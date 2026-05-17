# Minih Workbench

`minih-workbench` is a Pi-native surface for observing and safely coordinating Minih runs without replacing Minih as the runner or artifact source of truth.

## Commands

```text
/minih                                  # open run list
/minih list                             # same as /minih
/minih view <slug> <runId>              # open modal viewer
/minih report <slug> <runId>            # open modal focused on report
/minih status --json                    # list/status JSON pull surface
/minih status <slug> <runId> --json     # run snapshot JSON
/minih report <slug> <runId> --json     # report summary JSON
/minih send <slug> <runId> <body>       # gated outside-inbox send
/minih stop <slug> <runId>              # human-confirmed stop control
```

Model-facing tools:

- `minih_runs_list`
- `minih_run_status`
- `minih_read_report`
- `minih_send_message`
- `minih_stop_run`

## Safety model

- Minih artifacts remain canonical; Pi stores only pointers, cursors, opt-ins, and audit records.
- Send/stop require explicit `slug` and `runId`, a fresh capability check, an active coordinated writable run, and audit persistence before side effects.
- `minih_stop_run` requires exact confirmation: `stop <slug>/<runId>`.
- `Esc`, modal close, report viewing, and freeform composer text never stop or control a run.
- Push context is scoped to opened/observed runs and explicitly opted-in runs; it is compact, redacted/truncated, and deduped by persisted per-event cursor channels.
- Raw tool output, raw reports, secrets, environment values, and unbounded paths are suppressed or redacted before model-visible delivery.

## Deterministic validation

Routine validation uses fixtures/fakes only:

```bash
npx vitest run .pi/extensions/minih-workbench/store.test.ts \
  .pi/extensions/minih-workbench/minih-adapter.test.ts \
  .pi/extensions/minih-workbench/session-persistence.test.ts \
  .pi/extensions/minih-workbench/ui.test.ts \
  .pi/extensions/minih-workbench/index.test.ts
npm run smoke -- minih-workbench
just self-check
```

Smoke sets a fixture clock and fake writer so send/read-only gating is deterministic without live Minih/Copilot.

## Troubleshooting

- If runs look stale in fixture smoke, check `PIJ_MINIH_WORKBENCH_NOW_MS`.
- If a write is rejected, inspect the JSON diagnostics for `MINIH_SEND_NOT_AVAILABLE`, `MINIH_STOP_NOT_AVAILABLE`, or `MINIH_STOP_CONFIRMATION_MISMATCH`.
- If push context repeats, inspect `minih-workbench.persistence.v1` custom session entries for per-event `source: "push"` cursor channels.
- If Pi cannot see the extension, run `just link` or `just pi-doctor` from the repo root.
