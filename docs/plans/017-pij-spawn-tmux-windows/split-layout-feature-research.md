# Feature research — `pij_spawn` split-pane layout mode

**Status:** researched, ready to implement (post-compaction). Plan-017 follow-on.

## The ask

Add an **option** to `pij_spawn` to place the worker as a **split pane in the
current window** instead of a new window. Layout: **main on left**, up to **2
workers stacked vertically on the right**. **Hard cap: 3 panes total** (main + 2).

- Spawn #1 → split the **current (orchestrator) pane** horizontally → right column.
- Spawn #2 → split that **first worker pane** vertically → stacked below it.
- Spawn #3 in split mode → refuse / cap (see Decision D1).

```
 ┌───────────┬───────────┐
 │           │  worker 1 │   #1: split-window -h -t <mainPane>
 │   main    ├───────────┤
 │ (orch.)   │  worker 2 │   #2: split-window -v -t <worker1Pane>
 └───────────┴───────────┘
```

## tmux mechanics (verified on this box: **tmux 3.6a**)

> **⚠️ tmux flag trap (VERIFIED LIVE):** the names feel backwards.
> `split-window -h` = **LEFT/RIGHT** (side-by-side, vertical divider).
> `split-window -v` = **UP/DOWN** (stacked, horizontal divider).
> **Bare `split-window` (no flag) defaults to `-v` (up/down)** — you MUST pass
> `-h` for the left/right column. Proof on this box:
> ```
> split-window -h -t %72  →  %72 123x21 → 61x21  +  new 61x21  (same height, halved WIDTH = left/right) ✓
> kill-pane <new>         →  %72 restored, sibling pane untouched ✓
> ```
> So: **#1 = `-h` (left/right column)**, **#2 = `-v` (stack the right column up/down)**.
>
> **Geometry caveat:** the clean main-left / stacked-right picture assumes the
> orchestrator starts as a **single full-height pane**. If its window already
> has splits, `-h` on the orchestrator pane only splits *that* pane (messy). In
> practice the orchestrator is its own fresh window, so this is usually moot —
> but `spawn(split)` could optionally refuse / warn if the current window
> already has non-pij panes.

- **`split-window`** flags we use:
  - `-h` = side-by-side (new pane to the **right**); `-v` = stacked (new pane **below**).
  - `-t <target-pane>` = which pane to split (`%N`).
  - `-P -F '#{pane_id}'` = print the new pane id (same capture trick as `new-window`).
  - `-c <cwd>`, `-e KEY=VAL` (env; needs tmux ≥3.2 — we have 3.6a ✓).
  - `-l <size>` / `-p <percent>` = split size (e.g. `-p 40` → right column ~40%).
  - `-d` = do **not** move focus to the new pane (optional; see D3).
  - (default places new pane right/below — no `-b` needed.)
- **Argv (AC-09, argv-only):**
  `tmux split-window -P -F '#{pane_id}' -t <target> -h|-v [-p N] [-d] [-c <cwd>] [-e K=V …] -- pi [args…]`
- **Killing a split pane: `kill-pane -t %N`, NOT `kill-window`.**
  `kill-window` on a split would nuke **main + all siblings**. CRITICAL.
  - Note: killing the **last** pane of a window also closes the window. So
    `kill-pane` is correct for **both** window-mode (sole pane → window dies) and
    split-mode (just that pane). See D2 — we can likely use `kill-pane`
    universally and retire `kill-window`.

## Pane-count / cap logic (the subtle part)

Count **pij-spawned split children in the current window**, NOT raw `list-panes`
— a pre-existing unrelated user split must not eat the budget. (Confirmed live:
the orchestrator window already had a stray `%159` pane.)

Source of truth = the **registry**: descriptors with `spawnedBy === self` AND
`layout === "split"` AND paneId still alive AND in the current window.

```
liveSplitKids = registry.list().filter(d =>
    d.spawnedBy === self && d.layout === "split" && paneAlive(d.paneId) && sameWindow(d.paneId))
n = liveSplitKids.length
  n === 0 → split-window -h  -t <currentPane>      (right column)
  n === 1 → split-window -v  -t <liveSplitKids[0].paneId>   (stack below worker 1)
  n  >= 2 → E-FULL  (or fall back to new window — D1)
```

