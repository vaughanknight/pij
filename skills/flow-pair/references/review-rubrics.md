# Review Rubrics

Applied to every worker delegation at the `REVIEW` stage. Verdict model: `ACCEPT` / `FIX_REQUIRED`.

> ## Dimension 0 — Test quality (mutation-resistance) · **MANDATORY for any CODE delegation**
>
> **Why this is first.** In flow-pair the *worker* — the cheaper, less-capable model —
> writes both the implementation **and** its tests. The tests therefore share the
> worker's blind spots; they are **not** an independent quality signal. A green suite
> authored by the source of the bug proves almost nothing. **Tests are a critical
> failure mode for agents that trust them.** Treat worker-authored green tests as
> *suspect until proven non-vacuous*. (Proven live in Phase 2: all 4 gates were green
> while a CRITICAL data-loss bug sat in the code; the cross-model reviewer caught it.)
>
> **The required check — "would a test fail if the fix were reverted?"**
> For each behavioural claim (a fix, a guard, an invariant), the reviewer/orchestrator
> MUST establish that *some* test goes RED when the behaviour is removed. Two methods:
> 1. **Empirical (preferred)** — `just flow-pair-mutate <file> '<sed-ERE-expr>'`: backs up
>    the file, applies the mutation, asserts the suite goes RED, restores byte-identical,
>    and asserts GREEN again. Stays green under mutation ⇒ the tests do **not** guard the
>    behaviour ⇒ `FIX_REQUIRED`.
> 2. **Reasoned** — only when a clean mutation is awkward: name the *exact* load-bearing
>    assertion that flips when the behaviour is reverted, and why. It must be a
>    **negative / state** assertion (e.g. `writeWasCalled === false`, `events.length === 0`),
>    never a truthiness check.
>
> **Weak-test red flags** (any one ⇒ the test is suspect, dig deeper):
> - asserts only `result.ok === true` / truthiness; never exercises the failure branch;
> - no negative or state assertions (only "it returned something");
> - failure path is pure fake-fs with no real-fs counterpart;
> - lenient `OR` regexes on error messages (`/a|b/`) doing load-bearing work;
> - test count rose but every new test is happy-path;
> - the value the test asserts was not independently re-derived from the code under test.
>
> **Verdict rule:** a CODE delegation **cannot be ACCEPTed on green gates alone.**
> Test quality is itself a gate. Unproven test quality on a load-bearing fix is a
> mandatory `FIX_REQUIRED`.

## Dimensions 1–10 — full rubric (_completed in Phase 6_)

_Stub for the remaining axes._ scope · contract · plan · ACs · **tests → see Dimension 0** ·
domain docs · progress log · regression · prompt-follow · learning. A missing
`execution.log.md` is a mandatory `FIX_REQUIRED`. Verdict model `ACCEPT` / `FIX_REQUIRED`.
