# Rescued coder observation buffers — plan 135

Coder seats write `harness observe` entries into their own worktree buffer. On
close-out those buffers must survive the seat — the drain is o-prime-owned, so an
observation that dies with its author is a lesson the fleet never gets.

**Snag worth recording**: neither `fs3-rs-boot-announce-u1/.harness/temp/agent/session-buffer.md`
nor its u2 equivalent existed at rescue time, and a `find` across both worktrees
returned nothing — despite both seats reporting retained observations. Every seat
was SPAWNED from the main checkout and `cd`-ed into its worktree afterwards, so the
buffers are plausibly pooled under the spawn directory and attributed to the wrong
tree. Rescued below from each seat's own `harness observe --list --json` output
instead. Nothing was cleared.

---

## u1 — `pij-fit-haddock` (rs register binding, `e1109c3f`)

Recovered verbatim from `harness observe --list --json` at 2026-09-04T23:42:53.885Z;
bucket=agent, malformed_skipped=0, seven observations.

### DL-001 (difficulty) — packet fence omitted the interface owners
Frozen interface requires `Registry::put_reporting` but the fence omitted
`crates/core/src/ports.rs` and the Registry implementors
`crates/testkit/src/fakes.rs` + `crates/daemon/src/pane_observer.rs`. Asked the PM
for a bounded amendment before writing code. `harness boot` fails TS2688 (missing
node types) in a fresh worktree. **Packet/schema should verify interface owners and
prepared-worktree dependencies before dispatch.**

### DL-002 (difficulty) — LSP reports configured, answers as if unindexed
`rust-analyzer` status reports configured, then returns "No definition found" twice
for an imported `Registry` and "No references found" on the `ports.rs` declaration.
**No indexing-complete signal is exposed, so completion is UNKNOWN rather than
established — an empty result cannot be read as absence.** Serena's active project
is the main checkout (TypeScript only), unsuitable for a Rust worktree.

### DL-003 (difficulty) — stopped before code, three blockers at once
`flowspace3 doctor` reports daemon=down at 7373 while auth=ok and healthy=true; did
not start one. `npm ci` fails on the git dependency's nested `--before` vs
`--min-release-age` conflict. Second scope gap: `registration.rs` owns the final
`registry.put` but sat outside the fence; the HTTP handler only receives the
descriptor.

### CONF-001 (confusion) — a readiness envelope that contradicts itself
`flowspace3 doctor`: daemon outcome=down ("nothing is listening on
http://127.0.0.1:7373"), auth outcome=ok ("daemon.key is mode 0600 and **accepted
by** http://127.0.0.1:7373"), healthy=true, verdict=degraded, next_action="start it
with flowspace3 daemon &". Contradiction left unresolved rather than guessed;
the one action it recommends is the one action every seat is forbidden to take.

### DL-004 (difficulty) — the dependency source moved mid-copy
Approved APFS `node_modules` copy failed on missing `@opentelemetry/api/build`
paths in the main source; then `pij send` itself failed with "Cannot find module
tsx/cli". Native `pij-rs send` delivered the failure report successfully. *(Cause,
established later: the PM had destroyed main's `node_modules` — see DL-007.)*

### DL-005 (difficulty) — the LSP was answering about the wrong tree
`rust-analyzer/analyzerStatus`: "Loaded 256 packages across 1 workspace;
root=/Users/jordanknight/pi-hacking/pij/Cargo.toml" — the MAIN checkout, not the
assigned worktree. **The empty definition/reference results for absolute worktree
paths reflected wrong workspace registration, NOT code absence.** "Native LSP ready"
means the process is live, nothing more. Needs host workspace-folder switching for
worktree seats.

### DL-006 (difficulty) — `harness boot` advertises an option it does not declare
`harness boot --full --json` is rejected with E108 unknown option; `--help`
advertises `--full` but lists only `-h/--help`. `boot/extension.ts` reads
`ctx.options.full` and declares no option. The default path invokes real
`just smoke`, which spawns seats — forbidden for concurrent unit seats. **Needs an
option-schema check.**

---

## u2 — `pij-motionless-clam` (extension fresh-from-binding, `7690cb09`)

Recovered from the seat's own tool receipts; the seat explicitly did **not** claim
the missing worktree file exists. Nothing cleared.

### WIN-001 — unit done
Four fenced TS files, 164 insertions / 2 deletions, `session.test.ts` diff empty.
Nine witnesses: created; rebound with an existing row; same with and without a local
row; same on reload; new/fork successor announce plus no duplicate on reload;
binding-absent inference with and without a row. RED first (5 failed / 17), then
full extension suite 4043 passed, then a capped `--quick` gate green post-commit.
**Assumption verified rather than assumed**: ordering stayed `await seats → await
register → seed-all → optional dissolve predecessor → session.boot → seed-accepted`.
Binding is authoritative — rebound announces despite an existing row, `same`
suppresses even with a missing local row, absent binding retains the old inference.

### Friction (u2)
- **DL-001** — clean coder worktree lacked `node_modules`; boot failed TS2688. Needs
  deterministic dependency readiness *before* dispatch.
- **CONF-001** — `flowspace3 search` over `.pi/extensions/pij/*` returned
  `ok:true / results:[] / path_unmatched` while the local TS LSP saw the files.
  **The code was unindexed, not absent.**
- **DL-002** — `npm ci` git-dep preparation inherited `min-release-age` while npm
  generated `--before=…`, exiting before config resolution. Asked rather than
  disabling the policy.
- **CONF-002** — `bun test .pi/...` treats the hidden path as a filter: 2983 files
  searched, no match.
- **DL-003** — bun lacks `vi.stubEnv`/`vi.unstubAllEnvs`, so the bun path failed
  *before* behaviour — **not valid RED**. Canonical runner is Vitest.
- **SUGG-001** — encode the ruled coder bootstrap: same-lockfile dependency clone
  instead of a policy bypass, canonical runner discovery, `--quick` unit gate, full
  tmux smoke exclusively PM-owned.
- **DL-004** — approved APFS clone from main failed after 40s with hundreds of
  source ENOENT. **Lockfile equality alone does not provide snapshot stability** —
  the shared installed tree changed mid-copy.
- **DL-005** — test launch imported main's `node_modules` and failed on missing
  `estree-walker`, then `fdir`, while local resolver probes were correct. Cause was
  later disclosed by the PM: unescaped shell backticks executed `npm ci` in main and
  wiped its dependencies. *That disclosure supersedes the speculative explanations.*
- **DL-006** — a composite gate failed on untouched CLI tests (an extra `%91`
  `pane_pid` probe before the expected `%7`), and **the harness retained only the
  last 25 stderr lines, hiding the first failure.** Needs full per-sensor output
  pointers.
- **SUGG-002** — installed Vitest 4.1.10 reads `VITEST_MAX_WORKERS`; **zero**
  `VITEST_MAX_THREADS` references in its dist. The imposed cap was inert.
  Highest-leverage encoding: a runner-version-correct cap plus an effective-worker
  proof.
- **DL-007** — the TS LSP's diagnostics went stale after edits and dependency
  recovery (still reporting missing `fresh`/`binding`/`vitest`) while real `tsc` and
  the tests passed. **Logged the divergence rather than altering correct source to
  satisfy a stale diagnostic.**
