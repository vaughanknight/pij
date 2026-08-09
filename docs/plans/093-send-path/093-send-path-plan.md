# 093 — Send-path integrity: a safe body channel (#128) and an honest receipt (#132)

**Status**: READY (v2 — rewritten after independent validation found 5 blocking issues in v1)
**Mode**: Simple (one phase)
**Branch**: `s093/send-path` · worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s093-send-path`
**Stream**: `send-path` · **Wave**: `w1-hardening` · **Prime**: `pij-continuing-ermine` · **PM**: `pij-historical-skunk`
**Research**: `assets/research-dossier.md` · **Validation**: `assets/plan-validation-v1.md`
**Issues**: pij#128, pij#132 · **Split out**: pij#167 (parent-argv detector — explicitly NOT this work)

---

## Business Specification

### The problem

`pij send` is the channel a whole fleet runs on — briefs, rulings, questions, findings. It is
failing in **two opposite directions**, and both failures render as ordinary output.

**#128 — it says too much.** `pij send <id> "<text>"`, the form pij documents first, is a
double-quoted shell argument. When the body is *relayed* text (a log line, a peer's report, a
source excerpt) it routinely contains `` ` `` or `$( )`, and the **caller's shell executes it**
before pij's process exists. The message delivers anyway, mangled, with a success receipt. The
dangerous case is the silent one: a body containing real command names (`test`, `time`, `sort`,
`open`, `kill`) executes and leaves no trace, while a body of invented words errors loudly and
looks like the whole problem.

**#132 — it says nothing.** `pij send <peer> --file <path> --caption "…"` delivers an **empty
body** and reports `queued`/`delivered`. This cost one orchestration session four lost dispatches
that were read as worker disobedience.

### What the research and validation changed

Three findings overturned the framing. **Two of them changed this plan after v1 was written**, so
they are stated first.

**① The safe path is itself unsafe (KF-7, KF-8).** The fleet's whole #128 workaround is
`--body-file`. It does not deliver bodies verbatim, and it is broken *specifically for the hostile
bodies it exists to carry*:

- `.pi/extensions/pij/cli.ts:4253` does `body.trimEnd()` — trailing whitespace and newlines are
  silently destroyed.
- The same line **re-appends the body as an argv token**, which is then lexed by
  `core/cli.ts:707-720`. A body whose first characters are `--` is parsed as a **flag**. And
  because `--wait` takes an optional value on `send` (`core/cli.ts:1084`), `pij send <id> --wait
  --body-file f` silently consumes the file's contents as `--wait`'s value.

So the one channel documented as literal is neither literal nor robust. **This is the same defect
as #128, one layer down: the mitigation reproduces the flaw it mitigates.**

**② The unsafe form is taught by pij itself, and the safety note is invisible where it is read
(KF-9, KF-10).**

- `core/harness/claude.ts:152-156` composes the boot message every spawned peer receives, and it
  says: ``Message other sessions with `pij send <id> "<text>"` `` — the unsafe form, machine-taught
  at boot, to every seat on the box.
- `pij send --help` filters USAGE to lines containing the literal `pij send`
  (`.pi/extensions/pij/cli.ts:4216`). The shell-expansion warning at `cli.ts:326` is an indented
  continuation line and **does not contain that string**, so it is **dropped**. The one safety note
  that exists is not shown by the command a caller runs to read about safety.

The prime's bar is *"the unsafe path is LABELLED as unsafe, at the surface, where a caller reads
it"*. These two are that surface.

**③ #132 is not a race — it is a mis-named flag (KF-1, KF-2).** `--file` is *reference-passing*
by design: it attaches `{path, caption}` and sets the body to `""`; it never reads the file, and an
existing test pins that. Attachments are rendered by only two consumers — the telegram bridge and
the `pij inbox` **pull** renderer — and **both push injectors drop them**. The proximate cause of
the misuse is a one-letter collision: `--body-file` (reads the file *as* the body, documented) vs
`--file` (attaches a path, **absent from USAGE**).

