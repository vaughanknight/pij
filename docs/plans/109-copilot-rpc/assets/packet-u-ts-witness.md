# Coder packet — u-ts-witness (release prep, fenced)

Branch `s109/ts-witness`, worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s109-relprep` (main already merged in;
`node_modules` is symlinked from the main checkout so vitest runs here).

## Why this exists

The release PR cannot merge red. On this lineage `.pi/extensions/pij/index.test.ts`
fails **10 of 11**; the same file passes **11 of 11 on `main`**. So these are **ours** —
a unit fenced to Rust changed a TypeScript contract and its witness was never
consulted. Two further failures are environmental and also yours to close.

## THE BINDING CONSTRAINT — read this before you touch a single assertion

**You do not bless drift.** For **each** of the ten failures, trace the behaviour change
to a **RULED** change — the rs-runtime extension cutover work — *before* updating the
witness.

> **Any failure whose new behaviour traces to nothing ruled comes back to the PM as a
> FINDING, not a test edit. Updating a witness to match unruled behaviour is how a
> defect gets a passport.**

Two of the ten name things worth being suspicious about: an id rendering as
`pij-associated-slug · rs-v1` where the assertion expects a bare `pij-…` slug, and the
`ask_user_question` invariant-9 block firing where the test expects none **and** absent
where the test expects it. One of those is a display change; the other is a **behavioural
gate that changed direction in both arms**. Do not assume they are the same kind of
thing because they are in the same file.

For each failure your receipt states: the assertion, the old behaviour, the new
behaviour, **the ruling or commit that authorised the change**, and whether you edited
the test or filed a finding.

## Also in scope (small, fenced, release work)

- **`skills/flow-pair/test/cli-learning.test.ts`** asserts stdout is *exactly empty* and
  receives npm's `min-release-age` warning. **Assert on the payload, not on the absence
  of noise** — an assertion that fails when an unrelated tool prints a warning is
  measuring the environment.
- **`skills/flow-pair/test/observe.test.ts`** hits `ENOTEMPTY` tearing down a temp dir.
  Retry-or-tolerate.

## Out of scope

Rust, `crates/**`, the plan documents, and anything on another seat's branch. Two other
units are in flight on their own branches; you never edit theirs and they never edit
yours. `Cargo.lock` and arch fixtures are composer-owned.

## Discipline this plan has already paid for

- **Unfiltered runs redirected to a file, exit code from the invocation itself.** A
  reviewer here read a `SIGPIPE` 101 from `| head` as a test failure — *a red that did
  not exist* — with the filter having dropped the lines that would have said so.
- **A filter that matches nothing must fail loudly.**
- **Never block on an interactive modal** — ask inline via `pij send` to the PM
  (invariant 9). A modal in an unwatched pane is a process stopped with nothing anywhere
  saying so; it cost this plan ten silent minutes.
- Receipt committed and pushed **before** your done message.

`pij-remaining-chameleon` reviews this — it holds the s109 context and has filed
eight findings and disclosed seven of its own instrument errors on this plan.
