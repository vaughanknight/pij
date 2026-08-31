# Review round 2 — FINAL VERDICT — u-ts-witness (plan 109)

**Head:** `s109/ts-witness` = `5ebf375a` "test(pij): harden release witness noise
handling". Verified 2026-08-31T04:19–04:23Z in my own detached worktree
`pij-worktrees/s109-rev-ts` (`npm ci`, exit 0). Coder's worktree untouched.

Governing contract: `5aac6ac8` (RF-T1a/b/c, RF-T2a/b/c, mutation N3), registered
**before this head existed**.

---

## VERDICT: APPROVE

Both findings closed, each by a red I produced rather than a green anyone reported.

---

## T1 — CLOSED. The acceptance was a red, and it is red.

The fix took the allow-list shape: strip the measured `npm warn ` lines, assert the
remainder is empty (`cli-learning.test.ts:106-111`).

**N3, pre-registered at `5aac6ac8`** — make the `learn` success path write to
stderr while still exiting 0 with the correct stdout, using text containing
**neither `ERR!` nor `Error:`**, because that is the realistic form and it is the
exact case that separates the two candidate shapes:

```
process.stderr.write("warning: candidate index rebuilt\n");

npx vitest run skills/flow-pair/test/cli-learning.test.ts   ->  EXIT=1
 × learn: stdout = exactly 'learning: learn-0001' and writes implement-code candidate
AssertionError: expected 'warning: candidate index rebuilt' to be ''
      Tests  1 failed | 2 passed (3)
```

**RED, at `cli-learning.test.ts:111`, on injected text a filtered negative would
have passed.** That is RF-T1a and RF-T1b closed in one observation: the assertion
is not vacuous and it has been shown capable of failing.

Three further properties, each of which I checked rather than assumed:

- **It fails by CONTENT, not by silence.** The received value printed is the
  offending line. F0-6's carry, honoured.
- **RF-T1c: the sibling survives.** `expect(r.stderr).toMatch(/cluster/)` — the
  error-path half at `:171` — stayed green through the mutation (`2 passed`), and
  the success-path test passes with the real npx warning present, which I captured
  directly: `npm warn Unknown project config "min-release-age"…`.
- **It is an allow-list, so it fails safe.** The deny-list alternative enumerates
  what is bad and misses everything unlisted; this enumerates what is benign and
  catches everything else — including a new error format nobody has seen. And if
  the npm warning ever disappears, stripping nothing from an empty stderr still
  yields `""`.

The original contract — *"nothing of ours on stderr"* — is restored intact, and
only the environmental coupling is gone. That is precisely what the packet ruled.

## T2 — CLOSED, and NOT on the isolated green I warned about.

The trap I put on the record at `5aac6ac8` was that **the two files already passed
in isolation, unfixed (39/39)**, so a post-fix green there would be the same green
and would prove nothing. The fix does not rest on it: it rests on the injection,
which is what I said I would accept.

`harness/test-utils.ts` now owns one `removeTemporaryTree(path, remove = rmSync)`
with the options as a single named constant, and `harness/test-utils.test.ts`
drives it through an injected fake implementing Node's documented
`maxRetries + 1` attempt semantics.

**Both arms are present, and I mutated both:**

| mutation | predicted | observed |
|---|---|---|
| **P1** delete `maxRetries` from the options constant | transient arm red | **RED, BOTH arms** — `expected [Function] to not throw` and `expected 1 to be 4` |
| **P2** wrap the delegate in `try { … } catch {}` | persistent arm red | **RED, persistent arm ONLY** — `expected function to throw an error, but it didn't`; transient arm stayed green |

**P2 is the one that matters and its asymmetry is the proof.** A swallow leaves the
transient arm green — it never threw — and kills only the persistent arm. So the
persistent arm is exactly the assertion that distinguishes a **brake** from a
**swallow**, which is the substitution I said would pass review only if nobody
asked what removing it does. Somebody asked, and it dies.

**RF-T2b — the same fix, and better than ruled.** The ruling was "the same one-line
retry"; what landed is one *definition* shared by all five sites rather than five
copies that can drift. The tested surface is now the decision, not a literal.

**RF-T2c — no sweep.** Exactly five call sites use the wrapper: three in
`observe.test.ts`, plus the two ruled files. **165** unretried `rmSync` sites
remain in test files repo-wide (was 170 at `d552564f`), so the ruled scope was
honoured to the site.

## My own unfiltered run, beside the command

