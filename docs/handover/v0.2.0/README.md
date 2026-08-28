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

**Pointer convention:** every repository path in these files resolves on **`main`** (the evidence folders landed after the tag in PRs #36/#37/#40); code line references are stated at tag `d120c53` unless a section says otherwise; an in-flight item's branch pointers name the branch and sha and carry the log lines inline.

**Owner's status report (narrative input):** https://peri-dev.ngrok.app/reports/pij-status-2026-08-28-release/ (source in the separate `perimenocause` repository — `perimenocause:government/reports/pij-status-2026-08-28-release.html` — not in this repo). Convention in these files: a pointer into another repository is written `<repo>:<path>`.

## Evidence folders (merged to main for this handover)
- `docs/plans/391-day3-core/` — s391's plans, tasks, reviews, fixes, reports, ship reports, rulings (PR #36), and kept logs under `kept-logs/*.log.txt` (PR #40 — `.gitignore` had silently dropped a `logs/` folder from #36; evidence folders must avoid ignored path classes).
- `docs/plans/392-day3-codex-doctrine/` — s392's plans, tasks, reviews, reports, rulings, kept evidence incl. reviewer verdicts and coder report JSONs (PR #37).

## Index of outstanding items
_(filled as sections land; one line per file: number · title · stream · status)_
- 00 · The live system at v0.2.0 — o-prime · written
- 01 · What is already shipped (item → PR → sha) — o-prime · generated
- 23b · Honest transport receipt: record marker origin (injected vs reader-read) — s392 · designed, not started
- 24b · Bounded in-lease send backoff + within-pass ambiguous-retry duplicate — s392 · designed, held (measured residual 0)
- 29b-rest · runDaemon wiring assertion + sidecar advisories (ADV-2/4/5) — s392 · designed, not started
- E7 · CLI guard refusing `pij send` bodies with unescaped backticks — s392 · designed, not started
- 21b · Item-21 reviewer advisories (bind-refusal notice tail) — s392 · designed, not started
- 22 · Watchdog ratchet hardening (was parked behind 24) — s392 · designed, not started
- E22 · cli.integration subprocess flake (kept-log rule + fixture) — s392 · designed, not started
- Codex 2/8 · app-server `--remote` delivery — s392 · DEFERRED by the owner; frame builders unit-proven, routing/topology/lifecycle unproven; needs `codex login`
- 33 · Plan-055 watchdog smoke proof resurrected against the current delivery model — s391 · in flight (branch + partial patch + three red logs on main)
- 35 · GitHub Actions has never run in this repo (investigated: events delivered, zero check suites, permissions correct) — s391 · designed, needs a GitHub-side fix
- E3 · `pij canary` aborts before the nonce on Claude-pinned seats — s391 · designed, not started
- E5 · `pij state --json` / `pij list --json` lossy surfaces — s391 · designed, not started
- 99 · Carried lows (15 G-3/AC-20, 16 H-1/H-3/H-6, 32 lows) — s391 · list with pointers
- 12-FX · `pij-skill-check.test.ts` flaky under full-suite parallelism — s392 · implemented on branch `s392/item12-fx-falcon` (3 green runs), not merged
- 23-FX · `adapters/claude-socket.test.ts` close-race flake — s392 · implemented on the same branch; exact symptom did not recur in 100 attempts (partial repro stated), related ECONNREFUSED race fixed; not merged
