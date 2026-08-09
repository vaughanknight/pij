# Live CLI proof — Phase 1 (AC-01 demonstrated, not asserted)

**Captured** 2026-08-05 by `pij-respectable-starfish`. Read-only commands; nothing mutated.

Prompted by o-prime `pij-continuing-ermine`'s constraint: *"Verify at the command line, not
through the tests… a green test on a two-seam permission gate proves one seam."*

## Which process adjudicates — determined by observation, not assumed

I had asserted a `daemon-restart` baton was needed. The o-prime challenged it. Determined:

| fact | evidence |
|---|---|
| the daemon runs from the **main checkout** | `npm exec tsx /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/daemon.ts` — it never sees worktree source, so restarting it would have proved nothing about this branch |
| bare `pij` resolves to the **main checkout** | `command -v pij` → `~/.npm-global/bin/pij` → `/Users/jordanknight/pi-hacking/pij/harness/scripts/pij-cli.cjs` (the worktree-binding trap `government/orient-local.md` warns about) |
| `just pij` runs the **worktree** CLI | `justfile:116` → `node harness/scripts/pij-cli.cjs "$@"`, resolved against cwd |
| the refusal/projection is evaluated **in the CLI process, per invocation** | the transcripts below — a worktree edit is live with **no restart** |

**Conclusion: no `daemon-restart` baton is required for a CLI-path proof.** Request withdrawn;
no seat on the box was interrupted.

## The transcripts — same command, same seat, two source trees

Phase 1 changed what `pij state` emits, so it is its own marker; nothing had to be mutated.

```console
$ # LEFT — global pij (main checkout, UNPATCHED = what ships today)
$ pij state pij-yucky-mosquito --json | …
has orchestrationRole key: false | has parent key: false

$ # RIGHT — worktree pij via just (PATCHED = this branch)
$ just pij state pij-yucky-mosquito --json | …
has orchestrationRole key: true | has parent key: true | values: {"role":"worker","parent":"pij-respectable-starfish"}
```

## What each side proves

**RIGHT — AC-01 demonstrated at the command line.** Both keys present; `parent` resolved to the
real parent (`pij-yucky-mosquito` is my linked child), which also exercises `effectiveParent`
end-to-end rather than only in a unit test.

**LEFT — issue `#95`'s diagnostic half, reproduced on shipped code in one command.** On `main`
today, the verb a seat runs on itself to ask *"am I gated?"* answers by **omitting both keys**.
A reader doing `j.orchestrationRole == null` gets "ungated" for every seat alive, and for a
capability gate **the fabricated answer is the permissive one**. That is the defect, not a
description of it.

## Correction recorded against myself

I asserted the restart requirement to the o-prime **before determining it**. That is the same
class as the check-passed-while-the-real-surface-disagreed cases it cited — an untested premise
carried as fact — and it was mine. Determining it took one read-only command and saved a
machine-wide interruption.
