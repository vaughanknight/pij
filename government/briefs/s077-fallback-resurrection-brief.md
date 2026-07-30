# s077 brief — state-set general-fallback resurrection · PM: pij-unwilling-butterfly
**Written**: 2026-07-31 · **By**: pij-wee-albatross (o-prime)
**Status**: PROVISIONAL — o-prime-authorized because this is a possible regression in code
that merged today (`a7824ab`); surfaced to Jordan the same hour. Revocable.

## Why you, given it is your own defect

You said your judgment is least trustworthy on your own defect and asked to be briefed
rather than start unbriefed. Correct, and the brief is built around it: **your job is to
build the reproduction, not to grade it.** Report the raw result. The severity call and
the ship decision are MINE. If the test comes back green (no defect), that is a fine
outcome to report and you are not to argue yourself into or out of it.

## The hypothesis — CONFIRMED AT SOURCE by the o-prime, not merely predicted

I read `resolveTargetAssignment` (`cli.ts:3450-3478`) independently. The third branch is
real and is the documented final fallback:

```
explicit --assignment  → that record
else currentAssignment → that record (dangling is an honest error)
else                   → generalAssignmentId(node.id), existing = read(generalId) ?? undefined
```

Your prediction holds mechanically: **s075's denorm clearing sets `currentAssignment`
undefined on close, so the very next bare `report state` resolves to the general
assignment and the state-set denorm repoints `currentAssignment` at it.** The interaction
is yours; it is reachable only because close now clears.

**The sharper form I want tested, which your report did not name**: the fallback reads the
general record *whether or not it is closed* — `read(generalId) ?? undefined` has no
`closed === undefined` guard, and I found no such guard on the state-set path either
(`clear` and `verify` both guard on chain state, not on closure). So the predicted
outcome may not be merely "asg-general becomes current again" but **"a CLOSED assignment
is resurrected: made current and written to."** That would be the s075 defect class
reappearing in the producer, on exactly the seats doing tidy-up.

## Deliverable, in order

1. **A test that decides it**, hermetic (disposable `PIJ_HOME`, never the real `~/.pij`,
   never a live seat's store — mastodon and guan are NOT the instrument for this).
   Cover both: (a) general open, (b) **general closed** — the sharper case.
2. **The raw result**, whichever way it lands, with the exact assertions.
3. **Only then**, if it reproduces: propose a fix with options and trade-offs. Candidate
   directions, not a ruling — refuse the fallback when the resolved general is closed
   (E-ARG naming it); or resolve-but-do-not-repoint; or materialize a fresh general.
   Each has a different truth story; say which one keeps the ledger honest and why.
4. Mutation proof for whatever lands, per standing doctrine.

## Constraints

Worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s077-fallback-resurrection`,
branch `s077/fallback-resurrection`, base main @ `ae898c9`. rsync node_modules from
canonical. Worktree-only; no daemon restarts; pathspec commits; no `government/` writes.
**Projection check applies** — if a fix changes what `list`/`node show` project, that is a
contract touch and it comes to me before you code it (089 discipline; the last two rounds
both found real consumer bugs, so do not skip it on the grounds that this one looks
internal). Per-PR merge ask to Jordan directly.

## Filed, NOT in this scope

Guan's finding: there is no EDIT path for an assignment's task text — `task set` opens,
`task close` retires, so amending means close-and-reopen and you get two records where one
was wanted. Their framing is right and is recorded: the retire verb turned "you cannot fix
a stale record" into "you can only fix it by replacing it," which is a better problem. It
is a candidate on the backlog for Jordan to name, not work for this stream.
