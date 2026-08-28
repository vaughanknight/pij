# pij v0.2.0 — handover of outstanding items to Jordan's agent

**Tag:** `v0.2.0` = `d120c53` (2026-08-28 05:2xZ) — the sha the live daemon runs (restart #7). Everything merged is live and proven; everything in this folder is **not** built yet, or is in flight on a pushed branch.
**Spec:** https://github.com/AI-Substrate/pij/issues/311 (standalone comms spec + erratum comment). **Code:** this repository; the extension lives under `.pi/extensions/pij/`.
**Owner's instruction (Vaughan, 2026-08-28):** "ensure Jordan's agent has all the outstanding items. Plenty of deep detail on each piece so it can rebuild it, commit and push; it can look at our repo for the code and at the spec."

## How to work an item
1. Read its section (`NN-slug.md`, one file per item, written from the [template](TEMPLATE.md)).
2. Build on a branch from `main`; open a PR per item (never a stream branch wholesale).
3. Gates before merge (GitHub Actions has never run here — gates are local): full `npx vitest run .pi/extensions/pij/` at the **merge product** (PR head + `origin/main`) in a fresh worktree with `node_modules` linked; `just typecheck`; `just pij-skill-check`; the item's named mutants run red→green with source-pin greps deleted; cold review by a second seat; logs kept under the item's plan folder before the worktree is torn down.
4. Daemon-side changes go live only on a daemon restart: `pij daemon stop` (signals the inner pid — safe) then `pij daemon start` from the checkout; verify `pij daemon status` shows the new pid and sha, `queue backend: sqlite`; check `~/.pij/spine/write.lock` and `events.lock` hold no dead pid; run the item's § 5 live verification. The daemon serves every fleet on a machine — announce a freeze to live prime/pm/pa seats first if others share it.

## Rules that earned their place (each one cost us an incident on 2026-08-27/28)
- **Silent loss outranks noisy duplicate** on the human channel; any at-least-once change degrades to duplicate, never to loss (E29).
- **A sensor proves exactly the layer it drives** (E34); a fold whose purpose is a test lands with tests (E37); the mutant must hit code no existing test drives (E40); dedup packets state the invariant as a set (E36); hash the materialised plan, never a summary of it (E38).
- **Full-suite gates count only on a fresh-from-main worktree** (E35); a red on a long-lived worktree is diagnostic — diff its source against main first. A red run's log is kept in full, never truncated (E22).
- **Never assert "no log line" from a pane window or a `head`-cut listing** — name the file, its mtime, the id range (E42); verify a cited log claim by ids, never by matching a count (E43).
- **Proofs open adapters through the production factory** (E45); known environmental reds are named in the sensor's output so a new red cannot hide.
- **A command written into an orient is executed once first** (E47): `pij watchdog watch pij-telegram` registers a watcher; `pij watch` is the file-glob verb.
- `pij send`: quoted heredoc → `--body-file`, always (backticks in double quotes execute). `pij spine append` takes its body on stdin. `pij report now` rejects a 'did' over 280 chars.
- Receipts: on the Claude-socket path a durable `acked (reader=X)` row is written by the daemon at injection — injected, not read (item 23b below).

## Index of outstanding items
_(filled as sections land; one line per file: number · title · stream · status)_
