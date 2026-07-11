# s037 peer route ship evidence

## Diff

```diff
-pij send <id> "message text"          # lands as an injected turn in the peer's pane
-pij send <id> --command compact       # control command (compact/reload/…) [--wait]
-pij tail <id> [--since N] [--follow]  # peek its transcript without disturbing it
+pij send <id> "message text"                         # lands as an injected turn in one peer
+pij send --to <id> --to <id> "message text"          # same text once to each peer, in flag order
+pij send --to <id> --to <id> "message text" --wait   # wait for every successful recipient
+pij send <id> --command compact                      # control command (compact/reload/…) [--wait]
+pij tail <id> [--since N] [--follow]                 # peek its transcript without disturbing it
```

## Gate

`just pij-skill-check` passed:

- `peer` registry mapping resolves to `skills/pij/references/routes/peer.md`.
- Sibling-blindness scan passed.
- `peer.md` budget is 71/150 lines.
- CLI-verb coverage and duplicate-prose checks passed.
- Final verdict: `pij-skill-check: all green`.
