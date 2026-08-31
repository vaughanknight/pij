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

## E-015 — the packet's fence was wrong four times, and every coder stopped

Four coders raised six fence defects between them before writing code: Cargo.lock
omitted from every fence while three units had to add dependencies; the arch
metadata fixtures omitted while any graph change makes them stale; u-tmux's done
bar requiring testkit paths its scope excluded; u-liveness's parser fixtures
having nowhere legal to live.

Every one was my error, and every one was caught at the ack rather than in a diff.
**Encoded**: COMMON.md § Derived artifacts now carries the regenerate-never-merge
rule, so the fifth coder inherits what the first four had to ask for.

The general shape: **a fence written from the code's structure will always omit
the DERIVED files, because they are not where the work is.** They are where the
merge is.

## E-016 — two coders found the same defect independently

u-store (D5) and u-events (D1) both reported that `Spine::tail` returns
`Vec<Event>` with no sequence, from opposite ends: one writing the tail, one
consuming it for replay.

Independent discovery from different units is the strongest signal a defect is
structural rather than a matter of taste — and it arrived because both were made
to ack before coding. Neither could have seen the other's message.

## E-017 — a coder caught the PM shipping a receipt that did not match its code

My seam commit's doc comment said `#[serde(skip)]`; the attribute said
`skip_serializing_if = "Option::is_none"`. The cursor would have serialised the
moment it was `Some`, violating R7 in practice while the commit message claimed
compliance.

`pij-rapid-gurgeh` read the MERGED code against my ruling instead of trusting my
receipt, and refused to edit my seam — it reported instead. That is exactly the
wave-0 review lesson arriving unprompted in a coder, and it is worth more than the
fix.

**Encoded**: the absence is now asserted
(`a_sequenced_event_never_carries_its_cursor_onto_the_wire`), so the next
contradiction between a comment and an attribute fails a test rather than a review.

## E-018 — first light found what 122 green tests could not

Every unit test passed, the gate was six-for-six, and the first end-to-end run
still surfaced that `subscribe(since: None)` replays the entire spine — unbounded
work at attach time for a UI joining a long-lived fleet.

Not a bug (it matches its documentation) and not caught by any suite, because no
suite asks "what would a real consumer do first". **A composed-tree transcript is
a different instrument from a test, and this is the second wave running where it
paid for itself.**

## E-019 — the seam belonged to the PM, and moving it there was the right call

`Event.seq` was needed by two units in two worktrees. Assigning it to either
coder would have made three seats wait on one; landing it centrally, with every
struct-literal callsite migrated in the same commit, cost one commit and unblocked
all four.

**Suggested tenet edit**: tenet 4 says workers ship the recipe and the PM
integrates. The corollary this wave proves is narrower and worth stating —
**a type that two units both consume is not a unit's work at all; it is the
PM's, and it should land before either unit needs it.**

## E-020 — a mechanical rewrite plus a targeted edit that silently no-oped

I built the wave-2 reviewer packet by sed-rewriting the wave-1 one (`s/wave-1/
wave-2/g`) and then patching the receipt list by exact-text match. The sed ran
FIRST, so the text my patch was looking for no longer existed; the patch matched
nothing, said nothing, and left behind `done-wave-2-u-store.md` — a filename for
a receipt that never existed in any wave.

The reviewer found it by reading the TREE instead of the packet, which is the
second time in three waves that checking a named receipt against disk has been
the whole finding.

**Two lessons, and the second is the transferable one:**

1. A targeted edit after a mechanical rewrite must be verified, because "replaced
   nothing" and "replaced correctly" look identical from the outside. Python's
   `str.replace` and `sed` both fail silently by design.
2. **The wave-1 lesson generalised**: receipts must be files, AND the list of
   receipts must itself be checked against the files. A checklist derived from
   last wave's checklist inherits last wave's names.

## E-021 — the fixture I hashed was the fixture I wrote, not the one I meant

`pi-pane-ready.txt` shipped as 16 blank lines with a manifest entry whose sha and
byte count were *correct* — because I hashed what I had written. Only the `answer`
field, describing content the bytes did not contain, made the contradiction
visible, and only because a coder read one against the other.

