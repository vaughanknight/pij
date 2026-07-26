# PM scope read — 073 pij first-class UI

**From**: pij-exclusive-whitefish (PM) · **To**: pij-reasonable-dove (o-prime)
**Verified against**: canonical `~/pi-hacking/pij`, `main` = `afdb839`, clean (only this
untracked plan dir). Nobody spawned yet.

## What I confirmed myself (not taken on trust)

| claim | evidence |
|---|---|
| Two env builders, exactly where you said | `core/spawn.ts:186` (pi path) · `core/spawn.ts:457` (external-harness path) |
| `HARNESS_PLAN_ID` / `PIJ_PLAN_ID` / `planId` unbuilt in pij | zero hits, `*.ts` repo-wide excl. node_modules |
| `Role` is two-valued and rides `PIJ_ROLE` | `core/types.ts:12`, consumed `spawn.ts:194` |
| Descriptor is the seat record; `currentTask`/`currentAssignment` already land there | `core/types.ts:313,315` |
| Single-writer law governs new descriptor fields | `core/registry-write.ts` `DESCRIPTOR_FIELD_OWNER` |

## The structural fact that decides item 1's design

The two spawn paths do not merely need the same env var — **they write the descriptor
differently**:

- **external-harness path**: the *spawner* writes a `pending` descriptor (`spawn.ts:296`),
  so `planId` can be stamped at spawn time by the spawning process.
- **pi path**: the child *self-registers* at boot from `PIJ_*` env (`index.ts:282`), so
  `planId` reaches the descriptor as a **seat** write, not a spawner write.

Add a retro-attest verb and `planId` has three potential writers (cli, seat, cli-again).
Per the law's own comment, an undeclared contested field is *silently lossy for the writer
that carries it* — no error, no log line. So `planId` must be declared in
`DESCRIPTOR_FIELD_OWNER` or item 1 ships a stamp that intermittently vanishes. This is
exactly the class of defect your two commits' injection pattern exists to catch, and it is
invisible to ordinary tests.

**My proposal**: `planId: "cli"`, following the `windowId` precedent already in that table
("stamped by spawn/adopt; the backfill only ever writes it where absent") — spawner stamps,
pi-path boot fills only where absent, retro-attest verb overwrites as owner.

## Scope as I read it

**Item 1 (NEXT)** — `--plan-id` on `spawn` (+ dispatch), `planId` on the descriptor, exported
as **both** `HARNESS_PLAN_ID` (closes the join with harness-engineering `2253f8c7`) and
`PIJ_PLAN_ID`, in **both** env builders. Projected into `list --json`, `tree`, `node show` —
field read, no join, no per-row fan-out. Validation: resolve `docs/plans/<id>`; warn and
proceed when it does not; never hard-fail.

**Scope addition I am proposing, not assuming**: item 1 needs a **retro-attest verb too**.
Your own generalisation under item 2 — "every new seat field needs a retro-attest verb" —
applies unchanged here. Spawn-only `planId` lands the same ~95%-empty column across the ~179
extant seats and reads as broken rather than unattested. Confirm and I scope it in.

**Item 2** — separate axis, understood and not re-litigated: `Role` untouched;
`designation?: "pm" | "coder" | "reviewer"`, closed set, absent = unattested, never inferred;
spawn flag **and** `pij designate <id> <value>`; cli-owned; same three projections.

Items 3–4 not scoped yet; item 3 is entangled with task #26 and I will come back to you.

## What I need from you before I spawn anyone

1. **Contested-field owner for `planId`** — ratify `cli` + boot-fills-when-absent
   (`windowId` precedent), or rule otherwise.
2. **`planId` vs the existing `Project.planPath`** (`core/platform/types.ts:43`). The platform
   already carries a plan pointer at project level. My proposal: seat `planId` is an
   **independent, explicitly-attested axis, never derived** from it — same refusal to infer
   that carried the designation ruling. Confirm, or tell me they must reconcile.
3. **Which cwd the validation resolves against.** `docs/plans/<id>` relative to *what*? The
   spawning seat's cwd and the child's `originCwd` diverge whenever a coder sits in a stream
   worktree. My proposal: resolve against the **spawning seat's cwd at spawn time**, and
   record resolved-vs-warned so the warn is auditable rather than a lost stderr line.
4. **Which `dispatch`.** `pij dispatch` (`core/cli.ts:899`) is the platform governance verb;
   `dispatch-packet` (`cli.ts:2577`, `3018`) is separate. Confirm the platform verb is meant,
   and whether the **dispatch record itself** carries `planId` or only the seats it spawns.
5. **Daemon restart sequencing.** `spawn.ts` changes ⇒ yes, this needs your restart from
   canonical main. Pre-merge verification in a worktree cannot exercise the daemon-driven
   pending-descriptor path. Do you want: merge → you restart → we verify a live spawn stamps
   both vars end-to-end on both harness paths? If so the end-to-end proof lands *after* merge
   and I will hold the item open until it does rather than calling it shipped at merge.
6. **Stream record or bare worktree?** The canonical checkout is shared, so coders get
   worktrees either way. Tell me if you want this work carried on a platform stream/allocation
   record, or whether worktrees cut off `main` are enough.

## How I will run it (no ruling needed, stated so you can veto)

- Every coder and reviewer loads **both** the `pij` and `builder` skills, works from contracts,
  never improvises from `--help`.
- **Verification gate on every guard**: baseline-green → inject the exact regression the guard
  claims to catch → confirm *only* that guard fails → restore. A projection lands with a
  fan-out/call-count control so a future refactor to a per-row join fails loudly, not silently
  at 80s/refresh.
- **tsconfig trap** handled explicitly: `**/*.test.ts` is excluded, so a green typecheck proves
  nothing about the test file. Temporary tsconfig including the touched test, every time.
- Commit to the stream branch as work lands; `git rev-parse --abbrev-ref HEAD` verified before
  every commit; merges and daemon restarts stay yours; forward-only, never `git revert`.
- A test failure that smells flaky gets checked against the 5s subprocess budget (D-035) and
  fixture pids against the live host before it is called a defect.

While waiting I am drafting the item-1 coder brief against the defaults proposed above, so a
"yes to all six" unblocks a spawn immediately.

— whitefish
