# Workshop: Large-Diff Pointer Delivery

**Type**: Integration Pattern
**Plan**: 034-pij-watch-rich-notices
**Spec**: [`../pij-watch-rich-notices-plan.md`](../pij-watch-rich-notices-plan.md)
**Created**: 2026-07-09
**Status**: Approved

**Value Thesis**: Settles how a diff-mode watch delivers a large diff to a non-pi peer without flooding its context or leaking disk — the sharpest unknown in the plan (dossier F-10). Resolves T008/T009 to Contract-Ready so the implementer branches on a decided mechanism, not an open one.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Implementation Readiness**: T009 becomes buildable — concrete body format, file location, threshold, and cleanup.
- **Cost / Attention Reduction**: a large diff must not burn the receiving peer's tokens; pointer delivery caps the inline cost.
- **Safety to Change**: the chosen mechanism must not disturb 033's delivery spine or the finding-10 guard.

**Domain Context**:
- **Primary Domain**: pij-control-plane
- **Related Domains**: file-watch-notify (produces the diff)

---

## Purpose
Decide how a `diff`-mode watch notice carries a diff that is too large to inline, and prove it neither floods the peer's pane nor leaks disk.

## Key Questions Addressed
- Inline path string in `body` vs extend the tmux-inject path to consume the `attachments` field?
- What is the inline-vs-pointer threshold?
- Where do pointer files live, and when are they cleaned up?

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | T009 needs a decided body format + path + threshold + cleanup, not options |
| Primary Value Axis | Cost / Attention Reduction | The whole feature is pointless if a diff floods the peer's context |
| Supporting Value Axes | Implementation Readiness, Safety to Change | Buildable + does not disturb 033 |
| Downstream Loop Improved | Implementation | T008/T009 build against a fixed contract |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A — inline path string in `body` | Write the diff to a file; the delivered notice body ends with a short `— diff: <path>` pointer the peer reads itself | Additive; zero daemon changes; matches the established flow-pair pointer pattern (persist body, send a path); works for the tmux-inject path **today** | Peer must do a second read to see the diff | **Selected** |
| B — extend tmux-inject to surface `attachments` | Populate `PijMessage.attachments` and teach `drainInbox`/`drainTmuxInbox` to render them | Uses the existing pointer field | **Invasive** — `attachments` is consumed only by the telegram bridge today (F-10, `core/types.ts:185-190`); `drainInbox`/`drainTmuxInbox` read `body`/`command` only (`daemon.ts:306`); changing injection touches **every** peer's delivery path | Rejected |

**Why A**: F-10 is decisive. The tmux-inject path a watch peer uses reads `body` only; the `attachments` contract exists but is telegram-only. Option A is purely additive (it changes only what the watch callback writes into `body`), so it cannot regress 033's spine or any other peer. Extending injection (B) is a cross-cutting change to the daemon's delivery for a single feature — wrong cost/risk.

## Contract

### Body format
- **Inline** (small diff): the diff fenced directly after the notice line.
  ```
  [file-watch] src/store.ts modified (+12/-3)
  @@ -40,3 +40,3 @@
  -  const x = 1
  +  const x = 2
  ```
- **Pointer** (large diff): a one-line notice with a stat summary + a local path.
  ```
  [file-watch] src/store.ts modified (+412/-88) — diff: ~/.pij/<id>/watch-diffs/src__store.ts.diff
  ```
  The peer reads the file itself. (Non-pi peers boot pij-aware of `pij` verbs; reading a local path needs no pij tool.)

### Threshold (inline → pointer)
- Inline **iff** the rendered diff is ≤ **60 lines** AND ≤ **4 KiB**; otherwise pointer. (Two bounds: line count guards pane readability, byte count guards a few very long lines.) Tunable constants; these are the defaults.

### Pointer file — location, naming, lifecycle
- **Dir**: `~/.pij/<id>/watch-diffs/` — a **dedicated** dir, deliberately **not** `~/.pij/<id>/inbox/` (the daemon `rmSync`s inbox messages after injection, `daemon.ts:303,320` — a pointer must survive the read).
- **Name**: one file **per watched path**, sanitized (`/` → `__`): `src/store.ts` → `src__store.ts.diff`. **Overwritten in place** each time that path changes.
- **Cleanup (resolves the dossier "when cleaned?" gap)**: overwrite-in-place means the dir holds **at most one file per distinct changed path** — bounded by design, no per-notice accumulation. On `pij unwatch` of the last watch for a session, and on session teardown, remove `watch-diffs/`. No timer/age sweep needed.

### finding-10 safety
- Delivery still goes through `channel.deliver({ from: "pij-watch", … })` (`watch.ts:121`) — unchanged `from`, still unregistered, so the guard (`daemon.ts:338`) holds. Pointer files live under the **recipient's** `~/.pij/<id>/`, never under a `pij-watch/` dir → no phantom dir (AC-09 intact).

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | T009 had an open fork + no cleanup rule | Mechanism (A), body format, threshold (60 lines/4 KiB), path scheme, overwrite-in-place cleanup all fixed |
| Review | Reviewer would question disk-leak + spine risk | Both answered: bounded dir, additive-only change |

## Validation / Acceptance
- A > threshold diff delivers as a `— diff: <path>` pointer; a ≤ threshold diff is inline (AC-05).
- `watch-diffs/` holds ≤ one file per changed path across repeated edits (bounded).
- No `~/.pij/pij-watch/` dir is created; 033 delivery tests still pass (AC-09).

## Learnings to Promote
- T009: adopt Option A + the contract above; overwrite-in-place per path is the cleanup mechanism (supersedes the plan's "unlink prior pointer" phrasing with a simpler equivalent).
- Non-goal reaffirmed: do **not** extend the injection path / `attachments` consumption.