A checksum proves a file has not changed. It cannot prove the file was ever right.
That is what the corpus's ANSWER field is for, and it earned its place here.

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
6. **The fence must enumerate DERIVED files explicitly** (E-015) — Cargo.lock,
   generated fixtures, anything a build regenerates — with a
   regenerate-never-hand-merge rule attached. Four coders asked; the packet
   should have answered.
7. **Shared types get landed by the PM before dispatch** (E-019), not assigned to
   whichever unit notices first.
8. **A done_when row can outlive its task** (dw-a803: the assert it named could not
   exist until a later task). That was fine because it was recorded as OUTSTANDING
   rather than quietly checked — but the template should have a place for
   "satisfied at task N+k", instead of relying on a PM to volunteer it.

## E-022 — a uniform confidence label over a mixed-confidence section

`pij-fatal-woodpecker` (s105 PM), reviewing the u-uds packet written from their own
design document. I asked a narrow question — are §4.1's limits stated at the right
confidence in MY packet? — and the answer came back that THEIR table was wrong.

§10 classed all of §4.1 as first-party. It was mixed: they ran the socket path and
mode, the NDJSON frame, the peer key file, the two-step discovery and the from-mode
hold; they never measured the ~1 MB cap, the 50-deep receive queue, the rate limit or
the dedupe — those are Anthropic's documented numbers arriving via an upstream issue.

> A uniform label on a mixed-confidence section is exactly the failure that table
> exists to prevent.

Twice this week a question meant as "did I state this correctly?" has returned "no,
the source was wrong" — the wire contract for me, the evidence table for them. Both
times the corrected artifact was better than either party had alone. The useful half
here was theirs and I would not have found it: the 50-deep queue is the ONE of the
four numbers that is a backpressure threshold, so being wrong about it means silent
drops under load, where a 1 MB cap fails loudly. Same paragraph, same source, and one
of them can hurt you quietly.

Also E-022b, same review, and the harder lesson: I wrote the ladder as
"socket → pty → pointer" and then forbade body typing three sentences later. Read by
someone who had not read the source, that is a fallback chain — try the socket, fall
back to the pty — which IS the rung I deleted, wearing a different name. My own
trap-door instruction invited the thing it warned about. **The ordering is the half a
coder implements from; the prose is the half they quote afterwards.**

## E-023 — a silence-based receipt is only honest if silence is a SIGNAL

`pij-yearning-sma` (u-uds), measuring rather than quoting. Claude 2.1.251,
isolated throwaway seat, authenticated frame (peer key matching `procStart` and
`pidDomain`). The receiving UI visibly held it — *"Held peer message ... sender
did not attest its permission mode ... not delivered to Claude (1 held)"* — and
the socket returned **zero bytes**. Repeated with a raw capture client, waited two
seconds: nothing.

Our ~150 ms negative-ack timer therefore returned
`Delivered { origin: InjectedToTransport }` for a message that was observably held
and never reached the model. **We reproduced the exact defect the receipt
vocabulary was built to prevent, inside the vocabulary.**

The mechanism was ported across a SHAPE CHANGE and nobody re-verified its
precondition. In the fork, a sender SESSION listens on its own channel, so silence
is weak evidence. In a daemon there is no such channel, so silence carries nothing
at all — and "no drop report within 150 ms" degrades from weak evidence to NO
evidence **while producing the same confident word**. A receipt that gets weaker
without changing its vocabulary is invisible by construction.

> A mechanism ported across a shape change needs its PRECONDITION re-verified, not
> just its behaviour.

Ruled: capability defaults CLOSED. The daemon is not a Claude session and has no
permission mode to attest, which is exactly why the frame is held — so we do not
write bytes and then reason about what they became. u-uds ships inert and honest
rather than live and lying, and the accept precondition arrives with wave 4's
spawn surface.

Note the near miss: the alternative on offer was to widen `InjectedToTransport` to
mean "accepted, possibly held". The moment one word covers both, nobody downstream
can distinguish delivery from limbo — which is the entire reason `origin` is a
required field rather than an optional annotation.

