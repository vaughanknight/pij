# Review baseline — u-sidecars (wave 7)

Reviewer `pij-favourite-araminta`. Written BEFORE the unit landed, so the base it
is graded against is a measurement rather than a memory.

Method: `assets/REVIEWER.md` — verify claims by behaviour, re-run every mutation
myself, probe the shipped surface, restore the tree after each probe and say so.

## 1. Where I review from

Probes run in my own detached worktree, never in the shared tree:

```
git worktree add --detach /Users/jordanknight/pi-hacking/pij-worktrees/s108-review-sidecars <sha>
CARGO_TARGET_DIR=/tmp/pij-review-w7-target
```

HEAD is never moved in `s108-rust-port`. Mutations are applied in the review
worktree and reverted there.

## 2. Base gate — run by me, at the head I grade from

Head `6987332e` (composed head after the fixture regeneration).

```
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

Test count corroborated independently rather than taken from the receipt:

```
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-review-sidecars   # detached @ 6987332e
CARGO_TARGET_DIR=/tmp/pij-review-w7-target CARGO_INCREMENTAL=0 \
  env -u UPDATE_GOLDENS cargo test --locked --workspace | grep '^test result:'
```

→ **49 test binaries, 342 passed, 0 failed.** Not truncated. This matches the
PM's and prime's reported 342, independently arrived at.

Observed toolchain: `rustc 1.98.0 (88d9e12ae 2026-08-18)`, `cargo 1.98.0
(797e8a9bc 2026-08-05)`. Disk on `/`: 173Gi available.

### A red I caused in my own instrument, and the habit it earns

My first green-base run piped the gate through `tail -12`. The six-stage verdict
survived the pipe; every per-binary `test result:` line did not, so the log
reported `0 passed` under `all stages green`. I re-ran to recover the count.

The PM named the shape better than I did, and it is the reason this is a habit
and not an anecdote:

> The conclusion is cheap to carry and the evidence is easy to drop, so the
> artefact that reaches the reader is the half that cannot be checked.

A verdict line is one row and survives every pipe, tail, summary and paraphrase.
The 49 rows that justify it are the first thing any of those removes. So the
default direction of every reporting step is toward a claim with its support
stripped — and the result still looks like a report, because the half that is
missing is the half nobody can see is missing.

Three reviewers and a PM each caught themselves at this within one day — a null
result reported as a positive, a contaminated red nearly reported as a defect,
and this. Same shape, three costumes, which makes it structural rather than
personal.

**The habit, applied to this file and to every number in my verdict: report the
number AND the command that produced it, and if the output was truncated, say
where it was cut.** An unsourced count is an opinion about a measurement.

## 3. The base was RED before this, and the diagnosis is kept for the instrument

At `9541b5db` — the head the wave-7 packets were written at — the gate failed:

```
test  FAIL  exit status: 101   (arch_drift: 2 of 6)
arch  PASS  8 crates, 0 violations
```

`cargo test --locked -p pij-testkit --test arch_drift`, isolated, 0.02s,
deterministic, not load-dependent:

* `clean_metadata_passes` → `[StaleRule { pij-tmux, tokio }]`, demanded `[]`
* `drifted_metadata_is_refused_with_the_reason_named` → 3 violations, demanded 2

Cause proven from content, not inference: `5a2a2c09` added `tokio` to
`crates/tmux/Cargo.toml` **and** to `[crates.pij-tmux] external` in
`crates/testkit/arch-allowlist.toml`, and its `--stat` is exactly those two files
— neither arch fixture. Both fixtures still described `pij-tmux` as
`async-trait,pij-core,pij-testkit`, so the rule had no edge to match.

**Closed, and not a unit finding.** Regenerated at `56ad8ebe`; both fixtures now
carry `async-trait,pij-core,tokio,pij-testkit`, and I re-ran the gate at
`6987332e` myself (§2). It is recorded here because it is not attributable to
`pij-mammoth-ostrich` and must never be graded against u-sidecars. E-029 shape: a
fix commit landed in one half.

### The part that outlives the fixture — a finding against the INSTRUMENT

> The `arch` STAGE is green because it judges the LIVE graph, which does have the
> edge — so the one stage named after architecture exonerates the thing that is
> wrong, and the failure surfaces under `test`, where a reader looks for unit
> defects.

A gate whose architecture stage passes while the architecture snapshot is stale
misroutes its own failure into the stage where every coder hunts for their own
bugs. Two honest exits: `arch` judges the derived fixtures too, or the drift test
reports under a name that does not read as a unit failure. Adopted by the PM as a
wave-7 harness finding; carried into my verdict notes as a review-method
observation, **not** as a u-sidecars finding.

## 4. Pre-registered probes — declared before the unit exists

Registered in advance so the unit is graded against a standard it could not be
retrofitted to, and so a pass cannot be assembled after the fact.

### P1 — bg cancel kills the process group, receipt exists only after observed death

The legacy path is the thing to beat. `.pi/extensions/pij/core/cli.ts:3516-3518`
signals with `killProcessGroup(record.pgid, "SIGTERM")` and then persists and
delivers on the *return value* — `process.kill(-pgid, sig)` returning true means
the signal was accepted, never that anything died. That is issue #322 and
command-success-is-not-effect exactly.

I will: run the witness live; then mutate the shipped path by removing the
await-observed-exit and require the named test to FAIL. A witness never observed
to fail is a claim (E-031).

#### P1a — I exercised my own instrument first, and it was wrong twice

Before grading anyone's cancel path I built the probe I would grade it with, and
it produced two false readings. Both are recorded because the second one changes
the acceptance criterion.

**First error — I signalled my own process group.** `sh -c '…' &` from a
non-interactive shell does NOT create a new process group; the backgrounded tree
inherited my pgid, so `kill -TERM -$PGID` terminated the probe itself (exit 143).
The instrument now carries the interlock it should have had from the start:
`assert pgid != os.getpgid(0)` — refuse to signal a group that is not provably
the job's own. This is also a real constraint on the unit: the bg child must be
its own group leader (the legacy adapter says so —
`.pi/extensions/pij/adapters/background-launcher.ts:1-26`, `detached: true`), or
a group cancel reaches the daemon's own group.

**Second error, and the one that matters — I read a zombie as a survivor.** With
a correct detached tree, `ps` said one member was still present six seconds after
`SIGTERM`, and I was one step from filing "SIGTERM does not kill the group
leader". It does. Measured:

```
python3 /tmp/araminta-zombie.py   # ps -Ao pid=,pgid=,state=,comm=
before:            [(73033,'Ss','sh'), (73044,'S','sleep'),
                    (73045,'S','sleep'), (73046,'S','sleep')]
