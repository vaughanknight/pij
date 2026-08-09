# SEAT — s093 `send-path`

| | |
|---|---|
| **Seat** | `pij-historical-skunk` |
| **Harness / model** | GitHub Copilot CLI · Claude Opus 5 |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `/Users/jordanknight/pi-hacking/pij-worktrees/s093-send-path` |
| **Branch** | `s093/send-path` |
| **Charter** | `~/.pij/pij-continuing-ermine/briefs/02-send-path.md` |
| **Issues** | pij#128, pij#132 · **opened**: pij#167 · **contributed to**: pij#192, pij#194 |
| **PR** | #191 |
| **Ledger block** | `F-200`–`F-207` · `W-200`–`W-202` · `S-200`–`S-204` |
| **Fleet peers** | coder `pij-free-porpoise` (copilot, claude-opus-5, high) · reviewer `pij-ultimate-fowl` (copilot, gpt-5.6-terra, high) |

## Corrections this stream made to claims that were stated as true

Recorded here rather than only in findings, because someone arriving cold at the merged PR reads
this file first and would otherwise re-derive a framing already known to be wrong.

**1. The charter's done-bar for #128 was unattainable, and was struck.** It required that a body
containing backticks and `$( )` be *"delivered verbatim and executes nothing"*. No pij-side change
can hold that: shell expansion completes before pij's process exists, and the send path is already
argv-only (`adapters/tmux-keys.ts:11-32`, `execFileSync`, no `sh -c` on the path), so there is
nothing left to harden at delivery. **pij cannot deliver verbatim what it was never given.** The
prime replaced it with three checkable facts about artifacts (a safe path exists, docs and `--help`
recommend it, the unsafe path is labelled at the surface).

**2. pij#132's stated mechanism was wrong.** It is reported as intermittent, load-dependent, and
possibly a queue race. It is **deterministic**: `--file` is reference-passing and never reads the
file, and both push injectors drop `attachments` entirely. The "sometimes it worked" observations
were almost certainly `--body-file`. Correction posted on the issue.

**3. The fix's own premise was falsified mid-plan.** The plan assumed `--body-file` was the safe
path. It was not: it `trimEnd()`-ed the body and re-appended it as an **argv token**, so a body
starting `--` was lexed as a flag and `--wait` could swallow the file's contents. **The mitigation
reproduced the flaw it mitigates, one layer down** — and was audited less precisely because it had
been adopted deliberately. Fixing it became the prerequisite deliverable.

**4. A test written *by this stream* to close a reviewer finding could not fail.** The F2 valence
pin asserted a sentinel was *absent*; absence is also what every parse error returns, so five
assertions were zero. It passed a coder, a PM who asked for it and read it, and a cross-model
reviewer. **A vacuous test is invisible to reading by construction** — it is what a correct test
looks like. Only a mutant separated them.

**5. My own prime suspect came back clean.** I pre-registered AC-06 as rank 1 on the argument that
I had *reclassified* it rather than rewritten it. The argument was sound; the conclusion was wrong.
Recorded because a pre-registered ranking is what makes a negative result durable — picked after
the fact, that suspicion would never have been written down.

## Hypotheses this stream disproved

| Hypothesis | Disproved by |
|---|---|
| pij#132 is a race in the queue/tick path | No timing input exists anywhere on the path; the behaviour is unconditional (`core/cli.ts:3014-3025`, `core/daemon/router.ts:41`, `core/session.ts:592`) |
| `--body-file` is a safe channel | `trimEnd()` + argv re-lex (`cli.ts:4253` + `core/cli.ts:707-720`) |
| A parent-argv detector could carry #128's safety property | Fails open on a security boundary, blind to interactive invocation — filed as #167 **with the reasoning**, so it is not silently re-proposed |
| My CI reds were the known hook-timeout flake (#193) | My symptom is a **test-body** timeout at 30s, not `Hook timed out in 10000ms` — a separate finding, now #194 |
| A passing suite means my test types are sound | `tsconfig.json:19` excludes `**/*.test.ts`; 108 errors across 19 files were invisible (#192) |

## What shipped

`E-EMPTY` refusal keyed on **what the target can actually render** (not a global empty-body ban,
which would have deleted the shipped telegram capability), placed in `dispatch` before `deliver` so
no receipt can describe an undelivered payload and every caller inherits it. Whitespace-only bodies
count as empty — **the emptiness test trims, the delivered body never does**. `--body-file` made
byte-exact with the body never entering argv. `pij send --help` repaired so it shows the safety note
it always claimed to. The unsafe form labelled in USAGE, the guide, and **the boot message pij
composes for every spawned peer**.

## Evidence discipline, and where it was corrected

Test-first with recorded verbatim RED; the outbox assertion ordered **first** so vitest's fail-fast
cannot hide the assertion that distinguishes *refused* from *delivered-then-complained*. Round two
split into **two commits** (tests, then fix) so the ordering is a git fact rather than a claim.
Criteria labelled BEHAVIOURAL / PRESERVED / **MUTATION-ONLY**. All three pre-registered mutants
re-run **on the rebased tree** after the ledger conflict, with the named failing test verified each
time and byte-identical restores — a docs conflict says nothing about whether code proofs are still
load-bearing.

Two of this stream's own evidence claims were downgraded on inspection: the first mutation pass
used the in-memory tool against subprocess specs (re-run on disk), and the pre-fix REDs proved only
the first assertion that fired (the tail assertions were closed by a separate named mutant).
