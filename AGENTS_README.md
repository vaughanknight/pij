# AGENTS_README — cold-start front door

The fastest path for a fresh agent (on any machine) to clone pij, build it,
update pi, and understand how we work. This file is an **index**: each section is
a short blurb + links into the depth articles under [`docs/how/`](docs/how/) —
the depth lives there, not here.

> **What pij is:** both a **pi-extensions project** (the `.pi/extensions/*`
> product surfaces) **and** a **cross-agent worker system** (agents driving
> agents across pi / claude / copilot / codex) — and more.
>
> **Where the rules + ops live:** [`AGENTS.md`](AGENTS.md) is the agent **rules**
> (P1–P10, security protocol, self-improvement loop); [`RUNBOOK.md`](RUNBOOK.md)
> is the operational **runbook**; [`README.md`](README.md) frames the **thesis**.
> This file is the index, not a substitute for those.

### `pi` agent harness vs the `pij` platform

`pi` is the host agent harness. **pij is the orchestration platform around it**,
exposed through the `pij` CLI and the `/pij` skill. They are not variants of the
same command.

| Surface | What it is |
|---|---|
| `pi` | The upstream interactive **agent harness/runtime**, installed from `@earendil-works/pi-coding-agent`. It hosts sessions and loads `.pi/extensions/*`. |
| `pij` CLI | The pij platform's machine surface for session identity, messaging, spawning, observation, inboxes, and orchestration primitives. |
| `/pij` skill | The pij platform's intent router: it selects a job protocol such as `pair`, `delegate`, `agent`, `peer`, `ops`, or `prime`, then uses the `pij` CLI underneath. |

The `pij` extension runs inside the `pi` agent harness; the `pij` CLI also
controls peers in other harnesses such as Claude, Copilot, and Codex.

---

## Cold start

Clone, run the single bootstrap command, verify. This is the only fresh-machine
path:

```bash
git clone <pij-repo> && cd pij
just install            # the 6-step fresh-machine bootstrap (idempotent)
```

Then verify:

```bash
just pi-doctor          # read-only audit of pi's global state
just self-check         # or: harness boot  (fast typecheck + test)
```

→ Depth: [`docs/how/build.md`](docs/how/build.md).

## Build & test

The recipe surface (`just` with no args lists everything), the composite gate
`just self-check` (local-path portability → typecheck → lint → test → smoke →
pkg audit → snapshots), and the engineering harness (`harness boot` /
`harness checks` / `harness doctor`).
The `harness` CLI is an ambient global tool; `.harness/` is committed substrate
it reads.

→ [`docs/how/build.md`](docs/how/build.md) ·
[`.harness/engineering-harness.md`](.harness/engineering-harness.md)

## The `pi` agent harness / updating pi

`pi` is the upstream agent harness and official npm binary
`@earendil-works/pi-coding-agent`—not the `pij` control-plane CLI. This repository
installs that harness and **syncs its global state** onto `~/.pi/agent/` (prefs,
`mcp.json`, extension symlinks, vetted packages). Refresh `pi` with
`just update-pi`; audit it with `just pi-doctor`. Edit the source files in `.pi/`
and re-run—never hand-edit `~/.pi/agent/*`.

→ [`docs/how/update-pi.md`](docs/how/update-pi.md)

## How we work (workflow)

We plan with the **the-flow** SDD pipeline (explore → plan → tasks → implement →
review → ship; artifacts under `docs/plans/<ord>-<slug>/`), delegate bounded work
through **`/pij pair`** (the flow-pair orchestrator / coder / reviewer engine),
and drive peer sessions through the **control plane** (the `pij` daemon
switchboard; `spawn` / `send` / `list` / `tail`; transport seam = pi in-process
inbox, claude/copilot/codex via tmux send-keys).

`/pij` is the **skill router** for jobs (`pair`, `delegate`, `agent`, `skill`,
`peer`, `ops`, `prime`). `pij` is the **CLI binary** that performs machine
actions. For multi-stream work, `/pij prime` adds repository governance above
the ordinary per-stream `/pij pair` cycle.

