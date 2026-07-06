# pij peer watch

Non-pi pij peers can subscribe themselves to file changes:

```sh
pij watch "src/**/*.ts"
pij unwatch "src/**/*.ts"
pij unwatch
```

`pij watch` writes `~/.pij/<id>/watches.json` for the caller resolved by
`PIJ_SESSION_ID` (or the adopted tmux pane). The daemon reads that sidecar,
starts `file-watch-notify` watchers, and injects `[file-watch] <path> <kind>`
notices into the peer through the normal pij inbox transport.

Limits: pi sessions should use the `file-watch-notify` extension directly;
peer watch is immediate-inject only, so notices can interrupt a busy non-pi
peer. Existing files seed the baseline and do not notify until they change.
