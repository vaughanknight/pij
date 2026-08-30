# Reviewer packet — plan 108

Written after wave 5, from five waves of reviews rather than from a template. It
replaces the ad-hoc brief the PM retyped each wave — three reviewers independently
had to be told the same standard, and the two habits that caught the most were
never in any brief at all.

Cite this file in the dispatch; add only what is wave-specific.

## 0. Your job

Verify the CLAIMS, not the prose. For every claim in a receipt, ask what would be
true if it were FALSE, then go and look.

You are not here to be agreeable and not here to pad. Waves 3-5 produced 10, 10
and 12 findings and refuted none; a round that finds nothing is a fine round, and
so is one that reopens something the PM already "fixed" — four of wave 5's twelve
were in code written to close earlier findings.

## 1. The two habits that earned their keep

Both were invented by reviewers, not asked for, and both caught real defects.

1. **Re-run the PM's mutations yourself.** Do not read the transcript. A witness
   that has never been observed to fail is a claim, and two of wave 5's regression
   tests passed their own mutations before witnessing anything.
2. **Probe the SHIPPED surface, not the unit.** Wave 5's cursor refusal was
   correct in `EventBus` and unreachable through HTTP; wave 4's dedupe defect was
   found by applying the committed SQL to a scratch database rather than reading
   the migration.

Restore the tree after every probe and say that you did.

## 2. The defect classes this codebase actually produces

Hunt for MORE of these; do not re-derive them.

* **A seam landed in one half.** The commonest by far. A model field with no wire
  field; a counter written by one method and unreadable by another; an amendment
  ratified to fix a collision that was still live in the one function that had to
  answer it.
* **A FIX landed in one half** (E-029, E-031). A defect class does not stop
  applying to the code that fixes it. **Check the producer, not the fix.**
* **The loop nobody ran** (E-030). Every long-lived loop needs a transient-failure
  test that drives THE SHIPPED WRAPPER. A test that reconstructs the loop proves
  the reconstruction.
* **A test that cannot fail** (E-027). A witness must ACTIVATE the mechanism it
  mutates. A broad distribution check defends an outcome and never exercises the
  code it claims to witness.
* **A fixture that passes for the wrong reason.** Wave 4's two-router test passed
  because the recipient was unbound, which has nothing to do with federation.
* **A fake that lies** (COMMON 1.6). Five found across two waves: dropped a
  retried body, accepted an unclaimed retry, ignored not-before, deduped on the
  wrong key, accepted an unclaimed ack. **A fake is a claim about the real
  adapter**; check whether any instrument compares them.
* **A claim of an observation nobody made.** The receipt vocabulary exists because
  of this. Look at delivery outcomes, sensor verdicts, spawn results — and at
  DIAGNOSTICS, where wave 5 shipped fabricated numbers behind a correct diagnosis.
* **Residue mistaken for state** (E-024). Anything recording what a PROCESS did
  that reads as what the WORLD is.
* **Silence where a signal is owed** (E-023). Absence is not evidence. A skipped
  frame, a filtered cursor, a swallowed error — if a consumer cannot tell the
  difference between "nothing happened" and "I could not see", that is a finding.
* **Branching on prose.** `meta` is for humans. Anything a caller decides with
  must be a kind, a field, or a type.