Self-healing: if worker 1 was closed, `n` drops and the next split re-creates the
right column. `sameWindow` via `tmux display-message -p -t %N '#{window_id}'`
(or list-panes of current window ∩ registry paneIds).

## Code seams (where the option plugs in)

T2 layout, `.pi/extensions/pij/`:

- **`core/ports.ts` — `TmuxPort`** gains:
  - `splitWindow(opts: SplitOpts): Result<{ paneId }>` where
    `SplitOpts = NewWindowOpts & { target: string; direction: "h"|"v"; percent?: number; detached?: boolean }`.
  - `killPane(paneId): Result<void>`.
  - `currentPane(): string | null` (returns `$TMUX_PANE`).
  - (optional) `windowOf(paneId): string | null` for the same-window filter.
- **`adapters/tmux.ts`** implements the above (argv-only, mirrors `newWindow`).
- **`adapters/fakes.ts`** — `FakeTmux` gains the same methods + call recording
  (no mocks; reuse the existing Fake pattern).
- **`core/spawn.ts`** — **NO change.** `buildSpawnCommand` is layout-agnostic; the
  argv/env are identical for window vs split. (Nice: the pure builder is reused.)
  Pass `PIJ_SPAWN_LAYOUT` env **only if** we go with the descriptor-`layout` flag
  (D2) so the child records its own `layout` for `close()` to read.
- **`core/session.ts`**:
  - `SpawnOpts` gains `layout?: "window" | "split"` (default `"window"`).
  - `spawn()`: if `split`, run the cap logic → `tmux.splitWindow({target, direction,…})`
    instead of `newWindow`; return `E-FULL` when `n >= 2` (D1).
  - `close()`: kill-pane vs kill-window per D2.
- **`core/types.ts`**: add `E-FULL` to `PijErrorCode`; add `layout?: "window"|"split"`
  to `SessionDescriptor` (if D2 = flag).
- **`index.ts` `pij_spawn`**: add `layout` param
  (`Type.Optional(Type.Union([Type.Literal("window"), Type.Literal("split")]))`,
  default `"window"`), pass to `session.spawn`, surface `E-FULL` as tool-error
  text. Update the tool `description`/guidelines to mention split mode + the cap.

## Open decisions (resolve at implementation start)

- **D1 — 3rd split request:** (A) refuse with `E-FULL` + clear message
  ("split layout full — 2 workers already on the right; close one or use
  `layout:'window'`"), or (B) silently fall back to a new window. *Lean: A
  (explicit), the cap is the user's stated intent.*
- **D2 — kill mechanism:** (A) **`kill-pane` universally**, retire `kill-window`
  (simpler; no descriptor `layout` flag; one code path) — verify it doesn't
  regress window-mode close (sole-pane-closes-window). (B) keep both, branch on
  `descriptor.layout` (needs `PIJ_SPAWN_LAYOUT` env + child persists it).
  *Lean: A, pending a window-mode close regression test.*
- **D3 — focus + sizing:** right column width default (`-p 40`?), vertical stack
  50/50, and whether to pass `-d` (keep focus on orchestrator) or let focus
  follow into the new pane. *Lean: `-p 40`, no `-d` (focus follows), all tweakable
  later.*

## Test plan (no mocks — FakeTmux)

- `spawn({layout:"split"})` with 0 live split kids → asserts `splitWindow` called
  with `direction:"h"`, `target = currentPane`.
- with 1 live split kid → `direction:"v"`, `target = kid1.paneId`.
- with 2 live split kids → `E-FULL` (D1-A) / `newWindow` fallback (D1-B).
- `close()` of a split child → `killPane` (not `killWindow`); main pane untouched.
- window-mode `spawn`/`close` unchanged (regression).
- Dimension-0 mutation: flip the `n===0`/`n===1` branch + the `kill-pane` call.

## Live smoke (tmux-gated, fold into `just smoke` / Phase 3)

`pij_spawn({layout:"split"})` ×2 in the real session → assert the current window
goes 1→2→3 panes in the main-left / stacked-right geometry, then `pij_close` each
→ asserts panes die back to 1 and **main survives**.
