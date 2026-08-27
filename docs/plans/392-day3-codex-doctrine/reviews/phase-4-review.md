# Cold review — Phase 4 (7, pointer doctrine) · flow-pair dlg-0004

**Verdict**: `FIX_REQUIRED` — **two** blocking items, **both in the prose deliverable**, both one-line fixes. The code side of this phase is the strongest of the three I have reviewed: **6 mutations, 6 RED, zero stay-greens.**

> **TERMINAL REPORT — no pass is open.** Every mutation I intend to run has been run. The Dim-0 pass is
> **CLOSED at 6 mutations**. Nothing is pending against `c354d22`. Any fix will be re-reviewed as a
> **new** review against a **new** sha, in a **separate** verdict file.

**Reviewed shas**: `cb6a9eb` (impl: `loop.test.ts` +106, `docs/how/pij.md` +37/−6, `doctrine-amendment-pointer-relaxation.md` +58, `skills/pij/SKILL.md` 1 line) · `c354d22` (report + execution log)
**Reviewer**: `pij-pale-araminta` — GitHub Copilot CLI 1.0.81-14, claude-opus-5 @ xhigh. Cold: I did not see the coder's session.
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (verified `pwd` == `git rev-parse --show-toplevel`).
**Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md`

---

## Scaffolding and limits — read first

**Scaffolding.** All 6 mutations targeted **one** file, `.pi/extensions/pij/core/daemon/loop.ts`, against
suite `npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts` (baseline **82/82 GREEN**). The
mandated mutation went through `just flow-pair-mutate` for the canonical RED→GREEN paste; all six were
then re-run manually — same `sed`, own `/tmp` backup, explicit restore — to capture the failing test
**names**, because the script's GREEN re-run overwrites `/tmp/fp-mutate.log`. Final
`git status --porcelain -- .pi/` is **empty**: byte-identical to HEAD.

**No mutation reported by count alone.** Every RED below names the tests that failed.

**Note on `loop.ts` mutation mechanics** (so the evidence is reproducible): three of the six targets are
**not textually unique** in the file, so a naive `sed` would have hit the wrong branch and produced a
false verdict. P4 and P6 use `sed` **address ranges** to confine the substitution to the intended block
(`/opts\.pointer/,/const line = pointerLine/` and `/harness === "claude"/,/ports\.sendSocket/`), and P5
uses a range to reach the `continue;` inside the socket-confirmed block. Exact expressions are pasted
below; if you re-run them, use them verbatim.

**What I did NOT check, stated plainly so it cannot be mistaken for a clean result:**

| Not examined | Why |
|---|---|
| The **"3 KB bodies byte-exact, 0 keystrokes"** benchmark the doctrine draft rests on | **I could not locate the document it cites** — see finding A. This is not "checked and fine"; it is **unverifiable from this worktree**. |
| Live socket/RPC delivery to a real claude or copilot seat | Everything below is source + fake-driven test evidence. No live seat was touched. |
| Repo-wide `just lint`, `just smoke`, `harness checks` | Declared pre-existing red; **not re-run**, so I have not independently confirmed the pre-existing claim. |
| `just pij-skill-check` itself | I verified the **before/after artefacts are identical** (finding: they are), which is the PD-02 bar — but I did **not** re-run the checker to confirm those artefacts were themselves produced correctly. |
| Whether `government/doctrine/…` and `orient-global.md` would *accept* the proposed text | Out of scope — the o-prime is the single writer. I only verified they were not edited. |

---

## What the packet asked me to establish

| # | Ask | Verdict | How I verified it |
|---|---|---|---|
| 1 | **Doc/test only** — no production `.ts` | **CONFIRMED** | `git show cb6a9eb --stat`: the only `.ts` is `core/daemon/loop.test.ts`. Across the whole range `236dec9..c354d22` the only `.ts` files are `loop.test.ts` and `cli.test.ts` — and the latter is FX001 (`246f234`), a different delegation. **No production source in this phase.** |
| 2 | **Routing invariant is real** (Dim-0) | **CONFIRMED, strongly** | 6 mutations, **6 RED**. All four new cases are load-bearing, and two of them are killed by more than one mutation. Full table below. |
| 3 | **PD-02 bar** — skill-check before/after identical | **CONFIRMED independently** | `diff -u .harness/temp/s392/skill-check-{before,after}.txt` → **empty, exit 0**. Both files 11 571 bytes. `wc -l skills/pij/SKILL.md` → **85**. The change is one clause on **global invariant 2**; C10 (invariant 9/10 region) is untouched. |
| 4 | **Doctrine draft proposes, does not edit** | **CONFIRMED** | No file under `government/` or any `orient-global.md` appears in `git diff --name-only 236dec9..c354d22`. The draft is marked `**Status**: DRAFT`, names the o-prime as single writer, and explicitly separates **P1 (transport)** from **P2 (persist-before-send, unchanged)** — the separation is stated three times, including an adoption note warning that a future transport must not inherit a pty-specific remedy. That is the right shape. |
| 5 | **`docs/how/pij.md` stale bullet corrected** | **CONFIRMED** | The old *"Every send publishes `msg-<messageId>.json`"* is replaced with a sqlite-default/`fs`-opt-out pair. I checked the new text against the code: `pij queue --to <id>` is real — I **ran it** and it printed the seq/state/attempt table the doc describes. |

---

## Findings

| # | Severity | File | Claim | Fix |
|---|---|---|---|---|
| **A** | **medium, BLOCKING** | `doctrine-amendment-pointer-relaxation.md:14-15` | **The draft's first evidence bullet cites a document that does not contain the evidence — and that document is mine.** | Repoint to the real source, or delete the bullet. See below. |
| **B** | **medium, BLOCKING** | `skills/pij/SKILL.md:59` (+ `docs/how/pij.md` routing table) | **A conditional statement has been added to a list titled "Global invariants (every route)".** The new clause says a socketless seat *"receives a path pointer, **never a body**"*. That is true under the `sqlite` default and **false under both `PIJ_QUEUE_BACKEND=fs` and `dual`**. | Add the backend qualifier. See below. |
| C | **info** (out of fence, pre-existing) | `.pi/extensions/pij/daemon.ts:1089` | `const sq = this.channel instanceof SqliteQueue ? this.channel : undefined` — but a `dual` backend yields a **`DualWriteChannel`**, so `sq` is `undefined`. The same file **imports `sqliteOf`** (line 30) and uses it correctly at line 1525; `sqliteOf` exists precisely to unwrap `DualWriteChannel`. | Not this phase's code and **not a Phase 4 defect** — but it is the mechanical cause of finding B's `dual` half, and it also means **`recoverStaleClaims()` never runs under `dual`**, which corroborates my Phase 1 finding 5 (retry liveness depends on a sweeping daemon). Worth its own ticket: `sqliteOf(this.channel)`. |
| D | **info** | `day3-codex-doctrine-plan.md:234` · `tasks/phase-4-pointer-doctrine/tasks.md:57` (T004) | **Root cause of finding A.** Both the plan and the dossier instruct the coder to cite *"review §5/§11–13"* — **with no path**. `"review §N"` is an established repo-wide shorthand for an upstream document (`loop.ts:612` "review §5/§7", `loop.ts:635` and `daemon.ts:46,1158` "review §7", plan 074 "review § A-2"), *not* for a flow-pair phase review. The coder bound the pathless reference to the nearest file with a matching name. | Give the shorthand a path once, in the plan. Any future task quoting "review §N" will re-induce the same error. |

**No finding at `high` or `critical`. Nothing wrong was found in the code or the tests.**

### Finding A (blocking) — the doctrine rests on a citation that does not support it

**The claim.** `doctrine-amendment-pointer-relaxation.md` § Evidence, bullet 1:

> `docs/plans/392-day3-codex-doctrine/reviews/phase-1-review.md` §5 and §11–13:
> socket/RPC transport carried 3 KB bodies byte-exact with zero pane keystrokes.

**That file is my Phase 1 cold review, and I can speak to its contents with authority.**

- It has **no §5 and no §11–13**. Its sections are *named*, not numbered.
- `grep -niE '3 ?kb|keystroke|byte-exact|socket'` over it returns **zero matches** — not one, in ~26 KB.
- It reviews the **Telegram SQLite forwarder** (`bridge.ts`, `queue-consumer.ts`, `cli.ts`). It contains
  no transport benchmark, because **I never ran one.** I did not measure body fidelity and I did not
  count keystrokes.

**Why this is blocking rather than a typo.** This draft exists to justify **relaxing a safety rule**, and
it is addressed to the o-prime as single writer into `government/`. Its load-bearing empirical claim is
sourced to a reviewer's report that does not make it. If adopted as written, a false provenance —
carrying my name — becomes part of the permanent doctrine record. A reader who follows the citation
finds nothing and cannot tell whether the benchmark is real, mis-cited, or invented.

**I could not find the real source.** No document in this worktree has numbered sections 11–13 on
transport; `grep -rln 'poc/comms-sqlite-socket' docs/` returns nothing. So I am **not** saying the
benchmark is false — I am saying it is **unverifiable from here**, and I have flagged it as unexamined
rather than let it pass as checked.

**Fix (either is sufficient).**
1. Repoint bullet 1 at the actual "review §5/§11–13" document, with a path; **or**
2. **Delete bullet 1.** The doctrine does not need it. Bullet 2 — the four `loop.test.ts` case names —
   is valid, and I have proven all four are load-bearing (below). The argument stands on evidence I
   *did* verify.

### Finding B (blocking) — a conditional listed as a global invariant

**The change**, `skills/pij/SKILL.md` under `## Global invariants (every route)`:

