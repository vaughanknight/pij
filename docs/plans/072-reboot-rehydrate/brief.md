# s072 — reboot rehydrate: resolve the prime for this folder, print its resume command

**Stream** `s001/s072-reboot-rehydrate` · worktree `pij-worktrees/s001-s072-reboot-rehydrate`
**Operator** Jordan · **Prime** pij-reasonable-dove · **Date** 2026-07-26

## The ask, verbatim

> need a new command — something like `pij prime-hydrate` or reload or something. this is for
> after reboots. i will go to correct path in a tmux, it just finds the prime, and gives me a
> command to load it, if its claude code then it will be
> `claude --dangerously-skip-permissions --resume="<sessionid>"`. if its copilot etc same.
> similar to the current rehydrate or reload pij session, but i wont know the session name.

Follow-up ruling: **build on `pij revive`** — it is the current reload verb. Do not mint a
second resume-command mapping.

> needs to work in copilot, codex, claude code, pi and omp. **Prio claude code. report when
> claude code is working.**

## What already exists (read these first)

| Thing | Where |
|---|---|
| `buildCommand()` — the per-harness resume line, already correct for all five harnesses | `.pi/extensions/pij/core/revive.ts:127` |
| `planRevive()` — guards + plan assembly | `.pi/extensions/pij/core/revive.ts:195` |
| `revive` CLI wiring | `.pi/extensions/pij/cli.ts:3515` (handler ~`:1370`), usage `:390` |
| `--prime` / `--here` list filters (the resolver precedent) | `.pi/extensions/pij/core/cli.ts:2011` `filterPrime`, flag sets `:657` |
| prime designation | `pij orchestration prime set/unset`, `core/orchestration/prime.ts` |

`buildCommand()` already emits, with model + effort args and `PIJ_*` env:

- claude — `claude --dangerously-skip-permissions --resume <nativeId>`
- copilot — `copilot --yolo --resume=<nativeId>`
- codex — `codex --dangerously-bypass-approvals-and-sandbox … resume <nativeId>`
- pi — `pi --session <artifactPath>`
- omp — `omp --auto-approve --resume=<artifactPath>`

**Reuse it.** The value of this stream is the two things around it: *resolving the id from
cwd*, and *printing instead of spawning*.

## Deliverable

```
pij revive [<pij-id>] [--here] [--print] [--layout …] [--json]
```

### D1 — resolve the seat from cwd (no id)

`pij revive` with **no id** resolves the target from the current folder:

1. realpath cwd; realpath each descriptor's `folder` — compare resolved paths, never raw
   strings (worktrees + `/tmp` vs `/private/tmp` on darwin will bite you).
2. Prefer the seat with `prime === true` for that folder.
3. Exactly one non-prime candidate → use it, and say in the output that it was not prime.
4. Zero candidates → `E-NOID` naming the folder searched.
5. Two or more, none prime → `E-AMBIG`, list the candidates with id/harness/model/last-activity
   and tell the operator to pass an explicit id. **Never guess.**

Archived seats (`~/.pij/archive/`, terminal >48h) are in scope — a reboot can outlast 48h.
Search hot first, then archive, and label which tier the answer came from.

### D2 — `--print`: hand the command to the human, do not spawn

`--print` renders the launch command to stdout and exits **without touching tmux, without
spawning, and without mutating the descriptor**. The operator pastes it into the tmux pane they
already opened. Requirements:

- Emit the **env prefix** (`PIJ_SESSION_ID=…`, `PIJ_HARNESS=…`, plus whatever `buildCommand`
  returns) inline on the command line, properly shell-quoted. Without it the seat comes back
  nameless and unaddressable.
- `--json` emits `{ id, harness, model, effort, cmd, args, env, shellLine, tier }` — the
  shell line must be exactly what a human would paste.
