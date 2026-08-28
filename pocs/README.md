# `pocs/` — the spike lane

A spike is not a small feature. It is an **experiment whose output is evidence**,
and it lives outside the workspace on purpose.

**Spikes sit outside `harness checks` and outside the gate: a spike's evidence is
its captured output, never a green build.** Nothing in `pocs/` is compiled by
`cargo build --workspace`, linted by the workspace's clippy run, or judged by the
architecture allow-list — the root manifest carries `exclude = ["pocs"]`.

Why the lane exists at all (flowspace3 paid all four of these costs before we did):

1. A spike inside the workspace drags the workspace's dependency, lint and
   architecture rules along with it, and the spike loses to the rules.
2. A spike outside a lane becomes an untracked scratch directory, and its result
   is a sentence in a chat log nobody can re-run.
3. A spike with no output convention gets summarised by the person who ran it,
   which is how a 58-vs-22 counting error survived review.
4. A spike that is never deleted becomes a second codebase.

## Running one

```bash
cp -R pocs/_template pocs/<name>
cd pocs/<name>
cargo run > out/result.txt      # out/ is gitignored; commit only what you cite
```

## The one required step

**Print an eyeballable table.** Not a summary, not a count you computed in your
head afterwards — the rows, so a reader can see the shape of the data and catch
the error you did not know you were making. The template's `main.rs` does this,
and a spike that removes it is a spike whose result nobody can check.

## Committing a result

`out/` is ignored. When a spike's output becomes evidence for a decision, copy the
specific file into the plan's `assets/reports/` and cite it there — that keeps the
evidence with the decision it supports rather than in a directory that will be
deleted with the spike.
