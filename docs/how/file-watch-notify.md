# How: file-watch-notify

A standalone pi extension that watches configured folders/globs and **injects a
notice straight into your session when a file changes** — no tool call, and
**steered** (delivered after the current turn) when the model is busy. It's the
file-system analogue of receiving a `pij` peer message.

## Quick start

1. Create `.pi/file-watch.json` in your project root:

   ```json
   {
     "watches": [
       { "dir": "docs", "patterns": ["**/*.md"] }
     ]
   }
   ```

2. Start (or `/reload`) pi from the project root. The watcher arms at
   `session_start` — no tool call to enable it.
3. Edit a matching file. A notice appears in-session:

   ```
   [file-watch] guide.md modified
   ```

   If the model is mid-turn, the notice is **steered** in after the turn; if
   idle, it arrives immediately and starts a turn.

Run `/file-watch-notify` any time to see status (`watching N folders`, `not
configured`, or `invalid (...)`).

## Config reference (`.pi/file-watch.json`)

```json
{
  "watches": [
    {
      "dir": "docs",
      "patterns": ["**/*.md", "*.mdx"],
      "events": ["add", "change", "unlink"],
      "recursive": false
    }
  ],
  "debounceMs": 30,
  "ignore": ["4913", "*~", ".goutputstream*", ".tmp*", ".*"],
  "notice": "[file-watch] {path} {kind}"
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `watches[]` | ✅ | — | One or more watches; each needs `dir` + ≥1 `patterns`. |
| `watches[].dir` | ✅ | — | Folder, resolved relative to the project root. |
| `watches[].patterns` | ✅ | — | picomatch globs, matched against the path **relative to `dir`** (`*.md` = top-level, `**/*.md` = nested). |
| `watches[].events` | — | all | Subset of `created` \| `modified` \| `deleted` (the change kinds; `add`/`change`/`unlink` aliases are *not* used — use the kind names). |
| `watches[].recursive` | — | `false` | Watch subdirectories (needs Node ≥19.1). See scale caveats below. |
| `debounceMs` | — | `30` | Coalesce a burst of events into one scan (20–50 recommended). |
| `ignore` | — | atomic-save list | picomatch globs over **basename**; the default filters editor artifacts. |
| `notice` | — | `[file-watch] {path} {kind}` | Template; `{path}` and `{kind}` are substituted. |

> Note: the kind filter values are `created` / `modified` / `deleted`.

Invalid config (bad JSON or a failed validation) surfaces **one** startup
warning and the watcher stays down — it never half-starts.

## Why snapshot reconcile (the directory-watch trap)

`fs.watch(dir)` is the only zero-dependency way to watch a folder, but its
event **types** are unreliable: some platforms miss in-place modifies, and
editors save atomically (write a temp file, rename over the target), so you see
deletes/creates instead of modifies.

This extension therefore **never trusts `fs.watch` event types**. On each
debounced wake it rebuilds a `{mtimeMs,size}` snapshot of the matching files and
**reconciles** it against the previous one:

- in the new snapshot only → `created`
- in both, different `mtimeMs`/`size` → `modified`
- in the old snapshot only → `deleted`

A `delete`→`re-add` within ~100 ms (a split atomic save) is coalesced to a
single `modified`, and the default `ignore` list drops editor scratch files
(`4913`, `*~`, `.goutputstream*`, dotfiles). The result is one honest notice per
real change, regardless of platform or editor.

## Steer vs immediate

Delivery mirrors pij's inject path:

- **Idle** → `sendUserMessage(notice)` (starts a turn immediately).
- **Busy** → `sendUserMessage(notice, { deliverAs: "steer" })` (queued, applied
  after the current turn — never a mid-stream interrupt).

No tool call is involved in either case; the notice is a user-role message the
model simply sees.

## Scale & limits

- A single shallow folder is the common, cheap case. `recursive: true` opens a
  recursive `fs.watch` and walks subtrees on each wake — fine for a docs tree,
  but for very large/deep repos you can hit `EMFILE`/`ENOSPC`. A
  `chokidar`/`@parcel/watcher` backend is a documented future drop-in (not built
  here).
- It only **notifies** — it never acts on changes. The agent decides what to do.
- It's **local-session only**. Cross-session delivery is `pij`'s job.