1s after SIGTERM:  [(73033,'Z','<defunct>')]
child.poll() = -15                        # dead, killed by SIGTERM
after we wait() the leader: []
```

The leader was dead the whole time. It stayed visible in `ps`, holding its pgid,
until its parent reaped it. My earlier `killpg(pgid, 9)` escalation then failed
with `PermissionError: Operation not permitted` — you cannot signal a group whose
only member is already defunct, which is the same fact wearing an error code.

**A zombie row is a residue, not a state** (E-024): it records that a process ran
here, not that it runs here. My probe conflated the two, which is precisely the
conflation the unit under review must not make.

#### What P1 therefore requires

"Every pid observed gone" must NOT be implemented, or witnessed, as "no rows in
`ps` for this pgid". A correctly-killed tree passes through a zombie state whose
duration is owned by the reaper, not by the killer. Consequences the unit is
graded on:

1. **The child is its own group leader** — assert its pgid differs from the
   daemon's, or cancel signals the daemon.
2. **Death of the direct child is established by `waitpid`**, which is
   authoritative and yields the status; `ps` visibility is not.
3. **Grandchildren are established from the process table excluding state `Z`**,
   or by a reaper that owns them.
4. If the runner remains the wrapper's parent and never reaps, a naive
   `ps`-based convergence loop **cannot terminate** on a process that is already
   dead — cancel then hangs or falsely reports failure. If the wrapper is fully
   detached and reparented to `init`, it is reaped promptly and the same loop
   passes. **The witness therefore behaves differently depending on a seam the
   test does not mention**, which is how it passes for the wrong reason.
5. A witness built on `sleep` alone, with no intermediate shell, never creates
   the zombie and never exercises any of this. A tree with a shell leader is the
   honest fixture.

Any surviving non-defunct pid in the tree at receipt time is a finding. A
`cancelled` receipt written before convergence is the issue-#322 defect intact.

### P2 — each consumer's LOOP survives a transient failure (E-030)

The bar is set by the shipped exemplar, not by my opinion:
`crates/daemon/src/pointer/worker.rs:1599` drives the real `start()`/`shutdown()`
wrapper through a fake whose `ack_delivery` injects one transient error, and
asserts the loop processes the NEXT message. A test that reconstructs the loop
proves the reconstruction. One mutation per consumer.

### P3 — a count is an observation, never the configured limit

Class 10, and the shipped counter-example is
`crates/daemon/src/pointer/worker.rs:483-487`: the announcement is reconstructed
(`state.announcements + 1`) and the policy constant is used only to decide
`final_announcement`. I will find one place where the observed value and the
configured bound must differ and test there — ordinary paths coincide by
construction, so a test at the limit proves nothing.

### P4 — every fix names the path it executes on (E-031)

Each fixed branch must be reachable through the shipped pipeline, not only
through a test that calls it directly.

### P5 — the telegram round trip cannot be graded on the outbound half

Registered before the live-fire, because the two halves do not fail together.

The legacy TS bridge is **running**: `~/.pij/pij-telegram.lock` =
`{"pid":59939,"startedAt":"2026-08-28T04:32:45.261Z"}` and `ps -p 59939` shows
that pid alive (node, started Fri Aug 28 14:32:44 2026).
`.pi/extensions/pij/telegram/lockfile.ts:1-10` states the constraint first-party:
exactly one process may hold the `getUpdates` stream for a bot, or Telegram
answers 409 Conflict.

* **Outbound** (`sendMessage`) takes no lock and works with the TS bridge up. The
  message reaches Jordan's phone either way.
* **Inbound** (his reply) is single-consumer. With the TS bridge still polling,
  the reply is delivered by the LEGACY path.

So the exact half Jordan's amendment added is the half that can be served by the
code we are replacing, while every artefact still looks like a pass: a real
message, a real reply, a real injected turn. Accepting it would be a fixture that
passes for the wrong reason, on the one leg that exists to prevent that.

Evidence I will require for the reply leg — **both**:

1. the injected turn present as a row in the pij-rs store spine, and
2. the legacy bridge demonstrably not the receiver for that window — lock
   released or pid 59939 stopped, plus no new entry in
   `~/.pij/pij-telegram/inbox/` for that reply.

If (1) holds and (2) does not, the leg is one-way-only, which the amendment says
is not a pass.

#### P5a — the read instrument, rehearsed against a real store before the live-fire

Same discipline as P1a: I do not want to be debugging my own query while grading
someone else's round trip. Booted an isolated daemon off the reviewed binary, on
a private port and state dir, touching nothing the coder uses:

```
pij-rs daemon --bind 127.0.0.1:7492 --state-dir /tmp/araminta-spine-XXXX
```

Established, not assumed:

* the store is `<state-dir>/pij.sqlite` (**not** the `-wal`/`-shm` siblings — my
  first `find` matched `pij.sqlite-wal` and sqlite3 answered `file is not a
  database`; third instrument error of the session, caught before use);
* `PRAGMA user_version` = **8**, matching the schema wave 6 COMMON declares;
* `spine_events(seq, v, at, kind, seat, payload) STRICT`;
* the verdict-time queries run and render:

```sql
SELECT seq, datetime(at/1000,'unixepoch','localtime') AS at_local,
       kind, seat, payload
  FROM spine_events
 WHERE kind LIKE 'telegram%' OR kind LIKE '%bg%' OR kind LIKE '%chore%'
 ORDER BY seq DESC LIMIT 10;

