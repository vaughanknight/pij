# Research Dossier: Rich file-watch notices (changed-line ranges + diff mode + .gitignore)

**Generated**: 2026-07-09T00:00:00Z
**Query**: "Rich file-watch notices for pij peer watch (033): changed-line ranges + optional diff mode (self-snapshot baseline, pointer-delivery for large diffs) + .gitignore honoring"
**Effort**: Standard (2 parallel code-trace workers + institutional-memory scan)
**Tools**: Standard
**Evidence**: 11 current sources · 1 historical (plan 033, shipped)

## Answer

1. **created / modified / deleted is already done** — the plan-033 watcher classifies verbs purely by snapshot-diff (never reads the fs.watch event type). The *new* work is: changed-line ranges, diff content, a per-subscription mode, and `.gitignore` honoring.
2. **Line-ranges and diffs are greenfield** — the watcher snapshots only `{mtimeMs, size}` per file, never content, and nothing in the extension reads file bytes or computes a diff. A diff needs a **content baseline the code does not keep today**.
3. **The self-snapshot approach is sound and is the only incremental one** — keep last-notified content per path, diff new-vs-that, then advance the baseline. `git diff` vs HEAD would be cumulative (re-dumps the whole delta each notice) — the exact thing to avoid.
4. **One clean enrichment site exists** — `PeerWatchManager`'s notice callback (`watch.ts:119-122`) already receives the structured `Change[]` **and** the subscription **and** the peer id; it just ignores the `Change[]` today. Mode-branching and diff-rendering land here; the sidecar/CLI/type threading is mechanical.
5. **Pointer-delivery has a sharp edge** — the `attachments` path-pointer field exists in the message contract but **only the telegram bridge consumes it; the tmux-inject path a watch peer uses reads `body` only**. So "pointer for large diffs" = an inline **path string in the body** (peer reads the file itself), *or* we extend the inject path — a real design choice, not free.
6. **`.gitignore` awareness is absent** — ignore is a static picomatch glob list; honoring `.gitignore` is additive at `compileWatch` but needs a git-repo detection + a check-ignore/parse decision.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Watcher snapshots metadata only — `FileMeta = {mtimeMs, size, identityPath?}`, never content; lister stats only, never opens bytes | `file-watch-notify/store.ts:14-19,22`; `watcher.ts:81-95,121-148` | Line/diff needs a **new content baseline** captured at prime + each wake — new field + new I/O | High |
| F-02 | Verb classification is pure snapshot-diff (event type discarded, "Key Finding 01"); a stateful layer reclassifies create-after-recent-delete → modified | `store.ts:180-194,221-245`; `watcher.ts:22,47-49` | created/modified/deleted is **done**; only `modified` (and maybe `created`=whole-file) needs a diff | High |
| F-03 | "modified" fires on `mtimeMs` **OR** `size` change — a mtime-only touch (identical content) still fires | `store.ts:186-187` | Diff step **must tolerate/suppress an empty textual delta** or it emits noise notices | High |
| F-04 | Structured `Change = {path, kind, identityPath?}`; callback is `onNotices(notices: string[], changes: Change[])` — the `changes[]` is passed to the daemon but currently **ignored** | `store.ts:24-29`; `watcher.ts:39,68-71` | Extend `Change` with `lineRanges`/`diff` + add `formatNotice` template tokens; the wire to the daemon already exists | High |
| F-05 | Enrichment site: `PeerWatchManager` notice callback → `channel.deliver({from:"pij-watch", to:id, body})`; in scope here = `Change[]` + `sub` + `id`, **not** file content | `core/daemon/watch.ts:119-122` | Read content + compute diff here (or in core); `sub.mode` branch lives here (only place `sub` is available at delivery) | High |
| F-06 | `WatchSubscription = {dir, patterns, recursive?, addedAt}`; a `mode` field must thread through **5** sites or subs differing only by mode collide on the dedup key | `core/types.ts:136-141`; `watch-subscription.ts:17-19,50-55`; `daemon/watch.ts:134-136`; `watch-store.ts:6-16` | Mechanical but must be **lockstep** — miss `keyOf`/`watchKey` and a diff-mode sub silently overwrites a notice-mode one | High |
| F-07 | `formatWatchNotice` emits `[file-watch] ${c.path} ${c.kind}` per change, `join("\n")`; empty → `"[file-watch] no changes"` | `watch-subscription.ts:77-82`; `store.ts:50,253-255` | Ranges/diff append here; N coalesced changes = one multi-line message → a large diff **bloats one injected message** | High |
| F-08 | `DEFAULT_IGNORE = ["4913","*~",".goutputstream*",".tmp*",".*"]`, picomatch `{dot:true}` matched **per-basename**; no `.gitignore` anywhere | `store.ts:49,164`; `watcher.ts:85-87` | `.gitignore` honoring layers additively into `compileWatch` (`watch.ts:110-113`); needs git-repo detect + check-ignore/parse choice | Medium |
| F-09 | Finding-10 receipt guard: `emitSendReceipt` early-returns for unregistered senders, so synthetic `pij-watch` makes no phantom inbox; guarded by a test | `daemon.ts:338,302-304`; `core/daemon/watch.test.ts:174-214` | **Preserve** — keep `from:"pij-watch"` unregistered; don't change the `from` string | High |
| F-10 | Delivery `body` is inline string; `PijMessage.attachments` (local-path pointer, "never bytes on wire") exists **but only the telegram bridge consumes it** — tmux `drainInbox`/`drainTmuxInbox` read `body`/`command` only | `core/types.ts:178,185-190`; `adapters/channel.ts:43-54`; `daemon.ts:306` | Pointer-delivery to a watch peer = **inline path string in `body`** (peer reads file), OR extend the tmux inject path to surface attachments — a decision, not free | High |
| F-11 | `DEFAULT_DEBOUNCE_MS = 30`; single trailing timer coalesces a burst into one `scan()`; scan diffs the whole snapshot → ≤1 `Change` per file per wake | `store.ts:47`; `watcher.ts:52-58,61-78` | Baseline must advance **exactly once per emit** or coalesced bursts double-count; "since last notice" delta correctly spans the whole burst | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 033 (Simple, READY, shipped) built the peer-watch path: self-subscribe, sidecar, `PeerWatchManager`, `pij-watch` delivery, finding-09 (dispose on dead pid) + finding-10 (receipt guard) | `docs/plans/033-pij-peer-file-watch/*plan*.md` | Direct — this plan enriches 033's delivery, reuses its structure | Build **on** 033; do not re-architect the subscription/delivery spine |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Content-snapshot memory | `store.ts:217,223` (Map copied each apply/prime) | Storing prior content per file multiplies memory and doubles it on each snapshot copy | Prefer bounded content cache / hash+cap, not content on `FileMeta`; **size cap + binary skip** before reading |
| Binary / large files | `watcher.ts:133-140` (stats, never inspects) | No existing guard; reading a 50MB or binary file to diff is a footgun | Explicit large-file cap (notice-only above it) + binary detection — plan decision |
| Post-restart baseline gap | `store.ts:216-218` (`prime` seeds metadata only) | First `modified` after a daemon restart has no pre-restart content → diffs vs current disk | Acceptable; must be **stated** in the plan (first post-restart edit = no reliable delta) |
| Empty-diff noise | F-03 | mtime-only touches would emit empty diffs | Suppress zero-delta modifieds in diff mode (or fall back to plain notice) |
| Diff implementation | grep: no diff lib imported in the extension | Node has no built-in unified diff | Decide: a small dep (`diff`) vs shelling `git diff --no-index`/`diff -u` — workshop candidate |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `file-watch-notify` (shared pi extension core) | May gain **optional** content-baseline + diff capability | Must not change behavior for pi sessions using the plain notice path (non-goal) | `store.ts`, `watcher.ts` |
| pij daemon peer-watch | Primary change surface — enrichment + mode + gitignore | Preserve finding-10 guard, coalescing, atomic sidecar | `core/daemon/watch.ts`, `watch-subscription.ts` |