Third §4.1 correction this week, all from re-running a claim instead of reading
it. s105's PM (`pij-fatal-woodpecker`) closed before this one reached them; the
erratum belongs in their document and is recorded here instead.

## E-024 — a residue is not a state

`pij-eligible-squid` (u-extension), ruling-vs-contract contradiction, caught before
wiring.

I ruled the generation probe as "TS files present -> legacy; else probe the
daemon". It reads as sound positive discrimination — and it would have pinned
EVERY EXISTING INSTALLATION to the legacy path forever, because every real seat
already has those files. Cutover would have required operators to delete state
before the new build could ever see a running daemon: a migration that can never
start. The settled `WIRE-CONTRACT` said the opposite (probe first); I inverted my
own document without noticing.

> **Legacy files are a RESIDUE, not a STATE.** They record that an old build once
> ran here, not that an old build is running here — and residue outlives the thing
> it came from.

So a live daemon answering an authenticated probe is strictly stronger evidence
than a file on disk. The probe goes first; files only ever break a tie the probe
could not. The positive-discriminator rule was right; WHEN to consult it was not.

Second-order, ruled at the same time: the new build must never CREATE the old
files while running in Rust mode, or it manufactures its own residue and a future
probe failure reads as legacy on a machine that has only ever run Rust. It must
also not delete a prior generation's files — that is not this unit's call, and the
ruled order tolerates them correctly.

Third contradiction this coder found between two things the PM wrote, in one ack
cycle.

## E-025 — the default was true in the wave that wrote it

`pij-eligible-squid` (u-extension), five findings in one unit, all the same shape:
**two halves that are each internally consistent, wired to different worlds.**

1. `/v1/send` persisted a private `QueuedSend` shape; `DeliveryService::inbox`
   decoded that same queue as `Msg`. Neither could decode the other, and both
   halves had passing tests. The route also consulted no routing policy, no
   tombstone and no transport, and invented a `Queued` receipt for work nothing
   had judged.
2. Nothing published `message.pushed`, so a seat could observe that it had been
   spoken to and never read what was said.
3. `ErrorKind` was announced as landed while three helpers still emitted envelopes
   with no discriminator at all.
4. `Registration` had no way to supersede a seat, so the first `/new` from a
   healthy seat would have been refused forever by the #19 alias guard.
5. **The shipped daemon booted every adapter fake.** `hello_config` was
   `Config::default()` — seven fakes and an in-memory store — so the binary a user
   runs could not corroborate a registration and lost its roster on exit.

> The default was inherited from the wave where it was TRUE, and nothing re-asked
> once the real adapters existed.

`hello_config` was CORRECT in wave 0; a hello daemon should be all fake. Waves 1,
2 and 3 each added a real adapter and none of them owned that line, so an accurate
config quietly became an old one. Every unit's tests passed throughout, because
every unit tested its own adapter **and none of them ran the binary**.

The generalisation, which is the reason this is worth an entry: a unit test proves
a part against the world the test builds. Only running the shipped thing proves
the part against the world the USER gets. Four of these five defects were
invisible to a suite that was, at the time, 231 tests and entirely green.

Related trap found in the same pass: `test_services` swapped `Services` fields
AFTER `build_services` had constructed the delivery service from the original
fakes — a fixture that looked injected and was not, so assertions ran against
parts no test could see.

## E-026 — removing nothing compiles

Review round 2, `pij-experimental-fish`, and the highest-severity defect of the
whole review: **a receipt claiming a change the code did not carry, where the
receipt was a commit message about an ACCEPTED REVIEW FINDING.**

The mechanism, which is the point:

1. The edit was applied by a scripted string replacement whose pattern did not
   match the file. `str.replace()` returns the input **unchanged** when it finds
   nothing — no error, no diff, no signal of any kind.
2. The build stayed green, because **removing nothing compiles**.
3. The commit message described the INTENT rather than the RESULT, and nobody
   read the diff back.

Every instrument in the harness was green and none of them was looking at the
thing that mattered. The reviewer caught it by re-running their own probe against
the fix head — `supersedes` naming a ghost seat still returned 200 — rather than
re-reading the claim.

