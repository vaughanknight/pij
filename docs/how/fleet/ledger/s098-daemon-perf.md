# Stream `s098` — daemon-perf — ledger

Rows from stream `s098`. **This file has a single writer.** See [`../ledger.md`](../ledger.md) for the index and the convention.

## Difficulties

### F-700 · A linked worktree has no `node_modules`, and `npm install` cannot create one
`s098-daemon-perf` could not run any TypeScript. `npm install` fails outright:
`--min-release-age cannot be provided when using --before` (an `npm config` `before` date is
set globally). Nothing in the onboarding brief mentions that a worktree starts without
dependencies.
*Cost*: ~15 min and three dead ends before symlinking the main checkout's `node_modules`.
*Workaround*: `ln -s /path/to/main/node_modules <worktree>/node_modules` — untracked, and
`git status` stays clean.
*Status*: open. **`pij fleet stream new` should do this at creation time**, or the recipe
should say it in one line.

### F-701 · Monkey-patching `node:fs` reports zero, and zero reads as "no calls"
To attribute a slow tick I wrapped `fs.fsyncSync` / `childProcess.execFileSync` on the module
object. Under ESM, `import { fsyncSync } from "node:fs"` binds directly, so the patch observes
**nothing** — and the profiler printed a clean, confident, entirely empty breakdown of a
30.9-second tick. A silent detector inside the tool built to find silent detectors.
*Evidence*: first run of the s098 profiler; `sites` map empty while the tick took 30,889ms.
*Cost*: ~20 min, and it very nearly became a reported finding of "no I/O in the hot path".
*Fix that worked*: the in-process V8 profiler (`node:inspector` `Profiler.start/stop`) for
timing, and **prototype** patching (`FsRegistry.prototype.write`) for counts — prototypes are
real objects, so patching them does bind.
*Rule*: an instrumentation run that reports **zero** must be treated as broken until it has
been shown to report non-zero for a call you know happened.

