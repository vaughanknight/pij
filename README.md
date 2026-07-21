# pij

pij is **two things at once — and more**:

1. A **pi-extensions project** — the `.pi/extensions/*` product surfaces
   (`pij`, `session-sql`, `todo`, `minih-workbench`, `pi-peacock`, and more)
   shipped as [pi](https://github.com/earendil-works) extensions.
2. A **cross-agent worker system** — a control-plane daemon, `flow-pair`
   delegation, and a Telegram bridge that let **agents drive agents** across
   pi / claude / copilot / codex.

…plus the engineering + agent harness that makes both compound. How we work
end-to-end lives in [`docs/how/workflow.md`](./docs/how/workflow.md).

> **The harness is the product.** Beneath both halves, pij is infrastructure
> for authoring pi extensions fast and coordinating agents reliably — patterns
> P1–P10 enforced by templates, a measured velocity log, and a deterministic
> gate, so the path compounds with use.

> **New agent? Start here →** [`AGENTS_README.md`](./AGENTS_README.md) is the
> cold-start front door (clone → build → update pi → "I understand this repo"),
> indexing the depth articles under [`docs/how/`](./docs/how/).

## Three commands

```bash
npm install                        # boot
npm run new -- <name>              # scaffold a new extension
npm run self-check                 # typecheck + lint + test + smoke
```

For everything else, see [`RUNBOOK.md`](./RUNBOOK.md). For agent rules
and the pattern library, see [`AGENTS.md`](./AGENTS.md). For the
Boot/Interact/Observe contract, see
[`docs/project-rules/harness.md`](./docs/project-rules/harness.md).

## pij — peer session messaging

`pij` lets two running pi sessions in the same repo talk to each other and observe
each other's work in near-real-time — a parent (expensive, reviewing) session
instructs a cheaper worker session, then follows its event stream incrementally
and fires feedback. File-backed, fire-and-forget; no server.

```bash
just pij list --here              # discover peer sessions (★ = you)
just pij send <id> "do X"          # message a peer (your id is stamped)
just pij tail <id> --since N      # read a peer's new events (cheap review)
just pij state <id>               # peer working/idle + liveness + age
npm run smoke -- pij              # in-pi boot/announce smoke (local)
```

After `just install` (which runs `npm link`), bare `pij …` resolves from any cwd.
See [`docs/how/pij.md`](./docs/how/pij.md) for the full CLI reference, the
message/receipt protocol, and the parent/worker workflow.
The machine-wide platform records (projects, assignments, the spine event
log) are a documented public on-disk contract — a UI can be built from the
files alone: [`docs/how/pij-platform.md`](./docs/how/pij-platform.md).

### Focus agents

Freeze a bound pi or claude peer's native session, list saved focuses, then
start fresh independent forks from the immutable snapshot:

```bash
pij focus save golden-reviewer
pij focus list
pij focus launch golden-reviewer
```

Focuses live under `~/.pij/focus/<name>/`. See
[`docs/how/pij-focus.md`](./docs/how/pij-focus.md) for adapter rules, pi's
worktree restriction, JSON output, and the required relaunch canary. A launch
is reported as `pending-canary`, not ready, until golden recall is verified.

## session-sql

`session-sql` is a pi extension that gives the current pi session a private
SQLite scratch DB for structured agent work. Use `/sql status`, `/sql schema`,
and `/sql <query>` in pi; the model-facing tool is named `sql`. DB files live
under `~/.pi/db/session-sql/`, not in the repo.

```bash
npm run smoke -- session-sql
```

See [`docs/how/session-sql.md`](./docs/how/session-sql.md) for custom table
recipes, persistence/fork semantics, native SQLite extension loading, and
troubleshooting.

## SQL-backed todos

`todo` is the product-friendly layer over the same session SQL DB. Use `/todo`
for routine current-session work tracking and `/sql` for raw inspection.

```text
/todo add Write tests
/todo next
/todo done 1
/sql SELECT id, title, status FROM todos;
```

The model-facing tool is named `todo`. It supports list/add/status/done/block,
dependency, next-ready, and confirmed clear actions. The overlay opens with
`/todo overlay` and uses configurable defaults in `DEFAULT_TODO_KEYBINDINGS`.

```bash
npm run smoke -- todo
```

See [`docs/how/todo.md`](./docs/how/todo.md) for command examples, dependency
semantics, overlay keys, and `/todo` + `/sql` agreement scenarios.

## Minih Workbench

`minih-workbench` adds `/minih` for Pi-native Minih run visibility and safe
coordination. It lists Minih runs, opens a full modal viewer, supports gated
send to active coordinated runs, confirms stop controls explicitly, and pushes
compact material Minih context with redaction and duplicate suppression.

```bash
npm run smoke -- minih-workbench
```

See [`docs/how/agent-workbench.md`](./docs/how/agent-workbench.md) for commands,
tool contracts, safety gates, and troubleshooting.

## Pi Peacock

`pi-peacock` colors Pi's full bottom footer/status area with VS Code
Peacock-style identity colors while preserving cwd/branch, model/thinking,
context usage, and extension statuses.

```text
/peacock list
/peacock reactBlue
/peacock status --json
/peacock off
```

See [`docs/how/pi-peacock.md`](./docs/how/pi-peacock.md) for presets,
footer-mode limitations, persistence scope, and validation notes.

## flow-pair

`flow-pair` wraps `the-flow` in a **three-session orchestrator/worker/reviewer**
delegation seam with a central prompt-learning ledger: an expensive orchestrator
plans/routes/reviews/learns, a cheap worker executes one bounded packet at a time,
and an independent cross-model reviewer runs clean-room code review. Prompt-learnings
are cluster-isolated (an `implement-code` miss never pollutes `fix-code` guidance) and
compound across runs.

Invoke as `/flow-pair`. Packets are pointer-delivered over `pij_send`; the worker
direct-jumps the relevant `/the-flow` verb. Test-quality is a gate (Dimension 0 —
prove tests are non-vacuous via `just flow-pair-mutate`); cross-model review decorrelates
blind spots; workers/reviewers are compacted early (at done-report, while the
orchestrator reviews) for zero-wait dispatch.

→ Full operator guide: [`docs/how/flow-pair.md`](docs/how/flow-pair.md) · skill:
[`skills/flow-pair/SKILL.md`](skills/flow-pair/SKILL.md) · build plan:
[`docs/plans/016-flow-pair/flow-pair-plan.md`](docs/plans/016-flow-pair/flow-pair-plan.md)

## Telegram bridge

`telegram` relays your pi sessions to a Telegram bot, so you can drive and observe
peers from your phone. Swipe-reply to a session bubble or address it by name
(`osn ship it`); otherwise bare text and captionless media follow the last session
whose non-receipt bubble successfully reached that chat. `/tail` separately follows
the most recently selected or routed session. Conversation state is process-local and
resets with the bridge. The id captured at setup is the **only** access control — only
your Telegram account can talk to the bridge.

Every agent-originated text or media bubble keeps the sender id first and adds repository
context: `[pij-id] [repo]` on `main`, or `[pij-id] [repo/branch]` on another branch.
If the sender descriptor or git context is unavailable, it falls back to `[pij-id]`.

```bash
pij telegram init     # one-time: paste a BotFather token, then message your bot once
pij telegram start    # run the bridge (foreground — background it yourself)
pij telegram stop     # stop a running bridge / clear a stale lock
```

`init` walks you through @BotFather, validates the token (`getMe`, prints the bot
`@handle`), captures your Telegram id from your first message as the allowlist, then
writes the three keys — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`,
`TELEGRAM_CHAT_ID` — to `~/.pij/telegram.env` (override with `PIJ_TELEGRAM_ENV`; the keys
are documented in [`.env.example`](.env.example)). Existing keys in that file are
preserved. `start` is a **single-instance, foreground** long-poll — run it under a process
manager (or `&` it). Then, from Telegram: `/list` to see live sessions, `osn <message>`
to address one, `/tail` to peek its recent events.

**Attachments** ride both ways by reference (paths, never bytes on the pij wire):
`pij send pij-telegram --file ./chart.png --caption "done"` lands the file in your chat,
and a photo/gif/document you send to the bot is saved with the addressed session
(`~/.pij/<id>/attachments/`) and announced to it as a text path — same allowlist, with
10/50 MB upload and 20 MB download caps.

→ Full operator + security guide: [`docs/how/pij-telegram.md`](docs/how/pij-telegram.md)

## Where things are

| What | Where |
|------|-------|
| Extensions | `.pi/extensions/<name>/` |
| Templates + generator | `harness/templates/`, `harness/scripts/new-extension.ts` |
| Smoke runner | `harness/scripts/smoke.ts` |
| Test utilities | `harness/test-utils.ts` |
| Difficulty ledger | `docs/difficulties.md` |
| Velocity log | `docs/velocity.md` |
| Workshops + research | `docs/plans/001-pi-extensions/` |
| Spec + plan for v0.1.0 | `docs/plans/002-pij-harness/` |
| Custom / unlisted pi models | `RUNBOOK.md` § "Custom / unlisted pi models" (+ `D-020`) |
| Ralph Loop extension | `.pi/extensions/ralph-loop/` + [`docs/how/ralph-loop.md`](docs/how/ralph-loop.md) (RUNBOOK § "How to start a Ralph Loop") |
| Agent harness (companion mode) | [`docs/project-rules/agent-harness.md`](docs/project-rules/agent-harness.md) (RUNBOOK § "Companion mode (minih)") |
| Pi Peacock extension | `.pi/extensions/pi-peacock/` + [`docs/how/pi-peacock.md`](docs/how/pi-peacock.md) |
| flow-pair (orchestrator/worker/reviewer) | `skills/flow-pair/` + [`docs/how/flow-pair.md`](docs/how/flow-pair.md) |
| pij platform on-disk contract (projects/assignments/spine) | [`docs/how/pij-platform.md`](docs/how/pij-platform.md) + migration posture [`docs/how/pij-governance-migration.md`](docs/how/pij-governance-migration.md) |

## Using extensions on another machine

Three paths work today (no npm publish yet):

```bash
# Path 1 — clone the harness, run pi from inside (uses project autoload)
git clone https://github.com/AI-Substrate/pij.git && cd pij && npm install && pi

# Path 2 — from the canonical main checkout, install machine-wide links.
# Pi gets every pij extension; OMP gets only pij plus Pi's shared MCP config.
# Linked worktrees and foreign/non-symlink targets are refused.
just link
just unlink

# Path 3 — let pi install directly from git (reads pij's pi.extensions manifest)
pi install https://github.com/AI-Substrate/pij.git
```

Once we have ≥3 stable extensions, workshop 005 will design the real
distribution model (bundle vs per-extension package). Until then, clone
or `pi install <git-url>` is the recommended path.

## Status

v0.1.0 — harness shipped (throwaway `demo` extension validated the path
end-to-end, then was torn down).

**v0.2** — `scratch` was built as the first real-extension data point in
`docs/velocity.md`; it has since been retired so the repo stays focused on
the harness.

**v0.3 (current main)** — Driver SDK (`harness/driver/`) gives typed
`Scenario`/`Step`/`Session` smoke primitives over tmux; `npm run smoke`
is a thin adapter. `extension-validator` agent pack at
`agents/extension-validator/` drives the SDK for autonomous validation.
`npm run link` symlinks pij extensions into `~/.pi/extensions/` for
cross-cwd use. `npm run pkg` + `.pi/packages.yaml` manage third-party
pi extensions (enable/disable; disable runs `pi remove`).

**v0.4 (in progress)** — `session-sql` adds a per-session SQLite workbench
with a generic `sql` tool and `/sql` command for structured current-session
state. `todo` adds a first-party task UX over the same SQL-backed work state.

## License

See [`LICENSE`](./LICENSE).