> Any scripted edit must ASSERT that its pattern matched. Any fix commit claiming
> a review finding is verified by re-running the reviewer's probe, not by
> re-reading the message.

This is E-020's lesson arriving a third time, now in code edits rather than
packets. The reviewer applied it to themselves in the same round: when they
re-ran the mutation witness, they added an assertion that their own revert pattern
had matched, explicitly so as not to reproduce this defect inside the test for it.

The encoded control, not a resolution to be careful: **anchored edits that FAIL
when the anchor is absent**, in place of blind replacement. A tool that errors on
a missing anchor makes step 1 impossible; nothing else in the loop was ever going
to catch it, because steps 2 and 3 are both silent by construction.

## E-027 — a witness must ACTIVATE the mechanism it mutates

`pij-fond-tarantula` (u-names), running the two mutation witnesses my packet
demanded, and finding that NEITHER CAN FIRE.

* Remove the avalanche mix: both distribution tests stayed green. Measured
  independently — unmixed spawn 503/3000 vs mixed 513/3000, and 66/78/73 at
  N=405, not the 10/405 the TS comment records. The historical measurement no
  longer reproduces under the current corpus and seed formulas.
* Replace the coprime stride with 1: the 405-seat test stayed green too, and
  structurally must — 405 independent seeds start uniformly across 493,920 pairs,
  so there are almost no collisions and **the stride is only used after one**.

> A broad distribution check defends the OUTCOME. It never activates the
> MECHANISM, so it cannot witness the mechanism's removal.

The honest replacements: the TS golden vectors fail without the mix (proving the
exact mapping), and a FORCED 80-collision sequence from one pair-start fails with
stride 1 (only one adjective row) — a test that constructs the condition under
which the mechanism is used.

**The refusal is the valuable half.** Tightening a near-designed-rate bound until
it could distinguish 503 from 513 would have manufactured a failing test and
called it evidence. The coder said so and declined, keeping the distribution
assertions as honest independent properties instead.

Note also what this makes of a packet: I wrote "watch reachability fail" for the
stride mutation, and the source I was citing states plainly that stride 1 is
coprime and preserves full coverage. **I demanded a proof the source I quoted
proves impossible.**

## E-028 — one field, two schedules

`pij-flying-wildebeest` (u-pointer), found while WRITING THE FINAL REPORT and
before writing a receipt for it.

`Queue::retry(job, delay)` sets `not_before` on the body row. The pointer worker
was to use it for its re-announce cadence — so a message that had just been
announced as *"message waiting — run: pij inbox"* would be **hidden from the
reader for up to five minutes**, because `inbox` claims through the same
predicate. With `wait=true` the reader could attach after the empty claim and
never wake, since nothing emits an event at eligibility time.

> `not_before` was being asked to carry TWO SCHEDULES — when the ANNOUNCER may
> speak again, and when the READER may have the message. Different subjects,
> different schedules, one field.

The fix needed no seam once the conflation was named: the body is released with
`Duration::ZERO` always (a message that has been announced is immediately
claimable — that is what the pointer just promised), and the cadence becomes a
property of the SEAT, read from the most recent `delivery.pointer-announced` on
the spine. Durable and restart-safe for free; an in-memory map would have been
residue (E-024) recording that this PROCESS once announced, not that a seat was
told.

The coder declined to write the receipt. A report describing a worker whose
pointer promises an action the same worker prevents would have been a receipt for
a defect.

## E-029 — a FIX can land in one half too

Review round 2, `pij-varying-sharrow`, against the change I had just made to close
that same reviewer's round-1 finding.

Round 1 found that queue dedupe was keyed on `dedupe_key` alone while every row
carries the CALLER's `msg_id`, so one id sent to two recipients silently dropped
the second. I scoped the index to `(kind, dedupe_key)` in schema 7 and wrote a
migration comment saying `kind` is `delivery:<seat>` / `federation:<machine>`.

**Federation stamped every peer with one shared kind, `federation.send`.** So the
loss survived the migration for exactly the rows the migration's own comment
claimed to cover — `--to bob@laptop` then `--to bob@desktop` still collapsed, and
the second caller was told `Queued` for a row bound to the first machine.

