# Peer harvest — the coder and reviewer buffers, before teardown

Both fleet peers were closed after this file was written. Everything with a transcript already
lives in `execution.log.md`, `mutation-ranking.md`, `plan-validation-v1.md` and the code comments.
**This file holds only what existed nowhere else** — rejected designs and their reasons, mutants
considered and discarded, beliefs corrected mid-flight, clean sweeps that never became findings,
and each peer's read on where the change gets broken next.

- **Coder** — `pij-free-porpoise`, GitHub Copilot CLI · `claude-opus-5` · effort high
- **Reviewer** — `pij-ultimate-fowl`, GitHub Copilot CLI · `gpt-5.6-terra` · effort high (cross-model)

---

## 1. Rejected designs — keeping a `--body-file` body out of argv

The shipped design is a NUL sentinel that holds the body's argv slot during parsing, with the
literal bytes attached to the *parsed* command. What lost, and why:

| Rejected | Why it lost |
|---|---|
| Pass `--body-file` through to core and read the file at dispatch | **Organisational, not technical.** Adding a flag to core's send parse table widens the edit fence into the `whoami` region a co-owning stream held. Secondary: core does not reliably know the *caller's* cwd, so relative paths resolve against the wrong directory. **This is the design a future reader will re-propose first, and it is the right design once the fence is gone.** |
| No placeholder at all — attach `cmd.text` after parse | `parseArgs` validates arity and "nothing to send" **before** you get control, so `send tgt` with no positional fails `E-ARG` at parse and there is no post-parse moment to attach into. **The placeholder exists to satisfy the parser's own arity check, not to carry data.** Anyone reading it as a data channel will "simplify" it away and get `E-ARG` for every `--body-file` send. |
| Placeholder appended last in all cases | A trailing valued flag (`--wait`, `--caption`) swallows it as its value. Hence insertion immediately after the target-id positional. **Broadcast has no target-id positional, so last is the only option there** — safe only because `--to` is repeatable+valued and consumed pairwise. That asymmetry is deliberate. |
| Empty string as the placeholder | Refused by this plan's *other* half (the empty-payload guard), and indistinguishable from a genuinely empty body. |
| Random/UUID sentinel | Lost to NUL: **NUL cannot appear in a POSIX argv at all**, so collision is impossible by construction rather than by improbability, and it needs no generation or threading. The coder *checked* rather than assumed that `String.trim()` does not strip `U+0000` (it strips WhiteSpace and LineTerminator; `U+0000` is neither), so the placeholder survives the new emptiness guard. |
| stdin pipe | `pij send` is invoked from agent tool calls and `tmux send-keys` contexts where stdin is not reliably a pipe; it also fights `--wait` and makes real-bin `spawnSync` tests much harder. *(Coder flags this as moderate confidence that it was weighed explicitly rather than dismissed early.)* |
| Environment variable | The body becomes visible in process environment listings, plus platform size limits. |

## 2. Mutants considered and discarded

| Mutant | Why not |
|---|---|
| Mutate the placeholder constant (NUL → `"x"`) | **Too loud.** It reddens large swathes of unrelated tests, so it proves nothing specific. *A mutant that kills everything is as useless as one that kills nothing.* |
| Remove `"to"` from `REPEATABLE_FLAGS` as a valence probe | **Equivalent-for-the-wrong-reason.** It breaks broadcast on the *repeatability* axis, not the *valence* axis — it would have gone RED while proving nothing about the mirror, i.e. **false comfort on exactly the pin that later turned out to be vacuous.** |
| Mutate `VALUED_FLAG_OVERRIDES` | Does not apply — there is no `send` entry to mutate. Adding one is authoring behaviour, not mutation. |
| Any mutant against the real-bin cases via `mutate.mjs` | Does not apply, and it is a sharp edge: the transform is in-memory, so every `spawnSync` case loads unmutated source from disk and is **immune**. **You cannot use `mutate.mjs` to prove the real-bin cases at all** — they need edit-and-restore. |
| `targetRendersAttachments() => false` | **Never considered** by the reviewer, which is the finding. It ran only the permission-*expanding* `=> true`. The opposite polarity attacks the attachment-only PULL permission instead of accidentally admitting PUSH delivery. In its own words: *"a real hand-chosen-mutant blind spot, not a deliberate rejection."* It was later pre-registered as this stream's rank 1 and it killed AC-06. |

## 3. Beliefs corrected mid-flight

- `.trim()` would eat the NUL placeholder and break the `--body-file` route through the new guard —
  **false**, and wrong in the *safe* direction, but only established by checking.
- F2's valence gap was one flag (`--to`, as the fix packet named it) — **false: all five valued arms
  were absence assertions.** The loop that read as five assertions was zero. **The packet
  under-reported its own finding and the coder nearly fixed only what it named.**
- Broadcast shared the single-target dispatch guard — **false**: there are **three** separate guard
  sites (broadcast parse, broadcast dispatch, single dispatch). Fixing one leaves two, silently.
- `npm ci` works in a fresh worktree — **false** (F-206).
- A repo-wide `rg` sweep sees the extension source — **false**, `.pi/` is hidden. The coder hit this
  **despite it being documented in `AGENTS.md`**, which is the data point: *the prose did not prevent
  the error.*

## 4. Clean sweeps that never became findings