```
npx vitest run .pi/extensions/pij/index.test.ts skills/flow-pair/test/observe.test.ts \
  skills/flow-pair/test/cli-learning.test.ts harness/test-utils.test.ts \
  .pi/extensions/pij/adapters/git-repository.test.ts .pi/extensions/pij/core/chores/drive.test.ts
EXIT=0
 Test Files  6 passed (6)
      Tests  74 passed (74)
```

2026-08-31T04:22:11Z. **Matches the receipt's 6 files / 74 tests exactly**, which
is the first time this review a reported count and my own have coincided without
needing to be reconciled.

## The newly named red PREDATES this unit — verified, not accepted

The receipt's red list changed between rounds, naming
`npm-resolution-policy.integration.test.ts` where round 1 named the two ENOTEMPTY
files. A changed red list is exactly where a newly-introduced failure would hide,
so I checked rather than read:

```
at 5ebf375a        -> EXIT=1, AssertionError: expected 1 to be +0, line 536
at d552564f~1      -> EXIT=1, AssertionError: expected 1 to be +0
```

**Identical failure, identical assertion, at the commit before this unit began.**
Pre-existing, outside the blast radius (this unit touches test files and
`harness/test-utils.ts` only), and the receipt's attribution to separate
release-lineage work is correct.

---

## CHECKED AND NOT RAISED

- **The receipt scopes its own fake correctly**, unprompted by me: *"This proves
  **our configured contract**, not Node's internal retry implementation."* That is
  the sentence that stops `injected transient ENOTEMPTY recovers` being over-read
  as a claim about the runtime, and it is the difference between a fake that
  documents a decision and a fake that lies about an adapter.
- **The receipt states the brake argument directionally**, in the workspace's own
  terms: *"removing the retry can only make teardown fail sooner and never removes
  more"*. Correct, and it is the test AGENTS.md prescribes.
- **The receipt names its residual** rather than leaving a silence: *"if Node
  changes `rmSync` retry semantics, the contract fake still passes; no workspace
  instrument spans that standard-library boundary."* See below — I am not raising
  it, I am seconding it.
- **The receipt reports my own T1 mutation**, run by the coder against its own fix
  before declaring, with the injected text and the `1 failed / 2 passed` split. A
  coder that runs the reviewer's named mutation before the reviewer does is the
  cheapest round this review has had.
- **Round 1's findings are recorded in the receipt with the review commit**
  (`3caaf5d8`) and the PM's ruling, including that the enumeration gap was
  PM-owned. The record shows its history rather than a clean surface.
- **No product code.** `harness/test-utils.ts` is test infrastructure; the CLI,
  the extension and the crates are untouched.
- **Round 1's verified-clean list still holds** at this head: the causal trace, the
  dead-lock-file forceback, both new index witnesses, the fence predating the run.
  The diff does not touch any of it.

## A RESIDUAL I AM SECONDING, NOT RAISING — and it is the second of its class today

The contract fake encodes Node's documented `maxRetries + 1` semantics. **If Node
changes them, the fake still passes.** No instrument in this workspace spans that
boundary.

That is structurally the same hole as unit 1's F9 residual, where the correlator's
env-var name is guaranteed only by a human reading two literals across the
Rust/TypeScript seam. Both are: *a contract we depend on, held by a party we do not
test, verified by a person reading a document.*

Two in one day is a pattern rather than a coincidence, and the pattern is worth
naming: **every cross-boundary contract in this workspace is currently held by
reading, not by running.** The correct response is not to reimplement the other
side — the PM already ruled against duplicating a standard library's retry loop,
and that ruling is right for the same reason it would be wrong to reimplement the
TS bridge in Rust. The response is to know the list, keep it short, and let each
one carry the line the receipt already gives this one.

**Not a blocker for this unit.** Recorded so the pair can be reasoned about
together rather than rediscovered separately.

## MY OWN CONDUCT

No instrument errors this round. Nine disclosed across this plan, none reaching a
verdict. Every result above is quoted with its command, its exit code, and the
assertion message that distinguishes a real red from a run error.

**Tree restored**: three mutations (N3, P1, P2) each applied alone and reverted
with `git checkout --`; the detached HEAD moved to `d552564f~1` for the
pre-existence check and back to `5ebf375a`. `git status --porcelain` empty.

---

## APPROVE

T1 closed by a red on text a weaker shape would have passed. T2 closed by an
injection with both arms, where the persistent arm is the one that proves brake
rather than swallow — and neither rests on the isolated green that cannot tell the
two builds apart.
