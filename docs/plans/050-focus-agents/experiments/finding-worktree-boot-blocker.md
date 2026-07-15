# Finding — pi cannot boot as a pij peer from a git worktree (extension doubling)
**Stream**: s050 · **Discovered**: 2026-07-14 (before experiment 1 could run) · **Severity**: blocks worktree-cwd containment

## Symptom
`pij spawn --harness pi` from `pij-worktrees/s050-focus-agents` → pane opens, pi errors on
every extension with `Tool "<x>" conflicts with <worktree>/.pi/extensions/<x>/index.ts`,
the `pij` extension fails to load → no self-register → no ready-ping → pane dies.
Reproduced 2× (panes %1295, %1296). Same spawn from the **main checkout** boots clean (%1298).

## Root cause (verified)
pi discovers BOTH:
- project extensions: `<cwd>/.pi/extensions/*`
- user extensions: `~/.pi/agent/extensions/*`

`~/.pi/agent/extensions/pij` is a **symlink → `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij`** (the MAIN checkout; from `npm run link`).
- **Main checkout**: project copy and the user symlink resolve to the **same realpath** → pi dedupes → clean.
- **Worktree**: the worktree has its **own physical** `.pi/extensions/pij` (different realpath from the main-checkout symlink target) → **two copies, same tool names → conflict → boot broken**.

Also required first-boot in a fresh worktree: `npm ci` (missing `node_modules` → `Cannot find module 'diff'/'unique-names-generator'`) and a trust-folder accept.

## Why it can't be worked around within the research fence
- `pij spawn` has **no passthrough** for pi flags → can't pass `-ne -e <worktree pij>` to disable global discovery.
- Removing the worktree's local `.pi/extensions` = tracked-product-state mutation (out of fence).
- `npm run link --remove` (drop global symlinks) = machine-global mutation (forbidden).

## Direct relevance to focus-agents (the product)
`pij focus launch` into a **new window/worktree** will hit this exact death unless the launcher:
pre-runs `npm ci`, pre-trusts the folder, and resolves extension doubling (or boots from a
clean cwd). This is a first-class product-design constraint, not just a test-rig annoyance.

## Proposed containment-compatible path (pending prime ruling)
Containment = **where the worker WRITES**, not the pi process cwd. Run the disposable probe:
- boot from the **main checkout** (only clean-boot cwd),
- isolate its sessions with `--session-dir <worktree>/.harness/temp/s050/pi-sessions/`,
- write ALL deliverables/evidence to **absolute worktree paths** (packet allowed-paths fence),
- prove `spawnedBy=pij-bored-pelican` + unique pid/pane/spawnId (#19/#20 gates).
cwd=worktree is unachievable for a pi peer today without a pij-spawn `-ne/-e` passthrough feature.