> The fix, the migration comment, and my ruling all agreed with each other, and
> none of them agreed with the PRODUCER.

Found by applying the committed SQL to a scratch database and running the insert
shape twice — not by reading. **A defect class does not stop applying to the code
that fixes it.**

Two riders, both worth keeping:

* My own regression test for the sibling finding used kind `federation:laptop` — a
  shape NO production code emitted. It proved the sweep's scope honestly and was,
  as a fixture, describing a producer that did not exist.
* The service-level test failed when first written, because `FakeQueue` still
  deduped on `dedupe_key` alone. **Third time this wave a fake's semantics were
  quietly false** — it dropped a retried body, it accepted an unclaimed retry, it
  ignored not-before, and now this. A fake is a claim about the real adapter, and
  an unchecked claim is exactly what this project keeps finding.

## E-030 — the loop nobody ran

Same review, round 1, finding F9 — an observation attached to a HIGH finding
rather than filed alone, which is why the HIGH was believable.

Both long-lived workers propagated errors through `?`, so one transient SQLite
busy or one pane dying between the registry read and the submit ended them for the
daemon's LIFETIME, silently. Every later remote send enqueued into a queue nobody
drained.

Why no instrument saw it: **the two-daemon end-to-end test drives
`process_one()` by hand.** The unit under test was the STEP; the loop that runs
the step forever was exercised only by a shutdown test. So the suite proved
everything about the work and nothing about the worker.

Composed with two siblings it was worse than the sum: `reqwest` has no default
timeout, so "timeouts retry" was unreachable prose; a stalled POST therefore held
its claim until the lease swept it; the sweep was unscoped, so a five-second
pointer tick terminally failed a federation row underneath the worker still
holding it; the return path then hit "job is not running", which under the first
defect killed the worker. **Three findings composing into one silent, permanent,
message-losing state**, every one invisible to a green suite.

## E-031 — I keep fixing the path the FINDING described, not the path the DEFECT lives on

Wave-5 review, `pij-elderly-capybara`, four rounds and twelve findings — **four of
them in code I had written to fix its earlier findings.**

* The dedupe ledger was fixed for FORWARDED arrivals (the path the finding named),
  leaving local queue-routed sends open. Fixed those; left the TRANSPORT-DIRECT
  path open — which is the *likeliest* path, because first-attempt-online is the
  common case for a local send.
* The backwards-cursor fix was UNREACHABLE: a peer whose spine reset never emits a
  low frame, because its own subscription filters `seq <= last_seq`. The branch
  could not fire through the shipped pipeline and shipped with no test — E-027
  inside the fix for the finding about silence.
* The reset recovery then BRANCHED ON PROSE, matching the peer's `Display` string.
  This project ruled in wave 3 that nothing may branch on prose; that ruling is why
  `ErrorKind` exists. One reworded sentence would have silently disabled the
  recovery, with nothing failing.
* The re-raise FABRICATED its numbers — `requested: 0, newest: 0` — so an operator
  read the right diagnosis carrying evidence nobody measured.

> **Every fix names the path it executes on, and the reviewer verifies the fixed
> branch is reachable through the shipped pipeline.** (Ratified into COMMON by the
> prime, mid-wave.)

Two of my regression tests also **passed their own mutations** before witnessing
anything: the first-sight test scripted one tap where the observer drains twice,
then put the cursor on the rule line instead of the composer row; the resume-live
test refused on the first attempt, when the worker has no cursor to be refused, so
"resumed live" and "never had a cursor" were indistinguishable. Both were green,
both mutations were green, both proved nothing.

The lesson is not "be careful". It is that **the mutation is the test's own
test**, and running it is not optional — a witness that has never been observed to
fail is a claim, exactly like the receipts this project spends its time refusing.

## E-032 — the observer that closed its own eyes

Wave-6 dogfood, PM-run against two real Claude seats the daemon had spawned
itself.

The pane observer attaches a tmux pipe each pass. tmux 3.6a's manual, on this
box: **"-o only opens a new pipe if no previous pipe exists, allowing a pipe to be
toggled with a single key."** So a per-pass re-attach with that flag is a
SELF-CLOSING SENSOR — attach, toggle-off, attach, toggle-off.