> 2. **Pointer delivery**: … a socketless seat receives a path pointer, **never a body** (pty clip).

**The code says otherwise, twice.** `daemon.ts:1134` calls the drain with `{ pointer: sq !== undefined }`,
and `sq` (line 1089) is non-`undefined` **only** when the channel is literally a `SqliteQueue`. So:

| `PIJ_QUEUE_BACKEND` | `sq` | pointer path | what a socketless seat actually gets |
|---|---|---|---|
| `sqlite` (default) | set | **on** | one pointer line — as documented |
| `fs` (documented opt-out) | `undefined` | **off** | **the full body typed into the pty** (`loop.ts:655`) |
| `dual` (documented rollout mode) | `undefined` — see finding C | **off** | **the full body typed into the pty** |

**Why it matters more than a docs nit.** `SKILL.md` is loaded into every pij agent's context, and this
sentence sits in a list whose heading promises it holds on *every route*. An agent that reads "never a
body" may reasonably conclude long bodies are safe to send to any seat — which is exactly right for a
socket seat and exactly wrong for a **codex** seat during an `fs` rollback or a `dual` rollout. A
rollout window is precisely when you least want the clip regression back.

The same absolute appears unqualified in the `docs/how/pij.md` routing table, row *"Legacy or otherwise
socketless tmux seat"*. Note the author clearly knows about the opt-out — they document it correctly in
the *other* bullet they changed in the same commit. Only the routing claims lack the qualifier.

