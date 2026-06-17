# Research Report: configurable folder-watch → in-session notification (no tool call)

**Generated**: 2026-06-16T22:30:00Z
**Research Query**: "new research on how we can add an extension that we can configure one or more patterns and do file watching in a folder, and when the file changes we get a notification straight in the window just like we do when we receive a message, no tool call to know, just get told / steered if busy."
**Mode**: Pre-Plan (feeds the `plan` stage)
**Location**: docs/plans/015-file-watch-notify/research-dossier.md
**FlowSpace**: Not used (small, fully-known local surface — grounded by direct reads)
**Harness**: `/eng-harness-flow` router installed (AGENTS path); session-start seam acknowledged, no setup needed.

---

## Executive Summary

### What we want
A pi extension that **watches one or more configured folders/glob patterns** and, when a matching file changes, **injects a notification straight into the session** — *steered* if the model is busy, *immediate* if idle — with **no tool call required** for the agent to learn about it. Exactly the UX of receiving a pij message, but the trigger is a filesystem change instead of an inbox drop.

### The key insight (this is mostly already built)
**pij already implements this entire mechanism**, minus the "arbitrary folder + glob" generalization:
- `FsChannel.watch()` (`.pi/extensions/pij/adapters/channel.ts`) dir-`fs.watch`es a folder, **debounces a burst (20 ms)**, **scans + dedupes by filename** via a `seen` set, drains existing entries on subscribe, and returns a disposer.
- The receive loop injects via `PiRuntimeAdapter.inject(text, mode)` → `pi.sendUserMessage(text[, {deliverAs:"steer"}])`, choosing **steer when busy / immediate when idle** (`core/session.ts`).
- The watcher runs from the **long-lived background seam** wired in `index.ts` (`session_start` → `watch(...)`, disposed on shutdown) — **no slash command, no tool call** to fire it.

So the feature is **"generalize pij's inbox watcher into a configurable file-pattern watcher that injects a formatted notice"** — a new sibling extension (or a small generalized core) reusing the proven watch→debounce→dedupe→steer-inject seam.

### Quick stats
- **Reuse surface**: ~1 adapter (`channel.ts` watch half) + the inject seam (`pi-runtime.ts`) + the busy/idle decision (`session.ts`).
- **New surface**: config loading (patterns + folders), glob matching, change-kind detection, notice formatting.
- **External deps**: 0 required (node:fs is enough); chokidar v4 / picomatch optional for robustness.
- **Complexity (estimate, confirm at plan)**: CS-2–3 — small surface, low novelty (the hard part is already solved in pij).

---

## How the proven mechanism currently works (pij)

### 1. The watcher — `adapters/channel.ts` `FsChannel.watch()`
```ts
const watcher = watch(dir, () => {            // node:fs.watch on a DIRECTORY
  if (timer) clearTimeout(timer);
  timer = setTimeout(scan, DEBOUNCE_MS);      // DEBOUNCE_MS = 20
});
scan();                                       // drain anything already present
return () => { clearTimeout(timer); watcher.close(); };  // disposer
```
- `scan()` `readdirSync`s the dir, filters `msg-*.json` not in `seen`, sorts, and for each calls `onMessage(payload)`, adding to `seen`. Partial-read failures `delete` from `seen` to retry next scan.
- **Design note in-file (finding 03)**: *"`fs.watch` is flaky on file targets, reliable on directories"* — pij deliberately watches the **dir**, not files. Writers use **tmp-write + atomic `rename`** so the watcher never sees a partial file.

### 2. The injection — `adapters/pi-runtime.ts` + `core/session.ts`
- `inject(text, "steer")` → `pi.sendUserMessage(text, { deliverAs: "steer" })`; `inject(text, "immediate")` → `pi.sendUserMessage(text)`.
- `session.ts onInbound` picks **steer vs immediate from `isIdle()`** (busy peer gets steered after its turn; never a mid-stream interrupt). This is the "get told / steered if busy" behavior, verbatim.

### 3. The background seam — `index.ts`
- On `session_start` the extension calls `channel.watch(self, onInbound, seen)` and stores the disposer (`disposeWatch`), re-armed across reload/new/resume. **This is what makes it "no tool call"** — the watcher lives outside any command/tool, injecting directly.

### 4. pi API finding — no native file-watch hook
`grep` of pi's `dist/core/extensions/types.d.ts` for `watch|onDidChange|FileSystem|registerFileWatch` → **no matches**. pi does **not** expose a filesystem-watch primitive; an extension must run its **own** watcher (which is exactly what pij does) and inject via `sendUserMessage`. `sendUserMessage` + `deliverAs:"steer"` is the supported, proven injection path.

---

## External research — file-watching best practices (2024–2025)

Sources: vitejs/vite#12495 (fs.watch vs chokidar discussion), paulmillr/chokidar README (v4 Sep-2024 / v5 Nov-2025), @parcel/watcher, community.

