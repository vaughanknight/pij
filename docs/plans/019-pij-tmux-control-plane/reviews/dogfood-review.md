# Plan 019 — tmux control-plane dogfood review

Reviewer: pij-1klhw27 (Claude Opus 4.8, 1M ctx). Scope: the NEW uncommitted spawn→bind
machinery. Files reviewed:

- `.pi/extensions/pij/core/daemon/loop.ts` — spawn→bind state machine
- `.pi/extensions/pij/core/binding.ts` — watchdog + init-once gate
- `.pi/extensions/pij/core/harness/claude.ts` — transcript discovery
- `.pi/extensions/pij/daemon.ts` — the daemon bin
- `.pi/extensions/pij/cli.ts` — `runSpawn` + `tailTranscript`

Overall: clean ports/adapters seam, decisions are pure and well-commented. The findings
below are mostly **timing/lifecycle races** in the impure glue, plus a couple of data-loss
edges. Nothing blocks the happy path; the HIGH item undermines the *deterministic* binding
claim (AC-03).

---

## CRITICAL

_None._

---

## HIGH

### H1 — `before` snapshot is taken too late; deterministic discovery can systematically miss
`loop.ts:101` captures the `before` transcript set on the daemon's **first observation** of
the session, not at spawn time:

```ts
if (drive.before === undefined) drive.before = ports.listTranscripts(dir);
```

But the pane (and Claude) are created earlier, by `runSpawn` in `cli.ts:123`. Claude writes
its session `*.jsonl` early in boot. Between `runSpawn` splitting the pane and the daemon's
first tick (`TICK_MS=600`, plus any tick backlog), Claude can already have created its
transcript. That file then lands in `before` and `discoverNewTranscript` (`claude.ts:106`)
will never classify it as "new" → discovery never fires → binding silently degrades to the
`pij phonehome` fallback for *every* spawn where boot beats the first tick.

This defeats the whole "deterministic binding by new-path appearance (AC-03)" mechanism in
the common case. The snapshot must be captured **before the pane exists**.

Fix: snapshot `listTranscripts(dir)` inside `runSpawn` (before `tmux.splitWindow`) and persist
it on the pending descriptor (e.g. `descriptor.before`), then have `driveSession` seed
`drive.before` from the descriptor instead of sampling live. As-is, `DriveState.before` is
in-memory only and there is no descriptor field for it (`types.ts`).

---

## MEDIUM

### M1 — Buffered messages are dropped if a bound session has no `paneId`
`daemon.ts:78-83`:

```ts
for (const m of this.buffer.flush(d.id)) {
    if (d.paneId) this.ports.sendText(d.paneId, flushedText(m));
}
```

`SendBuffer.flush` (`router.ts:63`) **deletes** the queue unconditionally and returns it. If
`d.paneId` is falsy at flush time, every buffered message is consumed and silently lost — the
`if` guards the send, not the drain. R-02 is precisely about not losing pre-bind sends, so this
is the wrong failure mode. Guard the flush itself, or re-enqueue on missing pane.

### M2 — Single-instance lock has a TOCTOU window (AC-10)
`daemon.ts:148-166`: read lock → `evaluateLock` → `writeFileSync`. Two daemons starting
concurrently can both read "no/stale lock" and both write — neither refuses. The check and the
write are not atomic. Use `O_EXCL` (`writeFileSync(path, ..., { flag: "wx" })`) and treat
`EEXIST` as the refuse/reclaim signal, re-reading the holder on collision.

### M3 — A pane that is `busy` from first observation may never get its init injected
`loop.ts:133` gates init on `readiness === "ready"`, but `loop.ts:141` anchors `drive.readyAtMs`
on *any* interactive state (incl. `busy`). If a freshly-spawned pane reads `busy` and stays
busy, the watchdog clock starts (line 141) while init was never injected. The watchdog then
re-sends only the bare `pij phonehome` line (`loop.ts:165`) — to an agent that was never told
its pij-id or that it is a peer — and ultimately fails the spawn. Recommend not anchoring
`readyAtMs` until init is actually injected (or until readiness is `ready`), so the watchdog
window measures post-init silence as intended.

