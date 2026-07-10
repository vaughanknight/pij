# pij peer watch

Non-pi pij peers can subscribe themselves to file changes:

```sh
pij watch "src/**/*.ts"            # notify mode (default): changed-line ranges
pij watch --diff "src/**/*.ts"     # diff mode: unified diff per change
pij watch --debounce 2s "src/**"   # override the 750 ms collate window
pij watch --mode notify "docs"     # explicit mode selector
pij unwatch "src/**/*.ts"          # drop that glob (every mode)
pij unwatch                        # drop all watches
```

`pij watch` writes `~/.pij/<id>/watches.json` for the caller resolved by
`PIJ_SESSION_ID` (or the adopted tmux pane). The daemon reads that sidecar,
starts `file-watch-notify` watchers, and injects notices into the peer through
the normal pij inbox transport.

## Collate window

Each subscription uses a **750 ms debounce window** by default. File-system
events and successive saves inside that window are reconciled into one wake,
then delivered as one notice / one tmux paste. This absorbs common
truncate-in-place double events and short save bursts without changing the
underlying per-file reconciliation semantics.

Override the window per subscription with `--debounce`; a bare integer is
milliseconds, and `ms` / `s` suffixes are accepted:

```sh
pij watch --debounce 500 "src/**/*.ts"
pij watch --debounce 750ms "src/**/*.ts"
pij watch --debounce 2s "src/**/*.ts"
```

Re-running the same glob + mode with a different debounce value updates that
subscription and restarts its watcher at the new cadence.

## Notice modes

Each subscription carries a `mode` (`notify` is the default; absent in a
pre-034 sidecar means `notify`). A notify and a diff watch on the **same glob**
coexist as two independent subscriptions.

- **notify** — one line per changed file with the changed-line ranges:

  ```
  [file-watch] src/store.ts modified (+12/-3) lines 40-42,88
  [file-watch] src/new.ts created (+20/-0) lines 1-20
  [file-watch] src/gone.ts deleted
  ```

- **diff** (`--diff`) — every computed unified diff is written to a readable
  pointer file; the injected notice stays on one tmux-safe line:

  ```
  [file-watch] src/store.ts modified (+2/-1) — diff: ~/.pij/<id>/watch-diffs/src__store.ts.diff
  ```

  Pointer files live in `~/.pij/<id>/watch-diffs/`, one file per watched path
  (`/` → `__`), **overwritten in place** on each change — so the directory holds
  at most one file per changed path. It is removed on the last `unwatch` and on
  session teardown. Deleted files and changes with no computed diff (for example
  over-cap or binary content) keep their plain one-line notices.

## Content baseline & `.gitignore`

- Diffs and ranges are computed from a **self-snapshot content baseline**: the
  daemon captures each matched file's text at prime and on every scan.
  Files over 256 KiB or detected as binary (a NUL byte) are tracked by
  `{mtime,size}` only — they still report `modified`, but without a textual
  delta. An mtime-only touch with unchanged content produces **no** notice.
- Inside a git work tree, changes to `.gitignore`d paths are suppressed. The
  filter runs `git check-ignore` in the daemon (repo root detected once per
  subscription via `git rev-parse --show-toplevel`); the pi-free
  `file-watch-notify` core stays git-agnostic. Outside a repo, behavior is
  unchanged (static editor-artifact ignore only) with no error.

## Limits

- pi sessions should use the `file-watch-notify` extension directly; peer watch
  targets non-pi peers.
- Existing files seed the baseline and do not notify until they change.
- **Post-restart caveat**: the content baseline is in-memory. After a daemon
  restart the first change to a file re-primes its baseline, so that first
  notice may be a plain `modified` (no delta) until a second change.
