# 135 rs-boot-announce — completion report

**Main = 9f5ba84e.** All eight ACs checked with receipts. Plan archived. Five seats
stood down, every buffer verified into git by sha. 53 observations captured, undrained.

## What shipped, and what it cost to know it shipped

Seats had booted blind for six days: `fresh` was inferred from "no row exists",
which is true under the legacy daemon and **always false** under rs. Four units:

- **u1** — the daemon now REPORTS `binding: created|rebound|same`, derived from a
  previous-proc pre-read inside the same `BEGIN IMMEDIATE` transaction as the upsert,
  so the report and the committed row cannot disagree.
- **u2** — the extension derives freshness from that word instead of from absence,
  with `input.fresh ?? (…)` preserving old-daemon behaviour exactly.
- **u3** — seats bind to their HARNESS process, not the pane's shell; uds discovery
  prefers a live record over sort order; cross-harness pane hijack refused.
- **u4** — one wire frame across harnesses, and every seat-facing sentence that
  *describes* it now matches, enforced by a guard rather than remembered.

Live proof, not inference: a spawned seat announced once in its own transcript
against a morning control that produced no announce and no transcript at all; a
dead-process row re-bound and announced once; `adopt` bound claude child `93017`
instead of shell `90801`, socket present, delivery `injected-to-transport`, no
pointer-drain. Prime's sweep then re-bound **17 more** mis-bound seats.

## The finding above the fix

> **A check nobody has watched fail on the specific case is indistinguishable from
> one that cannot.**

Six substrates in one day: `VITEST_MAX_THREADS` inert on Vitest 4 (every "capped"
run was unbounded); a workspace gate that described a working tree instead of the
commit, shipping main red; the anti-impersonation rule living in a code comment,
which nearly let me re-admit subject-supplied evidence; a timebase test that cannot
fail on a UTC host; an allowlist with no unused-detection; an assertion that fires
on the collision but not the widening. Each was found by asking what a green
actually exercised — never by the green itself.

Corollary the reviewer distilled: **the receipt must name the tree.** Run gates on a
tree nobody has edited (a worktree of HEAD), AND name which tree — because HEAD is
the branch tip while the tree that ships is HEAD merged into the target, and those
differed twice today with consequences both times. `git merge-tree --write-tree` is
read-only, needs no merge commit, and fails loudly when a human is required.

## Where the pipeline earned its keep

- **The ack gate caught seven packet defects before any code existed** — every one
  mine: a fence naming a file that only routes, a test command that matches nothing,
  an evidence file committed after the worktree branched, a RED instruction that was
  self-contradictory.
- **The reviewer changed what shipped four times**: stopped main sitting red on a
  false AC4; stopped my ruling switching off an anti-impersonation control; reversed
  its *own* recommendation before it made 17 worker processes eligible as harnesses;
  stopped the inbox listing becoming byte-identical to a live injected instruction
  (D-040, reintroduced by a cosmetic change inside a fix justified as "stop teaching
  seats the wrong shape").
- It declined credit each time, and the claim it would defend is the right one:
  three of those four came from the packet aiming it at ground it would not have
  chosen. **The pairing found them.**
- **Honest reporting under pressure**, repeatedly: u2 refusing to fake a green while
  an environment I had broken burned around it; u3 refusing to manufacture a RED for
  an invariant that already held; u4 refusing to call a gate green with one untouched
  test red; the reviewer reporting a red it was never asked about, after its clean
  verdict had already landed.

## My own failures, on the record

I shipped main red by trusting a working tree over the committed one — a `git add`
aborted on a path I had just deleted and I had suppressed its stderr. I executed
`npm ci` inside the main checkout by composing a message body as an interpolated
shell string, breaking every seat on the box. I wrote 566MB into main through a
symlink I had not `readlink`-ed. I authorised re-admitting a caller-asserted pid at
exactly the moment the daemon's own evidence had failed, against a doctrine written
in the file I was changing. Twice I rested a conclusion on a mechanism structurally
incapable of exercising the case I cared about. Every one was caught by another
agent, and each is logged with its cause rather than edited away.

## Inherited, open, with owners

| item | what |
| --- | --- |
| f4 | rebind-on-drift — fleet swept by hand; nothing sweeps automatically |
| f5 | `parseFrame` has zero production callers — prime ruled DELETE as follow-up |
| n2 | `PutBinding.previous_proc` conflates no-row with unbound-row |
| n6 (F1 half) | the no-pre-frame rule has no production enforcement — a comment plus one redundant test line, while a pre-framed body double-frames and *parses successfully* |
| r2f3 | done reports must name their merge-base |
| r2o1 | deferred real-tmux adapter red — unresolved rather than assumed-fine |
| DL-051 | **the receipt must name the tree** — highest-leverage harness change from this plan |

53 observations sit undrained in `.harness/temp` (harvested into the archived plan
folder at `assets/buffers/`), and 20 dated lessons are in the pij-team EXPERIENCES
ledger — 14 from 135 alongside 136's 6, merged additively.