SELECT kind, COUNT(*) AS n FROM spine_events GROUP BY kind ORDER BY n DESC;
```

The single row I read back was **synthetic — inserted by me, provenance mine, not
the daemon's** — because this exercise validates the READ, and the writes at
verdict time will be the daemon's. Saying so is the point: an unlabelled rehearsal
row in a receipt is indistinguishable from evidence.

Two facts about the shipped surface that shape the evidence path:

* `pij-rs tail` follows event frames over HTTP from a **running** daemon. It is
  the shipped surface and I will use it, but it dies with the daemon; the spine
  table is the durable instrument, so I require the row, not the tail.
* the daemon **refused** my scratch registration — *"no bind evidence — an id can
  be claimed from an inherited environment, but a live session cannot"* — and
  refused the follow-up send with an error that names both hypotheses (seat never
  registered, or this daemon reads a different store) rather than collapsing them.
  That is the seat-asserted-not-derived doctrine holding on the shipped path, and
  it means the telegram bridge seat needs a real registration route. Noted as a
  thing to check, **not** a finding.

Probe daemon stopped, state dir and scratch scripts removed; `~/.pij-rs` still
does not exist, so the coder's dev instance creating it remains part of its proof.
`git status` in the shared tree shows nothing of mine.

### P6 — ancestry, and evidence that postdates the green base

The unit's gate evidence must postdate the green base. Where the unit lands on a
separate branch, `git merge-base --is-ancestor 6987332e <unit head>` is the check
and a merge is required, never a cherry-pick. u-sidecars is being built **in the
shared tree on `s108/rust-port` itself**, so ancestry is satisfied by
construction and the live question is narrower: **was the gate run at or after
the commit that carries the work?** A gate transcript timestamped before the
final edits proves the tree that produced it, not the tree being graded.

## 5. Standing at the time of writing

Composed head `d57dc9f4`. `crates/sidecars/` and `crates/cli/src/sidecars.rs`
exist in the shared tree as **untracked** files, and `crates/cli`, `crates/daemon`,
`Cargo.lock`, `arch-allowlist.toml` and four `.pi/extensions/**` files are
modified and uncommitted. `git ls-files crates/sidecars` returns 0 — nothing of
the unit has landed.

I am not reading, running, or grading any of it. Uncommitted work is not a
claim yet, and a reviewer who grades a working copy grades a tree that will never
exist again. One trap already avoided on this basis: I read the CLI verb list out
of the shared worktree and saw `telegram`/`bg`/`chore` present, which is
**in-flight** — the committed head lists `daemon, ping, register, spawn, send,
inbox, list, tail` and nothing more.

This file records the base, the standard, and the instruments. **No verdict is
expressed here.**
