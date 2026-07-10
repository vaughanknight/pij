# FX001 Execution Log

## 2026-07-10 — FX001-1 live composer-clear spike

- Spawned throwaway peer `pij-xfvqx3` in Copilot pane `%866` with model
  `gpt-5.6-sol`.
- Single-line probe `FX001_SINGLE_CLEAR_PROBE_7f3a`: `C-u` cleared the composer.
- Multiline probe entered with `M-Enter`: `C-u` removed only the current logical
  line and left `FX001_MULTI_LINE_ONE_7f3a`; `Escape` did not clear it.
- `C-a C-k` cleared the remaining single logical line, but is not sufficient by
  itself for arbitrary multiline input.
- Proven clear mechanism: `tmux send-keys -t <pane> -N <text-character-count>
  BSpace`.
  - A 256-key burst cleared `FX001_BSPACE_SINGLE_aa11`.
  - A 256-key burst cleared a three-line payload.
  - An exact 67-key burst, equal to the three-line payload's character count
    including its two newlines, cleared the composer completely.
- Every empty verdict was verified with `tmux capture-pane -t %866 -p`; the
  composer showed only the empty `❯` prompt.
- Closed throwaway peer `pij-xfvqx3` and pane `%866`.

**Spike verdict:** for the probed ASCII single-line and multiline payloads, use
one named-key call with `BSpace` repeated by at least the payload character
count immediately before every re-type. The live spike did not exercise
non-BMP Unicode; implementation uses the payload's UTF-16 unit count because
Copilot's input reducer removes one UTF-16 unit per backspace. Do not use `C-u`
as the clear primitive.

## 2026-07-10 — FX001-2 behavior-neutral DI seam

- Added optional `DaemonTmux` constructor dependencies `{ runner, sleep }`.
- Defaults remain `execFileRunner` and `sleepSync`.
- Routed composer capture, key injection, focus wake, and sleeps through the
  injected dependencies without changing retry logic.
- Ran the existing full suite with zero test edits: 117 files passed, 4
  skipped; 1,580 tests passed, 10 skipped.

## 2026-07-10 — FX001-3 scripted regression tests

- Added phase-specific runner/capture scripts in dossier order `(a)/(b)/(d)/(c)`.
- Before implementation all four were RED:
  - `(a)` observed 3 type argvs instead of 1.
  - `(b)` observed 9 type argvs and no immediately preceding clear.
  - `(d)` observed 12 type argvs instead of the 9 allowed across three outer
    attempts.
  - `(c)` observed focus-IN immediately before outer re-types instead of clear.
- Mutation checks after implementation:
  - `TYPE_CONFIRM_POLLS = 1` made `(a)` RED.
  - Removing the inner clear made `(b)` RED.
  - `TYPE_CONFIRM_ATTEMPTS = 4` made `(d)` RED.
  - Removing the outer clear made `(c)` RED.

## 2026-07-10 — FX001-4 implementation and gates

- Added exported `TYPE_CONFIRM_ATTEMPTS = 3`, `TYPE_CONFIRM_POLLS = 8`, and
  `TYPE_CONFIRM_POLL_MS = 250`.
- Each type attempt now settles for up to 2 seconds before an empty composer is
  treated as genuine loss.
- Every inner and outer re-type is immediately preceded by the proven
  text-length `BSpace` burst. The length is measured in UTF-16 units
  (`text.length`), matching Copilot's input reducer and safely over-clearing
  CRLF-normalized input because backspace at cursor zero is a no-op.
- The foreign-text abort and `wake = false` paths retain their prior control
  flow.
- Required gates:
  - `npm test`: 117 files passed, 4 skipped; 1,585 tests passed, 10 skipped.
  - `just typecheck`: passed.
  - `just lint`: passed with only the repository's existing warnings.
- Additional `harness checks`: typecheck, lint, test, package audit, and
  snapshots passed; the unrelated `ralph-loop_compact-survival` smoke sensor
  failed twice on its pre-existing compaction-output assertion.

## 2026-07-10 — review fix: astral Unicode clear count

- Reviewer identified that `[...text].length` counts Unicode code points while
  Copilot's reducer removes one UTF-16 code unit per backspace.
- Added a framed non-BMP loss-path test using `[pij from pij-x] hi 😀`.
- The test was RED with an exact argv mismatch: 21 backspaces received versus
  22 required.
- Changed the clear count to `text.length`; the test and full suite are green.