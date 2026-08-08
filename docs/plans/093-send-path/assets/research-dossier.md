# Research Dossier: send-path integrity (pij#128, pij#132)

**Generated**: 2026-08-08T03:40:55Z
**Query**: "How does `pij send` construct and deliver a message body, and what makes pij#128 (quoted body executes shell substitutions) and pij#132 (`--file` delivers an empty body behind a success receipt) happen?"
**Effort**: Standard
**Evidence**: 11 current sources · 2 historical sources

## The Ask

Two open issues report the same surface — `pij send` — failing in opposite directions. **#128**: the
form pij documents first, `pij send <id> "<text>"`, runs command substitutions in the *caller's*
shell when the body is relayed text the caller did not author; the message still delivers, mangled,
with a success receipt. **#132**: `pij send <peer> --file <path> --caption "…"` delivers an *empty*
body to the peer while the receipt reports `queued`/`delivered`, which cost an orchestration session
four lost dispatches that were read as worker disobedience.

This dossier establishes what the code actually does today for both, so the plan can fix the right
thing. It matters because every seat on this box moves briefs, rulings and findings across this one
channel, and both failures render as ordinary output.

## Answer

1. **#132 is not a race and not intermittent — it is the designed behaviour of a mis-named flag.**
   `--file` is *reference-passing*: it attaches `{path, caption}` metadata and sets the body to
   `""`. It never reads the file (F-01), and an existing test asserts exactly that (F-01).
2. **Attachments are rendered by only two consumers, neither of which is the push path.** The
   telegram bridge and the `pij inbox` pull renderer read `attachments` (F-02); both tmux/pi
   *injection* sites drop them and inject `frame(from, body)` (F-02). So for every claude/copilot/pi
   peer, `--file` delivers the literal string `[pij from <id>] ` and nothing else.
3. **The proximate cause of the misuse is a one-letter name collision.** `--body-file <path|->`
   (reads the file *as* the body, documented in USAGE) and `--file <path>` (attaches a path,
   **absent from USAGE**) sit one letter apart with opposite semantics (F-03, F-07).
4. **The receipt is honest about the wrong thing.** `classifySendReceipt` keys purely on the
   target descriptor's liveness and daemon authority; body length is never consulted (F-04). A
   zero-byte body therefore gets the same `queued`/`delivered` a real message gets — issue #132's
   core complaint, stated precisely.
5. **The same hole is reachable without `--file` at all.** `pij send <id> ""` passes the argument
   guard, which tests for `undefined` rather than emptiness (F-05).
6. **#128's execution is entirely caller-side and pij cannot prevent it.** The send and delivery
   path honours the repo's argv-only discipline end to end — `execFileSync` with an argv array, no
   `sh -c` anywhere on the path (F-06). The shell finishes expanding the body *before* pij's process
   starts, so no pij-side change can stop the command running.
7. **But pij is not blind to it.** The invoking shell's **pre-expansion** `-c` string is readable
   from pij at send time via the parent process (F-08, verified live). That makes a post-hoc
   detector feasible: pij cannot un-execute, but it can refuse to *deliver* a body it can prove was
   shell-expanded, and say so loudly — converting a silent corruption into a visible refusal.
8. **`--body-file` is bin-only and therefore untested by the core specs** (F-07): it is unwrapped in
   the executable wrapper before `parseArgs` ever sees it, so no core test covers the literal
   channel that the whole fleet's #128 workaround depends on.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `--file` attaches `{path, caption}` and sets `body: cmd.text ?? ""`; the file is never read. An existing test pins the empty body as correct. | `.pi/extensions/pij/core/cli.ts:3010-3026`; `.pi/extensions/pij/core/cli.test.ts:745-770` | #132 is deterministic, not a race. The fix must change a *documented contract*, and that test must be updated deliberately, not incidentally. | High |
