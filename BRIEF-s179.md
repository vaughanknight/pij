# s179 — Bring pij up to date (89 commits) without losing the local delivery fixes

**Repo**: `~/GitHub/pij` (NOT trex). **Worktree**: `~/GitHub/pij-worktrees/s179-upstream-merge` off the LOCAL `main` tip. **Model**: Opus 5. **Process**: plan-lite → prime GO → exec → gate-green + HEAD to prime (pij-spare-wren). NEVER swap the live clone yourself. NEVER screencapture.

## Why (Vaughan's ask)

He wants the new pij + its **now/next** support (`pij report now "<did>" "<next>" [--state …]` — a per-seat card with staleness reminders, upstream `cli.ts:284`) so the trex **Jumbotron** (s172, merged) can show what each seat is doing now and next instead of only burn/verdict.

## The obstacle (probed, do not re-discover)

`~/GitHub/pij` is **6 commits AHEAD** of `origin/main` and **89 behind**. A trial merge in a scratch worktree conflicts in three files, and the conflict is **semantic, not textual** — local and upstream independently reworked the SAME delivery vocabulary:

- **local (s127)**: `SendOutcome = "confirmed" | "unverified" | "injected-unverified"` — the honest-receipt work: text typed but submission unconfirmed is its own state, never `delivered`.
- **upstream**: `SendOutcome = "confirmed" | "unverified" | "held" | "failed"` — adds `held` (composer had live human input, nothing typed, retry later) and `failed` (threw before submission).

Conflicting files: `.pi/extensions/pij/daemon.ts`, `daemon.test.ts`, `core/ports.ts`.

**This machinery is what delivers every message to the live trex fleet.** A bad merge silently breaks orchestration.

## Scope

1. **Decide the vocabulary honestly.** Does upstream's `held`/`failed` pair subsume local `injected-unverified`, or is it a distinct state (typed-but-unconfirmed) that upstream lost? Read both implementations before ruling; the local one exists because of an observed swallowed-Enter wedge. Union, adopt, or supersede — argue it, don't split the difference silently.
2. Merge all 89 commits, resolve the three files per (1), keep every local behaviour that has a reason.
3. **Prove delivery still works** — pij's own test suite green, plus a real end-to-end: spawn a throwaway claude seat, send it a message, confirm arrival AND the receipt word is honest.
4. Report what `now/next` needs from a consumer (the field names/JSON shape the trex Jumbotron would read) — a short note is enough; the trex side is a separate stream.
5. **Do not** `npm link`/swap the live clone. Prime does the swap, after proof, when the trex fleet is quiet.

## Laws
The live `~/GitHub/pij` clone and the running daemon are untouched by this stream. Claims cite command output. Never merge to the local main — gate-green + HEAD SHA to prime.
