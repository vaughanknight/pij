# Workshop: `.gitignore` Honoring

**Type**: Integration Pattern
**Plan**: 034-pij-watch-rich-notices
**Spec**: [`../pij-watch-rich-notices-plan.md`](../pij-watch-rich-notices-plan.md)
**Created**: 2026-07-09
**Status**: Approved

**Value Thesis**: Decides how a watch inside a git repo suppresses `.gitignore`d paths, and where that filter lives, so watches stop spamming `node_modules`/build output without re-implementing git's ignore semantics. Resolves T011 to Contract-Ready.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Operator Usability**: a peer watching a repo subtree should not drown in generated-file notices.
- **Proof Quality**: git's own matcher is the source of truth — no divergent re-implementation to be wrong.
- **Cross-Domain Coordination**: keeps the pi-free `file-watch-notify` core git-agnostic; the git concern lives in the daemon.

**Domain Context**:
- **Primary Domain**: pij-control-plane
- **Related Domains**: file-watch-notify (must stay git-free)

---

## Purpose
Decide the `.gitignore` matching mechanism, where it is applied in the pipeline, and how it degrades outside a git repo.

## Key Questions Addressed
- `git check-ignore` (spawns git) vs in-process `.gitignore` parse → picomatch (already a dep)?
- Where is the filter applied — the pi-free core's ignore predicate, or the daemon?
- How is a git repo detected, and how is that cost bounded?
- Behavior outside a git work tree?

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | T011 needs a decided mechanism + placement + degrade path |
| Primary Value Axis | Proof Quality | git ignore semantics are subtle; using git itself avoids a wrong re-impl |
| Supporting Value Axes | Operator Usability, Cross-Domain Coordination | Kills notice spam; keeps the core pure |
| Downstream Loop Improved | Implementation | T011 builds against a fixed contract |

## Decision Space

### Q1 — Matcher

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A — `git check-ignore` (batched `--stdin -z`) | Feed the wake's changed paths to one `git check-ignore --stdin` per wake; drop the matches | **Correct by construction** — honors nested `.gitignore`, `!` negation, `.git/info/exclude`, `core.excludesFile`, anchoring, `**` | Spawns git (once per wake, not per file) | **Selected** |
| B — in-process parse → picomatch | Read `.gitignore`, translate to picomatch globs (already a dep) | No subprocess | **Re-implements git ignore semantics** — negation/nesting/precedence/anchoring are subtle and easy to get subtly wrong → divergence from what the user sees in `git status` | Rejected |

**Why A**: correctness dominates. The whole point is to match the user's mental model of "what git ignores"; only git guarantees that. The cost objection is bounded (Q3): one batched spawn per **coalesced wake** (notices already coalesce, `store.ts:47`/`watcher.ts:52-58`), not per file, and only when a repo was detected.

### Q2 — Placement (which layer applies the filter)

| Option | Description | Decision |
|--------|-------------|----------|
| A — in the pi-free `file-watch-notify` core (`compileWatch.isIgnored`) | Would drag `git` + repo detection into the pure core | Rejected — breaks the core's git-agnostic boundary (domain registry: "no coupling") |
| B — in the daemon `PeerWatchManager`, filtering `Change[]` before formatting/delivery | git is already a daemon-level concern; core stays pure | **Selected** |

**Contract**: after the core reconciler emits `Change[]`, the daemon filters out any change whose path `git check-ignore` matches (when the sub's dir is in a repo), then formats/delivers the survivors. The core never learns about git. (Note: this supersedes the plan's "layer into `compileWatch`" phrasing — the filter lives in the daemon, not the core, to preserve the boundary.)

### Q3 — Repo detection + cost bound
- On subscription **start** (`PeerWatchManager.start`, `watch.ts:60`), run `git -C <sub.dir> rev-parse --show-toplevel` **once**; cache the result (repo root, or "not a repo") on the subscription's runtime state.
- Per wake, if cached as a repo: one `git -C <root> check-ignore --stdin -z` over the changed-path batch. If "not a repo": skip entirely.
- Bounded: one detection per subscription lifetime + one batched check per wake.

### Q4 — Degrade (no git / outside a repo)
- `rev-parse` fails / dir not in a work tree → no gitignore filtering; the static `DEFAULT_IGNORE` glob list (`store.ts:49`) is the only ignore, exactly as today. No error (AC-07 second half).

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | T011 had matcher + placement + detection all open | All fixed: `git check-ignore` batched, in the daemon, repo cached at start, silent degrade |
| Review | Reviewer would question re-impl correctness + core purity | Answered: git is the matcher; core stays git-free |
| Operator | Watching a repo subtree spams generated files | `.gitignore`d paths never notify in-repo |

## Validation / Acceptance
- In a git repo, a change to a `.gitignore`d path (e.g. under `node_modules/`) produces **no** notice; a tracked path does (AC-07).
- Outside a repo, behavior is unchanged (static ignore only), no error (AC-07).
- The pi-free `file-watch-notify` core gains **no** git dependency (grep: no git import under `file-watch-notify/`).

## Learnings to Promote
- T011: matcher = batched `git check-ignore --stdin`; placement = daemon `PeerWatchManager` (filter `Change[]`), **not** the core `compileWatch`; repo root detected+cached at subscription start; silent degrade outside a repo.
- Update the plan's Domain Manifest note for T011 to reflect the filter living in `core/daemon/watch.ts` only (core untouched for gitignore).