→ [`docs/how/workflow.md`](docs/how/workflow.md) ·
[`docs/how/flow-pair.md`](docs/how/flow-pair.md) ·
[`docs/how/pij.md`](docs/how/pij.md)

## Prime hierarchy, streams & fleets

The canonical ownership tree is:

```text
human
└── o-prime (one governance seat for the repository)
    ├── stream orchestrator (one plan + worktree + branch + fence)
    │   ├── coder / implementer
    │   ├── cold reviewer
    │   └── other bounded peers (validator, researcher, live-test client)
    └── stream orchestrator
        └── its own fleet
```

- The **human** names work, gives binding rulings, and approves merges.
- The **o-prime governs; it does not implement**. It is the single writer of
  `government/`, owns the portfolio, roster, fences, batons, and cross-stream
  sequencing, and verifies each stream's evidence one hop upward. Durable state
  lives in the spine, prime-flow, baton book, briefs, and canary records.
- Each **stream orchestrator** owns one work item and its fleet. It plans in its
  isolated worktree, delegates bounded implementation through `/pij pair`,
  verifies worker claims, and reports upward.
- Peers belong to their stream, not directly to the o-prime. Streams do not
  coordinate sideways; overlap and dependencies route through the o-prime.
- Use **worktrees/branches/fences for isolation** and **batons for serialized
  shared resources**. Reusable peers are compacted fire-and-forget at completion
  before reuse; teardown is ownership-aware.

An o-prime may govern `1..N` streams; each stream may own `0..N` peers over its
lifecycle. Separate o-primes are sibling governments, not child streams.
`/pij prime` selects the governance route; `pij orchestration prime` marks the
seat and `pij orchestration baton` manages shared-resource leases.

→ [`docs/how/pij-prime.md`](docs/how/pij-prime.md) ·
[`docs/how/pij-prime-tree.md`](docs/how/pij-prime-tree.md) ·
[`docs/how/pij-orchestration-baton.md`](docs/how/pij-orchestration-baton.md) ·
[`docs/how/flow-pair.md`](docs/how/flow-pair.md)

## Skills

> **Copilot** (and codex, pi) read skills from **`~/.agents/skills/`** (installed
> via `npx skills`; manifest `~/.agents/.skill-lock.json`). **Claude** reads from
> **`~/.claude/skills/`**, which **symlinks into** that same `~/.agents/skills/`
> store — one physical store, both agents see it.

Install via the `justfile` (it wraps `npx skills` — never call `npx skills` by
hand for a cold start):

```bash
just pij-skill-install     # the /pij router front door (pair/delegate/agent/skill/peer/ops/prime) → EVERY agent (`-a '*'`):
                           #   Claude (~/.claude/skills) AND Copilot/codex/pi (~/.agents/skills)
just install-flow-skills   # the-flow + eng-harness-flow, pi-scoped, global
just pij-skill-link        # (in-repo dogfood) symlink /pij into .pi/skills/
```

