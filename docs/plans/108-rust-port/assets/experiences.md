# Experiences — plan 108 wave 0 (pij-team trial, PM seat)

Friction logged the moment it bit, per pij-team tenet 13. This is pij's own log;
nothing here is written into the flowspace3 tree.

Seat: `pij-revolutionary-lungfish` (PM) · prime: `pij-dominant-vicuna` · 2026-08-28

## E-001 — `rg` is blind to `.pi/`, and the repo's own AGENTS.md pre-paid it

Not hit, because AGENTS.md documents it. Recording the non-hit deliberately: the
warning worked, which is the only evidence a written-down trap is worth keeping.

## E-002 — the machine had two Rust toolchains before the plan started

`cargo`/`rustc` resolved to Homebrew 1.95.0 while `cargo fmt`/`cargo clippy`
resolved to rustup's 1.98.0 components. Found in the first five minutes by
*measuring* rather than assuming, and it changed the first task: a
`rust-toolchain.toml` pin alone would have been inert under a non-rustup cargo.

**Encoded**: exact-version pin + gate stage 1 asserting the running rustc equals
it. Not documentation — a red gate.

## E-003 — a stale shell hash reported the wrong compiler

After putting `~/.cargo/bin` first on `PATH`, `rustc --version` still printed the
Homebrew build while `which rustc` printed the rustup shim. The shell's command
hash was stale; `hash -r` fixed it.

Worth logging because the two probes DISAGREED and the wrong one was the more
authoritative-looking. Every toolchain claim in this plan therefore cites
`rustup show active-toolchain`, which names the file it is honouring.

## E-004 — my own probe conflated absent with null

Counting `levels` encodings in `pij models --json`, I used Python's `.get()` and
reported "null: 9". `.get()` returns `None` for a MISSING key, so those nine rows
had no `levels` field at all. The instrument collapsed two states — the exact
failure `E-NOREG` represents in the product being ported.

**Encoded**: the corpus carries both encodings, a test fails if a third appears,
and the manifest answer states the fold. The prime's standing note ("keep that
instrument discipline in every probe") is the real deliverable.

## E-005 — the prime's `git add -A` swept my in-flight work into its commit

`c0026bfc` ("PRD register discipline") contains 1164 insertions of which two files
were the prime's; the rest was the tk-3a93 gate, mid-task. Nothing was lost, but
the receipt trail was: `git log -- crates/testkit` attributed the drift gate to a
docs commit.