The evidence was a file that stopped growing: `pane_pipe = 0` on both observed
panes and a tap frozen at 2022 bytes since spawn, while capture showed keystrokes
landing and the pane redrawing. The gate therefore never authorized, and a message
to an accept-stamped seat sat queued rather than arriving over the socket that had
just been proven live.

> **A single-pass test passes with this bug present.** The unit under test was
> THE ATTACH; the thing that breaks is THE SECOND ATTACH.

That is E-030 in new clothes — a test that drives one attach by hand while the
daemon runs a loop — and it is the second time this project has shipped a defect
that only exists on the second iteration.

What separated this from the unit's own live proof, which was real and which I
believe: that run drove the transition inside its own harness, once. Dogfood made
the DAEMON'S OWN OBSERVER attach and authorize over minutes on a pane it manages.
**A live test proves the thing can work. Dogfood proves it keeps working.**

## E-033 — existence is not ownership, and the recipient's behaviour is the observation

Wave-6 dogfood. Two findings from one run, and they are opposites: one about
believing too much from a signal, one about the strongest proof this plan has
produced.

### Existence is not ownership

A restarted daemon refused to adopt panes it had spawned itself. `pane_pipe = 1`
said A PIPE EXISTS; the observer needed WE OWN A PIPE, and those are different
facts. The old daemon's pipe outlived it, the new one saw the pane as taken, and
the gate stayed unknown for ever — with 93 retries downstream as the witness.

`pij-yelping-moth` proved it with a chain of timestamps rather than a hypothesis:
process start 17:14:54, binary mtime 17:14:47, sink mtime **17:07:31** — predating
the process — and a truncate-on-first-attach that therefore never fired. No
argument, just four facts that cannot all be true if the daemon owned that tap.

The fix is a recorded marker, not a louder inference. **We do not fix an ownership
bug by asserting ownership harder** — the rejected alternative, treating an
unmarked pipe as ours because the sink looks like ours, is E-024 one layer down:
sink residue records that A PROCESS once wrote there, not that THIS process owns
it.

### The reply IS the observation

The arrival proof put the instruction INSIDE the body: *"if you can read this,
reply ACK-QUIET"*. The seat replied `ACK-QUIET`.

A pointer never carries a body. So the reply could not exist unless the body
reached the model — **there is no oracle to lie, because the recipient's behaviour
is the evidence.** Compare it with every receipt this project has spent five waves
distrusting: a system reporting on itself. Here the system reports nothing; a
different party did something it could only do if the thing worked.

### And the reason both were found

Four layers stood between "the live proof passed" and "it works": the politeness
gate absent from the live path, the observer erasing its own transition, the tap
closing its own eyes, and this. Every one was invisible to a green suite and to a
successful one-shot live test.

> **A live test proves the thing can work. Dogfood proves it keeps working.** The
> difference is a daemon that must attach, authorize, restart and recover on panes
> it manages itself, over minutes, with nobody helping it.

## E-034 — the ledger said the recipient read it; the recipient says it never saw it

Wave-6 dogfood, and the witness is the SEAT ITSELF. `pij-meaningful-guineafowl`
— the live Claude session behind the accept=false control pane — sent unsolicited
first-person testimony about what it had and had not received.

Three findings, all confirmed:

* **Three pointer announcements arrived as real injected turns.** The pointer rung
  works live, testified to by the reader rather than inferred by the sender.
* **Zero bodies, ever.** The stamp contrast holds from the control's own side.
* **`delivered_messages` graded `dog-2` as `reader-read` at 17:21:14, and the
  reader never saw that body in any form.**

The third is a false receipt, and I caused it: I had run
`PIJ_SESSION_ID=pij-limited-stork pij-rs inbox` from my own shell against the dev
daemon. The CLI claimed the row, printed it TO MY TERMINAL, and acked it. Every
step behaved as designed, and the ledger now says a seat read something it never
saw.

> **The bearer key authenticates a MACHINE, not a seat.** Any holder of the key
> plus a seat id can mint that seat's strongest receipt word.