## 3. What to run

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_INCREMENTAL=0
cargo run --locked -p pij-testkit --bin pij-gate
```

Six stages. Run it yourself at every head you review; do not take the count from a
receipt. `harness checks` CANNOT run in these worktrees (no node tooling) and has
not since wave 0 — disclosed, not hidden, and not a finding.

**Use your own `git worktree add`** if you want to compare commits. Do not move
HEAD in the PM's tree; a previous reviewer did and nearly cost a commit.

## 4. Format

Numbered findings. Each carries: `file:line`, what is wrong, **why it matters**,
what would PROVE it, and a severity. Rounds continue until nothing above trivial
remains, then say **APPROVE** or **REFUSE** explicitly.

Name what you checked and are NOT raising. A verified-clean list tells the next
reader which known things were weighed rather than missed, and it is the half that
makes the findings believable.

## 5. Read before round 1

* `assets/wave-<n>/COMMON.md` — the contract the units were held to.
* `assets/reports/done-*.md` — every receipt is a claim you can test.
* `assets/experiences.md` — E-001…E-031. **E-023 through E-031 are the last two
  waves and they name the mistakes this codebase makes.**

---

## Added after wave 6 — four more classes, all found in shipped-and-gated code

**10. The config echo.** A reported value that is actually the configured limit.
Wave 6's parked event said `announcements: 3` to a seat that had experienced
eighteen; the publisher substituted the policy constant for the reconstructed
count. **Structurally invisible in ordinary tests, because ordinary parking happens
exactly AT the limit** — the two values coincide by construction, and only a subject
already over budget can tell them apart. Ask of any reported number: *could this be
the setting rather than the observation, and would any existing test notice?*

**11. Consent that holds only while the process holding it lives.** Tombstoning a
seat retired its tap in-process and had no restart arm: kill the daemon between the
tombstone and the next sweep and the pane is in neither the wanted set (tombstoned)
nor the tracked set (new process), so a released human's terminal keeps piping
for ever. For any withdrawal, revocation, or stop: **ask what happens if the process
that heard it dies before acting.** A record of release that never reached the world
is not a release.

**12. A durable home for a forgeable claim.** Wave 6 moved read-attestation onto the
spine *because the ledger evicts* — and never checked the claim being relocated was
true. The event was published before the ledger write, carried no outcome, and took
its seat **from the request body**. Relocating evidence does not make it evidence.
Ask: *who supplied each field, and could a caller assert it about someone else?*

**13. A gate that can fail correct code.** A fixed tick-count settle in a real-tmux
fixture went red under a cold full-workspace gate's compile load. The gate is the
ruled definition of done, so **flakiness there makes every future green an assertion
rather than a proof, and buys a re-run before anyone believes a red.** If you
reproduce a red, characterise it (isolated, under N-way load) and report it — do not
re-run until green. That reflex was the most valuable single act of the wave-6
review.

### A third reviewer habit

**Report your own red.** The instinct to re-run a failing gate until it passes,
then review the code as if nothing happened, discards the most interesting signal
available: that the proof surface itself is unsound. Characterise, then raise it.

### A fourth reviewer habit — report the number AND the command

Four people on this plan caught themselves at the same error within one day, which
makes it structural rather than personal:

- a PM reported a **null result as a positive** (a discriminator that never ran on
  71 unmarked panes, read as 71 correct decisions);
- the same PM then nearly reported a **contaminated red** as a defect, having armed
  a live test while the pre-fix binary was still running — testing the thing the fix
  replaced;
- a reviewer piped a gate through `tail -12`, **kept the verdict and dropped the
  evidence**, reporting `0 passed` beside a green;
- a coder shipped a `parked` event whose count was the configured limit rather than
  the observed number.

One shape: **the conclusion is cheap to carry and the evidence is easy to drop, so
what reaches the reader is the half that cannot be checked.**

So: report the number and the command that produced it. If you truncated the
output, say where. If a result depends on which binary or process was live, pin it
and say which. **A test whose instrument state is not pinned reports the
environment, not the change.**

### A fifth habit — pre-register the falsifier, in a file

Two findings this plan's reviewers produced arrived **before the code existed**: the
marker-identity gap, and the Telegram single-consumer trap where outbound takes no
lock and inbound is single-consumer, so the reply leg can be served by the very
bridge being replaced while every artefact looks like a pass.

Both were cheap because they arrived while the design was still free to change. Write
the falsifier down **before** the result exists — a falsifier recalled afterwards is
just an opinion about what would have convinced you.