### M4 — `ambiguous` discovery is never handled or logged
`discoverNewTranscript` can return `status: "ambiguous"` (`claude.ts:112`), but `driveSession`
only branches on `"found"` (`loop.ts:145`). Ambiguous falls through to the watchdog and a
generic timeout `fail`, with no distinct outcome and no log line. The header comment claims a
phonehome fallback, but nothing in the loop acts on ambiguity — it relies entirely on the
external `pij phonehome` CLI racing the 20s watchdog. At minimum emit a distinct
`DriveOutcome`/log so concurrent-boot collisions are observable rather than masquerading as
dead spawns.

### M5 — `runSpawn` pane-pid capture can record a wrapper pid, not the harness
`cli.ts:141-149` reads `#{pane_pid}` immediately after the detached split. If the spawn command
(`buildControlSpawnCommand`) launches via a wrapper (`npx tsx`, a shell, etc.) that later
exec's/forks Claude, `#{pane_pid}` is the wrapper's pid. If the wrapper exits while the pane
lives, the descriptor's `pid` goes stale and pid-based liveness (`pij send`) will refuse a live
session — the exact failure the comment says it is avoiding. Worth verifying the spawn command
is a direct `exec` of the harness, or re-reading `#{pane_pid}` once the pane is `ready`.

---

## LOW

### L1 — `drives` and `flushed` maps grow unbounded
`daemon.ts:42,44`: `this.drives` and `this.flushed` are keyed by session id and never pruned
when a session reaches `failed`/`bound`/dies. For a long-lived daemon this is a slow leak.
Evict on terminal lifecycle.

### L2 — `tailTranscript`/`followTail` re-read the whole file every poll
`cli.ts:192` (`readFileSync(path,"utf8").split("\n")`) runs every `FOLLOW_MS=200`ms over the
*entire* transcript. For a long session this is O(filesize) per tick. Acceptable for now, but
consider a byte-offset/`fs.watch` tail if sessions get large.

### L3 — Dead parameter in `drainInbox`
`daemon.ts:89-90`: `paneId` is passed then immediately `void paneId`'d; the real pane is
re-resolved via `this.index.get(id)` inside `route`. Drop the parameter to avoid implying it is
used.

### L4 — `mangleCwd` is sensitive to trailing-slash / repeated separators
`claude.ts:20`: `replace(/[^a-zA-Z0-9]/g, "-")` will turn a trailing `/` into a trailing `-`
and collapse nothing, so `/a/.b` → `-a--b`. Matches the live tree per the comment, but a
normalized (no trailing slash) cwd is worth asserting at the spawn boundary so the daemon and
`pij tail` can never disagree on the dir.

### L5 — `tailTranscript` initial slice heuristic can over/under-show
`cli.ts:198`: `all.slice(-Math.max(linesArg*4, linesArg))` then renders only summarizable
lines, so the first paint shows an unpredictable count vs the requested `--lines N`. Minor UX.

---

## Notes / things that are right
- Init-once gate is correctly persisted (`initInjectedAt`) and the watchdog re-send deliberately
  does **not** call `markInitInjected` — AC-04 holds (`binding.ts:29`, `loop.ts:165`).
- `buildInitInjection` body matches the live injected text verbatim (confirmed against this
  session's own boot message).
- `folder = cwd` mapping is consistent across spawn (`spawn.ts`), discovery (`loop.ts:100`) and
  tail (`cli.ts:183`).
- Delivery ownership (AC-08) is cleanly enforced: the daemon only drives/drains
  `daemonOwnsDelivery` harnesses; receipts are dropped, never injected (`daemon.ts:105`).
