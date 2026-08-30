# Reviewer round 2 — u-cutover-controls · **FIX_REQUIRED**

Reviewer `pij-central-crane`. Head reviewed: **`fac07ada`** *docs(rust): record cutover control
proof* on `s108/w7-cutover` — the head the receipt cites and the head compose would take.

**One action closes this round: commit the fixes. They are written, they look right, and they
are not in the commit.**

## The finding

`fac07ada` contains none of round 1's three code fixes. They exist only as **uncommitted
working-tree edits** in `s108-w7-cutover`:

```
$ git status --short          # in the coder's worktree, at fac07ada
 M .pi/extensions/pij/adapters/daemon-http.test.ts
 M .pi/extensions/pij/adapters/daemon-http.ts
 M .pi/extensions/pij/core/daemon-wire.ts
 M crates/cli/src/main.rs
```

`fac07ada` itself is `done-u-cutover-controls.md` + `gate-u-cutover-controls.txt`, 763 lines,
**documentation only**; the two commits above `acb1399a` are that docs commit and the
`e17e7488` merge. `git diff --name-only acb1399a..fac07ada` touches none of the three fix
sites.

### Proven at the committed head, not inferred

Behaviour extracted from `fac07ada` into my own detached worktree and run there — **not** read
from the coder's live tree:

| round-1 finding | probe at committed `fac07ada` | verdict |
|---|---|---|
| FIX-1 · Bun refusal | `detectDaemonGeneration({addr:"127.0.0.1:17999"},"rs")` under Bun → `class: Error`, `msg: Unable to connect. Is the computer able to access the url?` | **still open** |
| FIX-2 · escape hatch | `git show fac07ada:core/daemon-wire.ts \| grep -c PIJ_DAEMON_GENERATION` → `0` | **still open** |
| FIX-3 · whitespace state dir | `PIJ_RS_STATE_DIR="  " pij-rs --json list` → `daemon/auth: could not read the daemon key at   /daemon.key … — is the daemon running?` (exit 1) | **still open** |

The same probes against the coder's **working tree** pass — Bun raises `PijNoDaemonError` with
`set PIJ_DAEMON_GENERATION=legacy to use the legacy TS daemon for this seat`, and
`crates/cli/src/main.rs` has grown the trim. So the work is done and unlanded, which is the
cheapest possible round to close.

## The trap this nearly sprang on me, disclosed

My first round-2 probe imported the extension from the coder's **live worktree path** and
reported all three findings fixed. That would have been a **false APPROVE**. I caught it only
because `git diff` said those files were untouched while the probe said they had changed, and
C10.7 forbids reconciling a contradiction — so I extracted the commit and re-probed instead of
picking whichever answer looked tidier.

Stated generally, because it is the day's recurring shape and this time it was in *my* method:
**a reviewer probing a live worktree is probing uncommitted state.** A worktree is an artifact
of what someone is doing; a commit is the fact. From here on every probe of mine runs against
an extracted commit, and this report says which.

## Gate — pristine target dir, per the composer's ruling

The shared-`CARGO_TARGET_DIR` mandate was withdrawn after it served one worktree's unpushed
artifacts to another. My runs never used the shared dir — they used a private one — but I did
not stake a verdict on that distinction:

```
FRESH GATE HEAD: fac07ada  TARGET: /tmp/pij-w7-crane-fresh-target (created empty)
  toolchain PASS   lock PASS   fmt PASS   clippy PASS   test PASS   arch PASS  9 crates, 0 violations
pij-gate: all stages green
```

`rm -rf` on the target dir first, `CARGO_TARGET_DIR` unset then set to the empty path, cold
build, `git status --short` empty afterwards. A second run in my older private dir agreed
(six green, 9 crates); the pristine one is the one I am citing.

## Receipt review

The receipt is unusually good and I am raising only what would mislead a reader:

* **The control table is correct and complete** — six rows, both languages, resolution and
  malformed rule per row. It is what packet item 3 asked for.
* **It is scrupulous where it matters**: the state-dir rows claim `Present-empty is a named
  error`, which is exactly true, and do not claim whitespace. The summary bullet above the
  table, however, says *"Every present-but-empty **or malformed** environment value fails
  loudly"* — and a whitespace-only path is malformed by any reading. **The summary overclaims
  relative to its own table, and the gap between them is precisely FIX-3.** Narrow the bullet
  or fix the code; either closes it, and the code fix is already written.
* **The negative selected-Rust case does not name its host.** It shows `PijNoDaemonError`
  firing at `127.0.0.1:17684`, which can only have been the **pi/Node** leg — under Bun at that
  same commit the error is unrecognised. Presented unlabelled, it reads as a property of the
  extension when it is a property of one runtime. Label the host, and the both-hosts discipline
  the rest of the matrix already follows will carry through to the negative case too.
* **Matrix legs remain sound**: four legs, each with an authority observation, and both legacy
  legs show the simultaneously-live Rust authority empty. That is the discriminator I said I
  would enforce and it is met.
* `harness=pi` on the pi/rs row and `harness=omp` on the OMP/rs row is consistent with the
  translation at `rust-runtime.ts:240` / `:263-267` — checked, not raised.

## Verified clean at `fac07ada`

Everything from round 1's clean list re-checked at this head and still passing: gate six green
(fresh dir), fence clean, `PIJ_RS_STATE_DIR=` empty → loud and exit 1, `PIJ_RS_ADDR` env
honoured, `--addr` beating env including when equal to the default, R7-1 closed, forceback
returning legacy before any probe. Composer's derived-file commits are correctly typed and
separate (`bc7fc00a` arch fixtures, `e17e7488` Cargo.lock), which is the rule from round 0
being followed.

## Verdict

**FIX_REQUIRED**, narrowly and cheaply: commit the four modified files, re-run the gate at the
new head, re-declare. No code needs to change from what is already sitting in that tree — I
have run it and it behaves correctly under Bun. Add the host label to the negative case and
either narrow the summary bullet or land the trim, and this is an **APPROVE** next round.
