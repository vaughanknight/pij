# 071 — execution log

Branch `s071/honest-delivery`, rebased on main `8ffac67`.
Coder `pij-panicky-cardinal`, orchestrator `pij-reasonable-dove`.

## Pre-flight

- Loaded `/pij` + `/builder` skills, read `.harness/temp/brief/BRIEF.md` and
  `.harness/temp/brief/REPRO-IDS.md`.
- No plan doc existed for s071; authored `071-honest-delivery-plan.md` (Simple Mode)
  from the brief verbatim so the task table and this log have a home.
- Rebased onto `origin/main` `8ffac67` (clean) before any edit.

### Grounding note that changed the D3/D4 approach

The addendum's own diagnosis ("`transcriptsAtSpawn` named the wrong session, so discovery
had nothing to match on") does not survive reading `discoverNewTranscript`: the snapshot is
a **before-set**, so a stale entry in it is harmless — a genuinely new path still discovers.

The mechanism that actually produces the reported signature (eternal `pending`,
`idle · active`, `failureReason: null`, no watchdog fire) is `core/daemon/loop.ts:431-435`:
`discovery.status === "ambiguous"` **returns before the watchdog block at :438**. Two claude
peers sharing one cwd share one transcript dir, both appear as new paths, discovery is
ambiguous every tick, and the seat never times out. That also explains the negative control
(`pij-able-chicken` bound fine minutes earlier — no concurrent sibling) and the
intermittency.

So D4's "fix the snapshot, not just the recovery" is implemented as **pinning claude's
session id at spawn** (`claude --session-id <uuid>`, verified supported standalone), which
removes discovery from the non-branched claude path entirely — the same deterministic bind
copilot and branched-claude already use. T005 independently closes the fail-loud hole so
*any* future non-binding path times out instead of sitting silent.

## Tasks

### Outcome

All deliverables landed across six commits on `s071/honest-delivery`:

| Commit | Scope |
|---|---|
| `5885ace` | D1 — two-tier registry + daemon-owned auto-archival |
| `f99a767` | D3 T005 + D4 T008 — never-bind fail-loud, and the pinned claude session id that deletes the race |
| `edeeb1d` | D2 — delivery decoupled from the reconciliation tick |
| `0159895` | D3 T006/T007 — honest receipts + DEGRADED on read |
| `4dcb0d0` | D4 T009–T011 — identity self-heal (defects A/B/C) |
| `7f83de6` | D5 T012/T014, D6, D7, D3 addendum |
| `e1ed3c4` | T015/T016 — real-adapter gate + mutation sweep |

### Discoveries & Learnings

| Task | Kind | Note |
|---|---|---|
| T003 | Noteworthy | The archival sweep must scan the hot directory DIRECTLY. `registry.list()` hides `dissolved`, and dissolved was 1,945 of the 2,000 corpses — a sweep built on `list()` would have looked correct and moved almost nothing. |
| T004 | Deferred | The brief specified fs-watch. Not implemented, by ruling: `adapters/channel.ts:78-91` records that the live inbox watchers DROPPED fs.watch (FSEvents ~0.6–1.6s/handle, drops events silently under load). Shipped a 200ms poll-primary pass instead. Approved by pij-reasonable-dove 2026-07-25. |
| T005 | Noteworthy | The relayed root cause (a wrong `transcriptsAtSpawn`) does not survive reading `discoverNewTranscript` — it is a *before-set*, so a stale entry is harmless. The real mechanism is the `ambiguous` early return at `loop.ts:431` bypassing the watchdog. Verified against main by the orchestrator before I built on it. |
| T006 | Noteworthy | The receipt rule was DUPLICATED — plain `pij send` carried its own copy of the ternary, so fixing `sendSuccess` alone would have left the most-used surface still saying `queued` while the diff looked complete. Both now call one classifier. |
| T014 | Noteworthy | Brief premise did not hold: there is no per-row subprocess in `list`/`state` to batch (`process.kill(pid,0)` is a syscall). Shipped guard tests instead of a no-op "optimisation" that would itself have been green-that-lies. |
| T017 | Noteworthy | D6 needed TWO changes: the type union AND the runtime validator in `platform/types.ts`, which still rejected `source:"unobservable"` with a bare `E-ARG`. The type change alone looked complete and was not. |
| T018 | Noteworthy | The mutation sweep caught my own D7 test passing for the wrong reason — the `buffer` branch is unreachable from the daemon. The reachable hole was `sendText` collapsing "typed but unconfirmed" and "threw before typing" into one `unverified`. |
| T015 | Deferred | First draft of the real-adapter test drove the LIVE tmux server and would have attached `pipe-pane` taps to the operator's fleet. Checked for leaks (none), then rewrote it scan-free. Worth remembering: a "real adapter" test can have real side effects. |
| — | Noteworthy | Full-suite runs intermittently fail 1–2 heavy real-CLI integration tests, a different one each run. Verified PRE-EXISTING by re-running with these changes stashed (baseline flaked too, in another test). Tracked platform-side, not s071. |
| — | Noteworthy | `npm ci` fails in a fresh worktree: `--min-release-age cannot be provided when using --before` (the repo `.npmrc` pins `min-release-age=7`, npm passes `--before` for git deps). Worked around by symlinking the canonical repo's `node_modules`. |