**Encoded**: prime now stages by pathspec only, with a written write-set split
(`docs/plans/prd/**`, `*.dd.*`, `assets/workshops/**` are the prime's;
`crates/**`, `Cargo.*`, fixtures and tests are the PM's). AGENTS.md already banned
`git add -A`; the ban existed and was not self-enforcing, which is the argument
for a hook rather than a sentence.

## E-006 — a shared worktree is edit-time serialization we did not have to accept

E-005's root cause is two seats in one tree. pij-team's isolation mode is
worktree-per-coder, and a solo-PM wave made a shared tree look free. It was not:
it cost an attribution smudge and a coordination round trip.

**Suggested template change**: the PM packet should state the tree-sharing posture
explicitly — "prime and PM share this worktree; here is the write-set split" —
rather than leaving it to be discovered by collision.

## E-007 — backticks in a `git commit -m "…"` message executed as a command

`` `levels` `` inside a double-quoted shell string ran as a command substitution.
The commit succeeded with the phrase silently deleted, so the receipt lost a word
and `command not found: levels` was the only signal.

**Encoded**: later commits use `git commit -F -` with a heredoc. A commit message
is a receipt; a shell that edits it silently is a corrupted instrument.

## E-008 — the fixture corpus earned its keep on day one

Pointing the v1 decoder at CAPTURED traffic failed immediately: the TS wire is
`{seq,timestamp,type,data}` and v1 is `{v,at,kind,seat,payload}`. Had the corpus
been synthetic — written from what I believed the shape was — the tests would have
passed and the difference would have surfaced in wave 3, inside a parity task,
against a much bigger diff.

R6b's "captured, including malformed" is now evidence-backed rather than
plausible.

## E-009 — the first negative test of the toolchain assert was a tautology

Mutating `rust-toolchain.toml` to 1.95.0 and re-running produced
`toolchain PASS — rustc 1.95.0 == pin`, because rustup honours the pin: the
compiler changed WITH it. The assert compared the pin against a compiler chosen by
that pin.

It would have been filed as a passing negative test. The real hazard needed the
other variable mutated — a cargo that is not a rustup shim — and against that it
fires correctly.

**Generalisation worth keeping**: when negative-testing a check, mutate the input
the check is *defending against*, not the input it *reads*. Those are different
variables whenever the system under test can adapt to the second one.

## E-010 — a test flaked, and the flake was a re-derived primitive

`the_key_is_0600_and_exists_before_the_socket_can_be_reached` passed alone and
failed in a full run: the test named its temp dir from pid+clock, macOS clock
granularity let two tests collide, and a sibling's cleanup deleted the key under
assertion. `FreshStore` already carried the process-local counter that prevents
it; the test re-derived the idea slightly wrong.

DL-004 verbatim — "every adapter re-invented a ~110-line recorder". **Encoded**:
`pij_testkit::fresh_dir`, so the next seat cannot re-derive it either.

## E-011 — `toml`'s `FromStr` accuses the file

`text.parse::<toml::Value>()` on a valid document fails at line 1 column 1 with
"unexpected content, expected nothing", because that impl parses a *value*. The
message names the FILE, so the natural next step is to go and doubt a file that is
fine. `toml::from_str` is correct.

Logged as a class: **an error that misattributes blame costs more than one that
says nothing**, because it sends the reader somewhere.

## E-012 — the registry row knows less than `whoami` does

My own descriptor read `pane: null, folder: null` while `pij whoami` reported
both, and `pij adopt` refuses `--harness pi` (`E-ARG: must be
claude|copilot|codex`) — so a pi seat has no route to attach its pane. The
reviewer's descriptor read `model: null` while the spawn argv and the pane footer
both knew it.

One class: **the registry row lacks facts another surface already holds.** Banked
by the prime as R5 items 13–14, wave-1 contract inputs for `u-store`/`u-harness`.

## E-013 — four review rounds, one repeated mistake shape

Eleven findings, none refuted. Rounds 2–4 were all the same class: **a regression
that exercises the path without exercising the property.**

* the two-boot key test passed because the second boot died at the bind, before
  staging mattered;
* the schema regression covered four operations out of ten;
* the `Clone` removal shipped with a test that still passed when `Clone` came back.

Each looked like coverage. The fix that generalises is not "write more tests" but
**enumerate the surface** (the schema regression now lists all ten public
operations) and **assert the property, not the path** (the `Clone` check is a
compile-time assertion carrying its own sanity check, because a probe that always
answers false is a test that always passes).

**Suggested tenet edit** for `pij-team/TENETS.md` tenet 5 ("make done mechanical"):
a regression is only done when the mutation it exists to catch has been run and
observed to fail. Not "a test exists" — "the test fails for the right reason".

## E-014 — the spawn form was wrong and nobody could have known from the packet

I spawned the reviewer with `--harness copilot`; Jordan's standing form for
coders and reviewers is `--harness pi --bin omp --model
github-copilot/gpt-5.6-sol-fast-1m`. The correction arrived mid-review.

Nothing in the packet template, the skill, or the settings ddoc carried the spawn
line, so the PM had to infer it from `pij models` output. **Suggested template
change**: `packet-*.dd.json` gains a `spawn` field carrying the verbatim command
for the role, so the form is delivered rather than derived.

## What I would change in the pij-team templates

1. **State the tree-sharing posture and write-set split in the packet** (E-005/6).
2. **Packet should name the negative-test discipline** (E-009): a task that asks
   for "prove the check fails" should say *which variable to mutate*, because the
   obvious one is often the wrong one.
3. **The packet's `refs` must resolve in the seat's worktree** — mine pointed into
   another repo's `scratch/`. The skill already says this; the template does not
   enforce it. A `refs` entry outside the worktree should be a scaffold-time error.
4. **The packet should carry the verbatim spawn line for every role it names**
   (E-014) — the PM currently derives it, and derivation is where a standing
   ruling gets lost.
5. **A regression is done when its mutation has been observed to fail** (E-013),
   not when it exists and is green.
6. **A done_when row can outlive its task** (dw-a803: the assert it named could not
   exist until a later task). That was fine because it was recorded as OUTSTANDING
   rather than quietly checked — but the template should have a place for
   "satisfied at task N+k", instead of relying on a PM to volunteer it.
