# Local tool preferences

- For searching and exploring GitHub, prefer the GitHub CLI (`gh`).
- Perplexity MCP is available for web search and deep research.

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

# Change safety preference

- Before editing config, prompts, package manifests, or project policy files, verify the requested change is actionable in the current environment.
- If the request is exploratory, speculative, or based on a tool/capability that is not currently available, discuss the proposed wording first instead of applying it.
- Prefer saying “we can add this once X exists” over encoding instructions for unavailable tools.
- Do not turn observations into persistent policy unless the user explicitly asks to write/update a file.

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