### F-702 · The daemon's own latency silently invalidates the daemon's own verdicts
Investigating a slow tick, the tick turned out to be slow enough that supervision verdicts
derived from it became false. `lastEventAt` is refreshed by the daemon's own observation, so
"seat has gone quiet" actually means "the observer has not looked recently enough"
(`daemon.ts:774-777` vs `daemon.ts:552-560`; pij#182). A fleet-wide instrument was reporting
confident wrong answers about live seats, and the only tell was a second line in the same
output saying the tick was stale.
*Cost*: none to this stream (the prime caught it live), but it inverted the severity of the
brief.
*Rule*: when an instrument's own latency is an input to its own measurement, latency stops
being a performance concern and becomes a **correctness** concern. Cite pij#160.

---

### F-703 · A findings document's citations are proofs, and convergence invalidates them silently
s099's rule ("re-run your fail-first criteria on the rebased tree") has an analogue for
investigation streams that the rule as stated does not reach. s098 produced no tests and no
guards — its entire deliverable is `file:line` citations into `daemon.ts`, a file **three
streams edited this run**. A drifted citation still reads as correct: grep finds the symbol,
the prose still parses, and no suite goes red. There is no signal at all.
*Evidence*: re-verifying s098's seven citations against `origin/main@a2a50e2` by printing each
line found **two wrong** (`daemon.ts:645`→`644`, `345-355`→`342-351`) — wrong at authoring
time, from transcription, and they would have survived review indefinitely.
*Cost*: 10 minutes to check, and it was only checked because the s099 notice arrived.
*Rule*: **if your deliverable is evidence rather than code, verify it the same way — extract
the file at the ref you are citing and print the line.** A citation nobody re-ran is the
documentation equivalent of a green suite that proves nothing.
*Generalisation*: the fleet's proof discipline is scoped to artifacts that can fail. The
artifacts that **cannot** fail — findings, dossiers, issue bodies, briefs — carry the same
claims with none of the enforcement, and they are what the next stream reads first.

### F-704 · Two censuses of the same set, same predicate, same count, zero overlap
The prime published an authoritative list of 14 specs that drive subprocesses, generated with
`grep -rln '<markers>' --include=*.test.ts .pi/extensions/pij/`. Regenerating it with **`rg`** —
this repo's default search tool — at repo root with the *identical five markers* returns a
different 14: the `harness/` and `skills/flow-pair/test/` specs. **The two sets are completely
disjoint and both have cardinality 14.**
*Evidence*: `rg -l 'execFileSync|spawnSync|execSync|execPath|child_process' --glob '*.test.ts'`
returns 14 files, none of them under `.pi/`; adding `--hidden` returns 28; passing an explicit
`.pi/extensions/pij/` path returns the prime's 14 exactly.
*Why it is worse than an ordinary miss*: a seat re-running the census "to check" gets 14, sees
14, and concludes it corroborated the list. **The matching count is the failure** — it converts
a disjoint answer into apparent agreement.
*Boundary, stated precisely because pij#144 can be read as "rg never works here"*: `rg` with an
explicit `.pi/` path is correct; only the **bare repo-root sweep** is blind. The trap is scope,
not the tool.
*Rule*: **a census must publish its predicate AND its scope, and a re-run must reproduce both.**
A command that is copied but re-tooled answers a different question and says so nowhere.
*Open question raised, not assumed*: the 14 `harness/` and `skills/` specs do trip the tool's
marker set. Whether they are in scope for the mutation gate is the prime's call.

### F-705 · A precondition promoted to evidence, in measurement rather than test currency
s099's B.3 ("each criterion must assert the claim, never the setup that makes it reachable")
applies to measurements too. This stream's headline claim — *the tick is linear in the working
set* — was measured on a harness with the tmux port **stubbed**, i.e. with the 26-46% of tick
cost that is subprocess spawn set to **zero**. The result was evidence about the fsync half,
presented as evidence about the tick.
*Fix*: re-ran the full series with `capturePane`/`isPaneDead` hitting real tmux and only the
mutating methods stubbed (`bench/growth-law-realio.ts`). 100→547 descriptors: 2997→18291ms,
overall exponent **1.06**. The claim survived, and ms/descriptor moved from 20.3 to 33.4 —
materially closer to the live daemon's ~51.
*Rule*: **a benchmark that stubs a cost centre is evidence about the remainder.** State what was
stubbed next to the number, every time; if the stub covers a term of the thing being measured,
the headline claim is not yet earned.
---

## Wins

### W-700 · An APFS clone made a live-system investigation safe and repeatable
`cp -Rc ~/.pij /tmp/pij-perf-home` clones 1.7G in ~5 min at near-zero disk cost, and rewriting
the absolute paths inside the 579 copied descriptors severs every link back to the live home.
That turned "profile the daemon" from an operation that risked a running 40-seat fleet into an
offline experiment I could run repeatedly — including pruned copies at 40/100/200/350/549
descriptors to measure the growth law empirically instead of asserting O(n) from the shape of
a `for` loop.
*Evidence*: `docs/plans/098-daemon-perf/bench/`, and the growth table in `findings.md` §3.
*Why it generalises*: any stream investigating live-system behaviour can clone the state
directory rather than reasoning about it, and a clone is the only way to run the same tick
twice.

### W-701 · `sample <pid>` profiled the live daemon with no restart and no cooperation
macOS `sample` needs no sudo, no flags on the target, and no restart — which mattered because
restarting the daemon would have disrupted six other streams mid-flight. It attributed 46% of
the daemon's main thread to subprocess spawn and 42% to fsync **before** any code was read.
*Rule*: profile the running process first. It costs 15 seconds and it tells you which half of
the code you can stop reading.

## Suggestions

### S-700 · `pij fleet stream new` should leave a worktree that can actually run the code
Dependencies linked, and a one-line smoke (`npx tsx -e 'console.log(1)'`) proving it. F-700 was
15 minutes of a stream's life spent on something no stream should ever discover.

### S-701 · A `pij doctor --perf` that prints the tick budget
The three numbers that would have made this whole investigation a 30-second command: tick ms,
working-set size, and ms-per-descriptor. The daemon already logs the first two
(`daemon.ts:671`); the ratio is the one that tells you whether you are about to cross a
supervision threshold (pij#182). **A trend line would be better than a number** — the failure
here was never a bad reading, it was a slope nobody was watching.

### S-702 · Instrumentation harnesses should live with the finding, not in `/tmp`
Every measurement in s098 is re-runnable from `docs/plans/098-daemon-perf/bench/` against a
clone. A finding that cannot be re-run is an opinion with a number in it, and the second
person to care about it always starts from scratch.

---