**Fix.** Add the condition in both places, e.g. *"under the default `sqlite` backend, a socketless seat
receives a path pointer; with `PIJ_QUEUE_BACKEND=fs` or `dual` the pointer path is disabled and the body
is typed — keep sends short (C10) regardless."* Six words would do; the last clause is what actually
keeps an agent safe in all three configurations.

---

## Dim-0 mutation evidence (MANDATORY gate)

**6 mutations run: 6 RED→GREEN, 0 stay-greens.** File `.pi/extensions/pij/core/daemon/loop.ts`; suite
`npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts`; baseline **82/82 GREEN**.

| # | Mutation | Doctrine claim it attacks | Result |
|---|---|---|---|
| P1 | `target.harness === "claude"` → `false` | claude ⇒ socket (packet's mandated mutation) | **RED (3)** ✓ |
| P2 | `target.rpcPort !== undefined` → `false` | copilot ⇒ RPC | **RED (2)** ✓ |
| P3 | `opts.pointer` → `false` | socketless ⇒ pointer, not body | **RED (3)** ✓ |
| P4 | composer guard neutered **in the pointer branch only** | "still consults the composer-idle guard" | **RED (2)** ✓ |
| P5 | socket-confirmed branch no longer `continue`s | **"zero pane keystrokes"** | **RED (4)** ✓ |
| P6 | `!m.command` dropped **from the socket gate only** | "remote commands are still typed" | **RED (1)** ✓ |

P1 is the packet's mandated mutation. P2–P6 are mine, one per safeguard named in the new prose — the
same "every contract-named site gets its own mutation" discipline that surfaced the blocking findings in
Phases 1 and 2. **Here it surfaced nothing: every claim the doc makes about the code is guarded.**

### The mandated mutation, RED → GREEN (packet item 2)

```
$ just flow-pair-mutate .pi/extensions/pij/core/daemon/loop.ts \
    's/target\.harness === "claude"/false/' \
    'npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts'
→ suite: npx vitest run .pi/extensions/pij/core/daemon/loop.test.ts
→ mutated .pi/extensions/pij/core/daemon/loop.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

### All six, by failing test name

```
P1  s/target\.harness === "claude"/false/                                        RED 3
    FAIL  socket-first for claude seats > delivers over the socket, never types, and consumes with via=socket
    FAIL  socket-first for claude seats > leaves the message unread (buffered, not consumed) when the socket send fails
    FAIL  routing invariant … > claude with an inbox socket receives the byte-exact body with zero pane keystrokes

P2  s/target\.rpcPort !== undefined/false/                                       RED 2
    FAIL  copilot --ui-server seats use the RPC port > delivers via sendSocket when the descriptor carries rpcPort
    FAIL  routing invariant … > copilot with rpcPort receives the byte-exact body with zero pane keystrokes

P3  s/opts\.pointer/false/                                                       RED 3
    FAIL  pointer path for seats with no endpoint > types the pointer, never the body, and reports via=pointer
    FAIL  routing invariant … > codex without an endpoint receives one pointer line and never the body
    FAIL  routing invariant … > socketless claude consults the composer-idle guard before typing its pointer

P4  /opts\.pointer/,/const line = pointerLine/ \
      s/refreshRenderedComposerHold\(decision\.paneId, ports, buffer, holds\)/false/    RED 2
    FAIL  pointer path … > respects the composer-idle guard: NEVER types a pointer over live human input (Amendment 4 proof)
    FAIL  routing invariant … > socketless claude consults the composer-idle guard before typing its pointer

P5  /via: "socket"/,/^[[:space:]]*\}$/ s/continue;//                             RED 4
    FAIL  socket-first for claude seats > delivers over the socket, never types, and consumes with via=socket
    FAIL  copilot --ui-server seats use the RPC port > delivers via sendSocket when the descriptor carries rpcPort
    FAIL  routing invariant … > claude with an inbox socket receives the byte-exact body with zero pane keystrokes
    FAIL  routing invariant … > copilot with rpcPort receives the byte-exact body with zero pane keystrokes