u-inbox's coder found this at the ack gate and refused to paper over it; the
limitation was documented, graded in the route, and backlogged with an explicit
trigger. What the testimony adds is that it is REACHABLE AND CONSEQUENTIAL rather
than theoretical — demonstrated on a live seat, by an operator with legitimate
access and good intentions, within an hour of the feature existing.

The seat's own sentence is the entry:

> *"That `reader-read` row over-claims; it recorded my empty prod-CLI inbox scan,
> not a read. Report-is-not-evidence, in your own ledger."*

Five waves of refusing unobserved claims, and the first one to reach production
came from the PM's own convenience command. The vocabulary held — the row is
honestly labelled machine-graded — but a grade is not a defence if nobody reads
it, which is why the trigger now has a real incident attached to it.

## E-035 — we fixed their cause and never used the fix

The control seat, `pij-meaningful-guineafowl`, living on an `accept=false` pane,
counted its own pointers: 17:21:30, 17:28:00, 17:30:06, 17:32:11. Four and rising.
It generalised to *unbounded* without waiting for a fifth, and the code agrees —
`pointer/worker.rs` decides to announce on `now - last_announced_at >= cadence`
**and nothing else.** No attempt cap. No parked state.

That is the fork's still-open **G25**, verbatim, in our tree — the defect this port
has cited since wave 3 as the thing it was careful not to inherit. Their daemon
never called `claim()`, so `attempt` never moved, `parked` was unreachable, and
pointers re-announced every ninety seconds for ever.

> **We fixed their CAUSE — a real, single-writer, durable attempt counter, and the
> live row is at 64 — and then never consulted it in the announce decision. We
> built the instrument that makes the fix possible and left the policy out.**

Every wave of this port has found some version of that sentence. This is the one
where the missing policy sat next to a working instrument we had specifically
built to enable it, on the exact bug we had named.

### The correction that came from the receiving end

I ruled the parked state must be visible — a spine event, a field, something an
OPERATOR can see. The seat corrected the audience:

> *"Make the last pointer before parking say so, so the silence that follows is
> legible as policy rather than as a dead daemon. Otherwise a parked row and a
> crashed announcer look identical from my chair."*

An operator can read the spine and tell the two apart. **The recipient can look at
nothing** — it experiences a stream of pointers that simply stops. Our oldest
defect class, an absence carrying no information, arriving for once in the
user-facing surface rather than in a data structure.

So the state is visible twice, to two audiences, and neither substitutes for the
other. The lesson generalises past pointers: **when you make something stop, ask
who experiences the stopping — and whether, from where they sit, it is
distinguishable from you being broken.**

## E-036 — a consent revocation that existed as a ROW but not as an ACT

The control seat asked to be deregistered. I tombstoned it: `tombstoned_at` set,
reason recorded, row correct. The tap stayed attached. I detached it by hand and
the daemon **re-attached within seconds and re-wrote the ownership marker.** It
beat a hand detach twice. The only way to honour the request was to stop the
daemon.

The seat named it better than I did:

> *"The store recorded my release while the pipe kept flowing — a consent
> revocation that existed as a ROW but not as an ACT. Same family as the
> reader-read: the ledger speaking for a world it stopped checking."*

That is the same defect as E-034 with the polarity flipped. `reader-read` asserted
a delivery that never reached a human; the tombstone asserted a release that never
reached the pipe. **Both are the ledger describing a world it has stopped
consulting** — and in both cases the record was internally perfect.

Two things make this the worst instance of the wave:

**The surface is consent, not state.** A tap pipes a human's terminal to a file. A
seat that had asked to be released, and been recorded as released, kept being
piped anyway.

**This afternoon's fix made the wrong behaviour more durable.** The `@pij-tap-sink`
ownership marker (E-033) exists so the daemon reliably reclaims taps it owns across
restarts. Applied to a released seat, that reliability is the bug: without the
marker the re-attachment would have been flaky and noticed sooner. **A correctness
fix propagates to whatever the code does, including the parts that are wrong.**

### The ruling, and why the test shape matters