| F-02 | Both push injectors ignore `attachments` and inject `frame(from, body)`. Only the pull renderer and the telegram bridge render them. | inject: `core/daemon/router.ts:41`, `core/session.ts:592`; render: `core/inbox.ts:359`, `telegram/bridge.ts:552-587` | A tmux peer receives `[pij from <id>] ` — an empty message. Telegram is the one legitimate consumer, so `--file` cannot simply be deleted. | High |
| F-03 | The `send` USAGE line documents `--body-file <path|->` and its shell-safety note, but never mentions `--file`/`--caption`. | `.pi/extensions/pij/cli.ts:325-327` | The flag people got burned by is undocumented; the flag they meant is one letter away. Naming/help is part of the fix, not a garnish. | High |
| F-04 | `classifySendReceipt` derives the receipt from descriptor liveness + daemon authority only; body length is never an input. | `.pi/extensions/pij/core/cli.ts:2107-2126`, called at `:3042` and via `sendSuccess` `:2128-2140` | This is the actual defect named by #132 suggestion 1: the receipt survives the loss of its payload. Fix here, in one place, and both the single-target and broadcast paths inherit it. | High |
| F-05 | The "nothing to send" guard tests `text === undefined`, so an explicit empty string is accepted. | `.pi/extensions/pij/core/cli.ts:1084` | An empty-body refusal must key on emptiness, not on flag presence, or `pij send <id> ""` keeps the hole open. | High |
| F-06 | Send/delivery is argv-only: `execFileSync("tmux", args)` with an explicit no-shell-strings discipline; no `sh -c` on the send path. | `.pi/extensions/pij/adapters/tmux-keys.ts:11-32`; repo sweep for `sh -c`/`shell: true` returns only `core/bg.ts:131` (background jobs, unrelated) | The charter's "check whether the send path honours argv-only" resolves **yes**. #128 cannot be fixed by hardening delivery — the vector is the caller's shell. | High |
| F-07 | `--body-file` is unwrapped in the bin wrapper before `parseArgs`; core never sees the flag. | `.pi/extensions/pij/cli.ts:4220-4253` vs `core/cli.ts:842` (`send` flag set has `to/command/file/caption/wait/json` — no `body-file`) | The fleet's entire #128 workaround runs through an untested code path. Any guard placed in core will not see `--body-file` bodies unless the wrapper is accounted for. | High |
| F-08 | A process can read its invoking shell's **pre-expansion** command string. Verified: `ps -o args= -p $PPID` from inside `bash -c '…'` returned the literal, unexpanded backticks. | Live probe, this session: parent argv printed `sh -c 'printf … "arg is: [with \`echo HI\` inside]" …'` with backticks intact | A #128 detector is technically feasible at send time. It is post-execution but pre-delivery, so it can refuse the mangled delivery. Cost/fragility (platform `ps`, wrapper depth) is a real trade — **ruling requested from prime**. | High |
| F-09 | #132's "intermittent — some `--file` sends arrived with content" is a misdiagnosis; the behaviour has no branch on timing, load, or harness. | F-01 + F-02 (no timing input anywhere on the path) | The successful sends were almost certainly `--body-file`. Do not spend plan budget hunting a race that does not exist; say so in the issue. | High |
| F-10 | `--caption` requires `--file`, and `--file` is mutually exclusive with `--command`; a caption is delivered only as attachment metadata. | `.pi/extensions/pij/core/cli.ts:1059-1064` | The #132 reporter's "the caption arrives" is only true on the pull/telegram renderers — on a pushed peer the caption vanishes with the body. | High |
| F-11 | The daemon injects `/`+command raw for control commands, and free text framed; a `receipt` is recorded, never injected. | `core/daemon/router.ts:35-42` | Any body-shape guard must not disturb the command path, which legitimately injects raw text into a pane. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | `--body-file` was added precisely because a quoted body accidentally executed `pij close` from relayed text ("dogfood, osk#4"). | `.pi/extensions/pij/cli.ts:4220-4224` (comment) | Direct | #128 is a **known, previously-hit** class; the existing remedy was a new flag plus a usage note, and the fleet still got bitten. A remedy that requires remembering has already been tried once and failed. |
| H-02 | Plan 071 consolidated receipt classification into one place after a prior fix left the plain `pij send` path still saying `queued` — "the single most used surface lying while the code looked fixed". | `.pi/extensions/pij/core/cli.ts:3034-3040` (comment) | Direct | The one-rule-one-place structure is a gift: the #132 receipt fix belongs in `classifySendReceipt`/the guard *before* it, so broadcast and single-target cannot diverge again. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| pij **cannot** make `#128`'s "executes nothing" true for the double-quoted form | F-06, F-08 | The charter's done-condition said the body "is delivered verbatim and executes nothing". For the documented quoted form that is structurally unattainable — the shell has already run before pij exists. | **RESOLVED — prime ruling 2026-08-08**: bar struck and replaced. #128 is scoped to the *safe path* (unambiguous `--body-file`/stdin, recommended by `--help` and docs for relayed content, unsafe path labelled at the surface). The parent-argv detector (F-08) is **out of scope** and was filed separately as **pij#167** — it fails open, is blind to interactive invocation, and would convert *"I must use `--body-file`"* into *"pij will tell me"*. The safety property is carried by the safe path, never by a detector. |
| Changing `--file` semantics breaks the telegram bridge | F-02 | Telegram is the one consumer that genuinely wants reference-passing; inlining file contents there would be wrong. | Keep `--file` as reference-passing; make it **refuse** when the resolved target cannot render attachments, rather than changing what it means. |
| `core/cli.ts` is shared with the `capability-surface` stream (`whoami` region) | Charter; `partitioning.md` § Partial collisions | An unrelated hunk touched anywhere in a 5.8k-line file turns a clean merge into a conflict. | Confine every edit to the send parse block (~`:1012-1100`) and the send dispatch block (~`:3000-3060`) plus `classifySendReceipt` (~`:2107-2140`). No reformatting, no import reordering. |
| Existing test `core/cli.test.ts:745` asserts the empty body is correct | F-01 | A fix that refuses empty bodies will turn this test red; that is *correct*, but it must be changed as a deliberate contract change with a comment, not silently deleted. | Rewrite that test to assert the new refusal + keep the telegram-capable path green. |
| A body-shape guard could fire on legitimate relayed text | F-11, F-03 | Code excerpts containing backticks are exactly what this fleet relays all day; a hard refusal on the *safe* (properly escaped) form would block correct usage. | Guard must distinguish "refuse" from "warn", and must always name the literal channel in its message. Decide in the plan. |

