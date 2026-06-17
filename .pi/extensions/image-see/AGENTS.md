# image-see

Agent-callable `see_image` tool: lets a pi session whose own model can't
receive a pasted image (e.g. a remote **xterm.js → tmux** terminal with no
clipboard) still "see" an image. It shells a one-shot child `pi -p @<img>` on
a **vision-capable** model and returns the description as tool output.

## Why it exists

- pi's interactive TUI only attaches images via clipboard paste
  (`Ctrl+V` / `app.clipboard.pasteImage`) — unavailable over a remote web
  terminal. `@path` is a *file reference* (path text), never image bytes.
- But `pi -p @img` **does** attach the image (`cli/file-processor.ts`), and the
  model must advertise `input:["text","image"]` (vision). `mai-code-1-flash`
  is text-only; `claude-opus-4.8` has vision.
- So we shell a child on a vision model and surface its description. See
  `docs/difficulties.md` D-043 and `docs/how/image-see.md`.

## Tool: `see_image`

- `path` (required) — image path (absolute preferred; `~` and relative-to-cwd resolved).
- `prompt` (optional) — what to ask; defaults to a faithful "describe exactly what you see".
- `model` (optional) — override the vision model; else `PI_SEE_MODEL` env, else
  `github-copilot/claude-opus-4.8`.

Supported formats: png, jpg/jpeg, webp, gif (others rejected with a convert hint).

## Acceptance for v1

- [x] `npm test` green for `image-see/store.test.ts`
- [x] `npm run typecheck` clean
- [x] `cd pij && pi` loads without error; `see_image` tool registered
- [x] `npm run smoke -- image-see` passes (boot-only; tool is network-bound)
- [x] Difficulty entry D-043 resolved

## Notes

- Pure decisions (model/prompt/argv/validation) live in `store.ts`; `index.ts`
  only does the fs check + `child_process` spawn.
- The child runs with `PI_SUBAGENT_CHILD=1` (suppresses pij's boot announce so
  it doesn't collide with the `-p` task → "Agent is already processing") and
  `--no-tools` (the child only looks, never acts).
- Global reach: source lives here, symlinked into `~/.pi/agent/extensions/` via
  `just link`, so the tool loads in **every** pi session on the machine.
