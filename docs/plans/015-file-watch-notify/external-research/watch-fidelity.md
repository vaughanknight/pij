# External research — file-watch fidelity (created/modified/deleted under real editors)

**Generated**: 2026-06-16  ·  **For**: docs/plans/015-file-watch-notify
**Method**: Perplexity search ×3 (the deep-research agent tool timed out at the MCP gateway; parallel `search` calls used instead).
**Question**: Can zero-dep `node:fs.watch` + a snapshot reconcile reliably classify add/change/unlink under editor atomic saves, or is chokidar v4/@parcel/watcher worth the dependency?

---

## TL;DR recommendation

| Scenario | Recommendation | Why |
|---|---|---|
| **Shallow single configured folder** (our default) | **Zero-dep: `node:fs.watch(dir)` + debounce + `readdir`+`stat` snapshot diff + `picomatch`** | Snapshot reconcile makes create/modify/delete reliable *regardless* of fs.watch's platform quirks; picomatch is 0-dep and supports one-or-more patterns. |
| **Recursive / repo-wide watch** | **chokidar v4** (1 dep) — or **@parcel/watcher** if you hit scale | Normalizes events to add/change/unlink, and its `atomic` + `awaitWriteFinish` options absorb editor atomic-save artifacts out of the box. |

**The single most important finding for *our* design** is below (§ The directory-watch trap).

---

## 1. The directory-watch trap — why pij gets away with it but a general watcher can't

`fs.watch` on a **directory** is notified when the **directory entry** changes (create / delete / rename). An **in-place content modify** (e.g. `echo > file`, or an editor that writes-in-place) does **not** change the directory entry, so on some platforms a dir-watch **misses modifies entirely** (StackOverflow #10762630, confirmed behavior; platform-dependent — macOS FSEvents / Windows often *do* surface file `change`, Linux/inotify dir-watch may not).

- **Why pij works anyway**: pij watches a **dedicated inbox dir** and *every writer uses atomic `tmp`+`rename`* (`channel.ts deliver`). An atomic rename **always** mutates the directory entry → the dir-watch **always** fires → pij re-scans and reads. pij never needs to detect in-place modifies, so the trap doesn't apply.
- **Why a general file-watch-notify can't assume that**: user editors/tools may write **in-place** (not atomic). So the new feature **must not rely on `fs.watch` event types**; it must keep a **path → {mtimeMs, size}** snapshot and **reconcile on every (debounced) wake** to classify created/modified/deleted truthfully. This is the **main upgrade** over pij's current watcher.

## 2. `fs.watch` quirks to defend against (all confirmed)
- Emits `rename` for create **and** delete **and** rename — "useless `rename`" (chokidar README); don't trust `eventType`.
- **Double events** for a single change (often the editor writing twice, not Node) → **debounce** (pij's 20 ms; 20–50 ms is fine).
- **Filename not always reported** on some platforms/older Node → re-`readdir` the dir rather than trust `filename`.
- **Atomic-save artifacts**: vim writes a `4913` probe file + backup `~`; GNOME uses `.goutputstream-*`; editors do delete-then-recreate → naive code sees spurious `unlink`+`add`. Mitigate with an **ignore list** (`.tmp*`, `*~`, `4913`, `.goutputstream*`, dotfiles) **and** the "re-added within ~100 ms of delete ⇒ treat as change" rule.
- **Recursive**: `recursive:true` works on macOS/Windows and on **Linux since Node ≥19.1** (chokidar README); pre-19.1 Linux had no recursive. Large recursive watches risk `EMFILE`/`ENOSPC`.

## 3. The minimal robust algorithm (zero-dep)
```
watch(dir, recursive?) ──▶ on any event: clearTimeout; setTimeout(reconcile, DEBOUNCE)
reconcile():
  next = readdir(dir) filtered by ignore-list, each stat → {mtimeMs,size}
  for name in (prev ∪ next):
     in next not prev      → "created"
     in prev not next      → "deleted"   (but if same name reappears <100ms → coalesce to "modified")
     in both, mtime/size ≠ → "modified"
  if picomatch(patterns).isMatch(name): emit notice(kind, name)
  prev = next
```
- **Debounce window**: 20–50 ms absorbs atomic-save bursts without dropping real edits. (chokidar's analogous `atomic` default is 100 ms; `awaitWriteFinish.stabilityThreshold` default 2000 ms — too slow for our "tell me now" UX.)
- This is **exactly pij's `scan()` loop** plus a `{mtime,size}` map (pij only needs presence, not modify-detection).

## 4. Glob matching — picomatch wins for our case
- **picomatch**: **0 deps**, ~3–5× faster than minimatch, compile-once matcher (`const isMatch = picomatch(patterns); isMatch(path)`), and its main export **accepts one or more patterns** — so it covers "one or more configured patterns" with zero dependencies. It's the engine under micromatch, chokidar, fast-glob.
- **micromatch**: 1 dep (picomatch); adds array+negation filtering (`micromatch.matcher(["src/**/*.ts","!**/*.test.*"])`). Use only if we want negation/array ergonomics.
- **minimatch**: npm-compat, slowest — skip unless we need npm-identical semantics.
- **Universal optimization**: compile the matcher **once**, reuse per path (never call the top-level match with the pattern string each event).

## 5. chokidar v4/v5 — does it solve atomic saves out of the box?
- `atomic: true` (**default**): if a file is re-added within 100 ms of being deleted, emits **`change`** instead of `unlink`+`add` → kills the atomic-save artifact directly.
- `awaitWriteFinish`: polls file size, holds `add`/`change` until size is stable (`stabilityThreshold` default **2000 ms**) → solves chunked/large writes but **adds latency** (bad for our instant-notify UX; leave off or set low).
- Normalizes to `add`/`change`/`unlink`(+`addDir`/`unlinkDir`). v4 = **1 dep**, TS, ESM/CJS, Node ≥14; v5 = ESM-only, Node ≥20.
- **Cost/benefit**: 1 dep buys correct add/change/unlink + atomic handling with no hand-rolled snapshot. Worth it for **recursive** watches; **overkill** for a shallow single folder where the §3 snapshot is ~30 lines and reuses pij's proven loop.

## 6. @parcel/watcher — when worth it
Native backends (FSEvents / Watchman / inotify / brute-force), powers VS Code. Pick it over chokidar only for **large recursive/repo-wide** watches where `fs.watch` hits handle limits. Heavier (native binary) — not justified for a configured folder.

---

## Net guidance for the plan
1. **Default zero-dep**: reuse pij's `fs.watch(dir)`+debounce+`readdir`, **add a `{mtimeMs,size}` snapshot reconcile** (the key upgrade — don't trust event types) + **picomatch** for the configured patterns + an **ignore-list** for atomic-save artifacts.
2. **Keep the steer/immediate inject + background-seam lifecycle exactly as pij does.**
3. **Offer `recursive:true` (Node ≥19.1) as opt-in**; if a user wants robust repo-wide watching, document **chokidar v4** as the drop-in upgrade (the adapter boundary makes this swappable).
4. **Debounce 20–50 ms**; coalesce N changes per wake into **one** notice to avoid steer-spam during big rebuilds.

**Sources**: chokidar README + v4(Sep-2024)/v5(Nov-2025) release notes & jsdocs; StackOverflow #10762630 (dir-watch entry semantics); nodejs node#2062 (rename/atomic, stat-before-watch); oneuptime "Watch File Changes in Node.js" (2026); picomatch GitHub benchmarks; pkgpulse picomatch-vs-micromatch-vs-minimatch (2026); paulmillr "chokidar 3" perf post; @parcel/watcher docs.
