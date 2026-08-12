# s091 — PA gate repair

**First instruction: run `/pij prime`.** Before anything else, run
`pij ack <dispatch-id> --packet-sha <sha>` from the dispatch header.

| field | value |
|---|---|
| stream | `s091` · slug `pa-gate-repair` |
| project | `pa-role-and-capability-gate-add-orchestrationrol` |
| worktree | `/Users/jordanknight/pi-hacking/pij-worktrees/s091-pa-gate-repair` |
| branch | `s091/pa-gate-repair` |
| base | `00e140eec827b03651e72cd25c8b896d184ad3f4` (PR #100) |
| o-prime | `pij-wee-albatross` |
| your role | `pm` — you JIT-spawn your own worker(s); do not write product code yourself |
| repo | `AI-Substrate/pij` |

## The ask

**Run the `/builder` flow over GitHub issue `AI-Substrate/pij#95`.** Jordan's
instruction, verbatim: *"have it run /builder flow on the isses please. builder is
much updated now with dynamic documents."*

`#95` has a **human ruling already recorded on it** (2026-08-05). Read the issue
comments before planning — the design decisions are made, and re-opening them is
not your job. All three parts are in scope:

1. **Allow a `pa` to run `watchdog watch` against its own parent.** The normal
   path. Removes the ordering trap: today a PA can only bound its capture in the
   one window before it is stamped.
2. **Add `--for <seat>`** so a prime can subscribe or re-bind on a seat's behalf.
   The recovery path. `watch` currently registers the **caller**, so a prime
   trying to help subscribes *itself* while the output reads like success.
   **It must preserve `addedAt`** — see the constraint below.
3. **Project `orchestrationRole` and `parentId` in `pij state`.** The diagnostic
   path. The gate is keyed on a field the per-seat inspection verb does not emit,
   so nobody — gated seat, supervisor, or peer — can self-diagnose. Additionally:
   where the gate refuses a verb, name the role **and the field** in the error.

## Hard constraint — do not repeat tonight's defect

`core/cli.ts:2317-2326`: `watch` filters the caller out of `watchers` and appends
a **fresh** record with `addedAt: new Date(now).toISOString()`. **Every re-bind
rewrites the creation timestamp**, which destroyed real evidence tonight
(`#96`). A hand edit to the sidecar preserves it; the sanctioned path does not.

> **The CLI is currently the only path that loses `addedAt`.** Whatever `--for`
> does, it must behave like the operator edit, not like today's `watch`.

## Related issues — read, do not necessarily fix

- **`#96`** — `watch` bounds are a remembered follow-up; `addedAt` rewritten on
  re-bind; absent `maxBytes` means *unstated → 4096*, not unbounded. Contains the
  measured chrome data and the `rule_bytes = 3 × pane_width` law.
- **`#99`** — a dispatch addressed to a PA can never be acked; the refusal reason
  names the PA as the party who should act.
- **`#102`** — a PA is refused `chore add`/`update`/`remove` and `spine-append`,
  which its own standup recipe assigns it.

`#99` and `#102` are the same capability-gate family and may fall out of the same
change. **If they do, say so and take them; if they do not, leave them.** Do not
widen scope to make a tidier story.

## Prior art — already merged, do not redo

- **PR `#71`** (`1cbf236`) made the watchdog eligibility gate **total**: an
  exhaustive `switch` over `OrchestrationRole` with `const _exhaustive: never`, so
  a new role fails the build. `roleNeedsSupervision` already returns `true` for
  `pa`. **Follow that pattern** — a widening buys exactly one role and re-arms the
  trap.
- The stale branch `s080/watchdog-pa-eligible` is that work; it is **already
  merged via squash**. Ignore the branch.
- `core/orchestration/pa-capability.ts` is the gate. `ack-dispatch` and `watchdog`
  are `refuse(...)`; `chore add/update/remove` and `spine-append` too.

## Fences (descriptive — notify-only, never a permission gate)

Expected touch set:

```
.pi/extensions/pij/core/cli.ts
.pi/extensions/pij/core/orchestration/pa-capability.ts
.pi/extensions/pij/core/daemon/watchdog-manager.ts        (if eligibility interacts)
.pi/extensions/pij/core/**/*.test.ts
docs/how/pij-watchdog.md                                   (if behaviour changes)
```

Worktree-local work is **notify-only**. Tell me what you touch outside this set;
I record merge risk, I do not grant permission. Convergence point is the PR
against `main`.

**Never stage**: `.fs2/`, `.flow-pair/**`, scratch. **Never write**
`the-flow.json` / `the-flow.md` / `.the-flow-state.json` — guided mode is their
sole writer. (One of those files sitting uncommitted in the canonical checkout
blocked your own stream's creation tonight; see `#94`.)

## Gates

- cheap: `npx biome check <paths>` + `npx tsc --noEmit`
- full: `npx vitest run`
- **Known flake**: the suite is load-sensitive. A full run showed 4 failures and a
  clean re-run showed 3952 passed / 0 failed. `cli.integration.test.ts` fails
  under parallel load with a tmux socket error and passes in isolation. **Re-run
  before believing a red**, and say so if you do.
- `node_modules` is absent in a fresh worktree. `ln -s /Users/jordanknight/pi-hacking/pij/node_modules node_modules` — do **not** run install
  (`.npmrc` carries `min-release-age=7` and `audit=true`; never weaken either).

## Fleet

**JIT-spawn your worker when you need it** — that is the rule, not an option.
Do not hold an idle coder. Jordan's spec: **copilot / `claude-opus-5` / `high`**.
Spawn from the worktree, canary it, `pij link <id> --parent <your-id> --role worker`.

## Cadence

- `pij report now "<did>" "<next>"` at **both edges** of every unit — you owe a
  card as a PM, and a stale card is worse than none.
- Escalate to me on: a design question `#95`'s ruling does not answer, a defect
  outside your touch set, or CI red you cannot reproduce in isolation.
- **Questions for Jordan go to Jordan directly** — I do not proxy them. Send me a
  pointer.
- Land via PR against `main`. **Do not merge** — merge permission is per-PR and
  Jordan's alone. Tell me when it is green and I will carry the ask.

## What this stream is not

Not a redesign of the PA role. Not a fix for the sub-floor capture population
(that is `#96` and it is measurement, not code). Not the chrome-detection work in
`#98`. If you find yourself widening, stop and tell me.