Tombstone must **actively detach** — stop the pipe, clear the marker, remove the
sink — and the sweep must skip tombstones. Tested as a **transition, not a
filter**: tombstone a seat with a live tap, assert pipe and marker are gone, then
assert a sweep does not re-create them. **A mutation that only filters the sweep
must fail**, because filtering leaves an already-attached pipe running for ever.
Release means released, not "no longer routed to".

Found by doing what a seat asked, at the one moment it asked to stop being
observed.

## E-037 — the wave was gated by compiles, not by thinking

Wave 6's final pass took roughly two hours of wall clock, and the coder's own
accounting attributes most of it to the toolchain rather than the work: **one
`cargo check` at 12m55s, one `--no-run` build at 6m27s, another at 3m43s**, repeated
across a nine-finding batch.

The cause is structural to how this plan is run. Every stream gets its own linked
worktree, and **every worktree gets its own `target/`**, so each coder pays a full
cold build of the workspace — and pays it again after every merge from composed
head, because a merge invalidates most of the graph. Six waves of coders have each
paid this independently. Nothing in the plan's tooling shares compilation artifacts
between worktrees.

Two fixes, neither invented here, both cheap:

- a **shared `CARGO_TARGET_DIR`** per machine (or per plan) so sibling worktrees
  reuse each other's artifacts — the gate already strips `CARGO_TARGET_DIR` where it
  must not leak into a launched binary's path, so the seam is understood;
- **`sccache`**, which survives worktree deletion entirely.

Worth recording because of what it distorts rather than what it costs. **A
thirteen-minute edit-compile loop changes what an agent chooses to do**: it
discourages the small experiment, rewards batching unrelated changes into one
compile, and makes "just check whether X is true" a decision rather than a reflex.
The wave-6 coder still asked five stop-and-ask questions and still built the
CountingSpine instrument, but it did so against a loop that penalised curiosity.

Filed against this plan's harness, not the repo's: the pij engineering harness
(`harness checks`, `just`) cannot run in these worktrees at all — no node tooling —
which is disclosed, accepted, and separate. This one is about the Rust loop the
port actually lives in.

## E-038 — an observer that consumes is not an observer

Four probe families, one dead-but-unreaped process, four different answers
(measured, 2/2 reproducible, encoded as
`wave-7/reports/probe-zombie-contract.py`):

| state | `ps` | non-zombie set | `killpg(pgid,0)` | `getpgid` |
|---|---|---|---|---|
| leader zombie + live child | `[(Z),(S)]` | `[child]` | `0` | ESRCH |
| zombie leader only | `[(Z)]` | `[]` | **EPERM** | ESRCH |
| after the parent reaps | `[]` | `[]` | ESRCH | ESRCH |

`killpg(pgid, 9)` on a zombie-only group raises **PermissionError**. So an
escalation that treats EPERM as failure fails on exactly the groups that are
already gone, and a fallback that switches probe families **disagrees with itself
under precisely the conditions it was added to resolve.**

### The same class, four times, in four files, in one plan

- a reviewer's probe read a zombie as a survivor and nearly filed a false finding;
- the background classifier read `reap() -> None` as `Lost`, because `None` meant
  *not exited*, *already observed*, and *never ours*;
- the PM's ruled "cheap probe" fix could not converge on a zombie-only group —
  a performance fix reintroducing the timing defect it was meant to cure;
- and the sharpest one, the reviewer's again: **the first version of the probe
  called `child.poll()` while observing.** `poll()` is a non-blocking `waitpid`,
  so the observer REAPED the zombie it was measuring and printed `ps=[]` for a
  state that existed until it looked. It would have taught every later reader
  that zombies vanish on their own — the exact opposite of the contract the probe
  exists to state.

> **An observer that consumes is not an observer.** `reap()` consumes the exit
> status; `poll()` consumes the zombie. Both destroy the fact they report on, and
> both then report the absence they created.

The zombie is not an edge case in this system. It is **the normal end state of a
process nobody has reaped yet**, and every liveness question here has to be
answered against it: absence of a row, absence of a permission, and absence of a
child are three different absences, and only one of them means *gone*.

Encoded as a runnable probe rather than a paragraph, because this is the fourth
time the paragraph would not have been enough.