- The printed form must round-trip: running it verbatim must produce a live, addressable seat.
- Say plainly in the human-readable output whether the resulting seat will **self-adopt**
  (daemon binds it via `PIJ_SESSION_ID`) or whether the operator must run a follow-up
  `pij adopt "$TMUX_PANE" …`. **Determine which is actually true for claude and make it work
  end to end** — do not print an instruction you have not executed. (`report-is-not-evidence`:
  the printed line is a claim until you have pasted it and watched a seat come back bound.)

### D3 — the host-restart liveness path (the real engineering content)

After a reboot the descriptor still says `lifecycle: "working"` with a **stale `paneId` and a
dead pid**, so today `planRevive()` refuses on two guards:

- `input.priorAttachmentAlive` → `E-ARG "still has a live prior attachment"` (`revive.ts:201`)
- `lifecycle !== "dissolved" && terminal === undefined` (`revive.ts:207`)

Make revive able to distinguish **"that attachment is gone because the host restarted"** from
**"that attachment is live, don't stomp it"**:

- An attachment is stale when the tmux pane id no longer exists **and** the recorded pid is not
  alive. Both, not either.
- Known trap (`pij-revive-pid-liveness-gap`, open since s066): the OS can **recycle** a pid, so
  a dead seat's pid can appear alive and belong to an unrelated process. Corroborate — e.g.
  boot time / process start time newer than the descriptor's last activity — and provide an
  explicit operator override rather than a silent guess.
- `--print` is the safe mode here: it mutates nothing, so it may be permitted on a seat whose
  liveness is *uncertain*, as long as the output says the attachment could not be proven dead.
  Spawning revive keeps the strict guard.

### D4 — all five harnesses

Cover claude, copilot, codex, pi, omp. **Claude Code is the priority** — get it working, tested,
and demonstrable first; the orchestrator reports to Jordan at that point, then you continue with
the remaining four. pi/omp resume off an `artifactPath` rather than a native id, so their
resolution path differs — make sure the artifact still exists and fail loudly by name if not.

### D5 — tests

- Unit: cwd resolver (prime / single / zero / ambiguous / archived-tier / realpath-symlink case).
- Unit: printed shell line per harness — five golden assertions, including env prefix quoting.
- Unit: stale-attachment classification (pane gone + pid dead → stale; pane gone + pid alive →
  uncertain; pane alive → live).
- **Dim-0 is mandatory**: for each load-bearing guard, break it, re-run the targeted test,
  confirm RED, restore. Print the mutation and the RED output. A guard whose test stays green
  when you delete it is not a guard.
- At least one gate must exercise the **real** code path, not only fakes
  (`green-that-lies` §8: a class instance spread into a plain object passed every fake test and
  crashed every production tick).

### D6 — docs

Update `pij --help` and the `REVIVE_USAGE` block (`cli.ts:390`). One short section in
`docs/how/` on the reboot flow. Do not touch other plans' docs.

## Constraints

- **Forward-only.** Never `git revert`. Remove with code.
- **Do not write** `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, or anything under
  `.flow-pair/`.
- Allowed paths: `.pi/extensions/pij/**`, `docs/plans/072-reboot-rehydrate/**`, `docs/how/**`.
- **Daemon**: this changes CLI code, not daemon code — but if you touch anything under
  `core/daemon/`, the machine-wide daemon must be restarted **by the orchestrator from
  canonical main**, never by you from this worktree.
- Never `tmux send-keys` into a pane a human is using. Never close a seat you did not spawn.
- Do not weaken `.npmrc` (`min-release-age=7` is deliberate supply-chain policy), do not add
  `--force`/`--ignore-scripts`, do not commit credentials.

## Gates (run ALL of them, not first-fail)

```
just typecheck
just test
just lint
```

Note `tsconfig.json` **excludes `**/*.test.ts`**, so `just typecheck` does not see your test
files — a signature break in a test is invisible to it. Run the test suite too and read it.

## Report format

Report back to `pij-reasonable-dove` with: files changed, the five golden shell lines you
produced, the Dim-0 mutation evidence (guard, edit, RED output, restore), gate output, and
anything you could not prove. Say what you observed, not what it implies.