| Concern | Finding | Implication for us |
|---|---|---|
| **Recursive watch** | `node:fs.watch(dir, { recursive: true })` is reliable on macOS/Linux/Windows **since Node ≥19.1** (old "no recursive on Linux" limitation resolved). | If we need subtree watching, native `recursive:true` is viable on modern Node — no library required. |
| **Duplicate events** | "Often reports events twice" — frequently the **editor** writing multiple times, not Node. | **Debounce/coalesce** (pij's 20 ms) is the right fix; we keep it. |
| **`rename` noise / atomic saves** | fs.watch emits most changes as `rename`; editors do atomic-save via temp files. | Don't trust `eventType`; **re-scan + stat** to learn truth (pij already re-scans). chokidar's `atomic`/`awaitWriteFinish` options solve this if we adopt it. |
| **What changed (add/change/unlink)** | Raw fs.watch won't tell you reliably; chokidar normalizes to `add`/`change`/`unlink`. | For zero-dep: track a **path→mtime/size map** across scans to classify created/modified/deleted. For robustness: chokidar gives it free. |
| **Glob matching** | `picomatch` is the fast, tiny engine under micromatch/chokidar; `minimatch` older. chokidar v4 **removed glob support** (filter via `ignored` predicate or `node:fs/promises glob`). | Match configured patterns in-process with **picomatch** (compile each pattern once), or `node:fs/promises` `glob()` on modern Node. |
| **Scale / handles** | Large recursive watches risk `EMFILE`/`ENOSPC`; tune `fs.inotify.max_user_watches` or use `@parcel/watcher` (vscode's backend). | A project-local folder watch is small — not a concern at our scale; note it for "watch the whole repo" use cases. |
| **Library choice** | chokidar v4 = 1 dep, TS, ESM/CJS, normalized events; v5 = ESM-only, Node 20+. @parcel/watcher = native backends, heaviest/most robust. | **Zero-dep `node:fs.watch`** for a shallow configured folder (our default); **chokidar v4** if we want normalized add/change/unlink + atomic handling with minimal deps. |

---

## Design sketch (for the plan stage — not a decision)

A new T2 extension (`just new file-watch-notify`) reusing pij's seam:

- **Config** (per P5 "constants in store.ts" + structural entry types): `{ watches: [{ dir, patterns: string[], events?: ("add"|"change"|"unlink")[], notice?: template }] }` — source TBD at plan (a `.pi/file-watch.json`, or `package.json`-style block, or env). One or more patterns per watch, one or more watches.
- **Core (pi-free, P2)**: `WatchStore` — compile patterns (picomatch), maintain a `seen`/`mtime` map, classify change-kind, format the notice string. Pure; unit-tested vs fakes (P8).
- **Adapter**: generalize `FsChannel.watch` into a `FolderWatcher` (dir `fs.watch` + debounce + scan + glob filter + change classify). Optionally `recursive:true`.
- **Inject port**: identical to pij's — `inject(notice, isIdle ? "immediate" : "steer")` via `sendUserMessage`. Notice framed like `[file-watch] <dir>/<file> changed (modified)` so the agent reads it with zero tool calls.
- **Background seam (P10)**: one `session_start` handler wires the watcher(s); dispose on shutdown — same lifecycle as pij.

### Open questions (resolve at plan/workshop)
1. **Config shape & source** — `.pi/file-watch.json` vs settings block vs env? (workshop candidate)
2. **Zero-dep vs chokidar v4** — start zero-dep (node:fs.watch + picomatch) and only adopt chokidar if atomic-save/normalized events bite? (recommended: zero-dep first.)
3. **Recursive vs shallow** — default shallow single dir; opt-in `recursive:true` (Node ≥19.1).
4. **Notice formatting & noise control** — debounce window, coalesce N changes into one notice, rate-limit to avoid steer-spam during a big rebuild.
5. **Standalone extension vs fold into pij** — sibling extension reusing a shared watcher, or a generalized pij core? (Likely standalone — different concern, but share the watcher adapter.)
6. **Self-trigger guard** — ignore the extension's own writes / `.tmp-*` files (pij's atomic-rename trick already avoids partials).

---

## Prior Learnings (from this codebase)

- **PL-01 — `fs.watch` on dirs, not files** (`channel.ts` finding 03). Watch the **directory**; classify via re-scan. Carry forward verbatim.
- **PL-02 — atomic tmp+rename writes** so the watcher never reads a partial file (`channel.ts deliver`). Apply to any file the watcher itself produces; ignore `.tmp-*`.
- **PL-03 — steer vs immediate from `isIdle()`** (`session.ts onInbound`). The exact "steered if busy" behavior the ask wants — reuse the decision.
- **PL-04 — background seam, no command/tool** (`index.ts session_start` watcher). This is the "no tool call to know" property; replicate the lifecycle (arm on start, dispose on shutdown, re-arm on reload/new).
- **PL-05 — single `session_start` handler for all reasons** (P10). Watcher wiring belongs there.

## Domain context
No `docs/domains/registry.md` formal registry drives this; the relevant existing domain is **pij-messaging** (`docs/domains/pij-messaging/domain.md`) whose watch+inject seam is the reuse target. Potential action: extract a shared **`session-inject` / `folder-watch`** capability both pij and this feature consume (decide at plan).

## External Research Opportunities
The search above answered the core questions. The deeper fidelity dig was **run and resolved** → `external-research/watch-fidelity.md`.

### Opportunity 1: chokidar v4/v5 vs zero-dep fidelity under atomic saves — ✅ RESOLVED
**Outcome**: zero-dep `node:fs.watch(dir)` + a **`{mtimeMs,size}` snapshot reconcile** + **picomatch** is sufficient for a shallow configured folder; **chokidar v4** (1 dep) is the documented drop-in for recursive/repo-wide. **Key correction to pij's approach**: pij gets away with dir-only `fs.watch` only because all its writers use atomic tmp+rename (the dir entry always changes, so the event always fires); a *general* user-folder watcher must **not** trust `fs.watch` event types and must add a stat-snapshot reconcile to classify created/modified/deleted. See `external-research/watch-fidelity.md` for the algorithm, debounce window (20–50 ms), the atomic-save artifact ignore-list (`4913`, `*~`, `.goutputstream*`, `.tmp*`), and the full matrix.
**Location**: `docs/plans/015-file-watch-notify/external-research/watch-fidelity.md`

---

**Research Complete**: 2026-06-16T22:30:00Z
**Report Location**: docs/plans/015-file-watch-notify/research-dossier.md
