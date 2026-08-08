# Research Dossier: daemon cannot start on a fresh install (`~/.pij` absent)

**Generated**: 2026-08-08T13:45:00+10:00
**Query**: "pij#118 — daemon: fresh install can never start; `~/.pij` is not created before the lock write"
**Effort**: Standard
**Evidence**: 9 current sources · 1 historical source

## The Ask

Issue pij#118 claims that on a machine where `~/.pij` has never been created, `pij daemon start`
prints a success line while the daemon process it spawned dies immediately, because the daemon
writes its lockfile with `flag: "wx"` into a directory nothing has created yet. The issue predates
several refactors, so the first job is to verify the cited mechanism against current code rather
than trust the citation. This dossier establishes whether the defect still exists, what the
minimum correct fix is, whether that fix is sufficient for the whole fresh-boot path, and what
test seam can prove it — on a machine that already has a populated `~/.pij` and is therefore
structurally blind to the defect.

## Answer

1. **The defect is real and the issue's citation still holds.** `runDaemon()` resolves `pijHome`
   and goes straight to an exclusive (`wx`) lock write with no directory creation
   (`daemon.ts:1094`, `daemon.ts:1097`, `daemon.ts:1126`).
2. **Reproduced empirically on this machine** via a `PIJ_HOME` that does not exist: the daemon
   exits with `ENOENT: no such file or directory, open '/tmp/pij-fresh-probe-118/daemon.lock'`
   and creates nothing.
3. **`mkdirSync(pijHome, { recursive: true })` before the lock is sufficient for the whole boot
   path** — proven by pre-creating an empty directory and booting: the daemon comes up, ticks,
   and self-creates `pane-signals/` and `spine/`. Nothing else downstream assumes a pre-populated
   home.
4. **The `ENOENT` escapes deliberately.** The retry loop's guard is
   `if (code !== "EEXIST") throw e` — the `EEXIST` (live/stale holder) cases are handled with
   care; every other errno, including the fresh-install `ENOENT`, is rethrown (`daemon.ts:1129`).
5. **The daemon is the one writer that skipped a convention the rest of the codebase keeps.**
   Every `Fs*Store` adapter creates its directory before writing; the daemon's own lock write does
   not.
6. **`runDaemon()` has zero test coverage.** Every existing daemon test constructs `Daemon`
   directly, and every fixture builds its home with `mkdtempSync` — which *creates* the directory.
   That is precisely why the defect is invisible: the test suite's own fixture pre-satisfies the
   missing precondition.
7. **The second defect in the issue (unverified start success) is real but out of this stream's
   scope** — it lives in `cli.ts`, a file shared with two other streams in this wave.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `runDaemon()` resolves `pijHome` then writes the lock with no `mkdir` in between | `.pi/extensions/pij/daemon.ts:1094`, `:1097`, `:1126` | The fix site is a single insertion before the acquire loop | High |