### Rebase onto s066 (`9a18e2c`) — the collision a clean rebase hid

`git rebase` reported **zero conflicts**; `tsc` then failed with TS2393, duplicate
function implementation. s066 had added `FsRegistry.revive(descriptor)` (relaunch a
dissolved session's process) while s071 D1 had added `FsRegistry.revive(id)` (move a record
out of the archive tier). Two authors, two meanings, one name, no textual overlap — so git
merged them happily.

Mine became `unarchive`, which is the better name regardless: it moves storage tiers and
starts nothing.

The features also genuinely interact, and that is the part worth remembering: **`pij revive`
targets DISSOLVED seats, and the D1 janitor archives dissolved seats after 48h** — so the
seats most worth reviving are exactly the ones most likely to be archived. Keyed `read()`
still finds an archived seat, but its `dataDir`/`eventsPath` point into `~/.pij/archive/`,
so a revived session would have written its events into the archive and `pij list
--archived` would have kept listing a seat that was now live. `pij revive` now unarchives
first; a non-archived id is a no-op.

Lesson for the next agent rebasing a long-lived branch here: a conflict-free rebase proves
nothing. Run `tsc` and the sweep on the rebased tree, and grep the incoming diff for the
nouns your branch introduced.

### Review round 2 — three fixes, and a law that failed in its own docstring

**§3.1 (blocker)** — the round-1 tier pull-back moved the RECORD but not its PATHS.
`publish()` unarchived, then published the caller's descriptor — read *before* the
unarchive — and `dataDir`/`eventsPath` are uncontested, so the stale archive paths won and
overwrote what `unarchive()` had just corrected. Strictly worse than the original symptom:
before, the path pointed at a real directory; after, `pij path`/`pij tail` named one that did
not exist. The harness split is why it survived: `session.ts` computes its own `dataDir`, so
pi/omp self-healed, while s066's `buildRevivedDescriptor` never touches it — leaving
claude/copilot/codex broken, i.e. exactly the harnesses whose revive is live-proven.
Fixed by deriving the paths from the TIER inside `publish()`/`revive()`: **no caller gets to
state which tier it is in.**

**§MED-a** — the law's inverse trap was live, and I had shipped a site in it: spawn's
second-phase write carries CLI-owned `parentId`/`gitCommonDir` with no authority declared.
Harmless on a fresh spawn (disk is empty, so the proposal stands) but it bites
adopt-into-pending — D4's own new path — where the pending descriptor already has a
`parentId` and the re-parent silently pins to the old one.

The deeper problem was the *wording*: the law said omitting the authority is "always safe".
It is safe for **other** writers' data and **silently lossy for your own**. That is the law
failing one level up, in its own documentation, which is how a sixth writer would have
shipped it again. The docstring now says so explicitly, and a source-level test enforces it —
a write that sets a contested field must name the authority that owns it.

**§MED-b** — a third fake-vs-real divergence, and not an argument this time:
`FakeRegistry`'s tombstone guard still carried `descriptor.pid === existing.pid`, the clause
`FsRegistry` dropped in the s066 hardening. A different-pid resurrection was refused by the
real registry and **accepted** by the fake, so every core test could resurrect a tombstone
production drops. A fake more permissive than the real adapter is the plain-object-fake
failure in another costume.

Sweep extended to **20 mutants**. One survived the first pass — the spawn-authority mutant —
because the test I had written was a unit test that could not see `cli.ts`. That is the
second time in this review cycle a mutant found a test proving something narrower than it
appeared to; the enforcement moved to the source level, where it actually covers the call
site. 20/20 killed, 0 skipped.

### Review round 3 — the guard's own holes, and what the guard is actually for

Catshark mutated the **enforcer itself**, injecting synthetic violations into a production
file and checking it went red (baseline-green first, to prove non-vacuity). Two misses:

1. **ES6 shorthand was invisible.** `CONTESTED_SETTER` was `/field\s*:/`, so
   `write({ ...latest, closeIntent })` sailed through — which is both the idiomatic way to
   write the guarded thing and a style already used here. Now `/field\s*[:,}]/`.
2. **The authority matched anywhere in the call**, so a PAYLOAD VALUE satisfied it:
   `write({ ...latest, currentTask: "cli" })` passed while declaring nothing. Now anchored
   to real argument position, with a scanner that skips string literals.

Reproduced both holes by mutating the guard the same way before and after the fix; both are
now caught, with the baseline green either side. Scoping the scan to registry receivers also
removed a false positive the reviewer hit independently — a `process.stderr.write` whose
*message text* contains `parentId`.

**The header is the important part**, and it is now in the file. This test is a **tripwire,
not a proof**: it is a text proxy for "does this write set a contested field?", and a proxy
will always have holes, so closing these two does not make it complete. The load-bearing
protection is that **`write()` merges by default** — a writer that reads none of this and
declares nothing still cannot clobber another writer's field.

Also recorded, because it is precise and surprising: the raw-write allowlist is **file-level**
and allowlists `cli.ts`, `core/cli.ts`, `daemon.ts`, `core/session.ts`,
`core/daemon/loop.ts` — so **none of the five historical incidents would have been caught by
it**. The SET-side test is the one doing real work, because it is file-agnostic: it asks what
a write *does*, not where it lives.