**#128 cannot be fixed by hardening delivery.** The send path already honours the repo's argv-only
discipline — `execFileSync` with an argv array, no `sh -c` anywhere (KF-6). Expansion completes in
the caller's shell before pij starts.

### The done-bar, as corrected by the prime (2026-08-08)

The charter originally said #128 was done when a body with backticks "is delivered verbatim and
executes nothing". **That bar is unattainable pij-side and has been struck** — pij never receives
the pre-expansion string. The replacement bar, ruled by `pij-continuing-ermine`:

> - A safe path exists and is **unambiguous** (`--body-file` / stdin).
> - The safe path is what the docs and `--help` **RECOMMEND** for any relayed or untrusted content.
> - The unsafe path is **LABELLED as unsafe, at the surface, where a caller reads it** — not in an issue.

**The safety property is carried by the safe path, never by a detector.** The parent-argv detector
this PM verified as feasible is filed as **pij#167** and is deliberately out of scope: it fails
open on a security boundary, is structurally blind to interactive invocation, and would convert
*"I must use `--body-file` for relayed text"* into *"pij will tell me"*.

Finding ① makes the first clause of that bar load-bearing: **"a safe path exists" is currently
false**, so fixing `--body-file` is not polish, it is the prerequisite for everything else.

### Acceptance criteria

| ID | Kind | Criterion | Issue |
|---|---|---|---|
| AC-01 | BEHAVIOURAL | A send whose **delivered payload would be empty for that target** is refused with `E-EMPTY`, a non-zero exit, **no message written and no receipt emitted**. Covers `--file`-only to a push peer and an explicit `""` body. | #132 |
| AC-02 | BEHAVIOURAL | The guard keys on **emptiness of what the target will actually receive**, not on which flag was used — `pij send <id> ""` is refused identically. | #132 |
| AC-03 | BEHAVIOURAL | The guard sits in `dispatch`, after target preflight and **before** `deps.delivery.deliver`, so **every** caller inherits it — CLI, the `pij_send` tool, and direct `dispatch()` callers. | #132 |
| AC-04 | BEHAVIOURAL | Broadcast (`--to` … `--to`) refuses an empty text body too, and does so before any target is delivered to. | #132 |
| AC-05 | PRESERVED | `--command` sends are **exempt**: they legitimately carry `body: ""` and still deliver. | regression |
| AC-06 | PRESERVED | Attachment-only sends to a target that **can** render attachments (pull-mode / telegram) still work — the shipped Plan-026 capability is preserved. | regression |
| AC-07 | BEHAVIOURAL | A send carrying text **plus** an attachment the target cannot render still delivers the text, but **says so**: a stderr warning and a machine-readable field in `--json`. It never silently drops the reference. | #132 |
| AC-08 | BEHAVIOURAL | `--body-file` delivers **byte-for-byte**: no `trimEnd`, trailing newlines and whitespace preserved. | #128 |
| AC-09 | BEHAVIOURAL | A `--body-file` body is **never lexed as argv**. A body beginning `--wait`, `--json` or `-` arrives as text, and cannot be consumed as another flag's value. | #128 |
| AC-10 | BEHAVIOURAL | `--body-file -` reads stdin, so `pij send <id> --body-file - <<'PIJ'` is a single-command literal form the caller's shell cannot expand. | #128 |
| AC-11 | BEHAVIOURAL | `pij send --help` **shows** the safety guidance: it recommends `--body-file`/stdin for relayed or untrusted content, documents `--file` distinctly, labels the quoted-body form unsafe, and includes the heredoc form. (Today the warning line is filtered out.) | #128 |
| AC-12 | BEHAVIOURAL | The boot message pij composes for every spawned peer teaches the safe form for relayed content instead of only the quoted form. | #128 |
| AC-13 | BEHAVIOURAL | Refusal and warning messages **name the safe path** — a caller who hits a guard is told what to do, at the surface. | #128/#132 |
| AC-14 | meta | Every guard has a **control test** that is RED against the pre-fix tree, recorded as an actual observed run, not a comment. | charter |

