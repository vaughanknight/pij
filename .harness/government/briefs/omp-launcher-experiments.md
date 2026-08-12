# Brief — omp (oh-my-pi) as a pij-spawnable harness: experiments

**You are** a Claude Code (Opus 4.8) agent spawned by `pij-reasonable-dove` (o-prime) to
**investigate whether pij's launcher can drive omp**, or what work it needs. You are pij-blind
at boot; your pij-id arrives via daemon bind. Reply with `pij send pij-reasonable-dove "<text>"`.
This is EXPERIMENTS + a scoped report — do NOT modify pij core/launcher without an explicit grant.

## What omp is (confirmed)
- `omp` = "oh-my-pi" v17.0.5 at `/Users/jordanknight/.local/bin/omp`. A model-flexible agent CLI:
  `omp [COMMAND] MESSAGES`, `--model` (fuzzy: "opus", "gpt-5.6-sol"), `--smol/--slow/--plan`
  tier models, `--prewalk`. Run `omp --help` for the full surface.
- **omp already loads pij**: a running omp session shows a `pij ⎇ main` status-bar segment, gets a
  pij-id, and supports `/rename pij-remote-lobster`. So omp can already BE a pij peer on the
  receiving side. Live subjects to OBSERVE (do not disrupt — they're Jordan's): tmux window 2,
  pane `%1971` (Opus 4.8) and `%1972` (gpt-5.6-sol).

## The core question
`pij spawn` supports only `--harness pi|claude|copilot|codex` (`HarnessKind` union in
`.pi/extensions/pij/core/types.ts`; command builders in `.pi/extensions/pij/core/spawn.ts` —
`buildSpawnCommand` for pi, `buildControlSpawnCommand` for daemon-bound harnesses). **Can pij
launch + drive omp as-is, or what must be built?**

## Experiments (characterize omp's control plane — same axes as pi/claude/copilot/codex)
1. **Headless/scriptable launch**: how to start omp non-interactively; the permission-bypass flag
   (interactive shows "bypass permissions on / shift+tab to cycle" — find the CLI flag, like
   claude `--dangerously-skip-permissions` / copilot `--yolo`); deterministic session-id control
   (does omp accept/print a session id, like copilot `--session-id`?).
2. **Binding model**: does omp SELF-REGISTER at boot like pi (no daemon bind), or need daemon
   discovery like claude/copilot/codex? The status-bar pij-id + `/rename` implies it self-loads
   the pij extension — determine exactly how its id is assigned and whether the daemon must bind it.
3. **Readiness / busy anchors**: what pane text marks omp "ready to receive" vs "busy" (the footer
   the daemon would regex — cf. my copilot/codex control-plane memories where a footer-drift caused
   never-bind traps). Capture the exact idle vs working footer strings.
4. **Send / inject**: how a turn is delivered into an omp pane (tmux send-keys? does omp expose an
   inbox / a `pij`-native receive?). Test whether `pij send <omp-id> "..."` already reaches a
   running omp seat (the two live panes self-register — try it, carefully, on one).
5. **Model qualification**: the exact `--model` strings that work (opus, gpt-5.6-sol, provider
   forms). Whether omp needs a provider prefix like pi (`github-copilot/...`).

## Deliverable
- An **omp control-plane facts report** at `.harness/temp/omp/omp-control-plane-facts.md` (create
  the dir), same shape as the fleet's copilot/codex control-plane notes: bind mechanism, readiness
  anchor, busy footer, send/inject path, permission-bypass flag, session-id control, model forms.
- A **verdict + scope**: one of {USABLE-AS-IS (pij can already drive omp — how), or NEEDS-WORK
  (enumerate: new HarnessKind branch, buildSpawnCommand/buildControlSpawnCommand changes, binding
  adapter, readiness/busy regexes, model-qualification) with a rough effort estimate}.
- `pij send pij-reasonable-dove` a short pointer to the report + the verdict line.

## Guardrails
- **fd-constrained machine**: the tmux server is at ~251/256 fds. Prefer OBSERVING the two existing
  omp panes over spawning new ones; if you must spawn a test omp, do ONE bounded instance and close
  it after. Never spawn in a loop. Report if you hit `Too many open files`.
- NO edits to pij core/launcher, NO daemon restart, NO changes to Jordan's live omp panes beyond a
  careful single `pij send` probe. Read-only investigation → report → await a grant for any build.
