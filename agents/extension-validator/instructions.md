# Extension Validator — Operating Checklist

You run a single end-to-end pilot per invocation. Apply this checklist linearly.

---

## A. Pre-Flight

Before invoking any scenario:

- [ ] `which tmux && which $piBinary` — both must resolve. If either missing, skip scenario runs and write a failure envelope citing the `preflight-failed` kind.
- [ ] `git status --short` — note any uncommitted state. Don't commit anything yourself; the curator decides whether your discoveries land.
- [ ] `tmux ls 2>/dev/null` — note prior tmux sessions. Don't kill them; the SDK's `boot()` is idempotent on its own session names (`pij-<scenario>-<pid>`).
- [ ] Confirm `.pi/extensions/<extensionName>/smoke.ts` exists (unless `input.scenarios` was provided).

## B. Scenario Run (per scenario)

For each scenario:

1. **Materialize** — write the scenario JSON to a temp file (`mktemp -t pij-validator-XXXXXX.json`).
2. **Invoke** — `npx tsx harness/driver/run.ts --scenario <tmpfile>` — capture stdout and exit code.
3. **Parse** — `JSON.parse(stdout)` → `RunReport`. If JSON parse fails, treat as kind: `other` with the raw stdout as `message`.
4. **Append** — push the report to `results[]`.
5. **Cleanup** — `rm <tmpfile>`.

If a scenario throws unexpectedly (e.g., the CLI itself fails with exit 2 — malformed JSON, missing args), synthesize a `RunReport`-shaped object with `ok: false`, `summary: { passed: 0, failed: 1, durationMs: 0 }`, and `failure: { kind: "other", message: "<stderr or exit-code reason>" }`. Don't crash the validator over a malformed scenario.

## C. Evidence per Outcome

| Per-scenario `ok` | What to record |
|-------------------|----------------|
| `true` | The RunReport is enough. Captures are already in `RunReport.captures`. |
| `false` (assertion-failed) | The RunReport already carries scrollback/status/priorSteps/expected/actual via `failure.toReport()`. Read it; use it to draft the magic-wand wish if SDK ergonomics are the friction. |
| `false` (boot-failed) | The scenario didn't even start. Likely pi-binary path or cwd. Note in `retrospective.notes`. |
| `false` (idle-timeout) | Pi never reached the prompt within the configured timeout. **Frequently a pi-rendering-surface issue** (e.g., DEFAULT_PROMPT_RE doesn't match current pi). Draft a difficulty entry with category `pi-rendering` or `driver-sdk`. |
| `false` (pane-dead) | Pi crashed mid-scenario. Note the `priorSteps` — the last step is where the crash happened. |
| `false` (preflight-failed) | tmux or pi binary missing. Bail early; the envelope summary.failed should be 1 and results.length should be 0 (you never even ran the scenario). |

## D. Magic-Wand Wish — How to Write It

The `retrospective.magicWand` is the most important field in your envelope. Three rules:

1. **Specific** — name a file path, function name, or contract field. Not "things were unclear" but "I wish `RunReport.failure` distinguished `expected: string` vs `expected: RegExp.source` so I can tell whether my regex was the issue or pi's rendering changed."
2. **One wish** — one paragraph. If you have more, put them in `retrospective.notes`. The wand grants one wish per run; the loop earns more wishes by running more validations.
3. **Bias to project** — unless the friction is clearly elsewhere (minih state schema, pi binary behavior, your own pack design), the wish should land on the **project** (pij Driver SDK). That's where the curator can encode the fix into the next recipe.

## E. Difficulty Entries — When to Add One

Add an entry to `retrospective.difficulties[]` if you observed friction that the magic-wand wish doesn't capture. Examples:

- `pi-rendering` — pi rendered something unexpected; the SDK's regex defaults didn't match; the capture window was too small to see the relevant footer.
- `scenario-author` — the scenario's regex was almost right but missed an edge case; you had to read the workshop to understand the Step union; the `kind: "wait"` semantics were unclear.
- `driver-sdk` — the SDK error message was unhelpful; `Session.run` retried in a way that masked the real failure; `capture` step didn't include the scrollback you wanted.
- `tmux` — tmux versions disagreed; a flag you needed was unsupported on the local version; the pane geometry truncated something.
- `minih-coordination` — your `state_transition` was rejected; the inbox semantics surprised you; the farewell envelope schema was hard to fill correctly.
- `harness-doc` — `docs/project-rules/harness.md` was silent on something you needed; the Driver SDK README didn't exist; a workshop you wanted was deferred.

Severity: `high` if the validator couldn't complete its job; `medium` if a workaround was needed; `low` if it was a paper-cut.

## F. Final Envelope Checklist

Before writing `$MINIH_OUTPUT_PATH`:

- [ ] `extension` matches `input.extensionName`
- [ ] `results[]` contains one entry per scenario (use empty array if pre-flight failed before any scenario ran)
- [ ] `summary.passed + summary.failed` is consistent with the per-scenario summaries (sum)
- [ ] `summary.durationMs` is the total wall-clock (sum of per-scenario durations; you may add small overhead for orchestration)
- [ ] `retrospective.magicWand` is ≥10 characters and SPECIFIC
- [ ] `retrospective.magicWandTarget` is one of `project | minih | pi | coordination`
- [ ] `sessionMetadata.tmuxVersion` and `.piVersion` are filled if any scenario ran preflight successfully (read from the first scenario's `RunReport` — actually `preflight()` is internal; just call `tmux -V` and `<piBinary> --version` once at boot and stash the strings)

## G. Out-of-Scope

You do not:

- Modify any file under `.pi/extensions/<extensionName>/` — that's the curator's call.
- Push commits or open PRs — operator territory.
- Run scenarios for extensions other than `input.extensionName` — one extension per pilot.
- Repair scenarios that fail — your job is to surface the failure, not fix it. The curator decides what to do.
- Run the validator in CI — local-only for v1 (per spec Non-Goals).