| F-02 | Non-`EEXIST` errors are rethrown, so `ENOENT` kills the process | `.pi/extensions/pij/daemon.ts:1129` (`if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e`) | Do **not** widen this guard — swallowing `ENOENT` would mask real faults; create the dir instead | High |
| F-03 | Defect reproduces: fresh `PIJ_HOME` → `ENOENT` on `daemon.lock`, directory never created | `PIJ_HOME=/tmp/pij-fresh-probe-118 npx tsx .pi/extensions/pij/daemon.ts` → `ENOENT: … open '/tmp/pij-fresh-probe-118/daemon.lock'`; `ls` → no such directory | The bug is current, not historical drift | High |
| F-04 | Creating the directory alone is sufficient — full boot succeeds and self-creates its subtrees | Same command with `mkdir -p` first → `pij daemon up (pid 4017, home /tmp/pij-fresh-probe-118)`, ticks; `ls` → `daemon.lock`, `pane-signals/`, `spine/` | No further bootstrap ordering work is needed; scope stays one line + a test | High |
| F-05 | The adapters already do what the daemon skipped (`mkdirSync(dir, { recursive: true })` before write) | `.pi/extensions/pij/adapters/*.ts` (e.g. `dispatch-store.ts`, `focus-store.ts`, `fence-store.ts` header comments + writes) | The fix restores an existing convention rather than inventing one | High |
| F-06 | A canonical home resolver exists and is documented as "the one place that computes it" — but `daemon.ts` still inlines its own copy | `.pi/extensions/pij/core/agents/paths.ts:1-20` (`resolvePijHome`) vs `.pi/extensions/pij/daemon.ts:1094` | An `ensurePijHome()` helper beside `resolvePijHome` is the "encode, don't document" option; weigh against blast radius | High |
| F-07 | `runDaemon()` is referenced by no test; only `Daemon` is constructed directly | `rg -n --hidden 'runDaemon' --glob '*.test.ts' .pi/` → no matches | The regression test must call `runDaemon()`, or it will not cover the defective line | High |
| F-08 | Every daemon test fixture uses `mkdtempSync`, which creates the home | `daemon.test.ts:64`, `daemon.durability.test.ts:27` | The new test must use a path that does **not** exist (e.g. a nested child of a temp dir), or it will pass before and after | High |
| F-09 | `runDaemon()` accepts injected `pijHome`, `tickMs`, `deliveryMs`, `log` and returns a `stop()` disposer | `.pi/extensions/pij/daemon.ts:1082-1092`, `:1196-1210` | A hermetic test seam already exists — no production seam needs adding | High |
| F-10 | The CLI reports start success as soon as `tmux.newWindow()` succeeds, before any liveness check | `.pi/extensions/pij/cli.ts:1135-1160` (`ensureDaemonRunning`) | This is issue #118's second defect; it is in `cli.ts`, shared with streams 2 and 3 → report, do not fix | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The codebase already carries an explicit doctrine about *which* surfaces may create `PIJ_HOME` ("Inbox registration is the one messaging surface allowed to create PIJ_HOME, so it must run before the ordinary E-NOREG guard") | `.pi/extensions/pij/cli.ts:4114-4116` | Direct | The fix is consistent with that doctrine — the daemon is a *bootstrap* surface, not a messaging surface, and creating its own home is exactly what a bootstrap surface must do. Worth a one-line comment tying the two together so a future reader does not read the fix as a doctrine violation |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| The existing-install path must not change behaviour | `daemon.ts:1126` lock semantics (live holder → refuse, dead holder → reclaim) | A regression here breaks every current user, in exchange for a defect none of them can see | `recursive: true` is idempotent on an existing dir; keep the `wx` acquire loop byte-identical and run the full existing daemon suite |
| Test that passes before *and* after | `daemon.test.ts:64`, `daemon.durability.test.ts:27` (`mkdtempSync` pre-creates home) | The charter's whole point: a test that cannot fail is a hypothesis | Assert `existsSync(home) === false` before calling `runDaemon`, then run the test against a stashed/unpatched `daemon.ts` and record the failure output as evidence |
| `runDaemon()` in a test starts real timers, a real `DaemonTmux`, and the telegram bridge auto-start | `daemon.ts:1150-1192` | A leaked timer or tmux side effect makes the suite flaky | Pass large `tickMs`/`deliveryMs` so no tick fires within the test, call the returned `stop()` in a `finally`, and confirm bridge auto-start is a no-op without `telegram.env` (observed: `telegram: no usable telegram.env — bridge auto-start skipped`) |
| Scope creep into `cli.ts` | F-10; charter "You do NOT own … `core/cli.ts` send dispatch"; partitioning.md § Partial collisions (streams 2 and 3 both touch `cli.ts`) | A boundary violation becomes a merge conflict for a seat that does not know this one exists | Fix defect 1 only; report defect 2 to the prime as a follow-up issue |
| Plan-folder ordinal collision across six concurrent streams | Highest existing ordinal is `084`; six PMs mint folders simultaneously | Six folders named `085-*` is not a merge conflict but is a namespace mess | Question raised with the prime; proceeding on `085-daemon-fresh-install` |

## Planning Handoff

- **Preserve**: the `wx` exclusive-acquire loop and its `EEXIST` live/stale semantics
  (`daemon.ts:1119-1147`) exactly as they are; the `if (code !== "EEXIST") throw e` guard
  (never widen it); `PIJ_HOME` override precedence (`opts.pijHome ?? env ?? ~/.pij`).
- **Change carefully**: the daemon is long-lived and singleton-locked — the existing-install path
  must be provably unchanged, which means the insertion is *before* the loop and touches nothing
  inside it.
- **Likely files/symbols**: `.pi/extensions/pij/daemon.ts` → `runDaemon()` (the `mkdirSync`
  insertion + the `node:fs` import); a **new** `.pi/extensions/pij/daemon.bootstrap.test.ts`
  (a new file rather than an edit to `daemon.test.ts`, so this stream's test surface cannot
  collide with another stream's edits).
- **Decisions still required**:
  1. Inline `mkdirSync` in `runDaemon()` (minimum, zero blast radius) **vs** an `ensurePijHome()`
     helper next to `resolvePijHome` in `core/agents/paths.ts` (F-06 — encodes the convention, but
     adds a second owned file and a second call-site question).
  2. Whether to also assert the *rest* of the fresh boot (`pane-signals/`, `spine/`) in the test,
     or keep the assertion narrowly on `daemon.lock` existence.

## External Research

_None material — the question is fully answerable from this repo, and was answered by running it._
