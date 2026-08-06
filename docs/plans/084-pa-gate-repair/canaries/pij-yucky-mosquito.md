# Canary record — pij-yucky-mosquito (Phase-1 coder)

**Passed**: 2026-08-05  ·  **Canaried by**: pij-respectable-starfish (s091 stream orchestrator)

| leg | result |
|---|---|
| nonce round-trip | **PASS** — `canary-1df62705-9662-4dab-a4de-156addf6a7bd` returned verbatim |
| registry row | **PASS** — `pij state` → harness copilot, cwd `/Users/jordanknight/pi-hacking/pij-worktrees/s091-pa-gate-repair`, boundModel `claude-opus-5`, effort `high` |
| pane/process probe | **PASS** — pane `%953`, pane_pid 76803 → `copilot --yolo --session-id 6650ca7c… --model claude-opus-5 --context long_context --effort high` |
| cwd + branch | **PASS** — worktree correct; `s091/pa-gate-repair` |
| second send (input reliability) | **PASS** — release instruction delivered and acted on |
| lineage | `pij link pij-yucky-mosquito --parent pij-respectable-starfish --role worker` |

## Discrepancy worth recording

The peer **self-reported `effort=n/a`** ("no pane footer effort setting visible"), while its own
process args carry `--effort high`. The self-report was not wrong-but-close; it was **absent**,
and an orchestrator trusting it would have concluded the effort was unset.

This is exactly the case `government/orient-local.md` § Fleet defaults warns about — *"canary the
effort mechanically — self-reports have lied; process args are truth"* — and it is the same
absence-read-as-value failure class this whole plan (`#95`) exists to fix, showing up in the
canary ritual rather than in the product. Mechanical verification is what closed it.