**Criterion kinds** (fleet shape adopted 2026-08-08 from s095, prime ruling): **BEHAVIOURAL**
must FAIL on pre-fix code, and fail as a failure rather than a crash — that failure is *measured and
pasted into the execution log*, never reasoned about. **PRESERVED** must pass before *and* after: it
is a regression guard and is **never evidence of the fix**. **NEW-API** cannot fail first (it will
not compile) — this plan has none. AC-05, AC-06 and the no-warning half of AC-07 are PRESERVED and
are recorded in the execution log as *"control — passed before and after"*, so they cannot be
mistaken for evidence.

**No repeated tick or sweep is touched.** The guard runs once per `send` invocation; there is no
per-tick transition table to pin, and no persistent-absent state that could produce a notice storm.

### Non-goals

- The parent-argv detector (pij#167). Not built, not partially built, never referenced as protection.
- Changing what `--file` *means*. It stays reference-passing; the telegram bridge is a real consumer.
- Any change to the telegram bridge, `pij inbox` rendering, or the daemon router.
- Other instances of this class elsewhere in the send path — **report, do not fix** (charter).
- Report-limit documentation (pij#123). Known, not ours.

---

## Implementation Plan

## Phase 1: Honest receipt + safe body channel

### Key findings (grounding — read before touching code)

| # | Finding | Evidence |
|---|---|---|
| KF-1 | `--file` sets `body: cmd.text ?? ""` and attaches metadata; the file is never read. An existing test **pins the empty body as correct** and calls `dispatch` **directly** — so a parse-only guard cannot change it. | `core/cli.ts:3014-3025`; `core/cli.test.ts:745-770` |
| KF-2 | Both push injectors ignore `attachments`; only the pull renderer and telegram render them. | `core/daemon/router.ts:41`, `core/session.ts:592` vs `core/inbox.ts:359`, `telegram/bridge.ts:552-587` |
| KF-3 | `classifySendReceipt` keys **only** on descriptor liveness + daemon authority. Body length is never an input — #132's actual defect. | `core/cli.ts:2107-2126`; used at `:3042` and via `sendSuccess` `:2128-2140` |
| KF-4 | The "nothing to send" guard tests `text === undefined`, so `""` slips through. It lives at **`:1082-1083`** (v1 said 1084 — drifted). | `core/cli.ts:1082-1083` |
| KF-5 | The **broadcast branch returns at `:1035-1044`**, before that guard. Broadcast needs its own check. | `core/cli.ts:1013-1044` |
| KF-6 | Delivery is argv-only (`execFileSync`); the only `sh -c` in the extension is `core/bg.ts:131` (background jobs, unrelated). | `adapters/tmux-keys.ts:11-32` |
| KF-7 | `--body-file` does `body.trimEnd()` — **not byte-for-byte**. | `.pi/extensions/pij/cli.ts:4253` |
| KF-8 | `--body-file` **re-appends the body as an argv token**, which is then lexed. `--`-leading bodies become flags; `--wait` is valued on `send`, so it can swallow the body. | `.pi/extensions/pij/cli.ts:4253` + `core/cli.ts:707-720` + `core/cli.ts:1084` |
| KF-9 | `pij send --help` keeps only USAGE lines containing `pij send`; the safety warning at `cli.ts:326` is an indented continuation and is **dropped**. | `.pi/extensions/pij/cli.ts:4216` vs `:325-327` |
| KF-10 | pij's own spawn onboarding teaches the unsafe quoted form to every peer. | `core/harness/claude.ts:152-156` |
| KF-11 | `PijErrorCode` is at `core/types.ts:594`, and `EXIT: Record<PijErrorCode, number>` at **`core/cli.ts:665-678`** is **exhaustive** — adding a code without extending the map fails typecheck. | `core/types.ts:594`; `core/cli.ts:665-678` |
| KF-12 | Effective delivery mode is `deliveryMode ?? (paneId ? "push" : "pull")`; the expression already exists in the bin. `DeliveryMode = "push" \| "pull"`. Sessions registered via `pij inbox register` are `pull`. | `.pi/extensions/pij/cli.ts:910-912`; `core/types.ts:34`; `core/current-session.ts:215` |
| KF-13 | The `pij_send` tool calls `dispatch` directly and already trims + rejects empty messages — no regression there, and it inherits a dispatch-level guard for free. | `.pi/extensions/pij/index.ts:84-103` |

### Design decisions

**D1 — The guard lives in `dispatch`, not in `parseArgs`.**
v1 put it in the pure parse. Validation killed that: the pinned contract test calls `dispatch`
directly (KF-1), the `pij_send` tool calls `dispatch` directly (KF-13), and — decisively — **parse
cannot know the target**, which the capability rule requires (D2). Placing it in `dispatch` after
preflight and before `deliver` gives one enforcement point every caller inherits (AC-03), and
guarantees no receipt can exist for a refused send because `classifySendReceipt` runs strictly
after `deliver` returns (`core/cli.ts:3027-3042`). Broadcast keeps an **additional** parse-time
check (AC-04) because its branch returns before any shared code (KF-5).

**D2 — Refuse on *effective emptiness for this target*, not on flag shape.**
The rule, in one sentence: **refuse when the target would receive no content it can render.**

| body | attachments | target renders attachments? | command | verdict |
|---|---|---|---|---|
| non-empty | any | any | — | deliver |
| empty | none | — | — | **refuse `E-EMPTY`** |
| empty | present | yes (pull/telegram) | — | deliver (AC-06 — shipped capability) |
| empty | present | no (push) | — | **refuse `E-EMPTY`** ← this is #132 |
| empty | — | — | set | deliver (AC-05 — commands are legitimately bodyless) |
| non-empty | present | no (push) | — | deliver **+ warn** (AC-07) |

v1 said "global refusal", which would have deleted the Plan-026 telegram capability (KF-2). The
dossier had it right; the plan drifted. Capability is `effectiveDeliveryMode(target) === "pull"`
(KF-12) — extract it as a small pure helper in core rather than re-deriving it.

**D3 — `E-EMPTY` is a new code, and extending the exhaustive exit map is a *task*, not a side effect.**
A wrapper script must be able to gate on "you sent nothing" distinctly from "you typed the flags
wrong". `core/cli.ts:665-678` is exhaustive over `PijErrorCode` (KF-11), so T001 explicitly
includes it — **and the edit fence below is widened to name that block**, since it sits outside the
regions v1 declared. Exit code: `2` (a refusal about the request's *content*, matching `E-SELF`),
not `64` (`E-ARG`'s malformed-arguments code).

**D4 — A `--body-file` body must never enter argv.**
The fix for KF-7/KF-8 is structural, not a quoting patch: parse the remaining argv **without** the
body, then attach the literal body to the parsed send command. The invariant the coder must hold —
stated as an invariant so the mechanism stays theirs — is: **the body string is never a token the
lexer sees, and is never transformed** (no `trimEnd`, no normalisation). It is also mutually
exclusive with `--command`, which must be an explicit error rather than an argv accident.

**D5 — Documentation and generated onboarding are deliverables, not garnish.**
Per the prime's ruling the unsafe path must be labelled where a caller reads it. That is four
surfaces, not one: the USAGE line, **`pij send --help` (which today drops the warning — KF-9)**,
`docs/how/pij.md`, and **the boot message every spawned peer receives (KF-10)**.
The `--help` fix should make the filter carry a matched line's indented continuation lines, which
repairs the same silent truncation for every other verb.

### Testing strategy

**Hybrid, with the charter's control rule as a hard gate — and validation's correction applied.**

> The independent review's sharpest point: *"The proposed control tests are ordinary fixed-behaviour
> assertions. A mutation comment is not evidence that they went RED without the fix."*

So the rule for this plan is procedural, not decorative:

1. **Write the test first, run it against the unmodified tree, and record the observed RED output**
   in `assets/execution.log.md` — the actual failure text, not a claim.
2. Only then implement.
3. The execution log must show, per acceptance criterion, the RED line and the later GREEN line.

Test construction, corrected per validation:

- **#132 refusals (AC-01/02/03/04)** — drive `dispatch` (not just `parseArgs`) with the fake ports
  and assert: `E-EMPTY`, non-zero exit, **`delivery.outbox` length unchanged**, and no receipt.
  The outbox assertion is what makes it a real control: today the outbox grows by one.
- **Regressions (AC-05/06)** — `--command compact` still delivers `body:""` + command; an
  attachment-only send to a **pull** target still delivers. Both are RED if the guard over-fires,
  which is the failure mode most likely to be shipped by accident.
- **AC-07** — assert the warning text and the `--json` field, not just the delivery.
- **`--body-file` (AC-08/09/10)** — must be a **real-bin integration test** (`spawnSync` on the
  wrapper), because core never sees `--body-file` (KF-11/D4). Fixture body must contain: trailing
  newlines and trailing spaces, backticks, `$( )`, `${ }`, single and double quotes, a `;`, and a
  **first line beginning `--wait`**. Compare the delivered inbox JSON byte-for-byte. Against the
  current tree this is RED on the trailing-newline assertion *and* on the `--wait` line.
- **AC-11** — assert on the actual output of `pij send --help`, which is RED today.
- **#128 honesty** — **no test claims pij prevents shell execution**, because it does not.

Gates: `just typecheck && just lint && just test`, `npx vitest run .pi/extensions/pij` on touched
specs, then `harness checks` before declaring done.

### Constraints — read twice

- **`core/cli.ts` is CO-OWNED this wave.** The `capability-surface` stream owns the `whoami`
  region of the same 5,802-line file. Every edit stays inside these named regions:
  - `EXIT` map — `~:665-678` (**added in v2**, required by D3)
  - `case "send"` parse — `~:1011-1100` (broadcast guard + `--body-file`/`--command` exclusivity)
  - `classifySendReceipt` / `sendSuccess` — `~:2107-2140` (comment only, pointing at the guard)
  - send dispatch — `~:3000-3060` (the guard itself)

  **No reformatting, no import reordering, no tidying anywhere else.**
- **`.pi/extensions/pij/cli.ts` (the bin) is a second possible overlap** — `whoami` also appears
  there. Edits confined to the send USAGE lines (`~:325-327`), the `--help` filter (`~:4212-4219`)
  and the `--body-file` unwrap (`~:4220-4253`). **Flagged to the prime for merge sequencing.**
- **Do NOT merge.** Done = PR up, CI green. The prime holds the merge order.
- Repo rules: no `any`, no inline/dynamic imports, `.js` on relative imports, tagged-union returns
  not throws, constants next to the data they constrain, tests target the pure core + fakes.
- Verify CI with `gh pr view <n> --json statusCheckRollup`, never `gh pr checks`.
- `rg` needs `--hidden` in this repo or it cannot see `.pi/` at all.

### Tasks

| ID | Task | Files | AC | Status |
|---|---|---|---|---|
| T001 | Add `E-EMPTY` to `PijErrorCode` **and** to the exhaustive `EXIT` map (exit `2`). | `core/types.ts:594`, `core/cli.ts:665-678` | AC-01 | [ ] |
| T002 | Pure helper: effective delivery mode + `targetRendersAttachments(descriptor)`, per KF-12. | `core/cli.ts` (near `:2107`) | AC-06 | [ ] |
| T003 | **The guard**: in send dispatch, after preflight, before `deliver` — refuse per the D2 table. Comment at `classifySendReceipt` pointing here. | `core/cli.ts:3000-3060`, `:2107-2140` | AC-01/02/03/05/06 | [ ] |
| T004 | Broadcast: refuse empty text before the branch's early return. | `core/cli.ts:1013-1044` | AC-04 | [ ] |
| T005 | AC-07: warn (stderr + `--json` field) when a delivered attachment cannot be rendered by the target. | `core/cli.ts:3000-3060` | AC-07 | [ ] |
| T006 | Rewrite the pinned contract test: attachment-only to a **push** target now refuses; attachment-only to a **pull** target still delivers; text-only still round-trips with no `attachments` key. Comment the contract change. | `core/cli.test.ts:745-770` | AC-01/06 | [ ] |
| T007 | Control tests for AC-01/02/03/04/05/06/07 asserting **outbox unchanged** on refusal. Record observed RED in the execution log **before** T003. | `core/cli.test.ts` | AC-14 | [ ] |
| T008 | **Fix `--body-file`**: no `trimEnd`; body never lexed as argv (D4); explicit error if combined with `--command`. | `.pi/extensions/pij/cli.ts:4220-4253` | AC-08/09 | [ ] |
| T009 | Real-bin integration test for `--body-file` and `--body-file -` with the hostile fixture (trailing newlines/spaces, backticks, `$()`, `${}`, quotes, `;`, first line `--wait`). Record observed RED first. | new spec | AC-08/09/10/14 | [ ] |
| T010 | Fix the `--help` filter so a matched line's indented continuation lines are kept (KF-9); assert on real `pij send --help` output. | `.pi/extensions/pij/cli.ts:4212-4219` | AC-11 | [ ] |
| T011 | USAGE: document `--file` distinctly from `--body-file`, recommend the safe path for relayed/untrusted content, label the quoted form unsafe, show the `<<'PIJ'` heredoc. | `.pi/extensions/pij/cli.ts:325-327` | AC-11/13 | [ ] |
| T012 | Update the spawn boot message to teach the safe form for relayed content. | `core/harness/claude.ts:152-156` | AC-12 | [ ] |
| T013 | Same wording in the user guide. | `docs/how/pij.md` | AC-11 | [ ] |
| T014 | Comment on #128/#132 with what the code actually does (esp. #132 is deterministic, not a race — F-09) so the reporters are not left with a wrong mechanism. | — | — | [ ] |
| T015 | Append fleet-POC findings to the ledger, id block `F-200`/`W-200`/`S-200`. Append-only. | `docs/how/fleet/ledger.md` | — | [ ] |
| T016 | Gates: `just typecheck && just lint && just test`, `harness checks`, then PR. | — | all | [ ] |

### Pre-convergence re-validation (fleet rule, adopted 2026-08-08 from s099)

**The fail-first proof is discharged twice: at authoring time, and again on the rebased tree.**
A sibling stream can rewrite the code around a guard so that the guard is still *present* and the
suite is still *green*, while the guard has become **unreachable**. Still-present and
still-load-bearing are different claims, and only the first survives a rebase for free.

This stream is exposed: **`core/cli.ts` and the bin `cli.ts` are both co-owned** with
`capability-surface` (the `whoami` regions). So before the PR is declared ready:

1. Rebase onto the convergence base.
2. Re-run every BEHAVIOURAL criterion on the **rebased** tree — not just the suite.
3. Re-run the mutation gate (`~/.pij/shared/mutate.mjs`) against the load-bearing guard
   (`targetRendersAttachments`, and the `.trim()` emptiness test) **on the combined tree**, and
   record the verdict. A `GATE FAILS` there means the proof is gone even though the tests are green.
4. Record the result in `assets/execution.log.md` alongside the authoring-time evidence.

### Risks

| Risk | Mitigation |
|---|---|
| Merge conflict with `capability-surface` in `core/cli.ts` **and** the bin `cli.ts` | Edits confined to five named regions across the two files; prime sequences the merges; PM reports when green and has flagged the second file. |
| The guard over-fires and breaks telegram attachment-only sends | D2's capability table + AC-06 regression test, which is RED if the guard is written as a global refusal. |
| The guard under-fires because a caller bypasses `parseArgs` | D1 puts it in `dispatch`, which every caller (CLI, `pij_send`, direct) goes through — verified at KF-13. |
| `--body-file` fix changes lexing for other verbs | The body is attached post-parse; no shared lexer change. The `--help` filter change *is* shared, but it only *adds* continuation lines, and is covered by T010's assertion. |
| "Control test" degenerates into an assertion of fixed behaviour | Procedural rule: RED observed and pasted into `assets/execution.log.md` before implementation. |
