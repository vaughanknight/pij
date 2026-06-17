# How: image-see (`see_image` tool)

Lets a pi session **see an image** even when its own model can't receive one
via the terminal — the common case being a remote **xterm.js → tmux** session
with no local clipboard.

## The problem (D-043)

Three layered reasons an agent "can't see" a pasted image:

1. **Interactive TUI only attaches images on clipboard paste.** `Ctrl+V`
   (`app.clipboard.pasteImage`, `alt+v` on Windows) attaches the real bytes.
   Typing or dropping `@/path/to/img.png` inserts only the **path text** — `@`
   is pi's *file-reference* feature, not an image upload. Over a web terminal
   with no clipboard bridge, `Ctrl+V` isn't available at all.
2. **Print mode does attach** — `pi -p @img` reads the file, detects the mime,
   resizes, and sends it as an `ImageContent` (`cli/file-processor.ts`). So a
   one-shot child *can* deliver the image even when the interactive path can't.
3. **The model must be vision-capable.** Only models whose
   `~/.pi/agent/models.json` entry has `input: ["text","image"]` see the
   pixels. `mai-code-1-flash-internal` is `["text"]` (blind — reports "image
   omitted"); `claude-opus-4.8` has vision.

## The tool

`see_image` shells a one-shot child:

```
PI_SUBAGENT_CHILD=1 pi --no-tools --model <vision-model> -p @<abs-path> "<prompt>"
```

and returns the child's text as the tool result.

- `PI_SUBAGENT_CHILD=1` stops the child from activating pij (whose boot
  announce would collide with the `-p` task → "Agent is already processing").
- `--no-tools` keeps the child honest — it only looks, never acts.

### Parameters

| param | required | default |
|-------|----------|---------|
| `path` | yes | — (absolute preferred; `~` and relative-to-cwd resolved) |
| `prompt` | no | "Describe exactly what you see in this image. Report only…" |
| `model` | no | `PI_SEE_MODEL` env, else `github-copilot/claude-opus-4.8` |

Supported formats: png, jpg/jpeg, webp, gif. Others are rejected with a convert
hint (e.g. `sips -s format png in.heic --out out.png`).

## Typical flow on a remote terminal

The user's pasted screenshots land on disk (e.g. `scratch/paste/<ts>.png`, via
the file-watch-notify extension's paste capture). When a `[file-watch]
paste/…` notice fires, call `see_image` with that path and report what you see.

## Global install

Source lives in `.pi/extensions/image-see/`; `just link` symlinks it into
`~/.pi/agent/extensions/`, so `see_image` loads in **every** pi session on the
machine, regardless of cwd. Override the model per call (`model` param) or
machine-wide (`PI_SEE_MODEL`).

## Notes / limits

- The child is a real round-trip on the chosen vision model — costs one extra
  call and a few seconds.
- The child runs with an **empty stdin** (`spawn` + `stdio:["ignore",…]`): `pi
  -p` reads stdin, and an inherited/open pipe would make it block until EOF
  (the original 120s-timeout bug, D-043).
- If the child reports it can't see the image after a valid-format file +
  vision model, escalate to the user; don't loop on workarounds.
- Pure decisions (model/prompt/argv/validation) live in `store.ts` and are
  unit-tested; `index.ts` only does the fs check + `child_process` spawn.
