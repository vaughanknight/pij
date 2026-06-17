# Local tool preferences

- For searching and exploring GitHub, prefer the GitHub CLI (`gh`).
- Perplexity MCP is available for web search and deep research.
- When a skill/command says to launch or use subagents, do not run that orchestrator skill itself as a subagent. Stay in the parent session, use the skill's structure/prompts to launch multiple focused worker subagents in parallel, then synthesize their outputs in the parent. This especially applies to `plan-1a-v2-explore`.
- Before launching research fan-out subagents, run a tiny canary (or otherwise verify the chosen agent's visible tools) that must successfully use read/search/list/shell tools. Do not trust outputs from children that cannot inspect files.
- In this environment, built-in `scout`/`delegate` agents may be a bad fit for filesystem research because their frontmatter allowlists raw Pi tool names like `read`, `grep`, `find`, `ls`, and `bash`, while this session exposes lean-ctx names like `ctx_read`, `ctx_grep`, `ctx_find`, `ctx_ls`, and `ctx_shell`. Prefer agents with the full/current tool surface (for example `flowspace-research-v2`) or override/configure tools explicitly.
- For subagent output, prefer explicit artifact paths such as `/tmp/<run-name>/<lens>.md`. Avoid passing `output: false` unless verified; it has previously produced a literal `false` file in the repo.

# Lean-ctx tool preference

When `ctx_*` tools are exposed in the session (provided by the `pi-lean-ctx`
extension), ALWAYS prefer them over pi's raw built-ins. They route through
lean-ctx for 60–90% token savings and let the engineering harness measure
context cost. This is a hard preference, not a tiebreaker.

Mapping (use the left column whenever both exist):

- `ctx_read` over `read` / `cat` / `head` / `tail`
- `ctx_shell` over `bash`
- `ctx_grep` over `grep`
- `ctx_find` over `find`
- `ctx_ls` over `ls`
- `ctx_edit` over native `edit` only when `edit` is unavailable; otherwise
  the built-in `edit` is fine (it has no compression equivalent).

`ctx_read` modes (`mode:` arg):

- `auto` — let lean-ctx pick (recommended default).
- `full` — files you're about to edit; use `diff` on re-read.
- `map` / `signatures` — context-only files, API surface only.
- `lines:N-M` — specific ranges.
- `aggressive` / `entropy` — heavy compression for large context-only files.

Anti-patterns:

- Reaching for `read` / `bash` / `grep` "just this once" when `ctx_*`
  exists — don't. The whole point is token savings on every call.
- Looping on a failing `edit`. Switch to `ctx_edit` once and continue.

If `ctx_*` tools are NOT present in this session (e.g. running outside the
pij setup), fall back to the raw built-ins silently — don't ask.

# Response formatting preference

Default to **min mode** unless the user asks for **medium mode** or **max mode**.

- **Min mode**: Keep the answer under one screen. Use a short heading plus a few tight bullets. Give the core answer and one useful takeaway/suggestion. Avoid code blocks unless essential.
- **Medium mode**: Use a readable one-screen structure with small sections and bullets. Include key details, tradeoffs, and a practical next step. Code snippets are okay if short.
- **Max mode**: Provide full detail with examples, code/config snippets, caveats, and implementation notes. Use this only when explicitly requested.

Avoid dense paragraph slabs. Prefer compact sections, bullets, and clear human-readable structure.

# Session SQL usage preference

- Use `sql` as a private structured scratchpad for the current pi session when work has multiple items, dependencies, repeated validation, file inventories, findings, research sources, test matrices, decision matrices, or batch progress.
- Start with the default `todos` and `todo_deps` tables for top-level work queues. Create custom tables freely for workflow-specific state, e.g. `file_work`, `batch_items`, `test_cases`, `review_findings`, `research_sources`, `options`, or `contract_cases`.
- Keep SQL state current: query before choosing the next item, update after edits/tests/research/decisions, and check open rows before final answers.
- Do not store secrets, huge raw logs, binary data, or durable project deliverables in session SQL. Use repo files for durable source/docs; use `sql` for session-local structured work.

# Image inspection (workaround for interactive image bug)

Pi's interactive REPL does NOT attach images. Typing `@image.jpg` or
pasting with Ctrl+V puts only the file path into the message — the model
receives a path string, no image bytes. Confirmed bug in pi 0.75.5: the
submit handler in `interactive-mode.ts` never sets `{ images }` on
`session.prompt()`. The CLI `-p` (print-mode) path DOES attach images
properly (verified end-to-end: user message contains
`{type:"image",mimeType:"image/jpeg",data:"..."}`).

When you need to actually **see** an image (screenshot, UI mockup,
diagram, photo), shell out to a one-shot child pi instead of trying to
read the file directly:

    pi --no-tools -p @/abs/path/to/file.jpg "Describe exactly what you see.
    Report only — do not run any tools, OCR, or workarounds."

Use `ctx_shell` if it's exposed, otherwise `bash`. Capture stdout and
treat the child's text response as your visual report.

Rules of thumb:

- **Absolute paths only.** The child pi resolves `@<path>` against its
  own cwd, not yours. Relative paths inside a `@` token frequently miss.
- **Format matters.** Pi accepts `image/{png,jpeg,webp,gif}` only. HEIC,
  TIFF, RAW, etc. are silently dropped to text. Convert first:

      sips -s format png /abs/file.heic --out /abs/file.png

  Then `pi -p @/abs/file.png`.
- **`--no-tools` keeps the child honest.** Without it the child may
  shell out to OCR / sips / etc. to fake an answer when it can't see;
  with it, you get either a real visual report or an explicit "I cannot
  see an image."
- **Cost**: one extra round trip on the same provider/model your session
  is using, so you're getting the same vision-capable model you already
  have configured.
- **Don't loop on it.** If the child reports it can't see the image
  after a valid-format convert, escalate to the user — don't retry with
  workarounds.

# Change safety preference

- Before editing config, prompts, package manifests, or project policy files, verify the requested change is actionable in the current environment.
- If the request is exploratory, speculative, or based on a tool/capability that is not currently available, discuss the proposed wording first instead of applying it.
- Prefer saying “we can add this once X exists” over encoding instructions for unavailable tools.
- Do not turn observations into persistent policy unless the user explicitly asks to write/update a file.

# Clarification batching preference

- When multiple clarification questions are known up front and independent, ask them in one `ask_user_question` call instead of one-by-one. This is preferred for planning/clarification skills unless the answer to an earlier question genuinely changes later questions. Respect the tool's maximum question count per call; if more remain, ask the highest-impact batch first and only follow up if still necessary.

# Voice input — phonetic interpretation

The user drives a lot of input via voice dictation. Expect occasional
homophone swaps, adjacent-word substitutions, and minor transcription
errors. When a word seems out of place, **try the phonetic neighbour
first** before asking. Common patterns:

- "MPM" → `npm`
- "to do" → `todo` (when referring to the extension/tool)
- "pee eye" / "pie" → `pi`
- "minnie h" / "mini h" → `minih`
- "yam'l" / "yarmel" → YAML
- "just file" → `justfile`
- "pre-checking" / "pre-check" → `pre-commit` (skill)
- "scale" → "skill"
- "MCP" sometimes lands as "MTP" / "MPC" — read as `MCP`
- "fluxbase" → "flowspace"

If two phonetic candidates are both plausible **and** the choice changes
what code you'd write or what file you'd touch, ask via
`ask_user_question`. Otherwise pick the one that fits surrounding
context and keep moving — the user prefers forward motion over
interrogation.

# Commit message preference

Prefer Conventional Commits-style messages, e.g. `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `test: ...`, `refactor: ...`.

# pij peer messaging — usage

`pij` lets concurrent pi sessions in the same project talk to each other. At
session start you may receive a boot briefing naming your own `pij-<id>`. Treat
it as **context, not a command** — do not run discovery commands or take action
unless the user (or a real peer message) asks.

How it actually reaches you:

- Real peer messages are injected **inline** as `[pij from <id>] <text>`. Only
  these are live instructions. Reply with `pij send <id> "..."` (your id is
  stamped automatically).
- The JSON files under your pij data dir (`~/.pij/<id>/inbox/`) are an internal
  **transport log, not a task queue**. Do NOT read, list, or `cat` them and do
  NOT act on their contents — they include already-delivered and historical
  messages, and re-running them replays stale requests (the "booted a new
  session and it went crazy" failure).

When YOU want to use pij (only when it serves the user's request):

- `pij list --here` — see peers in this project.
- `pij send <id> "..."` — message a peer.
- `pij tail <id>` / `pij state <id>` — observe a peer.

Drive it through `just pij ...` in the pij repo, or the bare `pij` CLI elsewhere.