## Planning Handoff

- **Preserve**: finding-10 receipt guard (`from:"pij-watch"` stays unregistered, `daemon.ts:338` + its test); the snapshot-reconcile verb classifier (F-02); the debounce/coalescing model (F-11); atomic sidecar tmp+rename write; existing created/modified/deleted semantics.
- **Change carefully**: the watcher snapshot (F-01 — adding content brings memory/binary/large-file hazards); the **five** dedup/validator sites for the new `mode` field (F-06 — miss one and modes collide); `formatWatchNotice` token growth (F-07 — bloats the single injected message).
- **Likely files/symbols**: `file-watch-notify/store.ts` + `watcher.ts` (content baseline + diff); `pij/core/daemon/watch.ts` (enrichment callback + `.gitignore` into `compileWatch`); `pij/core/watch-subscription.ts` (`mode` field + `formatWatchNotice`); `pij/core/types.ts` (`WatchSubscription`); `pij/adapters/watch-store.ts` (validator); `pij/cli.ts` (`runWatch` flag parse, `:761-775`).
- **Decisions still required** (workshop candidates — surfaced at the plan seam):
  1. **Diff baseline source** — self-snapshot content (recommended, incremental) vs git. *(Steer already set: self-snapshot.)*
  2. **Modes surface & default** — `notice` (verb + line ranges) vs `diff`; per-subscription flag (`pij watch --diff` / `--mode diff`); default stays terse.
  3. **`.gitignore` in this plan or a follow-up** — and if in: `git check-ignore` (spawns git) vs in-process parse.
  4. **Large-diff pointer delivery** (F-10) — inline path string in `body` vs extend the tmux inject path to consume `attachments`; where's the inline-vs-pointer size threshold.
  5. **Diff implementation** — `diff` dep vs shell `git diff --no-index`.
  6. **Content-cache bound / size cap / binary-skip policy.**
  7. **Per-verb behavior** — `created` = whole file as additions or notice-only? `deleted` = no diff.