## Planning Handoff

- **Preserve**: argv-only delivery discipline (F-06); one-place receipt classification (H-02);
  `--file` reference-passing for the telegram bridge (F-02); byte-for-byte round-trip of a plain
  text send with no `attachments` key (F-01 test's third assertion).
- **Change carefully**: `core/cli.ts` send parse + send dispatch + `classifySendReceipt` **only**
  — the file is co-owned this wave. The `core/cli.test.ts:745` contract test is an intentional
  breakage.
- **Likely files/symbols**: `core/cli.ts` (`case "send"` parse ~`:1012-1100`; send dispatch
  ~`:3000-3060`; `classifySendReceipt` ~`:2107-2126`), `core/cli.test.ts`, `.pi/extensions/pij/cli.ts`
  (USAGE ~`:325`, `--body-file` unwrap ~`:4220`), `core/message.ts` if a shape helper lands there.
- **Decisions still required**:
  1. **#128 scope** — parent-argv detector (F-08) vs guard + literal-channel promotion. *Question
     outstanding with the prime.*
  2. **Guard severity** — refuse (exit non-zero) vs warn-and-send for a body carrying `` ` `` /
     `$(` / `${`.
  3. **`--file` on a non-attachment-capable target** — hard error, or auto-promote to reading the
     file as the body. (Dossier leans: hard error naming `--body-file`, per F-02's telegram
     constraint.)