P6  /harness === "claude"/,/ports\.sendSocket/ s/!m\.command/true/               RED 1
    FAIL  socket-first for claude seats > still TYPES a remote command (/compact) even on a socket-capable claude seat
```

### Weak-test red-flag sweep (rubric Dim-0 list)

- **A suspicion I raised and then refuted.** `expect(composerGuardReads).toBeGreaterThan(0)` counts
  `capturePane` calls — a proxy, and `> 0` is the classic shape of an assertion that passes on any
  incidental call. **P4 refutes it**: neutering the guard *in that branch alone* turns the test RED, so
  `refreshRenderedComposerHold` is the only `capturePane` caller on that path and the count is
  load-bearing. Recording this because a reviewer's suspicion that survives into a report unchecked is
  worse than no suspicion at all.
- **Test names over-claiming** — checked all four; none do. *"…with zero pane keystrokes"* is backed by
  `expect(w.sentText).toEqual([])`, and **P5 proves that assertion is what fails** when the socket path
  falls through and types.
- **Vacuous negatives** — `expect(w.sentText[0]?.text).not.toContain(body)` would pass vacuously if
  `sentText` were empty. It is **not** vacuous here: the same tests assert `sentText` **equals** exactly
  one pointer line, so the negative runs against a real string.
- **Fixture widened / witness removed** — **none.** This commit adds 106 test lines and changes no
  existing test. I diffed to confirm: the new `describe` is purely additive.
- **Assertion on a value the fake controls** — the byte-exactness assertions compare against a locally
  built 3 000-char body captured through `ports.sendSocket`; the fake records, it does not synthesise.

---

## Gates I re-ran myself

| Gate | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS**, exit 0 |
| `npx vitest run …/loop.test.ts` | **PASS 82/82** (baseline, and again after each of 6 mutations) |
| `npx vitest run …/loop.test.ts …/cli.test.ts` | **PASS 545/545** |
| `diff -u .harness/temp/s392/skill-check-{before,after}.txt` | **empty, exit 0** — the PD-02 bar, verified independently |
| `wc -l skills/pij/SKILL.md` | **85** |
| `pij queue --to <id>` (the command the new doc tells users to run) | **works** — printed the seq/state/attempt/trail table as described |
| Fence + tree hygiene | Code change confined to `loop.test.ts`; no `government/`/`orient-global` edit; `git status -- .pi/` **clean** after all mutations; no stray untracked artefacts |

---

## Dimension roll-up

| Dim | Verdict | Note |
|---|---|---|
| 0 · Tests guard behaviour | **PASS** | 6/6 RED. The best Dim-0 result in this plan; every prose claim about routing is mutation-proven. |
| 1 · Fence | **PASS** | `loop.test.ts` + 3 docs + a 1-line SKILL clause. Nothing outside. |
| 2 · Contract | **PASS** | All five packet establishes confirmed independently. |
| 3 · Dossier fidelity | **PARTIAL** | T004 delivered, but its pathless *"review §5/§11–13"* pointer was bound to the wrong file (findings A/D). |
| 4 · Types/lint | **PASS** | `tsc --noEmit` clean. |
| 5 · Docs/config | **FAIL** | The two blocking items are both here: a citation that does not support its claim (A) and a conditional asserted as a global invariant (B). |
| 6 · Domain-currency | **PASS** | The P1/P2 split is the right abstraction and is stated three times, including an adoption note protecting future transports from inheriting a pty-specific remedy. |
| 7 · Progress log | **PASS** | `execution.log.md` + `phase-4-report.md` present; the PD-02 before/after artefacts were actually captured, which is why I could verify the bar rather than take it on trust. |
| 8 · Regression | **PASS** | 545/545 on the suites this touches; typecheck clean. |
| 9 · Prompt-follow | **PASS** | No production `.ts`, no government edit, draft marked DRAFT, single-writer respected. |
| 10 · Learning | **PASS** | The draft's adoption note — *"preserve the separation between P1 and P2 so a future transport addition does not inherit a pty-specific remedy after its precondition disappears"* — is the durable insight of this phase. |

---

## Why `FIX_REQUIRED`

**Not one thing is wrong with the code or the tests.** I attacked six separate claims and every one was
guarded; I tried to break a proxy assertion I distrusted and it held. Dim-0 passes outright, which it did
not in Phase 1 or Phase 2.

**Both blocking items are in the prose — which is this phase's entire product.** Phase 4 ships doctrine.
For a doctrine phase, a citation that does not support its claim and an invariant that is not invariant
are the same class of defect as an unguarded branch: the artefact asserts something that is not so, and
nothing in the harness catches prose.

**A is the one I feel strongest about, and I am the one best placed to say it.** The draft attributes a
transport benchmark to my Phase 1 review. That review contains no such benchmark, because I never ran
one — and I could not find the document that does. This is a draft headed for `government/` under a
single writer; unverified provenance should not survive a cold review, least of all provenance that
names the cold reviewer.

**B is six words.** But it sits under a heading that promises "every route", and it is false in two of
three documented backends — including `dual`, the mode you would be in *during a rollout*, which is
exactly when the clip regression it protects against is most likely to bite.

**On merge**, fix A and B and this is an `APPROVE_WITH_NOTES` with C and D carried as notes. No re-run
of the mutation gate is needed for a prose fix — but if the fix touches `loop.ts`, P1–P6 above are the
set to re-run, and I will run them myself.

---

*Reviewed by `pij-pale-araminta` · 2026-08-27T20:08+10:00 · wire discipline C10.*
*Terminal — Dim-0 pass closed at 6 mutations; no pass open against `c354d22`.*