Recorded because clean results are invisible by construction — nobody writes down what they looked
at and found fine, so the next reviewer cannot tell where the time has already been spent. The
reviewer confirmed, **directly against source rather than inferred from a green log**: the full D2
matrix (PULL attachment-only delivers, PUSH attachment-only refuses, `--command` exempt); raw body
delivery stays separate from admission trimming; `--body-file` attaches literal bytes after parse;
the wrapper's mirror matches today's core valence; **no fourth `send` receipt path exists**; the
`whoami` regions and imports are untouched; the tests-before-fix split history and the working tree
are clean.

## 5. Where this gets broken next — ranked by how natural the mistake looks

1. **Deleting the F1 asymmetry.** The emptiness *test* trims while the *delivered* body does not.
   That looks like an oversight, and collapsing them is a one-token change that reads as cleanup and
   silently violates byte-for-byte delivery. **There is a comment. Comments lose.**
2. **Making the guard global.** *"Just refuse empty bodies"* is the natural simplification and it
   **deletes a shipped capability** (AC-06). The capability-awareness reads as incidental complexity
   and is not.
3. **The fourth guard site.** There is no chokepoint — a new send entry point or transport gets no
   guard and nobody notices, because the failure mode is a successful-looking delivery.
4. **Argv normalisation in the bin.** Any future sanitize / strip-control-chars pass removes the NUL
   placeholder. **The two halves of this plan cover each other exactly once, here**: the body then
   becomes empty and the emptiness guard refuses it, so it fails loudly instead of delivering blank.
5. **Positional drift.** `sendPositionalIndices` breaks if anyone adds or reorders a send positional;
   the valence pin catches *valence* drift only and stays green through a positional change.
6. **A brand-new valued send flag** needs the mirror updated by hand and no test will fail. This is
   the residual the deferred "export core's flag tables, delete the mirror" issue closes.
7. **Reviewer's second pick**: a maintainer "simplifies" the three whitespace admission checks by
   trimming the body used for *delivery*, restoring byte loss. *Keep decision normalisation and
   delivered bytes structurally separate.*

## 6. Noticed in the send path, reported not fixed

Per the charter's report-don't-fix rule. **None verified to defect level — leads, not findings.**

- **`--caption` with no `--file`** appears to be accepted and then attach to nothing. If so it is the
  same family as #132: success receipt, payload discarded. Cheapest item here to check.
- **`--body-file` / `--file` paths resolve against the bin's cwd.** Every packet telling a peer to
  "use absolute paths" is a workaround for this, not a fix.
- **No size cap on `--body-file`** — a large file becomes one message; behaviour at scale unknown.
- **Encoding**: the body is read as `utf8`, so a binary/non-utf8 file would be delivered **lossily
  with a success receipt** — this plan's own thesis, one layer down. Untested.
- **Two error surfaces for one user error**: the empty-payload refusal exists at both broadcast parse
  and dispatch with different wording; the `blank (whitespace only)` phrasing was never separately
  ruled on.

## 7. Evidentiary gap the coder disclosed, and its closure

The coder's six-mutant valence loop **filtered its output with a grep that matched the `GATE` line
but not the failure lines**, so per-mutant *named test* evidence was captured for only `to` and
`json`. It disclosed this unprompted rather than letting "six for six" stand.

Re-run here, on disk, one mutant at a time, with the named failing test recorded:

| Mutant (added to `BOOLEAN_FLAGS`) | Named test that failed |
|---|---|
| `command` | `--command is VALUED: the name lands in \`command\`` |
| `file` | `--file and --caption are VALUED: the path and the sentinel land in their own slots` |
| `caption` | `--file and --caption are VALUED: …` (`E-ARG: --caption needs text`) |
| `wait` | `--wait is VALUED: the milliseconds land in \`waitMs\`, not in the body` |
| `to` | `--to is VALUED: both targets land in \`targets\`, the sentinel stays the body` (already evidenced) |

All five valued arms are non-vacuous. Byte-identical restore after each.

**Worth recording: my first two re-run attempts reported `RED: NONE` for every mutant — because my
own extraction pattern was wrong, not because the tests were silent.** I nearly filed my own
non-vacuous tests as vacuous. That is the coder's grep defect, reproduced by the person auditing it,
within the hour — and it is the same shape as everything else here: **an instrument's own convention
rendered as a fact about the subject.** The fix both times was to stop trusting the filter and read
the raw output.

## 8. Review-process friction, from the reviewer

- **The review target advanced after the requested range.** Useful for repair, but it blurred whether
  an observation was about the assigned commits or later HEAD. **Future packets should name an
  immutable review SHA** and request a distinct delta review for follow-ups.
- **Put parser-valence pins in a pure parser spec**, not a mixed integration spec that also shells
  out — otherwise future mutation proof depends on judging which assertions crossed the process
  boundary.
- **Near-miss verdict, disclosed**: the reviewer considered blocking on the duplicated send-flag
  valence knowledge in the bin as a design defect. It did not elevate it because exporting
  core-private tables would cross the edit fence into a live co-owner, and a truthful shape-specific
  pin limits the present drift risk. **It still holds that the exporter/removal is the stronger
  eventual design.**

## 9. The coder's closing lesson

> **Absence is the return value of every failure mode there is.** A test that asserts a value is
> *absent* cannot distinguish "the mechanism consumed it" from "the whole operation failed". Assert
> **which slot** the value landed in.
>
> The vacuous pin was written **inside a change whose entire subject is instruments reporting success
> while dropping the evidence**, and neither of us caught it by reading — only by mutation.