`pij-skill-install` fans out to Claude **and** Copilot at once (it populates
`~/.agents/skills/` and the per-agent symlink bridge into `~/.claude/skills/`, then
symlinks the store entry back to the repo so it can't drift); you do **not** install
per-agent. For cold start the skills that matter are `the-flow`, `pij` (the router
front door — its `pair` route drives the repo-local **flow-pair engine**
(`skills/flow-pair/lib`), which is no longer a separately-installed skill), and
`eng-harness-flow`.

**Front door**: `/pij` routes every pij job by intent — `pair` (coder+reviewer
fleet), `delegate` (one task → one peer), `agent`, `skill`, `peer`, `ops`, and
`prime` (multi-stream repository government). The old `/flow-pair` skill has
been removed — say "flow-pair" or run `/pij pair` (both route the same
protocol). File watching remains a direct `pij watch` / `pij unwatch` CLI
surface.

### `the-flow` from the source repo (`jakkaj/tools`)

`the-flow` lives in the **tools** repo — `git@github.com:jakkaj/tools.git`
(its README documents the full `npx skills` install surface). `npx skills` takes
the `owner/repo` shorthand `jakkaj/tools` and resolves it to that remote, so you
can install `the-flow` directly without the `justfile`:

```bash
# the-flow only (the whole /the-flow SDD pipeline ships as one skill):
npx skills@latest add jakkaj/tools --skill the-flow -a claude-code -g   # Claude (~/.claude/skills)
npx skills@latest add jakkaj/tools --skill the-flow -a github-copilot   # Copilot (~/.agents/skills)

# or every skill in the repo, globally for Claude:
npx skills@latest add jakkaj/tools -a claude-code -g
```

`just install-flow-skills` is the pi-scoped wrapper around the first form
(`-a pi`). Use the raw one-liners above when you want `the-flow` on **Claude or
Copilot** specifically.

→ [`docs/how/skills.md`](docs/how/skills.md) ·
[`jakkaj/tools` README](https://github.com/jakkaj/tools#readme)

## The extensions (the pi-extensions half)

The `.pi/extensions/*` product surfaces — the things pij ships as pi extensions:

- [`docs/how/pij.md`](docs/how/pij.md) — peer pi-session messaging + observe.
- [`docs/how/session-sql.md`](docs/how/session-sql.md) — per-session SQL store.
- [`docs/how/todo.md`](docs/how/todo.md) — the todo extension.
- [`docs/how/agent-workbench.md`](docs/how/agent-workbench.md) — the minih
  agent workbench.
- [`docs/how/pi-peacock.md`](docs/how/pi-peacock.md) — per-session window tint.
- [`docs/how/file-watch-notify.md`](docs/how/file-watch-notify.md) — file-watch
  notifications.
- [`docs/how/image-see.md`](docs/how/image-see.md) — image viewing.
- [`docs/how/ralph-loop.md`](docs/how/ralph-loop.md) — the ralph loop.
- [`docs/how/pij-agents.md`](docs/how/pij-agents.md) — **`pij agent`**: run
  declarative minih agent packs (list/run/inline/new/check/eject) across
  claude·codex·copilot, or **spawn a pack as a daemon-bound pij peer**. Quick start:
  ```bash
  pij agent list                                       # merged pack inventory
  pij agent run flowspace-search -p query="…"           # run a named pack (one-shot)
  pij agent run --prompt "List risky TODOs" --json       # inline, scriptable
  pij agent spawn flowspace-search -p query="…"          # spawn as a resident pij peer
  pij agent report --json '{"summary":"…"}'              # (inside a peer) push a report to the spawner
  ```
- `skill-runner` — runs skills inside a session (no dedicated article yet).

## Cross-agent worker system (the other half)

The control plane, delegation, and remote driving across harnesses:

- [`docs/how/pij.md`](docs/how/pij.md) — the messaging + control-plane CLI.
- [`docs/how/pij-prime.md`](docs/how/pij-prime.md) — o-prime government,
  stream orchestration, worktree ownership, evidence, and lifecycle.
- [`docs/how/pij-orchestration-baton.md`](docs/how/pij-orchestration-baton.md)
  — exclusive shared-resource leases and handover.
- [`docs/how/flow-pair.md`](docs/how/flow-pair.md) — orchestrator / worker /
  reviewer delegation.
- [`docs/how/pij-telegram.md`](docs/how/pij-telegram.md) — drive your pi
  sessions from Telegram.

## Feedback / self-improvement

Every session contributes back: retros + magic-wand wishes + difficulties flow
into the harness so the next agent doesn't hit the same friction.

→ [`docs/how/agent-feedback.md`](docs/how/agent-feedback.md)

## Rules & runbook

- [`AGENTS.md`](AGENTS.md) — the agent **rules** (read before changing code).
- [`RUNBOOK.md`](RUNBOOK.md) — the operational **runbook**.
- [`README.md`](README.md) — the project **thesis**.
