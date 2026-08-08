# Stream `s093` — send-path — ledger

Rows from stream `s093`. **This file has a single writer.** See [`../ledger.md`](../ledger.md) for the index and the convention.

## Difficulties

### F-200 · The fleet's own safe-transport workaround is broken, and only for hostile bodies
Every brief in this wave travelled by `pij send --body-file` because a quoted body executes shell
substitutions (pij#128, F-005). That channel does not deliver bodies verbatim: it calls
`body.trimEnd()` and then **re-appends the body as an argv token**, which the lexer parses. A body
whose first characters are `--` is read as a flag, and because `--wait` is a *valued* flag on
`send`, `pij send <id> --wait --body-file f` silently consumes the file's contents as `--wait`'s
value.
*Evidence*: `.pi/extensions/pij/cli.ts:4253` + `.pi/extensions/pij/core/cli.ts:707-720` + `:1084`.
*Cost*: unknown-but-nonzero — no seat can audit which of its briefs were altered, because a
trimmed or mis-lexed body and a clean one look identical in the sender's transcript and return the
same receipt. *Found by*: an independent plan validation, not by use — five hours of fleet traffic
went through it first. *Status*: being fixed in this stream.
*The archetype*: **a mitigation that reproduces the flaw it mitigates, in the layer below.** The
mitigation is trusted more than the original because it was adopted deliberately, so it is audited
less.

### F-201 · The one existing safety note is invisible at the surface that documents it
`pij send --help` filters USAGE to lines containing the literal `pij send`. The shell-expansion
warning is an **indented continuation line** and does not contain that string, so it is dropped.
The command a caller runs to read about `send` is the one place the `send` warning cannot appear.
*Evidence*: `.pi/extensions/pij/cli.ts:4216` vs `:325-327`. *Cost*: pij#128's stated mitigation has
been documented-but-unreadable since it was written; three seats hit a *different* shell guard this
week and none of them found this note. *Status*: fixed in this stream.

### F-202 · `harness plan new` is dd-native; this repo has no dd schemas
The `/builder 1b plan` verb scaffolds `plan.dd.json` + a rendered sibling. `harness plan new`
returned `status: degraded` with *"schema `builder/plan` was not found in any discovery root"*, and
`harness dd schema list` returns `schemas: []`. Every existing plan in `docs/plans/` is legacy
markdown, so the correct move was to delete the scaffold and hand-write the plan in the repo's
established format — which the skill explicitly forbids for dd plans.
*Cost*: ~10 min, one scaffold created and removed. *Suggestion*: the verb should detect an empty
schema root and say "this repo is markdown-native, writing `<slug>-plan.md`" instead of producing
an unrenderable artifact plus a remediation hint that cannot succeed.

### F-203 · `flow-pair dispatch` renders an EMPTY allowed-scope as if it were a scope
Omitting `--allowed-paths` produced a packet reading:
*"## Allowed Scope — You may ONLY create or modify files within:"*, then **nothing**, then *"Stay
inside this scope."* A worker reading that is told it is fenced and given no fence.
*Evidence*: `dlg-0002.md:67-73`. *Cost*: caught by inspecting the rendered packet before sending;
had I trusted the tool's exit code, an unfenced coder would have gone to work on a **co-owned
5,800-line file**. *Shape*: this is the same absent-vs-empty defect as pij#128/#132/#108/#113 —
**the failure renders as ordinary output** — appearing in the tool being used to fix it.

### F-204 · `flow-pair dispatch --phase` requires a heading a Simple-mode plan does not have
Dispatch extracts the plan section by literal heading match and fails with `section not found`.
A Simple-mode plan (one phase, inline task table) has no `## Phase N:` heading, so the plan had to
be restructured to satisfy the tool rather than the work.
*Evidence*: first `dispatch` invocation, this run. *Cost*: one failed dispatch + a plan edit.

### F-205 · An unmatched glob echoes itself, so a probe reported a path that does not exist
`ls -d ~/.agents/skills/pij/../*flow*` printed `/Users/jordanknight/.agents/skills/pij/../flow-pair`
— bash echoing the unmatched pattern — and `ls` of that path then failed. I briefly concluded the
skill root was installed where it is not (it is at `/Users/jordanknight/pi-hacking/pij/skills/`).
*Cost*: one wrong turn, ~2 min. *Shape*: same family as pij#144 (`rg` skipping `.pi/`) — **a probe's
own convention rendered as a fact about the world.** Worth stating alongside it in the search trap
docs, because the failure direction is inverted: `rg` renders presence as absence, an unmatched
glob renders absence as presence.

### F-206 · A fresh worktree cannot install its own dependencies
`pij stream create` makes the worktree; nothing populates `node_modules`, and `npm ci` **cannot
run there**: the repo `.npmrc` sets `min-release-age=7`, and npm refuses to combine that with the
`--before` it uses internally to resolve the `minih` git dependency —
*"`--min-release-age` cannot be provided when using `--before`"*. An env-var override did not clear
it.
*Evidence*: hit by the coder seat in this stream on first `npm ci`. *Workaround*: copy
`node_modules` from the main checkout (identical `package.json` + lockfile shasums).
*Cost*: every seat spawned into a fresh worktree hits this wall before it can run a single test,
and the error names neither the worktree nor the setting that caused it.
*Why it belongs in a fleet ledger specifically*: a single-seat workflow never sees it, because the
main checkout is always already installed. **Fleet parallelism is what turns a dormant repo
setting into a per-seat blocker** — the same shape as F-001 (worktree spawn) and F-007 (per-PR CI
runs): the wave multiplies anything that is per-checkout.

### F-207 · The plan's file fence was derived by reading, and it was incomplete
The plan named `core/cli.ts:665-678` as the one exhaustive map over `PijErrorCode`. There is a
**second** one — `ORCHESTRATION_EXIT` at `core/orchestration/cli.ts:111`, over
`OrchestrationErrorCode = BatonErrorCode | PijErrorCode` — which no amount of reading the send path
would have surfaced. The compiler found it in seconds.
*Cost*: one out-of-fence file in the diff (four lines, commented), which had to be reviewed
deliberately rather than trusted.
*The transferable rule*: **a fence derived by reading is a hypothesis; only the compiler or the
test run can confirm it.** For a co-owned file this matters more than usual, because the cost of
being wrong is another stream's merge conflict. A `pij fleet` verb that declares ownership (S-002)
should verify the declaration by building, not by matching paths.

## Wins

### W-200 · The prime's stated done-bar was unattainable, and the PM caught it before implementation
The charter defined done for pij#128 as *"a body containing backticks and `$( )` is delivered
verbatim and executes nothing."* No pij-side change can hold that property: expansion completes in
the caller's shell before pij's process exists, and the send path is already argv-only
(`adapters/tmux-keys.ts:11-32`, `execFileSync`), so there is nothing left to harden. pij never
receives the pre-expansion string, so it cannot deliver verbatim what it was never given.
The PM asked rather than proceeding; the prime **struck its own bar** and replaced it with an
attainable one (safe path exists, is recommended by docs and `--help`, unsafe path labelled at the
surface).
*Cost avoided*: an implementation aimed at an impossible property — or, worse, something weaker
shipped quietly as though it met the bar, which is exactly the class of failure this wave exists to
remove.
**The fleet finding, which is about brief quality**: *a done-bar that states a property of the
SYSTEM can encode an impossibility that only a reader with the source open can detect; a done-bar
that states a property of the CHANGE cannot.* The corrected bar is three checkable facts about
artifacts. The original was one unfalsifiable claim about behaviour. A future `pij fleet` brief
template should push authors toward the former — and this is the second time in one day a PM has
corrected a brief rather than working around it, which suggests the ask is reasonable to make of
PMs and worth making explicit.

### W-201 · Independent plan validation returned NOT READY and was right five times
A subagent review of plan v1 (with the source, not just the plan) found five blocking issues, all
re-verified at source before acceptance. v1 would have: placed the guard in pure `parseArgs`, where
it **cannot fire for the very test that pins the defect** (that test calls `dispatch` directly);
failed typecheck by adding to an exhaustive error-code map outside its own declared edit fence;
missed the broadcast path entirely (it returns before the guard); and **deleted a shipped telegram
capability** by refusing empty bodies globally — a rule the plan's own research dossier had gotten
right and the plan had drifted from.
*Cost*: one subagent run. *Evidence*: `assets/plan-validation-v1.md`.
*The transferable bit*: the most valuable finding was not a bug in the plan but a **drift between
the plan and its own dossier**. Validation should be given both artifacts and asked to diff them,
not just to review the plan.

### W-202 · The question protocol worked end-to-end, including the part that usually fails
One question, declared with `pij report question`, asked in one sentence of context and one of ask,
answered with reasoning rather than a verdict. The out-of-scope half of the answer was **filed as
its own issue (pij#167) carrying the prime's four objections as the body**, instead of being
dropped or quietly smuggled into this PR.
*Why it is a win worth logging*: the failure mode here is not "the PM did not ask" — it is "the
good idea that was correctly rejected leaves no trace, and the next agent re-proposes it." Filing
the rejection *with its reasoning* is what stops that.

## Suggestions

### S-200 · `flow-pair dispatch` should refuse an empty allowed-scope, not render one
Per F-203. An empty `--allowed-paths` should be a non-zero exit, or an explicit
`Allowed Scope: ENTIRE REPO (no fence declared)`. Silence must not render as a fence.

### S-201 · The ledger's append-only claim does not survive six concurrent appenders
The onboarding says appends "merge cleanly at different line ranges" because each PM has its own id
block. Ids are partitioned; **file position is not**. Six PMs each appending to the end of
`## Difficulties` write the same line range and conflict. This block went to EOF to dodge that,
which in turn conflicts with any other PM that reasons the same way.
*Suggestion*: `docs/how/fleet/ledger.d/<stream>.md`, one file per stream, concatenated by a render
step — or have the wave's setup pre-create an empty per-stream section so every PM has a private
anchor. Partitioning by **file** is the same rule `partitioning.md` already argues for code.

### S-202 · I wish there were a `pij spawn --cwd`
Every spawn must be issued from the main checkout (F-001), so every fleet peer starts in the wrong
directory, and every dispatch has to open with *"cd to your worktree and use absolute paths."* That
instruction is a load-bearing correctness requirement delivered as **free text in a chat message**:
if the peer skims it, it edits the main checkout instead of the stream branch, and nothing detects
that until convergence. A `--cwd` that the daemon applies after boot — or a post-bind `cd` the
spawn performs itself — moves the guarantee from prose into the tool.

### S-203 · Derive `--allowed-paths` from the plan's own Constraints section
Both the plan and the packet independently restate the file fence, in different formats, by hand.
They can disagree, and only the packet is binding. The plan already names the fence; dispatch
should read it.

### S-204 · RED-before-fix is unfalsifiable when it lands in one commit
This stream required the coder to run every behavioural criterion against pre-fix code and paste
the **verbatim** failure into the execution log. It did, and the evidence is good. The cross-model
reviewer still made the sharpest observation of the run:

> *"Its chronology cannot be independently established from a single commit containing the tests,
> implementation, and log, so I do not treat that historic ordering as independently proven."*

That is correct and it applies to **every** stream in this wave. A pasted RED block proves a failure
was *observed*; it does not prove it was observed *before* the fix existed, because the artifact
that records the ordering is written by the same agent, in the same commit, as the thing it
vouches for.
*Suggestion*: require **two commits** — failing tests alone, then the implementation. Git then
carries the ordering as a fact anyone can check with `git show <test-commit> && npx vitest run`,
and the claim stops depending on the author's honesty. Adopted mid-run here after the review.
*Cost of not doing it*: the discipline still works, but its evidence is a **self-report**, which is
the same category of proof this wave keeps filing issues about.


---

---
